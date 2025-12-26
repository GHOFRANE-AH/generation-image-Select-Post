require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
// node-fetch v3 is ESM; use a tiny wrapper so fetch works in CommonJS
const fetch = (...args) => import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));
//const serviceAccount = require("./config/serviceAccountKey.json");

// Taxonomie fermée et validation
const {
  TAXONOMY_V1,
  ALLOWED_EXCLUSIONS,
  ALLOWED_STYLES,
  getAllValidTags,
  isValidTag,
  validateTags,
  validateStyle,
  validatePersonPresence,
  validateExclusions,
  validateCompactSchema,
  optimizeAndReorderTags
} = require("./taxonomy");



admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const { getStorage } = require("firebase-admin/storage");
const bucket = getStorage().bucket("stage-ghofrane.firebasestorage.app");

const db = admin.firestore();
const app = express();

// CORS configuration - allow both production and local development
const allowedOrigins = [
  "https://frontend-oviv.onrender.com", // Frontend Render
  "http://localhost:3000",
  process.env.FRONTEND_URL || ""
].filter(url => url !== "");

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "DELETE", "PUT"],
  credentials: true
}));
app.use(bodyParser.json({ limit: "100mb" })); // allow larger payloads for up to 10 images in base64
app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));

const SECRET_KEY = process.env.SECRET_KEY || "supersecret";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const MAX_IMAGES = 4;
const clampNumberOfImages = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(Math.round(numeric), 1), MAX_IMAGES);
};

/**
 * Sleep utility for delays between retries
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reduce base64 image size - simple approach
 * Note: Truncation can corrupt images. For production, use sharp library for proper compression.
 * @param {string} base64Data base64 string without data: prefix
 * @param {number} maxSizeKB maximum size in KB
 * @returns {string} base64 string
 */
const compressBase64Image = async (base64Data, maxSizeKB = 200) => {
  const sizeKB = (base64Data.length * 3) / 4 / 1024;
  if (sizeKB <= maxSizeKB) {
    console.log(`Image size OK: ${sizeKB.toFixed(2)}KB`);
    return base64Data;
  }
  
  // Calculate max length for target size (keep it divisible by 4 for base64 padding)
  const maxLength = Math.floor((maxSizeKB * 1024 * 4) / 3);
  const truncated = base64Data.substring(0, maxLength - (maxLength % 4));
  
  console.log(`Image too large: ${sizeKB.toFixed(2)}KB, truncated to ~${maxSizeKB}KB (WARNING: may corrupt image)`);
  console.log(`For better results, compress images on frontend before upload or use sharp library`);
  
  return truncated;
};

/**
 * Call Gemini image endpoint and return base64 data URLs (simple version for auto mode).
 * @param {string} finalPrompt
 * @param {string[]} photos base64 without data: prefix
 * @param {number} numberOfImages 1..4
 */
const generateImagesWithGeminiSimple = async (finalPrompt, photos, numberOfImages) => {
  const generateSingleImage = async () => {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: finalPrompt },
                    ...photos.map((p) => ({
                      inline_data: {
                        mime_type: "image/png", // assume PNG base64
                        data: p,
                      },
                    })),
                  ],
                },
              ],
            }),
          }
        );

        const data = await response.json();
        console.log("Gemini response:", JSON.stringify(data, null, 2));

        if (data.error) {
          throw new Error(data.error.message || "Generation failed");
        }

        const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
        let imageUrl = null;

        for (const cand of candidates) {
          const parts = cand?.content?.parts || [];
          for (const part of parts) {
            const inlineData = part?.inline_data || part?.inlineData;
            if (inlineData?.data) {
              const mime = inlineData?.mime_type || inlineData?.mimeType || "image/png";
              imageUrl = `data:${mime};base64,${inlineData.data}`;
              break;
            }
            if (typeof part?.text === "string" && part.text.startsWith("data:image/")) {
              imageUrl = part.text;
              break;
            }
          }
          if (imageUrl) break;
        }

        if (!imageUrl) {
          throw new Error("No image found in response");
        }

        return imageUrl;
      } catch (err) {
        lastError = err;
        console.warn(`Gemini attempt ${attempt} failed:`, err?.message || err);
        // try again if we have retries left
      }
    }
    throw lastError || new Error("Image generation failed");
  };

  const safeCount = clampNumberOfImages(numberOfImages);
  const imagePromises = Array.from({ length: safeCount }, () => generateSingleImage());
  return Promise.all(imagePromises);
};

/**
 * Call Gemini image endpoint and return base64 data URLs (with compression and delays for large photo sets).
 * @param {string} finalPrompt
 * @param {string[]} photos base64 without data: prefix
 * @param {number} numberOfImages 1..4
 * @param {number} maxPhotosToSend maximum number of photos to send to Gemini (default: all photos)
 */
const generateImagesWithGemini = async (finalPrompt, photos, numberOfImages, maxPhotosToSend = null) => {
  const generateSingleImage = async () => {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        // Add delay between retries
        if (attempt > 1) {
          console.log(`Waiting 5 seconds before retry attempt ${attempt}...`);
          await sleep(5000);
        }
        
        // Compress photos to reduce processing time and avoid timeouts
        // Keep compression at 150KB as it was working before
        const compressedPhotos = await Promise.all(
          photos.map(p => compressBase64Image(p, 150)) // 150KB as before
        );
        
        // Limit photos if maxPhotosToSend is specified, otherwise send ALL photos (up to 10)
        const photosToSend = maxPhotosToSend 
          ? compressedPhotos.slice(0, maxPhotosToSend)
          : compressedPhotos;
        console.log(`Attempt ${attempt}: Sending ${photosToSend.length} photo(s) to Gemini (${photos.length} total provided, max: ${maxPhotosToSend || 'all'})`);
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { 
                      text: finalPrompt
                    },
                    ...photosToSend.map((p) => ({
                      inline_data: {
                        mime_type: "image/png", // assume PNG
                        data: p,
                      },
                    })),
                  ],
                },
              ],
            }),
          }
        );

        const data = await response.json();
        console.log("Gemini response:", JSON.stringify(data, null, 2));

        if (data.error) {
          throw new Error(data.error.message || "Generation failed");
        }

        const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
        let imageUrl = null;

        for (const cand of candidates) {
          // Check finishReason to understand why image wasn't generated
          if (cand?.finishReason && cand.finishReason !== "STOP") {
            const reason = cand.finishReason;
            const message = cand?.finishMessage || `Finish reason: ${reason}`;
            console.warn(`Gemini finishReason: ${reason}, message: ${message}`);
            
            if (reason === "SAFETY" || reason === "RECITATION") {
              throw new Error(`Gemini blocked generation: ${message}`);
            }
            
            // For IMAGE_OTHER, retry with same prompt and all photos
            if (reason === "IMAGE_OTHER") {
              if (attempt < 2) {
                // On first attempt with IMAGE_OTHER, throw error to trigger retry
                throw new Error(`IMAGE_OTHER_RETRY: ${message}`);
              } else {
                // On second attempt, throw final error
                throw new Error(`Gemini blocked generation: ${message}`);
              }
            }
          }
          
          const parts = cand?.content?.parts || [];
          for (const part of parts) {
            const inlineData = part?.inline_data || part?.inlineData;
            if (inlineData?.data) {
              const mime = inlineData?.mime_type || inlineData?.mimeType || "image/png";
              imageUrl = `data:${mime};base64,${inlineData.data}`;
              break;
            }
            if (typeof part?.text === "string" && part.text.startsWith("data:image/")) {
              imageUrl = part.text;
              break;
            }
          }
          if (imageUrl) break;
        }

        if (!imageUrl) {
          // Check if there's a finishMessage that explains the issue
          const finishMessage = candidates[0]?.finishMessage || "Unknown error";
          throw new Error(`No image found in response. ${finishMessage}`);
        }

        return imageUrl;
      } catch (err) {
        lastError = err;
        console.warn(`Gemini attempt ${attempt} failed:`, err?.message || err);
        // try again if we have retries left
      }
    }
    throw lastError || new Error("Image generation failed");
  };

  const safeCount = clampNumberOfImages(numberOfImages);
  
  // Generate images sequentially with delays to avoid overwhelming Gemini API
  // This reduces timeout errors
  const images = [];
  for (let i = 0; i < safeCount; i++) {
    console.log(`Generating image ${i + 1}/${safeCount}...`);
    try {
      const image = await generateSingleImage();
      images.push(image);
      // Add delay between images to avoid rate limiting and timeouts
      if (i < safeCount - 1) {
        console.log(`Waiting 3 seconds before next image...`);
        await sleep(3000); // 3 second delay between images
      }
    } catch (error) {
      console.error(`Failed to generate image ${i + 1}:`, error?.message || error);
      // Continue with other images even if one fails
      if (images.length === 0) {
        throw error; // Only throw if we have no images at all  :)
      }
    }
  }
  
  if (images.length === 0) {
    throw new Error("Failed to generate any images");
  }
  
  return images;
};

/**
 * Upload generated base64 image to Firebase Storage and return public URL
 */
const uploadGeneratedImageToStorage = async (base64DataUrl, email) => {
  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid base64 image format");
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");
  const extension = mimeType.split("/")[1];

  const filePath = `generated/${email || "anonymous"}/${Date.now()}.${extension}`;
  const file = bucket.file(filePath);

  // Save the file
  await file.save(buffer, {
    metadata: { contentType: mimeType },
    validation: "md5",
  });

  // Make the file publicly accessible
  await file.makePublic();

  // Return the public URL
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
};

/**
 * Save generated images to Firestore - stores only Firebase Storage URLs, never base64.
 */
const saveImagesToFirestore = async (email, imageUrls, metadata = {}) => {
  try {
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      console.warn("No images to save to Firestore");
      return;
    }

    const userEmail = email || "anonymous";
    console.log(`Starting to save ${imageUrls.length} image(s) to Firestore for email: ${userEmail}`);

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      
      // Ensure we only save Firebase Storage URLs, never base64
      if (!imageUrl || typeof imageUrl !== 'string') {
        console.warn(`Invalid image URL, skipping: ${imageUrl}`);
        continue;
      }

      // Check if it's a base64 data URL (should not happen, but safety check)
      if (imageUrl.startsWith('data:image/')) {
        console.error(`ERROR: Attempted to save base64 to Firestore! This should not happen. URL starts with data:image/`);
        continue; // Skip base64 - should never be saved
      }

      // Ensure it's a valid HTTP/HTTPS URL (Firebase Storage URL)
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        console.warn(`Invalid URL format, skipping: ${imageUrl}`);
        continue;
      }

      const imageData = {
        email: userEmail,
        url: imageUrl, // Store only the Firebase Storage URL
        created_at: new Date(),
        // Schéma compact
        t: metadata.t || metadata.tags || [],
        p: metadata.p ?? 1,
        s: metadata.s || "photo",
        x: metadata.x || [],
        d: metadata.d || "Image visuelle professionnelle.",
        // Métadonnées supplémentaires
        source: metadata.source || "unknown",
        relevance_score: metadata.relevance_score || 0,
        tagged_at: metadata.tagged_at || null,
        // Ancien format pour compatibilité
        tags: metadata.tags || metadata.t || [],
        context: {
          p: metadata.p ?? 1,
          s: metadata.s || "photo",
          x: metadata.x || [],
          ...metadata.context
        },
        ...metadata
      };

      try {
        const docRef = await db.collection("images").add(imageData);
        const docId = docRef.id;
        console.log(`✅ Image ${i + 1} saved successfully to Firestore! Doc ID: ${docId}, email: ${userEmail}, URL: ${imageUrl}`);
        
        // Verify the document was actually saved
        const verifyDoc = await db.collection("images").doc(docId).get();
        if (verifyDoc.exists) {
          console.log(`✅ Verified: Document ${docId} exists in Firestore`);
        } else {
          console.error(`❌ WARNING: Document ${docId} was not found after save!`);
        }
      } catch (saveError) {
        console.error(`❌ Failed to save image ${i + 1} to Firestore:`, saveError?.message || saveError);
        console.error(`❌ Error details:`, saveError);
        // Continue with next image even if one fails
      }
    }
    
    // Final verification: count documents for this email
    try {
      const verifySnapshot = await db.collection("images").where("email", "==", userEmail).get();
      console.log(`✅ Final verification: Found ${verifySnapshot.size} document(s) in Firestore for email: ${userEmail}`);
    } catch (verifyError) {
      console.error(`❌ Error during final verification:`, verifyError?.message || verifyError);
    }
    
    console.log(`✅ Completed saving ${imageUrls.length} image(s) to Firestore for email: ${userEmail}`);
  } catch (e) {
    console.error("❌ Firestore save error (global):", e?.message || e);
    console.error("Stack trace:", e?.stack);
    // Continue even if save fails - the images are still returned to frontend
  }
};

// ---------------------- SIGNUP ----------------------
app.post("/signup", async (req, res) => {
  try {
    const { email, nom, prenom, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required." });
    }

    const userRef = db.collection("users").doc(email);
    const doc = await userRef.get();

    if (doc.exists) {
      return res.json({ success: false, message: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await userRef.set({
      email,
      nom: nom || "",
      prenom: prenom || "",
      password_hash: hashedPassword,
      created_at: new Date(),
    });

    res.json({ success: true, message: "Signup successful." });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ success: false, message: "Error during signup." });
  }
});

// ---------------------- LOGIN ----------------------
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required." });
    }

    const userRef = db.collection("users").doc(email);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.json({ success: false, message: "User not found." });
    }

    const userData = doc.data();
    const plainPassword = password || "";

    if (!userData.password_hash) {
      if (!userData.password) {
        return res.json({ success: false, message: "Invalid account." });
      }
      const isLegacyMatch = plainPassword === userData.password;
      if (!isLegacyMatch) {
        return res.json({ success: false, message: "Incorrect password." });
      }
    } else {
      const isMatch = await bcrypt.compare(plainPassword, userData.password_hash);
      if (!isMatch) {
        return res.json({ success: false, message: "Incorrect password." });
      }
    }

    const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: "1h" });

    res.json({
      success: true,
      message: "Login successful.",
      token,
      nom: userData.nom || "",
      prenom: userData.prenom || "",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Error during login." });
  }
});

// ---------------------- DELETE PROFILE ----------------------
app.delete("/delete/:email", async (req, res) => {
  try {
    const email = req.params.email;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email required." });
    }

    await db.collection("users").doc(email).delete();

    const imagesSnapshot = await db.collection("images").where("email", "==", email).get();
    const batch = db.batch();
    imagesSnapshot.forEach((docItem) => batch.delete(db.collection("images").doc(docItem.id)));
    await batch.commit();

    res.json({ success: true, message: "Profile and photos deleted successfully." });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ success: false, message: "Error during deletion." });
  }
});

// ---------------------- GENERATE IMAGE (Gemini + style) ----------------------
app.post("/generate", async (req, res) => {
  try {
    const { email, style, photos, numberOfImages } = req.body;

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ success: false, message: "Missing GOOGLE_API_KEY" });
    }

    if (!style || !Array.isArray(photos)) {
      return res.status(400).json({ success: false, message: "Style and photos array required" });
    }

    if (photos.length === 0) {
      return res.status(400).json({ success: false, message: "At least one photo required" });
    }

    if (photos.length > 10) {
      return res.status(400).json({ success: false, message: "Maximum 10 photos allowed" });
    }

    // Helper function to add face fidelity and clothing consistency requirements
    const addFidelityRequirements = (basePrompt) => {
      return `${basePrompt} CRITICAL FIDELITY REQUIREMENTS - You MUST strictly preserve these EXACT characteristics from the reference photos with ABSOLUTE precision: (1) FACE: Exact same eye color, eye shape, eye expression, face shape, facial features, bone structure, nose shape, mouth shape, and skin tone. Preserve every detail of the face exactly as shown. (2) HAIR: Exact same hair color, hair style (curly/straight/wavy), hair length (short/medium/long), hair texture, hairline, and hair part. Do NOT change hair color, style, length, or texture. Keep the exact same hairstyle. (3) BEARD/FACIAL HAIR: If the person has a beard, mustache, or any facial hair in the reference photos, preserve it EXACTLY (same length, same style, same density, same shape). If there is NO beard or facial hair in the reference photos, do NOT add any. Preserve the exact facial hair pattern. (4) CLOTHING: Exact same clothing style (casual/formal/sporty), same colors, same patterns, same formality level, same fit, and same accessories. Do NOT add formal wear, suits, costumes, jackets, ties, or different clothing styles if not present in the reference photos. Keep the exact same outfit style, colors, and formality level. (5) BODY: Same body type, height proportions, and posture as shown in reference photos. (6) EXCLUSIVITY: Only the user should appear in the image—no other people, humans, or faces. (7) STYLE: Photorealistic, high-quality, sharp focus, professional lighting, faithful to the original appearance. The person must look IDENTICAL to the reference photos, only the background/setting changes according to the style requested. Maintain complete visual consistency with the reference photos.`;
    };

    // Prompts by style (English for better model results)
    let finalPrompt = "";

    switch (style) {
      // 1 Portraits professionnels
      case "professional_indoor":
        finalPrompt = addFidelityRequirements(
          "Professional indoor portrait photograph. Modern office or elegant workspace background. Soft professional lighting. Serious and credible professional atmosphere. High-quality portrait photography. Context: professional post, announcement, career advice."
        );
        break;

      case "professional_outdoor":
        finalPrompt = addFidelityRequirements(
          "Professional outdoor portrait photograph. Pleasant landscape or modern building background. Natural daylight. Calm and composed professional atmosphere. High-quality portrait photography. Context: inspiring post, storytelling, leadership."
        );
        break;

      case "corporate_studio":
        finalPrompt = addFidelityRequirements(
          "Corporate studio portrait photograph. Neutral clean background. Professional studio lighting. Upright confident posture. Sharp focus on face. High-quality corporate photography."
        );
        break;

      // 2 Portraits semi décontractés
      case "modern_workspace":
        finalPrompt = addFidelityRequirements(
          "Semi-casual portrait photograph in modern workspace. Office elements visible. Bright natural office lighting. Authentic relaxed professional atmosphere. High-quality photography. Context: productivity, organization, tips."
        );
        break;

      case "personal_office":
        finalPrompt = addFidelityRequirements(
          "Casual portrait photograph in personal office. Personal objects and decor visible. Warm natural lighting. Authentic personal atmosphere. High-quality photography. Context: authentic post, sharing experience."
        );
        break;

      case "street":
        finalPrompt = addFidelityRequirements(
          "Casual portrait photograph in an urban street setting. Urban background with buildings visible but slightly blurred. Natural daylight. Authentic street photography style. High-quality lifestyle photography."
        );
        break;

      // 3 Scènes d'action professionnelles
      case "working_computer":
        finalPrompt = addFidelityRequirements(
          "Action portrait photograph working on computer at desk. Laptop or computer screen visible. Focused concentrated expression. Professional desk setting. Natural lighting. High-quality action photography. Context: productive, technical focus."
        );
        break;

      case "writing_notes":
        finalPrompt = addFidelityRequirements(
          "Action portrait photograph writing or taking notes. Notebook and pen visible on table. Calm thoughtful atmosphere. Natural lighting. High-quality photography. Context: methodology, reflection, coaching."
        );
        break;

      case "presenting_screen":
        finalPrompt = addFidelityRequirements(
          "Action portrait photograph presenting on screen. Pointing gesture toward screen. Screen visible but content blurred. Professional presentation setting. Natural lighting. High-quality action photography. Context: tutorial, analysis, demonstration."
        );
        break;

      case "meeting":
        finalPrompt = addFidelityRequirements(
          "Portrait photograph in a meeting room setting. Meeting table or screen visible in background. Professional meeting room atmosphere. Natural lighting. No other people in frame. High-quality professional photography."
        );
        break;

      case "podcast":
        finalPrompt = addFidelityRequirements(
          "Portrait photograph recording a podcast. Microphone visible. Podcast setup visible. Professional yet relaxed atmosphere. Natural lighting. No other people in frame. High-quality photography. Context: podcast, audio content, expertise sharing."
        );
        break;

      case "conference":
        finalPrompt = addFidelityRequirements(
          "Portrait photograph at conference speaking or presenting. Stage or conference setting visible. Professional conference atmosphere. Stage lighting. No other people in frame. High-quality event photography. Context: conference, public speaking, expertise."
        );
        break;

      case "walking_street":
        finalPrompt = addFidelityRequirements(
          "Portrait photograph walking in street. Natural walking movement. Urban decor visible. Natural daylight. Energetic yet professional vibe. High-quality street photography. Context: motivation, rhythm, momentum."
        );
        break;

      // 4 Selfies naturels
      case "selfie_train":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph inside a train. Train interior visible. Natural light from train windows. Realistic selfie position. Authentic unposed selfie style. Context: on-the-go, business travel, commuting."
        );
        break;

      case "selfie_car":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph inside a car. Car interior visible. Natural daylight through car windows. Realistic selfie position. Authentic selfie style. Context: on-the-go, business travel, commuting."
        );
        break;

      case "selfie_other_transport":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph inside metro/plane/bus or other transport. Transport interior visible. Natural lighting from transport windows. Realistic selfie position. Authentic selfie style. Context: on-the-go, business travel, commuting."
        );
        break;

      case "selfie_office":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph at desk in office. Office environment visible. Computer or laptop visible in background. Natural indoor lighting. Realistic selfie position. Authentic selfie style. Context: remote work, workday."
        );
        break;

      case "selfie_outdoor":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph outdoors in nature. Simple gesture matching natural expression. Nature background visible. Natural daylight. Authentic outdoor selfie style. Context: inspiration, storytelling, nature."
        );
        break;

      case "selfie_street":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph outdoors in urban street setting. Simple gesture matching natural expression. Urban background visible. Natural daylight. Authentic street selfie style. Context: inspiration, storytelling, urban lifestyle."
        );
        break;

      case "selfie_gesture":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph with simple gesture. Natural expression matching gesture. Natural light. Authentic selfie style. Context: positive mood, celebration, achievement."
        );
        break;

      case "selfie_pointing":
        finalPrompt = addFidelityRequirements(
          "Natural authentic selfie photograph pointing to off-frame element or screen. Clear pointing gesture. Natural light. Authentic selfie style. Context: announcement, showcasing something new."
        );
        break;

      // 5 Moments du quotidien professionnel
      case "coffee_break":
        finalPrompt = addFidelityRequirements(
          "Casual portrait photograph drinking coffee. Coffee cup visible in hand. Warm decor visible in background. Relaxed natural mood. Natural lighting. Authentic lifestyle photography. Context: mood, professional routine, break time."
        );
        break;

      case "drinking_other":
        finalPrompt = addFidelityRequirements(
          "Casual portrait photograph drinking beverage. Drink visible in hand. Warm decor visible. Relaxed natural mood. Natural lighting. Authentic lifestyle photography. Context: mood, professional routine, break time."
        );
        break;

      case "eating_meal":
        finalPrompt = addFidelityRequirements(
          "Casual portrait photograph during lunch break. Meal plate visible on table. Professional setting. Natural lighting. Professional lunch break atmosphere. High-quality lifestyle photography. Context: lifestyle, work-life balance, lunch break."
        );
        break;

      case "eating":
        finalPrompt = addFidelityRequirements(
          "Casual portrait photograph during work break. Food items visible on table. Professional setting. Natural lighting. Professional break time atmosphere. High-quality lifestyle photography. Context: lifestyle, work-life balance."
        );
        break;

      // 6 Images centrées sur le produit digital
      case "software_interface":
        finalPrompt = addFidelityRequirements(
          "Product photography highlighting software interface on computer screen. Computer and screen visible. Clean professional ambiance. Modern office setting. Professional product photography lighting. High-quality tech photography. Context: demo, launch, product update."
        );
        break;

      case "software_interface_smartphone":
        finalPrompt = addFidelityRequirements(
          "Product photography highlighting software interface on smartphone screen. Smartphone visible. Clean professional ambiance. Modern setting. Professional product photography lighting. High-quality tech photography. Context: demo, launch, mobile app update."
        );
        break;

      case "app_screenshot":
        finalPrompt = addFidelityRequirements(
          "Stylized screen capture showing application interface. Modern composition. Clean minimalist design. Professional tech visual style. High-quality digital product photography. Context: tech post, announcement, promotion."
        );
        break;

      case "app_immersive":
        finalPrompt = addFidelityRequirements(
          "Immersive representation of application interface. Modern engaging composition. Professional tech visual style. High-quality digital product photography. Context: tech post, announcement, promotion."
        );
        break;

      case "app_showcase":
        finalPrompt = addFidelityRequirements(
          "Stylized screen capture showing application interface. Immersive representation. Modern composition. Professional tech visual style. High-quality digital product photography. Context: tech post, announcement, promotion."
        );
        break;

      case "digital_product_computer":
        finalPrompt = addFidelityRequirements(
          "Product photography of digital product used on computer. Modern decor visible. Professional context. Natural lighting. High-quality product photography. Context: feature highlight, product demo."
        );
        break;

      case "digital_product_smartphone":
        finalPrompt = addFidelityRequirements(
          "Product photography of digital product used on smartphone. Modern decor visible. Professional context. Natural lighting. High-quality product photography. Context: feature highlight, mobile product demo."
        );
        break;

      case "digital_product_context":
        finalPrompt = addFidelityRequirements(
          "Product photography of digital product in professional context. Modern decor visible. Professional product photography. Context: feature highlight."
        );
        break;

      // 7 Images centrées sur un produit physique
      case "product_neutral":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product in neutral decor. Clean neutral background. Minimalist staging. Professional product photography lighting. High-quality product photography. Context: product presentation."
        );
        break;

      case "product_office":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product in office context. Office decor visible. Natural light. Professional staging. High-quality product photography. Context: product showcase in professional setting."
        );
        break;

      case "product_indoor":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product in indoor context. Indoor decor visible. Natural light. Realistic staging. High-quality product photography. Context: product showcase in indoor setting."
        );
        break;

      case "product_outdoor":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product in outdoor context. Outdoor environment visible. Natural daylight. Realistic staging. High-quality product photography. Context: product showcase in outdoor setting."
        );
        break;

      case "product_real_context":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product in real context. Natural light. Immersive scene. High-quality product photography. Context: realistic showcase."
        );
        break;

      case "product_person_blurred":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product being used. Person visible but blurred. Product in sharp focus. Visible interaction. Professional product photography. Context: demonstration, real usage, product in action."
        );
        break;

      case "product_used":
        finalPrompt = addFidelityRequirements(
          "Product photography of physical product being used. Visible interaction with product. Natural lighting. Authentic usage scene. High-quality product photography. Context: demonstration, real usage."
        );
        break;

      // 8 Catégories à enrichir
      case "mentor_portrait":
        finalPrompt = addFidelityRequirements(
          "Inspiring mentor portrait photograph. Symbolic staging with motivational elements. Confident warm presence. Motivational approachable atmosphere. Professional portrait lighting. High-quality photography. Context: motivational posts, mentorship."
        );
        break;

      case "leader_portrait":
        finalPrompt = addFidelityRequirements(
          "Inspiring leader portrait photograph. Symbolic staging with leadership elements. Confident strong presence. Motivational decisive atmosphere. Professional portrait lighting. High-quality photography. Context: motivational posts, leadership."
        );
        break;

      case "mentor_leader":
        finalPrompt = addFidelityRequirements(
          "Inspiring mentor/leader portrait photograph. Symbolic staging. Confident presence. Motivational tone. Professional portrait lighting. High-quality photography. Context: motivational posts."
        );
        break;

      case "creative_portrait":
        finalPrompt = addFidelityRequirements(
          "Creative portrait photograph. Vibrant colors in background and lighting. Modern graphic style. Tasteful artistic composition. Creative lighting effects. High-quality creative photography. Context: creative announcements."
        );
        break;

      case "subtle_humor":
        finalPrompt = addFidelityRequirements(
          "Subtle humorous scene photograph of the user wearing their exact same clothing style and colors from the reference photos. The user maintains their exact same face shape, hair style and color, eye color, and appearance from the reference photos. Natural, light gestures. Light, humorous tone. Professional yet approachable atmosphere. Natural lighting. High-quality photography. Context: personal posts."
        );
        break;

      default:
        finalPrompt = addFidelityRequirements("Realistic portrait of the user with a neutral background.");
        break;
    }

    const safeNumberOfImages = clampNumberOfImages(numberOfImages || 4);
    console.log(`[GENERATE] Requested ${numberOfImages} images, clamped to ${safeNumberOfImages}`);
    // Mode style: send all photos (up to 10), generate the number chosen by user
    const base64Images = await generateImagesWithGemini(
      finalPrompt,
      photos,
      safeNumberOfImages,
      null // null = send all photos (up to 10)
    );
    console.log(`[GENERATE] Generated ${base64Images.length} images`);

    // Upload to Firebase Storage
    const storedImageUrls = await Promise.all(
      base64Images.map((img) => uploadGeneratedImageToStorage(img, email))
    );
    
    // Save to Firestore (only URLs, not base64)
    await saveImagesToFirestore(email, storedImageUrls, {
      prompt: finalPrompt,
      style,
      photosCount: photos.length,
    });

    res.json({ success: true, imageUrls: storedImageUrls, prompt: finalPrompt });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ success: false, message: "Error during generation." });
  }
});

