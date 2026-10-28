// Kontobuch (Tipp auf die Credits) und Nachrichtenblatt (alle Meldungen zum Nachlesen, mit Sprung zum Ort)
import { NPC_MAP, SECTOR_MAP, marketInfo } from '../data/sectors';
import { WARES } from '../data/wares';
import { LEDGER_LABEL } from '../engine/ledger';
import { fieldById, stationById } from '../engine/logistics';
import type { GameState, LedgerCat, LedgerEntry, LogEntry, LogLink } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtClock, fmtCr } from './format';
import { icon } from './icons';
import { helpBtn } from './help';

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
    case 'incident': return { lk: l.kind, id: l.id };
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
    case 'incident': return { kind: 'incident', id: Number(id) };
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
    case 'incident': return state.incidents?.open.some((x) => x.id === l.id) ? 'Selbst übernehmen' : '';
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

/** Art einer Meldung: Symbol, Farbe und kurze Kennzeichnung – zum Erfassen auf einen Blick */
interface NewsType { label: string; icon: string; color: string }
const NT: Record<string, NewsType> = {
  campaign: { label: 'Kampagne', icon: 'star', color: '#ffd36b' },
  contract: { label: 'Auftrag', icon: 'missions', color: '#ffb547' },
  offer: { label: 'Angebot', icon: 'market', color: '#ff9f5a' },
  market: { label: 'Markt', icon: 'chart', color: '#5fb4ff' },
  ship: { label: 'Flotte', icon: 'fleet', color: '#5ff0d8' },
  build: { label: 'Bau', icon: 'wrench', color: '#7fb6ff' },
  trade: { label: 'Handel', icon: 'wallet', color: '#6be38f' },
  world: { label: 'Galaxie', icon: 'galaxy', color: '#b49cff' },
  mining: { label: 'Abbau', icon: 'miner', color: '#ffc45e' },
  problem: { label: 'Problem', icon: 'warn', color: '#ff7a7a' },
  info: { label: 'Info', icon: 'info', color: '#9fb4bb' },
};

export function newsType(e: LogEntry): NewsType {
  const t = e.text;
  if (e.kind === 'bad' || /konnten nicht|Frist verpasst|verfallen|vermisst/.test(t)) return NT.problem;
  if (/^Ziel erreicht|^Belohnung erhalten|Kapitel/.test(t) || e.link?.kind === 'story') return NT.campaign;
  if (/^Sonderangebot|^Gelegenheit/.test(t) || e.link?.kind === 'opp') return NT.offer;
  if (/Nachfrage|Überangebot|Preis/.test(t)) return NT.market;
  if (/Auftrag|^Lieferung für|Schiffsbestellung/.test(t) || e.link?.kind === 'contract' || e.link?.kind === 'shipOrder') return NT.contract;
  if (/wartet auf Baumaterial/.test(t)) return { ...NT.build, label: 'Bau wartet', color: '#ffb547' };
  if (/fertiggestellt|abgerissen|gegründet|Baulizenz|Bauplan|Mehr Ruf/.test(t)) return NT.build;
  if (/verkauft|übergeben|Handelsroute/.test(t)) return NT.trade;
  if (/gekauft|vom Stapel|Pilot steigt/.test(t) || e.link?.kind === 'ship') return NT.ship;
  if (/Schürfrecht|Vermessung|am Feld|fertig: /.test(t) || e.link?.kind === 'field') return NT.mining;
  if (/neue Fabrik|weiteres Modul|Neue Station erfasst|Satellit/.test(t) || e.link?.kind === 'market' || e.link?.kind === 'sector') return NT.world;
  if (e.kind === 'warn') return { ...NT.problem, label: 'Hinweis', color: '#ffb547' };
  return e.link?.kind === 'station' ? NT.build : NT.info;
}

