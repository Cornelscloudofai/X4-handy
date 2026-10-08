import { describe, expect, it } from 'vitest';
import { START_KIT, newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';

describe('Spielstart', () => {
  for (const kind of ['mining', 'trading'] as const) {
    it(`${kind}: kleine Station, wenig Geld, ein Schiff – und es verdient langsam Geld`, () => {
      const s = newGame(5, kind);
      expect(s.start).toBe(kind);
      expect(s.credits).toBe(START_KIT[kind].credits);
      expect(s.stations[0].modules.map((m) => m.def).sort()).toEqual(['core', 'dock_m', 'storage_container', 'storage_solid']);
      expect(s.ships.map((x) => x.cls)).toEqual([START_KIT[kind].ship]);
      step(s, 2 * 3600);
      const perHour = (s.credits - START_KIT[kind].credits) / 2;
      expect(perHour).toBeGreaterThan(40_000);
      expect(perHour).toBeLessThan(250_000);
    }, 60000);
  }

  it('beide Starts sind ähnlich lohnend', () => {
    const gain = (k: 'mining' | 'trading') => {
      const s = newGame(5, k);
      step(s, 4 * 3600);
      return s.credits - START_KIT[k].credits;
    };
    const m = gain('mining');
    const t = gain('trading');
    expect(Math.max(m, t) / Math.min(m, t)).toBeLessThan(2);
  }, 60000);
});
