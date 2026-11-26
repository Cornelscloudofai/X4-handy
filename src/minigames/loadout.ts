// Ausrüstung für das Kampf-Minispiel: welches Schiff du fliegst, welche Waffen und Türme es trägt, welcher Schild.
// Vorerst frei wählbar (im Kampfmenü); später kommen Schiffe und Teile aus Werft und eigener Produktion.

export type ShipId = 'jaguar' | 'mamba' | 'asp' | 'balaur' | 'chimera' | 'wolf' | 'dragon' | 'cobra' | 'klapperschlange' | 'raptor' | 'argon';
export type WeaponId = 'puls' | 'bolzen' | 'schrot' | 'strahl' | 'plasma' | 'neutron' | 'tau' | 'thermal' | 'boson' | 'massdriver' | 'blitz' | 'stoerblitz' | 'schnellplasma' | 'plasmasalve';
export type TurretId = 'puls' | 'strahl' | 'neutron' | 'tau' | 'plasma' | 'boson' | 'rakete' | 'flak';
/** Schwere L-Türme (Zerstörer): je Waffe ein eigenes Kanonenrohr-Bild */
export type LTurretId = 'plasma' | 'tau' | 'boson' | 'neutron' | 'silo';
export type ShieldId = 'leicht' | 'schwer';
/** Spezialfähigkeit auf der Taste über der Feuertaste */
export type SpecialId = 'dash' | 'sprint' | 'overdrive' | 'torpedo' | 'escort' | 'salvo';
export type MissileId = 'lenk' | 'schwer' | 'schwarm' | 'stoer';

/** Werte aus den X4-Spieldaten, Version 9.0 (siehe docs/design/split-militaerschiffe.md) */
export interface X4Data {
  /** Hülle */
  hull: number;
  /** Triebwerke und Schilde (Anzahl, Größe wie die Schiffsklasse); Zerstörer: zusätzlich M-Schilde */
  engines: number;
  shields: number;
  mShields?: number;
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

/**
 * Schwerer L-Turm an der Bordwand (Zerstörer): nur das Kanonenrohr ist zu sehen. Es dreht sich unter einer erhöhten
 * Panzerplatte des Rumpfs („Flügel“) und liegt über dem tieferen Rumpf – gezeichnet wird Rumpf, Rohr, dann der
 * Flügel noch einmal obendrauf. Alle Lagen als Anteile der Bildgröße (Mitte = 0, Bug oben).
 */
export interface LMount {
  /** Drehpunkt des Rohrs (liegt unter dem Flügel) */
  x: number;
  y: number;
  /** Schwenkbereich in Grad: 0 = geradeaus, negativ = nach innen (über den Bug), positiv = nach außen und hinten */
  min: number;
  max: number;
  /** Umriss des Flügels, der das Rohr verdeckt */
  cover: [number, number][];
}

/**
 * Turmgruppe eines Trägers: Ein Cluster (links und rechts gespiegelt) bzw. ein oder mehrere L-Türme bekommen gemeinsam
 * eine Turmart. Reihenfolge vom Bug zum Heck.
 */
export interface TurretGroup { name: string; kind: 'M' | 'L' }

export interface ShipDef {
  name: string;
  /** Blitzwaffen auf diesem Schiff: Feuerrate (Faktor; die Sprünge wachsen mit der Zahl der Bordkanonen) */
  chainK?: { rate: number };
  /** Raketen-Vierlinge: in höchstens so vielen M-Turmgruppen (gezählt werden Gruppen, nicht Türme); fehlt: keine */
  rocketGroups?: number;
  /** Raketensilos: in höchstens so vielen L-Turmgruppen (Träger); fehlt: keine Grenze */
  siloGroups?: number;
  /** Klasse für die Anzeige */
  cls: 'S' | 'M' | 'L' | 'XL';
  /** Seitenverhältnis des Bilds (Breite : Länge) bei langen Schiffen; size ist dann die Länge (sonst quadratisch) */
  aspect?: number;
  /** Träger: Gruppe je Turm (Index in groups) – die Türme liegen alle in turrets, L-Türme oben auf dem Rumpf */
  turretGroup?: number[];
  groups?: TurretGroup[];
  /** Sockeldurchmesser der L-Türme oben auf dem Rumpf (Anteil der Länge) */
  turretDL?: number;
  /**
   * Fahrgefühl über die X4-Werte hinaus (Spielwert): Tempo, Drehrate und Beschleunigung als Faktoren – für sehr große
   * Schiffe, die sich sonst zu leicht steuern
   */
  handling?: { speed: number; turn: number; accel: number };
  /**
   * Trägheit beim Steuern (Sekunden): yaw = bis die volle Drehrate anliegt (und wieder abgebremst ist), spool = bis der
   * Schub voll anliegt bzw. die Schubrichtung umgeschwenkt ist. Größer = träger; fehlt: Wert der Schiffsklasse
   */
  agility?: { yaw: number; spool: number };
  /**
   * Träger: Hangarbuchten an den Flugdecks (Spielpunkte, Bug oben). Anflug von außen (out) aufs Deck (deck), dann unter
   * den roten Rumpf (in) – dort ist das Schiff gelandet und unsichtbar. Start in umgekehrter Reihenfolge.
   */
  bays?: { out: [number, number]; deck: [number, number]; in: [number, number] }[];
  /** Bild der Rumpf-Ebene (Flugdecks durchsichtig): wird über gelandete und landende Schiffe gezeichnet */
  hullLayer?: string;
  /** Hangarplätze (Träger): so viele S- und M-Schiffe passen hinein */
  hangar?: { S: number; M: number };
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
  /** Größe der Waffenplätze (S, M oder L) – bestimmt die Werte der gewählten Waffe */
  gunSize: GunSize;
  /** Mündung der Bordkanonen vor der Schiffsmitte (Anteil der Zeichengröße; sonst 0,3) */
  gunFwd?: number;
  /** Türme (Lage relativ zur Schiffsmitte, Bug oben) – zielen frei */
  turrets: [number, number][];
  /** Sockeldurchmesser der M-Türme (Anteil der Zeichengröße; sonst 0,1) */
  turretD?: number;
  /** schwere L-Türme an der Bordwand (Zerstörer) */
  lMounts?: LMount[];
  /** Raketenwerfer: seitliche Lage in Spielpunkten wie im Bild (sonst alle in der Mitte) */
  launcherPos?: number[];
  /** Nachladezeit der Raketenwerfer im Verhältnis zu den anderen Schiffen (Bomber: schneller) */
  missileReload?: number;
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
// Annahme L-Schild (Split Mk1): 30 000, lädt 230/s nach 1,5 s – die genauen Werte stehen noch aus.
const SHIELD = { S: { cap: 740, rate: 35, delay: 3.5 }, M: { cap: 3848, rate: 74, delay: 2 }, L: { cap: 30000, rate: 230, delay: 1.5 }, XL: { cap: 100800, rate: 454, delay: 3 } };
/**
 * Annahme (Drehmoment der Steuerdüsen steht nicht in den Daten): M-Steuerdüsen drehen doppelt so stark wie S,
 * L-Steuerdüsen achtmal so stark – sonst wäre der Zerstörer (Drehwiderstand 123) im Minispiel kaum zu lenken.
 */
const THRUSTER = { S: 1, M: 2, L: 8, XL: 30 };
export type GunSize = 's' | 'm' | 'l';

/** Waffenplätze gleichmäßig über die Breite verteilen */
function spreadGuns(n: number, width: number): number[] {
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i / (n - 1) - 0.5) * width));
}

type ShipBase = Omit<ShipDef, 'cls' | 'speed' | 'turn' | 'hull' | 'shield' | 'regen' | 'delay' | 'gunSize' | 'guns'> & { gunWidth: number; /** Lage der Rohre wie im Bild (sonst gleichmäßig verteilt) */ gunPos?: number[] };

/** Trägheit je Klasse (Sekunden bis volle Drehrate / voller Schub): je größer, desto träger */
const AGILITY: Record<'S' | 'M' | 'L' | 'XL', { yaw: number; spool: number }> = {
  S: { yaw: 0.12, spool: 0.12 }, M: { yaw: 0.35, spool: 0.3 }, L: { yaw: 0.8, spool: 0.6 }, XL: { yaw: 1.3, spool: 1 },
};
function ship(cls: 'S' | 'M' | 'L' | 'XL', base: ShipBase): ShipDef {
  const d = base.x4;
  const { gunWidth, gunPos, ...rest } = base;
  const m = d.mShields ?? 0;
  return {
    ...rest,
    cls,
    speed: (d.v / MAMBA.v) * (base.handling?.speed ?? 1),
    turn: (MAMBA.dragYaw / d.dragYaw) * THRUSTER[cls] * (base.handling?.turn ?? 1),
    hull: d.hull / MAMBA.hull,
    shield: (d.shields * SHIELD[cls].cap + m * SHIELD.M.cap) / MAMBA.shield,
    regen: (d.shields * SHIELD[cls].rate + m * SHIELD.M.rate) / MAMBA.regen,
    delay: SHIELD[cls].delay / SHIELD.S.delay,
    guns: gunPos ?? spreadGuns(d.weapons, gunWidth),
    agility: base.agility ?? AGILITY[cls],
    gunSize: cls === 'L' || cls === 'XL' ? 'l' : cls === 'M' ? 'm' : 's',
  };
}

// ---- Träger Raptor: Bild 1254 × 5016 px (Bug oben), Lagen aus dem Bild gemessen (scripts/raptor-sprite.mjs) ----
/** Bildmaße; Länge im Spiel nach dem M-Landeplatz auf dem Rumpf (330 px ≈ ein M-Schiff, etwa 80 Spielpunkte) */
const RP_W = 1254, RP_H = 5016, RP_LEN = 1200;
/** M-Cluster einer Seite (linke Seite, Bildpunkte) – die rechte ist gespiegelt; Spalten- und Zeilenlagen */
const RP_PAIRS: { name: string; cols: number[]; rows: number[] }[] = [
  { name: 'Bugflanken', cols: [328, 364], rows: [751, 791, 832] },
  { name: 'Vordere Schultern', cols: [303, 340], rows: [1237, 1280, 1324] },
  { name: 'Seitendeck vorn', cols: [247, 282], rows: [1918, 1961, 2006] },
  { name: 'Mittelrumpf', cols: [462, 499], rows: [2397, 2440, 2485, 2515, 2546, 2587] },
  { name: 'Hinterer Rumpf', cols: [439, 476], rows: [2953, 2996, 3040, 3084] },
  { name: 'Seitendeck hinten', cols: [220, 257], rows: [3753, 3785, 3828, 3871] },
  { name: 'Heck', cols: [434, 472], rows: [4392, 4436, 4483] },
];
/** Rumpfmitte (Symmetrieachse) im Bild */
const RP_AXIS = 625;
const rp = (x: number, y: number): [number, number] => [Math.round(((x - RP_W / 2) / RP_H) * RP_LEN * 10) / 10, Math.round(((y - RP_H / 2) / RP_H) * RP_LEN * 10) / 10];
function raptorTurrets(): { pos: [number, number][]; group: number[]; groups: TurretGroup[] } {
  const pos: [number, number][] = [], group: number[] = [], groups: TurretGroup[] = [];
  const add = (g: number, x: number, y: number) => { pos.push(rp(x, y)); group.push(g); };
  // Bug-Cluster in der Mitte (2 × 5)
  groups.push({ name: 'Bug-Cluster', kind: 'M' });
  for (const y of [330, 369, 409, 450, 490]) for (const x of [607, 643]) add(0, x, y);
  for (const p of RP_PAIRS) {
    const g = groups.push({ name: p.name, kind: 'M' }) - 1;
    for (const y of p.rows) for (const x of p.cols) { add(g, x, y); add(g, 2 * RP_AXIS - x, y); }
  }
  // L-Türme: sechs vorn (eine Gruppe), zwei hinten neben dem Landeplatz (je einzeln)
  const lf = groups.push({ name: 'L-Türme vorn', kind: 'L' }) - 1;
  for (const [x, y] of [[502, 1160], [482, 1550], [448, 1938]]) { add(lf, x, y); add(lf, 2 * RP_AXIS - x, y); }
  add(groups.push({ name: 'L-Turm hinten links', kind: 'L' }) - 1, 327, 3350);
  add(groups.push({ name: 'L-Turm hinten rechts', kind: 'L' }) - 1, 918, 3350);
  return { pos, group, groups };
}
const RP_T = raptorTurrets();
/**
 * Hangarbuchten: je Seite fünf Stellen auf der Deckbahn (Bildpunkte, linke Seite; die rechte gespiegelt), frei von der
 * Turmplatte. Anflug draußen im freien Raum, über das Außengitter (liegt mit dem Deck in der unteren Ebene) zur
 * Deckmitte, dann unter die Panzerplatten. Deckmitte und Panzerkante aus scripts/raptor-deck.mjs (Vorschlag C).
 */
