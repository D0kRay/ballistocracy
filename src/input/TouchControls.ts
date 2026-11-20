import { IN } from '../core/input';

// On-screen controls for phones/tablets: a floating stick on the left half,
// action buttons on the right, plus START and PAUSE. Multi-touch via pointer events.

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
  private onKey: (code: string) => void;
  visible = false;

  constructor(onVirtualKey: (code: string) => void) {
    this.onKey = onVirtualKey;
    this.root = document.createElement('div');
    this.root.id = 'touch-ui';
    this.root.innerHTML = `
      <div class="zone-left"></div>
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="btns">
        <button data-b="special" class="b-special">BOOM</button>
        <button data-b="interact" class="b-interact">GRAB</button>
        <button data-b="fire" class="b-fire">FIRE</button>
        <button data-b="jump" class="b-jump">JUMP</button>
      </div>
      <button data-b="start" class="b-start">START</button>
      <div class="sys">
        <button data-b="pause" class="b-pause" aria-label="Pause"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" /><rect x="9.5" y="2" width="3.5" height="12" /></svg></button>
        <button data-b="full" class="b-full" aria-label="Fullscreen"><svg viewBox="0 0 16 16" fill="none" stroke-width="2.2"><path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" /></svg></button>
      </div>`;
    document.body.appendChild(this.root);
    this.stickBase = this.root.querySelector('.stick-base') as HTMLElement;
    this.stickKnob = this.root.querySelector('.stick-knob') as HTMLElement;

    const bitOf: Record<string, number> = { jump: IN.JUMP, fire: IN.FIRE, special: IN.SPECIAL, interact: IN.INTERACT, start: IN.START };
    this.root.querySelectorAll('button').forEach((el) => {
      const name = (el as HTMLElement).dataset.b ?? '';
      if (name === 'full') {
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          void goFullscreen();
        });
        return;
      }
      const b: Btn = { el: el as HTMLElement, bit: bitOf[name] ?? 0, key: name === 'pause' ? 'Escape' : undefined };
      this.buttons.push(b);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.held.set(e.pointerId, b);
        this.tapBits |= b.bit;
        el.classList.add('on');
        if (b.key) this.onKey(b.key);
        try {
          (el as HTMLElement).setPointerCapture(e.pointerId);
          navigator.vibrate?.(8);
        } catch {
          /* capture not available for this pointer */
        }
      });
      const up = (e: PointerEvent) => {
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
    this.setVisible(false);
  }

  /** pause/fullscreen sit at the game's right edge, just below the HUD's lives panel */
  private layout(): void {
    const sys = this.root.querySelector('.sys') as HTMLElement;
    const c = document.querySelector('#game canvas');
    const r = c?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    sys.style.right = `${Math.max(10, window.innerWidth - r.right + 8)}px`;
    sys.style.top = `${Math.max(6, r.top + r.height * 0.15)}px`;
  }

  private placeStick(x: number, y: number, kx: number, ky: number): void {
    this.stickBase.style.left = `${x}px`;
    this.stickBase.style.top = `${y}px`;
    this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  setVisible(v: boolean, showStart = false): void {
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
    if (v) requestAnimationFrame(() => this.layout());
    (this.root.querySelector('.b-start') as HTMLElement).style.display = showStart ? 'block' : 'none';
    if (!v) {
      this.held.clear();
      this.stickId = null;
      this.dir = { x: 0, y: 0 };
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
    b |= this.tapBits;
    this.tapBits = 0;
    return b;
  }
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
