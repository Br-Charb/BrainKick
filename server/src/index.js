const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

console.log('🚀 Starting BrainKick server...');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/brainkick')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.log('❌ MongoDB connection failed, using in-memory storage');
    console.log('   To use full features, install MongoDB or use MongoDB Atlas');
  });

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const User = mongoose.model('User', userSchema);

// Streak Schema
const streakSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActivityDate: { type: Date },
  totalPuzzlesSolved: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

const Streak = mongoose.model('Streak', streakSchema);

// Progress Schema
const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  level: { type: Number, required: true },
  puzzlesSolved: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  accuracy: { type: Number, default: 0 },
  attempts: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: Date.now }
});

const Progress = mongoose.model('Progress', progressSchema);

// In-memory fallback storage for when MongoDB is not available
let memoryUsers = [];
let memoryStreaks = [];
let memoryProgress = [];
let userIdCounter = 1;

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Helper function to update streak
const updateStreak = async (userId) => {
  try {
    const today = new Date().toDateString();
    
    if (mongoose.connection.readyState === 1) {
      // MongoDB is available
      let streak = await Streak.findOne({ userId });
      
      if (!streak) {
        streak = new Streak({ userId });
      }

      const lastActivity = streak.lastActivityDate?.toDateString();
      
      if (lastActivity !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (lastActivity === yesterday) {
          // Yesterday - continue streak
          streak.currentStreak++;
        } else if (lastActivity) {
          // Gap in activity - reset streak
          streak.currentStreak = 1;
        } else {
          // First activity
          streak.currentStreak = 1;
        }
        
        streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
        streak.lastActivityDate = new Date();
      }
      
      streak.totalPuzzlesSolved++;
      streak.updatedAt = new Date();
      await streak.save();
    } else {
      // Use memory storage
      let streak = memoryStreaks.find(s => s.userId === userId);
      if (!streak) {
        streak = {
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          totalPuzzlesSolved: 0
        };
        memoryStreaks.push(streak);
      }
      
      const today = new Date().toDateString();
      const lastActivity = streak.lastActivityDate?.toDateString();
      
      if (lastActivity !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (lastActivity === yesterday) {
          streak.currentStreak++;
        } else if (lastActivity) {
          streak.currentStreak = 1;
        } else {
          streak.currentStreak = 1;
        }
        
        streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
        streak.lastActivityDate = new Date();
      }
      
      streak.totalPuzzlesSolved++;
    }
  } catch (error) {
    console.error('Streak update error:', error);
  }
};

