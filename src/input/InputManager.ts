import { IN } from '../core/input';
import { TouchControls, isTouchDevice } from './TouchControls';

export type DeviceId = string; // 'kbA' | 'kbB' | 'pad0'..'pad3'

interface KeyMap {
  [bit: number]: string[];
}

// Player A: left side of the keyboard. Player B: arrows + numpad (or J/K/L/I on laptops).
const KB_A: KeyMap = {
  [IN.LEFT]: ['KeyA'],
  [IN.RIGHT]: ['KeyD'],
  [IN.UP]: ['KeyW'],
  [IN.DOWN]: ['KeyS'],
  [IN.JUMP]: ['Space'],
  [IN.FIRE]: ['KeyF'],
  [IN.SPECIAL]: ['KeyG'],
  [IN.INTERACT]: ['KeyE'],
  [IN.START]: ['Enter'],
};
const KB_B: KeyMap = {
  [IN.LEFT]: ['ArrowLeft'],
  [IN.RIGHT]: ['ArrowRight'],
  [IN.UP]: ['ArrowUp'],
  [IN.DOWN]: ['ArrowDown'],
  [IN.JUMP]: ['Numpad0', 'KeyK'],
  [IN.FIRE]: ['Numpad1', 'KeyJ'],
  [IN.SPECIAL]: ['Numpad2', 'KeyL'],
  [IN.INTERACT]: ['Numpad3', 'KeyI'],
  [IN.START]: ['NumpadEnter'],
};

export const CONTROLS_HELP = [
  'KEYBOARD A: WASD MOVE  SPACE JUMP  F FIRE  G GRENADE  E PICK/THROW',
  'MOUSE (WITH KEYBOARD A): AIM  LEFT FIRE  RIGHT GRENADE  MIDDLE PICK/THROW',
  'KEYBOARD B: ARROWS MOVE  NUM0/K JUMP  NUM1/J FIRE  NUM2/L GRENADE  NUM3/I PICK',
  'GAMEPAD: STICK MOVE  A JUMP  X/RT FIRE  B/LT GRENADE  Y PICK/THROW',
  'TOUCH: HOLD FIRE AND DRAG TO AIM.  GRAB + BOOM TOGETHER: PAUSE',
  'HOLD TOWARD A WALL + JUMP TO CLIMB.  DOWN+JUMP DROPS THROUGH PLATFORMS',
];

const PREVENT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Numpad0', 'Tab']);

