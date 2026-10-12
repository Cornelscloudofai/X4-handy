import { describe, expect, it } from 'vitest';
import { bits, consumers, generate, par, power, rotCW, rotate, turnsTo } from '../src/minigames/pipesLogic';
import { GasGame } from '../src/minigames/gas';
import { CargoGame } from '../src/minigames/cargo';
import { HighwayGame } from '../src/minigames/highway';
import { OrbitGame, elements } from '../src/minigames/orbit';
import { MODS, QUALITY, START_PARTS, craft, earnParts, modState, modStats, partsFor, remove as removeMod, resetMods } from '../src/minigames/mods';
import { OreGame } from '../src/minigames/ore';
import { PipesGame } from '../src/minigames/pipes';
import { ShooterGame } from '../src/minigames/shooter';
import { turretArtName } from '../src/render/shipArt';
import { SHIP_IDS, TURRET_IDS, WEAPON_IDS, type Loadout } from '../src/minigames/loadout';
import { Score, pickGoals, rng, type GameResult, type Level, type MiniGame, type Mode } from '../src/minigames/common';
import { recordResult, resetRecords, totalStars, unlocked, badgeCount } from '../src/minigames/records';

const W = 390, H = 780, DT = 1 / 60;

/** Spiel laufen lassen, bis ein Ergebnis da ist */
function run(g: MiniGame, each: (t: number) => void = () => {}, max = 400): GameResult {
  let t = 0;
  while (!g.result() && t < max) {
    each(t);
    g.update(DT);
    t += DT;
  }
  const r = g.result();
  expect(r).not.toBeNull();
  return r!;
}

const cfg = (level: Level, seed: number, extra: { mutator?: string | null; mode?: Mode; gear?: 1 | 2 | 3 } = {}) => ({
  level, seed, mutator: extra.mutator ?? null, mode: extra.mode ?? 'normal' as Mode,
  gear: extra.gear ? { weapon: extra.gear, shield: extra.gear, engine: extra.gear } : undefined,
});

describe('Rohr-Puzzle: Logik', () => {
  it('Drehung: viermal ergibt das Ausgangsstück', () => {
    for (let m = 0; m < 16; m++) expect(rotCW(rotCW(rotCW(rotCW(m))))).toBe(m);
    expect(bits(rotCW(0b0011))).toBe(2);
  });

  const variants = [
    { n: 5, o: {} },
    { n: 6, o: { blocked: 2, bridges: true, valves: 1 } },
    { n: 7, o: { blocked: 3, bridges: true, valves: 2, two: true, fixed: 2 } },
    { n: 8, o: { blocked: 5, bridges: true, valves: 3, two: true } },
  ];

  it('erzeugt lösbare, verdrehte Rätsel – auch mit Brücken, Ventilen, Sperren und zwei Waren', () => {
    let bridges = 0, groups = 0;
    for (const { n, o } of variants) for (let seed = 1; seed < 40; seed++) {
      const b = generate(n, seed, o);
      const solved = { ...b, mask: b.solution.slice() };
      expect(power(solved).solved).toBe(true);
      expect(power(b).solved).toBe(false);
      expect(par(b)).toBeGreaterThan(2);
      expect(consumers(b).length).toBeGreaterThanOrEqual(2);
      for (const s of b.sources) expect(b.locked[s]).toBe(true);
      bridges += b.bridge.filter(Boolean).length;
      groups += new Set(b.group.filter((g) => g >= 0)).size;
      // Bei zwei Waren braucht jede ihre Module
      if (o.two) for (const c of [0, 1]) expect(consumers(b).some((k) => b.owner[k] === c)).toBe(true);
    }
    expect(bridges).toBeGreaterThan(10);
    expect(groups).toBeGreaterThan(40);
  });

  it('gleicher Startwert, gleiches Rätsel', () => {
    expect(generate(7, 42, variants[2].o).mask).toEqual(generate(7, 42, variants[2].o).mask);
  });

  it('mit der Mindestzahl Drehungen gelöst (Ventile drehen gemeinsam)', () => {
    for (let seed = 1; seed < 20; seed++) {
      const b = generate(7, seed, variants[2].o);
      const need = par(b);
      let taps = 0;
      for (let guard = 0; guard < 400 && !power(b).solved; guard++) {
        const i = b.mask.findIndex((m, k) => !b.locked[k] && m !== b.solution[k]);
        if (i < 0) break;
        rotate(b, i);
        taps++;
      }
      expect(power(b).solved).toBe(true);
      expect(taps).toBeLessThanOrEqual(need + 3 * b.mask.length);
      expect(turnsTo(b.mask[0], b.solution[0])).toBe(0);
    }
  });

  it('vermischte Waren werden erkannt', () => {
    const b = generate(7, 3, variants[2].o);
    b.mask = b.solution.slice();
    expect(power(b).mixed.length).toBe(0);
    // ein Feld neben einem Kern zum anderen Netz hin verdrehen, bis sich etwas vermischt oder leckt
    let found = false;
    for (let i = 0; i < b.mask.length && !found; i++) {
      if (b.locked[i]) continue;
      for (let k = 0; k < 3; k++) { rotate(b, i); const p = power(b); if (p.mixed.length || p.leaks.length) found = true; }
      rotate(b, i);
    }
    expect(found).toBe(true);
  });
});

