// Global tuning constants. Internal resolution is tiny on purpose:
// the canvas is upscaled by CSS so everything renders as chunky 80s pixels.
export const VIEW_W = 384;
export const VIEW_H = 216;
export const TILE = 16;
export const LEVEL_H_TILES = 18;

export const DT = 1 / 60;
export const GRAVITY = 950;
export const MAX_FALL = 420;
export const RUN_SPEED = 100;
export const JUMP_VEL = 315;
export const CLIMB_SPEED = 85;
export const WALL_SLIDE = 45;

export const PLAYER_W = 10;
export const PLAYER_H = 14;
export const PLAYER_HP = 3;
export const START_LIVES = 5;
export const RESPAWN_TIME = 2.5;

export const CAMERA_MARGIN = 20;
export const ACTIVE_RANGE = VIEW_W * 1.25; // enemies further than this from the camera sleep

export const BOSS_EVERY = 5;
export const NET_SNAPSHOT_EVERY = 3; // fixed steps between snapshots (60/3 = 20 Hz)
export const PEER_PREFIX = 'ballistocracy-v1-';
