// Bedarfsauftrag ausführen: Einkaufsort und Schiff wählen – mit Preis, Gewinn und Flugzeit je Möglichkeit
import { marketInfo } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { STORAGE_LABEL, WARES } from '../data/wares';
import { wareSellers } from '../engine/contracts';
import { seenPrice } from '../engine/intel';
import { hasDockFor, marketPrice } from '../engine/economy';
import { inTransitForContract, marketEndpoint, shipPlace } from '../engine/fleet';
import { endpointPlace, sellableStock, travelDistance } from '../engine/logistics';
import type { Contract, GameState, Ship, TradeEndpoint } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtCr, fmtDur, fmtInt } from './format';
import { icon } from './icons';

export interface DeliveryModal { type: 'courierShip'; contract: number; source?: string; ship?: string }

export interface DeliverySource { id: string; name: string; own: boolean; price: number; stock: number; units: number; profit: number; flight: number; endpoint: TradeEndpoint }

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

export function deliveryShips(state: GameState, c: Contract): Ship[] {
  const w = WARES[c.ware];
  return state.ships
    .filter((s) => SHIP_MAP[s.cls].role === 'trader' && SHIP_MAP[s.cls].storage === w.storage)
    .sort((a, b) => Number(!!a.job || !!a.cargo) - Number(!!b.job || !!b.cargo));
}

/** Wo die Ware für den Auftrag herkommen kann: eigene Lager und Verkäufer, bester Gewinn zuerst (Flugzeit kostet ein wenig) */
export function deliverySources(state: GameState, c: Contract, ship: Ship | null): DeliverySource[] {
  const cls = ship ? SHIP_MAP[ship.cls] : SHIP_MAP.tuatara;
  const rest = Math.max(0, c.amount - c.delivered - inTransitForContract(state, c.id));
  const load = Math.min(rest || c.amount, cls.capacity / WARES[c.ware].volume);
  const perUnit = c.reward / c.amount;
  const dest = endpointPlace(state, marketEndpoint(c.market ?? c.sector));
  const from = ship ? shipPlace(ship) : null;
  const flight = (p: { sector: string; x: number; z: number }) => ((from ? travelDistance(from, p) : 0) + (dest ? travelDistance(p, dest) : 0)) / cls.speed;
  const out: DeliverySource[] = [];
  for (const st of state.stations) {
    const stock = sellableStock(st, c.ware);
    if (stock < 1 || !hasDockFor(st, cls.size)) continue;
    const units = Math.min(load, stock);
    out.push({ id: 'st:' + st.id, name: st.name, own: true, price: 0, stock, units, profit: units * perUnit, flight: flight(st), endpoint: { kind: 'station', id: st.id } });
  }
  for (const x of c.source ? [{ key: c.source, stock: Infinity }] : wareSellers(state, c.ware, c.market)) {
    const price = seenPrice(state, x.key, c.ware) ?? marketPrice(state, x.key, c.ware);
    const units = Math.min(load, x.stock);
    const p = marketInfo(x.key);
    out.push({ id: x.key, name: p.name, own: false, price, stock: x.stock, units, profit: units * (perUnit - price), flight: flight(p), endpoint: marketEndpoint(x.key) });
  }
  // Jede Minute Flug kostet so viel wie 1 % des Lohns – so gewinnt der bessere Preis, außer der Umweg ist groß
  const perMin = c.reward * 0.01;
  return out.sort((a, b) => b.profit - (b.flight / 60) * perMin - (a.profit - (a.flight / 60) * perMin));
}