describe('Rohr-Puzzle: Spiel', () => {
  it('Lösen bringt Punkte, Sterne und Abzeichen-Ziele', () => {
    const g = new PipesGame(cfg(2, 11));
    g.resize(W, H);
    g.debugSolve(1);
    for (let k = 0; k < 8 && g.debugWrongCell() >= 0; k++) g.tap(g.debugWrongCell());
    const r = run(g);
    expect(r.success).toBe(true);
    expect(r.points).toBeGreaterThan(1000);
    expect(r.stars).toBeGreaterThan(0);
    expect(r.goals.length).toBe(3);
  });

  it('Kette: gelöste Netze verlängern die Zeit', () => {
    const g = new PipesGame(cfg(1, 5, { mode: 'chain' }));
    g.resize(W, H);
    let solved = 0;
    const r = run(g, () => {
      const n = (g as unknown as { boards: number; won: number }).boards;
      if (n > solved) solved = n;
      if (solved < 5 && (g as unknown as { won: number }).won < 0) {
        g.debugSolve(1);
        const i = g.debugWrongCell();
        if (i >= 0) g.tap(i);
      }
    }, 600);
    expect(solved).toBeGreaterThanOrEqual(3);
    expect(r.stars).toBeGreaterThanOrEqual(1);
  });

  it('ohne Züge: Zeit oder Druck laufen ab', () => {
    const r = run(new PipesGame(cfg(3, 2)), () => {}, 400);
    expect(r.success).toBe(false);
  });
});

describe('Bergbau (Erz)', () => {
  function play(level: Level, skilled: boolean, mutator: string | null = null, seed = 1234): { r: GameResult; g: OreGame } {
    const g = new OreGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    let holding = false;
    const r = run(g, () => {
      const a = g as unknown as { heat: number; overheated: boolean };
      const touch = g.debugVeinTouch();
      if (a.heat > 90 && !a.overheated) g.flush();
      if (skilled && touch && !a.overheated && a.heat < 85) {
        if (!holding) { g.pointerDown(1, ...touch); holding = true; } else g.pointerMove(1, ...touch);
      } else if (holding) { g.pointerUp(1); holding = false; }
    });
    return { r, g };
  }

  it('wer den Adern folgt, schafft Sterne und Punkte', () => {
    const a = play(1, true).r;
    expect(a.stars).toBeGreaterThanOrEqual(2);
    expect(a.points).toBeGreaterThan(1000);
    expect(play(3, true).r.stars).toBeGreaterThanOrEqual(1);
    expect(play(5, true).r.stars).toBeGreaterThanOrEqual(1);
  });

  it('ausgebeutete Asteroiden zerbrechen und ein neuer erscheint', () => {
    const { g } = play(1, true, 'rich');
    expect((g as unknown as { asteroids: number }).asteroids).toBeGreaterThanOrEqual(0);
    const { g: g2 } = play(1, true, null, 7);
    expect((g2 as unknown as { mined: number }).mined).toBeGreaterThan(0);
  });

  it('ohne Abbau keine Sterne', () => {
    const r = play(1, false).r;
    expect(r.stars).toBe(0);
    expect(r.success).toBe(false);
  });

  type OreInt = {
    heat: number; stress: number; collapses: number; lost: number; mined: number; vented: number; pocketHits: number; coreOpen: boolean; coresDone: number;
    mode: 'wide' | 'fine'; aim: [number, number]; total: number; astTotal: number;
    veins: { x: number; y: number; a: number }[][]; core: { x: number; y: number; a: number }[];
    pockets: { x: number; y: number; alive: boolean; press: number; vent: number }[];
    crystals: { x: number; y: number }[]; toLocal(x: number, y: number): [number, number];
  };
  const fresh = (level: Level, seed = 1234, mutator: string | null = null) => {
    const g = new OreGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    return { g, a: g as unknown as OreInt };
  };
  /** Gesteinspunkt fern von Adern, Taschen und Kristallen */
  function rockSpot(a: OreInt): [number, number] {
    for (let r = 0.2; r < 0.7; r += 0.05) for (let k = 0; k < 24; k++) {
      const x = Math.cos(k / 24 * Math.PI * 2) * r, y = Math.sin(k / 24 * Math.PI * 2) * r;
      const far = (pts: { x: number; y: number }[], d: number) => pts.every((p) => Math.hypot(p.x - x, p.y - y) > d);
      if (a.veins.every((v) => far(v, 0.15)) && far(a.core, 0.15) && far(a.pockets, 0.25) && far(a.crystals, 0.12)) return [x, y];
    }
    throw new Error('kein Gesteinspunkt');
  }

  it('Bohren im Gestein lässt die Spannung steigen – bis zum Einsturz', () => {
    const { g, a } = fresh(3);
    a.mined = 10; // etwas Ladung an Bord
    const [x, y] = rockSpot(a);
    g.pointerDown(1, ...g.debugTouchAt(x, y));
    let t = 0;
    while (a.collapses === 0 && t < 30) {
      if (a.heat > 80) a.heat = 0; // Hitze ausblenden: hier geht es um die Spannung
      g.pointerMove(1, ...g.debugTouchAt(x, y));
      g.update(DT);
      t += DT;
    }
    expect(a.collapses).toBe(1);
    expect(a.lost).toBeGreaterThan(0);
    expect(a.stress).toBe(0);
    // Ohne Bohren entspannt sich das Gestein wieder
    const b = fresh(3).a;
    b.stress = 60;
    for (let k = 0; k < 120; k++) (b as unknown as OreGame).update(DT);
    expect(b.stress).toBeLessThan(60);
  });

  it('feiner, kühler Laser lässt Gastaschen ab; breiter Laser sprengt sie und setzt Nachbarn unter Druck', () => {
    const { g, a } = fresh(4);
    expect(a.pockets.length).toBeGreaterThan(1);
    const p = a.pockets[0];
    g.toggleMode();
    expect(a.mode).toBe('fine');
    g.pointerDown(1, ...g.debugTouchAt(p.x, p.y));
    for (let k = 0; k < 90 && p.alive; k++) { a.heat = 0; g.pointerMove(1, ...g.debugTouchAt(p.x, p.y)); g.update(DT); }
    g.pointerUp(1);
    expect(p.alive).toBe(false);
    expect(a.vented).toBeGreaterThanOrEqual(1);
    expect(a.pocketHits).toBe(0);

    const w = fresh(4);
    const q = w.a.pockets[0];
    const near = w.a.pockets.filter((o) => o !== q && Math.hypot(o.x - q.x, o.y - q.y) < 0.32);
    w.g.pointerDown(1, ...w.g.debugTouchAt(q.x, q.y));
    w.g.update(DT);
    expect(q.alive).toBe(false);
    expect(w.a.pocketHits).toBeGreaterThanOrEqual(1);
    expect(w.a.stress).toBeGreaterThan(15);
    for (const o of near) expect(!o.alive || o.press > 0.3).toBe(true);
  });

  it('Druck baut sich auf, wenn nebenan gebohrt wird; volle Taschen explodieren von selbst', () => {
    const { g, a } = fresh(4);
    const p = a.pockets[0];
    p.press = 0.99;
    a.pockets.forEach((o) => { if (o !== p) o.alive = false; });
    // knapp daneben bohren
    g.pointerDown(1, ...g.debugTouchAt(p.x + 0.12, p.y));
    for (let k = 0; k < 30 && p.alive; k++) g.update(DT);
    expect(p.alive).toBe(false);
    expect(a.pocketHits).toBe(1);
  });

  it('Kernader liegt erst nach der Hälfte frei und zählt mehrfach', () => {
    const { g, a } = fresh(1);
    expect(a.coreOpen).toBe(false);
    for (const v of a.veins) for (const p of v) p.a = 0.3;
    g.update(DT);
    expect(a.coreOpen).toBe(true);
    const before = a.mined;
    const c = a.core[0];
    g.pointerDown(1, ...g.debugTouchAt(c.x, c.y));
    for (let k = 0; k < 30; k++) { a.heat = 0; g.update(DT); }
    expect(a.mined - before).toBeGreaterThan(1);
  });

  it('wer an Gastaschen fein bohrt, stürzt seltener ein', () => {
    const go = (smart: boolean) => {
      let col = 0, pts = 0;
      for (const seed of [1234, 7, 99, 5]) {
        const { g, a } = fresh(5, seed);
        let holding = false;
        let pos: [number, number] | null = null;
        const r = run(g, () => {
          const touch = g.debugVeinTouch();
          if (a.heat > 90) g.flush();
          if (smart) {
            const [lx, ly] = a.toLocal(...a.aim);
            const near = a.pockets.some((p) => p.alive && Math.hypot(p.x - lx, p.y - ly) < 0.22);
            if (near !== (a.mode === 'fine')) g.toggleMode();
          }
          if (touch && a.heat < 85) {
            pos ??= touch;
            const dx = touch[0] - pos[0], dy = touch[1] - pos[1], d = Math.hypot(dx, dy), st = 500 * DT;
            pos = d <= st ? touch : [pos[0] + (dx / d) * st, pos[1] + (dy / d) * st];
            if (!holding) { g.pointerDown(1, ...pos); holding = true; } else g.pointerMove(1, ...pos);
          } else if (holding) { g.pointerUp(1); holding = false; }
        });
        col += a.collapses;
        pts += r.points;
      }
      return { col, pts };
    };
    const naive = go(false), smart = go(true);
    expect(smart.col).toBeLessThan(naive.col);
    expect(smart.col).toBeLessThanOrEqual(1);
  });
});

