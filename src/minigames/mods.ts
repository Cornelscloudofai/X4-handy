// Schiffsmodifikationen für das Kampf-Minispiel – nach dem Vorbild der Ausrüstungsmodifikationen aus X4: je ein Platz
// für Waffe, Triebwerk, Schild und Rumpf; drei Güteklassen (grundlegend, fortgeschritten, außergewöhnlich). Beim Bau wird
// der Hauptwert innerhalb der Spanne der Güteklasse ausgewürfelt; höhere Güte bringt Zusatzeffekte. Rumpfmods haben
// einen Preis: wer panzert, wird schwerer. Bezahlt wird mit Modteilen – die gibt es für Sterne in allen Minispielen.
// Ein neuer Mod ersetzt den alten (der alte wird dabei zerlegt, wie in X4).

import { SHIPS, wingRoom, type ShipId } from './loadout';

/**
 * Mod-Sockel: Waffe, Triebwerk, Schild und Rumpf wie in X4, dazu Türme, Raketen, Hangar (Staffel) und Zielsystem.
 * Jedes Schiff hat seine eigenen Mods; ein Sockel gibt es nur, wenn das Schiff die Ausrüstung dafür hat, und große
 * Schiffe haben je Art mehrere Sockel (siehe slotCount).
 */
export type ModSlot = 'weapon' | 'engine' | 'shield' | 'chassis' | 'turret' | 'missile' | 'hangar' | 'targeting';
export type ModQuality = 1 | 2 | 3;
/**
 * Werte, die Mods verändern (Anteile: 0,1 = +10 %; missiles: Stück). t…: Türme, m…: Raketen, w…/launch: Staffel,
 * aim/lock: Zielsystem
 */
export type ModStat = 'dmg' | 'rate' | 'velocity' | 'spread' | 'speed' | 'turn' | 'special' | 'shield' | 'regen' | 'delay' | 'hull' | 'missiles'
  | 'tdmg' | 'trate' | 'tturn' | 'trange' | 'mreload' | 'mdmg' | 'mturn' | 'launch' | 'wrepair' | 'whull' | 'wdmg' | 'aim' | 'lock';

export const STAT_LABEL: Record<ModStat, string> = {
  dmg: 'Schaden', rate: 'Feuerrate', velocity: 'Geschosstempo und Reichweite', spread: 'Streuung', speed: 'Tempo', turn: 'Wendigkeit',
  special: 'Abklingzeit der Spezialfähigkeit', shield: 'Schildstärke', regen: 'Schild-Laderate', delay: 'Schild-Ladepause', hull: 'Hülle', missiles: 'Raketen',
  tdmg: 'Turmschaden', trate: 'Turm-Feuerrate', tturn: 'Schwenktempo der Türme', trange: 'Turmreichweite',
  mreload: 'Raketen-Nachladezeit', mdmg: 'Raketenschaden', mturn: 'Lenkkraft der Raketen',
  launch: 'Startabstand im Hangar', wrepair: 'Reparaturtempo im Hangar', whull: 'Panzerung der Staffel', wdmg: 'Waffen der Staffel',
  aim: 'Zielhilfe', lock: 'Erfassungsreichweite',
};
/** Werte, bei denen weniger besser ist (Anzeige mit Minus) */
const LOWER_BETTER: ModStat[] = ['spread', 'special', 'delay', 'mreload', 'launch'];

export const SLOT_INFO: Record<ModSlot, { name: string; icon: string }> = {
  weapon: { name: 'Waffe', icon: 'target' },
  engine: { name: 'Triebwerk', icon: 'routes' },
  shield: { name: 'Schild', icon: 'energy' },
  chassis: { name: 'Rumpf', icon: 'box' },
  turret: { name: 'Türme', icon: 'target' },
  missile: { name: 'Raketen', icon: 'target' },
  hangar: { name: 'Hangar', icon: 'box' },
  targeting: { name: 'Zielsystem', icon: 'target' },
};
export const SLOTS = Object.keys(SLOT_INFO) as ModSlot[];

/**
 * Sockel einer Art auf einem Schiff: 0 = gibt es nicht (keine Bordwaffen, Türme, Werfer oder Begleiter). Große Schiffe
 * haben mehr: S je einer; M zwei für Waffen und Türme; L zwei für Waffen, Türme, Schild und Rumpf; XL drei für
 * Waffen und Türme, zwei für Schild, Rumpf, Raketen und Hangar
 */
