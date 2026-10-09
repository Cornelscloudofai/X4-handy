import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { acceptContract } from '../src/engine/contracts';
import { buyShip } from '../src/engine/actions';
import { LEDGER_MAX } from '../src/engine/ledger';

describe('Kontobuch', () => {
  for (const kind of ['mining', 'trading'] as const) {
    it(`${kind}: jede Änderung des Guthabens steht im Kontobuch (Summe passt)`, () => {
      const s = newGame(5, kind);
      const start = s.credits;
      for (let t = 0; t < 3 * 3600; t += 60) {
        for (const c of s.contracts) if (c.status === 'offer' && c.size) acceptContract(s, c.id);
        step(s, 60);
      }
      if (s.credits > 200_000) buyShip(s, 'tuatara', s.stations[0].id);
      step(s, 600);
      const sum = (s.ledger ?? []).reduce((a, e) => a + e.amount, 0);
      expect((s.ledger ?? []).length).toBeLessThan(LEDGER_MAX);
      expect(sum).toBeCloseTo(s.credits - start, 0);
      // Jede Buchung hat einen Grund
      for (const e of s.ledger ?? []) expect(e.text.length).toBeGreaterThan(3);
    }, 60000);
  }
});
