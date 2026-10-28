import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { SECTOR_MAP } from '../src/data/sectors';
import { discover, deliverOutpost, buyOutpostRest, outpostState, OUTPOST_WARES } from '../src/engine/explore';
import { STORM_CYCLE, pulsarSun, sectorSpeed, stormActive, stepPhenomena, fieldMining, DUST_MINING } from '../src/engine/phenomena';
import { moveAlong } from '../src/engine/logistics';
import { isLive } from '../src/engine/intel';
import { mineRate } from '../src/engine/fleet';
import { SHIP_MAP } from '../src/data/ships';

const glut = (seed: number) => {
  const s = newGame(seed, 'mining');
  for (const id of ['f-ausblick', 'f-glut1', 'f-asche', 'f-rhak', 'f-schmiede']) discover(s, id);
  return s;
};

describe('Eigenheiten der Glutsee', () => {
  it('Strahlungssturm in Glutsee I: kommt regelmäßig und bremst Schiffe dort', () => {
    const s = glut(1);
    let storm = 0;
    for (let t = 0; t < STORM_CYCLE; t += 60) if (stormActive(t)) storm += 60;
    expect(storm).toBeGreaterThan(30 * 60);
    expect(storm).toBeLessThan(40 * 60);
    // Zeitpunkt im Sturm suchen
    let t = 0;
    while (!stormActive(t)) t += 60;
    s.time = t;
    stepPhenomena(s);
    expect(sectorSpeed('f-glut1')).toBeLessThan(1);
    const a = { sector: 'f-glut1', x: 0, z: 0, heading: 0, path: [{ sector: 'f-glut1', x: 100, z: 0 }] };
    const b = { sector: 'zhin', x: 0, z: 0, heading: 0, path: [{ sector: 'zhin', x: 100, z: 0 }] };
    moveAlong(a, 1, 10);
    moveAlong(b, 1, 10);
    expect(a.x).toBeCloseTo(b.x * 0.6, 5);
  });

  it('Aschefelder: Staub bremst, Miner fördern mehr', () => {
    const s = glut(2);
    stepPhenomena(s);
    expect(sectorSpeed('f-asche')).toBe(0.8);
    expect(fieldMining('asche-ore')).toBe(DUST_MINING);
    const cls = SHIP_MAP.alligator_min;
    expect(mineRate(s, cls, 'asche-ore') / mineRate(s, cls, 'zhin-ore')).toBeCloseTo(DUST_MINING, 5);
  });

  it('Schmiedestern: Sonnenlicht schwankt mit dem Pulsar zwischen 60 und 300 %', () => {
    const vals = Array.from({ length: 48 }, (_, i) => pulsarSun(i * 300));
    expect(Math.min(...vals)).toBeLessThan(70);
    expect(Math.max(...vals)).toBeGreaterThan(290);
    const s = glut(3);
    step(s, 1800);
    expect(SECTOR_MAP['f-schmiede'].sunlight).toBe(pulsarSun(s.time));
  });

  it('Horchposten: Waren liefern, dann ist die Glutsee live sichtbar', () => {
    const s = glut(4);
    expect(outpostState(s)!.done).toBe(false);
    expect(isLive(s, 'f-rhak')).toBe(false);
    const st = s.stations[0];
    st.inventory.hullparts = 1000;
    expect(deliverOutpost(s).ok).toBe(true);
    expect(outpostState(s)!.have.hullparts).toBe(OUTPOST_WARES.hullparts);
    expect(outpostState(s)!.done).toBe(false);
    s.credits = 10e6;
    expect(buyOutpostRest(s).ok).toBe(true);
    expect(outpostState(s)!.done).toBe(true);
    expect(isLive(s, 'f-rhak')).toBe(true);
    expect(isLive(s, 'rhak-werft')).toBe(true);
    expect(deliverOutpost(s).ok).toBe(false);
  });
});
