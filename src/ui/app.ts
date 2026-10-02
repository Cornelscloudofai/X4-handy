// Steuerung: Spielschleife, Karte, Eingaben, Oberfläche und Speichern
import { undo, withUndo } from './undo';
import * as Y from '../engine/yard';
import { VENDOR_MAP } from '../data/vendors';
import { deliverWithShip } from '../engine/delivery';
import { acceptShipOrder, cancelShipBuild, queueShipBuild } from '../engine/yard';
import { NPC_MAP, SECTOR_MAP, SECTOR_RADIUS } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import * as A from '../engine/actions';
import { acceptContract } from '../engine/contracts';
import { defaultTradeRule } from '../engine/economy';
import { stationById } from '../engine/logistics';
import { catchUp, step } from '../engine/sim';
import { deserialize, serialize, loadLocal, newGame, saveLocal, clearLocal } from '../engine/state';
import { claimMission } from '../engine/story';
import type { RestAction, GameState, TradeEndpoint } from '../engine/types';
import { onGameEvent } from '../engine/util';
import { Camera, attachInput } from '../render/camera';
import { GALAXY_HEX, drawGalaxy, galaxyHit, sectorCenter } from '../render/galaxyView';
import { SectorRenderer } from '../render/sectorView';
import { $, morph } from './dom';
import { fmtCr } from './format';
import { icon } from './icons';
import { setSound, sfx, soundEnabled } from './sound';
import { initDragLists, isDragging } from './dragList';
import { defaultSellModal, shipClass } from './sellView';
import { saleOffers } from '../engine/sales';
import { SPEEDS, savePlan, ui, type Modal, type Panel, type PanelType } from './uistate';
import { computePlan, producible } from '../engine/planner';
import { activePlan, buildOrder, planMissing, diagramBounds, diagramEditor, nodePositions } from './plannerView';
import { editorBusy, fitView, initDiagramEditor } from './diagramEditor';
import { MODULE_MAP } from '../data/modules';
import { WARES } from '../data/wares';
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
  initBackButton();
  document.addEventListener('change', onChange);
  initEditor();
  // Schieberegler live nachführen
  document.addEventListener('input', (e) => { const f = (e.target as HTMLElement).dataset?.change ?? ''; if (['sell-amount', 'storage-share', 'storage-reserve', 'sell-reserve', 'search', 'build-move-in', 'build-move-out'].includes(f)) onChange(e); });
  initDragLists((list, uid, to) => {
    const st = list.dataset.st;
    if (st) { withUndo(state, () => ui.plan, 'Verschieben', () => A.moveQueued(state, st, Number(uid), to)); sfx.tap(); }
    refresh();
  });
  for (const id of ['bottom', 'hud', 'panel', 'modal']) {
    const el = $(id);
    el.addEventListener('pointerdown', () => (pointerInUI = true));
  }
  window.addEventListener('pointerup', () => setTimeout(() => (pointerInUI = false), 0));
  window.addEventListener('pointercancel', () => (pointerInUI = false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  onGameEvent((e) => {
    // Während ein Dialog offen ist, stören reine Infomeldungen – sie stehen weiter im Ereignisprotokoll
    if (e.type === 'toast' && !(ui.modal && e.kind === 'info')) toast(e.text, e.kind);
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
  (window as unknown as { __game: unknown }).__game = { get state() { return state; }, cam, ui, refresh, step: (sec: number) => step(state, sec), actions: A, yard: Y, claim: () => claimMission(state), openPanel, gotoSector };
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
    if (!pointerInUI && !isDragging() && !editorBusy()) { renderUI(); dirtyUI = false; }
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
  panel.classList.toggle('wide', ui.panel?.type === 'planner');
  const modal = $('modal');
  const modalContent = modalHtml(state, ui);
  if (modal.dataset.key !== modalKey()) { modal.innerHTML = ''; modal.dataset.key = modalKey(); }
  morph(modal, modalContent);
  modal.hidden = !modalContent;
  if (needFit && ui.modal?.type === 'planDiagram') { needFit = false; requestAnimationFrame(fitEditor); }
  document.documentElement.style.setProperty('--bottom-stack', (ui.modal ? 96 : $('bottom').offsetHeight) + 'px');
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

// ---------- Zurück-Taste (Android) und Escape ----------

/** Schließt die oberste Ebene. false = nichts mehr offen */
function goBack(): boolean {
  if (ui.modal) {
    if (ui.modal.type === 'welcome') return true;
    if (ui.modal.type === 'planPick' && ui.modal.back) { ui.modal = { type: 'planDiagram' }; needFit = true; }
    else if (ui.modal.type === 'storage' && ui.modal.back) ui.modal = ui.modal.back;
    else ui.modal = null;
  } else if (ui.placing) ui.placing = null;
  else if (ui.panel) ui.panel = ui.panel.back ?? null;
  else if (ui.selection) ui.selection = null;
  else if (ui.view === 'galaxy') { gotoSector(ui.sector); return true; }
  else return false;
  refresh();
  return true;
}

let exitArmed = false;

function initBackButton(): void {
  // Ein zusätzlicher Verlaufseintrag fängt die Zurück-Taste ab, statt die App zu verlassen
  history.pushState({ x4: 1 }, '');
  window.addEventListener('popstate', () => {
    if (goBack()) { exitArmed = false; history.pushState({ x4: 1 }, ''); return; }
    if (!exitArmed) {
      exitArmed = true;
      toast('Nochmal „Zurück“ zum Verlassen', 'info');
      history.pushState({ x4: 1 }, '');
      setTimeout(() => (exitArmed = false), 2500);
      return;
    }
    history.back();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) goBack();
  });
}

/** Kamera zum Vertreter fliegen und dort den Vertreter-Dialog öffnen */
function gotoVendor(id: string): void {
  const v = VENDOR_MAP[id];
  if (!v) return;
  ui.panel = null;
  ui.modal = null;
  const place = v.npc ? NPC_MAP[v.npc] : SECTOR_MAP[v.sector].tradeStation;
  if (ui.sector !== v.sector || ui.view !== 'sector') gotoSector(v.sector);
  focusOn(place.x, place.z, v.sector);
  ui.selection = v.npc ? { kind: 'npcst', id: v.npc } : { kind: 'trade', id: v.sector };
  refresh();
  setTimeout(() => { ui.modal = { type: 'vendor', sector: v.sector, npc: v.npc, vendor: v.id }; ui.search.vendor = ''; refresh(); }, 650);
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

const UNDO_LABEL: Record<string, string> = {
  queue: 'Modul einplanen', 'q-move': 'Verschieben', 'cancel-q': 'Position entfernen', 'plan-add': 'Produkt hinzufügen',
  'plan-target': 'Ziel ändern', 'plan-extra': 'Module ändern', 'dg-mod': 'Module ändern', 'dg-rec': 'Empfehlung übernehmen',
  'plan-buy': 'Zukauf ändern', 'plan-reset': 'Plan zurücksetzen', 'dg-arrange': 'Neu anordnen', 'plan-build': 'Plan einplanen',
};

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
  const run = (): void => {
    switch (a) {
      case 'undo': {
      const l = undo(state, (p) => { ui.plan = p; savePlan(); });
      if (l) toast(`Rückgängig: ${l}`, 'info');
      refresh();
      break;
    }
    case 'sound-toggle': setSound(!soundEnabled()); refresh(); break;
      case 'plan-pick': ui.modal = { type: 'planPick', group: 'all', back: ui.modal?.type === 'planDiagram' }; refresh(); break;
      case 'plan-pick-group': if (ui.modal?.type === 'planPick') { ui.modal = { ...ui.modal, group: d.g! }; refresh(); } break;
      case 'plan-add': {
        const w = d.ware!;
        const back = ui.modal?.type === 'planPick' && ui.modal.back;
        const st = planStation();
        if (st) {
          // Stationsplanung: das Produkt kommt als neue Position in die Baureihenfolge
          const r = A.queueModule(state, st.id, 'prod_' + w, smartInsert(st, w));
          toast(r.ok ? `${WARES[w].name}-Fabrik in ${st.name} eingeplant.` : r.msg, r.ok ? 'good' : 'warn');
        } else {
          const t = ui.plan.targets.find((x) => x.ware === w);
          if (t) t.modules++;
          else ui.plan.targets.push({ ware: w, modules: 1 });
          ui.plan.buy = ui.plan.buy.filter((x) => x !== w);
          savePlan();
          toast(`${WARES[w].name} zum Entwurf hinzugefügt.`, 'good');
        }
        ui.modal = back ? { type: 'planDiagram' } : null;
        if (back) needFit = true;
        refresh();
        break;
      }
      case 'plan-target': changeModules(d.ware!, Number(d.d)); break;
      case 'plan-extra': changeModules(d.ware!, Number(d.d)); break;
      case 'dg-mod': changeModules(d.ware!, Number(d.d)); break;
      case 'dg-rec': {
        const n = Number(d.n);
        const st = planStation();
        if (st) {
          let ok = 0;
          for (let i = 0; i < n; i++) if (A.queueModule(state, st.id, 'prod_' + d.ware, smartInsert(st, d.ware!)).ok) ok++;
          toast(`${ok} × ${WARES[d.ware!].name}-Fabrik vor ihren Verbrauchern eingeplant.`, ok ? 'good' : 'warn');
          refresh();
        } else changeModules(d.ware!, n);
        break;
      }
      case 'plan-buy': {
        const w = d.ware!;
        ui.plan.buy = ui.plan.buy.includes(w) ? ui.plan.buy.filter((x) => x !== w) : [...ui.plan.buy, w];
        delete ui.plan.extra[w];
        planChanged();
        break;
      }
      case 'plan-workforce': ui.plan.workforce = !ui.plan.workforce; planChanged(); break;
      case 'plan-auto': ui.plan.auto = ui.plan.auto === false; ui.plan.extra = {}; planChanged(); break;
      case 'plan-details': ui.planDetails = !ui.planDetails; refresh(); break;
      case 'plan-energy': ui.planEnergy = !ui.planEnergy; refresh(); break;
      case 'plan-focus': ui.planFocus = ui.planFocus === d.ware ? '' : d.ware!; ui.planChain = false; refresh(); break;
      case 'plan-chain': ui.planChain = d.on === '1'; refresh(); break;
      case 'plan-reset': ui.plan = { targets: [], sunlight: 100, workforce: false, buy: [], extra: {}, auto: true, layout: {} }; ui.planFocus = ''; planChanged(); break;
      case 'plan-from-ware': {
        if (!producible(d.ware!)) break;
        ui.planSource = 'draft';
        ui.plan = { ...ui.plan, targets: [{ ware: d.ware!, modules: 1 }], buy: [], extra: {}, layout: {} };
        ui.planFocus = '';
        savePlan();
        openPanel('planner');
        break;
      }
      case 'plan-from-station': ui.planSource = d.st!; ui.planFocus = ''; openPanel('planner'); break;
      case 'plan-station': ui.planSource = d.st!; ui.planFocus = ''; openEditor(); break;
      case 'dg-fit': fitEditor(); break;
      case 'dg-arrange': {
        const st = planStation();
        if (st) st.layout = {};
        else { ui.plan.layout = {}; savePlan(); }
        refresh();
        fitEditor();
        break;
      }
      case 'build-move-open': ui.modal = { type: 'buildMove', station: d.st!, ware: d.ware! }; refresh(); break;
      case 'build-move': {
        const r = A.moveBuildStore(state, d.st!, d.ware!, Number(d.n));
        toast(r.msg, r.ok ? 'good' : 'warn');
        if (ui.modal?.type === 'buildMove') ui.modal = { type: 'buildMove', station: d.st!, ware: d.ware! };
        refresh();
        break;
      }
      case 'storage-open': ui.modal = { type: 'storage', station: d.st!, ware: d.ware!, back: ui.modal?.type === 'courier' ? ui.modal : undefined }; refresh(); break;
      case 'modal-back': ui.modal = ui.modal?.type === 'storage' ? ui.modal.back ?? null : null; refresh(); break;
      case 'storage-auto': (d.k === 'share' ? A.setStorageShare : A.setReserve)(state, d.st!, d.ware!, null); refresh(); break;
      case 'sell-open': ui.modal = defaultSellModal(state, d.st!, d.ware!); refresh(); break;
      case 'sell-ship': if (ui.modal?.type === 'sell') { const cls = shipClass(state, d.id!); ui.modal = { ...ui.modal, ship: d.id!, picked: '', amount: Math.min(ui.modal.amount || Infinity, cls.capacity / WARES[ui.modal.ware].volume) }; refresh(); } break;
      case 'sell-pick': if (ui.modal?.type === 'sell') { ui.modal = { ...ui.modal, picked: ui.modal.picked === d.id ? '' : d.id! }; refresh(); } break;
      case 'sell-prio': if (ui.modal?.type === 'sell') { ui.modal = { ...ui.modal, prio: d.p as 'price' }; refresh(); } break;
      case 'sell-amount': if (ui.modal?.type === 'sell') { ui.modal = { ...ui.modal, amount: Math.floor(Number(d.v)) }; refresh(); } break;
      case 'sell-go': {
        const m = ui.modal;
        if (m?.type !== 'sell') break;
        const cls = shipClass(state, m.ship);
        const offer = saleOffers(state, m.station, m.ware, cls, m.amount).find((o) => o.id === m.picked);
        if (!offer) { toast('Dieser Käufer ist nicht mehr verfügbar.', 'warn'); refresh(); break; }
        const r = A.sellOrder(state, m.ship, m.station, m.ware, offer.accept, offer.endpoint, offer.contract, m.repeat);
        if (r.ok) ui.modal = null;
        result(r);
        break;
      }
      case 'plan-full': openEditor(); break;
      case 'plan-build-modal': ui.modal = { type: 'planBuild' }; refresh(); break;
      case 'plan-build': {
        ui.modal = null;
        const st = stationById(state, d.st!);
        if (!st) break;
        const r = computePlan(ui.plan);
        const miss = planMissing(state, r);
        if (miss.length) { toast(`Übernahme nicht möglich: ${miss.length === 1 ? 'ein Bauplan fehlt' : `${miss.length} Baupläne fehlen`}.`, 'warn'); refresh(); break; }
        const have = (def: string) => st.modules.some((m) => m.def === def) || st.queue.some((q) => q.def === def) || st.build?.def === def;
        const basics: string[] = [];
        const haveStore = (type: string) => [...st.modules.map((m) => m.def), ...st.queue.map((q) => q.def), st.build?.def ?? ''].some((def) => MODULE_MAP[def]?.kind === 'storage' && MODULE_MAP[def]?.storage === type);
        if (!haveStore('Container')) basics.push(A.bestStorage(state, 'Container'));
        const mined = Object.values(r.nodes).filter((n) => n.kind === 'mined').map((n) => WARES[n.ware].storage);
        if (mined.includes('Solid') && !haveStore('Solid')) basics.push(A.bestStorage(state, 'Solid'));
        if (mined.includes('Liquid') && !haveStore('Liquid')) basics.push(A.bestStorage(state, 'Liquid'));
        if (!have('dock_m')) basics.push('dock_m');
        let queued = 0;
        const skipped = new Map<string, string>();
        for (const def of [...basics, ...buildOrder(r)]) {
          const res = A.queueModule(state, st.id, def);
          if (res.ok) queued++;
          else skipped.set(MODULE_MAP[def].name, res.msg);
        }
        toast(skipped.size ? `${queued} Module beauftragt. Übersprungen: ${[...skipped.keys()].join(', ')} (${[...skipped.values()][0]})` : `${queued} Module in ${st.name} beauftragt.`, skipped.size ? 'warn' : 'good');
        if (queued) { ui.selection = { kind: 'station', id: st.id }; openPanel('station', st.id, 'modules'); }
        else refresh();
        break;
      }
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
      case 'modal-modules': ui.modal = { type: 'modules', station: d.st!, cat: d.cat ?? 'production', at: d.at !== undefined ? Number(d.at) : undefined }; refresh(); break;
      case 'modules-cat': if (ui.modal?.type === 'modules') { ui.modal = { ...ui.modal, cat: d.cat! }; refresh(); } break;
      case 'queue': {
        const at = d.at !== undefined ? Number(d.at) : undefined;
        const r = A.queueModule(state, d.st!, d.def!, at);
        // Eine Einfügestelle wird mit einem Modul belegt, danach zurück zur Liste
        if (r.ok && ui.modal?.type === 'modules' && ui.modal.at !== undefined) ui.modal = null;
        result(r);
        break;
      }
      case 'q-move': result(A.moveQueued(state, d.st!, Number(d.uid), Number(d.to))); break;
      case 'cancel-build': result(A.cancelBuild(state, d.st!)); break;
      case 'buy-bp': result(A.buyBlueprint(state, d.def!, d.vendor!)); break;
      case 'open-vendor': ui.modal = { type: 'vendor', sector: d.sector!, npc: d.npc }; ui.search.vendor = ''; refresh(); break;
      case 'vendor-pick': if (ui.modal?.type === 'vendor') { ui.modal = { ...ui.modal, vendor: d.id }; refresh(); } break;
      case 'goto-vendor': gotoVendor(d.id!); break;
      case 'owned-only': ui.ownedOnly = !ui.ownedOnly; refresh(); break;
      case 'search-clear': ui.search[d.scope!] = ''; refresh(); break;
      case 'open-blueprints': ui.modal = null; openPanel('blueprints', undefined, 'buy', !!ui.panel); break;
      case 'cancel-q': result(A.cancelQueued(state, d.st!, Number(d.uid))); break;
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
      case 'prio-move': {
        const st = stationById(state, d.st!);
        if (st?.deliveryPrio) {
          const l = [...st.deliveryPrio];
          const i = l.indexOf(d.id!), j = i + Number(d.d);
          if (i >= 0 && j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; A.setDeliveryPrio(state, st.id, l); }
        }
        refresh();
        break;
      }
      case 'prio-remove': { const st = stationById(state, d.st!); if (st) result(A.setDeliveryPrio(state, st.id, (st.deliveryPrio ?? []).filter((x) => x !== d.id))); break; }
      case 'miner-rest': { const sh = state.ships.find((x) => x.id === d.id); if (sh) { sh.restAction = d.v as RestAction; sh.fullAction = undefined; } refresh(); break; }
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
      case 'order-accept': result(acceptShipOrder(state, Number(d.id), d.st!)); break;
      case 'yard-build': result(queueShipBuild(state, d.st!, d.cls!)); break;
      case 'yard-cancel': result(cancelShipBuild(state, d.st!, Number(d.uid))); break;
      case 'courier-modal': ui.modal = { type: 'courier', contract: Number(d.id) }; refresh(); break;
      case 'courier': ui.modal = null; result(A.courierDeliver(state, Number(d.c), d.st!)); break;
      case 'courier-station': if (ui.modal?.type === 'courier') { ui.modal = { ...ui.modal, station: d.st ?? '' }; refresh(); } break;
      case 'deliver-ship': { const r = deliverWithShip(state, Number(d.c), d.st!, d.ship!); if (r.ok) ui.modal = null; result(r); break; }
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
      case 'download-export': {
        const blob = new Blob([serialize(state)], { type: 'application/json' });
        const a = document.createElement('a');
        const day = Math.floor(state.time / 86400) + 1;
        a.href = URL.createObjectURL(blob);
        a.download = `x4-sektorbau-tag${day}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        const status = document.getElementById('copyStatus');
        if (status) status.textContent = 'Datei gespeichert (Downloads).';
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

  };
  const label = UNDO_LABEL[a];
  if (label) withUndo(state, () => ui.plan, label, run);
  else run();
}

function parseEp(v: string): TradeEndpoint | null {
  const [kind, id] = v.split(':');
  if (kind === 'station' && stationById(state, id)) return { kind: 'station', id };
  if (kind === 'market' && SECTOR_MAP[id]) return { kind: 'market', sector: id };
  return null;
}

// ---------- Planer und Fließdiagramm ----------

/** Station, die gerade im Planer bearbeitet wird (sonst Entwurf) */
function planStation() {
  return ui.planSource !== 'draft' ? stationById(state, ui.planSource) ?? null : null;
}

/** Neue Fabrik vor dem ersten geplanten Verbraucher ihrer Ware einsortieren */
function smartInsert(st: NonNullable<ReturnType<typeof planStation>>, ware: string): number | undefined {
  const i = st.queue.findIndex((q) => { const w = MODULE_MAP[q.def]?.ware; return !!w && WARES[w].inputs.some((x) => x.ware === ware); });
  return i >= 0 ? i : undefined;
}

/** + / − an einem Modul: in der Station als Bauposition, im Entwurf als Vorgabe */
function changeModules(ware: string, delta: number): void {
  const st = planStation();
  if (st) {
    if (delta > 0) {
      let ok = 0, msg = '';
      for (let i = 0; i < delta; i++) { const r = A.queueModule(state, st.id, 'prod_' + ware, smartInsert(st, ware)); if (r.ok) ok++; else msg = r.msg; }
      if (!ok) toast(msg, 'warn');
    } else {
      for (let i = 0; i < -delta; i++) { const r = A.unqueueLast(state, st.id, 'prod_' + ware); if (!r.ok) { toast(r.msg, 'warn'); break; } }
    }
    refresh();
    return;
  }
  const t = ui.plan.targets.find((x) => x.ware === ware);
  if (t) {
    t.modules += delta;
    if (t.modules <= 0) ui.plan.targets = ui.plan.targets.filter((x) => x !== t);
  } else {
    const n = computePlan(ui.plan).nodes[ware];
    if (delta < 0 && (!n || n.modules <= 0)) return;
    ui.plan.extra[ware] = (ui.plan.extra[ware] ?? 0) + delta;
    if (!ui.plan.extra[ware]) delete ui.plan.extra[ware];
  }
  planChanged();
}

let editorLayout: Record<string, { x: number; y: number }> | null = null;
let needFit = false;

function openEditor(): void {
  ui.modal = { type: 'planDiagram' };
  needFit = true;
  refresh();
}

function currentPositions() {
  const { settings } = activePlan(state, ui);
  const r = computePlan(settings);
  return nodePositions(r, { ...(settings.layout ?? {}), ...(editorLayout ?? {}) });
}

function fitEditor(): void {
  const svg = document.querySelector<SVGSVGElement>('svg.dg-editor');
  if (!svg) return;
  ui.dg = fitView(svg, diagramBounds(currentPositions()));
  refresh();
}

export function editorLayoutOverride() {
  return editorLayout ?? undefined;
}

function initEditor(): void {
  initDiagramEditor({
    view: () => ui.dg,
    setView: (v) => { ui.dg = v; },
    nodePos: (w) => currentPositions().get(w) ?? null,
    moveNode: (w, x, y, done) => {
      editorLayout = { ...(editorLayout ?? {}), [w]: { x: Math.round(x), y: Math.round(y) } };
      if (done) {
        const st = planStation();
        const moved = editorLayout;
        withUndo(state, () => ui.plan, 'Kästchen verschieben', () => {
          if (st) st.layout = { ...(st.layout ?? {}), ...moved };
          else { ui.plan.layout = { ...(ui.plan.layout ?? {}), ...moved }; savePlan(); }
        });
        editorLayout = null;
      }
      const modal = document.getElementById('modal');
      if (modal) morph(modal, diagramEditor(state, ui, editorLayout ?? undefined));
    },
    // Antippen: direkte Nachbarn → nochmal: ganze Kette → nochmal: aus
    tapNode: (w) => {
      if (ui.planFocus !== w) { ui.planFocus = w; ui.planChain = false; }
      else if (!ui.planChain) ui.planChain = true;
      else { ui.planFocus = ''; ui.planChain = false; }
      refresh();
    },
  });
}

function planChanged(): void {
  savePlan();
  refresh();
}

function onChange(e: Event): void {
  const el = e.target as HTMLSelectElement;
  const field = el.dataset?.change;
  if (!field) return;
  if (field === 'auto-buy-build') {
    const st = stationById(state, el.dataset.st ?? '');
    if (st) st.autoBuyBuild = (el as unknown as HTMLInputElement).checked;
    refresh();
    return;
  }
  if (field === 'prio-npc') {
    const st = stationById(state, el.dataset.st ?? '');
    if (st) {
      st.prioBeforeNpc = (el as unknown as HTMLInputElement).checked;
      toast(st.prioBeforeNpc ? `${st.name}: NPC-Händler kaufen erst, wenn die Lieferreihenfolge versorgt ist.` : `${st.name}: NPC-Händler kaufen wieder frei.`, 'good');
    }
    refresh();
    return;
  }
  if (field === 'prio-add') {
    const st = stationById(state, el.dataset.st ?? '');
    if (st && el.value) result(A.setDeliveryPrio(state, st.id, [...(st.deliveryPrio ?? []), el.value]));
    return;
  }
  if (field === 'search') {
    ui.search[el.dataset.scope ?? ''] = (el as unknown as HTMLInputElement).value;
    refresh();
    return;
  }
  if (field === 'import-file') {
    const f = (el as unknown as HTMLInputElement).files?.[0];
    const t = document.getElementById('importText') as HTMLTextAreaElement | null;
    if (f && t) f.text().then((txt) => { t.value = txt; });
    return;
  }
  if (field === 'sell-amount' && ui.modal?.type === 'sell') {
    ui.modal = { ...ui.modal, amount: Math.floor(Number(el.value)) };
    refresh();
    return;
  }
  if (field === 'sell-repeat' && ui.modal?.type === 'sell') {
    ui.modal = { ...ui.modal, repeat: (el as unknown as HTMLInputElement).checked };
    refresh();
    return;
  }
  if ((field === 'build-move-in' || field === 'build-move-out') && ui.modal?.type === 'buildMove') {
    const v = Number(el.value);
    ui.modal = field === 'build-move-in' ? { ...ui.modal, toBuild: v } : { ...ui.modal, toStation: v };
    refresh();
    return;
  }
  if (field === 'storage-share' || field === 'storage-reserve' || field === 'sell-reserve') {
    const v = Number(el.value);
    if (field === 'storage-share') A.setStorageShare(state, el.dataset.st!, el.dataset.ware!, v / 100);
    else A.setReserve(state, el.dataset.st!, el.dataset.ware!, v);
    refresh();
    return;
  }
  if (field === 'plan-source') {
    ui.planSource = el.value;
    ui.planFocus = '';
    refresh();
    return;
  }
  if (field === 'plan-sun') {
    ui.plan.sunlight = Number(el.value) || 100;
    planChanged();
    return;
  }
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
