// Ausrüstung für das Kampf-Minispiel: welches Schiff du fliegst, welche Waffen und Türme es trägt, welcher Schild.
// Vorerst frei wählbar (im Kampfmenü); später kommen Schiffe und Teile aus Werft und eigener Produktion.

export type ShipId = 'jaguar' | 'mamba' | 'asp' | 'balaur' | 'chimera' | 'dragon' | 'cobra' | 'argon';
export type WeaponId = 'puls' | 'bolzen' | 'schrot' | 'strahl' | 'plasma' | 'neutron' | 'tau' | 'thermal' | 'boson';
export type TurretId = 'puls' | 'neutron' | 'tau' | 'plasma' | 'boson';
export type ShieldId = 'leicht' | 'schwer';
/** Spezialfähigkeit auf der Taste über der Feuertaste */
export type SpecialId = 'dash' | 'sprint' | 'overdrive' | 'torpedo' | 'escort';

/** Werte aus den X4-Spieldaten, Version 9.0 (siehe docs/design/split-militaerschiffe.md) */
export interface X4Data {
  /** Hülle */
  hull: number;
  /** Triebwerke und Schilde (Anzahl, Größe wie die Schiffsklasse) */
  engines: number;
  shields: number;
  /** Waffenplätze vorn (Bordkanonen), eigene Raketenwerfer-Plätze (seit 9.0) und Türme */
  weapons: number;
  launchers: number;
  turrets: number;
  /** Raketenlager */
  missiles: number;
  /** Tempo mit Split-Kampftriebwerk Mk1 (m/s) und Drehwiderstand (Gieren) */
  v: number;
  dragYaw: number;
}

export interface ShipDef {
  name: string;
  /** Klasse für die Anzeige */
  cls: 'S' | 'M';
  role: string;
  desc: string;
  x4: X4Data;
  /** abgeleitet aus x4 (Mamba = 1): Tempo, Drehrate, Hülle (Treffer zählen entsprechend weniger), Schild, Schildladung */
  speed: number;
  turn: number;
  hull: number;
  shield: number;
  regen: number;
  /** Schildladepause im Verhältnis zur Mamba */
  delay: number;
  /** Bordkanonen: seitliche Lage in Bildpunkten, Bug oben */
  guns: number[];
  /** Größe der Waffenplätze (S oder M) – bestimmt die Werte der gewählten Waffe */
  gunSize: 's' | 'm';
  /** Türme (Lage relativ zur Schiffsmitte, Bug oben) – zielen frei */
  turrets: [number, number][];
  /** Trefferradius und Zeichengröße */
  r: number;
  size: number;
  special: SpecialId;
  /** Bildname (KI-Bild) und Ersatzbild, solange es noch keins gibt */
  sprite: string;
  fallback: string;
}

/**
 * Bezugsgrößen aus den Spieldaten 9.0: Mamba (Hülle 3600, 2 S-Schilde à 740, 330 m/s, Drehwiderstand 3,3);
 * Split-Schilde Mk1: S 740 (lädt 35/s nach 3,5 s), M 3848 (74/s nach 2 s). Waffen und Türme: siehe WEAPONS, TURRETS.
 */
const MAMBA = { hull: 3600, shield: 2 * 740, regen: 2 * 35, v: 330, dragYaw: 3.3 };
const SHIELD = { S: { cap: 740, rate: 35, delay: 3.5 }, M: { cap: 3848, rate: 74, delay: 2 } };
/** Annahme (Drehmoment der Steuerdüsen steht nicht in den Daten): M-Steuerdüsen drehen doppelt so stark wie S */
const THRUSTER = { S: 1, M: 2 };

/** Waffenplätze gleichmäßig über die Breite verteilen */
function spreadGuns(n: number, width: number): number[] {
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i / (n - 1) - 0.5) * width));
}

type ShipBase = Omit<ShipDef, 'cls' | 'speed' | 'turn' | 'hull' | 'shield' | 'regen' | 'delay' | 'gunSize' | 'guns'> & { gunWidth: number; /** Lage der Rohre wie im Bild (sonst gleichmäßig verteilt) */ gunPos?: number[] };

