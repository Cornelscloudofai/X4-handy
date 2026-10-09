// Spieleraktionen. Jede Aktion prüft ihre Voraussetzungen und liefert eine Meldung.
import { MODULE_MAP, PLOT_COST, moduleDef } from '../data/modules';
import { SECTOR_MAP, SECTOR_RADIUS, FACTIONS, insideHex, marketInfo, sector } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { BUILD_STORAGE_COST, addBuildStore, defaultTradeRule, hasDockFor, moveBuildStock } from './economy';
import { spawnCourier } from './npc';
import { courierTrip, expectedCargo } from './fleet';
import { knownSectors, sellableStock, stationById } from './logistics';
import { VENDOR_MAP, vendorPlace, vendorsFor, type Vendor } from '../data/vendors';
import { newModule, newShip, newStation } from './state';
import type { FactionId, GameState, RouteOrder, Ship, TradeEndpoint, TradeJob, TradeRule } from './types';
import { log } from './util';
import { acceptContract, isDelivery } from './contracts';
import { canMine } from './mineRights';
import { book } from './ledger';

export interface Result { ok: boolean; msg: string }
const ok = (msg: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });
const cr = (n: number) => Math.round(n).toLocaleString('de-DE') + ' Cr';

export type OfferState = 'owned' | 'buyable' | 'rep' | 'far';

/** Kann dieser Vertreter den Bauplan jetzt verkaufen? 'far' = Sektor noch nicht erreichbar, 'rep' = Ruf zu niedrig */
export function vendorOffer(state: GameState, v: Vendor, defId: string): OfferState {
  if (state.blueprints.includes(defId)) return 'owned';
  if (!knownSectors(state).includes(v.sector)) return 'far';
  return state.rep[v.faction] >= moduleDef(defId).repRequired ? 'buyable' : 'rep';
}

/** owned · buyable (bei mindestens einem erreichbaren Vertreter) · locked */
export function blueprintState(state: GameState, defId: string): 'owned' | 'buyable' | 'locked' {
  if (state.blueprints.includes(defId)) return 'owned';
  return vendorsFor(defId).some((v) => vendorOffer(state, v, defId) === 'buyable') ? 'buyable' : 'locked';
}

/** Höchster Ruf bei einer Fraktion, die den Bauplan verkauft */
export function bestRepFor(state: GameState, defId: string): { rep: number; faction: FactionId } {
  const vs = vendorsFor(defId);
  const best = vs.reduce<FactionId>((b, v) => (state.rep[v.faction] > state.rep[b] ? v.faction : b), vs[0]?.faction ?? 'frf');
  return { rep: state.rep[best], faction: best };
}

/** Baupläne gibt es nur beim Vertreter vor Ort */
export function buyBlueprint(state: GameState, defId: string, vendorId: string): Result {
  const d = MODULE_MAP[defId];
  const v = VENDOR_MAP[vendorId];
  if (!d || !v) return fail('Unbekannter Bauplan oder Vertreter.');
  if (!v.sells.includes(defId)) return fail(`${v.name} führt diesen Bauplan nicht.`);
  const offer = vendorOffer(state, v, defId);
  if (offer === 'owned') return fail('Bauplan bereits vorhanden.');
  if (offer === 'far') return fail(`${vendorPlace(v)} ist noch nicht erreichbar.`);
  if (offer === 'rep') return fail(`Benötigt Ruf ${d.repRequired} bei ${FACTIONS[v.faction].name}.`);
  if (state.credits < d.blueprintCost) return fail(`Es fehlen ${cr(d.blueprintCost - state.credits)}.`);
  book(state, -d.blueprintCost, 'build', `Bauplan: ${d.name}`);
  state.blueprints.push(defId);
  log(state, `Bauplan erworben: ${d.name} (${v.name}, ${vendorPlace(v)}).`, 'good');
  return ok(`Bauplan „${d.name}“ gekauft.`);
}

/** Baupläne, die für eine Liste von Modulen noch fehlen */
export function missingBlueprints(state: GameState, defs: string[]): string[] {
  return [...new Set(defs)].filter((id) => MODULE_MAP[id] && !state.blueprints.includes(id));
}

