// Handel aus der Warenübersicht: bei einem Verkäufer einmalig kaufen oder eine Handelsroute mit Gewinnschwelle einrichten;
// „Laderaum verkaufen“ für die Ladung am Ende der Warteschlange eines Schiffs
import { marketInfo, sector } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { marketPrice, marketRoom, marketStock, spendable } from '../engine/economy';
import { expectedCargo, marketEndpoint, shipPlace } from '../engine/fleet';
import { knownSectors, travelDistance } from '../engine/logistics';
import type { GameState, Ship } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtCr, fmtDur, fmtInt } from './format';
import { icon } from './icons';

export interface TradeModal {
  type: 'trade';
  ware: string;
  /** Verkäufer (Marktschlüssel) */
  from: string;
  mode: 'buy' | 'route';
  ship?: string;
  amount?: number;
  /** Ziel der Handelsroute (Marktschlüssel) */
  to?: string;
  /** Mindestgewinn in Prozent */
  minPct: number;
  onLow: 'pause' | 'end';
}

export interface HoldSellModal { type: 'holdSell'; ship: string }

export interface WareBuyer { key: string; name: string; sector: string; price: number; room: number }

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

/** Wer in bekannten Sektoren eine Ware ankauft: Handelsposten und NPC-Stationen, die sie brauchen – bester Preis zuerst */
export function wareBuyers(state: GameState, ware: string, exclude = ''): WareBuyer[] {
  const out: WareBuyer[] = [];
  for (const sec of knownSectors(state)) {
    for (const key of [sec, ...sector(sec).npcStations.filter((n) => n.buys.includes(ware)).map((n) => n.id)]) {
      if (key === exclude || !state.markets[key]?.[ware]) continue;
      const room = marketRoom(state, key, ware);
      if (room < 1) continue;
      const p = marketInfo(key);
      out.push({ key, name: p.name, sector: p.sector, price: marketPrice(state, key, ware), room });
    }
  }
  return out.sort((a, b) => b.price - a.price);
}

export function tradeShips(state: GameState, ware: string): Ship[] {
  return state.ships
    .filter((s) => SHIP_MAP[s.cls].role === 'trader' && SHIP_MAP[s.cls].storage === WARES[ware].storage)
    .sort((a, b) => Number(!!expectedCargo(a)) - Number(!!expectedCargo(b)) || Number(!!a.job || !!a.cargo) - Number(!!b.job || !!b.cargo));
}

const kindLabel = (key: string) => (key === marketInfo(key).sector ? 'Handelsposten' : 'NPC-Station');

