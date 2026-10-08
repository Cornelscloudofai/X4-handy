// HTML-Bausteine aller Bildschirme. Aktionen laufen über data-act (siehe app.ts).
import { wareIcon, wareMark } from './wareIcons';
import { MINI_INFO, MINI_KINDS, dailyOpts, goalsOf, mutatorsOf, type MiniKind } from '../minigames/host';
import { UNLOCK, badgeCount, best as mgBest, bestPoints as mgBestPoints, dailyBest, totalStars, unlocked } from '../minigames/records';
import type { Level } from '../minigames/common';
import { drawFighterVector } from '../minigames/shooter';
import { FIGHTER_NAME, fighterKind, shipArt, spriteName, spriteUrl, type FighterKind, type ShipArt } from '../render/shipArt';
import { SHIELD_IDS, SHIELDS, SHIP_IDS, SHIPS, SPECIALS, TURRET_IDS, TURRETS, WEAPON_IDS, WEAPONS, loadout, loadoutLabel, controlMode, sustainedDps, type ShipId, type X4Gun } from '../minigames/loadout';

let vectorUrl = '';
/** Die Neon-Zeichnung des Jägers als Bild (für den Vergleich) */
function fighterVectorUrl(): string {
  if (vectorUrl) return vectorUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.translate(256, 256);
  g.scale(14, 14);
  drawFighterVector(g);
  vectorUrl = c.toDataURL('image/png');
  return vectorUrl;
}
import { sectorFlows } from '../engine/flows';
import { H } from '../engine/history';
import { bigChart, sparkline, type ChartSpec } from './charts';
import { tw } from './tween';
import { BG_IMAGES, bgImageInfo, sectorImageId } from '../render/bgImages';
import { MODULES, MODULE_MAP, PLOT_COST } from '../data/modules';
import { FACTIONS, NPC_MAP, SECTORS, SECTOR_MAP, sector } from '../data/sectors';
import { SHIP_CLASSES, SHIP_MAP } from '../data/ships';
import { GROUP_LABEL, STORAGE_LABEL, WARES, WARE_IDS, inputsPerHour, outputPerHour } from '../data/wares';
import { bestRepFor, bestStorage, blueprintState, stationCost, vendorOffer } from '../engine/actions';
import { RACE_LABEL, raceOf, vendorPlace, vendorsAt, vendorsFor } from '../data/vendors';
import { byName, matches, searchBox } from './search';
import { allAlerts, productionUtil, shortestRunway, stationAlerts, stationOutputValue, storageUse } from '../engine/analysis';
import { BUILD_STORAGE_COST, buildDemand, buildMoveLimits, buildProgress, consumesWare, hasDockFor, marketSupply, marketPrice, marketRoom, marketStock, storageShare, stationRates, stationWares, storageCap, tradeRule, wareLimit } from '../engine/economy';
import { restMode, shipEta } from '../engine/fleet';
import { endpointName, fieldById, incoming, knownSectors, reserveFor, stationById, wanted } from '../engine/logistics';
import { netWorth } from '../engine/stats';
import { STORY, currentMission, missionComplete } from '../engine/story';
import { deliveryOptions } from '../engine/delivery';
import { SHIP_BUILD_TIME, hasYard, materialValue, missingFor, yardSizes, yardStations } from '../engine/yard';
import type { GameState, ModuleDef, RestAction, RestCase, Ship, Station, TradeEndpoint } from '../engine/types';
import { esc } from './dom';
import { helpBtn, helpList, helpModalParts } from './help';
import { canUndo, undoLabel } from './undo';
import { fmtAmount, fmtClock, fmtCr, fmtDur, fmtInt, fmtNum, pct } from './format';
import { icon } from './icons';
import { soundEnabled } from './sound';
import { buildModal, diagramEditor, pickerModal, plannerPanel } from './plannerView';
import { sellModalHtml } from './sellView';
import { computePlan, producible } from '../engine/planner';
import { SPEEDS, type Modal, type Panel, type UIState } from './uistate';

// ---------- Hilfen ----------

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

/** In eingebetteten Vorschauen (iframe) sind Downloads meist gesperrt – dann nur Text kopieren */
function canDownload(): boolean {
  try { return window.self === window.top; } catch { return false; }
}

/** Symbol für Module ohne Produkt */
function moduleIcon(kind: string): string {
  return kind === 'storage' ? 'storage' : kind === 'core' || kind === 'habitat' ? 'station' : kind === 'shipyard' ? 'yard' : 'dock';
}

function wareTile(id: string): string {
  const w = WARES[id];
  return `<span class="ware-tile" style="--c:${w.color}" title="${esc(w.name)}">${wareIcon(id, 24)}</span>`;
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

export function hudHtml(state: GameState, ui: UIState, creditFlash: string, shownCredits = state.credits): string {
  const alerts = allAlerts(state);
  const sec = SECTOR_MAP[ui.sector];
  const speedLabel = `×${state.speed}`;
  const inGalaxy = ui.view === 'galaxy';
  return `
  <div class="hud-row">
    <button class="chip sector" ${act('galaxy')} aria-label="Galaxiekarte öffnen">${icon(inGalaxy ? 'sector' : 'galaxy', 18)}<b>${esc(inGalaxy ? 'Galaxie' : sec.name)}</b></button>
    <div class="chip credits ${creditFlash}" aria-label="Credits"><b class="num">${fmtCr(shownCredits)}</b></div>
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
  ${inGalaxy ? `<div class="tool-row"><button class="btn menu-btn" ${act('nav', { tab: 'more' })} aria-label="Menü">${icon('more', 20)}</button></div>` : `<div class="tool-row">
    <button class="btn outline-teal" ${act('place-start')}>${icon('plus', 20)}Station</button>
    <button class="btn ${ui.routes || ui.flows ? 'on' : ''} ${ui.layerMenu ? 'open' : ''}" ${act('layer-menu')} aria-expanded="${ui.layerMenu}">${icon('routes', 20)}Routen</button>
    <button class="btn menu-btn" ${act('nav', { tab: 'more' })} aria-label="Menü">${icon('more', 20)}</button>
    <div class="zoom"><button ${act('zoom-in')} aria-label="Hineinzoomen">${icon('plus', 20)}</button><button ${act('zoom-out')} aria-label="Herauszoomen">${icon('minus', 20)}</button></div>
  </div>${flowFilter(state, ui)}`}`;
}

/**
 * Kartenebenen (nach Tipp auf „Routen“): Handelsrouten und Warenflüsse einzeln schaltbar, beide aus = nichts.
 * Bei eingeschalteten Warenflüssen folgt der Warenfilter (nur Waren, die gerade im Sektor fließen).
 */
function flowFilter(state: GameState, ui: UIState): string {
  if (!ui.layerMenu || ui.placing) return '';
  const layer = (key: string, label: string, on: boolean) => `<button class="layer-chip ${on ? 'on' : ''}" ${act('layer-toggle', { layer: key })} aria-pressed="${on}"><i></i>${label}</button>`;
  let wareChips = '';
  if (ui.flows) {
    const wares = [...new Set(sectorFlows(state, ui.sector, () => 1).map((f) => f.ware))].sort((a, b) => WARES[a].name.localeCompare(WARES[b].name, 'de'));
    if (ui.flowWare && !wares.includes(ui.flowWare)) wares.unshift(ui.flowWare);
    const chip = (id: string, label: string) => `<button class="flow-chip ${ui.flowWare === id ? 'on' : ''}" ${act('flow-ware', { ware: id })}>${id ? wareIcon(id, 16) : ''}${esc(label)}</button>`;
    if (wares.length) wareChips = `<span class="flow-sep"></span>${chip('', 'Alle Waren')}${wares.map((w) => chip(w, WARES[w].name)).join('')}`;
  }
  return `<div class="flow-filter" aria-label="Kartenebenen">${layer('routes', 'Handelsrouten', ui.routes)}${layer('flows', 'Warenflüsse', ui.flows)}${wareChips}</div>`;
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
  const active = ui.panel ? ({ stations: 'stations', station: 'stations', fleet: 'fleet', ship: 'fleet', missions: 'missions', market: 'market', ware: 'market', more: 'map', sector: 'map', planner: 'planner' } as Record<string, string>)[ui.panel.type] : 'map';
  const offers = state.contracts.filter((c) => c.status === 'offer').length + (missionComplete(state) ? 1 : 0);
  const items: [string, string, string, number][] = [
    ['map', 'sector', 'Sektor', 0],
    ['stations', 'station', 'Stationen', 0],
    ['fleet', 'fleet', 'Flotte', 0],
    ['planner', 'planner', 'Planer', 0],
    ['missions', 'missions', 'Aufträge', offers],
    ['market', 'market', 'Handel', 0],
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
    case 'npcst': return npcCard(state, sel.id);
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
  const buildFrac = buildProgress(st);
  const runway = shortestRunway(st);
  const alerts = stationAlerts(state, st);
  const miners = state.ships.filter((s) => s.home === st.id && SHIP_MAP[s.cls].role === 'miner');
  const etas = miners.map((s) => shipEta(state, s)).filter((x): x is number => x != null).sort((a, b) => a - b);
  const cell1 = building
    ? `<div>${icon('wrench', 22)}<span><b>${building} Modul${building === 1 ? '' : 'e'} im Bau</b>${bar(buildFrac)}</span></div>`
    : `<div>${icon('factory', 22)}<span><b>${pct(productionUtil(st))}</b>Auslastung</span></div>`;
  const cell2 = alerts.length
    ? `<div class="warn">${icon('warn', 22)}<span><b>${esc(alerts[0].ware ? WARES[alerts[0].ware].name : 'Achtung')}</b>${esc(alerts[0].ware ? 'fehlt' : alerts[0].short ?? alerts[0].text.split(': ')[1] ?? '')}</span></div>`
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
  return cardShell(`${wareIcon(w.id, 26)}`, w.name, `Rohstofffeld · ${esc(info.sector.name)}`, `
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
    <div class="stats3">${top.map((id) => `<div>${wareMark(id, 10)}<span><b>${fmtInt(marketPrice(state, secId, id))} Cr</b>${esc(WARES[id].name)}</span></div>`).join('')}</div>
    <div class="card-actions"><button class="btn primary" ${act('open-market', { id: secId })}>${icon('market', 20)}Marktpreise</button>${vendorButton(state, secId)}</div>`, true);
}

/** Knopf zum Vertreter – zeigt, wie viele Baupläne dort jetzt kaufbar sind */
function vendorButton(state: GameState, sector: string, npc?: string): string {
  const vs = vendorsAt(sector, npc);
  if (!vs.length) return '';
  const n = vs.reduce((k, v) => k + v.sells.filter((id) => vendorOffer(state, v, id) === 'buyable').length, 0);
  const far = vs.every((v) => !knownSectors(state).includes(v.sector));
  return `<button class="btn amber ${far ? 'disabled' : ''}" ${act('open-vendor', npc ? { sector, npc } : { sector })}>${icon('star', 20)}${vs.length > 1 ? 'Vertreter' : npc ? 'Werftvertreter' : 'Vertreter'}${n ? ` <span class="count">${n}</span>` : ''}</button>`;
}

const NPC_KIND: Record<string, string> = { wharf: 'Werft', defence: 'Verteidigungsstation', factory: 'Fabrik', habitat: 'Habitat' };

function npcCard(state: GameState, id: string): string {
  const n = NPC_MAP[id];
  if (!n) return '';
  const rows = n.buys.map((w) => {
    const room = marketRoom(state, id, w);
    return `<div class="row" style="padding:7px 10px">${wareMark(w, 9)}<div class="grow"><div class="title" style="font-weight:500;font-size:14px">${esc(WARES[w].name)}</div><div class="sub">nimmt noch ${fmtAmount(room)}</div></div><div class="right"><b>${fmtInt(marketPrice(state, id, w))} Cr</b></div></div>`;
  }).join('');
  return cardShell(icon('market', 24), n.name, `${NPC_KIND[n.kind]} · ${esc(SECTOR_MAP[n.sector].name)} · kauft an`, `
    <div class="box rows npc-buys">${rows}</div>
    <p class="small muted" style="margin:8px 0 0">Kleine Lager, meist gute Preise. Wer viel liefert, drückt den Preis – nach einigen Stunden ist wieder Bedarf da.</p>
    ${vendorsAt(n.sector, n.id).length ? `<div class="card-actions one" style="margin-top:10px">${vendorButton(state, n.sector, n.id)}</div>` : ''}`, true);
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
    <div class="pills" style="margin-bottom:10px">${s.fields.map((f) => `<span class="pill">${wareMark(f.ware, 8)}${esc(WARES[f.ware].name)}${f.richness > 1.05 ? ' ↑' : ''}</span>`).join('')}</div>` : '<p class="small muted" style="margin:0 0 10px">Erwirb Baulizenzen in Nachbarsektoren, um weiter vorzudringen.</p>'}
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
    <div class="card-head"><div class="emblem">${icon('plus', 22)}</div><div style="flex:1;min-width:0"><h2>Neue Station</h2><p>Bauplatz ${fmtCr(PLOT_COST)} + Baulager ${fmtCr(BUILD_STORAGE_COST)} · gesamt <b class="num">${fmtCr(cost)}</b></p></div>
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
    case 'blueprints': return blueprintsPanel(state, ui, p);
    case 'planner': return sheet('Stationsplaner', 'Produktionsketten nach X4', plannerPanel(state, ui));
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
      <div class="pills" style="margin-top:6px">${st.build ? `<span class="pill amber">${icon('wrench', 13)} Bau ${pct(buildProgress(st))}</span>` : ''}
      ${alerts.length ? `<span class="pill amber">${icon('warn', 13)} ${alerts.length} Hinweis${alerts.length === 1 ? '' : 'e'}</span>` : `<span class="pill teal">${icon('check', 13)} ${pct(productionUtil(st))} Auslastung</span>`}</div></div>
      ${icon('chev', 20, 'chev')}</div>`;
  }).join('');
  return sheet('Stationen', `${state.stations.length} Station${state.stations.length === 1 ? '' : 'en'}`, `
    <div class="section"><div class="box rows">${list}</div></div>
    <div class="section"><div class="box rows">${blueprintEntry(state)}</div></div>
    <button class="btn outline-teal block" ${act('place-start')}>${icon('plus', 20)}Neue Station gründen · ${fmtCr(stationCost())}</button>`);
}

