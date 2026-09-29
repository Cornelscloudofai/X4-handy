export type SelKind = 'station' | 'ship' | 'field' | 'trade' | 'gate' | 'npc';
export interface Selection { kind: SelKind; id: string }

export type PanelType = 'stations' | 'fleet' | 'missions' | 'market' | 'more' | 'station' | 'ship' | 'ware' | 'sector';
export interface Panel { type: PanelType; id?: string; tab?: string; back?: Panel | null }

export type Modal =
  | { type: 'modules'; station: string; cat: string }
  | { type: 'buyShip'; station: string; role: 'miner' | 'trader' | 'all' }
  | { type: 'confirm'; title: string; text: string; action: string; args: Record<string, string>; danger?: boolean; label: string }
  | { type: 'rename'; station: string }
  | { type: 'offline'; seconds: number; credits: number; produced: Record<string, number>; modules: number }
  | { type: 'welcome' }
  | { type: 'alerts' }
  | { type: 'export' }
  | { type: 'import'; error?: string }
  | { type: 'home'; ship: string }
  | { type: 'courier'; contract: number };

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
}

export const ui: UIState = {
  view: 'sector',
  sector: 'zhin',
  selection: null,
  placing: null,
  routes: true,
  galaxySel: null,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  panel: null,
  modal: null,
  paused: false,
  marketSector: 'zhin',
  marketGroup: 'all',
  saveStatus: '',
};

export const SPEEDS = [1, 5, 20, 60];
