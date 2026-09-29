// HTML-Bausteine aller Bildschirme. Aktionen laufen über data-act (siehe app.ts).
import { MODULES, MODULE_MAP, PLOT_COST } from '../data/modules';
import { FACTIONS, SECTORS, SECTOR_MAP, sector } from '../data/sectors';
import { SHIP_CLASSES, SHIP_MAP } from '../data/ships';
import { GROUP_LABEL, STORAGE_LABEL, WARES, WARE_IDS, inputsPerHour, outputPerHour } from '../data/wares';
import { blueprintState, stationCost } from '../engine/actions';
import { allAlerts, productionUtil, shortestRunway, stationAlerts, stationOutputValue, storageUse } from '../engine/analysis';
import { hasDockFor, marketPrice, marketStock, stationRates, stationWares, storageCap, tradeRule, wareLimit } from '../engine/economy';
import { shipEta } from '../engine/fleet';
import { endpointName, fieldById, knownSectors, stationById } from '../engine/logistics';
import { netWorth } from '../engine/stats';
import { STORY, currentMission, missionComplete } from '../engine/story';
import type { GameState, Ship, Station, TradeEndpoint } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtClock, fmtCr, fmtDur, fmtInt, fmtNum, pct } from './format';
import { icon, wareDot } from './icons';
import { SPEEDS, type Modal, type Panel, type UIState } from './uistate';

// ---------- Hilfen ----------

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

function wareTile(id: string): string {
  const w = WARES[id];
  const abbr = w.name.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2);
  return `<span class="ware-tile" style="--c:${w.color}">${esc(abbr)}</span>`;
}

function bar(frac: number, cls = ''): string {
  return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></i></div>`;
}

function stationName(state: GameState, id: string): string {
  return stationById(state, id)?.name ?? '—';
}

function epName(state: GameState, ep: TradeEndpoint): string {
  return endpointName(state, ep);
}

// ---------- HUD ----------

export function hudHtml(state: GameState, ui: UIState, creditFlash: string): string {
  const alerts = allAlerts(state);
  const sec = SECTOR_MAP[ui.sector];
  const speedLabel = ui.paused ? 'Pause' : `×${state.speed}`;
  const inGalaxy = ui.view === 'galaxy';
  return `
  <div class="hud-row">
    <button class="chip sector" ${act('galaxy')} aria-label="Galaxiekarte öffnen">${icon(inGalaxy ? 'sector' : 'galaxy', 18)}<b>${esc(inGalaxy ? 'Galaxie' : sec.name)}</b></button>
    <div class="chip credits ${creditFlash}" aria-label="Credits"><b class="num">${fmtCr(state.credits)}</b></div>
    <div class="chip time ${ui.paused ? 'paused' : ''}">
      <button ${act('pause')} aria-label="${ui.paused ? 'Fortsetzen' : 'Pausieren'}">${icon(ui.paused ? 'play' : 'pause', 18)}</button>
      <button class="speed" ${act('speed')} aria-label="Spieltempo">${speedLabel}</button>
    </div>
    <button class="chip alert ${alerts.length ? 'on' : ''}" ${act('alerts')} aria-label="Engpässe">${icon('warn', 19)}<b class="num">${alerts.length}</b></button>
  </div>
  <div class="sub-row">
    <div class="crumb">${inGalaxy ? 'Split-Raum' : esc(FACTIONS[sec.faction].name)}<span>·</span>${inGalaxy ? `${state.sectors.length} von ${SECTORS.length} Sektoren` : state.sectors.includes(sec.id) ? 'Baulizenz' : 'Fremdsektor'}</div>
    <div class="clock">${fmtClock(state.time)}</div>
  </div>
  ${inGalaxy ? '' : `<div class="tool-row">
    <button class="btn outline-teal" ${act('place-start')}>${icon('plus', 20)}Station</button>
    <button class="btn ${ui.routes ? 'on' : ''}" ${act('routes-toggle')}>${icon('routes', 20)}Routen</button>
    <div class="zoom"><button ${act('zoom-in')} aria-label="Hineinzoomen">${icon('plus', 20)}</button><button ${act('zoom-out')} aria-label="Herauszoomen">${icon('minus', 20)}</button></div>
  </div>`}`;
}

export function objectiveHtml(state: GameState, ui: UIState): string {
  const m = currentMission(state);
  if (!m || ui.panel || ui.placing || ui.view === 'galaxy') return '';
  const p = m.progress(state);
  const done = p.cur >= p.target;
  return `<button class="objective ${done ? 'ready' : ''}" ${act('nav', { tab: 'missions' })}>
      ${icon(done ? 'gift' : 'target', 22)}
      <div style="flex:1;min-width:0"><small>${done ? 'Ziel erreicht' : `Kapitel ${state.story.index + 1} · ${esc(m.title)}`}</small><span>${esc(done ? 'Belohnung abholen' : m.goal)}</span>
      ${done ? '' : `<div class="mini"><i style="width:${Math.min(100, (p.cur / p.target) * 100).toFixed(0)}%"></i></div>`}</div>
      ${icon('chev', 18, 'chev')}
    </button>`;
}

export function navHtml(state: GameState, ui: UIState): string {
  const active = ui.panel ? ({ stations: 'stations', station: 'stations', fleet: 'fleet', ship: 'fleet', missions: 'missions', market: 'market', ware: 'market', more: 'more', sector: 'map' } as Record<string, string>)[ui.panel.type] : 'map';
  const offers = state.contracts.filter((c) => c.status === 'offer').length + (missionComplete(state) ? 1 : 0);
  const items: [string, string, string, number][] = [
    ['map', 'sector', 'Sektor', 0],
    ['stations', 'station', 'Stationen', 0],
    ['fleet', 'fleet', 'Flotte', 0],
    ['missions', 'missions', 'Aufträge', offers],
    ['market', 'market', 'Handel', 0],
    ['more', 'more', 'Mehr', 0],
  ];
  return items.map(([tab, ic, label, badge]) => `<button class="${active === tab ? 'active' : ''}" ${act('nav', { tab })} aria-label="${label}">${icon(ic, 23)}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('');
}

// ---------- Kontextkarte ----------

export function cardHtml(state: GameState, ui: UIState): string {
  if (ui.placing) return placeCard(state, ui);
  if (ui.view === 'galaxy') return ui.galaxySel ? sectorCard(state, ui.galaxySel) : '';
  const sel = ui.selection;
  if (!sel) return '';
  switch (sel.kind) {
    case 'station': { const st = stationById(state, sel.id); return st ? stationCard(state, st) : ''; }
    case 'ship': { const s = state.ships.find((x) => x.id === sel.id); return s ? shipCard(state, s) : ''; }
    case 'field': return fieldCard(state, sel.id);
    case 'trade': return tradeCard(state, sel.id);
    case 'gate': return gateCard(state, sel.id);
    default: return '';
  }
}

function cardShell(emblem: string, title: string, sub: string, body: string, amber = false): string {
  return `<div class="card">
    <div class="card-head"><div class="emblem ${amber ? 'amber' : ''}">${emblem}</div><div style="flex:1;min-width:0"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    <button class="x" ${act('select-clear')} aria-label="Schließen">${icon('close', 22)}</button></div>${body}</div>`;
}

function stationCard(state: GameState, st: Station): string {
  const building = (st.build ? 1 : 0) + st.queue.length;
  const buildFrac = st.build ? 1 - st.build.remaining / st.build.total : 0;
  const runway = shortestRunway(st);
  const alerts = stationAlerts(state, st);
  const miners = state.ships.filter((s) => s.home === st.id && SHIP_MAP[s.cls].role === 'miner');
  const etas = miners.map((s) => shipEta(state, s)).filter((x): x is number => x != null).sort((a, b) => a - b);
  const cell1 = building
    ? `<div>${icon('wrench', 22)}<span><b>${building} Modul${building === 1 ? '' : 'e'} im Bau</b>${bar(buildFrac)}</span></div>`
    : `<div>${icon('factory', 22)}<span><b>${pct(productionUtil(st))}</b>Auslastung</span></div>`;
  const cell2 = alerts.length
    ? `<div class="warn">${icon('warn', 22)}<span><b>${esc(alerts[0].ware ? WARES[alerts[0].ware].name : 'Achtung')}</b>${esc(alerts[0].ware ? 'fehlt' : alerts[0].text.split(': ')[1] ?? '')}</span></div>`
    : runway && runway.seconds < 6 * 3600
      ? `<div class="${runway.seconds < 3600 ? 'warn' : ''}">${icon('clock', 22)}<span><b>${esc(WARES[runway.ware].name)}</b>reicht ${fmtDur(runway.seconds)}</span></div>`
      : `<div>${icon('check', 22)}<span><b>Versorgt</b>keine Engpässe</span></div>`;
  const cell3 = etas.length
    ? `<div>${icon('miner', 22)}<span><b>Miner in</b>${fmtDur(etas[0])}</span></div>`
    : `<div>${icon('fleet', 22)}<span><b>${state.ships.filter((s) => s.home === st.id).length} Schiffe</b>zugeteilt</span></div>`;
  return cardShell(icon('station', 24), st.name, `${esc(sector(st.sector).name)} · ${st.modules.length} Module`, `
    <div class="stats3">${cell1}${cell2}${cell3}</div>
    <div class="card-actions">
      <button class="btn primary" ${act('open-station', { id: st.id, tab: 'modules' })}>${icon('wrench', 20)}Bauplan</button>
      <button class="btn" ${act('open-station', { id: st.id, tab: 'overview' })}>${icon('info', 20)}Details</button>
    </div>`);
}