export function slotCount(ship: ShipId, slot: ModSlot): number {
  const d = SHIPS[ship];
  const big = d.cls === 'XL' ? 3 : d.cls === 'L' ? 2 : 1;
  switch (slot) {
    case 'weapon': return d.x4.weapons ? (d.cls === 'S' ? 1 : d.cls === 'XL' ? 3 : 2) : 0;
    case 'turret': return d.turrets.length ? (d.cls === 'XL' ? 3 : 2) : 0;
    case 'missile': return d.x4.launchers ? (big >= 3 ? 2 : 1) : 0;
    case 'hangar': return wingRoom(ship).total ? (d.bays ? 2 : 1) : 0;
    case 'shield': case 'chassis': return big >= 2 ? 2 : 1;
    case 'engine': case 'targeting': return 1;
  }
}

/** Sockel eines Schiffs, die es gibt (Reihenfolge wie in der Werkstatt) */
export function shipSlots(ship: ShipId): { slot: ModSlot; n: number }[] {
  return SLOTS.map((slot) => ({ slot, n: slotCount(ship, slot) })).filter((x) => x.n > 0);
}

export const QUALITY: Record<ModQuality, { name: string; color: string; cost: number; bonus: number }> = {
  1: { name: 'Grundlegend', color: '#6be38f', cost: 3, bonus: 0 },
  2: { name: 'Fortgeschritten', color: '#5fb4ff', cost: 8, bonus: 1 },
  3: { name: 'Außergewöhnlich', color: '#c58bff', cost: 16, bonus: 2 },
};

export interface ModDef {
  slot: ModSlot;
  name: string;
  desc: string;
  /** Hauptwert und Spannen je Güte */
  stat: ModStat;
  range: Record<ModQuality, [number, number]>;
  /** fester Nachteil (Anteil, negativ = schlechter) */
  cost?: [ModStat, number];
}

