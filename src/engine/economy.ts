// Stationswirtschaft: Lager, Produktion, Bau und Sektormärkte.
import { MODULE_MAP, moduleDef } from '../data/modules';
import { SHIP_CLASSES, SHIP_MAP } from '../data/ships';
import { NPC_STATIONS, SECTORS, SECTOR_MAP, marketInfo, sector } from '../data/sectors';
import { WARES, WARE_IDS, inputsPerHour, outputPerHour, ware } from '../data/wares';
import type { GameState, Market, Station, StorageType } from './types';
import { clamp, emit, log, rand } from './util';

const TYPES: StorageType[] = ['Container', 'Solid', 'Liquid'];

// ---------- Lager ----------

export function storageCap(st: Station): Record<StorageType, number> {
  const cap: Record<StorageType, number> = { Container: 0, Solid: 0, Liquid: 0 };
  for (const m of st.modules) {
    const d = MODULE_MAP[m.def];
    if (d?.kind === 'storage' && d.storage && d.capacity) cap[d.storage] += d.capacity;
  }
  return cap;
}

export function usedVolume(st: Station): Record<StorageType, number> {
  const used: Record<StorageType, number> = { Container: 0, Solid: 0, Liquid: 0 };
  for (const [id, n] of Object.entries(st.inventory)) {
    const w = WARES[id];
    if (w && n > 0) used[w.storage] += n * w.volume;
  }
  return used;
}

/**
 * Werftmaterial, das eine Station mit Schiffsfertigung ständig auf Vorrat hält – alle Waren, aus denen die
 * Schiffe bestehen, die sie bauen kann. So kann sie bei Bedarf sofort mehrere Schiffe nacheinander bauen.
 */
export function yardStockWares(st: Station): string[] {
  const sizes = new Set<string>();
  for (const m of st.modules) {
    const y = MODULE_MAP[m.def]?.yardSize;
    if (y === 'M') { sizes.add('S'); sizes.add('M'); }
    if (y === 'L') sizes.add('L');
  }
  if (!sizes.size) return [];
  const out = new Set<string>();
  for (const c of SHIP_CLASSES) if (sizes.has(c.size)) for (const id of Object.keys(c.materials)) out.add(id);
  return [...out];
}

/** Material, das die eigene Werft für die geplanten Schiffe noch braucht (Einheiten je Ware) */
export function yardNeeds(st: Station): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of st.yard?.queue ?? []) {
    for (const [id, n] of Object.entries(SHIP_MAP[j.cls]?.materials ?? {})) out[id] = (out[id] ?? 0) + n;
  }
  return out;
}

/** Material, das die Werft der Station für die geplanten Schiffe braucht (Einheiten je Ware) */
export function pendingNeeds(st: Station): Record<string, number> {
  return yardNeeds(st);
}

// ---------- Baulager ----------

/** Kosten des Baulagers bei der Stationsgründung – es ist vor dem Stationskern da und braucht kein Material */
export const BUILD_STORAGE_COST = 50_000;

/** Fehlmengen bis zu dieser Größe gelten als geliefert (Kaufmengen sind gebrochen, Lieferungen ab 1 Einheit sinnvoll) */
export const BUILD_TOLERANCE = 0.5;

/** Baumaterial, das die Bauliste noch braucht: Rest des laufenden Moduls und alle geplanten Module */
export function buildDemand(st: Station): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, n: number) => { if (n > 1e-6) out[id] = (out[id] ?? 0) + n; };
  if (st.build && !(st.build.paid > 0)) {
    for (const [id, n] of Object.entries(MODULE_MAP[st.build.def]?.materials ?? {})) add(id, n - (st.build.used?.[id] ?? 0));
  }
  for (const q of st.queue) if (!(q.paid > 0)) for (const [id, n] of Object.entries(MODULE_MAP[q.def]?.materials ?? {})) add(id, n);
  return out;
}

/**
 * Wie viel das Baulager von einer Ware noch aufnimmt (Bedarf der Bauliste minus Bestand).
 * market = Lieferung vom Markt oder von NPC-Händlern – bei „nur eigenes Material“ nimmt das Baulager davon nichts an.
 */
