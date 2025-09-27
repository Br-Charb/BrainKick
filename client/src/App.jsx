import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
});

function App() {
  const [view, setView] = useState('home');
  const [selectedCategory, setSelectedCategory] = useState('logic');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [puzzles, setPuzzles] = useState([]);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const categories = [
    { id: 'logic', name: 'Logic', emoji: '🧩' },
    { id: 'math', name: 'Math', emoji: '🔢' }
  ];

  const fetchPuzzles = async (category, level) => {
    try {
      setLoading(true);
      const response = await api.get(`/puzzles?category=${category}&level=${level}`);
      setPuzzles(response.data.puzzles);
      setCurrentPuzzleIndex(0);
      setAnswer('');
      setResult(null);
    } catch (error) {
      console.error('Failed to fetch puzzles:', error);
      setPuzzles([]);
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    
    setLoading(true);
    try {
      const currentPuzzle = puzzles[currentPuzzleIndex];
      const response = await api.post(`/puzzles/${currentPuzzle._id}/validate`, {
        answer: answer.trim()
      });
      setResult(response.data);
      
      // If correct, advance after 2 seconds
      if (response.data.correct) {
        setTimeout(() => {
          nextPuzzle();
        }, 2000);
      }
    } catch (error) {
      setResult({ correct: false, message: 'Error validating answer' });
    } finally {
      setLoading(false);
    }
  };

  const nextPuzzle = () => {
    if (currentPuzzleIndex < puzzles.length - 1) {
      // Go to next puzzle
      setCurrentPuzzleIndex(currentPuzzleIndex + 1);
      setAnswer('');
      setResult(null);
    } else {
      // Completed all puzzles in this level
      alert('🎉 Level completed! Great job!');
      setView('categories');
    }
  };

  const getHint = async () => {
    try {
      const currentPuzzle = puzzles[currentPuzzleIndex];
      const response = await api.post(`/puzzles/${currentPuzzle._id}/hint`);
      alert('💡 ' + response.data.hint);
    } catch (error) {
      alert('Unable to get hint right now');
    }
  };

  const startCategory = (category) => {
    setSelectedCategory(category);
    setSelectedLevel(1);
    fetchPuzzles(category, 1);
    setView('puzzle');
  };

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
    secondaryButton: {
      padding: '0.75rem 1.5rem',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '8px',
      background: 'rgba(255,255,255,0.1)',
      color: 'white',
      fontSize: '1rem',
      cursor: 'pointer',
      margin: '0.5rem'
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

  // Home screen
  if (view === 'home') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
            🧠 BrainKick
          </h1>
          <p style={{ textAlign: 'center', marginBottom: '2rem', opacity: 0.8 }}>
            Challenge your mind with brain teasers across different categories!
          </p>
          <div style={{ textAlign: 'center' }}>
            <button 
              style={styles.button}
              onClick={() => setView('categories')}
            >
              Start Playing 🎯
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Category selection
  if (view === 'categories') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
            Choose Your Challenge 🎯
          </h2>
          
          <div style={{ display: 'grid', gap: '1rem' }}>
            {categories.map((category) => (
              <div 
                key={category.id}
                style={{
                  ...styles.secondaryButton,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.5rem',
                  cursor: 'pointer'
                }}
                onClick={() => startCategory(category.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>{category.emoji}</span>
                  <div>
                    <h3 style={{ margin: 0 }}>{category.name}</h3>
                    <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>
                      3 puzzles per level
                    </p>
                  </div>
                </div>
                <span style={{ opacity: 0.7 }}>→</span>
              </div>
            ))}
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button 
              style={styles.secondaryButton}
              onClick={() => setView('home')}
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Puzzle screen
  if (view === 'puzzle') {
    if (loading && puzzles.length === 0) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={{ textAlign: 'center' }}>Loading puzzles... 🧠</p>
          </div>
        </div>
      );
    }

    if (puzzles.length === 0) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={{ textAlign: 'center' }}>No puzzles found 😞</p>
            <div style={{ textAlign: 'center' }}>
              <button 
                style={styles.secondaryButton}
                onClick={() => setView('categories')}
              >
                ← Back to Categories
              </button>
            </div>
          </div>
        </div>
      );
    }

    const currentPuzzle = puzzles[currentPuzzleIndex];
    const categoryData = categories.find(c => c.id === selectedCategory);
    
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {categoryData?.emoji} {categoryData?.name} - Level {selectedLevel}
              </h2>
              <p style={{ margin: '0.5rem 0 0 0', opacity: 0.7, fontSize: '0.9rem' }}>
                Puzzle {currentPuzzleIndex + 1} of {puzzles.length}
              </p>
            </div>
            <button 
              style={styles.secondaryButton}
              onClick={() => setView('categories')}
            >
              Exit
            </button>
          </div>
          
          <div style={{ 
            background: 'rgba(255,255,255,0.05)', 
            padding: '1.5rem', 
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <h3 style={{ marginTop: 0 }}>{currentPuzzle.title}</h3>
            <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: 0 }}>
              {currentPuzzle.prompt}
            </p>
          </div>
          
          {!result?.correct && (
            <>
              <input
                style={styles.input}
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter your answer..."
                onKeyPress={(e) => e.key === 'Enter' && !loading && answer.trim() && submitAnswer()}
                disabled={loading}
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
                  style={{...styles.secondaryButton, background: 'rgba(255,193,7,0.2)'}}
                  onClick={getHint}
                  disabled={loading}
                >
                  💡 Hint
                </button>
              </div>
            </>
          )}
          
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
              {result.correct && currentPuzzleIndex < puzzles.length - 1 && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.8 }}>
                  Moving to next puzzle...
                </p>
              )}
              {result.correct && currentPuzzleIndex === puzzles.length - 1 && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.8 }}>
                  🎉 Level completed!
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default App;
