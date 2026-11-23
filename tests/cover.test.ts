// Umgebung: Wrackfeld als Deckung für alle Seiten, Gravitationsanomalie mit Sog und Schaden im Kern
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';
import { anomalyPull, coverHit, makeWreck, pushOut, type Wreck } from '../src/minigames/cover';

const DT = 1 / 60;
type E = { kind: string; x: number; y: number; hp: number; sh: number; max: number; shMax: number; r: number };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; px: number; py: number; pvx: number; pvy: number; hull: number; shield: number; aimA: number;
  cover: Wreck[]; anomaly: { x: number; y: number; R: number; core: number; seed: number; fade: number } | null; enemies: E[]; bullets: { from: string; x: number; y: number }[];
  sectionPlan: string[]; wave: number; fX: number; fY: number; wards: unknown[]; wx(w: unknown): number; makeEnemy(k: string, x: number, y: number): E;
  fireRail(x: number, y: number, a: number, dmg: number, range: number, color: string): void; enemyShot(e: E, a: number, v: number, dmg: number, color: string): void;
  spawnCover(): void; spawnAnomaly(): void; clusters: Map<unknown, unknown>;
};
const wreckAtPos = (x: number, y: number): Wreck => ({ ...makeWreck(0, 0, () => 0.5), x, y, size: 200 });
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

const game = (env = ''): G => {
  if (env) store.set('x4-sektorbau-umgebung-test', env);
  const g = new ShooterGame({ level: 2, seed: 7, mutator: null, mode: 'normal', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 3000 && !g.enemies.length; i++) g.update(DT);
  g.enemies.length = 0;
  g.clusters.clear();
  return g;
};

describe('Wrack als Deckung (Formel)', () => {
  it('eine Strecke durch das Wrack wird aufgehalten, daneben nicht', () => {
    const w = wreckAtPos(0, 0);
    expect(coverHit([w], -300, 0, 300, 0)).not.toBeNull();
    expect(coverHit([w], -300, 0, 300, 0)!).toBeLessThan(0.5);
    expect(coverHit([w], -300, 200, 300, 200)).toBeNull();
  });
  it('ein Schiff im Wrack wird hinausgeschoben und verliert die Fahrt in die Wand', () => {
    const w = wreckAtPos(0, 0);
    const p = pushOut([w], 30, 0, -100, 0, 10)!;
    expect(p).not.toBeNull();
    expect(p.x).toBeGreaterThan(30);
    expect(p.vx).toBeGreaterThanOrEqual(0);
  });
  it('Anomalie zieht zum Kern, außerhalb ihres Umkreises nicht', () => {
    const a = { x: 0, y: 0, R: 900, core: 55, seed: 0 };
    const [ax] = anomalyPull(a, 400, 0);
    expect(ax).toBeLessThan(0);
    expect(anomalyPull(a, 1000, 0)).toEqual([0, 0]);
  });
});

describe('Wrackfeld im Kampf', () => {
  it('Test-Schalter: schon ab Welle 1 Wracks, nie auf der Route des Frachters', () => {
    const g = game('wracks');
    expect(g.sectionPlan.slice(0, 3)).toEqual(['wracks', 'wracks', 'wracks']);
    // drei bis vier (neben einer riesigen Station ist nicht immer Platz für vier); spätere Wellen bringen keine dazu
    const n = g.cover.length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
    g.spawnCover();
    expect(g.cover.length).toBe(n);
    const lane = g.wx(g.wards[0]);
    for (const w of g.cover) expect(Math.abs(w.x - lane)).toBeGreaterThan(200);
  });
  it('Schüsse beider Seiten bleiben hängen, die Lanze endet am Wrack', () => {
    const g = game();
    g.cover.push(wreckAtPos(g.px, g.py - 200));
    const e = g.makeEnemy('jaeger', g.px, g.py - 420);
    g.enemies.push(e);
    // feindlicher Schuss auf dich: hinter dem Wrack bist du sicher
    const h0 = g.hull + g.shield;
    g.enemyShot(e, Math.PI / 2, 300, 50, '#fff');
    for (let i = 0; i < 90; i++) { g.aimA = -Math.PI / 2; g.update(DT); }
    expect(g.hull + g.shield).toBeGreaterThanOrEqual(h0 - 0.01);
    expect(g.bullets.filter((b) => b.from === 'e').length).toBe(0);
    // eigene Lanze auf den Gegner hinter dem Wrack: kein Schaden
    const before = e.hp + e.sh;
    g.fireRail(g.px, g.py - 20, -Math.PI / 2, 999, 2000, '#fff');
    expect(e.hp + e.sh).toBe(before);
  });
});

describe('Gravitationsanomalie im Kampf', () => {
  it('zieht dich an; im Kern Schaden und hinausgeschleudert', () => {
    const g = game();
    g.anomaly = { x: g.px + 400, y: g.py, R: 900, core: 55, seed: 0, fade: Infinity };
    g.pvx = g.pvy = 0;
    g.update(DT);
    expect(g.pvx).toBeGreaterThan(0);
    g.px = g.anomaly.x + 10; g.py = g.anomaly.y;
    g.shield = 0;
    const h0 = g.hull;
    g.update(DT);
    expect(g.hull).toBeLessThan(h0);
    expect(Math.hypot(g.pvx, g.pvy)).toBeGreaterThan(300);
  });
});