export function buildRoom(st: Station, id: string, demand = buildDemand(st), market = false): number {
  if (market && st.autoBuyBuild === false) return 0;
  return Math.max(0, (demand[id] ?? 0) - (st.buildStore?.[id] ?? 0));
}

/** Fehlendes Baumaterial je Ware */
export function buildMissing(st: Station): Record<string, number> {
  const demand = buildDemand(st);
  const out: Record<string, number> = {};
  for (const id of Object.keys(demand)) { const n = buildRoom(st, id, demand); if (n > BUILD_TOLERANCE) out[id] = n; }
  return out;
}

export function addBuildStore(st: Station, id: string, n: number): void {
  st.buildStore ??= {};
  st.buildStore[id] = Math.max(0, (st.buildStore[id] ?? 0) + n);
  if (st.buildStore[id] < 1e-6) delete st.buildStore[id];
}

/** Herkunft einer Lieferung: aus eigenen Stationen oder vom Markt/NPC-Händler */
export type WareSource = 'own' | 'market';

/** Platz an der Station für eine Lieferung: Baulager (soweit gebraucht und erlaubt) plus Stationslager */
export function roomAt(st: Station, id: string, source: WareSource = 'own'): number {
  return buildRoom(st, id, buildDemand(st), source === 'market') + freeUnits(st, id);
}

function countOwn(state: GameState, id: string, n: number): void {
  state.totals.buildOwn = { ...(state.totals.buildOwn ?? {}), [id]: Math.max(0, (state.totals.buildOwn?.[id] ?? 0) + n) };
}

/**
 * Lieferung an einer Station abladen: zuerst ins Baulager, soweit die Bauliste die Ware braucht (Marktware nur, wenn die
 * Station Zukauf erlaubt), der Rest ins Stationslager. Eigene Ware zählt für die Kampagne. Liefert die angenommene Menge.
 */
export function receiveWare(state: GameState, st: Station, id: string, n: number, source: WareSource): number {
  const toBuild = Math.min(n, buildRoom(st, id, buildDemand(st), source === 'market'));
  if (toBuild > 0) {
    addBuildStore(st, id, toBuild);
    if (source === 'own') countOwn(state, id, toBuild);
  }
  const rest = Math.max(0, Math.min(n - toBuild, freeUnits(st, id)));
  if (rest > 0) addWare(st, id, rest);
  return toBuild + rest;
}

/** Ausbaugrad des laufenden Moduls (0–1): verbautes Material nach Warenwert, höchstens so weit wie die Bauzeit */
export function buildProgress(st: Station): number {
  const b = st.build;
  if (!b) return 0;
  const time = b.total > 0 ? 1 - b.remaining / b.total : 1;
  if (b.paid > 0) return time;
  let all = 0, got = 0;
  for (const [id, n] of Object.entries(MODULE_MAP[b.def]?.materials ?? {})) {
    const v = n * (WARES[id]?.price.avg ?? 1);
    all += v;
    got += v * Math.min(1, (b.used?.[id] ?? 0) / n);
  }
  return all > 0 ? Math.min(time, got / all) : time;
}

/** Waren, die für die Station relevant sind (Produktion, Verbrauch, Handelsregeln, Bestand) */
export function stationWares(st: Station, includePlanned = true): string[] {
  const set = new Set<string>();
  const defs = st.modules.map((m) => m.def);
  if (includePlanned) {
    for (const q of st.queue) defs.push(q.def);
    if (st.build) defs.push(st.build.def);
  }
  for (const id of defs) {
    const d = MODULE_MAP[id];
    if (d?.kind !== 'production' || !d.ware) continue;
    set.add(d.ware);
    for (const i of ware(d.ware).inputs) set.add(i.ware);
  }
  for (const [id, r] of Object.entries(st.trade)) if (r.buy || r.sell) set.add(id);
  for (const id of Object.keys(pendingNeeds(st))) set.add(id);
  for (const id of Object.keys(buildDemand(st))) set.add(id);
  for (const id of yardStockWares(st)) set.add(id);
  for (const [id, n] of Object.entries(st.inventory)) if (n > 0.5) set.add(id);
  return [...set].filter((id) => WARES[id]);
}

