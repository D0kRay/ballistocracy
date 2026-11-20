import { IN, withAim } from '../core/input';

// On-screen controls for phones/tablets: a floating stick on the left half and four
// action buttons on the right whose labels change per screen (lobby, pause, game over).
// Multi-touch via pointer events.

export type TouchButton = 'jump' | 'fire' | 'special' | 'interact';
/** label per button; null hides it */
export type TouchLabels = Record<TouchButton, string | null>;
export const GAME_LABELS: TouchLabels = { jump: 'JUMP', fire: 'FIRE', special: 'BOOM', interact: 'GRAB' };
/** left side: analog stick (game) or a d-pad cross (menus) */
export type TouchPad = 'stick' | 'dpad';

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // primary pointer decides: touchscreen laptops with a mouse keep the desktop controls
  if (window.matchMedia) return window.matchMedia('(pointer: coarse)').matches;
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

interface Btn {
  el: HTMLElement;
  bit: number;
  key?: string; // virtual key instead of a bit (pause)
}

export class TouchControls {
  private root: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private dir = { x: 0, y: 0 };
  private held = new Map<number, Btn>(); // pointerId -> button
  private buttons: Btn[] = [];
  private tapBits = 0; // presses since the last poll (keeps very short taps)
  private lastOut = 0; // bits returned by the previous poll
  // FIRE doubles as an aim stick: drag away from where it was pressed to shoot that way
  private fireId: number | null = null;
  private fireOrigin = { x: 0, y: 0 };
  private fireAim: number | null = null;
  private fireArrow!: HTMLElement;
  private onKey: (code: string) => void;
  private byName = new Map<string, Btn>();
  private labels = '';
  visible = false;

