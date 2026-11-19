export const T = {
  EMPTY: 0,
  DIRT: 1,
  BRICK: 2,
  WOOD: 3,
  METAL: 4, // indestructible
  BEDROCK: 5, // indestructible floor
  LADDER: 6, // climbable, not solid
  SANDBAG: 7,
  PLATFORM: 8, // one-way wooden platform
  CRUMBLE: 9, // breaks shortly after being stood on
  STONE: 10, // natural rock, tough but destructible
} as const;

export const TILE_TYPES = 11;

/** hit points vs. explosion damage; Infinity = indestructible */
export const TILE_HP: readonly number[] = [0, 3, 6, 2, Infinity, Infinity, 1, 3, 1, 1, 9];

export function isSolid(t: number): boolean {
  return t === T.DIRT || t === T.BRICK || t === T.WOOD || t === T.METAL || t === T.BEDROCK || t === T.SANDBAG || t === T.CRUMBLE || t === T.STONE;
}

export function isOneWay(t: number): boolean {
  return t === T.PLATFORM;
}

export function isLadder(t: number): boolean {
  return t === T.LADDER;
}

export function isDestructible(t: number): boolean {
  return t !== T.EMPTY && Number.isFinite(TILE_HP[t]);
}

/** tiles that hold their neighbours up during collapse checks */
export function isAnchor(t: number): boolean {
  return t === T.METAL || t === T.BEDROCK;
}