// ---------------------- GENERATE IMAGE (auto prompt via ChatGPT) ----------------------
app.post("/generate-auto", async (req, res) => {
  try {
    const { email, postText, photos } = req.body;

    // Auto mode: fixed to 2 images for stability
    const requestedCount = 2;

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ success: false, message: "Missing GOOGLE_API_KEY" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, message: "Missing OPENAI_API_KEY" });
    }

    if (!postText || typeof postText !== "string") {
      return res.status(400).json({ success: false, message: "postText is required" });
    }

    if (!Array.isArray(photos) || photos.length < 1) {
      return res.status(400).json({ success: false, message: "Provide at least 1 selfie (base64)" });
    }

    if (photos.length > 2) {
      return res.status(400).json({ success: false, message: "Maximum 2 photos allowed in auto mode" });
    }

    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content: "You are a prompt engineer for an image model. Input: LinkedIn-style post text + up to two reference selfies of the SAME person. Produce ONE concise prompt (<120 words) ready for the image API. CRITICAL: Deeply analyze the post text to understand its theme, tone, context, and setting. Examples: Corporate/formal posts → professional office, business attire, serious atmosphere. Casual posts → relaxed café, casual clothes, friendly vibe. Sport/fitness posts → gym, outdoor activity, athletic wear, energetic mood. Artistic/creative posts → studio, creative workspace, artistic atmosphere. Technical posts → modern tech office, computer setup, professional tech environment. Nature/travel posts → outdoor setting, natural light, adventure vibe. Event/conference posts → stage, presentation setting, professional networking atmosphere. Philosophical/reflective posts → calm setting, thoughtful mood, introspective atmosphere. Hard constraints: (1) Only that person in frame—no other humans or people. (2) Be faithful to the original face: preserve the same eyes (color, shape, expression), face shape, hair style/color/length, and skin tone from the reference selfies. Say 'be faithful to the original face' in your prompt. (3) Keep the same clothing style, colors, and formality level as shown in the selfies (do not add costumes, suits, or formal wear if not present in the original photos). (4) Style: photorealistic and faithful to the original face. Professional lighting, clear framing/camera hints. No markdown or bullets—return only the final prompt string.",
          },
          {
            role: "user",
            content: `Post text: """${postText}"""

Carefully analyze the theme, tone, context, and setting of this post text. Identify if it's: corporate/formal (office, business), casual (café, relaxed), sport/fitness (gym, outdoor activity), artistic (studio, creative), technical (tech office, coding), nature/travel (outdoor, adventure), event/conference (stage, presentation), or philosophical/reflective (calm, thoughtful). The user provided ${photos.length} reference selfie(s) (base64, same person). Generate one optimized prompt for ${requestedCount} photorealistic portraits that: (1) Keep the user's identity consistent with the selfies, (2) Match the post's theme with appropriate setting, mood, atmosphere, and activity - make the image visually represent the post's message and context.`,
          },
        ],
      }),
    });

    const chatData = await chatResponse.json();

    if (chatData.error) {
      console.error("ChatGPT error:", chatData.error);
      return res.status(500).json({ success: false, message: chatData.error.message || "Prompt generation failed" });
    }

    const optimizedPrompt = chatData?.choices?.[0]?.message?.content?.trim();

    if (!optimizedPrompt) {
      return res.status(500).json({ success: false, message: "No prompt returned by ChatGPT" });
    }

    // Shorten and normalize prompt to avoid overly long requests that can fail with high image counts
    const normalizedPrompt = optimizedPrompt.replace(/\s+/g, " ").trim().slice(0, 700);
    const requirements =
      "Requirements: single person only (no other humans), be faithful to the original face (preserve the same eyes, face shape, hair style/color/length, and skin tone from the reference selfies), keep the SAME clothing style/colors/formality as selfies (no costumes/suits if not in selfies), photorealistic and faithful to the original face, sharp focus, professional lighting, aspect ratio 1:1 or 4:5, no watermarks.";
    const finalPrompt = `${normalizedPrompt}\n${requirements}`;

    // Try generation; fallback to smaller counts if needed
    const tryGenerate = async (count) => {
      const urls = await generateImagesWithGeminiSimple(finalPrompt, photos, count);
      const arr = Array.isArray(urls) ? urls : [];
      const unique = Array.from(new Set(arr));
      return unique.slice(0, count);
    };

    const countsToTry = [requestedCount, 1].filter((c) => c >= 1 && c <= MAX_IMAGES);
    let finalImages = [];
    let lastError = null;

    for (const c of countsToTry) {
      try {
        finalImages = await tryGenerate(c);
        if (finalImages.length > 0) break;
      } catch (err) {
        lastError = err;
        console.error(`Generation failed at ${c} images:`, err?.message || err);
      }
    }

    if (finalImages.length === 0) {
      const message = lastError?.message || "Image model returned no images";
      return res.status(502).json({ success: false, message });
    }

    // Upload to Firebase Storage
    const storedImageUrls = await Promise.all(
      finalImages.map((img) => uploadGeneratedImageToStorage(img, email))
    );

    // Save to Firestore (only URLs, not base64)
    await saveImagesToFirestore(email, storedImageUrls, {
      prompt: finalPrompt,
      source: "auto_prompt",
      photosCount: photos.length,
      postText,
    });

    res.json({ success: true, imageUrls: storedImageUrls, prompt: finalPrompt, optimizedPrompt });
  } catch (error) {
    console.error("Auto generation error:", error);
    res.status(500).json({ success: false, message: "Error during auto generation." });
  }
});

// ---------------------- SAVE FINAL SELECTION ----------------------
app.post("/selection", async (req, res) => {
  try {
    const { email, imageUrl, prompt, flowType } = req.body;

    if (!email || !imageUrl) {
      return res
        .status(400)
        .json({ success: false, message: "email and imageUrl are required to save a selection." });
    }

    // Truncate very large data URLs to avoid Firestore 1MB limit
    let urlToSave = imageUrl;
    if (typeof urlToSave === "string" && urlToSave.length > 800000) {
      urlToSave = urlToSave.substring(0, 500000) + "...[truncated]";
    }

    await db.collection("selections").add({
      email,
      imageUrl: urlToSave,
      prompt: prompt || "",
      flowType: flowType || "unknown",
      saved_at: new Date(),
    });

    res.json({ success: true, message: "Final image selection saved." });
  } catch (error) {
    console.error("Selection save error:", error);
    res.status(500).json({ success: false, message: "Error saving selection." });
  }
});

// ---------------------- DEBUG: CHECK FIRESTORE ----------------------
app.get("/debug/firestore/:email", async (req, res) => {
  try {
    const email = req.params.email;
    console.log(`🔍 DEBUG: Checking Firestore for email: ${email}`);

    // Get all documents for this email
    const imagesSnapshot = await db.collection("images").where("email", "==", email).get();
    console.log(`🔍 Found ${imagesSnapshot.size} documents in Firestore`);

    const allDocs = [];
    imagesSnapshot.forEach((doc) => {
      const data = doc.data();
      allDocs.push({
        id: doc.id,
        email: data.email,
        urlLength: data.url ? data.url.length : 0,
        urlPreview: data.url ? (data.url.length > 100 ? data.url.substring(0, 100) + "..." : data.url) : "NO URL",
        isTruncated: data.url ? data.url.includes("[truncated]") : false,
        originalLength: data.originalLength || 0,
        created_at: data.created_at,
        style: data.style,
        source: data.source,
        photosCount: data.photosCount,
      });
    });

    res.json({
      success: true,
      email,
      totalDocuments: imagesSnapshot.size,
      documents: allDocs,
    });
  } catch (error) {
    console.error("DEBUG error:", error);
    res.status(500).json({ success: false, message: "Debug error", error: error.message });
  }
});

// ---------------------- GET LAB GALLERY (Images fetchées uniquement) ----------------------
// IMPORTANT: Cette route doit être définie AVANT /gallery/:email pour éviter les conflits de routing
app.get("/gallery/lab/:email", async (req, res) => {
  try {
    let email = req.params.email;
    console.log("Fetching Lab gallery for email:", email);

    // Décoder l'email si nécessaire (pour gérer les %40, etc.)
    try {
      email = decodeURIComponent(email);
    } catch (e) {
      // Si le décodage échoue, utiliser l'email tel quel
    }

    // Valider que l'email n'est pas une valeur générique
    const invalidEmails = ["user", "anonymous", "test", "admin", ""];
    if (!email || invalidEmails.includes(email.toLowerCase())) {
      console.log(`⚠️ Email invalide ou générique: ${email}`);
      return res.json({ 
        success: true, 
        images: [], 
        count: 0,
        hasLabImages: false,
        message: "Email invalide ou générique. Veuillez utiliser un email valide."
      });
    }

    // Valider le format de l'email (basique)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`⚠️ Format d'email invalide: ${email}`);
      return res.json({ 
        success: true, 
        images: [], 
        count: 0,
        hasLabImages: false,
        message: "Format d'email invalide."
      });
    }

    // Récupérer uniquement les images Lab (celles qui ont été fetchées via /ingest)
    // Critères pour une vraie image Lab :
    // 1. source = "linkedin", "website", ou "web_search"
    // 2. labData présent (confirme qu'elle vient de /ingest)
    // 3. URL stockée dans Firebase Storage (commence par "https://storage.googleapis.com/")
    let imagesSnapshot;
    try {
      // Filtrer strictement par email pour ne récupérer que les images de cet utilisateur
      imagesSnapshot = await db.collection("images").where("email", "==", email).get();
      console.log(`📊 Fetching Lab gallery: Found ${imagesSnapshot.size} documents in Firestore for email: ${email}`);
      
      // Vérifier que l'email dans la requête correspond bien
      if (imagesSnapshot.size > 0) {
        const firstDoc = imagesSnapshot.docs[0];
        const firstDocData = firstDoc.data();
        if (firstDocData.email !== email) {
          console.error(`⚠️ ERREUR: Email mismatch! Requested: ${email}, Found in doc: ${firstDocData.email}`);
        }
      }
    } catch (fetchError) {
      console.error("Error fetching images:", fetchError);
      return res.status(500).json({ success: false, message: "Error fetching images from database." });
    }

    const labImages = [];
    let omittedCount = 0;

    imagesSnapshot.forEach((doc) => {
      const data = doc.data();
      const urlValue = data.url || "";

      // EXCLURE les images générées (base64) - elles commencent par "data:image/"
      const isBase64Image = urlValue && urlValue.startsWith("data:image/");
      if (isBase64Image) {
        omittedCount++;
        return; // Ignorer complètement les images base64
      }

      // Vérifier que c'est une vraie image Lab fetchée via /ingest
      // CRITÈRES STRICTS : doit avoir source valide ET labData valide ET URL Firebase Storage
      // Cela garantit que seules les images vraiment fetchées via /ingest sont retournées
      const hasValidSource = data.source && ["linkedin", "website", "web_search"].includes(data.source);
      
      // labData doit être un objet non vide ET contenir au moins prenom ou nom (champs requis par /ingest)
      // Ces champs sont toujours présents dans les images fetchées via /ingest
      const hasLabData = data.labData && 
                        typeof data.labData === "object" && 
                        Object.keys(data.labData).length > 0 &&
                        (data.labData.prenom || data.labData.nom || data.labData.siteWeb || data.labData.linkedin);
      
      const isFirebaseStorageUrl = urlValue && urlValue.startsWith("https://storage.googleapis.com/");
      
      // Vérifier que ce n'est pas un fichier .bin
      const isBinFile = urlValue.toLowerCase().endsWith('.bin') || urlValue.toLowerCase().includes('.bin?');

      // Image Lab valide : doit avoir source valide ET labData ET être stockée dans Firebase Storage
      // On exige TOUS les critères pour garantir que c'est vraiment une image fetchée via /ingest
      // Cela exclut automatiquement :
      // - Les images générées (base64) - déjà exclues ci-dessus
      // - Les images sans source valide
      // - Les images sans labData (pas fetchées via /ingest)
      // - Les images non stockées dans Firebase Storage
      const isLabImage = hasValidSource && hasLabData && isFirebaseStorageUrl && !isBinFile;

      // Log pour déboguer pourquoi une image est omise (seulement les premières pour ne pas surcharger)
      if (!isLabImage) {
        omittedCount++;
        if (omittedCount <= 10) { // Augmenter à 10 pour mieux voir les patterns
          const reasons = [];
          if (!hasValidSource) reasons.push(`source invalide (${data.source || "manquant"})`);
          if (!hasLabData) {
            if (!data.labData) {
              reasons.push("labData manquant");
            } else if (Object.keys(data.labData).length === 0) {
              reasons.push("labData vide");
            } else {
              reasons.push(`labData sans champs requis (keys: ${Object.keys(data.labData).join(", ")})`);
            }
          }
          if (!isFirebaseStorageUrl) reasons.push("URL non Firebase Storage");
          if (isBinFile) reasons.push("fichier .bin");
          
          console.log(`⚠️ Image omise (doc ${doc.id}): ${reasons.join(", ")}`);
        }
      }

      // Image Lab valide - seulement si tous les critères sont remplis
      if (isLabImage) {
        labImages.push({
          id: doc.id,
          url: urlValue,
          source: data.source,
          created_at: data.created_at?.toDate ? data.created_at.toDate() : (data.created_at?.seconds ? new Date(data.created_at.seconds * 1000) : new Date(data.created_at) || new Date()),
          tags: data.tags || [],
          context: data.context || {},
          labData: data.labData || {},
          relevance_score: data.relevance_score || 0,
        });
      }
    });

    // Sort by date (newest first)
    labImages.sort((a, b) => {
      const dateA = a.created_at instanceof Date ? a.created_at : new Date(a.created_at);
      const dateB = b.created_at instanceof Date ? b.created_at : new Date(b.created_at);
      return dateB - dateA;
    });

    // Résumé final détaillé
    console.log(`\n📊 RÉSUMÉ Lab Gallery pour ${email}:`);
    console.log(`   - Documents trouvés dans Firestore: ${imagesSnapshot.size}`);
    console.log(`   - Images Lab valides retournées: ${labImages.length}`);
    console.log(`   - Documents omis (non-Lab): ${omittedCount}`);
    
    if (labImages.length === 0) {
      if (imagesSnapshot.size === 0) {
        console.log(`   ✅ Aucun document trouvé - Le fetching n'a pas encore été effectué pour cet utilisateur.`);
      } else {
        console.log(`   ⚠️ ${imagesSnapshot.size} document(s) trouvé(s) mais aucun ne correspond aux critères Lab:`);
        console.log(`      - Source doit être: linkedin, website, ou web_search`);
        console.log(`      - labData doit contenir: prenom, nom, siteWeb, ou linkedin`);
        console.log(`      - URL doit être dans Firebase Storage (https://storage.googleapis.com/)`);
        console.log(`      - Ne doit pas être une image base64 ou un fichier .bin`);
      }
    } else {
      console.log(`   ✅ ${labImages.length} image(s) Lab valide(s) trouvée(s) - Toutes fetchées via /ingest`);
    }
    console.log(``);

    res.json({ 
      success: true, 
      images: labImages, 
      count: labImages.length,
      hasLabImages: labImages.length > 0
    });
  } catch (error) {
    console.error("Lab gallery error:", error);
    res.status(500).json({ success: false, message: "Error fetching Lab gallery.", error: error.message });
  }
});

// ---------------------- GET USER GALLERY ----------------------
app.get("/gallery/:email", async (req, res) => {
  try {
    const email = req.params.email;
    console.log("Fetching gallery for email:", email);

    if (!email) {
      return res.status(400).json({ success: false, message: "Email required." });
    }

    // Fetch without orderBy first to avoid index issues
    let imagesSnapshot;
    try {
      imagesSnapshot = await db.collection("images").where("email", "==", email).get();
      console.log(`📊 Fetching gallery: Found ${imagesSnapshot.size} documents in Firestore for email: ${email}`);
    } catch (fetchError) {
      console.error("Error fetching images:", fetchError);
      return res.status(500).json({ success: false, message: "Error fetching images from database." });
    }

    const images = [];
    let omittedCount = 0;

    imagesSnapshot.forEach((doc) => {
      const data = doc.data();
      const urlValue = data.url || "";
      const urlLength = urlValue.length;

      // Logs supprimés pour réduire le bruit dans la console

      // Récupérer toutes les images valides
      // 1. Images base64 (générées) : commencent par "data:image/"
      // 2. Images Lab (Firebase Storage) : commencent par "https://storage.googleapis.com/" ou ont source/labData
      const isBase64Image = urlValue && urlValue.length > 50 && urlValue.startsWith("data:image/");
      const isLabImage = urlValue && (
        urlValue.startsWith("https://storage.googleapis.com/") ||
        urlValue.startsWith("https://") ||
        data.source ||
        data.labData
      );

      if (isBase64Image) {
        // Image générée (base64)
        images.push({
          id: doc.id,
          url: urlValue,
          style: data.style || "unknown",
          prompt: data.prompt || "",
          photosCount: data.photosCount || 1,
          created_at: data.created_at?.toDate() || new Date(data.created_at) || new Date(),
          isTruncated: urlValue.includes("[truncated]"),
          originalLength: data.originalLength || urlValue.length,
        });
      } else if (isLabImage) {
        // Vérifier que ce n'est pas un fichier .bin
        const isBinFile = urlValue.toLowerCase().endsWith('.bin') || urlValue.toLowerCase().includes('.bin?');
        if (isBinFile) {
          omittedCount++;
          // Log supprimé pour réduire le bruit dans la console
        } else {
          // Image Lab (Firebase Storage) - uniquement les vraies images
          images.push({
            id: doc.id,
            url: urlValue,
            source: data.source || "unknown",
            created_at: data.created_at?.toDate() || new Date(data.created_at) || new Date(),
            tags: data.tags || [],
            context: data.context || {},
            labData: data.labData || {},
          });
        }
      } else {
        omittedCount++;
        // Log supprimé pour réduire le bruit dans la console
      }
    });

    // Sort by date (newest first)
    images.sort((a, b) => {
      const dateA = a.created_at instanceof Date ? a.created_at : new Date(a.created_at);
      const dateB = b.created_at instanceof Date ? b.created_at : new Date(b.created_at);
      return dateB - dateA;
    });

    console.log(`✅ Gallery loaded: ${images.length} valid images returned (${omittedCount} documents omitted/invalid, including .bin files)`);

    if (omittedCount > 0) {
      console.log(
        `⚠️ Warning: ${omittedCount} old images were skipped because they were saved as "[omitted: too large]" and are unrecoverable. New images will use truncation instead.`
      );
    }

    res.json({ success: true, images, count: images.length, omittedCount });
  } catch (error) {
    console.error("Gallery error:", error);
    res.status(500).json({ success: false, message: "Error fetching gallery.", error: error.message });
  }
});

// ---------------------- DELETE SINGLE IMAGE ----------------------
app.delete("/image/:imageId", async (req, res) => {
  try {
    const imageId = req.params.imageId;

    if (!imageId) {
      return res.status(400).json({ success: false, message: "Image ID required." });
    }

    const imageRef = db.collection("images").doc(imageId);
    const imageDoc = await imageRef.get();

    if (!imageDoc.exists) {
      return res.status(404).json({ success: false, message: "Image not found." });
    }

    await imageRef.delete();

    res.json({ success: true, message: "Image deleted successfully." });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ success: false, message: "Error deleting image." });
  }
});

// ---------------------- HELPER: Générer tags automatiquement pour une image ----------------------
/**
 * Complète les tags à 8 minimum et limite à 20 maximum
 * Si moins de 8 tags, complète avec des tags par défaut de la taxonomie
 * @param {string[]} tags - Tags existants
 * @returns {string[]} Tags complétés/limités
 */
const ensureTagsCount = (tags) => {
  const MIN_TAGS = 8;
  const MAX_TAGS = 20;
  
  let finalTags = [...tags];
  
  // Limiter à 20 tags maximum
  if (finalTags.length > MAX_TAGS) {
    finalTags = finalTags.slice(0, MAX_TAGS);
    console.log(`⚠️ Tags limités à ${MAX_TAGS} (${tags.length} → ${MAX_TAGS})`);
  }
  
  // Compléter à 8 tags minimum avec des tags par défaut valides de la taxonomie
  if (finalTags.length < MIN_TAGS) {
    // Obtenir tous les tags valides de la taxonomie
    const allValidTags = getAllValidTags();
    
    // Tags par défaut préférés (doivent être valides dans la taxonomie)
    const preferredDefaults = [
      "visual",
      "graphic",
      "professional_visual",
      "content",
      "marketing",
      "business",
      "design",
      "presentation"
    ];
    
    // Filtrer les tags par défaut pour ne garder que ceux qui sont valides et non déjà présents
    const validDefaults = preferredDefaults.filter(tag => 
      isValidTag(tag) && !finalTags.includes(tag)
    );
    
    // Ajouter les tags par défaut valides jusqu'à atteindre MIN_TAGS
    const tagsToAdd = MIN_TAGS - finalTags.length;
    const selectedDefaults = validDefaults.slice(0, tagsToAdd);
    finalTags = [...finalTags, ...selectedDefaults];
    
    // Si on n'a toujours pas assez, utiliser d'autres tags valides de la taxonomie
    if (finalTags.length < MIN_TAGS) {
      const additionalTags = allValidTags
        .filter(tag => !finalTags.includes(tag))
        .slice(0, MIN_TAGS - finalTags.length);
      finalTags = [...finalTags, ...additionalTags];
    }
    
    console.log(`⚠️ Tags complétés à ${MIN_TAGS} (${tags.length} → ${finalTags.length})`);
  }
  
  return finalTags;
};

/**
 * Génère des tags enrichis pour une image en prenant en compte :
 * - L'analyse visuelle de l'image
 * - Le contexte de la source (ex. post LinkedIn, visuel professionnel)
 * - Le texte du post lorsqu'il est disponible
 * @param {string} imageUrl - URL de l'image à analyser
 * @param {string|null} imageId - ID de l'image (optionnel, pour logging)
 * @param {object} options - Options optionnelles
 * @param {string} options.source - Source de l'image ("linkedin", "website", "web_search")
 * @param {string} options.postText - Texte du post associé (si disponible)
 * @param {object} options.metadata - Métadonnées supplémentaires (linkedinPost, etc.)
 * @returns {Promise<{tags: string[], context: object}>}
 */