const RP_BAYS: { y: number; deck: number; in: number }[] = [
  { y: 1660, deck: 323, in: 479 }, { y: 2180, deck: 289, in: 444 }, { y: 2500, deck: 287, in: 434 },
  { y: 2820, deck: 234, in: 385 }, { y: 3140, deck: 203, in: 338 },
];
function raptorBays(): NonNullable<ShipDef['bays']> {
  const out: NonNullable<ShipDef['bays']> = [];
  for (const b of RP_BAYS) for (const side of [1, -1]) {
    const x = (px: number) => (side > 0 ? px : 2 * RP_AXIS - px);
    out.push({ out: rp(x(18), b.y), deck: rp(x(b.deck), b.y), in: rp(x(b.in), b.y) });
  }
  return out;
}

/** Lagen aus einem Schiffsbild (Bildpunkte, Bildgröße img) in Spielpunkte bei Zeichengröße size umrechnen */
function fromImage(img: number, size: number, pts: [number, number][]): [number, number][] {
  return pts.map(([x, y]) => [Math.round(((x - img / 2) / img) * size * 10) / 10, Math.round(((y - img / 2) / img) * size * 10) / 10]);
}

/** L-Türme der linken Seite (Bildpunkte) übernehmen und für die rechte Seite spiegeln */
function lMounts(img: number, left: { pivot: [number, number]; min: number; max: number; cover: [number, number][] }[]): LMount[] {
  const f = (v: number) => (v - img / 2) / img;
  const out: LMount[] = [];
  for (const side of [1, -1]) for (const m of left) out.push({
    x: side * f(m.pivot[0]), y: f(m.pivot[1]), min: m.min, max: m.max,
    cover: m.cover.map(([x, y]) => [side * f(x), f(y)]),
  });
  return out;
}

/** Bildmaße der Klapperschlange (KI-Bild 1254 px, Bug oben) */
const RS_IMG = 1254, RS_SIZE = 200;

// Split-Militärschiffe nach den X4-Spieldaten 9.0. Verhältnisse von Hülle, Schild, Tempo, Wendigkeit und Bewaffnung
// wie im Original; die Gegner werden bei stärkeren Schiffen entsprechend zahlreicher und zäher.
export const SHIPS: Record<ShipId, ShipDef> = {
  jaguar: ship('S', {
    agility: { yaw: 0.08, spool: 0.08 },
    name: 'Jaguar', role: 'Aufklärer', desc: 'Aufklärer mit phänomenalem Tempo: ein Waffenplatz, wenig Hülle, keine Raketen. Nachbrenner: kurz noch schneller.',
    x4: { hull: 2000, engines: 1, shields: 1, weapons: 1, launchers: 0, turrets: 0, missiles: 0, v: 390, dragYaw: 3.015 },
    gunWidth: 0, gunPos: [2], turrets: [], r: 10, size: 36, special: 'sprint', sprite: 'split-jaguar', fallback: 'split-jaeger-s',
  }),
  mamba: ship('S', {
    agility: { yaw: 0.1, spool: 0.09 },
    name: 'Mamba', role: 'Jäger', desc: 'Vielseitiges Arbeitstier: zwei Waffenplätze, ein Raketenwerfer, als einziger Jäger zwei Schilde. Ausweichmanöver.',
    x4: { hull: 3600, engines: 2, shields: 2, weapons: 2, launchers: 1, turrets: 0, missiles: 8, v: 330, dragYaw: 3.3 },
    gunWidth: 10, turrets: [], r: 12, size: 40, special: 'dash', sprite: 'split-jaeger-s', fallback: 'split-jaeger-s',
  }),
  asp: ship('S', {
    agility: { yaw: 0.12, spool: 0.12 },
    name: 'Asp', role: 'Jäger', desc: 'Wendiger, mittelgroßer Jäger, bei Split-Söldnern beliebt: drei Waffenplätze, ein Raketenwerfer, mehr Hülle als die Mamba, aber nur ein Schild. Ausweichmanöver.',
    x4: { hull: 4600, engines: 2, shields: 1, weapons: 3, launchers: 1, turrets: 0, missiles: 3, v: 347, dragYaw: 2.9 },
    gunWidth: 9, turrets: [], r: 12, size: 44, special: 'dash', sprite: 'split-asp', fallback: 'split-jaeger-s',
  }),
  balaur: ship('S', {
    agility: { yaw: 0.14, spool: 0.12 },
    name: 'Balaur', role: 'Schwerer Jäger', desc: 'Meisterstück der Freien Familien: vier Waffenplätze, drei Triebwerke, keine Raketen – „hart zuschlagen, schnell zuschlagen, dann weg“. Ausweichmanöver.',
    x4: { hull: 5500, engines: 3, shields: 1, weapons: 4, launchers: 0, turrets: 0, missiles: 0, v: 363, dragYaw: 3.62 },
    gunWidth: 18, gunPos: [-10.4, -7.6, 7.6, 10.4], turrets: [], r: 13, size: 48, special: 'dash', sprite: 'split-balaur', fallback: 'split-jaeger-s',
  }),
  chimera: ship('S', {
    agility: { yaw: 0.17, spool: 0.15 },
    name: 'Chimera', role: 'Schwerer Jäger', desc: 'Schwerer Jäger des Zyarth-Patriarchats: fünf Waffenplätze, vier Triebwerke, die meiste Hülle der Jäger, keine Raketen – aber ein großes Profil. Waffenüberladung: kurz doppelte Feuerrate.',
    x4: { hull: 6100, engines: 4, shields: 1, weapons: 5, launchers: 0, turrets: 0, missiles: 0, v: 394, dragYaw: 4.3 },
    gunWidth: 22, turrets: [], r: 15, size: 52, special: 'overdrive', sprite: 'split-chimera', fallback: 'split-jaeger-s',
  }),
  dragon: ship('M', {
    agility: { yaw: 0.3, spool: 0.25 },
    name: 'Dragon', role: 'Korvette', desc: 'Furchteinflößende Korvette: sechs M-Waffenplätze, ein M-Raketenwerfer, zwei Türme, nur ein Schild. Torpedo: langsamer, schwerer Schuss mit großem Flächenschaden.',
    x4: { hull: 21000, engines: 1, shields: 1, weapons: 6, launchers: 1, turrets: 2, missiles: 12, v: 478, dragYaw: 11.298 },
    gunWidth: 28, gunPos: [-14.5, -12.3, -8.9, 8.9, 12.3, 14.5], turrets: [[-5.9, 4.4], [5.9, 4.4]], turretGroup: [0, 1], groups: [{ name: 'Turm links', kind: 'M' }, { name: 'Turm rechts', kind: 'M' }], r: 20, size: 80, special: 'torpedo', sprite: 'split-dragon', fallback: 'split-jaeger-s',
  }),
  cobra: ship('M', {
    agility: { yaw: 0.42, spool: 0.36 },
    chainK: { rate: 0.85 },
    name: 'Cobra', role: 'Fregatte', desc: 'Fregatte: drei M-Waffenplätze, vier Türme, zwei Schilde, drei Triebwerke, Andockplatz – keine Raketenwerfer. Begleitjäger: startet für eine Weile eine Mamba.',
    x4: { hull: 33000, engines: 3, shields: 2, weapons: 3, launchers: 0, turrets: 4, missiles: 0, v: 518, dragYaw: 11 },
    gunWidth: 16, gunPos: [-3.7, 0, 3.7], turrets: [[-7.2, -0.4], [7.2, -0.4], [-7.2, 18.5], [7.2, 18.5]],
    // zwei Turmgruppen: je Gruppe eigene Turmart und eigener Befehlsknopf (z. B. Flak vorn, Gatling hinten)
    turretGroup: [0, 0, 1, 1], groups: [{ name: 'Bugtürme', kind: 'M' }, { name: 'Hecktürme', kind: 'M' }], r: 24, size: 92, special: 'escort', sprite: 'split-cobra', fallback: 'split-jaeger-s',
  }),
  klapperschlange: ship('L', {
    rocketGroups: 1,
    name: 'Klapperschlange', role: 'Zerstörer', desc: 'Zerstörer der Split: vier schwere Hauptkanonen im Bug, je zwei schwenkbare L-Türme unter den Schulterplatten, die auch spitz nach vorn über den Bug feuern, dazu zwölf M-Türme. Riesige Hülle und starke Schilde, aber träge. Waffenüberladung: kurz doppelte Feuerrate.',
    // X4 9.0: 3 L-Triebwerke, 1 L- und 15 M-Schilde, 4 L-Waffen (Hauptbatterie); Türme: hier 4 L (zwei je Seite) und
    // 12 M; Raketenlager 160, aber kein Werfer – daher ohne Raketen.
    x4: { hull: 242650, engines: 3, shields: 1, mShields: 15, weapons: 4, launchers: 0, turrets: 16, missiles: 0, v: 217, dragYaw: 123 },
    gunWidth: 18, gunPos: fromImage(RS_IMG, RS_SIZE, [[572, 0], [600, 0], [653, 0], [681, 0]]).map(([x]) => x), gunFwd: 0.47,
    // M-Türme auf den runden Luken der Panzerplatten
    turrets: fromImage(RS_IMG, RS_SIZE, [[565, 307], [689, 307], [565, 387], [689, 387], [557, 580], [697, 580], [549, 692], [705, 692], [541, 792], [713, 792], [538, 919], [716, 919]]),
    // M-Türme so groß wie die runden Luken im Bild (21 von 1 254 px ≈ 15 m, wie bei Dragon und Cobra)
    turretD: 21 / 1254,
    // drei Turmgruppen zu je vier: Bug, Mitte, Heck
    turretGroup: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2], groups: [{ name: 'Bugtürme', kind: 'M' }, { name: 'Mittschiffs', kind: 'M' }, { name: 'Hecktürme', kind: 'M' }],
    lMounts: lMounts(RS_IMG, [
      // vorderer Flügel (L-förmige Platte mit schräger Außenfläche), Rohr kommt darunter hervor
      { pivot: [515, 246], min: -25, max: 140, cover: [[476, 262], [486, 229], [505, 226], [555, 204], [558, 300], [533, 305], [532, 246], [478, 267]] },
      // hinterer Flügel (sechseckige Platte)
      { pivot: [505, 440], min: -25, max: 130, cover: [[463, 494], [468, 440], [493, 420], [530, 387], [537, 392], [536, 448]] },
    ]),
    r: 46, size: RS_SIZE, special: 'overdrive', sprite: 'split-klapperschlange', fallback: 'split-jaeger-s',
  }),
  raptor: ship('XL', {
    rocketGroups: 4, siloGroups: 1,
    name: 'Raptor', role: 'Träger', desc: 'Träger der Split, 3,2 km lang: 114 M-Türme in Clustern entlang des Rumpfs und acht schwere L-Türme – je Cluster wählst du die Turmart. Keine Bordkanonen, keine Raketen; sehr langsam, aber kaum zu knacken. Waffenüberladung: kurz doppelte Feuerrate aller Türme.',
    // X4 9.0: 1 XL-Triebwerk, 1 XL- und 49 M-Schilde, keine Bordwaffen, 8 L- und 93 M-Türme; Tempo aus Schub
    // 13 715 / Luftwiderstand 120,6. Türme hier nach den Sockeln im Bild: 114 M und 8 L.
    x4: { hull: 590000, engines: 1, shields: 1, mShields: 49, weapons: 0, launchers: 0, turrets: 122, missiles: 0, v: 114, dragYaw: 867 },
    gunWidth: 0, gunPos: [], aspect: RP_W / RP_H,
    turrets: RP_T.pos, turretGroup: RP_T.group, groups: RP_T.groups,
    turretD: 22 / RP_H, turretDL: 66 / RP_H,
    // 3,2 km Rumpf: deutlich träger, als die Datenwerte allein ergeben (Spieltest: zu wendig und etwas zu schnell)
    handling: { speed: 0.7, turn: 0.15, accel: 0.5 },
    bays: raptorBays(), hullLayer: 'split-raptor-rumpf', hangar: { S: 40, M: 4 },
    r: 150, size: RP_LEN, special: 'overdrive', sprite: 'split-raptor', fallback: 'split-jaeger-s',
  }),
  // Eigener Entwurf (kein Schiff aus den X4-Daten): Bomber der Split. Werte angenommen – zwischen Mamba und Asp,
  // dafür drei Raketenwerfer (Flügel links/rechts, Rückenschacht), großes Raketenlager und schnelles Nachladen.
  wolf: ship('S', {
    agility: { yaw: 0.15, spool: 0.14 },
    name: 'Wolf', role: 'Bomber', desc: 'Bomber der Split (eigener Entwurf): drei Raketenwerfer – je einer in den Flügeln und ein Schacht im Rücken –, Lager für 40 Raketen, lädt doppelt so schnell nach. Nur eine Bordkanone, etwas träger. Raketenschwarm: sofort eine doppelte Salve, auch während des Nachladens.',
    x4: { hull: 4200, engines: 2, shields: 1, weapons: 1, launchers: 3, turrets: 0, missiles: 40, v: 300, dragYaw: 3.8 },
    gunWidth: 0, gunPos: [0], gunFwd: 0.46, turrets: [], r: 13, size: 50, special: 'salvo', sprite: 'split-wolf', fallback: 'split-jaeger-s',
    launcherPos: [-12.5, 0, 12.4], missileReload: 0.5,
  }),
  argon: ship('S', {
    name: 'Argon-Jäger', role: 'Jäger', desc: 'Der Argon-Jäger aus dem Grafikvergleich – mit den Werten der Mamba.',
    x4: { hull: 3600, engines: 2, shields: 2, weapons: 2, launchers: 1, turrets: 0, missiles: 8, v: 330, dragYaw: 3.3 },
    gunWidth: 12, turrets: [], r: 12, size: 40, special: 'dash', sprite: 'argon-jaeger-s', fallback: 'argon-jaeger-s',
  }),
};
export const SHIP_IDS = Object.keys(SHIPS) as ShipId[];