// Sample puzzles
const puzzles = {
  logic: {
    1: [
      {
        _id: 'logic-1-0',
        title: 'Number Sequence',
        prompt: 'What comes next in this sequence: 2, 4, 6, 8, ?',
        category: 'logic',
        level: 1,
        position: 0,
        correctAnswers: ['10', 'ten']
      },
      {
        _id: 'logic-1-1',
        title: 'Odd One Out',
        prompt: 'Which doesn\'t belong: Apple, Banana, Carrot, Orange?',
        category: 'logic',
        level: 1,
        position: 1,
        correctAnswers: ['carrot', 'Carrot']
      },
      {
        _id: 'logic-1-2',
        title: 'Logic Chain',
        prompt: 'If all Bloops are Razzles and all Razzles are Lazzles, are all Bloops Lazzles?',
        category: 'logic',
        level: 1,
        position: 2,
        correctAnswers: ['yes', 'Yes', 'true', 'True']
      }
    ]
  },
  math: {
    1: [
      {
        _id: 'math-1-0',
        title: 'Addition Challenge',
        prompt: 'What is 15 + 27?',
        category: 'math',
        level: 1,
        position: 0,
        correctAnswers: ['42', 'forty-two', 'forty two']
      },
      {
        _id: 'math-1-1',
        title: 'Multiplication',
        prompt: 'What is 7 × 8?',
        category: 'math',
        level: 1,
        position: 1,
        correctAnswers: ['56', 'fifty-six', 'fifty six']
      },
      {
        _id: 'math-1-2',
        title: 'Division',
        prompt: 'What is 144 ÷ 12?',
        category: 'math',
        level: 1,
        position: 2,
        correctAnswers: ['12', 'twelve']
      }
    ]
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'BrainKick',
    database: mongoose.connection.readyState === 1 ? 'MongoDB' : 'In-Memory'
  });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (mongoose.connection.readyState === 1) {
      // MongoDB available
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ 
          error: existingUser.email === email ? 'Email already registered' : 'Username taken' 
        });
      }

      const user = new User({ username, email, password });
      await user.save();

      // Create streak record
      const streak = new Streak({ userId: user._id });
      await streak.save();

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        message: 'Welcome to BrainKick! 🧠⚡',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    } else {
      // Memory storage
      const existingUser = memoryUsers.find(u => u.email === email || u.username === username);
      if (existingUser) {
        return res.status(400).json({ 
          error: existingUser.email === email ? 'Email already registered' : 'Username taken' 
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        _id: userIdCounter++,
        username,
        email,
        password: hashedPassword,
        createdAt: new Date()
      };
      memoryUsers.push(user);

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        message: 'Welcome to BrainKick! 🧠⚡',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (mongoose.connection.readyState === 1) {
      // MongoDB available
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.json({
        message: 'Welcome back! 🎯',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    } else {
      // Memory storage
      const user = memoryUsers.find(u => u.email === email);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.json({
        message: 'Welcome back! 🎯',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get puzzles (protected)
app.get('/api/puzzles', authenticateToken, (req, res) => {
  const { category = 'logic', level = 1 } = req.query;
  console.log(`✅ Puzzles requested for ${category} level ${level} by user ${req.userId}`);
  
  const categoryPuzzles = puzzles[category];
  if (!categoryPuzzles || !categoryPuzzles[level]) {
    return res.json({ puzzles: [] });
  }
  
  res.json({ puzzles: categoryPuzzles[level] });
});

// Validate answer (protected)
app.post('/api/puzzles/:id/validate', authenticateToken, async (req, res) => {
  try {
    const { answer } = req.body;
    const puzzleId = req.params.id;
    const userId = req.userId;
    
    // Find the puzzle
    let puzzle = null;
    for (const category of Object.values(puzzles)) {
      for (const levelPuzzles of Object.values(category)) {
        puzzle = levelPuzzles.find(p => p._id === puzzleId);
        if (puzzle) break;
      }
      if (puzzle) break;
    }
    
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    
    const correct = puzzle.correctAnswers.some(correctAnswer => 
      correctAnswer.toLowerCase().trim() === answer.toLowerCase().trim()
    );
    
    console.log(`✅ Answer "${answer}" for puzzle "${puzzle.title}" is ${correct ? 'correct' : 'wrong'}`);
    
    // Update streak if correct
    if (correct) {
      await updateStreak(userId);
    }
    
    res.json({
      correct,
      message: correct ? 'Excellent work! 🎉' : 'Not quite right. Give it another try! 🤔'
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Failed to validate answer' });
  }
});

// Get hint (protected)
app.post('/api/puzzles/:id/hint', authenticateToken, (req, res) => {
  console.log('✅ Hint requested');
  res.json({ hint: 'Think step by step and look for patterns! 💡' });
});

// Get user stats (protected)
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    if (mongoose.connection.readyState === 1) {
      // MongoDB available
      const streak = await Streak.findOne({ userId }) || { 
        currentStreak: 0, 
        longestStreak: 0,
        totalPuzzlesSolved: 0 
      };
      
      res.json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalPuzzlesSolved: streak.totalPuzzlesSolved,
        lastActivityDate: streak.lastActivityDate
      });
    } else {
      // Memory storage
      const streak = memoryStreaks.find(s => s.userId === userId) || { 
        currentStreak: 0, 
        longestStreak: 0,
        totalPuzzlesSolved: 0,
        lastActivityDate: null
      };
      
      res.json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalPuzzlesSolved: streak.totalPuzzlesSolved,
        lastActivityDate: streak.lastActivityDate
      });
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ BrainKick server running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/api/health`);
  if (mongoose.connection.readyState !== 1) {
    console.log('💡 Install MongoDB for persistent data storage');
  }
});
