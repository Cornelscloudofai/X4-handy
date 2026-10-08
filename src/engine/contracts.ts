// Lieferaufträge der Fraktionen
import { NPC_MAP, SECTOR_MAP, marketInfo, sector, FACTIONS } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { MODULE_MAP } from '../data/modules';
import { WARES, WARE_IDS } from '../data/wares';
import type { Contract, GameState } from './types';
import { emit, log, pick, rand } from './util';
import { knownSectors } from './logistics';
import { marketPrice, marketRoom, marketStock } from './economy';

const TITLES = ['Nachschub für', 'Dringende Lieferung:', 'Großauftrag:', 'Wiederaufbau:', 'Bestellung von'];

export function contractDeliver(state: GameState, id: number, wareId: string, amount: number): number {
  const c = state.contracts.find((x) => x.id === id);
  if (!c || c.status !== 'active' || c.ware !== wareId) return 0;
  const used = Math.min(amount, c.amount - c.delivered);
  c.delivered += used;
  if (c.delivered >= c.amount - 0.5) completeContract(state, c);
  return used;
}

function completeContract(state: GameState, c: Contract): void {
  c.delivered = c.amount;
  c.status = 'done';
  state.credits += c.reward;
  if (c.source) state.totals.couriers = (state.totals.couriers ?? 0) + 1;
  const f = sector(c.sector).faction;
  state.rep[f] = Math.min(30, state.rep[f] + c.rep);
  log(state, `Auftrag erfüllt: ${c.title} (+${Math.round(c.reward).toLocaleString('de-DE')} Cr, Ruf +${c.rep} bei ${FACTIONS[f].short})`, 'good', true);
  emit({ type: 'contractDone', id: c.id });
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

/** Kurieraufträge zahlen so viel mehr als der übliche Verkaufswert am Ziel */
export const COURIER_BONUS: [number, number] = [0.3, 0.5];

/**
 * Kurierauftrag: Eine Station braucht dringend eine Lieferung. Ware bei einem Verkäufer abholen (der Spieler kauft sie)
 * und zum Ziel bringen. Die Menge passt in eine Ladung eines eigenen Transporters, der Lohn liegt 30–50 % über dem
 * üblichen Verkaufswert am Ziel.
 */
export function generateCourier(state: GameState): Contract | null {
  const traders = state.ships.map((s) => SHIP_MAP[s.cls]).filter((c) => c?.role === 'trader');
  // Noch kein Transporter: Aufträge für einen kleinen Frachter als Anreiz
  const cls = traders.length ? pick(state, traders) : SHIP_MAP.tuatara;
  if (!cls) return null;
  const known = knownSectors(state);
  const sellers: string[] = [];
  const buyers: string[] = [];
  for (const sec of known) {
    sellers.push(sec);
    for (const n of sector(sec).npcStations) {
      if (n.makes?.length) sellers.push(n.id);
      if (n.buys.length) buyers.push(n.id);
    }
  }
  const sells = (key: string, id: string) => !NPC_MAP[key] || !!NPC_MAP[key].makes?.includes(id);
  const pairs: { from: string; to: string; ware: string; n: number; need: number }[] = [];
  for (const to of buyers) {
    const tm = state.markets[to];
    if (!tm) continue;
    for (const id of NPC_MAP[to].buys) {
      const w = WARES[id];
      if (!w || w.storage !== cls.storage || !tm[id]) continue;
      // „dringend“: das Ziel hat wenig davon
      const need = 1 - tm[id].stock / Math.max(1, tm[id].cap);
      if (need < 0.4) continue;
      for (const from of sellers) {
        if (from === to || !sells(from, id) || !state.markets[from]?.[id]) continue;
        const load = (cls.capacity / w.volume) * (0.6 + rand(state) * 0.4);
        const n = Math.floor(Math.min(load, marketStock(state, from, id) * 0.6, marketRoom(state, to, id)));
        if (n < (cls.capacity / w.volume) * 0.3 || n < 1) continue;
        pairs.push({ from, to, ware: id, n, need });
      }
    }
  }
  if (!pairs.length) return null;
  // Dringendere Ziele häufiger
  const total = pairs.reduce((a, p) => a + p.need, 0);
  let r = rand(state) * total;
  const p = pairs.find((x) => (r -= x.need) <= 0) ?? pairs[pairs.length - 1];
  const w = WARES[p.ware];
  const value = p.n * marketPrice(state, p.to, p.ware);
  const reward = Math.round((value * (1 + COURIER_BONUS[0] + rand(state) * (COURIER_BONUS[1] - COURIER_BONUS[0]))) / 100) * 100;
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
    title: `Kurier: ${w.name}`,
    source: p.from,
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
      // Neue Spiele: meist kleine Kurieraufträge, die zum eigenen Schiff passen
      const c = state.start && rand(state) < 0.75 ? generateCourier(state) ?? generateOffer(state) : generateOffer(state);
      if (c) {
        state.contracts.push(c);
        log(state, `Neues Auftragsangebot: ${c.title} (${SECTOR_MAP[c.sector].name}).`, 'info', true);
      }
    }
  }
}