export function tradeModalHtml(state: GameState, m: TradeModal): { title: string; eyebrow: string; body: string; foot: string } {
  const w = WARES[m.ware];
  const src = marketInfo(m.from);
  const buy = marketPrice(state, m.from, m.ware);
  const stock = marketStock(state, m.from, m.ware);
  const ships = tradeShips(state, m.ware);
  const ship = ships.find((s) => s.id === m.ship) ?? ships[0] ?? null;
  const cls = ship ? SHIP_MAP[ship.cls] : SHIP_MAP.tuatara;
  const load = Math.floor(cls.capacity / w.volume);
  const shipChips = ships.length
    ? `<div class="pills">${ships.map((s) => {
        const full = !!expectedCargo(s);
        return `<button class="pill ${s === ship ? 'teal' : ''}" ${act('trade-ship', { id: s.id })}>${icon('trader', 14)}${esc(s.name)} · ${fmtAmount(SHIP_MAP[s.cls].capacity / w.volume)} E.${full ? ' · Laderaum belegt' : s.job || s.cargo ? ' · unterwegs' : ''}</button>`;
      }).join('')}</div>`
    : `<div class="box empty">Kein Transporter für diese Ware. <button class="linkish" ${act('buyship-modal', { st: state.stations[0]?.id ?? '', role: 'trader' })}>Transporter kaufen</button></div>`;
  const seg = `<div class="segment" style="margin-bottom:12px"><button class="${m.mode === 'buy' ? 'on' : ''}" ${act('trade-mode', { mode: 'buy' })}>Einmal kaufen</button><button class="${m.mode === 'route' ? 'on' : ''}" ${act('trade-mode', { mode: 'route' })}>Handelsroute</button></div>`;
  const head = `<div class="kv sell-ctx"><div><small>Preis</small><b>${fmtInt(buy)} Cr</b></div><div><small>Vorrat</small><b>${fmtAmount(stock)}</b></div><div><small>Ø Preis</small><b>${fmtInt(w.price.avg)} Cr</b></div></div>`;
  let body: string;
  let foot: string;
  if (m.mode === 'buy') {
    const max = Math.max(0, Math.floor(Math.min(load, stock, spendable(state, 10_000) / Math.max(1, buy))));
    const amount = Math.max(0, Math.min(m.amount ?? max, max));
    const blocked = !!ship && !!expectedCargo(ship);
    body = `${seg}${head}
      <div class="section"><h3>Schiff</h3>${shipChips}
        ${blocked ? `<p class="small warn-text" style="margin:6px 0 0">Der Laderaum von ${esc(ship!.name)} ist nach den geplanten Befehlen belegt – zuerst „Laderaum verkaufen“ einreihen.</p>` : ship && (ship.job || ship.orders?.length) ? `<p class="small muted" style="margin:6px 0 0">${esc(ship.name)} kauft nach den laufenden Befehlen.</p>` : ''}</div>
      <div class="section"><h3>Menge<span class="small muted" style="text-transform:none;letter-spacing:0">${fmtAmount(amount * w.volume)} von ${fmtAmount(cls.capacity)} m³</span></h3>
        <div class="amount-row">
          <button class="icon-btn" ${act('trade-amount', { v: Math.max(0, amount - Math.ceil(max / 10)) })} aria-label="Weniger">${icon('minus', 18)}</button>
          <input type="range" data-change="trade-amount" min="0" max="${max}" step="1" value="${amount}" aria-label="Menge">
          <button class="icon-btn" ${act('trade-amount', { v: Math.min(max, amount + Math.ceil(max / 10)) })} aria-label="Mehr">${icon('plus', 18)}</button>
        </div>
        <div class="amount-meta"><b class="num">${fmtInt(amount)}</b> ${esc(w.name)} für ca. <b>${fmtCr(amount * buy)}</b> <button class="linkish" ${act('trade-amount', { v: max })}>volle Ladung</button></div></div>
      <p class="small muted">Einmaliger Kauf: Das Schiff kauft und wartet dann mit der Ladung. Verkaufen kannst du sie danach am Schiff über „Laderaum verkaufen“ – auch schon jetzt, bevor der Kauf erledigt ist.</p>`;
    const ok = !!ship && !blocked && amount >= 1;
    foot = `<div class="card-actions"><button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary ${ok ? '' : 'disabled'}" ${act('trade-buy', { amount })}>${icon('trader', 18)}Kaufen</button></div>`;
  } else {
    const buyers = wareBuyers(state, m.ware, m.from);
    const picked = buyers.find((b) => b.key === m.to) ?? buyers[0];
    const from = ship ? shipPlace(ship) : src;
    const rows = buyers.slice(0, 10).map((b) => {
      const margin = (b.price - buy) / buy;
      const n = Math.min(load, b.room);
      const flight = (travelDistance(from, src) + travelDistance(src, marketInfo(b.key))) / cls.speed;
      return `<button class="offer ${b === picked ? 'picked' : ''}" ${act('trade-to', { k: b.key })}>
        <div class="offer-head"><div style="min-width:0;flex:1"><div class="title">${esc(b.name)}</div><div class="sub">${kindLabel(b.key)} · nimmt ${fmtAmount(b.room)}</div></div>
          <div class="offer-metric"><b class="num ${margin > 0 ? 'pos' : 'neg'}">${margin >= 0 ? '+' : ''}${Math.round(margin * 100)} %</b><span>Gewinn</span></div></div>
        <div class="offer-grid"><div><small>Verkauf</small><b>${fmtInt(b.price)} Cr</b></div><div><small>je Fahrt</small><b class="${margin > 0 ? 'pos' : 'neg'}">${fmtCr(n * (b.price - buy))}</b></div><div><small>Flug</small><b>${fmtDur(flight)}</b></div></div></button>`;
    }).join('');
    body = `${seg}${head}
      <div class="section"><h3>Schiff</h3>${shipChips}</div>
      <div class="section"><h3>Verkaufen an · ${buyers.length}</h3>${rows ? `<div class="offers">${rows}</div>` : '<div class="box empty">In bekannten Sektoren kauft gerade niemand diese Ware.</div>'}</div>
      <div class="section"><h3>Mindestgewinn<span class="small muted" style="text-transform:none;letter-spacing:0">${m.minPct} %</span></h3>
        <input type="range" data-change="trade-margin" min="0" max="50" step="1" value="${m.minPct}" aria-label="Mindestgewinn" style="width:100%">
        <div class="segment" style="margin-top:10px"><button class="${m.onLow === 'pause' ? 'on' : ''}" ${act('trade-low', { v: 'pause' })}>Darunter pausieren</button><button class="${m.onLow === 'end' ? 'on' : ''}" ${act('trade-low', { v: 'end' })}>Darunter beenden</button></div>
        <p class="small muted" style="margin:6px 0 0">Preise ändern sich mit Angebot und Nachfrage. Fällt der Gewinn (Verkaufs- minus Einkaufspreis) unter ${m.minPct} %, ${m.onLow === 'pause' ? 'wartet das Schiff, bis es sich wieder lohnt' : 'endet die Route und das Schiff wechselt in den Autohandel'}.</p></div>`;
    const ok = !!ship && !!picked;
    foot = `${picked ? `<div class="small" style="margin-bottom:8px"><b>${esc(src.name)}</b> → <b>${esc(picked.name)}</b> · jetzt ${Math.round(((picked.price - buy) / buy) * 100)} % Gewinn</div>` : ''}<div class="card-actions"><button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary ${ok ? '' : 'disabled'}" ${act('trade-route', { to: picked?.key ?? '' })}>${icon('routes', 18)}Route starten</button></div>`;
  }
  return { title: `${w.name} bei ${src.name}`, eyebrow: `${kindLabel(m.from)} · ${sector(src.sector).name}`, body, foot: `<div class="sell-foot">${foot}</div>` };
}