/** Größtes Lagermodul einer Lagerart, für das der Bauplan vorhanden ist */
export function bestStorage(state: GameState, type: string): string {
  const own = Object.values(MODULE_MAP).filter((d) => d.kind === 'storage' && d.storage === type && state.blueprints.includes(d.id));
  own.sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
  return own[0]?.id ?? 'storage_' + type.toLowerCase();
}

export const MAX_MODULES = 100;

/** Plant ein Modul ein – am Ende oder an Position `at` der Bauliste. Gebaut wird aus dem Material im Baulager. */
export function queueModule(state: GameState, stationId: string, defId: string, at?: number): Result & { uid?: number } {
  const st = stationById(state, stationId);
  const d = MODULE_MAP[defId];
  if (!st || !d) return fail('Station oder Modul nicht gefunden.');
  if (d.kind === 'core') return fail('Der Stationskern entsteht mit der Station.');
  if (!state.blueprints.includes(defId)) {
    const v = vendorsFor(defId)[0];
    return fail(`Dafür fehlt der Bauplan${v ? ` – erhältlich bei ${v.role === 'Handelsvertreter' ? 'den Handelsvertretern' : vendorPlace(v)}` : ''}.`);
  }
  if (st.modules.length + st.queue.length + (st.build ? 1 : 0) >= MAX_MODULES) return fail(`Höchstens ${MAX_MODULES} Module pro Station.`);
  const item = { uid: state.nextId++, def: defId, paid: 0 };
  const pos = at === undefined ? st.queue.length : Math.max(0, Math.min(st.queue.length, at));
  st.queue.splice(pos, 0, item);
  return { ...ok(`${d.name} als Position ${pos + 1} eingeplant.`), uid: item.uid };
}

/** Verschiebt eine geplante Position an einen neuen Index */
export function moveQueued(state: GameState, stationId: string, uid: number, to: number): Result {
  const st = stationById(state, stationId);
  if (!st) return fail('Station nicht gefunden.');
  const from = st.queue.findIndex((q) => q.uid === uid);
  if (from < 0) return fail('Position nicht gefunden.');
  const [item] = st.queue.splice(from, 1);
  st.queue.splice(Math.max(0, Math.min(st.queue.length, to)), 0, item);
  st.waiting = '';
  return ok('Reihenfolge geändert.');
}

export function cancelQueued(state: GameState, stationId: string, uid: number): Result {
  const st = stationById(state, stationId);
  if (!st) return fail('Station nicht gefunden.');
  const i = st.queue.findIndex((q) => q.uid === uid);
  if (i < 0) return fail('Position nicht gefunden.');
  const [q] = st.queue.splice(i, 1);
  book(state, q.paid, 'build', `Erstattung Bauliste: ${moduleDef(q.def).name}`, { kind: 'station', id: st.id });
  st.waiting = '';
  return ok(q.paid ? 'Position entfernt, Kosten erstattet.' : 'Position aus der Bauliste entfernt.');
}

/** Ware manuell zwischen Stationslager und Baulager umladen (amount > 0: ins Baulager, < 0: zurück ins Stationslager) */
export function moveBuildStore(state: GameState, stationId: string, ware: string, amount: number): Result {
  const st = stationById(state, stationId);
  if (!st || !WARES[ware]) return fail('Station oder Ware nicht gefunden.');
  const n = moveBuildStock(state, st, ware, amount);
  if (n === 0) return fail(amount > 0 ? 'Nichts umzuladen – Lager leer oder Baulager braucht nichts mehr davon.' : 'Nichts umzuladen – Baulager leer oder Stationslager voll.');
  return ok(`${Math.abs(n).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${WARES[ware].name} ${n > 0 ? 'ins Baulager' : 'ins Stationslager'} umgeladen.`);
}

export function cancelBuild(state: GameState, stationId: string): Result {
  const st = stationById(state, stationId);
  if (!st?.build) return fail('Kein laufender Bau.');
  // Verbautes Material kommt zurück ins Baulager (bezahlte Positionen alter Spielstände: Credits zurück)
  if (st.build.paid > 0) book(state, st.build.paid, 'build', `Bau abgebrochen: ${moduleDef(st.build.def).name}`, { kind: 'station', id: st.id });
  else for (const [id, n] of Object.entries(st.build.used ?? {})) addBuildStore(st, id, n);
  st.build = null;
  st.waiting = '';
  return ok('Bau abgebrochen – das verbaute Material liegt wieder im Baulager.');
}

