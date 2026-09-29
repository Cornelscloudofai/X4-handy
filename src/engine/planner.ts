// Stationsplaner: berechnet aus gewünschten Endprodukten die komplette Modulkette
// mit exakten X4-Werten (Zykluszeit, Menge je Zyklus, Eingangsmengen).
import { MODULE_MAP } from '../data/modules';
import { WARES, inputsPerHour } from '../data/wares';
import workforce from '../data/workforce.json';
import type { Station } from './types';

export interface PlanTarget { ware: string; modules: number }

export interface PlanSettings {
  targets: PlanTarget[];
  /** Sonnenlicht in % für Solarkraftwerke */
  sunlight: number;
  /** Voller Belegschaftsbonus auf den Ausstoß (Versorgung der Belegschaft wird nicht gerechnet) */
  workforce: boolean;
  /** Herstellbare Waren, die zugekauft statt produziert werden */
  buy: string[];
  /** Manuelle Korrektur der automatisch berechneten Modulzahl je Ware */
  extra: Record<string, number>;
  /** Vorprodukte automatisch ergänzen (Entwurf). Aus: nur die angegebenen Module zählen (Stationsplanung). */
  auto?: boolean;
  /** Eigene Anordnung der Kästchen im Diagramm */
  layout?: Record<string, { x: number; y: number }>;
}

export type NodeKind = 'module' | 'mined' | 'bought';

export interface PlanNode {
  ware: string;
  kind: NodeKind;
  target: boolean;
  /** gebaute Module (ganzzahlig) */
  modules: number;
  /** rechnerisch nötige Module für den Bedarf der Kette (ohne Endprodukt-Vorgabe) */
  exact: number;
  /** Ausstoß eines Moduls pro Stunde */
  rate: number;
  prod: number;
  use: number;
  net: number;
  column: number;
  row: number;
  /** Zusätzliche Module, die für volle Versorgung der Verbraucher nötig wären */
  recommend: number;
  /** Versorgungsgrad der Eingangswaren 0..1 (1 = voll versorgt) */
  eff: number;
  /** Ware, die die Versorgung am stärksten begrenzt */
  limiting: string;
  /** Ausstoß unter Berücksichtigung der Versorgung */
  effProd: number;
  /** wird von keinem anderen Modul im Plan verbraucht */
  endProduct: boolean;
}

export interface PlanEdge { from: string; to: string; amount: number }

export interface PlanResult {
  nodes: Record<string, PlanNode>;
  edges: PlanEdge[];
  columns: string[][];
  totalModules: number;
  cost: number;
  buildTime: number;
  materials: Record<string, number>;
  revenue: number;
  purchase: number;
  /** abzubauendes Volumen in m³/h je Rohstoff */
  mining: Record<string, number>;
}

export const WORKFORCE_BONUS: Record<string, number> = workforce as Record<string, number>;

export function defaultPlan(): PlanSettings {
  return { targets: [{ ware: 'hullparts', modules: 2 }], sunlight: 100, workforce: false, buy: [], extra: {} };
}

/** Ausstoß eines Moduls pro Stunde unter den Planvorgaben */
export function moduleRate(id: string, s: Pick<PlanSettings, 'sunlight' | 'workforce'>): number {
  const w = WARES[id];
  if (!w?.cycle) return 0;
  let rate = (w.batch * 3600) / w.cycle;
  if (id === 'energycells') rate *= s.sunlight / 100;
  if (s.workforce) rate *= 1 + (WORKFORCE_BONUS[id] ?? 0);
  return rate;
}

export function producible(id: string): boolean {
  return !!WARES[id]?.cycle && !!MODULE_MAP['prod_' + id];
}

const depthCache = new Map<string, number>();
function depth(id: string, seen = new Set<string>()): number {
  const c = depthCache.get(id);
  if (c !== undefined) return c;
  const w = WARES[id];
  if (!w?.cycle || !w.inputs.length || seen.has(id)) return 0;
  seen.add(id);
  const d = 1 + Math.max(...w.inputs.map((i) => depth(i.ware, seen)));
  seen.delete(id);
  depthCache.set(id, d);
  return d;
}

