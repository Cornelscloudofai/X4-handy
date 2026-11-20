// Gegnerraketen: Raketenboote zielen sichtbar und feuern Salven leichter Raketen, Treffer stören die Zielerfassung,
// nur wenige Boote zielen zugleich auf den Frachter; Schadensbremse am Frachter; Raketenwarnung; Abfangjäger
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type E = { kind: string; x: number; y: number; vx: number; vy: number; hp: number; max: number; ang: number; target: string; cd: number; lockT?: number; jam?: number; mslQ?: number; mslCd?: number; role?: string; grp?: number };
type M = { x: number; y: number; vx: number; vy: number; small?: boolean; dmg: number; target: string };
type W = { hull: number; max: number };
type G = {
  enemies: E[]; eMissiles: M[]; wards: W[]; px: number; py: number; time: number; hull: number;
  makeEnemy(k: string, x: number, y: number): E; update(dt: number): void; damageEnemy(e: E, d: number): void;
  hitWard(w: W, d: number, x: number, y: number): void; spawnGroup(list: string[], from: number): void;
  missileThreats(): M[]; wx(w: W): number; wy(w: W): number;
};
const DT = 1 / 60;

function game(level = 1): G {
  const g = new ShooterGame({ level, seed: 7, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never, 'pirate') as unknown as G;
  (g as unknown as { resize(w: number, h: number): void }).resize(390, 780);
  g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
  return g;
}
/** Raketenboot 300 vom Frachter, Bug auf ihn gerichtet, ohne eigene Bewegung */
function boat(g: G, dx: number): E {
  const w = g.wards[0];
  const e = g.makeEnemy('rakete', g.wx(w) + dx, g.wy(w) - 300);
  e.target = 'f'; e.cd = 0; e.mslCd = 1e9;
  g.enemies.push(e);
  return e;
}
const hold = (g: G, es: E[]) => { for (const e of es) { const w = g.wards[0]; e.ang = Math.atan2(g.wy(w) - e.y, g.wx(w) - e.x); e.vx = e.vy = 0; } };

describe('Gegnerraketen', () => {
  it('Raketenboot: erst zielen (gut 2 s), dann eine Salve aus sechs leichten Raketen', () => {
    const g = game();
    g.px = g.wx(g.wards[0]) + 900; // eigenes Schiff weit weg
    const e = boat(g, 0);
    g.eMissiles = [];
    let t = 0;
    while (t < 1.8) { hold(g, [e]); g.update(DT); t += DT; }
    expect(e.lockT).toBeGreaterThan(1.5);
    expect(g.eMissiles.length).toBe(0);
    // gestartete Raketen sammeln (Frachtertürme schießen einzelne ab, andere schlagen schon ein)
    const seen = new Set<M>();
    while (t < 3.6) { hold(g, [e]); g.update(DT); t += DT; for (const m of g.eMissiles) seen.add(m); }
    const salvo = [...seen].filter((m) => m.small);
    expect(salvo.length).toBe(6);
    expect(salvo.every((m) => m.dmg < 10)).toBe(true);
  });

  it('Beschuss stört die Zielerfassung; höchstens zwei Boote zielen zugleich auf den Frachter (Stufe 1)', () => {
    const g = game();
    g.px = g.wx(g.wards[0]) + 900;
    const e = boat(g, 0);
    for (let i = 0; i < 60; i++) { hold(g, [e]); g.update(DT); }
    const l0 = e.lockT!;
    // eigener Beschuss (Bordwaffe), nicht die Frachtertürme
    for (let i = 0; i < 60; i++) { hold(g, [e]); (g as unknown as { logSrc: string }).logSrc = 'gun'; g.damageEnemy(e, 0.01); g.update(DT); }
    expect(e.lockT!).toBeLessThanOrEqual(l0);
    const g2 = game();
    g2.px = g2.wx(g2.wards[0]) + 900;
    const bs = [boat(g2, -80), boat(g2, 0), boat(g2, 80)];
    for (let i = 0; i < 30; i++) { hold(g2, bs); g2.update(DT); }
    expect(bs.filter((b) => b.lockT != null).length).toBe(2);
  });

  it('Schadensbremse: ein gebündelter Treffer wirkt oberhalb des Vorrats nur abgeschwächt', () => {
    const g = game();
    const w = g.wards[0];
    w.hull = w.max;
    g.hitWard(w, w.max * 0.5, g.wx(w), g.wy(w));
    // 10 % voll, der Rest (40 %) zu 35 %: 24 % Verlust statt 50 %
    expect(w.hull / w.max).toBeGreaterThan(0.7);
    expect(w.hull / w.max).toBeLessThan(0.8);
  });

  it('Raketenwarnung erfasst anfliegende Raketen, nicht abfliegende; Abfangjäger begleiten Raketenboote', () => {
    const g = game();
    g.eMissiles = [
      { x: g.px, y: g.py - 300, vx: 0, vy: 150, target: 'p', dmg: 18 } as M,
      { x: g.px, y: g.py - 300, vx: 0, vy: -150, target: 'p', dmg: 18 } as M,
      { x: g.px, y: g.py - 2000, vx: 0, vy: 150, target: 'p', dmg: 18 } as M,
    ];
    expect(g.missileThreats().length).toBe(1);
    g.spawnGroup(['jaeger', 'jaeger', 'jaeger', 'rakete'], 0);
    const grp = g.enemies.filter((e) => e.kind === 'jaeger');
    expect(grp.filter((e) => e.role === 'abfang').length).toBe(2);
    expect(grp.filter((e) => e.role === 'abfang').every((e) => e.target === 'p')).toBe(true);
  });
});
