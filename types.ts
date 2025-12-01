export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  CRASHED = 'CRASHED',
  EATEN = 'EATEN',
  PAUSED = 'PAUSED',
}

export enum EntityType {
  TREE = 'TREE',
  ROCK = 'ROCK',
  STUMP = 'STUMP',
  MUSHROOM = 'MUSHROOM',
  FLAG = 'FLAG',
  YETI = 'YETI',
  SNOW_BUMP = 'SNOW_BUMP', // Decorative ground texture
  SNOW_MOUND = 'SNOW_MOUND', // Obstacle that slows you down
  BOOST_PAD = 'BOOST_PAD', // Speed boost
  SUPER_MUSHROOM = 'SUPER_MUSHROOM', // Power up
  COFFEE = 'COFFEE', // Ammo pickup (was SNOWBALL_PILE)
  COFFEE_CUP = 'COFFEE_CUP', // Projectile (was SNOWBALL)
}

export interface Point {
  x: number;
  y: number;
}

export interface Entity {
  id: number;
  type: EntityType;
  x: number;
  y: number;
  width: number;
  height: number;
  frame?: number; // For animation
  vx?: number; // Velocity X for moving entities
  vy?: number; // Velocity Y for moving entities
}

export interface Player {
  x: number;
  y: number;
  speed: number;
  direction: number; // 0 = straight down, -1 = left, 1 = right, etc.
  state: 'skiing' | 'crashed' | 'jumping' | 'eaten';
  jumpHeight: number;
  jumpVelocity: number;
  powerUpTimer: number; // Frames remaining for power-up
  coffee: number; // Ammo count
}

export interface HighScore {
  name: string;
  score: number;
}