/** Anteil einer Ware am Lagerraum ihrer Lagerart: eingestellt oder gleichmäßiger Rest */
export function storageShare(st: Station, id: string, wares = stationWares(st)): { share: number; auto: boolean } {
  const w = WARES[id];
  const same = wares.filter((x) => WARES[x].storage === w.storage);
  if (!same.includes(id)) same.push(id);
  const set = same.filter((x) => st.limits?.[x] !== undefined);
  const setSum = set.reduce((a, x) => a + (st.limits![x] ?? 0), 0);
  const scale = setSum > 1 ? 1 / setSum : 1;
  if (st.limits?.[id] !== undefined) return { share: st.limits[id] * scale, auto: false };
  const rest = Math.max(0, 1 - setSum * scale);
  const autoCount = same.length - set.length;
  return { share: autoCount ? rest / autoCount : 0, auto: true };
}

/** Mengenobergrenze einer Ware in Einheiten */
export function wareLimit(st: Station, id: string, cap = storageCap(st), wares = stationWares(st)): number {
  const w = WARES[id];
  if (!w) return 0;
  const byShare = (cap[w.storage] * storageShare(st, id, wares).share) / w.volume;
  // Werftmaterial darf seinen Bedarf immer einlagern (sonst könnte das Schiff nie starten)
  const need = pendingNeeds(st)[id] ?? 0;
  return need > byShare ? Math.min(need, cap[w.storage] / w.volume) : byShare;
}

/**
 * Platz, den laufende Produktionszyklen für ihr Ergebnis brauchen: Die Ware kommt erst am Zyklusende ins Lager, der Platz
 * ist aber schon belegt – sonst könnten Lieferungen das Lager in der Zwischenzeit füllen und es liefe über.
 */
function pendingOutput(st: Station): { volume: Record<StorageType, number>; units: Record<string, number> } {
  const volume: Record<StorageType, number> = { Container: 0, Solid: 0, Liquid: 0 };
  const units: Record<string, number> = {};
  for (const m of st.modules) {
    if (!m.running) continue;
    const d = MODULE_MAP[m.def];
    if (d?.kind !== 'production' || !d.ware) continue;
    const w = WARES[d.ware];
    const n = d.ware === 'energycells' ? (w.batch * sector(st.sector).sunlight) / 100 : w.batch;
    volume[w.storage] += n * w.volume;
    units[d.ware] = (units[d.ware] ?? 0) + n;
  }
  return { volume, units };
}

export function freeUnits(st: Station, id: string): number {
  const w = WARES[id];
  const cap = storageCap(st);
  const used = usedVolume(st);
  const pend = pendingOutput(st);
  const byLimit = wareLimit(st, id, cap) - (st.inventory[id] ?? 0) - (pend.units[id] ?? 0);
  const byVolume = (cap[w.storage] - used[w.storage] - pend.volume[w.storage]) / w.volume;
  return Math.max(0, Math.min(byLimit, byVolume));
}

export function addWare(st: Station, id: string, n: number): void {
  st.inventory[id] = Math.max(0, (st.inventory[id] ?? 0) + n);
  if (st.inventory[id] < 1e-6) delete st.inventory[id];
}

// ---------- Produktion ----------

export function producesWare(st: Station, id: string): boolean {
  return st.modules.some((m) => MODULE_MAP[m.def]?.ware === id && MODULE_MAP[m.def]?.kind === 'production');
}

export function consumesWare(st: Station, id: string, includePlanned = false): boolean {
  if ((pendingNeeds(st)[id] ?? 0) > 0) return true;
  // Werft hält ihr Material immer auf Vorrat – nicht erst, wenn ein Schiff bestellt ist
  if (yardStockWares(st).includes(id)) return true;
  const defs = st.modules.map((m) => m.def);
  if (includePlanned) {
    for (const q of st.queue) defs.push(q.def);
    if (st.build) defs.push(st.build.def);
  }
  return defs.some((d) => {
    const m = MODULE_MAP[d];
    return m?.kind === 'production' && !!m.ware && ware(m.ware).inputs.some((i) => i.ware === id);
  });
}

