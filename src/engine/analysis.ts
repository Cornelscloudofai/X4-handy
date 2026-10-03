// Auswertungen für die Oberfläche: Engpässe, Reichweiten, Warnungen
import { MODULE_MAP } from '../data/modules';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { buildMissing, hasDockFor, stationRates, storageCap, usedVolume } from './economy';
import type { GameState, Station } from './types';

/** short: Kurzfassung für die Stationskarte auf der Karte */
export interface Alert { station: string; text: string; severity: 'warn' | 'bad'; ware?: string; short?: string }

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
  // Bauprojekt wartet auf Material
  if (st.build && st.waiting === 'material') {
    const missing = buildMissing(st);
    const miss = Object.entries(missing).map(([id, n]) => `${Math.ceil(n).toLocaleString('de-DE')} ${WARES[id].name}`);
    const local = Object.keys(missing).filter((id) => (st.inventory[id] ?? 0) >= 1).map((id) => WARES[id].name);
    if (miss.length) out.push({ station: st.id, text: `${st.name}: Baulager braucht noch ${miss.slice(0, 3).join(', ')}${miss.length > 3 ? ' …' : ''}${local.length ? ` – ${local.join(', ')} liegt im Stationslager: „Umladen“` : st.autoBuyBuild === false ? ' (nur eigenes Material)' : !ships.some((s) => SHIP_MAP[s.cls].role === 'trader') ? ' – eigene Transporter beschleunigen die Lieferung' : ''}`, severity: 'warn', short: 'Baulager wartet' });
  }
  // Ohne eigenen Transporter handelt niemand automatisch für diese Station
  if (hasProd && !ships.some((s) => SHIP_MAP[s.cls].role === 'trader') && state.ships.some((s) => SHIP_MAP[s.cls].role === 'trader')) {
    out.push({ station: st.id, text: `${st.name}: kein eigener Transporter – Überschüsse werden nicht verkauft, Fehlendes nicht eingekauft. Transporter kaufen oder einen hierher versetzen.`, severity: 'warn', short: 'Kein Transporter' });
  }
  // Überförderung: Miner bringen wiederholt mehr, als ins Lager passt
  const over = new Set(ships.filter((s) => SHIP_MAP[s.cls].role === 'miner' && (s.restStreak ?? 0) >= 2 && s.lastRest).map((s) => s.lastRest!.ware));
  for (const w of over) out.push({ station: st.id, text: `${st.name}: Miner fördern mehr ${WARES[w].name}, als die Station verbraucht – Überschuss wird verkauft. Weniger Miner oder mehr Verbraucher einplanen.`, severity: 'warn', short: `Zu viel ${WARES[w].name}` });
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