function shipCard(state: GameState, s: Ship): string {
  const c = SHIP_MAP[s.cls];
  const eta = shipEta(state, s);
  const cargo = s.cargo ? `${fmtAmount(s.cargo.amount)} ${WARES[s.cargo.ware].name}` : 'leer';
  return cardShell(icon(c.role === 'miner' ? 'miner' : 'trader', 24), s.name, `${esc(c.name)} · ${esc(stationName(state, s.home))}`, `
    <div class="stats3">
      <div>${icon('info', 22)}<span><b>Status</b>${esc(s.status)}</span></div>
      <div>${icon('box', 22)}<span><b>Fracht</b>${esc(cargo)}</span></div>
      <div>${icon('clock', 22)}<span><b>${eta != null ? 'Zurück in' : 'Fahrten'}</b>${eta != null ? fmtDur(eta) : fmtInt(s.trips)}</span></div>
    </div>
    <div class="card-actions">
      <button class="btn primary" ${act('open-ship', { id: s.id })}>${icon('fleet', 20)}Befehle</button>
      <button class="btn" ${act('open-station', { id: s.home, tab: 'overview' })}>${icon('station', 20)}Heimat</button>
    </div>`, c.role === 'miner');
}

function fieldCard(state: GameState, id: string): string {
  const info = fieldById(id);
  if (!info) return '';
  const w = WARES[info.field.ware];
  const miners = state.ships.filter((s) => s.miningField === id).length;
  return cardShell(`<span class="ware-dot" style="--c:${w.color};width:16px;height:16px"></span>`, w.name, `Rohstofffeld · ${esc(info.sector.name)}`, `
    <div class="stats3">
      <div>${icon('star', 22)}<span><b>${pct(info.field.richness)}</b>Ertrag</span></div>
      <div>${icon('market', 22)}<span><b>${fmtInt(marketPrice(state, info.sector.id, w.id))} Cr</b>Marktpreis</span></div>
      <div>${icon('miner', 22)}<span><b>${miners}</b>Miner aktiv</span></div>
    </div>
    <p class="small muted" style="margin:0 0 10px">${w.storage === 'Liquid' ? 'Gas – braucht Gas-Miner und ein Flüssiglager.' : 'Mineral – braucht Mineral-Miner und ein Feststofflager.'} Stationen nahe am Feld verkürzen die Flugzeit.</p>
    <div class="card-actions one"><button class="btn" ${act('open-ware', { id: w.id })}>${icon('market', 20)}Warenkunde: ${esc(w.name)}</button></div>`, true);
}

function tradeCard(state: GameState, secId: string): string {
  const s = SECTOR_MAP[secId];
  const top = [...s.demand].slice(0, 3);
  return cardShell(icon('market', 24), s.tradeStation.name, `${esc(FACTIONS[s.faction].name)} · Handelsposten`, `
    <div class="stats3">${top.map((id) => `<div>${wareDot(WARES[id].color, 10)}<span><b>${fmtInt(marketPrice(state, secId, id))} Cr</b>${esc(WARES[id].name)}</span></div>`).join('')}</div>
    <div class="card-actions one"><button class="btn primary" ${act('open-market', { id: secId })}>${icon('market', 20)}Marktpreise</button></div>`, true);
}

function gateCard(state: GameState, to: string): string {
  const s = SECTOR_MAP[to];
  const owned = state.sectors.includes(to);
  return cardShell(icon('galaxy', 24), `Sprungtor: ${s.name}`, `${esc(FACTIONS[s.faction].name)} · ☀ ${s.sunlight} %`, `
    <p class="small" style="margin:0 0 10px;color:var(--text-2)">${esc(s.description)}</p>
    <div class="card-actions">
      <button class="btn primary" ${act('goto-sector', { id: to })}>${icon('arrowRight', 20)}Sektor ansehen</button>
      <button class="btn ${owned ? '' : 'amber'}" ${act('open-sector', { id: to })}>${icon(owned ? 'info' : 'lock', 20)}${owned ? 'Details' : 'Baulizenz'}</button>
    </div>`, true);
}

function sectorCard(state: GameState, id: string): string {
  const s = SECTOR_MAP[id];
  const owned = state.sectors.includes(id);
  const known = knownSectors(state).includes(id);
  return cardShell(icon('sector', 24), known ? s.name : 'Unerforschter Sektor', `${esc(FACTIONS[s.faction].name)}${known ? ` · ☀ ${s.sunlight} %` : ''}`, `
    ${known ? `<p class="small" style="margin:0 0 10px;color:var(--text-2)">${esc(s.description)}</p>
    <div class="pills" style="margin-bottom:10px">${s.fields.map((f) => `<span class="pill">${wareDot(WARES[f.ware].color, 8)}${esc(WARES[f.ware].name)}${f.richness > 1.05 ? ' ↑' : ''}</span>`).join('')}</div>` : '<p class="small muted" style="margin:0 0 10px">Erwirb Baulizenzen in Nachbarsektoren, um weiter vorzudringen.</p>'}
    <div class="card-actions">
      <button class="btn primary ${known ? '' : 'disabled'}" ${act('goto-sector', { id })}>${icon('arrowRight', 20)}Ansehen</button>
      <button class="btn ${owned ? '' : 'amber'}" ${act('open-sector', { id })}>${icon(owned ? 'info' : 'lock', 20)}${owned ? 'Details' : 'Baulizenz'}</button>
    </div>`);
}

function placeCard(state: GameState, ui: UIState): string {
  const p = ui.placing!;
  const cost = stationCost();
  const can = p.set && p.valid && state.credits >= cost;
  const msg = !p.set ? 'Tippe auf die Karte, um den Bauplatz zu wählen.' : p.valid ? (state.credits >= cost ? 'Guter Platz. Tipp: Nahe an Rohstofffeldern sparen deine Miner Zeit.' : 'Nicht genug Credits.') : p.msg;
  return `<div class="card placebar">
    <div class="card-head"><div class="emblem">${icon('plus', 22)}</div><div style="flex:1;min-width:0"><h2>Neue Station</h2><p>Bauplatz ${fmtCr(PLOT_COST)} + Stationskern · gesamt <b class="num">${fmtCr(cost)}</b></p></div>
    <button class="x" ${act('place-cancel')} aria-label="Abbrechen">${icon('close', 22)}</button></div>
    <p class="small ${p.set && !p.valid ? 'warn-text' : 'muted'}" style="margin:0 0 10px">${esc(msg)}</p>
    <div class="card-actions"><button class="btn primary ${can ? '' : 'disabled'}" ${act('place-confirm')}>${icon('check', 20)}Hier bauen</button><button class="btn" ${act('place-cancel')}>Abbrechen</button></div>
  </div>`;
}

// ---------- Blätter ----------

export function panelHtml(state: GameState, ui: UIState): string {
  const p = ui.panel;
  if (!p) return '';
  switch (p.type) {
    case 'stations': return stationsPanel(state);
    case 'station': { const st = stationById(state, p.id ?? ''); return st ? stationPanel(state, st, p) : stationsPanel(state); }
    case 'fleet': return fleetPanel(state);
    case 'ship': { const s = state.ships.find((x) => x.id === p.id); return s ? shipPanel(state, s, p) : fleetPanel(state); }
    case 'missions': return missionsPanel(state);
    case 'market': return marketPanel(state, ui);
    case 'ware': return warePanel(state, p.id ?? 'ore', p);
    case 'sector': return sectorPanel(state, p.id ?? 'zhin', p);
    case 'more': return morePanel(state, ui);
  }
}

function sheet(title: string, eyebrow: string, body: string, opts: { back?: boolean; tabs?: string; right?: string } = {}): string {
  return `<div class="sheet-head">
    ${opts.back ? `<button class="icon-btn" ${act('back')} aria-label="Zurück">${icon('back', 22)}</button>` : ''}
    <h1><span class="eyebrow">${esc(eyebrow)}</span>${esc(title)}</h1>
    ${opts.right ?? ''}
    <button class="icon-btn" ${act('close-panel')} aria-label="Schließen">${icon('close', 22)}</button>
  </div>${opts.tabs ?? ''}<div class="sheet-body">${body}</div>`;
}

// ---- Stationen ----

