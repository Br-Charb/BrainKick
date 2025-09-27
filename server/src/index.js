const express = require('express');
const cors = require('cors');

console.log('🚀 Starting BrainKick server...');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  console.log('✅ Health check requested');
  res.json({ status: 'ok', app: 'BrainKick' });
});

app.get('/api/puzzles', (req, res) => {
  console.log('✅ Puzzles requested');
  res.json({ 
    puzzles: [{
      _id: '1',
      title: 'Test Puzzle',
      prompt: 'What is 2 + 2?',
      category: 'math',
      level: 1
    }]
  });
});

app.post('/api/puzzles/:id/validate', (req, res) => {
  const { answer } = req.body;
  const correct = answer?.trim() === '4';
  console.log(`✅ Answer "${answer}" is ${correct ? 'correct' : 'wrong'}`);
  res.json({
    correct,
    message: correct ? 'Correct! 🎉' : 'Try again! 🤔'
  });
});

app.post('/api/puzzles/:id/hint', (req, res) => {
  console.log('✅ Hint requested');
  res.json({ hint: 'Think about basic addition! 💡' });
});

app.listen(PORT, () => {
  console.log(`✅ BrainKick server running on port ${PORT}`);
  console.log(`📍 Test it: curl http://localhost:${PORT}/api/health`);
});