export function computePlan(s: PlanSettings): PlanResult {
  const targets = new Map<string, number>();
  for (const t of s.targets) if (producible(t.ware)) targets.set(t.ware, (targets.get(t.ware) ?? 0) + Math.max(0, Math.floor(t.modules)));
  const buy = new Set(s.buy);
  const produced = (id: string) => producible(id) && !buy.has(id);

  // Alle beteiligten Waren sammeln
  const involved = new Set<string>();
  const collect = (id: string) => {
    if (involved.has(id)) return;
    involved.add(id);
    if (produced(id)) for (const i of WARES[id].inputs) collect(i.ware);
  };
  for (const id of targets.keys()) collect(id);

  // Verbraucher vor Erzeugern abarbeiten (absteigende Tiefe)
  const order = [...involved].sort((a, b) => depth(b) - depth(a));
  const need: Record<string, number> = {};
  const nodes: Record<string, PlanNode> = {};
  for (const id of order) {
    const demand = need[id] ?? 0;
    if (produced(id)) {
      const rate = moduleRate(id, s);
      const fixed = targets.get(id) ?? 0;
      const exact = rate > 0 ? demand / rate : 0;
      // Vorgegebene Endprodukt-Module decken zuerst den Bedarf der Kette
      const auto = s.auto !== false && rate > 0 ? Math.max(0, Math.ceil(Math.max(0, demand - fixed * rate) / rate - 1e-9)) : 0;
      const modules = Math.max(0, fixed + auto + (s.extra[id] ?? 0));
      nodes[id] = { ware: id, kind: 'module', target: targets.has(id), modules, exact, rate, prod: rate * modules, use: demand, net: 0, column: 0, row: 0, recommend: 0, eff: 1, limiting: '', effProd: 0, endProduct: false };
      for (const inp of inputsPerHour(id)) need[inp.ware] = (need[inp.ware] ?? 0) + inp.amount * modules;
    } else {
      nodes[id] = { ware: id, kind: WARES[id].mined ? 'mined' : 'bought', target: false, modules: 0, exact: 0, rate: 0, prod: 0, use: demand, net: 0, column: 0, row: 0, recommend: 0, eff: 1, limiting: '', effProd: 0, endProduct: false };
    }
  }
  for (const n of Object.values(nodes)) {
    n.use = need[n.ware] ?? 0;
    n.net = n.kind === 'module' ? n.prod - n.use : 0;
    n.recommend = n.kind === 'module' && n.rate > 0 && n.net < -0.5 ? Math.ceil(-n.net / n.rate - 1e-9) : 0;
  }
  // Nicht beteiligte Waren (0 Module, kein Bedarf) ausblenden
  for (const id of Object.keys(nodes)) {
    const n = nodes[id];
    if (!n.target && n.modules === 0 && n.use < 0.5) delete nodes[id];
  }
  // Versorgungsgrad: Rohstoffnahe zuerst, knappe Eingänge werden anteilig verteilt
  for (const id of [...order].reverse()) {
    const n = nodes[id];
    if (!n) continue;
    if (n.kind !== 'module') { n.effProd = Infinity; continue; }
    let eff = 1;
    for (const inp of WARES[id].inputs) {
      const src = nodes[inp.ware];
      if (!src || src.use <= 0) continue;
      const avail = src.kind === 'module' ? src.effProd : Infinity;
      const share = Math.min(1, avail / src.use);
      if (share < eff) { eff = share; n.limiting = inp.ware; }
    }
    n.eff = eff;
    n.effProd = n.prod * eff;
  }

  // Kanten: Ware fließt vom Erzeuger zum Verbraucher
  const edges: PlanEdge[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== 'module' || !n.modules) continue;
    for (const inp of inputsPerHour(n.ware)) if (nodes[inp.ware]) edges.push({ from: inp.ware, to: n.ware, amount: inp.amount * n.modules });
  }
  for (const n of Object.values(nodes)) n.endProduct = n.kind === 'module' && !edges.some((e) => e.from === n.ware);

  // Spalten: Rohstoffe links, Endprodukte rechts
  const col = (id: string, seen = new Set<string>()): number => {
    const n = nodes[id];
    if (!n || n.kind !== 'module' || seen.has(id)) return 0;
    const ins = WARES[id].inputs.filter((i) => nodes[i.ware]);
    if (!ins.length) return 0;
    seen.add(id);
    return 1 + Math.max(...ins.map((i) => col(i.ware, seen)));
  };
  let maxCol = 0;
  for (const n of Object.values(nodes)) { n.column = col(n.ware); maxCol = Math.max(maxCol, n.column); }
  for (const n of Object.values(nodes)) if (n.target && !edges.some((e) => e.from === n.ware)) n.column = maxCol;
  const columns: string[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const n of Object.values(nodes)) columns[n.column].push(n.ware);
  orderColumns(columns, edges, nodes);

  // Kosten und Wirtschaftlichkeit (Durchschnittspreise)
  let cost = 0, buildTime = 0, totalModules = 0, revenue = 0, purchase = 0;
  const materials: Record<string, number> = {};
  const mining: Record<string, number> = {};
  for (const n of Object.values(nodes)) {
    const w = WARES[n.ware];
    if (n.kind === 'module') {
      const m = MODULE_MAP['prod_' + n.ware];
      totalModules += n.modules;
      cost += m.cost * n.modules;
      buildTime += m.buildTime * n.modules;
      for (const [k, v] of Object.entries(m.materials)) materials[k] = (materials[k] ?? 0) + v * n.modules;
      if (n.net > 0) revenue += n.net * w.price.avg;
      if (n.net < 0) purchase += -n.net * w.price.avg;
    } else if (n.kind === 'bought') purchase += n.use * w.price.avg;
    else mining[n.ware] = n.use * w.volume;
  }
  return { nodes, edges, columns, totalModules, cost, buildTime, materials, revenue, purchase, mining };
}