const R = (a: [number, number], b: [number, number], c: [number, number]): Record<ModQuality, [number, number]> => ({ 1: a, 2: b, 3: c });
export const MODS: Record<string, ModDef> = {
  // Waffe
  verstaerker: { slot: 'weapon', name: 'Schadensverstärker', desc: 'Stärkere Ladung je Geschoss.', stat: 'dmg', range: R([0.06, 0.12], [0.12, 0.2], [0.2, 0.3]) },
  kuehlung: { slot: 'weapon', name: 'Kühlkreislauf', desc: 'Kürzere Pausen zwischen Schüssen und Salven.', stat: 'rate', range: R([0.06, 0.12], [0.12, 0.18], [0.18, 0.26]) },
  spulen: { slot: 'weapon', name: 'Beschleunigerspulen', desc: 'Schnellere Geschosse fliegen weiter – leichter zu treffen.', stat: 'velocity', range: R([0.08, 0.15], [0.15, 0.25], [0.25, 0.38]) },
  fokus: { slot: 'weapon', name: 'Fokussierlinse', desc: 'Engere Streuung: mehr Treffer auf Entfernung.', stat: 'spread', range: R([0.15, 0.3], [0.3, 0.45], [0.45, 0.65]) },
  // Triebwerk
  schub: { slot: 'engine', name: 'Schubverstärker', desc: 'Mehr Vortrieb und Höchsttempo.', stat: 'speed', range: R([0.05, 0.1], [0.1, 0.16], [0.16, 0.24]) },
  duesen: { slot: 'engine', name: 'Steuerdüsen-Abstimmung', desc: 'Dreht schneller – enger um Gegner kurven.', stat: 'turn', range: R([0.08, 0.15], [0.15, 0.24], [0.24, 0.35]) },
  nachbrenner: { slot: 'engine', name: 'Nachbrenner-Kühlung', desc: 'Spezialfähigkeit früher wieder bereit.', stat: 'special', range: R([0.1, 0.18], [0.18, 0.28], [0.28, 0.4]) },
  // Schild
  zellen: { slot: 'shield', name: 'Kapazitätszellen', desc: 'Der Schild hält mehr aus.', stat: 'shield', range: R([0.08, 0.16], [0.16, 0.26], [0.26, 0.4]) },
  ladung: { slot: 'shield', name: 'Ladekreislauf', desc: 'Der Schild lädt schneller nach.', stat: 'regen', range: R([0.12, 0.22], [0.22, 0.35], [0.35, 0.5]) },
  schnellstart: { slot: 'shield', name: 'Schnellstart', desc: 'Kürzere Pause, bevor der Schild wieder lädt.', stat: 'delay', range: R([0.1, 0.2], [0.2, 0.3], [0.3, 0.42]) },
  // Rumpf – mit Nachteil
  panzer: { slot: 'chassis', name: 'Panzerplatten', desc: 'Dickere Hülle – aber schwerer: weniger Tempo.', stat: 'hull', range: R([0.12, 0.2], [0.2, 0.32], [0.32, 0.48]), cost: ['speed', -0.06] },
  leichtbau: { slot: 'chassis', name: 'Leichtbaurahmen', desc: 'Leichter und wendiger – aber weniger Hülle.', stat: 'turn', range: R([0.1, 0.18], [0.18, 0.28], [0.28, 0.4]), cost: ['hull', -0.12] },
  // Türme
  turmladung: { slot: 'turret', name: 'Turm-Energieverteiler', desc: 'Mehr Energie für jeden Turmschuss.', stat: 'tdmg', range: R([0.06, 0.12], [0.12, 0.2], [0.2, 0.3]) },
  turmkuehlung: { slot: 'turret', name: 'Turm-Kühlmäntel', desc: 'Türme feuern schneller.', stat: 'trate', range: R([0.06, 0.12], [0.12, 0.18], [0.18, 0.26]) },
  servos: { slot: 'turret', name: 'Schwenkservos', desc: 'Türme schwenken schneller auf ihr Ziel – wichtig gegen Jäger.', stat: 'tturn', range: R([0.12, 0.25], [0.25, 0.4], [0.4, 0.6]) },
  turmoptik: { slot: 'turret', name: 'Turm-Zieloptik', desc: 'Türme erfassen und treffen auf größere Entfernung.', stat: 'trange', range: R([0.06, 0.12], [0.12, 0.2], [0.2, 0.3]) },
  // Raketen
  magazin: { slot: 'missile', name: 'Erweitertes Raketenlager', desc: 'Mehr Raketen an Bord – der Umbau kostet etwas Tempo.', stat: 'missiles', range: R([1, 2], [2, 4], [4, 6]), cost: ['speed', -0.03] },
  lader: { slot: 'missile', name: 'Schnelllader', desc: 'Die Werfer sind schneller wieder bereit.', stat: 'mreload', range: R([0.1, 0.18], [0.18, 0.28], [0.28, 0.4]) },
  sprengkopf: { slot: 'missile', name: 'Verstärkte Sprengköpfe', desc: 'Jede Rakete trifft härter.', stat: 'mdmg', range: R([0.08, 0.15], [0.15, 0.25], [0.25, 0.38]) },
  suchkopf: { slot: 'missile', name: 'Suchkopf-Abstimmung', desc: 'Raketen lenken enger – weniger Fehlschüsse auf wendige Jäger.', stat: 'mturn', range: R([0.12, 0.25], [0.25, 0.4], [0.4, 0.6]) },
  // Hangar (Staffel)
  katapult: { slot: 'hangar', name: 'Startkatapult', desc: 'Kürzerer Abstand zwischen zwei Starts aus dem Hangar.', stat: 'launch', range: R([0.12, 0.22], [0.22, 0.34], [0.34, 0.5]) },
  werftcrew: { slot: 'hangar', name: 'Wartungscrew', desc: 'Beschädigte Begleiter sind schneller repariert und aufmunitioniert.', stat: 'wrepair', range: R([0.12, 0.25], [0.25, 0.4], [0.4, 0.6]) },
  staffelpanzer: { slot: 'hangar', name: 'Staffelpanzerung', desc: 'Hülle und Schild der Begleiter halten mehr aus.', stat: 'whull', range: R([0.08, 0.15], [0.15, 0.25], [0.25, 0.38]) },
  staffelwaffen: { slot: 'hangar', name: 'Waffenpflege der Staffel', desc: 'Bordwaffen und Türme der Begleiter treffen härter.', stat: 'wdmg', range: R([0.06, 0.12], [0.12, 0.2], [0.2, 0.3]) },
  // Zielsystem
  zielrechner: { slot: 'targeting', name: 'Zielrechner', desc: 'Stärkere Zielhilfe: Bordwaffen schwenken weiter auf den Vorhaltepunkt.', stat: 'aim', range: R([0.15, 0.3], [0.3, 0.5], [0.5, 0.8]) },
  sensoren: { slot: 'targeting', name: 'Sensorphalanx', desc: 'Ziele werden früher erfasst – Türme und Zielhilfe greifen weiter.', stat: 'lock', range: R([0.08, 0.15], [0.15, 0.25], [0.25, 0.38]) },
};
export const MOD_IDS = Object.keys(MODS);

