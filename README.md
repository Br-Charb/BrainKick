# 🧠 BrainKick

**Where Mental Fitness Meets Fun**

A comprehensive brain training platform that gamifies cognitive development through structured puzzle-solving across multiple categories and difficulty levels.

## 🎯 Overview

BrainKick transforms traditional brain training into an engaging, measurable experience. Users progress through carefully curated puzzles in four core categories while tracking their improvement through detailed statistics and streak systems.

## ✨ Features

### 🧩 Four Training Categories
- **Math**: Arithmetic, algebra, geometry, and advanced mathematical concepts
- **Logic**: Reasoning, deduction, syllogisms, and critical thinking
- **Riddles**: Word puzzles, brain teasers, and creative problem-solving
- **Patterns**: Sequences, recognition, and cognitive flexibility

### 📊 Progressive Learning System
- **3 Difficulty Levels** per category (Easy → Medium → Hard)
- **5 Puzzles per level** (60 total puzzles)
- **Structured unlock system** - complete levels to advance
- **Detailed explanations** with mathematical rendering (LaTeX support)

### 🎮 Gamification & Engagement
- **Daily streak tracking** with visual celebrations
- **Real-time progress monitoring** across all categories
- **Achievement celebrations** with confetti animations
- **Hint system** for guided learning
- **Skip functionality** with full solution explanations

### 📈 Analytics & Progress Tracking
- Individual user accounts with secure authentication
- Weekly activity charts showing solving patterns
- Comprehensive statistics (streaks, total puzzles, time spent)
- Per-category and per-level progress tracking
- Duplicate puzzle prevention system

## 🛠 Tech Stack

### Frontend
- **React 18** with modern hooks (useState, useEffect)
- **Responsive design** with CSS-in-JS styling
- **ReactMarkdown** with LaTeX support (KaTeX)
- **Confetti animations** for user engagement
- **Axios** for API communication

### Backend
- **Node.js** with Express.js framework
- **RESTful API design** with proper HTTP status codes
- **JWT authentication** for secure user sessions
- **bcrypt** for password hashing
- **CORS** configured for cross-origin requests

### Database & Storage
- **MongoDB** with Mongoose ODM for production
- **In-memory fallback** for development/testing
- **Optimized schemas** for user progress and statistics
- **Compound indexing** for efficient queries

### AI Integration
- **OpenAI GPT-3.5** for intelligent answer validation
- **Flexible answer matching** (accepts "8" and "eight")
- **Dynamic hint generation** as backup to curated hints
- **Graceful fallback** when AI services unavailable

## 🚀 Getting Started

### Prerequisites
```bash
node >= 16.0.0
npm >= 8.0.0
mongodb >= 5.0.0 (optional - uses in-memory storage as fallback)
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/brainkick.git
cd brainkick
```

2. **Install dependencies**
```bash
# Backend dependencies
cd server
npm install

# Frontend dependencies  
cd ../client
npm install
```

3. **Environment Configuration**
Create `.env` file in server directory:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/brainkick

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-here

# AI Integration (optional)
OPENAI_API_KEY=your-openai-api-key

# Server Config
PORT=4000
NODE_ENV=development
```

4. **Start the application**
```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - Frontend  
cd client
npm start
```

5. **Access the application**
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`

## 📁 Project Structure

```
brainkick/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.js         # Main application component
│   │   └── index.js       # React entry point
│   └── public/
├── server/                # Node.js backend
│   ├── server.js          # Express server & API routes
│   ├── models/            # MongoDB/Mongoose schemas
│   └── middleware/        # Authentication & validation
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Puzzles
- `GET /api/puzzles?category={category}&level={level}` - Get puzzles
- `POST /api/puzzles/:id/validate` - Submit answer for validation
- `POST /api/puzzles/:id/hint` - Get puzzle hint
- `POST /api/puzzles/:id/skip` - Skip puzzle and see solution

### User Progress
- `GET /api/stats` - User statistics and streaks
- `GET /api/progress` - Level completion progress
- `POST /api/stats/time` - Update time spent training

### System
- `GET /api/health` - System health check

## 🎨 Key Features Implementation

### Intelligent Answer Validation
```javascript
// Multiple validation layers
const normalizedAnswer = answer.toLowerCase().trim()
  .replace(/[.,!?;]/g, '')
  .replace(/\s+/g, ' ');

// AI fallback for complex validation
if (!localMatch && openai) {
  const aiValidation = await openai.chat.completions.create({...});
}
```

### Progress Tracking System
```javascript
// Prevents duplicate counting
const updateStreak = async (userId, puzzleId) => {
  if (streak.solvedPuzzles.includes(puzzleId)) {
    return; // Already counted
  }
  // Update streak and statistics
};
```

### Responsive Design
- Mobile-first approach with CSS Grid and Flexbox
- Glassmorphism UI with backdrop-filter effects
- Smooth transitions and hover states
- Optimized for desktop, tablet, and mobile

## 🔒 Security Features

- **Password Hashing**: bcrypt with salt rounds
- **JWT Tokens**: Stateless authentication with expiration
- **Input Validation**: Request sanitization and validation
- **CORS Configuration**: Controlled cross-origin access
- **Environment Variables**: Sensitive data protection

## 📊 Database Schema

### Users Collection
```javascript
{
  username: String (unique),
  email: String (unique), 
  password: String (hashed),
  createdAt: Date
}
```

### Streaks Collection
```javascript
{
  userId: ObjectId,
  currentStreak: Number,
  longestStreak: Number,
  totalPuzzlesSolved: Number,
  solvedPuzzles: [String], // Puzzle IDs
  solvedHistory: [{ puzzleId: String, solvedAt: Date }],
  totalTimeSpent: Number
}
```

### Level Progress Collection
```javascript
{
  userId: ObjectId,
  category: String,
  level: Number,
  completed: Boolean,
  puzzlesSolved: Number,
  solvedPuzzleIds: [String]
}
```

## 🚧 Development Notes

### Running Tests
```bash
# Backend tests
cd server && npm test

# Frontend tests  
cd client && npm test
```

### Code Quality
- ESLint configuration for consistent code style
- Error boundary implementation for React components
- Comprehensive error handling in API routes
- Logging system for debugging and monitoring

### Performance Optimizations
- MongoDB compound indexes for efficient queries
- React component optimization with proper key props
- Lazy loading for heavy dependencies
- Efficient state management patterns

## 🔄 Future Enhancements

- **Multiplayer Challenges**: Compete with friends in real-time
- **Adaptive Difficulty**: AI-powered difficulty adjustment based on performance
- **Extended Categories**: Science, History, Language puzzles
- **Mobile App**: Native iOS and Android applications
- **Analytics Dashboard**: Advanced progress visualization
- **Social Features**: Leaderboards and community challenges

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Authors

- **Your Team Name** - Initial work and development

## 🙏 Acknowledgments

- OpenAI for intelligent answer validation
- MongoDB team for excellent documentation
- React community for comprehensive ecosystem
- Mathematical puzzle creators for inspiration

---

**Ready to train your brain?** Start your journey to mental fitness with BrainKick today!