// ---- Größenmaßstab der Schiffe im Kampf-Minispiel ----
/**
 * Schiffslängen aus X4 5.00 in Metern (Tabelle „X4 5.00 Ship Lengths“, im Spiel gemessen). Wolf: eigener Entwurf, wie
 * Balaur angenommen; Argon-Jäger: wie der Argon-S-Jäger Elite.
 */
export const X4_LENGTH: Record<ShipId, number> = {
  jaguar: 25.8, mamba: 32.0, asp: 26.9, balaur: 30.7, chimera: 31.2, wolf: 30.7, argon: 21.7,
  dragon: 149.2, cobra: 147.7, klapperschlange: 906.4, raptor: 3191,
};
/** Sichtbare Rumpflänge im bisherigen Maßstab (Spielpunkte; gemessen mit scripts/size-sheet.mjs) */
const VIS_BEFORE: Record<ShipId, number> = {
  jaguar: 28, mamba: 38, asp: 33, balaur: 41, chimera: 41, wolf: 45, argon: 37, dragon: 69, cobra: 80, klapperschlange: 195, raptor: 1185,
};
/**
 * Maßstab: x4 – durchgehend echtes X4-Verhältnis, Mamba wie bisher (38 Punkte, 32 m); gestaucht – S-Jäger wie bisher
 * mit echten Verhältnissen untereinander, ab der Cobra (80) echtes Verhältnis, dazwischen stufenlos; bisher – alte Größen
 */
export type SizeScale = 'x4' | 'gestaucht' | 'bisher';
const SCALE_KEY = 'x4-sektorbau-massstab';
/** Sichtbare Länge (Spielpunkte) eines Schiffs mit dieser X4-Länge im Maßstab */
export function scaledLength(m: number, scale: SizeScale): number {
  const s = 38 / 32.0;
  if (scale === 'x4') return m * s;
  const at35 = 35 * s, cobra = 80;
  if (m <= 35) return m * s;
  if (m <= 147.7) return at35 + ((m - 35) / (147.7 - 35)) * (cobra - at35);
  return m * (cobra / 147.7);
}
/** Grundwerte der Schiffe (bisheriger Maßstab), aus denen jeder Maßstab abgeleitet wird */
const SHIP_BASE: Record<string, ShipDef> = JSON.parse(JSON.stringify(SHIPS));
/** Lagen und Größen eines Schiffs mit Faktor k skalieren (Anteile wie turretD und lMounts bleiben) */
function scaleShip(b: ShipDef, k: number): ShipDef {
  const pt = (p: [number, number]): [number, number] => [Math.round(p[0] * k * 10) / 10, Math.round(p[1] * k * 10) / 10];
  // Jäger mit Zeichengröße 40 zeichnet das Spiel etwas kleiner (SPRITE_SIZE · 0,86 = 39,6): bei k = 1 unverändert lassen
  const size = Math.abs(k - 1) < 1e-6 ? b.size : Math.round(b.size * k * 10) / 10;
  return {
    ...b, size, r: Math.round(b.r * k * 10) / 10,
    guns: b.guns.map((g) => Math.round(g * k * 10) / 10),
    turrets: b.turrets.map(pt),
    launcherPos: b.launcherPos?.map((g) => Math.round(g * k * 10) / 10),
    bays: b.bays?.map((bay) => ({ out: pt(bay.out), deck: pt(bay.deck), in: pt(bay.in) })),
  };
}
let scaleNow: SizeScale = 'bisher';
/** Gewählter Maßstab (gemerkt im Browser); Standard: echtes X4-Verhältnis */
export function sizeScale(): SizeScale { return scaleNow; }
/** Maßstab setzen: alle Schiffe in SHIPS werden aus den Grundwerten neu berechnet */
export function setSizeScale(scale: SizeScale, remember = true): void {
  scaleNow = scale;
  for (const id of SHIP_IDS) {
    const k = scale === 'bisher' ? 1 : scaledLength(X4_LENGTH[id], scale) / VIS_BEFORE[id];
    Object.assign(SHIPS[id], scaleShip(SHIP_BASE[id], k));
  }
  if (remember) try { globalThis.localStorage?.setItem(SCALE_KEY, scale); } catch { /* Speicher nicht verfügbar */ }
}
{
  let saved: string | null = null;
  try { saved = globalThis.localStorage?.getItem(SCALE_KEY) ?? null; } catch { /* Speicher nicht verfügbar */ }
  setSizeScale(saved === 'gestaucht' || saved === 'bisher' || saved === 'x4' ? saved : 'x4', false);
}

/**
 * X4-Werte einer Waffe (Mk1, Spieldaten 9.0): Schaden je Geschoss, Schüsse pro Sekunde, Geschosse je Schuss,
 * Salve bzw. Magazin (Schüsse, 0 = Dauerfeuer) und Pause danach (s), Geschosstempo (m/s), Flugzeit (s),
 * Streuung (Grad). Strahl: Schaden pro Sekunde.
 */
export interface X4Gun { dmg: number; rate: number; amt: number; mag: number; reload: number; v: number; life: number; angle: number; /** Strahl: Reichweite in Spielpunkten (sonst 416) */ beamRange?: number }

export interface WeaponDef {
  name: string;
  /** nur auf M-Waffenplätzen (Korvette, Fregatte) */
  mOnly?: boolean;
  /** Split-eigene Waffe, allgemeine Waffe (von vielen Völkern gebaut) oder schwere Waffe nur für L-Waffenplätze */
  group: 'split' | 'allgemein' | 'schwer';
  desc: string;
  /** Werte für S- und M-Waffenplätze */
  s: X4Gun;
  m: X4Gun;
  /** eigene Werte für L-Waffenplätze (sonst aus der M-Version abgeleitet) */
  l?: X4Gun;
  /** Strahl statt Geschossen; Lanze: trifft sofort als Blitzstrahl */
  beam?: boolean;
  /** Anteil des Schadens, der den Schild umgeht und sofort auf die Hülle geht (Thermal-Desintegrator) */
  hullPierce?: number;
  /** Flächenschaden beim Einschlag (Radius): halber Schaden im Umkreis */
  splash?: number;
  /** Wirkung auf Schild und Hülle (Faktoren): Pulslaser Schildbrecher, Bolzenrepetierer Hüllenbrecher */
  shieldK?: number;
  hullK?: number;
  /** Schrot: voller Schaden bis ein Drittel der Reichweite, dann fallend bis 40 %; Wucht stößt S-Schiffe zurück */
  falloff?: boolean;
  knock?: number;
  /** Feuerart ab Werk versetzt (Rohr für Rohr im Takt) statt gebündelt (alle Rohre zugleich); derzeit überall gebündelt */
  stagger?: boolean;
  rail?: boolean;
  /** Mass Driver: Projektil mit langer Leuchtspur, durchschlägt ein Ziel und trifft das nächste mit halber Wucht */
  slug?: boolean;
  /**
   * Kettenblitz: springt vom ersten Ziel zu weiteren in der Nähe; je Treffer genau so stark, dass ein Späher vergeht,
   * gegen größere Schiffe und Türme fast wirkungslos (Waffe gegen Schwärme)
   */
  chain?: boolean;
  /**
   * Störblitz (mit chain): springt wie der Kettenblitz, macht aber keinen Schaden – legt S- und M-Schiffe kurz lahm
   * (treiben antriebslos, schießen nicht) und senkt bei L-Schiffen und Strukturen den Schild
   */
  emp?: boolean;
  /** Zielhilfe im Verhältnis zu sonst (Bosonenlanze: kleiner Schwenkbereich) */
  gimbal?: number;
  color: string;
  w: number;
}

/** X4-Takt, der im Minispiel einen Schuss pro Sekunde ergibt (Spielzeit je X4-Sekunde, siehe TIME) */
const TIME_RATE = 0.26 * 6;
/**
 * Nachladen und Pausen nach einer Salve bzw. einem Magazin dauern im Minispiel nur 60 % der X4-Zeit (im Spieltakt
 * gemessen etwa so lange wie in X4 selbst) – sonst wirken Schrotbatterie, Tau-Beschleuniger und Co. zu träge
 */
export const RELOAD = 0.6;