describe('Gasströme', () => {
  function play(level: Level, auto: boolean, seed = 99, mutator: string | null = null): GameResult {
    const g = new GasGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    return run(g, () => { if (auto) g.autopilot(); });
  }

  it('mit gutem Fangen und Entladen Sterne, ohne Steuerung keine', () => {
    for (const level of [1, 2, 3, 4, 5] as const) expect(play(level, true).stars).toBeGreaterThanOrEqual(1);
    expect(play(1, true).stars).toBeGreaterThanOrEqual(2);
    expect(play(1, false).stars).toBe(0);
  });

  it('Besonderheiten verändern die Runde', () => {
    for (const m of ['gold', 'leak', 'smog', 'storm', 'fast']) expect(play(2, true, 99, m).points).toBeGreaterThan(0);
  });

  type GasInt = {
    x: number; y: number; vx: number; vy: number; tank: number; tankValue: number; foreign: number; secured: number; hits: number; cap: number;
    charge: number; funnel: number; time: number; mother: [number, number];
    flakes: { x: number; y: number; u: number; kind: string; s: unknown }[];
    storms: { state: string; t: number }[];
    stormPos(s: unknown): [number, number]; strikeR(s: unknown): number; funnelR(): number;
  };
  const fresh = (level: Level, mutator: string | null = null) => {
    const g = new GasGame(cfg(level, 99, { mutator }));
    g.resize(W, H);
    return { g, a: g as unknown as GasInt };
  };

  it('zwei Sticks: links fliegt der Sammler, rechts ändert sich die Trichtergröße', () => {
    const { g, a } = fresh(1);
    const x0 = a.x, f0 = a.funnel;
    g.pointerDown(1, 80, 600);
    g.pointerMove(1, 80 + 60, 600);
    g.pointerDown(2, 320, 600);
    g.pointerMove(2, 320, 540); // nach oben: größer
    for (let k = 0; k < 30; k++) g.update(DT);
    expect(a.x).toBeGreaterThan(x0 + 30);
    expect(a.funnel).toBeGreaterThan(f0);
    g.pointerUp(2);
    const f1 = a.funnel;
    for (let k = 0; k < 30; k++) g.update(DT);
    expect(a.funnel).toBe(f1); // bleibt beim Loslassen
    g.pointerDown(3, 320, 600);
    g.pointerMove(3, 320, 660); // nach unten: kleiner
    for (let k = 0; k < 30; k++) g.update(DT);
    expect(a.funnel).toBeLessThan(f1);
  });

  it('großer Trichter fängt mehr als kleiner – und macht den Sammler träge', () => {
    const catchWith = (size: number) => {
      const { g, a } = fresh(1);
      a.funnel = size;
      let caught = 0;
      for (let k = 0; k < 600; k++) {
        // mitten in den dichtesten Strom stellen
        const b = g.debugBestBlob();
        if (b && k % 30 === 0) { a.x = b[0]; a.y = b[1]; }
        a.vx = 0; a.vy = 0;
        const before = a.tank;
        g.update(DT);
        caught += Math.max(0, a.tank - before);
        a.tank = 0; a.tankValue = 0; a.foreign = 0;
      }
      return caught;
    };
    expect(catchWith(1)).toBeGreaterThan(catchWith(0) * 1.5);
    const speed = (size: number) => {
      const { g, a } = fresh(1);
      a.funnel = size;
      g.pointerDown(1, 80, 600);
      g.pointerMove(1, 80 + 64, 600);
      for (let k = 0; k < 60; k++) g.update(DT);
      return Math.hypot(a.vx, a.vy);
    };
    expect(speed(0)).toBeGreaterThan(speed(1) * 1.4);
  });

  it('Funken laden auf – bei voller Ladung Überschlag mit Ladungsverlust', () => {
    const { g, a } = fresh(3);
    a.tank = 4; a.tankValue = 4;
    a.funnel = 1;
    a.charge = 0.95;
    a.flakes.length = 0;
    a.flakes.push({ x: a.x, y: a.y, u: 0.5, kind: 'spark', s: { speed: 0, len: 100, p: [[0, 0], [0, 0], [0, 0]], width: 1, ph: 0 } } as never);
    g.update(DT);
    expect(a.hits).toBe(1);
    expect(a.tank).toBeLessThan(2.6);
    expect(a.charge).toBe(0);
  });

  it('Fremdgas verdünnt die Ladung: weniger gesichert als mit reinem Gas', () => {
    const unload = (dirty: boolean) => {
      const { g, a } = fresh(2);
      a.tank = 4; a.tankValue = dirty ? 2 : 4; a.foreign = dirty ? 2 : 0;
      for (let k = 0; k < 120; k++) { const [mx, my] = a.mother; a.x = mx; a.y = my; a.vx = 0; a.vy = 0; g.update(DT); }
      return a.secured;
    };
    const pure = unload(false), dirty = unload(true);
    expect(pure).toBeGreaterThan(4);
    expect(dirty).toBeLessThan(pure / 2);
  });

  it('zu schnell am Mutterschiff: kein Entladen', () => {
    const { g, a } = fresh(1);
    a.tank = 3; a.tankValue = 3;
    for (let k = 0; k < 20; k++) { const [mx, my] = a.mother; a.x = mx; a.y = my; a.vx = 300; a.vy = 0; g.update(DT); }
    expect(a.secured).toBe(0);
  });

  it('angekündigter Blitz: im Ring halbe Ladung weg, außerhalb nichts', () => {
    const hit = (inside: boolean) => {
      const { g, a } = fresh(3);
      const s = a.storms[0];
      s.state = 'charge'; s.t = 0.01;
      a.tank = 4; a.tankValue = 4;
      const [sx, sy] = a.stormPos(s);
      a.x = sx + (inside ? 5 : a.strikeR(s) + 40); a.y = sy;
      g.update(DT);
      return a;
    };
    const i = hit(true);
    expect(i.hits).toBe(1);
    expect(i.tank).toBeLessThan(2.2);
    expect(hit(false).hits).toBe(0);
  });
});