const generateTagsForImage = async (imageUrl, imageId = null, options = {}) => {
  const { source = null, postText = null, metadata = {} } = options;
  let tags = [];
  let context = {};
  let taggingData = null; // Nouveau format avec t/p/s/x/d

  // Préparer le contexte d'image pour le prompt
  const imageContext = [];
  if (metadata.linkedinPost) imageContext.push(`linkedin_post: ${metadata.linkedinPost}`);
  if (postText) imageContext.push(`post_text: ${postText.substring(0, 200)}`);
  if (source) imageContext.push(`source: ${source}`);
  const imageContextStr = imageContext.length > 0 ? imageContext.join(", ") : "";

  if (process.env.OPENAI_API_KEY) {
    let analysisText = ""; // Déclarer analysisText au début pour qu'il soit accessible dans le catch
    try {
      // Télécharger l'image pour l'analyser
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image: ${imgRes.status}`);
      }
      
      const imgArrayBuffer = await imgRes.arrayBuffer();
      const imgBuffer = Buffer.from(imgArrayBuffer);
      const base64Image = imgBuffer.toString("base64");

      // Utiliser GPT-4 Vision avec le nouveau prompt système pour le tagging
      const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Tu es un classificateur d'images pour une banque d'images marketing B2B.

⚠️ CRITIQUE ABSOLUE : 
- Décris UNIQUEMENT ce que tu VOIS réellement dans l'image
- NE JAMAIS inventer, interpréter ou assumer quoi que ce soit qui n'est pas clairement visible
- Si tu vois un logo → tag "logo" (NE PAS l'exclure)
- Si tu vois des flèches/arrows → tag "arrow" ou "arrows" (NE PAS les exclure)
- Si tu vois du texte → tag "text" (NE PAS l'exclure)
- Chaque image DOIT avoir ses propres tags UNIQUES basés EXCLUSIVEMENT sur ce qui est visible dans l'image
- JAMAIS de tags génériques par défaut

Objectif : produire des métadonnées UNIQUES et SPÉCIFIQUES pour chaque image, basées uniquement sur le contenu visuel réel et visible.

**Tu dois utiliser UNIQUEMENT la taxonomie fournie. Ne crée jamais de nouveaux tags.**

Taxonomie fermée (tags autorisés uniquement) :

SUJETS BUSINESS (1-2 tags max) :
${TAXONOMY_V1.business.join(", ")}

OBJETS/VISUELS (2-6 tags) :
${TAXONOMY_V1.visual.join(", ")}

INDUSTRIES (0-1 tag) :
${TAXONOMY_V1.industry.join(", ")}

Retourne un JSON strict (sans texte autour), conforme au schéma :

{
  "id": string,          // identifiant unique de l'image
  "u": string,           // URL ou storage key
  "t": string[],         // liste compacte de tags - UNIQUE pour chaque image
  "p": 0|1|2,            // présence de personnes
  "s": "photo"|"illu"|"3d"|"icon",  // style de l'image
  "x": string[],         // exclusions
  "d": string            // description UNIQUE en 1 phrase spécifique à cette image
}

**Règles CRITIQUES pour remplir le JSON :**

⚠️ INTERDICTION ABSOLUE :
- NE JAMAIS utiliser "professional", "business" ou "office" comme tags par défaut ou fallback
- NE JAMAIS utiliser les mêmes tags pour des images différentes
- NE JAMAIS utiliser de tags génériques si l'image montre quelque chose de spécifique
- NE JAMAIS copier la même description pour plusieurs images

✅ RÈGLES OBLIGATOIRES :
- t (tags) : Entre 8 et 20 tags, UNIQUES à cette image spécifique, basés UNIQUEMENT sur ce qui est VISIBLEMENT PRÉSENT.
  - Analyse l'image en détail : objets, actions, scènes, couleurs, compositions
  - Choisis les tags les plus SPÉCIFIQUES possibles selon ce que tu vois RÉELLEMENT
  - Si tu vois un logo → tag "logo"
  - Si tu vois des flèches → tag "arrow" ou "arrows"
  - Si tu vois du texte → tag "text"
  - 1 à 2 tags de "sujet business" UNIQUEMENT si visible et pertinent dans l'image
  - 2 à 6 tags "objets/visuels" basés sur les éléments CONCRETS visibles
  - 0 ou 1 tag "industrie" UNIQUEMENT si une industrie spécifique est identifiable
  - Analyse en profondeur : couleurs, formes, textures, compositions, actions, objets secondaires pour identifier tous les tags pertinents
  - NE JAMAIS inventer des éléments qui ne sont pas visibles
  - Génère entre 8 et 20 tags selon ce que tu observes dans l'image
- d (description) : UNE phrase UNIQUE et SPÉCIFIQUE décrivant EXACTEMENT ce que tu VOIS dans cette image précise. 
  - Décris UNIQUEMENT les éléments visuels concrets VISIBLES : objets, personnes, actions, scènes, couleurs dominantes
  - Si tu vois un logo, mentionne-le dans la description
  - Si tu vois des flèches, mentionne-les dans la description
  - Si tu vois du texte, mentionne-le dans la description
  - Chaque description doit être différente et refléter l'unicité de l'image
  - Jamais de description générique ou vague
  - Jamais "N/A" ou description copiée d'une autre image
  - NE JAMAIS inventer ou interpréter ce qui n'est pas visible
- p :
  - 0 = aucune personne visible
  - 1 = présence de personnes (groupe ou silhouettes) sans portrait central
  - 2 = portrait ou visage clairement central / image centrée sur une personne
- s :
  - "photo" = photographie réelle non retouchée
  - "illu" = illustration ou dessin
  - "3d" = rendu 3D réaliste ou stylisé
  - "icon" = pictogramme, logo, ou UI simple
- x : Tableau d'exclusions (généralement vide []). 
  - NE PAS exclure automatiquement les logos, flèches ou texte si tu les vois dans l'image
  - Utilise les exclusions UNIQUEMENT si vraiment nécessaire (ex: "no_children" si l'image contient des enfants et que c'est inapproprié)
  - Généralement, laisse x = [] (tableau vide)

**Consignes supplémentaires :**
- ⚠️ CRITIQUE : Ne JAMAIS inventer de tags hors taxonomie. Chaque tag dans "t" DOIT être présent dans la liste ci-dessus.
- ⚠️ CRITIQUE : Chaque image est UNIQUE. Analyse chaque détail visuel pour créer des tags et une description qui reflètent cette unicité.
- Si tu vois un concept qui n'est pas dans la taxonomie, trouve le tag le plus proche MAIS SPÉCIFIQUE dans la liste fournie.
- Exemples de correspondances (utilise le tag le PLUS SPÉCIFIQUE possible) :
  * "step" → "workshop" ou "training" (selon le contexte visuel)
  * "chalkboard" → "whiteboard" ou "presentation" (selon ce qui est visible)
  * "feedback" → "collaboration" ou "meeting" (selon la scène)
  * "iteration" → "collaboration" ou "workshop" (selon l'action visible)
  * "table" → "desk" ou "workspace" (selon le type de table visible)
  * "urban" → "city" ou "building" (selon l'élément dominant)
  * "calendar" → utilise un tag visuel spécifique comme "document" ou "planning" si disponible, sinon le plus proche
  * "briefcase" → utilise un tag visuel spécifique comme "bag" ou "accessory" si disponible
  * "blue" (couleur) → utilise un tag descriptif SPÉCIFIQUE basé sur l'objet bleu, pas "professional"
  * "self-development" → "training" ou "coaching" (selon le contexte visuel)
  * "poster" → "visual" ou "graphic" (selon le style visible)
  * "public_transport" → "transportation" ou "city" (selon l'élément dominant)
- Si une information est incertaine, choisis l'option la plus conservatrice (ex : p=1 plutôt que p=2 si le visage n'est pas central).
- Vérifie toujours que tous les tags sont dans la taxonomie ET qu'ils sont spécifiques à cette image.

**Entrée fournie :**
- id
- u
- image_context (optionnel, peut contenir nom de fichier, dossier, campagne, texte alternatif, notes)
- Si image_context est vide, base-toi UNIQUEMENT sur ce qui est visible dans l'image.

Retourne uniquement le JSON final avec des tags et une description UNIQUES pour cette image spécifique.`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    id: imageId || `img_${Date.now()}`,
                    u: imageUrl,
                    image_context: imageContextStr || null
                  })
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.6, // Augmenté pour encourager l'unicité et la variété des tags et descriptions
          max_tokens: 500
        }),
      });

      let analysisData = await analysisRes.json();
      analysisText = analysisData?.choices?.[0]?.message?.content || ""; // Utiliser la variable déjà déclarée
      taggingData = null; // Réinitialiser taggingData (déjà déclaré au début de la fonction)
      let tagsValid = false;
      const maxAttempts = 2;
      let attempt = 0;

      // Boucle de retry pour gérer les cas où le tableau t est vide
      while (attempt < maxAttempts && !tagsValid) {
        attempt++;
        try {
          // Extraire le JSON même s'il y a du texte autour
          let jsonText = analysisText.trim();
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
          
          taggingData = JSON.parse(jsonText);
          
          // S'assurer que id et u sont présents (obligatoires dans le schéma)
          if (!taggingData.id) {
            taggingData.id = imageId || `img_${Date.now()}`;
          }
          if (!taggingData.u) {
            taggingData.u = imageUrl;
          }
          
          // Validation et contrôle qualité
          const tagsCount = Array.isArray(taggingData.t) ? taggingData.t.length : 0;
          
          // Accepter n'importe quel nombre de tags (ensureTagsCount appliquera la plage 8-20)
          // Plus de vérification stricte du nombre de tags, seulement si aucun tag
          if (tagsCount === 0) {
            if (attempt < maxAttempts) {
              console.warn(`⚠️ Aucun tag généré, retry ${attempt}/${maxAttempts}...`);
              
              // Retry avec prompt plus strict
              const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "system",
                      content: `Tu es un classificateur d'images pour une banque d'images marketing B2B.

⚠️ CRITIQUE ABSOLUE : 
- Tu DOIS générer entre 8 et 20 tags dans le champ "t". Un tableau vide n'est PAS accepté.
- Chaque image DOIT avoir ses propres tags UNIQUES basés EXCLUSIVEMENT sur ce qui est visible dans l'image.
- JAMAIS de tags génériques "professional", "business" ou "office" comme fallback.
- Chaque description "d" DOIT être UNIQUE et SPÉCIFIQUE à cette image précise.

Objectif : produire des métadonnées UNIQUES et SPÉCIFIQUES pour chaque image, basées uniquement sur le contenu visuel réel.

**Tu dois utiliser UNIQUEMENT la taxonomie fournie. Ne crée jamais de nouveaux tags.**

Taxonomie fermée (tags autorisés uniquement) :

SUJETS BUSINESS (1-2 tags max) :
${TAXONOMY_V1.business.join(", ")}

OBJETS/VISUELS (2-6 tags) :
${TAXONOMY_V1.visual.join(", ")}

INDUSTRIES (0-1 tag) :
${TAXONOMY_V1.industry.join(", ")}

Retourne un JSON strict (sans texte autour), conforme au schéma :

{
  "id": string,          // identifiant unique de l'image
  "u": string,           // URL ou storage key
  "t": string[],         // liste compacte de tags - OBLIGATOIRE : 8 à 20 tags UNIQUES, JAMAIS vide
  "p": 0|1|2,            // présence de personnes
  "s": "photo"|"illu"|"3d"|"icon",  // style de l'image
  "x": string[],         // exclusions
  "d": string            // description UNIQUE en 1 phrase spécifique à cette image
}

**Règles CRITIQUES pour remplir le JSON :**

⚠️ INTERDICTION ABSOLUE :
- NE JAMAIS utiliser "professional", "business" ou "office" comme tags par défaut ou fallback
- NE JAMAIS utiliser les mêmes tags pour des images différentes
- NE JAMAIS utiliser de tags génériques si l'image montre quelque chose de spécifique
- NE JAMAIS copier la même description pour plusieurs images

✅ RÈGLES OBLIGATOIRES :
- t (tags) : OBLIGATOIREMENT 8 à 20 tags, UNIQUES à cette image spécifique, basés UNIQUEMENT sur ce qui est visible.
  - Analyse l'image en détail : objets, actions, scènes, couleurs, compositions, textures, formes
  - Choisis les tags les plus SPÉCIFIQUES possibles selon ce que tu vois réellement
  - 1 à 2 tags de "sujet business" UNIQUEMENT si visible et pertinent dans l'image
  - 2 à 6 tags "objets/visuels" basés sur les éléments CONCRETS visibles
  - 0 ou 1 tag "industrie" UNIQUEMENT si une industrie spécifique est identifiable
  - Si tu ne peux pas identifier 8 tags spécifiques, analyse PLUS EN PROFONDEUR :
    * Regarde les objets secondaires, les arrière-plans, les textures, les couleurs dominantes
    * Identifie les actions ou interactions visibles
    * Note les compositions, les perspectives, les styles visuels
    * Trouve des éléments distinctifs même dans les détails
- d (description) : UNE phrase UNIQUE et SPÉCIFIQUE décrivant exactement ce que montre cette image précise.
  - Décris les éléments visuels concrets : objets, personnes, actions, scènes, couleurs dominantes, compositions
  - Chaque description doit être différente et refléter l'unicité de l'image
  - Jamais de description générique ou vague
  - Jamais "N/A" ou description copiée d'une autre image
- p :
  - 0 = aucune personne visible
  - 1 = présence de personnes (groupe ou silhouettes) sans portrait central
  - 2 = portrait ou visage clairement central / image centrée sur une personne
- s :
  - "photo" = photographie réelle non retouchée
  - "illu" = illustration ou dessin
  - "3d" = rendu 3D réaliste ou stylisé
  - "icon" = pictogramme, logo, ou UI simple
- x : Tableau d'exclusions (généralement vide []). 
  - NE PAS exclure automatiquement les logos, flèches ou texte si tu les vois dans l'image
  - Utilise les exclusions UNIQUEMENT si vraiment nécessaire (ex: "no_children" si l'image contient des enfants et que c'est inapproprié)
  - Généralement, laisse x = [] (tableau vide)

**Consignes supplémentaires :**
- ⚠️ CRITIQUE : Ne JAMAIS inventer de tags hors taxonomie. Chaque tag dans "t" DOIT être présent dans la liste ci-dessus.
- ⚠️ CRITIQUE : Chaque image est UNIQUE. Analyse chaque détail visuel pour créer des tags et une description qui reflètent cette unicité.
- Si tu vois un concept qui n'est pas dans la taxonomie, trouve le tag le plus proche MAIS SPÉCIFIQUE dans la liste fournie.
- Exemples de correspondances (utilise le tag le PLUS SPÉCIFIQUE possible, JAMAIS "professional"/"business"/"office") :
  * "step" → "workshop" ou "training" (selon le contexte visuel)
  * "chalkboard" → "whiteboard" ou "presentation" (selon ce qui est visible)
  * "feedback" → "collaboration" ou "meeting" (selon la scène)
  * "iteration" → "collaboration" ou "workshop" (selon l'action visible)
  * "table" → "desk" ou "workspace" (selon le type de table visible)
  * "urban" → "city" ou "building" (selon l'élément dominant)
  * "calendar" → utilise un tag visuel spécifique comme "document" ou "planning" si disponible, sinon le plus proche SPÉCIFIQUE
  * "briefcase" → utilise un tag visuel spécifique comme "bag" ou "accessory" si disponible
  * "blue" (couleur) → utilise un tag descriptif SPÉCIFIQUE basé sur l'objet bleu visible, JAMAIS "professional"
  * "self-development" → "training" ou "coaching" (selon le contexte visuel)
  * "poster" → "visual" ou "graphic" (selon le style visible)
  * "public_transport" → "transportation" ou "city" (selon l'élément dominant)
- Si une information est incertaine, choisis l'option la plus conservatrice (ex : p=1 plutôt que p=2 si le visage n'est pas central).
- Vérifie toujours que tous les tags sont dans la taxonomie ET qu'ils sont spécifiques à cette image.

**Entrée fournie :**
- id
- u
- image_context (optionnel, peut contenir nom de fichier, dossier, campagne, texte alternatif, notes)
- Si image_context est vide, base-toi UNIQUEMENT sur ce qui est visible dans l'image.

Retourne uniquement le JSON final avec des tags UNIQUES dans "t" (autant que nécessaire, tous dans la taxonomie) et une description UNIQUE dans "d" pour cette image spécifique.`
                    },
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: JSON.stringify({
                            id: imageId || `img_${Date.now()}`,
                            u: imageUrl,
                            image_context: imageContextStr || null
                          })
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
                  temperature: 0.6, // Augmenté pour encourager l'unicité et la variété des tags et descriptions
                  max_tokens: 500
        }),
      });

              analysisData = await retryRes.json();
              analysisText = analysisData?.choices?.[0]?.message?.content || ""; // Utiliser la variable déjà déclarée
              continue; // Re-parser avec la nouvelle réponse
        } else {
              throw new Error(`Aucun tag généré après ${maxAttempts} tentatives`);
            }
          }
          
          // Valider les autres champs
          if (typeof taggingData.p !== 'number' || ![0, 1, 2].includes(taggingData.p)) {
            throw new Error(`Valeur p invalide: ${taggingData.p}`);
          }
          // Accepter uniquement les valeurs simplifiées du schéma
          const validSValues = ["photo", "illu", "3d", "icon"];
          if (!validSValues.includes(taggingData.s)) {
            throw new Error(`Valeur s invalide: ${taggingData.s}. Valeurs autorisées: ${validSValues.join(", ")}`);
          }
          if (!Array.isArray(taggingData.x) || taggingData.x.length > 4) {
            throw new Error(`Exclusions invalides: ${taggingData.x?.length || 0} exclusions (max: 4)`);
          }
          
          // Validation des tags
          const tagsValidation = validateTags(taggingData.t || []);
          // Appliquer la logique 8-20 tags : compléter à 8 minimum, limiter à 20 maximum
          taggingData.t = ensureTagsCount(tagsValidation.validTags);
          
          // ⚠️ CRITIQUE : Si aucun tag valide, relancer la génération
          // Mais seulement si ce n'est pas la dernière tentative
          if (taggingData.t.length === 0) {
            if (attempt < maxAttempts) {
              console.warn(`⚠️ Aucun tag valide trouvé. Retry ${attempt}/${maxAttempts}...`);
              // Relancer avec le prompt de retry
              const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  },
                  body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                      {
                        role: "system",
                        content: `Tu es un classificateur d'images pour une banque d'images marketing B2B.

⚠️ CRITIQUE ABSOLUE : 
- Tu DOIS générer entre 8 et 20 tags dans le champ "t". Un tableau vide n'est PAS accepté.
- Chaque image DOIT avoir ses propres tags UNIQUES basés EXCLUSIVEMENT sur ce qui est visible dans l'image.
- JAMAIS de tags génériques "professional", "business" ou "office" comme fallback.
- Chaque description "d" DOIT être UNIQUE et SPÉCIFIQUE à cette image précise.
- ⚠️ IMPORTANT : Tu as généré des tags qui ne sont PAS dans la taxonomie. Tu DOIS utiliser UNIQUEMENT les tags de la taxonomie fournie.

Objectif : produire des métadonnées UNIQUES et SPÉCIFIQUES pour chaque image, basées uniquement sur le contenu visuel réel.

**Tu dois utiliser UNIQUEMENT la taxonomie fournie. Ne crée jamais de nouveaux tags.**

Taxonomie fermée (tags autorisés uniquement) :

SUJETS BUSINESS (1-2 tags max) :
${TAXONOMY_V1.business.join(", ")}

OBJETS/VISUELS (2-6 tags) :
${TAXONOMY_V1.visual.join(", ")}

INDUSTRIES (0-1 tag) :
${TAXONOMY_V1.industry.join(", ")}

Retourne un JSON strict (sans texte autour), conforme au schéma :

{
  "id": string,
  "u": string,
  "t": string[],
  "p": 0|1|2,
  "s": "photo"|"illu"|"3d"|"icon",
  "x": string[],
  "d": string
}

**Règles CRITIQUES :**
- t (tags) : 8 à 20 tags, UNIQUES à cette image, basés UNIQUEMENT sur ce qui est visible, et UNIQUEMENT dans la taxonomie fournie.
- d (description) : UNE phrase UNIQUE et SPÉCIFIQUE décrivant exactement ce que montre cette image précise.
- Analyse l'image en détail et choisis les tags les plus SPÉCIFIQUES possibles selon ce que tu vois réellement.
- Si tu ne peux pas identifier 8 tags spécifiques, analyse plus en profondeur : couleurs, formes, textures, compositions, actions, objets secondaires.

Retourne uniquement le JSON final avec des tags UNIQUES dans "t" (autant que nécessaire, tous dans la taxonomie) et une description UNIQUE dans "d" pour cette image spécifique.`
                      },
                      {
                        role: "user",
                        content: [
                          {
                            type: "text",
                            text: JSON.stringify({
                              id: imageId || `img_${Date.now()}`,
                              u: imageUrl,
                              image_context: imageContextStr || null
                            })
                          },
                          {
                            type: "image_url",
                            image_url: {
                              url: `data:image/jpeg;base64,${base64Image}`,
                            },
                          },
                        ],
                      },
                    ],
                    temperature: 0.6,
                    max_tokens: 500
                  }),
              });
              analysisData = await retryRes.json();
              analysisText = analysisData?.choices?.[0]?.message?.content || ""; // Utiliser la variable déjà déclarée
              continue; // Re-parser avec la nouvelle réponse
            } else {
              throw new Error(`Aucun tag valide après ${maxAttempts} tentatives`);
            }
          }
          
          // Optimiser et réordonner les tags selon les priorités
          // Priorité: sujets business > contexte professionnel > éléments visuels
          taggingData.t = optimizeAndReorderTags(taggingData.t);
          // Réappliquer ensureTagsCount après optimisation pour garantir la plage 8-20
          taggingData.t = ensureTagsCount(taggingData.t);

          // Valider le style
          const styleValidation = validateStyle(taggingData.s || "photo");
          if (!styleValidation.valid) {
            console.warn(`⚠️ Style invalide: ${styleValidation.error}, utilisation de "photo" par défaut`);
            taggingData.s = "photo";
          } else {
            taggingData.s = styleValidation.style;
          }

          // Valider la présence de personnes
          const pValidation = validatePersonPresence(taggingData.p ?? 1);
          if (!pValidation.valid) {
            console.warn(`⚠️ Présence de personnes invalide: ${pValidation.error}, utilisation de 1 par défaut`);
            taggingData.p = 1;
          } else {
            taggingData.p = pValidation.p;
          }

          // Valider les exclusions
          const exclusionsValidation = validateExclusions(taggingData.x || []);
          if (!exclusionsValidation.valid) {
            console.warn(`⚠️ Exclusions invalides:`, exclusionsValidation.errors);
            taggingData.x = exclusionsValidation.validExclusions;
          }
          
          // Valider la description (d)
          if (!taggingData.d || typeof taggingData.d !== 'string' || taggingData.d.trim() === '' || taggingData.d.toLowerCase() === 'n/a') {
            // ⚠️ CRITIQUE : Ne jamais utiliser de description générique par défaut
            // Si la description est absente, relancer la génération pour obtenir une description unique
            throw new Error(`Description absente ou invalide. Relance nécessaire pour obtenir une description spécifique à l'image.`);
          } else {
            taggingData.d = taggingData.d.trim();
            // Vérifier que la description n'est pas générique
            const genericDescriptions = [
              'image visuelle professionnelle',
              'image professionnelle',
              'visuel professionnel',
              'image marketing',
              'image b2b'
            ];
            const isGeneric = genericDescriptions.some(gen => taggingData.d.toLowerCase().includes(gen));
            if (isGeneric) {
              if (attempt < maxAttempts) {
                console.warn(`⚠️ Description trop générique détectée. Retry ${attempt}/${maxAttempts}...`);
                // Relancer avec le prompt de retry (même code que pour les tags insuffisants)
                const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  },
                  body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                      {
                        role: "system",
                        content: `Tu es un classificateur d'images pour une banque d'images marketing B2B.

⚠️ CRITIQUE ABSOLUE : 
- Tu DOIS générer entre 8 et 20 tags dans le champ "t". Un tableau vide n'est PAS accepté.
- Chaque image DOIT avoir ses propres tags UNIQUES basés EXCLUSIVEMENT sur ce qui est visible dans l'image.
- JAMAIS de tags génériques "professional", "business" ou "office" comme fallback.
- Chaque description "d" DOIT être UNIQUE et SPÉCIFIQUE à cette image précise.
- ⚠️ IMPORTANT : Ta description précédente était trop générique. Tu DOIS créer une description détaillée et spécifique basée sur ce que tu vois réellement dans l'image.

Objectif : produire des métadonnées UNIQUES et SPÉCIFIQUES pour chaque image, basées uniquement sur le contenu visuel réel.

**Tu dois utiliser UNIQUEMENT la taxonomie fournie. Ne crée jamais de nouveaux tags.**

Taxonomie fermée (tags autorisés uniquement) :

SUJETS BUSINESS (1-2 tags max) :
${TAXONOMY_V1.business.join(", ")}

OBJETS/VISUELS (2-6 tags) :
${TAXONOMY_V1.visual.join(", ")}

INDUSTRIES (0-1 tag) :
${TAXONOMY_V1.industry.join(", ")}

Retourne un JSON strict (sans texte autour), conforme au schéma :

{
  "id": string,
  "u": string,
  "t": string[],
  "p": 0|1|2,
  "s": "photo"|"illu"|"3d"|"icon",
  "x": string[],
  "d": string
}

**Règles CRITIQUES :**
- t (tags) : 8 à 20 tags, UNIQUES à cette image, basés UNIQUEMENT sur ce qui est visible, et UNIQUEMENT dans la taxonomie fournie.
- d (description) : UNE phrase UNIQUE et SPÉCIFIQUE décrivant exactement ce que montre cette image précise. Décris les éléments visuels concrets : objets, personnes, actions, scènes, couleurs dominantes, compositions. Jamais de description générique.

Retourne uniquement le JSON final avec des tags UNIQUES dans "t" (autant que nécessaire, tous dans la taxonomie) et une description UNIQUE dans "d" pour cette image spécifique.`
                      },
                      {
                        role: "user",
                        content: [
                          {
                            type: "text",
                            text: JSON.stringify({
                              id: imageId || `img_${Date.now()}`,
                              u: imageUrl,
                              image_context: imageContextStr || null
                            })
                          },
                          {
                            type: "image_url",
                            image_url: {
                              url: `data:image/jpeg;base64,${base64Image}`,
                            },
                          },
                        ],
                      },
                    ],
                    temperature: 0.6,
                    max_tokens: 500
                  }),
                });
                analysisData = await retryRes.json();
                analysisText = analysisData?.choices?.[0]?.message?.content || ""; // Utiliser la variable déjà déclarée
                continue; // Re-parser avec la nouvelle réponse
              } else {
                throw new Error(`Description trop générique après ${maxAttempts} tentatives`);
              }
            }
          }
          
          // Si on arrive ici, les données sont valides
          tagsValid = true;
          
        } catch (parseErr) {
          if (attempt >= maxAttempts) {
            // Dernière tentative échouée, relancer l'erreur
            throw parseErr;
          }
          // Erreur de parsing, retry
          console.warn(`⚠️ Erreur parsing JSON (tentative ${attempt}/${maxAttempts}), retry...`);
          // Réinitialiser taggingData pour le retry
          taggingData = null;
          continue;
        }
      }
      
      // Vérifier que les données sont valides après la boucle
      if (!taggingData || !taggingData.t || taggingData.t.length === 0) {
        throw new Error(`Impossible de générer des tags valides après ${maxAttempts} tentatives`);
      }
      
      // Si on arrive ici, les données sont valides
      tags = taggingData.t || [];
      
      // Générer le contexte à partir des nouveaux champs (schéma conforme)
      // ⚠️ CRITIQUE : Ne jamais utiliser de description par défaut générique
      if (!taggingData.d || taggingData.d.trim() === '' || taggingData.d.toLowerCase() === 'n/a') {
        throw new Error(`Description manquante dans taggingData. Impossible de continuer sans description unique.`);
      }
      context = {
        p: taggingData.p, // Présence de personnes (0, 1, 2)
        s: taggingData.s, // Style d'image
        x: taggingData.x || [], // Exclusions
        d: taggingData.d.trim(), // Description UNIQUE (obligatoire, jamais de fallback)
        // Champs de compatibilité avec l'ancien système (pour usage interne uniquement)
        _legacy: {
          hasFace: taggingData.p === 2 || taggingData.p === 1,
          location: tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("outdoor") || lower.includes("nature") || lower.includes("street") || lower.includes("exterior");
          }) ? "outdoor" : tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("indoor") || lower.includes("office") || lower.includes("studio") || lower.includes("interior");
          }) ? "indoor" : "unknown",
          formality: tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("serious") || lower.includes("formal") || lower.includes("professional");
          }) ? "formal" : tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("casual") || lower.includes("relaxed") || lower.includes("relax");
          }) ? "casual" : "mixed",
        }
      };
        
        if (imageId) {
        console.log(`✅ Tags générés pour image ${imageId}: ${tags.join(", ")} | p=${taggingData.p}, s=${taggingData.s}, x=[${taggingData.x.join(", ")}], d="${taggingData.d}"`);
      }
      
      // ⚠️ CRITIQUE : S'assurer que taggingData est défini avant de continuer
      if (!taggingData) {
        throw new Error(`taggingData n'est pas défini après la génération des tags`);
      }
      
    } catch (err) {
      // ⚠️ CRITIQUE : Ne JAMAIS utiliser de fallback générique
      // Relancer l'erreur pour que l'appelant puisse la gérer
      console.error(`❌ Erreur lors de la génération de tags pour ${imageUrl}:`, err.message);
      console.log(`Texte reçu: ${analysisText?.substring(0, 500) || "N/A"}...`);
      throw err; // Relancer l'erreur au lieu d'utiliser un fallback
    }
  } else {
    // Default tags if no OpenAI API (utiliser uniquement des tags valides de la taxonomie)
    tags = ["portrait", "professional", "person", "business", "office"];
    context = { 
      p: 1, 
      s: "photo", 
      x: [],
      d: "Image photographique professionnelle.",
      _legacy: {
        location: "indoor", 
        formality: "formal", 
        hasFace: true 
      }
    };
    taggingData = {
      id: imageId || `img_${Date.now()}`,
      u: imageUrl,
      t: tags,
      p: 1,
      s: "photo",
      x: [],
      d: "Image photographique professionnelle."
    };
  }

  // ⚠️ CRITIQUE : Vérifier que taggingData est défini avant de continuer
  if (!taggingData) {
    throw new Error(`taggingData n'est pas défini avant le return. tags: ${tags?.length || 0}, context: ${context ? 'défini' : 'non défini'}`);
  }
  
  // Enrichir les tags avec des tags contextuels basés sur la source et le texte du post
  const enrichedTags = await enrichTagsWithContext(tags, source, postText, metadata);
  
  // ⚠️ CRITIQUE : Vérifier à nouveau que taggingData est toujours défini après enrichTagsWithContext
  if (!taggingData) {
    throw new Error(`taggingData est devenu null après enrichTagsWithContext`);
  }
  
  return { 
    tags: enrichedTags, 
    context,
    taggingData: taggingData // Retourner aussi le nouveau format
  };
};

