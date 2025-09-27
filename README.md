# BrainKick 

A gamified brain-training platform with AI-powered puzzle validation, hints, and explanations.

## Features
- 4 puzzle categories: Logic, Math, Wordplay, Pattern Recognition  
- Progressive levels (3 puzzles per level)
- Daily streak tracking
- AI-powered answer validation (tolerant to spelling/phrasing)
- Smart hints and explanations via OpenAI GPT
- User progress tracking and statistics

## Tech Stack
- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB + Mongoose
- **AI**: OpenAI GPT API
- **Auth**: JWT tokens

## Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- OpenAI API key

## Quick Start

### 1. Backend Setup
```bash
cd server
cp .env.example .env
# Edit .env with your MongoDB URI and OpenAI API key
npm install
npm run seed  # Load sample puzzles
npm run dev   # Start server on http://localhost:4000
```

### 2. Frontend Setup
```bash
cd ../client
cp .env.example .env
npm install
npm run dev   # Start client on http://localhost:5173
```

### 3. Environment Variables

**Backend (.env)**:
```
MONGODB_URI=mongodb://localhost:27017/brainkick
JWT_SECRET=your-super-long-secret-key-here
OPENAI_API_KEY=sk-your-openai-key-here
CLIENT_ORIGIN=http://localhost:5173
```

**Frontend (.env)**:
```
VITE_API_BASE_URL=http://localhost:4000/api
```

## API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/puzzles` - Get puzzles by category/level
- `POST /api/puzzles/:id/validate` - AI answer validation
- `POST /api/puzzles/:id/hint` - Get AI-generated hint
- `POST /api/puzzles/:id/explanation` - Get solution explanation
- `GET /api/stats` - User progress statistics

## Deployment
- Backend: Deploy to Railway, Render, or Heroku
- Frontend: Deploy to Vercel or Netlify
- Database: MongoDB Atlas (free tier available)

## Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