/** Entfernt die letzte noch nicht begonnene Position eines Modultyps */
export function unqueueLast(state: GameState, stationId: string, defId: string): Result {
  const st = stationById(state, stationId);
  if (!st) return fail('Station nicht gefunden.');
  for (let i = st.queue.length - 1; i >= 0; i--) if (st.queue[i].def === defId) return cancelQueued(state, stationId, st.queue[i].uid);
  return fail('Keine geplante Position mehr – gebaute Module reißt du in der Modulliste ab.');
}

export function demolishModule(state: GameState, stationId: string, uid: number): Result {
  const st = stationById(state, stationId);
  if (!st) return fail('Station nicht gefunden.');
  const i = st.modules.findIndex((m) => m.uid === uid);
  if (i < 0) return fail('Modul nicht gefunden.');
  const d = moduleDef(st.modules[i].def);
  if (d.kind === 'core') return fail('Der Stationskern kann nicht abgerissen werden.');
  st.modules.splice(i, 1);
  const refund = Math.round(d.cost * 0.3);
  book(state, refund, 'build', `Abriss: ${d.name}`, { kind: 'station', id: st.id });
  log(state, `${st.name}: ${d.name} abgerissen (${cr(refund)} Materialerlös).`, 'warn', false, { kind: 'station', id: st.id });
  return ok(`${d.name} abgerissen. Materialerlös ${cr(refund)}.`);
}

export function stationCost(): number {
  return PLOT_COST + BUILD_STORAGE_COST;
}

export function canPlaceStation(state: GameState, sectorId: string, x: number, z: number): Result {
  if (!state.sectors.includes(sectorId)) return fail('Für diesen Sektor fehlt die Baulizenz.');
  if (!insideHex(x, z, SECTOR_RADIUS * 0.86)) return fail('Zu nah am Sektorrand.');
  const s = SECTOR_MAP[sectorId];
  if (Math.hypot(x - s.tradeStation.x, z - s.tradeStation.z) < 18) return fail('Zu nah am Handelsposten.');
  for (const st of state.stations) if (st.sector === sectorId && Math.hypot(st.x - x, st.z - z) < 16) return fail('Zu nah an einer anderen Station.');
  return ok('');
}

export function foundStation(state: GameState, sectorId: string, x: number, z: number): Result & { id?: string } {
  const check = canPlaceStation(state, sectorId, x, z);
  if (!check.ok) return check;
  if (state.stations.length >= 20) return fail('Höchstens 20 Stationen.');
  const cost = stationCost();
  if (state.credits < cost) return fail(`Eine Station kostet ${cr(cost)}.`);
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omikron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Ypsilon'];
  const used = new Set(state.stations.map((s) => s.name));
  const name = 'Station ' + (names.find((n) => !used.has('Station ' + n)) ?? state.stations.length + 1);
  const st = newStation(state, name, sectorId, x, z);
  // Zuerst steht nur das Baulager; der Stationskern wird wie jedes Modul aus angeliefertem Material gebaut
  st.build = { def: 'core', remaining: moduleDef('core').buildTime, total: moduleDef('core').buildTime, paid: 0, used: {} };
  state.stations.push(st);
  book(state, -cost, 'build', `Stationsgründung: ${name}`, { kind: 'station', id: st.id });
  log(state, `${name} in ${sector(sectorId).name} gegründet.`, 'good', false, { kind: 'station', id: st.id });
  return { ok: true, msg: `${name} gegründet – das Baulager steht. Plane Dock, Lager und Produktion ein; Transporter und NPC-Händler liefern das Baumaterial.`, id: st.id };
}

export function renameStation(state: GameState, stationId: string, name: string): Result {
  const st = stationById(state, stationId);
  const n = name.trim().slice(0, 32);
  if (!st || !n) return fail('Name ungültig.');
  st.name = n;
  return ok('Umbenannt.');
}