function stationPanel(state: GameState, st: Station, p: Panel): string {
  const tab = p.tab ?? 'overview';
  const yardTab = hasYard(st) || !!st.yard?.queue.length || st.queue.some((q) => MODULE_MAP[q.def]?.kind === 'shipyard') || MODULE_MAP[st.build?.def ?? '']?.kind === 'shipyard';
  const tabList = [['overview', yardTab ? 'Info' : 'Übersicht'], ['modules', 'Module'], ['storage', 'Lager'], ['ships', 'Schiffe'], ...(yardTab ? [['yard', 'Werft']] : [])];
  const tabs = `<div class="tabs">${tabList.map(([t, l]) => `<button class="${tab === t ? 'active' : ''}" ${act('station-tab', { tab: t })}>${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'overview') body = stationOverview(state, st);
  else if (tab === 'modules') body = stationModules(state, st);
  else if (tab === 'storage') body = stationStorage(state, st);
  else if (tab === 'yard') body = stationYard(state, st);
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
      <div class="right"><b>${tw(u, 'pct')}</b><div class="small muted">Auslastung</div></div></div>`;
  }).join('');
  const balance = Object.entries(rates).sort((a, b) => (b[1].prod - b[1].use) - (a[1].prod - a[1].use)).map(([id, r]) => {
    const net = r.prod - r.use;
    return `<div class="row">${wareMark(id)}<div class="grow"><div class="title" style="font-weight:500">${esc(WARES[id].name)}</div><div class="sub">+${fmtInt(r.prod)} / −${fmtInt(r.use)} pro h</div></div>
      <div class="right"><b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${fmtInt(Math.abs(net))}</b></div></div>`;
  }).join('');
  const stor = storageUse(st).map((s) => `<div><small>${STORAGE_LABEL[s.type]}</small><b>${s.cap ? pct(s.used / s.cap) : '—'}</b>${bar(s.cap ? s.used / s.cap : 0, s.type === 'Liquid' ? 'blue' : s.type === 'Solid' ? 'solid' : '')}<div class="small muted" style="margin-top:4px">${fmtAmount(s.used)} / ${fmtAmount(s.cap)} m³</div></div>`).join('');
  const shipCount = state.ships.filter((s) => s.home === st.id).length;
  return `
    ${alerts.length ? `<div class="section"><div class="box rows">${alerts.map((a) => `<div class="row">${icon('warn', 20, a.severity === 'bad' ? 'neg' : 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">${esc(a.text.split(': ').slice(1).join(': '))}</div>${a.ware ? `<div class="sub wrap">${esc(hintFor(state, st, a.ware))}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
    <div class="section"><div class="kv">
      <div><small>Auslastung</small><b>${tw(util, 'pct')}</b></div>
      <div><small>Wertschöpfung</small><b>${fmtCr(stationOutputValue(st))}/h</b></div>
      <div><small>Umsatz gesamt</small><b class="pos">${tw(st.income, 'cr')}</b></div>
      <div><small>Einkauf gesamt</small><b>${tw(st.expenses, 'cr')}</b></div>
      <div><small>Module</small><b>${st.modules.length}${st.build || st.queue.length ? ` <span class="small muted">+${(st.build ? 1 : 0) + st.queue.length}</span>` : ''}</b></div>
      <div><small>Schiffe</small><b>${shipCount}</b></div>
    </div></div>
    ${stationTrends(state, st)}
    <div class="section"><h3>Produktion</h3>${prodRows ? `<div class="box rows">${prodRows}</div>` : `<div class="box empty">Noch keine Produktionsmodule.<br><button class="btn primary small" ${act('modal-modules', { st: st.id, cat: 'production' })}>${icon('plus', 18)}Modul einplanen</button></div>`}</div>
    ${balance ? `<div class="section"><h3>Stundenbilanz bei voller Leistung</h3><div class="box rows">${balance}</div></div>` : ''}
    <div class="section"><h3>Lager</h3><div class="kv" style="grid-template-columns:repeat(3,minmax(0,1fr))">${stor}</div></div>
    <div class="section card-actions"><button class="btn" ${act('plan-from-station', { st: st.id })}>${icon('planner', 18)}Im Planer prüfen</button><button class="btn ghost" ${act('rename-modal', { st: st.id })}>Umbenennen</button></div>`;
}

/** Verlaufskachel mit Beschriftung (leer, solange zu wenig Daten da sind) */
function trendCell(state: GameState, spec: ChartSpec): string {
  const sp = sparkline(state, spec, 120, 28);
  return sp ? `<div class="trend"><small>${esc(spec.title)}${spec.kind === 'rate' ? ' / h' : ''}</small>${sp}</div>` : '';
}

function trendSection(cells: string[]): string {
  const t = cells.join('');
  return t ? `<div class="section"><h3>Verlauf (6 h) · antippen für Details</h3><div class="trends">${t}</div></div>` : '';
}

/** Verlauf einer Station: Einnahmen, Ausgaben und Auslastung */
function stationTrends(state: GameState, st: Station): string {
  return trendSection([
    trendCell(state, { key: H.income(st.id), title: 'Einnahmen', sub: st.name, color: '#5fe08a', kind: 'rate', unit: 'cr' }),
    trendCell(state, { key: H.expenses(st.id), title: 'Ausgaben', sub: st.name, color: '#ff9b62', kind: 'rate', unit: 'cr' }),
    trendCell(state, { key: H.util(st.id), title: 'Auslastung', sub: st.name, color: '#3fe0c5', kind: 'level', unit: 'pct' }),
  ]);
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

function stationYard(state: GameState, st: Station): string {
  const sizes = yardSizes(st);
  if (!sizes.size && hasYard(st)) {
    return `<div class="section"><div class="box empty">Die XL-Schiffsfertigung baut Träger und Schlachtschiffe – die kommen mit den Kampfschiffen. Für Miner und Frachter brauchst du eine S/M- oder L-Schiffsfertigung.<br>
      <button class="btn primary small" ${act('modal-modules', { st: st.id, cat: 'shipyard' })}>${icon('yard', 18)}Werftmodul einplanen</button></div></div>`;
  }
  if (!sizes.size) {
    return `<div class="section"><div class="box empty">Diese Station hat noch keine Schiffsfertigung. Sobald das Werftmodul fertig ist, baust du hier Schiffe aus eigenen Waren.<br>
      <button class="btn primary small" ${act('modal-modules', { st: st.id, cat: 'shipyard' })}>${icon('yard', 18)}Werftmodul einplanen</button></div></div>`;
  }
  const y = st.yard;
  const orderOf = (id?: number) => (id ? state.shipOrders?.find((o) => o.id === id) : undefined);
  const jobLabel = (order?: number) => {
    const o = orderOf(order);
    return o ? `Bestellung ${FACTIONS[o.faction].short} · ${fmtCr(o.price)} · Frist ${fmtDur(o.deadline - state.time)}` : 'Für die eigene Flotte';
  };
  const current = y?.build ? (() => {
    const c = SHIP_MAP[y.build.cls];
    const f = 1 - y.build.remaining / y.build.total;
    return `<div class="row build-row locked">${icon('yard', 20, 'muted')}<div class="grow"><div class="title">${esc(c.name)}</div>
      <div class="sub wrap">${esc(jobLabel(y.build.order))}</div>
      <div class="eta-line"><b class="num">Fertig in ${fmtDur(y.build.remaining)}</b><span class="num">${pct(f)}</span></div>${bar(f, 'amber')}</div></div>`;
  })() : '';
  // Voraussichtliche Fertigstellung der Warteschlange (der Reihe nach, sofern Material da ist)
  let etaAcc = y?.build ? y.build.remaining : 0;
  const rows = (y?.queue ?? []).map((j, i) => {
    const c = SHIP_MAP[j.cls];
    const lack = missingFor(st, j.cls);
    const waiting = i === 0 && !y!.build && y!.waiting;
    etaAcc += SHIP_BUILD_TIME[c.size];
    const missing = Object.keys(lack).length > 0;
    return `<div class="row" data-key="yq${j.uid}"><span class="pos-no num">${i + 1}</span><div class="grow"><div class="title">${esc(c.name)}</div>
      <div class="sub wrap">${esc(jobLabel(j.order))}</div>
      <div class="sub wrap">${missing ? 'Fertig frühestens in ' : 'Voraussichtlich fertig in '}<b class="num">${fmtDur(etaAcc)}</b>${missing ? ' – sobald das Material da ist' : ''}</div>
      ${waiting ? `<div class="sub wrap warn-text">${esc(y!.waiting!)}</div>` : ''}
      ${Object.keys(lack).length ? `<div class="flow" style="margin-top:6px">${Object.entries(lack).map(([id, n]) => `<span class="io">${wareMark(id, 7)}<b>${fmtAmount(n)}</b>${esc(WARES[id].name)} fehlt</span>`).join('')}</div>` : ''}</div>
      <button class="icon-btn sm ghost-x" ${act('yard-cancel', { st: st.id, uid: j.uid })} aria-label="Aus der Warteschlange entfernen">${icon('close', 16)}</button></div>`;
  }).join('');
  const cards = SHIP_CLASSES.filter((c) => sizes.has(c.size)).map((c) => {
    const mv = materialValue(c.id);
    const mats = Object.entries(c.materials).map(([id, n]) => {
      const have = st.inventory[id] ?? 0;
      return `<span class="io ${have >= n ? '' : 'lack'}">${wareMark(id, 7)}<b>${fmtAmount(n)}</b>${esc(WARES[id].name)}</span>`;
    }).join('');
    return `<div class="module-card box" data-key="yc${c.id}"><span class="ware-tile" style="--c:#8fb7c4">${icon(c.role === 'miner' ? 'miner' : 'trader', 18)}</span>
      <div style="min-width:0"><div class="title" style="font-weight:600">${esc(c.name)}</div><div class="small muted">${c.size} · ${fmtInt(c.capacity)} m³ · ${fmtNum(c.speed, 1)} km/s</div></div>
      <div class="flow" style="grid-column:1/-1">${mats}</div>
      <div class="meta" style="grid-column:1/-1"><span>Vorrat für <b>${Math.floor(Math.min(...Object.entries(c.materials).map(([id, n]) => (st.inventory[id] ?? 0) / n)))}×</b></span><span>Material <b>${fmtCr(mv)}</b></span><span>Kaufpreis <b>${fmtCr(c.price)}</b></span><span>Bauzeit <b>${fmtDur(SHIP_BUILD_TIME[c.size])}</b></span></div>
      <div class="actions"><button class="btn small primary" ${act('yard-build', { st: st.id, cls: c.id })}>${icon('plus', 16)}Bauen</button></div></div>`;
  }).join('');
  return `<div class="section"><h3>Fertigung ${helpBtn('yard')}</h3>
    ${current || rows ? `<div class="box rows">${current}${rows}</div>` : '<div class="box empty">Die Werft ist frei. Wähle unten ein Schiff.</div>'}
    <p class="small muted" style="margin:6px 0 0">Gebaut wird aus dem Lager dieser Station. Die Werft hält ihr Material ständig auf Vorrat – deine Transporter und NPC-Händler liefern laufend nach, nicht erst bei einer Bestellung. Wie viel Platz jedes Material bekommt, stellst du im Lager-Reiter ein; größere Lager (M/L) erlauben mehr Schiffe am Stück.</p></div>
    <div class="section"><h3>Schiff bauen</h3><div style="display:grid;gap:10px">${cards}</div></div>`;
}

/** Hinweis, wenn ein Baumaterial an den Märkten in Reichweite knapp ist */
function scarceNote(state: GameState, st: Station, mats: Record<string, number>): string {
  if (st.autoBuyBuild === false) return '';
  const scarce = Object.entries(mats).filter(([id, n]) => (st.buildStore?.[id] ?? 0) + marketSupply(state, id) < n);
  return scarce.length ? `<div class="sub wrap warn-text">Knapp am Markt: ${scarce.map(([id]) => esc(WARES[id].name)).join(', ')} – eigene Produktion hilft</div>` : '';
}

/** Baulager: was für die ganze Bauliste gebraucht wird, was schon da ist und was unterwegs ist */
function buildStoreBox(state: GameState, st: Station): string {
  const demand = buildDemand(st);
  const store = st.buildStore ?? {};
  const ids = [...new Set([...Object.keys(demand), ...Object.keys(store).filter((id) => store[id] >= 0.5)])].sort((a, b) => WARES[a].name.localeCompare(WARES[b].name, 'de'));
  const own = st.autoBuyBuild === false;
  const rows = ids.map((id) => {
    const need = demand[id] ?? 0;
    const have = store[id] ?? 0;
    const way = need > have ? Math.min(need - have, incoming(state, st.id, id)) : 0;
    const f = need > 0 ? Math.min(1, have / need) : 1;
    const done = have >= need - 0.5;
    const lim = buildMoveLimits(st, id);
    const local = st.inventory[id] ?? 0;
    const canMove = lim.toBuild >= 0.5 || lim.toStation >= 0.5;
    return `<div class="row" data-key="bs-${id}">${wareMark(id, 9)}<div class="grow"><div class="title">${esc(WARES[id].name)}</div>
      <div class="sub wrap ${done ? '' : 'warn-text'}"><b class="num">${fmtAmount(have)}</b> von <b class="num">${fmtAmount(need)}</b> vorhanden${way >= 0.5 ? ` · ${fmtAmount(way)} unterwegs` : ''}${need < have - 0.5 ? ` · ${fmtAmount(have - need)} übrig` : ''}</div>
      ${local >= 0.5 ? `<div class="sub wrap">Im Stationslager: ${fmtAmount(local)}</div>` : ''}${bar(f, done ? '' : 'amber')}</div>
      ${canMove ? `<button class="btn small" ${act('build-move-open', { st: st.id, ware: id })}>Umladen</button>` : ''}</div>`;
  }).join('');
  return `<div class="box buildstore" style="margin-bottom:10px"><div class="row" style="padding-bottom:4px">${icon('box', 20, 'muted')}<div class="grow"><div class="title">Baulager ${helpBtn('buildstore')}</div>
      <div class="sub wrap">Schiffe liefern das Baumaterial hierher – auch ohne Dock. Ware aus dem eigenen Stationslager lädst du mit „Umladen“ selbst hin und her. Fehlt etwas, bleibt der Bau beim erreichten Prozentwert stehen und läuft mit jeder Lieferung weiter.</div></div></div>
    ${rows ? `<div class="rows">${rows}</div>` : '<p class="small muted" style="margin:4px 14px 0">Leer – es wird gerade kein Material gebraucht.</p>'}
    <div style="padding:8px 14px 12px"><label class="check"><input type="checkbox" data-change="auto-buy-build" data-st="${st.id}" ${own ? '' : 'checked'}> NPC-Händler und Markteinkäufe dürfen liefern</label>
    <p class="small muted" style="margin:4px 0 0">${own ? 'Nur eigenes Material: Das Baulager nimmt nur Ware aus deinen Stationen an (eigene Transporter, Lieferreihenfolge, Umladen aus dem Stationslager).' : 'NPC-Händler bringen Material und werden bei Lieferung bezahlt; deine Transporter kaufen es auch am Markt. Eigene Stationen liefern immer mit.'}</p></div></div>`;
}

function stationModules(state: GameState, st: Station): string {
  // Laufender Bau ist fest, geplante Positionen lassen sich verschieben
  let eta = st.build ? st.build.remaining : 0;
  let total = 0;
  const slot = (at: number) => `<div class="insert-slot"><button ${act('modal-modules', { st: st.id, cat: 'production', at })} aria-label="Modul an Position ${at + 1} einfügen" title="Hier einfügen">${icon('plus', 14)}</button></div>`;
  const rows = st.queue.map((x, i) => {
    const d = MODULE_MAP[x.def];
    const startIn = eta;
    eta += d.buildTime;
    total += x.paid > 0 ? 0 : d.cost;
    const lead = d.kind === 'production' && d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(moduleIcon(d.kind), 18)}</span>`;
    return `${slot(i)}<div class="row build-row" data-uid="${x.uid}" data-key="q${x.uid}">
      <button class="drag-handle" data-drag-handle aria-label="Position ${i + 1} verschieben">${icon('more', 18)}</button>
      <span class="pos-no num">${i + 1}</span>${lead}
      <div class="grow"><div class="title two-lines" style="font-weight:600">${esc(d.name)}</div>
        <div class="sub wrap">${x.paid > 0 ? 'bezahlt' : `Material ca. ${fmtCr(d.cost)}`} · ${fmtDur(d.buildTime)} · Start frühestens in ${fmtDur(startIn)}</div>${x.paid > 0 ? '' : scarceNote(state, st, d.materials)}</div>
      <div class="row-tools">
        <button class="icon-btn sm" ${act('q-move', { st: st.id, uid: x.uid, to: i - 1 })} ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">${icon('up', 16)}</button>
        <button class="icon-btn sm" ${act('q-move', { st: st.id, uid: x.uid, to: i + 1 })} ${i === st.queue.length - 1 ? 'disabled' : ''} aria-label="Nach unten">${icon('down', 16)}</button>
      </div>
      <button class="icon-btn sm ghost-x" ${act('cancel-q', { st: st.id, uid: x.uid })} aria-label="Position entfernen">${icon('close', 16)}</button></div>`;
  }).join('');
  const build = st.build ? (() => {
    const b = st.build;
    const d = MODULE_MAP[b.def];
    const f = buildProgress(st);
    const mats = Object.entries(d.materials);
    const lack = b.paid > 0 ? [] : mats.filter(([id, n]) => (b.used?.[id] ?? 0) < n - 0.5 && (st.buildStore?.[id] ?? 0) < 0.5);
    const status = st.waiting === 'material'
      ? `<div class="sub wrap warn-text">Bau ${pct(f)} · wartet auf ${esc(lack.map(([id]) => WARES[id].name).join(', ') || 'Material')}</div>`
      : `<div class="sub">Bau ${pct(f)} · noch ca. ${fmtDur(b.remaining)}</div>`;
    const chips = b.paid > 0 ? '' : `<div class="flow" style="margin-top:6px">${mats.map(([id, n]) => {
      const used = Math.min(n, b.used?.[id] ?? 0);
      return `<span class="io ${lack.some(([x]) => x === id) ? 'lack' : ''}">${wareMark(id, 7)}<b class="num">${fmtAmount(used)}/${fmtAmount(n)}</b>${esc(WARES[id].name)}</span>`;
    }).join('')}</div>`;
    return `<div class="row build-row locked">${icon('lock', 18, 'muted')}${d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(moduleIcon(d.kind), 18)}</span>`}
      <div class="grow"><div class="title two-lines">${esc(d.name)}</div>${status}</div>
      <button class="icon-btn sm ghost-x" ${act('cancel-build', { st: st.id })} aria-label="Bau abbrechen" title="Bau abbrechen – verbautes Material geht ins Baulager zurück">${icon('close', 16)}</button>
      <div class="build-detail">${chips}${bar(f, 'amber')}</div></div>`;
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
    const lead = d.kind === 'production' && d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(moduleIcon(d.kind), 18)}</span>`;
    const sub = d.kind === 'production' ? `${pct(g.util / g.n)} Auslastung` : d.kind === 'storage' ? `${fmtInt((d.capacity ?? 0) * g.n)} m³ ${STORAGE_LABEL[d.storage!]}` : d.kind === 'habitat' ? `${fmtInt((d.housing ?? 0) * g.n)} Bewohner` : d.kind === 'dock' ? 'M- und S-Schiffe' : d.kind === 'pier' ? 'L-Schiffe' : d.kind === 'shipyard' ? (d.yardSize === 'XL' ? 'Für Träger und Schlachtschiffe (kommen mit Kampfschiffen)' : d.yardSize === 'L' ? 'Baut L-Schiffe' : 'Baut S- und M-Schiffe · Dock für S/M') : 'Verbindet alle Module';
    return `<div class="row">${lead}<div class="grow"><div class="title">${esc(d.name)} <span class="muted small">× ${g.n}</span></div><div class="sub wrap">${esc(sub)}</div></div>
      ${d.kind !== 'core' ? `<button class="icon-btn" ${act('ask-demolish', { st: st.id, uid: g.uids[g.uids.length - 1] })} aria-label="Modul abreißen">${icon('trash', 18)}</button>` : ''}</div>`;
  }).join('');
  const needDock = !hasDockFor(st, 'M') && !st.queue.some((q) => q.def === 'dock_m') && st.build?.def !== 'dock_m';
  const cap = storageCap(st);
  const isContainer = (def?: string) => !!def && MODULE_MAP[def]?.kind === 'storage' && MODULE_MAP[def]?.storage === 'Container';
  const needStore = !cap.Container && !st.queue.some((q) => isContainer(q.def)) && !isContainer(st.build?.def);
  const summary = st.queue.length ? `<p class="small muted" style="margin:0 0 8px">${st.queue.length} Position${st.queue.length === 1 ? '' : 'en'} geplant · Material ca. ${fmtCr(total)} · reine Bauzeit ${fmtDur(eta)}.</p>` : '';
  return `
    <div class="section"><h3>Baureihenfolge ${helpBtn('buildstore')}</h3>
    <div class="card-actions" style="margin-bottom:10px"><button class="btn primary small" ${act('modal-modules', { st: st.id, cat: 'production' })}>${icon('plus', 16)}Modul einplanen</button><button class="btn small" ${act('plan-station', { st: st.id })}>${icon('planner', 16)}Fließdiagramm</button>${blueprintEntry(state, true)}${canUndo() ? `<button class="btn small" ${act('undo')} title="${esc(undoLabel())}">${icon('undo', 16)}Rückgängig</button>` : ''}</div>
    ${summary}
    ${buildStoreBox(state, st)}
    ${build || rows ? `<div class="box build-list" data-draglist data-st="${st.id}">${build}${rows}${rows ? slot(st.queue.length) : ''}</div>
      <p class="small muted" style="margin:6px 0 0">Am Griff ${icon('more', 12, 'inline')} ziehen oder mit den Pfeilen umsortieren. ${icon('plus', 12, 'inline')} zwischen zwei Positionen fügt dort ein Modul ein. Das laufende Modul ist fest.</p>` : `<div class="box empty">Keine Positionen geplant. Plane Module ein – sie werden der Reihe nach aus dem Material im Baulager gebaut.</div>`}</div>
    ${needDock || needStore ? `<div class="section"><div class="box rows">
      ${needDock ? `<div class="row">${icon('warn', 20, 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">Ohne Dock beliefern Schiffe nur das Baulager – Handel und Miner brauchen ein Dock.</div></div><button class="btn small amber" ${act('queue', { st: st.id, def: 'dock_m', at: 0 })}>Dock zuerst</button></div>` : ''}
      ${needStore ? `<div class="row">${icon('warn', 20, 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">Energiezellen und Produkte brauchen ein Containerlager.</div></div><button class="btn small amber" ${act('queue', { st: st.id, def: bestStorage(state, 'Container'), at: 0 })}>Lager zuerst</button></div>` : ''}
    </div></div>` : ''}
    <div class="section"><h3>Gebaute Module</h3>${built ? `<div class="box rows">${built}</div>` : '<div class="box empty">Noch nichts gebaut.</div>'}</div>`;
}

