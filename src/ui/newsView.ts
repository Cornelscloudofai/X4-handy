// Kontobuch (Tipp auf die Credits) und Nachrichtenblatt (alle Meldungen zum Nachlesen, mit Sprung zum Ort)
import { NPC_MAP, SECTOR_MAP, marketInfo } from '../data/sectors';
import { WARES } from '../data/wares';
import { LEDGER_LABEL } from '../engine/ledger';
import { fieldById, stationById } from '../engine/logistics';
import type { GameState, LedgerCat, LedgerEntry, LogEntry, LogLink } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtClock, fmtCr } from './format';
import { icon } from './icons';

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

export type NewsFilter = 'all' | 'important' | 'trade' | 'contracts' | 'own';
export type LedgerFilter = 'all' | 'in' | 'out';

/** Datenattribute eines Verweises (für den Sprung-Knopf) */
export function linkData(l: LogLink): Record<string, string | number> {
  switch (l.kind) {
    case 'station': case 'ship': case 'sector': case 'field': return { lk: l.kind, id: l.id };
    case 'market': return { lk: l.kind, id: l.key };
    case 'contract': case 'shipOrder': return { lk: l.kind, id: l.id };
    case 'opp': return { lk: l.kind, id: l.id, key: l.key, ware: l.ware };
    case 'story': return { lk: l.kind, id: '' };
  }
}

/** Verweis aus den Datenattributen eines Knopfs */
export function linkFrom(d: Record<string, string | undefined>): LogLink | null {
  const id = d.id ?? '';
  switch (d.lk) {
    case 'station': case 'ship': case 'sector': case 'field': return { kind: d.lk, id };
    case 'market': return { kind: 'market', key: id };
    case 'contract': case 'shipOrder': return { kind: d.lk, id: Number(id) };
    case 'opp': return { kind: 'opp', id: Number(id), key: d.key ?? '', ware: d.ware ?? '' };
    case 'story': return { kind: 'story' };
  }
  return null;
}

/** Beschriftung des Sprung-Knopfs – leer, wenn das Ziel nicht mehr existiert */
function linkLabel(state: GameState, l: LogLink): string {
  switch (l.kind) {
    case 'station': return stationById(state, l.id) ? 'Zur Station' : '';
    case 'ship': return state.ships.some((s) => s.id === l.id) ? 'Zum Schiff' : '';
    case 'market': return state.markets[l.key] ? (NPC_MAP[l.key] ? 'Station ansehen' : 'Handelsposten ansehen') : '';
    case 'sector': return SECTOR_MAP[l.id] ? 'Sektor ansehen' : '';
    case 'field': return fieldById(l.id) ? 'Zum Feld' : '';
    case 'contract': {
      const c = state.contracts.find((x) => x.id === l.id);
      return !c ? '' : c.status === 'offer' ? 'Auftrag ansehen' : c.status === 'active' ? 'Laufender Auftrag' : 'Aufträge';
    }
    case 'opp': {
      const o = state.opportunities?.find((x) => x.id === l.id);
      return o && o.until > state.time && o.left >= 1 ? 'Jetzt kaufen …' : 'Station ansehen';
    }
    case 'shipOrder': return 'Bestellungen';
    case 'story': return 'Kapitel';
  }
}

function linkButton(state: GameState, l: LogLink | undefined): string {
  if (!l) return '';
  const label = linkLabel(state, l);
  return label ? `<button class="linkish" ${act('news-go', linkData(l))}>${esc(label)} ${icon('arrowRight', 12)}</button>` : '';
}

/** Zusatz-Knopf zu einer Meldung: bei Sonderangeboten die Station, bei Auftragsangeboten der Lieferdialog */
function extraButton(state: GameState, l: LogLink | undefined): string {
  if (l?.kind === 'opp') {
    const o = state.opportunities?.find((x) => x.id === l.id);
    if (o && o.until > state.time && o.left >= 1) return `<button class="linkish" ${act('news-go', { lk: 'market', id: l.key })}>Station ansehen</button>`;
  }
  if (l?.kind === 'contract') {
    const c = state.contracts.find((x) => x.id === l.id);
    if (c?.status === 'offer' && c.size) return `<button class="linkish" ${act('courier-ship-modal', { id: c.id })}>Annehmen …</button>`;
  }
  return '';
}

function newsCategory(e: LogEntry): NewsFilter[] {
  const out: NewsFilter[] = ['all'];
  if (e.toast) out.push('important');
  const k = e.link?.kind;
  if (k === 'opp' || k === 'market' || /Sonderangebot|Nachfrage|Überangebot|Gelegenheit|Fabrik/.test(e.text)) out.push('trade');
  if (k === 'contract' || k === 'shipOrder' || k === 'story') out.push('contracts');
  if (k === 'station' || k === 'ship' || k === 'field') out.push('own');
  return out;
}

const NEWS_LABEL: Record<NewsFilter, string> = { all: 'Alle', important: 'Wichtig', trade: 'Markt', contracts: 'Aufträge', own: 'Eigenes' };

/** Ungelesene wichtige Meldungen (seit dem letzten Öffnen des Nachrichtenblatts) */
export function unreadNews(state: GameState): number {
  const seen = state.newsSeen ?? -1;
  return state.log.filter((e) => e.toast && e.t > seen).length;
}

