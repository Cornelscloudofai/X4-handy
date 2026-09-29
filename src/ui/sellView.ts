// Verkaufsdialog: Käufer für eine Ladung vergleichen und gezielt einen auswählen
import { FACTIONS, SECTOR_MAP } from '../data/sectors';
import { SHIP_CLASSES, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { hasDockFor, wareLimit } from '../engine/economy';
import { reserveFor, stationById } from '../engine/logistics';
import { offerBadges, saleAdvice, saleContext, saleOffers, sortOffers, type SaleOffer, type SalePriority } from '../engine/sales';
import type { GameState, ShipClassDef } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtCr, fmtDur, fmtInt } from './format';
import { icon } from './icons';

export interface SellModal {
  type: 'sell';
  station: string;
  ware: string;
  /** Schiffs-ID oder "cls:<klasse>" zum reinen Vergleich */
  ship: string;
  amount: number;
  prio: SalePriority;
  picked: string;
  repeat: boolean;
}

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

const PRIO_LABEL: Record<SalePriority, string> = { price: 'Bester Preis', perHour: 'Ertrag pro Stunde', throughput: 'Schneller Umschlag' };
const BADGE: Record<SalePriority, string> = { price: 'Bester Preis', perHour: 'Bester Ertrag/h', throughput: 'Schnellster Umschlag' };

/** Transporter, die diese Ware laden können – freie zuerst */
export function sellShips(state: GameState, stationId: string, ware: string) {
  const st = stationById(state, stationId);
  return state.ships
    .filter((s) => SHIP_MAP[s.cls].role === 'trader' && SHIP_MAP[s.cls].storage === WARES[ware].storage)
    .sort((a, b) => Number(!!a.job || !!a.cargo) - Number(!!b.job || !!b.cargo) || Number(b.home === st?.id) - Number(a.home === st?.id));
}

export function defaultSellModal(state: GameState, stationId: string, ware: string): SellModal {
  const ships = sellShips(state, stationId, ware);
  const ship = ships[0]?.id ?? 'cls:boa';
  const cls = shipClass(state, ship);
  const stock = stationById(state, stationId)?.inventory[ware] ?? 0;
  return { type: 'sell', station: stationId, ware, ship, amount: Math.floor(Math.min(stock, cls.capacity / WARES[ware].volume)), prio: 'perHour', picked: '', repeat: false };
}

export function shipClass(state: GameState, ship: string): ShipClassDef {
  if (ship.startsWith('cls:')) return SHIP_MAP[ship.slice(4)];
  const s = state.ships.find((x) => x.id === ship);
  return s ? SHIP_MAP[s.cls] : SHIP_MAP.boa;
}

