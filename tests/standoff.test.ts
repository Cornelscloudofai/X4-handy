// Große Gegner: kein Großkampfschiff in der ersten Welle, schwere Schiffe halten Abstand am Rand ihrer Waffenreichweite
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, type ShipId } from '../src/minigames/loadout';

type E = { kind: string; x: number; y: number; r: number; parent?: E };
type G = {
  enemies: E[]; reinforce: { kinds: string[] }[]; wave: number; wards: unknown[]; px: number; py: number;
  update(dt: number): void; spawnBoss(mini?: boolean, from?: number): void; standoff(e: E): number; wx(w: unknown): number; wy(w: unknown): number;
};
const game = (side: 'xenon' | 'pirate', ship: ShipId, level = 1): G => {
  const g = new ShooterGame({ level, seed: 3, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, ship, wing: {} } } as never, side) as unknown as G;
  (g as unknown as { resize(w: number, h: number): void }).resize(390, 780);
  return g;
};

describe('Großkampfschiffe', () => {
  it('in der ersten Welle kommt keins – auch nicht mit starkem eigenem Schiff', () => {
    for (const ship of ['cobra', 'klapperschlange', 'raptor'] as ShipId[]) for (const side of ['xenon', 'pirate'] as const) {
      const g = game(side, ship);
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      expect(g.wave).toBe(0);
      expect(g.reinforce.some((r) => r.kinds[0] === 'boss'), `${ship} ${side}`).toBe(false);
      expect(g.enemies.some((e) => e.kind === 'boss')).toBe(false);
    }
  });

  it('Xenon K bleibt weit draußen (Turmreichweite), statt sich auf den Frachter zu schieben', () => {
    const g = game('xenon', 'cobra');
    g.update(1 / 60);
    g.spawnBoss(true, 0);
    const k = g.enemies.find((e) => e.kind === 'boss' && !e.parent)!;
    const w = g.wards[0];
    // taucht weit draußen auf, nicht neben dem Frachter
    expect(Math.hypot(k.x - g.wx(w), k.y - g.wy(w))).toBeGreaterThan(k.r * 2.3 + 1000);
    for (let i = 0; i < 60 * 40; i++) { g.px = g.wx(w) + 900; g.update(1 / 60); }
    const d = Math.hypot(k.x - g.wx(w), k.y - g.wy(w));
    // zwischen Rumpfende (halbe Länge ≈ 2,3 r) und Frachter bleibt deutlich Platz
    expect(d).toBeGreaterThan(k.r * 2.3 + 250);
    expect(d).toBeLessThan(g.standoff(k) * 1.6);
  });
});