/** Meldung in Überschrift und Zusatz teilen: „Neues Auftragsangebot“ / „Lieferung: Graphen (…)“ */
export function newsSplit(text: string): { head: string; rest: string } {
  const t = text.replace(/\.$/, '');
  const c = t.indexOf(': ');
  if (c > 0 && c <= 42) return { head: t.slice(0, c), rest: t.slice(c + 2) };
  const d = t.indexOf(' – ');
  if (d > 0 && d <= 70) return { head: t.slice(0, d), rest: t.slice(d + 3) };
  return { head: t, rest: '' };
}

/** Geldbetrag in der Meldung (für ein Abzeichen rechts) */
function newsAmount(text: string): string {
  const m = text.match(/(?:[+−-]\s?)?\d[\d.]*(?:,\d+)?\s?(?:Mio |Tsd )?Cr\b/);
  return m ? m[0].replace(/\s+/g, ' ') : '';
}

export function newsBody(state: GameState, filter: NewsFilter, seenBefore: number): string {
  const list = [...state.log].reverse().filter((e) => newsCategory(e).includes(filter));
  const chips = (Object.keys(NEWS_LABEL) as NewsFilter[]).map((f) => `<button class="pill ${f === filter ? 'teal' : ''}" ${act('news-filter', { f })}>${NEWS_LABEL[f]}</button>`).join('');
  let lastDay = -1;
  const rows = list.map((e) => {
    const ty = newsType(e);
    let { head, rest } = newsSplit(e.text);
    let badge = '';
    // Sonderangebot: Ware als Überschrift, Rabatt als Abzeichen, Ort und Dauer darunter
    const so = e.text.match(/^Sonderangebot: (.+?) räumt (\d+) min lang (.+?) für (\d+) % des Preises(?: \(bis ([\d.]+) Einheiten\))?/);
    if (so) { head = so[3]; rest = `${so[1]} · ${so[2]} min${so[5] ? ` · bis ${so[5]} Einheiten` : ''}`; badge = `−${100 - Number(so[4])} %`; }
    const isNew = e.toast && e.t > seenBefore;
    const amount = newsAmount(e.text);
    const day = Math.floor(e.t / 86400);
    const sep = day !== lastDay ? `<div class="news-day">Tag ${day + 1}</div>` : '';
    lastDay = day;
    const btns = [linkButton(state, e.link), extraButton(state, e.link)].filter(Boolean).join('');
    const clock = fmtClock(e.t).replace(/^Tag \d+ · /, '');
    return `${sep}<div class="news-item ${isNew ? 'new' : ''} ${e.toast ? 'imp' : ''}" style="--nc:${ty.color}">
      <span class="news-ic">${icon(ty.icon, 18)}</span>
      <div class="grow">
        <div class="news-meta"><b>${esc(ty.label)}</b>${isNew ? '<em>NEU</em>' : ''}<span class="num">${esc(clock)}</span></div>
        <div class="news-head"><span>${esc(head)}</span>${badge ? `<i class="news-amt deal">${esc(badge)}</i>` : amount ? `<i class="news-amt ${/^[−-]/.test(amount) || e.kind === 'bad' ? 'neg' : ''}">${esc(amount)}</i>` : ''}</div>
        ${rest ? `<div class="news-rest">${esc(rest)}</div>` : ''}
        ${btns ? `<div class="row-links">${btns}</div>` : ''}
      </div>
      </div>`;
  }).join('');
  return `<div class="pills scroll" style="margin-bottom:10px">${chips}${helpBtn('news')}</div>
    <div class="news-list">${rows || '<div class="box empty">Keine Meldungen in dieser Auswahl.</div>'}</div>
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
    <div class="section"><h3>Buchungen ${helpBtn('news')}</h3><div class="pills" style="margin-bottom:10px">${chips}</div>
      <div class="box rows">${rows || '<div class="empty">Noch keine Buchungen.</div>'}</div>
      <p class="small muted" style="margin:8px 0 0">Gleiche Buchungen kurz hintereinander (z. B. mehrere Lieferungen eines NPC-Händlers) sind zusammengefasst.</p></div>`;
}

/** Ware einer Meldung (für Sonderangebote) */
export function oppWare(l: LogLink): string | null {
  return l.kind === 'opp' && WARES[l.ware] ? l.ware : null;
}

export { marketInfo };