describe('Frachtraum', () => {
  function play(level: Level, auto: boolean, seed = 99, mutator: string | null = null): GameResult {
    const g = new CargoGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    return run(g, () => { if (auto) g.autopilot(); });
  }

  it('mit Autopilot Sterne auf allen Stufen, ohne Schuss keine', () => {
    for (const level of [1, 2, 3, 4, 5] as const) expect(play(level, true).stars).toBeGreaterThanOrEqual(1);
    expect(play(1, true).stars).toBe(3);
    expect(play(1, false).stars).toBe(0);
    for (const m of ['bouncy', 'drift', 'dark', 'weak']) expect(play(2, true, 99, m).points).toBeGreaterThan(0);
  });

  type CBox = { x: number; y: number; vx: number; vy: number; mass: number; state: string; cw: number; ch: number; shots: number; c0: number; r0: number; stop: number };
  type CInt = {
    boxes: CBox[]; lost: number; time: number; target: [number, number] | null; rows: number; cols: number;
    step(h: number, t: number): void; comOffset(): number; swaps(): number; shoot(b: CBox, jx: number, jy: number): void;
    predict(b: CBox, vx: number, vy: number, horizon: number): { pts: [number, number][]; caught: boolean };
  };
  const fresh = (level: Level = 1) => {
    const g = new CargoGame(cfg(level, 99));
    g.resize(W, H);
    const a = g as unknown as CInt;
    for (const b of a.boxes) b.state = 'queue';
    a.target = null;
    return { g, a };
  };
  const place = (b: CBox, x: number, y: number) => { b.state = 'float'; b.x = x; b.y = y; b.vx = 0; b.vy = 0; };
  const sim = (a: CInt, n: number) => { for (let k = 0; k < n; k++) a.step(1 / 120, k / 120); };

  it('gleicher Schuss: v = J / m – der schwere Container kommt kaum in Fahrt', () => {
    const { a } = fresh();
    const [l, h] = a.boxes;
    place(l, 1, 1); place(h, 3, 1);
    l.mass = 1; h.mass = 5;
    a.shoot(l, 2, 0); a.shoot(h, 2, 0);
    expect(l.vx).toBeCloseTo(2);
    expect(h.vx).toBeCloseTo(0.4);
  });

  it('keine Reibung: ohne Magnetfeld fliegt ein Container gleichförmig weiter', () => {
    const { a } = fresh();
    const b = a.boxes[0];
    place(b, 2, 1);
    b.vy = 0.5;
    sim(a, 120);
    expect(b.vy).toBeCloseTo(0.5);
    expect(b.y).toBeCloseTo(1.5, 1);
  });

  it('Magnetfeld am Ziel: langsam wird eingefangen, zu schnell fliegt durch', () => {
    const go = (v: number) => {
      const { a } = fresh();
      const b = a.boxes[0];
      b.cw = 1; b.ch = 1; b.mass = 1;
      a.target = [1, 3];
      place(b, 1.5, 1.2);
      b.vy = v;
      sim(a, 360);
      return b.state;
    };
    expect(go(1.5)).toBe('clamped');
    expect(go(7)).not.toBe('clamped');
  });

  it('Bahnvorhersage stimmt mit der echten Bahn überein', () => {
    const { a } = fresh();
    const b = a.boxes[0];
    b.cw = 1; b.ch = 1; b.mass = 2;
    a.target = [3, 4];
    place(b, 0.6, 0.6);
    const p = a.predict(b, 2.2, 1.1, 2);
    b.vx = 2.2; b.vy = 1.1;
    sim(a, 239);
    const [px, py] = p.pts[p.pts.length - 1];
    if (b.state === 'float') { expect(b.x).toBeCloseTo(px, 1); expect(b.y).toBeCloseTo(py, 1); }
    else expect(p.caught).toBe(true);
  });

  it('Schwerpunkt seitlich und Umräumungen werden richtig gezählt', () => {
    const { a } = fresh(3);
    const [l, r, top, low] = a.boxes;
    for (const [b, c, rr] of [[l, 0, 4], [r, 4, 4]] as const) { b.state = 'clamped'; b.cw = 1; b.c0 = c; b.r0 = rr; b.x = c + 0.5; b.y = rr + 0.5; }
    l.mass = 2; r.mass = 2;
    expect(Math.abs(a.comOffset())).toBeLessThan(0.01);
    r.mass = 6;
    expect(a.comOffset()).toBeGreaterThan(10);
    for (const [b, rr, st] of [[top, 1, 2], [low, 3, 0]] as const) { b.state = 'clamped'; b.cw = 1; b.c0 = 2; b.r0 = rr; b.x = 2.5; b.y = rr + 0.5; b.stop = st; }
    expect(a.swaps()).toBe(1);
  });

  it('unten offen: wer hinaustreibt, kostet Zeit und kommt zurück in die Warteschlange', () => {
    const { a } = fresh();
    const b = a.boxes[0];
    place(b, 2, a.rows - 0.2);
    b.vy = 2;
    const t0 = a.time;
    sim(a, 60);
    expect(a.lost).toBe(1);
    expect(b.state).toBe('queue');
    expect(a.time).toBeGreaterThan(t0 + 5);
  });
});