// Annahmen, wo die Daten nichts hergeben (siehe docs/design/split-militaerschiffe.md):
// – Plasmakanone: die Nachladezeit fehlt; sie feuert so schnell, wie ihre Kühlung es erlaubt (Hitze ÷ Kühlung).
// – Strahlenemitter: Schaden pro Sekunde; Reichweite wie der Pulslaser.
// – Bosonenlanze: etwa ein Schuss pro Sekunde (so im Spiel; der Datenwert 12,2 s ist offenbar nicht der Schusstakt),
//   trifft als blitzschneller Strahl sofort. Plasmaturm (Zweier-Magazin): 1 s zwischen den beiden Schüssen.
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  puls: {
    // Schildbrecher: Energie zehrt am Schild (+60 %), an der Hülle etwas weniger (−10 %)
    name: 'Pulslaser', group: 'allgemein', color: '#7ffff0', w: 2, shieldK: 1.6, hullK: 0.9,
    desc: 'Kurze Salven mit sehr schnellen, genauen Geschossen und großer Reichweite. Schildbrecher: gegen Schilde deutlich stärker, gegen nackte Hülle schwächer.',
    // schnellere Geschosse wie beim Pulsturm (9000 statt 5000), Reichweite gleich
    s: { dmg: 36, rate: 6, amt: 1, mag: 3, reload: 0.7, v: 9000, life: 0.389, angle: 0 },
    m: { dmg: 55, rate: 8, amt: 1, mag: 3, reload: 0.7, v: 9000, life: 0.444, angle: 0 },
  },
  bolzen: {
    // Hüllenbrecher: massive Bolzen schlagen in die Panzerung (+15 %), am Schild prallen sie eher ab (−30 %)
    name: 'Bolzenrepetierer', group: 'allgemein', color: '#ffd36b', w: 2.2, shieldK: 0.7, hullK: 1.15,
    desc: 'Lange Feuerstöße aus großen, langsameren Geschossen – danach ein paar Sekunden nachladen. Hüllenbrecher: gegen Panzerung deutlich stärker, gegen Schilde schwächer.',
    s: { dmg: 18, rate: 14, amt: 1, mag: 66, reload: 3.4, v: 2100, life: 1.3, angle: 0.33 },
    m: { dmg: 32, rate: 11.5, amt: 1, mag: 65, reload: 3.8, v: 2100, life: 1.7, angle: 0.33 },
  },
  schrot: {
    // Nahkampf: anderthalbfacher Schaden, aber nur auf kurze Entfernung voll; Wucht schafft Luft gegen Jäger
    name: 'Schrotbatterie', group: 'allgemein', color: '#ffc070', w: 1.8, falloff: true, knock: 240,
    desc: 'Sechs Geschosse je Schuss mit Streuung: verheerend aus der Nähe, auf Distanz verpufft die Ladung (ab einem Drittel der Reichweite bis auf 40 %). Die Wucht stößt Jäger zurück.',
    // schneller und flüssiger: höherer Takt, kürzeres Nachladen, schnellere Ladung (Reichweite gleich); Schaden je
    // Kugel so gesenkt, dass die Wirkung über ein Magazin samt Nachladen etwa gleich bleibt
    s: { dmg: 54, rate: 1.1, amt: 6, mag: 8, reload: 2.8, v: 2800, life: 0.823, angle: 1.16 },
    m: { dmg: 92, rate: 1, amt: 6, mag: 6, reload: 3, v: 2800, life: 1, angle: 1.16 },
  },
  strahl: {
    // ohne Rückstoß leicht nachzuführen: schwenkt in weitem Bereich (2,5-fach) selbst aufs Ziel und klebt an Jägern
    name: 'Strahlenemitter', group: 'allgemein', color: '#9ffcff', w: 2, beam: true, gimbal: 2.5,
    desc: 'Dauerstrahl: trifft sofort und genau – der Emitter schwenkt in weitem Bereich selbst aufs Ziel und bleibt auch an wendigen Jägern dran. Dafür wenig Schaden pro Sekunde.',
    s: { dmg: 82, rate: 0, amt: 1, mag: 0, reload: 0, v: 0, life: 0, angle: 0.18 },
    m: { dmg: 135, rate: 0, amt: 1, mag: 0, reload: 0, v: 0, life: 0, angle: 0.18 },
  },
  plasma: {
    // wie der Plasmaturm: 40 % durch den Schild, Spritzschaden beim Einschlag; schnellere Kugeln, Reichweite gleich
    name: 'Plasmakanone', group: 'allgemein', color: '#a6ff6b', w: 5, hullPierce: 0.4, splash: 55,
    desc: 'Schwere Plasmageschosse mit hohem Schaden und großer Reichweite. Das Plasma schlägt zum Teil durch den Schild und verbrennt beim Einschlag auch, was daneben fliegt.',
    // höherer Takt (gut eine Kugel je 1,5 s statt alle 2,5 s), Schaden je Kugel entsprechend geringer
    s: { dmg: 557, rate: 0.65, amt: 1, mag: 0, reload: 0, v: 1600, life: 2.85, angle: 0.7 },
    m: { dmg: 890, rate: 0.7, amt: 1, mag: 0, reload: 0, v: 1600, life: 3.75, angle: 0.7 },
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
    // halbes Nachladen, Schaden je Geschoss so gesenkt, dass die Wirkung je Magazin samt Pause etwa gleich bleibt
    s: { dmg: 42, rate: 2.5, amt: 4, mag: 6, reload: 2, v: 2000, life: 1.235, angle: 1.25 },
    m: { dmg: 68, rate: 2, amt: 4, mag: 6, reload: 2.5, v: 2000, life: 1.4, angle: 1.32 },
  },
  thermal: {
    // drei Viertel durch den Schild: die Waffe gegen stark geschilderte Ziele (vorher 40 %, ohne erkennbare Rolle)
    name: 'Thermal-Desintegrator', group: 'split', color: '#ff9d2e', w: 2.6, hullPierce: 0.75,
    desc: 'Split: drei Viertel jedes Treffers umgehen den Schild und gehen sofort auf die Hülle – die Waffe gegen stark geschützte Ziele.',
    // flüssiger: höherer Takt, größeres Magazin, kürzeres Nachladen – Schaden je Schuss so gesenkt, dass die Wirkung
    // je Magazin samt Pause etwa gleich bleibt
    s: { dmg: 27, rate: 6, amt: 1, mag: 12, reload: 1.5, v: 2200, life: 1.1, angle: 0.3 },
    m: { dmg: 69, rate: 6, amt: 1, mag: 12, reload: 2.5, v: 2200, life: 1.682, angle: 0.3 },
  },
  boson: {
    name: 'Bosonenlanze', group: 'split', color: '#e0c3ff', w: 3, gimbal: 0.5, rail: true,
    desc: 'Split: blitzschneller Lanzenstrahl, der sofort trifft – riesiger Schaden und größte Reichweite, etwa ein Schuss pro Sekunde.',
    s: { dmg: 750, rate: 1, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.55, angle: 0.23 },
    m: { dmg: 1150, rate: 1, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.59, angle: 0.23 },
  },
  // Kettenblitz: die Werte zählen nur für Takt und Reichweite (rund 530 Spielpunkte) – den Schaden bestimmt das Ziel
  blitz: {
    // nur M: auf Jägern mit einem Waffenplatz wäre er fast immer die beste Wahl (Schwärme ×3–4 gegenüber jeder Kanone)
    name: 'Kettenblitz', group: 'allgemein', color: '#bfe4ff', w: 2, chain: true, mOnly: true,
    desc: 'Nur für M-Waffenplätze. Entladung, die von Ziel zu Ziel springt (2 Sprünge plus einer je Bordkanone: Cobra 5, Drache 8; auf der Cobra etwas langsamer): in der Grundausrüstung zerstört jeder Treffer einen Kha’ak-Späher der Stufe 1 – auf höheren Stufen braucht es mehr; gegen größere Schiffe und Türme fast wirkungslos. Die Waffe gegen Schwärme.',
    s: { dmg: 14, rate: 2.6, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.16, angle: 0 },
    m: { dmg: 20, rate: 2.4, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.18, angle: 0 },
  },
  // Störblitz: Takt und Reichweite wie der Kettenblitz; statt Schaden lähmt er (Kombination mit Türmen)
  stoerblitz: {
    // nur M wie der Kettenblitz (auf der Cobra ebenso etwas langsamer und ein Sprung weniger)
    name: 'Störblitz', group: 'allgemein', color: '#a8f4ff', w: 2, chain: true, emp: true, mOnly: true,
    desc: 'Nur für M-Waffenplätze. Entladung ohne Schaden, weiter und mit mehr Sprüngen als der Kettenblitz (5 plus einer je Bordkanone: Cobra 8, Drache 11; auf der Cobra etwas langsamer): S- und M-Schiffe werden vom Schiff weggestoßen und sind 1,5 s lahmgelegt – sie schießen nicht und nehmen 50 % mehr Schaden. Trifft er ein schon gelähmtes Ziel, brennt dessen Elektrik durch (geringer Schaden: ein Späher der Stufe 1 hält vier solche Treffer aus). Am Einschlag bleibt 2,5 s eine Ionenwolke, die jeden lähmt, der hineinfliegt. L-Schiffen und Strukturen nimmt jeder Treffer 15 % Schild und ionisiert sie: 1,5 s lang 25 % mehr Schaden.',
    // gut ein Drittel weiter als der Kettenblitz
    s: { dmg: 14, rate: 2.6, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.22, angle: 0 },
    m: { dmg: 20, rate: 2.4, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.245, angle: 0 },
  },
  // Mass Driver (Terraner): ballistisch wie eine Kanone, aber mit sehr hoher Mündungsgeschwindigkeit – zwischen
  // Neutronen-Gatling und Bosonenlanze eingeordnet: rund 60 % des Lanzenschadens je Schuss, etwas schnellerer Takt,
  // kann aber verfehlen (sichtbares Projektil, etwas Vorhalt nötig); Durchschlag als Besonderheit
  massdriver: {
    name: 'Mass Driver', group: 'allgemein', color: '#9fdcff', w: 2.6, gimbal: 0.7, slug: true,
    desc: 'Terraner: magnetisch beschleunigtes Projektil, sehr schnell und mit langer Leuchtspur – hoher Einzelschaden, durchschlägt ein Ziel und trifft das nächste mit halber Wucht. Kann verfehlen.',
    s: { dmg: 450, rate: 0.8, amt: 1, mag: 0, reload: 0, v: 5200, life: 1.15, angle: 0.12 },
    m: { dmg: 690, rate: 0.8, amt: 1, mag: 0, reload: 0, v: 5200, life: 1.25, angle: 0.12 },
  },
  // Schwere Hauptbatterie (nur L): eigene Entwürfe ohne X4-Vorbild. Takt so gewählt, dass im Minispiel etwa ein Schuss
  // pro Sekunde fällt (Schnellfeuer) bzw. drei Schuss in einer Sekunde, dann drei Sekunden Pause (Salve).
  schnellplasma: {
    name: 'Schnellfeuer-Plasmakanone', group: 'schwer', color: '#a6ff6b', w: 5,
    desc: 'Schwere Plasmakugeln im Sekundentakt, ohne Nachladen – große Reichweite, schneller als die normale Plasmakanone.',
    s: { dmg: 900, rate: TIME_RATE, amt: 1, mag: 0, reload: 0, v: 1500, life: 7.3, angle: 0.5 },
    m: { dmg: 900, rate: TIME_RATE, amt: 1, mag: 0, reload: 0, v: 1500, life: 7.3, angle: 0.5 },
    l: { dmg: 900, rate: TIME_RATE, amt: 1, mag: 0, reload: 0, v: 1500, life: 7.3, angle: 0.5 },
  },
  plasmasalve: {
    name: 'Plasma-Salvenkanone', group: 'schwer', color: '#c8ff6b', w: 5,
    desc: 'Drei schwere Plasmakugeln kurz hintereinander, dann drei Sekunden nachladen – viel Wucht auf einen Schlag.',
    s: { dmg: 1100, rate: TIME_RATE * 3, amt: 1, mag: 3, reload: 3 / (TIME_RATE * RELOAD), v: 1500, life: 7.3, angle: 0.4 },
    m: { dmg: 1100, rate: TIME_RATE * 3, amt: 1, mag: 3, reload: 3 / (TIME_RATE * RELOAD), v: 1500, life: 7.3, angle: 0.4 },
    l: { dmg: 1100, rate: TIME_RATE * 3, amt: 1, mag: 3, reload: 3 / (TIME_RATE * RELOAD), v: 1500, life: 7.3, angle: 0.4 },
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/**
 * Werte einer Waffe für eine Platzgröße. L-Hauptbatterie (Zerstörer): die Daten fehlen noch – Annahme: aus der
 * M-Version abgeleitet, etwas langsamerer Takt und 2,5-fache Reichweite (höchstens 1.500 Spielpunkte – etwa wie der
 * schwere Bosonenlanzen-Turm); Nahkampfwaffen bleiben so kürzer als Plasma. Schaden je Geschoss: Waffen mit schweren
 * Einzeltreffern (Plasma, Bosonenlanze: über 300 je Treffer) dreifach – sie zerlegen Gegner ohnehin mit einem Schuss –,
 * alle anderen sechsfach, damit ihre Dauerleistung (gut 4,5- bis 6-mal M) mit den schweren mithält.
 */
export function weaponGun(w: WeaponDef, size: GunSize): X4Gun {
  if (size !== 'l') return w[size];
  if (w.l) return w.l;
  const m = w.m, k = m.dmg > 300 ? 3 : 6;
  if (w.beam) return { ...m, dmg: m.dmg * k, beamRange: 416 * 2.5 };
  const reach = m.v * m.life * RANGE_SCALE;
  return { ...m, dmg: m.dmg * k, rate: m.rate * 0.75, life: m.life * Math.min(2.5, L_MAX_RANGE / reach) };
}

/** Waffe passt auf diesen Waffenplatz (schwere Waffen nur auf L-Plätze) */
export function weaponFits(w: WeaponDef, size: GunSize): boolean {
  if (w.mOnly) return size === 'm';
  return w.group !== 'schwer' || size === 'l';
}

/** Split-Türme (M) für Korvette und Fregatte – Werte aus den Spieldaten 9.0 (Drehtempo in Grad pro Sekunde) */
/**
 * Raketenturm: feuert Lenkraketen statt Geschossen. n Raketen je Salve, gap Sekunden zwischen zwei Raketen (0 = alle
 * zugleich), danach reload Sekunden Pause; dmg und range als Vielfaches der Lenkrakete; fixed: dreht sich nicht (Silo);
 * salvos: Vorrat je Turm in vollen Salven (danach schweigt er bis zum Ende der Runde)
 */
export interface TurretMissile { n: number; gap: number; reload: number; dmg: number; range: number; salvos: number; fixed?: boolean; /** Raketenart (TURRET_MISSILES) */ kind: 'silo' | 'spreng' }
export interface TurretDef { name: string; desc: string; gun: X4Gun; turn: number; color: string; w: number; rail?: boolean; /** Dauerstrahl (Schaden pro Sekunde) */ beam?: boolean; missile?: TurretMissile; /** Flak: Sprenggranaten mit Annäherungszünder */ flak?: boolean; /** Anteil, der den Schild umgeht */ hullPierce?: number; /** Flächenschaden beim Einschlag (Radius) */ splash?: number; /** Wirkung auf Schild und Hülle (Pulsturm: Schildbrecher) */ shieldK?: number; hullK?: number }
export const TURRETS: Record<TurretId, TurretDef> = {
  puls: { name: 'Pulsturm', desc: 'Dauerfeuer ohne Nachladen, schwenkt schnell und trifft genau – wendige Jäger entkommen ihm kaum. Schildbrecher wie der Pulslaser: gegen Schilde deutlich stärker, gegen nackte Hülle etwas schwächer.', turn: 180, color: '#7ffff0', w: 2, shieldK: 1.6, hullK: 0.9,
    gun: { dmg: 44, rate: 3.8, amt: 1, mag: 0, reload: 0, v: 9000, life: 0.39, angle: 0.17 } },
  // Strahlenturm: wie der Strahlenemitter (M) als Dauerstrahl; trifft sofort, solange er auf dem Ziel liegt
  strahl: { name: 'Strahlenturm', desc: 'Dauerstrahl: trifft sofort, solange er auf dem Ziel liegt – wenig Schaden pro Sekunde, aber nie daneben; wendige Jäger kommen kaum heran.', turn: 150, color: '#9ffcff', w: 2, beam: true,
    gun: { dmg: 120, rate: 0, amt: 1, mag: 0, reload: 0, v: 0, life: 0, angle: 0 } },
  neutron: { name: 'Neutronen-Gatling-Turm', desc: 'Langer Dauerstrom, dann fünf Sekunden nachladen; feuert erst, wenn er genau auf dem Ziel liegt.', turn: 140, color: '#ff8a3d', w: 2,
    // Nachladen kürzer als in den X4-Daten (8): im Spiel 5 s statt 7,5 s – sonst länger stumm als feuernd
    gun: { dmg: 18, rate: 18, amt: 1, mag: 80, reload: 5.3, v: 2500, life: 1.4, angle: 0.45 } },
  tau: { name: 'Tau-Beschleuniger-Turm', desc: 'Vier Geschosse je Schuss, kurze Reichweite.', turn: 160, color: '#ff5a5a', w: 2.2,
    gun: { dmg: 42, rate: 3, amt: 4, mag: 8, reload: 5, v: 2000, life: 1.235, angle: 1.15 } },
  // Plasma: heißes Gas schlägt zu 40 % durch den Schild und spritzt beim Einschlag auf Nachbarn (halber Schaden)
  plasma: { name: 'Plasmaturm', desc: 'Schwere Plasmakugeln in ruhigem Takt, ohne Nachladen. Das Plasma schlägt zum Teil durch den Schild und verbrennt beim Einschlag auch, was daneben fliegt.', turn: 70, color: '#a6ff6b', w: 4, hullPierce: 0.4, splash: 60,
    gun: { dmg: 240, rate: 0.8, amt: 1, mag: 0, reload: 0, v: 1600, life: 3.44, angle: 0.8 } },
  // M-Lanze: blasses Blaulila, kurzer schmaler Blitz (die schwere L-Lanze ist orange, dick und glüht lange nach)
  boson: { name: 'Bosonenlanzen-Turm', desc: 'Blitzschneller Lanzenstrahl, ein schwerer Schuss alle zwei Sekunden; schwenkt langsam. Gegen Großkampfschiffe verheerend, gegen Schwärme zu langsam.', turn: 40, color: '#c9d6ff', w: 3, rail: true,
    // im Spiel abgeschwächt: halber Schaden, Reichweite gut 4 km statt 8 (war doppelt so weit wie alle M-Türme und
    // zerlegte Großkampfschiffe in Sekunden)
    gun: { dmg: 700, rate: 0.5, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.3, angle: 0.18 } },
  // Raketen-Vierling (M): vier Lenkraketen auf einmal, dann Pause; Schaden und Takt für die Wertung unten aus der Lenkrakete
  // halber Raketenschaden und zehn Sekunden Pause; jede Salve nur so groß, wie das Ziel braucht (der Rest geht auf
  // das nächste), Ziele mit genug Raketen im Anflug lässt er aus; Nachschub nach jeder Welle
  rakete: { name: 'Raketen-Vierling', desc: 'Nur auf L- und XL-Schiffen (Klapperschlange: eine Turmgruppe, Raptor: vier). Vier Sprengraketen im Magazin, dann zehn Sekunden Nachladen. Annäherungszünder wie die Flak: zünden neben dem Ziel und treffen alles im Umkreis – stark gegen Schwärme, gegen große gepanzerte Ziele fast wirkungslos. Schickt jedem Ziel nur so viele Raketen, wie es braucht. Vorrat: 80 Raketen je Turm, nach jeder Welle 16 nach.', turn: 90, color: '#ffb070', w: 2,
    missile: { n: 4, gap: 0, reload: 10, dmg: 0.5, range: 1, salvos: 20, kind: 'spreng' },
    gun: { dmg: 0, rate: 1, amt: 4, mag: 0, reload: 0, v: 400, life: 6.5, angle: 0 } },
  // Flakturm: Sprenggranaten mit Annäherungszünder – zerplatzen zwischen kleinen Schiffen und Raketen
  flak: { name: 'Flakturm', desc: 'Sprenggranaten mit Annäherungszünder: zerplatzen zwischen kleinen Schiffen und treffen alles im Umkreis – stark gegen Schwärme, schwach gegen große Ziele.', turn: 170, color: '#ffb070', w: 2.2, flak: true,
    // vier Rohre, vier Granaten je Magazin; Nachladen so gewählt, dass die mittlere Feuerrate wie mit sechs bleibt
    // (6 Schuss in 5 Takten + 3 s ≙ 4 Schuss in 3 Takten + 2,25 s); danach Takt und Nachladen um 40 % schneller
    // schnellere Granaten (wie die Gatling) und gut 4 km Reichweite – Flugbahnen und Sprengwolken weiter draußen
    gun: { dmg: 30, rate: 3.08, amt: 1, mag: 4, reload: 1.6, v: 2500, life: 1.68, angle: 0.3 } },
};
export const TURRET_IDS = Object.keys(TURRETS) as TurretId[];

/**
 * Schwere L-Türme des Zerstörers. Die Werte der Split-L-Türme stehen noch aus – Annahme: wie die M-Türme gleicher Art
 * mit etwa dreifachem Schaden, größerer Reichweite und langsamerem Schwenken. barrel: Bild des Kanonenrohrs.
 */
export interface LTurretDef extends TurretDef { barrel: string }
export const LTURRETS: Record<LTurretId, LTurretDef> = {
  // wie der M-Plasmaturm: ruhiger Takt statt Doppelschuss mit langer Pause, 40 % durch den Schild, Spritzschaden;
  // schnellere Kugeln (Reichweite gleich) und etwas schnelleres Schwenken
  plasma: { name: 'Schwerer Plasmaturm', desc: 'Sehr schwere Plasmakugeln im ruhigen Takt, große Reichweite. Das Plasma schlägt zum Teil durch den Schild und verbrennt beim Einschlag auch, was daneben fliegt.', turn: 45, color: '#a6ff6b', w: 5, barrel: 'split-lturm-rohr-plasma-ki', hullPierce: 0.4, splash: 90,
    gun: { dmg: 1200, rate: 0.5, amt: 1, mag: 0, reload: 0, v: 1500, life: 4.77, angle: 0.6 } },
  tau: { name: 'Schwerer Tau-Beschleuniger-Turm', desc: 'Vier Geschosse je Schuss in schneller Folge – verheerend auf mittlere Entfernung.', turn: 70, color: '#ff5a5a', w: 2.6, barrel: 'split-lturm-rohr-tau-ki',
    gun: { dmg: 125, rate: 2.4, amt: 4, mag: 8, reload: 4.5, v: 2300, life: 1.6, angle: 1 } },
  boson: { name: 'Schwerer Bosonenlanzen-Turm', desc: 'Blitzschneller, sehr schwerer Lanzenstrahl, der sofort trifft – schwenkt langsam.', turn: 25, color: '#ff8a2a', w: 6, rail: true, barrel: 'split-lturm-rohr-boson-ki',
    gun: { dmg: 2400, rate: 0.6, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.7, angle: 0.15 } },
  neutron: { name: 'Schwerer Neutronen-Gatling-Turm', desc: 'Langer, dichter Geschossstrom, dann nachladen – viel Druck auf Jäger.', turn: 70, color: '#ff8a3d', w: 2.6, barrel: 'split-lturm-rohr-neutron-ki',
    gun: { dmg: 48, rate: 14, amt: 1, mag: 100, reload: 7, v: 2700, life: 1.7, angle: 0.4 } },
  // Raketensilo (L, fest im Rumpf, dreht nicht): acht schwerere Lenkraketen kurz nacheinander, doppelte Reichweite
  silo: { name: 'Raketensilo', desc: 'Fest im Rumpf verankert: acht Lenkraketen kurz nacheinander (alle 0,3 s), schwere, langsame Panzerbrecher mit doppelter Reichweite, dann vier Sekunden Nachladen. Stark gegen Boote und Großziele, gegen wendige Jäger ungenau und ohne Flächenschaden. Nur in einer L-Gruppe des Raptors. Vorrat: 160 Raketen je Silo.', turn: 0, color: '#ff9a4a', w: 2.6, barrel: 'split-lturm-silo-ki',
    missile: { n: 8, gap: 0.3, reload: 4, dmg: 1.4, range: 2, salvos: 20, fixed: true, kind: 'silo' },
    gun: { dmg: 0, rate: 1, amt: 8, mag: 0, reload: 0, v: 400, life: 13, angle: 0 } },
};
export const LTURRET_IDS = Object.keys(LTURRETS) as LTurretId[];

/** Schaden pro Sekunde im Dauerbetrieb (mit Salven- bzw. Nachladepausen), in X4-Werten */
export function sustainedDps(g: X4Gun, beam = false): number {
  if (beam) return g.dmg;
  const per = g.dmg * g.amt;
  if (!g.mag) return per * g.rate;
  return (per * g.mag) / ((g.mag - 1) / g.rate + Math.max(g.reload * RELOAD, 1 / g.rate));
}

/**
 * Flakturm: die Granate trifft nie direkt, sie zerplatzt zu einer Sprengwolke, die je Ziel gut 70 % eines Spähers trifft
 * (Hülle + Schild, siehe pflakBurst). Für die Anzeige in X4-Werten umgerechnet – Späher Stufe 1 (31), Grundausrüstung
 * (Schaden 6 je X4-Punkt × DMG_SCALE) –, damit die Zahl mit den anderen Türmen vergleichbar ist; gilt je Ziel in der Wolke.
 */
export const FLAK_SCOUT_HP = 30.6;
export const flakX4Dmg = (): number => (FLAK_SCOUT_HP * 1.02 * 0.7) / (6 * DMG_SCALE);

/** Schaden pro Sekunde eines Turms für die Anzeige (Flak: Sprengwolke je Ziel statt der Granate selbst) */
export function turretDps(t: { gun: X4Gun; beam?: boolean; flak?: boolean }): number {
  return t.flak ? sustainedDps({ ...t.gun, dmg: flakX4Dmg() }) : sustainedDps(t.gun, t.beam);
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
// (Maßstab mit der ursprünglichen Nachladezeit, damit das schnellere Nachladen mehr Feuerkraft bringt statt den
// Schaden je Treffer zu senken)
export const DMG_SCALE = (0.5 / 0.26) * TIME / sustainedDps({ ...WEAPONS.puls.s, reload: WEAPONS.puls.s.reload / RELOAD });
/**
 * Reichweitenfaktor für alle eigenen Waffen und Türme, die der Begleiter und alle gegnerischen Türme (Großkampfschiffe,
 * Plattformen) – zum Ausprobieren verdoppelt; die Bordwaffen gegnerischer Jäger und Boote bleiben, wie sie sind.
 * 1 = bisherige Reichweiten (3500 m Pulslaser = 416 Bildpunkte)
 */
export const RANGE_X = 2;
/** Reichweite: 3500 m Pulslaser = 416 Bildpunkte (× RANGE_X); Geschosstempo verdichtet (Wurzel), sonst wären Plasma zu langsam und Bosonen zu schnell */
const RANGE_SCALE = (416 / 3500) * RANGE_X;
/** größte Reichweite der L-Hauptbatterie (Spielpunkte) */
const L_MAX_RANGE = 1500 * RANGE_X;
export function gameSpeed(v: number): number { return 640 * Math.sqrt(v / 5000); }
export function gameRange(g: X4Gun, beam = false): number { return beam ? (g.beamRange ?? 416) * RANGE_X : g.v * g.life * RANGE_SCALE; }

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
  salvo: { name: 'Raketenschwarm', key: 'S', cd: 15 },
};

/**
 * Raketenarten (für alle Schiffe mit Raketenwerfer, in der Ausrüstung wählbar). Schaden als Vielfaches von
 * MISSILE_DMG – eine Lenkrakete trifft etwa so hart wie die Bosonenlanze (S) und wächst wie die Bordwaffen mit der
 * Ausrüstungsstufe. Werte zum Ausprobieren.
 */
export const MISSILE_DMG = 130;
// Raketentürme: Schaden je Rakete und Salventakt in X4-Werten, damit Wertung und Anzeige (Schaden pro Sekunde) stimmen –
// eine Lenkrakete richtet bei Grundausstattung (Faktor 6) MISSILE_DMG an, die Pause zählt in X4-Sekunden
for (const t of [...Object.values(TURRETS), ...Object.values(LTURRETS)]) {
  const m = t.missile;
  if (!m) continue;
  t.gun.dmg = (MISSILE_DMG * m.dmg) / (6 * DMG_SCALE);
  t.gun.rate = TIME / (m.reload + m.gap * (m.n - 1));
}
export interface MissileDef {
  name: string;
  desc: string;
  /** Rolle in einem Satz (Menü) */
  role: string;
  /** Schaden je Treffer (Anteil von MISSILE_DMG) */
  dmg: number;
  /** Höchsttempo, Beschleunigung, Drehrate (rad/s) und Flugzeit (s) – Tempo × Flugzeit = Reichweite */
  v: number;
  acc: number;
  turn: number;
  life: number;
  /** Lagerplätze je Rakete */
  slots: number;
  /** Zielwahl: aim = was vor dem Bug liegt (auch weit weg), near = die nächsten, big = große Ziele zuerst, shield = Ziele mit Schild zuerst */
  lock: 'aim' | 'near' | 'big' | 'shield';
  /** Schaden je Zielklasse (S Jäger, M Boote, L Großziele und Türme) */
  vs?: Partial<Record<'S' | 'M' | 'L', number>>;
  /** Anteil des Schadens, der auf einen Schild wirkt (Rest verpufft) */
  vsShield?: number;
  /** Flächenschaden (Radius, Anteil des Schadens) */
  splash?: [number, number];
  /** zerfällt kurz nach dem Start in so viele kleine Lenkköpfe (Flugzeit der Lenkköpfe: life) */
  split?: number;
  /** löscht den Schild des Ziels und hält ihn so lange (s) unten */
  stun?: number;
  /** stört die Waffen des Ziels so lange (s) */
  jam?: number;
  /** Annäherungszünder (Sprengrakete): zündet so nah am Ziel bzw. am nächsten Punkt des Vorbeiflugs; Wirkradius und
   * Schaden je Klasse aus vs */
  prox?: number;
  blast?: number;
  color: string;
  size: number;
}
/**
 * Jede Rakete hat ihren Einsatzzweck – keine ist immer die beste:
 * Lenkrakete weit und sicher gegen Einzelziele, Schwere Rakete gegen Boote und Großziele (gegen Jäger schwach),
 * Schwarmrakete auf kurze Entfernung gegen viele kleine Ziele (an Schilden schwach), Störrakete als Werkzeug.
 */
export const MISSILES: Record<MissileId, MissileDef> = {
  lenk: { name: 'Lenkrakete', role: 'Weit und sicher gegen Einzelziele', desc: 'Größte Reichweite: sucht sich, was vor dem Bug liegt – auch weit draußen. Große und langsame Ziele trifft sie sicher; ein wendiger Jäger, der quer abdreht, kann ihr entkommen – vorbeigeflogen verliert sie die Erfassung. Gegen viele kleine Ziele zu wenige.', dmg: 1, v: 400, acc: 1000, turn: 2.5, life: 6.5, slots: 1, lock: 'aim', color: '#ffb070', size: 20 },
  schwer: { name: 'Schwere Rakete', role: 'Panzerbrecher gegen Boote und Großziele', desc: 'Doppelter Schaden, gegen Boote, Türme und Großziele noch mehr, dazu eine Druckwelle. Sucht große Ziele zuerst. Langsam und träge: wendige Jäger weichen aus und nehmen nur wenig Schaden. Belegt zwei Lagerplätze.', dmg: 2, v: 250, acc: 420, turn: 1.5, life: 6, slots: 2, lock: 'big', vs: { S: 0.5, M: 1.4, L: 1.6 }, splash: [70, 0.5], color: '#ff7a3a', size: 26 },
  schwarm: { name: 'Schwarmrakete', role: 'Nahbereich gegen Schwärme', desc: 'Zerfällt nach dem Start in vier Lenkköpfe, die sich verschiedene Ziele suchen – stark gegen Schwärme kleiner Schiffe. Die wendigsten Raketen: verfehlt ein Lenkkopf, wendet er und bleibt dran. Geringe Reichweite, und Schilde halten die kleinen Ladungen gut ab.', dmg: 0.35, v: 560, acc: 1400, turn: 5, life: 1.1, slots: 1, lock: 'near', split: 4, vsShield: 0.5, color: '#ffd27a', size: 16 },
  stoer: { name: 'Störrakete', role: 'Werkzeug: Schilde und Waffen ausschalten', desc: 'Kaum Schaden, aber sie löscht den Schild des Ziels für fünf Sekunden und stört drei Sekunden lang seine Waffen. Sucht Ziele mit Schild zuerst – ideal vor einer Salve aus den Bordkanonen.', dmg: 0.3, v: 420, acc: 1050, turn: 2.6, life: 4, slots: 1, lock: 'shield', stun: 5, jam: 3, color: '#8fe0ff', size: 20 },
};
/**
 * Raketen der Türme (nicht für Werfer wählbar):
 * Silo-Rakete – Panzerbrecher: langsam, sehr träge, schwerer Sprengkopf ohne Flächenschaden; gegen Boote und Großziele
 * stark, gegen Jäger schwach (und wendige Jäger fliegen aus ihrem Wendekreis).
 * Sprengrakete (Vierling) – schnell, mittel wendig, Annäherungszünder wie die Flak: zündet neben dem Ziel und trifft
 * alles im Umkreis; gegen große gepanzerte Ziele fast wirkungslos.
 */
export const TURRET_MISSILES: Record<'silo' | 'spreng', MissileDef> = {
  silo: { name: 'Silo-Rakete', role: 'Panzerbrecher gegen Großziele', desc: '', dmg: 1, v: 320, acc: 640, turn: 1.4, life: 8.125, slots: 1, lock: 'big', vs: { S: 0.6, M: 2, L: 3.5 }, color: '#ff9a4a', size: 26 },
  spreng: { name: 'Sprengrakete', role: 'Raketen-Flak gegen Schwärme', desc: '', dmg: 1, v: 520, acc: 1300, turn: 2.4, life: 5, slots: 1, lock: 'near', vs: { S: 1, M: 0.5, L: 0.15 }, prox: 32, blast: 75, color: '#ffd27a', size: 18 },
};
/**
 * Feuerart der Bordkanonen je Waffe: versetzt (Rohr für Rohr, gleichmäßig über die Schusspause verteilt) oder gebündelt
 * (alle Rohre zugleich). Ab Werk nach WeaponDef.stagger; im Kampf umschaltbar und je Waffe gemerkt.
 */
const FIRE_MODE_KEY = 'x4-sektorbau-feuerart';
export function fireStaggered(w: WeaponId): boolean {
  try {
    const m = JSON.parse(globalThis.localStorage?.getItem(FIRE_MODE_KEY) ?? '{}') as Record<string, string>;
    if (m[w] === 'versetzt') return true;
    if (m[w] === 'gebuendelt') return false;
  } catch { /* nichts gemerkt */ }
  return !!WEAPONS[w]?.stagger;
}
export function setFireStaggered(w: WeaponId, on: boolean): void {
  try {
    const m = JSON.parse(globalThis.localStorage?.getItem(FIRE_MODE_KEY) ?? '{}') as Record<string, string>;
    m[w] = on ? 'versetzt' : 'gebuendelt';
    globalThis.localStorage?.setItem(FIRE_MODE_KEY, JSON.stringify(m));
  } catch { /* Speicher nicht verfügbar */ }
}
export const MISSILE_IDS = Object.keys(MISSILES) as MissileId[];

export interface Loadout { ship: ShipId; weapon: WeaponId; turret: TurretId; shield: ShieldId; /** schwere L-Türme (nur Zerstörer) */ lturret?: LTurretId; /** Raketenart (nur Schiffe mit Raketenwerfer) */ missile?: MissileId;
  /** Träger: Turmart je Gruppe (Index wie ShipDef.groups; M-Gruppen TurretId, L-Gruppen LTurretId) */ groups?: string[];
  /** Staffel: eigene Begleitschiffe (S und M) – beim Träger im Hangar, sonst als Flügelleute */ wing?: Partial<Record<ShipId, number>>;
  /** Ausrüstung der Begleitschiffe je Schiffstyp: Bordwaffe, Turmart (M-Schiffe mit Türmen), Raketen (Schiffe mit Werfern) */ wingGear?: Partial<Record<ShipId, WingGear>> }
export interface WingGear { weapon?: WeaponId; turret?: TurretId; missile?: MissileId }
export const DEFAULT_LOADOUT: Loadout = { ship: 'mamba', weapon: 'puls', turret: 'puls', shield: 'leicht', lturret: 'plasma', missile: 'lenk' };
/** Namen aus früheren Versionen (gespeicherte Ausrüstung) */
const OLD: Record<string, string> = { impuls: 'puls', splitter: 'schrot' };

const KEY = 'x4-sektorbau-ausruestung';
/** Hinweis, wenn beim Laden oder Schiffswechsel Raketen-Vierlinge ersetzt wurden (einmal abholen) */
let turretNote: string | null = null;
export function takeTurretNote(): string | null { const n = turretNote; turretNote = null; return n; }

function valid(l: (Partial<Record<Exclude<keyof Loadout, 'groups' | 'wing' | 'wingGear'>, string>> & { groups?: unknown; wing?: unknown; wingGear?: unknown }) | null | undefined): Loadout {
  const weapon = OLD[l?.weapon ?? ''] ?? l?.weapon, turret = OLD[l?.turret ?? ''] ?? l?.turret;
  return {
    ship: l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship,
    weapon: weapon && weapon in WEAPONS && weaponFits(WEAPONS[weapon as WeaponId], SHIPS[l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship].gunSize) ? (weapon as WeaponId) : DEFAULT_LOADOUT.weapon,
    // Raketen-Vierling als Grundart nur auf Schiffen, die ihn tragen dürfen
    turret: turret && turret in TURRETS ? (turret === 'rakete' && !rocketCap(l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship) ? 'tau' : (turret as TurretId)) : DEFAULT_LOADOUT.turret,
    shield: l?.shield && l.shield in SHIELDS ? (l.shield as ShieldId) : DEFAULT_LOADOUT.shield,
    // das Silo braucht einen Sockel im Rumpf – die Schulterrohre des Zerstörers tragen es nicht
    lturret: l?.lturret && l.lturret in LTURRETS && l.lturret !== 'silo' ? (l.lturret as LTurretId) : DEFAULT_LOADOUT.lturret,
    missile: l?.missile && l.missile in MISSILES ? (l.missile as MissileId) : DEFAULT_LOADOUT.missile,
    groups: validGroups(l?.groups, l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship, turret && turret in TURRETS ? (turret as TurretId) : DEFAULT_LOADOUT.turret),
    wing: validWing(l?.wing, l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship),
    wingGear: validWingGear(l?.wingGear),
  };
}

/** Schiffe, die als Begleitschiffe mitfliegen können (S und M) */
export const WING_IDS = (Object.keys(SHIPS) as ShipId[]).filter((id) => SHIPS[id].cls === 'S' || SHIPS[id].cls === 'M');
/** Flügelleute ohne Träger: höchstens so viele */
export const WING_MAX = 4;
/** Platz für Begleitschiffe: Träger nach Hangar (S und M getrennt), sonst WING_MAX zusammen */
export function wingRoom(ship: ShipId): { S: number; M: number; total: number } {
  const h = SHIPS[ship].hangar;
  return h ? { S: h.S, M: h.M, total: h.S + h.M } : { S: WING_MAX, M: WING_MAX, total: WING_MAX };
}
/** Staffel prüfen und auf den Platz des gewählten Schiffs kürzen */
export function validWing(w: unknown, ship: ShipId): Partial<Record<ShipId, number>> {
  const room = wingRoom(ship), out: Partial<Record<ShipId, number>> = {};
  let s = 0, m = 0;
  if (w && typeof w === 'object') for (const id of WING_IDS) {
    const n = Math.floor(Number((w as Record<string, unknown>)[id]) || 0);
    if (n <= 0) continue;
    const isS = SHIPS[id].cls === 'S';
    const free = Math.min(isS ? room.S - s : room.M - m, room.total - s - m);
    const k = Math.max(0, Math.min(n, free));
    if (!k) continue;
    out[id] = k;
    if (isS) s += k; else m += k;
  }
  return out;
}
/** Was ein Begleitschiff tragen kann: Waffen passend zu seinen Waffenplätzen, Türme nur mit Turmplätzen, Raketen nur mit Werfern */
export function wingOptions(id: ShipId): { weapons: WeaponId[]; turrets: TurretId[]; missiles: MissileId[] } {
  const d = SHIPS[id];
  return {
    weapons: WEAPON_IDS.filter((w) => weaponFits(WEAPONS[w], d.gunSize)),
    // Raketentürme nur auf dem eigenen Schiff (Begleitschiffe feuern Geschosse)
    turrets: d.turrets.length ? TURRET_IDS.filter((t) => !TURRETS[t].missile) : [],
    missiles: d.x4.launchers ? MISSILE_IDS : [],
  };
}
/** Ausrüstung eines Begleitschiff-Typs (fehlende Angaben: Pulslaser, Pulstürme, Lenkraketen) */
export function wingGearOf(lo: Loadout, id: ShipId): Required<WingGear> {
  const g = lo.wingGear?.[id] ?? {}, o = wingOptions(id);
  return {
    weapon: g.weapon && o.weapons.includes(g.weapon) ? g.weapon : o.weapons.includes('puls') ? 'puls' : o.weapons[0],
    turret: g.turret && o.turrets.includes(g.turret) ? g.turret : 'puls',
    missile: g.missile && MISSILE_IDS.includes(g.missile) ? g.missile : 'lenk',
  };
}
function validWingGear(g: unknown): Partial<Record<ShipId, WingGear>> {
  const out: Partial<Record<ShipId, WingGear>> = {};
  if (!g || typeof g !== 'object') return out;
  for (const id of WING_IDS) {
    const x = (g as Record<string, Record<string, string> | undefined>)[id];
    if (!x || typeof x !== 'object') continue;
    const o = wingOptions(id), e: WingGear = {};
    if (o.weapons.includes(x.weapon as WeaponId)) e.weapon = x.weapon as WeaponId;
    if (o.turrets.includes(x.turret as TurretId)) e.turret = x.turret as TurretId;
    if (o.missiles.includes(x.missile as MissileId)) e.missile = x.missile as MissileId;
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}
/** Anzahl Begleitschiffe */
export const wingCount = (w: Loadout['wing']): number => Object.values(w ?? {}).reduce((a, b) => a + (b ?? 0), 0);

/**
 * Turmarten der Turmgruppen des Schiffs prüfen. Fehlende Gruppen bekommen die bisher gewählte Turmart (Träger:
 * Pulstürme bzw. schwere Plasmatürme). Eine Liste, die nicht zum Schiff passt (aus der Zeit ohne Gruppen oder von einem
 * anderen Schiff), gilt als nicht gesetzt.
 */
function validGroups(g: unknown, ship: ShipId, turret: TurretId): string[] {
  const gs = SHIPS[ship].groups ?? [];
  const raw = Array.isArray(g) ? g : [];
  const list = ship === 'raptor' || raw.length === gs.length ? raw : [];
  // Raketen-Vierlinge: nur so viele Gruppen wie erlaubt, vom Bug an gezählt; die übrigen werden Tau-Türme
  let rockets = 0, silos = 0;
  const cap = rocketCap(ship);
  return gs.map((gr, i) => {
    const v = list[i];
    if (gr.kind === 'L') {
      const l = typeof v === 'string' && v in LTURRETS ? v : 'plasma';
      // Raketensilos: nur in so vielen L-Gruppen wie erlaubt (vom Bug an gezählt), die übrigen werden Plasmatürme
      if (l !== 'silo' || silos < siloCap(ship)) { if (l === 'silo') silos++; return l; }
      turretNote = (turretNote ? `${turretNote}. ` : '') + `${SHIPS[ship].name}: Raketensilos in höchstens ${siloCap(ship) === 1 ? 'einer L-Gruppe' : `${siloCap(ship)} L-Gruppen`} – überzählige durch schwere Plasmatürme ersetzt`;
      return 'plasma';
    }
    const t = typeof v === 'string' && v in TURRETS ? v : ship === 'raptor' ? 'puls' : turret;
    if (t !== 'rakete') return t;
    if (rockets < cap) { rockets++; return t; }
    turretNote = cap
      ? `${SHIPS[ship].name}: Raketen-Vierlinge in höchstens ${cap === 1 ? 'einer Gruppe' : `${cap} Gruppen`} – überzählige durch Tau-Beschleuniger ersetzt`
      : 'Raketen-Vierlinge gibt es nur noch auf L- und XL-Schiffen – ersetzt durch Tau-Beschleuniger';
    return 'tau';
  });
}

/** Raketen-Vierlinge: in wie vielen M-Turmgruppen dieses Schiffs erlaubt (Cobra und Drache: keine) */
export function rocketCap(ship: ShipId): number { return SHIPS[ship].rocketGroups ?? 0; }
/** Raketensilos: in wie vielen L-Turmgruppen erlaubt (ohne Angabe: alle) */
export function siloCap(ship: ShipId): number { return SHIPS[ship].siloGroups ?? Infinity; }


/** Turm i des Schiffs: Art, Werte und ob es ein L-Turm ist (Träger je Gruppe, sonst die gewählte M-Turmart) */
export function turretOf(lo: Loadout, d: ShipDef, i: number): { id: string; def: TurretDef; L: boolean } {
  const g = d.turretGroup?.[i];
  if (g == null || !d.groups) return { id: lo.turret, def: TURRETS[lo.turret], L: false };
  const kind = d.groups[g].kind, id = lo.groups?.[g] ?? (kind === 'L' ? 'plasma' : d.name === 'Raptor' ? 'puls' : lo.turret);
  return kind === 'L' ? { id, def: LTURRETS[(id in LTURRETS ? id : 'plasma') as LTurretId], L: true } : { id, def: TURRETS[(id in TURRETS ? id : 'puls') as TurretId], L: false };
}

let current: Loadout | null = null;

/**
 * Ausrüstung je Schiff: jedes Schiff behält, was zuletzt in ihm eingebaut war – wer zur Mamba wechselt und zurück zur
 * Cobra, findet die Cobra so vor, wie er sie verlassen hat (gemerkt im Browser)
 */
const SHIP_MEM_KEY = 'x4-sektorbau-ausruestung-je-schiff';
let shipMem: Partial<Record<ShipId, Loadout>> | null = null;
function memory(): Partial<Record<ShipId, Loadout>> {
  if (shipMem) return shipMem;
  shipMem = {};
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(SHIP_MEM_KEY) ?? 'null') as Record<string, unknown> | null;
    for (const [id, l] of Object.entries(raw ?? {})) if (id in SHIPS) shipMem[id as ShipId] = valid({ ...(l as object), ship: id } as Parameters<typeof valid>[0]);
  } catch { /* nichts gemerkt */ }
  return shipMem;
}
function saveMemory(): void {
  try { globalThis.localStorage?.setItem(SHIP_MEM_KEY, JSON.stringify(memory())); } catch { /* Speicher nicht verfügbar */ }
}
/** zuletzt eingebaute Ausrüstung dieses Schiffs (oder null) */
export function shipLoadout(ship: ShipId): Loadout | null { return memory()[ship] ?? null; }

