/**
 * TAXONOMIE FERMÉE ET VERSIONNÉE POUR LES TAGS D'IMAGES
 * Version: v1.0
 * Date: 2024
 */

// Exclusions autorisées
const ALLOWED_EXCLUSIONS = [
  "no_face",
  "no_logo", 
  "no_text",
  "no_children"
];

// Styles d'images autorisés (valeurs simplifiées uniquement)
const ALLOWED_STYLES = [
  "photo",
  "illu",
  "3d",
  "icon"
];

// Taxonomie fermée des tags (versionnée)
const TAXONOMY_V1 = {
  // Sujets business (1-3 tags max par image)
  business: [
    "business",
    "marketing",
    "team",
    "meeting",
    "leadership",
    "strategy",
    "event",
    "collaboration",
    "networking",
    "workshop",
    "conference",
    "training",
    "presentation",
    "consulting",
    "coaching",
    "mentoring",
    "sales",
    "growth",
    "success",
    "innovation",
    "startup",
    "entrepreneurship",
    "work",
    "career",
    "professional",
    "sustainability",
    "congratulation",
    "congratulations",
    "celebration",
    "anniversary",
    "anniversaire",
    "birthday",
    "promotion",
    "promotions",
    "new",
    "nouveau",
    "nouvelle",
    "ai",
    "artificial intelligence",
    "intelligence artificielle",
    "technology",
    "digital",
    "innovation",
    "future",
    "trend",
    "award",
    "prize",
    "achievement",
    "milestone",
    "victory",
    "win",
    "triumph",
    "accomplishment",
    "recognition",
    "honor",
    "appreciation",
    "gratitude",
    "thanks",
    "thank you",
    "appreciation",
    "recognition",
    "acknowledgment",
    "praise",
    "compliment",
    "encouragement",
    "support",
    "motivation",
    "inspiration",
    "aspiration",
    "dream",
    "vision",
    "mission",
    "purpose",
    "goal",
    "objective",
    "target",
    "aim",
    "ambition",
    "desire",
    "wish",
    "hope",
    "expectation",
    "anticipation",
    "excitement",
    "enthusiasm",
    "passion",
    "dedication",
    "commitment",
    "devotion",
    "loyalty",
    "faithfulness",
    "fidelity",
    "allegiance",
    "allegiance",
    "loyalty",
    "faithfulness",
    "fidelity",
    "devotion",
    "dedication",
    "commitment",
    "perseverance",
    "persistence",
    "determination",
    "resolve",
    "willpower",
    "strength",
    "power",
    "force",
    "energy",
    "vigor",
    "vitality",
    "vibrancy",
    "liveliness",
    "animation",
    "spirit",
    "soul",
    "essence",
    "core",
    "heart",
    "center",
    "middle",
    "focus",
    "concentration",
    "attention",
    "awareness",
    "consciousness",
    "mindfulness",
    "presence",
    "being",
    "existence",
    "life",
    "living",
    "alive",
    "active",
    "dynamic",
    "vibrant",
    "lively",
    "energetic",
    "vigorous",
    "powerful",
    "strong",
    "robust",
    "sturdy",
    "solid",
    "firm",
    "stable",
    "steady",
    "reliable",
    "dependable",
    "trustworthy",
    "credible",
    "believable",
    "convincing",
    "persuasive",
    "compelling",
    "attractive",
    "appealing",
    "charming",
    "captivating",
    "engaging",
    "interesting",
    "fascinating",
    "intriguing",
    "alluring",
    "enticing",
    "tempting",
    "inviting",
    "welcoming",
    "hospitable",
    "friendly",
    "amicable",
    "cordial",
    "warm",
    "affectionate",
    "loving",
    "caring",
    "compassionate",
    "empathetic",
    "sympathetic",
    "understanding",
    "comprehensive",
    "thorough",
    "complete",
    "full",
    "entire",
    "whole",
    "total",
    "all",
    "every",
    "each",
    "everyone",
    "everybody",
    "all",
    "everything",
    "everywhere",
    "always",
    "forever",
    "eternal",
    "permanent",
    "lasting",
    "enduring",
    "persistent",
    "continuous",
    "ongoing",
    "continual",
    "constant",
    "steady",
    "regular",
    "routine",
    "habitual",
    "customary",
    "usual",
    "normal",
    "typical",
    "standard",
    "common",
    "ordinary",
    "regular",
    "usual",
    "normal",
    "typical",
    "standard",
    "common",
    "ordinary",
    "average",
    "medium",
    "moderate",
    "balanced",
    "equal",
    "fair",
    "just",
    "right",
    "correct",
    "accurate",
    "precise",
    "exact",
    "perfect",
    "flawless",
    "impeccable",
    "faultless",
    "errorless",
    "mistakeless",
    "perfect",
    "ideal",
    "optimal",
    "best",
    "finest",
    "greatest",
    "highest",
    "top",
    "peak",
    "summit",
    "pinnacle",
    "zenith",
    "apex",
    "climax",
    "culmination",
    "completion",
    "finish",
    "end",
    "conclusion",
    "finale",
    "ending",
    "closure",
    "termination",
    "cessation",
    "stop",
    "halt",
    "pause",
    "break",
    "rest",
    "relaxation",
    "leisure",
    "recreation",
    "entertainment",
    "amusement",
    "fun",
    "enjoyment",
    "pleasure",
    "delight",
    "joy",
    "happiness",
    "bliss",
    "ecstasy",
    "euphoria",
    "elation",
    "exhilaration",
    "thrill",
    "excitement",
    "adventure",
    "exploration",
    "discovery",
    "finding",
    "uncovering",
    "revealing",
    "exposing",
    "showing",
    "displaying",
    "presenting",
    "demonstrating",
    "exhibiting",
    "illustrating",
    "depicting",
    "portraying",
    "representing",
    "characterizing",
    "describing",
    "explaining",
    "clarifying",
    "elucidating",
    "illuminating",
    "enlightening",
    "informing",
    "educating",
    "teaching",
    "instructing",
    "guiding",
    "directing",
    "leading",
    "conducting",
    "orchestrating",
    "coordinating",
    "managing",
    "administering",
    "overseeing",
    "supervising",
    "monitoring",
    "watching",
    "observing",
    "tracking",
    "following",
    "pursuing",
    "chasing",
    "hunting",
    "seeking",
    "searching",
    "looking",
    "finding",
    "discovering",
    "uncovering",
    "revealing",
    "exposing",
    "showing",
    "displaying",
    "presenting",
    "demonstrating",
    "exhibiting",
    "illustrating",
    "depicting",
    "portraying",
    "representing",
    "characterizing",
    "describing",
    "explaining",
    "clarifying",
    "elucidating",
    "illuminating",
    "enlightening",
    "informing",
    "educating",
    "teaching",
    "instructing",
    "guiding",
    "directing",
    "leading",
    "conducting",
    "orchestrating",
    "coordinating",
    "managing",
    "administering",
    "overseeing",
    "supervising",
    "monitoring"
  ],
  
  // Objets/visuels (3-7 tags par image)
  visual: [
    "portrait",
    "person",
    "people",
    "group",
    "smiling",
    "workspace",
    "office",
    "desk",
    "laptop",
    "computer",
    "phone",
    "screen",
    "presentation",
    "whiteboard",
    "chalkboard",
    "document",
    "chart",
    "graph",
    "step",
    "stairs",
    "selfie",
    "face",
    "man",
    "woman",
    "young",
    "adult",
    "standing",
    "sitting",
    "walking",
    "working",
    "pose",
    "confident",
    "serious",
    "casual",
    "formal",
    "relaxed",
    "friendly",
    "welcoming",
    "dynamic",
    "inspiring",
    "positive",
    "atmosphere",
    "indoor",
    "outdoor",
    "nature",
    "street",
    "transport",
    "coworking",
    "studio",
    "room",
    "building",
    "modern",
    "contemporary",
    "natural",
    "lighting",
    "soft",
    "bright",
    "warm",
    "colors",
    "background",
    "blurred",
    "style",
    "look",
    "shirt",
    "white",
    "suit",
    "clothing",
    "beard",
    "glasses",
    "cup",
    "coffee",
    "notebook",
    "pen",
    "paper",
    "board",
    "dashboard",
    "data",
    "analytics",
    "meeting room",
    "conference room",
    "table",
    "chair",
    "window",
    "door",
    "wall",
    "floor",
    "ceiling",
    "drawing",
    "illustration",
    "sketch",
    "art",
    "design",
    "creative",
    "hand",
    "hands",
    "writing",
    "reading",
    "thinking",
    "discussion",
    "conversation",
    "listening",
    "speaking",
    "pointing",
    "gesture",
    "eye contact",
    "connection",
    "interaction",
    "communication",
    "focus",
    "concentration",
    "energy",
    "enthusiasm",
    "passion",
    "determination",
    "ambition",
    "achievement",
    "goal",
    "target",
    "progress",
    "development",
    "learning",
    "knowledge",
    "expertise",
    "skill",
    "talent",
    "experience",
    "wisdom",
    "insight",
    "idea",
    "concept",
    "solution",
    "problem solving",
    "brainstorming",
    "planning",
    "organization",
    "efficiency",
    "productivity",
    "results",
    "outcome",
    "impact",
    "value",
    "excellence",
    "perfection",
    "precision",
    "detail",
    "accuracy",
    "reliability",
    "trust",
    "credibility",
    "reputation",
    "brand",
    "identity",
    "appearance",
    "presence",
    "charisma",
    "personality",
    "character",
    "behavior",
    "demeanor",
    "expression",
    "emotion",
    "feeling",
    "mood",
    "vibe",
    "tone",
    "spirit",
    "nature",
    "core",
    "heart",
    "soul",
    "substance",
    "content",
    "material",
    "matter",
    "element",
    "component",
    "part",
    "piece",
    "section",
    "segment",
    "portion",
    "factor",
    "aspect",
    "feature",
    "characteristic",
    "attribute",
    "property",
    "trait",
    "dimension",
    "facet",
    "side",
    "angle",
    "perspective",
    "viewpoint",
    "standpoint",
    "position",
    "stance",
    "posture",
    "approach",
    "method",
    "technique",
    "tactic",
    "way",
    "mode",
    "fashion",
    "trend",
    "pattern",
    "model",
    "example",
    "instance",
    "case",
    "scenario",
    "situation",
    "context",
    "setting",
    "environment",
    "surroundings",
    "ambiance",
    "city",
    "urban",
    "suburban",
    "rural",
    "landscape",
    "scenery",
    "view",
    "scene",
    "picture",
    "photo",
    "image",
    "visual",
    "graphic",
    "diagram",
    "figure",
    "icon",
    "symbol",
    "logo",
    "badge",
    "label",
    "text",
    "word",
    "letter",
    "number",
    "digit",
    "sign",
    "mark",
    "indicator",
    "signal",
    "cue",
    "hint",
    "clue",
    "evidence",
    "proof",
    "sign",
    "mark",
    "trace",
    "remnant",
    "reminder",
    "memory",
    "recollection",
    "reminiscence",
    "nostalgia",
    "sentiment",
    "emotion",
    "feeling",
    "sensation",
    "perception",
    "awareness",
    "consciousness",
    "understanding",
    "comprehension",
    "grasp",
    "apprehension",
    "realization",
    "recognition",
    "acknowledgment",
    "acceptance",
    "approval",
    "agreement",
    "consent",
    "assent",
    "concurrence",
    "harmony",
    "accord",
    "unity",
    "solidarity",
    "cohesion",
    "bond",
    "link",
    "connection",
    "relationship",
    "association",
    "affiliation",
    "alliance",
    "partnership",
    "collaboration",
    "cooperation",
    "teamwork",
    "synergy",
    "coordination",
    "synchronization",
    "alignment",
    "integration",
    "unification",
    "consolidation",
    "merger",
    "fusion",
    "blend",
    "mix",
    "combination",
    "synthesis",
    "amalgamation",
    "union",
    "junction",
    "intersection",
    "crossing",
    "meeting",
    "convergence",
    "confluence",
    "merging",
    "joining",
    "linking",
    "connecting",
    "attaching",
    "binding",
    "fastening",
    "securing",
    "fixing",
    "anchoring",
    "grounding",
    "establishing",
    "founding",
    "creating",
    "forming",
    "building",
    "constructing",
    "developing",
    "growing",
    "expanding",
    "extending",
    "stretching",
    "reaching",
    "extending",
    "spreading",
    "widening",
    "broadening",
    "deepening",
    "heightening",
    "intensifying",
    "strengthening",
    "reinforcing",
    "enhancing",
    "improving",
    "upgrading",
    "refining",
    "polishing",
    "perfecting",
    "optimizing",
    "maximizing",
    "amplifying",
    "magnifying",
    "enlarging",
    "increasing",
    "augmenting",
    "boosting",
    "raising",
    "elevating",
    "lifting",
    "uplifting",
    "inspiring",
    "motivating",
    "encouraging",
    "supporting",
    "backing",
    "endorsing",
    "approving",
    "validating",
    "confirming",
    "verifying",
    "authenticating",
    "certifying",
    "accrediting",
    "authorizing",
    "licensing",
    "permitting",
    "allowing",
    "enabling",
    "empowering",
    "facilitating",
    "promoting",
    "advancing",
    "progressing",
    "moving forward",
    "proceeding",
    "continuing",
    "persisting",
    "persevering",
    "enduring",
    "sustaining",
    "maintaining",
    "preserving",
    "protecting",
    "guarding",
    "defending",
    "shielding",
    "sheltering",
    "covering",
    "concealing",
    "hiding",
    "masking",
    "disguising",
    "camouflaging",
    "obscuring",
    "veiling",
    "cloaking",
    "wrapping",
    "enveloping",
    "surrounding",
    "encircling",
    "encompassing",
    "including",
    "containing",
    "holding",
    "carrying",
    "bearing",
    "supporting",
    "sustaining",
    "maintaining",
    "preserving",
    "keeping",
    "retaining",
    "storing",
    "saving",
    "conserving",
    "reserving",
    "setting aside",
    "allocating",
    "assigning",
    "designating",
    "appointing",
    "naming",
    "calling",
    "labeling",
    "tagging",
    "marking",
    "identifying",
    "recognizing",
    "acknowledging",
    "noting",
    "observing",
    "noticing",
    "perceiving",
    "detecting",
    "discovering",
    "finding",
    "locating",
    "spotting",
    "seeing",
    "viewing",
    "watching",
    "looking",
    "gazing",
    "staring",
    "glancing",
    "peeking",
    "peeping",
    "observing",
    "examining",
    "inspecting",
    "scrutinizing",
    "analyzing",
    "studying",
    "investigating",
    "exploring",
    "researching",
    "searching",
    "seeking",
    "hunting",
    "pursuing",
    "chasing",
    "following",
    "tracking",
    "tracing",
    "trailing",
    "trailing",
    "shadowing",
    "stalking",
    "pursuing",
    "chasing",
    "hunting",
    "seeking",
    "searching",
    "looking for",
    "finding",
    "discovering",
    "uncovering",
    "revealing",
    "exposing",
    "showing",
    "displaying",
    "presenting",
    "demonstrating",
    "exhibiting",
    "illustrating",
    "depicting",
    "portraying",
    "representing",
    "showing",
    "displaying",
    "presenting",
    "demonstrating",
    "exhibiting",
    "illustrating",
    "depicting",
    "portraying",
    "representing",
    "characterizing",
    "describing",
    "explaining",
    "clarifying",
    "elucidating",
    "illuminating",
    "enlightening",
    "informing",
    "educating",
    "teaching",
    "instructing",
    "guiding",
    "directing",
    "leading",
    "conducting",
    "orchestrating",
    "coordinating",
    "managing",
    "administering",
    "overseeing",
    "supervising",
    "monitoring",
    "watching",
    "observing",
    "tracking",
    "following",
    "pursuing",
    "chasing",
    "hunting",
    "seeking",
    "searching",
    "looking",
    "finding",
    "discovering",
    "uncovering",
    "revealing",
    "exposing",
    "showing",
    "displaying",
    "presenting",
    "demonstrating",
    "exhibiting",
    "illustrating",
    "depicting",
    "portraying",
    "representing",
    "characterizing",
    "describing",
    "explaining",
    "clarifying",
    "elucidating",
    "illuminating",
    "enlightening",
    "informing",
    "educating",
    "teaching",
    "instructing",
    "guiding",
    "directing",
    "leading",
    "conducting",
    "orchestrating",
    "coordinating",
    "managing",
    "administering",
    "overseeing",
    "supervising",
    "monitoring",
    "diploma",
    "diplom",
    "certificate",
    "certification",
    "degree",
    "graduation",
    "graduate",
    "student",
    "school",
    "university",
    "college",
    "academy",
    "institution",
    "noel",
    "christmas",
    "holiday",
    "holidays",
    "vacation",
    "party",
    "festival",
    "festivities",
    "ceremony",
    "ritual",
    "tradition",
    "gift",
    "present",
    "reward",
    "trophy",
    "medal",
    "badge",
    "ribbon",
    "banner",
    "flag",
    "decoration",
    "ornament",
    "ornamentation",
    "adornment",
    "embellishment",
    "enhancement",
    "improvement",
    "upgrade",
    "refinement",
    "polish",
    "perfection",
    "optimization",
    "maximization",
    "amplification",
    "magnification",
    "enlargement",
    "increase",
    "augmentation",
    "boost",
    "raise",
    "elevation",
    "lift",
    "uplift",
    "inspiration",
    "motivation",
    "encouragement",
    "support",
    "backing",
    "endorsement",
    "approval",
    "validation",
    "confirmation",
    "verification",
    "authentication",
    "certification",
    "accreditation",
    "authorization",
    "licensing",
    "permission",
    "allowance",
    "enablement",
    "empowerment",
    "facilitation",
    "promotion",
    "advancement",
    "progress",
    "movement forward",
    "proceeding",
    "continuation",
    "persistence",
    "perseverance",
    "endurance",
    "sustainability",
    "maintenance",
    "preservation",
    "protection",
    "guard",
    "defense",
    "shield",
    "shelter",
    "cover",
    "concealment",
    "hiding",
    "masking",
    "disguise",
    "camouflage",
    "obscurity",
    "veil",
    "cloak",
    "wrap",
    "envelope",
    "surrounding",
    "encirclement",
    "encompassment",
    "inclusion",
    "containment",
    "holding",
    "carrying",
    "bearing",
    "supporting",
    "sustaining",
    "maintaining",
    "preserving",
    "keeping",
    "retaining",
    "storing",
    "saving",
    "conserving",
    "reserving",
    "setting aside",
    "allocation",
    "assignment",
    "designation",
    "appointment",
    "naming",
    "calling",
    "labeling",
    "tagging",
    "marking",
    "identification",
    "recognition",
    "acknowledgment",
    "noting",
    "observation",
    "noticing",
    "perception",
    "detection",
    "discovery",
    "finding",
    "location",
    "spotting",
    "seeing",
    "viewing",
    "watching",
    "looking",
    "gazing",
    "staring",
    "glancing",
    "peeking",
    "peeping",
    "observation",
    "examination",
    "inspection",
    "scrutiny",
    "analysis",
    "study",
    "investigation",
    "exploration",
    "research",
    "search",
    "seeking",
    "hunting",
    "pursuit",
    "chase",
    "following",
    "tracking",
    "tracing",
    "trailing",
    "shadowing",
    "stalking",
    "pursuit",
    "chase",
    "hunt",
    "search",
    "looking for",
    "finding",
    "discovery",
    "uncovering",
    "revealing",
    "exposure",
    "showing",
    "display",
    "presentation",
    "demonstration",
    "exhibition",
    "illustration",
    "depiction",
    "portrayal",
    "representation",
    "characterization",
    "description",
    "explanation",
    "clarification",
    "elucidation",
    "illumination",
    "enlightenment",
    "information",
    "education",
    "teaching",
    "instruction",
    "guidance",
    "direction",
    "leadership",
    "conduct",
    "orchestration",
    "coordination",
    "management",
    "administration",
    "oversight",
    "supervision",
    "monitoring"
  ],
  
  // Industries (0-1 tag par image)
  industry: [
    "technology",
    "software",
    "finance",
    "healthcare",
    "education",
    "retail",
    "manufacturing",
    "consulting",
    "media",
    "real estate",
    "hospitality",
    "transportation",
    "ai",
    "artificial intelligence",
    "intelligence artificielle",
    "machine learning",
    "deep learning",
    "neural network",
    "automation",
    "robotics",
    "cybersecurity",
    "cloud computing",
    "data science",
    "analytics",
    "big data",
    "internet of things",
    "iot",
    "blockchain",
    "cryptocurrency",
    "fintech",
    "edtech",
    "healthtech",
    "biotech",
    "nanotechnology",
    "quantum computing",
    "virtual reality",
    "vr",
    "augmented reality",
    "ar",
    "mixed reality",
    "mr",
    "metaverse",
    "web3",
    "nft",
    "crypto",
    "digital transformation",
    "innovation",
    "startup",
    "scaleup",
    "unicorn",
    "venture capital",
    "vc",
    "private equity",
    "pe",
    "mergers and acquisitions",
    "m&a",
    "ipo",
    "public offering",
    "stock market",
    "trading",
    "investment",
    "banking",
    "insurance",
    "accounting",
    "auditing",
    "legal",
    "law",
    "compliance",
    "regulation",
    "governance",
    "risk management",
    "project management",
    "operations",
    "supply chain",
    "logistics",
    "procurement",
    "sourcing",
    "vendor management",
    "contract management",
    "relationship management",
    "customer relationship management",
    "crm",
    "enterprise resource planning",
    "erp",
    "human resources",
    "hr",
    "talent management",
    "recruitment",
    "hiring",
    "onboarding",
    "training",
    "development",
    "performance management",
    "compensation",
    "benefits",
    "payroll",
    "time tracking",
    "attendance",
    "scheduling",
    "workforce management",
    "employee engagement",
    "employee experience",
    "employee satisfaction",
    "employee retention",
    "employee turnover",
    "employee productivity",
    "employee performance",
    "employee development",
    "employee growth",
    "employee success",
    "employee wellness",
    "employee health",
    "employee safety",
    "workplace safety",
    "occupational safety",
    "health and safety",
    "environmental health",
    "public health",
    "mental health",
    "wellness",
    "wellbeing",
    "fitness",
    "exercise",
    "sports",
    "athletics",
    "recreation",
    "leisure",
    "entertainment",
    "gaming",
    "video games",
    "esports",
    "streaming",
    "content creation",
    "social media",
    "social networking",
    "communication",
    "messaging",
    "chat",
    "video conferencing",
    "webinar",
    "online meeting",
    "virtual meeting",
    "remote work",
    "work from home",
    "wfh",
    "hybrid work",
    "flexible work",
    "work life balance",
    "work life integration",
    "work life harmony",
    "work life blend",
    "work life mix",
    "work life combination",
    "work life fusion",
    "work life unity",
    "work life synergy",
    "work life alignment",
    "work life coordination",
    "work life synchronization",
    "work life harmony",
    "work life balance",
    "work life integration",
    "work life blend",
    "work life mix",
    "work life combination",
    "work life fusion",
    "work life unity",
    "work life synergy",
    "work life alignment",
    "work life coordination",
    "work life synchronization"
  ]
};

