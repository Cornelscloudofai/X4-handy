// Bordwaffen mit eigenem Merkmal: Pulslaser Schildbrecher, Bolzenrepetierer Hüllenbrecher, Schrot Nahkampf mit Wucht
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, WEAPONS } from '../src/minigames/loadout';

type E = { kind: string; x: number; y: number; hp: number; max: number; sh: number; shMax: number; vx: number; vy: number };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; px: number; py: number; aimA: number; fireId: number | null; enemies: E[]; clusters: Map<unknown, unknown>;
  makeEnemy(k: string, x: number, y: number): E; damageEnemy(e: E, d: number, bypass?: number, toHull?: number, k?: { s: number; h: number }): void;
};
const DT = 1 / 60;
const game = (weapon: string): G => {
  const st = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => st.get(k) ?? null, setItem: (k: string, v: string) => st.set(k, v), removeItem: (k: string) => st.delete(k) };
  const g = new ShooterGame({ level: 1, seed: 3, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {}, ship: 'cobra', weapon } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 3000 && !g.enemies.length; i++) g.update(DT);
  g.enemies.length = 0; g.clusters.clear();
  return g;
};

describe('Schild- und Hüllenbrecher', () => {
  it('Pulslaser wirkt stärker auf Schilde, Bolzen stärker auf Hülle', () => {
    expect(WEAPONS.puls.shieldK!).toBeGreaterThan(1);
    expect(WEAPONS.puls.hullK!).toBeLessThan(1);
    expect(WEAPONS.bolzen.shieldK!).toBeLessThan(1);
    expect(WEAPONS.bolzen.hullK!).toBeGreaterThan(1);
  });
  it('Schadensrechnung: der Schild nimmt mit der Schildwirkung, der Rest trifft die Hülle mit der Hüllenwirkung', () => {
    const g = game('puls');
    const e = g.makeEnemy('jaeger', g.px, g.py - 400);
    e.sh = 30; e.hp = 100;
    g.enemies.push(e);
    // 50 Schaden mit Schild ×1,5, Hülle ×0,5: 20 Schaden räumen 30 Schild ab, die übrigen 30 treffen mit 15 die Hülle
    g.damageEnemy(e, 50, 0.3, 0, { s: 1.5, h: 0.5 });
    expect(e.sh).toBeCloseTo(0, 5);
    expect(e.hp).toBeCloseTo(85, 5);
  });
});

describe('Schrotbatterie', () => {
  const volley = (dist: number) => {
    const g = game('schrot');
    const e = g.makeEnemy('kanone', g.px, g.py - dist);
    e.hp = e.max = 1e6; e.sh = 0;
    g.enemies.push(e);
    for (let i = 0; i < 40; i++) { e.x = g.px; e.y = g.py - dist; e.vx = e.vy = 0; g.aimA = -Math.PI / 2; g.fireId = i < 2 ? 1 : null; g.update(DT); }
    return 1e6 - e.hp;
  };
  it('aus der Nähe verheerend, auf Distanz deutlich schwächer', () => {
    const near = volley(120), far = volley(560);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeLessThan(near * 0.75);
  });
  it('Wucht: ein getroffener Jäger wird zurückgestoßen', () => {
    const g = game('schrot');
    const e = g.makeEnemy('jaeger', g.px, g.py - 110);
    e.hp = e.max = 1e6; e.sh = 0;
    g.enemies.push(e);
    const y0 = e.y;
    let pushed = 0;
    for (let i = 0; i < 20; i++) { g.aimA = -Math.PI / 2; g.fireId = i < 2 ? 1 : null; g.update(DT); pushed = Math.min(pushed, e.vy); }
    expect(pushed).toBeLessThan(-100);
    expect(e.y).toBeLessThan(y0 + 40);
  });
});
