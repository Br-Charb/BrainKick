import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
});

function App() {
  const [view, setView] = useState('home');
  const [puzzles, setPuzzles] = useState([]);
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPuzzles = async () => {
    try {
      const response = await api.get('/puzzles?category=logic&level=1');
      setPuzzles(response.data.puzzles);
    } catch (error) {
      console.error('Failed to fetch puzzles:', error);
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    
    setLoading(true);
    try {
      const response = await api.post(`/puzzles/${puzzles[currentPuzzle]._id}/validate`, {
        answer: answer.trim()
      });
      setResult(response.data);
    } catch (error) {
      setResult({ correct: false, message: 'Error validating answer' });
    } finally {
      setLoading(false);
    }
  };

  const getHint = async () => {
    try {
      const response = await api.post(`/puzzles/${puzzles[currentPuzzle]._id}/hint`);
      alert('💡 ' + response.data.hint);
    } catch (error) {
      alert('Unable to get hint right now');
    }
  };

  useEffect(() => {
    if (view === 'puzzle') {
      fetchPuzzles();
    }
  }, [view]);

  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      color: 'white'
    },
    card: {
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)',
      borderRadius: '12px',
      padding: '2rem',
      maxWidth: '600px',
      width: '100%',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    button: {
      padding: '0.75rem 1.5rem',
      border: 'none',
      borderRadius: '8px',
      background: 'linear-gradient(45deg, #4f46e5, #7c3aed)',
      color: 'white',
      fontSize: '1rem',
      cursor: 'pointer',
      margin: '0.5rem',
      transition: 'transform 0.2s'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      background: 'rgba(255, 255, 255, 0.1)',
      color: 'white',
      borderRadius: '8px',
      fontSize: '1rem',
      marginBottom: '1rem'
    }
  };

  if (view === 'home') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
            🧠 BrainKick
          </h1>
          <p style={{ textAlign: 'center', marginBottom: '2rem', opacity: 0.8 }}>
            Challenge your mind with AI-powered brain teasers!
          </p>
          <div style={{ textAlign: 'center' }}>
            <button 
              style={styles.button}
              onClick={() => setView('puzzle')}
            >
              Start Playing 🎯
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'puzzle' && puzzles.length > 0) {
    const puzzle = puzzles[currentPuzzle];
    
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2>Logic - Level 1</h2>
            <button 
              style={{...styles.button, background: 'rgba(255,255,255,0.2)'}}
              onClick={() => setView('home')}
            >
              Back
            </button>
          </div>
          
          <h3>{puzzle.title}</h3>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
            {puzzle.prompt}
          </p>
          
          <input
            style={styles.input}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Enter your answer..."
            onKeyPress={(e) => e.key === 'Enter' && submitAnswer()}
          />
          
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button 
              style={styles.button}
              onClick={submitAnswer}
              disabled={loading || !answer.trim()}
            >
              {loading ? '🤔 Checking...' : 'Submit Answer'}
            </button>
            <button 
              style={{...styles.button, background: 'rgba(255,193,7,0.8)'}}
              onClick={getHint}
            >
              💡 Hint
            </button>
          </div>
          
          {result && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '8px',
              background: result.correct ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
              border: `1px solid ${result.correct ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`
            }}>
              <p style={{ margin: 0, fontWeight: '500' }}>
                {result.message}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p>Loading puzzles... 🧠</p>
      </div>
    </div>
  );
}

export default App;