// Fonction pour obtenir tous les tags valides
const getAllValidTags = () => {
  return [
    ...TAXONOMY_V1.business,
    ...TAXONOMY_V1.visual,
    ...TAXONOMY_V1.industry
  ];
};

// Fonction pour valider un tag contre la taxonomie
// MODIFIÉ : Accepte maintenant TOUS les tags valides (non vides, en anglais de préférence)
const isValidTag = (tag) => {
  if (!tag || typeof tag !== "string") return false;
  
  // Normaliser le tag : minuscules, espaces multiples réduits, tirets et underscores remplacés par espaces
  let normalizedTag = tag.toLowerCase().trim()
    .replace(/[_-]/g, ' ')  // Remplacer tirets et underscores par espaces
    .replace(/\s+/g, ' ')   // Réduire les espaces multiples à un seul espace
    .trim();
  
  // Accepter tous les tags non vides (plus de validation stricte)
  if (normalizedTag.length === 0) return false;
  
  // Vérifier d'abord si le tag est dans la taxonomie (pour garder la cohérence)
  const allTags = getAllValidTags();
  
  // Vérification exacte d'abord
  if (allTags.includes(normalizedTag)) {
    return true;
  }
  
  // Vérification sans espaces (pour "meeting room" vs "meetingroom")
  const tagWithoutSpaces = normalizedTag.replace(/\s/g, '');
  const allTagsWithoutSpaces = allTags.map(t => t.replace(/\s/g, ''));
  if (allTagsWithoutSpaces.includes(tagWithoutSpaces)) {
    return true;
  }
  
  // ACCEPTER TOUS LES AUTRES TAGS (plus de rejet)
  // Cela permet d'accepter des tags comme "drawing", "illustration", etc. même s'ils ne sont pas dans la liste
  return true;
};

