// Stationsmodule mit echten Baumaterialien und Bauzeiten aus X4 (crissian/x4-Datensatz).
// Die Kosten ergeben sich aus den Baumaterialien zum Durchschnittspreis.
import buildCosts from './build-costs.json';
import infrastructure from './infrastructure.json';
import { WARES } from './wares';
import type { ModuleDef, StorageType } from '../engine/types';

interface RawVariant { id: string; name: string; method: string; time: number; materials: Record<string, number> }
interface RawInfra extends RawVariant { category: string; capacity?: number; storageType?: string }

const METHOD_PREFERENCE = ['Split', 'Universal', 'Argon', 'Teladi', 'Paranid', 'Terran', 'Boron'];
const STARTER = new Set(['energycells', 'refinedmetals', 'graphene', 'siliconwafers', 'water', 'superfluidcoolant', 'antimattercells']);

export function materialCost(materials: Record<string, number>): number {
  let sum = 0;
  for (const [id, n] of Object.entries(materials)) sum += n * (WARES[id]?.price.avg ?? 0);
  return Math.round(sum);
}

function repFor(wareId: string, method: string): number {
  if (STARTER.has(wareId)) return 0;
  if (!['Split', 'Universal', 'Argon'].includes(method)) return 16;
  const tier = WARES[wareId]?.tier ?? 1;
  return tier <= 1 ? 3 : tier === 2 ? 7 : 12;
}

function buildModules(): ModuleDef[] {
  const list: ModuleDef[] = [];
  for (const [wareId, variants] of Object.entries(buildCosts as unknown as Record<string, RawVariant[]>)) {
    if (!WARES[wareId]) continue;
    const pick = [...variants].sort((a, b) => METHOD_PREFERENCE.indexOf(a.method) - METHOD_PREFERENCE.indexOf(b.method))[0];
    const cost = materialCost(pick.materials);
    const rep = repFor(wareId, pick.method);
    list.push({
      id: 'prod_' + wareId,
      x4Id: pick.id,
      kind: 'production',
      name: wareId === 'energycells' ? 'Solarkraftwerk' : WARES[wareId].name + '-Fabrik',
      ware: wareId,
      buildTime: pick.time,
      materials: pick.materials,
      cost,
      method: pick.method,
      repRequired: rep,
      blueprintCost: STARTER.has(wareId) ? 0 : Math.round((cost * 0.35) / 1000) * 1000,
      starter: STARTER.has(wareId),
    });
  }
  const infra = infrastructure as unknown as RawInfra[];
  // Lager S/M/L der Split (crissian/x4): Kapazität, Bauzeit, Baumaterial
  for (const x of STORAGE) {
    const id = 'storage_' + x.type.toLowerCase() + (x.size === 'S' ? '' : '_' + x.size.toLowerCase());
    const materials = { claytronics: x.mat[0], energycells: x.mat[1], hullparts: x.mat[2] };
    const cost = materialCost(materials);
    // Nur S gibt es ab Start; M und L kauft man beim Handelsvertreter (Spielwerte für Preis und Ruf)
    const starter = x.size === 'S';
    list.push({
      id, x4Id: `module_spl_stor_${x.type.toLowerCase()}_${x.size.toLowerCase()}_01`, kind: 'storage', name: `${STORAGE_NAME[x.type]} ${x.size}`, storage: x.type,
      capacity: x.cap, buildTime: x.time, materials, cost, method: 'Split', repRequired: STORAGE_BP[x.size].rep,
      blueprintCost: STORAGE_BP[x.size].price, starter,
    });
  }
  const dock = infra.find((x) => x.id === 'module_arg_dock_m_02');
  if (dock) list.push({ id: 'dock_m', x4Id: dock.id, kind: 'dock', name: 'Dockbereich 3M6S', buildTime: dock.time, materials: dock.materials, cost: materialCost(dock.materials), method: 'Argon', repRequired: 0, blueprintCost: 0, starter: true });
  const pier = infra.find((x) => x.id === 'module_spl_pier_l_01');
  if (pier) list.push({ id: 'pier_l', x4Id: pier.id, kind: 'pier', name: 'Split 4-Dock-T-Pier', buildTime: pier.time, materials: pier.materials, cost: materialCost(pier.materials), method: 'Split', repRequired: 0, blueprintCost: 0, starter: true });
  const core = infra.find((x) => x.id === 'module_arg_conn_base_01');
  if (core) list.push({ id: 'core', x4Id: core.id, kind: 'core', name: 'Stationskern', buildTime: core.time, materials: core.materials, cost: materialCost(core.materials), method: 'Argon', repRequired: 0, blueprintCost: 0, starter: true });
  // Werftmodule (echte Baumaterialien und Bauzeiten, Universal-Methode)
  for (const y of YARDS) list.push({ ...y, kind: 'shipyard', cost: materialCost(y.materials), method: 'Universal', starter: false });
  return list;
}

const STORAGE_NAME: Record<StorageType, string> = { Container: 'Containerlager', Solid: 'Feststofflager', Liquid: 'Flüssiglager' };
const SIZE_MAT: Record<'S' | 'M' | 'L', { time: number; mat: [number, number, number] }> = {
  S: { time: 307, mat: [61, 121, 222] },
  M: { time: 455, mat: [90, 180, 329] },
  L: { time: 683, mat: [135, 270, 494] },
};
const CAPACITY: Record<StorageType, Record<'S' | 'M' | 'L', number>> = {
  Container: { S: 25_000, M: 100_000, L: 1_000_000 },
  Solid: { S: 100_000, M: 500_000, L: 1_000_000 },
  Liquid: { S: 100_000, M: 500_000, L: 1_000_000 },
};
const STORAGE_BP: Record<'S' | 'M' | 'L', { price: number; rep: number }> = {
  S: { price: 0, rep: 0 },
  M: { price: 900_000, rep: 2 },
  L: { price: 3_500_000, rep: 6 },
};
const STORAGE = (['Container', 'Solid', 'Liquid'] as StorageType[]).flatMap((type) => (['S', 'M', 'L'] as const).map((size) => ({ type, size, cap: CAPACITY[type][size], ...SIZE_MAT[size] })));

const YARDS: Omit<ModuleDef, 'kind' | 'cost' | 'method' | 'starter'>[] = [
  { id: 'yard_m', x4Id: 'module_gen_build_dockarea_m_01', name: 'S/M-Schiffsfertigung', yardSize: 'M', buildTime: 1298, materials: { claytronics: 3312, energycells: 6620, hullparts: 12112 }, repRequired: 10, blueprintCost: 12_000_000 },
  { id: 'yard_l', x4Id: 'module_gen_build_l_01', name: 'L-Schiffsfertigung', yardSize: 'L', buildTime: 731, materials: { claytronics: 1866, energycells: 3731, hullparts: 6826 }, repRequired: 15, blueprintCost: 20_000_000 },
];

export const MODULES: ModuleDef[] = buildModules();
export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export function moduleDef(id: string): ModuleDef {
  const m = MODULE_MAP[id];
  if (!m) throw new Error('Unbekanntes Modul: ' + id);
  return m;
}

/** Grundstück und Baulizenz für eine neue Station (Spielwert) */
export const PLOT_COST = 250_000;