/** Standard-Handelsregeln: Eingangswaren kaufen, Produkte verkaufen */
export function defaultTradeRule(st: Station, id: string): { buy: boolean; sell: boolean } {
  const consumed = consumesWare(st, id, true);
  // Selbst geförderte Rohstoffe ohne Verbraucher werden verkauft (Bergbaustation)
  if (WARES[id]?.mined && !consumed) return { buy: false, sell: (st.inventory[id] ?? 0) > 0 };
  const produced = st.modules.some((m) => MODULE_MAP[m.def]?.ware === id) || st.queue.some((q) => MODULE_MAP[q.def]?.ware === id) || st.build?.def === 'prod_' + id;
  return { buy: consumed && !produced, sell: produced };
}

export function tradeRule(st: Station, id: string): { buy: boolean; sell: boolean } {
  return st.trade[id] ?? defaultTradeRule(st, id);
}

/** Nominale Stundenbilanz einer Station (bei 100 % Auslastung) */
export function stationRates(st: Station): Record<string, { prod: number; use: number }> {
  const sun = sector(st.sector).sunlight;
  const out: Record<string, { prod: number; use: number }> = {};
  const add = (id: string, k: 'prod' | 'use', n: number) => {
    out[id] ??= { prod: 0, use: 0 };
    out[id][k] += n;
  };
  for (const m of st.modules) {
    const d = MODULE_MAP[m.def];
    if (d?.kind !== 'production' || !d.ware) continue;
    add(d.ware, 'prod', outputPerHour(d.ware, sun));
    for (const i of inputsPerHour(d.ware)) add(i.ware, 'use', i.amount);
  }
  return out;
}

export function stepProduction(state: GameState, st: Station, dt: number): void {
  const sun = sector(st.sector).sunlight;
  for (const m of st.modules) {
    const d = MODULE_MAP[m.def];
    if (d?.kind !== 'production' || !d.ware) continue;
    const w = ware(d.ware);
    let left = dt;
    let ranFor = 0;
    let guard = 0;
    while (left > 0 && guard++ < 50) {
      if (!m.running) {
        const missing = w.inputs.find((i) => (st.inventory[i.ware] ?? 0) + 1e-6 < i.amount);
        if (missing) { m.stall = 'input'; break; }
        const batch = w.id === 'energycells' ? (w.batch * sun) / 100 : w.batch;
        if (freeUnits(st, w.id) < batch) { m.stall = 'storage'; break; }
        for (const i of w.inputs) addWare(st, i.ware, -i.amount);
        m.running = true;
        m.t = w.cycle;
        m.stall = '';
      }
      const step = Math.min(left, m.t);
      m.t -= step;
      left -= step;
      ranFor += step;
      if (m.t <= 1e-6) {
        const amount = w.id === 'energycells' ? (w.batch * sun) / 100 : w.batch;
        addWare(st, w.id, amount);
        st.produced[w.id] = (st.produced[w.id] ?? 0) + amount;
        state.totals.produced[w.id] = (state.totals.produced[w.id] ?? 0) + amount;
        m.running = false;
      }
    }
    const k = Math.min(1, dt / 400);
    m.util += ((dt > 0 ? ranFor / dt : 0) - m.util) * k;
  }
}

// ---------- Bau ----------

/** Markt-Bestand, den Händler nicht abgeben (sie behalten einen Rest) */
const MARKET_KEEP = 0.1;

/** Handelsposten in Reichweite: eigene Lizenzsektoren und ihre Nachbarn */
function reachableMarkets(state: GameState): string[] {
  const set = new Set(state.sectors);
  for (const id of state.sectors) for (const l of sector(id).links) set.add(l);
  return [...set];
}