/** Lieferreihenfolge: wohin die Transporter dieser Station Überschüsse zuerst bringen */
function deliveryPrioBox(state: GameState, st: Station): string {
  const prio = (st.deliveryPrio ?? []).map((id) => stationById(state, id)).filter((x): x is Station => !!x);
  const others = state.stations.filter((x) => x.id !== st.id && !prio.includes(x));
  const surplusWares = stationWares(st).filter((id) => tradeRule(st, id).sell && (st.inventory[id] ?? 0) >= 1);
  const needs = (o: Station) => surplusWares.filter((id) => wanted(state, o, id) >= 1).map((id) => WARES[id].name);
  const rows = prio.map((o, i) => {
    const n = needs(o);
    return `<div class="row" data-key="prio-${o.id}"><span class="pos-no num">${i + 1}</span>${icon(hasYard(o) ? 'yard' : 'station', 18, 'muted')}
      <div class="grow"><div class="title two-lines">${esc(o.name)}</div><div class="sub wrap">${n.length ? 'braucht: ' + esc(n.join(', ')) : 'braucht gerade nichts von hier'}</div></div>
      <div class="row-tools"><button class="icon-btn sm" ${act('prio-move', { st: st.id, id: o.id, d: -1 })} ${i === 0 ? 'disabled' : ''} aria-label="Höher">${icon('up', 16)}</button>
      <button class="icon-btn sm" ${act('prio-move', { st: st.id, id: o.id, d: 1 })} ${i === prio.length - 1 ? 'disabled' : ''} aria-label="Tiefer">${icon('down', 16)}</button></div>
      <button class="icon-btn sm ghost-x" ${act('prio-remove', { st: st.id, id: o.id })} aria-label="Aus der Reihenfolge nehmen">${icon('close', 16)}</button></div>`;
  }).join('');
  const last = `<div class="row locked"><span class="pos-no num">${prio.length + 1}</span>${icon('market', 18, 'muted')}<div class="grow"><div class="title">Verkauf zum besten Preis</div><div class="sub wrap">Märkte, NPC-Käufer, Aufträge${prio.length ? ' und nicht eingetragene Stationen' : ' und eigene Stationen – je nach Ertrag'}</div></div></div>`;
  const add = others.length ? `<select class="prio-add" data-change="prio-add" data-st="${st.id}" aria-label="Station hinzufügen"><option value="">+ Station hinzufügen …</option>${others.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>` : '';
  const noTrader = state.ships.some((x) => x.home === st.id && SHIP_MAP[x.cls].role === 'trader') ? '' : ' <span class="warn-text">Diese Station hat noch keinen eigenen Transporter.</span>';
  return `<div class="section"><h3>Lieferreihenfolge für Überschüsse ${helpBtn('trade')}</h3><div class="box rows">${rows}${last}</div>${add}
    <p class="small muted" style="margin:6px 0 0">Die Transporter dieser Station beliefern die Stationen der Reihe nach. Kann eine Station weniger als eine halbe Ladung abnehmen, rutschen sie eine Stufe tiefer – zuletzt wird zum besten Preis verkauft.${noTrader}</p>
    ${prio.length ? `<div class="box" style="padding:12px 14px;margin-top:10px"><label class="check"><input type="checkbox" data-change="prio-npc" data-st="${st.id}" ${st.prioBeforeNpc ? 'checked' : ''}> NPC-Händler erst kaufen lassen, wenn diese Stationen versorgt sind</label>
      <p class="small muted" style="margin:6px 0 0">Ohne Haken kaufen NPC-Händler an dieser Station alles, was zum Verkauf freigegeben ist. Mit Haken bekommen sie eine Ware erst, wenn keine Station der Reihenfolge mehr eine halbe Ladung davon braucht – so geht z. B. jedes Hüllenteil zuerst an die Werft und erst der Rest an NPC-Händler.${st.prioBeforeNpc && noTrader ? ' <span class="warn-text">Ohne eigenen Transporter holt nur ein Transporter der Zielstation die Ware ab.</span>' : ''}</p></div>` : ''}</div>`;
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
    const share = storageShare(st, id, wl);
    const reserve = reserveFor(st, id, limit);
    const spark = sparkline(state, { key: H.stock(st.id, id), title: `${w.name} im Lager`, sub: st.name, color: w.color, kind: 'level', unit: 'units' });
    return `<div class="row" data-key="${id}">${wareTile(id)}<div class="grow"><div class="title-line"><div class="title two-lines" style="font-weight:500">${esc(w.name)}</div>${spark}</div>
      <div class="sub wrap">${tw(have, 'amount')} / ${fmtAmount(limit)} · ${Math.round(share.share * 100)} %${share.auto ? ' auto' : ''}${reserve ? ` · Reserve ${fmtAmount(reserve)}` : ''}</div>${bar(limit ? have / limit : 0, w.storage === 'Liquid' ? 'blue' : w.storage === 'Solid' ? 'solid' : '')}
      <div class="row-links"><button class="linkish" ${act('storage-open', { st: st.id, ware: id })}>Lager einstellen</button>${have >= 1 && w.storage === 'Container' ? `<button class="linkish" ${act('sell-open', { st: st.id, ware: id })}>Verkaufen …</button>` : ''}</div></div>
      <div class="toggle"><button class="buy ${rule.buy ? 'on' : ''}" ${act('trade-toggle', { st: st.id, ware: id, k: 'buy' })} aria-pressed="${rule.buy}">Kauf</button><button class="sell ${rule.sell ? 'on' : ''}" ${act('trade-toggle', { st: st.id, ware: id, k: 'sell' })} aria-pressed="${rule.sell}">Verkauf</button></div></div>`;
  }).join('');
  return `<p class="lead">Kauf: Händler und deine Transporter liefern an. Verkauf: Überschüsse werden abgegeben, die Reserve bleibt für die eigene Produktion.</p>
    ${deliveryPrioBox(state, st)}
    <div class="section"><h3>Waren im Lager ${helpBtn('storage')}</h3><div class="box rows">${rows || '<div class="empty">Das Lager ist leer.</div>'}</div></div>
    <p class="small muted">Ohne Einstellung teilen sich alle Waren einer Lagerart den Platz gleichmäßig („auto“). Eingestellte Anteile gehen vor, der Rest wird verteilt.</p>`;
}

