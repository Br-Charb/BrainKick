#!/bin/bash

# BrainKick MVP Setup Script for Mac
# Run this script to create the complete project structure

echo "🧠 Setting up BrainKick MVP..."

# Create project structure
mkdir -p brainkick/{server/{src/{controllers,models,routes,services,utils},scripts},client/{src/{api,components,pages}}}
cd brainkick

# Initialize git repository
git init
echo "node_modules/
.env
.DS_Store
dist/
build/
*.log" > .gitignore

# Create main README
cat > README.md << 'EOF'
# BrainKick 🧠⚡

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

Built with ❤️ for brain training enthusiasts!
EOF

# Backend setup
cd server
cat > package.json << 'EOF'
{
  "name": "brainkick-server",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "seed": "node scripts/seed.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.6.0",
    "openai": "^4.56.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
EOF

cat > .env.example << 'EOF'
PORT=4000
MONGODB_URI=mongodb://localhost:27017/brainkick
JWT_SECRET=your-super-secret-jwt-key-make-it-very-long-and-random
OPENAI_API_KEY=sk-your-openai-api-key-here
CLIENT_ORIGIN=http://localhost:5173
EOF

# Server entry point
cat > src/index.js << 'EOF'
import 'dotenv/config';
import app from './server.js';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🧠 BrainKick server running on port ${PORT}`);
});
EOF

# Main server file
cat > src/server.js << 'EOF'
import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './utils/db.js';
import authRoutes from './routes/auth.js';
import puzzleRoutes from './routes/puzzles.js';
import statsRoutes from './routes/stats.js';

const app = express();

// CORS configuration
const allowedOrigins = process.env.CLIENT_ORIGIN?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Connect to database
await connectToDatabase();

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'BrainKick' }));
app.use('/api/auth', authRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api/stats', statsRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

export default app;
EOF

# Database connection
cat > src/utils/db.js << 'EOF'
import mongoose from 'mongoose';

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) return;
  
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set');
    process.exit(1);
  }
  
  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}
EOF

# Auth utilities
cat > src/utils/auth.js << 'EOF'
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
EOF

# User model
cat > src/models/User.js << 'EOF'
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model('User', userSchema);
EOF

# Puzzle model
cat > src/models/Puzzle.js << 'EOF'
import mongoose from 'mongoose';

const puzzleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  prompt: { type: String, required: true },
  category: { 
    type: String, 
    required: true, 
    enum: ['logic', 'math', 'wordplay', 'pattern'] 
  },
  level: { type: Number, required: true, min: 1 },
  position: { type: Number, required: true, min: 0 }, // 0, 1, or 2 for each level
  correctAnswers: [{ type: String, required: true }], // Multiple acceptable answers
  hints: [{ type: String }], // Pre-written hints as fallback
  explanation: { type: String }, // Pre-written explanation as fallback
  difficulty: { type: Number, default: 1 }, // 1-5 scale
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique puzzle per category/level/position
puzzleSchema.index({ category: 1, level: 1, position: 1 }, { unique: true });

export default mongoose.model('Puzzle', puzzleSchema);
EOF

# Progress model
cat > src/models/Progress.js << 'EOF'
import mongoose from 'mongoose';

const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  level: { type: Number, required: true },
  puzzlesSolved: { type: Number, default: 0 }, // 0-3 for each level
  completed: { type: Boolean, default: false },
  accuracy: { type: Number, default: 0 }, // percentage
  attempts: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: Date.now },
  unlockedAt: { type: Date, default: Date.now }
});

// Compound index for user/category/level
progressSchema.index({ userId: 1, category: 1, level: 1 }, { unique: true });

export default mongoose.model('Progress', progressSchema);
EOF

# Streak model
cat > src/models/Streak.js << 'EOF'
import mongoose from 'mongoose';

const streakSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActivityDate: { type: Date },
  totalPuzzlesSolved: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Streak', streakSchema);
EOF

# OpenAI service
cat > src/services/openai.js << 'EOF'
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function validateAnswer(puzzle, userAnswer) {
  try {
    const prompt = `
You are validating answers for a brain teaser game called BrainKick.

Puzzle: "${puzzle.prompt}"
Expected answers: ${puzzle.correctAnswers.join(', ')}
User's answer: "${userAnswer}"

Determine if the user's answer is correct, considering:
- Minor spelling mistakes
- Alternative phrasings that mean the same thing
- Synonyms
- Different number formats (e.g., "8" vs "eight")
- Case sensitivity doesn't matter

Respond with JSON only:
{
  "correct": true/false,
  "message": "Brief encouraging message (max 50 words)"
}
`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
    });

    const response = completion.choices[0].message.content;
    return JSON.parse(response);
  } catch (error) {
    console.error('OpenAI validation error:', error);
    // Fallback to simple string matching
    const isCorrect = puzzle.correctAnswers.some(answer => 
      answer.toLowerCase().trim() === userAnswer.toLowerCase().trim()
    );
    return {
      correct: isCorrect,
      message: isCorrect ? "Correct! Nice thinking! 🎉" : "Not quite right. Give it another shot! 🤔"
    };
  }
}

export async function generateHint(puzzle) {
  try {
    const prompt = `
Generate a helpful hint for this BrainKick puzzle without giving away the answer:

Puzzle: "${puzzle.prompt}"
Answer: ${puzzle.correctAnswers[0]}

Provide a subtle hint that guides thinking without revealing the solution. 
Keep it under 40 words and make it encouraging.
`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI hint error:', error);
    // Return pre-written hint or generic one
    return puzzle.hints[0] || "Think step by step. What patterns do you notice? 🧩";
  }
}

export async function generateExplanation(puzzle, userAnswer) {
  try {
    const prompt = `
Explain the solution to this BrainKick puzzle in a clear, educational way:

Puzzle: "${puzzle.prompt}"
Correct answer: ${puzzle.correctAnswers[0]}
User's answer: "${userAnswer}"

Provide a brief explanation of the logic/reasoning. 
Keep it under 80 words and be encouraging.
`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI explanation error:', error);
    return puzzle.explanation || "Great job solving this puzzle! The key was recognizing the pattern. 🎯";
  }
}
EOF

# Auth controller
cat > src/controllers/authController.js << 'EOF'
import User from '../models/User.js';
import Streak from '../models/Streak.js';
import { generateToken } from '../utils/auth.js';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export async function register(req, res) {
  try {
    const { username, email, password } = registerSchema.parse(req.body);
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email ? 'Email already registered' : 'Username taken' 
      });
    }

    // Create user
    const user = new User({ username, email, password });
    await user.save();

    // Create streak record
    await Streak.create({ userId: user._id });

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'Welcome to BrainKick! 🧠⚡',
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user._id);
    res.json({
      message: 'Welcome back to BrainKick! 🎯',
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Login failed' });
  }
}
EOF

# Puzzle controller  
cat > src/controllers/puzzleController.js << 'EOF'
import Puzzle from '../models/Puzzle.js';
import Progress from '../models/Progress.js';
import Streak from '../models/Streak.js';
import { validateAnswer, generateHint, generateExplanation } from '../services/openai.js';

export async function getPuzzles(req, res) {
  try {
    const { category, level } = req.query;
    
    if (!category || !level) {
      return res.status(400).json({ error: 'Category and level are required' });
    }

    const puzzles = await Puzzle.find({ category, level }).sort({ position: 1 });
    res.json({ puzzles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch puzzles' });
  }
}

export async function validatePuzzleAnswer(req, res) {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    const userId = req.user._id;

    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    const puzzle = await Puzzle.findById(id);
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    // Validate answer using AI
    const validation = await validateAnswer(puzzle, answer.trim());

    // Update progress
    let progress = await Progress.findOne({
      userId,
      category: puzzle.category,
      level: puzzle.level
    });

    if (!progress) {
      progress = new Progress({
        userId,
        category: puzzle.category,
        level: puzzle.level
      });
    }

    progress.attempts++;
    progress.lastAttemptAt = new Date();

    if (validation.correct) {
      progress.correctAnswers++;
      progress.puzzlesSolved = Math.min(progress.puzzlesSolved + 1, 3);
      progress.completed = progress.puzzlesSolved >= 3;
      
      // Update streak
      await updateStreak(userId);
      
      // Auto-unlock next level if current level is completed
      if (progress.completed) {
        await unlockNextLevel(userId, puzzle.category, puzzle.level);
      }
    }

    progress.accuracy = Math.round((progress.correctAnswers / progress.attempts) * 100);
    await progress.save();

    res.json({
      correct: validation.correct,
      message: validation.message,
      progress: {
        puzzlesSolved: progress.puzzlesSolved,
        levelCompleted: progress.completed
      }
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Failed to validate answer' });
  }
}

export async function getHint(req, res) {
  try {
    const { id } = req.params;
    
    const puzzle = await Puzzle.findById(id);
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    const hint = await generateHint(puzzle);
    res.json({ hint });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate hint' });
  }
}

export async function getExplanation(req, res) {
  try {
    const { id } = req.params;
    const { userAnswer } = req.body;
    
    const puzzle = await Puzzle.findById(id);
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    const explanation = await generateExplanation(puzzle, userAnswer || '');
    res.json({ explanation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate explanation' });
  }
}

async function updateStreak(userId) {
  try {
    const today = new Date().toDateString();
    let streak = await Streak.findOne({ userId });
    
    if (!streak) {
      streak = new Streak({ userId });
    }

    const lastActivity = streak.lastActivityDate?.toDateString();
    
    if (lastActivity !== today) {
      if (lastActivity === new Date(Date.now() - 86400000).toDateString()) {
        // Yesterday - continue streak
        streak.currentStreak++;
      } else {
        // Gap in activity - reset streak
        streak.currentStreak = 1;
      }
      
      streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
      streak.lastActivityDate = new Date();
    }
    
    streak.totalPuzzlesSolved++;
    streak.updatedAt = new Date();
    await streak.save();
  } catch (error) {
    console.error('Streak update error:', error);
  }
}

async function unlockNextLevel(userId, category, currentLevel) {
  try {
    const nextLevel = currentLevel + 1;
    const nextLevelExists = await Puzzle.findOne({ category, level: nextLevel });
    
    if (nextLevelExists) {
      await Progress.findOneAndUpdate(
        { userId, category, level: nextLevel },
        { 
          userId, 
          category, 
          level: nextLevel,
          unlockedAt: new Date()
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error('Unlock next level error:', error);
  }
}
EOF

# Stats controller
cat > src/controllers/statsController.js << 'EOF'
import Progress from '../models/Progress.js';
import Streak from '../models/Streak.js';

export async function getUserStats(req, res) {
  try {
    const userId = req.user._id;
    
    // Get progress data
    const progressData = await Progress.find({ userId });
    
    // Get streak data
    const streak = await Streak.findOne({ userId }) || { 
      currentStreak: 0, 
      totalPuzzlesSolved: 0 
    };
    
    // Calculate stats
    const levelsCompleted = progressData.filter(p => p.completed).length;
    const accuracyByCategory = {};
    
    const categories = ['logic', 'math', 'wordplay', 'pattern'];
    categories.forEach(category => {
      const categoryProgress = progressData.filter(p => p.category === category);
      if (categoryProgress.length > 0) {
        const avgAccuracy = categoryProgress.reduce((sum, p) => sum + (p.accuracy || 0), 0) / categoryProgress.length;
        accuracyByCategory[category] = Math.round(avgAccuracy);
      } else {
        accuracyByCategory[category] = 0;
      }
    });
    
    res.json({
      levelsCompleted,
      streakDays: streak.currentStreak,
      totalPuzzlesSolved: streak.totalPuzzlesSolved,
      accuracyByCategory,
      progressByCategory: categories.map(category => {
        const categoryData = progressData.filter(p => p.category === category);
        return {
          category,
          maxLevel: categoryData.length > 0 ? Math.max(...categoryData.map(p => p.level)) : 0,
          completedLevels: categoryData.filter(p => p.completed).length
        };
      })
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
EOF

# Routes
cat > src/routes/auth.js << 'EOF'
import { Router } from 'express';
import { register, login } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);

export default router;
EOF

cat > src/routes/puzzles.js << 'EOF'
import { Router } from 'express';
import { authenticateToken } from '../utils/auth.js';
import { 
  getPuzzles, 
  validatePuzzleAnswer, 
  getHint, 
  getExplanation 
} from '../controllers/puzzleController.js';

const router = Router();

// All puzzle routes require authentication
router.use(authenticateToken);

router.get('/', getPuzzles);
router.post('/:id/validate', validatePuzzleAnswer);
router.post('/:id/hint', getHint);
router.post('/:id/explanation', getExplanation);

export default router;
EOF

cat > src/routes/stats.js << 'EOF'
import { Router } from 'express';
import { authenticateToken } from '../utils/auth.js';
import { getUserStats } from '../controllers/statsController.js';

const router = Router();

router.get('/', authenticateToken, getUserStats);

export default router;
EOF

# Seed script
cat > scripts/seed.js << 'EOF'
import 'dotenv/config';
import { connectToDatabase } from '../src/utils/db.js';
import Puzzle from '../src/models/Puzzle.js';

const samplePuzzles = [
  // Logic Level 1
  {
    title: "Missing Number",
    prompt: "What comes next in this sequence: 2, 4, 6, 8, ?",
    category: "logic",
    level: 1,
    position: 0,
    correctAnswers: ["10", "ten"],
    hints: ["Look for the pattern in how each number relates to the previous one"],
    explanation: "This is an arithmetic sequence where each number increases by 2"
  },
  {
    title: "Odd One Out",
    prompt: "Which doesn't belong: Apple, Banana, Carrot, Orange?",
    category: "logic",
    level: 1,
    position: 1,
    correctAnswers: ["carrot", "Carrot"],
    hints: ["Think about categories - what makes one different from the others?"],
    explanation: "Carrot is a vegetable while the others are fruits"
  },
  {
    title: "Light Switch",
    prompt: "You have 3 light switches and 3 bulbs in another room. You can only check the bulbs once. How do you match each switch to its bulb?",
    category: "logic",
    level: 1,
    position: 2,
    correctAnswers: ["turn on first switch", "heat", "temperature"],
    hints: ["Think about what else happens when a bulb is on besides producing light"],
    explanation: "Turn on the first switch for a few minutes, then turn it off and turn on the second. Check the room: the lit bulb is switch 2, the warm bulb is switch 1, the cool/off bulb is switch 3."
  },

  // Math Level 1
  {
    title: "Quick Addition",
    prompt: "What is 15 + 27?",
    category: "math",
    level: 1,
    position: 0,
    correctAnswers: ["42", "forty-two", "forty two"],
    hints: ["Break it down: 15 + 25 + 2"],
    explanation: "15 + 27 = 42. You can break 27 into 25 + 2 to make it easier: 15 + 25 = 40, then 40 + 2 = 42"
  },
  {
    title: "Percentage",
    prompt: "What is 25% of 80?",
    category: "math",
    level: 1,
    position: 1,
    correctAnswers: ["20", "twenty"],
    hints: ["25% is the same as 1/4"],
    explanation: "25% of 80 = 0.25 × 80 = 20, or think of it as 80 ÷ 4 = 20"
  },
  {
    title: "Age Problem",
    prompt: "Sarah is twice as old as Tom. If Tom is 12, how old is Sarah?",
    category: "math",
    level: 1,
    position: 2,
    correctAnswers: ["24", "twenty-four", "twenty four"],
    hints: ["'Twice as old' means multiply by 2"],
    explanation: "If Tom is 12 and Sarah is twice as old, then Sarah is 12 × 2 = 24 years old"
  },

  // Wordplay Level 1
  {
    title: "Anagram",
    prompt: "Rearrange the letters in 'LISTEN' to make another word",
    category: "wordplay",
    level: 1,
    position: 0,
    correctAnswers: ["silent", "Silent", "SILENT"],
    hints: ["Think about something you do when you don't speak"],
    explanation: "LISTEN rearranged spells SILENT - both words use the exact same letters!"
  },
  {
    title: "Rhyme Time",
    prompt: "I rhyme with 'cat' and you wear me on your head. What am I?",
    category: "wordplay",
    level: 1,
    position: 1,
    correctAnswers: ["hat", "Hat", "HAT"],
    hints: ["It's a piece of clothing for your head"],
    explanation: "HAT rhymes with CAT and is worn on your head"
  },
  {
    title: "Word Association",
    prompt: "Book is to read as song is to ____",
    category: "wordplay",
    level: 1,
    position: 2,
    correctAnswers: ["sing", "listen", "hear", "play"],
    hints: ["What do you do with a song?"],
    explanation: "Just as you READ a book, you SING, LISTEN to, or PLAY a song"
  },

  // Pattern Level 1
  {
    title: "Shape Sequence",
    prompt: "What comes next: Circle, Square, Triangle, Circle, Square, ?",
    category: "pattern",
    level: 1,
    position: 0,
    correctAnswers: ["triangle", "Triangle"],
    hints: ["Look at the repeating sequence of shapes"],
    explanation: "The pattern repeats every 3 shapes: Circle, Square, Triangle, so Triangle comes next"
  },
  {
    title: "Letter Pattern",
    prompt: "What's the next letter: A, C, E, G, ?",
    category: "pattern",
    level: 1,
    position: 1,
    correctAnswers: ["I", "i"],
    hints: ["Count how many letters are skipped between each one"],
    explanation: "The pattern skips one letter each time: A(skip B)C(skip D)E(skip F)G(skip H)I"
  },
  {
    title: "Number Grid",
    prompt: "Complete the pattern: 1, 4, 9, 16, ?",
    category: "pattern",
    level: 1,
    position: 2,
    correctAnswers: ["25", "twenty-five", "twenty five"],
    hints: ["These are all perfect squares: 1², 2², 3², 4²..."],
    explanation: "These are perfect squares: 1²=1, 2²=4, 3²=9, 4²=16, so 5²=25"
  },

  // Logic Level 2
  {
    title: "Truth Teller",
    prompt: "Two guards: one always lies, one always tells truth. One door leads to freedom. You can ask one question to one guard. What do you ask?",
    category: "logic",
    level: 2,
    position: 0,
    correctAnswers: ["what would the other guard say", "ask about other guard", "which door would the other guard choose"],
    hints: ["Think about how to use their opposite behaviors against each other"],
    explanation: "Ask either guard 'Which door would the other guard say leads to freedom?' Then choose the opposite door. Both guards will point to the wrong door."
  },
  {
    title: "River Crossing",
    prompt: "A farmer needs to cross a river with a fox, chicken, and corn. Boat holds farmer + 1 item. Fox eats chicken, chicken eats corn if left alone. How?",
    category: "logic",
    level: 2,
    position: 1,
    correctAnswers: ["take chicken first", "chicken first then fox", "bring chicken back"],
    hints: ["Start with the item that's threatened by both others"],
    explanation: "Take chicken first, then fox (bring chicken back), then corn, finally chicken again"
  },
  {
    title: "Clock Puzzle",
    prompt: "At what time between 3 and 4 o'clock are the hands of a clock exactly opposite each other?",
    category: "logic",
    level: 2,
    position: 2,
    correctAnswers: ["3:32", "32 minutes past 3", "about 3:32"],
    hints: ["The hands are opposite when they're 180 degrees apart"],
    explanation: "At approximately 3:32:73, the hands are exactly 180° apart (opposite each other)"
  }
];

async function seedDatabase() {
  try {
    await connectToDatabase();
    
    // Clear existing puzzles
    await Puzzle.deleteMany({});
    console.log('🗑️  Cleared existing puzzles');
    
    // Insert sample puzzles
    await Puzzle.insertMany(samplePuzzles);
    console.log(`✅ Seeded ${samplePuzzles.length} puzzles`);
    
    // Show summary
    const summary = {};
    samplePuzzles.forEach(p => {
      const key = `${p.category}-L${p.level}`;
      summary[key] = (summary[key] || 0) + 1;
    });
    
    console.log('\n📊 Puzzle Summary:');
    Object.entries(summary).forEach(([key, count]) => {
      console.log(`   ${key}: ${count} puzzles`);
    });
    
    console.log('\n🎯 Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
EOF

# Frontend setup
cd ../client

# Initialize Vite React project
cat > package.json << 'EOF'
{
  "name": "brainkick-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8"
  }
}
EOF

cat > .env.example << 'EOF'
VITE_API_BASE_URL=http://localhost:4000/api
EOF

# Vite config
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})
EOF

# Index HTML
cat > index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/brain-icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BrainKick 🧠⚡</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        margin: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

# Main entry
cat > src/main.jsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# API client
cat > src/api/client.js << 'EOF'
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('brainkick_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('brainkick_token');
      localStorage.removeItem('brainkick_user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);
EOF

# Auth context
cat > src/components/AuthContext.jsx << 'EOF'
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('brainkick_token');
    const userData = localStorage.getItem('brainkick_user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user: userData } = response.data;
    
    localStorage.setItem('brainkick_token', token);
    localStorage.setItem('brainkick_user', JSON.stringify(userData));
    setUser(userData);
    
    return response.data;
  };

  const register = async (username, email, password) => {
    const response = await api.post('/auth/register', { username, email, password });
    const { token, user: userData } = response.data;
    
    localStorage.setItem('brainkick_token', token);
    localStorage.setItem('brainkick_user', JSON.stringify(userData));
    setUser(userData);
    
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('brainkick_token');
    localStorage.removeItem('brainkick_user');
    setUser(null);
  };

  const value = {
    user,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
EOF

# Main App component
cat > src/App.jsx << 'EOF'
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthContext.jsx';
import LoginForm from './components/LoginForm.jsx';
import LevelSelect from './pages/LevelSelect.jsx';
import Puzzle from './pages/Puzzle.jsx';
import Dashboard from './pages/Dashboard.jsx';
import './App.css';

function AppContent() {
  const { user, logout } = useAuth();
  const [view, setView] = useState('levels');
  const [selected, setSelected] = useState({ category: null, level: 1, puzzleIndex: 0 });

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">🧠 BrainKick</h1>
          <div className="header-right">
            <span className="welcome">Hey, {user.username}!</span>
            <nav className="nav-buttons">
              <button 
                className={view === 'levels' ? 'active' : ''}
                onClick={() => setView('levels')}
              >
                Levels
              </button>
              <button 
                className={view === 'dashboard' ? 'active' : ''}
                onClick={() => setView('dashboard')}
              >
                Stats
              </button>
              <button onClick={logout} className="logout-btn">
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="app-main">
        {view === 'levels' && (
          <LevelSelect
            onSelect={(category, level) => {
              setSelected({ category, level, puzzleIndex: 0 });
              setView('puzzle');
            }}
          />
        )}
        {view === 'puzzle' && (
          <Puzzle
            selected={selected}
            onExit={() => setView('levels')}
            onAdvance={(next) => setSelected(next)}
          />
        )}
        {view === 'dashboard' && <Dashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
EOF

# App styles
cat > src/App.css << 'EOF'
.app {
  min-height: 100vh;
  color: white;
}

.app-header {
  background: rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  padding: 1rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
}

.app-title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.welcome {
  font-size: 0.9rem;
  opacity: 0.8;
}

.nav-buttons {
  display: flex;
  gap: 0.5rem;
}

.nav-buttons button {
  padding: 0.5rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-buttons button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.nav-buttons button.active {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
}

.logout-btn {
  color: #ff6b6b !important;
  border-color: #ff6b6b !important;
}

.logout-btn:hover {
  background: rgba(255, 107, 107, 0.1) !important;
}

.app-main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-block;
  text-align: center;
}

.btn-primary {
  background: linear-gradient(45deg, #4f46e5, #7c3aed);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(79, 70, 229, 0.4);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 8px;
  font-size: 1rem;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.input:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
}

@media (max-width: 640px) {
  .header-content {
    flex-direction: column;
    gap: 1rem;
  }
  
  .nav-buttons {
    flex-wrap: wrap;
  }
}
EOF

# Login Form
cat > src/components/LoginForm.jsx << 'EOF'
import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
      } else {
        await register(formData.username, formData.email, formData.password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {isLogin ? 'Welcome Back!' : 'Join BrainKick!'} 🧠⚡
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isLogin && (
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              className="input"
              required={!isLogin}
            />
          )}
          
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="input"
            required
          />
          
          <input
            type="password"
            name="password"
            placeholder="Password (min 6 characters)"
            value={formData.password}
            onChange={handleChange}
            className="input"
            required
            minLength="6"
          />

          {error && (
            <div style={{ color: '#ff6b6b', fontSize: '0.9rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
          >
            {loading ? '⏳ Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'white', 
              textDecoration: 'underline',
              cursor: 'pointer' 
            }}
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
EOF

# Level Select page
cat > src/pages/LevelSelect.jsx << 'EOF'
import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const categories = [
  { id: 'logic', name: 'Logic', emoji: '🧩', color: '#4f46e5' },
  { id: 'math', name: 'Math', emoji: '🔢', color: '#059669' },
  { id: 'wordplay', name: 'Wordplay', emoji: '📝', color: '#dc2626' },
  { id: 'pattern', name: 'Pattern', emoji: '🔮', color: '#7c3aed' }
];

export default function LevelSelect({ onSelect }) {
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const response = await api.get('/stats');
      const progressByCategory = {};
      response.data.progressByCategory?.forEach(cat => {
        progressByCategory[cat.category] = {
          maxLevel: cat.maxLevel,
          completedLevels: cat.completedLevels
        };
      });
      setProgress(progressByCategory);
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p>Loading your progress... 🧠</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
        Choose Your Challenge 🎯
      </h2>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '1.5rem' 
      }}>
        {categories.map((category) => {
          const categoryProgress = progress[category.id] || { maxLevel: 0, completedLevels: 0 };
          
          return (
            <div key={category.id} className="card">
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '1rem',
                fontSize: '1.2rem',
                fontWeight: '600'
              }}>
                <span style={{ fontSize: '2rem', marginRight: '0.5rem' }}>
                  {category.emoji}
                </span>
                {category.name}
              </div>
              
              <div style={{ 
                fontSize: '0.9rem', 
                opacity: '0.8', 
                marginBottom: '1rem' 
              }}>
                Progress: {categoryProgress.completedLevels} levels completed
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '0.5rem' 
              }}>
                {[1, 2, 3, 4, 5].map((level) => {
                  const isUnlocked = level === 1 || categoryProgress.maxLevel >= level;
                  const isCompleted = categoryProgress.completedLevels >= level;
                  
                  return (
                    <button
                      key={level}
                      disabled={!isUnlocked}
                      onClick={() => isUnlocked && onSelect(category.id, level)}
                      className="btn"
                      style={{
                        background: isCompleted 
                          ? `linear-gradient(45deg, ${category.color}, ${category.color}dd)`
                          : isUnlocked 
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(255, 255, 255, 0.05)',
                        color: isUnlocked ? 'white' : 'rgba(255, 255, 255, 0.3)',
                        border: `1px solid ${isUnlocked ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                        padding: '0.75rem',
                        fontSize: '0.9rem'
                      }}
                    >
                      Level {level} {isCompleted ? '✓' : isUnlocked ? '' : '🔒'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
EOF

# Puzzle page
cat > src/pages/Puzzle.jsx << 'EOF'
import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Puzzle({ selected, onExit, onAdvance }) {
  const [puzzles, setPuzzles] = useState([]);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    fetchPuzzles();
    setAnswer('');
    setResult(null);
    setHint(null);
    setExplanation(null);
    setShowExplanation(false);
  }, [selected.category, selected.level, selected.puzzleIndex]);

  const fetchPuzzles = async () => {
    setLoading(true);
    try {
      const response = await api.get('/puzzles', { 
        params: { 
          category: selected.category, 
          level: selected.level 
        } 
      });
      setPuzzles(response.data?.puzzles || []);
    } catch (error) {
      console.error('Failed to fetch puzzles:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentPuzzle = puzzles[selected.puzzleIndex] || null;

  const submitAnswer = async () => {
    if (!currentPuzzle || !answer.trim()) return;
    
    setLoading(true);
    try {
      const response = await api.post(`/puzzles/${currentPuzzle._id}/validate`, { 
        answer: answer.trim() 
      });
      
      setResult(response.data);
      
      if (response.data?.correct) {
        // Get explanation
        const explanationResponse = await api.post(`/puzzles/${currentPuzzle._id}/explanation`, {
          userAnswer: answer.trim()
        });
        setExplanation(explanationResponse.data?.explanation);
        setShowExplanation(true);
        
        // Auto-advance after 3 seconds
        setTimeout(() => {
          const nextIndex = selected.puzzleIndex + 1;
          if (nextIndex < 3) {
            onAdvance({ ...selected, puzzleIndex: nextIndex });
          } else {
            onExit();
          }
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to validate answer:', error);
      setResult({ correct: false, message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const getHint = async () => {
    if (!currentPuzzle) return;
    
    setLoading(true);
    try {
      const response = await api.post(`/puzzles/${currentPuzzle._id}/hint`, {});
      setHint(response.data?.hint || 'No hint available');
    } catch (error) {
      console.error('Failed to get hint:', error);
      setHint('Unable to get hint right now');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading && answer.trim()) {
      submitAnswer();
    }
  };

  if (loading && !puzzles.length) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p>Loading puzzle... 🧠</p>
      </div>
    );
  }

  if (!currentPuzzle) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p>No puzzle found 😞</p>
        <button onClick={onExit} className="btn btn-secondary">
          Back to Levels
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h3 style={{ margin: 0, textTransform: 'capitalize' }}>
            {selected.category} - Level {selected.level}
          </h3>
          <p style={{ margin: '0.5rem 0 0 0', opacity: 0.7, fontSize: '0.9rem' }}>
            Puzzle {selected.puzzleIndex + 1} of 3
          </p>
        </div>
        <button onClick={onExit} className="btn btn-secondary">
          Exit
        </button>
      </div>

      <div className="card" style={{ 
        background: 'rgba(255, 255, 255, 0.05)',
        marginBottom: '1.5rem' 
      }}>
        <h2 style={{ marginTop: 0 }}>{currentPuzzle.title}</h2>
        <p style={{ fontSize: '1.1rem', lineHeight: '1.6' }}>
          {currentPuzzle.prompt}
        </p>
      </div>

      {!result?.correct && (
        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter your answer..."
            className="input"
            style={{ marginBottom: '1rem' }}
            disabled={loading}
          />
          
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={submitAnswer}
              disabled={loading || !answer.trim()}
              className="btn btn-primary"
            >
              {loading ? '🤔 Thinking...' : 'Submit Answer'}
            </button>
            
            <button
              onClick={getHint}
              disabled={loading}
              className="btn btn-secondary"
            >
              {loading ? '💭 Getting hint...' : '💡 Get Hint'}
            </button>
          </div>
        </div>
      )}

      {hint && (
        <div className="card" style={{ 
          background: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid rgba(255, 193, 7, 0.3)',
          marginBottom: '1rem'
        }}>
          <p style={{ margin: 0 }}>
            <strong>💡 Hint:</strong> {hint}
          </p>
        </div>
      )}

      {result && (
        <div className="card" style={{ 
          background: result.correct 
            ? 'rgba(34, 197, 94, 0.1)' 
            : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${result.correct 
            ? 'rgba(34, 197, 94, 0.3)' 
            : 'rgba(239, 68, 68, 0.3)'}`,
          marginBottom: '1rem'
        }}>
          <p style={{ margin: 0, fontWeight: '500' }}>
            {result.correct ? '🎉' : '❌'} {result.message}
          </p>
        </div>
      )}

      {showExplanation && explanation && (
        <div className="card" style={{ 
          background: 'rgba(79, 70, 229, 0.1)',
          border: '1px solid rgba(79, 70, 229, 0.3)'
        }}>
          <p style={{ margin: 0 }}>
            <strong>🎯 Explanation:</strong> {explanation}
          </p>
          {result?.correct && (
            <p style={{ 
              margin: '1rem 0 0 0', 
              fontSize: '0.9rem', 
              opacity: 0.8 
            }}>
              Moving to next puzzle in 3 seconds...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
EOF

# Dashboard page
cat > src/pages/Dashboard.jsx << 'EOF'
import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setStats({
        levelsCompleted: 0,
        streakDays: 0,
        totalPuzzlesSolved: 0,
        accuracyByCategory: {},
        progressByCategory: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p>Loading your stats... 📊</p>
      </div>
    );
  }

  const categoryEmojis = {
    logic: '🧩',
    math: '🔢', 
    wordplay: '📝',
    pattern: '🔮'
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
        Your BrainKick Stats 📊
      </h2>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏆</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {stats.levelsCompleted}
          </div>
          <div>Levels Completed</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔥</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {stats.streakDays}
          </div>
          <div>Day Streak</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧠</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {stats.totalPuzzlesSolved}
          </div>
          <div>Puzzles Solved</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          Accuracy by Category
        </h3>
        
        <div style={{ display: 'grid', gap: '1rem' }}>
          {Object.entries(stats.accuracyByCategory).map(([category, accuracy]) => (
            <div key={category} style={{ 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>
                  {categoryEmojis[category]}
                </span>
                <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>
                  {category}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '100px', 
                  height: '8px', 
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    width: `${accuracy}%`, 
                    height: '100%',
                    background: `linear-gradient(90deg, #4f46e5, #7c3aed)`,
                    borderRadius: '4px'
                  }} />
                </div>
                <span style={{ fontWeight: 'bold', minWidth: '40px' }}>
                  {accuracy}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {stats.progressByCategory && stats.progressByCategory.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Progress by Category
          </h3>
          
          <div style={{ display: 'grid', gap: '1rem' }}>
            {stats.progressByCategory.map((progress) => (
              <div key={progress.category} style={{ 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>
                    {categoryEmojis[progress.category]}
                  </span>
                  <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>
                    {progress.category}
                  </span>
                </div>
                
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                  Level {progress.maxLevel} • {progress.completedLevels} completed
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ 
        textAlign: 'center', 
        marginTop: '2rem',
        opacity: 0.6,
        fontSize: '0.9rem'
      }}>
        Keep challenging your brain! 🧠⚡
      </div>
    </div>
  );
}
EOF

cd ..

echo ""
echo "🎉 BrainKick project structure created successfully!"
echo ""
echo "Next steps:"
echo "1. cd brainkick"
echo "2. Set up your environment files:"
echo "   - Copy server/.env.example to server/.env and fill in your MongoDB URI and OpenAI API key"
echo "   - Copy client/.env.example to client/.env" 
echo "3. Install dependencies and run:"
echo "   - cd server && npm install && npm run seed && npm run dev"
echo "   - cd ../client && npm install && npm run dev (in another terminal)"
echo "4. Push to GitHub using the commands below"
echo ""

# GitHub setup commands
echo "📱 To push to GitHub:"
echo ""
echo "# First, create a new repository on GitHub called 'brainkick'"
echo "# Then run these commands from the brainkick/ directory:"
echo ""
echo "git add ."
echo "git commit -m 'Initial commit: BrainKick MVP with React frontend and Node.js backend'"
echo "git branch -M main"
echo "git remote add origin https://github.com/YOUR_USERNAME/brainkick.git"
echo "git push -u origin main"
echo ""
echo "🚀 Your BrainKick app will be ready to run!"