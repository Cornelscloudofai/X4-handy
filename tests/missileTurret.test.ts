// Raketen-Vierling: keine Munitionsverschwendung auf kleine Ziele, Ausweichen um Wracks, Nachschub nach jeder Welle
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, MISSILES, TURRET_MISSILES } from '../src/minigames/loadout';
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

describe('Raketen nach Rollen', () => {
  type MM = { x: number; y: number; vx: number; vy: number; target: E | null; life: number; def: unknown; dmg: number; lost?: boolean; mini?: boolean };
  const launch = (g: G, def: unknown, e: E, extra: Partial<MM> = {}): MM => {
    const m: MM = { x: g.px, y: g.py - 200, vx: 0, vy: -400, target: e, life: 6, def, dmg: 10, ...extra };
    (g.missiles as unknown as MM[]).push(m);
    return m;
  };
  it('Lenkrakete: ein Jäger, der quer und schnell vorbeizieht, schüttelt sie ab – sie verliert die Erfassung', () => {
    const g = game('pirate');
    const e = g.makeEnemy('jaeger', g.px - 200, g.py - 420);
    e.hp = e.max = 1e9; g.enemies.push(e);
    const m = launch(g, MISSILES.lenk, e);
    let lost = false, x = e.x;
    // der Jäger zieht stur quer vorbei (eigene Steuerung überschrieben)
    for (let i = 0; i < 120 && g.missiles.includes(m as never); i++) { x += 600 * DT; e.x = x; e.y = g.py - 420; e.vx = 600; e.vy = 0; g.update(DT); g.hull = g.shield = 100; if (m.lost) lost = true; }
    expect(lost).toBe(true);
    expect(m.target).toBeNull();
  });
  it('Schwarmrakete: ein Lenkkopf wendet nach dem Vorbeiflug und bleibt dran', () => {
    const g = game('pirate');
    const e = g.makeEnemy('jaeger', g.px - 260, g.py - 420);
    e.hp = e.max = 1e9; g.enemies.push(e);
    const m = launch(g, MISSILES.schwarm, e, { mini: true, life: 3 });
    for (let i = 0; i < 90 && g.missiles.includes(m as never); i++) { e.vx = 900; e.vy = 0; g.update(DT); g.hull = g.shield = 100; }
    expect(m.lost ?? false).toBe(false);
  });
  it('Sprengrakete (Vierling): zündet neben dem Ziel, trifft den ganzen Pulk – gegen Großziele kaum Schaden', () => {
    const g = game();
    const pack = [0, 1, 2, 3].map((k) => g.makeEnemy('ks', g.px + (k % 2) * 30 - 15, g.py - 520 - Math.floor(k / 2) * 30));
    for (const q of pack) { q.hp = q.max = 1e6; q.sh = 0; }
    g.enemies.push(...pack);
    const h0 = pack.map((q) => q.hp);
    launch(g, TURRET_MISSILES.spreng, pack[0], { dmg: 100 });
    for (let i = 0; i < 90; i++) { for (const q of pack) { q.vx = q.vy = 0; } g.update(DT); g.hull = g.shield = 100; }
    expect(pack.filter((q, i) => q.hp < h0[i]).length).toBeGreaterThanOrEqual(3);
    // je Klasse: S voll, M halb, L kaum
    expect(TURRET_MISSILES.spreng.vs!.L!).toBeLessThan(0.2);
  });
  it('Silo-Rakete: langsamer und träger als die Lenkrakete, gegen Großziele ein Vielfaches stärker als gegen Jäger', () => {
    const s = TURRET_MISSILES.silo, l = MISSILES.lenk;
    expect(s.v).toBeLessThan(l.v);
    expect(s.turn).toBeLessThan(l.turn);
    expect(s.vs!.L! / s.vs!.S!).toBeGreaterThan(4);
    expect(s.blast ?? 0).toBe(0);
  });
});