/**
 * Enrichit les tags d'une image avec des tags contextuels basés sur :
 * - La source de l'image (linkedin_post, website_image, etc.)
 * - Le texte du post associé (post_text_related, thématiques dérivées)
 * @param {string[]} visualTags - Tags générés par l'analyse visuelle
 * @param {string|null} source - Source de l'image ("linkedin", "website", "web_search")
 * @param {string|null} postText - Texte du post associé (si disponible)
 * @param {object} metadata - Métadonnées supplémentaires
 * @returns {Promise<string[]>} Tags enrichis
 */
const enrichTagsWithContext = async (visualTags, source, postText, metadata = {}) => {
  const enrichedTags = [...visualTags]; // Copier les tags visuels existants
  
  // 1. Ajouter des tags basés sur la source
  if (source === "linkedin") {
    enrichedTags.push("linkedin_post");
    enrichedTags.push("professional_visual");
    if (metadata.linkedinPost) {
      enrichedTags.push("social_media_content");
    }
  } else if (source === "website") {
    enrichedTags.push("website_image");
    enrichedTags.push("professional_visual");
  } else if (source === "web_search") {
    enrichedTags.push("web_search_image");
  }
  
  // 2. Analyser le texte du post pour extraire des thématiques et enrichir les tags
  if (postText && typeof postText === "string" && postText.trim().length > 0) {
    enrichedTags.push("post_text_related");
    
    // Extraire des thématiques du texte avec OpenAI si disponible
    if (process.env.OPENAI_API_KEY) {
      try {
        const textAnalysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are an expert in content analysis. Extract thematic tags from a LinkedIn post text.
                
Your task:
1. Analyze the post text and identify main themes (e.g., tech, business, storytelling, training, event, innovation, motivation, etc.)
2. Generate 3-5 thematic tags in ENGLISH that describe the post content
3. Tags should be relevant for image selection (e.g., "tech", "business", "storytelling", "training", "event", "innovation", "motivation", "entrepreneurship", "leadership", "networking", etc.)

Respond ONLY with a JSON array of tags: ["tag1", "tag2", "tag3"]
Example: ["tech", "innovation", "business"]`,
              },
              {
                role: "user",
                content: `Extract thematic tags from this LinkedIn post:\n\n"""${postText.substring(0, 1000)}"""\n\nReturn only a JSON array of 3-5 thematic tags in ENGLISH.`,
              },
            ],
            temperature: 0.5,
            max_tokens: 150,
          }),
        });
        
        const textAnalysisData = await textAnalysisRes.json();
        const textAnalysisText = textAnalysisData?.choices?.[0]?.message?.content || "";
        
        try {
          // Extraire le JSON même s'il y a du texte autour
          let jsonText = textAnalysisText.trim();
          const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
          const thematicTags = JSON.parse(jsonText);
          
          if (Array.isArray(thematicTags) && thematicTags.length > 0) {
            // Ajouter les tags thématiques (normalisés)
            thematicTags.forEach(tag => {
              if (typeof tag === "string" && tag.trim().length > 0) {
                const normalizedTag = tag.trim().toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
                if (normalizedTag.length > 0 && !enrichedTags.includes(normalizedTag)) {
                  enrichedTags.push(normalizedTag);
                }
              }
            });
          }
        } catch (parseErr) {
          // Fallback: extraction basique de thématiques depuis le texte
          const lowerText = postText.toLowerCase();
          const fallbackThemes = [];
          
          if (lowerText.includes("tech") || lowerText.includes("technologie") || lowerText.includes("code") || lowerText.includes("software")) {
            fallbackThemes.push("tech");
          }
          if (lowerText.includes("business") || lowerText.includes("entreprise") || lowerText.includes("commerce")) {
            fallbackThemes.push("business");
          }
          if (lowerText.includes("formation") || lowerText.includes("training") || lowerText.includes("atelier") || lowerText.includes("workshop")) {
            fallbackThemes.push("training");
          }
          if (lowerText.includes("événement") || lowerText.includes("event") || lowerText.includes("conférence") || lowerText.includes("conference")) {
            fallbackThemes.push("event");
          }
          if (lowerText.includes("innovation") || lowerText.includes("innovant")) {
            fallbackThemes.push("innovation");
          }
          if (lowerText.includes("motiv") || lowerText.includes("inspir") || lowerText.includes("storytelling") || lowerText.includes("histoire")) {
            fallbackThemes.push("storytelling");
          }
          
          fallbackThemes.forEach(theme => {
            if (!enrichedTags.includes(theme)) {
              enrichedTags.push(theme);
            }
          });
        }
      } catch (err) {
        console.error(`Erreur analyse thématique du texte:`, err);
        // Continuer sans les tags thématiques si l'analyse échoue
      }
    } else {
      // Fallback sans OpenAI: extraction basique
      const lowerText = postText.toLowerCase();
      if (lowerText.includes("tech") || lowerText.includes("technologie")) enrichedTags.push("tech");
      if (lowerText.includes("business") || lowerText.includes("entreprise")) enrichedTags.push("business");
      if (lowerText.includes("formation") || lowerText.includes("training")) enrichedTags.push("training");
      if (lowerText.includes("événement") || lowerText.includes("event")) enrichedTags.push("event");
    }
  }
  
  // Limiter à 25 tags maximum (tags visuels + tags contextuels)
  return enrichedTags.slice(0, 25);
};

// ---------------------- LAB MODE: INGEST (Récupération images) ----------------------
app.post("/ingest", async (req, res) => {
  try {
    const { email, prenom, nom, entreprise, siteWeb, linkedin } = req.body;

    if (!prenom || !nom) {
      return res.status(400).json({ success: false, message: "Prénom et nom requis." });
    }

    const images = [];
    const userEmail = email || "anonymous";

    // 1. Scraping du site web
    if (siteWeb) {
      try {
        console.log(`🌐 Scraping site web: ${siteWeb}`);
        const siteRes = await fetch(siteWeb, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
          },
        });
        const html = await siteRes.text();
        
        // Extraction des images avec plusieurs méthodes
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        const srcsetRegex = /<img[^>]+srcset=["']([^"']+)["']/gi;
        const backgroundImageRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
        const dataSrcRegex = /<img[^>]+data-src=["']([^"']+)["']/gi;
        const dataSrcsetRegex = /<img[^>]+data-srcset=["']([^"']+)["']/gi;
        
        const allImageUrls = new Set();
        
        // Extraire toutes les URLs d'images
        [...html.matchAll(imgRegex)].forEach(match => {
          if (match[1]) allImageUrls.add(match[1]);
        });
        [...html.matchAll(dataSrcRegex)].forEach(match => {
          if (match[1]) allImageUrls.add(match[1]);
        });
        [...html.matchAll(srcsetRegex)].forEach(match => {
          // srcset peut contenir plusieurs URLs séparées par des virgules
          const urls = match[1].split(',').map(u => u.trim().split(' ')[0]);
          urls.forEach(url => {
            if (url) allImageUrls.add(url);
          });
        });
        [...html.matchAll(dataSrcsetRegex)].forEach(match => {
          const urls = match[1].split(',').map(u => u.trim().split(' ')[0]);
          urls.forEach(url => {
            if (url) allImageUrls.add(url);
          });
        });
        [...html.matchAll(backgroundImageRegex)].forEach(match => {
          if (match[1]) allImageUrls.add(match[1]);
        });
        
        // Convertir et filtrer les URLs
        for (const imgUrl of Array.from(allImageUrls)) {
          let finalUrl = imgUrl;
          
          // Convertir les URLs relatives en absolues
          if (finalUrl.startsWith("//")) {
            finalUrl = `https:${finalUrl}`;
          } else if (finalUrl.startsWith("/")) {
            const urlObj = new URL(siteWeb);
            finalUrl = `${urlObj.origin}${finalUrl}`;
          } else if (!finalUrl.startsWith("http")) {
            const urlObj = new URL(siteWeb);
            finalUrl = `${urlObj.origin}/${finalUrl}`;
          }
          
          // Filtrer les images pertinentes (exclure drapeaux, icônes, logos, etc.)
          const lowerUrl = finalUrl.toLowerCase();
          const isExcluded = 
            lowerUrl.includes("icon") || 
            lowerUrl.includes("logo") || 
            lowerUrl.includes("favicon") ||
            lowerUrl.includes("sprite") ||
            lowerUrl.includes("placeholder") ||
            lowerUrl.includes("flag") ||  // Drapeaux
            lowerUrl.includes("emoji") ||
            lowerUrl.includes("badge") ||
            lowerUrl.includes("button") ||
            lowerUrl.includes("arrow") ||
            lowerUrl.includes("chevron") ||
            lowerUrl.includes("close") ||
            lowerUrl.includes("menu") ||
            lowerUrl.includes("hamburger") ||
            lowerUrl.includes("social") && !lowerUrl.includes("photo") || // Réseaux sociaux mais pas photos
            lowerUrl.includes("share") ||
            lowerUrl.includes("like") ||
            lowerUrl.includes("comment") ||
            lowerUrl.includes("svg") && lowerUrl.length < 100; // Petits SVG (probablement icônes)
          
          const isRelevant = 
            !isExcluded &&
            (lowerUrl.includes("photo") || 
             lowerUrl.includes("image") || 
             lowerUrl.includes("img") ||
             lowerUrl.includes("avatar") ||
             lowerUrl.includes("profile") ||
             lowerUrl.includes("person") ||
             lowerUrl.includes("team") ||
             lowerUrl.includes("about") ||
             lowerUrl.includes("portrait") ||
             lowerUrl.includes("headshot") ||
             lowerUrl.includes("visage") ||
             lowerUrl.includes("face") ||
             lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)/i));
          
          if (isRelevant) {
            images.push({
              url: finalUrl,
              source: "website",
              website: siteWeb,
            });
          }
        }
        
        console.log(`✅ ${images.filter(img => img.source === "website").length} image(s) trouvée(s) sur le site web`);
      } catch (err) {
        console.error("Erreur scraping site web:", err);
      }
    }

    // 2. Récupération depuis les posts LinkedIn via API
    if (linkedin) {
      try {
        console.log(`💼 Récupération LinkedIn via API: ${linkedin}`);
        
        // Extraire le nom d'utilisateur LinkedIn de l'URL
        let linkedinUsername = linkedin;
        if (linkedin.includes("linkedin.com/in/")) {
          linkedinUsername = linkedin.split("linkedin.com/in/")[1].split("/")[0].split("?")[0];
        } else if (linkedin.includes("/in/")) {
          linkedinUsername = linkedin.split("/in/")[1].split("/")[0].split("?")[0];
        } else if (linkedin.startsWith("@")) {
          linkedinUsername = linkedin.substring(1);
        }
        
        linkedinUsername = linkedinUsername.trim();
        console.log(`📝 LinkedIn username extrait: ${linkedinUsername}`);
        
        // Préparer l'URL LinkedIn complète
        let linkedinUrl = linkedin;
        if (!linkedinUrl.startsWith("http")) {
          if (linkedinUrl.startsWith("/")) {
            linkedinUrl = `https://www.linkedin.com${linkedinUrl}`;
          } else {
            linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}/`;
          }
        }
        
        try {
          // Appel à l'API Fresh LinkedIn Profile Data API pour récupérer les posts
          const apiKey = process.env.RAPIDAPI_KEY ;
          
          const apiHost = "web-scraping-api2.p.rapidapi.com";
          const apiUrl = `https://${apiHost}/get-profile-posts?linkedin_url=${encodeURIComponent(linkedinUrl)}&type=posts`;
          
          console.log(`🔗 Appel API LinkedIn: ${apiUrl}`);
          console.log(`🔑 Clé API utilisée: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 10)}`);
          
          const apiRes = await fetch(apiUrl, {
            method: "GET",
            headers: {
              "x-rapidapi-key": apiKey,
              "x-rapidapi-host": apiHost,
              "Content-Type": "application/json",
            },
          });
          
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            console.log(`✅ API LinkedIn répondue avec succès`);
            
            // Extraire les images des posts selon la structure de la réponse
            // La réponse contient un tableau "data" (pas "posts")
            if (apiData && apiData.data && Array.isArray(apiData.data)) {
              console.log(`📊 ${apiData.data.length} post(s) récupéré(s) de LinkedIn`);
              
              // Fonction helper pour vérifier si une URL est une image
              const isImageUrl = (url) => {
                if (!url || typeof url !== "string") return false;
                const lowerUrl = url.toLowerCase();
                // Vérifier l'extension dans l'URL
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
                const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
                // Vérifier aussi les patterns d'URLs d'images courants
                const isImagePattern = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url) || 
                                      /image/i.test(url) || 
                                      /media.*image/i.test(url);
                return hasImageExtension || isImagePattern;
              };
              
              // 🆕 Stocker les relations post ↔ image dans posts_analysis
              const postsToSave = new Map(); // Map pour éviter les doublons (clé = post_text normalisé)
              
              // Fonction helper pour normaliser le texte du post
              const normalizeText = (text) => {
                if (!text || typeof text !== "string") return "";
                return text.trim()
                  .replace(/[^\w\s]/g, " ")
                  .replace(/\s+/g, " ")
                  .replace(/\n+/g, " ")
                  .toLowerCase();
              };
              
              for (const post of apiData.data) {
                // Extraire le texte du post
                const postText = post.text || null;
                if (!postText) continue; // Ignorer les posts sans texte
                
                // Extraire UNIQUEMENT les images du post (pas les vidéos, PDFs, etc.)
                let postImageUrl = null; // URL de la première image du post
                
                if (post.images && Array.isArray(post.images) && post.images.length > 0) {
                  for (const imageObj of post.images) {
                    // L'image peut être un objet avec une propriété url ou directement une string
                    let imageUrl = null;
                    if (typeof imageObj === "string") {
                      imageUrl = imageObj;
                    } else if (imageObj && typeof imageObj === "object") {
                      imageUrl = imageObj.url || imageObj.src || imageObj.image || imageObj.mediaUrl;
                    }
                    
                    // Filtrer : n'accepter QUE les URLs d'images (pas les vidéos, PDFs, etc.)
                    if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http") && isImageUrl(imageUrl)) {
                      // Prendre la première image valide comme image principale du post
                      if (!postImageUrl) {
                        postImageUrl = imageUrl;
                      }
                      
                      images.push({
                        url: imageUrl,
                        source: "linkedin",
                        linkedinProfile: linkedin,
                        linkedinPost: post.post_url || post.urn || null,
                        postText: postText, // Stocker le texte du post avec l'image
                      });
                    }
                  }
                }
                
                // Vérifier aussi dans le texte du post pour d'autres URLs d'images UNIQUEMENT
                if (postText) {
                  // Accepter uniquement les URLs d'images (jpg, jpeg, png, gif, webp)
                  const contentImages = postText.match(/https?:\/\/[^\s\)]+\.(jpg|jpeg|png|gif|webp)(\?|$)/gi);
                  if (contentImages) {
                    for (const imgUrl of contentImages) {
                      if (imgUrl && isImageUrl(imgUrl)) {
                        // Prendre la première image valide comme image principale du post
                        if (!postImageUrl) {
                          postImageUrl = imgUrl;
                        }
                        
                        if (!images.some(img => img.url === imgUrl)) {
                          images.push({
                            url: imgUrl,
                            source: "linkedin",
                            linkedinProfile: linkedin,
                            linkedinPost: post.post_url || post.urn || null,
                            postText: postText, // Stocker le texte du post avec l'image
                          });
                        }
                      }
                    }
                  }
                }
                
                // Vérifier dans les vidéos (qui peuvent avoir des thumbnails) - seulement si c'est une image
                if (post.video && post.video.thumbnail) {
                  const videoThumbnail = post.video.thumbnail;
                  if (videoThumbnail && typeof videoThumbnail === "string" && videoThumbnail.startsWith("http") && isImageUrl(videoThumbnail)) {
                    // Prendre le thumbnail comme image principale du post si pas d'image trouvée
                    if (!postImageUrl) {
                      postImageUrl = videoThumbnail;
                    }
                    
                    if (!images.some(img => img.url === videoThumbnail)) {
                      images.push({
                        url: videoThumbnail,
                        source: "linkedin",
                        linkedinProfile: linkedin,
                        linkedinPost: post.post_url || post.urn || null,
                        postText: postText, // Stocker le texte du post avec l'image
                      });
                    }
                  }
                }
                
                // 🆕 Sauvegarder la relation post ↔ image dans posts_analysis
                // Normaliser le texte du post pour éviter les doublons
                const normalizedPostText = normalizeText(postText);
                const postUrl = post.post_url || post.urn || null;
                
                // Ne sauvegarder que si le post a une image et n'a pas déjà été sauvegardé
                if (postImageUrl && !postsToSave.has(normalizedPostText)) {
                  postsToSave.set(normalizedPostText, {
                    postText: postText,
                    linkedinPostUrl: postUrl,
                    linkedinPostImageUrl: postImageUrl,
                    postExistsOnLinkedIn: true,
                    email: userEmail,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
                }
              }
              
              // 🆕 Sauvegarder toutes les relations post ↔ image dans posts_analysis
              if (postsToSave.size > 0) {
                console.log(`💾 Sauvegarde de ${postsToSave.size} relation(s) post ↔ image dans posts_analysis...`);
                for (const [normalizedText, postData] of postsToSave.entries()) {
                  try {
                    // Vérifier si une analyse existe déjà pour ce post (même texte normalisé)
                    const existingAnalysis = await db.collection("posts_analysis")
                      .where("email", "==", userEmail)
                      .get();
                    
                    let foundExisting = false;
                    for (const doc of existingAnalysis.docs) {
                      const data = doc.data();
                      if (data.postText) {
                        const existingNormalized = normalizeText(data.postText);
                        if (existingNormalized === normalizedText) {
                          // Mettre à jour l'analyse existante avec l'URL de l'image
                          await doc.ref.update({
                            linkedinPostUrl: postData.linkedinPostUrl,
                            linkedinPostImageUrl: postData.linkedinPostImageUrl,
                            postExistsOnLinkedIn: true,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                          });
                          foundExisting = true;
                          console.log(`✅ Analyse existante mise à jour avec l'image du post: ${doc.id}`);
                          break;
                        }
                      }
                    }
                    
                    // Si aucune analyse existante, créer une nouvelle entrée
                    if (!foundExisting) {
                      await db.collection("posts_analysis").add(postData);
                      console.log(`✅ Nouvelle relation post ↔ image sauvegardée dans posts_analysis`);
                    }
                  } catch (saveErr) {
                    console.error(`⚠️ Erreur lors de la sauvegarde de la relation post ↔ image:`, saveErr);
                  }
                }
                console.log(`✅ ${postsToSave.size} relation(s) post ↔ image sauvegardée(s) dans posts_analysis`);
              }
              
              const linkedinImagesCount = images.filter(img => img.source === "linkedin").length;
              if (linkedinImagesCount > 0) {
                console.log(`✅ ${linkedinImagesCount} image(s) récupérée(s) depuis les posts LinkedIn`);
              } else {
                console.log(`⚠️ Aucune image trouvée dans les posts LinkedIn`);
              }
              
              // Si pagination disponible, récupérer les pages suivantes
              if (apiData.paging && apiData.paging.pagination_token) {
                console.log(`📄 Pagination disponible, récupération des pages suivantes...`);
                // Pour l'instant, on récupère seulement la première page
                // Vous pouvez ajouter une boucle pour récupérer toutes les pages si nécessaire
              }
            } else {
              console.log(`⚠️ Format de réponse API inattendu ou aucun post trouvé`);
              console.log(`📋 Réponse API:`, JSON.stringify(apiData).substring(0, 500));
            }
          } else {
            const errorText = await apiRes.text();
            console.error(`❌ Erreur API LinkedIn (${apiRes.status}): ${errorText.substring(0, 500)}`);
            
            if (apiRes.status === 403) {
              if (errorText.includes("not subscribed")) {
                console.error(`⚠️ Vous n'êtes pas abonné à l'API "Fresh LinkedIn Profile Data API" sur RapidAPI.`);
              } else if (errorText.includes("Invalid API Key")) {
                console.error(`⚠️ La clé API RapidAPI est invalide ou expirée.`);
              } else {
                console.error(`⚠️ Accès refusé à l'API (403). Vérifiez votre abonnement et votre clé API.`);
              }
            } else if (errorText.includes("API doesn't exists")) {
              console.error(`⚠️ Le nom de l'API sur RapidAPI est incorrect.`);
            }
            
            console.log(`ℹ️ Les images du site web ont été récupérées avec succès.`);
          }
        } catch (apiErr) {
          console.error(`❌ Erreur lors de l'appel API LinkedIn:`, apiErr.message);
          console.log(`ℹ️ Les images du site web ont été récupérées avec succès.`);
        }
      } catch (err) {
        console.error("Erreur LinkedIn:", err);
        console.log(`ℹ️ Les images du site web ont été récupérées avec succès.`);
      }
    }

    // Fonction helper pour vérifier si le Content-Type est une image
    const isImageContentType = (contentType) => {
      if (!contentType) return false;
      return contentType.startsWith("image/");
    };
    
    // Sauvegarder UNIQUEMENT les images dans Firestore (pas les vidéos, PDFs, etc.)
    const savedImages = [];
    for (const img of images) {
      try {
        // Télécharger l'image et vérifier que c'est bien une image
        const imgRes = await fetch(img.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        
        if (imgRes.ok) {
          // Vérifier le Content-Type pour s'assurer que c'est bien une image
          const contentType = imgRes.headers.get("content-type");
          if (!isImageContentType(contentType)) {
            console.log(`⚠️ Fichier ignoré (pas une image): ${img.url} - Content-Type: ${contentType}`);
            continue; // Ignorer les fichiers qui ne sont pas des images
          }
          
          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Déterminer l'extension à partir du Content-Type ou de l'URL
          // IMPORTANT: Ne jamais utiliser .bin, toujours utiliser une extension d'image valide
          let extension = "jpg"; // Extension par défaut (jamais .bin)
          if (contentType) {
            if (contentType.includes("png")) extension = "png";
            else if (contentType.includes("gif")) extension = "gif";
            else if (contentType.includes("webp")) extension = "webp";
            else if (contentType.includes("jpeg") || contentType.includes("jpg")) extension = "jpg";
            else if (contentType.includes("bmp")) extension = "bmp";
            else if (contentType.includes("svg")) extension = "svg";
            // Si le Content-Type n'est pas reconnu, utiliser jpg par défaut (jamais .bin)
          } else {
            // Fallback : utiliser l'extension de l'URL, mais seulement si c'est une extension d'image valide
            const urlExtension = img.url.split(".").pop()?.split("?")[0];
            if (urlExtension && ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(urlExtension.toLowerCase())) {
              extension = urlExtension.toLowerCase();
            }
            // Si l'extension n'est pas valide ou est .bin, on utilise "jpg" par défaut
          }
          
          // Sécurité supplémentaire : s'assurer qu'on n'utilise jamais .bin
          if (extension === "bin" || extension.length > 5) {
            extension = "jpg";
          }
          
          const filePath = `lab/${userEmail}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
          const file = bucket.file(filePath);
          
          await file.save(buffer, {
            metadata: { contentType: contentType || "image/jpeg" },
          });
          await file.makePublic();
          
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
          
          // Normaliser la source : "linkedin", "website", ou "web_search" (Google Images)
          let normalizedSource = img.source || "unknown";
          if (normalizedSource === "linkedin") {
            normalizedSource = "linkedin";
          } else if (normalizedSource === "website") {
            normalizedSource = "website";
          } else if (normalizedSource === "google_image" || normalizedSource === "google" || normalizedSource === "web_search") {
            normalizedSource = "web_search";
          } else {
            normalizedSource = "website"; // Par défaut si source inconnue
          }
          
          // Générer automatiquement les tags pour cette image (avec contexte enrichi)
          // ⚠️ CRITIQUE : Générer un ID unique pour chaque image pour garantir l'unicité
          const uniqueImageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          console.log(`🏷️ Génération automatique des tags pour l'image: ${publicUrl} (ID: ${uniqueImageId})`);
          
          // Ajouter un timeout pour éviter les blocages (30 secondes max par image)
          let tags, context, taggingData;
          try {
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Timeout: génération de tags dépassée (30s)")), 30000)
            );
            
            const tagsPromise = generateTagsForImage(publicUrl, uniqueImageId, {
              source: normalizedSource,
              postText: img.postText || null,
              metadata: {
                linkedinPost: img.linkedinPost || null,
              },
            });
            
            const result = await Promise.race([tagsPromise, timeoutPromise]);
            tags = result.tags;
            context = result.context;
            taggingData = result.taggingData;
            
            // ⚠️ DEBUG : Vérifier que taggingData est bien défini
            if (!taggingData) {
              console.error(`❌ taggingData est null dans le résultat pour ${publicUrl}`);
              continue;
            }
            if (!taggingData.t || taggingData.t.length === 0) {
              console.error(`❌ taggingData.t est vide pour ${publicUrl}. taggingData:`, JSON.stringify(taggingData));
              continue;
            }
            console.log(`✅ taggingData valide reçu pour ${publicUrl}: ${taggingData.t.length} tags`);
          } catch (tagError) {
            console.error(`❌ Erreur génération tags pour ${publicUrl}:`, tagError.message);
            // ⚠️ CRITIQUE : Ne JAMAIS utiliser de valeurs par défaut génériques
            // Si la génération échoue, on ne peut pas continuer sans données spécifiques à l'image
            console.error(`❌ Impossible de générer des tags uniques pour ${publicUrl}. Cette image sera ignorée.`);
            // Ne pas sauvegarder cette image sans tags et description uniques
            continue; // Passer à l'image suivante
          }
          
          // Créer l'objet owner avec prénom, nom, email
          const owner = {
            prenom: prenom || "",
            nom: nom || "",
            email: userEmail,
            // ID utilisateur peut être l'email ou un ID si disponible
            id: userEmail,
          };
          
          // Valider le schéma compact avant sauvegarde
          // Utiliser uniquement taggingData.t (tags validés contre taxonomie), pas tags (enrichis avec tags hors taxonomie)
          // ⚠️ CRITIQUE : Si taggingData est null ou taggingData.t est vide, NE PAS utiliser de tags par défaut
          if (!taggingData || !taggingData.t || taggingData.t.length === 0) {
            console.error(`❌ Aucun tag valide pour ${publicUrl}. Cette image sera ignorée.`);
            continue; // Passer à l'image suivante
          }
          const tagsToValidate = taggingData.t;
          
          // ⚠️ CRITIQUE : Vérifier que la description est présente et unique
          if (!taggingData.d || taggingData.d.trim() === '' || taggingData.d.toLowerCase() === 'n/a') {
            console.error(`❌ Description manquante pour ${publicUrl}. Cette image sera ignorée.`);
            continue; // Passer à l'image suivante
          }
          
          const schemaValidation = validateCompactSchema({
            id: null, // Sera défini après l'ajout
            url: publicUrl,
            t: tagsToValidate, // Utiliser uniquement les tags validés de taggingData
            p: taggingData?.p ?? context?.p ?? 1,
            s: taggingData?.s || context?.s || "photo",
            x: taggingData?.x || context?.x || [],
            d: taggingData.d.trim() // Description UNIQUE (obligatoire, jamais de fallback)
          });

          if (!schemaValidation.valid) {
            console.error(`❌ Schéma invalide pour l'image ${publicUrl}:`, schemaValidation.errors);
            // Utiliser les valeurs normalisées même si invalides
          }

          // Optimiser et réordonner les tags avant la sauvegarde
          const optimizedTags = optimizeAndReorderTags(tagsToValidate);
          
          // ⚠️ CRITIQUE : S'assurer que la description est présente dans normalizedSchema
          const normalizedSchema = schemaValidation.normalized || {
            t: optimizedTags, // Tags optimisés et réordonnés
            p: taggingData?.p ?? context?.p ?? 1,
            s: taggingData?.s || context?.s || "photo",
            x: taggingData?.x || context?.x || [],
            d: taggingData.d.trim() // Description UNIQUE (obligatoire, jamais de fallback)
          };
          
          // Vérification finale : s'assurer que la description n'est pas générique
          if (!normalizedSchema.d || normalizedSchema.d.trim() === '') {
            console.error(`❌ Description manquante dans normalizedSchema pour ${publicUrl}. Cette image sera ignorée.`);
            continue; // Passer à l'image suivante
          }
          
          // S'assurer que le schéma normalisé utilise aussi les tags optimisés
          if (normalizedSchema.t && normalizedSchema.t.length > 0) {
            normalizedSchema.t = optimizeAndReorderTags(normalizedSchema.t);
          }

          // ⚠️ Vérification finale : Log pour confirmer l'unicité des données avant sauvegarde
          console.log(`✅ Données uniques générées pour l'image ${uniqueImageId}:`);
          console.log(`   - Tags (${normalizedSchema.t.length}):`, normalizedSchema.t.join(", "));
          console.log(`   - Description:`, normalizedSchema.d.substring(0, 100) + (normalizedSchema.d.length > 100 ? "..." : ""));

          // Sauvegarder dans Firestore avec les champs requis
          // Chaque image est enregistrée avec :
          // - Schéma compact conforme : id, u, t, p, s, x, d
          // - Métadonnées supplémentaires pour usage interne
          const docRef = await db.collection("images").add({
            owner: owner, // owner avec prénom, nom, email, id
            email: userEmail, // Garder email pour compatibilité avec l'ancien code
            // Schéma compact conforme (OBLIGATOIRE)
            // id sera ajouté après création (docRef.id)
            u: publicUrl, // URL/storage key (champ u du schéma)
            t: normalizedSchema.t, // Tags validés (5-12 tags) - UNIQUES pour cette image
            p: normalizedSchema.p, // Présence de personnes (0, 1, 2)
            s: normalizedSchema.s, // Style d'image validé
            x: normalizedSchema.x, // Exclusions validées
            d: normalizedSchema.d.trim(), // Description UNIQUE (obligatoire, jamais de fallback)
            // Champs supplémentaires (pour compatibilité et usage interne)
            url: publicUrl, // Alias de u pour compatibilité
            source: normalizedSource, // Source: "linkedin", "website", "web_search" (Google Images)
            created_at: admin.firestore.FieldValue.serverTimestamp(), // Date d'ajout (timestamp Firestore)
            relevance_score: 0, // Score de pertinence initialisé à 0
            tagged_at: admin.firestore.FieldValue.serverTimestamp(), // Date de tagging
            postText: img.postText || null, // Texte du post associé (si disponible, pour améliorer la sélection)
            linkedinPost: img.linkedinPost || null, // URL/URN du post LinkedIn (si applicable)
            // Ancien format pour compatibilité
            tags: normalizedSchema.t, // Tags (même que t)
            context: {
              p: normalizedSchema.p,
              s: normalizedSchema.s,
              x: normalizedSchema.x,
              d: normalizedSchema.d.trim(), // Description UNIQUE (obligatoire, jamais de fallback)
              ...(context._legacy ? { _legacy: context._legacy } : {})
            },
            labData: {
              prenom,
              nom,
              entreprise,
              siteWeb,
              linkedin,
            },
          });
          
          // Mettre à jour le document avec l'id correct
          await db.collection("images").doc(docRef.id).update({
            id: docRef.id
          });
          
          // Retourner le schéma conforme dans savedImages
          savedImages.push({
            id: docRef.id, // ID unique pour chaque image
            u: publicUrl, // URL unique pour chaque image
            t: normalizedSchema.t, // Tags UNIQUES pour cette image
            p: normalizedSchema.p,
            s: normalizedSchema.s,
            x: normalizedSchema.x,
            d: normalizedSchema.d.trim(), // Description UNIQUE pour cette image (obligatoire, jamais de fallback)
            // Métadonnées supplémentaires pour affichage
            url: publicUrl, // Alias pour compatibilité
            source: normalizedSource,
            created_at: new Date(),
            relevance_score: 0,
          });
        }
      } catch (err) {
        console.error(`Erreur sauvegarde image ${img.url}:`, err);
      }
    }

    // Pas de limite stricte - récupérer toutes les images valides trouvées
    const websiteCount = savedImages.filter(img => img.source === "website").length;
    const linkedinCount = savedImages.filter(img => img.source === "linkedin").length;
    
    let message = `${savedImages.length} visuel(s) récupéré(s) et sauvegardé(s)`;
    if (websiteCount > 0 && linkedinCount > 0) {
      message += ` (${websiteCount} du site web, ${linkedinCount} de LinkedIn)`;
    } else if (websiteCount > 0) {
      message += ` (${websiteCount} du site web)`;
      if (linkedin) {
        message += `. Note: LinkedIn a bloqué l'accès (protection anti-bot - statut 999).`;
      }
    } else if (linkedinCount > 0) {
      message += ` (${linkedinCount} de LinkedIn)`;
    }
    
    res.json({
      success: true,
      images: savedImages,
      count: savedImages.length,
      websiteCount,
      linkedinCount,
      message,
    });
  } catch (error) {
    console.error("Ingest error:", error);
    res.status(500).json({ success: false, message: "Erreur lors de la récupération des visuels." });
  }
});