function stationsPanel(state: GameState): string {
  const list = state.stations.map((st) => {
    const alerts = stationAlerts(state, st);
    const prods = [...new Set(st.modules.map((m) => MODULE_MAP[m.def]).filter((d) => d?.kind === 'production').map((d) => d!.ware!))];
    return `<div class="row tap" ${act('open-station', { id: st.id, tab: 'overview' })} data-key="${st.id}">
      <div class="emblem" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;border:1px solid rgba(63,224,197,.3);color:${alerts.length ? 'var(--amber)' : 'var(--teal)'}">${icon('station', 22)}</div>
      <div class="grow"><div class="title">${esc(st.name)}</div>
      <div class="sub">${esc(sector(st.sector).name)} · ${prods.length ? prods.map((id) => esc(WARES[id].name)).join(', ') : 'noch keine Produktion'}</div>
      <div class="pills" style="margin-top:6px">${st.build ? `<span class="pill amber">${icon('wrench', 13)} Bau ${pct(1 - st.build.remaining / st.build.total)}</span>` : ''}
      ${alerts.length ? `<span class="pill amber">${icon('warn', 13)} ${alerts.length} Hinweis${alerts.length === 1 ? '' : 'e'}</span>` : `<span class="pill teal">${icon('check', 13)} ${pct(productionUtil(st))} Auslastung</span>`}</div></div>
      ${icon('chev', 20, 'chev')}</div>`;
  }).join('');
  return sheet('Stationen', `${state.stations.length} Station${state.stations.length === 1 ? '' : 'en'}`, `
    <div class="section"><div class="box rows">${list}</div></div>
    <button class="btn outline-teal block" ${act('place-start')}>${icon('plus', 20)}Neue Station gründen · ${fmtCr(stationCost())}</button>`);
}

function stationPanel(state: GameState, st: Station, p: Panel): string {
  const tab = p.tab ?? 'overview';
  const tabs = `<div class="tabs">${[['overview', 'Übersicht'], ['modules', 'Module'], ['storage', 'Lager'], ['ships', 'Schiffe']].map(([t, l]) => `<button class="${tab === t ? 'active' : ''}" ${act('station-tab', { tab: t })}>${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'overview') body = stationOverview(state, st);
  else if (tab === 'modules') body = stationModules(state, st);
  else if (tab === 'storage') body = stationStorage(state, st);
  else body = stationShips(state, st);
  const right = `<button class="icon-btn" ${act('focus', { kind: 'station', id: st.id })} aria-label="Auf Karte zeigen">${icon('target', 20)}</button>`;
  return sheet(st.name, sector(st.sector).name, body, { back: !!p.back, tabs, right });
}

function stationOverview(state: GameState, st: Station): string {
  const alerts = stationAlerts(state, st);
  const rates = stationRates(st);
  const util = productionUtil(st);
  const prodMods = new Map<string, { n: number; util: number; stall: string }>();
  for (const m of st.modules) {
    const d = MODULE_MAP[m.def];
    if (d?.kind !== 'production' || !d.ware) continue;
    const e = prodMods.get(d.ware) ?? { n: 0, util: 0, stall: '' };
    e.n++;
    e.util += m.util;
    if (m.stall) e.stall = m.stall;
    prodMods.set(d.ware, e);
  }
  const sun = sector(st.sector).sunlight;
  const prodRows = [...prodMods].map(([id, e]) => {
    const w = WARES[id];
    const u = e.util / e.n;
    const stall = e.stall === 'input' ? `wartet auf ${w.inputs.filter((i) => (st.inventory[i.ware] ?? 0) < i.amount).map((i) => WARES[i.ware].name).join(', ')}` : e.stall === 'storage' ? 'Lager voll' : '';
    return `<div class="row tap" ${act('open-ware', { id })}>${wareTile(id)}<div class="grow"><div class="title">${esc(w.name)} <span class="muted small">× ${e.n}</span></div>
      <div class="sub ${stall ? 'warn-text' : ''}">${stall ? esc(stall) : `${fmtInt(outputPerHour(id, sun) * e.n)} / h Nennleistung`}</div>${bar(u, stall ? 'amber' : '')}</div>
      <div class="right"><b>${pct(u)}</b><div class="small muted">Auslastung</div></div></div>`;
  }).join('');
  const balance = Object.entries(rates).sort((a, b) => (b[1].prod - b[1].use) - (a[1].prod - a[1].use)).map(([id, r]) => {
    const net = r.prod - r.use;
    return `<div class="row">${wareDot(WARES[id].color)}<div class="grow"><div class="title" style="font-weight:500">${esc(WARES[id].name)}</div><div class="sub">+${fmtInt(r.prod)} / −${fmtInt(r.use)} pro h</div></div>
      <div class="right"><b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${fmtInt(Math.abs(net))}</b></div></div>`;
  }).join('');
  const stor = storageUse(st).map((s) => `<div><small>${STORAGE_LABEL[s.type]}</small><b>${s.cap ? pct(s.used / s.cap) : '—'}</b>${bar(s.cap ? s.used / s.cap : 0, s.type === 'Liquid' ? 'blue' : s.type === 'Solid' ? 'solid' : '')}<div class="small muted" style="margin-top:4px">${fmtAmount(s.used)} / ${fmtAmount(s.cap)} m³</div></div>`).join('');
  const shipCount = state.ships.filter((s) => s.home === st.id).length;
  return `
    ${alerts.length ? `<div class="section"><div class="box rows">${alerts.map((a) => `<div class="row">${icon('warn', 20, a.severity === 'bad' ? 'neg' : 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">${esc(a.text.split(': ').slice(1).join(': '))}</div>${a.ware ? `<div class="sub wrap">${esc(hintFor(state, st, a.ware))}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
    <div class="section"><div class="kv">
      <div><small>Auslastung</small><b>${pct(util)}</b></div>
      <div><small>Wertschöpfung</small><b>${fmtCr(stationOutputValue(st))}/h</b></div>
      <div><small>Umsatz gesamt</small><b class="pos">${fmtCr(st.income)}</b></div>
      <div><small>Einkauf gesamt</small><b>${fmtCr(st.expenses)}</b></div>
      <div><small>Module</small><b>${st.modules.length}${st.build || st.queue.length ? ` <span class="small muted">+${(st.build ? 1 : 0) + st.queue.length}</span>` : ''}</b></div>
      <div><small>Schiffe</small><b>${shipCount}</b></div>
    </div></div>
    <div class="section"><h3>Produktion</h3>${prodRows ? `<div class="box rows">${prodRows}</div>` : `<div class="box empty">Noch keine Produktionsmodule.<br><button class="btn primary small" ${act('modal-modules', { st: st.id, cat: 'production' })}>${icon('plus', 18)}Modul bauen</button></div>`}</div>
    ${balance ? `<div class="section"><h3>Stundenbilanz bei voller Leistung</h3><div class="box rows">${balance}</div></div>` : ''}
    <div class="section"><h3>Lager</h3><div class="kv" style="grid-template-columns:repeat(3,minmax(0,1fr))">${stor}</div></div>
    <div class="section"><button class="btn ghost block" ${act('rename-modal', { st: st.id })}>Station umbenennen</button></div>`;
}

function hintFor(state: GameState, st: Station, wareId: string): string {
  const w = WARES[wareId];
  if (w.mined) {
    const miners = state.ships.filter((s) => s.home === st.id && SHIP_MAP[s.cls].role === 'miner' && SHIP_MAP[s.cls].storage === w.storage).length;
    const field = sector(st.sector).fields.some((f) => f.ware === wareId);
    if (!storageCap(st)[w.storage]) return `Baue ein ${w.storage === 'Liquid' ? 'Flüssiglager' : 'Feststofflager'} für ${w.name}.`;
    if (!field) return `Kein ${w.name}-Feld in diesem Sektor – kaufe über Händler zu.`;
    return miners ? `${miners} Miner liefern. Mehr Miner erhöhen den Nachschub.` : `Kaufe einen ${w.storage === 'Liquid' ? 'Gas' : 'Mineral'}-Miner für diese Station.`;
  }
  const producer = state.stations.find((x) => x.id !== st.id && x.modules.some((m) => MODULE_MAP[m.def]?.ware === wareId));
  if (producer) return `${producer.name} produziert ${w.name} – ein Transporter kann liefern.`;
  return `Baue eine ${w.name}-Fabrik oder lass Händler zukaufen.`;
}

function stationModules(_state: GameState, st: Station): string {
  const q = st.queue.map((x, i) => {
    const d = MODULE_MAP[x.def];
    return `<div class="row">${icon('clock', 20, 'muted')}<div class="grow"><div class="title" style="font-weight:500">${esc(d.name)}</div><div class="sub">Wartet · ${fmtDur(d.buildTime)} Bauzeit</div></div>
      <button class="btn small ghost" ${act('cancel-q', { st: st.id, i })}>Entfernen</button></div>`;
  }).join('');
  const build = st.build ? (() => {
    const d = MODULE_MAP[st.build.def];
    const f = 1 - st.build.remaining / st.build.total;
    return `<div class="row">${icon('wrench', 20, 'warn-text')}<div class="grow"><div class="title">${esc(d.name)}</div><div class="sub">noch ${fmtDur(st.build.remaining)}</div>${bar(f, 'amber')}</div>
      <button class="btn small ghost" ${act('cancel-q', { st: st.id, i: -1 })}>Stopp</button></div>`;
  })() : '';
  const groups = new Map<string, { n: number; uids: number[]; util: number }>();
  for (const m of st.modules) {
    const g = groups.get(m.def) ?? { n: 0, uids: [], util: 0 };
    g.n++;
    g.uids.push(m.uid);
    g.util += m.util;
    groups.set(m.def, g);
  }
  const built = [...groups].map(([def, g]) => {
    const d = MODULE_MAP[def];
    const lead = d.kind === 'production' && d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(d.kind === 'storage' ? 'storage' : d.kind === 'core' ? 'station' : 'dock', 18)}</span>`;
    const sub = d.kind === 'production' ? `${pct(g.util / g.n)} Auslastung` : d.kind === 'storage' ? `${fmtInt((d.capacity ?? 0) * g.n)} m³ ${STORAGE_LABEL[d.storage!]}` : d.kind === 'dock' ? 'M- und S-Schiffe' : d.kind === 'pier' ? 'L-Schiffe' : 'Verbindet alle Module';
    return `<div class="row">${lead}<div class="grow"><div class="title">${esc(d.name)} <span class="muted small">× ${g.n}</span></div><div class="sub">${esc(sub)}</div></div>
      ${d.kind !== 'core' ? `<button class="icon-btn" ${act('ask-demolish', { st: st.id, uid: g.uids[g.uids.length - 1] })} aria-label="Modul abreißen">${icon('trash', 18)}</button>` : ''}</div>`;
  }).join('');
  const needDock = !hasDockFor(st, 'M');
  const cap = storageCap(st);
  return `
    <div class="section"><h3>Bauplatz<button class="btn primary small" ${act('modal-modules', { st: st.id, cat: 'production' })}>${icon('plus', 18)}Modul bauen</button></h3>
    ${build || q ? `<div class="box rows">${build}${q}</div>` : `<div class="box empty">Keine Bauaufträge. Module werden nacheinander gebaut; die Kosten werden bei Auftrag bezahlt.</div>`}</div>
    ${needDock || !cap.Container ? `<div class="section"><div class="box rows">
      ${needDock ? `<div class="row">${icon('warn', 20, 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">Ohne Dock können weder deine Schiffe noch NPC-Händler andocken.</div></div><button class="btn small amber" ${act('queue', { st: st.id, def: 'dock_m' })}>Dock bauen</button></div>` : ''}
      ${!cap.Container ? `<div class="row">${icon('warn', 20, 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">Energiezellen und Produkte brauchen ein Containerlager.</div></div><button class="btn small amber" ${act('queue', { st: st.id, def: 'storage_container' })}>Lager bauen</button></div>` : ''}
    </div></div>` : ''}
    <div class="section"><h3>Gebaute Module</h3>${built ? `<div class="box rows">${built}</div>` : '<div class="box empty">Noch nichts gebaut.</div>'}</div>`;
}

