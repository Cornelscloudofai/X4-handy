// Steuerung: Spielschleife, Karte, Eingaben, Oberfläche und Speichern
import { SECTOR_MAP, SECTOR_RADIUS } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import * as A from '../engine/actions';
import { acceptContract } from '../engine/contracts';
import { defaultTradeRule } from '../engine/economy';
import { stationById } from '../engine/logistics';
import { catchUp, step } from '../engine/sim';
import { deserialize, loadLocal, newGame, saveLocal, clearLocal } from '../engine/state';
import { claimMission } from '../engine/story';
import type { GameState, TradeEndpoint } from '../engine/types';
import { onGameEvent } from '../engine/util';
import { Camera, attachInput } from '../render/camera';
import { GALAXY_HEX, drawGalaxy, galaxyHit, sectorCenter } from '../render/galaxyView';
import { SectorRenderer } from '../render/sectorView';
import { $, morph } from './dom';
import { fmtCr } from './format';
import { icon } from './icons';
import { setSound, sfx, soundEnabled } from './sound';
import { SPEEDS, ui, type Modal, type Panel, type PanelType } from './uistate';
import { cardHtml, hudHtml, modalHtml, navHtml, objectiveHtml, panelHtml } from './views';

let state: GameState;
const renderer = new SectorRenderer();
const cam = new Camera();
const galaxyCam = new Camera();
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let dpr = 1;
let lastFrame = 0;
let uiTimer = 0;
let saveTimer = 0;
let dirtyUI = true;
let lastCredits = 0;
let creditFlash = '';
let creditFlashTimer = 0;
let pointerInUI = false;

// ---------- Start ----------