// ---------------------- LAB MODE: TAG BATCH (Tagging automatique) ----------------------
app.post("/tag/batch", async (req, res) => {
  try {
    const { email, imageIds } = req.body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ success: false, message: "Liste d'IDs d'images requise." });
    }

    const userEmail = email || "anonymous";
    const taggedImages = [];

    for (const imageId of imageIds) {
      try {
        const imageRef = db.collection("images").doc(imageId);
        const imageDoc = await imageRef.get();

        if (!imageDoc.exists) {
          console.warn(`Image ${imageId} non trouvée`);
          continue;
        }

        const imageData = imageDoc.data();
        const imageUrl = imageData.url;

        if (!imageUrl) {
          console.warn(`Image ${imageId} sans URL`);
          continue;
        }

        // Génération de tags avec OpenAI (analyse de l'image via description)
        let tags = [];
        let context = {};

        if (process.env.OPENAI_API_KEY) {
          try {
            // Télécharger l'image pour l'analyser
            const imgRes = await fetch(imageUrl);
            const imgArrayBuffer = await imgRes.arrayBuffer();
            const imgBuffer = Buffer.from(imgArrayBuffer);
            const base64Image = imgBuffer.toString("base64");

            // Utiliser GPT-4 Vision pour analyser l'image avec un prompt très détaillé
            const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Analyze the following image and generate a list of precise, short, and relevant tags that describe its content.

The tags must be in ENGLISH ONLY. All tags must be English words.

The tags must allow a tool like Lyter to automatically select the most suitable image to illustrate a professional post.

For this image, provide ONLY:
- a comma-separated list of tags
- NO sentences
- NO comments
- NO categories
- maximum 20 tags
- minimum 8 tags

CRITICAL: Describe ONLY what you SEE in the image. Do NOT interpret, assume, or invent anything that is not clearly visible.

The tags must describe ONLY visible elements:
- visible elements (what is actually shown)
- context (what environment is visible)
- mood/atmosphere (what feeling is conveyed by visible elements)
- actions (what actions are visible)
- location (what place is visible)
- main subject (what main object/person is visible)
- general composition (how elements are arranged - visible only)
- visual style (colors, lighting, style - visible only)

You MUST include tags about:
- image type: portrait, selfie, product, scene, office, outdoor, indoor
- tone: serious, casual, dynamic, inspiring (based on visible elements only)
- situation: meeting, computer, walking, presentation, reflection (what is visible)
- setting: office, nature, street, transport, coworking, studio (what is visible)
- visible objects: computer, cup, phone, document, screen (only if visible)
- visual characteristics: soft light, blurred background, warm colors, natural style (only if visible)

CRITICAL RULES:
- NEVER invent elements that are not visible
- NEVER interpret the image's intention or meaning
- NEVER assume what is happening beyond what you see
- Describe ONLY what is actually visible in the image
- All tags must be in ENGLISH
- Use simple English words, NO underscores, NO hyphens, NO compound words with underscores
- Examples of CORRECT tags: "portrait", "confident", "modern office", "professional look", "young man", "natural lighting", "casual style", "positive atmosphere", "blurred background", "white shirt"
- Examples of INCORRECT tags: "portrait_confiant", "bureau_modern", "look_professionnel" (NO underscores, NO French words)
- Be objective and factual - only describe visible reality

At the end, generate this output:
**Tags.** tag1, tag2, tag3, tag4, etc.`,
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${base64Image}`,
                        },
                      },
                    ],
                  },
                ],
                temperature: 0.8, // Plus de créativité pour des tags variés
                max_tokens: 500,
              }),
            });

            const analysisData = await analysisRes.json();
            const analysisText = analysisData?.choices?.[0]?.message?.content || "";

            // Parser la réponse selon le nouveau format: **Tags.** tag1, tag2, tag3, etc.
            try {
              // Chercher la ligne avec "**Tags.**" ou "Tags."
              let tagsText = analysisText;
              
              // Chercher le pattern "**Tags.**" ou "Tags." suivi des tags
              const tagsMatch = tagsText.match(/(?:\*\*Tags\.\*\*|Tags\.)\s*(.+)/i);
              if (tagsMatch) {
                tagsText = tagsMatch[1];
              } else {
                // Si pas de pattern trouvé, chercher la dernière ligne qui contient des tags séparés par des virgules
                const lines = tagsText.split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                  if (lines[i].includes(',') && lines[i].split(',').length >= 3) {
                    tagsText = lines[i];
                    break;
                  }
                }
              }
              
              // Extraire les tags en séparant par virgule et nettoyant
              tags = tagsText
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0 && !tag.match(/^\*\*/)) // Enlever les balises markdown restantes
                .map(tag => tag.replace(/^\*\*|\*\*$/g, '').trim()) // Nettoyer les balises markdown
                .filter(tag => tag.length > 0)
                .map(tag => {
                  // Normaliser les tags : enlever underscores, traduire en anglais si nécessaire
                  let normalized = tag.replace(/_/g, ' ').trim();
                  
                  // Traduction simple des mots français courants
                  const translations = {
                    'portrait': 'portrait',
                    'confiant': 'confident',
                    'bureau': 'office',
                    'moderne': 'modern',
                    'look': 'look',
                    'professionnel': 'professional',
                    'homme': 'man',
                    'jeune': 'young',
                    'éclairage': 'lighting',
                    'naturel': 'natural',
                    'style': 'style',
                    'casual': 'casual',
                    'ambiance': 'atmosphere',
                    'positive': 'positive',
                    'background': 'background',
                    'flou': 'blurred',
                    'chemise': 'shirt',
                    'blanc': 'white',
                    'intérieur': 'indoor',
                    'extérieur': 'outdoor',
                    'sérieux': 'serious',
                    'accueillant': 'welcoming',
                    'pose': 'pose',
                    'barbe': 'beard',
                    'légère': 'light',
                    'portant': 'wearing'
                  };
                  
                  // Remplacer les mots français par leurs équivalents anglais
                  normalized = normalized.split(' ').map(word => {
                    const lowerWord = word.toLowerCase();
                    return translations[lowerWord] || word;
                  }).join(' ');
                  
                  return normalized;
                });
              
              // S'assurer qu'on a entre 8 et 20 tags
              if (tags.length < 8) {
                console.warn(`⚠️ Less than 8 tags generated for image ${imageId}, using default tags`);
                tags = ["portrait", "professional", "office", "serious", "indoor", "computer", "work", "modern"];
              } else if (tags.length > 20) {
                tags = tags.slice(0, 20);
              }
              
              // Générer le contexte basé sur les tags
              const hasFace = tags.some(t => {
                const lower = t.toLowerCase();
                return lower.includes("portrait") || lower.includes("selfie") || lower.includes("face") || lower.includes("person");
              });
              
              const location = tags.some(t => {
                const lower = t.toLowerCase();
                return lower.includes("outdoor") || lower.includes("nature") || lower.includes("street") || lower.includes("exterior");
              }) ? "outdoor" : tags.some(t => {
                const lower = t.toLowerCase();
                return lower.includes("indoor") || lower.includes("office") || lower.includes("studio") || lower.includes("interior");
              }) ? "indoor" : "unknown";
              
              const formality = tags.some(t => {
                const lower = t.toLowerCase();
                return lower.includes("serious") || lower.includes("formal") || lower.includes("professional");
              }) ? "formal" : tags.some(t => {
                const lower = t.toLowerCase();
                return lower.includes("casual") || lower.includes("relaxed") || lower.includes("relax");
              }) ? "casual" : "mixed";
              
              // Générer le contexte en anglais
              const ambianceTag = tags.find(t => {
                const lower = t.toLowerCase();
                return lower.includes("dynamic") || lower.includes("inspiring") || lower.includes("serious") || lower.includes("casual") || lower.includes("positive") || lower.includes("welcoming");
              });
              
              const actionTag = tags.find(t => {
                const lower = t.toLowerCase();
                return lower.includes("pose") || lower.includes("sitting") || lower.includes("standing") || lower.includes("walking") || lower.includes("working");
              });
              
              const mainSubjectTag = tags.find(t => {
                const lower = t.toLowerCase();
                return lower.includes("man") || lower.includes("woman") || lower.includes("person") || lower.includes("portrait") || lower.includes("selfie");
              });
              
              context = {
                location: location,
                formality: formality,
                hasFace: hasFace,
                ambiance: ambianceTag || "neutral",
                action: actionTag || "standing",
                mainSubject: mainSubjectTag || "person"
              };
              
              console.log(`✅ Tags générés pour image ${imageId}: ${tags.join(", ")}`);
            } catch (parseErr) {
              console.error(`Erreur parsing tags pour image ${imageId}:`, parseErr);
              console.log(`Texte reçu: ${analysisText.substring(0, 300)}...`);
              // Fallback: varied tags based on index to avoid repetition
              const fallbackTags = [
                ["portrait", "professional", "office", "serious", "indoor", "computer", "work", "modern"],
                ["selfie", "casual", "smiling", "relaxed", "personal", "natural", "authentic", "friendly"],
                ["portrait", "formal", "office", "meeting", "collaboration", "team", "professional", "serious"],
                ["portrait", "team", "collaboration", "office", "work", "dynamic", "professional", "modern"],
                ["portrait", "event", "networking", "professional", "presentation", "scene", "public", "inspiring"],
              ];
              tags = fallbackTags[imageIds.indexOf(imageId) % fallbackTags.length];
              context = { location: "indoor", formality: "formal", ambiance: "neutral", hasFace: true };
            }
          } catch (err) {
            console.error(`Error analyzing image ${imageId}:`, err);
            // Default tags
            tags = ["portrait", "face"];
            context = { location: "indoor", formality: "formal" };
          }
        } else {
          // Default tags if no OpenAI API
          tags = ["portrait", "professional", "face"];
          context = { location: "indoor", formality: "formal", ambiance: "neutral" };
        }

        // Mettre à jour Firestore avec les tags et le contexte
        await imageRef.update({
          tags,
          context,
        });

        taggedImages.push({
          id: imageId,
          tags,
          context,
        });
      } catch (err) {
        console.error(`Erreur tagging image ${imageId}:`, err);
      }
    }

    res.json({
      success: true,
      taggedImages,
      count: taggedImages.length,
      message: `${taggedImages.length} image(s) tagguée(s) avec succès.`,
    });
  } catch (error) {
    console.error("Tag batch error:", error);
    res.status(500).json({ success: false, message: "Erreur lors du tagging." });
  }
});


// ---------------------- LAB MODE: TAG SINGLE (Tagging d'une seule image pour test) ----------------------
app.post("/tag/single", async (req, res) => {
  try {
    const { email, imageId } = req.body;

    if (!imageId) {
      return res.status(400).json({ success: false, message: "Image ID required." });
    }

    const userEmail = email || "anonymous";

    const imageRef = db.collection("images").doc(imageId);
    const imageDoc = await imageRef.get();

    if (!imageDoc.exists) {
      return res.status(404).json({ success: false, message: "Image not found." });
    }

    const imageData = imageDoc.data();
    const imageUrl = imageData.url;

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "Image URL not found." });
    }

    // Génération de tags avec OpenAI
    let tags = [];
    let context = {};

    if (process.env.OPENAI_API_KEY) {
      try {
        // Télécharger l'image pour l'analyser
        let imgRes;
        try {
          imgRes = await fetch(imageUrl);
          if (!imgRes.ok) {
            throw new Error(`Failed to fetch image: ${imgRes.status} ${imgRes.statusText}`);
          }
        } catch (fetchErr) {
          console.error(`Error fetching image ${imageId}:`, fetchErr);
          throw new Error(`Cannot fetch image from URL: ${fetchErr.message}`);
        }
        
        const imgArrayBuffer = await imgRes.arrayBuffer();
        const imgBuffer = Buffer.from(imgArrayBuffer);
        const base64Image = imgBuffer.toString("base64");
        
        if (!base64Image || base64Image.length === 0) {
          throw new Error("Failed to convert image to base64");
        }

        // Utiliser GPT-4 Vision pour analyser l'image
        const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze the following image and generate a list of precise, short, and relevant tags that describe its content.

The tags must be in ENGLISH ONLY. All tags must be English words.

The tags must allow a tool like Lyter to automatically select the most suitable image to illustrate a professional post.

For this image, provide ONLY:
- a comma-separated list of tags
- NO sentences
- NO comments
- NO categories
- maximum 20 tags
- minimum 8 tags

CRITICAL: Describe ONLY what you SEE in the image. Do NOT interpret, assume, or invent anything that is not clearly visible.

The tags must describe ONLY visible elements:
- visible elements (what is actually shown)
- context (what environment is visible)
- mood/atmosphere (what feeling is conveyed by visible elements)
- actions (what actions are visible)
- location (what place is visible)
- main subject (what main object/person is visible)
- general composition (how elements are arranged - visible only)
- visual style (colors, lighting, style - visible only)

You MUST include tags about:
- image type: portrait, selfie, product, scene, office, outdoor, indoor
- tone: serious, casual, dynamic, inspiring (based on visible elements only)
- situation: meeting, computer, walking, presentation, reflection (what is visible)
- setting: office, nature, street, transport, coworking, studio (what is visible)
- visible objects: computer, cup, phone, document, screen (only if visible)
- visual characteristics: soft light, blurred background, warm colors, natural style (only if visible)

CRITICAL RULES:
- NEVER invent elements that are not visible
- NEVER interpret the image's intention or meaning
- NEVER assume what is happening beyond what you see
- Describe ONLY what is actually visible in the image
- All tags must be in ENGLISH
- Use simple English words, NO underscores, NO hyphens, NO compound words with underscores
- Examples of CORRECT tags: "portrait", "confident", "modern office", "professional look", "young man", "natural lighting", "casual style", "positive atmosphere", "blurred background", "white shirt"
- Examples of INCORRECT tags: "portrait_confiant", "bureau_modern", "look_professionnel" (NO underscores, NO French words)
- Be objective and factual - only describe visible reality

At the end, generate this output:
**Tags.** tag1, tag2, tag3, tag4, etc.`,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`,
                    },
                  },
                ],
              },
            ],
            temperature: 0.8,
            max_tokens: 500,
          }),
        });

        const analysisData = await analysisRes.json();
        
        if (!analysisData || !analysisData.choices || !analysisData.choices[0]) {
          throw new Error("Invalid response from OpenAI API");
        }
        
        const analysisText = analysisData.choices[0].message?.content || "";

        if (!analysisText) {
          throw new Error("Empty response from OpenAI API");
        }

        // Parser la réponse selon le nouveau format
        try {
          let tagsText = analysisText;
          
          const tagsMatch = tagsText.match(/(?:\*\*Tags\.\*\*|Tags\.)\s*(.+)/i);
          if (tagsMatch) {
            tagsText = tagsMatch[1];
          } else {
            const lines = tagsText.split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
              if (lines[i].includes(',') && lines[i].split(',').length >= 3) {
                tagsText = lines[i];
                break;
              }
            }
          }
          
          // Extraire et normaliser les tags
          tags = tagsText
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0 && !tag.match(/^\*\*/))
            .map(tag => tag.replace(/^\*\*|\*\*$/g, '').trim())
            .filter(tag => tag.length > 0)
            .map(tag => {
              let normalized = tag.replace(/_/g, ' ').trim();
              
              const translations = {
                'portrait': 'portrait', 'confiant': 'confident', 'bureau': 'office', 'moderne': 'modern',
                'look': 'look', 'professionnel': 'professional', 'homme': 'man', 'jeune': 'young',
                'éclairage': 'lighting', 'naturel': 'natural', 'style': 'style', 'casual': 'casual',
                'ambiance': 'atmosphere', 'positive': 'positive', 'background': 'background', 'flou': 'blurred',
                'chemise': 'shirt', 'blanc': 'white', 'intérieur': 'indoor', 'extérieur': 'outdoor',
                'sérieux': 'serious', 'accueillant': 'welcoming', 'pose': 'pose', 'barbe': 'beard',
                'légère': 'light', 'portant': 'wearing'
              };
              
              normalized = normalized.split(' ').map(word => {
                const lowerWord = word.toLowerCase();
                return translations[lowerWord] || word;
              }).join(' ');
              
              return normalized;
            });
          
          if (tags.length < 8) {
            tags = ["portrait", "professional", "office", "serious", "indoor", "computer", "work", "modern"];
          } else if (tags.length > 20) {
            tags = tags.slice(0, 20);
          }
          
          // Générer le contexte en anglais
          const hasFace = tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("portrait") || lower.includes("selfie") || lower.includes("face") || lower.includes("person");
          });
          
          const location = tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("outdoor") || lower.includes("nature") || lower.includes("street") || lower.includes("exterior");
          }) ? "outdoor" : tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("indoor") || lower.includes("office") || lower.includes("studio") || lower.includes("interior");
          }) ? "indoor" : "unknown";
          
          const formality = tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("serious") || lower.includes("formal") || lower.includes("professional");
          }) ? "formal" : tags.some(t => {
            const lower = t.toLowerCase();
            return lower.includes("casual") || lower.includes("relaxed") || lower.includes("relax");
          }) ? "casual" : "mixed";
          
          const ambianceTag = tags.find(t => {
            const lower = t.toLowerCase();
            return lower.includes("dynamic") || lower.includes("inspiring") || lower.includes("serious") || lower.includes("casual") || lower.includes("positive") || lower.includes("welcoming");
          });
          
          const actionTag = tags.find(t => {
            const lower = t.toLowerCase();
            return lower.includes("pose") || lower.includes("sitting") || lower.includes("standing") || lower.includes("walking") || lower.includes("working");
          });
          
          const mainSubjectTag = tags.find(t => {
            const lower = t.toLowerCase();
            return lower.includes("man") || lower.includes("woman") || lower.includes("person") || lower.includes("portrait") || lower.includes("selfie");
          });
          
          context = {
            location: location,
            formality: formality,
            hasFace: hasFace,
            ambiance: ambianceTag || "neutral",
            action: actionTag || "standing",
            mainSubject: mainSubjectTag || "person"
          };
          
          console.log(`✅ Tags generated for image ${imageId}: ${tags.join(", ")}`);
        } catch (parseErr) {
          console.error(`Error parsing tags for image ${imageId}:`, parseErr);
          tags = ["portrait", "professional", "office", "serious", "indoor", "computer", "work", "modern"];
          context = { location: "indoor", formality: "formal", ambiance: "neutral", hasFace: true };
        }
      } catch (err) {
        console.error(`Error analyzing image ${imageId}:`, err);
        console.error(`Error details:`, err.message, err.stack);
        tags = ["portrait", "face"];
        context = { location: "indoor", formality: "formal" };
      }
    } else {
      tags = ["portrait", "professional", "face"];
      context = { location: "indoor", formality: "formal", ambiance: "neutral" };
    }

    // Mettre à jour Firestore avec les tags et le contexte
    try {
      await imageRef.update({
        tags,
        context,
      });
    } catch (firestoreErr) {
      console.error(`Error updating Firestore for image ${imageId}:`, firestoreErr);
      throw new Error(`Failed to update image in database: ${firestoreErr.message}`);
    }

    res.json({
      success: true,
      image: {
        id: imageId,
        tags,
        context,
      },
      message: "Image tagged successfully.",
    });
  } catch (error) {
    console.error("Tag single error:", error);
    console.error("Error stack:", error.stack);
    const errorMessage = error.message || "Error during tagging.";
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// ---------------------- FONCTION HELPER: Vérifier si un post existe sur LinkedIn ----------------------
/**
 * Vérifie si un post existe réellement sur le profil LinkedIn de l'utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} postText - Texte du post à vérifier
 * @returns {Promise<{exists: boolean, linkedinPostUrl: string|null, linkedinPostImageUrl: string|null}>}
 */
const checkPostExistsOnLinkedIn = async (userEmail, postText) => {
  try {
    // 1. Récupérer le profil LinkedIn de l'utilisateur depuis les images stockées
    // Chercher d'abord dans les images avec source="linkedin"
    let imagesSnapshot = await db.collection("images")
      .where("email", "==", userEmail)
      .where("source", "==", "linkedin")
      .limit(1)
      .get();
    
    let linkedinProfile = null;
    
    // Si trouvé dans les images LinkedIn
    if (!imagesSnapshot.empty) {
      const firstImage = imagesSnapshot.docs[0].data();
      linkedinProfile = firstImage.labData?.linkedin || firstImage.linkedinProfile || null;
    }
    
    // Si pas trouvé, chercher dans toutes les images de l'utilisateur (peut être dans labData)
    if (!linkedinProfile) {
      imagesSnapshot = await db.collection("images")
        .where("email", "==", userEmail)
        .limit(10)
        .get();
      
      for (const doc of imagesSnapshot.docs) {
        const data = doc.data();
        if (data.labData && data.labData.linkedin) {
          linkedinProfile = data.labData.linkedin;
          console.log(`✅ Profil LinkedIn trouvé dans labData: ${linkedinProfile}`);
          break;
        }
      }
    }
    
    // Si toujours pas trouvé, le post n'existe pas
    if (!linkedinProfile) {
      console.log(`⚠️ Aucun profil LinkedIn trouvé pour l'utilisateur ${userEmail}`);
      return { exists: false, linkedinPostUrl: null, linkedinPostImageUrl: null };
    }
    
    console.log(`🔍 Vérification du post sur le profil LinkedIn: ${linkedinProfile}`);
    
    // 2. Préparer l'URL LinkedIn
    let linkedinUrl = linkedinProfile;
    if (!linkedinUrl.startsWith("http")) {
      if (linkedinUrl.startsWith("/")) {
        linkedinUrl = `https://www.linkedin.com${linkedinUrl}`;
      } else {
        linkedinUrl = `https://www.linkedin.com/in/${linkedinUrl}/`;
      }
    }
    
    // 3. Appeler l'API LinkedIn pour récupérer les posts
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      console.log(`⚠️ RAPIDAPI_KEY non configurée, impossible de vérifier les posts LinkedIn`);
      return { exists: false, linkedinPostUrl: null, linkedinPostImageUrl: null };
    }
    
    const apiHost = "web-scraping-api2.p.rapidapi.com";
    const apiUrl = `https://${apiHost}/get-profile-posts?linkedin_url=${encodeURIComponent(linkedinUrl)}&type=posts`;
    
    console.log(`🔍 Vérification de l'existence du post sur LinkedIn: ${apiUrl}`);
    
    const apiRes = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
        "Content-Type": "application/json",
      },
    });
    
    if (!apiRes.ok) {
      console.log(`⚠️ Erreur API LinkedIn (${apiRes.status}), impossible de vérifier les posts`);
      return { exists: false, linkedinPostUrl: null, linkedinPostImageUrl: null };
    }
    
    const apiData = await apiRes.json();
    
    if (!apiData || !apiData.data || !Array.isArray(apiData.data)) {
      console.log(`⚠️ Format de réponse API inattendu`);
      return { exists: false, linkedinPostUrl: null, linkedinPostImageUrl: null };
    }
    
    // 4. Normaliser le texte du post pour la comparaison
    const normalizeText = (text) => {
      return text.trim()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\n+/g, " ")
        .toLowerCase();
    };
    
    const normalizedPostText = normalizeText(postText);
    
    // 5. Comparer avec chaque post récupéré
    console.log(`📊 ${apiData.data.length} post(s) récupéré(s) de LinkedIn, comparaison en cours...`);
    
    for (let i = 0; i < apiData.data.length; i++) {
      const post = apiData.data[i];
      if (!post.text) {
        console.log(`   Post ${i + 1}: Pas de texte, ignoré`);
        continue;
      }
      
      const normalizedPostTextFromLinkedIn = normalizeText(post.text);
      
      // 🆕 MÉTHODE AMÉLIORÉE : Comparaison complète du contenu avec plusieurs métriques
      // 1. Comparaison de similarité de Jaccard améliorée (tous les mots significatifs)
      const stopWords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its", "may", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say", "she", "too", "use", "le", "de", "et", "pour", "avec", "sans", "dans", "sur", "par", "une", "des", "les", "est", "son", "ses", "ces", "cet", "cette"]);
      
      // Extraire TOUS les mots significatifs (pas seulement les 20 premiers)
      const getAllSignificantWords = (text) => {
        return text.split(" ")
          .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
          .map(w => w.toLowerCase());
      };
      
      const postWords = getAllSignificantWords(normalizedPostText);
      const linkedInPostWords = getAllSignificantWords(normalizedPostTextFromLinkedIn);
      
      // Calculer la similarité de Jaccard améliorée
      let jaccardSimilarity = 0;
      let commonWordsCount = 0;
      
      if (postWords.length > 0 && linkedInPostWords.length > 0) {
        const postWordsSet = new Set(postWords);
        const linkedInPostWordsSet = new Set(linkedInPostWords);
        
        // Intersection (mots en commun)
        const intersection = new Set([...postWordsSet].filter(w => linkedInPostWordsSet.has(w)));
        commonWordsCount = intersection.size;
        
        // Union (tous les mots uniques)
        const union = new Set([...postWordsSet, ...linkedInPostWordsSet]);
        
        // Similarité de Jaccard = intersection / union
        jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
      }
      
      // 2. Comparaison de la longueur relative (les posts similaires ont des longueurs similaires)
      const lengthRatio = Math.min(normalizedPostText.length, normalizedPostTextFromLinkedIn.length) / 
                          Math.max(normalizedPostText.length, normalizedPostTextFromLinkedIn.length);
      
      // 3. Comparaison de séquences (n-grams de 3 caractères pour capturer les phrases similaires)
      const getNGrams = (text, n = 3) => {
        const ngrams = new Set();
        for (let i = 0; i <= text.length - n; i++) {
          ngrams.add(text.substring(i, i + n));
        }
        return ngrams;
      };
      
      const postNGrams = getNGrams(normalizedPostText);
      const linkedInNGrams = getNGrams(normalizedPostTextFromLinkedIn);
      const commonNGrams = new Set([...postNGrams].filter(n => linkedInNGrams.has(n)));
      const ngramSimilarity = postNGrams.size > 0 && linkedInNGrams.size > 0 
        ? commonNGrams.size / Math.max(postNGrams.size, linkedInNGrams.size)
        : 0;
      
      // 4. Comparaison du début du texte (premiers 100 caractères doivent être très similaires)
      const postStart = normalizedPostText.substring(0, 100);
      const linkedInPostStart = normalizedPostTextFromLinkedIn.substring(0, 100);
      const startSimilarity = postStart.length > 0 && linkedInPostStart.length > 0
        ? (postStart === linkedInPostStart ? 1.0 : 
           (postStart.includes(linkedInPostStart.substring(0, 50)) || 
            linkedInPostStart.includes(postStart.substring(0, 50)) ? 0.7 : 0))
        : 0;
      
      // 5. Score de similarité global (moyenne pondérée)
      // Jaccard: 40%, N-grams: 30%, Longueur: 10%, Début: 20%
      const globalSimilarity = (
        jaccardSimilarity * 0.4 +
        ngramSimilarity * 0.3 +
        lengthRatio * 0.1 +
        startSimilarity * 0.2
      );
      
      // 6. Seuil strict : au moins 60% de similarité globale ET au moins 50% des mots significatifs en commun
      const minWordsRatio = Math.min(postWords.length, linkedInPostWords.length);
      const wordsMatchRatio = minWordsRatio > 0 ? commonWordsCount / minWordsRatio : 0;
      
      console.log(`   Post ${i + 1}: Similarité globale: ${(globalSimilarity * 100).toFixed(1)}%`);
      console.log(`      - Jaccard: ${(jaccardSimilarity * 100).toFixed(1)}% (${commonWordsCount} mots en commun sur ${Math.min(postWords.length, linkedInPostWords.length)} min)`);
      console.log(`      - N-grams: ${(ngramSimilarity * 100).toFixed(1)}%`);
      console.log(`      - Longueur: ${(lengthRatio * 100).toFixed(1)}%`);
      console.log(`      - Début: ${(startSimilarity * 100).toFixed(1)}%`);
      console.log(`      - Ratio mots: ${(wordsMatchRatio * 100).toFixed(1)}%`);
      
      // Seuil strict : similarité globale >= 0.6 ET au moins 50% des mots en commun
      const isMatch = globalSimilarity >= 0.6 && wordsMatchRatio >= 0.5 && commonWordsCount >= 5;
      
      if (isMatch) {
        console.log(`✅ Post trouvé sur LinkedIn! Similarité globale: ${(globalSimilarity * 100).toFixed(1)}%, ${commonWordsCount} mots en commun`);
        console.log(`   Mots en commun: ${Array.from(new Set(postWords.filter(w => linkedInPostWords.includes(w)))).slice(0, 10).join(", ")}`);
        
        // Récupérer l'image du post si disponible
        let linkedinPostImageUrl = null;
        if (post.images && Array.isArray(post.images) && post.images.length > 0) {
          const firstImage = post.images[0];
          if (typeof firstImage === "string") {
            linkedinPostImageUrl = firstImage;
          } else if (firstImage && typeof firstImage === "object") {
            linkedinPostImageUrl = firstImage.url || firstImage.src || firstImage.image || firstImage.mediaUrl;
          }
          console.log(`   Image du post trouvée: ${linkedinPostImageUrl ? "✅ Oui" : "❌ Non"}`);
        }
        
        return {
          exists: true,
          linkedinPostUrl: post.post_url || post.urn || null,
          linkedinPostImageUrl: linkedinPostImageUrl,
        };
      }
      
      // Fallback strict : seulement si le début du texte correspond exactement (premiers 80 caractères)
      if (normalizedPostText.length > 80 && normalizedPostTextFromLinkedIn.length > 80) {
        const postStartExact = normalizedPostText.substring(0, 80);
        const linkedInPostStartExact = normalizedPostTextFromLinkedIn.substring(0, 80);
        
        if (postStartExact === linkedInPostStartExact) {
          console.log(`✅ Post trouvé sur LinkedIn (début de texte identique)`);
          
          let linkedinPostImageUrl = null;
          if (post.images && Array.isArray(post.images) && post.images.length > 0) {
            const firstImage = post.images[0];
            if (typeof firstImage === "string") {
              linkedinPostImageUrl = firstImage;
            } else if (firstImage && typeof firstImage === "object") {
              linkedinPostImageUrl = firstImage.url || firstImage.src || firstImage.image || firstImage.mediaUrl;
            }
          }
          
          return {
            exists: true,
            linkedinPostUrl: post.post_url || post.urn || null,
            linkedinPostImageUrl: linkedinPostImageUrl,
          };
        }
      }
    }
    
    console.log(`ℹ️ Post non trouvé sur LinkedIn après comparaison de ${apiData.data.length} post(s)`);
    return { exists: false, linkedinPostUrl: null, linkedinPostImageUrl: null };
  } catch (error) {
    console.error("Erreur lors de la vérification du post LinkedIn:", error);
    return { exists: false, linkedinPostUrl: null, linkedinPostImageUrl: null };
  }
};

