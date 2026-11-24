// Raketen-Vierling: keine Munitionsverschwendung auf kleine Ziele, Ausweichen um Wracks, Nachschub nach jeder Welle
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';
import { makeWreck, type Wreck } from '../src/minigames/cover';

const DT = 1 / 60;
type E = { kind: string; x: number; y: number; hp: number; sh: number; max: number; shMax: number; vx: number; vy: number };
type M = { target: E | null; x: number; y: number };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; px: number; py: number; hull: number; shield: number;
  enemies: E[]; missiles: M[]; cover: Wreck[]; clusters: Map<unknown, unknown>; pTur: { ammo?: number; salvo?: number }[];
  makeEnemy(k: string, x: number, y: number): E; refillTurrets(n: number): number;
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

const game = (side = 'khaak'): G => {
  const g = new ShooterGame({ level: 1, seed: 5, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {}, ship: 'cobra', turret: 'rakete', groups: ['rakete', 'rakete'] } } as never, side as never) as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 3000 && !g.enemies.length; i++) g.update(DT);
  g.enemies.length = 0; g.clusters.clear(); g.cover.length = 0;
  return g;
};
const hold = (e: E, x: number, y: number) => { e.x = x; e.y = y; e.vx = e.vy = 0; };

describe('Raketen-Vierling', () => {
  it('ein einzelner Späher bekommt nur die Raketen, die er braucht – nicht vier Salven', () => {
    const g = game();
    const e = g.makeEnemy('ks', g.px, g.py - 700);
    g.enemies.push(e);
    // gezählt werden die Raketen auf diesen Späher (die Welle schickt nebenher eigene Gegner)
    const sent = new Set<M>();
    let most = 0;
    for (let i = 0; i < 240 && g.enemies.includes(e); i++) {
      hold(e, g.px, g.py - 700);
      g.update(DT); g.hull = g.shield = 100;
      const on = g.missiles.filter((m) => m.target === e);
      on.forEach((m) => sent.add(m));
      most = Math.max(most, on.length);
    }
    const used = sent.size;
    expect(g.enemies.includes(e)).toBe(false);
    // ein Späher auf Stufe 1 hält eine Rakete aus, nicht mehr: höchstens zwei unterwegs, höchstens zwei verbraucht
    expect(most).toBeLessThanOrEqual(2);
    expect(used).toBeLessThanOrEqual(2);
  });

  it('Rest der Salve geht auf weitere Ziele, statt zu verfallen', () => {
    const g = game();
    const es = [-300, -100, 100, 300].map((dx) => g.makeEnemy('ks', g.px + dx, g.py - 700));
    g.enemies.push(...es);
    for (let i = 0; i < 300 && es.some((e) => g.enemies.includes(e)); i++) {
      es.forEach((e, k) => hold(e, g.px - 300 + k * 200, g.py - 700));
      g.update(DT); g.hull = g.shield = 100;
    }
    expect(es.filter((e) => g.enemies.includes(e)).length).toBe(0);
  });

  it('fliegt um ein Wrack herum zum Ziel dahinter, statt hineinzufliegen', () => {
    const g = game('pirate');
    g.cover.push({ ...makeWreck(0, 0, () => 0.5), x: g.px, y: g.py - 600, size: 420, vr: 0 });
    const e = g.makeEnemy('kanone', g.px, g.py - 1250);
    g.enemies.push(e);
    const h0 = e.hp + e.sh;
    for (let i = 0; i < 60 * 10 && g.enemies.includes(e); i++) { hold(e, g.px, g.py - 1250); g.update(DT); g.hull = g.shield = 100; }
    // mehrere Raketen kommen an (hinter einem Wrack von 840 Breite)
    expect(h0 - (g.enemies.includes(e) ? e.hp + e.sh : 0)).toBeGreaterThan(h0 * 0.5);
  });

  it('Nachschub: Vorrat wird aufgefüllt, höchstens bis voll', () => {
    const g = game();
    const full = g.pTur.map((t) => t.ammo ?? 0);
    g.pTur.forEach((t) => { if (t.ammo != null) t.ammo = 0; });
    expect(g.refillTurrets(4)).toBe(full.filter((a) => a > 0).length * 16);
    g.refillTurrets(Infinity);
    expect(g.pTur.map((t) => t.ammo ?? 0)).toEqual(full);
  });
});
