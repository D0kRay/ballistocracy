import { IN } from '../core/input';

// Keyboard bindings for the two keyboard players. Each action has up to two keys.
// Players change them in the CONTROLS screen; they are kept in localStorage.

export type KbId = 'kbA' | 'kbB';

export interface KeyMap {
  [bit: number]: string[];
}

export interface Action {
  bit: number;
  label: string;
}

export const ACTIONS: readonly Action[] = [
  { bit: IN.LEFT, label: 'LEFT' },
  { bit: IN.RIGHT, label: 'RIGHT' },
  { bit: IN.UP, label: 'UP / AIM UP' },
  { bit: IN.DOWN, label: 'DOWN / CROUCH' },
  { bit: IN.JUMP, label: 'JUMP / CLIMB' },
  { bit: IN.FIRE, label: 'FIRE' },
  { bit: IN.SPECIAL, label: 'GRENADE / C4' },
  { bit: IN.INTERACT, label: 'PICK UP / THROW' },
  { bit: IN.START, label: 'START (LOBBY)' },
];

// Player A: left side of the keyboard. Player B: arrows + numpad (or J/K/L/I on laptops).
export const DEFAULT_KEYS: Record<KbId, KeyMap> = {
  kbA: {
    [IN.LEFT]: ['KeyA'],
    [IN.RIGHT]: ['KeyD'],
    [IN.UP]: ['KeyW'],
    [IN.DOWN]: ['KeyS'],
    [IN.JUMP]: ['Space'],
    [IN.FIRE]: ['KeyF'],
    [IN.SPECIAL]: ['KeyG'],
    [IN.INTERACT]: ['KeyE'],
    [IN.START]: ['Enter'],
  },
  kbB: {
    [IN.LEFT]: ['ArrowLeft'],
    [IN.RIGHT]: ['ArrowRight'],
    [IN.UP]: ['ArrowUp'],
    [IN.DOWN]: ['ArrowDown'],
    [IN.JUMP]: ['Numpad0', 'KeyK'],
    [IN.FIRE]: ['Numpad1', 'KeyJ'],
    [IN.SPECIAL]: ['Numpad2', 'KeyL'],
    [IN.INTERACT]: ['Numpad3', 'KeyI'],
    [IN.START]: ['NumpadEnter'],
  },
};

/** keys the game itself uses (pause, quit, music, mute): they can not be bound */
export const RESERVED_KEYS = new Set(['Escape', 'KeyP', 'KeyM', 'KeyN', 'Tab', 'F5', 'F11', 'F12']);

export const MAX_KEYS_PER_ACTION = 2;
const STORE = 'ballistocracy-keys-v1';

function clone(m: KeyMap): KeyMap {
  const out: KeyMap = {};
  for (const a of ACTIONS) out[a.bit] = [...(m[a.bit] ?? [])];
  return out;
}

function load(): Record<KbId, KeyMap> {
  const maps = { kbA: clone(DEFAULT_KEYS.kbA), kbB: clone(DEFAULT_KEYS.kbB) };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE) : null;
    if (!raw) return maps;
    const saved = JSON.parse(raw) as Partial<Record<KbId, Record<string, unknown>>>;
    for (const id of ['kbA', 'kbB'] as const) {
      const s = saved[id];
      if (!s) continue;
      for (const a of ACTIONS) {
        const v = s[a.bit];
        if (Array.isArray(v)) maps[id][a.bit] = v.filter((k): k is string => typeof k === 'string' && !RESERVED_KEYS.has(k)).slice(0, MAX_KEYS_PER_ACTION);
      }
    }
  } catch {
    /* broken or unavailable storage: defaults */
  }
  return maps;
}

let maps: Record<KbId, KeyMap> = load();
let version = 0;

function persist(): void {
  version++;
  try {
    localStorage.setItem(STORE, JSON.stringify(maps));
  } catch {
    /* ignore */
  }
}

export function keyMap(id: KbId): KeyMap {
  return maps[id];
}

/** bumps whenever a binding changes (lets callers cache derived data) */
export function bindingsVersion(): number {
  return version;
}

/** every key code currently bound to anything */
export function allBoundKeys(): Set<string> {
  const s = new Set<string>();
  for (const id of ['kbA', 'kbB'] as const) for (const a of ACTIONS) for (const k of maps[id][a.bit] ?? []) s.add(k);
  return s;
}

export interface BindResult {
  ok: boolean;
  /** human readable note for the UI, e.g. what the key was taken from */
  note: string;
}

/**
 * Bind `code` to `bit` of player `id` in slot `slot` (0 = main key, 1 = second key).
 * A key can only do one thing: it is removed from wherever else it was bound.
 */
export function bindKey(id: KbId, bit: number, slot: number, code: string): BindResult {
  if (RESERVED_KEYS.has(code)) return { ok: false, note: `${keyLabel(code)} IS RESERVED` };
  let note = '';
  for (const other of ['kbA', 'kbB'] as const) {
    for (const a of ACTIONS) {
      const list = maps[other][a.bit];
      const i = list.indexOf(code);
      if (i < 0 || (other === id && a.bit === bit && i === slot)) continue;
      list.splice(i, 1);
      if (!(other === id && a.bit === bit)) note = `${keyLabel(code)} REMOVED FROM ${other === 'kbA' ? 'A' : 'B'} ${a.label}`;
    }
  }
  const list = maps[id][bit];
  if (slot < list.length) list[slot] = code;
  else list.push(code);
  maps[id][bit] = list.slice(0, MAX_KEYS_PER_ACTION);
  persist();
  return { ok: true, note };
}

export function clearKey(id: KbId, bit: number, slot: number): void {
  const list = maps[id][bit];
  if (slot < list.length) list.splice(slot, 1);
  persist();
}

export function resetKeys(id?: KbId): void {
  if (!id || id === 'kbA') maps.kbA = clone(DEFAULT_KEYS.kbA);
  if (!id || id === 'kbB') maps.kbB = clone(DEFAULT_KEYS.kbB);
  persist();
}

/** for tests */
export function reloadKeys(): void {
  maps = load();
  version++;
}

const NAMED: Record<string, string> = {
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Backspace: 'BKSP', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', MetaLeft: 'L-META', MetaRight: 'R-META',
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', CapsLock: 'CAPS', Delete: 'DEL', Insert: 'INS',
  Home: 'HOME', End: 'END', PageUp: 'PG UP', PageDown: 'PG DN', Minus: '-', Equal: '=', BracketLeft: '(', BracketRight: ')',
  Semicolon: 'SEMICOLON', Quote: "'", Backquote: 'BACKQUOTE', Backslash: 'BACKSLASH', Comma: ',', Period: '.', Slash: '/',
  IntlBackslash: '<>', NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
  ContextMenu: 'MENU',
};

/** short, font-safe name for a KeyboardEvent.code */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM' + code.slice(6);
  return code.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 9) || '?';
}

/** "W/UP" style label of all keys of one action */
export function actionKeys(id: KbId, bit: number): string {
  const l = maps[id][bit] ?? [];
  return l.length ? l.map(keyLabel).join('/') : '---';
}
