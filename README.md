## 📋 Overview

Lyter is an intelligent platform that combines AI-powered photo generation and content creation for professional use. It offers multiple modes to create professional photos, LinkedIn illustrations, and content recommendations based on your needs.

## ✨ Features

### 🎨 Multiple Generation Modes

1. **Mode Select** - Style-based photo generation
   - 39 professional styles available
   - Upload up to 10 photos
   - Generate 1-4 images per session
   - Styles include: portraits, selfies, workspace shots, product photos, and more

2. **Mode Post** - AI-powered auto-prompt generation
   - Upload 1-2 selfies
   - Input LinkedIn post text
   - AI generates optimized prompts automatically
   - Creates 2 personalized images

3. **Mode Lab** - Smart image selection & analysis
   - Fetch visuals from LinkedIn profiles and websites
   - Analyze post text to understand intent
   - AI recommends top 4 most relevant images
   - Advanced matching with scoring and reasoning

4. **Mode Lyter** - Conceptual illustration generator
   - Generate professional illustrations from post text
   - No human faces - pure conceptual visuals
   - 10+ illustration styles (infographics, metaphors, processes, etc.)
   - Perfect for LinkedIn content

### 🔑 Key Capabilities

- **AI Image Generation** - Powered by Google Gemini 2.5 Flash
- **Smart Prompt Engineering** - OpenAI GPT-4 for intelligent prompt optimization
- **Image Compression** - Automatic optimization for faster processing
- **Cloud Storage** - Firebase integration for secure image storage
- **Tag System** - Comprehensive image tagging with 100+ predefined tags
- **Context Analysis** - Understands post intent and recommends matching visuals

## 🛠️ Technology Stack

### Backend
- **Node.js** + **Express.js**
- **Firebase Admin SDK** (Firestore + Storage)
- **Google Gemini API** (Image generation)
- **OpenAI API** (GPT-4o-mini for text analysis)
- **bcryptjs** (Password hashing)
- **JWT** (Authentication)

### Frontend
- **React** (Create React App)
- **CSS3** (Custom styling)
- **Fetch API** (HTTP requests)
  
### APIs externes

* API LinkedIn (visuels de profil)

---

## 📦 Installation

### Prerequisites
- Node.js 16+
- npm or yarn
- Firebase project with Firestore & Storage enabled
- Google Gemini API key
- OpenAI API key

### Backend Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/stage-ghofrane.git
cd stage-ghofrane
```

2. Install backend dependencies:
```bash
npm install
```

3. Create `.env` file in the root directory:
```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY="your-private-key"
FIREBASE_STORAGE_BUCKET=your-bucket.firebasestorage.app

# API Keys
GOOGLE_API_KEY=your-google-gemini-api-key
OPENAI_API_KEY=your-openai-api-key
RAPIDAPI_KEY=your-rapidapi-key

# Server Configuration
PORT=5000
SECRET_KEY=your-jwt-secret-key
OPENAI_MODEL=gpt-4o-mini

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

4. Start the backend server:
```bash
npm start
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory (or create one):
```bash
cd frontend
```

2. Install frontend dependencies:
```bash
npm install
```

3. Create `.env` file in the frontend directory:
```env
REACT_APP_API_URL=http://localhost:5000
```

4. Start the React development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## 🚀 Usage

### 1. Sign Up / Login
- Create an account with email and password
- Login to access all features

### 2. Mode Select (Style-Based)
- Upload 1-10 photos
- Choose from 39 professional styles
- Select number of images to generate (1-4)
- Click "Generate my image"

### 3. Mode Post (Auto-Prompt)
- Upload 1-2 selfies
- Enter or select a predefined LinkedIn post
- AI generates optimized prompts
- Creates 2 personalized images

### 4. Mode Lab (Smart Selection)
- Enter personal information (name, LinkedIn, website)
- Click "Fetch Visuals" to retrieve images
- Enter post text and click "Analyze Post"
- Click "Select Image" to get AI recommendations
- Save your selected image

### 5. Mode Lyter (Illustrations)
- Enter LinkedIn post text
- Choose illustration style (optional)
- Generate conceptual illustration
- Download or save your illustration

## 📊 API Endpoints

### Authentication
- `POST /signup` - Create new account
- `POST /login` - Login user
- `DELETE /delete/:email` - Delete profile

### Image Generation
- `POST /generate` - Generate images (Mode Select)
- `POST /generate-auto` - Generate with auto-prompt (Mode Post)
- `POST /generate-lyter` - Generate illustrations (Mode Lyter)

### Lab Mode
- `POST /ingest` - Fetch visuals from web sources
- `POST /post/analyze` - Analyze post text
- `POST /select-optimal` - Optimal selection algorithm
- `POST /select/save` - Save selected image
### Gallery
- `GET /gallery/:email` - Get user gallery
- `GET /gallery/lab/:email` - Get Lab gallery

## 🎯 Image Generation Flow
```
User Uploads Photos
        ↓
   Select Mode
    ↙  ↓  ↓  ↘
Select Post Lab Lyter
   ↓    ↓    ↓    ↓
Style Text Fetch Text
   ↓    ↓    ↓    ↓
Generate → Gemini API → Firebase Storage → Display
```

## 📝 Image Schema (Compact Format)

Lyter uses a compact JSON schema for image metadata:
```json
{
  "id": "img_xxxx",
  "u": "https://storage.googleapis.com/...",
  "t": ["portrait", "professional", "office"],
  "p": 2,
  "s": "photo",
  "x": [],
  "d": "Professional portrait in modern office setting"
}
```

**Field Definitions:**
- `id`: Unique identifier
- `u`: URL or storage key
- `t`: Tags (5-20 relevant tags)
- `p`: Person presence (0=none, 1=group, 2=portrait)
- `s`: Style (photo/illu/3d/icon)
- `x`: Exclusions (if any)
- `d`: Description (1 sentence)

## 🔒 Security Features

- **Password Hashing** - bcrypt with salt rounds
- **JWT Authentication** - Secure token-based auth
- **CORS Protection** - Whitelist allowed origins
- **Input Validation** - Server-side validation
- **Firebase Rules** - Secure database access

## 🌐 Deployment

### Backend Deployment (Render/Heroku)

1. Set environment variables in your hosting platform
2. Update `FRONTEND_URL` to production URL
3. Deploy using Git push or CLI

### Frontend Deployment (Vercel/Netlify)

1. Build the production bundle
```bash
npm run build
```

2. Deploy the `build` folder
3. Update `REACT_APP_API_URL` to production backend URL

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google Gemini** - AI image generation
- **OpenAI** - GPT-4 for text analysis
- **Firebase** - Cloud storage and database
- **React** - Frontend framework
- **Express.js** - Backend framework

## 📧 Contact

- **Project Link**: [https://github.com/yourusername/lyter](https://github.com/yourusername/lyter)
- **Issues**: [https://github.com/yourusername/lyter/issues](https://github.com/yourusername/lyter/issues)

## 🔄 Changelog

### v1.0.0 (2025-01-07)
- ✨ Initial release
- 🎨 4 generation modes (Select, Post, Lab, Lyter)
- 🔥 39 professional styles
- 🤖 AI-powered prompt generation
- 📊 Smart image selection with scoring
- 🎯 Conceptual illustration generator

---

## 👩‍💻 Auteur

Projet développé dans un cadre professionnel / stage.

🔗 GitHub : https://github.com/GHOFRANE-AH?tab=repositories
