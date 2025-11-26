import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, EntityType, Entity, Player } from '../types';
import { generateGameCommentary } from '../services/geminiService';

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const FPS = 60;

// Speed Balancing
const MAX_SPEED = 12.5;    // Player max speed reduced (was 14) to be closer to Yeti (12)
const ABSOLUTE_MAX_SPEED = 22; // Hard cap for boost pads
const CRUISE_SPEED = 8;    // Player base speed (Natural gravity)
const YETI_SPEED_MIN = 9;  // Yeti min speed (Faster than cruise)
const YETI_SPEED_MAX = 12; // Yeti max speed (Slower than player max)

const TURN_SPEED = 0.2;
const DRAG = 0.15; // Increased from 0.05 for snappier deceleration
const ACCEL = 0.2;
const YETI_SPAWN_DIST = 2000;
const JUMP_STRENGTH = 8;
const GRAVITY = 0.4;
const NUM_SNOWFLAKES = 100;

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  opacity: number;
}

// Extended Yeti Interface for AI State
interface YetiEntity extends Entity {
  mode: 'CHASE' | 'PRE_LUNGE' | 'LUNGE';
  modeTimer: number;
}

interface GameCanvasProps {
  setGameState: (state: GameState) => void;
  setScore: (score: number) => void;
  gameState: GameState;
  onCommentary: (text: string) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ setGameState, setScore, gameState, onCommentary }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Mutable game state (refs for performance in loop)
  const playerRef = useRef<Player>({ x: CANVAS_WIDTH / 2, y: 100, speed: 0, direction: 0, state: 'skiing', jumpHeight: 0, jumpVelocity: 0 });
  const entitiesRef = useRef<Entity[]>([]);
  const scoreRef = useRef<number>(0);
  const inputRef = useRef<{ [key: string]: boolean }>({});
  const yetiRef = useRef<YetiEntity | null>(null);
  const timeRef = useRef<number>(0);
  const snowflakesRef = useRef<Snowflake[]>([]);

  // --- Asset Drawing Helpers ---
  const drawPixelRect = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  };

  const drawTree = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x + 12, y + 26, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    drawPixelRect(ctx, x + 10, y + 20, '#5D4037', 4, 8);
    // Leaves
    ctx.fillStyle = '#1B5E20';
    ctx.beginPath();
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 24, y + 20);
    ctx.lineTo(x, y + 20);
    ctx.fill();
  };

  const drawRock = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x + 12, y + 15, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#757575';
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 8, 0, Math.PI * 2);
    ctx.fill();
    drawPixelRect(ctx, x + 6, y + 6, '#9E9E9E', 4, 4); // Highlight
  };

  const drawSnowBump = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = '#E1F5FE'; // Very light blue
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#B3E5FC'; // Shadow side
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawSnowMound = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // A larger, obstacle-like pile of snow
    ctx.fillStyle = '#CFD8DC'; // Gray-ish blue for shadow/bulk
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 10, 0, Math.PI, true); // Semi circle
    ctx.fill();
    
    ctx.fillStyle = '#ECEFF1'; // Lighter top
    ctx.beginPath();
    ctx.arc(x + 10, y + 8, 8, 0, Math.PI, true);
    ctx.fill();
  };

  const drawBoostPad = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Glowing Effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FFD700';
    
    // Draw chevrons
    ctx.fillStyle = '#FFC107'; // Amber
    for(let i=0; i<3; i++) {
        const offset = i * 8;
        ctx.beginPath();
        ctx.moveTo(x, y + offset);
        ctx.lineTo(x + 10, y + 10 + offset);
        ctx.lineTo(x + 20, y + offset);
        ctx.lineTo(x + 20, y + 5 + offset);
        ctx.lineTo(x + 10, y + 15 + offset);
        ctx.lineTo(x, y + 5 + offset);
        ctx.fill();
    }
    
    // Reset shadow
    ctx.shadowBlur = 0;
  };

  const drawYeti = (ctx: CanvasRenderingContext2D, yeti: YetiEntity, frame: number) => {
    const { x, y, mode } = yeti;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + 20, y + 45, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const isLunging = mode === 'LUNGE';
    const isPreLunge = mode === 'PRE_LUNGE';

    // Wobble effect (intense if pre-lunge)
    let wobble = Math.sin(frame * 0.2) * 5;
    if (isPreLunge) wobble = (Math.random() - 0.5) * 4;

    ctx.fillStyle = '#F5F5F5'; // Fur
    ctx.fillRect(x + (isPreLunge ? wobble : 0), y, 40, 50);
    
    // Arms
    ctx.fillStyle = '#E0E0E0';
    let armAngle = Math.sin(frame * 0.3) * 20;
    if (isLunging) armAngle = -30; // Arms back for speed
    if (isPreLunge) armAngle = Math.sin(frame * 1.5) * 5; // Shaking arms

    ctx.fillRect(x - 10 + armAngle, y + 15, 10, 30);
    ctx.fillRect(x + 40 - armAngle, y + 15, 10, 30);

    // Face
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(x + 10, y + 5, 20, 15);
    
    // Eyes
    ctx.fillStyle = isLunging ? '#FF0000' : '#D32F2F'; // Bright red if lunging
    ctx.fillRect(x + 12, y + 8, 4, 4);
    ctx.fillRect(x + 24, y + 8, 4, 4);
    
    // Mouth
    ctx.fillStyle = '#000';
    if (isLunging) {
        ctx.fillRect(x + 12, y + 15, 16, 8); // Open wide
    } else {
        ctx.fillRect(x + 14, y + 15, 12, 4);
    }
    
    // Teeth
    ctx.fillStyle = '#FFF';
    ctx.fillRect(x + 15, y + 15, 2, 2);
    ctx.fillRect(x + 23, y + 15, 2, 2);
  };

  const drawSkier = (ctx: CanvasRenderingContext2D, p: Player) => {
    const { x, y, direction, state, jumpHeight } = p;
    
    if (state === 'eaten') return; // Don't draw if eaten

    ctx.save();
    ctx.translate(x, y);

    if (state === 'crashed') {
      // Draw heap
      ctx.fillStyle = '#2196F3'; // Clothes
      ctx.fillRect(-10, -5, 20, 10);
      ctx.fillStyle = '#FF5722'; // Skis scattered
      ctx.fillRect(-15, -10, 5, 20);
      ctx.fillRect(10, 5, 5, 20);
      ctx.fillStyle = '#FFE0B2'; // Head
      ctx.fillRect(-5, -15, 10, 10);
    } else {
      // Shadow if jumping
      if (state === 'jumping') {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, 5, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Apply vertical offset for jump
        ctx.translate(0, -jumpHeight);
      } else {
         // Normal shadow
         ctx.fillStyle = 'rgba(0,0,0,0.2)';
         ctx.beginPath();
         ctx.ellipse(0, 5, 10, 3, 0, 0, Math.PI * 2);
         ctx.fill();
      }

      // Rotation visual based on direction
      // Direction is roughly -2 to 2. 
      // Mapping for visual rotation: 0 -> 0deg, 2 -> 45deg
      const rotation = direction * (Math.PI / 4); 
      
      // Skis
      ctx.rotate(rotation);
      ctx.fillStyle = '#FF5722';
      
      if (state === 'jumping') {
         // Crossed skis for jump
         ctx.save();
         ctx.rotate(Math.PI / 8);
         ctx.fillRect(-8, 5, 4, 30);
         ctx.restore();
         ctx.save();
         ctx.rotate(-Math.PI / 8);
         ctx.fillRect(4, 5, 4, 30);
         ctx.restore();
      } else {
         ctx.fillRect(-8, 10, 4, 25); // Left ski
         ctx.fillRect(4, 10, 4, 25);  // Right ski
      }

      // Body
      ctx.fillStyle = '#1976D2'; // Pants
      ctx.fillRect(-6, 0, 12, 12);
      ctx.fillStyle = '#2196F3'; // Shirt
      ctx.fillRect(-7, -12, 14, 14);

      // Head
      ctx.fillStyle = '#FFE0B2';
      ctx.fillRect(-5, -20, 10, 10);
      
      // Hat
      ctx.fillStyle = '#D32F2F';
      ctx.beginPath();
      ctx.moveTo(-6, -20);
      ctx.lineTo(6, -20);
      ctx.lineTo(0, -28);
      ctx.fill();
      
      // Scarf flowing if moving fast or jumping
      if (p.speed > 5 || state === 'jumping') {
         // If moving extremely fast (boosted), make scarf toggle colors
         ctx.strokeStyle = (p.speed > MAX_SPEED + 2 && timeRef.current % 4 < 2) ? '#FFC107' : '#FFEB3B';
         ctx.lineWidth = 3;
         ctx.beginPath();
         ctx.moveTo(2, -15);
         ctx.lineTo(10 + Math.sin(timeRef.current * 0.5) * 5, -18);
         ctx.stroke();
      }
    }
    ctx.restore();
  };

  // --- Logic Helpers ---
  const spawnEntities = (startY: number, endY: number) => {
    // Simple procedural generation
    for (let y = startY; y < endY; y += 30) {
      
      // Dynamic Difficulty: Increase obstacle density every 2000m
      const difficultyTier = Math.floor(y / 2000);
      const baseChance = 0.15;
      // Cap additional difficulty so it doesn't become impossible (max +50%)
      const addedChance = Math.min(difficultyTier * 0.08, 0.5); 
      const obstacleChance = baseChance + addedChance;

      // Chance for obstacles
      if (Math.random() < obstacleChance) { 
        const typeRoll = Math.random();
        let type = EntityType.TREE;
        if (typeRoll > 0.7) type = EntityType.ROCK;
        else if (typeRoll > 0.9) type = EntityType.STUMP;
        // 10% chance for a snow mound within the obstacle pool (actually makes it fairly common)
        else if (typeRoll > 0.6 && typeRoll <= 0.7) type = EntityType.SNOW_MOUND;

        entitiesRef.current.push({
          id: Math.random(),
          type,
          x: Math.random() * CANVAS_WIDTH * 3 - CANVAS_WIDTH, // Wide spawn area
          y: y + Math.random() * 50,
          width: 24, // Approx width
          height: 24
        });
      }

      // Chance for Snow Bumps (Ground Texture)
      if (Math.random() < 0.4) {
        entitiesRef.current.push({
            id: Math.random(),
            type: EntityType.SNOW_BUMP,
            x: Math.random() * CANVAS_WIDTH * 3 - CANVAS_WIDTH,
            y: y + Math.random() * 50,
            width: 5, 
            height: 5
        });
      }

      // Chance for Boost Pads (Rare)
      if (Math.random() < 0.03) {
        entitiesRef.current.push({
            id: Math.random(),
            type: EntityType.BOOST_PAD,
            x: Math.random() * CANVAS_WIDTH * 3 - CANVAS_WIDTH,
            y: y + Math.random() * 50,
            width: 20, 
            height: 30
        });
      }
    }
  };

  const initSnowflakes = () => {
    snowflakesRef.current = [];
    for (let i = 0; i < NUM_SNOWFLAKES; i++) {
        snowflakesRef.current.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * CANVAS_HEIGHT,
            radius: Math.random() * 2 + 1,
            speed: Math.random() * 2 + 1,
            drift: Math.random() * 0.5 - 0.25,
            opacity: Math.random() * 0.5 + 0.3
        });
    }
  };

  const updateSnowflakes = (playerSpeed: number, playerDir: number) => {
    const snowSpeedY = playerSpeed > 0 ? -playerSpeed : 1; // Snow moves UP if player skis DOWN fast
    const snowSpeedX = -playerDir * 5; // Snow moves opposite to turn

    snowflakesRef.current.forEach(flake => {
        // Apply player velocity relative to snow
        // Natural fall speed + Player movement effect
        flake.y += (flake.speed + 2) - playerSpeed * 1.5; 
        flake.x += flake.drift - (playerDir * 2);

        // Wrap around
        if (flake.y > CANVAS_HEIGHT) flake.y = 0;
        if (flake.y < 0) flake.y = CANVAS_HEIGHT;
        if (flake.x > CANVAS_WIDTH) flake.x = 0;
        if (flake.x < 0) flake.x = CANVAS_WIDTH;
    });
  };

  const drawSnowflakes = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    snowflakesRef.current.forEach(flake => {
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
        ctx.fill();
    });
    ctx.restore();
  };

  const checkCollision = (p: Player, e: Entity) => {
    // Ignore cosmetic entities
    if (e.type === EntityType.SNOW_BUMP) return false;

    // If jumping, ignore low obstacles (including Snow Mounds), but still hit boost pads
    if (p.state === 'jumping') {
        if (e.type === EntityType.ROCK || 
            e.type === EntityType.STUMP || 
            e.type === EntityType.MUSHROOM ||
            e.type === EntityType.SNOW_MOUND) {
            return false;
        }
    }

    // Simple AABB, slightly forgiving
    const playerRect = { x: p.x - 8, y: p.y - 15, w: 16, h: 30 };
    const entityRect = { x: e.x, y: e.y, w: e.width, h: e.height };

    if (e.type === EntityType.TREE) {
      // Trees have a smaller hit box at the bottom (trunk)
      entityRect.y += 15; 
      entityRect.h = 10;
      entityRect.x += 8;
      entityRect.w = 8;
    }

    return (
      playerRect.x < entityRect.x + entityRect.w &&
      playerRect.x + playerRect.w > entityRect.x &&
      playerRect.y < entityRect.y + entityRect.h &&
      playerRect.y + playerRect.h > entityRect.y
    );
  };

  const resetGame = () => {
    playerRef.current = { x: CANVAS_WIDTH / 2, y: 100, speed: 0, direction: 0, state: 'skiing', jumpHeight: 0, jumpVelocity: 0 };
    entitiesRef.current = [];
    scoreRef.current = 0;
    yetiRef.current = null;
    spawnEntities(200, 1000);
    initSnowflakes();
    setScore(0);
    
    // Call AI for start message
    generateGameCommentary('start', {}).then(onCommentary);
  };

  // --- Main Loop ---
  const update = useCallback(() => {
    if (gameState === GameState.PAUSED) return;

    const player = playerRef.current;
    
    // 1. Input Handling & Physics
    if (player.state === 'skiing' || player.state === 'jumping') {
      if (inputRef.current['ArrowLeft']) {
        player.direction = Math.max(player.direction - TURN_SPEED, -2);
      }
      if (inputRef.current['ArrowRight']) {
        player.direction = Math.max(Math.min(player.direction + TURN_SPEED, 2), -2);
        if (player.direction > 2) player.direction = 2; // clamp
      }
      
      // Speed Control:
      // Pressing Down boosts towards MAX_SPEED
      // Not pressing Down accelerates naturally only towards CRUISE_SPEED
      if (inputRef.current['ArrowDown']) {
        player.speed = Math.min(player.speed + ACCEL, MAX_SPEED);
      } else {
        // Natural friction/acceleration
        const slopeFactor = 1 - (Math.abs(player.direction) / 2.5);
        const targetSpeed = CRUISE_SPEED * slopeFactor;
        
        if (player.speed > targetSpeed) {
            // Apply linear drag for responsiveness
            player.speed = Math.max(targetSpeed, player.speed - DRAG);
        } else {
            player.speed += 0.05 * slopeFactor; // Gravity accelerates to Cruise
        }
      }

      // ArrowUp triggers jump if skiing
      if (inputRef.current['ArrowUp'] && player.state === 'skiing') {
        player.state = 'jumping';
        player.jumpVelocity = JUMP_STRENGTH;
        // Boost speed slightly on jump
        player.speed = Math.min(player.speed + 1, MAX_SPEED);
      }
      
      // Safety cap (low end)
      if (player.speed < 0) player.speed = 0;
    }

    // 2. Physics & Movement
    if (player.state === 'skiing' || player.state === 'jumping') {
      const dirRad = player.direction * (Math.PI / 4);
      player.x += Math.sin(dirRad) * player.speed;
      player.y += Math.cos(dirRad) * player.speed;

      // Jump Physics
      if (player.state === 'jumping') {
        player.jumpHeight += player.jumpVelocity;
        player.jumpVelocity -= GRAVITY;

        // Landing
        if (player.jumpHeight <= 0) {
            player.jumpHeight = 0;
            player.jumpVelocity = 0;
            player.state = 'skiing';
        }
      }
    }

    // 3. Entity Management
    // Cull old entities
    entitiesRef.current = entitiesRef.current.filter(e => e.y > player.y - CANVAS_HEIGHT / 2);
    
    // Spawn new ones ahead
    const bottomEdge = player.y + CANVAS_HEIGHT;
    const lastEntityY = entitiesRef.current.length > 0 ? entitiesRef.current[entitiesRef.current.length - 1].y : 0;
    if (lastEntityY < bottomEdge + 500) {
      spawnEntities(Math.max(lastEntityY, bottomEdge), bottomEdge + 500);
    }

    // 4. Yeti Logic
    if (player.y > YETI_SPAWN_DIST && !yetiRef.current && (player.state === 'skiing' || player.state === 'jumping')) {
      yetiRef.current = {
        id: -1,
        type: EntityType.YETI,
        x: player.x - 300, 
        y: player.y - 400, // Spawn further back so lunge isn't instant death
        width: 40,
        height: 50,
        mode: 'CHASE',
        modeTimer: 0
      };
      onCommentary("RROOOAAAARRRR! The Yeti has spotted you!");
    }

    if (yetiRef.current) {
      const yeti = yetiRef.current;
      const dx = player.x - yeti.x;
      const dy = player.y - yeti.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 10 && player.state !== 'eaten') {
        player.state = 'eaten';
        player.speed = 0;
        setGameState(GameState.EATEN);
        generateGameCommentary('eaten', { distance: player.y }).then(onCommentary);
      } else if (player.state !== 'eaten') {
        // --- Yeti AI State Machine ---
        if (yeti.modeTimer > 0) yeti.modeTimer--;

        if (yeti.modeTimer <= 0) {
            if (yeti.mode === 'CHASE') {
                // Occasional lunge attack (5% chance per check if cooldown done)
                if (Math.random() < 0.02) { 
                    yeti.mode = 'PRE_LUNGE';
                    yeti.modeTimer = 30; // 0.5s warning (stops/shakes)
                }
            } else if (yeti.mode === 'PRE_LUNGE') {
                yeti.mode = 'LUNGE';
                yeti.modeTimer = 60; // 1s dash
            } else if (yeti.mode === 'LUNGE') {
                yeti.mode = 'CHASE';
                yeti.modeTimer = 120; // 2s Cooldown before next possible lunge
            }
        }

        // Difficulty Scaling: Increase Yeti speed by 5% every 2000m
        const difficultyMultiplier = 1 + Math.floor(player.y / 2000) * 0.05;

        // Calculate Target Speed & Movement
        let targetSpeed = 0;

        if (yeti.mode === 'CHASE') {
            const urgency = Math.min(dist / 400, 1); 
            // Scale chase speed by difficulty
            targetSpeed = (YETI_SPEED_MIN + (YETI_SPEED_MAX - YETI_SPEED_MIN) * urgency) * difficultyMultiplier;
            
            // "Swerve" Behavior: Add sine wave noise to make movement less robotic
            yeti.x += Math.sin(timeRef.current * 0.05) * 2; 

        } else if (yeti.mode === 'PRE_LUNGE') {
            targetSpeed = YETI_SPEED_MIN * 0.2; // Nearly stop to telegraph attack
            // Shake effect
            yeti.x += (Math.random() - 0.5) * 6;
        } else if (yeti.mode === 'LUNGE') {
            // Scale lunge speed by difficulty
            targetSpeed = (MAX_SPEED * 1.5) * difficultyMultiplier;
        }

        // Apply movement vector
        if (dist > 10) {
            yeti.x += (dx / dist) * targetSpeed;
            yeti.y += (dy / dist) * targetSpeed;
        }
      }
    }

    // 5. Collision
    if (player.state === 'skiing' || player.state === 'jumping') {
      let collidedWithPad = false;

      // Filter out consumed items immediately
      entitiesRef.current = entitiesRef.current.filter(e => {
        if (checkCollision(player, e)) {
            if (e.type === EntityType.BOOST_PAD) {
                // Speed boost!
                player.speed = Math.min(player.speed + 8, ABSOLUTE_MAX_SPEED);
                collidedWithPad = true;
                return false; // Remove pad
            }
            if (e.type === EntityType.SNOW_MOUND) {
                // Slow down
                player.speed *= 0.75;
                // Remove mound so we don't hit it again in next frame
                return false;
            }
            
            // Fatal collision
            if (!collidedWithPad) {
                player.state = 'crashed';
                player.speed = 0;
                player.jumpHeight = 0; // Reset height on crash
                setGameState(GameState.CRASHED);
                generateGameCommentary('crash', { distance: player.y, cause: e.type.toLowerCase() }).then(onCommentary);
            }
            return true; // Keep entity if we crashed into it
        }
        return true;
      });
    }

    // 6. Visual Effects Update
    updateSnowflakes(player.state === 'skiing' || player.state === 'jumping' ? player.speed * Math.cos(player.direction * Math.PI/4) : 0, player.direction);

    // 7. Update Score
    scoreRef.current = Math.floor(player.y);
    setScore(scoreRef.current);

    // Animation Frames
    timeRef.current++;

  }, [gameState, setGameState, setScore, onCommentary]);

  // --- Render Loop ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background with nice gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#E3F2FD'); // Light Blue Top
    gradient.addColorStop(1, '#FAFAFA'); // White Bottom
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const player = playerRef.current;

    // Camera follow player
    ctx.save();
    // Center player on screen X and Y (offset by slight 'up' bias for Y)
    ctx.translate(-player.x + CANVAS_WIDTH / 2, -player.y + CANVAS_HEIGHT / 3);

    // Draw Entities
    entitiesRef.current.forEach(e => {
      // Viewport culling for render
      if (e.y < player.y - CANVAS_HEIGHT || e.y > player.y + CANVAS_HEIGHT) return;

      switch (e.type) {
        case EntityType.TREE: drawTree(ctx, e.x, e.y); break;
        case EntityType.ROCK: drawRock(ctx, e.x, e.y); break;
        case EntityType.STUMP: drawRock(ctx, e.x, e.y); break; // Reuse rock logic
        case EntityType.SNOW_BUMP: drawSnowBump(ctx, e.x, e.y); break;
        case EntityType.SNOW_MOUND: drawSnowMound(ctx, e.x, e.y); break;
        case EntityType.BOOST_PAD: drawBoostPad(ctx, e.x, e.y); break;
        default: drawPixelRect(ctx, e.x, e.y, 'purple', e.width, e.height);
      }
    });

    // Draw Player
    drawSkier(ctx, player);

    // Draw Yeti (if active)
    if (yetiRef.current) {
      drawYeti(ctx, yetiRef.current, timeRef.current);
    }

    ctx.restore();

    // Draw Snow Overlay (Fixed to screen)
    drawSnowflakes(ctx);

    // Loop
    requestRef.current = requestAnimationFrame(() => {
      update();
      render();
    });
  }, [update]);

  // --- Effects ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => inputRef.current[e.code] = true;
    const handleKeyUp = (e: KeyboardEvent) => inputRef.current[e.code] = false;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Initial Start
    if (gameState === GameState.PLAYING && scoreRef.current === 0) {
      resetGame();
    } else if (snowflakesRef.current.length === 0) {
       initSnowflakes();
    }

    requestRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, render]);

  // Handle Game Over / Restart triggers from parent
  useEffect(() => {
    if (gameState === GameState.MENU) {
       // Reset logic if needed when going back to menu
    }
  }, [gameState]);

  // Allow parent to trigger restart
  useEffect(() => {
    // If user clicks "Try Again" in parent, we might pass a prop or expose a ref,
    // but here we just check if state flips to playing from a stopped state
    if (gameState === GameState.PLAYING && (playerRef.current.state === 'crashed' || playerRef.current.state === 'eaten')) {
        resetGame();
    }
  }, [gameState]);


  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="bg-white rounded-lg shadow-xl border-4 border-gray-200"
    />
  );
};

export default GameCanvas;