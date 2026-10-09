import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { FIELD_STEPS, fieldUp, nextStepCheck, startFieldStep } from '../src/engine/fieldUp';
import { fieldCap, mineRate } from '../src/engine/fleet';
import { SECTOR_MAP } from '../src/data/sectors';
import { SHIP_MAP } from '../src/data/ships';

const silicon = SECTOR_MAP.zhin.fields.find((f) => f.id === 'zhin-silicon')!;

describe('Feldausbau', () => {
  it('Stufe 1: Miner liefert ab, fliegt hin, kartiert eine Stunde – Vorrat +50 %', () => {
    const s = newGame(5, 'mining');
    s.credits = 100_000;
    const cap0 = fieldCap(silicon, s);
    const miner = s.ships[0];
    expect(startFieldStep(s, silicon).ok).toBe(false); // ohne Miner
    const r = startFieldStep(s, silicon, miner.id);
    expect(r.ok, r.msg).toBe(true);
    expect(s.credits).toBe(100_000 - FIELD_STEPS[0].cost);
    for (let t = 0; t < 3 * 3600 && fieldUp(s, silicon.id).level < 1; t += 30) step(s, 30);
    expect(fieldUp(s, silicon.id).level).toBe(1);
    expect(miner.survey).toBeUndefined();
    expect(fieldCap(silicon, s)).toBeCloseTo(cap0 * 1.5, 0);
  }, 60000);

  it('Stufe 2 und 3: brauchen Geld und Material aus einer eigenen Station im Sektor, danach Bauzeit', () => {
    const s = newGame(5, 'mining');
    s.fieldUp = { [silicon.id]: { level: 1 } };
    s.credits = 5_000_000;
    const st = s.stations[0];
    let c = nextStepCheck(s, silicon);
    expect(c.ok).toBe(false);
    expect(Object.keys(c.missing).sort()).toEqual(['claytronics', 'energycells', 'hullparts']);
    Object.assign(st.inventory, { hullparts: 1200, claytronics: 200, energycells: 8000 });
    c = nextStepCheck(s, silicon);
    expect(c.ok).toBe(true);
    expect(startFieldStep(s, silicon).ok).toBe(true);
    expect(st.inventory.hullparts).toBe(900);
    step(s, FIELD_STEPS[1].time + 60);
    expect(fieldUp(s, silicon.id).level).toBe(2);
    // Das Material für Stufe 3 bleibt im Lager reserviert – NPC-Händler kaufen es nicht weg
    const r3 = startFieldStep(s, silicon);
    expect(r3.ok, r3.msg).toBe(true);
    step(s, FIELD_STEPS[2].time + 60);
    expect(fieldUp(s, silicon.id).level).toBe(3);
    // Leeres Feld fördert jetzt mit 50 % statt 25 %
    s.fieldStock = { [silicon.id]: 0 };
    expect(mineRate(s, SHIP_MAP.alligator_min, silicon.id)).toBeCloseTo(SHIP_MAP.alligator_min.miningRate * 0.5, 5);
    expect(nextStepCheck(s, silicon).step).toBeNull();
  }, 60000);
});
