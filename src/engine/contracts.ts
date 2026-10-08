// Lieferaufträge der Fraktionen
import { SECTOR_MAP, marketInfo, sector, FACTIONS } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { MODULE_MAP } from '../data/modules';
import { WARES, WARE_IDS } from '../data/wares';
import type { Contract, GameState } from './types';
import { emit, log, pick, rand } from './util';
import { knownSectors } from './logistics';
import { marketPrice, marketRoom, marketStock } from './economy';

const TITLES = ['Nachschub für', 'Dringende Lieferung:', 'Großauftrag:', 'Wiederaufbau:', 'Bestellung von'];

/**
 * Liefert Ware für einen Auftrag. Der Lohn wird anteilig mit jeder Lieferung gezahlt (Rückgabe: abgenommene Menge und
 * gezahlter Lohn), der Rest beim Abschluss.
 */
export function contractDeliver(state: GameState, id: number, wareId: string, amount: number): { used: number; pay: number } {
  const c = state.contracts.find((x) => x.id === id);
  if (!c || c.status !== 'active' || c.ware !== wareId) return { used: 0, pay: 0 };
  const used = Math.min(amount, c.amount - c.delivered);
  c.delivered += used;
  let pay = Math.max(0, Math.min(c.reward - (c.paid ?? 0), (c.reward * used) / c.amount));
  state.credits += pay;
  c.paid = (c.paid ?? 0) + pay;
  if (c.delivered >= c.amount - 0.5) pay += completeContract(state, c);
  return { used, pay };
}

function completeContract(state: GameState, c: Contract): number {
  c.delivered = c.amount;
  c.status = 'done';
  const rest = Math.max(0, c.reward - (c.paid ?? 0));
  state.credits += rest;
  c.paid = c.reward;
  if (isDelivery(c)) state.totals.couriers = (state.totals.couriers ?? 0) + 1;
  const f = sector(c.sector).faction;
  state.rep[f] = Math.min(30, state.rep[f] + c.rep);
  log(state, `Auftrag erfüllt: ${c.title} (+${Math.round(c.reward).toLocaleString('de-DE')} Cr, Ruf +${c.rep} bei ${FACTIONS[f].short})`, 'good', true);
  emit({ type: 'contractDone', id: c.id });
  return rest;
}

/** Spieler-Fortschritt bestimmt, welche Waren angefragt werden */
function unlockedTier(state: GameState): number {
  let tier = 1;
  for (const id of state.blueprints) {
    const m = MODULE_MAP[id];
    if (m?.ware) tier = Math.max(tier, WARES[m.ware].tier);
  }
  return tier;
}

export function generateOffer(state: GameState): Contract | null {
  const known = knownSectors(state);
  const secId = pick(state, known);
  const sec = SECTOR_MAP[secId];
  const maxTier = Math.min(3, unlockedTier(state) + (rand(state) < 0.3 ? 1 : 0));
  // Nur Waren, deren Bauplan der Spieler besitzt oder mit seinem Ruf kaufen kann
  const pool = WARE_IDS.filter((id) => {
    const w = WARES[id];
    const m = MODULE_MAP['prod_' + id];
    return w.tier >= 1 && w.tier <= maxTier && !!m && (state.blueprints.includes(m.id) || state.rep.frf + 3 >= m.repRequired);
  });
  const demanded = sec.demand.filter((id) => pool.includes(id));
  const wareId = demanded.length && rand(state) < 0.6 ? pick(state, demanded) : pick(state, pool);
  if (!wareId) return null;
  const w = WARES[wareId];
  const worth = Math.max(3_000_000, netWorthCache(state));
  const targetValue = Math.min(6_000_000, Math.max(250_000, worth * (0.04 + rand(state) * 0.05)));
  const amount = Math.max(50, Math.round(targetValue / w.price.avg / 50) * 50);
  const duration = Math.round((4 + rand(state) * 8) * 3600);
  const reward = Math.round((amount * w.price.avg * (1.45 + rand(state) * 0.35)) / 1000) * 1000;
  const c: Contract = {
    id: state.nextId++,
    sector: secId,
    ware: wareId,
    amount,
    delivered: 0,
    reward,
    rep: amount * w.price.avg > 1_500_000 ? 2 : 1,
    deadline: state.time + 3 * 3600,
    duration,
    status: 'offer',
    title: `${pick(state, TITLES)} ${w.name}`,
  };
  return c;
}