/** Was die Märkte in Reichweite von einer Ware noch abgeben */
export function marketSupply(state: GameState, id: string): number {
  let n = 0;
  for (const key of reachableMarkets(state)) {
    const m = state.markets[key]?.[id];
    if (m) n += Math.max(0, m.stock - m.cap * MARKET_KEEP);
  }
  return n;
}

/** Wie viel sich zwischen Stationslager und Baulager umladen lässt (manuell, ohne Schiff) */
export function buildMoveLimits(st: Station, id: string): { toBuild: number; toStation: number } {
  return {
    toBuild: Math.max(0, Math.min(st.inventory[id] ?? 0, buildRoom(st, id))),
    toStation: Math.max(0, Math.min(st.buildStore?.[id] ?? 0, freeUnits(st, id))),
  };
}

/** Manuell umladen: positive Menge = Stationslager → Baulager, negative = Baulager → Stationslager. Liefert die bewegte Menge. */
export function moveBuildStock(state: GameState, st: Station, id: string, amount: number): number {
  const lim = buildMoveLimits(st, id);
  if (amount > 0) {
    const n = Math.min(amount, lim.toBuild);
    if (n <= 1e-6) return 0;
    addWare(st, id, -n);
    receiveWare(state, st, id, n, 'own');
    return n;
  }
  const n = Math.min(-amount, lim.toStation);
  if (n <= 1e-6) return 0;
  addBuildStore(st, id, -n);
  addWare(st, id, n);
  countOwn(state, id, -n); // Zurückgeladenes zählt nicht mehr als verbaute eigene Ware
  return -n;
}

/**
 * Modulbau aus dem Baulager: Das Material wird anteilig zum Baufortschritt verbaut. Fehlt eine Ware, geht der Bau
 * mit dem vorhandenen Material weiter, so weit es reicht (langsamer, nach Warenwert) – und bleibt sonst prozentual stehen,
 * bis wieder geliefert wird. Fertig ist das Modul, wenn die Bauzeit um und alles Material verbaut ist.
 */
export function stepConstruction(state: GameState, st: Station, dt: number): void {
  let left = dt;
  let guard = 0;
  while (left > 1e-9 && guard++ < 20) {
    if (!st.build) {
      const next = st.queue[0];
      if (!next) { st.waiting = ''; return; }
      const d = moduleDef(next.def);
      st.queue.shift();
      st.waiting = '';
      // Bezahlte Positionen alter Spielstände brauchen kein Material mehr
      st.build = { def: next.def, remaining: d.buildTime, total: d.buildTime, paid: next.paid, used: next.paid > 0 ? { ...d.materials } : {} };
    }
    const b = st.build;
    // Bezahlte Bauten alter Spielstände haben ihr Material schon – nur die Bauzeit läuft
    const mats = b.paid > 0 ? [] : Object.entries(moduleDef(b.def).materials);
    const dtWork = Math.min(left, b.remaining);
    const cap = b.total > 0 ? Math.min(1, (b.total - b.remaining + dtWork) / b.total) : 1;
    b.used ??= {};
    let all = 0, ok = 0;
    const lacking: string[] = [];
    for (const [id, n] of mats) {
      const want = n * cap - (b.used[id] ?? 0);
      if (want > 1e-9) {
        const take = Math.min(want, st.buildStore?.[id] ?? 0);
        if (take > 0) { addBuildStore(st, id, -take); b.used[id] = (b.used[id] ?? 0) + take; }
      }
      const v = n * (WARES[id]?.price.avg ?? 1);
      all += v;
      if ((b.used[id] ?? 0) >= n * cap - BUILD_TOLERANCE) ok += v;
      else lacking.push(id);
    }
    // Bautempo nach dem Wertanteil des vorhandenen Materials
    const speed = all > 0 ? ok / all : 1;
    b.remaining = Math.max(0, b.remaining - dtWork * speed);
    left -= dtWork > 0 ? dtWork : left;
    if (lacking.length) {
      if (st.waiting !== 'material') log(state, `${st.name}: ${moduleDef(b.def).name} wartet auf Baumaterial: ${lacking.map((id) => WARES[id].name).join(', ')}.`, 'warn');
      st.waiting = 'material';
      if (speed <= 0 || b.remaining <= 1e-6) return;
      continue;
    }
    st.waiting = '';
    if (b.remaining <= 1e-6) {
      const d = moduleDef(b.def);
      st.modules.push({ uid: state.nextId++, def: d.id, t: 0, running: false, stall: '', util: 0 });
      st.build = null;
      log(state, `${st.name}: ${d.name} fertiggestellt.`, 'good', true);
      emit({ type: 'moduleDone', station: st.id, module: d.id });
    }
  }
}

