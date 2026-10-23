import { describe, expect, it } from 'vitest';
import { ShooterGame, ELITES } from '../src/minigames/shooter';
import type { Level } from '../src/minigames/common';

const DT = 1 / 60;
type E = { kind: string; x: number; y: number; vx: number; vy: number; hp: number; max: number; sh: number; shMax: number; shT: number; grp?: number; elite?: string; brk?: number; cmdBy?: unknown; r: number; parent?: unknown };
type G = {
  enemies: E[]; px: number; py: number; hull: number; shield: number; wave: number;
  blasts: unknown[]; missiles: unknown[];
  spawnWave(): void; makeEnemy(k: string, x: number, y: number): E; makeElite(e: E, t?: string, n?: number): void;
  eliteCount(w: number): number; killEnemy(e: E, by: boolean): void; damageEnemy(e: E, d: number): void;
  updateEnemies(dt: number): void; updateBlasts(dt: number): void; updateShots(dt: number): void;
};
function game(side: 'pirate' | 'xenon' | 'khaak' = 'pirate', level: Level = 1, seed = 1): { g: ShooterGame; G: G } {
  const g = new ShooterGame({ level, seed, mutator: null, mode: 'normal' }, side);
  g.resize(390, 780);
  return { g, G: g as unknown as G };
}
/** Gegner fern vom Spieler, nur dieser eine im Feld */
function lone(G: G, kind: string, elite?: string): E {
  const e = G.makeEnemy(kind, G.px + 600, G.py);
  if (elite) G.makeElite(e, elite);
  G.enemies = [e];
  return e;
}

describe('Kampf: Elite-Gegner', () => {
  it('Anzahl je Welle: Stufe 1 erst ab der zweiten Welle, höhere Stufen mehr', () => {
    const { G } = game('pirate', 1);
    expect(G.eliteCount(0)).toBe(0);
    expect(G.eliteCount(1)).toBe(1);
    expect(G.eliteCount(3)).toBe(2);
    const { G: G5 } = game('pirate', 5);
    expect(G5.eliteCount(0)).toBe(2);
    expect(G5.eliteCount(3)).toBe(4);
  });

  it('kommen in den Wellen vor, auf allen Seiten', () => {
    for (const side of ['pirate', 'xenon', 'khaak'] as const) {
      const { g, G } = game(side, 5, 3);
      let seen = 0;
      for (let t = 0; t < 60 && !g.result(); t += DT) { g.update(DT); seen = Math.max(seen, G.enemies.filter((e) => e.elite).length); }
      expect(seen, side).toBeGreaterThan(0);
      for (const e of G.enemies.filter((q) => q.elite)) expect(Object.keys(ELITES)).toContain(e.elite);
    }
  });

  it('Gepanzert: doppelter Schild und langsamer', () => {
    const { G } = game();
    const a = G.makeEnemy('kanone', 0, 0), b = G.makeEnemy('kanone', 0, 0);
    G.makeElite(b, 'gepanzert');
    expect(b.shMax).toBeGreaterThanOrEqual(a.shMax * 2);
    const run = (e: E): number => { lone(G, 'kanone'); G.enemies = [e]; e.x = G.px + 900; e.y = G.py; e.vx = e.vy = 0; for (let k = 0; k < 120; k++) G.updateEnemies(DT); return Math.hypot(e.vx, e.vy); };
    expect(run(b)).toBeLessThan(run(a) * 0.85);
  });

  it('Splitter: zerfällt beim Abschuss in zwei kleine Schiffe', () => {
    const { G } = game('xenon');
    const e = lone(G, 'm', 'splitter');
    G.killEnemy(e, true);
    expect(G.enemies.length).toBe(2);
    expect(G.enemies.every((q) => q.kind === 'n' && !q.elite)).toBe(true);
  });

  it('Rächer: explodiert kurz nach dem Abschuss und trifft den Spieler im Umkreis', () => {
    const { G } = game();
    const e = lone(G, 'jaeger', 'raecher');
    e.x = G.px + 40; e.y = G.py;
    G.killEnemy(e, true);
    expect(G.blasts.length).toBe(1);
    const sh0 = G.shield, h0 = G.hull;
    G.updateBlasts(0.5);
    expect(G.shield).toBe(sh0);
    G.updateBlasts(0.5);
    expect(G.blasts.length).toBe(0);
    expect(G.shield < sh0 || G.hull < h0).toBe(true);
  });

  it('Rächer: wer weit genug weg ist, bleibt heil', () => {
    const { G } = game();
    const e = lone(G, 'jaeger', 'raecher');
    G.killEnemy(e, true);
    const sh0 = G.shield;
    G.updateBlasts(1);
    expect(G.shield).toBe(sh0);
  });

  it('Kommandant: lädt Schilde naher Verbündeter auch unter Beschuss; fällt er, verlieren sie ihre Schilde', () => {
    const { G } = game();
    const c = G.makeEnemy('kanone', G.px + 800, G.py), q = G.makeEnemy('jaeger', G.px + 860, G.py);
    G.makeElite(c, 'kommandant');
    c.grp = q.grp = 7;
    G.enemies = [c, q];
    q.sh = 0;
    for (let k = 0; k < 60; k++) { q.shT = 0; G.updateEnemies(DT); }
    expect(q.sh).toBeGreaterThan(q.shMax * 0.1);
    expect(q.cmdBy).toBe(c);
    G.killEnemy(c, true);
    expect(q.sh).toBe(0);
    expect(q.brk).toBeGreaterThan(0);
  });

  it('Flink: weicht einer Lenkrakete aus, sie verliert ihr Ziel', () => {
    const { G } = game();
    const e = lone(G, 'jaeger', 'flink');
    e.x = G.px + 300; e.y = G.py; e.vx = e.vy = 0;
    const def = { turn: 4, v: 500, acc: 800, life: 4, dmg: 1 };
    G.missiles = [{ x: e.x - 120, y: e.y, vx: 500, vy: 0, target: e, life: 3, def, dmg: 1 }];
    const x0 = e.x, y0 = e.y;
    G.updateShots(DT);
    expect((G.missiles[0] as { target: unknown }).target).toBeNull();
    expect(Math.hypot(e.x - x0, e.y - y0)).toBeGreaterThan(20);
  });

  it('Elite bringt 1,5-fache Punkte als eigene Kategorie', () => {
    const { g, G } = game();
    const e = lone(G, 'jaeger', 'gepanzert');
    G.killEnemy(e, true);
    G.enemies = [];
    const s = g as unknown as { score: { cats: Map<string, number> } };
    // 100 Punkte ×1,5 (Kombo-Anteil zählt eigens)
    expect(s.score.cats.get('Elite-Gegner')).toBeCloseTo(150);
  });
});
