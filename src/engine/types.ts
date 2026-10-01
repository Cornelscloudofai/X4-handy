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

export type ModuleKind = 'production' | 'storage' | 'dock' | 'pier' | 'core' | 'shipyard';

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
  /** Werftmodul: größte Schiffsklasse, die hier gebaut werden kann */
  yardSize?: 'M' | 'L';
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
  /** Höchstgeschwindigkeit ohne Reiseantrieb in m/s */
  maxSpeed: number;
  hullPrice: number;
  /** Grundausstattung mit Stückpreis */
  parts: { name: string; count: number; price: number }[];
  /** Baumaterial für Rumpf und Ausrüstung (Eigenbau in einer Werft) */
  materials: Record<string, number>;
  crew: number;
}

export interface FieldDef { id: string; ware: string; x: number; z: number; r: number; richness: number }

export interface NpcStationDef {
  id: string;
  name: string;
  kind: 'wharf' | 'defence' | 'factory' | 'habitat';
  x: number;
  z: number;
  /** Waren, die diese Station ankauft (begrenzte Menge, meist über Durchschnittspreis) */
  buys: string[];
}

export interface SectorDef {
  id: string;
  name: string;
  faction: FactionId;
  q: number;
  r: number;
  sunlight: number;
  fields: FieldDef[];
  tradeStation: { name: string; x: number; z: number };
  npcStations: NpcStationDef[];
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

export interface QueueItem { uid: number; def: string; paid: number }

export interface TradeRule { buy: boolean; sell: boolean }

export interface Station {
  id: string;
  name: string;
  sector: string;
  x: number;
  z: number;
  modules: ModuleInst[];
  /** Geplante Baupositionen in Reihenfolge. Bezahlt wird beim Baustart (paid > 0: bereits bezahlt, alte Spielstände). */
  queue: QueueItem[];
  /** Grund, warum die nächste Position nicht startet */
  waiting?: string;
  /** Eingestellter Anteil am Lagerraum seiner Lagerart je Ware (0..1); nicht gesetzt = automatisch */
  limits?: Record<string, number>;
  /** Einheiten, die nicht verkauft werden (für die eigene Produktion); nicht gesetzt = automatisch */
  reserve?: Record<string, number>;
  /** Eigene Anordnung der Kästchen im Fließdiagramm */
  layout?: Record<string, { x: number; y: number }>;
  build: { def: string; remaining: number; total: number; paid: number } | null;
  inventory: Record<string, number>;
  trade: Record<string, TradeRule>;
  /** Kumulierte Werte für Statistik */
  produced: Record<string, number>;
  income: number;
  expenses: number;
  founded: number;
  /** Schiffsfertigung (nur mit Werftmodul) */
  yard?: { queue: YardJob[]; build: (YardJob & { remaining: number; total: number }) | null; waiting?: string };
}

/** Schiffsbau-Auftrag einer eigenen Werft: für die eigene Flotte oder für einen Kunden */
export interface YardJob { uid: number; cls: string; order?: number }

/** Bestellung eines Schiffs durch eine Fraktion */
export interface ShipOrder {
  id: number;
  faction: FactionId;
  sector: string;
  cls: string;
  price: number;
  rep: number;
  deadline: number;
  status: 'offer' | 'active' | 'done' | 'failed';
  station?: string;
}

export type ShipPhase =
  | 'idle'
  | 'toTarget'
  | 'docking'
  | 'mining'
  | 'toHome'
  | 'unloading'
  | 'waiting'
  | 'toMarket'
  | 'selling';

export interface Vec { x: number; z: number }

export interface TradeJob {
  ware: string;
  amount: number;
  from: TradeEndpoint;
  to: TradeEndpoint;
  stage: 'pickup' | 'deliver';
  contract?: number;
}

/** market: Handelsposten eines Sektors (market fehlt) oder eine NPC-Käuferstation (market = deren ID) */
export type TradeEndpoint = { kind: 'station'; id: string } | { kind: 'market'; sector: string; market?: string };

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
  /** Miner bei vollem Heimatlager: Überschuss am Markt verkaufen (Standard) oder warten */
  fullAction?: 'sell' | 'wait';
  /** Miner: Markt, an dem die aktuelle Ladung verkauft wird */
  sellKey?: string;
  /** Miner: Sekunden, die er mit einem kleinen Rest am vollen Lager gewartet hat */
  fullWait?: number;
  miningField: string;
  mode: 'auto' | 'route';
  route: RouteOrder | null;
  job: TradeJob | null;
  /** Vom Spieler erteilte Einzelaufträge, werden vor dem Autohandel abgearbeitet */
  orders?: TradeJob[];
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
  shipOrders?: ShipOrder[];
  shipOrderTimer?: number;
  story: { index: number; claimed: boolean; startedAt: number; base: Record<string, number>; contractFloor: number };
  totals: { produced: Record<string, number>; sold: number; bought: number; mined: Record<string, number>; delivered: number; shipsBuilt?: number; shipsSold?: number };
  log: LogEntry[];
  nextId: number;
  npcTimer: Record<string, number>;
  contractTimer: number;
  savedAt: number;
  speed: number;
}