export function buyShip(state: GameState, clsId: string, homeId: string): Result {
  const c = SHIP_MAP[clsId];
  const home = stationById(state, homeId);
  if (!c || !home) return fail('Schiff oder Station nicht gefunden.');
  if (state.ships.length >= 60) return fail('Höchstens 60 Schiffe.');
  if (state.credits < c.price) return fail(`Es fehlen ${cr(c.price - state.credits)}.`);
  const ts = sector(home.sector).tradeStation;
  const ship = newShip(state, clsId, home, { sector: home.sector, x: ts.x + 2, z: ts.z + 2 });
  state.ships.push(ship);
  book(state, -c.price, 'ships', `Schiffskauf: ${ship.name} (${c.name})`, { kind: 'ship', id: ship.id });
  log(state, `${ship.name} (${c.name}) gekauft – fliegt nach ${home.name}.`, 'good', false, { kind: 'ship', id: ship.id });
  const warn = hasDockFor(home, c.size) ? '' : c.size === 'L' ? ' Achtung: Die Station braucht einen Pier.' : ' Achtung: Die Station braucht ein Dock.';
  return ok(`${c.name} gekauft.${warn}`);
}

export function sellShip(state: GameState, shipId: string): Result {
  const i = state.ships.findIndex((s) => s.id === shipId);
  if (i < 0) return fail('Schiff nicht gefunden.');
  const s = state.ships[i];
  const value = Math.round(SHIP_MAP[s.cls].price * 0.6);
  state.ships.splice(i, 1);
  book(state, value, 'ships', `Schiffsverkauf: ${s.name}`);
  return ok(`${s.name} für ${cr(value)} verkauft.`);
}

export function setShipHome(state: GameState, shipId: string, homeId: string): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Nicht gefunden.');
  // Leere ID: Zuordnung lösen – das Schiff ist frei und wartet auf Befehle (Sektorbefehl, Route, Einzelaufträge)
  if (!homeId) {
    s.home = '';
    s.job = null;
    s.miningField = '';
    s.survey = undefined;
    if (s.mode === 'auto') s.sectorOrder = undefined;
    if (!s.cargo) { s.phase = 'idle'; s.path = []; }
    return ok(`${s.name} ist jetzt frei – gib ihm einen Sektorbefehl oder eine Route.`);
  }
  const home = stationById(state, homeId);
  if (!home) return fail('Nicht gefunden.');
  s.sectorOrder = undefined;
  s.home = home.id;
  s.job = null;
  s.miningField = '';
  if (!s.cargo) { s.phase = 'idle'; s.path = []; }
  return ok(`${s.name} gehört jetzt zu ${home.name}.`);
}

export function setMinerWare(state: GameState, shipId: string, ware: string): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  s.mineWare = ware;
  return ok(ware ? `Baut jetzt ${WARES[ware].name} ab.` : 'Baut automatisch nach Bedarf ab.');
}

export function setTraderMode(state: GameState, shipId: string, mode: 'auto' | 'route', route?: RouteOrder): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  if (mode === 'route') {
    if (!route || !WARES[route.ware]) return fail('Route unvollständig.');
    if (WARES[route.ware].storage !== SHIP_MAP[s.cls].storage) return fail('Diese Ware passt nicht in den Frachtraum.');
    s.route = route;
  }
  s.mode = mode;
  if (!s.cargo) { s.job = null; if (s.phase !== 'toTarget' && s.phase !== 'docking') s.phase = 'idle'; }
  return ok(mode === 'auto' ? 'Autohandel aktiviert.' : 'Versorgungslinie eingerichtet.');
}

export function setTradeRule(state: GameState, stationId: string, ware: string, rule: Partial<TradeRule>): Result {
  const st = stationById(state, stationId);
  if (!st) return fail('Station nicht gefunden.');
  const cur = st.trade[ware] ?? defaultTradeRule(st, ware);
  st.trade[ware] = { ...cur, ...rule };
  return ok('Handelsregel geändert.');
}

export function buyLicense(state: GameState, sectorId: string): Result {
  const s = SECTOR_MAP[sectorId];
  if (!s) return fail('Sektor unbekannt.');
  if (state.sectors.includes(sectorId)) return fail('Baulizenz bereits vorhanden.');
  if (!s.links.some((l) => state.sectors.includes(l))) return fail('Nur Nachbarsektoren deines Gebiets sind erreichbar.');
  if (state.rep[s.faction] < s.repRequired) return fail(`Benötigt Ruf ${s.repRequired} bei ${FACTIONS[s.faction].name}.`);
  if (state.credits < s.licenseCost) return fail(`Es fehlen ${cr(s.licenseCost - state.credits)}.`);
  book(state, -s.licenseCost, 'build', `Baulizenz: ${s.name}`, { kind: 'sector', id: sectorId });
  state.sectors.push(sectorId);
  log(state, `Baulizenz für ${s.name} erworben.`, 'good', true, { kind: 'sector', id: sectorId });
  return ok(`Willkommen in ${s.name}!`);
}

