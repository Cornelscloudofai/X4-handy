import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { SAT_COST, deploySatellite, intelAge, isLive, knows, quadrantOf, seenPrice, stepIntel } from '../src/engine/intel';
import { freeTradeJob, fieldLevel, mineRate } from '../src/engine/fleet';
import { knownSectors, marketKey } from '../src/engine/logistics';
import { marketPrice } from '../src/engine/economy';
import { SHIP_MAP } from '../src/data/ships';
import { marketInfo } from '../src/data/sectors';

describe('Marktwissen', () => {
  it('Start: Marktbericht des Heimatsektors, Nachbarsektoren unbekannt; eine Station deckt nur ihren Quadranten', () => {
    const s = newGame(5, 'trading');
    expect(knows(s, 'zhin')).toBe(true);
    expect(knows(s, 'zhin-huette')).toBe(true);
    expect(knows(s, 'tkr')).toBe(false);
    // Station Alpha steht im Nordwesten, die bekannten Stationen anderswo: nur Momentaufnahme, nicht live
    expect(quadrantOf(s.stations[0].x, s.stations[0].z)).toBe(0);
    expect(isLive(s, 'zhin-huette')).toBe(false);
    s.time += 3600;
    expect(intelAge(s, 'zhin-huette')).toBe(3600);
  });

  it('Momentaufnahme bleibt stehen, bis ein Schiff vorbeikommt oder ein Satellit den Quadranten abdeckt', () => {
    const s = newGame(5, 'trading');
    const key = 'zhin-huette';
    const before = seenPrice(s, key, 'energycells');
    s.markets[key].energycells.stock = 0; // echte Lage ändert sich
    expect(seenPrice(s, key, 'energycells')).toBe(before);
    const p = marketInfo(key);
    const q = quadrantOf(p.x, p.z);
    const credits = s.credits;
    expect(deploySatellite(s, 'zhin', q).ok).toBe(true);
    expect(s.credits).toBe(credits - SAT_COST);
    expect(isLive(s, key)).toBe(true);
    expect(seenPrice(s, key, 'energycells')).toBe(marketPrice(s, key, 'energycells'));
    expect(deploySatellite(s, 'zhin', q).ok).toBe(false); // schon abgedeckt
  });

  it('vorbeifliegende Schiffe erfassen Stationen', () => {
    const s = newGame(5, 'trading');
    const sh = s.ships[0];
    const p = marketInfo('tkr');
    sh.sector = 'tkr'; sh.x = p.x + 5; sh.z = p.z;
    expect(knows(s, 'tkr')).toBe(false);
    stepIntel(s, 10);
    expect(knows(s, 'tkr')).toBe(true);
  });

  it('Autohandel handelt nur mit bekannten Stationen', () => {
    const s = newGame(5, 'trading');
    const sh = s.ships[0];
    sh.trips = 500; // Rang 5: Reichweite überall – aber nur Bekanntes
    for (let i = 0; i < 10; i++) {
      const j = freeTradeJob(s, sh, knownSectors(s));
      if (!j) continue;
      for (const ep of [j.from, j.to]) if (ep.kind === 'market') expect(knows(s, marketKey(ep))).toBe(true);
    }
  });

  it('Rohstofffelder erschöpfen sich beim Abbau und wachsen nach', () => {
    const s = newGame(5, 'mining');
    const cls = SHIP_MAP.alligator_min;
    step(s, 3 * 3600);
    const id = Object.keys(s.fieldStock ?? {})[0];
    expect(id).toBeTruthy();
    expect(fieldLevel(s, id)).toBeLessThan(1);
    expect(mineRate(s, cls, id)).toBeLessThan(cls.miningRate);
    s.ships = [];
    const low = fieldLevel(s, id);
    step(s, 3600);
    expect(fieldLevel(s, id)).toBeGreaterThan(low);
  }, 60000);

  it('alte Spielstände (ohne Startwahl) sehen weiter alles', () => {
    const s = newGame(5);
    expect(knows(s, 'tkr')).toBe(true);
    expect(isLive(s, 'zhin-huette')).toBe(true);
  });
});
