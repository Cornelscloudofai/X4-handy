// Nebelfeld: Zielerfassung, Radar und Richtungspfeile reichen nur so weit, wie man sieht
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type E = { kind: string; x: number; y: number; vx: number; vy: number; r: number };
type G = {
  enemies: E[]; px: number; py: number; aimA: number; section: string; fog: number; fogged: boolean; wave: number; wards: unknown[];
  lock: { e: E } | null; makeEnemy(k: string, x: number, y: number): E; update(dt: number): void; seen(x: number, y: number, r?: number): boolean;
  wx(w: unknown): number; wy(w: unknown): number;
};
const game = (seed = 4): G => {
  const g = new ShooterGame({ level: 1, seed, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, weapon: 'boson', wing: {} } } as never, 'pirate') as unknown as G;
  (g as unknown as { resize(w: number, h: number): void }).resize(390, 780);
  g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
  return g;
};

describe('Nebelfeld', () => {
  it('kommt in manchen Runden vor – dann für die ganze Runde ab Welle 1, auch zwischen den Wellen', () => {
    let any = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = game(seed);
      if (!g.fogged) continue;
      any++;
      expect(g.fog).toBe(1);
      // zwischen den Wellen und in späteren Wellen bleibt er
      g.section = 'none';
      for (let i = 0; i < 120; i++) g.update(1 / 60);
      expect(g.fog).toBeGreaterThan(0.95);
    }
    expect(any).toBeGreaterThan(1);
    expect(any).toBeLessThan(10);
  });

  it('Gegner weit draußen: nicht zu sehen, keine Zielerfassung; nah dran schon', () => {
    const g = game();
    const far = g.makeEnemy('jaeger', g.px, g.py - 800);
    g.enemies.push(far);
    g.aimA = -Math.PI / 2;
    // ohne Nebel: erfasst (Bosonenlanze reicht weit)
    for (let i = 0; i < 2; i++) { far.x = g.px; far.y = g.py - 800; far.vx = far.vy = 0; g.update(1 / 60); }
    expect(g.lock?.e).toBe(far);
    g.fogged = true; g.fog = 1;
    for (let i = 0; i < 2; i++) { far.x = g.px; far.y = g.py - 800; far.vx = far.vy = 0; g.update(1 / 60); }
    expect(g.seen(far.x, far.y, far.r)).toBe(false);
    expect(g.lock).toBeNull();
    for (let i = 0; i < 2; i++) { far.x = g.px; far.y = g.py - 300; far.vx = far.vy = 0; g.update(1 / 60); }
    expect(g.seen(far.x, far.y, far.r)).toBe(true);
    expect(g.lock?.e).toBe(far);
    // nah am Frachter sehen dessen Sensoren mit
    const w = g.wards[0];
    expect(g.seen(g.wx(w) + 200, g.wy(w))).toBe(true);
  });
});