/** Liefert Ware direkt aus einer Station per angeheuertem Kurier (10 % Gebühr vom Warenwert) */
export function courierDeliver(state: GameState, contractId: number, stationId: string): Result {
  const c = state.contracts.find((x) => x.id === contractId);
  const st = stationById(state, stationId);
  if (!c || c.status !== 'active' || !st) return fail('Auftrag oder Station nicht verfügbar.');
  const have = st.inventory[c.ware] ?? 0;
  const inTransit = state.npcs.filter((n) => n.contract === c.id).reduce((s, n) => s + n.amount, 0);
  const n = Math.min(have, c.amount - c.delivered - inTransit);
  if (n < 1) return fail(`${st.name} hat keine ${WARES[c.ware].name} für diesen Auftrag.`);
  const fee = Math.round(n * WARES[c.ware].price.avg * 0.1);
  if (state.credits < fee) return fail(`Kuriergebühr ${cr(fee)} nicht bezahlbar.`);
  book(state, -fee, 'contract', `Kuriergebühr: ${c.title}`, { kind: 'contract', id: c.id });
  st.inventory[c.ware] = have - n;
  spawnCourier(state, st.id, c.id, c.ware, n);
  return ok(`Kurier unterwegs mit ${Math.round(n).toLocaleString('de-DE')} ${WARES[c.ware].name} (Gebühr ${cr(fee)}).`);
}

export function stationModulesSummary(stationId: string, state: GameState): { def: string; count: number }[] {
  const st = stationById(state, stationId);
  if (!st) return [];
  const map = new Map<string, number>();
  for (const m of st.modules) map.set(m.def, (map.get(m.def) ?? 0) + 1);
  return [...map].map(([def, count]) => ({ def, count }));
}

export { newModule };

/**
 * Verkaufsauftrag für ein bestimmtes Schiff: Ware an der Station abholen und beim gewählten Käufer abliefern.
 * Ist das Schiff beschäftigt, wird der Auftrag nach der laufenden Fahrt ausgeführt.
 * Mit `repeat` wird daraus eine feste Handelsroute.
 */
export function sellOrder(state: GameState, shipId: string, stationId: string, ware: string, amount: number, to: TradeEndpoint, contract?: number, repeat = false): Result {
  const s = state.ships.find((x) => x.id === shipId);
  const st = stationById(state, stationId);
  if (!s || !st) return fail('Schiff oder Station nicht gefunden.');
  const cls = SHIP_MAP[s.cls];
  if (cls.role !== 'trader') return fail('Nur Transporter können verkaufen.');
  if (WARES[ware].storage !== cls.storage) return fail('Diese Ware passt nicht in den Frachtraum.');
  if (!hasDockFor(st, cls.size)) return fail(cls.size === 'L' ? 'Die Station braucht einen Pier.' : 'Die Station braucht ein Dock.');
  const n = Math.min(amount, cls.capacity / WARES[ware].volume, sellableStock(st, ware));
  if (n < 1) return fail('Nichts über der Reserve zu verladen.');
  const job = { ware, amount: n, from: { kind: 'station' as const, id: st.id }, to, stage: 'pickup' as const, contract, manual: true };
  if (repeat) {
    s.mode = 'route';
    s.route = { from: { kind: 'station', id: st.id }, to, ware };
  }
  const busy = !!s.job || !!s.cargo || s.phase === 'toTarget' || s.phase === 'docking';
  if (busy) {
    s.orders = [...(s.orders ?? []), job];
    return ok(`${s.name} übernimmt den Verkauf nach der laufenden Fahrt.`);
  }
  s.orders = [job, ...(s.orders ?? [])];
  s.phase = 'idle';
  s.path = [];
  return ok(`${s.name} fliegt los: ${Math.round(n).toLocaleString('de-DE')} ${WARES[ware].name}.`);
}