export function start(): void {
  canvas = $('map') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;
  const loaded = loadLocal();
  if (loaded) {
    state = loaded;
    const away = Math.min(8 * 3600, Math.max(0, (Date.now() - state.savedAt) / 1000));
    if (away > 90) {
      const report = catchUp(state, away);
      ui.modal = { type: 'offline', ...report };
    }
  } else {
    state = newGame();
    ui.modal = { type: 'welcome' };
  }
  ui.sector = state.stations[0]?.sector ?? 'zhin';
  lastCredits = state.credits;
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  attachInput(canvas, () => (ui.view === 'galaxy' ? galaxyCam : cam), { onTap, onLongPress });
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  for (const id of ['bottom', 'hud', 'panel', 'modal']) {
    const el = $(id);
    el.addEventListener('pointerdown', () => (pointerInUI = true));
  }
  window.addEventListener('pointerup', () => setTimeout(() => (pointerInUI = false), 0));
  window.addEventListener('pointercancel', () => (pointerInUI = false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  onGameEvent((e) => {
    if (e.type === 'toast') toast(e.text, e.kind);
    if (e.type === 'sale' && e.sector === ui.sector && Math.abs(e.value) >= 1000 && ui.view === 'sector') {
      renderer.addFloat(e.sector, e.x, e.z, (e.value > 0 ? '+' : '') + fmtCr(e.value), e.value > 0 ? '#8ff5b0' : '#ffb4a0');
      if (e.value > 0) sfx.coin();
    }
    if (e.type === 'moduleDone') { sfx.build(); navigator.vibrate?.(15); }
    if (e.type === 'contractDone' || e.type === 'story') sfx.success();
    dirtyUI = true;
  });
  renderUI();
  fitSector();
  // Zugriff für automatisierte Tests
  (window as unknown as { __game: unknown }).__game = { get state() { return state; }, cam, ui, refresh, step: (sec: number) => step(state, sec), actions: A, claim: () => claimMission(state), openPanel, gotoSector };
  requestAnimationFrame(frame);
  const boot = document.getElementById('boot');
  if (boot) { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 500); }
}

function resize(): void {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const first = cam.w === 1;
  cam.w = galaxyCam.w = r.width;
  cam.h = galaxyCam.h = r.height;
  if (first) fitSector();
  fitGalaxy();
}

function hudHeight(): number {
  return (document.getElementById('hud')?.getBoundingClientRect().height ?? 120) + 10;
}

function bottomHeight(): number {
  return (document.getElementById('nav')?.getBoundingClientRect().height ?? 70) + 12;
}

function fitSector(): void {
  cam.fit(SECTOR_RADIUS, bottomHeight() + 50, Math.min(hudHeight(), cam.h * 0.4));
  cam.maxZoom = 40;
}

function fitGalaxy(): void {
  galaxyCam.fit(GALAXY_HEX * 2.2, bottomHeight() + 150, 90);
  galaxyCam.x = 0;
  galaxyCam.minZoom = galaxyCam.zoom * 0.7;
}

// ---------- Schleife ----------

function frame(now: number): void {
  const dt = Math.min(0.25, lastFrame ? (now - lastFrame) / 1000 : 0.016);
  lastFrame = now;
  if (!ui.paused && !(ui.modal && (ui.modal.type === 'welcome' || ui.modal.type === 'offline'))) step(state, dt * state.speed);
  const c = ui.view === 'galaxy' ? galaxyCam : cam;
  c.update(dt, ui.view === 'galaxy' ? GALAXY_HEX * 3 : SECTOR_RADIUS * 1.1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (ui.view === 'galaxy') {
    renderer.drawBackdrop(ctx, galaxyCam, 'galaxy', now);
    drawGalaxy(ctx, state, galaxyCam, ui.galaxySel, ui.sector, now);
  } else {
    renderer.draw(ctx, state, ui, cam, now, dt);
  }
  // Credits-Anzeige kurz einfärben
  if (Math.abs(state.credits - lastCredits) > 1) {
    creditFlash = state.credits > lastCredits ? 'flash-up' : 'flash-down';
    creditFlashTimer = 0.6;
    lastCredits = state.credits;
  }
  if (creditFlashTimer > 0) { creditFlashTimer -= dt; if (creditFlashTimer <= 0) { creditFlash = ''; dirtyUI = true; } }
  uiTimer -= dt;
  if (dirtyUI || uiTimer <= 0) {
    if (!pointerInUI) { renderUI(); dirtyUI = false; }
    uiTimer = 0.33;
  }
  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; save(); }
  requestAnimationFrame(frame);
}

function save(): void {
  if (!state) return;
  const ok = saveLocal(state);
  ui.saveStatus = ok ? 'Zuletzt gespeichert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Speichern auf diesem Gerät nicht möglich – nutze „Spielstand sichern“.';
}

// ---------- Oberfläche ----------

function renderUI(): void {
  morph($('hud'), hudHtml(state, ui, creditFlash));
  morph($('nav'), navHtml(state, ui));
  const card = $('card');
  const cardContent = ui.panel ? '' : cardHtml(state, ui);
  morph(card, cardContent);
  card.hidden = !cardContent;
  const obj = $('objective');
  const objContent = cardContent ? '' : objectiveHtml(state, ui);
  morph(obj, objContent);
  obj.hidden = !objContent;
  const panel = $('panel');
  const panelContent = panelHtml(state, ui);
  if (panel.dataset.key !== panelKey()) { panel.innerHTML = ''; panel.dataset.key = panelKey(); const b = panel.querySelector('.sheet-body'); if (b) b.scrollTop = 0; }
  morph(panel, panelContent);
  panel.hidden = !panelContent;
  const modal = $('modal');
  const modalContent = modalHtml(state, ui);
  if (modal.dataset.key !== modalKey()) { modal.innerHTML = ''; modal.dataset.key = modalKey(); }
  morph(modal, modalContent);
  modal.hidden = !modalContent;
  document.documentElement.style.setProperty('--bottom-stack', $('bottom').offsetHeight + 'px');
}

function panelKey(): string {
  const p = ui.panel;
  return p ? `${p.type}:${p.id ?? ''}:${p.tab ?? ''}` : '';
}

function modalKey(): string {
  const m = ui.modal;
  if (!m) return '';
  return m.type + ('station' in m ? m.station : '') + ('cat' in m ? m.cat : '') + ('role' in m ? m.role : '');
}

function refresh(): void {
  dirtyUI = true;
  pointerInUI = false;
  renderUI();
}

function toast(text: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info'): void {
  const host = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = icon(kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'warn', 18) + `<span></span>`;
  el.querySelector('span')!.textContent = text;
  host.appendChild(el);
  while (host.children.length > 2) host.firstElementChild!.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 2800);
}

function result(r: A.Result): void {
  toast(r.msg, r.ok ? 'good' : 'warn');
  refresh();
}

function openPanel(type: PanelType, id?: string, tab?: string, stack = false): void {
  const back = stack && ui.panel ? ui.panel : null;
  ui.panel = { type, id, tab, back } as Panel;
  ui.placing = null;
  refresh();
}

// ---------- Karte ----------

