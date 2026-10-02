import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { buyShip, cancelQueued, foundStation, moveQueued, queueModule, setTradeRule, unqueueLast } from '../src/engine/actions';
import { freeUnits, marketPrice, priceAt, storageCap, wareLimit } from '../src/engine/economy';
import { WARES, outputPerHour } from '../src/data/wares';
import { fieldWare } from '../src/engine/logistics';
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
  it('Transporter liefern Story-Aufträge vollständig aus – aber nur aus ihrer Heimatstation', () => {
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
    // Transporter von Station A bedient B nicht
    buyShip(s, 'boa', a.id);
    step(s, 2 * 3600);
    expect(currentMission(s)?.progress(s).cur).toBe(0);
    // Transporter mit Heimat B liefert vollständig
    buyShip(s, 'boa', b.id);
    step(s, 4 * 3600);
    expect(currentMission(s)?.progress(s).cur).toBe(1500);
    expect(missionComplete(s)).toBe(true);
  });

  it('Autohandel: die Heimatstation ist immer einer der beiden Handelspartner', () => {
    const s = newGame(15);
    s.credits = 60_000_000;
    const home = s.stations[0];
    const ids: string[] = [];
    for (const [x, z] of [[60, 55], [-80, 70]]) {
      const r = foundStation(s, 'zhin', x, z);
      ids.push(r.id!);
      for (const d of ['storage_container', 'dock_m']) queueModule(s, r.id!, d);
    }
    step(s, 1800);
    const [b, c] = ids.map((id) => s.stations.find((x) => x.id === id)!);
    // B hat Überschuss, C braucht genau das – verlockend, aber ohne Bezug zur Heimat
    setTradeRule(s, b.id, 'refinedmetals', { sell: true });
    setTradeRule(s, c.id, 'refinedmetals', { buy: true });
    b.inventory.refinedmetals = 5000;
    buyShip(s, 'boa', home.id);
    buyShip(s, 'boa', home.id);
    const bad: string[] = [];
    for (let t = 0; t < 6 * 3600; t += 10) {
      step(s, 10);
      for (const sh of s.ships.filter((x) => x.home === home.id && x.cls === 'boa')) {
        const j = sh.job;
        if (!j) continue;
        const touches = (ep: typeof j.from) => ep.kind === 'station' && ep.id === home.id;
        if (!touches(j.from) && !touches(j.to)) bad.push(`${sh.name}: ${JSON.stringify(j.from)} → ${JSON.stringify(j.to)}`);
      }
    }
    expect(bad).toEqual([]);
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

  it('wartet auf Credits für Baumaterial statt zu überziehen', () => {
    const s = newGame(12);
    const st = s.stations[0];
    s.credits = 1000;
    queueModule(s, st.id, 'prod_refinedmetals');
    step(s, 10);
    expect(st.build?.def).toBe('prod_refinedmetals');
    expect(st.waiting).toBe('credits');
    expect(st.build!.remaining).toBe(st.build!.total); // Bauzeit läuft noch nicht
    expect(s.credits).toBeGreaterThanOrEqual(0);
    s.credits = 5_000_000;
    step(s, 60);
    expect(st.waiting).toBe('');
    expect(st.build!.remaining).toBeLessThan(st.build!.total);
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
    expect(wareLimit(st, 'energycells')).toBeCloseTo(5000); // 20 % von 25.000 m³ (Containerlager S)
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

describe('Lieferung mit eigenem Transporter', () => {
  it('bietet Kurier und Transporter an und liefert ohne Gebühr', async () => {
    const { deliveryOptions, deliverWithShip } = await import('../src/engine/delivery');
    const s = newGame(81);
    const st = s.stations[0];
    buyShip(s, 'boa', st.id);
    const c = { id: s.nextId++, sector: 'zhin', ware: 'energycells', amount: 3000, delivered: 0, reward: 100000, rep: 1, deadline: 1e9, duration: 1e9, status: 'active' as const, title: 'Test' };
    s.contracts.push(c);
    st.inventory.energycells = 5000;
    st.reserve = { energycells: 0 };
    const o = deliveryOptions(s, c.id, st.id)!;
    expect(o.courier.fee).toBeGreaterThan(0);
    const boa = o.ships.find((x) => x.ship.cls === 'boa')!;
    expect(boa.reason).toBe('');
    expect(boa.trips).toBeGreaterThanOrEqual(1);
    const credits = s.credits;
    expect(deliverWithShip(s, c.id, st.id, boa.ship.id).ok).toBe(true);
    expect(s.credits).toBe(credits);
    // Eingeplante Fahrten zählen als gedeckt
    expect(deliveryOptions(s, c.id, st.id)!.need).toBe(0);
    step(s, 3 * 3600);
    expect(c.delivered).toBeGreaterThanOrEqual(2999);
  });
});

describe('Baupläne beim Vertreter', () => {
  it('verkauft nur vor Ort, je Volk und Station, mit Ruf der Gastgeberfraktion', async () => {
    const { buyBlueprint, blueprintState, vendorOffer } = await import('../src/engine/actions');
    const { VENDOR_MAP, vendorsFor } = await import('../src/data/vendors');
    const s = newGame(91);
    s.credits = 50e6;
    s.rep.frf = 12;
    // Split-Wirtschaft am Handelsposten, Waffennahes und Werft nur bei Werftvertretern
    expect(vendorsFor('prod_hullparts').some((v) => v.id === 'v-zhin')).toBe(true);
    expect(vendorsFor('prod_turretcomponents').every((v) => !!v.npc)).toBe(true);
    expect(vendorsFor('yard_m').every((v) => v.role === 'Werftvertreter')).toBe(true);
    expect(buyBlueprint(s, 'prod_turretcomponents', 'v-zhin').ok).toBe(false);
    expect(buyBlueprint(s, 'prod_turretcomponents', 'v-zhin-werft').ok).toBe(true);
    // Fremde Bauweise nur bei der Gesandtschaft ihres Volkes
    expect(vendorsFor('prod_foodrations').map((v) => v.id)).toEqual(['v-argon']);
    expect(VENDOR_MAP['v-argon'].sells.every((id) => MODULE_MAP[id].method === 'Argon')).toBe(true);
    expect(buyBlueprint(s, 'prod_foodrations', 'v-zhin').ok).toBe(false); // Split-Vertreter führt keine argonischen Pläne
    expect(buyBlueprint(s, 'prod_foodrations', 'v-argon').ok).toBe(true);
    expect(buyBlueprint(s, 'prod_teladianium', 'v-teladi').ok).toBe(false); // fremde Bauweise: Ruf 16 oder außer Reichweite
    // Unerreichbarer Sektor: Vertreter dort verkauft noch nicht
    const far = Object.values(VENDOR_MAP).find((v) => vendorOffer(s, v, v.sells[0]) === 'far');
    expect(far).toBeDefined();
    expect(buyBlueprint(s, far!.sells[0], far!.id).ok).toBe(false);
    expect(blueprintState(s, 'prod_hullparts')).toBe('buyable');
    expect(buyBlueprint(s, 'prod_hullparts', 'v-zhin').ok).toBe(true);
    expect(blueprintState(s, 'prod_hullparts')).toBe('owned');
  });
});

describe('Lager S/M/L', () => {
  it('nutzt echte Split-Werte und rüstet alte Spielstände um', () => {
    expect(MODULE_MAP.storage_container.capacity).toBe(25_000);
    expect(MODULE_MAP.storage_container_m.capacity).toBe(100_000);
    expect(MODULE_MAP.storage_container_l.capacity).toBe(1_000_000);
    expect(MODULE_MAP.storage_solid_m.capacity).toBe(500_000);
    expect(MODULE_MAP.storage_liquid.capacity).toBe(100_000);
    expect(MODULE_MAP.storage_liquid_l.materials).toEqual({ claytronics: 135, energycells: 270, hullparts: 494 });
    expect(MODULE_MAP.storage_liquid_l.buildTime).toBe(683);
    // Nur S ab Start, M und L per Bauplan
    expect(MODULE_MAP.storage_container.starter).toBe(true);
    expect(MODULE_MAP.storage_container_m.starter).toBe(false);
    expect(MODULE_MAP.storage_container_m.blueprintCost).toBeGreaterThan(0);
    expect(MODULE_MAP.storage_container_l.blueprintCost).toBeGreaterThan(MODULE_MAP.storage_container_m.blueprintCost);
    const s = newGame(101);
    expect(storageCap(s.stations[0]).Container).toBe(25_000);
    expect(s.blueprints).not.toContain('storage_container_m');
    expect(queueModule(s, s.stations[0].id, 'storage_container_m').ok).toBe(false);
    // Alter Spielstand (Version 1): Containerlager S hatte 100.000 m³ → wird zu M, Bauplan inklusive
    const old = JSON.parse(serialize(s));
    old.version = 1;
    const loaded = deserialize(JSON.stringify(old));
    expect(storageCap(loaded.stations[0]).Container).toBe(100_000);
    expect(loaded.blueprints).toContain('storage_container_m');
    expect(loaded.blueprints).not.toContain('storage_solid_m');
  });
});

describe('Miner verteilen sich und blockieren nicht', () => {
  it('fördert die knappste Ware statt nur Methan', () => {
    const s = newGame(111);
    s.credits = 50e6;
    const st = s.stations[0];
    for (const d of ['storage_liquid', 'prod_graphene', 'prod_graphene', 'prod_superfluidcoolant']) st.modules.push({ uid: s.nextId++, def: d, t: 0, running: false, stall: '', util: 0 });
    st.inventory.methane = 8_300; // Methan am Limit (voll), Helium leer
    for (let i = 0; i < 3; i++) buyShip(s, 'alligator_gas', st.id);
    step(s, 1800);
    const targets = s.ships.filter((x) => x.cls === 'alligator_gas').map((x) => (x.miningField ? fieldWare(x.miningField) : x.cargo?.ware ?? ''));
    expect(targets).toContain('helium');
    step(s, 3 * 3600);
    expect(s.totals.mined.helium ?? 0).toBeGreaterThan(1000);
  });

  it('verkauft Überschuss, wenn das Lager voll ist, statt ewig zu warten', () => {
    const s = newGame(112);
    const st = s.stations[0];
    st.modules.push({ uid: s.nextId++, def: 'storage_liquid', t: 0, running: false, stall: '', util: 0 });
    buyShip(s, 'alligator_gas', st.id);
    const m = s.ships.find((x) => x.cls === 'alligator_gas')!;
    st.inventory.methane = 1e9; // voll
    Object.assign(m, { sector: st.sector, x: st.x, z: st.z, path: [], phase: 'unloading', cargo: { ware: 'methane', amount: 900 } });
    const c0 = s.credits;
    step(s, 600);
    expect(m.cargo === null || m.phase === 'toMarket' || m.phase === 'selling' || s.credits > c0).toBe(true);
    step(s, 1200);
    expect(s.credits).toBeGreaterThan(c0);
    // Mit „Warten“ bleibt die Ladung an Bord
    m.fullAction = 'wait';
    Object.assign(m, { sector: st.sector, x: st.x, z: st.z, path: [], phase: 'unloading', cargo: { ware: 'methane', amount: 900 } });
    step(s, 600);
    expect(m.cargo?.amount).toBe(900);
    expect(m.status).toMatch(/Lager voll/);
  });
});

describe('Miner bei knappem Lager: kein Hin und Her', () => {
  it('kehrt nie unterwegs um und beendet jede Verkaufsfahrt nach höchstens zwei Käufern', () => {
    const s = newGame(121);
    s.credits = 80e6;
    const st = s.stations[0];
    // Kleines Lager, wechselnder Verbrauch: Lager ist ständig fast voll, Platz entsteht in kleinen Häppchen
    for (const d of ['storage_liquid', 'prod_graphene', 'prod_superfluidcoolant', 'prod_refinedmetals']) st.modules.push({ uid: s.nextId++, def: d, t: 0, running: false, stall: '', util: 0 });
    for (const c of ['alligator_gas', 'alligator_gas', 'alligator_gas', 'alligator_min', 'alligator_min', 'alligator_min']) buyShip(s, c, st.id);
    const miners = s.ships.filter((x) => x.cls.startsWith('alligator'));
    const last = new Map(miners.map((m) => [m.id, m.phase as string]));
    const hops = new Map(miners.map((m) => [m.id, 0]));
    const cargoSince = new Map<string, number>();
    const bad: string[] = [];
    let sales = 0;
    for (let t = 0; t < 12 * 3600; t += 2) {
      step(s, 2);
      if (t % 600 === 0) st.modules.forEach((m, i) => { if (i > 2 && (t / 600 + i) % 3 === 0) m.running = false; }); // Störungen im Verbrauch
      for (const m of miners) {
        const prev = last.get(m.id)!;
        if (prev !== m.phase) {
          if (prev === 'toMarket' && m.phase !== 'selling') bad.push(`${m.name}: toMarket → ${m.phase}`);
          if (prev === 'selling' && m.phase === 'toHome') bad.push(`${m.name}: Verkauf → zurück nach Hause`);
          if (m.phase === 'toMarket') hops.set(m.id, hops.get(m.id)! + 1);
          if (hops.get(m.id)! > 2) bad.push(`${m.name}: mehr als zwei Käufer für eine Ladung`);
          last.set(m.id, m.phase);
        }
        if (m.phase === 'selling' && !m.cargo) sales++;
        if (!m.cargo) { hops.set(m.id, 0); cargoSince.delete(m.id); }
        else if (!cargoSince.has(m.id)) cargoSince.set(m.id, s.time);
        else if (s.time - cargoSince.get(m.id)! > 90 * 60) bad.push(`${m.name}: Ladung seit 90 min an Bord (${m.status})`);
      }
      if (bad.length) break;
    }
    expect(bad).toEqual([]);
    expect(s.totals.sold).toBeGreaterThan(0);
  }, 60_000);
});

describe('Restladung: Automatik und Fallbetrachtung', () => {
  const setup = (seed: number) => {
    const s = newGame(seed);
    s.credits = 50e6;
    const st = s.stations[0];
    for (const d of ['storage_liquid', 'prod_graphene', 'prod_superfluidcoolant']) st.modules.push({ uid: s.nextId++, def: d, t: 0, running: false, stall: '', util: 0 });
    buyShip(s, 'alligator_gas', st.id);
    const m = s.ships.find((x) => x.cls === 'alligator_gas')!;
    Object.assign(m, { sector: st.sector, x: st.x, z: st.z, path: [], phase: 'unloading' });
    return { s, st, m };
  };

  it('füllt nach, wenn dieselbe Ware weiter gebraucht wird – und spart Abbauzeit', async () => {
    const { decideRest } = await import('../src/engine/fleet');
    const { s, st, m } = setup(131);
    st.inventory.methane = wareLimit(st, 'methane');
    st.inventory.helium = wareLimit(st, 'helium') * 0.8; // Helium ausreichend da
    m.cargo = { ware: 'methane', amount: 900 };
    const c = decideRest(s, m, st);
    expect(c.choice).toBe('topup');
    expect(c.topup).toBe(0);
    expect(c.topupSaves).toBeGreaterThan(60);
    expect(c.wait).toBeGreaterThan(0);
    expect(c.sell).toBeGreaterThan(0);
    // Ausführen: Miner fliegt mit Rest zum Methanfeld und kommt mit voller Ladung zurück
    step(s, 2);
    expect(m.topUp).toBe(true);
    expect(m.cargo!.amount).toBeGreaterThan(400); // Rest bleibt an Bord (abzüglich dessen, was noch passte)
    let full = 0;
    for (let i = 0; i < 400 && !full; i++) { step(s, 2); if (m.phase === 'toHome' && m.cargo) full = m.cargo.amount; }
    expect(full).toBeCloseTo(1266.7, 0);
  });

  it('füllt nicht nach, wenn die Station dringender eine andere Ware braucht', async () => {
    const { decideRest } = await import('../src/engine/fleet');
    const { s, st, m } = setup(132);
    st.inventory.methane = wareLimit(st, 'methane');
    st.inventory.helium = 0;
    m.cargo = { ware: 'methane', amount: 300 };
    const c = decideRest(s, m, st);
    expect(c.choice).not.toBe('topup');
    expect(c.reason).toMatch(/Helium/);
    // Gewählt wird das Kürzere von Warten und Verkaufen
    expect(c.choice === 'wait' ? c.wait! <= c.sell! : c.sell! < c.wait!).toBe(true);
  });

  it('erkennt Überförderung und hält feste Einstellungen ein', async () => {
    const { decideRest } = await import('../src/engine/fleet');
    const { s, st, m } = setup(133);
    st.inventory.methane = wareLimit(st, 'methane');
    st.inventory.helium = wareLimit(st, 'helium') * 0.8;
    m.cargo = { ware: 'methane', amount: 300 };
    m.restStreak = 2;
    const c = decideRest(s, m, st);
    expect(c.choice).toBe('sell');
    expect(c.reason).toMatch(/mehr Methan/);
    m.restStreak = 0;
    for (const v of ['sell', 'wait', 'topup'] as const) { m.restAction = v; expect(decideRest(s, m, st).choice).toBe(v); }
    // Station verbraucht die Ware gar nicht: Warten ist unmöglich
    m.restAction = 'auto';
    m.cargo = { ware: 'hydrogen', amount: 300 };
    const h = decideRest(s, m, st);
    expect(h.wait).toBeNull();
    expect(h.choice).toBe('sell');
  });
});

describe('Lieferreihenfolge für Überschüsse', () => {
  const setup = async (ownFirst: boolean) => {
    const Y = await import('../src/engine/yard');
    const s = newGame(7);
    s.credits = 60e6;
    const werft = s.stations[0];
    werft.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
    const r = foundStation(s, 'zhin', 60, 55);
    const huelle = s.stations.find((x) => x.id === r.id)!;
    for (const d of ['storage_container', 'dock_m']) queueModule(s, huelle.id, d);
    step(s, 1800);
    huelle.inventory.hullparts = 3000;
    if (ownFirst) huelle.deliveryPrio = [werft.id];
    setTradeRule(s, huelle.id, 'hullparts', { sell: true });
    Y.queueShipBuild(s, werft.id, 'boa');
    buyShip(s, 'boa', huelle.id);
    const boa = s.ships.find((x) => x.cls === 'boa')!;
    const targets: string[] = [];
    werft.inventory.hullparts = 0; // Werft-Vorrat leer: sie hat Bedarf
    for (let t = 0; t < 4 * 3600; t += 10) {
      s.markets.zhin.hullparts.stock = 0; // nur die eigene Fabrik liefert (keine NPC-Verkäufer)
      step(s, 10);
      const j = boa.job;
      if (j?.ware === 'hullparts' && j.stage === 'pickup') {
        const k = j.to.kind === 'station' ? 'werft' : 'markt';
        if (targets.at(-1) !== k) targets.push(k);
      }
    }
    return { s, werft, fab: huelle, targets };
  };

  it('ohne Reihenfolge: bester Ertrag, die NPC-Werft darf zuerst bedient werden', async () => {
    const { targets } = await setup(false);
    expect(targets[0]).toBe('markt');
  });

  it('Werft auf Prio 1: erst die eigene Werft bis zum Bedarf, danach Verkauf', async () => {
    const { s, fab, targets } = await setup(true);
    expect(targets[0]).toBe('werft');
    // danach wird der Überschuss verkauft (vom Transporter an Märkte oder von NPC-Händlern an der Station)
    expect(fab.inventory.hullparts ?? 0).toBeLessThan(3000 - 348 - 500);
    expect(s.totals.shipsBuilt).toBe(1);
  });

  it('Prio 1 vor Prio 2; nimmt Prio 1 weniger als eine halbe Ladung, rutscht der Transporter eine Stufe tiefer', async () => {
    const { findTradeJob } = await import('../src/engine/fleet');
    const s = newGame(17);
    s.credits = 60e6;
    const src = s.stations[0];
    const made = [[60, 55], [-80, 70]].map(([x, z]) => {
      const r = foundStation(s, 'zhin', x, z);
      for (const d of ['storage_container', 'dock_m']) queueModule(s, r.id!, d);
      return r.id!;
    });
    step(s, 1800);
    const [p1, p2] = made.map((id) => s.stations.find((x) => x.id === id)!);
    src.inventory.refinedmetals = 5000;
    setTradeRule(s, src.id, 'refinedmetals', { sell: true });
    for (const st of [p1, p2]) setTradeRule(s, st.id, 'refinedmetals', { buy: true });
    src.deliveryPrio = [p1.id, p2.id];
    buyShip(s, 'boa', src.id);
    const boa = s.ships.find((x) => x.cls === 'boa')!;
    const target = () => { const j = findTradeJob(s, boa); return j && j.ware === 'refinedmetals' && j.to.kind === 'station' ? j.to.id : j ? 'markt' : null; };
    expect(target()).toBe(p1.id);
    // Prio 1 fast voll: nimmt weniger als eine halbe Ladung → Prio 2
    p1.inventory.refinedmetals = wareLimit(p1, 'refinedmetals') * 0.95 - 100;
    expect(target()).toBe(p2.id);
    // Beide fast voll → Verkauf zum besten Preis
    p2.inventory.refinedmetals = wareLimit(p2, 'refinedmetals') * 0.95 - 100;
    expect(target()).toBe('markt');
  });
});

describe('Alter Haken „Zuerst eigene Stationen“', () => {
  it('wird beim Laden zur Lieferreihenfolge mit allen anderen eigenen Stationen', () => {
    const s = newGame(18);
    s.credits = 10e6;
    foundStation(s, 'zhin', 60, 55);
    const old = JSON.parse(serialize(s));
    old.stations[0].ownFirst = true;
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.stations[0].deliveryPrio).toEqual([loaded.stations[1].id]);
    expect(loaded.stations[0].ownFirst).toBeUndefined();
  });
});

describe('NPC-Händler nach der Lieferreihenfolge', () => {
  const run = async (prioBeforeNpc: boolean, queueShips: boolean) => {
    const Y = await import('../src/engine/yard');
    const s = newGame(19);
    s.credits = 60e6;
    const werft = s.stations[0];
    werft.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
    const r = foundStation(s, 'zhin', 60, 55);
    const fab = s.stations.find((x) => x.id === r.id)!;
    for (const d of ['storage_container', 'dock_m']) queueModule(s, fab.id, d);
    step(s, 1800);
    setTradeRule(s, fab.id, 'hullparts', { sell: true });
    fab.deliveryPrio = [werft.id];
    fab.prioBeforeNpc = prioBeforeNpc;
    if (queueShips) for (let i = 0; i < 4; i++) Y.queueShipBuild(s, werft.id, 'boa'); // Werft braucht ~1.400 Hüllenteile
    let bought = 0;
    for (let t = 0; t < 6 * 3600; t += 10) {
      fab.inventory.hullparts = 3000; // Fabrik produziert laufend nach
      s.markets.zhin.hullparts.stock = 0; // kein Nachschub vom Markt – sonst gilt die Werft durch NPC-Verkäufer als versorgt
      const before = fab.inventory.hullparts;
      step(s, 10);
      bought += Math.max(0, before - (fab.inventory.hullparts ?? 0));
    }
    return bought;
  };

  it('ohne Haken kaufen NPC-Händler Hüllenteile, obwohl die Werft sie braucht', async () => {
    expect(await run(false, true)).toBeGreaterThan(0);
  });

  it('mit Haken kaufen sie nichts, solange die Werft auf Prio 1 noch Bedarf hat', async () => {
    expect(await run(true, true)).toBe(0);
  });

  it('mit Haken kaufen sie wieder, sobald die Werft versorgt ist', async () => {
    expect(await run(true, false)).toBeGreaterThan(0);
  });
});

describe('Werft hält Material auf Vorrat', () => {
  it('füllt ihr Lager ohne Bestellung – ein bestelltes Schiff startet sofort', async () => {
    const Y = await import('../src/engine/yard');
    const s = newGame(23);
    s.credits = 60e6;
    const werft = s.stations[0];
    werft.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
    werft.modules.push({ uid: s.nextId++, def: 'storage_container_m', t: 0, running: false, stall: '', util: 0 });
    buyShip(s, 'boa', werft.id);
    buyShip(s, 'boa', werft.id);
    expect(werft.yard?.queue.length ?? 0).toBe(0); // keine Bestellung
    step(s, 6 * 3600);
    for (const id of ['hullparts', 'engineparts', 'shieldcomponents']) expect(werft.inventory[id] ?? 0).toBeGreaterThan(SHIP_MAP_BOA()[id]);
    expect(Y.queueShipBuild(s, werft.id, 'boa').ok).toBe(true);
    step(s, 2);
    expect(werft.yard?.build?.cls).toBe('boa'); // Material war schon da
  });
});
function SHIP_MAP_BOA(): Record<string, number> { return { hullparts: 348, engineparts: 20, shieldcomponents: 7 }; }

describe('Modulbau mit echtem Material', () => {
  it('nimmt Material zuerst aus dem Lager, kauft den Rest am Markt und baut erst dann', () => {
    const s = newGame(31);
    const st = s.stations[0];
    const need = MODULE_MAP.prod_refinedmetals.materials;
    st.inventory.hullparts = need.hullparts; // Hüllenteile hat die Station selbst
    const c0 = s.credits;
    const clay0 = s.markets.zhin.claytronics.stock;
    queueModule(s, st.id, 'prod_refinedmetals');
    step(s, 2);
    expect(st.inventory.hullparts ?? 0).toBeLessThan(1); // aus dem eigenen Lager genommen
    expect(s.markets.zhin.claytronics.stock).toBeLessThan(clay0); // Claytronik am Markt gekauft
    expect(s.credits).toBeLessThan(c0);
    step(s, MODULE_MAP.prod_refinedmetals.buildTime + 10);
    expect(st.modules.some((m) => m.def === 'prod_refinedmetals')).toBe(true);
  });

  it('knappes Material am Markt hält den Bau auf; eigene Lieferung löst den Engpass', () => {
    const s = newGame(32);
    s.credits = 500e6;
    s.blueprints.push('yard_m');
    const st = s.stations[0];
    queueModule(s, st.id, 'yard_m'); // braucht 3.312 Claytronik
    step(s, 120);
    expect(st.build?.def).toBe('yard_m');
    expect(st.waiting).toBe('material');
    expect(st.build!.need!.claytronics).toBeGreaterThan(100); // Märkte haben nicht genug
    // Eigene Claytronik ins Lager: der Bau nimmt sie und läuft weiter
    st.inventory.claytronics = st.build!.need!.claytronics;
    step(s, 60);
    expect(st.build!.need!.claytronics ?? 0).toBeLessThan(1);
  });

  it('ohne Zukauf wird nur eigenes Material verbaut; Abbruch gibt Material und Credits zurück', async () => {
    const { cancelBuild } = await import('../src/engine/actions');
    const s = newGame(33);
    const st = s.stations[0];
    st.autoBuyBuild = false;
    st.inventory.hullparts = 50;
    queueModule(s, st.id, 'prod_refinedmetals');
    step(s, 120);
    expect(st.build!.paid).toBe(0); // nichts zugekauft
    expect(st.build!.need!.claytronics).toBe(MODULE_MAP.prod_refinedmetals.materials.claytronics); // keine Lieferung vom Markt
    expect(st.waiting).toBe('material');
    expect(cancelBuild(s, st.id).ok).toBe(true);
    expect(st.inventory.hullparts).toBeCloseTo(50);
  });
});