/**
 * Einkaufsauftrag für ein bestimmtes Schiff: Ware bei einem Verkäufer (Handelsposten, NPC-Fabrik) kaufen und zur Station
 * bringen. Mit `repeat` wird daraus eine feste Route.
 */
export function buyOrder(state: GameState, shipId: string, stationId: string, ware: string, amount: number, from: TradeEndpoint, repeat = false): Result {
  const s = state.ships.find((x) => x.id === shipId);
  const st = stationById(state, stationId);
  if (!s || !st) return fail('Schiff oder Station nicht gefunden.');
  const cls = SHIP_MAP[s.cls];
  if (cls.role !== 'trader') return fail('Nur Transporter können einkaufen.');
  if (WARES[ware].storage !== cls.storage) return fail('Diese Ware passt nicht in den Frachtraum.');
  if (!hasDockFor(st, cls.size)) return fail(cls.size === 'L' ? 'Die Station braucht einen Pier.' : 'Die Station braucht ein Dock.');
  const n = Math.min(amount, cls.capacity / WARES[ware].volume);
  if (n < 1) return fail('Keine Menge gewählt.');
  const to = { kind: 'station' as const, id: st.id };
  const job = { ware, amount: n, from, to, stage: 'pickup' as const, manual: true };
  if (repeat) {
    s.mode = 'route';
    s.route = { from, to, ware };
  }
  const busy = !!s.job || !!s.cargo || s.phase === 'toTarget' || s.phase === 'docking';
  if (busy) {
    s.orders = [...(s.orders ?? []), job];
    return ok(`${s.name} kauft nach der laufenden Fahrt ein.`);
  }
  s.orders = [job, ...(s.orders ?? [])];
  s.phase = 'idle';
  s.path = [];
  return ok(`${s.name} fliegt los: ${Math.round(n).toLocaleString('de-DE')} ${WARES[ware].name} einkaufen.`);
}

/**
 * Bedarfsauftrag einem bestimmten Transporter geben (nimmt ein Angebot dabei gleich an). `from` ist der gewählte
 * Verkäufer oder eine eigene Station; ohne Angabe sucht das Schiff selbst den günstigsten.
 */
export function courierOrder(state: GameState, shipId: string, contractId: number, from?: TradeEndpoint): Result {
  const s = state.ships.find((x) => x.id === shipId);
  const c = state.contracts.find((x) => x.id === contractId);
  if (!s || !c || !isDelivery(c)) return fail('Schiff oder Auftrag nicht gefunden.');
  const cls = SHIP_MAP[s.cls];
  if (cls.role !== 'trader') return fail('Nur Transporter fliegen Lieferaufträge.');
  if (WARES[c.ware].storage !== cls.storage) return fail('Diese Ware passt nicht in den Frachtraum.');
  if (from?.kind === 'station') {
    const st = stationById(state, from.id);
    if (!st || !hasDockFor(st, cls.size)) return fail('Die Station hat kein passendes Dock.');
  }
  if (c.status === 'offer') {
    const r = acceptContract(state, c.id);
    if (!r.ok) return r;
  }
  const job = courierTrip(state, s, c, from);
  if (job) job.manual = true;
  if (!job) return fail('Für diesen Auftrag ist schon alles unterwegs oder nirgends Ware zu haben.');
  const busy = !!s.job || !!s.cargo || s.phase === 'toTarget' || s.phase === 'docking';
  if (busy) {
    s.orders = [...(s.orders ?? []), job];
    return ok(`${s.name} übernimmt die Lieferung nach der laufenden Fahrt.`);
  }
  s.orders = [job, ...(s.orders ?? [])];
  s.phase = 'idle';
  s.path = [];
  return ok(`${s.name} fliegt los: ${Math.round(job.amount).toLocaleString('de-DE')} ${WARES[c.ware].name} holen.`);
}

/** Befehl einreihen: sofort starten, wenn das Schiff frei ist, sonst hinten anstellen */
function enqueue(s: Ship, job: TradeJob): boolean {
  const busy = !!s.job || !!s.cargo || s.phase === 'toTarget' || s.phase === 'docking' || !!s.orders?.length;
  s.orders = [...(s.orders ?? []), job];
  if (!busy) { s.phase = 'idle'; s.path = []; }
  return busy;
}