/** Lieferaufträge zahlen so viel mehr als der aktuelle Preis am Ziel */
export const COURIER_BONUS: [number, number] = [0.3, 0.5];

/** Bedarfsauftrag (Lieferauftrag für die eigene Schiffsklasse): Ziel steht fest, wo eingekauft wird, entscheidet der Spieler */
export function isDelivery(c: Contract): boolean {
  return !!c.size;
}

export interface WareSeller { key: string; sector: string; price: number; stock: number }

/** Wer in bekannten Sektoren eine Ware verkauft: Handelsposten und NPC-Fabriken (nur eigene Produkte), günstigste zuerst */
export function wareSellers(state: GameState, ware: string, exclude = ''): WareSeller[] {
  const out: WareSeller[] = [];
  for (const sec of knownSectors(state)) {
    const keys = [sec, ...sector(sec).npcStations.filter((n) => n.makes?.includes(ware)).map((n) => n.id)];
    for (const key of keys) {
      if (key === exclude || !state.markets[key]?.[ware]) continue;
      const stock = marketStock(state, key, ware);
      if (stock >= 1) out.push({ key, sector: marketInfo(key).sector, price: marketPrice(state, key, ware), stock });
    }
  }
  return out.sort((a, b) => a.price - b.price);
}

/**
 * Bedarfsauftrag: Eine Station braucht dringend eine Ware – ihr Lager ist fast leer, ihr Preis liegt über dem Durchschnitt.
 * Sie zahlt 30–50 % über ihrem aktuellen (hohen) Preis. Angeboten wird nur, was anderswo in bekannten Sektoren
 * deutlich günstiger zu haben ist: Wer gut einkauft, verdient am Handel und am Aufschlag. Die Menge passt in eine Ladung
 * eines eigenen Transporters (ohne Transporter: für einen Tuatara).
 */
export function generateCourier(state: GameState): Contract | null {
  const traders = state.ships.map((s) => SHIP_MAP[s.cls]).filter((c) => c?.role === 'trader');
  const cls = traders.length ? pick(state, traders) : SHIP_MAP.tuatara;
  if (!cls) return null;
  const taken = new Set(state.contracts.filter((c) => (c.status === 'offer' || c.status === 'active') && c.market).map((c) => c.market + ':' + c.ware));
  const cands: { to: string; ware: string; n: number; price: number; weight: number }[] = [];
  for (const sec of knownSectors(state)) {
    // Abnehmer: NPC-Stationen (was sie ankaufen) und Handelsposten (was der Sektor braucht)
    const buyers: [string, string[]][] = [[sec, SECTOR_MAP[sec].demand], ...sector(sec).npcStations.filter((n) => n.buys.length).map((n): [string, string[]] => [n.id, n.buys])];
    for (const [to, wares] of buyers) {
      const tm = state.markets[to];
      if (!tm) continue;
      for (const id of wares) {
        const w = WARES[id];
        if (!w || w.storage !== cls.storage || !tm[id] || taken.has(to + ':' + id)) continue;
        const need = 1 - tm[id].stock / Math.max(1, tm[id].cap);
        const price = marketPrice(state, to, id);
        if (need < 0.5 || price < w.price.avg) continue;
        const load = cls.capacity / w.volume;
        const n = Math.floor(Math.min(load * (0.6 + rand(state) * 0.4), marketRoom(state, to, id)));
        if (n < load * 0.3 || n < 1) continue;
        // Nur wenn es anderswo genug Ware deutlich unter dem Zielpreis gibt
        const cheap = wareSellers(state, id, to).find((x) => x.stock >= n * 0.5);
        if (!cheap || cheap.price > price * 0.85) continue;
        cands.push({ to, ware: id, n, price, weight: need * (price / w.price.avg) });
      }
    }
  }
  if (!cands.length) return null;
  // Abwechslung: Jede Ware bekommt insgesamt ähnlich viel Gewicht, egal wie viele Stationen sie gerade brauchen
  const perWare = new Map<string, number>();
  for (const c of cands) perWare.set(c.ware, (perWare.get(c.ware) ?? 0) + 1);
  for (const c of cands) c.weight /= perWare.get(c.ware)!;
  const total = cands.reduce((a, p) => a + p.weight, 0);
  let r = rand(state) * total;
  const p = cands.find((x) => (r -= x.weight) <= 0) ?? cands[cands.length - 1];
  const w = WARES[p.ware];
  const reward = Math.round((p.n * p.price * (1 + COURIER_BONUS[0] + rand(state) * (COURIER_BONUS[1] - COURIER_BONUS[0]))) / 100) * 100;
  const dest = marketInfo(p.to);
  return {
    id: state.nextId++,
    sector: dest.sector,
    ware: p.ware,
    amount: p.n,
    delivered: 0,
    reward,
    rep: 1,
    deadline: state.time + 2 * 3600,
    duration: Math.round((1.5 + rand(state)) * 3600),
    status: 'offer',
    title: `Lieferung: ${w.name}`,
    market: p.to,
    size: cls.size,
  };
}