export function deliveryModalHtml(state: GameState, m: DeliveryModal): { title: string; eyebrow: string; body: string; foot: string } | null {
  const c = state.contracts.find((x) => x.id === m.contract);
  if (!c || (c.status !== 'offer' && c.status !== 'active')) return null;
  const w = WARES[c.ware];
  const ships = deliveryShips(state, c);
  const ship = ships.find((s) => s.id === m.ship) ?? ships[0] ?? null;
  const sources = deliverySources(state, c, ship);
  const src = sources.find((x) => x.id === m.source) ?? sources[0];
  const destKey = c.market ?? c.sector;
  const destPrice = seenPrice(state, destKey, c.ware) ?? marketPrice(state, destKey, c.ware);
  const perUnit = c.reward / c.amount;
  const rows = sources.slice(0, 8).map((x) => `<button class="offer ${x === src ? 'picked' : ''}" ${act('cs-src', { k: x.id })}>
      <div class="offer-head"><div style="min-width:0;flex:1"><div class="title">${esc(x.name)}</div>
        <div class="sub">${x.own ? 'Eigenes Lager' : x.id === marketInfo(x.id).sector ? 'Handelsposten' : 'NPC-Fabrik'} · ${fmtAmount(x.stock)} vorhanden</div></div>
        <div class="offer-metric"><b class="num ${x.profit > 0 ? 'pos' : 'neg'}">${fmtCr(x.profit)}</b><span>Gewinn</span></div></div>
      <div class="offer-grid">
        <div><small>Einkauf</small><b>${x.own ? '–' : fmtInt(x.price) + ' Cr'}</b></div>
        <div><small>Ladung</small><b>${fmtAmount(x.units)}</b></div>
        <div><small>Flugzeit</small><b>${fmtDur(x.flight)}</b></div>
      </div></button>`).join('');
  const shipRows = ships.map((s) => `<button class="pill ${s === ship ? 'teal' : ''}" ${act('cs-ship', { id: s.id })}>${icon('trader', 14)}${esc(s.name)} · ${fmtAmount(SHIP_MAP[s.cls].capacity / w.volume)} E.${s.job || s.cargo ? ' · unterwegs' : ''}</button>`).join('');
  const body = `
    <div class="advice">${icon('trader', 18)}<p><b>${esc(marketInfo(destKey).name)}</b> braucht dringend ${esc(w.name)} und zahlt <b class="pos">${fmtInt(perUnit)} Cr</b> je Einheit – Marktpreis dort gerade ${fmtInt(destPrice)} Cr, üblich ${fmtInt(w.price.avg)} Cr. Wo du einkaufst, entscheidest du: je günstiger, desto mehr bleibt hängen.</p></div>
    <div class="section"><h3>Schiff</h3>${ships.length ? `<div class="pills">${shipRows}</div>` : `<div class="box empty">Kein passender Transporter für ${esc(STORAGE_LABEL[w.storage])}. <button class="linkish" ${act('buyship-modal', { st: state.stations[0]?.id ?? '', role: 'trader' })}>Transporter kaufen</button></div>`}
      ${ship && (ship.job || ship.cargo) ? `<p class="small muted" style="margin:6px 0 0">${esc(ship.name)} ist unterwegs und startet danach.</p>` : ''}</div>
    <div class="section dl-sources"><h3>Wo einkaufen? · ${sources.length}</h3>${rows ? `<div class="offers">${rows}</div>` : '<div class="box empty">Gerade hat niemand in bekannten Sektoren diese Ware.</div>'}</div>
    <p class="small muted">Lohn insgesamt ${fmtCr(c.reward)} für ${fmtInt(c.amount)} Einheiten, bezahlt mit jeder Lieferung. Transporter im Autohandel übernehmen angenommene Aufträge auch selbst und kaufen dann beim günstigsten Verkäufer. Mehrere Ladungen? Eine Versorgungslinie zum Ziel zählt ebenfalls – jede Lieferung dorthin geht zuerst an den Auftrag.</p>`;
  const canGo = !!ship && !!src;
  const foot = `<div class="sell-foot">${src ? `<div class="small"><b>${esc(src.name)}</b> → ${esc(marketInfo(destKey).name)} · Gewinn ca. ${fmtCr(src.profit)}</div>` : ''}
    <div class="card-actions">${c.status === 'offer' ? `<button class="btn" ${act('cs-accept', { id: c.id })}>Nur annehmen</button>` : `<button class="btn" ${act('modal-close')}>Abbrechen</button>`}<button class="btn primary ${canGo ? '' : 'disabled'}" ${act('cs-go')}>${icon('trader', 18)}${c.status === 'offer' ? 'Annehmen und los' : 'Losschicken'}</button></div></div>`;
  return { title: `Lieferung: ${w.name}`, eyebrow: `${fmtInt(c.amount - c.delivered)} Einheiten · noch ${fmtDur((c.status === 'offer' ? c.duration : c.deadline - state.time))}`, body, foot };
}