export function hasDockFor(st: Station, size: 'S' | 'M' | 'L'): boolean {
  const kind = size === 'L' ? 'pier' : 'dock';
  // Die S/M-Schiffsfertigung hat eigene Andockplätze für S- und M-Schiffe
  return st.modules.some((m) => MODULE_MAP[m.def]?.kind === kind || (size !== 'L' && m.def === 'yard_m'));
}

// ---------- Märkte ----------

const REVERT_SECONDS = 4 * 3600;

export function baseDemand(id: string): number {
  return clamp(300_000 / WARES[id].price.avg, 40, 30_000);
}

export function initMarkets(state: GameState): void {
  for (const s of SECTORS) {
    if (state.markets[s.id]) continue;
    const m: Market = {};
    for (const id of WARE_IDS) {
      let eq = 0.5 + (rand(state) - 0.5) * 0.16;
      if (s.surplus.includes(id)) eq = 0.75 + rand(state) * 0.08;
      if (s.demand.includes(id)) eq = 0.18 + rand(state) * 0.08;
      // Neue Spiele: Rohstoffe nimmt der Handelsposten nur in kleinerer Menge ab (Hauptkunden sind die NPC-Fabriken)
      const rawFactor = state.start && WARES[id].mined ? RAW_POST_CAP * (LUXURY.includes(id) ? 0.15 : 1) : 1;
      const cap = baseDemand(id) * 12 * (s.demand.includes(id) ? 1.5 : 1) * rawFactor;
      // Gefertigte Waren: nur ein kleiner Startbestand im Umlauf (Grundwaren fest: zusammen 300–500 Claytronik)
      const scarce = !!state.start;
      const start = !scarce ? cap * eq : START_STOCK[id] ? START_STOCK[id][0] + rand(state) * (START_STOCK[id][1] - START_STOCK[id][0]) : manufactured(id) ? cap * eq * 0.35 : cap * eq;
      m[id] = { stock: Math.min(cap, start), cap, eq };
    }
    state.markets[s.id] = m;
  }
  // Spezialisierte NPC-Käufer: kleine Lager, hungrig (hoher Preis), begrenzte Abnahme
  for (const n of NPC_STATIONS) {
    if (state.markets[n.id]) continue;
    const m: Market = {};
    for (const id of n.buys) {
      if (!WARES[id]) continue;
      const eq = 0.12 + rand(state) * 0.18;
      const cap = baseDemand(id) * 2;
      m[id] = { stock: cap * eq, cap, eq };
    }
    state.markets[n.id] = m;
  }
}

/* Marktfunktionen: key = Sektor-ID (Handelsposten) oder ID einer NPC-Käuferstation */

export function priceAt(id: string, ratio: number): number {
  const p = WARES[id].price;
  return p.min + (p.max - p.min) * (1 - clamp(ratio, 0, 1));
}

export function marketPrice(state: GameState, key: string, id: string): number {
  const m = state.markets[key]?.[id];
  if (!m) return WARES[id].price.avg;
  return priceAt(id, m.stock / m.cap);
}

/** Wie viel der Markt aufnehmen kann (Einheiten), bevor er voll ist */
export function marketRoom(state: GameState, key: string, id: string): number {
  const m = state.markets[key]?.[id];
  return m ? Math.max(0, m.cap - m.stock) : 0;
}

export function marketStock(state: GameState, key: string, id: string): number {
  return state.markets[key]?.[id]?.stock ?? 0;
}

