// Per-player input is a bitmask so it is trivial to send over the network.
export const IN = {
  LEFT: 1,
  RIGHT: 2,
  UP: 4,
  DOWN: 8,
  JUMP: 16,
  FIRE: 32,
  SPECIAL: 64,
  INTERACT: 128,
  START: 256,
} as const;

export function has(bits: number, b: number): boolean {
  return (bits & b) !== 0;
}

export function pressed(bits: number, prev: number, b: number): boolean {
  return (bits & b) !== 0 && (prev & b) === 0;
}
