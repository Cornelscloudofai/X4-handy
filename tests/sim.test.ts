import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { buyShip, queueModule, foundStation, setTradeRule } from '../src/engine/actions';
import { freeUnits, marketPrice, priceAt, storageCap, wareLimit } from '../src/engine/economy';
import { WARES, outputPerHour } from '../src/data/wares';
import { MODULE_MAP } from '../src/data/modules';
import { insideHex, sectorPath } from '../src/data/sectors';
import * as storyApi from '../src/engine/story';
import { claimMission, currentMission, missionComplete } from '../src/engine/story';

describe('Daten', () => {
  it('nutzt echte X4-Rezepte', () => {
    expect(WARES.refinedmetals.inputs).toEqual([{ ware: 'energycells', amount: 90 }, { ware: 'ore', amount: 240 }]);
    expect(outputPerHour('refinedmetals')).toBeCloseTo(2112);
    expect(outputPerHour('energycells', 140)).toBeCloseTo(14700);
  });
  it('berechnet Modulkosten aus Baumaterialien', () => {
    const m = MODULE_MAP.prod_refinedmetals;
    expect(m.cost).toBe(Math.round(36 * 2040 + 73 * 16 + 135 * 209));
    expect(m.buildTime).toBe(514);
  });
  it('findet Wege über Sprungtore', () => {
    expect(sectorPath('ravine', 'hoa')[0]).toBe('ravine');
    expect(sectorPath('ravine', 'hoa').at(-1)).toBe('hoa');
    expect(insideHex(0, 0, 200)).toBe(true);
    expect(insideHex(199, 0, 200)).toBe(true);
    expect(insideHex(0, 190, 200)).toBe(false);
  });
});

describe('Wirtschaft', () => {
  it('Preis steigt bei knappem Bestand', () => {
    expect(priceAt('ore', 0)).toBe(WARES.ore.price.max);
    expect(priceAt('ore', 1)).toBe(WARES.ore.price.min);
  });
  it('teilt Lager gleichmäßig auf', () => {
    const s = newGame(1);
    const st = s.stations[0];
    expect(storageCap(st).Solid).toBe(100000);
    expect(wareLimit(st, 'ore')).toBeGreaterThan(0);
    expect(freeUnits(st, 'energycells')).toBeGreaterThan(0);
  });
});

describe('Simulation', () => {
  it('Miner fördert Erz und die Raffinerie produziert', () => {
    const s = newGame(42);
    const st = s.stations[0];
    expect(queueModule(s, st.id, 'prod_refinedmetals').ok).toBe(true);
    step(s, 3 * 3600);
    expect(st.modules.some((m) => m.def === 'prod_refinedmetals')).toBe(true);
    expect(s.totals.mined.ore ?? 0).toBeGreaterThan(1000);
    expect(s.totals.produced.refinedmetals ?? 0).toBeGreaterThan(500);
    expect(missionComplete(s)).toBe(true);
    expect(claimMission(s).ok).toBe(true);
    expect(currentMission(s)?.id).toBe('metals');
  });

  it('Transporter verkaufen Überschüsse, NPC-Händler handeln', () => {
    const s = newGame(7);
    const st = s.stations[0];
    queueModule(s, st.id, 'prod_refinedmetals');
    buyShip(s, 'alligator_min', st.id);
    buyShip(s, 'boa', st.id);
    const credits0 = s.credits;
    step(s, 8 * 3600);
    expect(s.totals.sold).toBeGreaterThan(0);
    expect(s.credits).toBeGreaterThan(credits0 * 0.9);
    const trader = s.ships.find((x) => x.cls === 'boa')!;
    expect(trader.trips).toBeGreaterThan(0);
  });

  it('Stationen versorgen sich gegenseitig', () => {
    const s = newGame(3);
    s.credits = 50_000_000;
    const a = s.stations[0];
    queueModule(s, a.id, 'prod_refinedmetals');
    queueModule(s, a.id, 'storage_container');
    const r = foundStation(s, 'zhin', 60, -60);
    expect(r.ok).toBe(true);
    const b = s.stations.find((x) => x.id === r.id)!;
    for (const d of ['storage_container', 'dock_m', 'prod_energycells', 'prod_graphene', 'storage_liquid']) queueModule(s, b.id, d);
    s.blueprints.push('prod_hullparts');
    queueModule(s, b.id, 'prod_hullparts');
    buyShip(s, 'alligator_gas', b.id);
    buyShip(s, 'alligator_min', a.id);
    buyShip(s, 'boa', a.id);
    setTradeRule(s, b.id, 'refinedmetals', { buy: true });
    step(s, 12 * 3600);
    expect(s.totals.produced.graphene ?? 0).toBeGreaterThan(0);
    expect(s.totals.produced.hullparts ?? 0).toBeGreaterThan(0);
  });

  it('Spielstand bleibt beim Speichern erhalten', () => {
    const s = newGame(9);
    step(s, 600);
    const copy = deserialize(serialize(s));
    expect(copy.time).toBe(s.time);
    expect(copy.stations[0].inventory).toEqual(s.stations[0].inventory);
    expect(marketPrice(copy, 'zhin', 'ore')).toBeCloseTo(marketPrice(s, 'zhin', 'ore'));
  });
});

describe('Aufträge', () => {
  it('Transporter liefern Story-Aufträge auch aus einer Nachbarstation vollständig aus', () => {
    const s = newGame(5);
    s.credits = 20_000_000;
    const a = s.stations[0];
    const r = foundStation(s, 'zhin', 60, 55);
    const b = s.stations.find((x) => x.id === r.id)!;
    for (const d of ['storage_container', 'dock_m']) queueModule(s, b.id, d);
    step(s, 1800);
    // Kapitel 7 „Werftbedarf“ direkt starten
    while (currentMission(s)?.id !== 'hull') s.story.index++;
    storyApi.startMission(s);
    setTradeRule(s, b.id, 'hullparts', { sell: true });
    b.inventory.hullparts = 1500;
    buyShip(s, 'boa', a.id);
    step(s, 4 * 3600);
    expect(currentMission(s)?.progress(s).cur).toBe(1500);
    expect(missionComplete(s)).toBe(true);
  });
});
