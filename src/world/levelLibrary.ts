import { validateLevel, type LevelFile } from './levelFormat';

// Community levels live in /levels/*.json in the repo (bundled at build time).
// Levels you make in the editor are kept in this browser's localStorage until exported.

export interface LevelEntry {
  id: string;
  source: 'community' | 'mine';
  file: LevelFile;
}

const modules = import.meta.glob('/levels/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function communityLevels(): LevelEntry[] {
  const out: LevelEntry[] = [];
  for (const [path, data] of Object.entries(modules)) {
    if (!validateLevel(data).ok) continue;
    out.push({ id: path.split('/').pop()!.replace(/\.json$/, ''), source: 'community', file: data as LevelFile });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const KEY = 'ballistocracy-my-levels-v1';

function readMine(): Record<string, LevelFile> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, LevelFile>;
  } catch {
    return {};
  }
}

export function myLevels(): LevelEntry[] {
  return Object.entries(readMine())
    .filter(([, f]) => validateLevel(f).ok)
    .map(([id, file]) => ({ id, source: 'mine' as const, file }))
    .sort((a, b) => a.file.name.localeCompare(b.file.name));
}

export function saveMyLevel(id: string, file: LevelFile): boolean {
  const all = readMine();
  all[id] = file;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function deleteMyLevel(id: string): void {
  const all = readMine();
  delete all[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'level';
}