function stationStorage(state: GameState, st: Station): string {
  const wares = stationWares(st).sort((a, b) => WARES[a].tier - WARES[b].tier || WARES[a].name.localeCompare(WARES[b].name));
  const cap = storageCap(st);
  const wl = stationWares(st);
  const rows = wares.map((id) => {
    const w = WARES[id];
    const have = st.inventory[id] ?? 0;
    const limit = wareLimit(st, id, cap, wl);
    const rule = tradeRule(st, id);
    return `<div class="row" data-key="${id}">${wareTile(id)}<div class="grow"><div class="title" style="font-weight:500">${esc(w.name)}</div>
      <div class="sub">${fmtAmount(have)} / ${fmtAmount(limit)} · ${fmtInt(marketPrice(state, st.sector, id))} Cr</div>${bar(limit ? have / limit : 0, w.storage === 'Liquid' ? 'blue' : w.storage === 'Solid' ? 'solid' : '')}</div>
      <div class="toggle"><button class="buy ${rule.buy ? 'on' : ''}" ${act('trade-toggle', { st: st.id, ware: id, k: 'buy' })} aria-pressed="${rule.buy}">Kauf</button><button class="sell ${rule.sell ? 'on' : ''}" ${act('trade-toggle', { st: st.id, ware: id, k: 'sell' })} aria-pressed="${rule.sell}">Verkauf</button></div></div>`;
  }).join('');
  return `<p class="lead">Kauf: NPC-Händler und deine Transporter liefern diese Ware an. Verkauf: Überschüsse werden abgegeben – Waren, die die Station selbst verbraucht, behalten 40 % Reserve.</p>
    <div class="section"><div class="box rows">${rows || '<div class="empty">Das Lager ist leer.</div>'}</div></div>
    <p class="small muted">Der Lagerraum wird gleichmäßig auf alle Waren einer Lagerart verteilt. Mehr Lagermodule erhöhen die Grenzen.</p>`;
}

function shipRow(_state: GameState, s: Ship): string {
  const c = SHIP_MAP[s.cls];
  return `<div class="row tap" ${act('open-ship', { id: s.id })} data-key="${s.id}">
    <span class="ware-tile" style="--c:${c.role === 'miner' ? '#ffc45e' : '#5ff0d8'}">${icon(c.role === 'miner' ? 'miner' : 'trader', 18)}</span>
    <div class="grow"><div class="title">${esc(s.name)} <span class="muted small">${esc(c.name)}</span></div><div class="sub">${esc(s.status)}${s.cargo ? ` · ${fmtAmount(s.cargo.amount)} ${esc(WARES[s.cargo.ware].name)}` : ''}</div></div>
    ${icon('chev', 20, 'chev')}</div>`;
}

function stationShips(state: GameState, st: Station): string {
  const ships = state.ships.filter((s) => s.home === st.id);
  return `<div class="section">${ships.length ? `<div class="box rows">${ships.map((s) => shipRow(state, s)).join('')}</div>` : '<div class="box empty">Dieser Station sind keine Schiffe zugeteilt.</div>'}</div>
    <div class="card-actions"><button class="btn primary" ${act('buyship-modal', { st: st.id, role: 'miner' })}>${icon('miner', 20)}Miner kaufen</button><button class="btn" ${act('buyship-modal', { st: st.id, role: 'trader' })}>${icon('trader', 20)}Transporter</button></div>`;
}

// ---- Flotte ----

function fleetPanel(state: GameState): string {
  const miners = state.ships.filter((s) => SHIP_MAP[s.cls].role === 'miner');
  const traders = state.ships.filter((s) => SHIP_MAP[s.cls].role === 'trader');
  const home = state.stations[0]?.id ?? '';
  return sheet('Flotte', `${state.ships.length} Schiffe`, `
    <div class="section"><div class="kv"><div><small>Miner</small><b>${miners.length}</b></div><div><small>Transporter</small><b>${traders.length}</b></div></div></div>
    <div class="section"><h3>Miner</h3>${miners.length ? `<div class="box rows">${miners.map((s) => shipRow(state, s)).join('')}</div>` : '<div class="box empty">Keine Miner.</div>'}</div>
    <div class="section"><h3>Transporter</h3>${traders.length ? `<div class="box rows">${traders.map((s) => shipRow(state, s)).join('')}</div>` : '<div class="box empty">Noch keine Transporter. Sie verkaufen Überschüsse und versorgen Stationen untereinander.</div>'}</div>
    <button class="btn primary block" ${act('buyship-modal', { st: home, role: 'all' })}>${icon('plus', 20)}Schiff kaufen</button>`);
}

