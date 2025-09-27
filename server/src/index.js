const express = require('express');
const cors = require('cors');

console.log('🚀 Starting BrainKick server...');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Sample puzzles database
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
        title: 'Pattern Logic',
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
        title: 'Simple Addition',
        prompt: 'What is 15 + 27?',
        category: 'math',
        level: 1,
        position: 0,
        correctAnswers: ['42', 'forty-two', 'forty two']
      },
      {
        _id: 'math-1-1',
        title: 'Quick Multiplication',
        prompt: 'What is 7 × 8?',
        category: 'math',
        level: 1,
        position: 1,
        correctAnswers: ['56', 'fifty-six', 'fifty six']
      },
      {
        _id: 'math-1-2',
        title: 'Division Challenge',
        prompt: 'What is 144 ÷ 12?',
        category: 'math',
        level: 1,
        position: 2,
        correctAnswers: ['12', 'twelve']
      }
    ]
  }
};

app.get('/api/health', (req, res) => {
  console.log('✅ Health check requested');
  res.json({ status: 'ok', app: 'BrainKick' });
});

app.get('/api/puzzles', (req, res) => {
  const { category = 'logic', level = 1 } = req.query;
  console.log(`✅ Puzzles requested for ${category} level ${level}`);
  
  const categoryPuzzles = puzzles[category];
  if (!categoryPuzzles || !categoryPuzzles[level]) {
    return res.json({ puzzles: [] });
  }
  
  res.json({ puzzles: categoryPuzzles[level] });
});

app.post('/api/puzzles/:id/validate', (req, res) => {
  const { answer } = req.body;
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
  
  const correct = puzzle.correctAnswers.some(correctAnswer => 
    correctAnswer.toLowerCase().trim() === answer.toLowerCase().trim()
  );
  
  console.log(`✅ Answer "${answer}" for puzzle "${puzzle.title}" is ${correct ? 'correct' : 'wrong'}`);
  
  res.json({
    correct,
    message: correct ? 'Excellent work! 🎉' : 'Not quite right. Give it another try! 🤔'
  });
});

app.post('/api/puzzles/:id/hint', (req, res) => {
  console.log('✅ Hint requested');
  res.json({ hint: 'Think step by step and look for patterns! 💡' });
});

app.listen(PORT, () => {
  console.log(`✅ BrainKick server running on port ${PORT}`);
  console.log(`📍 Test it: curl http://localhost:${PORT}/api/health`);
});
