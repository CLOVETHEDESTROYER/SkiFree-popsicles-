import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, EntityType, Entity, Player } from '../types';
import { generateGameCommentary } from '../services/geminiService';

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const FPS = 60;

// Speed Balancing
const MAX_SPEED = 12.5;    // Player max speed
const ABSOLUTE_MAX_SPEED = 22; // Hard cap for boost pads
const CRUISE_SPEED = 8;    // Player base speed (Natural gravity)
const YETI_SPEED_MIN = 9;  // Yeti min speed
const YETI_SPEED_MAX = 12; // Yeti max speed

const TURN_SPEED = 0.2;
const DRAG = 0.15;
const ACCEL = 0.2;
const YETI_SPAWN_DIST = 2000;
const JUMP_STRENGTH = 8;
const GRAVITY = 0.4;
const NUM_SNOWFLAKES = 300;

// Power Up Config
const POWERUP_DURATION = 180; // 3 seconds at 60fps
const YETI_SCARE_DURATION = 240; // 4 seconds at 60fps

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  opacity: number;
  swayOffset: number; // For sine wave motion
  swaySpeed: number;
}

// Visual-only ground elements for speed sensation
interface GroundFeature {
  id: number;
  x: number;
  y: number;
  size: number;
  variant: 'BUMP' | 'MOUND' | 'ICE';
  opacity: number;
}

// Extended Yeti Interface for AI State
interface YetiEntity extends Entity {
  mode: 'CHASE' | 'PRE_LUNGE' | 'LUNGE' | 'RETREAT';
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
  const playerRef = useRef<Player>({ x: CANVAS_WIDTH / 2, y: 100, speed: 0, direction: 0, state: 'skiing', jumpHeight: 0, jumpVelocity: 0, powerUpTimer: 0 });
  const entitiesRef = useRef<Entity[]>([]);
  const groundFeaturesRef = useRef<GroundFeature[]>([]); // New ref for decorative ground items
  const scoreRef = useRef<number>(0);
  const inputRef = useRef<{ [key: string]: boolean }>({});
  const yetiRef = useRef<YetiEntity | null>(null);
  const timeRef = useRef<number>(0);
  const snowflakesRef = useRef<Snowflake[]>([]);

