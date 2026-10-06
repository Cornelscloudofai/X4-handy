// Ausrüstung für das Kampf-Minispiel: welches Schiff du fliegst, welche Waffen und Türme es trägt, welcher Schild.
// Vorerst frei wählbar (im Kampfmenü); später kommen Schiffe und Teile aus Werft und eigener Produktion.

export type ShipId = 'mamba' | 'argon' | 'chimera' | 'asp';
export type WeaponId = 'impuls' | 'strahl' | 'splitter' | 'plasma';
export type ShieldId = 'leicht' | 'schwer';
/** Spezialfähigkeit auf der Taste über der Feuertaste */
export type SpecialId = 'dash' | 'overdrive' | 'overcharge';

export interface ShipDef {
  name: string;
  /** Klasse für die Anzeige */
  cls: 'S' | 'M';
  role: string;
  desc: string;
  /** Faktoren auf Tempo, Drehrate, Hülle (Treffer zählen entsprechend weniger) und Schild */
  speed: number;
  turn: number;
  hull: number;
  shield: number;
  /** Bordkanonen: seitliche Lage (Bildpunkte, Bug oben), je Schuss feuern `salvo` davon (reihum) */
  guns: number[];
  salvo: number;
  /** Schaden und Feuerpause der Bordkanonen */
  dmg: number;
  rate: number;
  /** Türme (Lage relativ zur Schiffsmitte, Bug oben) – zielen frei */
  turrets: [number, number][];
  /** Trefferradius und Zeichengröße */
  r: number;
  size: number;
  special: SpecialId;
  /** Raketen je Salve */
  missiles: number;
  /** Bildname (KI-Bild) und Ersatzbild, solange es noch keins gibt */
  sprite: string;
  fallback: string;
}

export const SHIPS: Record<ShipId, ShipDef> = {
  mamba: {
    name: 'Mamba', cls: 'S', role: 'Jäger', desc: 'Wendig und schnell, zwei Bordkanonen. Ausweichmanöver.',
    speed: 1, turn: 1, hull: 1, shield: 1, guns: [-5, 5], salvo: 1, dmg: 1, rate: 1, turrets: [], r: 12, size: 40,
    special: 'dash', missiles: 4, sprite: 'split-jaeger-s', fallback: 'split-jaeger-s',
  },
  argon: {
    name: 'Argon-Jäger', cls: 'S', role: 'Jäger', desc: 'Der Argon-Jäger aus dem Grafikvergleich – fliegt sich wie die Mamba.',
    speed: 1, turn: 1, hull: 1, shield: 1, guns: [-6, 6], salvo: 1, dmg: 1, rate: 1, turrets: [], r: 12, size: 40,
    special: 'dash', missiles: 4, sprite: 'argon-jaeger-s', fallback: 'argon-jaeger-s',
  },
  chimera: {
    name: 'Chimera', cls: 'S', role: 'Schwerer Jäger', desc: 'Vier Bordkanonen, mehr Hülle und Schild, etwas träger. Waffenüberladung: kurz doppelte Feuerrate.',
    speed: 0.86, turn: 0.8, hull: 1.7, shield: 1.3, guns: [-10, -4, 4, 10], salvo: 2, dmg: 0.7, rate: 1, turrets: [], r: 14, size: 50,
    special: 'overdrive', missiles: 6, sprite: 'split-chimera', fallback: 'split-jaeger-s',
  },
  asp: {
    name: 'Asp', cls: 'M', role: 'Korvette', desc: 'Schwere Hauptkanone nach vorn, zwei Türme, die selbst zielen, viel Hülle und Schild – aber träge. Schildüberladung: kurz unverwundbar.',
    speed: 0.62, turn: 0.42, hull: 3.2, shield: 2, guns: [0], salvo: 1, dmg: 2.4, rate: 1.4, turrets: [[-15, 6], [15, 6]], r: 22, size: 86,
    special: 'overcharge', missiles: 8, sprite: 'split-asp', fallback: 'split-jaeger-s',
  },
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
  overdrive: { name: 'Waffenüberladung', key: 'Ü', cd: 12 },
  overcharge: { name: 'Schildüberladung', key: 'S', cd: 16 },
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
  return `${s.name} · ${WEAPONS[l.weapon].name}${s.turrets.length ? ` · Türme: ${WEAPONS[l.turret].name}` : ''} · ${SHIELDS[l.shield].name}`;
}