/**
 * Testphase (zum Ausprobieren, später fürs Balancing anpassen): Spannen kräftig angehoben – außergewöhnlich bis
 * +100 % (bei „weniger ist besser“ bis −75 %, mehr wäre sinnlos), Zusatzeffekte 2,5-fach, Zerlegen gibt alle Modteile
 * zurück. Mit MOD_TEST = false gelten wieder die Spannen aus MODS, Zusatzeffekte einfach und ein Viertel zurück.
 */
export const MOD_TEST = true;
const TEST_RANGE: Record<ModQuality, [number, number]> = { 1: [0.12, 0.25], 2: [0.25, 0.5], 3: [0.5, 1] };
const TEST_RANGE_LOWER: Record<ModQuality, [number, number]> = { 1: [0.12, 0.25], 2: [0.25, 0.45], 3: [0.45, 0.75] };
const TEST_MISSILES: Record<ModQuality, [number, number]> = { 1: [2, 4], 2: [4, 8], 3: [8, 15] };
const BONUS_BOOST = MOD_TEST ? 2.5 : 1;
/** Anteil der Modteile, der beim Zerlegen zurückkommt */
export const REFUND = MOD_TEST ? 1 : 0.25;

/** Spanne des Hauptwerts eines Mods je Güte (in der Testphase angehoben) */
export function modRange(id: string, q: ModQuality): [number, number] {
  const d = MODS[id];
  if (!MOD_TEST) return d.range[q];
  return d.stat === 'missiles' ? TEST_MISSILES[q] : LOWER_BETTER.includes(d.stat) ? TEST_RANGE_LOWER[q] : TEST_RANGE[q];
}

/** Modteile, die beim Zerlegen eines Mods dieser Güte zurückkommen */
export function refundOf(q: ModQuality): number {
  return Math.floor(QUALITY[q].cost * REFUND);
}

/** Zusatzeffekte je Platz (höhere Güte: 1 oder 2 davon, kleiner als der Hauptwert) */
const BONUS: Record<ModSlot, [ModStat, number, number][]> = {
  weapon: [['dmg', 0.03, 0.08], ['rate', 0.03, 0.07], ['velocity', 0.05, 0.12], ['spread', 0.08, 0.2]],
  engine: [['speed', 0.03, 0.07], ['turn', 0.04, 0.1], ['special', 0.05, 0.12]],
  shield: [['shield', 0.04, 0.1], ['regen', 0.06, 0.14], ['delay', 0.05, 0.12]],
  chassis: [['hull', 0.04, 0.1], ['turn', 0.03, 0.07], ['speed', 0.02, 0.05]],
  turret: [['tdmg', 0.03, 0.08], ['trate', 0.03, 0.07], ['tturn', 0.06, 0.14], ['trange', 0.03, 0.08]],
  missile: [['mreload', 0.05, 0.12], ['mdmg', 0.04, 0.1], ['mturn', 0.06, 0.14]],
  hangar: [['launch', 0.06, 0.14], ['wrepair', 0.06, 0.14], ['whull', 0.04, 0.1], ['wdmg', 0.03, 0.08]],
  targeting: [['aim', 0.08, 0.2], ['lock', 0.04, 0.1]],
};

export interface Mod {
  id: string;
  q: ModQuality;
  /** ausgewürfelter Hauptwert und wo er in der Spanne liegt (0 … 1) */
  value: number;
  roll: number;
  bonus: { stat: ModStat; value: number }[];
}

/** Sockel eines Schiffs: je Art eine Liste (Index = Sockelnummer, leer = frei) */
export type ShipMods = Partial<Record<ModSlot, (Mod | null)[]>>;

