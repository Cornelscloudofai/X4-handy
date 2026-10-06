import { defaultPlan, type PlanSettings } from '../engine/planner';
import type { SellModal } from './sellView';
import type { ChartSpec } from './charts';

export type SelKind = 'station' | 'ship' | 'field' | 'trade' | 'gate' | 'npc' | 'npcst';
export interface Selection { kind: SelKind; id: string }

const PLAN_KEY = 'x4-sektorbau-planer-v1';

export type PanelType = 'stations' | 'fleet' | 'missions' | 'market' | 'more' | 'station' | 'ship' | 'ware' | 'sector' | 'planner' | 'blueprints';
export interface Panel { type: PanelType; id?: string; tab?: string; back?: Panel | null }

export type Modal =
  | { type: 'modules'; station: string; cat: string; at?: number }
  | { type: 'buyShip'; station: string; role: 'miner' | 'trader' | 'all' }
  | { type: 'confirm'; title: string; text: string; action: string; args: Record<string, string>; danger?: boolean; label: string }
  | { type: 'rename'; station: string }
  | { type: 'offline'; seconds: number; credits: number; produced: Record<string, number>; modules: number }
  | { type: 'welcome' }
  | { type: 'help'; topic?: string }
  | { type: 'wareIcons' }
  | { type: 'shipArt' }
  | { type: 'loadout' }
  | { type: 'minigames'; level: 1 | 2 | 3 | 4 | 5; gear: 1 | 2 | 3 }
  | { type: 'chart'; spec: ChartSpec; hours: number }
  | { type: 'alerts' }
  | { type: 'export' }
  | { type: 'import'; error?: string }
  | { type: 'home'; ship: string }
  | { type: 'courier'; contract: number; station?: string }
  | { type: 'planPick'; group: string; back?: boolean }
  | { type: 'vendor'; sector: string; npc?: string; vendor?: string }
  | { type: 'storage'; station: string; ware: string; back?: Modal }
  | { type: 'buildMove'; station: string; ware: string; toBuild?: number; toStation?: number }
  | { type: 'planBuild' }
  | { type: 'planDiagram' }
  | SellModal;

export interface UIState {
  view: 'sector' | 'galaxy';
  sector: string;
  selection: Selection | null;
  placing: { x: number; z: number; valid: boolean; msg: string; set: boolean } | null;
  /** Kartenebene Handelsrouten: Flugwege und feste Versorgungsrouten der eigenen Schiffe (Standard an) */
  routes: boolean;
  /** Kartenebene Warenflüsse: gemessene Mengen zwischen Stationen, Märkten und Feldern (Standard aus) */
  flows: boolean;
  /** Auswahl der Kartenebenen unter der Werkzeugleiste geöffnet */
  layerMenu: boolean;
  /** Warenfilter der Flusslinien ('' = alle Waren) */
  flowWare: string;
  galaxySel: string | null;
  reducedMotion: boolean;
  /** Beschriftungsdichte der Karte 0 (wenig) bis 100 (viel), Standard 50 */
  labelDensity: number;
  /** Sektor-Hintergrund: Bilder (Standard) oder erzeugte Himmel */
  bgMode: 'image' | 'procedural';
  /** Stil der Warensymbole: leuchtend (gefüllt) oder Linie */
  iconStyle: 'glow' | 'line';
  panel: Panel | null;
  modal: Modal | null;
  paused: boolean;
  marketSector: string;
  marketGroup: string;
  saveStatus: string;
  plan: PlanSettings;
  planZoom: number;
  planFocus: string;
  planChain: boolean;
  /** Suchtext je Liste (modules, blueprints, vendor, picker) */
  search: Record<string, string>;
  /** Moduldialog: nur Module mit Bauplan */
  ownedOnly: boolean;
  planEnergy: boolean;
  planSource: string;
  planDetails: boolean;
  dg: { x: number; y: number; k: number };
}

export const ui: UIState = {
  view: 'sector',
  sector: 'zhin',
  selection: null,
  placing: null,
  routes: initialLayers().routes,
  flows: initialLayers().flows,
  layerMenu: false,
  flowWare: '',
  galaxySel: null,
  reducedMotion: initialReducedMotion(),
  labelDensity: initialLabelDensity(),
  bgMode: initialBgMode(),
  iconStyle: initialIconStyle(),
  panel: null,
  modal: null,
  paused: false,
  marketSector: 'zhin',
  marketGroup: 'all',
  saveStatus: '',
  plan: loadPlan(),
  planZoom: 0.8,
  planFocus: '',
  planChain: false,
  search: {},
  ownedOnly: false,
  planEnergy: true,
  planSource: 'draft',
  planDetails: false,
  dg: { x: 0, y: 0, k: 1 },
};

function loadPlan(): PlanSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null');
    if (raw && Array.isArray(raw.targets)) return { ...defaultPlan(), ...raw };
  } catch {
    /* Speicher nicht verfügbar */
  }
  return defaultPlan();
}

export function savePlan(): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(ui.plan));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export const SPEEDS = [1, 5, 20, 60];

/** Animationen: gespeicherte Wahl, sonst die Systemeinstellung „Bewegung reduzieren“ */
function initialReducedMotion(): boolean {
  try {
    const v = localStorage.getItem('x4-sektorbau-effects');
    if (v) return v === 'reduced';
  } catch {
    /* Speicher nicht verfügbar */
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function saveMotionSetting(reduced: boolean): void {
  try {
    localStorage.setItem('x4-sektorbau-effects', reduced ? 'reduced' : 'full');
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function initialLabelDensity(): number {
  try {
    const v = Number(localStorage.getItem('x4-sektorbau-labels'));
    if (localStorage.getItem('x4-sektorbau-labels') !== null && Number.isFinite(v)) return Math.max(0, Math.min(100, v));
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 50;
}

export function saveLabelDensity(v: number): void {
  try {
    localStorage.setItem('x4-sektorbau-labels', String(v));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function initialBgMode(): 'image' | 'procedural' {
  try {
    if (localStorage.getItem('x4-sektorbau-bg') === 'procedural') return 'procedural';
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 'image';
}

export function saveBgMode(v: 'image' | 'procedural'): void {
  try {
    localStorage.setItem('x4-sektorbau-bg', v);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function initialLayers(): { routes: boolean; flows: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem('x4-sektorbau-layers') ?? 'null');
    if (v && typeof v === 'object') return { routes: v.routes !== false, flows: v.flows === true };
  } catch {
    /* Speicher nicht verfügbar */
  }
  return { routes: true, flows: false };
}

export function saveLayers(v: { routes: boolean; flows: boolean }): void {
  try {
    localStorage.setItem('x4-sektorbau-layers', JSON.stringify({ routes: v.routes, flows: v.flows }));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function initialIconStyle(): 'glow' | 'line' {
  try {
    if (localStorage.getItem('x4-sektorbau-icons') === 'glow') return 'glow';
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 'line';
}

export function saveIconStyle(v: 'glow' | 'line'): void {
  try {
    localStorage.setItem('x4-sektorbau-icons', v);
  } catch {
    /* Speicher nicht verfügbar */
  }
}
