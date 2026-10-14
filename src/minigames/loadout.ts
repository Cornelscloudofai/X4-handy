// Ausrüstung für das Kampf-Minispiel: welches Schiff du fliegst, welche Waffen und Türme es trägt, welcher Schild.
// Vorerst frei wählbar (im Kampfmenü); später kommen Schiffe und Teile aus Werft und eigener Produktion.

export type ShipId = 'jaguar' | 'mamba' | 'asp' | 'balaur' | 'chimera' | 'dragon' | 'cobra' | 'klapperschlange' | 'argon';
export type WeaponId = 'puls' | 'bolzen' | 'schrot' | 'strahl' | 'plasma' | 'neutron' | 'tau' | 'thermal' | 'boson' | 'schnellplasma' | 'plasmasalve';
export type TurretId = 'puls' | 'strahl' | 'neutron' | 'tau' | 'plasma' | 'boson';
/** Schwere L-Türme (Zerstörer): je Waffe ein eigenes Kanonenrohr-Bild */
export type LTurretId = 'plasma' | 'tau' | 'boson' | 'neutron';
export type ShieldId = 'leicht' | 'schwer';
/** Spezialfähigkeit auf der Taste über der Feuertaste */
export type SpecialId = 'dash' | 'sprint' | 'overdrive' | 'torpedo' | 'escort';

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

export interface ShipDef {
  name: string;
  /** Klasse für die Anzeige */
  cls: 'S' | 'M' | 'L';
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
const SHIELD = { S: { cap: 740, rate: 35, delay: 3.5 }, M: { cap: 3848, rate: 74, delay: 2 }, L: { cap: 30000, rate: 230, delay: 1.5 } };
/**
 * Annahme (Drehmoment der Steuerdüsen steht nicht in den Daten): M-Steuerdüsen drehen doppelt so stark wie S,
 * L-Steuerdüsen achtmal so stark – sonst wäre der Zerstörer (Drehwiderstand 123) im Minispiel kaum zu lenken.
 */
const THRUSTER = { S: 1, M: 2, L: 8 };
export type GunSize = 's' | 'm' | 'l';

/** Waffenplätze gleichmäßig über die Breite verteilen */
function spreadGuns(n: number, width: number): number[] {
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round((i / (n - 1) - 0.5) * width));
}

type ShipBase = Omit<ShipDef, 'cls' | 'speed' | 'turn' | 'hull' | 'shield' | 'regen' | 'delay' | 'gunSize' | 'guns'> & { gunWidth: number; /** Lage der Rohre wie im Bild (sonst gleichmäßig verteilt) */ gunPos?: number[] };

