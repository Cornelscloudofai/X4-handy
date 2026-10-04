import { describe, expect, it } from 'vitest';
import { bits, consumers, generate, par, power, rotCW, rotate, turnsTo } from '../src/minigames/pipesLogic';
import { GasGame } from '../src/minigames/gas';
import { OreGame } from '../src/minigames/ore';
import { ShooterGame } from '../src/minigames/shooter';
import type { GameResult, MiniGame } from '../src/minigames/common';

const W = 390, H = 780, DT = 1 / 60;

/** Spiel laufen lassen, bis ein Ergebnis da ist */
function run(g: MiniGame, each: (t: number) => void = () => {}, max = 200): GameResult {
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

describe('Rohr-Puzzle', () => {
  it('Drehung: viermal ergibt das Ausgangsstück', () => {
    for (let m = 0; m < 16; m++) expect(rotCW(rotCW(rotCW(rotCW(m))))).toBe(m);
    expect(bits(rotCW(0b0011))).toBe(2);
  });

  it('erzeugt lösbare, verdrehte Rätsel', () => {
    for (const n of [5, 6, 7]) for (let seed = 1; seed < 40; seed++) {
      const b = generate(n, seed);
      // Lösung versorgt alles, ohne Lecks
      const solved = { ...b, mask: b.solution.slice() };
      expect(power(solved).solved).toBe(true);
      // Baum: genau n²−1 Verbindungen
      expect(b.solution.reduce((s, m) => s + bits(m), 0)).toBe(2 * (n * n - 1));
      expect(power(b).solved).toBe(false);
      expect(par(b)).toBeGreaterThan(n);
      expect(consumers(b).length).toBeGreaterThanOrEqual(2);
      expect(b.locked[b.source]).toBe(true);
    }
  });

  it('gleicher Startwert, gleiches Rätsel', () => {
    expect(generate(6, 42).mask).toEqual(generate(6, 42).mask);
  });

  it('mit der Mindestzahl Drehungen gelöst', () => {
    const b = generate(6, 7);
    let taps = 0;
    for (let i = 0; i < b.mask.length; i++) {
      const k = turnsTo(b.mask[i], b.solution[i]);
      for (let j = 0; j < k; j++) { rotate(b, i); taps++; }
    }
    expect(taps).toBe(par(generate(6, 7)));
    expect(power(b).solved).toBe(true);
  });
});

describe('Bergbau (Erz)', () => {
  function play(level: 1 | 2 | 3, skilled: boolean): GameResult {
    const g = new OreGame(level, 1234);
    g.resize(W, H);
    let holding = false;
    return run(g, () => {
      const heat = (g as unknown as { heat: number }).heat;
      const over = (g as unknown as { overheated: boolean }).overheated;
      const touch = g.debugVeinTouch();
      if (skilled && touch && !over && heat < 85) {
        if (!holding) { g.pointerDown(1, ...touch); holding = true; } else g.pointerMove(1, ...touch);
      } else if (holding) { g.pointerUp(1); holding = false; }
    });
  }

  it('wer den Adern folgt, schafft mindestens zwei Sterne', () => {
    expect(play(1, true).stars).toBeGreaterThanOrEqual(2);
    expect(play(3, true).stars).toBeGreaterThanOrEqual(1);
  });

  it('ohne Abbau keine Sterne', () => {
    const r = play(1, false);
    expect(r.stars).toBe(0);
    expect(r.success).toBe(false);
  });
});

describe('Gaswirbel', () => {
  function play(level: 1 | 2 | 3, auto: boolean): GameResult {
    const g = new GasGame(level, 99);
    g.resize(W, H);
    if (auto) g.pointerDown(1, W / 2, H / 2);
    return run(g, () => { if (auto) g.autopilot(); });
  }

  it('mit gutem Flug zwei bis drei Sterne, aber nicht geschenkt', () => {
    for (const level of [1, 2, 3] as const) {
      const r = play(level, true);
      expect(r.stars).toBeGreaterThanOrEqual(2);
    }
    expect(play(1, false).stars).toBe(0);
  });
});

describe('Kampf', () => {
  function play(side: 'pirate' | 'xenon', level: 1 | 2 | 3, gear: 1 | 2 | 3, auto: boolean, seed = 5): { r: GameResult; g: ShooterGame } {
    const g = new ShooterGame(level, seed, side, { weapon: gear, shield: gear, engine: gear });
    g.resize(W, H);
    const r = run(g, () => { if (auto) g.autopilot(); }, 400);
    return { r, g };
  }

  it('Grundausstattung, Stufe 1: mit Autopilot zu gewinnen', () => {
    expect(play('pirate', 1, 1, true).r.success).toBe(true);
    expect(play('xenon', 1, 1, true).r.success).toBe(true);
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
    expect(play('pirate', 1, 1, false).r.stars).toBeLessThan(play('pirate', 1, 1, true).r.stars);
    const { r } = play('pirate', 3, 1, false);
    expect(r.success).toBe(false);
    expect(r.stars).toBe(0);
  });

  it('der Flug zum Tor dauert rund eine Minute', () => {
    const { g } = play('xenon', 1, 3, true);
    expect((g as unknown as { time: number }).time).toBeGreaterThan(50);
  });
});