/** Gespeicherte Ausrüstung, aber mit diesem Schiff (z. B. das eigene Großkampfschiff aus dem Sektor) */
export function loadoutFor(ship: ShipId): Loadout {
  const l = loadout();
  return l.ship === ship ? l : memory()[ship] ?? valid({ ...l, ship } as Parameters<typeof valid>[0]);
}

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
  // Schiffswechsel: das neue Schiff bringt seine eigene zuletzt eingebaute Ausrüstung mit
  const cur = loadout(), mem = memory();
  mem[cur.ship] = cur;
  const base = patch.ship && patch.ship !== cur.ship && mem[patch.ship] ? mem[patch.ship]! : cur;
  current = valid({ ...base, ...patch });
  mem[current.ship] = current;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Speicher nicht verfügbar */
  }
  saveMemory();
  return current;
}

// ---------- Loadouts: gespeicherte Zusammenstellungen aus Schiff und kompletter Ausrüstung ----------

/** Rolle einer Waffe, eines Turms, einer Rakete – und Kennzeichen eines Loadouts */
export type Role = 'schwarm' | 'gross' | 'allround' | 'geleit';
export const ROLES: Record<Role, { name: string; color: string }> = {
  schwarm: { name: 'Schwarm', color: '#c77dff' },
  gross: { name: 'Großziel', color: '#ff8a5c' },
  allround: { name: 'Allround', color: '#3fe0c5' },
  geleit: { name: 'Geleit', color: '#ffd27a' },
};
/** Kennzeichen, die ein Loadout tragen kann */
export const LO_TAGS = ['schwarm', 'gross', 'allround', 'geleit'] as const;
export type LoTag = (typeof LO_TAGS)[number];
/** Wofür Waffen, Türme und Raketen taugen (Kennzeichen auf den Karten im Hangar) */
export const WEAPON_ROLE: Record<WeaponId, Role> = {
  puls: 'allround', bolzen: 'allround', schrot: 'schwarm', strahl: 'allround', plasma: 'gross', neutron: 'schwarm', tau: 'schwarm',
  thermal: 'gross', boson: 'gross', massdriver: 'gross', blitz: 'schwarm', stoerblitz: 'allround', schnellplasma: 'gross', plasmasalve: 'gross',
};
export const TURRET_ROLE: Record<TurretId, Role> = { puls: 'allround', strahl: 'allround', neutron: 'schwarm', tau: 'schwarm', plasma: 'gross', boson: 'gross', rakete: 'gross', flak: 'schwarm' };
export const LTURRET_ROLE: Record<LTurretId, Role> = { plasma: 'gross', tau: 'schwarm', boson: 'gross', neutron: 'schwarm', silo: 'gross' };
export const MISSILE_ROLE: Record<MissileId, Role> = { lenk: 'allround', schwer: 'gross', schwarm: 'schwarm', stoer: 'allround' };