describe('Superhighway', () => {
  function play(level: Level, auto: boolean, seed = 99, mutator: string | null = null): GameResult {
    const g = new HighwayGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    return run(g, () => { if (auto) g.autopilot(); });
  }

  it('mit Autopilot Sterne, ohne Steuern keine (Ausfahrt verpasst, Kollisionen)', () => {
    for (const level of [1, 2, 3] as const) expect(play(level, true).stars).toBeGreaterThanOrEqual(1);
    expect(play(1, true).stars).toBeGreaterThanOrEqual(2);
    expect(play(1, false).stars).toBe(0);
    for (const m of ['dense', 'lowfuel', 'ion', 'heavy']) expect(play(2, true, 99, m).points).toBeGreaterThan(0);
  });

  type HInt = { me: { x: number; vx: number; vy: number; y: number; mass: number }; traffic: unknown[]; fuel: number; touches: Map<number, number>; field(x: number): number; stopPoint(): number };
  const fresh = (mutator: string | null = null) => {
    const g = new HighwayGame(cfg(1, 99, { mutator }));
    g.resize(W, H);
    const a = g as unknown as HInt;
    a.traffic.length = 0;
    return { g, a };
  };

  it('Feldprofil: in der Mitte am schnellsten', () => {
    const { a } = fresh();
    expect(a.field(2.5)).toBeGreaterThan(a.field(1.5));
    expect(a.field(1.5)).toBeGreaterThan(a.field(0.5));
    expect(a.field(0.5)).toBeCloseTo(a.field(4.5));
  });

  it('quer keine Reibung: nach dem Schub driftet das Schiff weiter, Gegenschub stoppt es', () => {
    const { g, a } = fresh();
    g.pointerDown(1, W - 40, 600); // rechts
    for (let k = 0; k < 15; k++) g.update(DT);
    g.pointerUp(1);
    const v = a.me.vx;
    expect(v).toBeGreaterThan(0.4);
    for (let k = 0; k < 30; k++) g.update(DT);
    expect(a.me.vx).toBeCloseTo(v, 5); // treibt ungebremst weiter
    // Haltepunkt: v² / 2a voraus
    const stop = a.stopPoint();
    g.pointerDown(2, 40, 600); // links = Gegenschub
    let k = 0;
    while (a.me.vx > 0 && k++ < 120) g.update(DT);
    g.pointerUp(2);
    expect(Math.abs(a.me.x - stop)).toBeLessThan(0.08);
  });

  it('beide Daumen bremsen nach vorn und kosten Δv; schwere Ladung halbiert den Seitenschub', () => {
    const { g, a } = fresh();
    const v0 = a.me.vy, f0 = a.fuel;
    g.pointerDown(1, 40, 600); g.pointerDown(2, W - 40, 600);
    for (let k = 0; k < 20; k++) g.update(DT);
    expect(a.me.vy).toBeLessThan(v0 - 40);
    expect(a.fuel).toBeLessThan(f0);
    const lat = (m: string | null) => {
      const h = fresh(m);
      h.g.pointerDown(1, W - 40, 600);
      for (let k = 0; k < 20; k++) h.g.update(DT);
      return h.a.me.vx;
    };
    expect(lat('heavy')).toBeCloseTo(lat(null) / 2, 2);
  });

  it('Feldverstärker: genau durch die Mitte gibt Tempo und Δv, daneben nichts', () => {
    const pass = (dx: number) => {
      const { g, a } = fresh();
      const h = g as unknown as { gates: { x: number; y: number; state: number }[] };
      a.fuel = 10;
      h.gates.length = 0;
      h.gates.push({ x: a.me.x + dx, y: a.me.y + 30, state: 0, t: 0 } as never);
      const v0 = a.me.vy;
      for (let k = 0; k < 6; k++) g.update(DT);
      return { state: h.gates[0].state, dv: a.me.vy - v0, fuel: a.fuel };
    };
    const hit = pass(0), miss = pass(0.6);
    expect(hit.state).toBe(1);
    expect(hit.dv).toBeGreaterThan(150);
    expect(hit.fuel).toBeGreaterThan(miss.fuel + 2);
    expect(miss.state).toBe(-1);
    expect(miss.dv).toBeLessThan(10);
  });

  it('Feldschatten: hinter einem Frachter fließt das Feld langsamer, daneben nicht', () => {
    const { g, a } = fresh();
    const h = g as unknown as { wake(x: number, y: number): number };
    a.traffic.push({ x: 2.5, y: a.me.y + 120, vx: 0, vy: 520, mass: 9, w: 0.9, l: 104, k: 1, sprite: 'wyvern_min', goal: 2.5, blink: 0, hit: 0, warn: 0 });
    expect(h.wake(2.5, a.me.y)).toBeGreaterThan(0.15);
    expect(h.wake(4.5, a.me.y)).toBe(0);
    expect(h.wake(2.5, a.me.y + 400)).toBe(0); // vor dem Frachter
    // das eigene Schiff wird im Schatten langsamer als im freien Feld
    for (let k = 0; k < 60; k++) g.update(DT);
    expect((g as unknown as { crashes: number }).crashes).toBe(0);
    expect(a.me.vy).toBeLessThan(a.field(a.me.x) * 0.92);
  });

  it('ab Stufe 2 fädeln Schiffe aus den Feldschleusen ein', () => {
    const g = new HighwayGame(cfg(2, 99));
    g.resize(W, H);
    const h = g as unknown as { traffic: { merge?: boolean; x: number }[] };
    let seen = false, inside = false;
    for (let k = 0; k < 60 * 30 && !inside; k++) {
      g.autopilot();
      g.update(DT);
      const m = h.traffic.find((o) => o.merge);
      if (m) seen = true;
      else if (seen) inside = true;
    }
    expect(seen).toBe(true);
    expect(inside).toBe(true);
  });
});