export interface ModState {
  parts: number;
  /** insgesamt verdiente Modteile (für die Anzeige) */
  earned: number;
  /** eingebaute Mods je Schiff */
  ships: Partial<Record<ShipId, ShipMods>>;
  /** Hinweis nach der Umstellung auf Mods je Schiff: so viele Modteile wurden für die alten Mods erstattet */
  refunded?: number;
}

/** Startguthaben, damit man gleich etwas ausprobieren kann */
export const START_PARTS = 10;
const KEY = 'x4-sektorbau-mods';
let mem: ModState | null = null;

function validMod(m: unknown, slot: ModSlot): Mod | undefined {
  const o = m as Mod | null;
  if (!o || !MODS[o.id] || MODS[o.id].slot !== slot || ![1, 2, 3].includes(o.q)) return undefined;
  return { id: o.id, q: o.q, value: Number(o.value) || 0, roll: Number(o.roll) || 0, bonus: Array.isArray(o.bonus) ? o.bonus.filter((b) => b && b.stat in STAT_LABEL).map((b) => ({ stat: b.stat, value: Number(b.value) || 0 })) : [] };
}

/**
 * Zustand laden. Alter Stand (ein Satz Mods für alle Schiffe, „slots“): die Mods werden ausgebaut und ihr voller
 * Baupreis gutgeschrieben – danach baut man je Schiff neu
 */
export function modState(): ModState {
  if (mem) return mem;
  let raw: (Partial<ModState> & { slots?: Record<string, unknown> }) | null = null;
  try { raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null'); } catch { raw = null; }
  let parts = raw ? Math.max(0, Number(raw.parts) || 0) : START_PARTS, refunded = 0;
  if (raw?.slots && typeof raw.slots === 'object') {
    for (const v of Object.values(raw.slots)) {
      const q = (v as Mod | null)?.q;
      if (q === 1 || q === 2 || q === 3) refunded += QUALITY[q].cost;
    }
    parts += refunded;
  }
  const ships: ModState['ships'] = {};
  if (raw?.ships && typeof raw.ships === 'object') for (const [id, sm] of Object.entries(raw.ships)) {
    if (!(id in SHIPS) || !sm || typeof sm !== 'object') continue;
    const out: ShipMods = {};
    for (const slot of SLOTS) {
      const n = slotCount(id as ShipId, slot), list = (sm as Record<string, unknown>)[slot];
      if (!n || !Array.isArray(list)) continue;
      out[slot] = Array.from({ length: n }, (_, i) => validMod(list[i], slot) ?? null);
    }
    ships[id as ShipId] = out;
  }
  mem = { parts, earned: Math.max(0, Number(raw?.earned) || 0), ships, ...(refunded || raw?.refunded ? { refunded: refunded || Number(raw?.refunded) || 0 } : {}) };
  if (refunded) save();
  return mem;
}

function save(): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(modState())); } catch { /* Speicher nicht verfügbar */ }
}

/** Hinweis zur Erstattung gelesen */
export function ackRefund(): void {
  const s = modState();
  if (s.refunded == null) return;
  delete s.refunded;
  save();
}

/** Nur für Tests: Zustand zurücksetzen (clear = false: nur den Zwischenspeicher leeren, Gespeichertes neu lesen) */
export function resetMods(state: ModState | null = null, clear = true): void {
  mem = state;
  if (state) save();
  else if (clear) try { globalThis.localStorage?.removeItem(KEY); } catch { /* egal */ }
}

/** Mods eines Schiffs (je Art so viele Sockel, wie das Schiff hat; frei = null) */
export function shipMods(ship: ShipId): ShipMods {
  const s = modState();
  const cur = (s.ships[ship] ??= {});
  for (const { slot, n } of shipSlots(ship)) {
    const list = (cur[slot] ??= []);
    while (list.length < n) list.push(null);
    list.length = n;
  }
  return cur;
}

/** Modteile für Sterne gutschreiben (aus jedem Minispiel) */
export function earnParts(n: number): number {
  if (n <= 0) return 0;
  const s = modState();
  s.parts += n;
  s.earned += n;
  save();
  return n;
}