function ship(cls: 'S' | 'M', base: ShipBase): ShipDef {
  const d = base.x4;
  const { gunWidth, gunPos, ...rest } = base;
  return {
    ...rest,
    cls,
    speed: d.v / MAMBA.v,
    turn: (MAMBA.dragYaw / d.dragYaw) * THRUSTER[cls],
    hull: d.hull / MAMBA.hull,
    shield: (d.shields * SHIELD[cls].cap) / MAMBA.shield,
    regen: (d.shields * SHIELD[cls].rate) / MAMBA.regen,
    delay: SHIELD[cls].delay / SHIELD.S.delay,
    guns: gunPos ?? spreadGuns(d.weapons, gunWidth),
    gunSize: cls === 'M' ? 'm' : 's',
  };
}

// Split-Militärschiffe nach den X4-Spieldaten 9.0. Verhältnisse von Hülle, Schild, Tempo, Wendigkeit und Bewaffnung
// wie im Original; die Gegner werden bei stärkeren Schiffen entsprechend zahlreicher und zäher.
export const SHIPS: Record<ShipId, ShipDef> = {
  jaguar: ship('S', {
    name: 'Jaguar', role: 'Aufklärer', desc: 'Aufklärer mit phänomenalem Tempo: ein Waffenplatz, wenig Hülle, keine Raketen. Nachbrenner: kurz noch schneller.',
    x4: { hull: 2000, engines: 1, shields: 1, weapons: 1, launchers: 0, turrets: 0, missiles: 0, v: 390, dragYaw: 3.015 },
    gunWidth: 0, turrets: [], r: 10, size: 36, special: 'sprint', sprite: 'split-jaguar', fallback: 'split-jaeger-s',
  }),
  mamba: ship('S', {
    name: 'Mamba', role: 'Jäger', desc: 'Vielseitiges Arbeitstier: zwei Waffenplätze, ein Raketenwerfer, als einziger Jäger zwei Schilde. Ausweichmanöver.',
    x4: { hull: 3600, engines: 2, shields: 2, weapons: 2, launchers: 1, turrets: 0, missiles: 8, v: 330, dragYaw: 3.3 },
    gunWidth: 10, turrets: [], r: 12, size: 40, special: 'dash', sprite: 'split-jaeger-s', fallback: 'split-jaeger-s',
  }),
  asp: ship('S', {
    name: 'Asp', role: 'Jäger', desc: 'Wendiger, mittelgroßer Jäger, bei Split-Söldnern beliebt: drei Waffenplätze, ein Raketenwerfer, mehr Hülle als die Mamba, aber nur ein Schild. Ausweichmanöver.',
    x4: { hull: 4600, engines: 2, shields: 1, weapons: 3, launchers: 1, turrets: 0, missiles: 3, v: 347, dragYaw: 2.9 },
    gunWidth: 9, turrets: [], r: 12, size: 44, special: 'dash', sprite: 'split-asp', fallback: 'split-jaeger-s',
  }),
  balaur: ship('S', {
    name: 'Balaur', role: 'Schwerer Jäger', desc: 'Meisterstück der Freien Familien: vier Waffenplätze, drei Triebwerke, keine Raketen – „hart zuschlagen, schnell zuschlagen, dann weg“. Ausweichmanöver.',
    x4: { hull: 5500, engines: 3, shields: 1, weapons: 4, launchers: 0, turrets: 0, missiles: 0, v: 363, dragYaw: 3.62 },
    gunWidth: 18, gunPos: [-10.4, -7.6, 7.6, 10.4], turrets: [], r: 13, size: 48, special: 'dash', sprite: 'split-balaur', fallback: 'split-jaeger-s',
  }),
  chimera: ship('S', {
    name: 'Chimera', role: 'Schwerer Jäger', desc: 'Schwerer Jäger des Zyarth-Patriarchats: fünf Waffenplätze, vier Triebwerke, die meiste Hülle der Jäger, keine Raketen – aber ein großes Profil. Waffenüberladung: kurz doppelte Feuerrate.',
    x4: { hull: 6100, engines: 4, shields: 1, weapons: 5, launchers: 0, turrets: 0, missiles: 0, v: 394, dragYaw: 4.3 },
    gunWidth: 22, turrets: [], r: 15, size: 52, special: 'overdrive', sprite: 'split-chimera', fallback: 'split-jaeger-s',
  }),
  dragon: ship('M', {
    name: 'Dragon', role: 'Korvette', desc: 'Furchteinflößende Korvette: sechs M-Waffenplätze, ein M-Raketenwerfer, zwei Türme, nur ein Schild. Torpedo: langsamer, schwerer Schuss mit großem Flächenschaden.',
    x4: { hull: 21000, engines: 1, shields: 1, weapons: 6, launchers: 1, turrets: 2, missiles: 2, v: 478, dragYaw: 11.298 },
    gunWidth: 28, turrets: [[-12, 14], [12, 14]], r: 20, size: 80, special: 'torpedo', sprite: 'split-dragon', fallback: 'split-jaeger-s',
  }),
  cobra: ship('M', {
    name: 'Cobra', role: 'Fregatte', desc: 'Fregatte: drei M-Waffenplätze, vier Türme, zwei Schilde, drei Triebwerke, Andockplatz – keine Raketenwerfer. Begleitjäger: startet für eine Weile eine Mamba.',
    x4: { hull: 33000, engines: 3, shields: 2, weapons: 3, launchers: 0, turrets: 4, missiles: 0, v: 518, dragYaw: 11 },
    gunWidth: 16, turrets: [[-16, -10], [16, -10], [-16, 18], [16, 18]], r: 24, size: 92, special: 'escort', sprite: 'split-cobra', fallback: 'split-jaeger-s',
  }),
  argon: ship('S', {
    name: 'Argon-Jäger', role: 'Jäger', desc: 'Der Argon-Jäger aus dem Grafikvergleich – mit den Werten der Mamba.',
    x4: { hull: 3600, engines: 2, shields: 2, weapons: 2, launchers: 1, turrets: 0, missiles: 8, v: 330, dragYaw: 3.3 },
    gunWidth: 12, turrets: [], r: 12, size: 40, special: 'dash', sprite: 'argon-jaeger-s', fallback: 'argon-jaeger-s',
  }),
};
export const SHIP_IDS = Object.keys(SHIPS) as ShipId[];

