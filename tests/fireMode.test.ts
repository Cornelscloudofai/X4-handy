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
  it('ab Werk gebündelt – versetzt ist eine bewusste Wahl', () => {
    for (const w of ['plasma', 'massdriver', 'neutron', 'puls'] as WeaponId[]) expect(fireStaggered(w)).toBe(false);
  });

  it('versetzt: je Schuss ein Rohr, dafür rund 30 % weniger Geschosse als gebündelt (Speicher lädt je Einzelschuss)', () => {
    const b = shots(game('plasma'), 9);
    store.set('x4-sektorbau-feuerart', JSON.stringify({ plasma: 'versetzt' }));
    const v = shots(game('plasma'), 9);
    // gebündelt: sechs Kugeln im selben Bild; versetzt: nie mehr als eine je Bild
    expect(Math.max(...b)).toBe(6);
    expect(Math.max(...v)).toBe(1);
    const sv = v.reduce((a, c) => a + c, 0), sb = b.reduce((a, c) => a + c, 0);
    // (über wenige Runden gemessen: die erste gebündelte Salve fällt gleich zu Beginn, daher etwas unter 0,7)
    expect(sv / sb).toBeGreaterThan(0.5);
    expect(sv / sb).toBeLessThan(0.8);
  });

  it('Taste im Kampf schaltet um und merkt sich die Wahl je Waffe', () => {
    const g = game('plasma');
    expect(g.staggered).toBe(false);
    const [x, y] = g.btnFireMode;
    g.pointerDown(5, x, y); g.pointerUp(5);
    expect(g.staggered).toBe(true);
    expect(fireStaggered('plasma')).toBe(true);
    expect(fireStaggered('massdriver')).toBe(false);
  });
});

describe('Versetzt: Zielhilfe hält das Ziel der Runde', () => {
  it('ist das Ziel nach der ersten Kugel zerstört, sucht sich die nächste Kugel kein neues Ziel', () => {
    store.set('x4-sektorbau-feuerart', JSON.stringify({ massdriver: 'versetzt' }));
    const g = game('massdriver') as G & { makeEnemy(k: string, x: number, y: number): { x: number; y: number; hp: number; max: number; sh: number; vx: number; vy: number }; roundE: unknown; lock: { e: unknown } | null; px: number; py: number };
    const a = g.makeEnemy('jaeger', g.px - 30, g.py - 300), b = g.makeEnemy('jaeger', g.px + 60, g.py - 300);
    g.enemies.push(a, b);
    for (let i = 0; i < 40 && !g.roundE; i++) { a.vx = a.vy = b.vx = b.vy = 0; g.aimA = -Math.PI / 2; g.fireId = 1; g.update(DT); }
    const first = g.roundE;
    expect(first).not.toBeNull();
    // weitere Kugeln derselben Runde: Ziel bleibt dasselbe, auch wenn es inzwischen zerstört ist
    for (let i = 0; i < 6; i++) { g.fireId = 1; g.update(DT); if ((g as unknown as { gunIdx: number }).gunIdx % 6 === 0) break; expect(g.roundE).toBe(first); }
  });
});
