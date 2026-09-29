import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { buyShip, cancelQueued, foundStation, moveQueued, queueModule, setTradeRule, unqueueLast } from '../src/engine/actions';
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

describe('Bauliste', () => {
  it('plant ohne Vorkasse, bezahlt beim Baustart und hält die Reihenfolge ein', () => {
    const s = newGame(11);
    const st = s.stations[0];
    const c0 = s.credits;
    const a = queueModule(s, st.id, 'prod_refinedmetals');
    const b = queueModule(s, st.id, 'storage_container');
    const c = queueModule(s, st.id, 'storage_liquid', 0); // vor alle anderen
    expect(s.credits).toBe(c0);
    expect(st.queue.map((q) => q.uid)).toEqual([c.uid, a.uid, b.uid]);
    moveQueued(s, st.id, b.uid!, 1);
    expect(st.queue.map((q) => q.def)).toEqual(['storage_liquid', 'storage_container', 'prod_refinedmetals']);
    step(s, 1);
    expect(st.build?.def).toBe('storage_liquid');
    expect(s.credits).toBeLessThan(c0);
  });

  it('wartet auf Credits statt zu überziehen', () => {
    const s = newGame(12);
    const st = s.stations[0];
    s.credits = 1000;
    queueModule(s, st.id, 'prod_refinedmetals');
    step(s, 10);
    expect(st.build).toBeNull();
    expect(st.waiting).toBe('credits');
    expect(s.credits).toBeGreaterThanOrEqual(0);
    s.credits = 5_000_000;
    step(s, 1);
    expect(st.build?.def).toBe('prod_refinedmetals');
  });

  it('entfernt geplante Positionen einzeln', () => {
    const s = newGame(13);
    const st = s.stations[0];
    s.credits = 0; // nichts startet
    queueModule(s, st.id, 'prod_graphene');
    queueModule(s, st.id, 'prod_graphene');
    expect(unqueueLast(s, st.id, 'prod_graphene').ok).toBe(true);
    expect(st.queue.length).toBe(1);
    expect(cancelQueued(s, st.id, st.queue[0].uid).ok).toBe(true);
    expect(st.queue.length).toBe(0);
  });
});

describe('Alte Spielstände', () => {
  it('übernimmt bezahlte Bauaufträge ohne IDs und ohne NPC-Märkte', () => {
    const s = newGame(41);
    const st = s.stations[0];
    const old = JSON.parse(serialize(s));
    old.stations[0].queue = [{ def: 'prod_refinedmetals', paid: 102_000 }, { def: 'storage_liquid', paid: 147_000 }];
    delete old.markets['zhin-werft'];
    const loaded = deserialize(JSON.stringify(old));
    const q = loaded.stations[0].queue;
    expect(q.every((x) => typeof x.uid === 'number')).toBe(true);
    expect(new Set(q.map((x) => x.uid)).size).toBe(2);
    expect(loaded.markets['zhin-werft']).toBeDefined();
    const credits = loaded.credits;
    step(loaded, 1);
    expect(loaded.stations[0].build?.def).toBe('prod_refinedmetals');
    expect(loaded.credits).toBeGreaterThanOrEqual(credits - 1); // bereits bezahlt → keine zweite Zahlung
    expect(st.id).toBe(loaded.stations[0].id);
  });
});

describe('Miner', () => {
  it('mehrere Miner arbeiten bei hohem Verbrauch statt „Kein Rohstoffbedarf“ zu melden', () => {
    const s = newGame(6);
    s.credits = 20e6;
    const st = s.stations[0];
    for (const d of ['prod_refinedmetals', 'prod_refinedmetals']) queueModule(s, st.id, d);
    buyShip(s, 'alligator_min', st.id);
    buyShip(s, 'alligator_min', st.id);
    step(s, 3 * 3600);
    let idle = 0;
    for (let i = 0; i < 12; i++) { step(s, 300); idle += s.ships.filter((m) => m.status === 'Kein Rohstoffbedarf').length; }
    expect(idle).toBe(0);
  });

  it('fördert ohne Verbraucher für den Verkauf und nennt fehlende Lager beim Namen', () => {
    const s = newGame(7);
    step(s, 120);
    expect(s.ships[0].status).toMatch(/Baut|Fliegt/);
    buyShip(s, 'alligator_gas', s.stations[0].id);
    step(s, 600);
    expect(s.ships.find((m) => m.cls === 'alligator_gas')!.status).toBe('Heimat hat kein Flüssiglager');
  });
});

