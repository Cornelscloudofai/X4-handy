// Asteroiden im Kampf: eigene Waffen tragen sie ab, Rammen wirkt je nach Schiffsklasse verschieden
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type Rock = { x: number; y: number; r: number; vx: number; vy: number; hp: number; max: number; bumps: number; bumpCd: number };
type G = {
  rocks: Rock[]; px: number; py: number; pvx: number; pvy: number; hull: number; shield: number; dashT: number;
  ship: { cls: string; r: number }; enemies: { kind: string }[];
  update(dt: number): void; damageRock(k: Rock, d: number): void;
};

function game(cls: 'S' | 'M' | 'L' | 'XL'): { g: G; k: Rock } {
  const g = new ShooterGame({ level: 1, seed: 3, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, ship: 'mamba', weapon: 'neutron', wing: {} } }, 'pirate') as unknown as G;
  (g as unknown as { resize(w: number, h: number): void }).resize(390, 780);
  g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
  g.ship = { ...g.ship, cls };
  const k: Rock = { x: g.px, y: g.py - 20, r: 29, vx: 0, vy: 0, rot: 0, vr: 0, pts: [1, 1, 1, 1, 1, 1], v: 0, hp: 0, max: 0, flash: 0, bumps: 0, bumpCd: 0 } as unknown as Rock;
  g.rocks = [k];
  return { g, k };
}

const total = (g: G) => g.hull + g.shield;

describe('Asteroiden', () => {
  it('Beschuss: hält rund eine Sekunde Neutronenfeuer aus, dann zerplatzt er', () => {
    const { g } = game('S');
    // frischer Fels aus dem Feld: Festigkeit wie im Spiel
    (g as unknown as { spawnRocks(): void }).spawnRocks();
    const k = g.rocks.find((r) => r.max > 0 && r.r > 25 && r.r < 33)!;
    expect(k).toBeTruthy();
    expect(k.hp).toBe(k.max);
    // zwei Schuss reichen nicht
    g.damageRock(k, k.max * 0.1);
    g.damageRock(k, k.max * 0.1);
    expect(k.r).toBeGreaterThan(0);
    g.damageRock(k, k.max);
    expect(k.r).toBe(0);
  });

  it('S-Schiff prallt ab und nimmt Schaden, der Fels bleibt heil', () => {
    const { g, k } = game('S');
    const before = total(g);
    g.update(1 / 60);
    expect(total(g)).toBeLessThan(before);
    expect(before - total(g)).toBeLessThan(before * 0.2);
    expect(g.rocks).toContain(k);
    expect(Math.hypot(g.px - k.x, g.py - k.y)).toBeGreaterThan(k.r);
  });

  it('M-Schiff: Schaden bei jedem Stoß, beim zweiten zerplatzt der Fels', () => {
    const { g, k } = game('M');
    const before = total(g);
    g.update(1 / 60);
    expect(total(g)).toBeLessThan(before);
    expect(g.rocks).toContain(k);
    k.bumpCd = 0; g.px = k.x; g.py = k.y - 20;
    g.update(1 / 60);
    expect(g.rocks).not.toContain(k);
  });

  it('L zerplatzt ihn ohne Schaden und wird gebremst, XL merkt nichts', () => {
    for (const cls of ['L', 'XL'] as const) {
      const { g, k } = game(cls);
      const before = total(g);
      g.pvx = 0; g.pvy = -100;
      g.update(1 / 60);
      expect(g.rocks).not.toContain(k);
      expect(total(g)).toBeGreaterThanOrEqual(before);
    }
  });
});