/**
 * Einmaliger Kauf in den Laderaum: Das Schiff kauft beim Verkäufer und wartet dann mit der Ladung auf den nächsten Befehl
 * (z. B. „Laderaum verkaufen“). Der Laderaum muss am Ende der Warteschlange leer sein.
 */
export function holdBuyOrder(state: GameState, shipId: string, ware: string, from: TradeEndpoint, amount: number, opp?: number): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  const cls = SHIP_MAP[s.cls];
  if (cls.role !== 'trader') return fail('Nur Transporter können einkaufen.');
  if (WARES[ware].storage !== cls.storage) return fail('Diese Ware passt nicht in den Frachtraum.');
  if (from.kind !== 'market') return fail('Gekauft wird an Märkten.');
  if (expectedCargo(s)) return fail('Der Laderaum ist nach den geplanten Befehlen noch belegt – zuerst „Laderaum verkaufen“ einreihen.');
  const n = Math.floor(Math.min(amount, cls.capacity / WARES[ware].volume));
  if (n < 1) return fail('Keine Menge gewählt.');
  const busy = enqueue(s, { ware, amount: n, from, to: from, stage: 'pickup', hold: true, manual: true, opp });
  return ok(busy ? `${s.name} kauft nach den laufenden Befehlen ${n.toLocaleString('de-DE')} ${WARES[ware].name}.` : `${s.name} fliegt los: ${n.toLocaleString('de-DE')} ${WARES[ware].name} kaufen.`);
}

/** Laderaum verkaufen: die Ladung, die am Ende der Warteschlange an Bord sein wird, zu einem Käufer bringen */
export function holdSellOrder(state: GameState, shipId: string, to: TradeEndpoint): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  const cargo = expectedCargo(s);
  if (!cargo) return fail('Der Laderaum ist leer – es gibt nichts zu verkaufen.');
  if (to.kind === 'station') {
    const st = stationById(state, to.id);
    if (!st || !hasDockFor(st, SHIP_MAP[s.cls].size)) return fail('Die Station hat kein passendes Dock.');
  }
  const busy = enqueue(s, { ware: cargo.ware, amount: cargo.amount, from: to, to, stage: 'deliver', fromHold: true, manual: true });
  return ok(busy ? `${s.name} verkauft die Ladung nach den laufenden Befehlen.` : `${s.name} bringt die Ladung zum Käufer.`);
}

/** Handelsroute zwischen zwei Märkten mit Gewinnschwelle einrichten */
export function setTradeRoute(state: GameState, shipId: string, route: RouteOrder): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  const cls = SHIP_MAP[s.cls];
  if (cls.role !== 'trader') return fail('Nur Transporter fliegen Handelsrouten.');
  if (WARES[route.ware].storage !== cls.storage) return fail('Diese Ware passt nicht in den Frachtraum.');
  s.mode = 'route';
  s.route = { ...route };
  log(state, `${s.name}: Handelsroute ${WARES[route.ware].name} eingerichtet.`, 'info', false, { kind: 'ship', id: s.id });
  return ok(`${s.name} fliegt jetzt die Handelsroute${route.minMargin != null ? ` (${route.onLow === 'end' ? 'endet' : 'pausiert'} unter ${Math.round(route.minMargin * 100)} % Gewinn)` : ''}.`);
}

/** Erkunden: Schiff fliegt zu einer Station und dockt an – danach ist ihre Lage bekannt */
export function exploreOrder(state: GameState, shipId: string, key: string): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  if (SHIP_MAP[s.cls].role !== 'trader') return fail('Nur Transporter nehmen solche Befehle an.');
  const p = marketInfo(key);
  const to: TradeEndpoint = key === p.sector ? { kind: 'market', sector: p.sector } : { kind: 'market', sector: p.sector, market: key };
  const busy = enqueue(s, { ware: 'energycells', amount: 0, from: to, to, stage: 'deliver', manual: true, explore: true });
  return ok(busy ? `${s.name} fliegt nach den laufenden Befehlen zu ${p.name}.` : `${s.name} fliegt zu ${p.name} und erfasst die Station.`);
}