/** Modteile je Ergebnis: ein Teil je Stern, Tagesaufgabe und Herausforderungen doppelt */
export function partsFor(stars: number, mode: string): number {
  return stars * (mode === 'daily' || mode === 'chain' || mode === 'endless' ? 2 : 1);
}

/**
 * Mod bauen und in einen Sockel des Schiffs setzen: Hauptwert innerhalb der Spanne auswürfeln, Zusatzeffekte nach
 * Güte. Sockel idx (sonst der erste freie, sonst der erste); ein Mod darin wird zerlegt. null = zu wenig Modteile
 * oder das Schiff hat keinen solchen Sockel
 */
export function craft(ship: ShipId, id: string, q: ModQuality, idx?: number, r: () => number = Math.random): Mod | null {
  const def = MODS[id];
  const s = modState();
  if (!def || s.parts < QUALITY[q].cost) return null;
  const list = shipMods(ship)[def.slot];
  if (!list?.length) return null;
  const at = idx != null && idx >= 0 && idx < list.length ? idx : Math.max(0, list.findIndex((m) => !m));
  s.parts -= QUALITY[q].cost;
  const [lo, hi] = modRange(id, q);
  // Glockenkurve (Mittel aus zwei Würfen): Spitzenwerte sind selten
  const roll = (r() + r()) / 2;
  const value = def.stat === 'missiles' ? Math.round(lo + (hi - lo) * roll) : Math.round((lo + (hi - lo) * roll) * 1000) / 1000;
  const pool = BONUS[def.slot].filter(([st]) => st !== def.stat);
  const bonus: Mod['bonus'] = [];
  for (let k = 0; k < QUALITY[q].bonus && pool.length; k++) {
    const [st, a, b] = pool.splice(Math.floor(r() * pool.length), 1)[0];
    bonus.push({ stat: st, value: Math.round((a + (b - a) * r()) * BONUS_BOOST * 1000) / 1000 });
  }
  const mod: Mod = { id, q, value, roll, bonus };
  // ein Mod im selben Sockel wird dabei zerlegt – seine Modteile kommen wie beim Ausbauen zurück
  const old = list[at];
  if (old) s.parts += refundOf(old.q);
  list[at] = mod;
  save();
  return mod;
}

/** Mod ausbauen (wird zerlegt; Modteile kommen zurück) */
export function remove(ship: ShipId, slot: ModSlot, idx = 0): number {
  const s = modState();
  const list = shipMods(ship)[slot];
  const m = list?.[idx];
  if (!list || !m) return 0;
  list[idx] = null;
  const back = refundOf(m.q);
  s.parts += back;
  save();
  return back;
}

export type ModStats = Partial<Record<ModStat, number>>;

/** Summe aller Effekte der eingebauten Mods eines Schiffs (Vorteile positiv, Nachteile negativ) */
export function modStats(ship: ShipId): ModStats {
  const out: ModStats = {};
  const add = (st: ModStat, v: number) => { out[st] = (out[st] ?? 0) + v; };
  const sm = shipMods(ship);
  for (const s of SLOTS) for (const m of sm[s] ?? []) {
    if (!m) continue;
    const def = MODS[m.id];
    add(def.stat, m.value);
    for (const b of m.bonus) add(b.stat, b.value);
    if (def.cost) add(def.cost[0], def.cost[1]);
  }
  // „weniger ist besser“-Werte höchstens um 75 % senken
  for (const st of LOWER_BETTER) if (out[st] != null) out[st] = Math.min(0.75, out[st]!);
  return out;
}

/** Anzeige eines Effekts: „+18 % Schaden“, „−12 % Streuung“, „+3 Raketen“ */
export function fmtStat(stat: ModStat, v: number): string {
  if (stat === 'missiles') return `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} ${STAT_LABEL[stat]}`;
  const lower = LOWER_BETTER.includes(stat);
  const sign = (v >= 0) !== lower ? '+' : '−';
  return `${sign}${Math.round(Math.abs(v) * 100)} % ${STAT_LABEL[stat]}`;
}

/** Spanne eines Mods als Text */
export function fmtRange(id: string, q: ModQuality): string {
  const d = MODS[id], [a, b] = modRange(id, q);
  if (d.stat === 'missiles') return `+${a}–${b}`;
  return `${LOWER_BETTER.includes(d.stat) ? '−' : '+'}${Math.round(a * 100)}–${Math.round(b * 100)} %`;
}
