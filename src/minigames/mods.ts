// Schiffsmodifikationen für das Kampf-Minispiel – nach dem Vorbild der Ausrüstungsmodifikationen aus X4: je ein Platz
// für Waffe, Triebwerk, Schild und Rumpf; drei Güteklassen (grundlegend, fortgeschritten, außergewöhnlich). Beim Bau wird
// der Hauptwert innerhalb der Spanne der Güteklasse ausgewürfelt; höhere Güte bringt Zusatzeffekte. Rumpfmods haben
// einen Preis: wer panzert, wird schwerer. Bezahlt wird mit Modteilen – die gibt es für Sterne in allen Minispielen.
// Ein neuer Mod ersetzt den alten (der alte wird dabei zerlegt, wie in X4).

export type ModSlot = 'weapon' | 'engine' | 'shield' | 'chassis';
export type ModQuality = 1 | 2 | 3;
/** Werte, die Mods verändern (Anteile: 0,1 = +10 %; missiles: Stück) */
export type ModStat = 'dmg' | 'rate' | 'velocity' | 'spread' | 'speed' | 'turn' | 'special' | 'shield' | 'regen' | 'delay' | 'hull' | 'missiles';

export const STAT_LABEL: Record<ModStat, string> = {
  dmg: 'Schaden', rate: 'Feuerrate', velocity: 'Geschosstempo und Reichweite', spread: 'Streuung', speed: 'Tempo', turn: 'Wendigkeit',
  special: 'Abklingzeit der Spezialfähigkeit', shield: 'Schildstärke', regen: 'Schild-Laderate', delay: 'Schild-Ladepause', hull: 'Hülle', missiles: 'Raketen',
};
/** Werte, bei denen weniger besser ist (Anzeige mit Minus) */
const LOWER_BETTER: ModStat[] = ['spread', 'special', 'delay'];

export const SLOT_INFO: Record<ModSlot, { name: string; icon: string }> = {
  weapon: { name: 'Waffe', icon: 'target' },
  engine: { name: 'Triebwerk', icon: 'routes' },
  shield: { name: 'Schild', icon: 'energy' },
  chassis: { name: 'Rumpf', icon: 'box' },
};
export const SLOTS = Object.keys(SLOT_INFO) as ModSlot[];

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

export const MODS: Record<string, ModDef> = {
  // Waffe
  verstaerker: { slot: 'weapon', name: 'Schadensverstärker', desc: 'Stärkere Ladung je Geschoss.', stat: 'dmg', range: { 1: [0.06, 0.12], 2: [0.12, 0.2], 3: [0.2, 0.3] } },
  kuehlung: { slot: 'weapon', name: 'Kühlkreislauf', desc: 'Kürzere Pausen zwischen Schüssen und Salven.', stat: 'rate', range: { 1: [0.06, 0.12], 2: [0.12, 0.18], 3: [0.18, 0.26] } },
  spulen: { slot: 'weapon', name: 'Beschleunigerspulen', desc: 'Schnellere Geschosse fliegen weiter – leichter zu treffen.', stat: 'velocity', range: { 1: [0.08, 0.15], 2: [0.15, 0.25], 3: [0.25, 0.38] } },
  fokus: { slot: 'weapon', name: 'Fokussierlinse', desc: 'Engere Streuung: mehr Treffer auf Entfernung.', stat: 'spread', range: { 1: [0.15, 0.3], 2: [0.3, 0.45], 3: [0.45, 0.65] } },
  // Triebwerk
  schub: { slot: 'engine', name: 'Schubverstärker', desc: 'Mehr Vortrieb und Höchsttempo.', stat: 'speed', range: { 1: [0.05, 0.1], 2: [0.1, 0.16], 3: [0.16, 0.24] } },
  duesen: { slot: 'engine', name: 'Steuerdüsen-Abstimmung', desc: 'Dreht schneller – enger um Gegner kurven.', stat: 'turn', range: { 1: [0.08, 0.15], 2: [0.15, 0.24], 3: [0.24, 0.35] } },
  nachbrenner: { slot: 'engine', name: 'Nachbrenner-Kühlung', desc: 'Spezialfähigkeit früher wieder bereit.', stat: 'special', range: { 1: [0.1, 0.18], 2: [0.18, 0.28], 3: [0.28, 0.4] } },
  // Schild
  zellen: { slot: 'shield', name: 'Kapazitätszellen', desc: 'Der Schild hält mehr aus.', stat: 'shield', range: { 1: [0.08, 0.16], 2: [0.16, 0.26], 3: [0.26, 0.4] } },
  ladung: { slot: 'shield', name: 'Ladekreislauf', desc: 'Der Schild lädt schneller nach.', stat: 'regen', range: { 1: [0.12, 0.22], 2: [0.22, 0.35], 3: [0.35, 0.5] } },
  schnellstart: { slot: 'shield', name: 'Schnellstart', desc: 'Kürzere Pause, bevor der Schild wieder lädt.', stat: 'delay', range: { 1: [0.1, 0.2], 2: [0.2, 0.3], 3: [0.3, 0.42] } },
  // Rumpf – mit Nachteil
  panzer: { slot: 'chassis', name: 'Panzerplatten', desc: 'Dickere Hülle – aber schwerer: weniger Tempo.', stat: 'hull', range: { 1: [0.12, 0.2], 2: [0.2, 0.32], 3: [0.32, 0.48] }, cost: ['speed', -0.06] },
  leichtbau: { slot: 'chassis', name: 'Leichtbaurahmen', desc: 'Leichter und wendiger – aber weniger Hülle.', stat: 'turn', range: { 1: [0.1, 0.18], 2: [0.18, 0.28], 3: [0.28, 0.4] }, cost: ['hull', -0.12] },
  magazin: { slot: 'chassis', name: 'Erweitertes Raketenlager', desc: 'Mehr Raketen an Bord (nur Schiffe mit Raketenwerfer) – der Umbau kostet etwas Tempo.', stat: 'missiles', range: { 1: [1, 2], 2: [2, 4], 3: [4, 6] }, cost: ['speed', -0.03] },
};
export const MOD_IDS = Object.keys(MODS);