function onTap(sx: number, sy: number): void {
  if (ui.view === 'galaxy') {
    const id = galaxyHit(galaxyCam, sx, sy);
    ui.galaxySel = id;
    if (id) {
      const c = sectorCenter(id);
      galaxyCam.flyTo(c.x, c.z + 30 / galaxyCam.zoom, galaxyCam.zoom);
    }
    refresh();
    return;
  }
  if (ui.placing) {
    const [x, z] = cam.toWorld(sx, sy);
    const check = A.canPlaceStation(state, ui.sector, x, z);
    ui.placing = { x, z, valid: check.ok, msg: check.msg, set: true };
    refresh();
    return;
  }
  const sel = renderer.hitTest(state, ui, cam, sx, sy);
  ui.selection = sel;
  if (ui.panel) ui.panel = null;
  refresh();
}

function onLongPress(sx: number, sy: number): void {
  if (ui.view !== 'sector' || ui.placing) return;
  const [x, z] = cam.toWorld(sx, sy);
  if (!state.sectors.includes(ui.sector)) return;
  const check = A.canPlaceStation(state, ui.sector, x, z);
  ui.placing = { x, z, valid: check.ok, msg: check.msg, set: true };
  ui.selection = null;
  refresh();
}

function focusOn(x: number, z: number, sectorId: string, zoom?: number): void {
  if (ui.sector !== sectorId) { ui.sector = sectorId; }
  ui.view = 'sector';
  const targetZoom = zoom ?? Math.max(cam.zoom, 4.5);
  cam.flyTo(x, z + (bottomHeight() + 120) / 2 / targetZoom, targetZoom);
}

function gotoSector(id: string): void {
  ui.sector = id;
  ui.view = 'sector';
  ui.selection = null;
  ui.galaxySel = null;
  ui.panel = null;
  ui.placing = null;
  fitSector();
  refresh();
}

// ---------- Aktionen ----------

function onClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) {
    // Klick auf den abgedunkelten Hintergrund schließt den Dialog
    if (e.target === $('modal') && ui.modal && ui.modal.type !== 'welcome') { ui.modal = null; refresh(); }
    return;
  }
  const d = el.dataset;
  const a = d.act!;
  if (a.startsWith('open') || a === 'nav' || a.endsWith('modal')) sfx.open();
  else sfx.tap();
  switch (a) {
    case 'sound-toggle': setSound(!soundEnabled()); refresh(); break;
    case 'nav': {
      ui.modal = null;
      if (d.tab === 'map') { ui.panel = null; if (ui.view === 'galaxy') ui.view = 'sector'; refresh(); }
      else openPanel(d.tab as PanelType);
      break;
    }
    case 'close-panel': ui.panel = null; refresh(); break;
    case 'back': ui.panel = ui.panel?.back ?? null; refresh(); break;
    case 'open-station': ui.modal = null; openPanel('station', d.id, d.tab ?? 'overview', ui.panel?.type !== 'station'); ui.selection = { kind: 'station', id: d.id! }; break;
    case 'open-ship': openPanel('ship', d.id, undefined, !!ui.panel); break;
    case 'open-ware': ui.modal = null; openPanel('ware', d.id, undefined, !!ui.panel); break;
    case 'open-sector': openPanel('sector', d.id, undefined, !!ui.panel); break;
    case 'open-market': ui.marketSector = d.id!; openPanel('market'); break;
    case 'station-tab': if (ui.panel) { ui.panel = { ...ui.panel, tab: d.tab }; refresh(); } break;
    case 'select-clear': ui.selection = null; ui.galaxySel = null; refresh(); break;
    case 'focus': {
      const kind = d.kind, id = d.id!;
      if (kind === 'station') { const st = stationById(state, id); if (st) { focusOn(st.x, st.z, st.sector); ui.selection = { kind: 'station', id }; } }
      if (kind === 'ship') { const s = state.ships.find((x) => x.id === id); if (s) { focusOn(s.x, s.z, s.sector); ui.selection = { kind: 'ship', id }; } }
      ui.panel = null;
      refresh();
      break;
    }
    case 'galaxy': {
      ui.panel = null;
      ui.placing = null;
      if (ui.view === 'galaxy') { ui.view = 'sector'; }
      else { ui.view = 'galaxy'; ui.galaxySel = ui.sector; fitGalaxy(); }
      refresh();
      break;
    }
    case 'goto-sector': gotoSector(d.id!); break;
    case 'pause': ui.paused = !ui.paused; refresh(); break;
    case 'speed': {
      if (ui.paused) { ui.paused = false; }
      else { const i = SPEEDS.indexOf(state.speed); state.speed = SPEEDS[(i + 1) % SPEEDS.length]; }
      refresh();
      break;
    }
    case 'alerts': ui.modal = { type: 'alerts' }; refresh(); break;
    case 'routes-toggle': ui.routes = !ui.routes; refresh(); break;
    case 'zoom-in': cam.zoomAt(1.5, cam.w / 2, cam.h / 2); break;
    case 'zoom-out': cam.zoomAt(1 / 1.5, cam.w / 2, cam.h / 2); break;
    case 'place-start': {
      if (!state.sectors.includes(ui.sector)) { toast('Für diesen Sektor fehlt die Baulizenz.', 'warn'); break; }
      ui.panel = null;
      ui.selection = null;
      ui.view = 'sector';
      ui.placing = { x: 0, z: 0, valid: false, msg: '', set: false };
      refresh();
      break;
    }
    case 'place-cancel': ui.placing = null; refresh(); break;
    case 'place-confirm': {
      const p = ui.placing;
      if (!p?.set) break;
      const r = A.foundStation(state, ui.sector, p.x, p.z);
      if (r.ok && r.id) { ui.placing = null; ui.selection = { kind: 'station', id: r.id }; openPanel('station', r.id, 'modules'); }
      toast(r.msg, r.ok ? 'good' : 'warn');
      refresh();
      break;
    }
    case 'modal-modules': ui.modal = { type: 'modules', station: d.st!, cat: d.cat ?? 'production' }; refresh(); break;
    case 'modules-cat': if (ui.modal?.type === 'modules') { ui.modal = { ...ui.modal, cat: d.cat! }; refresh(); } break;
    case 'queue': result(A.queueModule(state, d.st!, d.def!)); break;
    case 'buy-bp': result(A.buyBlueprint(state, d.def!)); break;
    case 'cancel-q': result(A.cancelQueued(state, d.st!, Number(d.i))); break;
    case 'ask-demolish': ask('Modul abreißen?', 'Du erhältst 30 % der Baukosten als Materialerlös zurück. Lagerbestände über der neuen Grenze bleiben erhalten.', 'demolish', { st: d.st!, uid: d.uid! }, 'Abreißen', true); break;
    case 'ask-sell-ship': {
      const sh = state.ships.find((x) => x.id === d.id);
      if (sh) ask(`${sh.name} verkaufen?`, `Die Werft zahlt ${fmtCr(SHIP_MAP[sh.cls].price * 0.6)} (60 % des Neupreises). Ladung an Bord geht verloren.`, 'sell-ship', { id: sh.id }, 'Verkaufen', true);
      break;
    }
    case 'ask-newgame': ask('Neues Spiel beginnen?', 'Der aktuelle Spielstand wird gelöscht. Sichere ihn vorher unter „Spielstand sichern“, wenn du ihn behalten möchtest.', 'newgame', {}, 'Neu beginnen', true); break;
    case 'confirm': {
      const m = ui.modal;
      if (m?.type !== 'confirm') break;
      ui.modal = null;
      runConfirmed(m.action, m.args);
      break;
    }
    case 'modal-close': ui.modal = null; refresh(); break;
    case 'buyship-modal': ui.modal = { type: 'buyShip', station: d.st || state.stations[0]?.id || '', role: (d.role as 'miner') ?? 'all' }; refresh(); break;
    case 'buyship': result(A.buyShip(state, d.cls!, d.st!)); break;
    case 'trade-toggle': {
      const st = stationById(state, d.st!);
      if (!st) break;
      const k = d.k as 'buy' | 'sell';
      const rule = st.trade[d.ware!] ?? defaultTradeRule(st, d.ware!);
      A.setTradeRule(state, st.id, d.ware!, { [k]: !rule[k] });
      refresh();
      break;
    }
    case 'miner-ware': result(A.setMinerWare(state, d.id!, d.ware ?? '')); break;
    case 'trader-mode': {
      const s = state.ships.find((x) => x.id === d.id);
      if (!s) break;
      if (d.mode === 'route' && !s.route) {
        const home = stationById(state, s.home)!;
        s.route = { from: { kind: 'station', id: home.id }, to: { kind: 'market', sector: home.sector }, ware: 'energycells' };
      }
      result(A.setTraderMode(state, s.id, d.mode as 'auto' | 'route', s.route ?? undefined));
      break;
    }
    case 'home-modal': ui.modal = { type: 'home', ship: d.id! }; refresh(); break;
    case 'set-home': ui.modal = null; result(A.setShipHome(state, d.id!, d.st!)); break;
    case 'rename-modal': ui.modal = { type: 'rename', station: d.st! }; refresh(); setTimeout(() => (document.getElementById('renameInput') as HTMLInputElement | null)?.focus(), 50); break;
    case 'rename-save': {
      const v = (document.getElementById('renameInput') as HTMLInputElement | null)?.value ?? '';
      ui.modal = null;
      result(A.renameStation(state, d.st!, v));
      break;
    }
    case 'accept': result(acceptContract(state, Number(d.id))); break;
    case 'courier-modal': ui.modal = { type: 'courier', contract: Number(d.id) }; refresh(); break;
    case 'courier': ui.modal = null; result(A.courierDeliver(state, Number(d.c), d.st!)); break;
    case 'claim': result(claimMission(state)); break;
    case 'license': {
      const r = A.buyLicense(state, d.id!);
      result(r);
      if (r.ok) gotoSector(d.id!);
      break;
    }
    case 'market-sector': ui.marketSector = d.id!; refresh(); break;
    case 'market-group': ui.marketGroup = d.g!; refresh(); break;
    case 'export': save(); ui.modal = { type: 'export' }; refresh(); break;
    case 'copy-export': {
      const t = document.getElementById('exportText') as HTMLTextAreaElement | null;
      const status = document.getElementById('copyStatus');
      if (!t) break;
      navigator.clipboard?.writeText(t.value).then(() => { if (status) status.textContent = 'In die Zwischenablage kopiert.'; }).catch(() => { t.select(); if (status) status.textContent = 'Text markiert – jetzt kopieren.'; });
      if (!navigator.clipboard) { t.select(); if (status) status.textContent = 'Text markiert – jetzt kopieren.'; }
      break;
    }
    case 'import-modal': ui.modal = { type: 'import' }; refresh(); break;
    case 'import-do': {
      const t = (document.getElementById('importText') as HTMLTextAreaElement | null)?.value ?? '';
      try {
        state = deserialize(t.trim());
        ui.modal = null;
        ui.panel = null;
        ui.selection = null;
        ui.sector = state.stations[0]?.sector ?? 'zhin';
        fitSector();
        save();
        toast('Spielstand geladen.', 'good');
      } catch {
        ui.modal = { type: 'import', error: 'Das ist kein gültiger Spielstand.' } as Modal;
      }
      refresh();
      break;
    }
  }
}