export function sellModalHtml(state: GameState, m: SellModal): { title: string; eyebrow: string; body: string; foot: string } {
  const st = stationById(state, m.station)!;
  const w = WARES[m.ware];
  const cls = shipClass(state, m.ship);
  const realShip = m.ship.startsWith('cls:') ? null : state.ships.find((x) => x.id === m.ship) ?? null;
  const ctx = saleContext(state, st.id, m.ware, cls);
  const limit = wareLimit(st, m.ware);
  const reserve = Math.min(ctx.stock, reserveFor(st, m.ware, limit));
  const sellable = Math.max(0, ctx.stock - reserve);
  const maxLoad = Math.floor(Math.min(sellable, ctx.shipUnits));
  const amount = Math.max(0, Math.min(m.amount, maxLoad));
  const offers = saleOffers(state, st.id, m.ware, cls, amount);
  const sorted = sortOffers(offers, m.prio);
  const badges = offerBadges(offers);
  const advice = saleAdvice(ctx, offers);
  const best = sorted[0];
  const metric = (o: SaleOffer) => (m.prio === 'price' ? o.unitPrice : m.prio === 'perHour' ? o.perHour : o.unitsPerHour);
  const top = best ? Math.max(1e-9, metric(best)) : 1;

  // Schiffsauswahl
  const ships = sellShips(state, st.id, m.ware);
  const shipChips = ships.length
    ? ships.map((s) => {
        const c = SHIP_MAP[s.cls];
        const busy = !!s.job || !!s.cargo;
        return `<button class="pill ${m.ship === s.id ? 'teal' : ''}" ${act('sell-ship', { id: s.id })}>${icon('trader', 14)}${esc(s.name)} · ${fmtAmount(c.capacity / w.volume)} E.${busy ? ' · unterwegs' : ''}</button>`;
      }).join('')
    : SHIP_CLASSES.filter((c) => c.role === 'trader' && c.storage === w.storage).map((c) => `<button class="pill ${m.ship === 'cls:' + c.id ? 'teal' : ''}" ${act('sell-ship', { id: 'cls:' + c.id })}>${esc(c.name)} (Vergleich)</button>`).join('');

  const cards = sorted.map((o) => {
    const sec = SECTOR_MAP[o.sector];
    const kindLabel = o.kind === 'trade' ? 'Handelsposten' : o.kind === 'contract' ? 'Auftrag' : 'Käuferstation';
    const partial = o.accept < amount - 0.5;
    const picked = m.picked === o.id;
    const tags = (badges[o.id] ?? []).map((b) => `<span class="pill ${b === m.prio ? 'amber' : ''}">${BADGE[b]}</span>`).join('');
    const where = o.hops === 0 ? 'gleicher Sektor' : `${o.hops} Sprung${o.hops === 1 ? '' : 'e'} · ${esc(sec.name)}`;
    return `<button class="offer ${picked ? 'picked' : ''}" ${act('sell-pick', { id: o.id })} data-key="${o.id}">
      <div class="offer-head"><div style="min-width:0;flex:1"><div class="title">${esc(o.name)}</div>
        <div class="sub">${kindLabel} · ${where} · ${fmtInt(o.km)} km</div></div>
        <div class="offer-metric"><b class="num">${m.prio === 'price' ? fmtInt(o.unitPrice) + ' Cr' : m.prio === 'perHour' ? fmtCr(o.perHour) + '/h' : fmtAmount(o.unitsPerHour) + '/h'}</b><span>${m.prio === 'price' ? 'je Einheit' : m.prio === 'perHour' ? 'Ertrag' : 'Umschlag'}</span></div></div>
      <div class="metric-bar"><i style="width:${Math.max(4, (metric(o) / top) * 100).toFixed(0)}%"></i></div>
      ${tags ? `<div class="pills" style="margin:6px 0 2px">${tags}</div>` : ''}
      <div class="offer-grid">
        <div><small>Preis</small><b>${o.kind === 'contract' && !o.value ? 'Kampagne' : fmtInt(o.unitPrice) + ' Cr'}</b></div>
        <div class="${partial ? 'warn-text' : ''}"><small>Nimmt ab</small><b>${fmtAmount(o.accept)}</b>${partial ? `<em>von ${fmtAmount(amount)}</em>` : ''}</div>
        <div><small>Ladungswert</small><b>${fmtCr(o.value)}</b></div>
        <div><small>Flug einfach</small><b>${fmtDur(o.flight)}</b></div>
        <div><small>Zyklus</small><b>${fmtDur(o.cycle)}</b></div>
        <div><small>Ertrag/h</small><b>${fmtCr(o.perHour)}</b></div>
      </div>
      ${partial ? `<p class="small warn-text" style="margin:6px 0 0">${o.kind === 'contract' ? 'Der Auftrag braucht nur noch diese Menge.' : 'Der Käufer hat nur noch für diese Menge Platz.'} ${fmtAmount(amount - o.accept)} Einheiten bleiben im Lager.</p>` : ''}
    </button>`;
  }).join('');

  const pickedOffer = offers.find((o) => o.id === m.picked);
  const dockOk = !realShip || hasDockFor(st, cls.size);
  const body = `
    <div class="kv sell-ctx">
      <div><small>Im Lager</small><b>${fmtAmount(ctx.stock)}</b></div>
      <div><small>Überschuss</small><b>${ctx.netPerHour > 0 ? '+' + fmtAmount(ctx.netPerHour) + '/h' : '–'}</b></div>
      <div><small>Volle Ladung in</small><b>${isFinite(ctx.refillSeconds) ? fmtDur(ctx.refillSeconds) : '–'}</b></div>
    </div>
    ${advice.text ? `<div class="advice ${advice.bottleneck}">${icon(advice.bottleneck === 'production' ? 'factory' : 'trader', 18)}<p>${esc(advice.text)}</p></div>` : ''}
    <div class="section"><h3>Schiff</h3><div class="pills">${shipChips}</div>
      ${!ships.length ? `<p class="small muted" style="margin:6px 0 0">Kein passender Transporter – Werte zum Vergleich. <button class="linkish" ${act('buyship-modal', { st: st.id, role: 'trader' })}>Transporter kaufen</button></p>` : ''}
      ${realShip && (realShip.job || realShip.cargo) ? `<p class="small muted" style="margin:6px 0 0">${esc(realShip.name)} ist unterwegs (${esc(realShip.status)}) und startet danach.</p>` : ''}
      ${!dockOk ? `<p class="small warn-text" style="margin:6px 0 0">${esc(st.name)} braucht ${cls.size === 'L' ? 'einen Pier' : 'ein Dock'} für dieses Schiff.</p>` : ''}
    </div>
    <div class="section"><h3>Für eigene Produktion behalten</h3>
      <input type="range" id="sellReserve" data-change="sell-reserve" data-st="${st.id}" data-ware="${m.ware}" min="0" max="${Math.max(1, Math.round(Math.max(limit, ctx.stock)))}" step="${Math.max(1, Math.round(Math.max(limit, ctx.stock) / 100))}" value="${Math.round(reserveFor(st, m.ware, limit))}" aria-label="Reserve">
      <div class="amount-meta"><b class="num">${fmtInt(reserveFor(st, m.ware, limit))}</b> bleiben im Lager · verkaufbar <b class="num">${fmtInt(sellable)}</b>${st.reserve?.[m.ware] === undefined ? ' <span class="muted">(automatisch)</span>' : ''}</div>
      <p class="small muted" style="margin:4px 0 0">Gilt dauerhaft für diese Station – auch für Händler und Autohandel.</p>
    </div>
    <div class="section"><h3>Menge<span class="small muted" style="text-transform:none;letter-spacing:0">${fmtAmount(amount * w.volume)} von ${fmtAmount(cls.capacity)} m³ Laderaum</span></h3>
      <div class="amount-row">
        <button class="icon-btn" ${act('sell-amount', { v: Math.max(0, amount - Math.ceil(maxLoad / 10)) })} aria-label="Weniger">${icon('minus', 18)}</button>
        <input type="range" id="sellAmount" data-change="sell-amount" min="0" max="${maxLoad}" step="1" value="${amount}" aria-label="Menge">
        <button class="icon-btn" ${act('sell-amount', { v: Math.min(maxLoad, amount + Math.ceil(maxLoad / 10)) })} aria-label="Mehr">${icon('plus', 18)}</button>
      </div>
      <div class="amount-meta"><b class="num">${fmtInt(amount)}</b> ${esc(w.name)}${sellable > ctx.shipUnits ? ` · verkaufbar für ${fmtInt(sellable / ctx.shipUnits)} Ladungen` : ''}
        <button class="linkish" ${act('sell-amount', { v: maxLoad })}>volle Ladung</button></div>
    </div>
    <div class="section"><h3>Was zählt gerade?</h3>
      <div class="segment">${(['price', 'perHour', 'throughput'] as SalePriority[]).map((p) => `<button class="${m.prio === p ? 'on' : ''}" ${act('sell-prio', { p })}>${PRIO_LABEL[p]}</button>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">${m.prio === 'price' ? 'Höchster Erlös je Einheit – gut, wenn die Produktion der Engpass ist und das Schiff ohnehin Zeit hat.' : m.prio === 'perHour' ? 'Meiste Credits pro Stunde Schiffszeit – gut, wenn Transportkapazität knapp ist.' : 'Meiste Einheiten pro Stunde – gut, wenn das Lager überläuft und Ware schnell raus muss.'}</p>
    </div>
    <div class="section"><h3>Käufer · ${offers.length}</h3>${cards ? `<div class="offers">${cards}</div>` : `<div class="box empty">${amount < 1 ? 'Wähle eine Menge.' : 'In bekannten Sektoren kauft niemand diese Ware.'}</div>`}</div>`;

  const canGo = !!pickedOffer && !!realShip && dockOk && amount >= 1;
  const foot = pickedOffer
    ? `<div class="sell-foot"><div class="small"><b>${esc(pickedOffer.name)}</b> · ${fmtAmount(pickedOffer.accept)} für ${fmtCr(pickedOffer.value)} · Zyklus ${fmtDur(pickedOffer.cycle)}</div>
        <label class="check"><input type="checkbox" id="sellRepeat" data-change="sell-repeat" ${m.repeat ? 'checked' : ''}> Als feste Route wiederholen</label>
        <div class="card-actions"><button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary ${canGo ? '' : 'disabled'}" ${act('sell-go')}>${icon('trader', 18)}${realShip ? 'Losfliegen' : 'Nur Vergleich'}</button></div></div>`
    : `<div class="sell-foot"><p class="small muted" style="margin:0">Tippe einen Käufer an, um ihn zu wählen.</p><button class="btn" ${act('modal-close')}>Schließen</button></div>`;
  return { title: `${w.name} verkaufen`, eyebrow: `${st.name} · ${FACTIONS[SECTOR_MAP[st.sector].faction].short}`, body, foot };
}
