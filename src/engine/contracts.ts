// Lieferaufträge der Fraktionen
import { SECTOR_MAP, sector, FACTIONS } from '../data/sectors';
import { MODULE_MAP } from '../data/modules';
import { WARES, WARE_IDS } from '../data/wares';
import type { Contract, GameState } from './types';
import { emit, log, pick, rand } from './util';
import { knownSectors } from './logistics';

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
  log(state, `Auftrag angenommen: ${c.title} für ${sector(c.sector).tradeStation.name}.`, 'info');
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
    state.contractTimer = (25 + rand(state) * 25) * 60;
    const offers = state.contracts.filter((c) => c.status === 'offer').length;
    if (offers < 4) {
      const c = generateOffer(state);
      if (c) {
        state.contracts.push(c);
        log(state, `Neues Auftragsangebot: ${c.title} (${SECTOR_MAP[c.sector].name}).`, 'info', true);
      }
    }
  }
}