function ask(title: string, text: string, action: string, args: Record<string, string>, label: string, danger = false): void {
  ui.modal = { type: 'confirm', title, text, action, args, label, danger };
  refresh();
}

function runConfirmed(action: string, args: Record<string, string>): void {
  switch (action) {
    case 'demolish': result(A.demolishModule(state, args.st, Number(args.uid))); break;
    case 'sell-ship': {
      const r = A.sellShip(state, args.id);
      if (r.ok) { ui.panel = ui.panel?.back ?? null; if (ui.selection?.id === args.id) ui.selection = null; }
      result(r);
      break;
    }
    case 'newgame': {
      clearLocal();
      state = newGame();
      ui.panel = null;
      ui.selection = null;
      ui.sector = 'zhin';
      ui.view = 'sector';
      ui.modal = { type: 'welcome' };
      fitSector();
      save();
      refresh();
      break;
    }
  }
}

function parseEp(v: string): TradeEndpoint | null {
  const [kind, id] = v.split(':');
  if (kind === 'station' && stationById(state, id)) return { kind: 'station', id };
  if (kind === 'market' && SECTOR_MAP[id]) return { kind: 'market', sector: id };
  return null;
}

function onChange(e: Event): void {
  const el = e.target as HTMLSelectElement;
  const field = el.dataset?.change;
  if (!field) return;
  if (field === 'buy-home') {
    if (ui.modal?.type === 'buyShip') ui.modal = { ...ui.modal, station: el.value };
    refresh();
    return;
  }
  const s = state.ships.find((x) => x.id === el.dataset.id);
  if (!s) return;
  const home = stationById(state, s.home)!;
  const route = s.route ?? { from: { kind: 'station', id: home.id } as TradeEndpoint, to: { kind: 'market', sector: home.sector } as TradeEndpoint, ware: 'energycells' };
  if (field === 'route-from') { const ep = parseEp(el.value); if (ep) route.from = ep; }
  if (field === 'route-to') { const ep = parseEp(el.value); if (ep) route.to = ep; }
  if (field === 'route-ware') route.ware = el.value;
  result(A.setTraderMode(state, s.id, 'route', route));
}