export class InputManager {
  private down = new Set<string>();
  private tapped = new Set<string>(); // keys pressed since the last poll (catches very short taps)
  private frameTapped = new Set<string>();
  private prevBits = new Map<DeviceId, number>();
  private curBits = new Map<DeviceId, number>();
  private typingTarget = false;
  /** on-screen controls, only on touch devices */
  readonly touch: TouchControls | null = null;
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    this.typingTarget = tag === 'INPUT' || tag === 'TEXTAREA';
    if (this.typingTarget) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    this.down.add(e.code);
    this.tapped.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
    this.mouseHeld = 0;
  };

  // ---- mouse (aim + buttons), only used while a game scene enables it
  /** set by the game scene: mouse aims/shoots for the keyboard player */
  mouseEnabled = false;
  /** true once the mouse was moved or clicked in-game; keyboard fire switches back */
  mouseActive = false;
  private mouseX = -1;
  private mouseY = -1;
  private mouseHeld = 0; // IN bits held via mouse buttons
  private mouseTap = 0; // pressed since last poll
  private mouseFrame = 0;
  /** counts real mouse moves; the game scene uses it to see if the cursor moved */
  mouseMoves = 0;
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (this.mouseEnabled && (Math.abs(e.clientX - this.mouseX) > 2 || Math.abs(e.clientY - this.mouseY) > 2)) {
      this.mouseActive = true;
      this.mouseMoves++;
    }
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !this.mouseEnabled) return;
    if ((e.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
    const bit = mouseBit(e.button);
    if (!bit) return;
    e.preventDefault();
    this.mouseActive = true;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.mouseHeld |= bit;
    this.mouseTap |= bit;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    this.mouseHeld &= ~mouseBit(e.button);
  };
  private onContextMenu = (e: MouseEvent) => {
    if (this.mouseEnabled) e.preventDefault();
  };

  constructor() {
    if (isTouchDevice()) {
      this.touch = new TouchControls((code) => {
        // virtual key press (pause button) seen by keyDown() for one frame
        this.tapped.add(code);
      });
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
  }

  /** mouse buttons as IN bits (held or tapped since the last poll) */
  mouseBits(): number {
    return this.mouseHeld | this.mouseFrame;
  }

  /** mouse position in view pixels (0..viewW, 0..viewH), or null if unknown */
  mouseView(viewW: number, viewH: number): { x: number; y: number } | null {
    if (this.mouseX < 0) return null;
    const c = document.querySelector('#game canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: ((this.mouseX - r.left) / r.width) * viewW, y: ((this.mouseY - r.top) / r.height) * viewH };
  }

  keyDown(code: string): boolean {
    return this.down.has(code) || this.frameTapped.has(code);
  }

  /** call once per frame */
  poll(): void {
    for (const [d, b] of this.curBits) this.prevBits.set(d, b);
    this.frameTapped = this.tapped;
    this.tapped = new Set();
    this.mouseFrame = this.mouseTap;
    this.mouseTap = 0;
    // keyboard fire hands aiming back to the keys
    if (['KeyF', 'KeyJ', 'Numpad1'].some((k) => this.frameTapped.has(k))) this.mouseActive = false;
    this.curBits.set('kbA', this.kbBits(KB_A));
    this.curBits.set('kbB', this.kbBits(KB_B));
    if (this.touch) this.curBits.set('touch', this.touch.bits());
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const p = pads[i];
      this.curBits.set(`pad${i}`, p && p.connected ? padBits(p) : 0);
    }
  }

  bits(d: DeviceId): number {
    return this.curBits.get(d) ?? 0;
  }

  justPressed(d: DeviceId, bit: number): boolean {
    return ((this.curBits.get(d) ?? 0) & bit) !== 0 && ((this.prevBits.get(d) ?? 0) & bit) === 0;
  }

  devices(): DeviceId[] {
    return [...this.curBits.keys()];
  }

  /** any device pressed this bit this frame */
  anyPressed(bit: number): DeviceId | null {
    for (const d of this.curBits.keys()) if (this.justPressed(d, bit)) return d;
    return null;
  }

  private kbBits(map: KeyMap): number {
    let b = 0;
    for (const k of Object.keys(map)) {
      const bit = Number(k);
      if (map[bit].some((c) => this.down.has(c) || this.frameTapped.has(c))) b |= bit;
    }
    return b;
  }
}

function mouseBit(button: number): number {
  return button === 0 ? IN.FIRE : button === 2 ? IN.SPECIAL : button === 1 ? IN.INTERACT : 0;
}

function padBits(p: Gamepad): number {
  const btn = (i: number) => !!p.buttons[i]?.pressed;
  const ax = p.axes[0] ?? 0;
  const ay = p.axes[1] ?? 0;
  let b = 0;
  if (ax < -0.4 || btn(14)) b |= IN.LEFT;
  if (ax > 0.4 || btn(15)) b |= IN.RIGHT;
  if (ay < -0.5 || btn(12)) b |= IN.UP;
  if (ay > 0.5 || btn(13)) b |= IN.DOWN;
  if (btn(0)) b |= IN.JUMP;
  if (btn(2) || btn(7) || btn(5)) b |= IN.FIRE;
  if (btn(1) || btn(6) || btn(4)) b |= IN.SPECIAL;
  if (btn(3)) b |= IN.INTERACT;
  if (btn(9)) b |= IN.START;
  return b;
}

let shared: InputManager | null = null;
export function getInput(): InputManager {
  if (!shared) shared = new InputManager();
  return shared;
}

export function deviceLabel(d: DeviceId): string {
  if (d === 'kbA') return 'KEYS A';
  if (d === 'kbB') return 'KEYS B';
  if (d === 'touch') return 'TOUCH';
  if (d.startsWith('pad')) return `PAD ${Number(d.slice(3)) + 1}`;
  return d.toUpperCase();
}