  // --- Drawing Helpers ---
  const fillRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  };

  // --- High Fidelity Asset Drawers ---

  const drawHighFiTree = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x + 12, y + 28, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = '#4E342E';
    ctx.fillRect(x + 10, y + 20, 4, 8);

    // Layers of leaves (Bottom to Top)
    const drawLayer = (offsetY: number, width: number, color: string, shade: string) => {
        // Main Cone
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + offsetY - 10);
        ctx.lineTo(x + 12 + width, y + offsetY + 10);
        ctx.lineTo(x + 12 - width, y + offsetY + 10);
        ctx.fill();
        
        // Shading (Right side darker for volume)
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + offsetY - 10);
        ctx.lineTo(x + 12 + width, y + offsetY + 10);
        ctx.lineTo(x + 12, y + offsetY + 10);
        ctx.fill();
    };

    // Draw 3 Tiers
    drawLayer(12, 14, '#2E7D32', '#1B5E20'); // Bottom
    drawLayer(2, 12, '#388E3C', '#2E7D32');  // Middle
    drawLayer(-8, 10, '#43A047', '#388E3C'); // Top
  };

  const drawHighFiRock = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + 12, y + 18, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main rock body (Irregular shape)
    ctx.fillStyle = '#78909C';
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 15);
    ctx.lineTo(x + 10, y + 5);
    ctx.lineTo(x + 20, y + 8);
    ctx.lineTo(x + 24, y + 18);
    ctx.lineTo(x + 18, y + 22);
    ctx.lineTo(x + 2, y + 20);
    ctx.closePath();
    ctx.fill();

    // Highlight (Top/Left plane)
    ctx.fillStyle = '#B0BEC5';
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 15);
    ctx.lineTo(x + 10, y + 5);
    ctx.lineTo(x + 15, y + 10);
    ctx.lineTo(x + 8, y + 18);
    ctx.closePath();
    ctx.fill();
    
    // Deep Shadow (Bottom/Right plane)
    ctx.fillStyle = '#546E7A';
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 22);
    ctx.lineTo(x + 24, y + 18);
    ctx.lineTo(x + 20, y + 8);
    ctx.lineTo(x + 15, y + 12);
    ctx.closePath();
    ctx.fill();
  };

  const drawHighFiGroundFeature = (ctx: CanvasRenderingContext2D, f: GroundFeature) => {
    const { x, y, size, variant, opacity } = f;
    
    if (variant === 'ICE') {
        // Flat shiny patch
        ctx.fillStyle = `rgba(225, 245, 254, ${opacity})`;
        ctx.beginPath();
        // Irregular shape for ice
        ctx.moveTo(x - size * 2, y);
        ctx.lineTo(x - size, y - size/2);
        ctx.lineTo(x + size * 1.5, y);
        ctx.lineTo(x + size, y + size/2);
        ctx.closePath();
        ctx.fill();
        
        // Glint
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(x - size, y - size/4);
        ctx.lineTo(x, y - size/2);
        ctx.stroke();
    } else {
        // Bumps and texture
        const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
        grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        grad.addColorStop(1, `rgba(207, 216, 220, 0)`);
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        
        // Tiny shadow crescent
        ctx.fillStyle = `rgba(176, 190, 197, ${opacity})`;
        ctx.beginPath();
        ctx.arc(x + size * 0.2, y + size * 0.2, size * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
  };

  const drawHighFiSnowMound = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // A nice soft dome with 3D shading
    const grad = ctx.createRadialGradient(x + 8, y + 6, 2, x + 10, y + 10, 15);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(1, '#B0BEC5');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x + 10, y + 10, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawHighFiBoostPad = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Glowing Effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#FF6D00';
    
    // Draw chevrons with gradient
    const grad = ctx.createLinearGradient(x, y, x, y + 20);
    grad.addColorStop(0, '#FFD180');
    grad.addColorStop(1, '#FF6D00');
    ctx.fillStyle = grad;

    for(let i=0; i<3; i++) {
        const offset = i * 7;
        ctx.beginPath();
        ctx.moveTo(x, y + offset);
        ctx.lineTo(x + 10, y + 8 + offset);
        ctx.lineTo(x + 20, y + offset);
        ctx.lineTo(x + 20, y + 4 + offset);
        ctx.lineTo(x + 10, y + 12 + offset);
        ctx.lineTo(x, y + 4 + offset);
        ctx.fill();
    }
    
    ctx.shadowBlur = 0;
  };

  const drawHighFiSuperMushroom = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
     // Shadow
     ctx.fillStyle = 'rgba(0,0,0,0.2)';
     ctx.beginPath();
     ctx.ellipse(x + 10, y + 18, 8, 3, 0, 0, Math.PI*2);
     ctx.fill();

     // Cap Gradient
     const capGrad = ctx.createRadialGradient(x + 8, y + 5, 2, x + 10, y + 10, 12);
     capGrad.addColorStop(0, '#FF5252');
     capGrad.addColorStop(1, '#B71C1C');
     ctx.fillStyle = capGrad;
     
     ctx.beginPath();
     ctx.arc(x + 10, y + 10, 10, 0, Math.PI, true);
     ctx.quadraticCurveTo(x + 10, y + 12, x + 20, y + 10); // slightly curved bottom
     ctx.fill();
     
     // Spots
     ctx.fillStyle = '#FFEBEE';
     ctx.beginPath();
     ctx.ellipse(x + 5, y + 7, 2, 3, Math.PI/4, 0, Math.PI*2);
     ctx.fill();
     ctx.beginPath();
     ctx.ellipse(x + 15, y + 7, 2, 3, -Math.PI/4, 0, Math.PI*2);
     ctx.fill();
     ctx.beginPath();
     ctx.ellipse(x + 10, y + 4, 3, 2, 0, 0, Math.PI*2);
     ctx.fill();

     // Stem
     ctx.fillStyle = '#FFE0B2';
     fillRoundRect(ctx, x + 6, y + 10, 8, 8, 2);
     
     // Eyes on stem
     ctx.fillStyle = '#000';
     ctx.fillRect(x + 8, y + 12, 1, 2);
     ctx.fillRect(x + 11, y + 12, 1, 2);
  };

  const drawHighFiYeti = (ctx: CanvasRenderingContext2D, yeti: YetiEntity, frame: number) => {
    const { x, y, mode } = yeti;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + 20, y + 45, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const isLunging = mode === 'LUNGE';
    const isPreLunge = mode === 'PRE_LUNGE';
    const isRetreating = mode === 'RETREAT';

    let wobble = 0;
    if (isPreLunge || isRetreating) wobble = (Math.random() - 0.5) * 4;

    const bodyColor = isRetreating ? '#E1F5FE' : '#F5F5F5';
    const shadowColor = isRetreating ? '#B3E5FC' : '#E0E0E0';

    // Metaball-style body construction
    
    // Legs
    const legAnim = Math.sin(frame * 0.2) * 10;
    const lLegX = x + 5 + (mode === 'CHASE' ? legAnim : 0) + wobble;
    const rLegX = x + 25 - (mode === 'CHASE' ? legAnim : 0) + wobble;
    
    // Left Leg
    ctx.fillStyle = bodyColor;
    ctx.beginPath(); ctx.ellipse(lLegX, y + 35, 9, 14, 0, 0, Math.PI*2); ctx.fill();
    // Right Leg
    ctx.fillStyle = bodyColor;
    ctx.beginPath(); ctx.ellipse(rLegX, y + 35, 9, 14, 0, 0, Math.PI*2); ctx.fill();

    // Torso (Main Body)
    ctx.fillStyle = bodyColor;
    fillRoundRect(ctx, x + wobble, y + 5, 40, 38, 15);
    
    // Chest Shadow/Detail
    ctx.fillStyle = shadowColor;
    ctx.beginPath();
    ctx.arc(x + 20 + wobble, y + 25, 12, 0, Math.PI, false);
    ctx.fill();

    // Arms
    let armAngle = Math.sin(frame * 0.3) * 0.5;
    if (isLunging) armAngle = -1.5; // Arms up/forward
    if (isRetreating) armAngle = -2.5; // Arms up in surrender
    if (isPreLunge) armAngle += Math.sin(frame * 2) * 0.2;

    // Left Arm
    ctx.save();
    ctx.translate(x + 5 + wobble, y + 15);
    ctx.rotate(armAngle);
    ctx.fillStyle = bodyColor;
    fillRoundRect(ctx, -6, 0, 12, 32, 6);
    // Claws
    ctx.fillStyle = '#9E9E9E';
    ctx.fillRect(-3, 30, 6, 4);
    ctx.restore();

    // Right Arm
    ctx.save();
    ctx.translate(x + 35 + wobble, y + 15);
    ctx.rotate(-armAngle);
    ctx.fillStyle = bodyColor;
    fillRoundRect(ctx, -6, 0, 12, 32, 6);
    // Claws
    ctx.fillStyle = '#9E9E9E';
    ctx.fillRect(-3, 30, 6, 4);
    ctx.restore();

    // Head Bump
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(x + 20 + wobble, y + 8, 14, 0, Math.PI * 2); 
    ctx.fill();

    // Face Mask
    ctx.fillStyle = '#BDBDBD'; // Grey skin
    fillRoundRect(ctx, x + 12 + wobble, y + 10, 16, 14, 4);

    // Eyes
    ctx.fillStyle = isLunging ? '#D50000' : '#212121';
    if (isRetreating) {
        // Scared Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.arc(x + 15 + wobble, y + 14, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 25 + wobble, y + 14, 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(x + 15 + wobble, y + 14, 1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 25 + wobble, y + 14, 1, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.fillRect(x + 14 + wobble, y + 13, 3, 3);
        ctx.fillRect(x + 23 + wobble, y + 13, 3, 3);
    }
    
    // Mouth
    ctx.fillStyle = '#000';
    if (isLunging) {
        ctx.beginPath(); ctx.ellipse(x + 20 + wobble, y + 20, 6, 4, 0, 0, Math.PI*2); ctx.fill();
        // Teeth
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.moveTo(x + 17, y + 17); ctx.lineTo(x + 18, y + 20); ctx.lineTo(x + 19, y + 17); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 21, y + 17); ctx.lineTo(x + 22, y + 20); ctx.lineTo(x + 23, y + 17); ctx.fill();
    } else if (isRetreating) {
        ctx.beginPath(); ctx.arc(x + 20 + wobble, y + 21, 2, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.fillRect(x + 16 + wobble, y + 20, 8, 2);
    }
  };

  const drawHighFiSkier = (ctx: CanvasRenderingContext2D, p: Player) => {
    const { x, y, direction, state, jumpHeight, powerUpTimer } = p;
    
    if (state === 'eaten') return;

    ctx.save();
    ctx.translate(x, y);

    // Power Up Scaling
    if (powerUpTimer > 0) {
        // Pulse effect
        if (powerUpTimer < 60 && Math.floor(timeRef.current / 5) % 2 === 0) {
             ctx.scale(1, 1);
        } else {
             ctx.scale(2, 2);
        }
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    if (state === 'jumping') {
        ctx.translate(0, -jumpHeight);
        ctx.beginPath();
        ctx.ellipse(0, 5 + jumpHeight, 10, 3, 0, 0, Math.PI * 2); // Shadow on ground
        ctx.fill();
    } else if (state === 'crashed') {
         // No specific shadow for crash pile, it's flat
    } else {
         ctx.beginPath();
         ctx.ellipse(0, 5, 10, 3, 0, 0, Math.PI * 2);
         ctx.fill();
    }

    if (state === 'crashed') {
      // Detailed Crash Pile
      ctx.fillStyle = '#1565C0'; // Pants
      ctx.fillRect(-12, -4, 10, 6);
      ctx.fillStyle = '#1976D2'; // Shirt
      ctx.fillRect(-8, -10, 10, 8);
      ctx.fillStyle = '#FF7043'; // Skis scattered
      ctx.save(); ctx.rotate(0.5); ctx.fillRect(-10, -5, 20, 3); ctx.restore();
      ctx.save(); ctx.rotate(-0.8); ctx.fillRect(-5, 5, 20, 3); ctx.restore();
      // Head face down
      ctx.fillStyle = '#FFCCBC';
      ctx.beginPath(); ctx.arc(5, -5, 5, 0, Math.PI*2); ctx.fill();
      // Stars
      ctx.fillStyle = '#FFEB3B';
      const starX = Math.sin(timeRef.current * 0.2) * 10;
      ctx.fillRect(-5 + starX, -25, 4, 4);

    } else {
      // Rotation
      const rotation = direction * (Math.PI / 6); 
      ctx.rotate(rotation);
      
      // Skis
      ctx.fillStyle = '#D84315'; // Deep Orange
      if (state === 'jumping') {
         ctx.save(); ctx.rotate(Math.PI / 8); fillRoundRect(ctx, -6, 5, 4, 28, 2); ctx.restore();
         ctx.save(); ctx.rotate(-Math.PI / 8); fillRoundRect(ctx, 2, 5, 4, 28, 2); ctx.restore();
      } else {
         // Left Ski
         fillRoundRect(ctx, -8, 5, 4, 28, 2);
         // Right Ski
         fillRoundRect(ctx, 4, 5, 4, 28, 2);
         // Ski Highlights
         ctx.fillStyle = '#FF7043';
         ctx.fillRect(-7, 5, 2, 26);
         ctx.fillRect(5, 5, 2, 26);
      }

      // Legs (Pants)
      ctx.fillStyle = '#1565C0'; // Dark Blue
      ctx.beginPath();
      // Draw bent legs for skiing posture
      ctx.moveTo(-6, 0);
      ctx.lineTo(-6, 12); 
      ctx.lineTo(-2, 12);
      ctx.lineTo(0, 5); // Crotch
      ctx.lineTo(2, 12);
      ctx.lineTo(6, 12);
      ctx.lineTo(6, 0);
      ctx.fill();

      // Torso
      ctx.fillStyle = '#1976D2'; // Blue
      fillRoundRect(ctx, -7, -11, 14, 12, 3);
      
      // Arms (Dynamic poles)
      ctx.strokeStyle = '#1565C0';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -8); ctx.lineTo(-11, 0); // Left arm
      ctx.moveTo(7, -8); ctx.lineTo(11, 0);   // Right arm
      ctx.stroke();
      
      // Poles
      ctx.fillStyle = '#90A4AE';
      ctx.fillRect(-13, -5, 2, 24); 
      ctx.fillRect(13, -5, 2, 24);

      // Head
      ctx.fillStyle = '#FFCCBC';
      ctx.beginPath();
      ctx.arc(0, -15, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Hat
      ctx.fillStyle = '#D32F2F';
      ctx.beginPath();
      ctx.moveTo(-6, -16);
      ctx.quadraticCurveTo(0, -24, 6, -16);
      ctx.lineTo(6, -15);
      ctx.lineTo(-6, -15);
      ctx.fill();
      // Pom pom
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(0, -22, 2, 0, Math.PI*2); ctx.fill();
      
      // Scarf Physics
      if (p.speed > 5 || state === 'jumping') {
         ctx.fillStyle = (p.speed > MAX_SPEED + 2 && timeRef.current % 4 < 2) ? '#FFEB3B' : '#FDD835'; // Flash if super fast
         ctx.beginPath();
         ctx.moveTo(2, -13);
         const sway = Math.sin(timeRef.current * 0.2) * 5;
         const length = 10 + (p.speed * 1.5);
         ctx.lineTo(length + Math.abs(sway), -13 + sway);
         ctx.lineTo(length + Math.abs(sway) - 2, -9 + sway);
         ctx.lineTo(2, -9);
         ctx.fill();
      }
    }
    ctx.restore();
  };

  // --- Logic Helpers ---
  const spawnEntities = (startY: number, endY: number) => {
    const playerX = playerRef.current.x;
    
    // Spawn Gameplay Entities
    for (let y = startY; y < endY; y += 30) {
      const difficultyTier = Math.floor(y / 2000);
      const baseChance = 0.15;
      const addedChance = Math.min(difficultyTier * 0.08, 0.5); 
      const obstacleChance = baseChance + addedChance;

      const spawnX = () => playerX + (Math.random() * CANVAS_WIDTH * 3) - (CANVAS_WIDTH * 1.5);

      if (Math.random() < obstacleChance) { 
        const typeRoll = Math.random();
        let type = EntityType.TREE;
        if (typeRoll > 0.7) type = EntityType.ROCK;
        else if (typeRoll > 0.9) type = EntityType.STUMP;
        else if (typeRoll > 0.6 && typeRoll <= 0.7) type = EntityType.SNOW_MOUND;

        entitiesRef.current.push({
          id: Math.random(),
          type,
          x: spawnX(),
          y: y + Math.random() * 50,
          width: 24, 
          height: 24
        });
      }

      if (Math.random() < 0.03) {
        entitiesRef.current.push({
            id: Math.random(),
            type: EntityType.BOOST_PAD,
            x: spawnX(),
            y: y + Math.random() * 50,
            width: 20, 
            height: 30
        });
      }

      if (Math.random() < 0.01) { 
        entitiesRef.current.push({
            id: Math.random(),
            type: EntityType.SUPER_MUSHROOM,
            x: spawnX(),
            y: y + Math.random() * 50,
            width: 20,
            height: 20
        });
      }
    }

    // Spawn Cosmetic Ground Features
    for (let y = startY; y < endY; y += 15) { 
       for (let i = 0; i < 3; i++) {
           if (Math.random() < 0.7) {
               const variantRoll = Math.random();
               let variant: 'BUMP' | 'MOUND' | 'ICE' = 'BUMP';
               let size = Math.random() * 2 + 2;
               if (variantRoll > 0.8) {
                   variant = 'ICE';
                   size = Math.random() * 4 + 3;
               } else if (variantRoll > 0.6) {
                   variant = 'MOUND';
                   size = Math.random() * 3 + 3;
               }

               groundFeaturesRef.current.push({
                   id: Math.random(),
                   x: playerX + (Math.random() * CANVAS_WIDTH * 3) - (CANVAS_WIDTH * 1.5),
                   y: y + Math.random() * 20,
                   size,
                   variant,
                   opacity: Math.random() * 0.5 + 0.3
               });
           }
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
            opacity: Math.random() * 0.5 + 0.3,
            swayOffset: Math.random() * Math.PI * 2,
            swaySpeed: Math.random() * 0.05 + 0.01
        });
    }
  };

  const updateSnowflakes = (playerSpeed: number, playerDir: number) => {
    const wind = Math.sin(timeRef.current * 0.005) * 2;
    snowflakesRef.current.forEach(flake => {
        flake.x += flake.drift + wind - (playerDir * 5) + Math.sin(timeRef.current * flake.swaySpeed + flake.swayOffset) * 0.5;
        flake.y += (flake.speed + 1) - playerSpeed * 1.5;
        if (flake.y > CANVAS_HEIGHT) flake.y = 0;
        if (flake.y < -10) flake.y = CANVAS_HEIGHT; 
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
    if (e.type === EntityType.SNOW_BUMP) return false;

    if (p.state === 'jumping') {
        if (e.type === EntityType.ROCK || 
            e.type === EntityType.STUMP || 
            e.type === EntityType.MUSHROOM ||
            e.type === EntityType.SNOW_MOUND) {
            return false;
        }
    }

    if (p.powerUpTimer > 0) {
        if (e.type === EntityType.TREE || e.type === EntityType.ROCK || e.type === EntityType.STUMP) {
            return false; 
        }
    }

    const playerRect = { x: p.x - 8, y: p.y - 15, w: 16, h: 30 };
    if (p.powerUpTimer > 0) {
        playerRect.x -= 8; playerRect.y -= 15; playerRect.w *= 2; playerRect.h *= 2;
    }

    const entityRect = { x: e.x, y: e.y, w: e.width, h: e.height };

    if (e.type === EntityType.TREE) {
      entityRect.y += 15; entityRect.h = 10; entityRect.x += 8; entityRect.w = 8;
    }

    return (
      playerRect.x < entityRect.x + entityRect.w &&
      playerRect.x + playerRect.w > entityRect.x &&
      playerRect.y < entityRect.y + entityRect.h &&
      playerRect.y + playerRect.h > entityRect.y
    );
  };

  const resetGame = () => {
    playerRef.current = { x: CANVAS_WIDTH / 2, y: 100, speed: 0, direction: 0, state: 'skiing', jumpHeight: 0, jumpVelocity: 0, powerUpTimer: 0 };
    entitiesRef.current = [];
    groundFeaturesRef.current = [];
    scoreRef.current = 0;
    yetiRef.current = null;
    spawnEntities(200, 1000);
    initSnowflakes();
    setScore(0);
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
        if (player.direction > 2) player.direction = 2; 
      }
      
      if (inputRef.current['ArrowDown']) {
        player.speed = Math.min(player.speed + ACCEL, MAX_SPEED);
      } else {
        const slopeFactor = 1 - (Math.abs(player.direction) / 2.5);
        const targetSpeed = CRUISE_SPEED * slopeFactor;
        
        if (player.speed > targetSpeed) {
            player.speed = Math.max(targetSpeed, player.speed - DRAG);
        } else {
            player.speed += 0.05 * slopeFactor; 
        }
      }

      if (inputRef.current['ArrowUp'] && player.state === 'skiing') {
        player.state = 'jumping';
        player.jumpVelocity = JUMP_STRENGTH;
        player.speed = Math.min(player.speed + 1, MAX_SPEED);
      }
      
      if (player.speed < 0) player.speed = 0;
    }

    // 2. Physics & Movement
    if (player.state === 'skiing' || player.state === 'jumping') {
      const dirRad = player.direction * (Math.PI / 4);
      player.x += Math.sin(dirRad) * player.speed;
      player.y += Math.cos(dirRad) * player.speed;

      if (player.state === 'jumping') {
        player.jumpHeight += player.jumpVelocity;
        player.jumpVelocity -= GRAVITY;
        if (player.jumpHeight <= 0) {
            player.jumpHeight = 0;
            player.jumpVelocity = 0;
            player.state = 'skiing';
        }
      }
      
      if (player.powerUpTimer > 0) player.powerUpTimer--;
    }

    // 3. Entity Management
    const bottomEdge = player.y + CANVAS_HEIGHT;
    const topEdge = player.y - CANVAS_HEIGHT / 2;

    entitiesRef.current = entitiesRef.current.filter(e => e.y > topEdge);
    groundFeaturesRef.current = groundFeaturesRef.current.filter(e => e.y > topEdge);
    
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
        y: player.y - 400,
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
      
      if (player.powerUpTimer > 0 && yeti.mode !== 'RETREAT') {
          yeti.mode = 'RETREAT';
          yeti.modeTimer = YETI_SCARE_DURATION;
          onCommentary("The Yeti is scared of your size!");
      }

      if (dist < 10 && player.state !== 'eaten' && player.powerUpTimer <= 0) {
        player.state = 'eaten';
        player.speed = 0;
        setGameState(GameState.EATEN);
        generateGameCommentary('eaten', { distance: player.y }).then(onCommentary);
      } else if (player.state !== 'eaten') {
        if (yeti.modeTimer > 0) yeti.modeTimer--;

        if (yeti.modeTimer <= 0) {
            if (yeti.mode === 'CHASE') {
                if (Math.random() < 0.02) { 
                    yeti.mode = 'PRE_LUNGE';
                    yeti.modeTimer = 30; 
                }
            } else if (yeti.mode === 'PRE_LUNGE') {
                yeti.mode = 'LUNGE';
                yeti.modeTimer = 60; 
            } else if (yeti.mode === 'LUNGE') {
                yeti.mode = 'CHASE';
                yeti.modeTimer = 120;
            } else if (yeti.mode === 'RETREAT') {
                yeti.mode = 'CHASE';
            }
        }

        const difficultyMultiplier = 1 + Math.floor(player.y / 3000) * 0.03;
        let targetSpeed = 0;

        if (yeti.mode === 'CHASE') {
            const urgency = Math.min(dist / 400, 1); 
            targetSpeed = (YETI_SPEED_MIN + (YETI_SPEED_MAX - YETI_SPEED_MIN) * urgency) * difficultyMultiplier;
            yeti.x += Math.sin(timeRef.current * 0.05) * 2; 

        } else if (yeti.mode === 'PRE_LUNGE') {
            targetSpeed = YETI_SPEED_MIN * 0.2; 
            yeti.x += (Math.random() - 0.5) * 6;
        } else if (yeti.mode === 'LUNGE') {
            targetSpeed = (MAX_SPEED * 1.5) * difficultyMultiplier;
        } else if (yeti.mode === 'RETREAT') {
            targetSpeed = -4; 
        }

        if (yeti.mode === 'RETREAT') {
            yeti.y += targetSpeed;
        } else if (dist > 10) {
            yeti.x += (dx / dist) * targetSpeed;
            yeti.y += (dy / dist) * targetSpeed;
        }
      }
    }

    // 5. Collision
    if (player.state === 'skiing' || player.state === 'jumping') {
      let collidedWithPad = false;

      entitiesRef.current = entitiesRef.current.filter(e => {
        if (checkCollision(player, e)) {
            if (e.type === EntityType.BOOST_PAD) {
                player.speed = Math.min(player.speed + 8, ABSOLUTE_MAX_SPEED);
                collidedWithPad = true;
                return false; 
            }
            if (e.type === EntityType.SUPER_MUSHROOM) {
                player.powerUpTimer = POWERUP_DURATION;
                return false; 
            }
            if (e.type === EntityType.SNOW_MOUND) {
                if (player.powerUpTimer > 0) return false; 
                player.speed *= 0.75;
                return false;
            }
            
            if (!collidedWithPad && player.powerUpTimer <= 0) {
                player.state = 'crashed';
                player.speed = 0;
                player.jumpHeight = 0; 
                setGameState(GameState.CRASHED);
                generateGameCommentary('crash', { distance: player.y, cause: e.type.toLowerCase() }).then(onCommentary);
            }
            return true;
        }
        return true;
      });
    }

    // 6. Visual Effects Update
    updateSnowflakes(player.state === 'skiing' || player.state === 'jumping' ? player.speed * Math.cos(player.direction * Math.PI/4) : 0, player.direction);

    // 7. Update Score
    scoreRef.current = Math.floor(player.y);
    setScore(scoreRef.current);

    timeRef.current++;

  }, [gameState, setGameState, setScore, onCommentary]);

  // --- Render Loop ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Gradient Background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#E1F5FE'); 
    gradient.addColorStop(1, '#FAFAFA'); 
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const player = playerRef.current;

    // Camera
    ctx.save();
    ctx.translate(-player.x + CANVAS_WIDTH / 2, -player.y + CANVAS_HEIGHT / 3);

    // Draw Ground Features
    groundFeaturesRef.current.forEach(f => {
        if (f.y < player.y - CANVAS_HEIGHT || f.y > player.y + CANVAS_HEIGHT) return;
        drawHighFiGroundFeature(ctx, f);
    });

    // Draw Entities
    entitiesRef.current.forEach(e => {
      if (e.y < player.y - CANVAS_HEIGHT || e.y > player.y + CANVAS_HEIGHT) return;

      switch (e.type) {
        case EntityType.TREE: drawHighFiTree(ctx, e.x, e.y); break;
        case EntityType.ROCK: drawHighFiRock(ctx, e.x, e.y); break;
        case EntityType.STUMP: drawHighFiRock(ctx, e.x, e.y); break;
        case EntityType.SNOW_BUMP: drawHighFiGroundFeature(ctx, {id:0, x: e.x, y:e.y, size: 3, variant: 'BUMP', opacity: 1}); break;
        case EntityType.SNOW_MOUND: drawHighFiSnowMound(ctx, e.x, e.y); break;
        case EntityType.BOOST_PAD: drawHighFiBoostPad(ctx, e.x, e.y); break;
        case EntityType.SUPER_MUSHROOM: drawHighFiSuperMushroom(ctx, e.x, e.y); break;
        default: ctx.fillStyle='purple'; ctx.fillRect(e.x, e.y, e.width, e.height);
      }
    });

    drawHighFiSkier(ctx, player);

    if (yetiRef.current) {
      drawHighFiYeti(ctx, yetiRef.current, timeRef.current);
    }

    ctx.restore();
    drawSnowflakes(ctx);

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

  useEffect(() => {
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