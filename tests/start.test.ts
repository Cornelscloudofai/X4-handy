import { describe, expect, it } from 'vitest';
import { START_KIT, newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { acceptContract } from '../src/engine/contracts';
import type { GameState } from '../src/engine/types';

/** Spielt wie im ersten Kapitel angeleitet: Handel nimmt Lieferaufträge an, Bergbau lässt den Miner arbeiten */
function play(s: GameState, hours: number): void {
  for (let t = 0; t < hours * 3600; t += 60) {
    if (s.start === 'trading') for (const c of s.contracts) if (c.status === 'offer' && c.size) acceptContract(s, c.id);
    step(s, 60);
  }
}

describe('Spielstart', () => {
  for (const kind of ['mining', 'trading'] as const) {
    it(`${kind}: kleine Station, wenig Geld, ein Schiff – und es verdient langsam Geld`, () => {
      const s = newGame(5, kind);
      expect(s.start).toBe(kind);
      expect(s.credits).toBe(START_KIT[kind].credits);
      expect(s.stations[0].modules.map((m) => m.def).sort()).toEqual(['core', 'dock_m', 'storage_container', 'storage_solid']);
      expect(s.ships.map((x) => x.cls)).toEqual([START_KIT[kind].ship]);
      play(s, 2);
      const perHour = (s.credits - START_KIT[kind].credits) / 2;
      expect(perHour).toBeGreaterThan(40_000);
      expect(perHour).toBeLessThan(450_000);
    }, 60000);
  }

  it('beide Starts sind ähnlich lohnend', () => {
    const gain = (k: 'mining' | 'trading') => {
      const s = newGame(5, k);
      play(s, 4);
      return s.credits - START_KIT[k].credits;
    };
    const m = gain('mining');
    const t = gain('trading');
    // Bergbau versorgt hungrige Fabriken (S-Lager, Höchstpreis) – Handel mit Aufträgen soll in derselben Größenordnung liegen
    expect(Math.max(m, t) / Math.min(m, t)).toBeLessThan(2.5);
  }, 60000);

});