export interface SavedLoadout { name: string; tag: LoTag; lo: Loadout }
/** Plätze für Loadouts */
export const LOADOUT_SLOTS = 6;
const LOADOUTS_KEY = 'x4-sektorbau-loadouts';
interface LoadoutStore { list: (SavedLoadout | null)[]; active: number | null }
let loStore: LoadoutStore | null = null;
function store(): LoadoutStore {
  if (loStore) return loStore;
  loStore = { list: new Array(LOADOUT_SLOTS).fill(null), active: null };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(LOADOUTS_KEY) ?? 'null') as { list?: unknown[]; active?: unknown } | null;
    (raw?.list ?? []).slice(0, LOADOUT_SLOTS).forEach((q, i) => {
      const v = q as Partial<SavedLoadout> | null;
      if (v && v.lo) loStore!.list[i] = { name: String(v.name ?? '').slice(0, 40) || suggestLoadoutName(valid(v.lo as Parameters<typeof valid>[0])), tag: (LO_TAGS as readonly string[]).includes(v.tag as string) ? (v.tag as LoTag) : 'allround', lo: valid(v.lo as Parameters<typeof valid>[0]) };
    });
    const a = Number(raw?.active);
    loStore.active = Number.isInteger(a) && loStore.list[a] ? a : null;
  } catch { /* keine Loadouts */ }
  return loStore;
}
function saveStore(): void {
  try { globalThis.localStorage?.setItem(LOADOUTS_KEY, JSON.stringify(store())); } catch { /* Speicher nicht verfügbar */ }
}
/** alle Plätze (null = frei) und das zuletzt eingebaute Loadout */
export function savedLoadouts(): { list: (SavedLoadout | null)[]; active: number | null } { return store(); }
/** Vorschlag für den Namen: Schiff, Bordwaffe (bzw. Türme) und Raketen */
export function suggestLoadoutName(l: Loadout): string {
  const s = SHIPS[l.ship];
  const main = s.x4.weapons ? WEAPONS[l.weapon].name : s.turrets.length ? TURRETS[l.turret].name : '';
  return [s.name, main, s.x4.launchers ? MISSILES[l.missile ?? 'lenk'].name : ''].filter(Boolean).join(' · ');
}
/** Kennzeichen-Vorschlag aus der Ausrüstung (die häufigste Rolle von Bordwaffe, Türmen und Raketen) */
export function suggestLoadoutTag(l: Loadout): LoTag {
  const s = SHIPS[l.ship], roles: Role[] = [];
  if (s.x4.weapons) roles.push(WEAPON_ROLE[l.weapon], WEAPON_ROLE[l.weapon]);
  if (s.turrets.length && !s.groups) roles.push(TURRET_ROLE[l.turret]);
  if (s.x4.launchers) roles.push(MISSILE_ROLE[l.missile ?? 'lenk']);
  const n = (r: Role) => roles.filter((q) => q === r).length;
  return n('schwarm') > n('gross') ? 'schwarm' : n('gross') > n('schwarm') ? 'gross' : 'allround';
}
/** aktuelle Ausrüstung als Loadout speichern: auf Platz i (sonst den ersten freien); gibt den Platz zurück oder -1 */
export function storeLoadout(i?: number, name?: string, tag?: LoTag): number {
  const st = store(), lo = loadout();
  const at = i ?? st.list.findIndex((q) => !q);
  if (at < 0 || at >= LOADOUT_SLOTS) return -1;
  const old = st.list[at];
  st.list[at] = { name: name ?? old?.name ?? suggestLoadoutName(lo), tag: tag ?? old?.tag ?? suggestLoadoutTag(lo), lo: { ...lo } };
  st.active = at;
  saveStore();
  return at;
}
/** Loadout einbauen (wechselt auch das Schiff) */
export function applyLoadout(i: number): Loadout | null {
  const st = store(), q = st.list[i];
  if (!q) return null;
  st.active = i;
  saveStore();
  return setLoadout(q.lo);
}
export function editLoadout(i: number, p: { name?: string; tag?: LoTag }): void {
  const q = store().list[i];
  if (!q) return;
  if (p.name != null) q.name = p.name.trim().slice(0, 40) || suggestLoadoutName(q.lo);
  if (p.tag) q.tag = p.tag;
  saveStore();
}
export function deleteLoadout(i: number): void {
  const st = store();
  st.list[i] = null;
  if (st.active === i) st.active = null;
  saveStore();
}
/** weicht die eingebaute Ausrüstung vom zuletzt eingebauten Loadout ab? */
export function loadoutChanged(): boolean {
  const st = store(), q = st.active != null ? st.list[st.active] : null;
  return !!q && JSON.stringify(valid(q.lo as Parameters<typeof valid>[0])) !== JSON.stringify(loadout());
}
/** für Tests: gemerkte Zustände verwerfen (neu aus dem Speicher lesen) */
export function resetLoadoutCache(): void { current = null; shipMem = null; loStore = null; }

