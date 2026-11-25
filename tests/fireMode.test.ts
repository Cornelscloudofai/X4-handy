// Feuerart der Bordkanonen: gebündelt (alle Rohre zugleich) oder versetzt (Rohr für Rohr), im Kampf umschaltbar
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, fireStaggered, type WeaponId } from '../src/minigames/loadout';

const DT = 1 / 60;
type G = {
  update(dt: number): void; resize(w: number, h: number): void; aimA: number; fireId: number | null; enemies: unknown[]; clusters: Map<unknown, unknown>;
  bullets: { from: string; src?: string }[]; pointerDown(id: number, x: number, y: number): void; pointerUp(id: number): void; btnFireMode: [number, number, number]; staggered: boolean;
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });
const game = (weapon: WeaponId): G => {
  const g = new ShooterGame({ level: 1, seed: 3, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {}, ship: 'dragon', weapon } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  g.update(DT);
  g.enemies.length = 0; g.clusters.clear();
  return g;
};
/** Schüsse je Bild während t Sekunden Dauerfeuer */
const shots = (g: G, t: number): number[] => {
  const per: number[] = [];
  for (let i = 0; i < Math.round(t / DT); i++) {
    const n0 = g.bullets.filter((b) => b.src === 'gun').length;
    g.aimA = -Math.PI / 2; g.fireId = 1; g.update(DT);
    per.push(Math.max(0, g.bullets.filter((b) => b.src === 'gun').length - n0));
  }
  return per;
};

describe('Feuerart der Bordkanonen', () => {
  it('ab Werk: langsame Waffen versetzt, schnelle gebündelt', () => {
    expect(fireStaggered('plasma')).toBe(true);
    expect(fireStaggered('massdriver')).toBe(true);
    expect(fireStaggered('neutron')).toBe(false);
    expect(fireStaggered('puls')).toBe(false);
  });

  it('versetzt: je Schuss ein Rohr, gleich viele Geschosse wie gebündelt', () => {
    const v = shots(game('plasma'), 6);
    store.set('x4-sektorbau-feuerart', JSON.stringify({ plasma: 'gebuendelt' }));
    const b = shots(game('plasma'), 6);
    // gebündelt: sechs Kugeln im selben Bild; versetzt: nie mehr als eine je Bild
    expect(Math.max(...b)).toBe(6);
    expect(Math.max(...v)).toBe(1);
    const sv = v.reduce((a, c) => a + c, 0), sb = b.reduce((a, c) => a + c, 0);
    expect(Math.abs(sv - sb)).toBeLessThanOrEqual(6);
  });

  it('Taste im Kampf schaltet um und merkt sich die Wahl je Waffe', () => {
    const g = game('plasma');
    expect(g.staggered).toBe(true);
    const [x, y] = g.btnFireMode;
    g.pointerDown(5, x, y); g.pointerUp(5);
    expect(g.staggered).toBe(false);
    expect(fireStaggered('plasma')).toBe(false);
    expect(fireStaggered('massdriver')).toBe(true);
  });
});