  constructor(onVirtualKey: (code: string) => void) {
    this.onKey = onVirtualKey;
    this.root = document.createElement('div');
    this.root.id = 'touch-ui';
    this.root.innerHTML = `
      <div class="zone-left"></div>
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="dpad">
        <button data-b="up" class="d-up" aria-label="Up"></button>
        <button data-b="left" class="d-left" aria-label="Left"></button>
        <button data-b="right" class="d-right" aria-label="Right"></button>
        <button data-b="down" class="d-down" aria-label="Down"></button>
      </div>
      <div class="btns">
        <button data-b="special" class="b-special"><span class="lbl">BOOM</span></button>
        <button data-b="interact" class="b-interact"><span class="lbl">GRAB</span></button>
        <button data-b="fire" class="b-fire"><span class="lbl">FIRE</span><span class="aim-arrow"></span></button>
        <button data-b="jump" class="b-jump"><span class="lbl">JUMP</span></button>
      </div>
      <div class="sys">
        <button data-b="full" class="b-full" aria-label="Fullscreen"><svg viewBox="0 0 16 16" fill="none" stroke-width="2.2"><path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" /></svg></button>
      </div>`;
    document.body.appendChild(this.root);
    this.stickBase = this.root.querySelector('.stick-base') as HTMLElement;
    this.stickKnob = this.root.querySelector('.stick-knob') as HTMLElement;
    this.fireArrow = this.root.querySelector('.aim-arrow') as HTMLElement;

    const bitOf: Record<string, number> = { jump: IN.JUMP, fire: IN.FIRE, special: IN.SPECIAL, interact: IN.INTERACT, up: IN.UP, down: IN.DOWN, left: IN.LEFT, right: IN.RIGHT };
    this.root.querySelectorAll('button').forEach((el) => {
      const name = (el as HTMLElement).dataset.b ?? '';
      if (name === 'full') {
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          void goFullscreen();
        });
        return;
      }
      const b: Btn = { el: el as HTMLElement, bit: bitOf[name] ?? 0 };
      this.byName.set(name, b);
      this.buttons.push(b);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        // a tap after leaving fullscreen (or after a zoom) brings it back
        if (document.fullscreenEnabled && !document.fullscreenElement) void goFullscreen();
        this.held.set(e.pointerId, b);
        this.tapBits |= b.bit;
        el.classList.add('on');
        if (b.key) this.onKey(b.key);
        if (b.bit === IN.FIRE && this.fireId === null) {
          this.fireId = e.pointerId;
          this.fireOrigin = { x: e.clientX, y: e.clientY };
          this.setFireAim(null);
        }
        try {
          (el as HTMLElement).setPointerCapture(e.pointerId);
          navigator.vibrate?.(8);
        } catch {
          /* capture not available for this pointer */
        }
      });
      if (b.bit === IN.FIRE) {
        el.addEventListener('pointermove', (e) => {
          if (e.pointerId !== this.fireId) return;
          const dx = e.clientX - this.fireOrigin.x;
          const dy = e.clientY - this.fireOrigin.y;
          // small wiggles keep shooting straight ahead; a real drag aims
          if (Math.hypot(dx, dy) > 14) this.setFireAim(Math.atan2(dy, dx));
          else if (Math.hypot(dx, dy) < 6) this.setFireAim(null);
        });
      }
      const up = (e: PointerEvent) => {
        if (e.pointerId === this.fireId) {
          this.fireId = null;
          this.setFireAim(null);
        }
        this.held.delete(e.pointerId);
        if (![...this.held.values()].includes(b)) el.classList.remove('on');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    });

    const zone = this.root.querySelector('.zone-left') as HTMLElement;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.origin = { x: e.clientX, y: e.clientY };
      this.dir = { x: 0, y: 0 };
      this.placeStick(e.clientX, e.clientY, 0, 0);
      this.stickBase.classList.add('active');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const dx = e.clientX - this.origin.x;
      const dy = e.clientY - this.origin.y;
      const max = 46;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, max / len);
      this.dir = { x: dx / max, y: dy / max };
      this.placeStick(this.origin.x, this.origin.y, dx * k, dy * k);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.dir = { x: 0, y: 0 };
      this.stickBase.classList.remove('active');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // no long-press menus / text selection on the controls
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    // no fullscreen API (iPhone Safari) or already fullscreen: hide the button
    const full = this.root.querySelector('.b-full') as HTMLElement;
    const syncFull = () => (full.style.display = document.fullscreenEnabled && !document.fullscreenElement ? '' : 'none');
    document.addEventListener('fullscreenchange', syncFull);
    syncFull();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
    document.addEventListener('fullscreenchange', () => this.layout());
    blockZoom();
    this.setVisible(false);
  }

  /** relabel/hide the four buttons for the current screen */
  setLabels(l: TouchLabels): void {
    const key = JSON.stringify(l);
    if (key === this.labels) return;
    this.labels = key;
    for (const name of ['jump', 'fire', 'special', 'interact'] as const) {
      const b = this.byName.get(name);
      if (!b) continue;
      const t = l[name];
      b.el.style.display = t === null ? 'none' : '';
      (b.el.querySelector('.lbl') as HTMLElement).textContent = t ?? '';
      b.el.classList.toggle('small', !!t && t.length > 5);
      if (t === null) {
        for (const [id, hb] of this.held) if (hb === b) this.held.delete(id);
        b.el.classList.remove('on');
      }
    }
  }

  /** fullscreen button sits at the game's right edge, just below the HUD's lives panel */
  private layout(): void {
    const sys = this.root.querySelector('.sys') as HTMLElement;
    const c = document.querySelector('#game canvas');
    const r = c?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    sys.style.right = `${Math.max(10, window.innerWidth - r.right + 8)}px`;
    sys.style.top = `${Math.max(6, r.top + r.height * 0.15)}px`;
  }

  private setFireAim(a: number | null): void {
    this.fireAim = a;
    this.fireArrow.style.display = a === null ? 'none' : 'block';
    if (a !== null) this.fireArrow.style.transform = `rotate(${a}rad)`;
  }

  private placeStick(x: number, y: number, kx: number, ky: number): void {
    this.stickBase.style.left = `${x}px`;
    this.stickBase.style.top = `${y}px`;
    this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  setVisible(v: boolean, labels: TouchLabels = GAME_LABELS, pad: TouchPad = 'stick'): void {
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
    this.root.classList.toggle('pad-dpad', pad === 'dpad');
    this.stickId = null;
    this.dir = { x: 0, y: 0 };
    this.stickBase.classList.remove('active');
    if (v) requestAnimationFrame(() => this.layout());
    this.setLabels(labels);
    if (!v) {
      this.held.clear();
      this.stickId = null;
      this.dir = { x: 0, y: 0 };
      this.fireId = null;
      this.setFireAim(null);
      this.buttons.forEach((b) => b.el.classList.remove('on'));
    }
  }

  bits(): number {
    if (!this.visible) return 0;
    let b = 0;
    if (this.dir.x < -0.35) b |= IN.LEFT;
    if (this.dir.x > 0.35) b |= IN.RIGHT;
    if (this.dir.y < -0.55) b |= IN.UP;
    if (this.dir.y > 0.55) b |= IN.DOWN;
    for (const btn of this.held.values()) b |= btn.bit;
    // a tap on a bit that was already on last poll would not register as a new press:
    // hold it back one poll (output 0 now, press next poll) so fast repeated taps all count
    let defer = 0;
    for (let bit = 1; bit <= IN.START; bit <<= 1) {
      if (!(this.tapBits & bit)) continue;
      if (this.lastOut & bit && !(b & bit)) defer |= bit;
      else b |= bit;
    }
    this.tapBits = defer;
    this.lastOut = b;
    if (this.fireAim !== null) b = withAim(b, this.fireAim);
    return b;
  }
}

/** phones zoom on fast double taps and pinches even with user-scalable=no: stop that */
function blockZoom(): void {
  const editable = (t: EventTarget | null) => {
    const tag = (t as HTMLElement | null)?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1 && !editable(e.target)) e.preventDefault();
  }, { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    if (e.timeStamp - lastEnd < 450 && !editable(e.target)) e.preventDefault();
    lastEnd = e.timeStamp;
  }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
}

export async function goFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* not supported (e.g. iOS Safari): the rotate hint covers it */
  }
}
