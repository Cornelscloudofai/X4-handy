// Stationswirtschaft: Lager, Produktion, Bau und Sektormärkte.
import { MODULE_MAP, moduleDef } from '../data/modules';
import { SHIP_CLASSES, SHIP_MAP } from '../data/ships';
import { NPC_STATIONS, SECTORS, marketInfo, sector } from '../data/sectors';
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

/** Material, das die Station gerade braucht: bestellte Schiffe der Werft und das laufende Bauprojekt */
export function pendingNeeds(st: Station): Record<string, number> {
  const out: Record<string, number> = st.yard?.queue.length ? { ...yardNeeds(st) } : {};
  for (const [id, n] of Object.entries(st.build?.need ?? {})) if (n > 0.5) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * Station kauft diese Ware nicht am Markt zu: Zukauf von Baumaterial ist abgeschaltet und die Ware wird
 * nur fürs Bauprojekt gebraucht (nicht für die Produktion oder die Werft).
 */
export function noMarketBuy(st: Station, id: string): boolean {
  if (st.autoBuyBuild !== false || !((st.build?.need?.[id] ?? 0) > 0.5)) return false;
  const prod = st.modules.some((m) => { const d = MODULE_MAP[m.def]; return d?.kind === 'production' && !!d.ware && ware(d.ware).inputs.some((i) => i.ware === id); });
  return !prod && !yardStockWares(st).includes(id);
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

export function freeUnits(st: Station, id: string): number {
  const w = WARES[id];
  const cap = storageCap(st);
  const used = usedVolume(st);
  const byLimit = wareLimit(st, id, cap) - (st.inventory[id] ?? 0);
  const byVolume = (cap[w.storage] - used[w.storage]) / w.volume;
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

/** Fehlendes Baumaterial bei den günstigsten Handelsposten in Reichweite kaufen – solange Vorrat und Credits reichen */
function buyBuildMaterials(state: GameState, st: Station): void {
  const b = st.build!;
  const keys = reachableMarkets(state);
  for (const [id, want] of Object.entries(b.need ?? {})) {
    let left = want;
    const offers = keys.filter((k) => state.markets[k]?.[id]).sort((x, y) => marketPrice(state, x, id) - marketPrice(state, y, id));
    for (const key of offers) {
      if (left < 0.5) break;
      const m = state.markets[key][id];
      const avail = Math.max(0, m.stock - m.cap * MARKET_KEEP);
      const price = marketPrice(state, key, id);
      const afford = Math.max(0, state.credits - 20_000) / Math.max(1, price * 1.2);
      const n = Math.floor(Math.min(left, avail, afford));
      if (n < 1) continue;
      const cost = applyMarketTrade(state, key, id, -n);
      st.expenses += cost;
      b.paid += cost;
      left -= n;
    }
    b.need![id] = left;
  }
}

export function stepConstruction(state: GameState, st: Station, dt: number): void {
  let left = dt;
  let guard = 0;
  while (left > 0 && guard++ < 20) {
    if (!st.build) {
      const next = st.queue[0];
      if (!next) { st.waiting = ''; return; }
      const d = moduleDef(next.def);
      st.queue.shift();
      st.waiting = '';
      // Bezahlte Positionen alter Spielstände brauchen kein Material mehr
      st.build = { def: next.def, remaining: d.buildTime, total: d.buildTime, paid: next.paid, need: next.paid > 0 ? {} : { ...d.materials }, used: {}, buyT: 0 };
    }
    const b = st.build;
    // Phase 1: Baumaterial sammeln – erst aus dem eigenen Lager, dann vom Markt
    if (b.need && Object.values(b.need).some((n) => n > 0.5)) {
      for (const [id, n] of Object.entries(b.need)) {
        const take = Math.min(n, st.inventory[id] ?? 0);
        if (take > 0) { addWare(st, id, -take); b.need[id] = n - take; b.used = { ...(b.used ?? {}), [id]: (b.used?.[id] ?? 0) + take }; }
      }
      b.buyT = (b.buyT ?? 0) - left;
      if (st.autoBuyBuild !== false && b.buyT <= 0) { b.buyT = 30; buyBuildMaterials(state, st); }
      const missing = Object.entries(b.need).filter(([, n]) => n > 0.5);
      if (missing.length) {
        const why = st.autoBuyBuild === false ? 'material' : state.credits < 50_000 ? 'credits' : 'material';
        if (st.waiting !== why) {
          const names = missing.map(([id]) => WARES[id].name).join(', ');
          log(state, `${st.name}: ${moduleDef(b.def).name} wartet auf ${why === 'credits' ? 'Credits für Baumaterial' : 'Baumaterial: ' + names}.`, 'warn');
        }
        st.waiting = why;
        return;
      }
      st.waiting = '';
    }
    // Phase 2: Bauzeit
    const step = Math.min(left, b.remaining);
    b.remaining -= step;
    left -= step;
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
      const cap = baseDemand(id) * 12 * (s.demand.includes(id) ? 1.5 : 1);
      m[id] = { stock: cap * eq, cap, eq };
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

export function stepMarkets(state: GameState, dt: number): void {
  const k = 1 - Math.exp(-dt / REVERT_SECONDS);
  for (const key in state.markets) {
    const market = state.markets[key];
    for (const id in market) {
      const m = market[id];
      m.stock += (m.eq * m.cap - m.stock) * k;
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
  const up = rand(state) < 0.5;
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
  return v;
}

export { TYPES as STORAGE_TYPES };