// Fonction pour valider un tableau de tags
const validateTags = (tags) => {
  if (!Array.isArray(tags)) return { valid: false, errors: ["Tags must be an array"] };
  
  const errors = [];
  const validTags = [];
  const invalidTags = [];
  
  // Accepter TOUS les tags non vides sans validation de taxonomie
  tags.forEach((tag, index) => {
    if (!tag || typeof tag !== "string") {
      errors.push(`Tag at index ${index} is invalid (must be a non-empty string)`);
      return;
    }
    
    // Normaliser le tag simplement
    let normalizedTag = tag.toLowerCase().trim()
      .replace(/[_-]/g, ' ')  // Remplacer tirets et underscores par espaces
      .replace(/\s+/g, ' ')   // Réduire les espaces multiples à un seul espace
      .trim();
    
    // Accepter tous les tags non vides (plus de vérification de taxonomie)
    if (normalizedTag.length > 0) {
      validTags.push(normalizedTag);
    } else {
      invalidTags.push(normalizedTag);
    }
  });
  
  // Vérifier qu'il y a au moins un tag valide
  if (validTags.length === 0) {
    errors.push(`No valid tags found`);
  }
  
  // Ne plus forcer exactement 10 tags - laisser ensureTagsCount dans server.js gérer la plage 8-20
  // Retourner les tags validés tels quels (sans complétion ni troncature)
  return {
    valid: validTags.length > 0,
    errors: errors,
    validTags: validTags, // Retourner les tags tels quels, sans forcer un nombre spécifique
    invalidTags
  };
};

