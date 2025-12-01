import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState, HighScore } from './types';

const MAX_HIGH_SCORES = 5;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  // We keep track of the session high score for immediate feedback, 
  // but the persistent list is in highScores.
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [commentary, setCommentary] = useState<string>("Welcome to SkiFree React! Watch out for the Yeti.");
  
  // New High Score Entry State
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [hasCheckedHighScore, setHasCheckedHighScore] = useState(false);
  const [playerName, setPlayerName] = useState("");

  // Load high scores from local storage
  useEffect(() => {
    const saved = localStorage.getItem('skifree-highscores');
    if (saved) {
      setHighScores(JSON.parse(saved));
    } else {
      // Default dummy scores
      const defaults = [
        { name: "YETI", score: 2000 },
        { name: "SKI", score: 1000 },
        { name: "DEV", score: 500 }
      ];
      setHighScores(defaults);
      localStorage.setItem('skifree-highscores', JSON.stringify(defaults));
    }
  }, []);

  // Check for high score when game ends
  useEffect(() => {
    if ((gameState === GameState.CRASHED || gameState === GameState.EATEN) && !hasCheckedHighScore) {
      const lowestScore = highScores.length < MAX_HIGH_SCORES 
        ? 0 
        : highScores[highScores.length - 1].score;
      
      if (score > lowestScore) {
        setIsNewHighScore(true);
      }
      setHasCheckedHighScore(true);
    }
  }, [gameState, score, highScores, hasCheckedHighScore]);

  const saveHighScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    const newEntry: HighScore = { name: playerName.toUpperCase().slice(0, 10), score };
    const updatedScores = [...highScores, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HIGH_SCORES);

    setHighScores(updatedScores);
    localStorage.setItem('skifree-highscores', JSON.stringify(updatedScores));
    
    setIsNewHighScore(false);
    setPlayerName("");
  };

  const startGame = () => {
    setScore(0);
    setIsNewHighScore(false);
    setHasCheckedHighScore(false);
    setGameState(GameState.PLAYING);
  };

  const handleCommentary = (text: string) => {
    setCommentary(text);
  };

  const currentBest = highScores.length > 0 ? Math.max(score, highScores[0].score) : score;

  return (
    <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center p-4">
      {/* Header / Score Board */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 text-white font-mono">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">SKI FREE <span className="text-xs text-gray-400">REACT EDITION</span></h1>
          <p className="text-sm text-gray-400">Arrows to Move | Space to Shoot</p>
        </div>
        <div className="text-right">
          <p className="text-xl">DIST: <span className="text-yellow-400">{score}m</span></p>
          <p className="text-sm opacity-75">TOP: {currentBest}m</p>
        </div>
      </div>

      {/* Game Container */}
      <div className="relative group">
        <GameCanvas 
          gameState={gameState} 
          setGameState={setGameState} 
          setScore={setScore}
          onCommentary={handleCommentary}
        />

        {/* Overlay for Menu */}
        {gameState === GameState.MENU && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm p-8">
            <h2 className="text-5xl font-bold text-white mb-8 tracking-widest drop-shadow-md text-center">SKI FREE</h2>
            
            <div className="bg-slate-700/50 p-6 rounded-lg mb-8 w-64 border border-slate-600">
              <h3 className="text-blue-300 font-bold mb-4 text-center border-b border-slate-600 pb-2">LEADERBOARD</h3>
              <ul>
                {highScores.map((entry, idx) => (
                  <li key={idx} className="flex justify-between text-white font-mono mb-1">
                    <span>{idx + 1}. {entry.name}</span>
                    <span className="text-yellow-400">{entry.score}</span>
                  </li>
                ))}
                {highScores.length === 0 && <li className="text-gray-400 text-center text-sm">No scores yet</li>}
              </ul>
            </div>

            <button 
              onClick={startGame}
              className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded shadow-[0_4px_0_rgb(29,78,216)] active:shadow-[0_0px_0_rgb(29,78,216)] active:translate-y-1 transition-all text-xl"
            >
              START SKIING
            </button>
            <p className="mt-4 text-gray-400 text-xs">Built with React + Gemini API</p>
          </div>
        )}

        {/* Overlay for Game Over */}
        {(gameState === GameState.CRASHED || gameState === GameState.EATEN) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm z-50">
            
            {isNewHighScore ? (
              <div className="bg-slate-800 p-8 rounded-lg shadow-2xl border-2 border-yellow-400 text-center animate-bounce-in">
                <h2 className="text-3xl font-bold text-yellow-400 mb-4">NEW HIGH SCORE!</h2>
                <p className="text-white mb-6 text-xl">You reached <span className="font-bold">{score}m</span></p>
                <form onSubmit={saveHighScore} className="flex flex-col gap-4">
                  <input 
                    autoFocus
                    type="text" 
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="ENTER NAME"
                    maxLength={10}
                    className="bg-slate-900 text-white text-center text-2xl p-2 rounded border border-slate-600 uppercase tracking-widest focus:outline-none focus:border-blue-500"
                  />
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded"
                  >
                    SAVE RECORD
                  </button>
                </form>
              </div>
            ) : (
              <>
                <h2 className="text-4xl font-bold text-white mb-2 shadow-black drop-shadow-lg">
                  {gameState === GameState.EATEN ? 'YETI SNACK!' : 'WIPEOUT!'}
                </h2>
                
                <div className="bg-white/90 p-4 rounded text-black font-mono mb-6 max-w-md text-center shadow-lg border-l-4 border-red-500">
                  <span className="font-bold">ANNOUNCER:</span> "{commentary}"
                </div>
                
                <div className="bg-slate-800/80 p-4 rounded mb-6 w-64 text-sm">
                   <h3 className="text-gray-400 font-bold mb-2 text-center text-xs tracking-wider">HIGH SCORES</h3>
                   <ul>
                    {highScores.map((entry, idx) => (
                      <li key={idx} className={`flex justify-between font-mono mb-1 ${entry.score === score ? 'text-yellow-300 animate-pulse' : 'text-white'}`}>
                        <span>{idx + 1}. {entry.name}</span>
                        <span>{entry.score}</span>
                      </li>
                    ))}
                   </ul>
                </div>

                <button 
                  onClick={startGame}
                  className="px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded shadow-[0_4px_0_rgb(161,98,7)] active:shadow-[0_0px_0_rgb(161,98,7)] active:translate-y-1 transition-all"
                >
                  TRY AGAIN
                </button>
              </>
            )}
          </div>
        )}

        {/* Live Commentary Toast */}
        {gameState === GameState.PLAYING && (
          <div className="absolute top-4 left-4 right-4 text-center pointer-events-none">
            <span className="inline-block bg-black/70 text-white px-4 py-2 rounded-full text-sm font-mono backdrop-blur-md border border-white/20">
              {commentary}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 text-gray-500 text-xs font-mono">
        <p>Built with React + HTML5 Canvas.</p>
      </div>
    </div>
  );
};

export default App;