import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { H, HISTORY_EVERY, HISTORY_MAX, series } from '../src/engine/history';

describe('Verlaufsdaten', () => {
  it('misst alle 5 Spielminuten und behält 24 Stunden', () => {
    const s = newGame();
    step(s, 3600);
    const h = s.history!;
    expect(h.times.length).toBeGreaterThanOrEqual(12);
    expect(h.times.length).toBeLessThanOrEqual(14);
    for (let i = 1; i < h.times.length; i++) expect(h.times[i] - h.times[i - 1]).toBeGreaterThanOrEqual(HISTORY_EVERY - 2);
    // Alle Reihen gleich lang wie die Zeitpunkte
    for (const arr of Object.values(h.s)) expect(arr.length).toBe(h.times.length);
    expect(series(s, H.credits, 1)!.values.length).toBeGreaterThan(5);
    step(s, 26 * 3600);
    expect(s.history!.times.length).toBe(HISTORY_MAX);
  });

  it('bleibt im Spielstand erhalten und klein', () => {
    const s = newGame();
    step(s, 24 * 3600);
    const json = serialize(s);
    const back = deserialize(json);
    expect(back.history?.times.length).toBe(s.history!.times.length);
    // Verlaufsdaten machen den Spielstand nicht riesig
    expect(JSON.stringify(s.history).length).toBeLessThan(400_000);
  });
});
