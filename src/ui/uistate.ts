import { defaultPlan, type PlanSettings } from '../engine/planner';
import type { SellModal } from './sellView';

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
  routes: boolean;
  galaxySel: string | null;
  reducedMotion: boolean;
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
  routes: true,
  galaxySel: null,
  reducedMotion: initialReducedMotion(),
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
