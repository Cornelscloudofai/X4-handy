// Verlaufsdaten für Diagramme: alle 5 Spielminuten eine Messung, die letzten 24 Spielstunden bleiben erhalten.
// Gespeichert im Spielstand; Werte gerundet, damit er klein bleibt.
import { MODULE_MAP } from '../data/modules';
import { marketPrice, stationWares } from './economy';
import { netWorth } from './stats';
import type { GameState, HistoryData } from './types';

/** Abstand zweier Messungen in Spielsekunden */
export const HISTORY_EVERY = 300;
/** Anzahl Messungen (24 Stunden) */
export const HISTORY_MAX = (24 * 3600) / HISTORY_EVERY;

/** Schlüssel der Verlaufsreihen */
export const H = {
  credits: 'cr',
  worth: 'nw',
  /** Lagerbestand einer Ware an einer Station */
  stock: (st: string, ware: string) => `inv:${st}:${ware}`,
  /** Einnahmen bzw. Ausgaben einer Station seit der vorigen Messung */
  income: (st: string) => `in:${st}`,
  expenses: (st: string) => `ex:${st}`,
  /** Durchschnittliche Auslastung der Produktion einer Station (0 … 100) */
  util: (st: string) => `ut:${st}`,
  /** Preis einer Ware am Handelsposten eines Sektors */
  price: (sector: string, ware: string) => `px:${sector}:${ware}`,
};

function historyOf(state: GameState): HistoryData {
  if (!state.history) state.history = { times: [], s: {}, last: {} };
  return state.history;
}

/** Eine Messung aufnehmen */
export function sampleHistory(state: GameState): void {
  const h = historyOf(state);
  const snap: Record<string, number> = {};
  snap[H.credits] = Math.round(state.credits);
  snap[H.worth] = Math.round(netWorth(state));
  const watched = new Set<string>();
  for (const st of state.stations) {
    for (const [id, n] of Object.entries(st.inventory)) if (n >= 0.5 || h.s[H.stock(st.id, id)]) snap[H.stock(st.id, id)] = Math.round(n);
    // Einnahmen/Ausgaben: Zuwachs seit der vorigen Messung
    const li = h.last[`in:${st.id}`] ?? st.income, le = h.last[`ex:${st.id}`] ?? st.expenses;
    snap[H.income(st.id)] = Math.round(Math.max(0, st.income - li));
    snap[H.expenses(st.id)] = Math.round(Math.max(0, st.expenses - le));
    h.last[`in:${st.id}`] = st.income;
    h.last[`ex:${st.id}`] = st.expenses;
    const prods = st.modules.filter((m) => MODULE_MAP[m.def]?.kind === 'production');
    if (prods.length) snap[H.util(st.id)] = Math.round((prods.reduce((s, m) => s + m.util, 0) / prods.length) * 100);
    for (const w of stationWares(st)) watched.add(w);
  }
  // Preise der Waren, mit denen die eigenen Stationen handeln, an den Handelsposten der eigenen Sektoren
  for (const sec of state.sectors) {
    if (!state.markets[sec]) continue;
    for (const w of watched) if (state.markets[sec][w]) snap[H.price(sec, w)] = Math.round(marketPrice(state, sec, w) * 10) / 10;
  }
  h.times.push(Math.round(state.time));
  const len = h.times.length;
  for (const [k, v] of Object.entries(snap)) {
    let arr = h.s[k];
    if (!arr) arr = h.s[k] = new Array(len - 1).fill(null);
    arr.push(v);
  }
  for (const arr of Object.values(h.s)) if (arr.length < len) arr.push(null);
  // Älteste Messungen verwerfen, leere Reihen löschen
  const over = h.times.length - HISTORY_MAX;
  if (over > 0) {
    h.times.splice(0, over);
    for (const [k, arr] of Object.entries(h.s)) {
      arr.splice(0, over);
      if (arr.every((v) => v == null)) delete h.s[k];
    }
  }
}

/** Im Simulationsschritt aufrufen: erste Messung sofort, danach im festen Abstand */
export function stepHistory(state: GameState, _dt: number): void {
  const h = state.history;
  if (!h || !h.times.length || state.time - h.times[h.times.length - 1] >= HISTORY_EVERY) sampleHistory(state);
}

export interface Series { times: number[]; values: (number | null)[] }

/** Verlauf einer Reihe für die letzten `hours` Stunden */
export function series(state: GameState, key: string, hours = 24): Series | null {
  const h = state.history;
  const arr = h?.s[key];
  if (!h || !arr) return null;
  const from = state.time - hours * 3600;
  let i = h.times.findIndex((t) => t >= from);
  if (i < 0) i = h.times.length;
  return { times: h.times.slice(i), values: arr.slice(i) };
}