let cachedWorth = 0;
export function setNetWorthCache(v: number): void { cachedWorth = v; }
function netWorthCache(_state: GameState): number { return cachedWorth; }

export function acceptContract(state: GameState, id: number): { ok: boolean; msg: string } {
  const c = state.contracts.find((x) => x.id === id);
  if (!c || c.status !== 'offer') return { ok: false, msg: 'Angebot nicht mehr verfügbar.' };
  const active = state.contracts.filter((x) => x.status === 'active' && !x.story).length;
  if (active >= 4) return { ok: false, msg: 'Höchstens 4 Aufträge gleichzeitig.' };
  c.status = 'active';
  c.deadline = state.time + c.duration;
  log(state, `Auftrag angenommen: ${c.title}${c.market ? '' : ` für ${sector(c.sector).tradeStation.name}`}.`, 'info');
  return { ok: true, msg: 'Auftrag angenommen.' };
}

export function stepContracts(state: GameState, dt: number): void {
  state.contractTimer -= dt;
  for (const c of state.contracts) {
    if (c.story) continue;
    if (c.status === 'offer' && state.time > c.deadline) c.status = 'failed';
    if (c.status === 'active' && state.time > c.deadline) {
      c.status = 'failed';
      const f = sector(c.sector).faction;
      state.rep[f] = Math.max(-10, state.rep[f] - 1);
      log(state, `Frist verpasst: ${c.title}. Ruf −1.`, 'bad', true);
    }
  }
  // Alte Einträge entfernen
  const keep = state.contracts.filter((c) => c.status === 'offer' || c.status === 'active' || c.story);
  const finished = state.contracts.filter((c) => !keep.includes(c)).slice(-12);
  state.contracts = [...finished, ...keep];
  if (state.contractTimer <= 0) {
    state.contractTimer = (state.start ? 12 + rand(state) * 18 : 25 + rand(state) * 25) * 60;
    const offers = state.contracts.filter((c) => c.status === 'offer').length;
    if (offers < 4) {
      // Neue Spiele: Bedarfsaufträge, die zum eigenen Schiff passen
      const c = state.start ? generateCourier(state) : generateOffer(state);
      if (c) {
        state.contracts.push(c);
        log(state, `Neues Auftragsangebot: ${c.title} (${SECTOR_MAP[c.sector].name}).`, 'info', true);
      }
    }
  }
}