/** Reihenfolge innerhalb der Spalten: Schwerpunktverfahren gegen Linienkreuzungen */
function orderColumns(columns: string[][], edges: PlanEdge[], nodes: Record<string, PlanNode>): void {
  const pos = (id: string) => nodes[id].row;
  columns.forEach((c) => c.sort((a, b) => WARES[a].name.localeCompare(WARES[b].name)).forEach((id, i) => (nodes[id].row = i)));
  for (let pass = 0; pass < 6; pass++) {
    const forward = pass % 2 === 0;
    const range = forward ? columns.map((_, i) => i) : columns.map((_, i) => columns.length - 1 - i);
    for (const ci of range) {
      const c = columns[ci];
      const score = new Map<string, number>();
      for (const id of c) {
        const nb = edges.filter((e) => (forward ? e.to === id : e.from === id)).map((e) => pos(forward ? e.from : e.to));
        score.set(id, nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos(id));
      }
      c.sort((a, b) => score.get(a)! - score.get(b)!);
      c.forEach((id, i) => (nodes[id].row = i));
    }
  }
}

// ---------- Stationsplanung ----------

export interface ModuleCount { built: number; building: number; planned: number }

/** Produktionsmodule einer Station: gebaut, im Bau, geplant */
export function stationModuleCounts(st: Station): Record<string, ModuleCount> {
  const out: Record<string, ModuleCount> = {};
  const get = (def: string) => {
    const m = MODULE_MAP[def];
    if (m?.kind !== 'production' || !m.ware) return null;
    return (out[m.ware] ??= { built: 0, building: 0, planned: 0 });
  };
  for (const m of st.modules) { const c = get(m.def); if (c) c.built++; }
  if (st.build) { const c = get(st.build.def); if (c) c.building++; }
  for (const q of st.queue) { const c = get(q.def); if (c) c.planned++; }
  return out;
}

/** Planvorgaben aus einer Station: genau ihre Module, keine automatische Ergänzung */
export function stationPlan(st: Station, sunlight: number): PlanSettings {
  const counts = stationModuleCounts(st);
  return {
    targets: Object.entries(counts).map(([ware, c]) => ({ ware, modules: c.built + c.building + c.planned })),
    sunlight,
    workforce: false,
    buy: [],
    extra: {},
    auto: false,
    layout: st.layout ?? {},
  };
}