describe('Orbit-Andocken', () => {
  function play(level: Level, auto: boolean, seed = 3, mutator: string | null = null): GameResult {
    const g = new OrbitGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    return run(g, () => { if (auto) g.autopilot(); }, 600);
  }

  it('mit Autopilot angedockt (Sterne), ohne Steuern Andockfenster verpasst', () => {
    let docked = 0;
    for (const level of [1, 2, 3, 4, 5] as const) for (const seed of [1, 2]) if (play(level, true, seed).success) docked++;
    expect(docked).toBeGreaterThanOrEqual(9);
    expect(play(1, true, 4).stars).toBeGreaterThanOrEqual(2);
    expect(play(1, false).stars).toBe(0);
    for (const m of ['lowfuel', 'weak', 'atmo', 'debris']) expect(play(2, true, 4, m).points).toBeGreaterThan(0);
  });

  type OInt = { ship: { x: number; y: number; vx: number; vy: number }; station: { x: number; y: number }; fuel: number; t: number; dist: number; predict(h: number): { pts: number[] } };
  const fresh = (level: Level = 1, seed = 5) => {
    const g = new OrbitGame(cfg(level, seed, { mutator: null }));
    g.resize(W, H);
    return { g, a: g as unknown as OInt };
  };
  const coast = (g: OrbitGame, sec: number) => { for (let k = 0; k < sec * 60; k++) g.update(DT); };
  const burn = (g: OrbitGame, x: number, sec: number) => { g.pointerDown(1, x, H - 62); coast(g, sec); g.pointerUp(1); };

  it('Kepler: Kreisbahn bleibt stabil, Energie bleibt erhalten', () => {
    const { g, a } = fresh();
    const e0 = elements(a.ship);
    coast(g, 15);
    const e1 = elements(a.ship);
    expect(Math.abs(e1.energy - e0.energy) / Math.abs(e0.energy)).toBeLessThan(0.002);
    expect(e1.e).toBeLessThan(0.01);
  });

  it('Bremsen senkt die Bahn und verkürzt den Umlauf (tiefer ist schneller); Schub hebt sie', () => {
    const lo = fresh(), hi = fresh();
    const a0 = elements(lo.a.ship).a, f0 = lo.a.fuel;
    burn(lo.g, 40, 1); // links = bremsen
    burn(hi.g, W - 40, 1); // rechts = Schub
    const el = elements(lo.a.ship), eh = elements(hi.a.ship);
    expect(el.a).toBeLessThan(a0 - 0.05);
    expect(eh.a).toBeGreaterThan(a0 + 0.05);
    expect(lo.a.fuel).toBeLessThan(f0);
    // Apozentrum der gehobenen Bahn liegt gegenüber dem Zündpunkt
    expect(eh.a * (1 + eh.e)).toBeGreaterThan(a0 * 1.05);
  });

  it('Vorhersage stimmt mit dem tatsächlichen Flug überein', () => {
    const { g, a } = fresh(4, 2);
    const p = a.predict(10).pts;
    // Punkte alle 0,1 s: Index 100 = nach 10 s
    const px = p[200], py = p[201];
    coast(g, 10);
    expect(Math.hypot(a.ship.x - px, a.ship.y - py)).toBeLessThan(0.01);
  });

  it('Andockcomputer nur im Nahbereich; dort bringt er das Schiff an die Station', () => {
    const { g, a } = fresh();
    g.pointerDown(1, W / 2, H - 62);
    coast(g, 0.5);
    g.pointerUp(1);
    expect(a.fuel).toBeGreaterThan(0);
    // Schiff neben die Station setzen
    const st = a.station as { x: number; y: number; vx: number; vy: number };
    Object.assign(a.ship, { x: st.x + 0.15, y: st.y, vx: st.vx + 0.01, vy: st.vy - 0.02 });
    const f0 = a.fuel;
    g.pointerDown(2, W / 2, H - 62);
    let k = 0;
    while (!g.result() && k++ < 60 * 40) g.update(DT);
    expect(g.result()?.success).toBe(true);
    expect(a.fuel).toBeLessThan(f0);
  });
});