function shipPanel(state: GameState, s: Ship, p: Panel): string {
  const c = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  let orders = '';
  if (c.role === 'miner') {
    const fields = home ? sector(home.sector).fields.filter((f) => WARES[f.ware].storage === c.storage) : [];
    const wares = [...new Set(fields.map((f) => f.ware))];
    orders = `<div class="section"><h3>Abbau</h3><div class="pills">
      <button class="pill ${!s.mineWare ? 'teal' : ''}" ${act('miner-ware', { id: s.id, ware: '' })}>Automatisch nach Bedarf</button>
      ${wares.map((w) => `<button class="pill ${s.mineWare === w ? 'teal' : ''}" ${act('miner-ware', { id: s.id, ware: w })}>${wareDot(WARES[w].color, 8)}${esc(WARES[w].name)}</button>`).join('')}
    </div><p class="small muted" style="margin-top:8px">${wares.length ? 'Automatisch: fördert, was die Heimatstation verbraucht. Feste Ware: füllt das Lager auch für den Verkauf (Verkauf im Lager aktivieren).' : 'Im Heimatsektor gibt es kein passendes Feld für diesen Miner.'}</p></div>`;
  } else {
    const r = s.route;
    const eps: { v: string; label: string }[] = [
      ...state.stations.map((st) => ({ v: 'station:' + st.id, label: st.name })),
      ...knownSectors(state).map((sec) => ({ v: 'market:' + sec, label: SECTOR_MAP[sec].tradeStation.name + ' (Markt)' })),
    ];
    const epVal = (ep?: TradeEndpoint) => (ep ? (ep.kind === 'station' ? 'station:' + ep.id : 'market:' + ep.sector) : '');
    const wares = WARE_IDS.filter((id) => WARES[id].storage === c.storage).sort((a, b) => WARES[a].name.localeCompare(WARES[b].name));
    const sel = (field: string, value: string, opts: { v: string; label: string }[]) =>
      `<select data-change="${field}" data-id="${s.id}">${opts.map((o) => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    orders = `<div class="section"><h3>Befehl</h3>
      <div class="segment" style="margin-bottom:12px"><button class="${s.mode === 'auto' ? 'on' : ''}" ${act('trader-mode', { id: s.id, mode: 'auto' })}>Autohandel</button><button class="${s.mode === 'route' ? 'on' : ''}" ${act('trader-mode', { id: s.id, mode: 'route' })}>Versorgungslinie</button></div>
      ${s.mode === 'auto'
        ? `<p class="small muted">Verkauft Überschüsse der Heimatstation an eigene Stationen, aktive Aufträge oder den besten Markt in der Nähe und kauft fehlende Eingangswaren ein.</p>`
        : `<div class="form">
          <div class="field"><label>Von</label>${sel('route-from', epVal(r?.from), eps)}</div>
          <div class="field"><label>Nach</label>${sel('route-to', epVal(r?.to), eps)}</div>
          <div class="field"><label>Ware</label>${sel('route-ware', r?.ware ?? '', wares.map((id) => ({ v: id, label: WARES[id].name })))}</div>
          ${r ? `<p class="small muted" style="margin:0">Pendelt dauerhaft: ${esc(epName(state, r.from))} → ${esc(epName(state, r.to))} mit ${esc(WARES[r.ware].name)}. Märkte kaufen und verkaufen zum Tagespreis.</p>` : ''}
        </div>`}
    </div>`;
  }
  const dockWarn = home && !hasDockFor(home, c.size) ? `<div class="section"><div class="box rows"><div class="row">${icon('warn', 20, 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">${esc(home.name)} braucht ${c.size === 'L' ? 'einen Pier' : 'ein Dock'}, damit dieses Schiff andocken kann.</div></div><button class="btn small amber" ${act('queue', { st: home.id, def: c.size === 'L' ? 'pier_l' : 'dock_m' })}>Bauen</button></div></div></div>` : '';
  return sheet(s.name, c.name, `
    ${dockWarn}
    <div class="section"><div class="kv">
      <div class="wide"><small>Status</small><b style="font-size:15px">${esc(s.status)}</b></div>
      <div><small>Fracht</small><b style="font-size:15px">${s.cargo ? `${fmtAmount(s.cargo.amount)} ${esc(WARES[s.cargo.ware].name)}` : 'leer'}</b></div>
      <div><small>Frachtraum</small><b style="font-size:15px">${fmtInt(c.capacity)} m³ ${esc(STORAGE_LABEL[c.storage])}</b></div>
      <div><small>Fahrten</small><b>${fmtInt(s.trips)}</b></div>
      <div><small>${c.role === 'miner' ? 'Geförderter Wert' : 'Handelsergebnis'}</small><b class="${s.earned >= 0 ? 'pos' : 'neg'}">${fmtCr(s.earned)}</b></div>
    </div></div>
    ${orders}
    <div class="section"><h3>Heimatstation</h3><div class="box rows"><div class="row tap" ${act('home-modal', { id: s.id })}>${icon('station', 20)}<div class="grow"><div class="title">${esc(home?.name ?? '—')}</div><div class="sub">${esc(home ? sector(home.sector).name : '')}</div></div><span class="small muted">Ändern</span>${icon('chev', 20, 'chev')}</div></div></div>
    <div class="card-actions"><button class="btn" ${act('focus', { kind: 'ship', id: s.id })}>${icon('target', 20)}Auf Karte</button><button class="btn danger" ${act('ask-sell-ship', { id: s.id })}>Verkaufen</button></div>`,
  { back: !!p.back });
}

// ---- Aufträge ----

function missionsPanel(state: GameState): string {
  const m = currentMission(state);
  let story = '';
  if (m) {
    const p = m.progress(state);
    const done = p.cur >= p.target;
    const idx = state.story.index + 1;
    story = `<div class="story-card">
      <div class="eyebrow">Kampagne · Kapitel ${idx} von ${STORY.length}</div>
      <h2>${esc(m.title)}</h2><p>${esc(m.story)}</p>
      <div class="goal">${icon(done ? 'check' : 'target', 20)}<div style="flex:1;min-width:0"><b>${esc(m.goal)}</b>
        <div class="small muted" style="margin:4px 0 6px">${fmtAmount(Math.min(p.cur, p.target))} / ${fmtAmount(p.target)}</div>${bar(p.cur / p.target, done ? '' : 'amber')}</div></div>
      <p class="hint">${icon('info', 16)}<span>${esc(m.hint)}</span></p>
      <div class="flow" style="margin-bottom:12px"><span class="io">${icon('wallet', 15)}<b>${fmtCr(m.reward.credits)}</b></span>${Object.entries(m.reward.rep ?? {}).map(([f, n]) => `<span class="io">${icon('star', 15)}<b>+${n}</b> Ruf ${FACTIONS[f as 'frf'].short}</span>`).join('')}</div>
      ${m.delivery && !done ? courierButtons(state, state.contracts.find((c) => c.story && c.status === 'active')?.id) : ''}
      <button class="btn ${done ? 'primary' : 'disabled'} block" ${act('claim')}>${icon('gift', 20)}${done ? 'Belohnung abholen' : 'Noch nicht erreicht'}</button>
    </div>`;
  } else {
    story = `<div class="story-card"><div class="eyebrow">Kampagne abgeschlossen</div><h2>Freies Spiel</h2><p>Die Familien stehen in deiner Schuld. Erweitere dein Imperium und erfülle weiter Aufträge.</p></div>`;
  }
  const active = state.contracts.filter((c) => c.status === 'active' && !c.story);
  const offers = state.contracts.filter((c) => c.status === 'offer');
  const contractRow = (c: typeof active[number], offer: boolean) => {
    const w = WARES[c.ware];
    const s = SECTOR_MAP[c.sector];
    return `<div class="row" data-key="c${c.id}" style="flex-wrap:wrap">${wareTile(c.ware)}<div class="grow"><div class="title">${esc(c.title)}</div>
      <div class="sub">${fmtInt(c.amount)} ${esc(w.name)} → ${esc(s.tradeStation.name)}</div>
      ${offer ? '' : `${bar(c.delivered / c.amount)}<div class="small muted" style="margin-top:4px">${fmtInt(c.delivered)} / ${fmtInt(c.amount)} geliefert · noch ${fmtDur(c.deadline - state.time)}</div>`}</div>
      <div class="right"><b class="pos">${fmtCr(c.reward)}</b><div class="small muted">${offer ? `${fmtDur(c.duration)} Frist` : `Ruf +${c.rep}`}</div></div>
      <div style="width:100%;display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        ${offer ? `<span class="small muted" style="margin-right:auto;align-self:center">läuft ab in ${fmtDur(c.deadline - state.time)}</span><button class="btn small primary" ${act('accept', { id: c.id })}>Annehmen</button>` : `<button class="btn small" ${act('courier-modal', { id: c.id })}>Per Kurier liefern</button>`}
      </div></div>`;
  };
  return sheet('Aufträge', 'Familie Zhin und Nachbarn', `
    <div class="section">${story}</div>
    <div class="section"><h3>Aktive Lieferaufträge</h3>${active.length ? `<div class="box rows">${active.map((c) => contractRow(c, false)).join('')}</div>` : '<div class="box empty">Keine aktiven Aufträge. Transporter im Autohandel liefern automatisch für angenommene Aufträge.</div>'}</div>
    <div class="section"><h3>Angebote</h3>${offers.length ? `<div class="box rows">${offers.map((c) => contractRow(c, true)).join('')}</div>` : '<div class="box empty">Gerade keine Angebote. Neue kommen etwa alle 30–50 Minuten Spielzeit.</div>'}</div>
    <div class="section"><h3>Ruf</h3><div class="kv">${(['frf', 'zya'] as const).map((f) => `<div><small>${esc(FACTIONS[f].name)}</small><b>${fmtNum(state.rep[f], 1)}</b>${bar(Math.max(0, state.rep[f]) / 30, 'amber')}</div>`).join('')}</div>
    <p class="small muted">Ruf öffnet Baupläne und Baulizenzen. Handel bringt Ruf bis Stufe 10, darüber zählen Aufträge.</p></div>`);
}

function courierButtons(_state: GameState, contractId?: number): string {
  if (contractId == null) return '';
  return `<button class="btn small block" style="margin-bottom:8px" ${act('courier-modal', { id: contractId })}>${icon('trader', 18)}Aus Lager per Kurier liefern</button>`;
}

// ---- Handel ----

function marketPanel(state: GameState, ui: UIState): string {
  const known = knownSectors(state);
  const secId = known.includes(ui.marketSector) ? ui.marketSector : 'zhin';
  const groups = ['all', 'mineral', 'gas', 'energy', 'refined', 'hightech', 'shiptech', 'food', 'agri', 'pharma'];
  const ids = WARE_IDS.filter((id) => ui.marketGroup === 'all' || WARES[id].group === ui.marketGroup).sort((a, b) => WARES[a].tier - WARES[b].tier || WARES[a].name.localeCompare(WARES[b].name));
  const rows = ids.map((id) => {
    const w = WARES[id];
    const price = marketPrice(state, secId, id);
    const rel = (price - w.price.avg) / w.price.avg;
    const m = state.markets[secId][id];
    const mine = state.stations.some((st) => st.modules.some((mm) => MODULE_MAP[mm.def]?.ware === id));
    return `<div class="row tap" ${act('open-ware', { id })} data-key="${id}">${wareTile(id)}<div class="grow"><div class="title" style="font-weight:500">${esc(w.name)}${mine ? ' <span class="pill teal" style="padding:1px 6px;font-size:10px">EIGEN</span>' : ''}</div>
      <div class="sub">Bestand ${pct(m.stock / m.cap)} · Spanne ${fmtInt(w.price.min)}–${fmtInt(w.price.max)}</div></div>
      <div class="right"><b>${fmtInt(price)} Cr</b><div class="small ${rel > 0.05 ? 'pos' : rel < -0.05 ? 'neg' : 'muted'}">${rel >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(rel * 100))} %</div></div></div>`;
  }).join('');
  return sheet('Handel', SECTOR_MAP[secId].tradeStation.name, `
    <p class="lead">Preise folgen dem Bestand: Leere Lager zahlen den Höchstpreis, volle nur den Mindestpreis. Große Verkäufe drücken die Preise.</p>
    <div class="pills" style="margin-bottom:10px">${known.map((id) => `<button class="pill ${id === secId ? 'teal' : ''}" ${act('market-sector', { id })}>${esc(SECTOR_MAP[id].name)}</button>`).join('')}</div>
    <div class="pills" style="margin-bottom:14px">${groups.map((g) => `<button class="pill ${ui.marketGroup === g ? 'amber' : ''}" ${act('market-group', { g })}>${g === 'all' ? 'Alle' : esc(GROUP_LABEL[g as 'mineral'])}</button>`).join('')}</div>
    <div class="box rows">${rows}</div>
    <p class="small muted" style="margin-top:10px">▲/▼ Abweichung vom Durchschnittspreis. Grün: guter Verkaufsort.</p>`);
}

function warePanel(state: GameState, id: string, p: Panel): string {
  const w = WARES[id];
  const d = MODULE_MAP['prod_' + id];
  const known = knownSectors(state);
  const recipe = w.cycle ? `<div class="section"><h3>Rezept pro Zyklus · ${fmtDur(w.cycle)}</h3><div class="box" style="padding:12px">
    <div class="flow">${w.inputs.length ? w.inputs.map((i) => `<span class="io">${wareDot(WARES[i.ware].color, 8)}<b>${fmtInt(i.amount)}</b> ${esc(WARES[i.ware].name)}</span>`).join('<span class="arrow">+</span>') : '<span class="io">Sonnenlicht</span>'}
    <span class="arrow">${icon('arrowRight', 18)}</span><span class="io" style="border-color:${w.color}">${wareDot(w.color, 8)}<b>${fmtInt(w.batch)}</b> ${esc(w.name)}</span></div>
    <div class="small muted" style="margin-top:10px">Pro Stunde und Modul: ${inputsPerHour(id).map((i) => `${fmtInt(i.amount)} ${esc(WARES[i.ware].name)}`).join(', ') || '—'} → <b style="color:var(--text)">${fmtInt(outputPerHour(id))} ${esc(w.name)}</b>${id === 'energycells' ? ' bei 100 % Sonnenlicht' : ''}</div></div></div>` : `<div class="section"><div class="box" style="padding:12px"><p class="small" style="margin:0;color:var(--text-2)">${esc(w.name)} wird von Minern in Rohstofffeldern gefördert. Lagerart: ${esc(STORAGE_LABEL[w.storage])}.</p></div></div>`;
  let module = '';
  if (d) {
    const bp = blueprintState(state, d.id);
    const value = outputPerHour(id) * w.price.avg - inputsPerHour(id).reduce((s, i) => s + i.amount * WARES[i.ware].price.avg, 0);
    module = `<div class="section"><h3>Produktionsmodul</h3><div class="kv">
      <div><small>Baukosten</small><b>${fmtCr(d.cost)}</b></div><div><small>Bauzeit</small><b>${fmtDur(d.buildTime)}</b></div>
      <div><small>Marge / h (Ø-Preise)</small><b class="${value >= 0 ? 'pos' : 'neg'}">${fmtCr(value)}</b></div>
      <div><small>Bauplan</small><b style="font-size:15px">${bp === 'owned' ? 'vorhanden' : bp === 'buyable' ? fmtCr(d.blueprintCost) : `Ruf ${d.repRequired}`}</b></div>
      <div class="wide"><small>Baumaterial (X4)</small><div class="small" style="color:var(--text-2);margin-top:3px">${Object.entries(d.materials).map(([m, n]) => `${fmtInt(n)} ${esc(WARES[m]?.name ?? m)}`).join(' · ')} · Methode ${esc(d.method)}</div></div>
    </div>${bp === 'buyable' ? `<button class="btn amber block" style="margin-top:10px" ${act('buy-bp', { def: d.id })}>Bauplan kaufen · ${fmtCr(d.blueprintCost)}</button>` : ''}</div>`;
  }
  const users = WARE_IDS.filter((x) => WARES[x].inputs.some((i) => i.ware === id));
  const prices = known.map((sec) => `<div class="row"><div class="grow"><div class="title" style="font-weight:500">${esc(SECTOR_MAP[sec].name)}</div><div class="sub">Bestand ${fmtAmount(marketStock(state, sec, id))}</div></div><div class="right"><b>${fmtInt(marketPrice(state, sec, id))} Cr</b></div></div>`).join('');
  return sheet(w.name, `${GROUP_LABEL[w.group]} · Stufe ${w.tier}`, `
    <div class="section"><div class="kv">
      <div><small>Ø-Preis</small><b>${fmtInt(w.price.avg)} Cr</b></div><div><small>Spanne</small><b style="font-size:15px">${fmtInt(w.price.min)} – ${fmtInt(w.price.max)}</b></div>
      <div><small>Volumen</small><b>${w.volume} m³</b></div><div><small>Lager</small><b style="font-size:15px">${esc(STORAGE_LABEL[w.storage])}</b></div>
    </div>${w.estimated ? '<p class="small muted">Preis geschätzt – nicht im Datensatz.</p>' : ''}</div>
    ${recipe}${module}
    ${users.length ? `<div class="section"><h3>Wird verbraucht für</h3><div class="pills">${users.map((u) => `<button class="pill" ${act('open-ware', { id: u })}>${wareDot(WARES[u].color, 8)}${esc(WARES[u].name)}</button>`).join('')}</div></div>` : ''}
    <div class="section"><h3>Preise in bekannten Sektoren</h3><div class="box rows">${prices}</div></div>`, { back: !!p.back });
}

// ---- Sektor ----

function sectorPanel(state: GameState, id: string, p: Panel): string {
  const s = SECTOR_MAP[id];
  const owned = state.sectors.includes(id);
  const reachable = s.links.some((l) => state.sectors.includes(l));
  const rep = state.rep[s.faction];
  const canBuy = !owned && reachable && rep >= s.repRequired && state.credits >= s.licenseCost;
  return sheet(s.name, FACTIONS[s.faction].name, `
    <p class="lead">${esc(s.description)}</p>
    <div class="section"><div class="kv">
      <div><small>Sonnenlicht</small><b>${s.sunlight} %</b></div><div><small>Stationen</small><b>${state.stations.filter((x) => x.sector === id).length}</b></div>
      <div><small>Baulizenz</small><b style="font-size:15px">${owned ? 'vorhanden' : fmtCr(s.licenseCost)}</b></div><div><small>Ruf nötig</small><b style="font-size:15px">${s.repRequired} ${FACTIONS[s.faction].short} <span class="small ${rep >= s.repRequired ? 'pos' : 'neg'}">(${fmtNum(rep, 1)})</span></b></div>
    </div></div>
    <div class="section"><h3>Rohstofffelder</h3><div class="box rows">${s.fields.map((f) => `<div class="row">${wareTile(f.ware)}<div class="grow"><div class="title" style="font-weight:500">${esc(WARES[f.ware].name)}</div><div class="sub">Ertrag ${pct(f.richness)} · Radius ${f.r} km</div></div></div>`).join('')}</div></div>
    <div class="section"><h3>Markt</h3><div class="pills">${s.demand.map((w) => `<span class="pill amber">${esc(WARES[w].name)} gefragt</span>`).join('')}${s.surplus.map((w) => `<span class="pill">${esc(WARES[w].name)} günstig</span>`).join('')}</div></div>
    ${owned ? '' : `<button class="btn ${canBuy ? 'amber' : 'disabled'} block" ${act('license', { id })}>${icon('lock', 20)}${!reachable ? 'Nur über Nachbarsektoren erreichbar' : rep < s.repRequired ? `Ruf ${s.repRequired} nötig` : `Baulizenz kaufen · ${fmtCr(s.licenseCost)}`}</button>`}
    <button class="btn block" style="margin-top:8px" ${act('goto-sector', { id })}>${icon('arrowRight', 20)}Sektor ansehen</button>`, { back: !!p.back });
}

// ---- Mehr ----

function morePanel(state: GameState, ui: UIState): string {
  const worth = netWorth(state);
  const logRows = [...state.log].reverse().slice(0, 25).map((l) => `<div class="row"><span class="small muted num" style="flex:none;width:74px">${fmtClock(l.t).replace('Tag ', 'T')}</span><div class="grow"><div class="sub wrap ${l.kind === 'good' ? 'pos' : l.kind === 'bad' ? 'neg' : l.kind === 'warn' ? 'warn-text' : ''}" style="${l.kind === 'info' ? 'color:var(--text-2)' : ''}">${esc(l.text)}</div></div></div>`).join('');
  return sheet('Leitstand', 'Mehr', `
    <div class="section"><h3>Unternehmen</h3><div class="kv">
      <div><small>Unternehmenswert</small><b>${fmtCr(worth)}</b></div><div><small>Spielzeit</small><b style="font-size:15px">${fmtClock(state.time)}</b></div>
      <div><small>Verkäufe gesamt</small><b class="pos">${fmtCr(state.totals.sold)}</b></div><div><small>Einkäufe gesamt</small><b>${fmtCr(state.totals.bought)}</b></div>
      <div><small>Stationen</small><b>${state.stations.length}</b></div><div><small>Schiffe</small><b>${state.ships.length}</b></div>
    </div></div>
    <div class="section"><h3>Spielstand</h3><div class="box rows">
      <div class="row">${icon('save', 20)}<div class="grow"><div class="title" style="font-weight:500">Automatisch gespeichert</div><div class="sub wrap">${esc(ui.saveStatus || 'Auf diesem Gerät')}</div></div></div>
      <div class="row tap" ${act('export')}>${icon('box', 20)}<div class="grow"><div class="title" style="font-weight:500">Spielstand sichern</div><div class="sub">Als Text kopieren</div></div>${icon('chev', 20, 'chev')}</div>
      <div class="row tap" ${act('import-modal')}>${icon('down', 20)}<div class="grow"><div class="title" style="font-weight:500">Spielstand laden</div><div class="sub">Gesicherten Text einfügen</div></div>${icon('chev', 20, 'chev')}</div>
      <div class="row tap" ${act('ask-newgame')}>${icon('trash', 20, 'neg')}<div class="grow"><div class="title neg" style="font-weight:500">Neues Spiel</div><div class="sub">Löscht den aktuellen Spielstand</div></div></div>
    </div></div>
    <div class="section"><h3>So funktioniert's</h3><div class="box" style="padding:14px"><div class="steps" style="margin:0">
      <div><span class="n">1</span><div><b>Rohstoffe fördern</b>Miner fliegen zu Feldern und bringen Erz, Silizium, Eis oder Gas zur Heimatstation. Stationen brauchen dafür Lager und ein Dock.</div></div>
      <div><span class="n">2</span><div><b>Veredeln</b>Produktionsmodule arbeiten mit den echten X4-Rezepten: Zykluszeit, Eingangs- und Ausgangsmengen. Solarkraftwerke liefern Energiezellen je nach Sonnenlicht.</div></div>
      <div><span class="n">3</span><div><b>Versorgungsketten</b>Transporter verbinden Stationen und Märkte. Im Autohandel entscheiden sie selbst, Versorgungslinien pendeln fest zwischen zwei Punkten.</div></div>
      <div><span class="n">4</span><div><b>Handeln und wachsen</b>Märkte reagieren auf Angebot und Nachfrage. Aufträge bringen Ruf, Ruf öffnet Baupläne und neue Sektoren.</div></div>
    </div></div></div>
    <div class="section"><h3>Anzeige</h3><div class="box rows"><div class="row"><div class="grow"><div class="title" style="font-weight:500">Routen auf der Karte</div><div class="sub">Flugwege und Versorgungslinien</div></div>
      <div class="toggle"><button class="plain ${ui.routes ? 'on' : ''}" ${act('routes-toggle')}>${ui.routes ? 'An' : 'Aus'}</button></div></div></div></div>
    <div class="section"><h3>Ereignisse</h3><div class="box rows">${logRows}</div></div>
    <div class="section"><h3>Daten & Quellen</h3><div class="box" style="padding:14px"><p class="small" style="margin:0 0 8px;color:var(--text-2)">Rezepte, Preisspannen, Warenvolumen und Lagerarten aus dem Community-Datensatz X4Foundations_FactoryStationsTracker. Baumaterialien und Bauzeiten der Module aus crissian/x4. Frachträume der Split-Schiffe und Lagermodule aus der Egosoft-Wiki.</p>
      <p class="small muted" style="margin:0">Spielwerte: Schiffspreise, Fluggeschwindigkeiten, Abbauraten, Kartenlage der Felder, die Nachbarsektoren sowie der Nividium-Preis. Belegschaft und Kampf sind nicht Teil dieses Spiels. X4: Foundations ist ein Spiel von Egosoft; dies ist ein inoffizielles Fanprojekt.</p></div></div>`);
}

// ---------- Dialoge ----------

export function modalHtml(state: GameState, ui: UIState): string {
  const m = ui.modal;
  if (!m) return '';
  switch (m.type) {
    case 'modules': return modulesModal(state, m);
    case 'buyShip': return buyShipModal(state, m);
    case 'confirm': return modalShell(m.title, `<p class="lead" style="margin:0">${esc(m.text)}</p>`, `<button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn ${m.danger ? 'danger' : 'primary'}" ${act('confirm')}>${esc(m.label)}</button>`);
    case 'rename': {
      const st = stationById(state, m.station);
      return modalShell('Station umbenennen', `<div class="field"><label for="renameInput">Name</label><input id="renameInput" class="input" maxlength="32" value="${esc(st?.name ?? '')}"></div>`, `<button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary" ${act('rename-save', { st: m.station })}>Speichern</button>`);
    }
    case 'offline': {
      const prod = Object.entries(m.produced).sort((a, b) => b[1] * WARES[b[0]].price.avg - a[1] * WARES[a[0]].price.avg).slice(0, 6);
      return modalShell('Willkommen zurück', `<p class="lead">Während du weg warst, lief dein Imperium ${fmtDur(m.seconds)} weiter.</p>
        <div class="kv"><div><small>Credits</small><b class="${m.credits >= 0 ? 'pos' : 'neg'}">${m.credits >= 0 ? '+' : ''}${fmtCr(m.credits)}</b></div><div><small>Neue Module</small><b>${m.modules}</b></div></div>
        ${prod.length ? `<div class="section" style="margin-top:14px"><h3>Produziert</h3><div class="box rows">${prod.map(([id, n]) => `<div class="row">${wareDot(WARES[id].color)}<div class="grow"><div class="title" style="font-weight:500">${esc(WARES[id].name)}</div></div><div class="right"><b>${fmtAmount(n)}</b></div></div>`).join('')}</div></div>` : ''}`,
        `<button class="btn primary" ${act('modal-close')}>Weiter</button>`);
    }
    case 'welcome': return welcomeModal();
    case 'alerts': {
      const alerts = allAlerts(state);
      return modalShell('Engpässe & Hinweise', alerts.length ? `<div class="box rows">${alerts.map((a) => `<div class="row tap" ${act('open-station', { id: a.station, tab: 'overview' })}>${icon('warn', 20, a.severity === 'bad' ? 'neg' : 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">${esc(a.text)}</div>${a.ware ? `<div class="sub wrap">${esc(hintFor(state, stationById(state, a.station)!, a.ware))}</div>` : ''}</div>${icon('chev', 20, 'chev')}</div>`).join('')}</div>` : '<div class="empty">Alles läuft. Keine Engpässe.</div>', `<button class="btn" ${act('modal-close')}>Schließen</button>`);
    }
    case 'export': return modalShell('Spielstand sichern', `<p class="lead">Kopiere diesen Text und bewahre ihn auf. Mit „Spielstand laden“ kannst du ihn später wieder einfügen.</p><textarea id="exportText" readonly>${esc(JSON.stringify(state))}</textarea><p class="small muted" id="copyStatus"></p>`, `<button class="btn" ${act('modal-close')}>Schließen</button><button class="btn primary" ${act('copy-export')}>Kopieren</button>`);
    case 'import': return modalShell('Spielstand laden', `<p class="lead">Füge einen gesicherten Spielstand ein. Der aktuelle Stand wird ersetzt.</p><textarea id="importText" placeholder="{&quot;version&quot;:1, …}"></textarea>${m.error ? `<p class="small neg">${esc(m.error)}</p>` : ''}`, `<button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary" ${act('import-do')}>Laden</button>`);
    case 'home': {
      const s = state.ships.find((x) => x.id === m.ship);
      return modalShell('Heimatstation wählen', `<div class="box rows">${state.stations.map((st) => `<div class="row tap" ${act('set-home', { id: m.ship, st: st.id })}>${icon('station', 20)}<div class="grow"><div class="title">${esc(st.name)}</div><div class="sub">${esc(sector(st.sector).name)}</div></div>${s?.home === st.id ? icon('check', 20, 'pos') : ''}</div>`).join('')}</div>`, `<button class="btn" ${act('modal-close')}>Abbrechen</button>`);
    }
    case 'courier': {
      const c = state.contracts.find((x) => x.id === m.contract);
      if (!c) return '';
      const w = WARES[c.ware];
      const rows = state.stations.map((st) => {
        const have = st.inventory[c.ware] ?? 0;
        return `<div class="row ${have >= 1 ? 'tap' : ''}" ${have >= 1 ? act('courier', { c: c.id, st: st.id }) : ''}>${icon('station', 20)}<div class="grow"><div class="title">${esc(st.name)}</div><div class="sub">${fmtAmount(have)} ${esc(w.name)} auf Lager</div></div>${have >= 1 ? '<span class="btn small primary">Senden</span>' : ''}</div>`;
      }).join('');
      return modalShell('Per Kurier liefern', `<p class="lead">Ein angeheuerter Kurier bringt die Ware sofort los. Gebühr: 10 % des Warenwerts.</p><div class="box rows">${rows}</div>`, `<button class="btn" ${act('modal-close')}>Abbrechen</button>`);
    }
  }
}

function modalShell(title: string, body: string, foot: string, eyebrow = ''): string {
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><h1>${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}${esc(title)}</h1><button class="icon-btn" ${act('modal-close')} aria-label="Schließen">${icon('close', 22)}</button></div><div class="sheet-body">${body}</div><div class="modal-foot">${foot}</div></div>`;
}

function modulesModal(state: GameState, m: Extract<Modal, { type: 'modules' }>): string {
  const st = stationById(state, m.station);
  if (!st) return '';
  const cats: [string, string][] = [['production', 'Produktion'], ['storage', 'Lager'], ['dock', 'Andocken']];
  const sun = sector(st.sector).sunlight;
  const list = MODULES.filter((d) => (m.cat === 'production' ? d.kind === 'production' : m.cat === 'storage' ? d.kind === 'storage' : d.kind === 'dock' || d.kind === 'pier'))
    .sort((a, b) => {
      const sa = blueprintState(state, a.id), sb = blueprintState(state, b.id);
      const order = { owned: 0, buyable: 1, locked: 2 };
      return order[sa] - order[sb] || (a.ware && b.ware ? WARES[a.ware].tier - WARES[b.ware].tier : 0) || a.cost - b.cost;
    });
  const cards = list.map((d) => {
    const bp = blueprintState(state, d.id);
    const afford = state.credits >= d.cost;
    let io = '';
    if (d.kind === 'production' && d.ware) {
      const ins = inputsPerHour(d.ware);
      io = `<div class="flow" style="grid-column:1/-1">${ins.map((i) => `<span class="io">${wareDot(WARES[i.ware].color, 7)}<b>${fmtAmount(i.amount)}</b>${esc(WARES[i.ware].name)}</span>`).join('')}${ins.length ? `<span class="arrow">${icon('arrowRight', 16)}</span>` : ''}<span class="io" style="border-color:${WARES[d.ware].color}">${wareDot(WARES[d.ware].color, 7)}<b>${fmtAmount(outputPerHour(d.ware, sun))}</b>${esc(WARES[d.ware].name)} / h</span></div>`;
    }
    const lead = d.kind === 'production' && d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(d.kind === 'storage' ? 'storage' : 'dock', 18)}</span>`;
    const desc = d.kind === 'storage' ? `${fmtInt(d.capacity ?? 0)} m³ ${STORAGE_LABEL[d.storage!]}` : d.kind === 'dock' ? 'Andockplätze für M- und S-Schiffe' : d.kind === 'pier' ? 'Andockplätze für L-Schiffe (Wyvern, Buffalo)' : `${esc(GROUP_LABEL[WARES[d.ware!].group])} · Stufe ${WARES[d.ware!].tier}${['Split', 'Universal', 'Argon'].includes(d.method) ? '' : ' · ' + esc(d.method)}`;
    const action = bp === 'owned'
      ? `<button class="btn small ${afford ? 'primary' : 'disabled'}" ${act('queue', { st: st.id, def: d.id })}>${icon('plus', 16)}Bauen</button>`
      : bp === 'buyable'
        ? `<button class="btn small amber ${state.credits >= d.blueprintCost ? '' : 'disabled'}" ${act('buy-bp', { def: d.id })}>Bauplan · ${fmtCr(d.blueprintCost)}</button>`
        : `<span class="pill">${icon('lock', 13)} Ruf ${d.repRequired} FRF</span>`;
    return `<div class="module-card box ${bp === 'locked' ? 'locked' : ''}" data-key="${d.id}">${lead}<div style="min-width:0"><div class="title" style="font-weight:600">${esc(d.name)}</div><div class="small muted">${desc}</div></div>
      ${io}<div class="meta" style="grid-column:1/-1"><span>Kosten <b>${fmtCr(d.cost)}</b></span><span>Bauzeit <b>${fmtDur(d.buildTime)}</b></span></div>
      <div class="actions">${action}</div></div>`;
  }).join('');
  const body = `<div class="tabs" style="padding:0 0 12px">${cats.map(([c, l]) => `<button class="${m.cat === c ? 'active' : ''}" ${act('modules-cat', { cat: c })}>${l}</button>`).join('')}</div>
    <div style="display:grid;gap:10px">${cards}</div>`;
  return modalShell(`Modul bauen`, body, `<button class="btn" ${act('modal-close')}>Fertig</button>`, `${st.name} · ${fmtCr(state.credits)} verfügbar`);
}

function buyShipModal(state: GameState, m: Extract<Modal, { type: 'buyShip' }>): string {
  const st = stationById(state, m.station) ?? state.stations[0];
  if (!st) return '';
  const list = SHIP_CLASSES.filter((c) => m.role === 'all' || c.role === m.role);
  const cards = list.map((c) => {
    const dock = hasDockFor(st, c.size);
    const afford = state.credits >= c.price;
    return `<div class="module-card box" data-key="${c.id}"><span class="ware-tile" style="--c:${c.role === 'miner' ? '#ffc45e' : '#5ff0d8'}">${icon(c.role === 'miner' ? 'miner' : 'trader', 18)}</span>
      <div style="min-width:0"><div class="title" style="font-weight:600">${esc(c.name)} <span class="pill" style="padding:1px 7px">${c.size}</span></div><div class="small muted">${esc(c.description)}</div></div>
      <div class="meta" style="grid-column:1/-1"><span>Fracht <b>${fmtInt(c.capacity)} m³</b> ${esc(STORAGE_LABEL[c.storage])}</span><span>Tempo <b>${fmtNum(c.speed, 1)} km/s</b></span>${c.miningRate ? `<span>Abbau <b>${c.miningRate} m³/s</b></span>` : ''}</div>
      <div class="actions">${dock ? '' : `<span class="small warn-text" style="margin-right:auto">${c.size === 'L' ? 'Pier fehlt' : 'Dock fehlt'}</span>`}<button class="btn small ${afford ? 'primary' : 'disabled'}" ${act('buyship', { st: st.id, cls: c.id })}>Kaufen · ${fmtCr(c.price)}</button></div></div>`;
  }).join('');
  const picker = state.stations.length > 1 ? `<div class="field" style="margin-bottom:12px"><label>Heimatstation</label><select data-change="buy-home">${state.stations.map((x) => `<option value="${x.id}" ${x.id === st.id ? 'selected' : ''}>${esc(x.name)} · ${esc(sector(x.sector).name)}</option>`).join('')}</select></div>` : '';
  return modalShell('Schiff kaufen', `${picker}<div style="display:grid;gap:10px">${cards}</div>`, `<button class="btn" ${act('modal-close')}>Fertig</button>`, `Split-Werft · ${fmtCr(state.credits)} verfügbar`);
}

function welcomeModal(): string {
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Willkommen">
    <div class="welcome-hero"><div class="logo">X4 <em>Sektorbau</em></div><p>Familie Zhin, kurz nach dem Xenon-Angriff. Du bekommst Baurechte, eine kleine Station und einen Miner. Mach daraus ein Wirtschaftsimperium.</p></div>
    <div class="sheet-body"><div class="steps">
      <div><span class="n">1</span><div><b>Station antippen</b>Unten erscheinen Status und „Bauplan“. Dort baust du Module.</div></div>
      <div><span class="n">2</span><div><b>Produktionsketten aufbauen</b>Erz + Energiezellen → Veredelte Metalle. Echte X4-Rezepte und Bauzeiten.</div></div>
      <div><span class="n">3</span><div><b>Versorgen und verkaufen</b>Miner fördern, Transporter handeln, NPC-Händler kaufen deine Überschüsse.</div></div>
      <div><span class="n">4</span><div><b>Zeit steuern</b>Oben rechts pausieren oder beschleunigen (×1 bis ×60). Dein Imperium läuft auch weiter, wenn du weg bist.</div></div>
    </div></div>
    <div class="modal-foot"><button class="btn primary" ${act('modal-close')}>${icon('play', 18)}Loslegen</button></div></div>`;
}

export { SPEEDS };
