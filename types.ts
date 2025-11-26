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
}