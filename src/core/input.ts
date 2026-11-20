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

// Free aim (mouse): bit 9 flags it, bits 10..17 hold the angle in 256 steps.
export const AIM_FLAG = 512;
const AIM_SHIFT = 10;

export function withAim(bits: number, angle: number): number {
  const t = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.round((t / (Math.PI * 2)) * 256) & 255;
  return (bits & ~(AIM_FLAG | (255 << AIM_SHIFT))) | AIM_FLAG | (idx << AIM_SHIFT);
}

/** aim angle in radians (0 = right, +y = down) or null when the player is not free-aiming */
export function aimAngle(bits: number): number | null {
  if ((bits & AIM_FLAG) === 0) return null;
  return (((bits >> AIM_SHIFT) & 255) / 256) * Math.PI * 2;
}