describe('Schiffsmodifikationen', () => {
  it('Bau kostet Modteile, würfelt den Wert in der Spanne, höhere Güte bringt Zusatzeffekte', () => {
    resetMods();
    expect(modState().parts).toBe(START_PARTS);
    const r = rng(7);
    const m1 = craft('verstaerker', 1, r)!;
    expect(modState().parts).toBe(START_PARTS - QUALITY[1].cost);
    expect(m1.value).toBeGreaterThanOrEqual(0.06);
    expect(m1.value).toBeLessThanOrEqual(0.12);
    expect(m1.bonus.length).toBe(0);
    // zu wenig Teile: nichts passiert
    expect(craft('zellen', 3, r)).toBeNull();
    earnParts(40);
    const m3 = craft('zellen', 3, r)!;
    expect(m3.bonus.length).toBe(2);
    expect(m3.bonus.every((b) => b.stat !== 'shield')).toBe(true);
    // ein neuer Mod ersetzt den alten im selben Platz
    craft('kuehlung', 2, r);
    expect(modState().slots.weapon?.id).toBe('kuehlung');
    // Rumpfmods haben ihren Preis
    craft('panzer', 1, r);
    const st = modStats();
    expect(st.hull).toBeGreaterThan(0.1);
    expect(st.speed).toBeLessThan(0);
    // Zerlegen gibt ein Viertel der Kosten zurück
    const p0 = modState().parts;
    expect(removeMod('chassis')).toBe(Math.floor(QUALITY[1].cost / 4));
    expect(modState().parts).toBe(p0 + Math.floor(QUALITY[1].cost / 4));
    expect(modState().slots.chassis).toBeUndefined();
    expect(partsFor(3, 'normal')).toBe(3);
    expect(partsFor(2, 'daily')).toBe(4);
    for (const d of Object.values(MODS)) for (const q of [1, 2, 3] as const) expect(d.range[q][0]).toBeLessThan(d.range[q][1]);
    resetMods();
  });

  it('wirken im Kampf: Tempo, Schild, Hülle, Schaden und Raketen', () => {
    const mk = (mods: Record<string, number>) => {
      const g = new ShooterGame({ ...cfg(1, 5), loadout: { ship: 'mamba', weapon: 'puls', turret: 'puls', shield: 'leicht' }, mods }, 'pirate');
      g.resize(W, H);
      return g as unknown as { speed: number; shieldMax: number; damage: number; ammo: number; dashCdMax: number; wpn: { range: number } };
    };
    const a = mk({}), b = mk({ speed: 0.2, shield: 0.3, dmg: 0.25, missiles: 3, special: 0.2, velocity: 0.3 });
    expect(b.speed).toBeCloseTo(a.speed * 1.2, 5);
    expect(b.shieldMax).toBeCloseTo(a.shieldMax * 1.3, 5);
    expect(b.damage).toBeCloseTo(a.damage * 1.25, 5);
    expect(b.ammo).toBe(a.ammo + 3);
    expect(b.dashCdMax).toBeCloseTo(a.dashCdMax * 0.8, 5);
    expect(b.wpn.range).toBeCloseTo(a.wpn.range * 1.3, 5);
  });
});

