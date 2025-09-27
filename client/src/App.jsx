import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('brainkick_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [selectedCategory, setSelectedCategory] = useState('logic');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [puzzles, setPuzzles] = useState([]);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ currentStreak: 0, totalPuzzlesSolved: 0, longestStreak: 0 });
  const [skipped, setSkipped] = useState(false);
  const [skipResult, setSkipResult] = useState(null);
  const [showNext, setShowNext] = useState(false);
  const [levelProgress, setLevelProgress] = useState([]);
  const [showExplanation, setShowExplanation] = useState(false);


  // Auth form state
  const [isLogin, setIsLogin] = useState(true);
  const [authForm, setAuthForm] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('brainkick_token');
    const userData = localStorage.getItem('brainkick_user');
    if (token && userData) {
      setUser(JSON.parse(userData));
      setView('home');
      fetchStats();
      fetchLevelProgress(); // ADD THIS LINE
    }
  }, []);

  const categories = [
  { id: 'math', name: 'Math', emoji: '🔢', description: 'Arithmetic, algebra, and problem solving' },
  { id: 'logic', name: 'Logic', emoji: '🧩', description: 'Reasoning, deduction, and critical thinking' },
  { id: 'riddles', name: 'Riddles', emoji: '🤔', description: 'Word puzzles, brain teasers, and mysteries' },
  { id: 'patterns', name: 'Patterns', emoji: '🔍', description: 'Sequences, shapes, and recognition' }
];

  const fetchStats = async () => {
    try {
      const response = await api.get('/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin 
        ? { email: authForm.email, password: authForm.password }
        : authForm;

      const response = await api.post(endpoint, payload);
      const { token, user: userData } = response.data;

      localStorage.setItem('brainkick_token', token);
      localStorage.setItem('brainkick_user', JSON.stringify(userData));
      setUser(userData);
      setView('home');
      fetchStats();
    } catch (error) {
      setAuthError(error.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('brainkick_token');
    localStorage.removeItem('brainkick_user');
    setUser(null);
    setView('login');
    setStats({ currentStreak: 0, totalPuzzlesSolved: 0, longestStreak: 0 });
  };

  const fetchPuzzles = async (category, level) => {
    try {
      setLoading(true);
      const response = await api.get(`/puzzles?category=${category}&level=${level}`);
      setPuzzles(response.data.puzzles);
      setCurrentPuzzleIndex(0);
      setAnswer('');
      setResult(null);
      setSkipped(false);
      setSkipResult(null);
      setShowNext(false);
      setShowExplanation(false); // ADD THIS LINE
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
      setShowExplanation(true); // Always show explanation
      
      if (response.data.correct) {
        fetchStats(); // Refresh stats immediately
        fetchLevelProgress(); // Refresh level progress
        setShowNext(true); // Show next button
      } else {
        setShowNext(false); // Hide next button for wrong answers
      }
    } catch (error) {
      setResult({ correct: false, message: 'Error validating answer' });
      setShowNext(false);
      setShowExplanation(false);
    } finally {
      setLoading(false);
    }
  };

  const nextPuzzle = () => {
    if (currentPuzzleIndex < puzzles.length - 1) {
      setCurrentPuzzleIndex(currentPuzzleIndex + 1);
      setAnswer('');
      setResult(null);
      setSkipped(false);
      setSkipResult(null);
      setShowNext(false);
      setShowExplanation(false); // ADD THIS LINE
    } else {
      alert('🎉 Level completed! Great job!');
      fetchLevelProgress(); // Refresh progress before going back
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

  const skipPuzzle = async () => {
    try {
      const currentPuzzle = puzzles[currentPuzzleIndex];
      const response = await api.post(`/puzzles/${currentPuzzle._id}/skip`);
      setSkipResult(response.data);
      setSkipped(true);
      setShowNext(true); // Show next button instead of auto-advancing
      // Remove the automatic setTimeout - let user control when to proceed
    } catch (error) {
      console.error('Skip error:', error);
      alert('Unable to skip puzzle right now');
    }
  };

  const fetchLevelProgress = async () => {
    try {
      const response = await api.get('/progress');
      setLevelProgress(response.data.progress);
    } catch (error) {
      console.error('Failed to fetch level progress:', error);
    }
  };

  const isLevelUnlocked = (category, level) => {
    if (level === 1) return true; // Level 1 is always unlocked
    
    // Check if previous level is completed
    const previousLevel = levelProgress.find(p => 
      p.category === category && p.level === level - 1
    );
    
    return previousLevel && previousLevel.completed;
  };

  const getLevelInfo = (category, level) => {
    const progress = levelProgress.find(p => 
      p.category === category && p.level === level
    );
    
    if (!progress) {
      return { completed: false, puzzlesSolved: 0, totalPuzzles: 5 };
    }
    
    return {
      completed: progress.completed,
      puzzlesSolved: progress.puzzlesSolved,
      totalPuzzles: progress.totalPuzzles
    };
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
      marginBottom: '1rem',
      boxSizing: 'border-box'
    },
    streakBadge: {
      background: 'rgba(255, 193, 7, 0.2)',
      border: '1px solid rgba(255, 193, 7, 0.5)',
      borderRadius: '20px',
      padding: '0.5rem 1rem',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.9rem'
    }
  };

  // Main render logic
  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
            🧠 BrainKick
          </h1>
          <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
            {isLogin ? 'Welcome Back!' : 'Join BrainKick!'}
          </h2>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column' }}>
            {!isLogin && (
              <input
                style={styles.input}
                type="text"
                placeholder="Username"
                value={authForm.username}
                onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                required={!isLogin}
              />
            )}
            
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
              required
            />
            
            <input
              style={styles.input}
              type="password"
              placeholder="Password (min 6 characters)"
              value={authForm.password}
              onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
              required
              minLength="6"
            />

            {authError && (
              <div style={{ color: '#ff6b6b', textAlign: 'center', marginBottom: '1rem' }}>
                {authError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              style={styles.button}
            >
              {loading ? '⏳ Processing...' : (isLogin ? 'Login' : 'Sign Up')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setAuthError('');
                setAuthForm({ username: '', email: '', password: '' });
              }}
              style={{ background: 'none', border: 'none', color: 'white', textDecoration: 'underline', cursor: 'pointer' }}
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Welcome, {user.username}! 🎯</h2>
              <div style={styles.streakBadge}>
                🔥 {stats.currentStreak} day streak
              </div>
            </div>
            <button 
              style={styles.secondaryButton}
              onClick={logout}
            >
              Logout
            </button>
          </div>

          <h1 style={{ textAlign: 'center', marginBottom: '1rem' }}>
            🧠 BrainKick
          </h1>
          
          <div style={{ 
            background: 'rgba(255,255,255,0.05)', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '2rem',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.totalPuzzlesSolved}</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Puzzles Solved</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.currentStreak}</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Current Streak</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.longestStreak}</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Best Streak</div>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button 
              style={styles.button}
              onClick={() => setView('categories')}
            >
              Start Playing 🎯
            </button>
            <button 
              style={styles.secondaryButton}
              onClick={() => setView('stats')}
            >
              View Stats 📊
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'stats') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2>Your Stats 📊</h2>
            <button 
              style={styles.secondaryButton}
              onClick={() => setView('home')}
            >
              ← Back
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ 
              background: 'rgba(255, 193, 7, 0.1)', 
              padding: '1.5rem', 
              borderRadius: '8px',
              border: '1px solid rgba(255, 193, 7, 0.3)'
            }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', textAlign: 'center' }}>
                🔥 {stats.currentStreak}
              </div>
              <div style={{ textAlign: 'center', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                Current Streak (days)
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.05)', 
                padding: '1.5rem', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.totalPuzzlesSolved}</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Total Solved</div>
              </div>
              
              <div style={{ 
                background: 'rgba(255,255,255,0.05)', 
                padding: '1.5rem', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.longestStreak}</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Best Streak</div>
              </div>
            </div>

            <div style={{ 
              background: 'rgba(76, 175, 80, 0.1)', 
              padding: '1rem', 
              borderRadius: '8px',
              textAlign: 'center',
              border: '1px solid rgba(76, 175, 80, 0.3)'
            }}>
              <div style={{ fontSize: '1.1rem' }}>
                {stats.currentStreak === 0 
                  ? "Start your brain training journey today! 🚀"
                  : stats.currentStreak < 7 
                    ? "Great start! Keep building that streak! 💪"
                    : stats.currentStreak < 30
                      ? "Amazing dedication! You're on fire! 🔥"
                      : "Incredible! You're a brain training champion! 🏆"
                }
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button 
              style={styles.button}
              onClick={() => setView('categories')}
            >
              Continue Training 🎯
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'categories') {
    return (
      <div style={styles.container}>
        <div style={{
          ...styles.card,
          maxWidth: '800px' // Slightly wider for better level button layout
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2>Choose Category & Level 🎯</h2>
            <button 
              style={styles.secondaryButton}
              onClick={() => setView('home')}
            >
              ← Home
            </button>
          </div>

          <div style={{ 
            display: 'grid', 
            gap: '2rem',
            justifyItems: 'center' // CENTER THE CATEGORIES
          }}>
            {categories.map(category => {
              const categoryProgress = levelProgress.filter(p => p.category === category.id);
              const completedLevels = categoryProgress.filter(p => p.completed).length;
              
              return (
                <div key={category.id} style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '16px',
                  padding: '2rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  width: '100%',
                  maxWidth: '600px', // Constrain width for better centering
                  textAlign: 'center' // CENTER CONTENT WITHIN EACH CATEGORY
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', // CENTER THE HEADER
                    gap: '1rem', 
                    marginBottom: '1.5rem' 
                  }}>
                    <span style={{ fontSize: '3rem' }}>{category.emoji}</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{category.name}</h3>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', opacity: 0.7 }}>
                        {category.description}
                      </p>
                      <div style={{ fontSize: '0.9rem', opacity: 0.6, marginTop: '0.5rem' }}>
                        {completedLevels}/3 levels completed
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    justifyContent: 'center', // CENTER THE LEVEL BUTTONS
                    flexWrap: 'wrap' 
                  }}>
                    {[1, 2, 3].map(level => {
                      const unlocked = isLevelUnlocked(category.id, level);
                      const levelInfo = getLevelInfo(category.id, level);
                      const difficultyText = level === 1 ? 'Easy' : level === 2 ? 'Medium' : 'Hard';
                      
                      return (
                        <button
                          key={level}
                          style={{
                            padding: '1rem 1.5rem',
                            borderRadius: '12px',
                            border: levelInfo.completed 
                              ? '2px solid rgba(76, 175, 80, 0.7)' 
                              : unlocked 
                                ? '1px solid rgba(255,255,255,0.3)'
                                : '1px solid rgba(255,255,255,0.1)',
                            background: levelInfo.completed
                              ? 'linear-gradient(45deg, #28a745, #20c997)'
                              : unlocked 
                                ? 'linear-gradient(45deg, #4f46e5, #7c3aed)'
                                : 'rgba(128, 128, 128, 0.2)',
                            color: unlocked ? 'white' : 'rgba(255,255,255,0.4)',
                            fontSize: '1rem',
                            cursor: unlocked ? 'pointer' : 'not-allowed',
                            opacity: unlocked ? 1 : 0.5,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.5rem',
                            minWidth: '120px'
                          }}
                          onClick={() => {
                            if (unlocked) {
                              setSelectedCategory(category.id);
                              setSelectedLevel(level);
                              fetchPuzzles(category.id, level);
                              setView('puzzle');
                            }
                          }}
                          disabled={!unlocked}
                        >
                          <div style={{ 
                            fontSize: '1.2rem', 
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            Level {level}
                            {levelInfo.completed && <span>✅</span>}
                            {!unlocked && <span>🔒</span>}
                          </div>
                          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                            {difficultyText}
                          </div>
                          {levelInfo.puzzlesSolved > 0 && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                              {levelInfo.puzzlesSolved}/{levelInfo.totalPuzzles} solved
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  
                  {!isLevelUnlocked(category.id, 2) && (
                    <div style={{ 
                      marginTop: '1rem', 
                      fontSize: '0.85rem', 
                      opacity: 0.6,
                      fontStyle: 'italic'
                    }}>
                      Complete Level 1 to unlock Level 2! 🔓
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ 
            textAlign: 'center', 
            marginTop: '2rem', 
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.95rem'
          }}>
            Each level contains 5 challenging puzzles! Complete them in order to unlock the next level. 🚀
          </div>
        </div>
      </div>
    );
  }


  if (view === 'puzzle' && puzzles.length > 0) {
    const currentPuzzle = puzzles[currentPuzzleIndex];
    
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'rgba(255,255,255,0.8)' }}>
                {categories.find(c => c.id === selectedCategory)?.emoji} {categories.find(c => c.id === selectedCategory)?.name} - Level {selectedLevel}
              </h3>
              <div style={{ fontSize: '0.9rem', opacity: 0.6 }}>
                Puzzle {currentPuzzleIndex + 1} of {puzzles.length}
              </div>
            </div>
            <button 
              style={styles.secondaryButton}
              onClick={() => setView('categories')}
            >
              ← Back
            </button>
          </div>

          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            borderRadius: '10px', 
            height: '8px',
            marginBottom: '2rem'
          }}>
            <div style={{
              background: 'linear-gradient(45deg, #4f46e5, #7c3aed)',
              borderRadius: '10px',
              height: '100%',
              width: `${((currentPuzzleIndex + 1) / puzzles.length) * 100}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{ 
            background: 'rgba(255,255,255,0.05)', 
            padding: '2rem', 
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>{currentPuzzle.title}</h2>
            <p style={{ fontSize: '1.1rem', lineHeight: '1.5' }}>{currentPuzzle.prompt}</p>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <input
              style={{
                ...styles.input,
                fontSize: '1.1rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}
              type="text"
              placeholder="Enter your answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !loading && submitAnswer()}
            />
            
            {result && (
              <div style={{
                padding: '1.5rem',
                borderRadius: '8px',
                background: result.correct ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                border: `1px solid ${result.correct ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)'}`,
                marginBottom: '1rem'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                  {result.correct ? '🎉 Correct!' : '❌ Not quite right'}
                </div>
                <div style={{ marginBottom: '1rem' }}>{result.message}</div>
                
                {/* ALWAYS SHOW EXPLANATION - whether correct or incorrect */}
                {showExplanation && result.explanation && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '1rem',
                    borderRadius: '6px',
                    borderLeft: '3px solid rgba(255, 193, 7, 0.7)',
                    fontSize: '0.95rem',
                    lineHeight: '1.4'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#ffc107' }}>
                      💡 Explanation:
                    </div>
                    {result.explanation}
                  </div>
                )}
              </div>
            )}

          {skipped && skipResult && (
            <div style={{
              padding: '1.5rem',
              borderRadius: '8px',
              background: 'rgba(255, 193, 7, 0.2)',
              border: '1px solid rgba(255, 193, 7, 0.5)',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                💡 Answer: {skipResult.answer}
              </div>
              <div style={{ fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                {skipResult.explanation}
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.8, fontStyle: 'italic' }}>
                Don't worry - learning from explanations helps you improve! 📚
              </div>
            </div>
          )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {!showNext && !skipped && (
              <>
                <button 
                  style={styles.button}
                  onClick={submitAnswer}
                  disabled={loading || !answer.trim()}
                >
                  {loading ? '⏳ Checking...' : 'Submit Answer ✓'}
                </button>
                
                <button 
                  style={styles.secondaryButton}
                  onClick={getHint}
                >
                  Get Hint 💡
                </button>

                <button 
                  style={{
                    ...styles.secondaryButton,
                    background: 'rgba(244, 67, 54, 0.2)',
                    border: '1px solid rgba(244, 67, 54, 0.5)'
                  }}
                  onClick={skipPuzzle}
                >
                  Skip & See Answer ⏭️
                </button>
              </>
            )}

            {result && !result.correct && !skipped && !showNext && (
              <button 
                style={styles.secondaryButton}
                onClick={() => {
                  setAnswer('');
                  setResult(null);
                }}
              >
                Try Again 🔄
              </button>
            )}

            {showNext && (
              <button 
                style={{
                  ...styles.button,
                  background: 'linear-gradient(45deg, #28a745, #20c997)',
                  fontSize: '1.1rem',
                  padding: '1rem 2rem'
                }}
                onClick={nextPuzzle}
              >
                {currentPuzzleIndex < puzzles.length - 1 ? 'Next Puzzle ➡️' : 'Complete Level 🏁'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading or error fallback
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center' }}>
          {loading ? (
            <>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
              <div>Loading...</div>
            </>
          ) : (
            <>
              <h2>Something went wrong 😕</h2>
              <button 
                style={styles.button}
                onClick={() => setView('home')}
              >
                Go Home
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;