function shipRow(_state: GameState, s: Ship): string {
  const c = SHIP_MAP[s.cls];
  return `<div class="row tap" ${act('open-ship', { id: s.id })} data-key="${s.id}">
    <span class="ware-tile" style="--c:${c.role === 'miner' ? '#ffc45e' : '#5ff0d8'}">${icon(c.role === 'miner' ? 'miner' : 'trader', 18)}</span>
    <div class="grow"><div class="title">${esc(s.name)}</div><div class="sub wrap"><span class="muted">${esc(c.name)}</span> · ${esc(s.status)}${s.cargo ? ` · ${fmtAmount(s.cargo.amount)} ${esc(WARES[s.cargo.ware].name)}` : ''}</div></div>
    ${icon('chev', 20, 'chev')}</div>`;
}

const REST_LABEL: Record<RestAction, string> = { auto: 'Automatisch', topup: 'Nachfüllen', sell: 'Verkaufen', wait: 'Warten' };
const REST_HELP: Record<RestAction, string> = {
  auto: 'Rechnet bei jeder Restladung selbst: Wird dieselbe Ware weiter gebraucht, füllt er nach. Braucht die Station dringender etwas anderes, wartet er kurz oder verkauft – je nachdem, was schneller ist. Bleibt zweimal in Folge ein Rest, verkauft er (Überförderung).',
  topup: 'Der Rest bleibt an Bord, der Miner baut nur den freien Laderaum ab und bringt beim nächsten Mal eine volle Ladung. Kostet keine Zeit, bindet ihn aber an diese Ware.',
  sell: 'Der Rest wird immer beim besten erreichbaren Käufer verkauft. Macht den Miner zur kleinen Geldquelle, kostet aber einen Umweg.',
  wait: 'Der Miner wartet am Dock, bis der Verbrauch Platz macht. Fördert auch nicht für den Markt, wenn alles voll ist.',
};

/** Kurze Zeiten sekundengenau (m:ss), damit sich die Wege vergleichen lassen */
function fmtSecs(sec: number): string {
  if (sec >= 600) return fmtDur(sec);
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} min`;
}

/** Restladung: Einstellung und Fallbetrachtung der letzten Entscheidung */
function restSection(state: GameState, s: Ship): string {
  const mode = restMode(s);
  const pills = (Object.keys(REST_LABEL) as RestAction[]).map((k) => `<button class="pill ${mode === k ? 'teal' : ''}" ${act('miner-rest', { id: s.id, v: k })}>${REST_LABEL[k]}</button>`).join('');
  const c = s.lastRest;
  let casebox = '<p class="small muted" style="margin:8px 0 0">Noch keine Restladung – das Lager hatte bisher immer Platz.</p>';
  if (c) {
    const w = WARES[c.ware];
    const opt = (k: RestCase['choice'], label: string, cost: string | null, note = '') => `<div class="rest-opt ${c.choice === k ? 'on' : ''} ${cost == null ? 'off' : ''}">
      <span class="rest-k">${c.choice === k ? icon('check', 14) : ''}${label}</span><span class="rest-v">${cost ?? 'nicht möglich'}</span>${note ? `<span class="rest-n">${note}</span>` : ''}</div>`;
    casebox = `<div class="rest-case">
      <div class="small muted">Letzte Restladung · vor ${fmtDur(Math.max(0, state.time - c.t))}</div>
      <div class="rest-head">${wareMark(w.id, 9)}<b>${fmtAmount(c.amount)} ${esc(w.name)}</b> → <b class="pos">${REST_LABEL[c.choice]}</b></div>
      <p class="small" style="margin:4px 0 10px;color:var(--text-2)">${esc(c.reason)}</p>
      ${opt('topup', 'Nachfüllen', c.topup == null ? null : '± 0:00 min', c.topup == null ? '' : `spart ${fmtSecs(c.topupSaves)} Abbau`)}
      ${opt('wait', 'Warten', c.wait == null ? null : `ca. ${fmtSecs(c.wait)}`, c.wait == null ? 'Station verbraucht die Ware nicht' : 'bis der Verbrauch Platz macht')}
      ${opt('sell', 'Verkaufen', c.sell == null ? null : `ca. ${fmtSecs(c.sell)}`, c.sell == null ? 'kein Käufer erreichbar' : `Umweg${c.wait != null ? ' + Menge später neu fördern' : ''} · Erlös ${fmtCr(c.sellValue)}`)}
    </div>`;
  }
  const streak = (s.restStreak ?? 0) >= 2 ? `<p class="small warn-text" style="margin:8px 0 0">${s.restStreak}× in Folge ein Rest: Die Miner dieser Station fördern mehr, als verbraucht wird.</p>` : '';
  return `<div class="section"><h3>Restladung ${helpBtn('miners')}</h3><div class="pills">${pills}</div>
    <p class="small muted" style="margin:8px 0 0">${REST_HELP[mode]}</p>${streak}${casebox}</div>`;
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
      ${wares.map((w) => `<button class="pill ${s.mineWare === w ? 'teal' : ''}" ${act('miner-ware', { id: s.id, ware: w })}>${wareMark(w, 8)}${esc(WARES[w].name)}</button>`).join('')}
    </div><p class="small muted" style="margin-top:8px">${wares.length ? 'Automatisch: fördert, was im Lager am knappsten ist – Rohstoffe, auf die Module warten, zuerst. Mehrere Miner teilen sich die Waren so von selbst auf.' : 'Im Heimatsektor gibt es kein passendes Feld für diesen Miner.'}</p></div>
    ${restSection(state, s)}`;
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
        ? `<p class="small muted">Verkauft Überschüsse der Heimatstation an eigene Stationen, aktive Aufträge oder den besten Markt in der Nähe und kauft fehlende Eingangswaren für sie ein. Die Heimatstation ist immer einer der beiden Handelspartner – für andere Stationen arbeitet er nur über Einzelaufträge oder eine Versorgungslinie.</p>`
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

// ---- Baupläne ----

/** Kaufbare Baupläne (Ruf reicht bei mindestens einem erreichbaren Vertreter) */
export function buyableBlueprints(state: GameState): ModuleDef[] {
  return MODULES.filter((d) => blueprintState(state, d.id) === 'buyable');
}

/** Einstiegszeile zur Baupläne-Übersicht */
function blueprintEntry(state: GameState, compact = false): string {
  const n = buyableBlueprints(state).length;
  if (compact) return `<button class="btn small" ${act('open-blueprints')}>${icon('lock', 16)}Baupläne${n ? ` <span class="count">${n}</span>` : ''}</button>`;
  return `<div class="row tap" ${act('open-blueprints')}><span class="ware-tile" style="--c:#ffb547">${icon('lock', 18)}</span><div class="grow"><div class="title">Baupläne</div>
    <div class="sub wrap">${n ? `${n} bei Vertretern kaufbar` : 'Mehr Ruf schaltet weitere frei'} · ${state.blueprints.length} vorhanden</div></div>${n ? `<span class="pill amber">${n}</span>` : ''}${icon('chev', 20, 'chev')}</div>`;
}

/** Kurzbeschreibung eines Moduls für Listen */
function moduleDesc(d: ModuleDef): string {
  if (d.kind === 'shipyard') return d.yardSize === 'XL' ? 'Werft · für XL-Schiffe (Träger, Schlachtschiffe)' : d.yardSize === 'L' ? 'Werft · baut L-Schiffe' : 'Werft · baut S- und M-Schiffe';
  if (d.kind === 'habitat') return `Wohnen · ${d.housing} Bewohner`;
  if (!d.ware) return '';
  const w = WARES[d.ware];
  const race = raceOf(d);
  return `${GROUP_LABEL[w.group]} · Stufe ${w.tier}${race !== 'split' ? ' · ' + RACE_LABEL[race] : ''}`;
}

/** Wo es den Bauplan gibt – mit Hinfliegen zum nächsten erreichbaren Vertreter */
function vendorLine(state: GameState, d: ModuleDef): string {
  const vs = vendorsFor(d.id);
  if (!vs.length) return '<span class="small muted">Nicht käuflich</span>';
  const reach = vs.filter((v) => vendorOffer(state, v, d.id) !== 'far');
  const places = vs[0].role === 'Handelsvertreter' ? 'jedem Split-Handelsposten' : vs.map(vendorPlace).join(', ');
  const go = reach[0] ?? null;
  return `<span class="small muted" style="flex:1;min-width:0">Bei ${esc(places)}</span>${go ? `<button class="btn small" style="flex:none" ${act('goto-vendor', { id: go.id })}>${icon('arrowRight', 15)}Hinfliegen</button>` : '<span class="small muted" style="flex:none">noch außer Reichweite</span>'}`;
}