// ---------------------- LAB MODE: POST ANALYZE (Analyse du post) ----------------------
app.post("/post/analyze", async (req, res) => {
  try {
    const { email, postText } = req.body;

    if (!postText || typeof postText !== "string") {
      return res.status(400).json({ success: false, message: "Texte du post requis." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, message: "OPENAI_API_KEY non configurée." });
    }

    // ÉTAPE 1 : Vérifier si le post existe réellement sur LinkedIn
    const userEmail = email || "anonymous";
    const postCheckResult = await checkPostExistsOnLinkedIn(userEmail, postText);
    console.log(`📋 Vérification post LinkedIn: ${postCheckResult.exists ? "✅ Existe" : "❌ N'existe pas"}`);

    // ÉTAPE 2 : Analyser le post avec OpenAI
    let analysis = {};
    try {
    const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `You are an expert in LinkedIn content analysis and image selection.

Analyze the post text in DETAIL and determine:

1. MAIN THEME (the primary theme of the post)
   - Examples: "entrepreneurship", "training", "event", "testimonial", "advice", "innovation", "motivation", "technical", "storytelling", etc.

2. TONE (the emotional tone and style)
   - Examples: "inspiring", "educational", "motivational", "formal", "casual", "enthusiastic", "reflective", "serious", "dynamic", etc.

3. CONTEXT (the setting or environment) - ENRICHIR avec mots-clés, rôle, type d'événement
   - Format enrichi : "[type d'événement] - [rôle/position] - [mots-clés] - [setting]"
   - Examples enrichis : 
     * "workshop - formateur - collaboration, formation - salle de réunion moderne"
     * "conference - speaker - présentation, innovation - scène avec écran"
     * "meeting - manager - équipe, stratégie - bureau collaboratif"
     * "user test - UX designer - produit, interaction - espace de test"
     * "atelier - animateur - créativité, brainstorming - espace collaboratif"
   - Inclure : type d'événement (workshop, conference, meeting, etc.), rôle (formateur, speaker, manager, etc.), mots-clés pertinents, setting détaillé

4. RELEVANT VISUAL TYPE (the type of image that would be most appropriate)
   Based on the post type, determine the visual type:
   - Motivational post → "outdoor portrait" or "dynamic scene"
   - Technical post → "computer image", "office", "screen"
   - Storytelling post → "natural selfie" or "authentic setting"
   - Professional post → "portrait", "office setting", "business scene"
   - Event post → "scene", "presentation", "networking"
   - Product post → "product", "showcase", "display"
   
   Provide specific visual type recommendations based on the actual post content.

5. DESIRED IMAGE TAGS (5-10 specific tags in ENGLISH)
   - Based on the actual post content
   - Tags should match the visual type determined above
   - Examples for motivational: "portrait", "outdoor", "dynamic", "inspiring", "natural light"
   - Examples for technical: "computer", "office", "screen", "work", "professional"
   - Examples for storytelling: "selfie", "natural", "authentic", "casual", "personal"
   - Each post should have DIFFERENT tags based on its content

IMPORTANT: Analyze the ACTUAL content of the post, not default values. Each post is unique.

Respond ONLY in valid JSON:
{
  "themes": ["theme1", "theme2", ...],
  "tone": "precise tone",
  "context": "precise context description",
  "visualType": "recommended visual type",
  "desiredTags": ["tag1", "tag2", ...]
}`,
          },
          {
            role: "user",
                content: `Analyse ce post LinkedIn en détail:\n\n"""${postText}"""\n\nFournis une analyse précise basée sur le contenu réel du post.`,
          },
        ],
            temperature: 0.7,
            max_tokens: 500,
      }),
    });

    const analysisData = await analysisRes.json();
    const analysisText = analysisData?.choices?.[0]?.message?.content || "";

      // Extraire le JSON même s'il y a du texte autour
      let jsonText = analysisText.trim();
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      analysis = JSON.parse(jsonText);
      
      // Valider et nettoyer les données
      if (!Array.isArray(analysis.themes)) {
        analysis.themes = ["professional", "content"];
      }
      if (!analysis.tone || analysis.tone === "neutral") {
        // Essayer de déterminer la tonalité depuis le texte
        const lowerText = postText.toLowerCase();
        if (lowerText.includes("🔥") || lowerText.includes("excit") || lowerText.includes("fantast")) {
          analysis.tone = "enthusiastic";
        } else if (lowerText.includes("merci") || lowerText.includes("remerci") || lowerText.includes("thank")) {
          analysis.tone = "grateful";
        } else if (lowerText.includes("conseil") || lowerText.includes("astuce") || lowerText.includes("tip") || lowerText.includes("advice")) {
          analysis.tone = "educational";
        } else if (lowerText.includes("motiv") || lowerText.includes("inspir")) {
          analysis.tone = "motivational";
        } else {
          analysis.tone = "professional";
        }
      }
      if (!analysis.context) {
        analysis.context = "office";
      }
      if (!analysis.visualType) {
        // Déterminer le type de visuel basé sur le thème et la tonalité
        const lowerText = postText.toLowerCase();
        if (lowerText.includes("motiv") || lowerText.includes("inspir") || analysis.tone === "motivational") {
          analysis.visualType = "outdoor portrait or dynamic scene";
        } else if (lowerText.includes("tech") || lowerText.includes("code") || lowerText.includes("computer") || lowerText.includes("software")) {
          analysis.visualType = "computer image, office, screen";
        } else if (lowerText.includes("story") || lowerText.includes("personal") || lowerText.includes("experience")) {
          analysis.visualType = "natural selfie or authentic setting";
        } else {
          analysis.visualType = "portrait or professional scene";
        }
      }
      if (!Array.isArray(analysis.desiredTags) || analysis.desiredTags.length === 0) {
        // Générer des tags par défaut basés sur les thèmes
        analysis.desiredTags = analysis.themes || ["professional"];
      }
    } catch (parseErr) {
      console.error("Erreur parsing JSON analyse post:", parseErr);
      console.log(`Texte reçu: ${analysisText.substring(0, 300)}...`);
      // Fallback : analyse basique
      const lowerText = postText.toLowerCase();
      const themes = [];
      if (lowerText.includes("événement") || lowerText.includes("event")) themes.push("event");
      if (lowerText.includes("formation") || lowerText.includes("atelier") || lowerText.includes("training")) themes.push("training");
      if (lowerText.includes("conseil") || lowerText.includes("astuce") || lowerText.includes("advice") || lowerText.includes("tip")) themes.push("advice");
      if (lowerText.includes("témoignage") || lowerText.includes("avis") || lowerText.includes("testimonial") || lowerText.includes("review")) themes.push("testimonial");
      if (themes.length === 0) themes.push("professional");
      
      analysis = {
        themes: themes,
        tone: lowerText.includes("🔥") ? "enthusiastic" : "professional",
        context: lowerText.includes("événement") || lowerText.includes("event") ? "event" : "office",
        visualType: lowerText.includes("motiv") || lowerText.includes("inspir") ? "outdoor portrait or dynamic scene" : "portrait or professional scene",
        desiredTags: ["portrait", "professional", "office"],
      };
    }

    // Sauvegarder l'analyse dans Firestore avec les informations sur l'existence du post LinkedIn
    await db.collection("posts_analysis").add({
      email: userEmail,
      postText,
      themes: analysis.themes || [],
      tone: analysis.tone || "neutral",
      desiredTags: analysis.desiredTags || [],
      context: analysis.context || "",
      visualType: analysis.visualType || "",
      // Informations sur l'existence du post sur LinkedIn
      postExistsOnLinkedIn: postCheckResult.exists,
      linkedinPostUrl: postCheckResult.linkedinPostUrl,
      linkedinPostImageUrl: postCheckResult.linkedinPostImageUrl,
      created_at: new Date(),
    });

    res.json({
      success: true,
      analysis: {
        themes: analysis.themes || [],
        tone: analysis.tone || "neutral",
        desiredTags: analysis.desiredTags || [],
        context: analysis.context || "",
        visualType: analysis.visualType || "",
      },
        postExistsOnLinkedIn: postCheckResult.exists,
        linkedinPostUrl: postCheckResult.linkedinPostUrl,
        linkedinPostImageUrl: postCheckResult.linkedinPostImageUrl,
    });
  } catch (error) {
    console.error("Post analyze error:", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'analyse du post." });
  }
});

// ---------------------- FONCTION DE NORMALISATION AMÉLIORÉE AVEC SYNONYMES ----------------------
/**
 * Normalise un tag en enlevant accents, pluriels, et appliquant des synonymes
 * @param {string} tag - Le tag à normaliser
 * @returns {string[]} - Tableau de variantes normalisées du tag (incluant synonymes)
 */
const normalizeTagWithSynonyms = (tag) => {
  if (!tag || typeof tag !== "string") return [];
  
  // Normalisation de base
  let normalized = tag.toLowerCase().trim();
  
  // Enlever accents et caractères spéciaux
  normalized = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlever accents
    .replace(/[^\w\s]/g, " ") // Remplacer caractères spéciaux par espaces
    .replace(/\s+/g, " ") // Normaliser espaces
    .trim();
  
  // Dictionnaire de synonymes (français -> anglais et variations)
  const synonymMap = {
    // Événements / Activités
    "atelier": ["workshop", "training", "seminar", "session"],
    "workshop": ["atelier", "training", "seminar"],
    "formation": ["training", "workshop", "course"],
    "training": ["formation", "workshop", "course"],
    "seminaire": ["seminar", "workshop", "conference"],
    "seminar": ["seminaire", "workshop"],
    "conference": ["conference", "meeting", "event"],
    "evenement": ["event", "occasion", "gathering"],
    "event": ["evenement", "occasion"],
    "live": ["live", "streaming", "broadcast", "webinar"],
    "webinar": ["webinar", "online", "virtual"],
    
    // Lieux / Contextes
    "bureau": ["office", "workspace", "desk"],
    "office": ["bureau", "workspace"],
    "workspace": ["workspace", "office", "bureau"],
    "cantine": ["cafeteria", "dining", "restaurant"],
    "restaurant": ["restaurant", "dining", "cafeteria"],
    "station": ["station", "venue", "location"],
    "lieu": ["location", "place", "venue"],
    "location": ["lieu", "place"],
    
    // Personnes / Rôles
    "entrepreneur": ["entrepreneur", "founder", "business owner"],
    "founder": ["founder", "entrepreneur", "creator"],
    "createur": ["creator", "founder", "maker"],
    "creator": ["createur", "founder"],
    "etudiant": ["student", "learner"],
    "student": ["etudiant", "learner"],
    "participant": ["participant", "attendee", "member"],
    "attendee": ["participant", "member"],
    
    // Actions / Activités professionnelles
    "presentation": ["presentation", "pitch", "demo"],
    "presenter": ["present", "show", "demonstrate"],
    "animer": ["animate", "host", "facilitate", "lead"],
    "host": ["animer", "facilitate", "lead"],
    "facilitate": ["animer", "host", "lead"],
    "intervenir": ["intervene", "speak", "present"],
    "partager": ["share", "present", "show"],
    "share": ["partager", "present"],
    "lancer": ["launch", "start", "begin"],
    "launch": ["lancer", "start"],
    
    // Concepts professionnels
    "linkedin": ["linkedin", "professional network", "social media"],
    "reseau": ["network", "community"],
    "network": ["reseau", "community"],
    "strategie": ["strategy", "approach", "plan"],
    "strategy": ["strategie", "approach"],
    "contenu": ["content", "material", "post"],
    "content": ["contenu", "material"],
    "post": ["post", "publication", "article"],
    "publication": ["publication", "post", "article"],
    
    // Émotions / Tonalités
    "inspirant": ["inspiring", "motivational", "uplifting"],
    "inspiring": ["inspirant", "motivational"],
    "motivant": ["motivating", "inspiring", "energizing"],
    "motivating": ["motivant", "inspiring"],
    "energique": ["energetic", "dynamic", "vibrant"],
    "energetic": ["energique", "dynamic"],
    "dynamique": ["dynamic", "energetic", "active"],
    "dynamic": ["dynamique", "energetic"],
    
    // Types de visuels
    "portrait": ["portrait", "photo", "picture"],
    "selfie": ["selfie", "self portrait"],
    "photo": ["photo", "portrait", "image"],
    "image": ["image", "photo", "picture"],
    "visuel": ["visual", "image", "graphic"],
    "visual": ["visuel", "image"],
    
    // Styles / Ambiances
    "professionnel": ["professional", "business", "corporate"],
    "professional": ["professionnel", "business"],
    "corporate": ["corporate", "business", "professional"],
    "business": ["business", "corporate", "professional"],
    "moderne": ["modern", "contemporary", "current"],
    "modern": ["moderne", "contemporary"],
    "casual": ["casual", "informal", "relaxed"],
    "informel": ["informal", "casual"],
    "formel": ["formal", "official", "serious"],
    "formal": ["formel", "official"],
    
    // Lieux spécifiques
    "interieur": ["indoor", "inside", "interior"],
    "indoor": ["interieur", "inside"],
    "exterieur": ["outdoor", "outside", "exterior"],
    "outdoor": ["exterieur", "outside"],
    "rue": ["street", "road", "outdoor"],
    "street": ["rue", "road"],
    "transport": ["transport", "transportation", "travel"],
    "transportation": ["transport", "travel"],
    
    // Objets / Éléments
    "ordinateur": ["computer", "laptop", "pc"],
    "computer": ["ordinateur", "laptop"],
    "laptop": ["laptop", "computer"],
    "ecran": ["screen", "display", "monitor"],
    "screen": ["ecran", "display"],
    "telephone": ["phone", "mobile", "smartphone"],
    "phone": ["telephone", "mobile"],
    "cafe": ["coffee", "cafe", "beverage"],
    "coffee": ["cafe", "beverage"],
  };
  
  // Générer toutes les variantes (original + synonymes)
  const variants = [normalized];
  
  // Chercher des synonymes pour le tag complet
  if (synonymMap[normalized]) {
    variants.push(...synonymMap[normalized]);
  }
  
  // Chercher des synonymes pour chaque mot si le tag est composé
  const words = normalized.split(" ");
  if (words.length > 1) {
    words.forEach(word => {
      if (synonymMap[word]) {
        synonymMap[word].forEach(syn => {
          // Créer une variante avec le synonyme remplacé
          const variant = normalized.replace(word, syn);
          if (!variants.includes(variant)) {
            variants.push(variant);
          }
        });
      }
    });
  }
  
  // Enlever les pluriels simples (s, es, ies)
  const singularVariants = variants.map(v => {
    if (v.endsWith("ies")) return v.slice(0, -3) + "y";
    if (v.endsWith("es")) return v.slice(0, -2);
    if (v.endsWith("s") && v.length > 3) return v.slice(0, -1);
    return v;
  });
  
  variants.push(...singularVariants);
  
  // Retourner un tableau unique de variantes
  return [...new Set(variants.filter(v => v.length > 0))];
};

/**
 * Vérifie si deux tags correspondent (exact, partiel, ou via synonymes)
 * @param {string} tag1 - Premier tag
 * @param {string} tag2 - Deuxième tag
 * @returns {object} - {match: boolean, type: 'exact'|'partial'|'synonym'|null, score: number}
 */
const checkTagMatch = (tag1, tag2) => {
  const variants1 = normalizeTagWithSynonyms(tag1);
  const variants2 = normalizeTagWithSynonyms(tag2);
  
  // Correspondance exacte
  if (variants1.some(v1 => variants2.includes(v1))) {
    return { match: true, type: "exact", score: 2 };
  }
  
  // Correspondance partielle (un tag contient l'autre)
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (v1.length > 2 && v2.length > 2) {
        if (v1.includes(v2) || v2.includes(v1)) {
          return { match: true, type: "partial", score: 1 };
        }
        // Correspondance de mots dans des tags composés
        if (v1.includes(" ") || v2.includes(" ")) {
          const words1 = v1.split(" ").filter(w => w.length > 2);
          const words2 = v2.split(" ").filter(w => w.length > 2);
          const commonWords = words1.filter(w1 => words2.some(w2 => w1.includes(w2) || w2.includes(w1)));
          if (commonWords.length > 0) {
            return { match: true, type: "partial", score: 1 };
          }
        }
      }
    }
  }
  
  return { match: false, type: null, score: 0 };
};

