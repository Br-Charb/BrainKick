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

app.use(cors({
  origin: 'https://your-frontend-domain.com',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
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

const levelProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  level: { type: Number, required: true },
  completed: { type: Boolean, default: false },
  puzzlesSolved: { type: Number, default: 0 },
  totalPuzzles: { type: Number, default: 5 }, // 5 puzzles per level
  solvedPuzzleIds: [{ type: String }], // Track which specific puzzles were solved
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Create compound index for efficient queries
levelProgressSchema.index({ userId: 1, category: 1, level: 1 }, { unique: true });

const LevelProgress = mongoose.model('LevelProgress', levelProgressSchema);

// ADD in-memory storage for level progress (add after other memory arrays):
let memoryLevelProgress = [];

const User = mongoose.model('User', userSchema);

// Streak Schema
const streakSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActivityDate: { type: Date },
  totalPuzzlesSolved: { type: Number, default: 0 },
  solvedPuzzles: [{ type: String }], // Track which puzzles were solved to avoid duplicates
  // Keep a small history of solves with timestamps so we can build weekly charts
  solvedHistory: [{ puzzleId: String, solvedAt: Date }],
  // Track total time spent on puzzles
  totalTimeSpent: { type: Number, default: 0 },
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
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
  // Normalize to string so in-memory storage comparisons are consistent
  req.userId = String(decoded.userId);
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Helper function to update streak (only for NEW puzzles)
// Now accepts puzzleId and will NOT increment totals if puzzle was already solved by the user.
const updateStreak = async (userId, puzzleId) => {
  try {
    const today = new Date().toDateString();
    
    if (mongoose.connection.readyState === 1) {
      // MongoDB is available
      // Convert string ID to ObjectId if needed
      const mongoUserId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      let streak = await Streak.findOne({ userId: mongoUserId });

      if (!streak) {
        streak = new Streak({ userId: mongoUserId, totalPuzzlesSolved: 0, solvedPuzzles: [] }); // Ensure it starts at 0
      }

      // If this puzzle was already marked solved, do NOT increment totals or modify streak.
      if (puzzleId && Array.isArray(streak.solvedPuzzles) && streak.solvedPuzzles.includes(puzzleId)) {
        console.log(`ℹ️ Puzzle ${puzzleId} already counted for user ${userId}; skipping streak/progress update.`);
        return;
      }

      const lastActivity = streak.lastActivityDate?.toDateString();

      if (lastActivity !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (lastActivity === yesterday) {
          // Yesterday - continue streak
          streak.currentStreak++;
        } else if (lastActivity) {
          // Gap in activity - reset streak to 1
          streak.currentStreak = 1;
        } else {
          // First activity ever
          streak.currentStreak = 1;
        }

        streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
        streak.lastActivityDate = new Date();
      }

      // Increment total puzzles solved and record which puzzle was solved
      streak.totalPuzzlesSolved = (streak.totalPuzzlesSolved || 0) + 1;
      if (puzzleId) {
        streak.solvedPuzzles = streak.solvedPuzzles || [];
  streak.solvedPuzzles.push(puzzleId);
  streak.solvedHistory = streak.solvedHistory || [];
  streak.solvedHistory.push({ puzzleId, solvedAt: new Date() });
      }

      streak.updatedAt = new Date();

      await streak.save();
      console.log(`✅ Stats updated for user ${userId}: ${streak.totalPuzzlesSolved} total, ${streak.currentStreak} streak`);

    } else {
      // Use memory storage
  let streak = memoryStreaks.find(s => String(s.userId) === String(userId));
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

      // If already solved, skip
      if (puzzleId && Array.isArray(streak.solvedPuzzles) && streak.solvedPuzzles.includes(puzzleId)) {
        console.log(`ℹ️ Memory: Puzzle ${puzzleId} already counted for user ${userId}; skipping.`);
        return;
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

      // Increment total and mark solved
      streak.totalPuzzlesSolved++;
      if (puzzleId) {
        streak.solvedPuzzles = streak.solvedPuzzles || [];
  streak.solvedPuzzles.push(puzzleId);
  streak.solvedHistory = streak.solvedHistory || [];
  streak.solvedHistory.push({ puzzleId, solvedAt: new Date() });
      }

      console.log(`✅ Memory stats updated for user ${userId}: ${streak.totalPuzzlesSolved} total, ${streak.currentStreak} streak`);
    }
  } catch (error) {
    console.error('Streak update error:', error);
  }
};

const updateLevelProgress = async (userId, category, level, puzzleId) => {
  try {
    if (mongoose.connection.readyState === 1) {
      // MongoDB is available
      // Convert string ID to ObjectId if needed
      const mongoUserId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      let progress = await LevelProgress.findOne({ userId: mongoUserId, category, level });
      
      if (!progress) {
        progress = new LevelProgress({
          userId: mongoUserId,
          category,
          level,
          puzzlesSolved: 0,
          totalPuzzles: 5,
          completed: false,
          solvedPuzzleIds: []
        });
      }
      
      // Check if this puzzle is already counted
      if (!progress.solvedPuzzleIds.includes(puzzleId)) {
        progress.solvedPuzzleIds.push(puzzleId);
        progress.puzzlesSolved = progress.solvedPuzzleIds.length;
        
        // Check if level is completed (all 5 puzzles solved)
        if (progress.puzzlesSolved >= progress.totalPuzzles && !progress.completed) {
          progress.completed = true;
          progress.completedAt = new Date();
          console.log(`🎉 Level completed: ${category} Level ${level} by user ${userId}`);
        }

        await progress.save();
      } else {
        console.log(`ℹ️ Level progress already counted for puzzle ${puzzleId} for user ${userId}`);
      }
      
    } else {
      // Memory storage
      let progress = memoryLevelProgress.find(p => 
        String(p.userId) === String(userId) && p.category === category && p.level === level
      );
      
      if (!progress) {
        progress = {
          userId: String(userId),
          category,
          level,
          puzzlesSolved: 0,
          totalPuzzles: 5,
          completed: false,
          solvedPuzzleIds: [],
          completedAt: null,
          createdAt: new Date()
        };
        memoryLevelProgress.push(progress);
      }
      
      // Check if this puzzle is already counted
      if (!progress.solvedPuzzleIds.includes(puzzleId)) {
        progress.solvedPuzzleIds.push(puzzleId);
        progress.puzzlesSolved = progress.solvedPuzzleIds.length;

        // Check if level is completed
        if (progress.puzzlesSolved >= progress.totalPuzzles && !progress.completed) {
          progress.completed = true;
          progress.completedAt = new Date();
          console.log(`🎉 Level completed: ${category} Level ${level} by user ${userId}`);
        }
      } else {
        console.log(`ℹ️ Memory: Level progress already counted for puzzle ${puzzleId} for user ${userId}`);
      }
    }
  } catch (error) {
    console.error('Level progress update error:', error);
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
        correctAnswers: ['42', 'forty-two', 'forty two'],
        hint: 'Try adding the ones place first ($5 + 7$), then the tens place ($10 + 20$). 🔢',
        explanation: 'The answer is 42. When adding $15 + 27$, you can break it down: $15 + 27 = (10 + 20) + (5 + 7) = 30 + 12 = 42$. Always line up the place values!'
      },
      {
        _id: 'math-1-1',
        title: 'Simple Multiplication',
        prompt: 'What is 7 × 8?',
        category: 'math',
        level: 1,
        position: 1,
        correctAnswers: ['56', 'fifty-six', 'fifty six'],
        hint: 'Think of it as 7 groups of 8, or use the times table trick: $7 × 8$ is close to $7 × 10 = 70$. 📐',
        explanation: 'The answer is 56. You can think of $7 × 8$ as adding 8 seven times: $8+8+8+8+8+8+8 = 56$. Or remember that $7 × 8 = (7 × 10) - (7 × 2) = 70 - 14 = 56$.'
      },
      {
        _id: 'math-1-2',
        title: 'Easy Division',
        prompt: 'What is 144 ÷ 12?',
        category: 'math',
        level: 1,
        position: 2,
        correctAnswers: ['12', 'twelve'],
        hint: 'Think: how many 12s fit into 144? Try counting by 12s or use multiplication facts. ➗',
        explanation: 'The answer is 12. Division asks "how many groups?" So $144 ÷ 12$ asks "how many 12s make 144?" Since $12 × 12 = 144$, the answer is 12.'
      },
      {
        _id: 'math-1-3',
        title: 'Subtraction',
        prompt: 'What is 85 - 39?',
        category: 'math',
        level: 1,
        position: 3,
        correctAnswers: ['46', 'forty-six', 'forty six'],
        hint: 'You might need to borrow from the tens place. Or try adding up: $39 + ? = 85$. 🔄',
        explanation: 'The answer is 46. When subtracting $85 - 39$, you can borrow: 85 becomes $75 + 10$, so $(75 - 30) + (15 - 9) = 45 + 1 = 46$. Or count up from 39 to 85.'
      },
      {
        _id: 'math-1-4',
        title: 'Order of Operations',
        prompt: 'What is 5 + 3 × 2?',
        category: 'math',
        level: 1,
        position: 4,
        correctAnswers: ['11', 'eleven'],
        hint: 'Remember PEMDAS! Multiplication comes before addition. Do $3 × 2$ first. ⚡',
        explanation: 'The answer is 11. Using order of operations (PEMDAS), multiply first: $3 × 2 = 6$, then add: $5 + 6 = 11$. If you did left to right ($5 + 3 = 8$, then $8 × 2 = 16$), that would be incorrect!'
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
        correctAnswers: ['1', 'one', '4/4', '1.0'],
        hint: 'Same denominator makes this easy! Just add the numerators: $3 + 1$. 🍕',
        explanation: 'The answer is 1. When fractions have the same denominator, add the numerators: $3/4 + 1/4 = (3+1)/4 = 4/4 = 1$. Think of it as 3 pizza slices plus 1 pizza slice equals 4 slices, which is a whole pizza!'
      },
      {
        _id: 'math-2-1',
        title: 'Percentages',
        prompt: 'What is 25% of 80?',
        category: 'math',
        level: 2,
        position: 1,
        correctAnswers: ['20', 'twenty'],
        hint: '$25\\% = 1/4$, so you need to find one-fourth of 80. What is $80 ÷ 4$? 📊',
        explanation: 'The answer is 20. $25\%$ means $25/100$ or $1/4$. So $25\%$ of $80 = 1/4 × 80 = 80 ÷ 4 = 20$. You can also think: $25\%$ of $100 = 25$, so $25\%$ of $80$ would be a bit less.'
      },
      {
        _id: 'math-2-2',
        title: 'Square Roots',
        prompt: 'What is the square root of 64?',
        category: 'math',
        level: 2,
        position: 2,
        correctAnswers: ['8', 'eight'],
        hint: 'What number times itself equals 64? Try some perfect squares: $6×6$, $7×7$, $8×8$... $\\sqrt{}$',
        explanation: 'The answer is 8. The square root asks "what number times itself gives 64?" Since $8 × 8 = 64$, $\\sqrt{64} = 8$. Perfect squares are handy to memorize!'
      },
      {
        _id: 'math-2-3',
        title: 'Area Problem',
        prompt: 'What is the area of a rectangle with length 6 and width 4?',
        category: 'math',
        level: 2,
        position: 3,
        correctAnswers: ['24', 'twenty-four', 'twenty four'],
        hint: 'Area of rectangle = length $\\times$ width. Just multiply the two dimensions! 📐',
        explanation: 'The answer is 24. For a rectangle, Area = length $\\times$ width $= 6 × 4 = 24$ square units. Imagine a $6\\times4$ grid of squares - count them all and you get 24!'
      },
      {
        _id: 'math-2-4',
        title: 'Algebra',
        prompt: 'If x + 5 = 12, what is x?',
        category: 'math',
        level: 2,
        position: 4,
        correctAnswers: ['7', 'seven'],
        hint: 'What number plus 5 equals 12? Or subtract 5 from both sides of the equation. 🎯',
        explanation: 'The answer is 7. To solve $x + 5 = 12$, subtract 5 from both sides: $x + 5 - 5 = 12 - 5$, so $x = 7$. Check: $7 + 5 = 12$ ✓'
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
        correctAnswers: ['1/2', '0.5', 'half', 'one half'],
        hint: 'Multiply numerators together, denominators together: $(2\\times3)/(3\\times4)$. Then simplify! $\\times$',
        explanation: 'The answer is $1/2$. When multiplying fractions: $(2/3) × (3/4) = (2\\times3)/(3\\times4) = 6/12$. Simplify by dividing both by 6: $6/12 = 1/2$. You can also cancel the 3s before multiplying.'
      },
      {
        _id: 'math-3-1',
        title: 'Quadratic Basics',
        prompt: 'If x² = 25, what are the possible values of x?',
        category: 'math',
        level: 3,
        position: 1,
        correctAnswers: ['5 and -5', '-5 and 5', '±5', 'plus or minus 5'],
        hint: 'What number times itself is 25? Don\'t forget negative numbers: $(-5) × (-5) = 25$ too! $\\pm$',
        explanation: 'The answer is $\\pm5$ (plus or minus 5). Since $5^2 = 25$ and $(-5)^2 = 25$, both $x = 5$ and $x = -5$ are solutions. Remember: any positive number has two square roots!'
      },
      {
        _id: 'math-3-2',
        title: 'Compound Interest',
        prompt: 'If you invest $100 at 10% annual interest, how much will you have after 2 years (compounded annually)?',
        category: 'math',
        level: 3,
        position: 2,
        correctAnswers: ['121', '$121', '121 dollars'],
        hint: 'Year 1: $100 + 10\\% = $110$. Year 2: $110 + 10\\%$ of $110$. Interest earns interest! 💰',
        explanation: 'The answer is $121. Year 1: $100 \\times 1.10 = $110$. Year 2: $110 \\times 1.10 = $121. The formula is: Final = Principal $\\times$ $(1 + rate)^{years} = 100 \\times (1.10)^2 = $121.'
      },
      {
        _id: 'math-3-3',
        title: 'Trigonometry',
        prompt: 'What is the value of sin(90°)?',
        category: 'math',
        level: 3,
        position: 3,
        correctAnswers: ['1', 'one'],
        hint: 'Think of the unit circle. At $90^{\\circ}$, you\'re at the top point $(0, 1)$. What does $\\sin(\\theta)$ represent? 🔄',
        explanation: 'The answer is 1. On the unit circle, $\\sin(90^{\\circ})$ represents the $y$-coordinate at $90^{\\circ}$, which is the topmost point $(0,1)$. So $\\sin(90^{\\circ}) = 1$.'
      },
      {
        _id: 'math-3-4',
        title: 'Logarithms',
        prompt: 'What is log₁₀(1000)?',
        category: 'math',
        level: 3,
        position: 4,
        correctAnswers: ['3', 'three'],
        hint: 'Logarithm asks: "10 to what power equals 1000?" Think: $10^1 = 10$, $10^2 = 100$, $10^3 = ?$ 📈',
        explanation: 'The answer is 3. $\\log_{10}(1000)$ asks "10 to what power equals 1000?" Since $10^3 = 1000$, the answer is 3. Logs are the inverse of exponents!'
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
        correctAnswers: ['10', 'ten'],
        hint: 'Look at the differences between numbers. What\'s $4-2$? What\'s $6-4$? See the pattern? 📈',
        explanation: 'The answer is 10. This sequence increases by 2 each time: 2, $4(+2)$, $6(+2)$, $8(+2)$, $10(+2)$. It\'s the even numbers!'
      },
      {
        _id: 'logic-1-1',
        title: 'Odd One Out',
        prompt: 'Which doesn\'t belong: Apple, Banana, Carrot, Orange?',
        category: 'logic',
        level: 1,
        position: 1,
        correctAnswers: ['carrot'],
        hint: 'Think about categories. Three of these grow on trees or plants above ground... 🌳',
        explanation: 'The answer is **Carrot**. Apple, Banana, and Orange are all fruits that typically grow above ground, while a carrot is a vegetable that grows underground (it\'s a root).'
      },
      {
        _id: 'logic-1-2',
        title: 'Logic Chain',
        prompt: 'If all Bloops are Razzles and all Razzles are Lazzles, are all Bloops Lazzles?',
        category: 'logic',
        level: 1,
        position: 2,
        correctAnswers: ['yes', 'Yes', 'true', 'True'],
        hint: 'Follow the chain: Bloops $\\rightarrow$ Razzles $\\rightarrow$ Lazzles. If A leads to B, and B leads to C, then A leads to C! 🔗',
        explanation: 'The answer is **Yes**. This is called a syllogism or transitivity. If all Bloops are in the Razzles group, and all Razzles are in the Lazzles group, then all Bloops must logically be in the Lazzles group.'
      },
      {
        _id: 'logic-1-3',
        title: 'Pattern Recognition',
        prompt: 'Complete the pattern: A, C, E, G, ?',
        category: 'logic',
        level: 1,
        position: 3,
        correctAnswers: ['I', 'i'],
        hint: 'Count the positions in the alphabet. A=1, C=3, E=5, G=7... What comes next? 🔤',
        explanation: 'The answer is **I**. This sequence skips every other letter: A(1st), C(3rd), E(5th), G(7th), I(9th). It\'s the odd-positioned letters of the alphabet!'
      },
      {
        _id: 'logic-1-4',
        title: 'Simple Deduction',
        prompt: 'If today is Monday, what day will it be in 10 days?',
        category: 'logic',
        level: 1,
        position: 4,
        correctAnswers: ['Thursday', 'thursday'],
        hint: 'There are 7 days in a week. So 10 days = 7 days + 3 days. After a full week, count 3 more days! 📅',
        explanation: 'The answer is **Thursday**. 10 days = 1 full week (7 days) + 3 days. Starting from Monday, after 7 days it\'s Monday again, then count 3 more: Tuesday, Wednesday, Thursday.'
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
        correctAnswers: ['13', 'thirteen'],
        hint: 'Each number is the sum of the two before it. $1+1=2$, $1+2=3$, $2+3=5$, $3+5=8$... 🌀',
        explanation: 'The answer is 13. This is the **Fibonacci sequence**, where each number equals the sum of the two preceding ones: $5 + 8 = 13$.'
      },
      {
        _id: 'logic-2-1',
        title: 'Syllogism',
        prompt: 'All cats are mammals. Some mammals are dogs. Therefore, some cats are dogs. Is this valid?',
        category: 'logic',
        level: 2,
        position: 1,
        correctAnswers: ['no', 'false', 'invalid', 'incorrect'],
        hint: 'Draw circles to represent the groups. Can cats and dogs overlap just because they\'re both mammals? 🐱🐶',
        explanation: 'The answer is **No/Invalid**. Just because cats and dogs share a category (mammals) does not mean they overlap. There\'s no direct link established between the "cats" set and the "dogs" set.'
      },
      {
        _id: 'logic-2-2',
        title: 'Grid Logic',
        prompt: 'In a 3x3 grid, if X marks are in corners only, how many X marks are there?',
        category: 'logic',
        level: 2,
        position: 2,
        correctAnswers: ['4', 'four'],
        hint: 'Draw a $3\\times3$ square. How many corners does any square have? ⏹️',
        explanation: 'The answer is 4. A square grid, regardless of size (like $3\\times3$), always has exactly 4 corners. The X marks are at positions (1,1), (1,3), (3,1), and (3,3).'
      },
      {
        _id: 'logic-2-3',
        title: 'Set Theory',
        prompt: 'If set A has 5 elements and set B has 3 elements, what is the maximum number of elements in A ∪ B?',
        category: 'logic',
        level: 2,
        position: 3,
        correctAnswers: ['8', 'eight'],
        hint: 'Union ($\cup$) combines sets. Maximum happens when sets have no overlap (they are **disjoint**). $5 + 3 = ?$ 🔄',
        explanation: 'The answer is 8. The union $A \\cup B$ combines all elements. The maximum number of elements occurs when the two sets have no elements in common, so you simply add the counts: $5 + 3 = 8$.'
      },
      {
        _id: 'logic-2-4',
        title: 'Truth Tables',
        prompt: 'What is the result of TRUE AND FALSE?',
        category: 'logic',
        level: 2,
        position: 4,
        correctAnswers: ['false', 'FALSE', 'False'],
        hint: 'The **AND** operator requires **BOTH** conditions to be true to return TRUE. If either is false, the result is false. ⚡',
        explanation: 'The answer is **FALSE**. In Boolean logic, the conjunction $P \\land Q$ (P AND Q) is only true when $P$ is true and $Q$ is true. Since one is false, the result is false.'
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
        correctAnswers: ['36', 'thirty-six', 'thirty six'],
        hint: 'These are perfect squares! $1^2$, $2^2$, $3^2$, $4^2$, $5^2$... What\'s $6^2$? $^2$',
        explanation: 'The answer is 36. This sequence shows the perfect squares of the natural numbers: $1^2=1$, $2^2=4$, $3^2=9$, $4^2=16$, $5^2=25$, so the next is $6^2=36$.'
      },
      {
        _id: 'logic-3-1',
        title: 'Knights and Knaves',
        prompt: 'A person says "I am a knave." If knights always tell the truth and knaves always lie, what are they?',
        category: 'logic',
        level: 3,
        position: 1,
        correctAnswers: ['neither', 'impossible', 'paradox', 'contradiction'],
        hint: 'If they\'re a knight (truth), they\'d be saying they\'re a knave (lie), which is a contradiction. If they\'re a knave (lie), they\'d be lying about being a knave, meaning they\'d be a knight (contradiction!). 🤯',
        explanation: 'The answer is **Neither/Impossible**. This statement creates a **paradox**. A knight cannot truthfully say they are a liar (knave), and a knave cannot lie and say they are a liar (knave). The scenario is logically impossible.'
      },
      {
        _id: 'logic-3-2',
        title: 'Propositional Logic',
        prompt: 'If P implies Q, and Q implies R, what can we conclude about P and R?',
        category: 'logic',
        level: 3,
        position: 2,
        correctAnswers: ['P implies R', 'p implies r', 'P → R'],
        hint: 'This is like a chain: P leads to Q, Q leads to R, so P leads to R. This is the **Law of Syllogism**. ⛓️',
        explanation: 'The answer is **P implies R** (or $P \\rightarrow R$). This is a principle of logic called **transitivity** or the **Hypothetical Syllogism**. If the truth of P guarantees the truth of Q, and the truth of Q guarantees the truth of R, then the truth of P guarantees the truth of R.'
      },
      {
        _id: 'logic-3-3',
        title: 'Combinatorics',
        prompt: 'How many ways can you arrange the letters in "CAT"?',
        category: 'logic',
        level: 3,
        position: 3,
        correctAnswers: ['6', 'six'],
        hint: 'For 3 distinct items, it\'s 3 factorial ($3!$). That\'s $3 \\times 2 \\times 1 = ?$ 🔀',
        explanation: 'The answer is 6. This is a permutation problem. For 3 unique items, the number of arrangements is $3!$ (3 factorial), which is $3 \\times 2 \\times 1 = 6$. The arrangements are CAT, CTA, ACT, ATC, TCA, TAC.'
      },
      {
        _id: 'logic-3-4',
        title: 'Proof by Contradiction',
        prompt: 'To prove √2 is irrational, we assume it is rational and show this leads to what?',
        category: 'logic',
        level: 3,
        position: 4,
        correctAnswers: ['contradiction', 'Contradiction', 'paradox'],
        hint: 'The name of the proof method is the biggest hint: **Proof by...** $\\neg$',
        explanation: 'The answer is a **Contradiction**. Proof by contradiction (or *reductio ad absurdum*) is a technique where you assume the opposite of what you want to prove ($\\sqrt{2}$ is rational) and show that this assumption leads to a statement that is logically impossible (a contradiction), thereby proving your original statement ($\\sqrt{2}$ is irrational).'
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
        correctAnswers: ['keyboard', 'Keyboard', 'a keyboard'],
        hint: 'You use this to type. It involves "space" for typing and "keys" for letters. ⌨️',
        explanation: 'The answer is a **Keyboard**. It has keys (for letters/functions), space (the space bar), and you "enter" (press the Enter key) but don\'t go inside.'
      },
      {
        _id: 'riddles-1-1',
        title: 'Word Play',
        prompt: 'What gets wet while drying?',
        category: 'riddles',
        level: 1,
        position: 1,
        correctAnswers: ['towel', 'Towel', 'a towel'],
        hint: 'Think about what you use after a shower. It absorbs things. 🛀',
        explanation: 'The answer is a **Towel**. Its job is to dry you, but it becomes wet in the process of absorbing the moisture.'
      },
      {
        _id: 'riddles-1-2',
        title: 'Logic Riddle',
        prompt: 'I am tall when I am young, and short when I am old. What am I?',
        category: 'riddles',
        level: 1,
        position: 2,
        correctAnswers: ['candle', 'Candle', 'a candle'],
        hint: 'This object produces light and is used up over time. 🔥',
        explanation: 'The answer is a **Candle**. When new ("young"), it\'s tall. As it burns down ("old"), it becomes shorter.'
      },
      {
        _id: 'riddles-1-3',
        title: 'Common Riddle',
        prompt: 'What has hands but cannot clap?',
        category: 'riddles',
        level: 1,
        position: 3,
        correctAnswers: ['clock', 'Clock', 'a clock', 'watch', 'a watch'],
        hint: 'It measures the passage of time. ⏱️',
        explanation: 'The answer is a **Clock** (or a watch). The indicators on its face that point to the minutes and hours are called "hands."'
      },
      {
        _id: 'riddles-1-4',
        title: 'Easy Riddle',
        prompt: 'What goes up but never comes down?',
        category: 'riddles',
        level: 1,
        position: 4,
        correctAnswers: ['age', 'Age', 'your age'],
        hint: 'This is measured in years. Everyone has it. 🎂',
        explanation: 'The answer is your **Age**. Once you turn a year older, you don\'t turn a year younger; it only ever increases.'
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
        correctAnswers: ['he is short', 'too short', 'cant reach', 'short', 'height'],
        hint: 'The explanation is very simple, involving his physical ability to press a button. 🤏',
        explanation: 'The answer is **He is too short to reach the button for the 20th floor**. He can only reach the button for the 10th floor (or maybe he uses his umbrella/a neighbor for the other floors, but the classic answer is height).'
      },
      {
        _id: 'riddles-2-1',
        title: 'Mystery Riddle',
        prompt: 'What disappears as soon as you say its name?',
        category: 'riddles',
        level: 2,
        position: 1,
        correctAnswers: ['silence', 'Silence'],
        hint: 'The word itself describes an absence of sound. 🤫',
        explanation: 'The answer is **Silence**. The moment you speak the word "silence," you create sound, and thus the condition of silence is broken.'
      },
      {
        _id: 'riddles-2-2',
        title: 'Brain Teaser',
        prompt: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
        category: 'riddles',
        level: 2,
        position: 2,
        correctAnswers: ['map', 'Map', 'a map'],
        hint: 'You use me to find your way. I am a flat representation of the world. 🗺️',
        explanation: 'The answer is a **Map**. A map contains symbols for cities, mountains, and bodies of water, but they are only representations, not the actual things.'
      },
      {
        _id: 'riddles-2-3',
        title: 'Word Riddle',
        prompt: 'What comes once in a minute, twice in a moment, but never in a thousand years?',
        category: 'riddles',
        level: 2,
        position: 3,
        correctAnswers: ['m', 'M', 'letter m', 'the letter m'],
        hint: 'Look closely at the spelling of the words in the prompt. Which letter is present? 🔠',
        explanation: 'The answer is the **Letter M**. The letter "M" appears once in "minute," twice in "moment," and zero times in "thousand years."'
      },
      {
        _id: 'riddles-2-4',
        title: 'Clever Riddle',
        prompt: 'The more you take, the more you leave behind. What am I?',
        category: 'riddles',
        level: 2,
        position: 4,
        correctAnswers: ['footsteps', 'Footsteps', 'steps'],
        hint: 'This is what you create when you walk on a soft surface like mud or snow. 👣',
        explanation: 'The answer is **Footsteps** (or steps). The more steps you take, the more you leave behind a trail of your footprints.'
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
        correctAnswers: ['grandfather father son', 'three generations', 'grandpa dad son', '3 people'],
        hint: 'Consider the relationships in a family tree. One person can hold two roles! 👴👨‍👦',
        explanation: 'The answer is that there were only **three people** fishing: a **grandfather**, his **son** (who is also a father), and his **grandson** (who is also a son). The son is both a father and a son.'
      },
      {
        _id: 'riddles-3-1',
        title: 'Math Riddle',
        prompt: 'I am an odd number. Take away a letter and I become even. What number am I?',
        category: 'riddles',
        level: 3,
        position: 1,
        correctAnswers: ['seven', 'Seven', '7'],
        hint: 'Think about spelling out the numbers one by one. Which odd number, when you remove one letter, leaves an even number\'s spelling? ✍️',
        explanation: 'The answer is **Seven**. Remove the "s" from "seven" and you are left with "even."'
      },
      {
        _id: 'riddles-3-2',
        title: 'Complex Riddle',
        prompt: 'What can travel around the world while staying in a corner?',
        category: 'riddles',
        level: 3,
        position: 2,
        correctAnswers: ['stamp', 'Stamp', 'a stamp', 'postage stamp'],
        hint: 'It\'s small, sticky, and you put it on the corner of an envelope. ✉️',
        explanation: 'The answer is a **Stamp** (specifically a postage stamp). It stays fixed in the corner of an envelope, but the envelope can travel around the world.'
      },
      {
        _id: 'riddles-3-3',
        title: 'Abstract Thinking',
        prompt: 'I am not alive, but I grow. I don\'t have lungs, but I need air. I don\'t have a mouth, but water kills me. What am I?',
        category: 'riddles',
        level: 3,
        position: 3,
        correctAnswers: ['fire', 'Fire', 'flame'],
        hint: 'This is used for cooking and heat, and it can spread quickly. 🔥',
        explanation: 'The answer is **Fire**. It grows bigger, needs oxygen (air) to burn, and is put out by water.'
      },
      {
        _id: 'riddles-3-4',
        title: 'Master Riddle',
        prompt: 'What is so fragile that saying its name breaks it?',
        category: 'riddles',
        level: 3,
        position: 4,
        correctAnswers: ['silence', 'Silence'],
        hint: 'This is the same as logic-2-1. If you speak its name, it vanishes. 🤫',
        explanation: 'The answer is **Silence**. Speaking the word breaks the silence. This is a common and clever riddle!'
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
        correctAnswers: ['triangle', 'Triangle'],
        hint: 'The pattern repeats every three shapes. What\'s the third shape in the cycle? 🔺',
        explanation: 'The answer is **Triangle**. The sequence is a repeating pattern of (Circle, Square, Triangle). The next shape in the cycle is the Triangle.'
      },
      {
        _id: 'patterns-1-1',
        title: 'Color Pattern',
        prompt: 'If the pattern is Red, Blue, Red, Blue, Red, what comes next?',
        category: 'patterns',
        level: 1,
        position: 1,
        correctAnswers: ['blue', 'Blue'],
        hint: 'The colors are simply alternating. What color is the opposite of the last one listed? 🔴🔵',
        explanation: 'The answer is **Blue**. This is an alternating pattern of (Red, Blue). Since the last color was Red, the next must be Blue.'
      },
      {
        _id: 'patterns-1-2',
        title: 'Number Doubling',
        prompt: 'Find the next number: 1, 2, 4, 8, ?',
        category: 'patterns',
        level: 1,
        position: 2,
        correctAnswers: ['16', 'sixteen'],
        hint: 'Each number is twice the previous number. $8 \\times 2 = ?$ $\\times 2$',
        explanation: 'The answer is 16. This is a **geometric sequence** where each term is the previous term multiplied by 2. $8 \\times 2 = 16$.'
      },
      {
        _id: 'patterns-1-3',
        title: 'Letter Skip',
        prompt: 'Continue: A, C, E, G, ?',
        category: 'patterns',
        level: 1,
        position: 3,
        correctAnswers: ['I', 'i'],
        hint: 'It skips one letter between each term in the alphabet (B, D, F, H...). 🔠',
        explanation: 'The answer is **I**. This pattern skips one letter each time: A(skip B)C(skip D)E(skip F)G(skip H)I.'
      },
      {
        _id: 'patterns-1-4',
        title: 'Growing Pattern',
        prompt: 'What comes next: 1, 3, 6, 10, ?',
        category: 'patterns',
        level: 1,
        position: 4,
        correctAnswers: ['15', 'fifteen'],
        hint: 'Look at the amount added each time: $+2$, $+3$, $+4$... What comes next? $\\triangle$',
        explanation: 'The answer is 15. The pattern is adding consecutive numbers: $1+2=3$, $3+3=6$, $6+4=10$, so the next is $10+5=15$. These are also called **triangular numbers**.'
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
        correctAnswers: ['42', 'forty-two'],
        hint: 'Look at the difference between the terms: $+4$, $+6$, $+8$, $+10$... What comes next? ⬆️',
        explanation: 'The answer is 42. The difference between consecutive terms increases by 2 each time: $2(+4)6(+6)12(+8)20(+10)30$. The next difference is $+12$, so $30+12=42$.'
      },
      {
        _id: 'patterns-2-1',
        title: 'Alternating Pattern',
        prompt: 'Continue: 1, 4, 2, 8, 3, 12, 4, ?',
        category: 'patterns',
        level: 2,
        position: 1,
        correctAnswers: ['16', 'sixteen'],
        hint: 'There are two interleaved sequences. The odd-positioned numbers ($1, 2, 3, 4...$) and the even-positioned numbers ($4, 8, 12...$). 📊',
        explanation: 'The answer is 16. This is a sequence of two interleaved patterns: $1, 2, 3, 4$ (adding 1) and $4, 8, 12$ (adding 4, or multiplying by $1\\times4, 2\\times4, 3\\times4, 4\\times4$). The next number is from the second sequence: $4 \\times 4 = 16$.'
      },
      {
        _id: 'patterns-2-2',
        title: 'Prime Sequence',
        prompt: 'What comes next: 2, 3, 5, 7, 11, ?',
        category: 'patterns',
        level: 2,
        position: 2,
        correctAnswers: ['13', 'thirteen'],
        hint: 'These numbers are only divisible by 1 and themselves. What is the next number in this special set? 🌟',
        explanation: 'The answer is 13. This sequence is the list of **Prime Numbers**: numbers greater than 1 that have no positive divisors other than 1 and themselves. The prime numbers are 2, 3, 5, 7, 11, 13...'
      },
      {
        _id: 'patterns-2-3',
        title: 'Geometric Growth',
        prompt: 'Continue the pattern: 3, 9, 27, 81, ?',
        category: 'patterns',
        level: 2,
        position: 3,
        correctAnswers: ['243', 'two hundred forty-three'],
        hint: 'Each number is the previous one multiplied by 3. $81 \\times 3 = ?$ $\\times 3$',
        explanation: 'The answer is 243. This is a **geometric sequence** where each term is the previous term multiplied by 3. $81 \\times 3 = 243$. It can also be seen as powers of 3: $3^1, 3^2, 3^3, 3^4, 3^5$.'
      },
      {
        _id: 'patterns-2-4',
        title: 'Mixed Operations',
        prompt: 'Find next: 1, 3, 4, 7, 11, 18, ?',
        category: 'patterns',
        level: 2,
        position: 4,
        correctAnswers: ['29', 'twenty-nine'],
        hint: 'Add the two previous numbers to get the next one. $11 + 18 = ?$ ➕',
        explanation: 'The answer is 29. This is a variation of the Fibonacci sequence where each number is the sum of the two preceding numbers: $1+3=4$, $3+4=7$, $4+7=11$, $7+11=18$, so the next is $11+18=29$.'
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
        correctAnswers: ['720', 'seven hundred twenty'],
        hint: 'Look at the multiplying factor: $\\times1, \\times2, \\times3, \\times4, \\times5$... What\'s next? $!$',
        explanation: 'The answer is 720. This is the **Factorial** sequence ($n!$): $1! = 1$, $2! = 2$, $3! = 6$, $4! = 24$, $5! = 120$, and the next is $6! = 6 \\times 5 \\times 4 \\times 3 \\times 2 \\times 1 = 720$. (Note: some definitions start at $0! = 1$).'
      },
      {
        _id: 'patterns-3-1',
        title: 'Polynomial Pattern',
        prompt: 'Continue: 0, 1, 8, 27, 64, ?',
        category: 'patterns',
        level: 3,
        position: 1,
        correctAnswers: ['125', 'one hundred twenty-five'],
        hint: 'These numbers are perfect cubes: $0^3, 1^3, 2^3, 3^3, 4^3$... What\'s $5^3$? $^3$',
        explanation: 'The answer is 125. This sequence shows the perfect cubes of the integers, starting from 0: $0^3=0$, $1^3=1$, $2^3=8$, $3^3=27$, $4^3=64$, so the next is $5^3 = 5 \\times 5 \\times 5 = 125$.'
      },
      {
        _id: 'patterns-3-2',
        title: 'Matrix Pattern',
        prompt: 'In a 4x4 grid pattern, if diagonal elements are 1, 2, 3, 4, what is the sum?',
        category: 'patterns',
        level: 3,
        position: 2,
        correctAnswers: ['10', 'ten'],
        hint: 'You just need to add the given numbers together. What is $1 + 2 + 3 + 4$? $\\sum$',
        explanation: 'The answer is 10. The sum of the main diagonal elements (or trace) is simply the addition of the given numbers: $1 + 2 + 3 + 4 = 10$.'
      },
      {
        _id: 'patterns-3-3',
        title: 'Recursive Sequence',
        prompt: 'If a(n) = a(n-1) + a(n-2) and a(1)=2, a(2)=3, what is a(5)?',
        category: 'patterns',
        level: 3,
        position: 3,
        correctAnswers: ['13', 'thirteen'],
        hint: 'Calculate term-by-term: $a(3)=a(2)+a(1) = 3+2=5$. Then $a(4)=a(3)+a(2)...$ 🧮',
        explanation: 'The answer is 13. This is a recursive sequence: $a(n)$ is the sum of the two preceding terms. $a(1)=2$, $a(2)=3$. $a(3)=3+2=5$. $a(4)=5+3=8$. $a(5)=8+5=13$.'
      },
      {
        _id: 'patterns-3-4',
        title: 'Complex Pattern',
        prompt: 'Find the pattern: 2, 12, 36, 80, 150, ?',
        category: 'patterns',
        level: 3,
        position: 4,
        correctAnswers: ['252', 'two hundred fifty-two'],
        hint: 'Look for the relationship: $1^2\\times2$, $2^2\\times3$, $3^2\\times4$, $4^2\\times5$, $5^2\\times6$... What\'s $6^2\\times7$? $\\times$',
        explanation: 'The answer is 252. The pattern is $n^2 \\times (n+1)$, where $n$ is the index starting from 1. The next term is $6^2 \\times (6+1) = 36 \\times 7 = 252$.'
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

      const token = jwt.sign({ userId: String(user._id) }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        message: 'Welcome to BrainKick!',
        token,
        user: { id: String(user._id), username: user.username, email: user.email }
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
        // store in-memory ids as strings for consistency with JWT and Mongo ids
        _id: String(userIdCounter++),
        username,
        email,
        password: hashedPassword,
        createdAt: new Date()
      };
      memoryUsers.push(user);

      // Initialize an in-memory streak record for this user so data is per-account
      memoryStreaks.push({
        userId: String(user._id),
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        totalPuzzlesSolved: 0,
        solvedPuzzles: [],
        solvedHistory: [],
        solvedHistory: []
      });

  const token = jwt.sign({ userId: String(user._id) }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        message: 'Welcome to BrainKick!',
        token,
        user: { id: String(user._id), username: user.username, email: user.email }
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

      // Convert ObjectId to string for JWT
      const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        message: 'Welcome back! 🎯',
        token,
        user: { id: String(user._id), username: user.username, email: user.email }
      });
    } else {
      const user = memoryUsers.find(u => u.email === email);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: String(user._id) }, JWT_SECRET, { expiresIn: '7d' });

      // Ensure this in-memory user has a streak record initialized
      let streak = memoryStreaks.find(s => String(s.userId) === String(user._id));
      if (!streak) {
        memoryStreaks.push({
          userId: String(user._id),
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          totalPuzzlesSolved: 0,
          solvedPuzzles: [],
          solvedHistory: []
        });
      }

      res.json({
        message: 'Welcome back! 🎯',
        token,
        user: { id: String(user._id), username: user.username, email: user.email }
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
    
    // Enhanced local validation (more flexible matching)
    const userAnswer = answer.toLowerCase().trim();
    const exactMatch = puzzle.correctAnswers.some(correctAnswer => 
      correctAnswer.toLowerCase().trim() === userAnswer
    );
    
    // Additional flexible matching without AI
    let correct = exactMatch;
    if (!correct) {
      // Remove common variations and try again
      const normalizedUser = userAnswer
        .replace(/[.,!?;]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/^(a|an|the)\s+/i, ''); // Remove articles
        
      correct = puzzle.correctAnswers.some(correctAnswer => {
        const normalizedCorrect = correctAnswer.toLowerCase().trim()
          .replace(/[.,!?;]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/^(a|an|the)\s+/i, '');
        
        return normalizedCorrect === normalizedUser ||
               // Check if it's a number word vs digit
               (normalizedUser.match(/^\d+$/) && correctAnswer.toLowerCase().includes(normalizedUser)) ||
               // Check partial matches for longer answers
               (normalizedUser.length > 3 && normalizedCorrect.includes(normalizedUser));
      });
    }
    
    // Try AI validation if available and local validation failed
    let aiResponse = null;
    if (!correct && openai) {
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
      }
    }
    
    console.log(`✅ Answer "${answer}" for puzzle "${puzzle.title}" is ${correct ? 'correct' : 'wrong'}`);
    
    // Update progress if correct answer
    if (correct) {
      try {
        // Update both streak and level progress
        await Promise.all([
          updateStreak(userId, puzzleId),
          updateLevelProgress(userId, puzzle.category, puzzle.level, puzzleId)
        ]);
        
        // Get the updated progress info
        let updatedProgress;
        if (mongoose.connection.readyState === 1) {
          updatedProgress = await LevelProgress.findOne({
            userId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
            category: puzzle.category,
            level: puzzle.level
          });
        } else {
          updatedProgress = memoryLevelProgress.find(p => 
            String(p.userId) === String(userId) && 
            p.category === puzzle.category && 
            p.level === puzzle.level
          );
        }
        
        console.log(`✅ Progress updated for puzzle ${puzzleId}:`, {
          puzzlesSolved: updatedProgress?.puzzlesSolved || 0,
          totalPuzzles: updatedProgress?.totalPuzzles || 5
        });
      } catch (error) {
        console.error('Error updating progress:', error);
      }
    }
    
    const responseMessage = correct 
      ? 'Excellent work! 🎉' 
      : aiResponse 
        ? `Not quite right. ${aiResponse.split('INCORRECT')[1]?.trim() || 'Try again!'} 🤔`
        : 'Not quite right. Give it another try!';
    
    // Include explanation only; do not return the correct answer here (skip route handles that)
    res.json({
      correct,
      message: responseMessage,
      explanation: puzzle.explanation || `The answer is ${puzzle.correctAnswers[0]}. Keep practicing!`
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
    
    let hint = puzzle.hint || 'Think step by step and look for patterns! 💡';
    
    // Try AI-generated hint if available (as backup)
    if (openai && Math.random() < 0.3) { // Only use AI 30% of the time for variety
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are a helpful tutor. Give hints that guide users toward the answer without giving it away.`
            },
            {
              role: "user",
              content: `Give a different hint for: ${puzzle.prompt}`
            }
          ],
          max_tokens: 80,
          temperature: 0.7
        });
        
        hint = completion.choices[0].message.content.trim();
        
      } catch (aiError) {
        // Use the hardcoded hint
        hint = puzzle.hint;
      }
    }
    
    console.log('✅ Hint provided for puzzle:', puzzle.title);
    res.json({ hint });
  } catch (error) {
    console.error('Hint error:', error);
    res.status(500).json({ error: 'Unable to get hint right now' });
  }
});

//Skip (protected)
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
    
    let explanation = puzzle.explanation || `The answer is ${puzzle.correctAnswers[0]}. Keep practicing!`;
    
    // Try AI explanation as backup (only sometimes for variety)
    if (openai && Math.random() < 0.2) { // Only use AI 20% of the time
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `Explain puzzle solutions clearly and educationally.`
            },
            {
              role: "user",
              content: `Explain this solution: ${puzzle.prompt} Answer: ${puzzle.correctAnswers[0]}`
            }
          ],
          max_tokens: 120,
          temperature: 0.3
        });
        
        explanation = completion.choices[0].message.content.trim();
        
      } catch (aiError) {
        explanation = puzzle.explanation;
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
// Update time spent (protected)
app.post('/api/stats/time', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { totalTimeSpent } = req.body;

    if (typeof totalTimeSpent !== 'number') {
      return res.status(400).json({ error: 'Invalid time value' });
    }

    if (mongoose.connection.readyState === 1) {
      const mongoUserId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      await Streak.findOneAndUpdate(
        { userId: mongoUserId },
        { $set: { totalTimeSpent } },
        { upsert: true }
      );
    } else {
      const streak = memoryStreaks.find(s => String(s.userId) === String(userId));
      if (streak) {
        streak.totalTimeSpent = totalTimeSpent;
      } else {
        memoryStreaks.push({
          userId: String(userId),
          totalTimeSpent,
          currentStreak: 0,
          longestStreak: 0,
          totalPuzzlesSolved: 0,
          solvedPuzzles: [],
          solvedHistory: []
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Time update error:', error);
    res.status(500).json({ error: 'Failed to update time' });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    if (mongoose.connection.readyState === 1) {
      // Convert string ID to ObjectId if needed
      const mongoUserId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const streak = await Streak.findOne({ userId: mongoUserId }) || { 
        currentStreak: 0, 
        longestStreak: 0,
        totalPuzzlesSolved: 0,
        solvedPuzzles: [],
        solvedHistory: []
      };
      // Build weekly counts for last 7 days by weekday (Mon..Sun)
      const weeklyCounts = [0,0,0,0,0,0,0]; // Mon=0 ... Sun=6
      (streak.solvedHistory || []).forEach(entry => {
        const d = new Date(entry.solvedAt);
        // JS getDay: 0=Sun,1=Mon..6=Sat => convert to Mon=0..Sun=6
        const jsDay = d.getDay();
        const idx = jsDay === 0 ? 6 : jsDay - 1;
        weeklyCounts[idx]++;
      });

      res.json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalPuzzlesSolved: streak.totalPuzzlesSolved,
        lastActivityDate: streak.lastActivityDate,
        uniquePuzzlesSolved: streak.solvedPuzzles?.length || 0,
        weeklyCounts
      });
    } else {
      const streak = memoryStreaks.find(s => String(s.userId) === String(userId)) || { 
        currentStreak: 0, 
        longestStreak: 0,
        totalPuzzlesSolved: 0,
        lastActivityDate: null,
        solvedPuzzles: [],
        solvedHistory: []
      };

      const weeklyCounts = [0,0,0,0,0,0,0];
      (streak.solvedHistory || []).forEach(entry => {
        const d = new Date(entry.solvedAt);
        const jsDay = d.getDay();
        const idx = jsDay === 0 ? 6 : jsDay - 1;
        weeklyCounts[idx]++;
      });

      res.json({
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        totalPuzzlesSolved: streak.totalPuzzlesSolved,
        lastActivityDate: streak.lastActivityDate,
        uniquePuzzlesSolved: streak.solvedPuzzles?.length || 0,
        totalTimeSpent: streak.totalTimeSpent || 0,
        weeklyCounts
      });
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const categories = ['math', 'logic', 'riddles', 'patterns'];
    const levels = [1, 2, 3];
    
    if (mongoose.connection.readyState === 1) {
      // MongoDB is available
      // Convert string ID to ObjectId if needed
      const mongoUserId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      
      // Get all progress records for this user
      const progress = await LevelProgress.find({ userId: mongoUserId });
      
      const missingProgress = [];
      categories.forEach(category => {
        levels.forEach(level => {
          if (!progress.some(p => p.category === category && p.level === level)) {
            missingProgress.push({
              userId: mongoUserId,
              category,
              level,
              puzzlesSolved: 0,
              totalPuzzles: 5,
              completed: false,
              solvedPuzzleIds: []
            });
          }
        });
      });
      
      // Create any missing progress records
      if (missingProgress.length > 0) {
        await LevelProgress.insertMany(missingProgress);
        const allProgress = await LevelProgress.find({ userId: mongoUserId });
        console.log(`Created ${missingProgress.length} missing progress records for user ${userId}`);
        res.json({ progress: allProgress });
      } else {
        console.log(`Found ${progress.length} progress records for user ${userId}`);
        res.json({ progress });
      }
    } else {
      // Memory storage fallback
      // Filter existing progress records for this user
      let progress = memoryLevelProgress.filter(p => String(p.userId) === String(userId));

      // Add missing progress records
      categories.forEach(category => {
        levels.forEach(level => {
          if (!progress.some(p => p.category === category && p.level === level)) {
            progress.push({
              userId: String(userId),
              category,
              level,
              puzzlesSolved: 0,
              totalPuzzles: 5,
              completed: false,
              solvedPuzzleIds: [],
              completedAt: null,
              createdAt: new Date()
            });
          }
        });
      });

      // Store any newly created progress records in memory
      progress.forEach(p => {
        if (!memoryLevelProgress.some(mp => 
          mp.userId === p.userId && 
          mp.category === p.category && 
          mp.level === p.level
        )) {
          memoryLevelProgress.push(p);
        }
      });

      res.json({ progress });
    }
  } catch (error) {
    console.error('Progress fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
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
