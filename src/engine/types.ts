// Gemeinsame Typen für Daten, Spielstand und Simulation.

export type StorageType = 'Container' | 'Solid' | 'Liquid';
export type WareGroup = 'mineral' | 'gas' | 'energy' | 'refined' | 'hightech' | 'shiptech' | 'food' | 'pharma' | 'agri';

export interface WareInput { ware: string; amount: number }

export interface WareDef {
  id: string;
  name: string;
  nameEn: string;
  group: WareGroup;
  tier: number;
  storage: StorageType;
  volume: number;
  price: { min: number; avg: number; max: number };
  /** Zykluszeit in Sekunden (0 = nicht herstellbar, wird abgebaut) */
  cycle: number;
  batch: number;
  inputs: WareInput[];
  mined: boolean;
  color: string;
  estimated?: boolean;
}

export type ModuleKind = 'production' | 'storage' | 'dock' | 'pier' | 'core';

export interface ModuleDef {
  id: string;
  x4Id: string;
  kind: ModuleKind;
  name: string;
  /** Produzierte Ware (bei Produktionsmodulen) */
  ware?: string;
  storage?: StorageType;
  capacity?: number;
  buildTime: number;
  materials: Record<string, number>;
  cost: number;
  method: string;
  /** Benötigter Ruf bei den Freien Familien, um den Bauplan zu kaufen */
  repRequired: number;
  blueprintCost: number;
  starter: boolean;
}

export type ShipRole = 'miner' | 'trader';

export interface ShipClassDef {
  id: string;
  name: string;
  role: ShipRole;
  size: 'S' | 'M' | 'L';
  storage: StorageType;
  capacity: number;
  /** Reisegeschwindigkeit in km/s (Spielwert) */
  speed: number;
  /** Abbaurate in m³/s (nur Miner) */
  miningRate: number;
  price: number;
  description: string;
}

export interface FieldDef { id: string; ware: string; x: number; z: number; r: number; richness: number }

export interface SectorDef {
  id: string;
  name: string;
  faction: FactionId;
  q: number;
  r: number;
  sunlight: number;
  fields: FieldDef[];
  tradeStation: { name: string; x: number; z: number };
  links: string[];
  licenseCost: number;
  repRequired: number;
  description: string;
  /** Waren, die hier im Überfluss produziert werden (günstiger) */
  surplus: string[];
  /** Waren, nach denen hier große Nachfrage herrscht (teurer) */
  demand: string[];
}

export type FactionId = 'frf' | 'zya';

export interface Gate { to: string; x: number; z: number; angle: number }

// ---------- Spielstand ----------

export interface ModuleInst {
  uid: number;
  def: string;
  /** Restzeit des laufenden Produktionszyklus */
  t: number;
  running: boolean;
  /** Grund, warum das Modul steht */
  stall: '' | 'input' | 'storage';
  /** Gleitender Auslastungswert 0..1 */
  util: number;
}

export interface TradeRule { buy: boolean; sell: boolean }

export interface Station {
  id: string;
  name: string;
  sector: string;
  x: number;
  z: number;
  modules: ModuleInst[];
  queue: { def: string; paid: number }[];
  build: { def: string; remaining: number; total: number; paid: number } | null;
  inventory: Record<string, number>;
  trade: Record<string, TradeRule>;
  /** Kumulierte Werte für Statistik */
  produced: Record<string, number>;
  income: number;
  expenses: number;
  founded: number;
}

export type ShipPhase =
  | 'idle'
  | 'toTarget'
  | 'docking'
  | 'mining'
  | 'toHome'
  | 'unloading'
  | 'waiting';

export interface Vec { x: number; z: number }

export interface TradeJob {
  ware: string;
  amount: number;
  from: TradeEndpoint;
  to: TradeEndpoint;
  stage: 'pickup' | 'deliver';
  contract?: number;
}

export type TradeEndpoint = { kind: 'station'; id: string } | { kind: 'market'; sector: string };

export interface RouteOrder { from: TradeEndpoint; to: TradeEndpoint; ware: string }

export interface Ship {
  id: string;
  name: string;
  cls: string;
  home: string;
  sector: string;
  x: number;
  z: number;
  heading: number;
  /** Zwischenziel-Wegpunkte (inkl. Sprungtore) */
  path: { sector: string; x: number; z: number; gateTo?: string }[];
  phase: ShipPhase;
  timer: number;
  cargo: { ware: string; amount: number } | null;
  /** Miner: gewählte Ware ('' = automatisch) */
  mineWare: string;
  miningField: string;
  mode: 'auto' | 'route';
  route: RouteOrder | null;
  job: TradeJob | null;
  status: string;
  trips: number;
  earned: number;
}

export interface NpcShip {
  id: string;
  sector: string;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  kind: 'buyer' | 'seller' | 'courier' | 'traffic';
  station: string;
  ware: string;
  amount: number;
  phase: 'in' | 'docked' | 'out';
  timer: number;
  exitX: number;
  exitZ: number;
  speed: number;
  contract?: number;
  hue: number;
}

export interface MarketWare { stock: number; cap: number; eq: number }
export type Market = Record<string, MarketWare>;

export interface Contract {
  id: number;
  sector: string;
  ware: string;
  amount: number;
  delivered: number;
  reward: number;
  rep: number;
  deadline: number;
  duration: number;
  status: 'offer' | 'active' | 'done' | 'failed';
  title: string;
  story?: boolean;
}

export interface LogEntry { t: number; text: string; kind: 'info' | 'good' | 'warn' | 'bad' }

export interface GameState {
  version: number;
  seed: number;
  time: number;
  credits: number;
  stations: Station[];
  ships: Ship[];
  npcs: NpcShip[];
  markets: Record<string, Market>;
  sectors: string[];
  blueprints: string[];
  rep: Record<FactionId, number>;
  contracts: Contract[];
  story: { index: number; claimed: boolean; startedAt: number; base: Record<string, number>; contractFloor: number };
  totals: { produced: Record<string, number>; sold: number; bought: number; mined: Record<string, number>; delivered: number };
  log: LogEntry[];
  nextId: number;
  npcTimer: Record<string, number>;
  contractTimer: number;
  savedAt: number;
  speed: number;
}