function ship(cls: 'S' | 'M' | 'L', base: ShipBase): ShipDef {
  const d = base.x4;
  const { gunWidth, gunPos, ...rest } = base;
  const m = d.mShields ?? 0;
  return {
    ...rest,
    cls,
    speed: d.v / MAMBA.v,
    turn: (MAMBA.dragYaw / d.dragYaw) * THRUSTER[cls],
    hull: d.hull / MAMBA.hull,
    shield: (d.shields * SHIELD[cls].cap + m * SHIELD.M.cap) / MAMBA.shield,
    regen: (d.shields * SHIELD[cls].rate + m * SHIELD.M.rate) / MAMBA.regen,
    delay: SHIELD[cls].delay / SHIELD.S.delay,
    guns: gunPos ?? spreadGuns(d.weapons, gunWidth),
    gunSize: cls === 'L' ? 'l' : cls === 'M' ? 'm' : 's',
  };
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
    name: 'Jaguar', role: 'Aufklärer', desc: 'Aufklärer mit phänomenalem Tempo: ein Waffenplatz, wenig Hülle, keine Raketen. Nachbrenner: kurz noch schneller.',
    x4: { hull: 2000, engines: 1, shields: 1, weapons: 1, launchers: 0, turrets: 0, missiles: 0, v: 390, dragYaw: 3.015 },
    gunWidth: 0, gunPos: [2], turrets: [], r: 10, size: 36, special: 'sprint', sprite: 'split-jaguar', fallback: 'split-jaeger-s',
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
    gunWidth: 28, gunPos: [-14.5, -12.3, -8.9, 8.9, 12.3, 14.5], turrets: [[-5.9, 4.4], [5.9, 4.4]], r: 20, size: 80, special: 'torpedo', sprite: 'split-dragon', fallback: 'split-jaeger-s',
  }),
  cobra: ship('M', {
    name: 'Cobra', role: 'Fregatte', desc: 'Fregatte: drei M-Waffenplätze, vier Türme, zwei Schilde, drei Triebwerke, Andockplatz – keine Raketenwerfer. Begleitjäger: startet für eine Weile eine Mamba.',
    x4: { hull: 33000, engines: 3, shields: 2, weapons: 3, launchers: 0, turrets: 4, missiles: 0, v: 518, dragYaw: 11 },
    gunWidth: 16, gunPos: [-3.7, 0, 3.7], turrets: [[-7.2, -0.4], [7.2, -0.4], [-7.2, 18.5], [7.2, 18.5]], r: 24, size: 92, special: 'escort', sprite: 'split-cobra', fallback: 'split-jaeger-s',
  }),
  klapperschlange: ship('L', {
    name: 'Klapperschlange', role: 'Zerstörer', desc: 'Zerstörer der Split: vier schwere Hauptkanonen im Bug, je zwei schwenkbare L-Türme unter den Schulterplatten, die auch spitz nach vorn über den Bug feuern, dazu zwölf M-Türme. Riesige Hülle und starke Schilde, aber träge. Waffenüberladung: kurz doppelte Feuerrate.',
    // X4 9.0: 3 L-Triebwerke, 1 L- und 15 M-Schilde, 4 L-Waffen (Hauptbatterie); Türme: hier 4 L (zwei je Seite) und
    // 12 M; Raketenlager 160, aber kein Werfer – daher ohne Raketen.
    x4: { hull: 242650, engines: 3, shields: 1, mShields: 15, weapons: 4, launchers: 0, turrets: 16, missiles: 0, v: 217, dragYaw: 123 },
    gunWidth: 18, gunPos: fromImage(RS_IMG, RS_SIZE, [[572, 0], [600, 0], [653, 0], [681, 0]]).map(([x]) => x), gunFwd: 0.47,
    // M-Türme auf den runden Luken der Panzerplatten
    turrets: fromImage(RS_IMG, RS_SIZE, [[565, 307], [689, 307], [565, 387], [689, 387], [557, 580], [697, 580], [549, 692], [705, 692], [541, 792], [713, 792], [538, 919], [716, 919]]),
    turretD: 0.045,
    lMounts: lMounts(RS_IMG, [
      // vorderer Flügel (L-förmige Platte mit schräger Außenfläche), Rohr kommt darunter hervor
      { pivot: [515, 246], min: -25, max: 140, cover: [[476, 262], [486, 229], [505, 226], [555, 204], [558, 300], [533, 305], [532, 246], [478, 267]] },
      // hinterer Flügel (sechseckige Platte)
      { pivot: [505, 440], min: -25, max: 130, cover: [[463, 494], [468, 440], [493, 420], [530, 387], [537, 392], [536, 448]] },
    ]),
    r: 46, size: RS_SIZE, special: 'overdrive', sprite: 'split-klapperschlange', fallback: 'split-jaeger-s',
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
export interface X4Gun { dmg: number; rate: number; amt: number; mag: number; reload: number; v: number; life: number; angle: number; /** Strahl: Reichweite in Spielpunkten (sonst 416) */ beamRange?: number }

export interface WeaponDef {
  name: string;
  /** Split-eigene Waffe, allgemeine Waffe (von vielen Völkern gebaut) oder schwere Waffe nur für L-Waffenplätze */
  group: 'split' | 'allgemein' | 'schwer';
  desc: string;
  /** Werte für S- und M-Waffenplätze */
  s: X4Gun;
  m: X4Gun;
  /** eigene Werte für L-Waffenplätze (sonst aus der M-Version abgeleitet) */
  l?: X4Gun;
  /** Strahl statt Geschossen; haftende Geschosse mit Nachbrand (Thermal-Desintegrator); Lanze: trifft sofort als Blitzstrahl */
  beam?: boolean;
  sticky?: boolean;
  rail?: boolean;
  /** Zielhilfe im Verhältnis zu sonst (Bosonenlanze: kleiner Schwenkbereich) */
  gimbal?: number;
  color: string;
  w: number;
}

/** X4-Takt, der im Minispiel einen Schuss pro Sekunde ergibt (Spielzeit je X4-Sekunde, siehe TIME) */
const TIME_RATE = 0.26 * 6;

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
    s: { dmg: 1100, rate: TIME_RATE * 3, amt: 1, mag: 3, reload: 3 / (TIME_RATE * 1), v: 1500, life: 7.3, angle: 0.4 },
    m: { dmg: 1100, rate: TIME_RATE * 3, amt: 1, mag: 3, reload: 3 / (TIME_RATE * 1), v: 1500, life: 7.3, angle: 0.4 },
    l: { dmg: 1100, rate: TIME_RATE * 3, amt: 1, mag: 3, reload: 3 / (TIME_RATE * 1), v: 1500, life: 7.3, angle: 0.4 },
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
  return w.group !== 'schwer' || size === 'l';
}

/** Split-Türme (M) für Korvette und Fregatte – Werte aus den Spieldaten 9.0 (Drehtempo in Grad pro Sekunde) */
export interface TurretDef { name: string; desc: string; gun: X4Gun; turn: number; color: string; w: number; rail?: boolean; /** Dauerstrahl (Schaden pro Sekunde) */ beam?: boolean }
export const TURRETS: Record<TurretId, TurretDef> = {
  puls: { name: 'Pulsturm', desc: 'Schnell schwenkend und genau, wenig Schaden – gut gegen Raketen und Jäger.', turn: 180, color: '#7ffff0', w: 2,
    gun: { dmg: 18, rate: 3.8, amt: 1, mag: 8, reload: 2.4, v: 5000, life: 0.7, angle: 0.17 } },
  // Strahlenturm: wie der Strahlenemitter (M) als Dauerstrahl; trifft sofort, solange er auf dem Ziel liegt
  strahl: { name: 'Strahlenturm', desc: 'Dauerstrahl: trifft sofort, solange er auf dem Ziel liegt – wenig Schaden pro Sekunde, aber nie daneben; gut gegen Jäger und Raketen.', turn: 150, color: '#9ffcff', w: 2, beam: true,
    gun: { dmg: 120, rate: 0, amt: 1, mag: 0, reload: 0, v: 0, life: 0, angle: 0 } },
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

/**
 * Schwere L-Türme des Zerstörers. Die Werte der Split-L-Türme stehen noch aus – Annahme: wie die M-Türme gleicher Art
 * mit etwa dreifachem Schaden, größerer Reichweite und langsamerem Schwenken. barrel: Bild des Kanonenrohrs.
 */
export interface LTurretDef extends TurretDef { barrel: string }
export const LTURRETS: Record<LTurretId, LTurretDef> = {
  plasma: { name: 'Schwerer Plasmaturm', desc: 'Zwei sehr schwere, langsame Plasmageschosse, dann Pause – große Reichweite.', turn: 30, color: '#a6ff6b', w: 5, barrel: 'split-lturm-rohr-plasma-ki',
    gun: { dmg: 2200, rate: 0.8, amt: 1, mag: 2, reload: 6, v: 1100, life: 6.5, angle: 0.6 } },
  tau: { name: 'Schwerer Tau-Beschleuniger-Turm', desc: 'Vier Geschosse je Schuss in schneller Folge – verheerend auf mittlere Entfernung.', turn: 70, color: '#ff5a5a', w: 2.6, barrel: 'split-lturm-rohr-tau-ki',
    gun: { dmg: 125, rate: 2.4, amt: 4, mag: 8, reload: 4.5, v: 2300, life: 1.6, angle: 1 } },
  boson: { name: 'Schwerer Bosonenlanzen-Turm', desc: 'Blitzschneller, sehr schwerer Lanzenstrahl, der sofort trifft – schwenkt langsam.', turn: 25, color: '#e0c3ff', w: 4, rail: true, barrel: 'split-lturm-rohr-boson-ki',
    gun: { dmg: 2400, rate: 0.6, amt: 1, mag: 0, reload: 0, v: 14000, life: 0.7, angle: 0.15 } },
  neutron: { name: 'Schwerer Neutronen-Gatling-Turm', desc: 'Langer, dichter Geschossstrom, dann nachladen – viel Druck auf Jäger.', turn: 70, color: '#ff8a3d', w: 2.6, barrel: 'split-lturm-rohr-neutron-ki',
    gun: { dmg: 48, rate: 14, amt: 1, mag: 100, reload: 7, v: 2700, life: 1.7, angle: 0.4 } },
};
export const LTURRET_IDS = Object.keys(LTURRETS) as LTurretId[];

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
/** größte Reichweite der L-Hauptbatterie (Spielpunkte) */
const L_MAX_RANGE = 1500;
export function gameSpeed(v: number): number { return 640 * Math.sqrt(v / 5000); }
export function gameRange(g: X4Gun, beam = false): number { return beam ? g.beamRange ?? 416 : g.v * g.life * RANGE_SCALE; }

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

export interface Loadout { ship: ShipId; weapon: WeaponId; turret: TurretId; shield: ShieldId; /** schwere L-Türme (nur Zerstörer) */ lturret?: LTurretId }
export const DEFAULT_LOADOUT: Loadout = { ship: 'mamba', weapon: 'puls', turret: 'puls', shield: 'leicht', lturret: 'plasma' };
/** Namen aus früheren Versionen (gespeicherte Ausrüstung) */
const OLD: Record<string, string> = { impuls: 'puls', splitter: 'schrot' };

const KEY = 'x4-sektorbau-ausruestung';

function valid(l: Partial<Record<keyof Loadout, string>> | null | undefined): Loadout {
  const weapon = OLD[l?.weapon ?? ''] ?? l?.weapon, turret = OLD[l?.turret ?? ''] ?? l?.turret;
  return {
    ship: l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship,
    weapon: weapon && weapon in WEAPONS && weaponFits(WEAPONS[weapon as WeaponId], SHIPS[l?.ship && l.ship in SHIPS ? (l.ship as ShipId) : DEFAULT_LOADOUT.ship].gunSize) ? (weapon as WeaponId) : DEFAULT_LOADOUT.weapon,
    turret: turret && turret in TURRETS ? (turret as TurretId) : DEFAULT_LOADOUT.turret,
    shield: l?.shield && l.shield in SHIELDS ? (l.shield as ShieldId) : DEFAULT_LOADOUT.shield,
    lturret: l?.lturret && l.lturret in LTURRETS ? (l.lturret as LTurretId) : DEFAULT_LOADOUT.lturret,
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
  const lt = s.lMounts?.length ? ` · ${s.lMounts.length} L-Türme: ${LTURRETS[l.lturret ?? 'plasma'].name}` : '';
  return `${s.name} · ${s.x4.weapons}× ${WEAPONS[l.weapon].name}${s.x4.launchers ? ` · ${s.x4.launchers}× Raketenwerfer` : ''}${lt}${s.turrets.length ? ` · ${s.turrets.length} ${s.lMounts?.length ? 'M-' : ''}Türme: ${TURRETS[l.turret].name}` : ''} · ${SHIELDS[l.shield].name}`;
}

// ---- Steuerung im Kampf: ein Stick (Drehen + Schub, Feuertaste) oder zwei Sticks (links fliegen, rechts zielen und feuern) ----
/** eins: ein Stick + Feuertaste; zwei: rechts zielen (Richtung zeigen); lenk: rechts lenken wie ein Lenkrad */
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
export function setControlMode(m: ControlMode): void {
  try {
    globalThis.localStorage?.setItem(CONTROL_KEY, m);
  } catch {
    /* Speicher nicht verfügbar */
  }
}