// ---------------------- LAB MODE: SELECT (Sélection image pertinente) ----------------------
app.post("/select", async (req, res) => {
  try {
    const { email, postText, postId } = req.body;

    if (!postText || typeof postText !== "string") {
      return res.status(400).json({ success: false, message: "Texte du post requis." });
    }

    const userEmail = email || "anonymous";
    const finalPostText = postText.trim();

    // 1. Récupérer l'analyse du post (intent et post_tags) si disponible
    let postAnalysis = null;
    if (postId) {
      try {
        const analysisDoc = await db.collection("posts_analysis").doc(postId).get();
        if (analysisDoc.exists) {
          postAnalysis = analysisDoc.data();
        }
      } catch (err) {
        console.log("⚠️ Impossible de récupérer l'analyse du post:", err);
      }
    } else {
      // Chercher l'analyse la plus récente pour ce post
      try {
        const analysisSnapshot = await db.collection("posts_analysis")
          .where("email", "==", userEmail)
          .orderBy("created_at", "desc")
          .limit(5)
          .get();
        
        // Trouver la meilleure correspondance par similarité de texte
    const calculateTextSimilarity = (text1, text2) => {
      if (!text1 || !text2) return 0;
      const normalizeText = (text) => {
        return text.trim()
          .replace(/[^\w\s]/g, " ")
          .replace(/\s+/g, " ")
          .replace(/\n+/g, " ")
          .toLowerCase();
      };
      const normalized1 = normalizeText(text1);
      const normalized2 = normalizeText(text2);
      if (normalized1 === normalized2) return 1.0;
      const stopWords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its", "may", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say", "she", "too", "use", "le", "de", "et", "pour", "avec", "sans", "dans", "sur", "par", "une", "des", "les", "est", "son", "ses", "ces", "cet", "cette"]);
      const getWords = (text) => {
        return text.split(" ")
          .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
          .map(w => w.toLowerCase());
      };
      const words1 = getWords(normalized1);
      const words2 = getWords(normalized2);
      if (words1.length === 0 || words2.length === 0) return 0;
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      const intersection = new Set([...set1].filter(w => set2.has(w)));
      const union = new Set([...set1, ...set2]);
      const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
      const lengthRatio = Math.min(normalized1.length, normalized2.length) / 
                          Math.max(normalized1.length, normalized2.length);
      const start1 = normalized1.substring(0, 100);
      const start2 = normalized2.substring(0, 100);
      const startSimilarity = start1.length > 0 && start2.length > 0
        ? (start1 === start2 ? 1.0 : 
           (start1.includes(start2.substring(0, 50)) || 
            start2.includes(start1.substring(0, 50)) ? 0.7 : 0))
        : 0;
      return jaccardSimilarity * 0.5 + lengthRatio * 0.2 + startSimilarity * 0.3;
    };
    
        let bestMatch = null;
        let bestSimilarity = 0;
        analysisSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.postText) {
            const similarity = calculateTextSimilarity(finalPostText, data.postText);
            // Augmenter le seuil à 0.95 pour éviter de réutiliser des analyses de posts différents
            if (similarity >= 0.95 && similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestMatch = data;
            }
          }
        });
        
        if (bestMatch) {
          postAnalysis = bestMatch;
          console.log(`✅ Analyse trouvée (similarité: ${(bestSimilarity * 100).toFixed(1)}%)`);
          console.log(`📋 Desired Tags: ${postAnalysis.desiredTags?.join(", ") || "N/A"}`);
          console.log(`📍 Context: ${postAnalysis.context || "N/A"}`);
          console.log(`🎨 Visual Type: ${postAnalysis.visualType || "N/A"}`);
        } else {
          console.log(`🔄 Aucune analyse similaire trouvée (seuil: 95%), nouvelle analyse nécessaire`);
      }
    } catch (err) {
        console.log("⚠️ Impossible de récupérer l'analyse du post:", err);
      }
    }

    // Si pas d'analyse trouvée, analyser le post maintenant en appelant directement la fonction d'analyse
    if (!postAnalysis || !postAnalysis.intent || !postAnalysis.post_tags) {
      // Utiliser directement le LLM pour analyser le post (même logique que /post/analyze)
        try {
          const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              messages: [
                {
                  role: "system",
                content: `Tu es un expert en analyse de contenu LinkedIn pour la sélection d'images.

Ton objectif : comprendre l'intention principale du post et dériver des "post_tags" simples et réutilisables.

Analyse le texte du post et détermine :

1. INTENT (une seule intention principale parmi cette liste) :
   - "story" : récit personnel, témoignage, histoire vécue
   - "product" : présentation produit, feature, fonctionnalité
   - "event" : événement, conférence, meetup, lancement
   - "howto" : tutoriel, conseil pratique, guide
   - "culture" : valeurs d'entreprise, culture d'équipe, ambiance
   - "hiring" : recrutement, recherche de talents, offres d'emploi
   - "case_study" : étude de cas, retour client, succès client
   - "insight" : analyse, données, statistiques, réflexion
   - "announcement" : annonce, nouveauté, communication officielle
   - "other" : autre type de contenu

2. POST_TAGS (tableau de tags simples en minuscules, underscore si besoin) :
   - Mots-clés principaux du post (3-8 tags max)
   - Format : minuscules, underscore pour les mots composés
   - Exemples : "tech", "innovation", "team_meeting", "product_launch", "customer_success"
   - Ces tags seront utilisés pour matcher avec les tags d'images

3. TONE (optionnel, pour contexte) : ton du post (ex: "corporate", "casual", "inspiring", "expert")

Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "intent": "story|product|event|howto|culture|hiring|case_study|insight|announcement|other",
  "post_tags": ["tag1", "tag2", ...],
  "tone": "ton du post",
  "notes": "notes optionnelles pour contexte"
}`,
                },
                {
                  role: "user",
                content: `Analyse ce post LinkedIn:\n\n"""${finalPostText}"""\n\nDétermine l'intention principale (intent) et génère les post_tags pertinents.`,
                },
              ],
            temperature: 0.7,
            max_tokens: 400,
            }),
          });

          const analysisData = await analysisRes.json();
        const analysisText = analysisData?.choices?.[0]?.message?.content || "";
        
          try {
          let jsonText = analysisText.trim();
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              jsonText = jsonMatch[0];
            }
          const parsed = JSON.parse(jsonText);
          postAnalysis = {
            intent: parsed.intent || "other",
            post_tags: Array.isArray(parsed.post_tags) ? parsed.post_tags : ["professional"],
            tone: parsed.tone || "professional",
            notes: parsed.notes || "",
            postText: finalPostText,
          };
        } catch (parseErr) {
          console.error("⚠️ Erreur parsing analyse:", parseErr);
          }
        } catch (err) {
        console.error("⚠️ Erreur lors de l'analyse du post:", err);
      }
    }

    // Fallback si toujours pas d'analyse
    if (!postAnalysis || !postAnalysis.intent || !postAnalysis.post_tags) {
      postAnalysis = {
        intent: "other",
        post_tags: ["professional"],
        tone: "professional",
        postText: finalPostText,
      };
    }

    // 2. Récupérer jusqu'à 100 images candidates avec format compact
    const imagesSnapshot = await db.collection("images")
        .where("email", "==", userEmail)
      .limit(100)
        .get();
      
    const imagesCompact = [];
    imagesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.url) {
        // Valider et normaliser le schéma compact
        const schemaValidation = validateCompactSchema({
          id: doc.id,
          url: data.url,
          t: data.t || data.tags || [],
          p: data.p ?? (data.context?.p ?? 1),
          s: data.s || (data.context?.s || "photo"),
          x: data.x || (data.context?.x || []),
          d: data.d || data.context?.d || "Image visuelle professionnelle."
        });
        
        if (schemaValidation.valid) {
          imagesCompact.push({
            id: schemaValidation.normalized.id,
            u: schemaValidation.normalized.url,
            d: schemaValidation.normalized.d || "Image visuelle professionnelle.",
            t: schemaValidation.normalized.t,
            p: schemaValidation.normalized.p,
            s: schemaValidation.normalized.s,
            x: schemaValidation.normalized.x,
            // Métadonnées supplémentaires pour la sélection
            source: data.source || "unknown",
            created_at: data.created_at,
            relevance_score: data.relevance_score || 0
          });
        } else {
          console.warn(`⚠️ Image ${doc.id} avec schéma invalide, utilisation des valeurs normalisées:`, schemaValidation.errors);
          imagesCompact.push({
            id: schemaValidation.normalized.id,
            u: schemaValidation.normalized.url,
            t: schemaValidation.normalized.t,
            p: schemaValidation.normalized.p,
            s: schemaValidation.normalized.s,
            x: schemaValidation.normalized.x,
            source: data.source || "unknown",
            created_at: data.created_at,
            relevance_score: data.relevance_score || 0
          });
        }
      }
    });

    if (imagesCompact.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Aucune image trouvée dans Firestore. Veuillez d'abord récupérer des visuels." 
      });
    }

    console.log(`📊 ${imagesCompact.length} images candidates récupérées`);
    console.log(`📝 Texte du post à analyser (${finalPostText.length} caractères): "${finalPostText.substring(0, 150)}${finalPostText.length > 150 ? '...' : ''}"`);

    // Récupérer les Desired Tags et le Context depuis l'analyse (si disponibles)
    const desiredTags = postAnalysis?.desiredTags || postAnalysis?.post_tags || [];
    const contextInfo = postAnalysis?.context || "";
    const visualType = postAnalysis?.visualType || "";
    const tone = postAnalysis?.tone || "neutral";
    const themes = postAnalysis?.themes || postAnalysis?.post_tags || []; // Thèmes clés du post
    
    console.log(`🎯 Desired Tags à matcher: ${desiredTags.join(", ") || "Aucun"}`);
    console.log(`📍 Context enrichi: ${contextInfo || "Non spécifié"}`);
    console.log(`🎨 Visual Type recommandé: ${visualType || "Non spécifié"}`);
    console.log(`🏷️ Thèmes clés du post: ${themes.join(", ") || "Aucun"}`);

    // 3. Construire le payload JSON pour le LLM avec contexte enrichi
    const llmPayload = {
      post: finalPostText, // Texte complet du post (OBLIGATOIRE pour une sélection pertinente)
      desired_tags: desiredTags, // Tags désirés depuis l'analyse du post
      themes: themes, // Thèmes clés du post (pour cohérence thème ↔ image)
      context: contextInfo, // Contexte enrichi (setting, environment, rôle, type d'événement)
      visual_type: visualType, // Type de visuel recommandé
      tone: tone, // Ton du post
      images: imagesCompact,
    };

    // 4. Appeler le LLM avec le prompt système de sélection
    const systemPrompt = `Tu es un moteur de sélection d'images pour illustrer des posts LinkedIn.

Objectif :
- Choisir les 4 images les plus pertinentes parmi une liste (max 100).
- Retourner un score [0.00-1.00] pour chacune, et une justification courte.
- Respecter les contraintes d'exclusion de chaque image.

Méthode obligatoire :
1) ANALYSER LE CONTEXTE SOCIAL DU POST :
   - Si le texte mentionne : événement, atelier, salon, réunion, user test, conférence, meetup, workshop, formation, session collective
     → Contexte SOCIAL/GROUPE détecté → Prioriser images avec p=1 (présence de personnes, groupe, pas de portrait central)
   - Si le texte parle d'une SEULE personne ou cite un individu spécifique (témoignage, portrait cofondateur, histoire personnelle)
     → Contexte INDIVIDUEL détecté → Prioriser images avec p=2 (portrait central, personne seule)
   - Si le texte parle de PLUSIEURS personnes, participants, équipe, collaboration, groupe, team
     → Contexte COLLECTIF détecté → Prioriser images avec p=1 (groupe, équipe, meeting) ⚠️ p=1 pour groupe
   - Règle stricte : Si le post mentionne explicitement plusieurs personnes → p=1 obligatoire pour l'image

2) DÉTERMINER LE THÈME EXACT :
   - "présentation de produit" → Chercher images avec écran, scène de conférence, dashboard, product
   - "user test" → Chercher images de personne(s) testant un produit, interaction utilisateur
   - "atelier" / "workshop" → Chercher images de groupe en formation, collaboration, tableau
   - "témoignage" / "portrait" → Chercher images portrait (p=2), personne seule
   - "réunion" / "meeting" → Chercher images équipe, bureau, collaboration (p>=1)
   - "lancement produit" → Chercher images produit, dashboard, app, objet

3) Comprendre le post : intention principale (un seul label), sujets, mots-clés, ton.
4) DÉDUIRE LES "post_tags" EN INCLUANT TOUS LES THÈMES CLÉS :
   ⚠️ RÈGLE STRICTE : Les post_tags DOIVENT inclure TOUS les thèmes clés du post.
   - Analyser mot par mot les concepts clés du texte
   - Extraire TOUS les termes concrets mentionnés (ex: "atelier" → "workshop", "user test" → "user_testing", "réunion" → "meeting")
   - Inclure les thèmes principaux, les actions, les objets, les contextes mentionnés
   - Ne pas limiter à 3-5 tags : inclure TOUS les thèmes pertinents (5-12 tags recommandés)
   - Format : mots en minuscules, underscore pour les mots composés
   - Exemples basés sur le texte réel :
     * Texte parle d'"atelier formation équipe" → post_tags doit inclure "workshop", "training", "team", "collaboration"
     * Texte parle de "user test produit mobile" → post_tags doit inclure "user_testing", "testing", "product", "mobile_app"
     * Texte parle de "réunion équipe bureau" → post_tags doit inclure "meeting", "team", "office", "collaboration"
     * Texte parle de "portrait cofondateur startup" → post_tags doit inclure "portrait", "founder", "startup", "entrepreneurship"
   - Si le post mentionne plusieurs thèmes, TOUS doivent être dans les post_tags
   
5) ALIGNEMENT COMPLET DES TAGS (t) AVEC LES DESIRED TAGS :
   ⚠️ RÈGLE CRITIQUE : Les tags des images (image.t) DOIVENT correspondre aux Desired Tags fournis.
   - Comparer chaque tag de l'image (image.t) avec les Desired Tags
   - Calculer le pourcentage de correspondance exacte ou sémantique
   - Une image avec 0 correspondance avec les Desired Tags → score très faible (max 0.3)
   - Une image avec correspondance partielle (30-60%) → score moyen (0.4-0.6)
   - Une image avec correspondance forte (60%+) → score élevé (0.7+)
   - Prioriser les images dont les tags (t) correspondent EXACTEMENT aux Desired Tags
   - Les matched_tags dans la réponse doivent être les tags de l'image qui correspondent aux Desired Tags

6) UTILISER LE CONTEXT ENRICHI pour guider la sélection :
   - Le Context fourni décrit le setting/environment idéal (ex: "modern office", "conference stage", "workspace")
   - Vérifier si les tags de l'image correspondent au Context
   - Le Visual Type recommandé doit être pris en compte dans le scoring
   - Exemple : Context = "conference stage" → privilégier images avec tags "event", "conference", "stage", "presentation"

7) Pour chaque image : calculer une pertinence en fonction de :
   a) Recouvrement post_tags <-> image.t (0-0.4)
   b) ALIGNEMENT Desired Tags <-> image.t (0-0.4) ⚠️ CRITIQUE
   c) Correspondance Context/Visual Type (0-0.2)
   d) Bonus/malus selon les règles ci-dessous
   ⚠️ Le matching doit être STRICT : une image avec des tags qui ne correspondent pas aux Desired Tags doit avoir un score faible.
8) Sortir uniquement du JSON conforme au schéma demandé, sans texte hors JSON.

Règles de matching (priorités) :
A) CONTEXTE SOCIAL DÉTECTÉ -> Type d'image REQUIS
- Si contexte SOCIAL/GROUPE (événement, atelier, réunion) :
  → EXCLURE les images avec p=2 (portrait seul)
  → PRIVILÉGIER images avec p=1 (groupe, équipe, scène collective)
  → Tags recherchés : event, conference, workshop, team, meeting, collaboration
  
- Si contexte INDIVIDUEL (une seule personne, témoignage, portrait) :
  → PRIVILÉGIER images avec p=2 (portrait central)
  → EXCLURE les images avec p=0 (pas de personnes)
  → Tags recherchés : person_portrait, portrait, individual, testimonial
  
- Si contexte COLLECTIF (plusieurs participants, équipe, groupe) :
  → PRIVILÉGIER images avec p=1 (groupe, équipe) ⚠️ p=1 obligatoire pour groupe
  → EXCLURE les images avec p=2 seul (portrait individuel isolé)
  → EXCLURE les images avec p=0 (pas de personnes)
  → Tags recherchés : team, meeting, collaboration, group, workshop, event

B) COHÉRENCE THÈME ↔ IMAGE (PRIORITÉ ABSOLUE)
⚠️ ALGORITHME : Prioriser la cohérence thème ↔ image avant tout autre critère.
- Pour chaque image, vérifier si ses tags (t) correspondent aux thèmes clés du post
- Une image dont les tags ne correspondent à AUCUN thème du post → score très faible (max 0.2)
- Une image dont les tags correspondent à PLUSIEURS thèmes du post → score élevé (0.7+)
- Calculer le pourcentage de thèmes couverts par les tags de l'image
- Exemple : Post parle de "workshop formation équipe"
  * Image avec tags ["workshop", "training", "team"] → Score élevé (tous les thèmes couverts)
  * Image avec tags ["workshop", "office"] → Score moyen (1 thème sur 3)
  * Image avec tags ["portrait", "individual"] → Score faible (aucun thème couvert)

C) Intention du post -> type d'image recommandé
- story : privilégier portrait du fondateur/auteur ou photo humaine chaleureuse. (p=2 ou tag person_portrait)
- culture / hiring : privilégier team, meeting, office, people. (tag team/meeting, p=1 pour groupe)
- product / feature / launch : privilégier product, screenshot/dashboard, app, objet produit. (tags product, dashboard, mobile_app)
- event : privilégier scène, conférence, public, badge, stage. (tags event, conference, stage, p=1 pour groupe)
- howto / insight / data : privilégier visuels de travail, dashboard, abstrait pro, illustration simple. (workspace, dashboard, icon/illu)
- case_study / customer : privilégier client, business context, équipe, résultats (team, meeting, chart/dashboard, p=1 pour groupe)

D) Style et ton
- Si ton corporate/expert : préférer m=corporate|premium, éviter playful sauf si post fun.
- Si post émotionnel/story : préférer photo plutôt qu'icônes, éviter trop "stock" abstrait.

E) Exclusions
- Si image.x contient "no_face" : pénaliser fortement si le post requiert portrait/story/human.
- Si image.x contient un interdit pertinent : ne pas sélectionner si ça entre en conflit direct.

F) PRIORISATION SELON LE NOMBRE DE PERSONNES ET LE THÈME
- Si le post parle de plusieurs participants → NE PAS proposer de portrait seul (p=2 isolé)
- Si le post parle d'un individu (témoignage, portrait cofondateur) → PROPOSER portrait central (p=2)
- Si le post parle d'un événement/atelier → PROPOSER scène collective (p=1, tags event/workshop)

G) Diversité
Les 4 images doivent être variées si possible (pas 4 fois "team meeting" quasi identiques).
Si plusieurs images ont score proche, choisir plus divers.

Score (calcul détaillé) - PRIORISER COHÉRENCE THÈME ↔ IMAGE :
- Base 1 : COHÉRENCE THÈME ↔ IMAGE (0-0.5) ⚠️ PRIORITÉ ABSOLUE
  * Calculer le pourcentage de thèmes du post couverts par les tags de l'image (image.t)
  * 0% thèmes couverts → 0.0 (image non pertinente)
  * 30% thèmes couverts → 0.15
  * 60% thèmes couverts → 0.3
  * 80%+ thèmes couverts → 0.4
  * 100% thèmes couverts + tags supplémentaires pertinents → 0.5
- Base 2 : ALIGNEMENT Desired Tags <-> image.t (0-0.3)
  * 0% correspondance → 0.0
  * 30% correspondance → 0.1
  * 60% correspondance → 0.2
  * 80%+ correspondance → 0.3
- Base 3 : correspondance Context/Visual Type (0-0.15)
- Bonus intention-fit (0-0.1)
- Bonus contexte-social-fit (0-0.05) : +0.05 si l'image correspond au contexte social détecté
- Bonus ton/style-fit (0-0.05)
- Malus exclusions (-0.3 à -1.0)
- Malus contexte-social (-0.5) : Si image ne correspond pas au contexte social (ex: p=2 pour événement collectif, p=0 pour groupe)
- Malus cohérence thème (-0.4) : Si moins de 30% des thèmes sont couverts par les tags de l'image
- Malus alignement tags (-0.2) : Si correspondance Desired Tags < 30%
Clamp final entre 0 et 1. Deux décimales.

Schéma JSON de sortie (format compact et lisible) :
{
  "intent": "story|product|event|howto|culture|hiring|case_study|insight|announcement|other",
  "post_tags": ["tag1", "tag2", ...],
  "top4": [
    {
      "id": "img_xxxx",
      "score": 0.00,
      "p": 0|1|2,
      "s": "photo|illu|3d|icon",
      "matched_tags": ["tag1", "tag2"],
      "reasons": ["raison courte 1", "raison courte 2"]
    },
    ...
  ],
  "notes": "contraintes et recommandations courtes"
}

IMPORTANT : 
- Chaque objet dans top4 DOIT inclure "p" (présence personnes) et "s" (style) pour faciliter l'affichage
- Les matched_tags doivent être extraits directement du texte du post (pas inventés)
- Le score doit refléter la correspondance réelle entre le texte et les tags de l'image`;

    let llmResponse = null;
    try {
      const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: OPENAI_MODEL,
                messages: [
                  {
                    role: "system",
              content: systemPrompt,
                  },
                  {
                    role: "user",
              content: `Analyse ce post LinkedIn et sélectionne les 4 images les plus pertinentes :

POST À ANALYSER :
"""
${finalPostText}
"""

THÈMES CLÉS DU POST (pour cohérence thème ↔ image) :
${themes.length > 0 ? JSON.stringify(themes, null, 2) : "Aucun thème spécifié"}

DESIRED TAGS (tags idéaux à matcher avec image.t) :
${desiredTags.length > 0 ? JSON.stringify(desiredTags, null, 2) : "Aucun tag désiré spécifié - utilise les post_tags"}

CONTEXT ENRICHI (setting/environment/rôle/type d'événement) :
${contextInfo || "Non spécifié"}

VISUAL TYPE RECOMMANDÉ :
${visualType || "Non spécifié"}

TON DU POST :
${tone || "neutral"}

IMAGES DISPONIBLES (${imagesCompact.length} images) :
${JSON.stringify(imagesCompact, null, 2)}

IMPORTANT : 
- Analyse le POST fourni ci-dessus (pas un autre post)
- PRIORITÉ ABSOLUE : COHÉRENCE THÈME ↔ IMAGE
  * Vérifie que les tags de l'image (image.t) couvrent les THÈMES CLÉS du post
  * Une image qui ne couvre aucun thème → score très faible
  * Une image qui couvre plusieurs thèmes → score élevé
- PRIORISE les images dont les tags (t) correspondent aux DESIRED TAGS
- Vérifie la correspondance avec le CONTEXT ENRICHI et VISUAL TYPE
- Si le post parle de plusieurs personnes → p=1 obligatoire pour l'image
- Sélectionne les images en fonction du CONTENU RÉEL de ce post
- Chaque post est UNIQUE, adapte ta sélection en conséquence
- Les matched_tags dans ta réponse doivent être les tags de l'image qui correspondent aux thèmes et Desired Tags`,
                  },
                ],
          temperature: 0.5, // Augmenté de 0.3 à 0.5 pour plus de variété dans les sélections
          max_tokens: 2500, // Augmenté pour permettre plus de détails
              }),
            });

      const llmData = await llmRes.json();
      const llmText = llmData?.choices?.[0]?.message?.content || "";
      
      // Extraire le JSON même s'il y a du texte autour
      let jsonText = llmText.trim();
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      
      // Validation stricte du JSON retourné
      try {
        llmResponse = JSON.parse(jsonText);
      } catch (parseErr) {
        throw new Error(`Réponse LLM invalide : JSON malformé - ${parseErr.message}`);
      }
      
      // Validation stricte de la structure
      if (!llmResponse || typeof llmResponse !== "object") {
        throw new Error("Réponse LLM invalide : doit être un objet JSON");
      }
      
      // Valider les champs obligatoires
      if (!llmResponse.intent || typeof llmResponse.intent !== "string") {
        throw new Error("Réponse LLM invalide : intent manquant ou invalide");
      }
      
      if (!llmResponse.post_tags || !Array.isArray(llmResponse.post_tags)) {
        throw new Error("Réponse LLM invalide : post_tags doit être un tableau");
      }
      
      if (!llmResponse.top4 || !Array.isArray(llmResponse.top4)) {
        throw new Error("Réponse LLM invalide : top4 doit être un tableau");
      }
      
      if (llmResponse.top4.length === 0) {
        throw new Error("Réponse LLM invalide : top4 ne peut pas être vide");
      }
      
      // Valider qu'il y a au moins 1 image (on complétera jusqu'à 4 si nécessaire)
      if (llmResponse.top4.length < 1) {
        throw new Error("Réponse LLM invalide : top4 doit contenir au moins 1 image");
      }
      
      console.log(`✅ Réponse LLM reçue: intent=${llmResponse.intent}, ${llmResponse.top4.length} images sélectionnées`);
    } catch (err) {
      console.error("❌ Erreur lors de l'appel au LLM:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Erreur lors de la sélection d'images par le LLM." 
      });
    }

    // 5. Valider chaque image et assurer la diversité
    const imageIds = new Set(imagesCompact.map(img => img.id));
    const validatedTop4 = [];
    const seenIds = new Set();
    const seenStyles = new Set();
    const seenPersonPresence = new Set();
    
    // Limiter à 4 images max
    const top4 = llmResponse.top4.slice(0, 4);
    
    for (const imgResult of top4) {
      // Validation de base
      if (!imgResult.id || typeof imgResult.id !== "string") {
        console.warn(`⚠️ Image ID invalide dans top4: ${imgResult.id}`);
        continue;
      }
      
      if (!imageIds.has(imgResult.id)) {
        console.warn(`⚠️ Image ID non trouvé: ${imgResult.id}`);
        continue;
      }
      
      // Vérifier la diversité (éviter les doublons)
      if (seenIds.has(imgResult.id)) {
        console.warn(`⚠️ Image dupliquée dans top4: ${imgResult.id}`);
        continue;
      }
      
      // Valider le score
      let score = parseFloat(imgResult.score);
      if (isNaN(score) || score < 0) score = 0;
      if (score > 1) score = 1;
      score = Math.round(score * 100) / 100; // Deux décimales
      
      // Récupérer l'image originale pour vérifier la diversité
      const originalImage = imagesCompact.find(img => img.id === imgResult.id);
      if (originalImage) {
        // Vérifier la diversité des styles (éviter 4 fois le même style)
        if (seenStyles.size >= 3 && seenStyles.has(originalImage.s)) {
          console.log(`⚠️ Style ${originalImage.s} déjà présent ${seenStyles.size} fois, recherche d'une alternative...`);
          // Chercher une alternative avec un style différent et un score proche
          const alternative = imagesCompact.find(img => 
            !seenIds.has(img.id) && 
            !seenStyles.has(img.s) &&
            img.id !== imgResult.id
          );
          if (alternative) {
            seenIds.add(alternative.id);
            seenStyles.add(alternative.s);
            seenPersonPresence.add(alternative.p);
            validatedTop4.push({
              id: alternative.id,
              score: Math.max(0, score * 0.9), // Légère pénalité pour substitution
              reasons: [...(imgResult.reasons || []), "Substitution pour diversité de style"],
              matched_tags: imgResult.matched_tags || []
            });
            continue;
          }
        }
        
        seenIds.add(imgResult.id);
        seenStyles.add(originalImage.s);
        seenPersonPresence.add(originalImage.p);
      }
      
      // Récupérer p et s depuis l'image originale pour les inclure dans la réponse
      const originalImageForMetadata = imagesCompact.find(img => img.id === imgResult.id);
      
      validatedTop4.push({
        id: imgResult.id,
        score: score,
        p: originalImageForMetadata?.p ?? imgResult.p ?? 1, // Inclure p dans la réponse
        s: originalImageForMetadata?.s || imgResult.s || "photo", // Inclure s dans la réponse
        reasons: Array.isArray(imgResult.reasons) ? imgResult.reasons : [],
        matched_tags: Array.isArray(imgResult.matched_tags) ? imgResult.matched_tags : [],
      });
    }
    
    // S'assurer qu'on a au moins 4 images (compléter si nécessaire pour diversité)
    if (validatedTop4.length < 4 && imagesCompact.length > validatedTop4.length) {
      const remaining = imagesCompact.filter(img => !seenIds.has(img.id));
      const needed = 4 - validatedTop4.length;
      for (let i = 0; i < needed && i < remaining.length; i++) {
        // Prioriser les images avec des styles/personnes différents
        let bestAlternative = remaining[i];
        for (let j = i + 1; j < remaining.length; j++) {
          const candidate = remaining[j];
          const current = remaining[i];
          // Préférer une image avec un style différent
          if (!seenStyles.has(candidate.s) && seenStyles.has(current.s)) {
            bestAlternative = candidate;
            break;
          }
          // Préférer une image avec une présence de personnes différente
          if (!seenPersonPresence.has(candidate.p) && seenPersonPresence.has(current.p)) {
            bestAlternative = candidate;
            break;
          }
        }
        
        seenIds.add(bestAlternative.id);
        seenStyles.add(bestAlternative.s);
        seenPersonPresence.add(bestAlternative.p);
        validatedTop4.push({
          id: bestAlternative.id,
          score: 0.5, // Score par défaut pour complément
          reasons: ["Complément pour atteindre 4 images avec diversité"],
          matched_tags: []
        });
      }
    }

    if (validatedTop4.length === 0) {
      return res.status(500).json({ 
        success: false, 
        message: "Aucune image valide retournée par le LLM." 
      });
    }

    // 6. Retrouver les URLs complètes et métadonnées pour chaque image
    const resultImages = validatedTop4.map((imgResult) => {
      const originalImage = imagesCompact.find(img => img.id === imgResult.id);
      const fullImageDoc = imagesSnapshot.docs.find(doc => doc.id === imgResult.id);
      const fullImageData = fullImageDoc?.data();
      
      // Récupérer l'URL de manière robuste (priorité: originalImage.u > fullImageData.url)
      let imageUrl = "";
      if (originalImage?.u) {
        imageUrl = originalImage.u;
      } else if (fullImageData?.url) {
        imageUrl = fullImageData.url;
      } else {
        console.warn(`⚠️ Image ${imgResult.id} sans URL trouvée`);
      }
      
      // Log pour déboguer si URL manquante
      if (!imageUrl) {
        console.error(`❌ Image ${imgResult.id} - originalImage:`, originalImage ? "trouvé" : "non trouvé", "fullImageData:", fullImageData ? "trouvé" : "non trouvé");
      }
      
      return {
        // Schéma compact conforme (OBLIGATOIRE)
        id: imgResult.id,
        u: imageUrl,
        t: originalImage?.t || fullImageData?.t || fullImageData?.tags || [],
        p: originalImage?.p ?? fullImageData?.p ?? 1,
        s: originalImage?.s || fullImageData?.s || "photo",
        x: originalImage?.x || fullImageData?.x || [],
        d: originalImage?.d || fullImageData?.d || (fullImageData?.context?.d || "Image visuelle professionnelle."),
        // Métadonnées supplémentaires pour scoring et affichage
        url: imageUrl, // Alias de u pour compatibilité
        score: imgResult.score,
        reasons: imgResult.reasons,
        matched_tags: imgResult.matched_tags,
        source: fullImageData?.source || originalImage?.source || "unknown",
        created_at: fullImageData?.created_at || null,
        relevance_score: imgResult.score,
      };
    });

    // Filtrer les images sans URL valide
    const validResultImages = resultImages.filter(img => img.url && img.url.trim() !== "");
    
    if (validResultImages.length < resultImages.length) {
      console.warn(`⚠️ ${resultImages.length - validResultImages.length} image(s) sans URL valide filtrée(s)`);
    }
    
    if (validResultImages.length === 0) {
      return res.status(500).json({ 
        success: false, 
        message: "Aucune image avec URL valide trouvée." 
      });
    }
    
    console.log(`✅ ${validResultImages.length} images sélectionnées avec succès (URLs valides)`);
    validResultImages.forEach((img, idx) => {
      console.log(`  ${idx + 1}. Image ${img.id}: ${img.url.substring(0, 80)}...`);
    });

    // 7. Retourner la réponse (JSON strictement conforme)
    const response = {
      success: true,
      intent: llmResponse.intent || postAnalysis.intent || "other",
      post_tags: Array.isArray(llmResponse.post_tags) ? llmResponse.post_tags : (postAnalysis.post_tags || ["professional"]),
      top4: validResultImages.map(img => ({
        // Schéma compact conforme (OBLIGATOIRE)
        id: img.id,
        u: img.u || img.url || "", // URL/storage key (champ u du schéma)
        t: img.t || [],
        p: img.p ?? 1,
        s: img.s || "photo",
        x: img.x || [],
        d: img.d || "Image visuelle professionnelle.",
        // Métadonnées supplémentaires pour affichage et scoring
        url: img.url || img.u || "", // Alias de u pour compatibilité
        score: img.score,
        reasons: Array.isArray(img.reasons) ? img.reasons : [],
        matched_tags: Array.isArray(img.matched_tags) ? img.matched_tags : [],
        source: img.source || "unknown",
        created_at: img.created_at || null
      })),
      notes: typeof llmResponse.notes === "string" ? llmResponse.notes : "",
      message: `${resultImages.length} image(s) sélectionnée(s) avec succès.`
    };
    
    // Validation finale du JSON retourné
    try {
      JSON.stringify(response); // Vérifier que c'est du JSON valide
    } catch (err) {
      console.error("❌ Erreur lors de la validation du JSON de réponse:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Erreur lors de la génération de la réponse JSON." 
      });
    }
    
    res.json(response);
  } catch (error) {
    console.error("Select error:", error);
    res.status(500).json({ success: false, message: "Erreur lors de la sélection de l'image." });
  }
});

