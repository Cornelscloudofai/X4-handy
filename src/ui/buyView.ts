// Einkaufsdialog: eine Ladung einmalig (oder als feste Route) bei einem Verkäufer kaufen und zur Station bringen
import { NPC_MAP, marketInfo, sector } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES, WARE_IDS } from '../data/wares';
import { marketPrice, marketStock, roomAt } from '../engine/economy';
import { knownSectors, sectorDistanceHint, stationById, travelDistance } from '../engine/logistics';
import type { GameState, TradeEndpoint } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtCr, fmtDur, fmtInt } from './format';
import { icon } from './icons';
import { sellShips, shipClass } from './sellView';

export interface BuyModal {
  type: 'buy';
  station: string;
  ware: string;
  ship: string;
  amount: number;
  picked: string;
  repeat: boolean;
}

export interface BuyOffer { key: string; name: string; sector: string; endpoint: TradeEndpoint; stock: number; unitPrice: number; hops: number; flight: number }

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

/** Verkäufer in bekannten Sektoren: Handelsposten und NPC-Fabriken (nur ihre eigenen Produkte), günstigste zuerst */
export function buyOffers(state: GameState, stationId: string, ware: string, speed: number): BuyOffer[] {
  const st = stationById(state, stationId);
  if (!st) return [];
  const out: BuyOffer[] = [];
  for (const sec of knownSectors(state)) {
    const keys = [sec, ...sector(sec).npcStations.filter((n) => n.makes?.includes(ware)).map((n) => n.id)];
    for (const key of keys) {
      if (!state.markets[key]?.[ware]) continue;
      const stock = marketStock(state, key, ware);
      if (stock < 1) continue;
      const p = marketInfo(key);
      out.push({
        key, name: p.name, sector: p.sector, stock, unitPrice: marketPrice(state, key, ware), hops: sectorDistanceHint(st.sector, p.sector),
        endpoint: key === sec ? { kind: 'market', sector: sec } : { kind: 'market', sector: sec, market: key },
        flight: travelDistance(st, p) / speed,
      });
    }
  }
  return out.sort((a, b) => a.unitPrice - b.unitPrice);
}

export function defaultBuyModal(state: GameState, stationId: string, ware: string): BuyModal {
  // Ohne Ware: zuerst die meistgebrauchte Grundware vorschlagen
  ware ||= 'energycells';
  const ship = sellShips(state, stationId, ware)[0]?.id ?? 'cls:tuatara';
  const st = stationById(state, stationId)!;
  const cls = shipClass(state, ship);
  return { type: 'buy', station: stationId, ware, ship, amount: Math.floor(Math.min(roomAt(st, ware, 'market'), cls.capacity / WARES[ware].volume)), picked: '', repeat: false };
}