export function newsBody(state: GameState, filter: NewsFilter, seenBefore: number): string {
  const list = [...state.log].reverse().filter((e) => newsCategory(e).includes(filter));
  const chips = (Object.keys(NEWS_LABEL) as NewsFilter[]).map((f) => `<button class="pill ${f === filter ? 'teal' : ''}" ${act('news-filter', { f })}>${NEWS_LABEL[f]}</button>`).join('');
  const rows = list.map((e) => {
    const cls = e.kind === 'good' ? 'pos' : e.kind === 'bad' ? 'neg' : e.kind === 'warn' ? 'warn-text' : '';
    const isNew = e.toast && e.t > seenBefore;
    const btns = [linkButton(state, e.link), extraButton(state, e.link)].filter(Boolean).join('');
    return `<div class="row news-row ${isNew ? 'new' : ''}"><span class="small muted num" style="flex:none;width:64px">${fmtClock(e.t).replace('Tag ', 'T')}</span>
      <div class="grow"><div class="sub wrap ${cls}" style="${e.kind === 'info' ? 'color:var(--text)' : ''}">${isNew ? '<b class="pill amber" style="padding:0 5px;font-size:10px;margin-right:4px">NEU</b>' : ''}${esc(e.text)}</div>
      ${btns ? `<div class="row-links">${btns}</div>` : ''}</div></div>`;
  }).join('');
  return `<div class="pills" style="margin-bottom:10px">${chips}</div>
    <div class="box rows">${rows || '<div class="empty">Keine Meldungen in dieser Auswahl.</div>'}</div>
    <p class="small muted" style="margin:8px 0 0">Die letzten ${state.log.length} Meldungen. „Wichtig“ sind die, die unten eingeblendet wurden.</p>`;
}

/** Summe je Kategorie in einem Zeitraum */
function totals(list: LedgerEntry[], since: number): { inn: number; out: number; byCat: Map<LedgerCat, number> } {
  let inn = 0, out = 0;
  const byCat = new Map<LedgerCat, number>();
  for (const e of list) {
    if (e.t < since) continue;
    if (e.amount > 0) inn += e.amount; else out += e.amount;
    byCat.set(e.cat, (byCat.get(e.cat) ?? 0) + e.amount);
  }
  return { inn, out, byCat };
}

export function ledgerBody(state: GameState, filter: LedgerFilter): string {
  const list = state.ledger ?? [];
  const hour = totals(list, state.time - 3600);
  const day = totals(list, state.time - 24 * 3600);
  const cats = [...day.byCat.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const shown = [...list].reverse().filter((e) => filter === 'all' || (filter === 'in' ? e.amount > 0 : e.amount < 0));
  const chips = ([['all', 'Alle'], ['in', 'Eingänge'], ['out', 'Ausgänge']] as const).map(([f, l]) => `<button class="pill ${f === filter ? 'teal' : ''}" ${act('ledger-filter', { f })}>${l}</button>`).join('');
  const rows = shown.slice(0, 200).map((e) => {
    const w = e.units ? ` · ${fmtAmount(Math.abs(e.units))} Einheiten` : '';
    const n = e.n && e.n > 1 ? ` · ${e.n} Buchungen` : '';
    return `<div class="row"><span class="small muted num" style="flex:none;width:64px">${fmtClock(e.t).replace('Tag ', 'T')}</span>
      <div class="grow"><div class="sub wrap" style="color:var(--text)">${esc(e.text)}</div><div class="small muted">${LEDGER_LABEL[e.cat]}${w}${n}</div>${e.link ? `<div class="row-links">${linkButton(state, e.link)}</div>` : ''}</div>
      <div class="right"><b class="num ${e.amount >= 0 ? 'pos' : 'neg'}">${e.amount >= 0 ? '+' : '−'}${fmtCr(Math.abs(e.amount))}</b></div></div>`;
  }).join('');
  return `<div class="kv">
      <div><small>Guthaben</small><b>${fmtCr(state.credits)}</b></div>
      <div><small>Letzte Stunde</small><b class="${hour.inn + hour.out >= 0 ? 'pos' : 'neg'}">${hour.inn + hour.out >= 0 ? '+' : '−'}${fmtCr(Math.abs(hour.inn + hour.out))}</b></div>
      <div><small>Eingänge 24 h</small><b class="pos">+${fmtCr(day.inn)}</b></div>
      <div><small>Ausgänge 24 h</small><b class="neg">−${fmtCr(Math.abs(day.out))}</b></div>
    </div>
    ${cats.length ? `<div class="section"><h3>Nach Art · 24 h</h3><div class="box rows">${cats.map(([c, v]) => `<div class="row"><div class="grow"><div class="title" style="font-weight:500">${LEDGER_LABEL[c]}</div></div><div class="right"><b class="num ${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${fmtCr(Math.abs(v))}</b></div></div>`).join('')}</div></div>` : ''}
    <div class="section"><h3>Buchungen</h3><div class="pills" style="margin-bottom:10px">${chips}</div>
      <div class="box rows">${rows || '<div class="empty">Noch keine Buchungen.</div>'}</div>
      <p class="small muted" style="margin:8px 0 0">Gleiche Buchungen kurz hintereinander (z. B. mehrere Lieferungen eines NPC-Händlers) sind zusammengefasst.</p></div>`;
}

/** Ware einer Meldung (für Sonderangebote) */
export function oppWare(l: LogLink): string | null {
  return l.kind === 'opp' && WARES[l.ware] ? l.ware : null;
}

export { marketInfo };