/**
 * X4-Werte einer Waffe (Mk1, Spieldaten 9.0): Schaden je Geschoss, Schüsse pro Sekunde, Geschosse je Schuss,
 * Salve bzw. Magazin (Schüsse, 0 = Dauerfeuer) und Pause danach (s), Geschosstempo (m/s), Flugzeit (s),
 * Streuung (Grad). Strahl: Schaden pro Sekunde.
 */
export interface X4Gun { dmg: number; rate: number; amt: number; mag: number; reload: number; v: number; life: number; angle: number }

export interface WeaponDef {
  name: string;
  /** Split-eigene Waffe oder allgemeine Waffe (von vielen Völkern gebaut) */
  group: 'split' | 'allgemein';
  desc: string;
  /** Werte für S- und M-Waffenplätze */
  s: X4Gun;
  m: X4Gun;
  /** Strahl statt Geschossen; haftende Geschosse mit Nachbrand (Thermal-Desintegrator); Lanze: trifft sofort als Blitzstrahl */
  beam?: boolean;
  sticky?: boolean;
  rail?: boolean;
  /** Zielhilfe im Verhältnis zu sonst (Bosonenlanze: kleiner Schwenkbereich) */
  gimbal?: number;
  color: string;
  w: number;
}

// Annahmen, wo die Daten nichts hergeben (siehe docs/design/split-militaerschiffe.md):
// – Plasmakanone: die Nachladezeit fehlt; sie feuert so schnell, wie ihre Kühlung es erlaubt (Hitze ÷ Kühlung).
// – Strahlenemitter: Schaden pro Sekunde; Reichweite wie der Pulslaser.
// – Bosonenlanze: etwa ein Schuss pro Sekunde (so im Spiel; der Datenwert 12,2 s ist offenbar nicht der Schusstakt),
//   trifft als blitzschneller Strahl sofort. Plasmaturm (Zweier-Magazin): 1 s zwischen den beiden Schüssen.
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  puls: {
    name: 'Pulslaser', group: 'allgemein', color: '#7ffff0', w: 2,
    desc: 'Kurze Salven mit sehr schnellen, genauen Geschossen und großer Reichweite. Wenig Schaden, aber verlässlich.',
    s: { dmg: 36, rate: 6, amt: 1, mag: 3, reload: 0.7, v: 5000, life: 0.7, angle: 0 },
    m: { dmg: 55, rate: 8, amt: 1, mag: 3, reload: 0.7, v: 5000, life: 0.8, angle: 0 },
  },
  bolzen: {
    name: 'Bolzenrepetierer', group: 'allgemein', color: '#ffd36b', w: 2.2,
    desc: 'Lange Feuerstöße aus großen, langsameren Geschossen – danach ein paar Sekunden nachladen.',
    s: { dmg: 18, rate: 14, amt: 1, mag: 66, reload: 3.4, v: 2100, life: 1.3, angle: 0.33 },
    m: { dmg: 32, rate: 11.5, amt: 1, mag: 65, reload: 3.8, v: 2100, life: 1.7, angle: 0.33 },
  },
  schrot: {
    name: 'Schrotbatterie', group: 'allgemein', color: '#ffc070', w: 1.8,
    desc: 'Sechs Geschosse je Schuss mit Streuung: hoher Schaden auf kurze Entfernung, vor allem gegen große Ziele.',
    s: { dmg: 48, rate: 0.9, amt: 6, mag: 8, reload: 5, v: 1800, life: 1.28, angle: 1.16 },
    m: { dmg: 85, rate: 0.8, amt: 6, mag: 6, reload: 5.5, v: 1900, life: 1.474, angle: 1.16 },
  },
  strahl: {
    name: 'Strahlenemitter', group: 'allgemein', color: '#9ffcff', w: 2, beam: true,
    desc: 'Dauerstrahl: trifft sofort und genau, solange du draufhältst – dafür wenig Schaden pro Sekunde.',
    s: { dmg: 82, rate: 0, amt: 1, mag: 0, reload: 0, v: 0, life: 0, angle: 0.18 },
    m: { dmg: 135, rate: 0, amt: 1, mag: 0, reload: 0, v: 0, life: 0, angle: 0.18 },
  },
  plasma: {
    name: 'Plasmakanone', group: 'allgemein', color: '#a6ff6b', w: 5,
    desc: 'Schwere, langsame Plasmageschosse mit hohem Schaden und großer Reichweite – treffen ist schwer, aber lohnt sich.',
    s: { dmg: 720, rate: 1000 / 2600, amt: 1, mag: 0, reload: 0, v: 1200, life: 3.8, angle: 0.7 },
    m: { dmg: 1200, rate: 1000 / 2500, amt: 1, mag: 0, reload: 0, v: 1200, life: 5, angle: 0.7 },
  },
  neutron: {
    name: 'Neutronen-Gatling', group: 'split', color: '#ff8a3d', w: 2,
    desc: 'Split: ununterbrochener Strom langsamer Geschosse, etwas ungenau – viel Druck auf kurze Entfernung.',
    s: { dmg: 14, rate: 18, amt: 1, mag: 0, reload: 0, v: 2500, life: 1.2, angle: 0.5 },
    m: { dmg: 19, rate: 18, amt: 1, mag: 0, reload: 0, v: 2500, life: 1.5, angle: 0.64 },
  },
  tau: {
    name: 'Tau-Beschleuniger', group: 'split', color: '#ff5a5a', w: 2.2,
    desc: 'Split: vier Geschosse je Schuss in schneller Folge – auf kurze Entfernung verheerend, geringe Reichweite.',
    s: { dmg: 56, rate: 2.5, amt: 4, mag: 6, reload: 4, v: 2000, life: 1.235, angle: 1.25 },
    m: { dmg: 90, rate: 2, amt: 4, mag: 6, reload: 5, v: 2000, life: 1.4, angle: 1.32 },
  },
  thermal: {
    name: 'Thermal-Desintegrator', group: 'split', color: '#ff9d2e', w: 2.6, sticky: true,
    desc: 'Split: Geschosse haften am Ziel und brennen nach; sie dringen teilweise durch Schilde.',
    s: { dmg: 31, rate: 4, amt: 1, mag: 8, reload: 2.2, v: 2200, life: 1.1, angle: 0.3 },
    m: { dmg: 92, rate: 4, amt: 1, mag: 8, reload: 4.5, v: 2200, life: 1.682, angle: 0.3 },
  },
  boson: {
    name: 'Bosonenlanze', group: 'split', color: '#e0c3ff', w: 3, gimbal: 0.5, rail: true,
    desc: 'Split: blitzschneller Lanzenstrahl, der sofort trifft – riesiger Schaden und größte Reichweite, etwa ein Schuss pro Sekunde.',
    s: { dmg: 750, rate: 1, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.55, angle: 0.23 },
    m: { dmg: 1150, rate: 1, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.59, angle: 0.23 },
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** Split-Türme (M) für Korvette und Fregatte – Werte aus den Spieldaten 9.0 (Drehtempo in Grad pro Sekunde) */
export interface TurretDef { name: string; desc: string; gun: X4Gun; turn: number; color: string; w: number; rail?: boolean }
export const TURRETS: Record<TurretId, TurretDef> = {
  puls: { name: 'Pulsturm', desc: 'Schnell schwenkend und genau, wenig Schaden – gut gegen Raketen und Jäger.', turn: 180, color: '#7ffff0', w: 2,
    gun: { dmg: 18, rate: 3.8, amt: 1, mag: 8, reload: 2.4, v: 5000, life: 0.7, angle: 0.17 } },
  neutron: { name: 'Neutronen-Gatling-Turm', desc: 'Langer Dauerstrom, dann acht Sekunden nachladen.', turn: 140, color: '#ff8a3d', w: 2,
    gun: { dmg: 18, rate: 18, amt: 1, mag: 80, reload: 8, v: 2500, life: 1.4, angle: 0.45 } },
  tau: { name: 'Tau-Beschleuniger-Turm', desc: 'Vier Geschosse je Schuss, kurze Reichweite.', turn: 160, color: '#ff5a5a', w: 2.2,
    gun: { dmg: 42, rate: 3, amt: 4, mag: 8, reload: 5, v: 2000, life: 1.235, angle: 1.15 } },
  plasma: { name: 'Plasmaturm', desc: 'Zwei schwere Plasmageschosse, dann sieben Sekunden Pause; schwenkt langsam.', turn: 40, color: '#a6ff6b', w: 4,
    gun: { dmg: 750, rate: 1, amt: 1, mag: 2, reload: 7, v: 1000, life: 5.5, angle: 0.8 } },
  boson: { name: 'Bosonenlanzen-Turm', desc: 'Blitzschneller Lanzenstrahl, etwa ein Schuss pro Sekunde; schwenkt langsam.', turn: 40, color: '#e0c3ff', w: 3, rail: true,
    gun: { dmg: 800, rate: 1, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.57, angle: 0.18 } },
};
export const TURRET_IDS = Object.keys(TURRETS) as TurretId[];

/** Schaden pro Sekunde im Dauerbetrieb (mit Salven- bzw. Nachladepausen), in X4-Werten */
export function sustainedDps(g: X4Gun, beam = false): number {
  if (beam) return g.dmg;
  const per = g.dmg * g.amt;
  if (!g.mag) return per * g.rate;
  return (per * g.mag) / ((g.mag - 1) / g.rate + Math.max(g.reload, 1 / g.rate));
}

/**
 * Wirksame Dauerleistung für den Ausgleich: Schaden über die Hülle eines typischen Gegners hinaus verpufft
 * (eine Bosonenlanze trifft einen Jäger nicht stärker als nötig) – je Geschoss zählen höchstens 400 Punkte.
 */
export function effectiveDps(g: X4Gun, beam = false): number {
  return sustainedDps(g, beam) * (beam ? 1 : Math.min(1, 400 / g.dmg));
}

// ---- Umrechnung ins Minispiel ----
/** Spielzeit je X4-Sekunde: das Minispiel läuft etwas gemächlicher (Pulslaser: 0,26 s statt 1/6 s je Schuss) */
export const TIME = 0.26 * 6;
/** Spielschaden je X4-Schadenspunkt im Verhältnis zum Grundschaden: der Pulslaser behält seine bisherige Dauerleistung */
export const DMG_SCALE = (0.5 / 0.26) * TIME / sustainedDps(WEAPONS.puls.s);
/** Reichweite: 3500 m Pulslaser = 416 Bildpunkte; Geschosstempo verdichtet (Wurzel), sonst wären Plasma zu langsam und Bosonen zu schnell */
const RANGE_SCALE = 416 / 3500;
export function gameSpeed(v: number): number { return 640 * Math.sqrt(v / 5000); }
export function gameRange(g: X4Gun, beam = false): number { return beam ? 416 : g.v * g.life * RANGE_SCALE; }

export interface ShieldDef { name: string; desc: string; cap: number; regen: number; delay: number }
export const SHIELDS: Record<ShieldId, ShieldDef> = {
  leicht: { name: 'Leichter Schild', desc: 'Lädt schnell und früh wieder auf.', cap: 1, regen: 1, delay: 1 },
  schwer: { name: 'Schwerer Schild', desc: 'Hält deutlich mehr aus, lädt aber langsam und spät.', cap: 1.8, regen: 0.6, delay: 1.5 },
};
export const SHIELD_IDS = Object.keys(SHIELDS) as ShieldId[];

export const SPECIALS: Record<SpecialId, { name: string; key: string; cd: number }> = {
  dash: { name: 'Ausweichen', key: 'A', cd: 3 },
  sprint: { name: 'Nachbrenner', key: 'N', cd: 7 },
  overdrive: { name: 'Waffenüberladung', key: 'Ü', cd: 12 },
  torpedo: { name: 'Torpedo', key: 'T', cd: 9 },
  escort: { name: 'Begleitjäger', key: 'J', cd: 24 },
};

export interface Loadout { ship: ShipId; weapon: WeaponId; turret: TurretId; shield: ShieldId }
export const DEFAULT_LOADOUT: Loadout = { ship: 'mamba', weapon: 'puls', turret: 'puls', shield: 'leicht' };
/** Namen aus früheren Versionen (gespeicherte Ausrüstung) */
const OLD: Record<string, string> = { impuls: 'puls', splitter: 'schrot' };

const KEY = 'x4-sektorbau-ausruestung';

function valid(l: Partial<Record<keyof Loadout, string>> | null | undefined): Loadout {
  const weapon = OLD[l?.weapon ?? ''] ?? l?.weapon, turret = OLD[l?.turret ?? ''] ?? l?.turret;
  return {
    ship: l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship,
    weapon: weapon && weapon in WEAPONS ? (weapon as WeaponId) : DEFAULT_LOADOUT.weapon,
    turret: turret && turret in TURRETS ? (turret as TurretId) : DEFAULT_LOADOUT.turret,
    shield: l?.shield && l.shield in SHIELDS ? (l.shield as ShieldId) : DEFAULT_LOADOUT.shield,
  };
}

let current: Loadout | null = null;

/** Gewählte Ausrüstung (gemerkt im Browser) */
export function loadout(): Loadout {
  if (current) return current;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    current = valid(raw ? JSON.parse(raw) : null);
  } catch {
    current = { ...DEFAULT_LOADOUT };
  }
  return current;
}