/** Zusatzeffekte je Platz (höhere Güte: 1 oder 2 davon, kleiner als der Hauptwert) */
const BONUS: Record<ModSlot, [ModStat, number, number][]> = {
  weapon: [['dmg', 0.03, 0.08], ['rate', 0.03, 0.07], ['velocity', 0.05, 0.12], ['spread', 0.08, 0.2]],
  engine: [['speed', 0.03, 0.07], ['turn', 0.04, 0.1], ['special', 0.05, 0.12]],
  shield: [['shield', 0.04, 0.1], ['regen', 0.06, 0.14], ['delay', 0.05, 0.12]],
  chassis: [['hull', 0.04, 0.1], ['turn', 0.03, 0.07], ['speed', 0.02, 0.05]],
};

export interface Mod {
  id: string;
  q: ModQuality;
  /** ausgewürfelter Hauptwert und wo er in der Spanne liegt (0 … 1) */
  value: number;
  roll: number;
  bonus: { stat: ModStat; value: number }[];
}

export interface ModState {
  parts: number;
  /** insgesamt verdiente Modteile (für die Anzeige) */
  earned: number;
  slots: Partial<Record<ModSlot, Mod>>;
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

export function modState(): ModState {
  if (mem) return mem;
  let raw: Partial<ModState> | null = null;
  try { raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null'); } catch { raw = null; }
  const slots: ModState['slots'] = {};
  for (const s of SLOTS) { const m = validMod(raw?.slots?.[s], s); if (m) slots[s] = m; }
  mem = { parts: raw ? Math.max(0, Number(raw.parts) || 0) : START_PARTS, earned: Math.max(0, Number(raw?.earned) || 0), slots };
  return mem;
}

function save(): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(modState())); } catch { /* Speicher nicht verfügbar */ }
}

/** Nur für Tests: Zustand zurücksetzen */
export function resetMods(state: ModState | null = null): void {
  mem = state;
  if (state) save();
  else try { globalThis.localStorage?.removeItem(KEY); } catch { /* egal */ }
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

/** Mod bauen: Hauptwert innerhalb der Spanne auswürfeln, Zusatzeffekte nach Güte. null = zu wenig Modteile */
export function craft(id: string, q: ModQuality, r: () => number = Math.random): Mod | null {
  const def = MODS[id];
  const s = modState();
  if (!def || s.parts < QUALITY[q].cost) return null;
  s.parts -= QUALITY[q].cost;
  const [lo, hi] = def.range[q];
  // Glockenkurve (Mittel aus zwei Würfen): Spitzenwerte sind selten
  const roll = (r() + r()) / 2;
  const value = def.stat === 'missiles' ? Math.round(lo + (hi - lo) * roll) : Math.round((lo + (hi - lo) * roll) * 1000) / 1000;
  const pool = BONUS[def.slot].filter(([st]) => st !== def.stat);
  const bonus: Mod['bonus'] = [];
  for (let k = 0; k < QUALITY[q].bonus && pool.length; k++) {
    const [st, a, b] = pool.splice(Math.floor(r() * pool.length), 1)[0];
    bonus.push({ stat: st, value: Math.round((a + (b - a) * r()) * 1000) / 1000 });
  }
  const mod: Mod = { id, q, value, roll, bonus };
  s.slots[def.slot] = mod;
  save();
  return mod;
}

/** Mod ausbauen (wird zerlegt; ein Teil der Modteile kommt zurück) */
export function remove(slot: ModSlot): number {
  const s = modState();
  const m = s.slots[slot];
  if (!m) return 0;
  delete s.slots[slot];
  const back = Math.floor(QUALITY[m.q].cost / 4);
  s.parts += back;
  save();
  return back;
}

export type ModStats = Partial<Record<ModStat, number>>;

/** Summe aller Effekte der eingebauten Mods (Vorteile positiv, Nachteile negativ) */
export function modStats(slots: ModState['slots'] = modState().slots): ModStats {
  const out: ModStats = {};
  const add = (st: ModStat, v: number) => { out[st] = (out[st] ?? 0) + v; };
  for (const s of SLOTS) {
    const m = slots[s];
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
  const d = MODS[id], [a, b] = d.range[q];
  if (d.stat === 'missiles') return `+${a}–${b}`;
  return `${LOWER_BETTER.includes(d.stat) ? '−' : '+'}${Math.round(a * 100)}–${Math.round(b * 100)} %`;
}
