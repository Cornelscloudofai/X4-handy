// Ausrüstung für das Kampf-Minispiel: welches Schiff du fliegst, welche Waffen und Türme es trägt, welcher Schild.
// Vorerst frei wählbar (im Kampfmenü); später kommen Schiffe und Teile aus Werft und eigener Produktion.

export type ShipId = 'jaguar' | 'mamba' | 'asp' | 'balaur' | 'chimera' | 'dragon' | 'cobra' | 'argon';
export type WeaponId = 'impuls' | 'strahl' | 'splitter' | 'plasma';
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
  /** Schaden je Bordkanone (zwei S-Waffen der Mamba ergeben 1) */
  gunDmg: number;
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
 * Split-Schilde Mk1: S 740 (lädt 35/s nach 3,5 s), M 3848 (74/s nach 2 s);
 * Impulslaser Mk1: S 216, M 440 Schaden pro Sekunde; M-Impulsturm 68 pro Sekunde.
 */
const MAMBA = { hull: 3600, shield: 2 * 740, regen: 2 * 35, v: 330, dragYaw: 3.3 };
const SHIELD = { S: { cap: 740, rate: 35, delay: 3.5 }, M: { cap: 3848, rate: 74, delay: 2 } };
const GUN_DMG = { S: 0.5, M: 0.5 * (440 / 216) };
/** Schaden eines M-Turms im Verhältnis zu einer S-Bordkanone (68 ÷ 216) */
export const TURRET_DMG = 68 / 216;
/** Annahme (Drehmoment der Steuerdüsen steht nicht in den Daten): M-Steuerdüsen drehen doppelt so stark wie S */
const THRUSTER = { S: 1, M: 2 };

/** Waffenplätze gleichmäßig über die Breite verteilen */
function spreadGuns(n: number, width: number): number[] {
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i / (n - 1) - 0.5) * width));
}

type ShipBase = Omit<ShipDef, 'cls' | 'speed' | 'turn' | 'hull' | 'shield' | 'regen' | 'delay' | 'gunDmg' | 'guns'> & { gunWidth: number };

function ship(cls: 'S' | 'M', base: ShipBase): ShipDef {
  const d = base.x4;
  const { gunWidth, ...rest } = base;
  return {
    ...rest,
    cls,
    speed: d.v / MAMBA.v,
    turn: (MAMBA.dragYaw / d.dragYaw) * THRUSTER[cls],
    hull: d.hull / MAMBA.hull,
    shield: (d.shields * SHIELD[cls].cap) / MAMBA.shield,
    regen: (d.shields * SHIELD[cls].rate) / MAMBA.regen,
    delay: SHIELD[cls].delay / SHIELD.S.delay,
    guns: spreadGuns(d.weapons, gunWidth),
    gunDmg: GUN_DMG[cls],
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
    gunWidth: 14, turrets: [], r: 12, size: 44, special: 'dash', sprite: 'split-asp', fallback: 'split-jaeger-s',
  }),
  balaur: ship('S', {
    name: 'Balaur', role: 'Schwerer Jäger', desc: 'Meisterstück der Freien Familien: vier Waffenplätze, drei Triebwerke, keine Raketen – „hart zuschlagen, schnell zuschlagen, dann weg“. Ausweichmanöver.',
    x4: { hull: 5500, engines: 3, shields: 1, weapons: 4, launchers: 0, turrets: 0, missiles: 0, v: 363, dragYaw: 3.62 },
    gunWidth: 18, turrets: [], r: 13, size: 48, special: 'dash', sprite: 'split-balaur', fallback: 'split-jaeger-s',
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

export interface WeaponDef {
  name: string;
  desc: string;
  /** Faktoren auf Schaden je Geschoss und Feuerpause */
  dmg: number;
  rate: number;
  /** Geschwindigkeit und Flugzeit (Reichweite = speed × life); Strahl: Länge statt Geschoss */
  speed: number;
  life: number;
  /** Geschosse je Schuss und Streuung (rad) */
  pellets: number;
  spread: number;
  /** Flächenschaden (Radius) beim Einschlag */
  splash: number;
  color: string;
  w: number;
  beam?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  impuls: { name: 'Impulslaser', desc: 'Der Allrounder: schnelle, gerade Schüsse auf mittlere Entfernung.', dmg: 1, rate: 1, speed: 640, life: 0.65, pellets: 1, spread: 0, splash: 0, color: '#7ffff0', w: 2 },
  strahl: { name: 'Strahler', desc: 'Dauerstrahl: trifft sofort und sicher, solange du draufhältst – dafür etwas kürzere Reichweite.', dmg: 1.1, rate: 1, speed: 0, life: 0, pellets: 1, spread: 0, splash: 0, color: '#9ffcff', w: 2, beam: true },
  splitter: { name: 'Splitterkanone', desc: 'Fünf Splitter mit Streuung: verheerend aus der Nähe, kurze Reichweite.', dmg: 0.34, rate: 1.3, speed: 560, life: 0.36, pellets: 5, spread: 0.11, splash: 0, color: '#ffc070', w: 1.8 },
  plasma: { name: 'Plasmakanone', desc: 'Schwere, langsame Plasmakugeln mit Flächenschaden – gut gegen Gruppen und große Ziele.', dmg: 2.8, rate: 2.6, speed: 400, life: 1, pellets: 1, spread: 0, splash: 28, color: '#a6ff6b', w: 5 },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
/** Länge des Strahls (Strahler) */
export const BEAM_LEN = 360;

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

export interface Loadout { ship: ShipId; weapon: WeaponId; turret: WeaponId; shield: ShieldId }
export const DEFAULT_LOADOUT: Loadout = { ship: 'mamba', weapon: 'impuls', turret: 'impuls', shield: 'leicht' };

const KEY = 'x4-sektorbau-ausruestung';

function valid(l: Partial<Loadout> | null | undefined): Loadout {
  return {
    ship: l?.ship && l.ship in SHIPS ? l.ship : DEFAULT_LOADOUT.ship,
    weapon: l?.weapon && l.weapon in WEAPONS ? l.weapon : DEFAULT_LOADOUT.weapon,
    // Türme feuern Geschosse – ein Strahl-Turm ist nicht vorgesehen
    turret: l?.turret && l.turret in WEAPONS && l.turret !== 'strahl' ? l.turret : DEFAULT_LOADOUT.turret,
    shield: l?.shield && l.shield in SHIELDS ? l.shield : DEFAULT_LOADOUT.shield,
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
  return `${s.name} · ${s.x4.weapons}× ${WEAPONS[l.weapon].name}${s.x4.launchers ? ` · ${s.x4.launchers}× Raketenwerfer` : ''}${s.turrets.length ? ` · ${s.turrets.length} Türme: ${WEAPONS[l.turret].name}` : ''} · ${SHIELDS[l.shield].name}`;
}