export function setLoadout(patch: Partial<Loadout>): Loadout {
  current = valid({ ...loadout(), ...patch });
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Speicher nicht verfügbar */
  }
  return current;
}

/** Kurzbeschreibung für das Menü */
export function loadoutLabel(l: Loadout = loadout()): string {
  const s = SHIPS[l.ship];
  return `${s.name} · ${s.x4.weapons}× ${WEAPONS[l.weapon].name}${s.x4.launchers ? ` · ${s.x4.launchers}× Raketenwerfer` : ''}${s.turrets.length ? ` · ${s.turrets.length} Türme: ${TURRETS[l.turret].name}` : ''} · ${SHIELDS[l.shield].name}`;
}

// ---- Steuerung im Kampf: ein Stick (Drehen + Schub, Feuertaste) oder zwei Sticks (links fliegen, rechts zielen und feuern) ----
export type ControlMode = 'eins' | 'zwei';
const CONTROL_KEY = 'x4-sektorbau-steuerung';
export function controlMode(): ControlMode {
  try {
    return globalThis.localStorage?.getItem(CONTROL_KEY) === 'zwei' ? 'zwei' : 'eins';
  } catch {
    return 'eins';
  }
}
export function setControlMode(m: ControlMode): void {
  try {
    globalThis.localStorage?.setItem(CONTROL_KEY, m);
  } catch {
    /* Speicher nicht verfügbar */
  }
}