/** Laderaum verkaufen: Käufer für die Ladung am Ende der Warteschlange */
export function holdSellModalHtml(state: GameState, m: HoldSellModal): { title: string; eyebrow: string; body: string; foot: string } | null {
  const s = state.ships.find((x) => x.id === m.ship);
  const cargo = s ? expectedCargo(s) : null;
  if (!s || !cargo) return null;
  const w = WARES[cargo.ware];
  const buyers = wareBuyers(state, cargo.ware);
  const from = shipPlace(s);
  const speed = SHIP_MAP[s.cls].speed;
  const rows = buyers.slice(0, 10).map((b) => {
    const n = Math.min(cargo.amount, b.room);
    return `<button class="offer" ${act('hold-sell', { id: s.id, k: b.key })}>
      <div class="offer-head"><div style="min-width:0;flex:1"><div class="title">${esc(b.name)}</div><div class="sub">${kindLabel(b.key)} · ${esc(sector(b.sector).name)}${n < cargo.amount - 0.5 ? ` · nimmt nur ${fmtAmount(n)}` : ''}</div></div>
        <div class="offer-metric"><b class="num">${fmtInt(b.price)} Cr</b><span>${b.price >= w.price.avg ? '▲' : '▼'} ${Math.abs(Math.round(((b.price - w.price.avg) / w.price.avg) * 100))} % zu Ø</span></div></div>
      <div class="offer-grid"><div><small>Erlös</small><b class="pos">${fmtCr(n * b.price)}</b></div><div><small>Flug</small><b>${fmtDur(travelDistance(from, marketInfo(b.key)) / speed)}</b></div></div></button>`;
  }).join('');
  const later = s.cargo ? '' : ' (nach dem geplanten Kauf)';
  return {
    title: 'Laderaum verkaufen',
    eyebrow: s.name,
    body: `<p class="small muted" style="margin-top:0">An Bord${later}: <b>${fmtAmount(cargo.amount)} ${esc(w.name)}</b>. Tippe einen Käufer an – der Verkauf wird in die Warteschlange eingereiht.</p>
      ${rows ? `<div class="offers">${rows}</div>` : '<div class="box empty">In bekannten Sektoren kauft gerade niemand diese Ware.</div>'}`,
    foot: `<div class="card-actions"><button class="btn" ${act('modal-close')}>Abbrechen</button></div>`,
  };
}

export { marketEndpoint };
