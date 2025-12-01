import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, EntityType, Entity, Player } from '../types';
import { generateGameCommentary } from '../services/geminiService';

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Speed Balancing - Scale 100 maps to 25px/frame
const SPEED_SCALE = 0.25; 

// Speed Limits (Scaled)
const GLOBAL_SPEED_LIMIT = 100 * SPEED_SCALE; // 25px/frame (Absolute Max)

// Player Stats
const PLAYER_BOOST_SPEED = 95 * SPEED_SCALE;  // 23.75 (Boost Speed)
const PLAYER_NORMAL_MAX = 80 * SPEED_SCALE;   // 20.00 (Normal Top Speed)
const PLAYER_CRUISE_SPEED = 40 * SPEED_SCALE; // 10.00 (No input cruising)
const PLAYER_ACCEL = 0.25;                    // Snappy acceleration
const TURN_SPEED = 0.2;
const DRAG = 0.1;
const JUMP_STRENGTH = 8;
const GRAVITY = 0.4;

// Yeti Stats
const YETI_BASE_SPEED = 60 * SPEED_SCALE;    // 15.00
const YETI_TOP_SPEED = 85 * SPEED_SCALE;     // 21.25 (Faster than player normal)
const YETI_ACCEL_FACTOR = 0.12;              // Slower accel than player (0.12 vs 0.25)

// Other
const PROJECTILE_SPEED = 30; // Must be faster than global limit
const YETI_MIN_SPAWN_DIST = 2500;
const NUM_SNOWFLAKES = 300;