describe('Lager und Reserve', () => {
  it('eingestellte Anteile gehen vor, der Rest wird verteilt', async () => {
    const { setStorageShare, setReserve, sellOrder } = await import('../src/engine/actions');
    const { storageShare } = await import('../src/engine/economy');
    const s = newGame(51);
    const st = s.stations[0];
    queueModule(s, st.id, 'prod_refinedmetals');
    step(s, 3600);
    setStorageShare(s, st.id, 'energycells', 0.2);
    expect(storageShare(st, 'energycells').share).toBeCloseTo(0.2);
    expect(storageShare(st, 'refinedmetals').share).toBeCloseTo(0.8);
    expect(wareLimit(st, 'energycells')).toBeCloseTo(20000);
    // Reserve schützt vor dem Verkauf
    st.inventory.energycells = 9000;
    setReserve(s, st.id, 'energycells', 8500);
    buyShip(s, 'boa', st.id);
    const boa = s.ships.find((x) => x.cls === 'boa')!;
    expect(sellOrder(s, boa.id, st.id, 'energycells', 7500, { kind: 'market', sector: 'zhin' }).ok).toBe(true);
    expect(boa.orders![0].amount).toBeLessThanOrEqual(500);
  });
});

describe('Werft', () => {
  it('hat echte Baumaterialien und baut Schiffe aus dem Stationslager', async () => {
    const { queueShipBuild, stepShipOrders, acceptShipOrder, missingFor } = await import('../src/engine/yard');
    expect(MODULE_MAP.yard_m.materials).toEqual({ claytronics: 3312, energycells: 6620, hullparts: 12112 });
    expect(MODULE_MAP.yard_m.buildTime).toBe(1298);
    const s = newGame(61);
    const st = s.stations[0];
    st.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
    expect(queueShipBuild(s, st.id, 'buffalo').ok).toBe(false); // L braucht L-Werft
    expect(queueShipBuild(s, st.id, 'boa').ok).toBe(true);
    step(s, 10);
    expect(st.yard!.waiting).toMatch(/Material fehlt/);
    // Werftbedarf zählt als Verbrauch: Transporter kaufen ihn ein, Lager hat Platz dafür
    expect(wareLimit(st, 'hullparts')).toBeGreaterThanOrEqual(348);
    for (const [id, n] of Object.entries(missingFor(st, 'boa'))) st.inventory[id] = (st.inventory[id] ?? 0) + n;
    const ships = s.ships.length;
    step(s, 13 * 60);
    expect(s.ships.length).toBe(ships + 1);
    expect(s.totals.shipsBuilt).toBe(1);
    expect(st.inventory.hullparts ?? 0).toBeLessThan(1);
    // Schiffsbestellung einer Fraktion
    s.shipOrderTimer = 0;
    stepShipOrders(s, 1);
    const o = s.shipOrders!.find((x) => x.status === 'offer')!;
    expect(o).toBeDefined();
    expect(acceptShipOrder(s, o.id, st.id).ok).toBe(true);
    for (const [id, n] of Object.entries(missingFor(st, o.cls))) st.inventory[id] = (st.inventory[id] ?? 0) + n;
    const c0 = s.credits;
    step(s, 13 * 60);
    expect(o.status).toBe('done');
    expect(s.credits - c0).toBeGreaterThanOrEqual(o.price * 0.99);
    expect(s.totals.shipsSold).toBe(1);
  });
});

describe('Rückgängig', () => {
  it('stellt Bauliste wieder her, ohne gestartete Positionen zu verdoppeln', async () => {
    const { withUndo, undo, canUndo } = await import('../src/ui/undo');
    const s = newGame(71);
    const st = s.stations[0];
    s.credits = 0;
    const plan = { targets: [], auto: true, extra: {}, buy: [] } as never;
    withUndo(s, () => plan, 'a', () => queueModule(s, st.id, 'prod_refinedmetals'));
    withUndo(s, () => plan, 'b', () => queueModule(s, st.id, 'storage_liquid'));
    withUndo(s, () => plan, 'c', () => cancelQueued(s, st.id, st.queue[0].uid));
    expect(st.queue.map((q) => q.def)).toEqual(['storage_liquid']);
    expect(undo(s, () => {})).toBe('c');
    expect(st.queue.map((q) => q.def)).toEqual(['prod_refinedmetals', 'storage_liquid']);
    // Erste Position startet, dann Rückgängig: sie darf nicht erneut in der Liste auftauchen
    s.credits = 5e6;
    step(s, 1);
    expect(st.build?.def).toBe('prod_refinedmetals');
    expect(undo(s, () => {})).toBe('b');
    expect(st.queue.length).toBe(0);
    expect(canUndo()).toBe(true);
  });
});
