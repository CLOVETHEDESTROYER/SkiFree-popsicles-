import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState } from './types';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [commentary, setCommentary] = useState<string>("Welcome to SkiFree React! Watch out for the Yeti.");

  // Load high score from local storage
  useEffect(() => {
    const saved = localStorage.getItem('skifree-highscore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  // Update high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('skifree-highscore', score.toString());
    }
  }, [score, highScore]);

  const startGame = () => {
    setGameState(GameState.PLAYING);
  };

  const handleCommentary = (text: string) => {
    setCommentary(text);
  };

  return (
    <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center p-4">
      {/* Header / Score Board */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 text-white font-mono">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">SKI FREE <span className="text-xs text-gray-400">REACT EDITION</span></h1>
          <p className="text-sm text-gray-400">Arrows to Move | Down to Speed Up</p>
        </div>
        <div className="text-right">
          <p className="text-xl">DIST: <span className="text-yellow-400">{score}m</span></p>
          <p className="text-sm opacity-75">BEST: {highScore}m</p>
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
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm">
            <h2 className="text-5xl font-bold text-white mb-8 tracking-widest drop-shadow-md">SKI FREE</h2>
            <button 
              onClick={startGame}
              className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded shadow-[0_4px_0_rgb(29,78,216)] active:shadow-[0_0px_0_rgb(29,78,216)] active:translate-y-1 transition-all text-xl"
            >
              START SKIING
            </button>
            <p className="mt-4 text-gray-300 text-sm">Beware the Yeti at 2000m!</p>
          </div>
        )}

        {/* Overlay for Game Over */}
        {(gameState === GameState.CRASHED || gameState === GameState.EATEN) && (
          <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm">
            <h2 className="text-4xl font-bold text-white mb-2 shadow-black drop-shadow-lg">
              {gameState === GameState.EATEN ? 'YETI SNACK!' : 'WIPEOUT!'}
            </h2>
            <div className="bg-white/90 p-4 rounded text-black font-mono mb-6 max-w-md text-center shadow-lg border-l-4 border-red-500">
              <span className="font-bold">ANNOUNCER:</span> "{commentary}"
            </div>
            <button 
              onClick={startGame}
              className="px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded shadow-[0_4px_0_rgb(161,98,7)] active:shadow-[0_0px_0_rgb(161,98,7)] active:translate-y-1 transition-all"
            >
              TRY AGAIN
            </button>
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
        <p>Built with React + HTML5 Canvas. Powered by Gemini AI.</p>
      </div>
    </div>
  );
};

export default App;
