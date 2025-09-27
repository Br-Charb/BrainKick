const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OpenAI } = require('openai');
require('dotenv').config();

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn('⚠️ OPENAI_API_KEY is not set. OpenAI features will be disabled.');
}

console.log('🚀 Starting BrainKick server...');

// JWT secret: prefer environment variable, fall back to a development secret with a clear warning.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️ JWT_SECRET is not set. Using development fallback secret. DO NOT use this in production.');
  return 'dev-secret-change-me';
})();

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
  solvedPuzzles: [{ type: String }], // Track which puzzles were solved to avoid duplicates
  updatedAt: { type: Date, default: Date.now }
});

const Streak = mongoose.model('Streak', streakSchema);

// In-memory fallback storage
let memoryUsers = [];
let memoryStreaks = [];
let userIdCounter = 1;

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // If MongoDB isn't available (development/local), allow a guest/dev user so
    // the client can fetch puzzles and validate answers without a JWT.
    // This keeps the production behavior (require token when DB is present).
    if (mongoose.connection.readyState !== 1) {
      // Use a simple guest id for in-memory flows
      req.userId = 0;
      return next();
    }

    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Helper function to update streak (only for NEW puzzles)
const updateStreak = async (userId, puzzleId) => {
  try {
    const today = new Date().toDateString();
    
    if (mongoose.connection.readyState === 1) {
      // MongoDB is available
      let streak = await Streak.findOne({ userId });
      
      if (!streak) {
        streak = new Streak({ userId, solvedPuzzles: [] });
      }

      // Check if puzzle was already solved
      if (streak.solvedPuzzles.includes(puzzleId)) {
        return false; // Don't update streak for repeated puzzles
      }

      // Add puzzle to solved list
      streak.solvedPuzzles.push(puzzleId);

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
      return true;
    } else {
      // Use memory storage
      let streak = memoryStreaks.find(s => s.userId === userId);
      if (!streak) {
        streak = {
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          totalPuzzlesSolved: 0,
          solvedPuzzles: []
        };
        memoryStreaks.push(streak);
      }
      
      // Check if puzzle was already solved
      if (streak.solvedPuzzles.includes(puzzleId)) {
        return false; // Don't update streak for repeated puzzles
      }

      // Add puzzle to solved list
      streak.solvedPuzzles.push(puzzleId);
      
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
      return true;
    }
  } catch (error) {
    console.error('Streak update error:', error);
    return false;
  }
};

