// Xenon-Wellen nach Stufe: Stufe 1 ohne Xenon K, ab Stufe 2 einer am Ende, ab Stufe 4 dazu einer in Welle 3; dazwischen mehr Korvetten,
// Fregatten und Schwärme. Großkampfschiffe tauchen außerhalb der eigenen Reichweite und mit Platz zum Kartenrand auf.
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, type ShipId } from '../src/minigames/loadout';

const DT = 1 / 60;
type E = { kind: string; x: number; y: number; r: number; mini?: boolean };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; spawnWave(): void; spawnBoss(mini?: boolean, from?: number): void;
  enemies: E[]; reinforce: { kinds: string[]; full?: boolean }[]; wave: number; nWaves: number; isBossWave(i: number): boolean;
  waveKinds(i: number): string[]; swarms(i: number): number[]; px: number; py: number; WW: number; WH: number; ownReach: number;
  ship: { size: number }; clusters: Map<unknown, unknown>;
};
const game = (level: number, ship: ShipId = 'dragon', side = 'xenon', seed = 3): G => {
  const g = new ShooterGame({ level, seed, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: ship === 'raptor' ? { mamba: 4 } : {}, ship } } as never, side as never) as unknown as G;
  g.resize(390, 780);
  g.update(DT);
  return g;
};
/** Großkampfschiffe je Welle (sofort und als Verstärkung geplant) */
const bigsPerWave = (g: G): number[] => {
  const out: number[] = [];
  while (g.wave < g.nWaves - 1) {
    g.enemies.length = 0;
    g.spawnWave();
    out.push(g.enemies.filter((e) => e.kind === 'boss').length + g.reinforce.filter((r) => r.kinds[0] === 'boss').length);
  }
  return out;
};

describe('Xenon-Wellen nach Stufe', () => {
  it('Stufe 1: kein Xenon K, in keiner Welle', () => {
    for (const ship of ['mamba', 'dragon', 'cobra'] as const) {
      const b = bigsPerWave(game(1, ship));
      expect(b.every((n) => n === 0), `${ship}: ${b}`).toBe(true);
    }
  });
  it('Stufe 2 und 3: genau ein Xenon K, in der letzten Welle', () => {
    for (const level of [2, 3]) {
      const b = bigsPerWave(game(level));
      expect(b.slice(0, -1).every((n) => n === 0), `${level}: ${b}`).toBe(true);
      expect(b[b.length - 1]).toBe(1);
    }
  });
  it('ab Stufe 4: ein Xenon K in der mittleren Welle (Welle 3) und einer in der letzten – nie beide zugleich', () => {
    for (const level of [4, 5]) for (const ship of ['dragon', 'mamba'] as const) {
      const g = game(level, ship), b = bigsPerWave(g);
      const mid = Math.floor((g.nWaves - 1) / 2);
      expect(mid, `${ship}: ${g.nWaves} Wellen`).toBe(2);
      expect(b, `${level}/${ship}`).toEqual(b.map((_, i) => (i === mid || i === b.length - 1 ? 1 : 0)));
    }
  });
  it('mit der Stufe mehr Korvetten und Fregatten, mehr und größere Schwärme', () => {
    const stats = (level: number) => {
      let mp = 0, sw = 0, swShips = 0, waves = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const g = game(level, 'dragon', 'xenon', seed);
        for (let i = 1; i < 5; i++) {
          waves++;
          mp += g.waveKinds(i).filter((k) => k === 'm' || k === 'p').length;
          const s = g.swarms(i); sw += s.length; swShips += s.reduce((a, b) => a + b, 0);
        }
      }
      return { mp: mp / waves, sw: sw / waves, size: swShips / sw };
    };
    const [a, b, c] = [stats(1), stats(3), stats(5)];
    expect(b.mp).toBeGreaterThan(a.mp);
    expect(c.mp).toBeGreaterThan(b.mp);
    expect(b.sw).toBeGreaterThan(a.sw);
    expect(c.sw).toBeGreaterThan(b.sw);
    expect(c.size).toBeGreaterThan(a.size);
    // Stufe 1: viele kleine – Schwärme auch gegen die Mamba
    expect(game(1, 'mamba').swarms(1).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Großkampfschiffe: Platz und Abstand', () => {
  it('Xenon K nie am Kartenrand – rundherum Platz, um jeden Turm zu erreichen', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = game(3, 'dragon', 'xenon', seed);
      // eigenes Schiff in einer Ecke: der K würde sonst über den Rand gedrückt
      g.px = 300; g.py = 300;
      g.enemies.length = 0;
      g.spawnBoss(seed % 2 === 0, seed % 5);
      const b = g.enemies.find((e) => e.kind === 'boss')!;
      const m = Math.min(b.x, b.y, g.WW - b.x, g.WH - b.y);
      expect(m, `Start ${seed}`).toBeGreaterThanOrEqual(b.r + 500);
    }
  });
  it('Raptor: Brutschiff und Zerstörer tauchen außerhalb seiner Reichweite auf', () => {
    for (const mini of [false, true]) for (let seed = 1; seed <= 6; seed++) {
      const g = game(2, 'raptor', 'khaak', seed);
      g.enemies.length = 0;
      g.spawnBoss(mini, seed % 5);
      const b = g.enemies.find((e) => e.kind === 'boss')!;
      expect(Math.hypot(b.x - g.px, b.y - g.py) - b.r, `${mini ? 'Zerstörer' : 'Brutschiff'} ${seed}`).toBeGreaterThan(g.ship.size * 0.5 + g.ownReach);
    }
  });
  it('die Karte ist mindestens 9 km groß, für lange Schiffe das Dreifache ihrer Länge', () => {
    expect(game(1).WW).toBeGreaterThanOrEqual(9000);
    const r = game(1, 'raptor');
    expect(r.WW).toBeGreaterThanOrEqual(r.ship.size * 3);
  });
});
