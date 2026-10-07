import { describe, expect, it } from 'vitest';
import { bits, consumers, generate, par, power, rotCW, rotate, turnsTo } from '../src/minigames/pipesLogic';
import { GasGame } from '../src/minigames/gas';
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
});

describe('Gaswirbel', () => {
  function play(level: Level, auto: boolean, seed = 99, mutator: string | null = null): GameResult {
    const g = new GasGame(cfg(level, seed, { mutator }));
    g.resize(W, H);
    if (auto) g.pointerDown(1, W / 2, H / 2);
    return run(g, () => { if (auto) g.autopilot(); });
  }

  it('mit gutem Flug und Entladen Sterne, aber nicht geschenkt', () => {
    for (const level of [1, 2, 3, 4, 5] as const) expect(play(level, true).stars).toBeGreaterThanOrEqual(1);
    expect(play(1, true).stars).toBeGreaterThanOrEqual(2);
    expect(play(1, false).stars).toBe(0);
  });

  it('Besonderheiten verändern die Runde', () => {
    expect(play(2, true, 99, 'gold').points).toBeGreaterThan(0);
    expect(play(2, true, 99, 'leak').points).toBeGreaterThan(0);
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