// ---------------------- LAB MODE: SELECT OPTIMAL (Sélection optimale avec nouveau prompt) ----------------------
// ---------------------- LAB MODE: SELECT OPTIMAL (Sélection optimale AMÉLIORÉE) ----------------------
app.post("/select-optimal", async (req, res) => {
  try {
    const { email, postText } = req.body;

    if (!postText || typeof postText !== "string") {
      return res.status(400).json({ success: false, message: "Texte du post requis." });
    }

    const userEmail = email || "anonymous";
    const finalPostText = postText.trim();

    // 1. Récupérer jusqu'à 100 images candidates avec format compact
    const imagesSnapshot = await db.collection("images")
        .where("email", "==", userEmail)
      .limit(100)
        .get();
      
    const imagesCompact = [];
    imagesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.url) {
        // Valider et normaliser le schéma compact
        const schemaValidation = validateCompactSchema({
          id: doc.id,
          url: data.url,
          t: data.t || data.tags || [],
          p: data.p ?? (data.context?.p ?? 1),
          s: data.s || (data.context?.s || "photo"),
          x: data.x || (data.context?.x || []),
          d: data.d || data.context?.d || "Image visuelle professionnelle."
        });
        
        if (schemaValidation.valid) {
          imagesCompact.push({
            id: schemaValidation.normalized.id,
            u: schemaValidation.normalized.url,
            d: schemaValidation.normalized.d || "Image visuelle professionnelle.",
            t: schemaValidation.normalized.t,
            p: schemaValidation.normalized.p,
            s: schemaValidation.normalized.s,
            x: schemaValidation.normalized.x,
            source: data.source || "unknown",
            created_at: data.created_at,
          });
        } else {
          console.warn(`⚠️ Image ${doc.id} avec schéma invalide, utilisation des valeurs normalisées:`, schemaValidation.errors);
          imagesCompact.push({
            id: schemaValidation.normalized.id,
            u: schemaValidation.normalized.url,
            d: schemaValidation.normalized.d || "Image visuelle professionnelle.",
            t: schemaValidation.normalized.t,
            p: schemaValidation.normalized.p,
            s: schemaValidation.normalized.s,
            x: schemaValidation.normalized.x,
            source: data.source || "unknown",
            created_at: data.created_at,
          });
        }
      }
    });

    if (imagesCompact.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Aucune image trouvée dans Firestore. Veuillez d'abord récupérer des visuels." 
      });
    }

    console.log(`📊 ${imagesCompact.length} images candidates récupérées pour sélection optimale`);
    console.log(`📝 Texte du post à analyser (${finalPostText.length} caractères): "${finalPostText.substring(0, 150)}${finalPostText.length > 150 ? '...' : ''}"`);

    // 2. Appeler le LLM avec le NOUVEAU PROMPT OPTIMISÉ (focus sur description)
    const systemPrompt = `Tu es un moteur de sélection d'images pour illustrer des posts LinkedIn.

**OBJECTIF PRINCIPAL : MATCHER LA DESCRIPTION DE L'IMAGE AVEC LE TEXTE DU POST**

Tu dois choisir les 4 images dont la description (champ "d") correspond le mieux au contenu du post.

**MÉTHODE OBLIGATOIRE :**

1) **ANALYSE APPROFONDIE DU POST** :
   - Extraire TOUS les mots-clés importants du post (noms, verbes, adjectifs, concepts)
   - Identifier le thème principal (ex: Noël, promotion, événement, formation, etc.)
   - Identifier le contexte (ex: fêtes, bureau, extérieur, produit, etc.)
   - Identifier les objets/éléments mentionnés (ex: chapeau Noël, décoration, cadeau, etc.)
   - Identifier les actions (ex: célébrer, promouvoir, travailler, etc.)
   - Identifier les émotions/ambiance (ex: joyeux, professionnel, festif, etc.)

2) **SCORING BASÉ SUR LA DESCRIPTION (PRIORITÉ ABSOLUE)** :
   Pour chaque image, comparer sa description (champ "d") avec le texte du post :
   
   A) **Similarité Sémantique Description ↔ Post (0 à 0.70)** :
      - Compter les mots-clés communs entre la description et le post
      - Vérifier les concepts similaires (ex: "Noël" dans post, "festif" dans description)
      - Vérifier les objets similaires (ex: "chapeau" dans post, "accessoire" dans description)
      - Plus il y a de correspondances sémantiques, plus le score est élevé
      - Exemples :
        * Post parle de "Noël promotion cadeau" + Description parle de "décoration festive cadeau" → 0.60-0.70
        * Post parle de "formation équipe" + Description parle de "groupe workshop" → 0.50-0.60
        * Post parle de "Noël" + Description parle de "bureau" → 0.10-0.20
   
   B) **Correspondance Tags (0 à 0.20)** :
      - Vérifier si les tags de l'image (champ "t") correspondent aux mots-clés du post
      - Bonus si plusieurs tags correspondent
   
   C) **Bonus Contexte & Type (0 à 0.10)** :
      - Vérifier si le contexte de l'image correspond au post
      - Ex: post événement → privilégier images avec p=1 (groupe)
      - Ex: post personnel → privilégier images avec p=2 (portrait)

3) **RÈGLES STRICTES** :
   - Une image avec description générique (ex: "Image visuelle professionnelle") → score MAX 0.30
   - Une image avec description spécifique qui match le post → score 0.60-0.90
   - Une image avec description très détaillée qui match parfaitement → score 0.80-1.00
   - Les exclusions (champ "x") doivent être respectées → malus -1.0 si conflit
   - Priorité absolue à la description (champ "d"), pas aux tags seuls

4) **DIVERSITÉ** :
   - Les 4 images doivent être variées (pas 4 fois la même scène)
   - Si plusieurs images ont un score proche, choisir celles avec des descriptions différentes

5) **EXEMPLES DE MATCHING** :
   - Post : "Joyeux Noël ! Profitez de notre promotion de fin d'année 🎄"
     * Image 1 (d: "Personne portant chapeau de Noël avec décoration festive") → SCORE ÉLEVÉ ✅
     * Image 2 (d: "Promotion spéciale avec prix réduits et cadeau") → SCORE ÉLEVÉ ✅
     * Image 3 (d: "Décoration de Noël avec sapin et guirlandes") → SCORE ÉLEVÉ ✅
     * Image 4 (d: "Portrait professionnel en bureau moderne") → SCORE FAIBLE ❌
   
   - Post : "Formation équipe sur les nouvelles méthodes agiles"
     * Image 1 (d: "Groupe en atelier avec tableau blanc et discussion") → SCORE ÉLEVÉ ✅
     * Image 2 (d: "Équipe en réunion collaborative avec post-it") → SCORE ÉLEVÉ ✅
     * Image 3 (d: "Personne seule travaillant sur ordinateur") → SCORE MOYEN 🟡
     * Image 4 (d: "Décoration de bureau avec plantes") → SCORE FAIBLE ❌

**FORMAT DE SORTIE (JSON STRICT)** :
{
  "intent": "description de l'intention du post",
  "post_keywords": ["mot-clé 1", "mot-clé 2", ...],
  "top4": [
    {
      "id": "img_xxxx",
      "score": 0.85,
      "description_match": "explication du match entre description et post",
      "matched_keywords": ["mot commun 1", "mot commun 2"],
      "reasons": ["raison 1", "raison 2"]
    },
    ...
  ],
  "notes": "résumé court"
}

**IMPORTANT** :
- Sortie STRICTEMENT JSON, sans texte autour
- Chaque score doit être justifié par le match description ↔ post
- Les matched_keywords doivent venir de la description (champ "d")
- Ne JAMAIS inventer de correspondances qui n'existent pas`;

    let llmResponse = null;
    try {
      const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: OPENAI_MODEL,
                messages: [
                  {
                    role: "system",
              content: systemPrompt,
                  },
                  {
                    role: "user",
              content: `Analyse ce post LinkedIn et sélectionne les 4 images dont la DESCRIPTION correspond le mieux au contenu du post :

**POST À ANALYSER :**
"""
${finalPostText}
"""

**IMAGES DISPONIBLES (${imagesCompact.length} images)** :
Chaque image contient :
- id : identifiant unique
- d : DESCRIPTION de l'image (PRIORITÉ ABSOLUE pour le matching)
- t : tags de l'image
- p : présence de personnes (0=aucune, 1=groupe, 2=portrait)
- s : style (photo, illu, 3d, icon)
- x : exclusions éventuelles

${JSON.stringify(imagesCompact, null, 2)}

**INSTRUCTIONS :**
1. Extrais TOUS les mots-clés importants du post
2. Compare chaque description (champ "d") avec ces mots-clés
3. Calcule un score de similarité sémantique (0-1.0)
4. Sélectionne les 4 images avec le meilleur match description ↔ post
5. Assure la diversité des 4 images sélectionnées

**FOCUS ABSOLU :** La description de l'image (champ "d") doit correspondre au contenu du post.`,
                  },
                ],
          temperature: 0.4, // Réduit pour plus de précision dans le matching
          max_tokens: 3000,
              }),
            });

      const llmData = await llmRes.json();
      
      // Vérifier si l'API OpenAI a retourné une erreur
      if (llmData.error) {
        throw new Error(`Erreur API OpenAI: ${llmData.error.message || JSON.stringify(llmData.error)}`);
      }
      
      const llmText = llmData?.choices?.[0]?.message?.content || "";
      
      if (!llmText || llmText.trim() === "") {
        throw new Error("Réponse LLM vide - aucune réponse reçue de l'API");
      }
      
      console.log("📝 Réponse brute du LLM (premiers 500 caractères):", llmText.substring(0, 500));
      
      // Extraire le JSON même s'il y a du texte autour
      let jsonText = llmText.trim();
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      } else {
        throw new Error("Aucun JSON trouvé dans la réponse du LLM");
      }
      
      // Validation stricte du JSON retourné
      try {
        llmResponse = JSON.parse(jsonText);
      } catch (parseErr) {
        console.error("❌ Texte JSON invalide:", jsonText.substring(0, 500));
        throw new Error(`Réponse LLM invalide : JSON malformé - ${parseErr.message}`);
      }
      
      // Validation stricte de la structure
      if (!llmResponse || typeof llmResponse !== "object") {
        throw new Error("Réponse LLM invalide : doit être un objet JSON");
      }
      
      if (!llmResponse.top4 || !Array.isArray(llmResponse.top4)) {
        throw new Error("Réponse LLM invalide : top4 doit être un tableau");
      }
      
      if (llmResponse.top4.length === 0) {
        throw new Error("Réponse LLM invalide : top4 ne peut pas être vide");
      }
      
      console.log(`✅ Réponse LLM reçue: intent=${llmResponse.intent || 'N/A'}, ${llmResponse.top4.length} images sélectionnées`);
      console.log(`🎯 Mots-clés du post: ${llmResponse.post_keywords?.join(", ") || 'N/A'}`);
    } catch (err) {
      console.error("❌ Erreur lors de l'appel au LLM:", err);
      console.error("❌ Détails de l'erreur:", err.message);
      console.error("❌ Stack trace:", err.stack);
      return res.status(500).json({ 
        success: false, 
        message: `Erreur lors de la sélection optimale d'images par le LLM: ${err.message}` 
      });
    }

    // 3. Valider chaque image et assurer la diversité
    const imageIds = new Set(imagesCompact.map(img => img.id));
    const validatedTop4 = [];
    const seenIds = new Set();
    
    // Limiter à 4 images max
    const top4 = llmResponse.top4.slice(0, 4);
    
    for (const imgResult of top4) {
      // Validation de base
      if (!imgResult.id || typeof imgResult.id !== "string") {
        console.warn(`⚠️ Image ID invalide dans top4: ${imgResult.id}`);
        continue;
      }
      
      if (!imageIds.has(imgResult.id)) {
        console.warn(`⚠️ Image ID non trouvé: ${imgResult.id}`);
        continue;
      }
      
      // Vérifier la diversité (éviter les doublons)
      if (seenIds.has(imgResult.id)) {
        console.warn(`⚠️ Image dupliquée dans top4: ${imgResult.id}`);
        continue;
      }
      
      // Valider le score
      let score = parseFloat(imgResult.score);
      if (isNaN(score) || score < 0) score = 0;
      if (score > 1) score = 1;
      score = Math.round(score * 100) / 100; // Deux décimales
      
      seenIds.add(imgResult.id);
      
      // Récupérer p et s depuis l'image originale pour les inclure dans la réponse
      const originalImageForMetadata = imagesCompact.find(img => img.id === imgResult.id);
      
      validatedTop4.push({
        id: imgResult.id,
        score: score,
        p: originalImageForMetadata?.p ?? imgResult.p ?? 1,
        s: originalImageForMetadata?.s || imgResult.s || "photo",
        description_match: imgResult.description_match || "",
        matched_keywords: Array.isArray(imgResult.matched_keywords) ? imgResult.matched_keywords : [],
        reasons: Array.isArray(imgResult.reasons) ? imgResult.reasons : [],
      });
      
      console.log(`  ✅ Image ${imgResult.id}: score=${score}, match="${imgResult.description_match?.substring(0, 80) || 'N/A'}"`);
    }
    
    // S'assurer qu'on a au moins 1 image
    if (validatedTop4.length === 0) {
      return res.status(500).json({ 
        success: false, 
        message: "Aucune image valide retournée par le LLM." 
      });
    }

    // 4. Retrouver les URLs complètes et métadonnées pour chaque image
    const resultImages = validatedTop4.map((imgResult) => {
      const originalImage = imagesCompact.find(img => img.id === imgResult.id);
      const fullImageDoc = imagesSnapshot.docs.find(doc => doc.id === imgResult.id);
      const fullImageData = fullImageDoc?.data();
      
      // Récupérer l'URL de manière robuste
      let imageUrl = "";
      if (originalImage?.u) {
        imageUrl = originalImage.u;
      } else if (fullImageData?.url) {
        imageUrl = fullImageData.url;
      }
      
      return {
        id: imgResult.id,
        u: imageUrl,
        t: originalImage?.t || fullImageData?.t || fullImageData?.tags || [],
        p: originalImage?.p ?? fullImageData?.p ?? 1,
        s: originalImage?.s || fullImageData?.s || "photo",
        x: originalImage?.x || fullImageData?.x || [],
        d: originalImage?.d || fullImageData?.d || (fullImageData?.context?.d || "Image visuelle professionnelle."),
        url: imageUrl,
        score: imgResult.score,
        description_match: imgResult.description_match,
        matched_keywords: imgResult.matched_keywords,
        reasons: imgResult.reasons,
        source: fullImageData?.source || originalImage?.source || "unknown",
        created_at: fullImageData?.created_at || null,
      };
    });

    // Filtrer les images sans URL valide
    const validResultImages = resultImages.filter(img => img.url && img.url.trim() !== "");
    
    if (validResultImages.length === 0) {
      return res.status(500).json({ 
        success: false, 
        message: "Aucune image avec URL valide trouvée." 
      });
    }
    
    console.log(`✅ ${validResultImages.length} images sélectionnées avec succès (sélection optimale basée sur description)`);
    validResultImages.forEach((img, idx) => {
      console.log(`  ${idx + 1}. Image ${img.id} (score: ${img.score})`);
      console.log(`     Description: ${img.d.substring(0, 100)}...`);
      console.log(`     Match: ${img.description_match?.substring(0, 100) || 'N/A'}...`);
    });

    // 5. Retourner la réponse
    const response = {
      success: true,
      intent: llmResponse.intent || "Sélection basée sur description",
      post_keywords: Array.isArray(llmResponse.post_keywords) ? llmResponse.post_keywords : [],
      top4: validResultImages.map(img => ({
        id: img.id,
        u: img.u || img.url || "",
        t: img.t || [],
        p: img.p ?? 1,
        s: img.s || "photo",
        x: img.x || [],
        d: img.d || "Image visuelle professionnelle.",
        url: img.url || img.u || "",
        score: img.score,
        description_match: img.description_match || "",
        matched_keywords: Array.isArray(img.matched_keywords) ? img.matched_keywords : [],
        reasons: Array.isArray(img.reasons) ? img.reasons : [],
        source: img.source || "unknown",
        created_at: img.created_at || null
      })),
      notes: typeof llmResponse.notes === "string" ? llmResponse.notes : "Sélection optimale basée sur la correspondance description ↔ post",
      message: `${validResultImages.length} image(s) sélectionnée(s) avec succès (sélection optimale basée sur description).`
    };
    
    res.json(response);
  } catch (error) {
    console.error("❌ Select optimal error:", error);
    console.error("❌ Détails de l'erreur:", error.message);
    console.error("❌ Stack trace:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: `Erreur lors de la sélection optimale de l'image: ${error.message}` 
    });
  }
});

// ---------------------- LAB MODE: SAVE SELECTED IMAGE (Enregistrer l'image choisie par l'utilisateur) ----------------------
app.post("/select/save", async (req, res) => {
  try {
    const { email, imageId, postText } = req.body;

    if (!imageId) {
      return res.status(400).json({ success: false, message: "ID de l'image requis." });
    }

    const userEmail = email || "anonymous";

    // Récupérer l'image depuis Firestore
    const imageRef = db.collection("images").doc(imageId);
    const imageDoc = await imageRef.get();

    if (!imageDoc.exists) {
      return res.status(404).json({ success: false, message: "Image non trouvée." });
    }

    const imageData = imageDoc.data();
    
    // Sauvegarder la sélection dans l'analyse du post (dernière analyse)
    try {
      const analysisSnapshot = await db.collection("posts_analysis").where("email", "==", userEmail).get();
      if (!analysisSnapshot.empty) {
        // Trouver la plus récente manuellement
        let latestDoc = null;
        let latestDate = null;
        analysisSnapshot.forEach((doc) => {
          const data = doc.data();
          // Si postText est fourni, vérifier la correspondance
          if (postText && data.postText) {
            if (data.postText.trim().substring(0, 100) !== postText.trim().substring(0, 100)) {
              return; // Ne pas considérer cette analyse si le texte ne correspond pas
            }
          }
          const docDate = data.created_at?.toDate?.() || new Date(data.created_at);
          if (!latestDate || docDate > latestDate) {
            latestDate = docDate;
            latestDoc = doc;
          }
        });
        
        if (latestDoc) {
          await latestDoc.ref.update({
            selectedImageId: imageId,
            selectedImageUrl: imageData.url,
            selectionScore: imageData.relevance_score || 0,
            tagMatches: imageData.tags?.length || 0,
            selectedAt: new Date(),
            userSelected: true, // Indique que c'est l'utilisateur qui a choisi
          });
        }
      }
    } catch (err) {
      console.error("Erreur sauvegarde sélection:", err);
      // Continue même si la sauvegarde échoue
    }
    
    // Mettre à jour le score de pertinence de l'image sélectionnée
    try {
      // Récupérer le score depuis les données de l'image (peut venir de /select)
      const currentScore = imageData.relevance_score || imageData.score || 0;
      await imageRef.update({
        relevance_score: currentScore, // Conserver le score de pertinence calculé
        selected_at: new Date(),
        selected_for_post: postText || null,
        last_selected_at: new Date(),
        last_selected_by: userEmail,
      });
    } catch (err) {
      console.error("Erreur mise à jour score pertinence:", err);
    }

    res.json({
      success: true,
      message: "Image sélectionnée enregistrée avec succès.",
      image: {
        id: imageId,
        url: imageData.url,
        tags: imageData.tags || [],
        source: imageData.source,
      },
    });
  } catch (error) {
    console.error("Save selected image error:", error);
    res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement de l'image sélectionnée." });
  }
});

// ---------------------- LAB MODE: SEARCH IMAGES (Recherche d'images par tag) ----------------------
app.get("/images/search", async (req, res) => {
  try {
    const { email, tags, source, contextType, minScore, limit } = req.query;
    
    const userEmail = email || "anonymous";
    const searchTags = tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [];
    const searchSource = source || null;
    const searchContextType = contextType || null;
    const minRelevanceScore = minScore ? parseFloat(minScore) : null;
    const resultLimit = limit ? parseInt(limit, 10) : 50;
    
    // Construire la requête Firestore
    let query = db.collection("images").where("email", "==", userEmail);
    
    // Filtrer par source si spécifié
    if (searchSource) {
      query = query.where("source", "==", searchSource);
    }
    
    // Filtrer par score de pertinence minimum si spécifié
    if (minRelevanceScore !== null) {
      query = query.where("relevance_score", ">=", minRelevanceScore);
    }
    
    const snapshot = await query.get();
    let results = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      let matches = true;
      
      // Filtrer par tags si spécifiés
      if (searchTags.length > 0) {
        const imageTags = (data.tags || []).map(t => t.toLowerCase());
        const hasMatchingTag = searchTags.some(searchTag => 
          imageTags.some(imgTag => imgTag.includes(searchTag.toLowerCase()) || searchTag.toLowerCase().includes(imgTag))
        );
        if (!hasMatchingTag) {
          matches = false;
        }
      }
      
      // Filtrer par type de contexte si spécifié
      if (searchContextType && matches) {
        const context = data.context || {};
        if (searchContextType === "indoor" && context.location !== "indoor") matches = false;
        else if (searchContextType === "outdoor" && context.location !== "outdoor") matches = false;
        else if (searchContextType === "formal" && context.formality !== "formal") matches = false;
        else if (searchContextType === "casual" && context.formality !== "casual") matches = false;
        else if (searchContextType === "hasFace" && !context.hasFace) matches = false;
      }
      
      if (matches) {
        results.push({
          id: doc.id,
          url: data.url,
          originalUrl: data.originalUrl || data.url,
          source: data.source,
          tags: data.tags || [],
          context: data.context || {},
          relevance_score: data.relevance_score || 0,
          created_at: data.created_at,
          tagged_at: data.tagged_at,
          isTagged: data.isTagged || false,
        });
      }
    });
    
    // Trier par score de pertinence (décroissant) puis par date (décroissante)
    results.sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }
      const dateA = a.created_at?.toDate?.() || new Date(a.created_at);
      const dateB = b.created_at?.toDate?.() || new Date(b.created_at);
      return dateB - dateA;
    });
    
    // Limiter les résultats
    results = results.slice(0, resultLimit);
    
    res.json({
      success: true,
      images: results,
      count: results.length,
      filters: {
        tags: searchTags,
        source: searchSource,
        contextType: searchContextType,
        minScore: minRelevanceScore,
      },
    });
  } catch (error) {
    console.error("Search images error:", error);
    res.status(500).json({ success: false, message: "Erreur lors de la recherche d'images." });
  }
});

// ---------------------- LAB MODE: FILTER IMAGES (Filtrage rapide d'images) ----------------------
app.get("/images/filter", async (req, res) => {
  try {
    const { email, tagged, source, hasTags, minScore } = req.query;
    
    const userEmail = email || "anonymous";
    
    // Construire la requête Firestore
    let query = db.collection("images").where("email", "==", userEmail);
    
    // Filtres rapides
    if (tagged === "true") {
      query = query.where("isTagged", "==", true);
    } else if (tagged === "false") {
      query = query.where("isTagged", "==", false);
    }
    
    if (hasTags === "true") {
      query = query.where("hasTags", "==", true);
    }
    
    if (source) {
      query = query.where("source", "==", source);
    }
    
    if (minScore) {
      query = query.where("relevance_score", ">=", parseFloat(minScore));
    }
    
    const snapshot = await query.get();
    const results = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        id: doc.id,
        url: data.url,
        originalUrl: data.originalUrl || data.url,
        source: data.source,
        tags: data.tags || [],
        context: data.context || {},
        relevance_score: data.relevance_score || 0,
        created_at: data.created_at,
        tagged_at: data.tagged_at,
        isTagged: data.isTagged || false,
        hasTags: data.hasTags || false,
      });
    });
    
    // Trier par date (plus récentes en premier)
    results.sort((a, b) => {
      const dateA = a.created_at?.toDate?.() || new Date(a.created_at);
      const dateB = b.created_at?.toDate?.() || new Date(b.created_at);
      return dateB - dateA;
    });
    
    res.json({
      success: true,
      images: results,
      count: results.length,
      filters: {
        tagged,
        source,
        hasTags,
        minScore,
      },
    });
  } catch (error) {
    console.error("Filter images error:", error);
    res.status(500).json({ success: false, message: "Erreur lors du filtrage d'images." });
  }
});

// ---------------------- START SERVER ----------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Available endpoints: /signup, /login, /generate, /ingest, /tag/batch, /tag/single, /post/analyze, /select, /images/search, /images/filter`);
});