/** Sektorbefehl für ein freies Schiff: Handel mit einer Ware (Transporter) oder Abbau eines Rohstoffs (Miner) */
export function setSectorOrder(state: GameState, shipId: string, order: { sector: string; ware: string; to?: string } | null): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  if (s.home) return fail('Sektorbefehle gibt es nur für freie Schiffe – erst die Zuordnung zur Station lösen.');
  if (!order) { s.sectorOrder = undefined; return ok('Sektorbefehl aufgehoben.'); }
  const cls = SHIP_MAP[s.cls];
  if (!SECTOR_MAP[order.sector] || !WARES[order.ware]) return fail('Ungültiger Befehl.');
  if (WARES[order.ware].storage !== cls.storage) return fail('Diese Ware passt nicht in den Frachtraum.');
  if (cls.role === 'miner' && !SECTOR_MAP[order.sector].fields.some((f) => f.ware === order.ware)) return fail('In diesem Sektor gibt es kein solches Feld.');
  if (cls.role === 'miner' && !canMine(state, order.sector, order.ware)) return fail(`Kein Schürfrecht für ${WARES[order.ware].name} in ${SECTOR_MAP[order.sector].name} (Sektor → Schürfrechte).`);
  s.sectorOrder = { kind: cls.role === 'miner' ? 'mine' : 'trade', sector: order.sector, ware: order.ware, to: order.to || undefined };
  s.mode = 'auto';
  s.route = null;
  if (!s.cargo && !s.job) { s.phase = 'idle'; s.path = []; }
  return ok(cls.role === 'miner'
    ? `${s.name} baut ${WARES[order.ware].name} in ${SECTOR_MAP[order.sector].name} ab.`
    : `${s.name} handelt ${WARES[order.ware].name} in ${SECTOR_MAP[order.sector].name}.`);
}

/** Warteschlange: Befehl an Stelle i streichen */
export function removeOrder(state: GameState, shipId: string, i: number): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s?.orders?.[i]) return fail('Befehl nicht gefunden.');
  s.orders.splice(i, 1);
  return ok('Befehl gestrichen.');
}

/** Warteschlange: Befehl an Stelle i eins nach vorn */
export function moveOrderUp(state: GameState, shipId: string, i: number): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s?.orders?.[i] || i < 1) return fail('Befehl nicht gefunden.');
  [s.orders[i - 1], s.orders[i]] = [s.orders[i], s.orders[i - 1]];
  return ok('Reihenfolge geändert.');
}

/** Laufende Fahrt abbrechen – nur solange noch nichts geladen ist */
export function cancelJob(state: GameState, shipId: string): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s?.job) return fail('Keine laufende Fahrt.');
  if (s.cargo || s.job.stage !== 'pickup') return fail('Das Schiff ist schon beladen – die Fahrt wird zu Ende geflogen.');
  s.job = null;
  s.phase = 'idle';
  s.path = [];
  return ok('Fahrt abgebrochen.');
}

/** Lageranteil einer Ware festlegen (0..1) oder mit null wieder automatisch verteilen */
export function setStorageShare(state: GameState, stationId: string, ware: string, share: number | null): Result {
  const st = stationById(state, stationId);
  if (!st || !WARES[ware]) return fail('Nicht gefunden.');
  st.limits ??= {};
  if (share === null) delete st.limits[ware];
  else st.limits[ware] = Math.max(0, Math.min(1, share));
  return ok('Lagergrenze geändert.');
}

/** Reserve für die eigene Produktion festlegen (Einheiten) oder mit null automatisch */
export function setReserve(state: GameState, stationId: string, ware: string, units: number | null): Result {
  const st = stationById(state, stationId);
  if (!st || !WARES[ware]) return fail('Nicht gefunden.');
  st.reserve ??= {};
  if (units === null) delete st.reserve[ware];
  else st.reserve[ware] = Math.max(0, Math.round(units));
  return ok('Reserve geändert.');
}

/** Lieferreihenfolge für Überschüsse einer Station setzen (eigene Stationen in Reihenfolge) */
export function setDeliveryPrio(state: GameState, stationId: string, list: string[]): Result {
  const st = stationById(state, stationId);
  if (!st) return fail('Station nicht gefunden.');
  const ids = new Set(state.stations.map((x) => x.id));
  st.deliveryPrio = [...new Set(list)].filter((id) => ids.has(id) && id !== st.id);
  return ok(st.deliveryPrio.length ? 'Lieferreihenfolge gespeichert.' : 'Überschüsse gehen wieder an den besten Käufer.');
}