// Fonction pour réordonner et optimiser les tags selon les priorités
// Priorité 1: Sujets business (1-2 tags max)
// Priorité 2: Contexte professionnel (professional, business, corporate, office, workspace)
// Priorité 3: Éléments visuels (le reste)
// Supprime les tags redondants ou trop génériques
const optimizeAndReorderTags = (tags) => {
  if (!Array.isArray(tags) || tags.length === 0) return tags;
  
  // Normaliser tous les tags en minuscules
  const normalizedTags = tags.map(tag => tag.toLowerCase().trim()).filter(tag => tag.length > 0);
  
  // Séparer les tags par catégorie
  const businessTags = [];
  const professionalContextTags = [];
  const industryTags = [];
  const visualTags = [];
  
  // Tags de contexte professionnel (priorité 2)
  const professionalContextSet = new Set([
    "professional", "business", "corporate", "office", "workspace", 
    "modern", "formal", "casual"
  ]);
  
  normalizedTags.forEach(tag => {
    if (TAXONOMY_V1.business.includes(tag)) {
      businessTags.push(tag);
    } else if (TAXONOMY_V1.industry.includes(tag)) {
      industryTags.push(tag);
    } else if (professionalContextSet.has(tag)) {
      professionalContextTags.push(tag);
    } else if (TAXONOMY_V1.visual.includes(tag)) {
      visualTags.push(tag);
    }
  });
  
  // Supprimer les redondances dans les sujets business
  // Prioriser les tags plus spécifiques
  const businessPriority = {
    "entrepreneurship": 10, "innovation": 9, "leadership": 8, "teamwork": 7,
    "collaboration": 7, "strategy": 6, "growth": 5, "success": 4,
    "startup": 8, "customer_success": 7, "product_launch": 7,
    "meeting": 6, "workshop": 6, "training": 6, "conference": 6, "event": 5,
    "networking": 5, "marketing": 5, "sales": 5, "consulting": 5,
    "coaching": 5, "mentoring": 5,
    "business": 3, "corporate": 2, "professional": 1 // Plus génériques en dernier
  };
  
  // Trier les tags business par priorité et prendre les 2 meilleurs
  const uniqueBusinessTags = [...new Set(businessTags)]
    .sort((a, b) => (businessPriority[b] || 0) - (businessPriority[a] || 0))
    .slice(0, 2);
  
  // Optimiser les tags de contexte professionnel (supprimer redondances)
  // Priorité: business > corporate > professional
  let optimizedProfessionalContext = [];
  if (professionalContextTags.includes("business")) {
    optimizedProfessionalContext.push("business");
  } else if (professionalContextTags.includes("corporate")) {
    optimizedProfessionalContext.push("corporate");
  } else if (professionalContextTags.includes("professional")) {
    optimizedProfessionalContext.push("professional");
  }
  
  // Ajouter les autres tags de contexte non redondants
  const otherContextTags = professionalContextTags.filter(tag => 
    !["business", "corporate", "professional"].includes(tag)
  );
  optimizedProfessionalContext.push(...otherContextTags.slice(0, 2)); // Max 2-3 tags de contexte
  
  // Optimiser les tags visuels (supprimer redondances)
  // Exemples de redondances: person/portrait, desk/workspace, laptop/computer
  const visualRedundancies = {
    "portrait": ["person", "people"],
    "people": ["person"],
    "workspace": ["desk", "office"],
    "desk": ["workspace"],
    "computer": ["laptop", "screen"],
    "laptop": ["computer"],
    "team": ["people", "person"],
    "meeting_room": ["office", "workspace"],
    "conference_room": ["meeting_room", "office"]
  };
  
  const optimizedVisualTags = [];
  const usedVisualTags = new Set();
  
  // Trier les tags visuels par spécificité (plus spécifiques en premier)
  const visualPriority = {
    "portrait": 10, "team": 9, "meeting_room": 8, "conference_room": 8,
    "whiteboard": 8, "presentation": 8, "dashboard": 8, "laptop": 7,
    "computer": 6, "desk": 7, "workspace": 6, "office": 5,
    "person": 4, "people": 3
  };
  
  const sortedVisualTags = [...new Set(visualTags)]
    .sort((a, b) => (visualPriority[b] || 0) - (visualPriority[a] || 0));
  
  sortedVisualTags.forEach(tag => {
    // Vérifier si ce tag n'est pas redondant avec un tag déjà ajouté
    let isRedundant = false;
    for (const [key, redundants] of Object.entries(visualRedundancies)) {
      if (tag === key && redundants.some(r => usedVisualTags.has(r))) {
        isRedundant = true;
        break;
      }
      if (redundants.includes(tag) && usedVisualTags.has(key)) {
        isRedundant = true;
        break;
      }
    }
    
    if (!isRedundant && !usedVisualTags.has(tag)) {
      optimizedVisualTags.push(tag);
      usedVisualTags.add(tag);
      // Marquer les tags redondants comme utilisés
      if (visualRedundancies[tag]) {
        visualRedundancies[tag].forEach(r => usedVisualTags.add(r));
      }
    }
  });
  
  // Limiter les tags visuels à 7 maximum
  optimizedVisualTags.splice(7);
  
  // Limiter les tags industry à 1 maximum
  const uniqueIndustryTags = [...new Set(industryTags)].slice(0, 1);
  
  // Assembler le résultat final dans l'ordre de priorité
  let result = [
    ...uniqueBusinessTags,           // 1-3 tags business
    ...optimizedProfessionalContext, // 0-3 tags contexte professionnel
    ...optimizedVisualTags,          // 3-7 tags visuels
    ...uniqueIndustryTags            // 0-1 tag industry
  ];
  
  // Ne plus forcer exactement 10 tags - laisser ensureTagsCount dans server.js gérer la plage 8-20
  // Retourner les tags optimisés tels quels (sans complétion ni troncature forcée)
  return result; // Retourner les tags optimisés (peut être entre 0 et plus de 20)
};

