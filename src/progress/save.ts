export interface SaveData {
  level: number; // next level to play
  best: number;
  total: number; // seconds played (moves the exit further away)
}

const KEY = 'ballistocracy-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return { level: Math.max(1, d.level ?? 1), best: d.best ?? 1, total: d.total ?? 0 };
    }
  } catch {
    /* storage unavailable */
  }
  return { level: 1, best: 1, total: 0 };
}

export function writeSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export function resetSave(): SaveData {
  const d = { level: 1, best: loadSave().best, total: 0 };
  writeSave(d);
  return d;
}

/** store the next campaign level reached (local, host and online guests) */
export function recordProgress(level: number, total: number): void {
  const s = loadSave();
  writeSave({ level, best: Math.max(s.best, level), total });
}