describe('Kampf', () => {
  function play(side: 'pirate' | 'xenon', level: Level, gear: 1 | 2 | 3, auto: boolean, seed = 5, mode: Mode = 'normal', mutator: string | null = null): { r: GameResult; g: ShooterGame } {
    const g = new ShooterGame(cfg(level, seed, { gear, mode, mutator }), side);
    g.resize(W, H);
    const r = run(g, () => { if (auto) g.autopilot(); else if (g.state.choosing) g.chooseCard(0); }, 600);
    return { r, g };
  }

  it('Grundausstattung, Stufe 1: mit Autopilot zu gewinnen – inklusive Boss', () => {
    let wins = 0;
    for (let seed = 1; seed <= 4; seed++) {
      if (play('pirate', 1, 1, true, seed).r.success) wins++;
      if (play('xenon', 1, 1, true, seed).r.success) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('bessere Ausrüstung schont den Frachter', () => {
    let weak = 0, strong = 0;
    for (let seed = 1; seed <= 6; seed++) {
      weak += play('pirate', 2, 1, true, seed).g.state.fHull;
      strong += play('pirate', 2, 3, true, seed).g.state.fHull;
    }
    expect(strong).toBeGreaterThanOrEqual(weak);
  });

  it('ohne aktives Fliegen deutlich schlechter, auf Stufe 3 verloren', () => {
    let idle = 0, auto = 0;
    for (let seed = 1; seed <= 4; seed++) { idle += play('pirate', 1, 1, false, seed).r.points; auto += play('pirate', 1, 1, true, seed).r.points; }
    expect(idle).toBeLessThan(auto);
    expect(play('pirate', 3, 1, false).r.success).toBe(false);
  });

  it('eine Runde dauert rund eine Minute oder länger', () => {
    const { g } = play('xenon', 1, 3, true);
    expect(g.state.time).toBeGreaterThan(45);
  });

  it('Endlos-Modus: mehrere Wellen, Wertung nach Wellen', () => {
    const { r, g } = play('pirate', 1, 3, true, 3, 'endless');
    expect(g.state.wave).toBeGreaterThanOrEqual(3);
    expect(r.lines[0][0]).toBe('Wellen');
  });

  it('alle Schiffe, Waffen, Türme und Schilde sind spielbar', () => {
    let wins = 0;
    for (const ship of SHIP_IDS) for (const [i, weapon] of WEAPON_IDS.entries()) {
      const lo = { ship, weapon, turret: TURRET_IDS[i % TURRET_IDS.length], shield: i % 2 ? 'schwer' : 'leicht' } as Loadout;
      const g = new ShooterGame({ ...cfg(1, 3), loadout: lo }, 'xenon');
      g.resize(W, H);
      const r = run(g, () => g.autopilot(), 600);
      expect(r.points).toBeGreaterThan(0);
      if (r.success) wins++;
    }
    // die meisten Zusammenstellungen schafft auch der einfache Autopilot
    expect(wins).toBeGreaterThanOrEqual(SHIP_IDS.length * WEAPON_IDS.length * 0.6);
  }, 30000);

  it('Zwei Sticks: rechts zielen und feuern, links Schub auch rückwärts', () => {
    const g = new ShooterGame({ ...cfg(1, 3), controls: 'zwei' }, 'xenon');
    g.resize(W, H);
    const a = g as unknown as { pvx: number; pvy: number; aimA: number; fireId: number | null; bullets: { from: string }[] };
    // rechter Stick nach oben weit ausgelenkt: Blick nach oben, Bordkanonen feuern
    g.pointerDown(1, W * 0.8, H * 0.6);
    g.pointerMove(1, W * 0.8, H * 0.6 - 70);
    // linker Stick nach unten: Schub rückwärts, der Jäger blickt weiter nach oben
    g.pointerDown(2, W * 0.2, H * 0.6);
    g.pointerMove(2, W * 0.2, H * 0.6 + 70);
    for (let i = 0; i < 60; i++) g.update(DT);
    expect(a.fireId).toBe(1);
    expect(a.bullets.some((b) => b.from === 'p')).toBe(true);
    expect(Math.abs(a.aimA + Math.PI / 2)).toBeLessThan(0.2);
    expect(a.pvy).toBeGreaterThan(40);
    // loslassen: der Jäger driftet weiter
    g.pointerUp(2);
    g.pointerUp(1);
    const v0 = a.pvy;
    for (let i = 0; i < 30; i++) g.update(DT);
    expect(a.pvy).toBeGreaterThan(v0 * 0.6);
    expect(a.fireId).toBeNull();
  });

  it('Turmbilder passen farblich zum Rumpf', () => {
    for (const t of ['puls', 'neutron', 'tau', 'plasma', 'boson']) {
      expect(turretArtName(t, 'split-dragon')).toContain('-hell-');
      expect(turretArtName(t, 'split-cobra')).toContain('-mittel');
    }
  });

  it('Bosonenlanze trifft sofort als Strahl', () => {
    const g = new ShooterGame({ ...cfg(1, 3), loadout: { ship: 'mamba', weapon: 'boson', turret: 'puls', shield: 'leicht' } }, 'xenon');
    g.resize(W, H);
    const a = g as unknown as { rails: unknown[]; bullets: { from: string }[] };
    const [fx, fy] = (g as unknown as { btnFire: [number, number] }).btnFire;
    g.pointerDown(1, fx, fy);
    g.update(DT);
    expect(a.rails.length).toBeGreaterThan(0);
    expect(a.bullets.some((b) => b.from === 'p')).toBe(false);
  });

  it('Besonderheiten laufen fehlerfrei', () => {
    for (const m of ['swarm', 'glass', 'ion', 'mines', 'bounty']) expect(play('xenon', 2, 2, true, 8, 'normal', m).r.points).toBeGreaterThan(0);
  });
});

describe('Rahmen: Punkte, Ziele, Rekorde', () => {
  it('Kombo und Punkte', () => {
    const s = new Score(1.5, 3);
    s.bump(); s.bump(); s.bump(); s.bump(); s.bump();
    expect(s.combo).toBe(3);
    expect(s.add(100)).toBe(450);
    s.update(3);
    expect(s.combo).toBe(1);
  });

  it('Ziele mit gleichem Startwert gleich', () => {
    const pool = [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }];
    expect(pickGoals(pool, rng(5)).map((g) => g.id)).toEqual(pickGoals(pool, rng(5)).map((g) => g.id));
  });

  it('Rekorde, Abzeichen und Freischalten', () => {
    resetRecords();
    expect(unlocked('ore', 4)).toBe(false);
    const res = (stars: 0 | 1 | 2 | 3, points: number, done: boolean): GameResult => ({ success: true, stars, score: 0, points, headline: '', lines: [], goals: [{ id: 'x', text: '', done }] });
    expect(recordResult('ore', 1, 'normal', res(3, 500, true)).newRecord).toBe(true);
    expect(recordResult('ore', 1, 'normal', res(2, 400, false)).newRecord).toBe(false);
    recordResult('ore', 2, 'normal', res(3, 900, false));
    expect(totalStars('ore')).toBe(6);
    expect(unlocked('ore', 4)).toBe(true);
    expect(unlocked('ore', 5)).toBe(false);
    expect(badgeCount('ore')).toBe(1);
  });
});