// Enhanced puzzles with more variety and complexity
const puzzles = {
  math: {
    1: [
      {
        _id: 'math-1-0',
        title: 'Basic Addition',
        prompt: 'What is 15 + 27?',
        category: 'math',
        level: 1,
        position: 0,
        correctAnswers: ['42', 'forty-two', 'forty two']
      },
      {
        _id: 'math-1-1',
        title: 'Simple Multiplication',
        prompt: 'What is 7 × 8?',
        category: 'math',
        level: 1,
        position: 1,
        correctAnswers: ['56', 'fifty-six', 'fifty six']
      },
      {
        _id: 'math-1-2',
        title: 'Easy Division',
        prompt: 'What is 144 ÷ 12?',
        category: 'math',
        level: 1,
        position: 2,
        correctAnswers: ['12', 'twelve']
      },
      {
        _id: 'math-1-3',
        title: 'Subtraction',
        prompt: 'What is 85 - 39?',
        category: 'math',
        level: 1,
        position: 3,
        correctAnswers: ['46', 'forty-six', 'forty six']
      },
      {
        _id: 'math-1-4',
        title: 'Order of Operations',
        prompt: 'What is 5 + 3 × 2?',
        category: 'math',
        level: 1,
        position: 4,
        correctAnswers: ['11', 'eleven']
      }
    ],
    2: [
      {
        _id: 'math-2-0',
        title: 'Fractions',
        prompt: 'What is 3/4 + 1/4?',
        category: 'math',
        level: 2,
        position: 0,
        correctAnswers: ['1', 'one', '4/4', '1.0']
      },
      {
        _id: 'math-2-1',
        title: 'Percentages',
        prompt: 'What is 25% of 80?',
        category: 'math',
        level: 2,
        position: 1,
        correctAnswers: ['20', 'twenty']
      },
      {
        _id: 'math-2-2',
        title: 'Square Roots',
        prompt: 'What is the square root of 64?',
        category: 'math',
        level: 2,
        position: 2,
        correctAnswers: ['8', 'eight']
      },
      {
        _id: 'math-2-3',
        title: 'Area Problem',
        prompt: 'What is the area of a rectangle with length 6 and width 4?',
        category: 'math',
        level: 2,
        position: 3,
        correctAnswers: ['24', 'twenty-four', 'twenty four']
      },
      {
        _id: 'math-2-4',
        title: 'Algebra',
        prompt: 'If x + 5 = 12, what is x?',
        category: 'math',
        level: 2,
        position: 4,
        correctAnswers: ['7', 'seven']
      }
    ],
    3: [
      {
        _id: 'math-3-0',
        title: 'Complex Fractions',
        prompt: 'What is (2/3) × (3/4)?',
        category: 'math',
        level: 3,
        position: 0,
        correctAnswers: ['1/2', '0.5', 'half', 'one half']
      },
      {
        _id: 'math-3-1',
        title: 'Quadratic Basics',
        prompt: 'If x² = 25, what are the possible values of x?',
        category: 'math',
        level: 3,
        position: 1,
        correctAnswers: ['5 and -5', '-5 and 5', '±5', 'plus or minus 5']
      },
      {
        _id: 'math-3-2',
        title: 'Compound Interest',
        prompt: 'If you invest $100 at 10% annual interest, how much will you have after 2 years (compounded annually)?',
        category: 'math',
        level: 3,
        position: 2,
        correctAnswers: ['121', '$121', '121 dollars']
      },
      {
        _id: 'math-3-3',
        title: 'Trigonometry',
        prompt: 'What is the value of sin(90°)?',
        category: 'math',
        level: 3,
        position: 3,
        correctAnswers: ['1', 'one']
      },
      {
        _id: 'math-3-4',
        title: 'Logarithms',
        prompt: 'What is log₁₀(1000)?',
        category: 'math',
        level: 3,
        position: 4,
        correctAnswers: ['3', 'three']
      }
    ]
  },
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
      },
      {
        _id: 'logic-1-3',
        title: 'Pattern Recognition',
        prompt: 'Complete the pattern: A, C, E, G, ?',
        category: 'logic',
        level: 1,
        position: 3,
        correctAnswers: ['I', 'i']
      },
      {
        _id: 'logic-1-4',
        title: 'Simple Deduction',
        prompt: 'If today is Monday, what day will it be in 10 days?',
        category: 'logic',
        level: 1,
        position: 4,
        correctAnswers: ['Thursday', 'thursday']
      }
    ],
    2: [
      {
        _id: 'logic-2-0',
        title: 'Fibonacci Sequence',
        prompt: 'What comes next: 1, 1, 2, 3, 5, 8, ?',
        category: 'logic',
        level: 2,
        position: 0,
        correctAnswers: ['13', 'thirteen']
      },
      {
        _id: 'logic-2-1',
        title: 'Syllogism',
        prompt: 'All cats are mammals. Some mammals are dogs. Therefore, some cats are dogs. Is this valid?',
        category: 'logic',
        level: 2,
        position: 1,
        correctAnswers: ['no', 'false', 'invalid', 'incorrect']
      },
      {
        _id: 'logic-2-2',
        title: 'Grid Logic',
        prompt: 'In a 3x3 grid, if X marks are in corners only, how many X marks are there?',
        category: 'logic',
        level: 2,
        position: 2,
        correctAnswers: ['4', 'four']
      },
      {
        _id: 'logic-2-3',
        title: 'Set Theory',
        prompt: 'If set A has 5 elements and set B has 3 elements, what is the maximum number of elements in A ∪ B?',
        category: 'logic',
        level: 2,
        position: 3,
        correctAnswers: ['8', 'eight']
      },
      {
        _id: 'logic-2-4',
        title: 'Truth Tables',
        prompt: 'What is the result of TRUE AND FALSE?',
        category: 'logic',
        level: 2,
        position: 4,
        correctAnswers: ['false', 'FALSE', 'False']
      }
    ],
    3: [
      {
        _id: 'logic-3-0',
        title: 'Complex Pattern',
        prompt: 'Find the pattern: 1, 4, 9, 16, 25, ?',
        category: 'logic',
        level: 3,
        position: 0,
        correctAnswers: ['36', 'thirty-six', 'thirty six']
      },
      {
        _id: 'logic-3-1',
        title: 'Knights and Knaves',
        prompt: 'A person says "I am a knave." If knights always tell the truth and knaves always lie, what are they?',
        category: 'logic',
        level: 3,
        position: 1,
        correctAnswers: ['neither', 'impossible', 'paradox', 'contradiction']
      },
      {
        _id: 'logic-3-2',
        title: 'Propositional Logic',
        prompt: 'If P implies Q, and Q implies R, what can we conclude about P and R?',
        category: 'logic',
        level: 3,
        position: 2,
        correctAnswers: ['P implies R', 'p implies r', 'P → R']
      },
      {
        _id: 'logic-3-3',
        title: 'Combinatorics',
        prompt: 'How many ways can you arrange the letters in "CAT"?',
        category: 'logic',
        level: 3,
        position: 3,
        correctAnswers: ['6', 'six']
      },
      {
        _id: 'logic-3-4',
        title: 'Proof by Contradiction',
        prompt: 'To prove √2 is irrational, we assume it is rational and show this leads to what?',
        category: 'logic',
        level: 3,
        position: 4,
        correctAnswers: ['contradiction', 'Contradiction', 'paradox']
      }
    ]
  },
  riddles: {
    1: [
      {
        _id: 'riddles-1-0',
        title: 'Classic Riddle',
        prompt: 'What has keys but no locks, space but no room, and you can enter but not go inside?',
        category: 'riddles',
        level: 1,
        position: 0,
        correctAnswers: ['keyboard', 'Keyboard', 'a keyboard']
      },
      {
        _id: 'riddles-1-1',
        title: 'Word Play',
        prompt: 'What gets wet while drying?',
        category: 'riddles',
        level: 1,
        position: 1,
        correctAnswers: ['towel', 'Towel', 'a towel']
      },
      {
        _id: 'riddles-1-2',
        title: 'Logic Riddle',
        prompt: 'I am tall when I am young, and short when I am old. What am I?',
        category: 'riddles',
        level: 1,
        position: 2,
        correctAnswers: ['candle', 'Candle', 'a candle']
      },
      {
        _id: 'riddles-1-3',
        title: 'Common Riddle',
        prompt: 'What has hands but cannot clap?',
        category: 'riddles',
        level: 1,
        position: 3,
        correctAnswers: ['clock', 'Clock', 'a clock', 'watch', 'a watch']
      },
      {
        _id: 'riddles-1-4',
        title: 'Easy Riddle',
        prompt: 'What goes up but never comes down?',
        category: 'riddles',
        level: 1,
        position: 4,
        correctAnswers: ['age', 'Age', 'your age']
      }
    ],
    2: [
      {
        _id: 'riddles-2-0',
        title: 'Tricky Riddle',
        prompt: 'A man lives on the 20th floor. Every day he takes the elevator to the 1st floor. When he comes back, he takes the elevator to the 10th floor and walks the rest. Why?',
        category: 'riddles',
        level: 2,
        position: 0,
        correctAnswers: ['he is short', 'too short', 'cant reach', 'short', 'height']
      },
      {
        _id: 'riddles-2-1',
        title: 'Mystery Riddle',
        prompt: 'What disappears as soon as you say its name?',
        category: 'riddles',
        level: 2,
        position: 1,
        correctAnswers: ['silence', 'Silence']
      },
      {
        _id: 'riddles-2-2',
        title: 'Brain Teaser',
        prompt: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
        category: 'riddles',
        level: 2,
        position: 2,
        correctAnswers: ['map', 'Map', 'a map']
      },
      {
        _id: 'riddles-2-3',
        title: 'Word Riddle',
        prompt: 'What comes once in a minute, twice in a moment, but never in a thousand years?',
        category: 'riddles',
        level: 2,
        position: 3,
        correctAnswers: ['m', 'M', 'letter m', 'the letter m']
      },
      {
        _id: 'riddles-2-4',
        title: 'Clever Riddle',
        prompt: 'The more you take, the more you leave behind. What am I?',
        category: 'riddles',
        level: 2,
        position: 4,
        correctAnswers: ['footsteps', 'Footsteps', 'steps']
      }
    ],
    3: [
      {
        _id: 'riddles-3-0',
        title: 'Hard Logic',
        prompt: 'Two fathers and two sons go fishing. They each catch one fish. How is it that only 3 fish were caught?',
        category: 'riddles',
        level: 3,
        position: 0,
        correctAnswers: ['grandfather father son', 'three generations', 'grandpa dad son', '3 people']
      },
      {
        _id: 'riddles-3-1',
        title: 'Math Riddle',
        prompt: 'I am an odd number. Take away a letter and I become even. What number am I?',
        category: 'riddles',
        level: 3,
        position: 1,
        correctAnswers: ['seven', 'Seven', '7']
      },
      {
        _id: 'riddles-3-2',
        title: 'Complex Riddle',
        prompt: 'What can travel around the world while staying in a corner?',
        category: 'riddles',
        level: 3,
        position: 2,
        correctAnswers: ['stamp', 'Stamp', 'a stamp', 'postage stamp']
      },
      {
        _id: 'riddles-3-3',
        title: 'Abstract Thinking',
        prompt: 'I am not alive, but I grow. I don\'t have lungs, but I need air. I don\'t have a mouth, but water kills me. What am I?',
        category: 'riddles',
        level: 3,
        position: 3,
        correctAnswers: ['fire', 'Fire', 'flame']
      },
      {
        _id: 'riddles-3-4',
        title: 'Master Riddle',
        prompt: 'What is so fragile that saying its name breaks it?',
        category: 'riddles',
        level: 3,
        position: 4,
        correctAnswers: ['silence', 'Silence']
      }
    ]
  },
  patterns: {
    1: [
      {
        _id: 'patterns-1-0',
        title: 'Shape Sequence',
        prompt: 'Continue the pattern: Circle, Square, Triangle, Circle, Square, ?',
        category: 'patterns',
        level: 1,
        position: 0,
        correctAnswers: ['triangle', 'Triangle']
      },
      {
        _id: 'patterns-1-1',
        title: 'Color Pattern',
        prompt: 'If the pattern is Red, Blue, Red, Blue, Red, what comes next?',
        category: 'patterns',
        level: 1,
        position: 1,
        correctAnswers: ['blue', 'Blue']
      },
      {
        _id: 'patterns-1-2',
        title: 'Number Doubling',
        prompt: 'Find the next number: 1, 2, 4, 8, ?',
        category: 'patterns',
        level: 1,
        position: 2,
        correctAnswers: ['16', 'sixteen']
      },
      {
        _id: 'patterns-1-3',
        title: 'Letter Skip',
        prompt: 'Continue: A, C, E, G, ?',
        category: 'patterns',
        level: 1,
        position: 3,
        correctAnswers: ['I', 'i']
      },
      {
        _id: 'patterns-1-4',
        title: 'Growing Pattern',
        prompt: 'What comes next: 1, 3, 6, 10, ?',
        category: 'patterns',
        level: 1,
        position: 4,
        correctAnswers: ['15', 'fifteen']
      }
    ],
    2: [
      {
        _id: 'patterns-2-0',
        title: 'Complex Sequence',
        prompt: 'Find the pattern: 2, 6, 12, 20, 30, ?',
        category: 'patterns',
        level: 2,
        position: 0,
        correctAnswers: ['42', 'forty-two']
      },
      {
        _id: 'patterns-2-1',
        title: 'Alternating Pattern',
        prompt: 'Continue: 1, 4, 2, 8, 3, 12, 4, ?',
        category: 'patterns',
        level: 2,
        position: 1,
        correctAnswers: ['16', 'sixteen']
      },
      {
        _id: 'patterns-2-2',
        title: 'Prime Sequence',
        prompt: 'What comes next: 2, 3, 5, 7, 11, ?',
        category: 'patterns',
        level: 2,
        position: 2,
        correctAnswers: ['13', 'thirteen']
      },
      {
        _id: 'patterns-2-3',
        title: 'Geometric Growth',
        prompt: 'Continue the pattern: 3, 9, 27, 81, ?',
        category: 'patterns',
        level: 2,
        position: 3,
        correctAnswers: ['243', 'two hundred forty-three']
      },
      {
        _id: 'patterns-2-4',
        title: 'Mixed Operations',
        prompt: 'Find next: 1, 3, 4, 7, 11, 18, ?',
        category: 'patterns',
        level: 2,
        position: 4,
        correctAnswers: ['29', 'twenty-nine']
      }
    ],
    3: [
      {
        _id: 'patterns-3-0',
        title: 'Advanced Series',
        prompt: 'What comes next: 1, 1, 2, 6, 24, 120, ?',
        category: 'patterns',
        level: 3,
        position: 0,
        correctAnswers: ['720', 'seven hundred twenty']
      },
      {
        _id: 'patterns-3-1',
        title: 'Polynomial Pattern',
        prompt: 'Continue: 0, 1, 8, 27, 64, ?',
        category: 'patterns',
        level: 3,
        position: 1,
        correctAnswers: ['125', 'one hundred twenty-five']
      },
      {
        _id: 'patterns-3-2',
        title: 'Matrix Pattern',
        prompt: 'In a 4x4 grid pattern, if diagonal elements are 1, 2, 3, 4, what is the sum?',
        category: 'patterns',
        level: 3,
        position: 2,
        correctAnswers: ['10', 'ten']
      },
      {
        _id: 'patterns-3-3',
        title: 'Recursive Sequence',
        prompt: 'If a(n) = a(n-1) + a(n-2) and a(1)=2, a(2)=3, what is a(5)?',
        category: 'patterns',
        level: 3,
        position: 3,
        correctAnswers: ['13', 'thirteen']
      },
      {
        _id: 'patterns-3-4',
        title: 'Complex Pattern',
        prompt: 'Find the pattern: 2, 12, 36, 80, 150, ?',
        category: 'patterns',
        level: 3,
        position: 4,
        correctAnswers: ['252', 'two hundred fifty-two']
      }
    ]
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'BrainKick Enhanced',
    database: mongoose.connection.readyState === 1 ? 'MongoDB' : 'In-Memory',
    totalPuzzles: Object.values(puzzles).reduce((acc, category) => 
      acc + Object.values(category).reduce((catAcc, level) => catAcc + level.length, 0), 0
    )
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
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ 
          error: existingUser.email === email ? 'Email already registered' : 'Username taken' 
        });
      }

      const user = new User({ username, email, password });
      await user.save();

      const streak = new Streak({ userId: user._id, solvedPuzzles: [] });
      await streak.save();

  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        message: 'Welcome to BrainKick! 🧠⚡',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    } else {
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

  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
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
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        message: 'Welcome back! 🎯',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    } else {
      const user = memoryUsers.find(u => u.email === email);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
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

// Validate answer (protected) - Enhanced with duplicate checking
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
    
    // First check exact matches (faster)
    const exactMatch = puzzle.correctAnswers.some(correctAnswer => 
      correctAnswer.toLowerCase().trim() === answer.toLowerCase().trim()
    );
    
    let correct = exactMatch;
    let aiResponse = null;
    
    // If no exact match, use AI validation
    if (!exactMatch && process.env.OPENAI_API_KEY) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are validating answers for a brain training app. Be lenient with spelling, phrasing, and format while maintaining accuracy.
              
              Rules:
              - Accept equivalent answers (e.g., "8" and "eight")
              - Accept minor spelling mistakes
              - Accept different phrasings of the same concept
              - Accept mathematical equivalents (e.g., "1/2" and "0.5")
              - Reject answers that are fundamentally wrong
              
              Respond with only "CORRECT" or "INCORRECT" followed by a brief explanation.`
            },
            {
              role: "user",
              content: `Question: ${puzzle.prompt}
              
              Correct answers include: ${puzzle.correctAnswers.join(', ')}
              
              User's answer: "${answer}"
              
              Is this answer correct?`
            }
          ],
          max_tokens: 100,
          temperature: 0.1
        });
        
        aiResponse = completion.choices[0].message.content;
        correct = aiResponse.toLowerCase().startsWith('correct');
        
      } catch (aiError) {
        console.error('AI validation error:', aiError);
        // Fall back to exact match only
        correct = exactMatch;
      }
    }
    
    console.log(`✅ Answer "${answer}" for puzzle "${puzzle.title}" is ${correct ? 'correct' : 'wrong'}`);
    
    // Update streak if correct
    if (correct) {
      await updateStreak(userId);
    }
    
    const responseMessage = correct 
      ? 'Excellent work! 🎉' 
      : aiResponse 
        ? `Not quite right. ${aiResponse.split('INCORRECT')[1]?.trim() || 'Try again!'} 🤔`
        : 'Not quite right. Give it another try! 🤔';
    
    res.json({
      correct,
      message: responseMessage
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Failed to validate answer' });
  }
});

// Get hint (protected)
app.post('/api/puzzles/:id/hint', authenticateToken, async (req, res) => {
  try {
    const puzzleId = req.params.id;
    
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
    
    let hint = 'Think step by step and look for patterns! 💡';
    
    if (process.env.OPENAI_API_KEY) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are a helpful tutor for a brain training app. Give hints that guide users toward the answer without giving it away directly.

              Guidelines:
              - Don't reveal the answer
              - Provide a useful strategy or approach
              - Keep hints encouraging and educational
              - Make hints specific to the question type
              - Use emojis to make it friendly
              - Keep hints under 100 characters when possible`
            },
            {
              role: "user",
              content: `Give a helpful hint for this ${puzzle.category} puzzle:

              Question: ${puzzle.prompt}
              Category: ${puzzle.category}
              Level: ${puzzle.level}
              
              (Don't reveal the answer: ${puzzle.correctAnswers[0]})`
            }
          ],
          max_tokens: 80,
          temperature: 0.7
        });
        
        hint = completion.choices[0].message.content.trim();
        
      } catch (aiError) {
        console.error('AI hint error:', aiError);
        // Use category-specific fallback hints
        const categoryHints = {
          math: 'Break down the problem step by step. What operation do you need? 🔢',
          logic: 'Look for the pattern or rule. What connects the pieces? 🧩',
          riddles: 'Think outside the box! What could have a double meaning? 🤔',
          patterns: 'What changes between each element? Look for the sequence! 🔍'
        };
        hint = categoryHints[puzzle.category] || hint;
      }
    }
    
    console.log('✅ Hint provided for puzzle:', puzzle.title);
    res.json({ hint });
  } catch (error) {
    console.error('Hint error:', error);
    res.status(500).json({ error: 'Unable to get hint right now' });
  }
});

