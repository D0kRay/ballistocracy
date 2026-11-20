import type Phaser from 'phaser';
import { planLevel } from './progress/difficulty';

// Dev-only helpers (window.__view(seed)) used to inspect generated levels quickly.

export function installDevtools(game: Phaser.Game): void {
  const w = window as unknown as Record<string, unknown>;
  const seeds: Record<string, number> = {};
  for (let s = 1; s < 4000 && Object.keys(seeds).length < 18; s++) {
    const p = planLevel(4, s, 0);
    const k = `${p.biome}_${p.tod}`;
    if (!seeds[k]) seeds[k] = s;
  }
  w.__seeds = seeds;
  w.__view = async (key: string | number, frac = 0.35, level = 4, custom?: unknown) => {
    const seed = typeof key === 'number' ? key : seeds[key] ?? 1;
    const cur = game.scene.getScenes(true)[0];
    cur.scene.start('Game', { mode: 'local', level, seed, total: 0, lives: 5, players: [{ pid: 0, hero: 0, owner: 'host', device: 'kbA' }], custom });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let world: any = null;
    // drive the loop by hand: the preview pane may be hidden (throttled rAF)
    let t = performance.now();
    const run = (n: number) => {
      for (let i = 0; i < n; i++) {
        t += 16.67;
        game.step(t, 16.67);
      }
    };
    for (let i = 0; i < 100 && !world; i++) {
      run(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = game.scene.getScene('Game') as any;
      if (g?.world && game.scene.isActive('Game') && (custom || level === 1 || g.world.level.plan.seed === seed)) world = g.world;
    }
    if (!world) return 'timeout';
    world.intro = null;
    const p = world.players[0];
    p.inVehicle = false;
    p.inv = 999;
    p.x = Math.floor(world.levelW * frac);
    p.y = 20;
    world.cam.x = p.x - 200;
    for (const e of world.enemies) e.cd = 99;
    run(110);
    return `${world.biome.id} ${world.level.plan.tod}`;
  };
}