/** Kurzbeschreibung für das Menü */
export function loadoutLabel(l: Loadout = loadout()): string {
  const s = SHIPS[l.ship];
  const wn = wingCount(l.wing), wt = wn ? ` · Staffel ${wn}` : '';
  if (s.groups) return `${s.name} · ${s.turrets.length} Türme in ${s.groups.length} Gruppen${wt} · ${SHIELDS[l.shield].name}`;
  const lt = s.lMounts?.length ? ` · ${s.lMounts.length} L-Türme: ${LTURRETS[l.lturret ?? 'plasma'].name}` : '';
  return `${s.name} · ${s.x4.weapons}× ${WEAPONS[l.weapon].name}${wt}${s.x4.launchers ? ` · ${s.x4.launchers}× Raketenwerfer (${MISSILES[l.missile ?? 'lenk'].name})` : ''}${lt}${s.turrets.length ? ` · ${s.turrets.length} ${s.lMounts?.length ? 'M-' : ''}Türme: ${TURRETS[l.turret].name}` : ''} · ${SHIELDS[l.shield].name}`;
}

// ---- Steuerung im Kampf: ein Stick (Drehen + Schub, Feuertaste) oder zwei Sticks (links fliegen, rechts zielen und feuern) ----
/** eins: ein Stick + Feuertaste; zwei: rechts zielen (Richtung zeigen); lenk: rechts eine Lenkachse (drehen), quer dazu feuern */
export type ControlMode = 'eins' | 'zwei' | 'lenk';
const CONTROL_KEY = 'x4-sektorbau-steuerung';
export function controlMode(): ControlMode {
  try {
    const v = globalThis.localStorage?.getItem(CONTROL_KEY);
    return v === 'zwei' || v === 'lenk' ? v : 'eins';
  } catch {
    return 'eins';
  }
}
/**
 * Lenkachse (Steuerung „Lenkrad“): waagerecht (Daumen links/rechts dreht) oder senkrecht (oben = links drehen, unten =
 * rechts); die Feuerlinie liegt quer dazu – über bzw. rechts der Achse, mit flip darunter bzw. links
 */
