// Auswertungen für die Oberfläche: Engpässe, Reichweiten, Warnungen
import { MODULE_MAP } from '../data/modules';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { hasDockFor, stationRates, storageCap, usedVolume } from './economy';
import type { GameState, Station } from './types';

export interface Alert { station: string; text: string; severity: 'warn' | 'bad'; ware?: string }

export function stationAlerts(state: GameState, st: Station): Alert[] {
  const out: Alert[] = [];
  const missing = new Set<string>();
  let full = false;
  for (const m of st.modules) {
    const d = MODULE_MAP[m.def];
    if (d?.kind !== 'production' || !d.ware) continue;
    if (m.stall === 'input') {
      for (const i of WARES[d.ware].inputs) if ((st.inventory[i.ware] ?? 0) < i.amount) missing.add(i.ware);
    }
    if (m.stall === 'storage') full = true;
  }
  for (const w of missing) out.push({ station: st.id, text: `${st.name}: ${WARES[w].name} fehlt`, severity: 'warn', ware: w });
  if (full) out.push({ station: st.id, text: `${st.name}: Lager voll, Produktion pausiert`, severity: 'warn' });
  const hasProd = st.modules.some((m) => MODULE_MAP[m.def]?.kind === 'production');
  const cap = storageCap(st);
  if (hasProd && cap.Container + cap.Solid + cap.Liquid === 0) out.push({ station: st.id, text: `${st.name}: kein Lagermodul`, severity: 'bad' });
  const ships = state.ships.filter((s) => s.home === st.id);
  if (ships.some((s) => SHIP_MAP[s.cls].size !== 'L') && !hasDockFor(st, 'M')) out.push({ station: st.id, text: `${st.name}: Schiffe brauchen ein Dock`, severity: 'bad' });
  if (ships.some((s) => SHIP_MAP[s.cls].size === 'L') && !hasDockFor(st, 'L')) out.push({ station: st.id, text: `${st.name}: L-Schiffe brauchen einen Pier`, severity: 'bad' });
  // Miner ohne passendes Lager
  for (const s of ships) {
    const c = SHIP_MAP[s.cls];
    if (c.role === 'miner' && cap[c.storage] === 0) {
      out.push({ station: st.id, text: `${st.name}: ${c.storage === 'Liquid' ? 'Flüssiglager' : 'Feststofflager'} für ${c.name} fehlt`, severity: 'bad' });
      break;
    }
  }
  return out;
}

export function allAlerts(state: GameState): Alert[] {
  return state.stations.flatMap((st) => stationAlerts(state, st));
}

/** Kürzeste Reichweite einer Eingangsware in Sekunden (bei Nennverbrauch) */
export function shortestRunway(st: Station): { ware: string; seconds: number } | null {
  const rates = stationRates(st);
  let best: { ware: string; seconds: number } | null = null;
  for (const [id, r] of Object.entries(rates)) {
    const net = r.use - r.prod;
    if (net <= 0) continue;
    const s = ((st.inventory[id] ?? 0) / net) * 3600;
    if (!best || s < best.seconds) best = { ware: id, seconds: s };
  }
  return best;
}

export function storageUse(st: Station) {
  const cap = storageCap(st);
  const used = usedVolume(st);
  return (['Container', 'Solid', 'Liquid'] as const).map((t) => ({ type: t, cap: cap[t], used: used[t] }));
}

export function productionUtil(st: Station): number {
  const prods = st.modules.filter((m) => MODULE_MAP[m.def]?.kind === 'production');
  if (!prods.length) return 0;
  return prods.reduce((s, m) => s + m.util, 0) / prods.length;
}

/** Geschätzter Warenwert-Ausstoß pro Stunde (Durchschnittspreise, aktuelle Auslastung) */
export function stationOutputValue(st: Station): number {
  let v = 0;
  const rates = stationRates(st);
  const util = productionUtil(st) || 0;
  for (const [id, r] of Object.entries(rates)) v += (r.prod - r.use) * WARES[id].price.avg;
  return v * util;
}