export function buyModalHtml(state: GameState, m: BuyModal): { title: string; eyebrow: string; body: string; foot: string } {
  const st = stationById(state, m.station)!;
  const w = WARES[m.ware];
  const cls = shipClass(state, m.ship);
  const realShip = m.ship.startsWith('cls:') ? null : state.ships.find((x) => x.id === m.ship) ?? null;
  const room = Math.floor(roomAt(st, m.ware, 'market'));
  const maxLoad = Math.max(0, Math.floor(Math.min(room, cls.capacity / w.volume)));
  const amount = Math.max(0, Math.min(m.amount, maxLoad));
  const offers = buyOffers(state, st.id, m.ware, cls.speed);
  const ships = sellShips(state, st.id, m.ware);
  const shipChips = ships.map((s) => {
    const busy = !!s.job || !!s.cargo;
    return `<button class="pill ${m.ship === s.id ? 'teal' : ''}" ${act('buy-ship', { id: s.id })}>${icon('trader', 14)}${esc(s.name)} · ${fmtAmount(SHIP_MAP[s.cls].capacity / w.volume)} E.${busy ? ' · unterwegs' : ''}</button>`;
  }).join('');
  const cards = offers.map((o) => {
    const n = Math.min(amount, o.stock);
    const picked = m.picked === o.key;
    return `<button class="offer ${picked ? 'picked' : ''}" ${act('buy-pick', { id: o.key })} data-key="b-${o.key}">
      <div class="offer-head"><div style="min-width:0;flex:1"><div class="title">${esc(o.name)}</div>
        <div class="sub">${NPC_MAP[o.key] ? 'NPC-Fabrik' : 'Handelsposten'} · ${o.hops === 0 ? 'gleicher Sektor' : `${o.hops} Sprung${o.hops === 1 ? '' : 'e'} · ${esc(sector(o.sector).name)}`}</div></div>
        <div class="offer-metric"><b class="num">${fmtInt(o.unitPrice)} Cr</b><span>je Einheit</span></div></div>
      <div class="offer-grid">
        <div><small>Vorrat</small><b>${fmtAmount(o.stock)}</b></div>
        <div class="${n < amount - 0.5 ? 'warn-text' : ''}"><small>Ladung</small><b>${fmtAmount(n)}</b></div>
        <div><small>Kosten</small><b>${fmtCr(n * o.unitPrice)}</b></div>
        <div><small>Flug einfach</small><b>${fmtDur(o.flight)}</b></div>
      </div></button>`;
  }).join('');
  const choices = WARE_IDS.filter((id) => WARES[id].storage === 'Container').sort((a, b) => WARES[a].name.localeCompare(WARES[b].name, 'de'));
  const body = `
    <div class="field" style="margin-bottom:10px"><label>Ware</label><select data-change="buy-ware">${choices.map((id) => `<option value="${id}" ${id === m.ware ? 'selected' : ''}>${esc(WARES[id].name)}</option>`).join('')}</select></div>
    <div class="kv sell-ctx">
      <div><small>Im Lager</small><b>${fmtAmount(st.inventory[m.ware] ?? 0)}</b></div>
      <div><small>Platz</small><b>${fmtAmount(room)}</b></div>
      <div><small>Ø Preis</small><b>${fmtInt(w.price.avg)} Cr</b></div>
    </div>
    <div class="section"><h3>Schiff</h3>${ships.length ? `<div class="pills">${shipChips}</div>` : `<p class="small muted" style="margin:0">Kein passender Transporter. <button class="linkish" ${act('buyship-modal', { st: st.id, role: 'trader' })}>Transporter kaufen</button></p>`}
      ${realShip && (realShip.job || realShip.cargo) ? `<p class="small muted" style="margin:6px 0 0">${esc(realShip.name)} ist unterwegs (${esc(realShip.status)}) und startet danach.</p>` : ''}</div>
    <div class="section"><h3>Menge<span class="small muted" style="text-transform:none;letter-spacing:0">${fmtAmount(amount * w.volume)} von ${fmtAmount(cls.capacity)} m³ Laderaum</span></h3>
      <div class="amount-row">
        <button class="icon-btn" ${act('buy-amount', { v: Math.max(0, amount - Math.ceil(maxLoad / 10)) })} aria-label="Weniger">${icon('minus', 18)}</button>
        <input type="range" id="buyAmount" data-change="buy-amount" min="0" max="${maxLoad}" step="1" value="${amount}" aria-label="Menge">
        <button class="icon-btn" ${act('buy-amount', { v: Math.min(maxLoad, amount + Math.ceil(maxLoad / 10)) })} aria-label="Mehr">${icon('plus', 18)}</button>
      </div>
      <div class="amount-meta"><b class="num">${fmtInt(amount)}</b> ${esc(w.name)} <button class="linkish" ${act('buy-amount', { v: maxLoad })}>volle Ladung</button></div>
    </div>
    <div class="section"><h3>Verkäufer · ${offers.length}</h3>${cards ? `<div class="offers">${cards}</div>` : '<div class="box empty">In bekannten Sektoren verkauft gerade niemand diese Ware.</div>'}</div>`;
  const picked = offers.find((o) => o.key === m.picked);
  const canGo = !!picked && !!realShip && amount >= 1;
  const foot = picked
    ? `<div class="sell-foot"><div class="small"><b>${esc(picked.name)}</b> · ${fmtAmount(Math.min(amount, picked.stock))} für ca. ${fmtCr(Math.min(amount, picked.stock) * picked.unitPrice)}</div>
        <label class="check"><input type="checkbox" id="buyRepeat" data-change="buy-repeat" ${m.repeat ? 'checked' : ''}> Als feste Route wiederholen</label>
        <div class="card-actions"><button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary ${canGo ? '' : 'disabled'}" ${act('buy-go')}>${icon('trader', 18)}Losfliegen</button></div></div>`
    : `<div class="sell-foot"><p class="small muted" style="margin:0">Tippe einen Verkäufer an, um ihn zu wählen.</p><button class="btn" ${act('modal-close')}>Schließen</button></div>`;
  return { title: `${w.name} einkaufen`, eyebrow: st.name, body, foot };
}