export interface LenkSetup { axis: 'h' | 'v'; flip: boolean }
const LENK_KEY = 'x4-sektorbau-lenkachse';
export function lenkSetup(): LenkSetup {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(LENK_KEY) ?? 'null') as Partial<LenkSetup> | null;
    return { axis: v?.axis === 'v' ? 'v' : 'h', flip: !!v?.flip };
  } catch {
    return { axis: 'h', flip: false };
  }
}
export function setLenkSetup(p: Partial<LenkSetup>): void {
  try {
    globalThis.localStorage?.setItem(LENK_KEY, JSON.stringify({ ...lenkSetup(), ...p }));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function setControlMode(m: ControlMode): void {
  try {
    globalThis.localStorage?.setItem(CONTROL_KEY, m);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

// ---- Anzeige von Hülle und Schild über den Gegnern: Deckkraft (0 = aus), gemerkt ----
export const ENEMY_BAR_STEPS = [0, 0.3, 0.55, 0.9] as const;
const BARS_KEY = 'x4-sektorbau-feindanzeige';
export function enemyBars(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(BARS_KEY));
    return (ENEMY_BAR_STEPS as readonly number[]).includes(v) && globalThis.localStorage?.getItem(BARS_KEY) != null ? v : 0.3;
  } catch {
    return 0.3;
  }
}
export function setEnemyBars(v: number): void {
  try {
    globalThis.localStorage?.setItem(BARS_KEY, String(v));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

// ---- Entwicklung: Gegnerstärke stufenlos nachregeln (Faktor auf Hülle und Schild aller Gegner), gemerkt ----
const TUNE_KEY = 'x4-sektorbau-gegnerstaerke';
export const TUNE_MIN = 0.25;
export const TUNE_MAX = 100;
export interface EnemyTune { hull: number; shield: number }
const clampTune = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(TUNE_MAX, Math.max(TUNE_MIN, v)) : 1);
let tuneVer = 0;
/** zählt jede Änderung hoch – ein laufender Kampf passt seine Gegner an, sobald sich die Zahl ändert */
/** Test-Schalter: Nebelfeld in jeder Welle (später wieder nur zufällig); gemerkt im Browser */
const FOG_TEST_KEY = 'x4-sektorbau-nebel-test';
export function fogTest(): boolean {
  try { return globalThis.localStorage?.getItem(FOG_TEST_KEY) === '1'; } catch { return false; }
}
export function setFogTest(on: boolean): void {
  try { if (on) globalThis.localStorage?.setItem(FOG_TEST_KEY, '1'); else globalThis.localStorage?.removeItem(FOG_TEST_KEY); } catch { /* Speicher nicht verfügbar */ }
}

/** Test-Schalter: Umgebung ab Welle 1 erzwingen ('' = wie sonst); gemerkt im Browser */
export type EnvTest = '' | 'wracks' | 'anomalie' | 'rocks' | 'mines';
const ENV_TEST_KEY = 'x4-sektorbau-umgebung-test';
export function envTest(): EnvTest {
  try { const v = globalThis.localStorage?.getItem(ENV_TEST_KEY) ?? ''; return (['wracks', 'anomalie', 'rocks', 'mines'] as string[]).includes(v) ? (v as EnvTest) : ''; } catch { return ''; }
}
export function setEnvTest(v: EnvTest): void {
  try { if (v) globalThis.localStorage?.setItem(ENV_TEST_KEY, v); else globalThis.localStorage?.removeItem(ENV_TEST_KEY); } catch { /* Speicher nicht verfügbar */ }
}
/** Test-Schalter: Mods wirken im Kampf nicht (bleiben eingebaut) – Waffen mit ihren Grundwerten vergleichen */
const NO_MODS_KEY = 'x4-sektorbau-mods-aus';
let noMods: boolean | null = null;
export function modsOff(): boolean {
  if (noMods != null) return noMods;
  try { noMods = globalThis.localStorage?.getItem(NO_MODS_KEY) === '1'; } catch { noMods = false; }
  return noMods;
}
export function setModsOff(on: boolean): void {
  noMods = on;
  try { if (on) globalThis.localStorage?.setItem(NO_MODS_KEY, '1'); else globalThis.localStorage?.removeItem(NO_MODS_KEY); } catch { /* Speicher nicht verfügbar */ }
}
/** Test-Schalter: Kulisse im Kampf blasser und weicher (zum Vergleich mit dem bisherigen Stand) */
const PALE_KEY = 'x4-sektorbau-kulisse-blass';
let pale: boolean | null = null;
export function paleBackdrop(): boolean {
  if (pale != null) return pale;
  try { pale = globalThis.localStorage?.getItem(PALE_KEY) === '1'; } catch { pale = false; }
  return pale;
}
export function setPaleBackdrop(on: boolean): void {
  pale = on;
  try { if (on) globalThis.localStorage?.setItem(PALE_KEY, '1'); else globalThis.localStorage?.removeItem(PALE_KEY); } catch { /* Speicher nicht verfügbar */ }
}

/** Test-Schalter: in Kha'ak-Runden liegt ab Welle 1 ein Brutschiff am Kartenrand; gemerkt im Browser */
const BROOD_TEST_KEY = 'x4-sektorbau-brut-test';
export function broodTest(): boolean {
  try { return globalThis.localStorage?.getItem(BROOD_TEST_KEY) === '1'; } catch { return false; }
}
export function setBroodTest(on: boolean): void {
  try { if (on) globalThis.localStorage?.setItem(BROOD_TEST_KEY, '1'); else globalThis.localStorage?.removeItem(BROOD_TEST_KEY); } catch { /* Speicher nicht verfügbar */ }
}

/** Test-Schalter: in jeder Runde taucht zu Beginn ein Zerstörer der Hegemonie (neue Fraktion, Arbeitsname) auf */
const FOES_TEST_KEY = 'x4-sektorbau-fraktionen-feinde';
/** Test „Fraktionen gegeneinander“: die Hegemonie und die übrigen Gegner beschießen sich auch gegenseitig */
export function foesTest(): boolean {
  try { return globalThis.localStorage?.getItem(FOES_TEST_KEY) === '1'; } catch { return false; }
}
export function setFoesTest(on: boolean): void {
  try { if (on) globalThis.localStorage?.setItem(FOES_TEST_KEY, '1'); else globalThis.localStorage?.removeItem(FOES_TEST_KEY); } catch { /* Speicher nicht verfügbar */ }
}
const HEG_TEST_KEY = 'x4-sektorbau-hegemonie-test';
/** Test der Hegemonie: welche Schiffe auftauchen – Korvette, Fregatte, Zerstörer oder ein Verband aus allen ('' = aus) */
export type HegTestMode = '' | 'k' | 'f' | 'z' | 'alle';
export function hegTestMode(): HegTestMode {
  try {
    const v = globalThis.localStorage?.getItem(HEG_TEST_KEY) ?? '';
    // früher nur an/aus: '1' war der Zerstörer
    return v === '1' ? 'z' : v === 'k' || v === 'f' || v === 'z' || v === 'alle' ? v : '';
  } catch { return ''; }
}
export function setHegTestMode(m: HegTestMode): void {
  try { if (m) globalThis.localStorage?.setItem(HEG_TEST_KEY, m); else globalThis.localStorage?.removeItem(HEG_TEST_KEY); } catch { /* Speicher nicht verfügbar */ }
}
export function hegTest(): boolean {
  return hegTestMode() !== '';
}
export function setHegTest(on: boolean): void {
  try { if (on) globalThis.localStorage?.setItem(HEG_TEST_KEY, '1'); else globalThis.localStorage?.removeItem(HEG_TEST_KEY); } catch { /* Speicher nicht verfügbar */ }
}

export function enemyTuneVersion(): number {
  return tuneVer;
}
export function enemyTune(): EnemyTune {
  try {
    const raw = globalThis.localStorage?.getItem(TUNE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<EnemyTune>) : {};
    return { hull: clampTune(v.hull), shield: clampTune(v.shield) };
  } catch {
    return { hull: 1, shield: 1 };
  }
}
export function setEnemyTune(t: Partial<EnemyTune>): void {
  const cur = enemyTune();
  const next = { hull: clampTune(t.hull ?? cur.hull), shield: clampTune(t.shield ?? cur.shield) };
  if (next.hull !== cur.hull || next.shield !== cur.shield) tuneVer++;
  try {
    globalThis.localStorage?.setItem(TUNE_KEY, JSON.stringify(next));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

// Der Regler läuft logarithmisch (0–1000): von ×0,25 bis ×100 bleibt jeder Bereich gleich fein einstellbar –
// ×1 liegt etwa bei einem Viertel, ×10 etwa bei zwei Dritteln des Wegs
const SPAN = Math.log(TUNE_MAX / TUNE_MIN);
export function tuneToSlider(v: number): number {
  return Math.round((Math.log(v / TUNE_MIN) / SPAN) * 1000);
}
/** Reglerstellung → Faktor, auf handliche Stufen gerundet (unter ×10 auf 0,05, darüber auf 0,5) */
export function tuneFromSlider(p: number): number {
  const v = TUNE_MIN * Math.exp((Math.max(0, Math.min(1000, p)) / 1000) * SPAN);
  const step = v < 10 ? 0.05 : 0.5;
  return Math.min(TUNE_MAX, Math.max(TUNE_MIN, Math.round(v / step) * step));
}
