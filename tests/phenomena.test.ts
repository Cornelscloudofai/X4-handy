import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { SECTOR_MAP } from '../src/data/sectors';
import { discover, deliverOutpost, buyOutpostRest, outpostState, OUTPOST_WARES } from '../src/engine/explore';
import { STORM_TIME as STORM_TIME_FULL, STORM_CYCLE, pulsarSun, sectorSpeed, stormActive, stepPhenomena, fieldMining, DUST_MINING } from '../src/engine/phenomena';
import { moveAlong } from '../src/engine/logistics';
import { isLive } from '../src/engine/intel';
import { mineRate } from '../src/engine/fleet';
import { SHIP_MAP } from '../src/data/ships';
import { queueModule } from '../src/engine/actions';
import { vendorsFor } from '../src/data/vendors';

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

  it('Glutsee I: 1000 % Sonne, im Sturm 3000 %; ohne Kühlmantel überhitzt die Station', () => {
    const s = glut(5);
    let t = 0;
    while (stormActive(t)) t += 60;
    s.time = t;
    stepPhenomena(s);
    expect(SECTOR_MAP['f-glut1'].sunlight).toBe(1000);
    // Station in Glutsee I mit Solarkraftwerk, ohne Mantel
    const st = s.stations[0];
    st.sector = 'f-glut1';
    st.modules.push({ ...st.modules[0], uid: 9001, def: 'prod_energycells', util: 1, running: false, stall: '', t: 0 });
    // in den Sturm hinein
    while (!stormActive(s.time + 60)) s.time += 60;
    step(s, 600);
    expect(SECTOR_MAP['f-glut1'].sunlight).toBe(3000);
    expect(st.heat).toBeGreaterThan(0);
    const made = st.produced.energycells ?? 0;
    step(s, 300);
    expect(st.produced.energycells ?? 0).toBe(made);
    // Reparatur mit Hüllenteilen nach dem Sturm
    st.inventory.hullparts = 500;
    step(s, 3600);
    expect(st.heat).toBe(0);
  });

  it('Mit Kühlmantel und Kühlmittel läuft die Station im Sturm weiter (Kühlmittel wird verbraucht)', () => {
    const s = glut(6);
    const st = s.stations[0];
    st.sector = 'f-glut1';
    st.modules.push({ ...st.modules[0], uid: 9001, def: 'prod_energycells', util: 1, running: false, stall: '', t: 0 });
    st.modules.push({ ...st.modules[0], uid: 9002, def: 'cooling_mantle', util: 1, running: false, stall: '', t: 0 });
    st.inventory.superfluidcoolant = 300;
    s.time = 0;
    while (!stormActive(s.time)) s.time += 60;
    s.time -= 60;
    step(s, STORM_TIME_FULL);
    expect(st.heat ?? 0).toBe(0);
    // ein Produktionsmodul: 40 Kühlmittel je Sturm
    expect(st.inventory.superfluidcoolant).toBeGreaterThan(255);
    expect(st.inventory.superfluidcoolant).toBeLessThan(265);
  });

  it('Ein Kühlmantel schützt höchstens 6 Produktionsmodule; Sonnenöfen laufen im Sturm doppelt so schnell', () => {
    const s = glut(9);
    const st = s.stations[0];
    st.sector = 'f-glut1';
    const mod = (uid: number, def: string) => ({ ...st.modules[0], uid, def, util: 1, running: false, stall: '' as const, t: 0 });
    for (let i = 0; i < 7; i++) st.modules.push(mod(9100 + i, 'prod_glutglas'));
    st.modules.push(mod(9200, 'cooling_mantle'));
    st.inventory = { superfluidcoolant: 1000, silicon: 2000, energycells: 10000 };
    st.modules.push(mod(9300, 'storage_container_l'), mod(9301, 'storage_solid_l'));
    s.time = 0;
    while (!stormActive(s.time)) s.time += 60;
    s.time -= 60;
    step(s, 600);
    expect(st.heat).toBeGreaterThan(0);
    st.inventory = { superfluidcoolant: 1000, silicon: 2000, energycells: 10000 };
    // mit zweitem Mantel geschützt – und im Sturm doppelt so schnell
    st.heat = 0;
    st.modules.push(mod(9201, 'cooling_mantle'));
    s.time += STORM_CYCLE;
    while (stormActive(s.time)) s.time += 60;
    const t0 = s.time;
    const before = st.produced.glutglas ?? 0;
    st.inventory = { superfluidcoolant: 1000, silicon: 2000, energycells: 40000 };
    step(s, 3700);
    const calm = (st.produced.glutglas ?? 0) - before;
    s.time = t0;
    while (!stormActive(s.time + 60)) s.time += 60;
    step(s, 60); // Uhr der Kühlung auf die neue Zeit setzen
    st.inventory = { superfluidcoolant: 1000, silicon: 2000, energycells: 40000 };
    const b2 = st.produced.glutglas ?? 0;
    step(s, 1800);
    const stormy = (st.produced.glutglas ?? 0) - b2;
    expect(st.heat ?? 0).toBe(0);
    expect(calm).toBeGreaterThan(0);
    // im Sturm schafft ein Ofen in einer halben Stunde so viel wie sonst in einer Stunde
    expect(stormy).toBeGreaterThanOrEqual(calm);
  });

  it('Sonnenofen nur in Glutsee I, Baupläne nur bei der Familie Rhak, Glutglas nicht im Split-Raum', () => {
    const s = glut(7);
    s.blueprints.push('prod_glutglas');
    expect(queueModule(s, s.stations[0].id, 'prod_glutglas').ok).toBe(false);
    s.stations[0].sector = 'f-glut1';
    expect(queueModule(s, s.stations[0].id, 'prod_glutglas').ok).toBe(true);
    expect(vendorsFor('prod_glutglas').map((v) => v.id)).toEqual(['v-rhak']);
    expect(vendorsFor('cooling_mantle').map((v) => v.id)).toEqual(['v-rhak']);
    expect(s.markets.zhin.glutglas).toBeUndefined();
    expect(s.markets['f-rhak'].glutglas).toBeDefined();
    const fresh = newGame(8, 'mining');
    expect(vendorsFor('prod_glutglas')).toEqual([]);
    expect(fresh.markets.zhin.glutglas).toBeUndefined();
  });
});