//Give up (protected)
app.post('/api/puzzles/:id/skip', authenticateToken, async (req, res) => {
  try {
    const puzzleId = req.params.id;
    
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
    
    let explanation = `The answer is: ${puzzle.correctAnswers[0]}`;
    
    // Generate AI explanation if available
    if (process.env.OPENAI_API_KEY) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are explaining puzzle solutions in a brain training app. Provide clear, educational explanations that help users understand the reasoning.

              Guidelines:
              - Start with the answer
              - Explain the logic or method used
              - Keep it educational and encouraging
              - Use simple language
              - Make it under 150 words
              - End with encouragement`
            },
            {
              role: "user",
              content: `Explain the solution to this ${puzzle.category} puzzle:

              Question: ${puzzle.prompt}
              Answer: ${puzzle.correctAnswers[0]}
              Category: ${puzzle.category}
              Level: ${puzzle.level}`
            }
          ],
          max_tokens: 120,
          temperature: 0.3
        });
        
        explanation = completion.choices[0].message.content.trim();
        
      } catch (aiError) {
        console.error('AI explanation error:', aiError);
      }
    }
    
    console.log(`✅ Puzzle skipped: ${puzzle.title}`);
    res.json({
      answer: puzzle.correctAnswers[0],
      explanation: explanation
    });
  } catch (error) {
    console.error('Skip error:', error);
    res.status(500).json({ error: 'Unable to skip puzzle' });
  }
});

// Get user stats (protected)
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    if (mongoose.connection.readyState === 1) {
      const streak = await Streak.findOne({ userId }) || { 
        currentStreak: 0, 
        longestStreak: 0,
        totalPuzzlesSolved: 0,
        solvedPuzzles: []
      };
      
      res.json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalPuzzlesSolved: streak.totalPuzzlesSolved,
        lastActivityDate: streak.lastActivityDate,
        uniquePuzzlesSolved: streak.solvedPuzzles?.length || 0
      });
    } else {
      const streak = memoryStreaks.find(s => s.userId === userId) || { 
        currentStreak: 0, 
        longestStreak: 0,
        totalPuzzlesSolved: 0,
        lastActivityDate: null,
        solvedPuzzles: []
      };
      
      res.json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalPuzzlesSolved: streak.totalPuzzlesSolved,
        lastActivityDate: streak.lastActivityDate,
        uniquePuzzlesSolved: streak.solvedPuzzles?.length || 0
      });
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ BrainKick Enhanced server running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/api/health`);
  console.log(`🧩 Total puzzles available: ${Object.values(puzzles).reduce((acc, category) => 
    acc + Object.values(category).reduce((catAcc, level) => catAcc + level.length, 0), 0)}`);
  if (mongoose.connection.readyState !== 1) {
    console.log('💡 Install MongoDB for persistent data storage');
  }
});