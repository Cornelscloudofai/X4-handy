// Einkaufsdialog: eine Ladung einmalig (oder als feste Route) bei einem Verkäufer kaufen und zur Station bringen
import { NPC_MAP, marketInfo, sector } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES, WARE_IDS } from '../data/wares';
import { hasDockFor, marketPrice, roomAt, tradeRule, wareLimit } from '../engine/economy';
import { npcSource } from '../engine/npc';
import { knows, seenPrice, seenStock } from '../engine/intel';
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
  /** order = Kauforder an der Station (andere Schiffe liefern), ship = mit eigenem Schiff abholen */
  mode: 'order' | 'ship';
  /** Entwurf der Kauforder: Preis je Einheit und Füllstand (Anteil der Lagergrenze) */
  price: number;
  fill: number;
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
      if (!state.markets[key]?.[ware] || !knows(state, key)) continue;
      const stock = seenStock(state, key, ware) ?? 0;
      if (stock < 1) continue;
      const p = marketInfo(key);
      out.push({
        key, name: p.name, sector: p.sector, stock, unitPrice: seenPrice(state, key, ware) ?? marketPrice(state, key, ware), hops: sectorDistanceHint(st.sector, p.sector),
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
  const rule = tradeRule(st, ware);
  const cheapest = npcSource(state, st.sector, ware)?.price;
  // Vorschlag ohne bestehende Kauforder: etwas über dem günstigsten Anbieter im Sektor, sonst der Durchschnittspreis
  const price = Math.round(rule.price ?? Math.min(WARES[ware].price.max, cheapest != null ? cheapest * 1.05 : WARES[ware].price.avg));
  return {
    type: 'buy', station: stationId, ware, ship, amount: Math.floor(Math.min(roomAt(st, ware, 'market'), cls.capacity / WARES[ware].volume)), picked: '', repeat: false,
    mode: 'order', price, fill: rule.fill ?? 0.8,
  };
}

/** Kauforder: Preis und Füllstand wählen – NPC-Händler und die Frachter der Fabriken liefern an, kein eigenes Schiff nötig */
function orderHtml(state: GameState, m: BuyModal): { title: string; eyebrow: string; body: string; foot: string } {
  const st = stationById(state, m.station)!;
  const w = WARES[m.ware];
  const rule = tradeRule(st, m.ware);
  const limit = wareLimit(st, m.ware);
  const have = st.inventory[m.ware] ?? 0;
  const target = limit * m.fill;
  const offers = buyOffers(state, st.id, m.ware, 1);
  const local = offers.filter((o) => o.sector === st.sector);
  const ok = local.filter((o) => o.unitPrice <= m.price);
  const choices = WARE_IDS.filter((id) => WARES[id].storage === 'Container').sort((a, b) => WARES[a].name.localeCompare(WARES[b].name, 'de'));
  const sellers = local.length
    ? `<div class="box rows">${local.map((o) => `<div class="row"><div class="grow"><div class="title" style="font-weight:500">${esc(o.name)}</div><div class="sub">${NPC_MAP[o.key] ? 'NPC-Fabrik' : 'Handelsposten'} · Vorrat ${fmtAmount(o.stock)}</div></div><div class="right"><b class="num ${o.unitPrice <= m.price ? 'pos' : 'neg'}">${fmtInt(o.unitPrice)} Cr</b><div class="small muted">${o.unitPrice <= m.price ? 'liefert' : 'zu teuer'}</div></div></div>`).join('')}</div>`
    : '<div class="box empty">Im Sektor der Station verkauft gerade niemand diese Ware – NPC-Händler können sie erst liefern, wenn ein Anbieter da ist.</div>';
  const body = `
    <div class="field" style="margin-bottom:10px"><label>Ware</label><select data-change="buy-ware">${choices.map((id) => `<option value="${id}" ${id === m.ware ? 'selected' : ''}>${esc(WARES[id].name)}</option>`).join('')}</select></div>
    <p class="lead" style="margin:0 0 10px">Du legst nur Preis und Füllstand fest – NPC-Händler und die Frachter der Fabriken liefern an. Bezahlt wird bei Lieferung.</p>
    <div class="kv sell-ctx">
      <div><small>Im Lager</small><b>${fmtAmount(have)}</b></div>
      <div><small>Lagergrenze</small><b>${fmtAmount(limit)}</b></div>
      <div><small>Ø Preis</small><b>${fmtInt(w.price.avg)} Cr</b></div>
    </div>
    <div class="field" style="margin-top:14px"><label for="buyOrderPrice">Höchstpreis · <b>${fmtInt(m.price)} Cr</b> je Einheit</label>
      <input type="range" id="buyOrderPrice" min="${w.price.min}" max="${w.price.max}" step="1" value="${m.price}" data-change="buy-order-price">
      <div class="small muted" style="display:flex;justify-content:space-between"><span>${fmtCr(w.price.min)}</span><span>Ø ${fmtCr(w.price.avg)}</span><span>${fmtCr(w.price.max)}</span></div></div>
    <div class="field" style="margin-top:14px"><label for="buyOrderFill">Füllen bis · <b>${Math.round(m.fill * 100)} %</b> der Lagergrenze = ${fmtAmount(target)} Einheiten</label>
      <input type="range" id="buyOrderFill" min="5" max="100" step="5" value="${Math.round(m.fill * 100)}" data-change="buy-order-fill">
      <p class="small muted" style="margin:4px 0 0">${have >= target ? 'Das Lager ist schon so voll – geliefert wird erst, wenn der Bestand darunter fällt.' : `Es fehlen ${fmtAmount(target - have)} Einheiten, höchstens ${fmtCr((target - have) * m.price)}.`}${hasDockFor(st, 'M') ? '' : ' <span class="warn-text">Die Station hat kein S/M-Dock – Händler liefern nur ans Baulager.</span>'}</p></div>
    ${rule.sell && rule.sellPrice != null ? `<p class="small" style="margin:6px 0 0">Verkaufsorder läuft parallel: verkaufen ab ${fmtCr(rule.sellPrice)}, ${Math.round((rule.keep ?? 0) * 100)} % bleiben${m.price >= rule.sellPrice ? ' <span class="warn-text">– Einkaufspreis liegt nicht unter dem Verkaufspreis, das bringt keinen Gewinn.</span>' : ` – Spanne ${fmtCr(rule.sellPrice - m.price)} je Einheit.`}</p>` : ''}
    <div class="section"><h3>Anbieter im Sektor · ${ok.length} von ${local.length} liefern zu diesem Preis</h3>${sellers}</div>
    <p class="small muted" style="margin:6px 0 0">Je höher dein Gebot über dem Einkaufspreis der Händler liegt, desto lieber kommen sie. <button class="linkish" ${act('buy-mode', { mode: 'ship' })}>Stattdessen mit eigenem Schiff abholen …</button></p>`;
  const foot = `<div class="sell-foot"><div class="small">${rule.buy && rule.price != null ? `Aktuell: bis ${fmtCr(rule.price)}, füllen bis ${Math.round((rule.fill ?? 0.95) * 100)} %` : 'Noch keine Kauforder für diese Ware.'}</div>
    <div class="card-actions">${rule.price != null ? `<button class="btn" ${act('buy-order-off')}>Kauforder aufheben</button>` : `<button class="btn" ${act('modal-close')}>Abbrechen</button>`}<button class="btn primary" ${act('buy-order-set')}>${icon('check', 18)}Kauforder setzen</button></div></div>`;
  return { title: `${w.name} einkaufen`, eyebrow: st.name, body, foot };
}

export function buyModalHtml(state: GameState, m: BuyModal): { title: string; eyebrow: string; body: string; foot: string } {
  if (m.mode !== 'ship') return orderHtml(state, m);
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
    <p class="small muted" style="margin:0 0 8px"><button class="linkish" ${act('buy-mode', { mode: 'order' })}>← Zurück zur Kauforder (ohne eigenes Schiff)</button></p>
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