/** Wert eines Handels (positive Menge: Spieler verkauft an den Markt). Preis gemittelt über die Bestandsänderung. */
export function marketTradeValue(state: GameState, key: string, id: string, amount: number): number {
  const m = state.markets[key]?.[id];
  if (!m) return 0;
  const before = priceAt(id, m.stock / m.cap);
  const after = priceAt(id, (m.stock + amount) / m.cap);
  return Math.abs(amount) * (before + after) / 2;
}

export function applyMarketTrade(state: GameState, key: string, id: string, amount: number): number {
  const value = marketTradeValue(state, key, id, amount);
  const m = state.markets[key]?.[id];
  if (!m) return 0;
  m.stock = clamp(m.stock + amount, 0, m.cap);
  if (amount > 0) {
    state.credits += value;
    state.totals.sold += value;
    const f = sector(marketInfo(key).sector).faction;
    // Handel bringt etwas Ruf, aber nur bis Stufe 10 – darüber zählen Aufträge.
    if (state.rep[f] < 10) state.rep[f] = Math.min(10, state.rep[f] + value / 8_000_000);
  } else {
    state.credits -= value;
    state.totals.bought += value;
  }
  return value;
}

/**
 * Grundwaren: Baumaterial für Stationen und Module. NPC-Fabriken stellen sie von Anfang an her, und die Handelsposten
 * halten trotz knapper Bestände immer einen guten Vorrat – so ist Bauen nie blockiert.
 */
export const ESSENTIAL_WARES = ['energycells', 'hullparts', 'claytronics'];

/**
 * Anteil des üblichen Vorrats, den ein Handelsposten von sich aus hält: Rohstoffe und Energie reichlich, Grundwaren
 * fast voll, Waren aus NPC-Fabriken knapp (der Rest kommt von deren Frachtern), alle übrigen Fabrikwaren sehr knapp –
 * aber nie null, damit nichts ganz gesperrt ist.
 */
export function postShare(id: string, made: Set<string>): number {
  const w = WARES[id];
  if (!w || w.mined || id === 'energycells') return 1;
  if (ESSENTIAL_WARES.includes(id)) return 0.8;
  return made.has(id) ? 0.5 : 0.35;
}

/** Waren, die NPC-Fabriken herstellen */
export function npcMade(state: GameState): Set<string> {
  const made = new Set<string>();
  for (const key in state.npcEco ?? {}) for (const w of Object.keys(state.npcEco![key].prod)) made.add(w);
  return made;
}

/**
 * Wie viel Geld Einkäufe ausgeben dürfen: Es bleibt eine Rücklage (höchstens `reserve`, bei wenig Geld ein Fünftel des
 * Kontostands) – so können auch kleine Starts mit 20.000–50.000 Cr einkaufen.
 */
export function spendable(state: GameState, reserve: number): number {
  return Math.max(0, state.credits - Math.min(reserve, state.credits * 0.2));
}

/** Gefertigte Ware (alles außer Rohstoffen und Energiezellen) */
export function manufactured(id: string): boolean {
  const w = WARES[id];
  return !!w && !w.mined && id !== 'energycells';
}

/** Startbestand je Handelsposten [min, max] für die Grundwaren – im Umlauf für die ersten paar Module */
export const START_STOCK: Record<string, [number, number]> = { claytronics: [60, 100], hullparts: [250, 400] };
/** Notreserve: Grundwaren tröpfeln je Handelsposten langsam nach (Einheiten je Spieltag, bis höchstens) – nie ganz gesperrt */
export const TRICKLE: Record<string, { perDay: number; upTo: number }> = { claytronics: { perDay: 8, upTo: 40 }, hullparts: { perDay: 30, upTo: 150 } };
/** Neue Spiele: Rohstofflager der Handelsposten kleiner, Überschuss wird langsamer abgebaut (begrenzte Abnahme) */
export const RAW_POST_CAP = 0.4;
/** Rohstoffe ohne Abnehmer in der Produktion (Luxusware): nur sehr kleine Nachfrage am Handelsposten */
const LUXURY = ['nividium'];
const RAW_ABSORB_SECONDS = 16 * 3600;
/** Hintergrundverbrauch: gefertigte Waren am Handelsposten sinken langsam auf diesen Anteil der Lagergröße */
const POST_FLOOR = 0.03;
const CONSUME_SECONDS = 8 * 3600;