// Fonction pour valider le style
const validateStyle = (style) => {
  if (!style || typeof style !== "string") return { valid: false, error: "Style must be a non-empty string" };
  const normalizedStyle = style.toLowerCase().trim();
  if (ALLOWED_STYLES.includes(normalizedStyle)) {
    return { valid: true, style: normalizedStyle };
  }
  return { valid: false, error: `Style "${normalizedStyle}" is not allowed. Allowed styles: ${ALLOWED_STYLES.join(", ")}` };
};

// Fonction pour valider la présence de personnes
const validatePersonPresence = (p) => {
  if (p === 0 || p === 1 || p === 2) {
    return { valid: true, p };
  }
  if (typeof p === "number") {
    return { valid: false, error: `Person presence must be 0, 1, or 2, got ${p}` };
  }
  return { valid: false, error: `Person presence must be a number (0, 1, or 2), got ${typeof p}` };
};

// Fonction pour valider les exclusions
const validateExclusions = (x) => {
  if (!Array.isArray(x)) return { valid: false, errors: ["Exclusions must be an array"] };
  
  if (x.length > 4) {
    return { valid: false, errors: [`Too many exclusions: ${x.length} (maximum 4 allowed)`] };
  }
  
  const errors = [];
  const validExclusions = [];
  const invalidExclusions = [];
  
  x.forEach((exclusion, index) => {
    if (!exclusion || typeof exclusion !== "string") {
      errors.push(`Exclusion at index ${index} is invalid (must be a non-empty string)`);
      return;
    }
    
    const normalizedExclusion = exclusion.toLowerCase().trim();
    if (ALLOWED_EXCLUSIONS.includes(normalizedExclusion)) {
      validExclusions.push(normalizedExclusion);
    } else {
      invalidExclusions.push(normalizedExclusion);
      errors.push(`Exclusion "${normalizedExclusion}" is not allowed. Allowed: ${ALLOWED_EXCLUSIONS.join(", ")}`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    validExclusions,
    invalidExclusions
  };
};

// Fonction pour valider le schéma compact complet d'une image
const validateCompactSchema = (image) => {
  const errors = [];
  
  // Valider id (optionnel car peut être généré par Firestore)
  if (image.id !== undefined && image.id !== null && (typeof image.id !== "string" || image.id.trim() === "")) {
    errors.push("Invalid 'id' field (must be a non-empty string if provided)");
  }
  
  // Valider url
  if (!image.url || typeof image.url !== "string") {
    errors.push("Missing or invalid 'url' field (must be a non-empty string)");
  }
  
  // Valider tags (t)
  const tagsValidation = validateTags(image.t || image.tags || []);
  if (!tagsValidation.valid) {
    errors.push(...tagsValidation.errors);
  }
  
  // Optimiser et réordonner les tags validés
  const optimizedTags = optimizeAndReorderTags(tagsValidation.validTags || []);
  
  // Valider présence de personnes (p)
  const pValidation = validatePersonPresence(image.p ?? image.context?.p ?? 1);
  if (!pValidation.valid) {
    errors.push(pValidation.error);
  }
  
  // Valider style (s)
  const styleValidation = validateStyle(image.s || image.context?.s || "photo");
  if (!styleValidation.valid) {
    errors.push(styleValidation.error);
  }
  
  // Valider exclusions (x)
  const exclusionsValidation = validateExclusions(image.x || image.context?.x || []);
  if (!exclusionsValidation.valid) {
    errors.push(...exclusionsValidation.errors);
  }
  
  // Valider description (d)
  let description = image.d || image.description || "";
  if (!description || typeof description !== "string" || description.trim() === "" || description.toLowerCase() === "n/a") {
    description = "Image visuelle professionnelle.";
  } else {
    description = description.trim();
  }
  
  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      id: image.id,
      url: image.url,
      t: optimizedTags, // Tags optimisés et réordonnés
      p: pValidation.p ?? 1,
      s: styleValidation.style || "photo",
      x: exclusionsValidation.validExclusions || [],
      d: description
    }
  };
};

module.exports = {
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
};