function blueprintsPanel(state: GameState, ui: UIState, p: Panel): string {
  const tab = p.tab ?? 'buy';
  const q = ui.search.blueprints ?? '';
  const all = MODULES.filter((d) => d.kind === 'production' || d.kind === 'shipyard');
  const pick = (st: string) => all.filter((d) => blueprintState(state, d.id) === st && matches(q, d.name, d.ware && WARES[d.ware].name, moduleDesc(d))).sort(byName);
  const buy = pick('buyable'), locked = pick('locked'), owned = pick('owned');
  const tabs = `<div class="tabs">${([['buy', 'Kaufbar', buy.length], ['locked', 'Gesperrt', locked.length], ['owned', 'Eigene', owned.length]] as const).map(([t, l, n]) => `<button class="${tab === t ? 'active' : ''}" ${act('station-tab', { tab: t })}>${l} <span class="tab-n">${n}</span></button>`).join('')}</div>`;
  const row = (d: ModuleDef) => {
    const bp = blueprintState(state, d.id);
    const lead = d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(moduleIcon(d.kind), 18)}</span>`;
    const best = bestRepFor(state, d.id);
    const right = bp === 'owned' ? `<span class="pill teal">${icon('check', 13)}</span>`
      : bp === 'buyable' ? `<b class="small" style="white-space:nowrap">${fmtCr(d.blueprintCost)}</b>`
      : `<span class="pill">${icon('lock', 13)} Ruf ${d.repRequired} ${FACTIONS[best.faction].short}</span>`;
    return `<div class="row" data-key="bp-${d.id}" style="flex-wrap:wrap">${lead}<div class="grow"><div class="title two-lines">${esc(d.name)}</div><div class="sub wrap">${esc(moduleDesc(d))}${d.ware ? ` · ${fmtAmount(outputPerHour(d.ware))}/h` : ''}</div></div>
      <div style="width:100%;display:flex;gap:8px;align-items:center;margin-top:8px">${right}${bp === 'owned' ? '' : vendorLine(state, d)}</div></div>`;
  };
  const list = tab === 'buy' ? buy : tab === 'locked' ? locked : owned;
  const empty = q ? `Nichts gefunden für „${esc(q)}“.` : tab === 'buy' ? 'Gerade nichts kaufbar – mehr Ruf oder neue Sektoren schalten Vertreter frei.' : tab === 'locked' ? 'Alle Baupläne freigeschaltet.' : 'Noch keine gekauften Baupläne.';
  const head = `<div class="section"><div class="kv">${(['frf', 'zya'] as const).map((f) => `<div><small>Ruf ${esc(FACTIONS[f].short)}</small><b>${fmtNum(state.rep[f], 1)}</b></div>`).join('')}</div>
    <p class="small muted" style="margin:8px 0 0">Baupläne gibt es nur vor Ort: Split-Baupläne bei den Handelsvertretern der Handelsposten, waffennahe Baupläne und Schiffsfertigung bei den Werftvertretern, fremde Bauweisen bei den Gesandtschaften. ${helpBtn('blueprints')} Im freien Planer stehen alle zum Ausprobieren bereit.</p></div>`;
  const body = `${head}${searchBox('blueprints', q, 'Bauplan suchen …')}${list.length ? `<div class="box rows">${list.map(row).join('')}</div>` : `<div class="box empty-search">${empty}</div>`}`;
  return sheet('Baupläne', `${state.blueprints.length} vorhanden`, body, { back: !!p.back, tabs });
}

/** Vertreter an einem Handelsposten oder einer Werft */
function vendorModal(state: GameState, ui: UIState, m: Extract<Modal, { type: 'vendor' }>): string {
  const here = vendorsAt(m.sector, m.npc);
  const v = here.find((x) => x.id === m.vendor) ?? here[0];
  if (!v) return '';
  const q = ui.search.vendor ?? '';
  const place = vendorPlace(v);
  const chooser = here.length > 1 ? `<div class="tabs" style="padding:0 0 12px">${here.map((x) => `<button class="${x.id === v.id ? 'active' : ''}" ${act('vendor-pick', { id: x.id })}>${esc(x.race === 'split' ? x.role : RACE_LABEL[x.race])}</button>`).join('')}</div>` : '';
  const rep = state.rep[v.faction];
  const items = v.sells.map((id) => MODULE_MAP[id]).filter((d) => d && matches(q, d.name, d.ware && WARES[d.ware].name, moduleDesc(d))).sort(byName);
  const rows = items.map((d) => {
    const offer = vendorOffer(state, v, d.id);
    const lack = d.blueprintCost - state.credits;
    const lead = d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(moduleIcon(d.kind), 18)}</span>`;
    const ins = d.ware ? inputsPerHour(d.ware).map((i) => `<span class="io">${wareMark(i.ware, 7)}${esc(WARES[i.ware].name)}</span>`).join('') : '';
    const action = offer === 'owned' ? `<span class="pill teal">${icon('check', 13)} vorhanden</span>`
      : offer === 'buyable' ? `<button class="btn small ${lack > 0 ? 'disabled' : 'amber'}" style="white-space:nowrap" ${act('buy-bp', { def: d.id, vendor: v.id })}>${lack > 0 ? `fehlen ${fmtCr(lack)}` : `Kaufen · ${fmtCr(d.blueprintCost)}`}</button>`
      : `<span class="pill">${icon('lock', 13)} Ruf ${d.repRequired}</span>`;
    return `<div class="row" data-key="vd-${d.id}" style="flex-wrap:wrap">${lead}<div class="grow"><div class="title two-lines">${esc(d.name)}</div><div class="sub wrap">${esc(moduleDesc(d))} · Modul ${fmtCr(d.cost)}</div>
      ${ins ? `<div class="flow" style="margin-top:6px">${ins}</div>` : ''}</div>
      <div style="width:100%;display:flex;justify-content:flex-end;margin-top:8px">${action}</div></div>`;
  }).join('');
  const greet = v.race === 'split'
    ? (v.role === 'Werftvertreter' ? 'Waffen, Schilde, Drohnen – und die Pläne für eine eigene Schiffsfertigung. Nur für Verbündete der Familie.' : 'Die Familien teilen ihr Wissen – mit denen, die ihnen nützen.')
    : `Die ${RACE_LABEL[v.race]} bauen anders. Wer das Vertrauen des Gastgebers genießt, darf ihre Pläne erwerben.`;
  const body = `${chooser}<div class="vendor-head"><span class="ware-tile" style="--c:${FACTIONS[v.faction].color}">${icon('star', 18)}</span><div><b>${esc(v.name)}</b><div class="small muted">${esc(v.role)} · ${esc(place)}</div></div></div>
    <p class="small" style="margin:10px 0 12px;color:var(--text-2)">„${esc(greet)}“ <span class="muted">Dein Ruf bei ${esc(FACTIONS[v.faction].name)}: <b>${fmtNum(rep, 1)}</b></span></p>
    ${searchBox('vendor', q, 'Bauplan suchen …')}
    ${rows ? `<div class="box rows">${rows}</div>` : `<div class="box empty-search">Nichts gefunden für „${esc(q)}“.</div>`}`;
  return modalShell('Baupläne', body, `<button class="btn" ${act('modal-close')}>Fertig</button>`, `${place} · ${fmtCr(state.credits)}`);
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
      ${m.about ? `<p class="about"><b>Wofür?</b> ${esc(m.about)}</p>` : ''}
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
        ${offer ? `<span class="small muted" style="margin-right:auto;align-self:center">läuft ab in ${fmtDur(c.deadline - state.time)}</span><button class="btn small primary" ${act('accept', { id: c.id })}>Annehmen</button>` : `<button class="btn small" ${act('courier-modal', { id: c.id })}>Aus Lager liefern</button>`}
      </div></div>`;
  };
  return sheet('Aufträge', 'Familie Zhin und Nachbarn', `
    <div class="section">${story}</div>
    <div class="section"><h3>Aktive Lieferaufträge</h3>${active.length ? `<div class="box rows">${active.map((c) => contractRow(c, false)).join('')}</div>` : '<div class="box empty">Keine aktiven Aufträge. Transporter im Autohandel liefern automatisch für angenommene Aufträge.</div>'}</div>
    <div class="section"><h3>Angebote</h3>${offers.length ? `<div class="box rows">${offers.map((c) => contractRow(c, true)).join('')}</div>` : '<div class="box empty">Gerade keine Angebote. Neue kommen etwa alle 30–50 Minuten Spielzeit.</div>'}</div>
    ${shipOrdersSection(state)}
    <div class="section"><h3>Ruf</h3><div class="kv">${(['frf', 'zya'] as const).map((f) => `<div><small>${esc(FACTIONS[f].name)}</small><b>${fmtNum(state.rep[f], 1)}</b>${bar(Math.max(0, state.rep[f]) / 30, 'amber')}</div>`).join('')}</div>
    <p class="small muted">Ruf öffnet Baupläne und Baulizenzen. Handel bringt Ruf bis Stufe 10, darüber zählen Aufträge.</p>
    <div class="box rows">${blueprintEntry(state)}</div></div>`);
}

function shipOrdersSection(state: GameState): string {
  const yards = yardStations(state);
  const list = (state.shipOrders ?? []).filter((o) => o.status === 'offer' || o.status === 'active');
  if (!yards.length && !list.length) return '';
  const rows = list.map((o) => {
    const c = SHIP_MAP[o.cls];
    const able = yards.filter((st) => yardSizes(st).has(c.size));
    const tools = o.status === 'active'
      ? `<span class="small muted" style="margin-right:auto;align-self:center">Baut: ${esc(stationById(state, o.station ?? '')?.name ?? '–')} · Frist ${fmtDur(o.deadline - state.time)}</span>`
      : `<span class="small muted" style="margin-right:auto;align-self:center">läuft ab in ${fmtDur(o.deadline - state.time)}</span>${able.length ? able.map((st) => `<button class="btn small primary" ${act('order-accept', { id: o.id, st: st.id })}>${able.length > 1 ? esc(st.name) : 'Annehmen'}</button>`).join('') : `<span class="small warn-text">Braucht ${c.size === 'L' ? 'L' : 'S/M'}-Werft</span>`}`;
    return `<div class="row" data-key="so${o.id}" style="flex-wrap:wrap"><span class="ware-tile" style="--c:#8fb7c4">${icon('yard', 18)}</span><div class="grow"><div class="title">${esc(c.name)}</div>
      <div class="sub wrap">${esc(FACTIONS[o.faction].name)} · Material ca. ${fmtCr(materialValue(c.id))}</div></div>
      <div class="right"><b class="pos">${fmtCr(o.price)}</b><div class="small muted">Ruf +${o.rep}</div></div>
      <div style="width:100%;display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap">${tools}</div></div>`;
  }).join('');
  return `<div class="section"><h3>Schiffsbestellungen ${helpBtn('yard')}</h3>${rows ? `<div class="box rows">${rows}</div>` : '<div class="box empty">Gerade keine Bestellungen. Mit eigener Werft kommen etwa alle 1–2 Stunden neue.</div>'}</div>`;
}

function courierButtons(_state: GameState, contractId?: number): string {
  if (contractId == null) return '';
  return `<button class="btn small block" style="margin-bottom:8px" ${act('courier-modal', { id: contractId })}>${icon('trader', 18)}Aus eigenem Lager liefern</button>`;
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
      ${sparkline(state, { key: H.price(secId, id), title: `Preis ${w.name}`, sub: SECTOR_MAP[secId].tradeStation.name, color: w.color, kind: 'level', unit: 'price' }, 52, 22)}
      <div class="right"><b>${tw(price)} Cr</b><div class="small ${rel > 0.05 ? 'pos' : rel < -0.05 ? 'neg' : 'muted'}">${rel >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(rel * 100))} %</div></div></div>`;
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
    <div class="flow">${w.inputs.length ? w.inputs.map((i) => `<span class="io">${wareMark(i.ware, 8)}<b>${fmtInt(i.amount)}</b> ${esc(WARES[i.ware].name)}</span>`).join('<span class="arrow">+</span>') : '<span class="io">Sonnenlicht</span>'}
    <span class="arrow">${icon('arrowRight', 18)}</span><span class="io" style="border-color:${w.color}">${wareMark(w.id, 8)}<b>${fmtInt(w.batch)}</b> ${esc(w.name)}</span></div>
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
  const prices = known.map((sec) => `<div class="row"><div class="grow"><div class="title" style="font-weight:500">${esc(SECTOR_MAP[sec].tradeStation.name)}</div><div class="sub">${esc(SECTOR_MAP[sec].name)} · Bestand ${fmtAmount(marketStock(state, sec, id))}</div></div><div class="right"><b>${fmtInt(marketPrice(state, sec, id))} Cr</b></div></div>`
    + SECTOR_MAP[sec].npcStations.filter((n) => n.buys.includes(id)).map((n) => `<div class="row"><div class="grow"><div class="title" style="font-weight:500">${esc(n.name)}</div><div class="sub">${esc(SECTOR_MAP[sec].name)} · kauft noch ${fmtAmount(marketRoom(state, n.id, id))}</div></div><div class="right"><b>${fmtInt(marketPrice(state, n.id, id))} Cr</b></div></div>`).join('')).join('');
  return sheet(w.name, `${GROUP_LABEL[w.group]} · Stufe ${w.tier}`, `
    <div class="section"><div class="kv">
      <div><small>Ø-Preis</small><b>${fmtInt(w.price.avg)} Cr</b></div><div><small>Spanne</small><b style="font-size:15px">${fmtInt(w.price.min)} – ${fmtInt(w.price.max)}</b></div>
      <div><small>Volumen</small><b>${w.volume} m³</b></div><div><small>Lager</small><b style="font-size:15px">${esc(STORAGE_LABEL[w.storage])}</b></div>
    </div>${w.estimated ? '<p class="small muted">Preis geschätzt – nicht im Datensatz.</p>' : ''}</div>
    ${recipe}${module}
    ${producible(id) ? `<div class="section"><button class="btn outline-teal block" ${act('plan-from-ware', { ware: id })}>${icon('planner', 20)}Im Stationsplaner öffnen</button></div>` : ''}
    ${users.length ? `<div class="section"><h3>Wird verbraucht für</h3><div class="pills">${users.map((u) => `<button class="pill" ${act('open-ware', { id: u })}>${wareMark(u, 8)}${esc(WARES[u].name)}</button>`).join('')}</div></div>` : ''}
    <div class="section"><h3>Käufer und Preise in bekannten Sektoren</h3><div class="box rows">${prices}</div></div>`, { back: !!p.back });
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
      <div><small>Unternehmenswert</small><b>${tw(worth, 'cr')}</b></div><div><small>Spielzeit</small><b style="font-size:15px">${fmtClock(state.time)}</b></div>
      <div><small>Verkäufe gesamt</small><b class="pos">${fmtCr(state.totals.sold)}</b></div><div><small>Einkäufe gesamt</small><b>${fmtCr(state.totals.bought)}</b></div>
      <div><small>Stationen</small><b>${state.stations.length}</b></div><div><small>Schiffe</small><b>${state.ships.length}</b></div>
    </div></div>
    ${trendSection([
      trendCell(state, { key: H.worth, title: 'Unternehmenswert', color: '#ffd36b', kind: 'level', unit: 'cr' }),
      trendCell(state, { key: H.credits, title: 'Guthaben', color: '#3fe0c5', kind: 'level', unit: 'cr' }),
    ])}
    <div class="section"><div class="box rows">${blueprintEntry(state)}</div></div>
    <div class="section"><h3>Spielstand</h3><div class="box rows">
      <div class="row">${icon('save', 20)}<div class="grow"><div class="title" style="font-weight:500">Automatisch gespeichert</div><div class="sub wrap">${esc(ui.saveStatus || 'Auf diesem Gerät')}</div></div></div>
      <div class="row tap" ${act('export')}>${icon('box', 20)}<div class="grow"><div class="title" style="font-weight:500">Spielstand sichern</div><div class="sub">Als Text kopieren</div></div>${icon('chev', 20, 'chev')}</div>
      <div class="row tap" ${act('import-modal')}>${icon('down', 20)}<div class="grow"><div class="title" style="font-weight:500">Spielstand laden</div><div class="sub">Gesicherten Text einfügen</div></div>${icon('chev', 20, 'chev')}</div>
      <div class="row tap" ${act('ask-newgame')}>${icon('trash', 20, 'neg')}<div class="grow"><div class="title neg" style="font-weight:500">Neues Spiel</div><div class="sub">Löscht den aktuellen Spielstand</div></div></div>
    </div></div>
    <div class="section"><h3>Hilfe</h3>${helpList()}
      <div class="box rows" style="margin-top:8px"><div class="row tap" ${act('coach-restart')}>${icon('target', 20)}<div class="grow"><div class="title" style="font-weight:500">Erste Schritte zeigen</div><div class="sub wrap">${state.help?.coachOff ? 'Ausgeblendet – hier wieder einschalten' : 'Geführte Hinweise für den Einstieg'}</div></div>${icon('chev', 20, 'chev')}</div></div></div>
    <div class="section"><h3>Einstellungen</h3><div class="box rows"><div class="row"><div class="grow"><div class="title" style="font-weight:500">Handelsrouten auf der Karte</div><div class="sub">Flugwege und feste Versorgungsrouten deiner Schiffe</div></div>
      <div class="toggle"><button class="plain ${ui.routes ? 'on' : ''}" ${act('layer-toggle', { layer: 'routes' })}>${ui.routes ? 'An' : 'Aus'}</button></div></div>
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Warenflüsse auf der Karte</div><div class="sub">Gelieferte Mengen pro Stunde zwischen Stationen, Märkten und Feldern</div></div>
      <div class="toggle"><button class="plain ${ui.flows ? 'on' : ''}" ${act('layer-toggle', { layer: 'flows' })}>${ui.flows ? 'An' : 'Aus'}</button></div></div>
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Beschriftung auf der Karte</div>
        <div class="sub">${ui.labelDensity <= 20 ? 'Wenig – Namen erst beim Heranzoomen' : ui.labelDensity >= 80 ? 'Viel – fast alles schon von Weitem' : 'Mittel – Wichtiges zuerst, Rest beim Zoomen'}</div>
        <div class="range-row"><span class="small muted">wenig</span><input type="range" min="0" max="100" step="5" value="${ui.labelDensity}" data-change="label-density" aria-label="Beschriftungsdichte"><span class="small muted">viel</span></div></div></div>
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Sektor-Hintergrund</div><div class="sub">${ui.bgMode === 'image' ? 'Bilder – gemalte Weltraum-Hintergründe mit Tiefenwirkung' : 'Erzeugt – marmorierte Nebel und Galaxien je Sektor'}</div></div>
      <div class="toggle"><button class="plain on" ${act('bg-toggle')}>${ui.bgMode === 'image' ? 'Bilder' : 'Erzeugt'}</button></div></div>
      ${ui.bgMode === 'image' ? (() => { const info = bgImageInfo(sectorImageId(ui.sector)); return `<div class="row"><div class="grow"><div class="title" style="font-weight:500">Bild für ${esc(SECTOR_MAP[ui.sector]?.name ?? '')}</div><div class="sub">${info ? `${esc(info.name)} · ${info.index + 1} von ${BG_IMAGES.length}` : '–'}</div></div>
      <div class="stepper"><button class="btn" ${act('bg-prev')} aria-label="Vorheriges Bild">‹</button><button class="btn" ${act('bg-next')} aria-label="Nächstes Bild">›</button></div></div>`; })() : ''}
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Warensymbole</div><div class="sub">${ui.iconStyle === 'glow' ? 'Leuchtend – gefüllt mit Glühen' : 'Linie – nur Umrisse'} · <a class="link" ${act('ware-icons')}>alle ansehen</a></div></div>
      <div class="toggle"><button class="plain on" ${act('icon-style', { style: ui.iconStyle === 'glow' ? 'line' : 'glow' })}>${ui.iconStyle === 'glow' ? 'Leuchtend' : 'Linie'}</button></div></div>
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Animationen und Effekte</div><div class="sub">Funken, Triebwerke, driftende Nebel</div></div>
      <div class="toggle"><button class="plain ${ui.reducedMotion ? '' : 'on'}" ${act('motion-toggle')}>${ui.reducedMotion ? 'Reduziert' : 'Voll'}</button></div></div>
      <div class="row tap" ${act('minigames')}>${icon('star', 20)}<div class="grow"><div class="title" style="font-weight:500">Minispiele (Vorschau)</div><div class="sub wrap">Rohr-Puzzle, Bergbau, Gas sammeln und Kampf ausprobieren</div></div>${icon('chev', 20, 'chev')}</div>
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Ton</div><div class="sub">Klänge bei Bau, Verkauf und Erfolgen</div></div>
      <div class="toggle"><button class="plain ${soundEnabled() ? 'on' : ''}" ${act('sound-toggle')}>${soundEnabled() ? 'An' : 'Aus'}</button></div></div></div></div>
    <div class="section"><h3>Ereignisse</h3><div class="box rows">${logRows}</div></div>
    <div class="section"><h3>Daten & Quellen</h3><div class="box" style="padding:14px"><p class="small" style="margin:0 0 8px;color:var(--text-2)">Rezepte, Preisspannen, Warenvolumen und Lagerarten aus dem Community-Datensatz X4Foundations_FactoryStationsTracker. Baumaterialien, Bauzeiten und Kapazitäten der Module (auch Lager S/M/L und Schiffsfertigung) sowie Schiffsdaten (Rumpf, Ausrüstung, Schub, Frachtraum) aus crissian/x4.</p>
      <p class="small muted" style="margin:0">Spielwerte: Abbauraten, Schiffsbauzeiten, Kartenlage der Felder, die Nachbarsektoren sowie der Nividium-Preis. Belegschaft und Kampf sind nicht Teil dieses Spiels. X4: Foundations ist ein Spiel von Egosoft; dies ist ein inoffizielles Fanprojekt.</p></div></div>`);
}

// ---------- Dialoge ----------

export function modalHtml(state: GameState, ui: UIState): string {
  const m = ui.modal;
  if (!m) return '';
  switch (m.type) {
    case 'modules': return modulesModal(state, ui, m);
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
        ${prod.length ? `<div class="section" style="margin-top:14px"><h3>Produziert</h3><div class="box rows">${prod.map(([id, n]) => `<div class="row">${wareMark(id)}<div class="grow"><div class="title" style="font-weight:500">${esc(WARES[id].name)}</div></div><div class="right"><b>${fmtAmount(n)}</b></div></div>`).join('')}</div></div>` : ''}`,
        `<button class="btn primary" ${act('modal-close')}>Weiter</button>`);
    }
    case 'welcome': return welcomeModal();
    case 'help': { const h = helpModalParts(m.topic); return modalShell(h.title, h.body, h.foot, m.topic ? 'Hilfe' : 'X4 Sektorbau'); }
    case 'chart':
      return modalShell(m.spec.title, bigChart(state, m.spec, m.hours), `<button class="btn" ${act('modal-close')}>Schließen</button>`, m.spec.sub ?? '');
    case 'wareIcons': {
      // Vergleich: alle Waren in beiden Stilen nebeneinander, nach Gruppen
      const groups = new Map<string, string[]>();
      for (const w of Object.values(WARES).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'de'))) groups.set(w.group, [...(groups.get(w.group) ?? []), w.id]);
      const body = `<p class="lead">Links „Linie“, rechts „Leuchtend“. Den Stil stellst du in den Einstellungen ein.</p>
        <div class="segment" style="margin:10px 0 14px">${(['line', 'glow'] as const).map((st) => `<button class="${ui.iconStyle === st ? 'on' : ''}" ${act('icon-style', { style: st })}>${st === 'glow' ? 'Leuchtend' : 'Linie'}</button>`).join('')}</div>
        ${[...groups].map(([g, ids]) => `<div class="section"><h3>${esc(GROUP_LABEL[g as keyof typeof GROUP_LABEL] ?? g)}</h3><div class="wi-grid">${ids.map((id) => `<div class="wi-cell"><div class="wi-pair">${wareIcon(id, 30, 'line')}${wareIcon(id, 30, 'glow')}</div><span>${esc(WARES[id].name)}</span></div>`).join('')}</div></div>`).join('')}`;
      return modalShell('Warensymbole', body, `<button class="btn" ${act('modal-close')}>Schließen</button>`);
    }
    case 'minigames': {
      // Vorschau: alle Minispiele mit Stufe 1–5, Rekorden, Abzeichen, Tagesaufgaben und Herausforderungen
      const stars = (n: number) => `<span class="mg-best" aria-label="${Math.max(0, n)} von 3 Sternen">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
      const pts = (n: number) => Math.round(n).toLocaleString('de-DE');
      const lvl = m.level as Level;
      const gameRow = (k: MiniKind) => {
        const open = unlocked(k, lvl);
        const b = mgBest(k, lvl);
        const info = `${b?.points ? `Rekord ${pts(b.points)} · ` : ''}★ ${totalStars(k)}/15 · Abzeichen ${badgeCount(k)}/${goalsOf(k).length}`;
        return open
          ? `<div class="row tap" ${act('mg-play', { kind: k })}>${icon(MINI_INFO[k].icon, 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(MINI_INFO[k].name)}</div><div class="sub wrap">${esc(MINI_INFO[k].sub)}</div><div class="sub">${info}</div></div>${b ? stars(b.stars) : ''}${icon('play', 18, 'chev')}</div>`
          : `<div class="row mg-lock">${icon('lock', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(MINI_INFO[k].name)}</div><div class="sub wrap">Stufe ${lvl} ab ${UNLOCK[lvl]} Sternen in diesem Spiel – noch ${UNLOCK[lvl] - totalStars(k)}</div></div></div>`;
      };
      const daily = MINI_KINDS.map((k) => {
        const o = dailyOpts(k);
        const mu = mutatorsOf(k).find((x) => x.id === o.mutator);
        const db = dailyBest(k);
        return `<div class="row tap" ${act('mg-daily', { kind: k })}>${icon('clock', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(MINI_INFO[k].name)}</div><div class="sub">${mu ? esc(mu.name) + ' · ' : ''}${db != null ? `heute ${pts(db)} Punkte` : 'heute noch nicht gespielt'}</div></div>${icon('play', 18, 'chev')}</div>`;
      }).join('');
      const modes = MINI_KINDS.filter((k) => MINI_INFO[k].chain || MINI_INFO[k].endless).map((k) => {
        const mode = MINI_INFO[k].chain ? 'chain' : 'endless';
        const bp = mgBestPoints(k, mode);
        return `<div class="row tap" ${act('mg-mode', { kind: k, mode })}>${icon('target', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc((MINI_INFO[k].chain ?? MINI_INFO[k].endless)!.split(':')[0])}</div><div class="sub wrap">${esc((MINI_INFO[k].chain ?? MINI_INFO[k].endless)!.split(':')[1]?.trim() ?? '')}${bp ? ` · Rekord ${pts(bp)}` : ''}</div></div>${icon('play', 18, 'chev')}</div>`;
      }).join('');
      const body = `<p class="lead">Zum Ausprobieren. Jede zweite Runde bringt eine Besonderheit mit mehr Punkten; Nebenziele geben Abzeichen. Mit Sternen schaltest du je Spiel Stufe 4 und 5 frei.</p>
        <div class="section"><h3>Schwierigkeit</h3><div class="segment">${([1, 2, 3, 4, 5] as const).map((l) => `<button class="${m.level === l ? 'on' : ''}" ${act('mg-level', { level: l })}>${l}</button>`).join('')}</div></div>
        <div class="section"><h3>Spiele</h3><div class="box rows">${MINI_KINDS.map(gameRow).join('')}</div></div>
        <div class="section"><h3>Tagesaufgaben</h3><div class="box rows">${daily}</div><p class="small muted" style="margin:8px 0 0">Jeden Tag eine feste Runde je Spiel (Stufe 3) – wie gut schaffst du sie heute?</p></div>
        <div class="section"><h3>Herausforderungen</h3><div class="box rows">${modes}</div></div>
        <div class="section"><h3>Kampf: dein Schiff</h3><div class="box rows"><div class="row tap" ${act('loadout-open')}>${icon('target', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(SHIPS[loadout().ship].name)} – ${esc(SHIPS[loadout().ship].role)}</div><div class="sub wrap">${esc(loadoutLabel())}</div></div>${icon('chev', 20, 'chev')}</div></div></div>
        <div class="section"><h3>Kampf-Steuerung</h3><div class="segment">${(['eins', 'zwei'] as const).map((c) => `<button class="${controlMode() === c ? 'on' : ''}" ${act('mg-controls', { mode: c })}>${c === 'eins' ? 'Ein Stick + Feuertaste' : 'Zwei Sticks'}</button>`).join('')}</div>
        <p class="small muted" style="margin:8px 0 0">${controlMode() === 'eins' ? 'Links ein Stick: Richtung und Schub (im inneren Ring nur drehen), rechts Feuertaste.' : 'Links fliegen aus Sicht des Jägers: oben = geradeaus Schub, seitwärts ¼, rückwärts ⅓ des Tempos. Rechts zielen; über den Ring hinaus wird gefeuert (mit kurzem Vibrieren).'}</p></div>
        <div class="section"><h3>Kampf-Ausrüstung</h3><div class="segment">${([1, 2, 3] as const).map((g) => `<button class="${m.gear === g ? 'on' : ''}" ${act('mg-gear', { gear: g })}>${g === 1 ? 'Standard' : g === 2 ? 'Verbessert' : 'Spitze'}</button>`).join('')}</div>
        <p class="small muted" style="margin:8px 0 0">Waffen, Schilde und Antrieb deines Jägers. Später verbesserst du sie mit Credits oder Teilen aus eigener Produktion.</p></div>`;
      return modalShell('Minispiele', body, `<button class="btn" ${act('modal-close')}>Schließen</button>`, 'Vorschau');
    }
    case 'loadout': {
      // Schiff, Bordwaffe, Türme, Schild und Darstellung für das Kampf-Minispiel
      const lo = loadout();
      const ship = SHIPS[lo.ship];
      const pic = (id: ShipId) => spriteUrl(SHIPS[id].sprite + '-ki') ?? spriteUrl(SHIPS[id].fallback + '-ki');
      const bar = (label: string, v: number) => `<div class="lo-bar"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></b></i></div>`;
      // Feuerkraft mit der gewählten Waffe und dem gewählten Turm (Dauerleistung aus den X4-Werten)
      const wd = WEAPONS[lo.weapon], td = TURRETS[lo.turret];
      const fire = (id: ShipId) => { const d = SHIPS[id]; return d.x4.weapons * sustainedDps(wd[d.gunSize], wd.beam) + d.turrets.length * sustainedDps(td.gun); };
      const fireMax = Math.max(...SHIP_IDS.map(fire));
      const num = (n: number, digits = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
      // Datenzeile einer Waffe: Schaden, Takt, Salve/Magazin, Dauerleistung, Reichweite
      const gunData = (g: X4Gun, beam = false) => beam
        ? `${num(g.dmg)} Schaden/s · Dauerstrahl`
        : `${num(g.dmg)}${g.amt > 1 ? ` × ${g.amt}` : ''} Schaden · ${g.mag === 1 ? 'Einzelschuss' : `${num(g.rate, 1)} Schuss/s`}${g.mag > 1 ? ` · ${g.mag}er-Salve, ${num(g.reload, 1)} s Pause` : g.mag === 1 ? `, ${num(g.reload, 1)} s Aufladen` : ''} · ≈ ${num(sustainedDps(g))}/s · ${num((g.v * g.life) / 1000, 1)} km`;
      const shipRow = (id: ShipId) => {
        const d = SHIPS[id], on = lo.ship === id, url = pic(id), real = spriteUrl(d.sprite + '-ki');
        return `<div class="lo-ship ${on ? 'on' : ''}" ${act('loadout-set', { key: 'ship', value: id })}>
          <div class="lo-pic">${url ? `<img src="${url}" alt="" style="${real ? '' : 'opacity:.45'}">` : ''}${real ? '' : '<small>Bild folgt</small>'}</div>
          <div class="grow"><div class="title">${esc(d.name)} <span class="muted small">${d.cls} · ${esc(d.role)}</span></div>
          <div class="sub wrap">${esc(d.desc)}</div>
          <div class="sub wrap lo-data">Hülle ${num(d.x4.hull)} · ${d.x4.engines} Triebwerk${d.x4.engines > 1 ? 'e' : ''} · ${d.x4.shields} Schild${d.x4.shields > 1 ? 'e' : ''} ${d.cls} · ${d.x4.weapons} Waffenplätze${d.x4.launchers ? ` · ${d.x4.launchers} Raketenwerfer (${d.x4.missiles} Raketen)` : ' · keine Raketen'}${d.x4.turrets ? ` · ${d.x4.turrets} Türme` : ''} · ${d.x4.v} m/s</div>
          <div class="lo-bars">${bar('Tempo', d.speed / 1.5)}${bar('Wendigkeit', d.turn / 1.2)}${bar('Hülle', d.hull / 9.2)}${bar('Schild', d.shield / 5.2)}${bar('Feuerkraft', fire(id) / fireMax)}</div></div>
          ${on ? icon('check', 22, 'pos') : ''}</div>`;
      };
      const choice = (key: string, cur: string, ids: string[], defs: Record<string, { name: string; desc: string }>, data?: (id: string) => string) =>
        `<div class="box rows">${ids.map((id) => `<div class="row tap" ${act('loadout-set', { key, value: id })}><div class="grow"><div class="title" style="font-weight:500">${esc(defs[id].name)}</div><div class="sub wrap">${esc(defs[id].desc)}</div>${data ? `<div class="sub wrap lo-data">${esc(data(id))}</div>` : ''}</div>${cur === id ? icon('check', 20, 'pos') : '<span class="lo-radio"></span>'}</div>`).join('')}</div>`;
      const body = `<p class="lead">Wähle Schiff und Ausrüstung für den Kampf. Mk-Stufe (Standard bis Spitze) stellst du im Minispiel-Menü ein. Später baust du Schiffe und Teile in deiner Werft.</p>
        <div class="section"><h3>Schiff</h3><div class="lo-ships">${SHIP_IDS.map(shipRow).join('')}</div>
        <p class="small muted" style="margin:8px 0 0">Spezialfähigkeit der ${esc(ship.name)}: ${esc(SPECIALS[ship.special].name)} (Taste ${SPECIALS[ship.special].key}).</p></div>
        <div class="section"><h3>Bordkanonen (${ship.x4.weapons} × ${ship.gunSize.toUpperCase()})</h3>
          <p class="small muted" style="margin:0 0 8px">Werte aus X4 9.0 (Mk1, ${ship.gunSize.toUpperCase()}-Waffenplatz). Feuerkraft-Balken: mit dieser Waffe.</p>
          <h3 class="lo-sub">Split-Waffen</h3>${choice('weapon', lo.weapon, WEAPON_IDS.filter((id) => WEAPONS[id].group === 'split'), WEAPONS, (id) => gunData(WEAPONS[id as keyof typeof WEAPONS][ship.gunSize]))}
          <h3 class="lo-sub">Allgemeine Waffen</h3>${choice('weapon', lo.weapon, WEAPON_IDS.filter((id) => WEAPONS[id].group === 'allgemein'), WEAPONS, (id) => { const d = WEAPONS[id as keyof typeof WEAPONS]; return gunData(d[ship.gunSize], d.beam); })}</div>
        ${ship.turrets.length ? `<div class="section"><h3>Türme (${ship.turrets.length} × M, Split)</h3>${choice('turret', lo.turret, TURRET_IDS, TURRETS, (id) => { const t = TURRETS[id as keyof typeof TURRETS]; return `${gunData(t.gun)} · schwenkt ${t.turn}°/s`; })}</div>` : ''}
        <div class="section"><h3>Schild</h3>${choice('shield', lo.shield, SHIELD_IDS, SHIELDS)}</div>
        <div class="section"><h3>Darstellung</h3><div class="segment">${(['ai', 'render', 'vector'] as const).map((a) => `<button class="${shipArt() === a ? 'on' : ''}" ${act('ship-art', { art: a, kind: fighterKind() })}>${a === 'ai' ? 'KI-Bild' : a === 'render' ? 'Gerendert' : 'Gezeichnet'}</button>`).join('')}</div>
        <div class="box rows" style="margin-top:10px"><div class="row tap" ${act('ship-art-open')}>${icon('star', 20)}<div class="grow"><div class="title" style="font-weight:500">Grafikvergleich der Jäger</div><div class="sub">KI-Bild, gerendert und gezeichnet nebeneinander</div></div>${icon('chev', 20, 'chev')}</div></div></div>`;
      return modalShell('Dein Schiff', body, `<button class="btn" ${act('modal-close')}>Schließen</button><button class="btn primary" ${act('ship-art-try')}>Im Kampf ausprobieren</button>`, 'Kampf-Ausrüstung');
    }
    case 'shipArt': {
      // Vergleich der Darstellungen des eigenen Jägers: KI-Bild, vorab gerendert (3D), gezeichnet
      const cur = shipArt(), kind = fighterKind();
      const card = (k: FighterKind | null, a: ShipArt, name: string, sub: string, url: string | undefined) => {
        const on = cur === a && (a === 'vector' || kind === k);
        return `<div class="art-card ${on ? 'on' : ''}">
        <div class="art-big">${url ? `<img src="${url}" alt="${esc(name)}">` : '<span>Noch kein Bild vorhanden.</span>'}</div>
        <div class="art-meta"><div class="grow"><b>${esc(name)}</b><small>${esc(sub)}</small></div>
        ${url ? `<div class="art-small" title="In Spielgröße"><img src="${url}" alt="" style="width:${a === 'vector' ? 30 : a === 'ai' ? 40 : 46}px"></div>` : ''}</div>
        <button class="btn small ${on ? 'on' : ''}" ${url ? act('ship-art', { art: a, kind: k ?? kind }) : 'disabled'}>${on ? 'Im Spiel aktiv' : 'Im Spiel verwenden'}</button></div>`;
      };
      const section = (k: FighterKind) => `<div class="section"><h3>${esc(FIGHTER_NAME[k])}</h3><div class="art-grid">
        ${card(k, 'ai', `${FIGHTER_NAME[k]} – KI-Bild`, 'Aus einem Bildgenerator (ChatGPT)', spriteUrl(spriteName(k, 'ai')))}
        ${card(k, 'render', `${FIGHTER_NAME[k]} – gerendert`, k === 'split' ? '3D-Modell nach dem Designkatalog' : '3D-Modell, erster Entwurf', spriteUrl(spriteName(k, 'render')))}</div></div>`;
      const body = `<p class="lead">Dein Jäger im Kampf-Minispiel. Wähle Bauart und Darstellung; unten rechts jeweils in Spielgröße.</p>
        ${section('split')}${section('argon')}
        <div class="section"><h3>Bisherige Grafik</h3><div class="art-grid">${card(null, 'vector', 'Gezeichnet', 'Live per Code – Neon-Stil', fighterVectorUrl())}</div></div>`;
      return modalShell('Dein Jäger', body, `<button class="btn" ${act('modal-close')}>Schließen</button><button class="btn primary" ${act('ship-art-try')}>Im Kampf ausprobieren</button>`, 'Grafik-Vergleich');
    }
    case 'alerts': {
      const alerts = allAlerts(state);
      return modalShell('Engpässe & Hinweise', alerts.length ? `<div class="box rows">${alerts.map((a) => `<div class="row tap" ${act('open-station', { id: a.station, tab: 'overview' })}>${icon('warn', 20, a.severity === 'bad' ? 'neg' : 'warn-text')}<div class="grow"><div class="sub wrap" style="color:var(--text)">${esc(a.text)}</div>${a.ware ? `<div class="sub wrap">${esc(hintFor(state, stationById(state, a.station)!, a.ware))}</div>` : ''}</div>${icon('chev', 20, 'chev')}</div>`).join('')}</div>` : '<div class="empty">Alles läuft. Keine Engpässe.</div>', `<button class="btn" ${act('modal-close')}>Schließen</button>`);
    }
    case 'export': return modalShell('Spielstand sichern', `<p class="lead">Kopiere diesen Text und bewahre ihn auf. Mit „Spielstand laden“ kannst du ihn später wieder einfügen.</p><textarea id="exportText" readonly>${esc(JSON.stringify(state))}</textarea><p class="small muted" id="copyStatus"></p>`, `<button class="btn" ${act('modal-close')}>Schließen</button>${canDownload() ? `<button class="btn" ${act('download-export')}>${icon('save', 18)}Als Datei</button>` : ''}<button class="btn primary" ${act('copy-export')}>Kopieren</button>`);
    case 'import': return modalShell('Spielstand laden', `<p class="lead">Füge einen gesicherten Spielstand ein. Der aktuelle Stand wird ersetzt.</p><label class="btn block file-btn">${icon('save', 18)}Datei wählen …<input type="file" id="importFile" accept=".json,.txt,application/json,text/plain" data-change="import-file" hidden></label><textarea id="importText" placeholder="{&quot;version&quot;:1, …}"></textarea>${m.error ? `<p class="small neg">${esc(m.error)}</p>` : ''}`, `<button class="btn" ${act('modal-close')}>Abbrechen</button><button class="btn primary" ${act('import-do')}>Laden</button>`);
    case 'home': {
      const s = state.ships.find((x) => x.id === m.ship);
      return modalShell('Heimatstation wählen', `<div class="box rows">${state.stations.map((st) => `<div class="row tap" ${act('set-home', { id: m.ship, st: st.id })}>${icon('station', 20)}<div class="grow"><div class="title">${esc(st.name)}</div><div class="sub">${esc(sector(st.sector).name)}</div></div>${s?.home === st.id ? icon('check', 20, 'pos') : ''}</div>`).join('')}</div>`, `<button class="btn" ${act('modal-close')}>Abbrechen</button>`);
    }
    case 'vendor': return vendorModal(state, ui, m);
    case 'storage': return storageModal(state, m.station, m.ware, !!m.back);
    case 'buildMove': return buildMoveModal(state, m);
    case 'planPick': return modalShell('Endprodukt wählen', pickerModal(state, m.group, ui.search.picker ?? ''), `<button class="btn" ${act('modal-close')}>Fertig</button>`, 'Stationsplaner');
    case 'sell': {
      const v = sellModalHtml(state, m);
      return `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(v.title)}"><div class="sheet-head"><h1><span class="eyebrow">${esc(v.eyebrow)}</span>${esc(v.title)}</h1><button class="icon-btn" ${act('modal-close')} aria-label="Schließen">${icon('close', 22)}</button></div><div class="sheet-body">${v.body}</div><div class="modal-foot">${v.foot}</div></div>`;
    }
    case 'planDiagram': return diagramEditor(state, ui);
    case 'planBuild': return modalShell('Plan in Station bauen', buildModal(state, computePlan(ui.plan)), `<button class="btn" ${act('modal-close')}>Abbrechen</button>`, 'Stationsplaner');
    case 'courier': return deliveryModal(state, m);
  }
}

/** Manuelles Umladen zwischen Stationslager und Baulager */
function buildMoveModal(state: GameState, m: Extract<Modal, { type: 'buildMove' }>): string {
  const st = stationById(state, m.station);
  if (!st) return '';
  const w = WARES[m.ware];
  const lim = buildMoveLimits(st, m.ware);
  const need = buildDemand(st)[m.ware] ?? 0;
  const have = st.buildStore?.[m.ware] ?? 0;
  // Aufrunden, damit auch Bruchteile umgeladen werden können (die Engine begrenzt auf das Mögliche)
  const maxIn = Math.ceil(lim.toBuild - 1e-6), maxOut = Math.ceil(lim.toStation - 1e-6);
  const vIn = Math.min(maxIn, m.toBuild ?? maxIn), vOut = Math.min(maxOut, m.toStation ?? maxOut);
  const step = (max: number) => Math.max(1, Math.round(max / 100));
  const part = (label: string, field: string, dir: number, max: number, v: number, empty: string) => `<div class="field" style="margin-top:14px">
      <label for="${field}">${label} · <b class="num">${fmtAmount(v)}</b></label>
      ${max >= 1 ? `<input type="range" id="${field}" min="0" max="${max}" step="${step(max)}" value="${v}" data-change="${field}">
      <button class="btn small${dir > 0 ? ' primary' : ''}" style="margin-top:8px" ${act('build-move', { st: st.id, ware: m.ware, n: String(dir * v) })} ${v < 1 ? 'disabled' : ''}>${dir > 0 ? 'Ins Baulager laden' : 'Ins Stationslager laden'}</button>`
      : `<p class="small muted" style="margin:4px 0 0">${empty}</p>`}</div>`;
  return modalShell(`Umladen: ${w.name}`, `
    <p class="lead" style="margin-bottom:6px">Stationslager <b class="num">${fmtAmount(st.inventory[m.ware] ?? 0)}</b> · Baulager <b class="num">${fmtAmount(have)}</b> von <b class="num">${fmtAmount(need)}</b> gebraucht.</p>
    <p class="small muted" style="margin:0">Umladen geht ohne Schiff, nur innerhalb dieser Station. Ins Baulager passt höchstens, was die Bauliste noch braucht.</p>
    ${part('Ins Baulager', 'build-move-in', 1, maxIn, vIn, (st.inventory[m.ware] ?? 0) < 1 ? 'Im Stationslager liegt nichts davon.' : 'Das Baulager hat schon alles, was gebraucht wird.')}
    ${part('Zurück ins Stationslager', 'build-move-out', -1, maxOut, vOut, have < 1 ? 'Im Baulager liegt nichts davon.' : 'Im Stationslager ist kein Platz dafür.')}`,
    `<button class="btn" ${act('modal-close')}>Fertig</button>`, st.name);
}

function storageModal(state: GameState, stationId: string, ware: string, back = false): string {
  const st = stationById(state, stationId);
  if (!st) return '';
  const w = WARES[ware];
  const cap = storageCap(st);
  const wl = stationWares(st);
  const share = storageShare(st, ware, wl);
  const limit = wareLimit(st, ware, cap, wl);
  const reserve = reserveFor(st, ware, limit);
  const consumed = consumesWare(st, ware);
  const others = wl.filter((x) => x !== ware && WARES[x].storage === w.storage);
  const seg = [ware, ...others].map((x) => { const s = storageShare(st, x, wl); return `<i style="width:${(s.share * 100).toFixed(1)}%;background:${WARES[x].color}" title="${esc(WARES[x].name)}"></i>`; }).join('');
  return modalShell(`Lager: ${w.name}`, `
    <p class="lead" style="margin-bottom:10px">${esc(STORAGE_LABEL[w.storage])}-Lager dieser Station: ${fmtAmount(cap[w.storage])} m³. Im Lager: ${fmtAmount(st.inventory[ware] ?? 0)} Einheiten. <a class="link" ${act('modal-modules', { st: st.id, cat: 'storage' })}>Lager erweitern (S/M/L)</a></p>
    <div class="stack-bar">${seg}</div>
    <div class="small muted" style="margin:6px 0 16px">${[ware, ...others].map((x) => `${esc(WARES[x].name)} ${Math.round(storageShare(st, x, wl).share * 100)} %`).join(' · ')}</div>
    <div class="field"><label for="storShare">Anteil am Lagerraum · ${Math.round(share.share * 100)} % = ${fmtAmount(limit)} Einheiten${share.auto ? ' (automatisch)' : ''}</label>
      <input type="range" id="storShare" min="0" max="100" step="1" value="${Math.round(share.share * 100)}" data-change="storage-share" data-st="${st.id}" data-ware="${ware}">
      ${share.auto ? '' : `<button class="linkish" ${act('storage-auto', { st: st.id, ware, k: 'share' })}>wieder automatisch verteilen</button>`}</div>
    <div class="field" style="margin-top:16px"><label for="storReserve">Für eigene Produktion behalten · ${fmtAmount(reserve)} Einheiten${st.reserve?.[ware] === undefined ? ' (automatisch)' : ''}</label>
      <input type="range" id="storReserve" min="0" max="${Math.max(1, Math.round(limit))}" step="${Math.max(1, Math.round(limit / 100))}" value="${Math.round(Math.min(reserve, limit))}" data-change="storage-reserve" data-st="${st.id}" data-ware="${ware}">
      <p class="small muted" style="margin:4px 0 0">${consumed ? 'Die Station verbraucht diese Ware selbst. Verkäufe und Händler greifen nur auf den Teil über der Reserve zu.' : 'Die Station verbraucht diese Ware nicht – eine Reserve ist meist unnötig.'}</p>
      ${st.reserve?.[ware] === undefined ? '' : `<button class="linkish" ${act('storage-auto', { st: st.id, ware, k: 'reserve' })}>Reserve automatisch (${consumed ? '40 % der Grenze' : 'keine'})</button>`}</div>`,
    `<button class="btn primary" ${act(back ? 'modal-back' : 'modal-close')}>${back ? 'Zurück zur Lieferung' : 'Fertig'}</button>`, st.name);
}

function deliveryModal(state: GameState, m: Extract<Modal, { type: 'courier' }>): string {
  const c = state.contracts.find((x) => x.id === m.contract);
  if (!c) return '';
  const w = WARES[c.ware];
  const dest = SECTOR_MAP[c.sector].tradeStation.name;
  const withStock = state.stations.filter((st) => (st.inventory[c.ware] ?? 0) >= 1);
  // station: undefined = automatisch wählen, '' = Auswahl zeigen
  const stationId = m.station ?? (withStock.length === 1 ? withStock[0].id : undefined);
  const close = `<button class="btn" ${act('modal-close')}>Abbrechen</button>`;
  if (!stationId) {
    const rows = state.stations.map((st) => {
      const have = st.inventory[c.ware] ?? 0;
      return `<div class="row ${have >= 1 ? 'tap' : ''}" ${have >= 1 ? act('courier-station', { st: st.id }) : ''}>${icon('station', 20)}<div class="grow"><div class="title">${esc(st.name)}</div><div class="sub">${fmtAmount(have)} ${esc(w.name)} auf Lager</div></div>${have >= 1 ? icon('chev', 20, 'chev') : ''}</div>`;
    }).join('');
    return modalShell('Aus welcher Station?', `<p class="lead">${esc(c.title)} · ${fmtInt(c.amount - c.delivered)} ${esc(w.name)} fehlen noch.</p><div class="box rows">${rows}</div>`, close, 'Auftrag liefern');
  }
  const o = deliveryOptions(state, c.id, stationId);
  const st = stationById(state, stationId);
  if (!o || !st) return '';
  const back = withStock.length > 1 || m.station ? `<button class="btn" ${act('courier-station', { st: '' })}>${icon('back', 18)}Station</button>` : '';
  const courierOk = o.courier.amount >= 1 && state.credits >= o.courier.fee;
  const courier = `<div class="row"><span class="ware-tile" style="--c:#8fb7c4">${icon('trader', 18)}</span><div class="grow"><div class="title">Kurier anheuern</div>
      <div class="sub wrap">${fmtAmount(o.courier.amount)} ${esc(w.name)} in einer Fahrt · ca. ${fmtDur(o.courier.eta)} · startet sofort</div></div>
      <div class="right"><b class="neg">−${fmtCr(o.courier.fee)}</b><div class="small muted">10 % Gebühr</div></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ${courierOk ? 'primary' : 'disabled'}" ${act('courier', { c: c.id, st: st.id })}>Kurier senden</button></div>`;
  const ships = o.ships.map((x) => {
    const cls = SHIP_MAP[x.ship.cls];
    const save = Math.round(x.amount * w.price.avg * 0.1);
    const info = x.reason ? `<span class="warn-text">${esc(x.reason)}</span>` : `${x.trips} Fahrt${x.trips === 1 ? '' : 'en'} à ${fmtAmount(Math.min(x.perTrip, x.amount))} · fertig in ca. ${fmtDur(x.eta)}${x.busy ? ' nach laufender Fahrt' : ''}`;
    return `<div class="row" data-key="dv${x.ship.id}" style="flex-wrap:wrap"><span class="ware-tile" style="--c:#5ff0d8">${icon('trader', 18)}</span>
      <div class="grow"><div class="title">${esc(x.ship.name)}</div><div class="sub wrap"><span class="muted">${esc(cls.name)}</span> · ${x.busy ? esc(x.ship.status) : 'frei'}</div><div class="sub wrap">${info}</div></div>
      ${x.reason ? '' : `<div class="right"><b class="pos">spart ${fmtCr(save)}</b></div>
      <div style="width:100%;display:flex;justify-content:flex-end;margin-top:6px"><button class="btn small" ${act('deliver-ship', { c: c.id, st: st.id, ship: x.ship.id })}>Mit ${esc(cls.name.split(' ')[0])} liefern</button></div>`}</div>`;
  }).join('');
  const reserveNote = o.sellable + 0.5 < Math.min(o.stock, o.need) ? `<p class="small muted" style="margin:6px 0 0">Eigene Transporter lassen die Lager-Reserve unangetastet (${fmtAmount(o.stock - o.sellable)} Einheiten), der Kurier nimmt alles. <a class="link" ${act('storage-open', { st: st.id, ware: c.ware })}>Reserve anpassen</a></p>` : '';
  const body = `<p class="lead">${esc(st.name)} → ${esc(dest)} · noch ${fmtAmount(o.need)} ${esc(w.name)} offen, ${fmtAmount(o.stock)} auf Lager.</p>
    <div class="section"><h3>Sofort, gegen Gebühr</h3><div class="box rows">${courier}</div></div>
    <div class="section"><h3>Eigener Transporter, ohne Gebühr</h3>${ships ? `<div class="box rows">${ships}</div>${reserveNote}` : '<div class="box empty">Keine Transporter in der Flotte.</div>'}</div>`;
  return modalShell('Wer liefert?', body, `${back}${close}`, c.title);
}

function modalShell(title: string, body: string, foot: string, eyebrow = ''): string {
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><h1>${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}${esc(title)}</h1><button class="icon-btn" ${act('modal-close')} aria-label="Schließen">${icon('close', 22)}</button></div><div class="sheet-body">${body}</div><div class="modal-foot">${foot}</div></div>`;
}

function modulesModal(state: GameState, ui: UIState, m: Extract<Modal, { type: 'modules' }>): string {
  const st = stationById(state, m.station);
  if (!st) return '';
  const cats: [string, string][] = [['production', 'Produktion'], ['storage', 'Lager'], ['habitat', 'Wohnen'], ['dock', 'Andocken'], ['shipyard', 'Werft']];
  const sun = sector(st.sector).sunlight;
  const q = ui.search.modules ?? '';
  const inCat = (d: ModuleDef) => (m.cat === 'production' || m.cat === 'storage' || m.cat === 'shipyard' || m.cat === 'habitat' ? d.kind === m.cat : d.kind === 'dock' || d.kind === 'pier');
  // Mit Suchtext wird über alle Kategorien gesucht; immer alphabetisch
  const list = MODULES.filter((d) => d.kind !== 'core' && (q ? true : inCat(d)) && (!ui.ownedOnly || state.blueprints.includes(d.id)) && matches(q, d.name, d.ware && WARES[d.ware].name, d.ware && GROUP_LABEL[WARES[d.ware].group]))
    .sort(byName);
  const cards = list.map((d) => {
    const bp = blueprintState(state, d.id);
    const afford = state.credits >= d.cost;
    let io = '';
    if (d.kind === 'production' && d.ware) {
      const ins = inputsPerHour(d.ware);
      io = `<div class="flow" style="grid-column:1/-1">${ins.map((i) => `<span class="io">${wareMark(i.ware, 7)}<b>${fmtAmount(i.amount)}</b>${esc(WARES[i.ware].name)}</span>`).join('')}${ins.length ? `<span class="arrow">${icon('arrowRight', 16)}</span>` : ''}<span class="io" style="border-color:${WARES[d.ware].color}">${wareMark(d.ware, 7)}<b>${fmtAmount(outputPerHour(d.ware, sun))}</b>${esc(WARES[d.ware].name)} / h</span></div>`;
    }
    const lead = d.kind === 'production' && d.ware ? wareTile(d.ware) : `<span class="ware-tile" style="--c:#8fb7c4">${icon(moduleIcon(d.kind), 18)}</span>`;
    const desc = d.kind === 'storage' ? `${fmtInt(d.capacity ?? 0)} m³ ${STORAGE_LABEL[d.storage!]}` : d.kind === 'habitat' ? `Wohnraum für ${fmtInt(d.housing ?? 0)} Bewohner. Arbeitskräfte siedeln sich später an, wenn Nahrung und Medizin da sind.` : d.kind === 'dock' ? 'Andockplätze für M- und S-Schiffe' : d.kind === 'pier' ? 'Andockplätze für L-Schiffe (Wyvern, Buffalo)' : d.kind === 'shipyard' ? (d.yardSize === 'XL' ? 'Für Träger und Schlachtschiffe – die kommen mit den Kampfschiffen. Größte und teuerste Werft.' : d.yardSize === 'L' ? 'Baut Wyvern und Buffalo aus eigenen Waren. Braucht einen Pier für die fertigen Schiffe.' : 'Baut Alligator, Tuatara und Boa aus eigenen Waren. Bietet auch Andockplätze für S/M.') + ' Baumaterial:' : `${esc(GROUP_LABEL[WARES[d.ware!].group])} · Stufe ${WARES[d.ware!].tier}${['Split', 'Universal', 'Argon'].includes(d.method) ? '' : ' · ' + esc(d.method)}`;
    const action = bp === 'owned'
      ? `${afford ? '' : '<span class="small muted" style="margin-right:auto">startet, sobald Credits reichen</span>'}<button class="btn small primary" ${act('queue', m.at === undefined ? { st: st.id, def: d.id } : { st: st.id, def: d.id, at: m.at })}>${icon('plus', 16)}${m.at === undefined ? 'Einplanen' : `An Position ${m.at + 1}`}</button>`
      : (() => {
        const go = vendorsFor(d.id).find((v) => vendorOffer(state, v, d.id) !== 'far');
        const lockPill = bp === 'buyable' ? `<span class="small muted" style="margin-right:auto">Bauplan ${fmtCr(d.blueprintCost)}</span>` : `<span class="pill" style="margin-right:auto">${icon('lock', 13)} Ruf ${d.repRequired} ${FACTIONS[bestRepFor(state, d.id).faction].short}</span>`;
        return `${lockPill}${go ? `<button class="btn small ${bp === 'buyable' ? 'amber' : ''}" ${act('goto-vendor', { id: go.id })}>${icon('arrowRight', 15)}${go.npc ? 'Zur Werft' : 'Zum Vertreter'}</button>` : ''}`;
      })();
    return `<div class="module-card box ${bp === 'locked' ? 'locked' : ''}" data-key="${d.id}">${lead}<div style="min-width:0"><div class="title" style="font-weight:600">${esc(d.name)}</div><div class="small muted">${desc}</div></div>
      ${io}<div class="flow" style="grid-column:1/-1">${Object.entries(d.materials).map(([id, n]) => `<span class="io ${(st.buildStore?.[id] ?? 0) + marketSupply(state, id) < n ? 'lack' : ''}">${wareMark(id, 7)}<b>${fmtAmount(n)}</b>${esc(WARES[id].name)}</span>`).join('')}</div>
      <div class="meta" style="grid-column:1/-1"><span>Material ca. <b>${fmtCr(d.cost)}</b></span><span>Bauzeit <b>${fmtDur(d.buildTime)}</b></span></div>
      <div class="actions">${action}</div></div>`;
  }).join('');
  const nBuy = list.filter((d) => blueprintState(state, d.id) === 'buyable').length;
  const body = `${searchBox('modules', q, 'Modul oder Ware suchen …')}
    ${q ? `<p class="small muted" style="margin:-4px 0 10px">Suche in allen Kategorien · ${list.length} Treffer</p>` : `<div class="tabs wrap" style="padding:0 0 12px">${cats.map(([c, l]) => `<button class="${m.cat === c ? 'active' : ''}" ${act('modules-cat', { cat: c })}>${l}</button>`).join('')}</div>`}
    <div class="pills" style="margin-bottom:12px"><button class="pill ${ui.ownedOnly ? 'amber' : ''}" ${act('owned-only')}>${icon('check', 13)} Nur mit Bauplan</button></div>
    ${nBuy ? `<button class="bp-hint" ${act('open-blueprints')}>${icon('lock', 16)}<span>${nBuy === 1 ? '1 Bauplan' : `${nBuy} Baupläne`} hier kaufbar – bei den Vertretern vor Ort</span>${icon('chev', 16)}</button>` : ''}
    ${cards ? `<div style="display:grid;gap:10px">${cards}</div>` : `<div class="box empty-search">Nichts gefunden${q ? ` für „${esc(q)}“` : ''}.</div>`}`;
  return modalShell(m.at === undefined ? 'Modul einplanen' : `Modul an Position ${m.at + 1} einfügen`, body, `<button class="btn" ${act('modal-close')}>Fertig</button>`, `${st.name} · ${fmtCr(state.credits)} verfügbar`);
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
      <div class="meta" style="grid-column:1/-1"><span>Fracht <b>${fmtInt(c.capacity)} m³</b> ${esc(STORAGE_LABEL[c.storage])}</span><span>Reise <b>${fmtNum(c.speed, 1)} km/s</b></span><span>max <b>${fmtInt(c.maxSpeed)} m/s</b></span>${c.miningRate ? `<span>Abbau <b>${c.miningRate} m³/s</b>*</span>` : ''}</div>
      <div class="price-breakdown" style="grid-column:1/-1"><span>Rumpf <b>${fmtCr(c.hullPrice)}</b></span>${c.parts.map((p) => `<span>${p.count}× ${esc(p.name)} <b>${fmtCr(p.count * p.price)}</b></span>`).join('')}</div>
      <div class="actions">${dock ? '' : `<span class="small warn-text" style="margin-right:auto">${c.size === 'L' ? 'Pier fehlt' : 'Dock fehlt'}</span>`}<button class="btn small ${afford ? 'primary' : 'disabled'}" ${act('buyship', { st: st.id, cls: c.id })}>Kaufen · ${fmtCr(c.price)}</button></div></div>`;
  }).join('');
  const picker = state.stations.length > 1 ? `<div class="field" style="margin-bottom:12px"><label>Heimatstation</label><select data-change="buy-home">${state.stations.map((x) => `<option value="${x.id}" ${x.id === st.id ? 'selected' : ''}>${esc(x.name)} · ${esc(sector(x.sector).name)}</option>`).join('')}</select></div>` : '';
  return modalShell('Schiff kaufen', `${picker}<div style="display:grid;gap:10px">${cards}</div><p class="small muted" style="margin-top:10px">Preis = Rumpf + Grundausstattung (Triebwerke, Schilde, bei Mineral-Minern Abbautürme) zu X4-Durchschnittspreisen; ohne Waffen. Tempo aus Schub und Luftwiderstand. *Abbaurate ist ein Spielwert.</p>`, `<button class="btn" ${act('modal-close')}>Fertig</button>`, `Split-Werft · ${fmtCr(state.credits)} verfügbar`);
}