// Power Up Config
const POWERUP_DURATION = 180; // 3 seconds at 60fps
const YETI_SCARE_DURATION = 240; // 4 seconds at 60fps
const COFFEE_PER_PICKUP = 1;

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
  currentSpeed: number; // To track acceleration
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
  const playerRef = useRef<Player>({ x: CANVAS_WIDTH / 2, y: 100, speed: 0, direction: 0, state: 'skiing', jumpHeight: 0, jumpVelocity: 0, powerUpTimer: 0, coffee: 0 });
  const entitiesRef = useRef<Entity[]>([]);
  const projectilesRef = useRef<Entity[]>([]); // New ref for coffee cups being thrown
  const groundFeaturesRef = useRef<GroundFeature[]>([]); // New ref for decorative ground items
  const scoreRef = useRef<number>(0);
  const inputRef = useRef<{ [key: string]: boolean }>({});
  const lastFireTimeRef = useRef<number>(0); // Debounce firing
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

  const drawCoffeePickup = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      // Draw a paper coffee cup
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#FFF';

      // Cup Body (White)
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 18);
      ctx.lineTo(x + 4, y + 6);
      ctx.lineTo(x + 16, y + 6);
      ctx.lineTo(x + 14, y + 18);
      ctx.closePath();
      ctx.fill();

      // Sleeve (Brown)
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(x + 5, y + 9, 10, 5);

      // Lid (White)
      ctx.fillStyle = '#EEEEEE';
      ctx.fillRect(x + 3, y + 4, 14, 2);

      // Steam
      ctx.strokeStyle = '#E0E0E0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 2); ctx.quadraticCurveTo(x + 8, y - 2, x + 6, y - 4);
      ctx.moveTo(x + 10, y + 2); ctx.quadraticCurveTo(x + 12, y - 2, x + 10, y - 4);
      ctx.stroke();

      ctx.shadowBlur = 0;
  };

  const drawCoffeeProjectile = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      // Spinning coffee cup projectile
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(timeRef.current * 0.2); // Spin animation

      // Cup
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.moveTo(-3, 6);
      ctx.lineTo(-4, -6);
      ctx.lineTo(4, -6);
      ctx.lineTo(3, 6);
      ctx.closePath();
      ctx.fill();

      // Sleeve
      ctx.fillStyle = '#795548';
      ctx.fillRect(-3.5, -2, 7, 4);
      
      // Lid
      ctx.fillStyle = '#EEE';
      ctx.fillRect(-5, -7, 10, 2);

      ctx.restore();
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
    
    // Legs - Hurried gait when retreating
    const legFreq = isRetreating ? 0.6 : 0.2;
    const legAnim = Math.sin(frame * legFreq) * 10;
    const shouldMoveLegs = mode === 'CHASE' || isRetreating;

    const lLegX = x + 5 + (shouldMoveLegs ? legAnim : 0) + wobble;
    const rLegX = x + 25 - (shouldMoveLegs ? legAnim : 0) + wobble;
    
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
    if (isRetreating) {
        // Flailing arms in panic
        armAngle = -2.5 + Math.sin(frame * 0.8) * 0.5;
    }
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
        // Panic mouth wobbling
        const h = 2 + Math.random() * 2;
        ctx.beginPath(); ctx.ellipse(x + 20 + wobble, y + 22, 3, h, 0, 0, Math.PI*2); ctx.fill();
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
        ctx.ellipse(0, 15 + jumpHeight, 10, 3, 0, 0, Math.PI * 2); // Shadow on ground
        ctx.fill();
    } else if (state === 'crashed') {
         // No specific shadow for crash pile
    } else {
         ctx.beginPath();
         ctx.ellipse(0, 15, 10, 3, 0, 0, Math.PI * 2);
         ctx.fill();
    }

    if (state === 'crashed') {
      // Popsicle Crashed - Lying down
      ctx.save();
      ctx.rotate(Math.PI / 2);
      
      // Broken Stick Legs removed

      // Central Stick
      ctx.fillStyle = '#D7CCC8'; 
      ctx.fillRect(-8, 5, 8, 12);
      
      // Body (Pink Popsicle)
      ctx.fillStyle = '#EC407A'; // Pink 400
      fillRoundRect(ctx, -5, -10, 30, 20, 10);
      
      // Melted Puddle
      ctx.fillStyle = 'rgba(236, 64, 122, 0.4)';
      ctx.beginPath();
      ctx.ellipse(10, 0, 15, 12, 0, 0, Math.PI*2);
      ctx.fill();

      // Face (Dizzy)
      ctx.fillStyle = '#FFF'; // Eyes
      ctx.beginPath(); ctx.arc(20, -4, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(20, 4, 3, 0, Math.PI*2); ctx.fill();
      
      ctx.strokeStyle = '#000'; // X eyes
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, -6); ctx.lineTo(22, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(18, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(22, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(22, 2); ctx.lineTo(18, 6); ctx.stroke();

      // Skis scattered
      ctx.restore();
      ctx.fillStyle = '#42A5F5';
      ctx.save(); ctx.rotate(0.5); ctx.fillRect(-15, -5, 25, 3); ctx.restore();
      ctx.save(); ctx.rotate(-0.8); ctx.fillRect(-10, 5, 25, 3); ctx.restore();

    } else {
      // Rotation logic
      const rotation = direction * (Math.PI / 6); 
      ctx.rotate(rotation);
      
      // --- Skis ---
      ctx.fillStyle = '#42A5F5'; // Blue Skis
      if (state === 'jumping') {
         ctx.save(); ctx.rotate(Math.PI / 8); fillRoundRect(ctx, -10, 12, 6, 30, 2); ctx.restore();
         ctx.save(); ctx.rotate(-Math.PI / 8); fillRoundRect(ctx, 4, 12, 6, 30, 2); ctx.restore();
      } else {
         // Left Ski
         fillRoundRect(ctx, -10, 12, 6, 30, 2);
         // Right Ski
         fillRoundRect(ctx, 4, 12, 6, 30, 2);
         // Ski Tips (Darker)
         ctx.fillStyle = '#1E88E5';
         ctx.fillRect(-10, 36, 6, 6);
         ctx.fillRect(4, 36, 6, 6);
      }
      
      // --- Central Popsicle Stick ---
      ctx.fillStyle = '#D7CCC8'; // Same wood color
      ctx.fillRect(-2, 10, 4, 12); // Centered, protruding from bottom

      // --- Boots Removed ---

      // --- Body (The Popsicle) ---
      // Main Body Color (Berry Pink)
      const bodyPink = '#EC407A';
      
      // Draw Body (Pill Shape)
      ctx.fillStyle = bodyPink;
      fillRoundRect(ctx, -10, -15, 20, 30, 10);
      
      // Shading/Highlight on Head
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(-4, -10, 3, 6, -0.5, 0, Math.PI*2);
      ctx.fill();

      // --- Arms (Stick Arms) ---
      ctx.strokeStyle = '#D7CCC8'; // Wood color for arms
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Arms coming from mid-body
      ctx.moveTo(-9, 0); ctx.lineTo(-14, 6); // Left arm
      ctx.moveTo(9, 0); ctx.lineTo(14, 6);   // Right arm
      ctx.stroke();
      
      // Gloves (Lime Green)
      ctx.fillStyle = '#76FF03'; 
      ctx.beginPath(); ctx.arc(-14, 6, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, 6, 4, 0, Math.PI*2); ctx.fill();
      
      // --- Poles ---
      ctx.fillStyle = '#90A4AE';
      ctx.fillRect(-16, -2, 2, 28); 
      ctx.fillRect(16, -2, 2, 28);
      // Pole baskets
      ctx.fillStyle = '#37474F';
      ctx.beginPath(); ctx.arc(-15, 24, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(17, 24, 3, 0, Math.PI*2); ctx.fill();

      // --- Face ---
      // Goggles
      ctx.fillStyle = '#3949AB'; // Frame
      fillRoundRect(ctx, -9, -12, 18, 10, 3);
      
      // Lens (Gradient)
      const goggleGrad = ctx.createLinearGradient(-8, -12, 8, -2);
      goggleGrad.addColorStop(0, '#00E5FF'); // Cyan
      goggleGrad.addColorStop(1, '#00B0FF'); // Blue
      ctx.fillStyle = goggleGrad;
      fillRoundRect(ctx, -7, -10, 14, 6, 2);
      
      // Reflection
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(-4, -10); ctx.lineTo(0, -10); ctx.lineTo(-2, -4); ctx.lineTo(-6, -4);
      ctx.fill();

      // Mouth (Smile)
      ctx.strokeStyle = '#880E4F';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -1, 3, 0.2, Math.PI - 0.2);
      ctx.stroke();
      
      // Eyebrows (Floating above goggles for expression)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-3, -15); ctx.stroke(); // Left
      ctx.beginPath(); ctx.moveTo(3, -15); ctx.lineTo(6, -14); ctx.stroke();  // Right
    }
    ctx.restore();
  };

  // --- Logic Helpers ---
  const spawnEntities = (startY: number, endY: number) => {
    const playerX = playerRef.current.x;
    
    // Calculate Difficulty
    const difficultyTier = Math.floor(startY / 2000); // 0, 1, 2, 3...
    
    // Spawn Gameplay Entities
    for (let y = startY; y < endY; y += 30) {
      
      // Obstacle Chance: Increases with difficulty
      const baseChance = 0.15;
      const addedChance = Math.min(difficultyTier * 0.05, 0.6); // Cap density increase
      const obstacleChance = baseChance + addedChance;

      // Power Up Chance: REDUCED for Coffee
      const basePowerUpChance = 0.03;
      const addedPowerUpChance = Math.min(difficultyTier * 0.01, 0.10);
      const powerUpChance = basePowerUpChance + addedPowerUpChance;

      const spawnX = () => playerX + (Math.random() * CANVAS_WIDTH * 3) - (CANVAS_WIDTH * 1.5);

      if (Math.random() < obstacleChance) { 
        const typeRoll = Math.random();
        let type = EntityType.TREE;
        
        // Snow Mounds become much more frequent as difficulty increases
        // Was 0.10 + 0.05*tier. Now 0.10 + 0.15*tier, capped at 80% of obstacles.
        const moundChance = 0.10 + Math.min(difficultyTier * 0.15, 0.80);
        
        if (typeRoll < moundChance) type = EntityType.SNOW_MOUND;
        else if (typeRoll > 0.8) type = EntityType.ROCK;
        else if (typeRoll > 0.95) type = EntityType.STUMP;

        entitiesRef.current.push({
          id: Math.random(),
          type,
          x: spawnX(),
          y: y + Math.random() * 50,
          width: 24, 
          height: 24
        });
      }

      // Boost Pad
      if (Math.random() < powerUpChance * 2) {
        entitiesRef.current.push({
            id: Math.random(),
            type: EntityType.BOOST_PAD,
            x: spawnX(),
            y: y + Math.random() * 50,
            width: 20, 
            height: 30
        });
      }

      // Super Mushroom
      if (Math.random() < powerUpChance) { 
        entitiesRef.current.push({
            id: Math.random(),
            type: EntityType.SUPER_MUSHROOM,
            x: spawnX(),
            y: y + Math.random() * 50,
            width: 20,
            height: 20
        });
      }

      // Ammo (Coffee) - Reduced spawn rate (0.5x chance instead of 2x)
      if (Math.random() < powerUpChance * 0.5) { 
          entitiesRef.current.push({
              id: Math.random(),
              type: EntityType.COFFEE,
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
    playerRef.current = { x: CANVAS_WIDTH / 2, y: 100, speed: 0, direction: 0, state: 'skiing', jumpHeight: 0, jumpVelocity: 0, powerUpTimer: 0, coffee: 0 };
    entitiesRef.current = [];
    projectilesRef.current = [];
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
        // Accelerate if below normal max. 
        // If we are boosted (speed > NORMAL_MAX), holding down won't accelerate us further,
        // but it will maintain speed/prevent drag decay faster than just cruising.
        if (player.speed < PLAYER_NORMAL_MAX) {
            player.speed = Math.min(player.speed + PLAYER_ACCEL, PLAYER_NORMAL_MAX);
        } else {
             // Slowly decay boost even if holding down, so boost isn't infinite
             player.speed -= 0.02;
        }
      } else {
        const slopeFactor = 1 - (Math.abs(player.direction) / 2.5);
        // Base cruising speed (PLAYER_CRUISE_SPEED instead of magic '8')
        const targetSpeed = PLAYER_CRUISE_SPEED * slopeFactor;
        
        if (player.speed > targetSpeed) {
            player.speed = Math.max(targetSpeed, player.speed - DRAG);
        } else {
            // Passive gravity acceleration
            player.speed += 0.05 * slopeFactor; 
        }
      }

      // Cap speed to Global Limit
      if (player.speed > GLOBAL_SPEED_LIMIT) player.speed = GLOBAL_SPEED_LIMIT;

      if (inputRef.current['ArrowUp'] && player.state === 'skiing') {
        player.state = 'jumping';
        player.jumpVelocity = JUMP_STRENGTH;
        // Small speed boost on jump, capped at Global
        player.speed = Math.min(player.speed + 0.5, GLOBAL_SPEED_LIMIT);
      }

      // Coffee firing (Space bar)
      if (inputRef.current['Space'] && player.coffee > 0 && timeRef.current - lastFireTimeRef.current > 20) {
          player.coffee--;
          lastFireTimeRef.current = timeRef.current;
          
          let vx = 0;
          let vy = -PROJECTILE_SPEED; // Default up/backwards

          // Initial aim logic (still useful for initial trajectory)
          if (yetiRef.current) {
              const dx = yetiRef.current.x - player.x;
              const dy = yetiRef.current.y - player.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 0) {
                  vx = (dx / dist) * PROJECTILE_SPEED;
                  vy = (dy / dist) * PROJECTILE_SPEED;
              }
          }

          projectilesRef.current.push({
              id: Math.random(),
              type: EntityType.COFFEE_CUP,
              x: player.x,
              y: player.y - 20,
              width: 10,
              height: 10,
              vx,
              vy
          });
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
    
    // Projectiles: Update & Homing Logic
    projectilesRef.current.forEach(p => {
        // Auto-aim homing towards Yeti
        if (yetiRef.current) {
            const yetiCenterX = yetiRef.current.x + 20;
            const yetiCenterY = yetiRef.current.y + 25;
            const dx = yetiCenterX - p.x;
            const dy = yetiCenterY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Only adjust if projectile is active and moving
            if (dist > 0) {
                 const speed = PROJECTILE_SPEED; // Maintain projectile speed
                 // Steering: Directly update velocity vector to point at Yeti
                 p.vx = (dx / dist) * speed;
                 p.vy = (dy / dist) * speed;
            }
        }

        if (p.vx !== undefined) p.x += p.vx;
        if (p.vy !== undefined) p.y += p.vy;
    });
    
    projectilesRef.current = projectilesRef.current.filter(p => {
        // Keep projectile alive longer if tracking yeti
        const boundMargin = yetiRef.current ? 1000 : 500;
        return p.x > player.x - boundMargin && p.x < player.x + boundMargin && 
               p.y > player.y - boundMargin && p.y < player.y + boundMargin;
    });

    const lastEntityY = entitiesRef.current.length > 0 ? entitiesRef.current[entitiesRef.current.length - 1].y : 0;
    if (lastEntityY < bottomEdge + 500) {
      spawnEntities(Math.max(lastEntityY, bottomEdge), bottomEdge + 500);
    }

    // 4. Yeti Logic
    if (yetiRef.current) {
        const dx = player.x - yetiRef.current.x;
        const dy = player.y - yetiRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 1500) {
            yetiRef.current = null;
        }
    }

    // Yeti Spawn Logic
    if (player.y > YETI_MIN_SPAWN_DIST && !yetiRef.current && (player.state === 'skiing' || player.state === 'jumping')) {
        if (Math.random() < 0.01) {
            yetiRef.current = {
                id: -1,
                type: EntityType.YETI,
                x: player.x - 300, 
                y: player.y - 400,
                width: 40,
                height: 50,
                mode: 'CHASE',
                modeTimer: 0,
                currentSpeed: YETI_BASE_SPEED
            };
            onCommentary("RROOOAAAARRRR! The Yeti has spotted you!");
        }
    }

    if (yetiRef.current) {
      const yeti = yetiRef.current;
      const dx = player.x - yeti.x;
      const dy = player.y - yeti.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Projectile Collision with Yeti
      projectilesRef.current.forEach((proj, index) => {
          const pdx = yeti.x + 20 - proj.x;
          const pdy = yeti.y + 25 - proj.y;
          if (Math.sqrt(pdx*pdx + pdy*pdy) < 30) {
              // HIT!
              projectilesRef.current.splice(index, 1);
              yeti.mode = 'RETREAT';
              yeti.modeTimer = YETI_SCARE_DURATION;
              onCommentary("CAFFEINE OVERLOAD! Yeti is retreating!");
          }
      });

      if (player.powerUpTimer > 0 && yeti.mode !== 'RETREAT') {
          yeti.mode = 'RETREAT';
          yeti.modeTimer = YETI_SCARE_DURATION;
          onCommentary("The Yeti is scared of your size!");
      }

      // Yeti Hit Check (Collision with Player)
      const hitRadius = yeti.mode === 'LUNGE' ? 30 : 10; 

      if (dist < hitRadius && player.state !== 'eaten' && player.powerUpTimer <= 0) {
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
                    yeti.modeTimer = 30; // 0.5s warning
                }
            } else if (yeti.mode === 'PRE_LUNGE') {
                yeti.mode = 'LUNGE';
                yeti.modeTimer = 40; // Short, fast burst
                onCommentary("LUNGE!"); 
            } else if (yeti.mode === 'LUNGE') {
                yeti.mode = 'CHASE';
                yeti.modeTimer = 120; // Cooldown
            } else if (yeti.mode === 'RETREAT') {
                yeti.mode = 'CHASE';
            }
        }

        const difficultyMultiplier = 1 + Math.floor(player.y / 3000) * 0.03;
        let targetSpeed = 0;

        if (yeti.mode === 'CHASE') {
            const urgency = Math.min(dist / 400, 1); 
            // Calculate Desired Speed based on distance urgency
            // Yeti Base is 60 (15), Max is 85 (21.25)
            // If urgency is 1 (close), he goes max.
            let desiredMax = (YETI_BASE_SPEED + (YETI_TOP_SPEED - YETI_BASE_SPEED) * urgency) * difficultyMultiplier;
            if (desiredMax > YETI_TOP_SPEED) desiredMax = YETI_TOP_SPEED;
            
            targetSpeed = desiredMax;
            yeti.x += Math.sin(timeRef.current * 0.05) * 2; 

        } else if (yeti.mode === 'PRE_LUNGE') {
            targetSpeed = YETI_BASE_SPEED * 0.5; // Slow down before lunge (coil up)
            yeti.x += (Math.random() - 0.5) * 6; // Shake
        } else if (yeti.mode === 'LUNGE') {
            targetSpeed = YETI_TOP_SPEED * 1.5; // SPEED BURST during lunge (127.5 scaled -> ~32px/frame)
        } else if (yeti.mode === 'RETREAT') {
            targetSpeed = -6; 
        }

        // Apply Acceleration Logic for Yeti
        let accel = YETI_ACCEL_FACTOR * 4;
        if (yeti.mode === 'LUNGE') accel = 1.0; // Instant acceleration for dash

        if (yeti.currentSpeed < targetSpeed) {
            yeti.currentSpeed += accel;
        } else {
            yeti.currentSpeed -= YETI_ACCEL_FACTOR * 2; 
        }

        // Movement
        if (yeti.mode === 'RETREAT') {
            yeti.y += yeti.currentSpeed;
        } else {
             // Standard movement towards player
             if (dist > 5) { // Stop jittering when on top
                yeti.x += (dx / dist) * yeti.currentSpeed;
                yeti.y += (dy / dist) * yeti.currentSpeed;
             }
        }
      }
    }

    // 5. Collision
    if (player.state === 'skiing' || player.state === 'jumping') {
      let collidedWithPad = false;

      entitiesRef.current = entitiesRef.current.filter(e => {
        if (checkCollision(player, e)) {
            if (e.type === EntityType.BOOST_PAD) {
                // Boost pushes player to BOOST Speed (95 on scale)
                player.speed = PLAYER_BOOST_SPEED;
                collidedWithPad = true;
                return false; 
            }
            if (e.type === EntityType.SUPER_MUSHROOM) {
                player.powerUpTimer = POWERUP_DURATION;
                return false; 
            }
            if (e.type === EntityType.COFFEE) {
                player.coffee += COFFEE_PER_PICKUP;
                return false;
            }
            if (e.type === EntityType.SNOW_MOUND) {
                if (player.powerUpTimer > 0) return false; 
                player.speed *= 0.65; // Significant slow down
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
        case EntityType.COFFEE: drawCoffeePickup(ctx, e.x, e.y); break;
        default: ctx.fillStyle='purple'; ctx.fillRect(e.x, e.y, e.width, e.height);
      }
    });

    // Draw Projectiles
    projectilesRef.current.forEach(p => {
        drawCoffeeProjectile(ctx, p.x, p.y);
    });

    drawHighFiSkier(ctx, player);

    if (yetiRef.current) {
      drawHighFiYeti(ctx, yetiRef.current, timeRef.current);
    }

    ctx.restore();
    drawSnowflakes(ctx);

    // --- UI Overlay ---
    // Ammo Count
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.roundRect(CANVAS_WIDTH - 130, 20, 110, 40, 5);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 16px Courier New';
    ctx.fillText(`COFFEE: ${player.coffee}`, CANVAS_WIDTH - 120, 45);
    ctx.restore();

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