export function stepMarkets(state: GameState, dt: number): void {
  const k = 1 - Math.exp(-dt / REVERT_SECONDS);
  const kc = 1 - Math.exp(-dt / CONSUME_SECONDS);
  const made = npcMade(state);
  const scarce = !!state.start;
  for (const key in state.markets) {
    // NPC-Fabriken: Bestand ändert sich nur durch Produktion, Verbrauch und Lieferungen
    if (state.npcEco?.[key]) continue;
    const market = state.markets[key];
    const post = !!SECTOR_MAP[key];
    for (const id in market) {
      const m = market[id];
      // Neue Spiele (mit Startwahl): knapper Handelsposten; alte Spielstände behalten den großzügigen
      if (post && scarce && manufactured(id)) {
        // Handelsposten: Fabrikwaren wachsen nicht nach – Nachschub nur von NPC-Fabriken und Spielern; der Sektor
        // verbraucht sie langsam (so bleibt Nachfrage). Grundwaren tröpfeln als Notreserve nach.
        const floor = Math.max(POST_FLOOR * m.cap, START_STOCK[id]?.[1] ?? 0);
        if (m.stock > floor) m.stock += (floor - m.stock) * kc;
        const t = TRICKLE[id];
        if (t && m.stock < t.upTo) m.stock = Math.min(t.upTo, m.stock + (t.perDay * dt) / 86400);
        continue;
      }
      const target = m.eq * (post ? postShare(id, made) : 1);
      // Neue Spiele: verkaufte Rohstoffe baut der Handelsposten nur langsam ab
      const slow = post && scarce && WARES[id]?.mined && m.stock > target * m.cap;
      m.stock += (target * m.cap - m.stock) * (slow ? 1 - Math.exp(-dt / RAW_ABSORB_SECONDS) : k);
    }
  }
}

/** Gelegentliche Nachfrageschwankungen */
export function marketEvent(state: GameState): string | null {
  const s = SECTORS[Math.floor(rand(state) * SECTORS.length)];
  if (!state.sectors.includes(s.id) && !s.links.some((l) => state.sectors.includes(l))) return null;
  const candidates = WARE_IDS.filter((id) => WARES[id].tier >= 1);
  const id = candidates[Math.floor(rand(state) * candidates.length)];
  const m = state.markets[s.id][id];
  // Fabrikwaren entstehen nicht aus dem Nichts: bei ihnen gibt es nur steigende Nachfrage
  const up = (!!state.start && manufactured(id)) || rand(state) < 0.5;
  m.eq = clamp(m.eq + (up ? -0.25 : 0.25), 0.1, 0.9);
  m.stock = clamp(m.stock + (up ? -0.25 : 0.2) * m.cap, 0, m.cap);
  return up
    ? `Nachfrage nach ${WARES[id].name} in ${s.name} steigt.`
    : `Überangebot an ${WARES[id].name} in ${s.name} – Preise fallen.`;
}

// ---------- Wertermittlung ----------

export function stationValue(st: Station): number {
  let v = 0;
  for (const m of st.modules) v += MODULE_MAP[m.def]?.cost ?? 0;
  for (const [id, n] of Object.entries(st.inventory)) v += n * (WARES[id]?.price.avg ?? 0);
  // Baulager und schon verbautes Material des laufenden Moduls gehören zum Wert
  for (const [id, n] of Object.entries(st.buildStore ?? {})) v += n * (WARES[id]?.price.avg ?? 0);
  if (st.build && !(st.build.paid > 0)) for (const [id, n] of Object.entries(st.build.used ?? {})) v += n * (WARES[id]?.price.avg ?? 0);
  return v;
}

export { TYPES as STORAGE_TYPES };