function welcomeModal(): string {
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Willkommen">
    <div class="welcome-hero"><div class="logo">X4 <em>Sektorbau</em></div><p>Familie Zhin, kurz nach dem Xenon-Angriff. Du bekommst Baurechte, eine kleine Station mit Solarkraftwerk und Startkapital. Mach daraus ein Wirtschaftsimperium – bis zur eigenen Werft.</p></div>
    <div class="sheet-body"><div class="steps">
      <div><span class="n">1</span><div><b>Bauen</b>Module planst du unter Stationen → Module. Das Baumaterial liefern Schiffe ins Baulager der Station.</div></div>
      <div><span class="n">2</span><div><b>Fördern und herstellen</b>Miner holen Rohstoffe, Fabriken verarbeiten sie mit den echten X4-Rezepten.</div></div>
      <div><span class="n">3</span><div><b>Handeln</b>Transporter und NPC-Händler verkaufen Überschüsse und bringen, was fehlt.</div></div>
      <div><span class="n">4</span><div><b>Der Kampagne folgen</b>Unten auf der Karte steht dein nächstes Ziel. Hinweise zeigen dir die ersten Handgriffe.</div></div>
    </div></div>
    <div class="modal-foot"><button class="btn primary" ${act('modal-close')}>${icon('play', 18)}Loslegen</button></div></div>`;
}

export { SPEEDS };
