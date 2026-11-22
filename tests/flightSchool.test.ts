// Flugschule: fünf Stationen ohne Gegner, Tor nur seitwärts bzw. rückwärts, keine Wertung, Bestzeit wird gemerkt
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';
import { schoolBest, schoolDone, type SchoolCtrl } from '../src/minigames/flightSchool';

type Gate = { x1: number; y1: number; x2: number; y2: number; mode: string; done: boolean };
type Item = { ring?: { x: number; y: number; done: boolean }; gate?: Gate; buoy?: object; x?: number; y?: number };
type School = { st: number; part: number; items: Item[]; done: boolean; testTime: number; warnT: number; wait: number };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; result(): { success: boolean; stars: number; points: number; school?: boolean; lines: [string, string][] } | null;
  px: number; py: number; pvx: number; pvy: number; aimA: number; enemies: { kind: string; boje?: boolean }[]; wave: number;
  school: School | null; killEnemy(e: object, by: boolean): void; doSpecial(): void; fogged: boolean;
};
const DT = 1 / 60;
const make = (c: SchoolCtrl): G => {
  const g = new ShooterGame({ level: 1, seed: 5, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, school: c, loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 5; i++) g.update(DT);
  return g;
};
const run = (g: G, s: number) => { for (let i = 0; i < s / DT && !g.result(); i++) g.update(DT); };

/** Tor durchfliegen: von einer Seite zur anderen, mit Fahrt längs der Normalen; Bug nach `face` (relativ zur Fahrt) */
function crossGate(g: G, gt: Gate, face: number) {
  const mx = (gt.x1 + gt.x2) / 2, my = (gt.y1 + gt.y2) / 2, dx = gt.x2 - gt.x1, dy = gt.y2 - gt.y1, l = Math.hypot(dx, dy);
  const nx = -dy / l, ny = dx / l;
  const side = Math.sign((g.px - mx) * nx + (g.py - my) * ny) || 1;
  const mv = Math.atan2(-ny * side, -nx * side);
  g.px = mx + nx * side * 12; g.py = my + ny * side * 12;
  g.aimA = mv + face;
  g.pvx = Math.cos(mv) * 160; g.pvy = Math.sin(mv) * 160;
  g.update(DT);
  for (let i = 0; i < 12; i++) { g.aimA = mv + face; g.pvx = Math.cos(mv) * 160; g.pvy = Math.sin(mv) * 160; g.update(DT); }
}

/** Station abarbeiten wie ein Spieler, der alles richtig macht */
function solve(g: G, sideways = true) {
  const s = g.school!;
  for (let guard = 0; guard < 400 && !g.result(); guard++) {
    if (s.wait >= 0) { run(g, 0.1); continue; }
    const open = s.items.filter((it) => (it.ring ? !it.ring.done : it.gate ? !it.gate.done : g.enemies.includes(it.buoy as never)));
    const buoys = open.filter((it) => it.buoy), rings = open.filter((it) => it.ring);
    const it = buoys.length && (rings.length <= 1 || s.st === 1) ? buoys[0] : open[0];
    if (!it) {
      // Rakete und Spezial: nach der Boje die Spezialfähigkeit
      g.doSpecial();
      run(g, 0.1);
      continue;
    }
    if (it.ring) { g.px = it.ring.x; g.py = it.ring.y; g.pvx = 0; g.pvy = -80; run(g, 0.05); }
    else if (it.buoy) { g.killEnemy(it.buoy, true); run(g, 0.05); }
    else if (it.gate) crossGate(g, it.gate, it.gate.mode === 'rueck' ? Math.PI : it.gate.mode === 'seit' && sideways ? Math.PI / 2 : 0);
  }
}

describe('Flugschule', () => {
  // Speicher für die Bestzeiten (die Testumgebung hat keinen)
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  });
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

  it('ohne Gegner, Wellen und Nebel; Bojen stehen still', () => {
    const g = make('zwei');
    run(g, 3);
    expect(g.wave).toBe(-1);
    expect(g.fogged).toBe(false);
    expect(g.enemies.every((e) => e.boje)).toBe(true);
  });

  for (const c of ['eins', 'zwei', 'lenk', 'pc'] as const) {
    it(`Lektion ${c}: alle fünf Stationen, Ergebnis ohne Sterne und Punkte, Bestzeit gemerkt`, () => {
      const g = make(c);
      solve(g);
      run(g, 4);
      const r = g.result();
      expect(r).not.toBeNull();
      expect(r!.success).toBe(true);
      expect(r!.school).toBe(true);
      expect(r!.stars).toBe(0);
      expect(r!.points).toBe(0);
      expect(schoolDone(c)).toBe(true);
      expect(schoolBest(c)).not.toBeNull();
    });
  }

  it('seitwärts-Tor zählt nicht, wenn man geradeaus hindurchfliegt', () => {
    const g = make('zwei');
    const s = g.school!;
    // bis zur Torstation
    for (let guard = 0; guard < 200 && s.st < 2; guard++) {
      const open = s.items.filter((it) => (it.ring ? !it.ring.done : g.enemies.includes(it.buoy as never)));
      if (s.wait >= 0 || !open.length) { run(g, 0.1); continue; }
      const it = open[0];
      if (it.ring) { g.px = it.ring.x; g.py = it.ring.y; run(g, 0.05); } else { g.killEnemy(it.buoy!, true); run(g, 0.05); }
    }
    while (s.wait >= 0) run(g, 0.1);
    expect(s.st).toBe(2);
    const gate = s.items[0].gate!;
    expect(gate.mode).toBe('seit');
    crossGate(g, gate, 0);
    expect(gate.done).toBe(false);
    expect(s.warnT).toBeGreaterThan(0);
    crossGate(g, gate, Math.PI / 2);
    expect(gate.done || s.part === 1).toBe(true);
  });
});
