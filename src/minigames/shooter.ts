// Minispiel „Piratenangriff“ / „Xenon-Schwarm“: Den Frachter bis zum Sprungtor beschützen.
// Große Karte: der Frachter fliegt seine Route bis zum Sprungtor, Gegner kommen in Gruppen von weit her und
// werden abgefangen. Alle Schiffe haben feste Bordkanonen (schießen nur geradeaus) – frei zielen nur
// Geschütztürme (Boss, Frachter), Lenkraketen und die Begleitdrohne. Schwebender Joystick (Drehen + Schub, mit Trägheit),
// Feuertaste mit Vorhaltekreuz, Reiseantrieb ohne Gegner in der Nähe, Raketensalve und Ausweichmanöver. Nach jeder besiegten Welle wählt man eine von drei Verbesserungen.
// Gegner: Jäger, Kanonenboote, Raketenboote (Raketen abschießbar), Schildträger; Xenon N, M und
// Schirmdrohnen; zum Schluss ein Boss mit Geschütztürmen. Abschnitte mit Asteroiden (Deckung) oder Minen.
// Endlos-Modus: Wellen ohne Ende, alle fünf Wellen ein Boss.
import { sfx } from '../ui/sound';
import { sustain } from '../audio/ambience';
import { playGameTrack, type GameTrack } from '../audio/music';
import invasionUrl from '../assets/music/kampf-invasion.mp3';
import { enemySprite, fighterKind, preloadSprites, projectileSprite, shipArt, shipSprite, turretSprite } from '../render/shipArt';
import { modStats, type ModStats } from './mods';
import { MISSIONS, type Mission } from './missions';
import { DMG_SCALE, LTURRETS, RELOAD, MISSILE_DMG, MISSILES, weaponFits, enemyBars, enemyTune, enemyTuneVersion, SHIELDS, SHIPS, SPECIALS, TIME, TURRETS, WEAPONS, gameRange, gameSpeed, loadout, controlMode, effectiveDps, sustainedDps, weaponGun, type ControlMode, type Loadout, type LTurretId, type MissileDef, type ShieldDef, type ShipDef, type X4Gun } from './loadout';
import {
  buzz, clamp, drawButton, findMutator, Floaters, Particles, pickGoals, rgba, rng, Score, setGoal, Starfield, TOP,
  type GameCfg, type GameResult, type Gear, type Goal, type HudItem, type Level, type MiniGame, type Mode, type Mutator, type Rules,
} from './common';
import { MISSION_GOALS, SHOOTER_ENDLESS_GOALS as ENDLESS_GOALS, SHOOTER_GOALS, SHOOTER_MUTATORS, SHOOTER_NORMAL_GOALS as NORMAL_GOALS } from './menuInfo';
import { SPEC, enemyStats, drawFighterVector, type EKind } from './shooterData';
export { enemyStats, enemyStatTable, drawFighterVector } from './shooterData';
export { SHOOTER_MUTATORS, SHOOTER_GOALS };

export type { Gear } from './common';

type Side = 'pirate' | 'xenon' | 'khaak';
/**
 * Elite-Gegner (leuchtende farbige Umrandung): Gepanzert (doppelter Schild, langsam), Flink (schnell, weicht Raketen aus), Splitter
 * (zerfällt beim Abschuss in zwei kleine), Kommandant (lädt Schilde naher Verbündeter; fällt er, löst sich die Gruppe
 * auf), Rächer (explodiert kurz nach dem Abschuss)
 */
export type Elite = 'gepanzert' | 'flink' | 'splitter' | 'kommandant' | 'raecher';
export const ELITES: Record<Elite, { name: string; color: string; info: string }> = {
  gepanzert: { name: 'Gepanzert', color: '#b8c7d6', info: 'doppelter Schild, langsam' },
  flink: { name: 'Flink', color: '#5cf2c0', info: 'schnell und wendig, weicht Raketen aus' },
  splitter: { name: 'Splitter', color: '#ffa63d', info: 'zerfällt beim Abschuss in zwei kleine Schiffe' },
  kommandant: { name: 'Kommandant', color: '#ffd84a', info: 'lädt die Schilde naher Verbündeter – zuerst abschießen löst die Gruppe auf' },
  raecher: { name: 'Rächer', color: '#ff4848', info: 'explodiert kurz nach dem Abschuss – Abstand halten' },
};
const ELITE_IDS = Object.keys(ELITES) as Elite[];
/** Gegnertypen, die Elite werden können (keine Schildträger, Großziele, Türme oder Frachter) */
const ELITE_KINDS = new Set<EKind>(['jaeger', 'kanone', 'rakete', 'n', 'm', 'ks', 'kj', 'ka', 'kk']);
/** Reichweite des Kommandanten, Sprengradius und Zündzeit des Rächers */
const CMD_R = 240, BLAST_R = 115, BLAST_T = 0.9;
/** Rand der Leuchtsilhouette (Anteil der Bildgröße je Seite) */
const GLOW_PAD = 0.12;
const glowCache = new Map<string, HTMLCanvasElement>();
/**
 * Leuchtende Umrandung eines Schiffsbilds: eingefärbte Silhouette, ringsum leicht versetzt (gibt eine feste Kontur)
 * und weich überstrahlt; einmal je Bild und Farbe berechnet (256 px genügen für den Schein)
 */
function eliteGlow(img: CanvasImageSource & { width: number; height: number }, color: string): HTMLCanvasElement {
  const key = `${(img as HTMLImageElement).src ?? img.width}|${color}`;
  const hit = glowCache.get(key);
  if (hit) return hit;
  const S = 256, P = Math.round(S * GLOW_PAD), W = S + 2 * P;
  const sil = document.createElement('canvas');
  sil.width = sil.height = S;
  const sg = sil.getContext('2d')!;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(img, 0, 0, S, S);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = color;
  sg.fillRect(0, 0, S, S);
  const out = document.createElement('canvas');
  out.width = out.height = W;
  const og = out.getContext('2d')!;
  og.shadowColor = color;
  og.shadowBlur = S * 0.08;
  const o = S * 0.045;
  for (let k = 0; k < 12; k++) { const q = (k / 12) * Math.PI * 2; og.drawImage(sil, P + Math.cos(q) * o, P + Math.sin(q) * o); }
  og.shadowBlur = 0;
  og.globalCompositeOperation = 'lighter';
  og.globalAlpha = 0.5;
  for (let k = 0; k < 8; k++) { const q = (k / 8) * Math.PI * 2; og.drawImage(sil, P + Math.cos(q) * o * 0.6, P + Math.sin(q) * o * 0.6); }
  glowCache.set(key, out);
  return out;
}
/** Jäger mit Anflügen (anfliegen, Salve, abdrehen) – Piraten, Xenon N und die kleinen Kha'ak */
const FIGHTERS = new Set<EKind>(['jaeger', 'n', 'ks', 'kj', 'ka']);
/** Kha'ak mit Kyon-Strahl: kurz aufladen, dann trifft der Strahl sofort entlang einer Linie (Schilde ×1,5) */
const KYON_LEN = 320, KYON_SHIELD = 1.5;

/**
 * Schutzziel: Frachter (Geleit, Konvoi, Flucht), Station oder Bergungsschiff. Position relativ zur Mitte der Route
 * (fX, fY); Frachter pendeln etwas zur Seite. Eigene Abwehrtürme zielen frei; Stationstürme können zerstört und mit
 * Fundstücken repariert werden.
 */
interface Ward {
  kind: 'frachter' | 'station' | 'berger';
  name: string;
  ox: number; oy: number;
  hull: number; max: number; flash: number;
  tur: { ox: number; oy: number; cd: number; a: number; hp: number; max: number }[];
  dead: boolean;
  /** Phase des Pendelns */
  ph: number;
}
/**
 * Kha'ak-Turmplattform: Kopfbild, Drehpunkt (runder Sockel, Anteil des Bilds), Mündung (Abstand vom Drehpunkt in
 * Spielpunkten, Querversatz der Rohre), Kopf- und Sockelgröße, Waffe (Strahlen je Schuss, Fächer, Schaden, Länge,
 * Ladezeit, Pause)
 */
interface PlatDef {
  head: string; base: string; py: number; size: number; baseSize: number; muzzle: number; side: number[]; fan: number;
  dmg: number; len: number; charge: number; cd: number; turn: number; name: string;
  /** Waffe: Kyon-Strahl (Kha'ak), Laserstrahl (trifft sofort, Xenon) oder Kanone (Feuerstoß aus Geschossen) */
  fire?: 'kyon' | 'beam' | 'gun'; color?: string;
  /** Kanone: Schüsse je Feuerstoß, Abstand (s), Geschosstempo, Breite */
  burst?: number; gap?: number; v?: number; w?: number;
}
const PLATS: Record<'dreifach' | 'zwilling' | 'lanze' | 'strahl' | 'xgatling' | 'xzwilling' | 'xlaser', PlatDef> = {
  // Xenon: Gatling (langer Feuerstoß), Zwillingskanone (schwere Bolzen abwechselnd aus beiden Rohren), schwerer Laser
  xgatling: { name: 'Xenon-Gatlingturm', head: 'xenon-turm-gatling-ki', base: 'xenon-plattform-klein-ki', py: 0.77, size: 120, baseSize: 150, muzzle: 86, side: [0], fan: 0, dmg: 3, len: 560, charge: 0.45, cd: 2.8, turn: 1.3, fire: 'gun', color: '#ff5c6c', burst: 14, gap: 0.07, v: 470, w: 1.8 },
  xzwilling: { name: 'Xenon-Zwillingskanone', head: 'xenon-turm-zwilling-ki', base: 'xenon-plattform-klein-ki', py: 0.7, size: 105, baseSize: 150, muzzle: 67, side: [-4.6, 4.6], fan: 0, dmg: 9, len: 580, charge: 0.5, cd: 2.6, turn: 1, fire: 'gun', color: '#ff3b4a', burst: 4, gap: 0.22, v: 330, w: 4 },
  xlaser: { name: 'Schwerer Xenon-Laser', head: 'xenon-turm-laser-gross-ki', base: 'xenon-plattform-gross-ki', py: 0.68, size: 95, baseSize: 165, muzzle: 62, side: [0], fan: 0, dmg: 20, len: 760, charge: 1.1, cd: 4.2, turn: 0.6, fire: 'beam', color: '#ff3b4a' },
  dreifach: { name: 'Dreifach-Kyonturm', head: 'khaak-turm-dreifach-ki', base: 'khaak-plattform-klein-ki', py: 0.7, size: 95, baseSize: 150, muzzle: 50, side: [0], fan: 0.2, dmg: 7, len: KYON_LEN + 140, charge: 0.6, cd: 3.2, turn: 1.1 },
  zwilling: { name: 'Zwillings-Kyonturm', head: 'khaak-turm-zwilling-ki', base: 'khaak-plattform-klein-ki', py: 0.7, size: 100, baseSize: 150, muzzle: 48, side: [-4.5, 4.5], fan: 0, dmg: 6, len: KYON_LEN + 140, charge: 0.35, cd: 1.5, turn: 1.4 },
  lanze: { name: 'Kyon-Lanze', head: 'khaak-turm-lanze-ki', base: 'khaak-plattform-gross-ki', py: 0.68, size: 100, baseSize: 155, muzzle: 62, side: [0], fan: 0, dmg: 14, len: KYON_LEN + 300, charge: 0.8, cd: 2.8, turn: 0.8 },
  strahl: { name: 'Kyon-Strahler', head: 'khaak-turm-strahl-ki', base: 'khaak-plattform-gross-ki', py: 0.73, size: 165, baseSize: 155, muzzle: 112, side: [0], fan: 0, dmg: 22, len: KYON_LEN + 440, charge: 1.2, cd: 4.5, turn: 0.55 },
};

/** Bergungscontainer im Wrackfeld (Einsatz „Bergung“): treibt, wird geschleppt oder ist abgeliefert/verloren */
interface Crate { x: number; y: number; vx: number; vy: number; rot: number; hp: number; tow: boolean; done: boolean }
/** Wrack (Deko und Deckung im Wrackfeld) */
interface Wreck { x: number; y: number; rot: number; size: number }

interface Enemy {
  kind: EKind; x: number; y: number; vx: number; vy: number;
  hp: number; max: number; cd: number; r: number;
  target: 'f' | 'p'; orbit: number; flash: number; dir: number;
  /** Schutzziel, auf das der Gegner es abgesehen hat (target 'f') */
  wd?: Ward;
  /** Nest (Einsatz „Nest“): steht still, Brutöffnungen statt Geschütztürme */
  nest?: boolean;
  /** Kha'ak-Nebennest beim Nest: steht still, brütet Späher-Cluster */
  hive?: { img: string };
  /** Kha'ak-Turmplattform beim Nest: fester Sockel, drehender Turmkopf; plT = Kyon lädt (Restzeit) */
  plat?: PlatDef; plT?: number;
  /** Plattform mit Kanone: Schüsse im laufenden Feuerstoß und Zeit bis zum nächsten */
  burst?: number; burstT?: number;
  /** Blickrichtung (Bordkanonen feuern nur dorthin) */
  ang: number;
  /** Jäger-Anflug: nach Salve oder Überflug abdrehen (Restzeit, Richtung); Schüsse und Dauer des laufenden Anflugs */
  brk?: number; brkA?: number; shots?: number; runT?: number;
  /** Gruppe, mit der der Gegner angeflogen kam */
  grp?: number;
  /** gehört zu einem Schwarm kleiner Schiffe: greift mit mehr Schiffen zugleich an */
  swarm?: boolean;
  /** Boss-Teile: Eltern und Versatz */
  parent?: Enemy; ox?: number; oy?: number;
  /** Xenon-Türme: Laserstrahl (zielt, lädt auf, feuert einen Strahl) oder dicke Plasmakugeln; Kha'ak-Brutkammer */
  weapon?: 'laser' | 'plasma' | 'brut';
  /** Kha'ak: Cluster (fliegt geschlossen bis kurz vor dem Ziel) und Platz darin */
  cl?: number; slotX?: number; slotY?: number; slotFlip?: boolean;
  /** Kha'ak: Kyon-Strahl lädt (Restzeit) */
  kyT?: number;
  /** Kha'ak-Abfangjäger: Zeit im Visier, Abklingzeit und Auslöser des Phasensprungs */
  aimedT?: number; jumpCd?: number; jumpReq?: boolean;
  /** Kha'ak-Korvette: Zeit bis zur nächsten Brut, Anzahl der Bruten */
  broodT?: number; brood?: number;
  /** Laserstrahl: Restzeit (aufladen, dann feuern), Richtung, angesammelter Schaden am Frachter */
  beamT?: number; beamA?: number; beamAcc?: number;
  shielded: boolean;
  /** eigener Schild: lädt nach 3 s ohne Treffer wieder auf; Aufblitzen bei Treffern auf den Schild */
  sh: number; shMax: number; shT: number; shFlash: number;
  /** Großziel mitten in einer Welle (kleinere Fregatte bzw. K-Segment), kein Endboss */
  mini?: boolean;
  /** Elite-Eigenschaft; Flink: Abklingzeit des Ausweichens; im Schutz eines Kommandanten */
  elite?: Elite; dodgeCd?: number; cmdBy?: Enemy;
  inside?: boolean;
}
/** Waffe in Spielwerten (aus den X4-Werten umgerechnet) */
interface GameGun {
  /** Schaden je Geschoss (bzw. pro Sekunde beim Strahl) als Faktor auf den Grundschaden */
  dmg: number;
  /** Pause zwischen Schüssen, Salve bzw. Magazin und Nachladezeit (Spielsekunden) */
  interval: number;
  mag: number;
  reload: number;
  speed: number;
  life: number;
  range: number;
  pellets: number;
  /** Streuung je Geschoss (rad, ± zufällig) */
  jitter: number;
  beam: boolean;
  /** Anteil des Schadens, der den Schild umgeht (Thermal-Desintegrator) */
  hullPierce: number;
  /** Lanze: trifft sofort als Blitzstrahl */
  rail: boolean;
  gimbal: number;
  color: string;
  w: number;
}

/** Streuung aus den Daten (Grad) wird verdreifacht, damit sie auf dem kleinen Bildschirm sichtbar bleibt */
const JITTER = 3 * (Math.PI / 180);

/** Kurzes haptisches Signal (wo das Gerät es kann) */
function vibrate(ms: number): void {
  try {
    globalThis.navigator?.vibrate?.(ms);
  } catch {
    /* nicht unterstützt */
  }
}

function gameGun(g: X4Gun, o: { beam?: boolean; hullPierce?: number; rail?: boolean; gimbal?: number; color: string; w: number }): GameGun {
  const beam = !!o.beam, range = gameRange(g, beam), speed = beam ? 0 : gameSpeed(g.v);
  return {
    dmg: g.dmg * DMG_SCALE, interval: beam ? 0 : TIME / g.rate, mag: g.mag, reload: g.reload * TIME * RELOAD,
    speed, life: beam ? 0 : range / speed, range, pellets: g.amt, jitter: g.angle * JITTER,
    beam, hullPierce: o.hullPierce ?? 0, rail: !!o.rail, gimbal: o.gimbal ?? 1, color: o.color, w: o.w,
  };
}

interface Bullet { x: number; y: number; vx: number; vy: number; dmg: number; from: 'p' | 'e'; life: number; color: string; w: number; pierce: number; hit?: Set<Enemy>; /** Flächenschaden beim Einschlag (Torpedo) */ splash?: number; /** Anteil, der den Schild umgeht und sofort auf die Hülle geht (Thermal-Desintegrator) */ hullPierce?: number }
/** Eigene Rakete: Art (Schaden, Tempo, Lenkkraft, Besonderheit), Schwarmrakete zerfällt nach split Sekunden */
interface Missile { x: number; y: number; vx: number; vy: number; target: Enemy | null; life: number; def: MissileDef; dmg: number; split?: number; mini?: boolean }
/** Gegnerische Lenkrakete: kann abgeschossen werden */
interface EMissile { x: number; y: number; vx: number; vy: number; hp: number; life: number; target: 'f' | 'p'; wd?: Ward }
/** Fundstücke; „ammo“ = Munitionskiste (selten): füllt das Raketenlager ganz */
interface Pickup { x: number; y: number; kind: 'repair' | 'shield' | 'missile' | 'ammo'; life: number }
interface Rock { x: number; y: number; r: number; vx: number; vy: number; rot: number; vr: number; pts: number[]; /** welches der vier Asteroidenbilder */ v: number }
interface Mine { x: number; y: number; vx: number; vy: number; armed: number; hp: number }
interface Card { id: string; name: string; desc: string; max: number }

/** Laserturm der Xenon: Reichweite, Aufladezeit, Brenndauer, Schaden pro Sekunde */
const LASER_LEN = 600, LASER_CHARGE = 0.9, LASER_FIRE = 0.55, LASER_DPS = 34;
/**
 * Reichweite gegnerischer Geschütztürme (Großkampfschiffe, Nester, Frachter): Kanonen- und Plasmatürme – deutlich
 * weiter als die Bordwaffen der Jäger, damit Großziele nicht gefahrlos aus sicherer Entfernung beschossen werden
 */
const TURRET_RANGE = 520, PLASMA_RANGE = 560;

/** Drehrate je Gegnerart (rad/s): Jäger wendig, Kanonenboote träge – wer sie umkreist, ist vor ihren Kanonen sicher */
const TURN: Record<EKind, number> = { jaeger: 2.4, kanone: 0.8, rakete: 1, schild: 1.6, n: 3, m: 1.3, xs: 1.6, boss: 0.45, turret: 0, ks: 3.2, kj: 2.6, ka: 2.8, kk: 0.9, cargo: 0.6 };
/** Geschossgeschwindigkeit der Bordkanonen je Gegnerart (für den Vorhalt) */
const SHOT_V: Partial<Record<EKind, number>> = { jaeger: 300, kanone: 240, n: 340, m: 430, rakete: 150, ks: 360, kj: 2000, ka: 2000, kk: 2000 };
/** Bis zu dieser Entfernung lassen sich Gegner vom Jäger abfangen (danach kämpfen sie mit ihm statt mit dem Frachter) */
const AGGRO = 380;
/** Karte: Breite, Länge je Streckenabschnitt, Rand oben/unten */
const MAP_W = 2600, LEG = 900, MAP_PAD = 520;
/** Frachter-Tempo auf seiner Route */
const F_SPEED = 24;
/** Hülle eines Frachters, der Station (Einsatz „Station verteidigen“) und Abstand der Konvoi-Frachter quer zur Route */
const F_MAX = 400, STATION_MAX = 1000, KONVOI_GAP = 560, BERGER_MAX = 800;
/** Station: Bildgröße, Trefferradius, Lage der sechs Turmsockel (Anteil der Bildgröße), Hülle eines Stationsturms */
const STATION_SIZE = 230, STATION_R = 86, STATION_TUR = 0.37, STATION_TUR_HP = 60;
/** Flucht: Sekunden, bis der Sprungantrieb geladen ist (Stufe 1); Bergung: Container im Feld und nötig für den Erfolg */
const FLUCHT_T = 150, CRATES = 8, CRATES_MIN = 4;
/** Schleppseil des Traktorstrahls (Länge) und Reichweite zum Ankoppeln bzw. Abliefern */
const TOW_LEN = 46, TOW_GRAB = 40, TOW_DROP = 110;
/** Überfall: Piratenfrachter im Konvoi; Nest: Brutöffnungen um den Kern */
const CARGO_N = 3, NEST_OPEN = 5;
/**
 * Nester aus KI-Bildern (je 1024 px), alle Angaben in Bildpunkten zur Kernmitte; NEST_SCALE rechnet in Spielpunkte um.
 * Xenon: Kern, links und rechts je ein Brutmodul mit zwei Öffnungen, unten eines mit einer – die Steckverbindungen
 * (an den Bildrändern ausgemessen) stoßen genau aneinander. Kha'ak: Kristallkern mit fünf Brutmodulen (je eine Öffnung)
 * in etwas Abstand, verbunden durch lila Blitze vom Anschluss am Kern (from) zum Anschluss am Modul (to).
 */
const NEST_SCALE = 0.17;
interface NestMod { name: string; x: number; y: number; opens: [number, number][]; link?: { from: [number, number]; to: [number, number] } }
interface NestLayout { core: string; mods: NestMod[]; lasers: [number, number][]; glow: string }
const NEST_LAYOUT: Record<'xenon' | 'khaak', NestLayout> = {
  xenon: {
    core: 'xenon-nest-kern-ki', glow: '255,59,74',
    mods: [
      { name: 'xenon-nest-links-ki', x: -900, y: -4, opens: [[-836, -116], [-836, 106]] },
      { name: 'xenon-nest-rechts-ki', x: 903, y: -3, opens: [[840, -115], [840, 106]] },
      { name: 'xenon-nest-unten-ki', x: 0, y: 997, opens: [[0, 844]] },
    ],
    // Strahltürme auf den oberen Seitenkapseln des Kerns
    lasers: [[-267, -283], [268, -283]],
  },
  khaak: {
    core: 'khaak-nest-kern-ki', glow: '180,92,255',
    mods: [
      { name: 'khaak-nest-obenlinks-ki', x: -835, y: -330, opens: [[-646, -193]], link: { from: [-187, -42], to: [-357, -187] } },
      { name: 'khaak-nest-obenrechts-ki', x: 840, y: -328, opens: [[659, -191]], link: { from: [187, -42], to: [357, -187] } },
      { name: 'khaak-nest-untenlinks-ki', x: -830, y: 325, opens: [[-626, 303]], link: { from: [-163, 223], to: [-333, 308] } },
      { name: 'khaak-nest-untenrechts-ki', x: 820, y: 330, opens: [[639, 324]], link: { from: [163, 223], to: [333, 308] } },
      { name: 'khaak-nest-unten-ki', x: 0, y: 1175, opens: [[0, 998]], link: { from: [0, 500], to: [0, 670] } },
    ],
    // Kyon-Türme am Fuß der Kristallkrone
    lasers: [[-92, -212], [92, -212]],
  },
};
/** Zielhilfe: liegt der Vorhaltepunkt so nah vor der Nase (rad), gehen die Schüsse genau dorthin */
/** Trägheit: Beschleunigung (× Höchsttempo pro Sekunde), Abbremsen der Drift pro Sekunde, Joystick-Bereich nur zum Drehen */
const ACCEL = 2.4;
const DRIFT_DAMP = 0.35;
const TURN_ONLY = 0.35;

/** Turmbefehle: welche Gegnerklasse die Türme zuerst angreifen (alle = das nächste Ziel) */
export type TurretOrder = 'alle' | 'S' | 'M' | 'L';
const ORDER_KEY = 'x4-sektorbau-turmbefehle';
/** Gegnerklasse je Art: S Jäger, M Boote, Schildträger und Xenon M, L Fregatte/K-Segment samt Türmen */
const ECLASS: Record<EKind, 'S' | 'M' | 'L'> = { jaeger: 'S', n: 'S', kanone: 'M', rakete: 'M', schild: 'M', m: 'M', xs: 'M', boss: 'L', turret: 'L', ks: 'S', kj: 'S', ka: 'M', kk: 'M', cargo: 'L' };
/** Auswahl beim Wischen: oben alle, links S, rechts M, unten L */
const ORDER_DIRS: [TurretOrder, number, number][] = [['alle', 0, -1], ['S', -1, 0], ['M', 1, 0], ['L', 0, 1]];
function readOrders(): { m: TurretOrder; l: TurretOrder } {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(ORDER_KEY) ?? 'null');
    const ok = (o: unknown): TurretOrder => (o === 'S' || o === 'M' || o === 'L' ? o : 'alle');
    return { m: ok(v?.m), l: ok(v?.l) };
  } catch {
    return { m: 'alle', l: 'alle' };
  }
}
/** Radius der Steuerkreise (Bildpunkte) */
const JOY_R = 78;
/** Rechter Steuerkreis (Zielen/Lenken und Feuern) – größer für feineres Zielen */
/** Zeiger-Kennung der Maus (PC-Steuerung) */
const MOUSE_ID = 77;
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const AIM_R = 108;
/** Zwei Sticks: rechts ab diesem Ausschlag wird gefeuert; Schub seitwärts ein Viertel, rückwärts ein Drittel */
const AIM_FIRE = 0.55;
const SIDE_THRUST = 1 / 4;
const BACK_THRUST = 1 / 3;
const AIM_ASSIST = 0.15;

/** Winkel auf (−π, π] */
function wrapA(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
/** Abstand der Schiffe im Kha'ak-Cluster (Kantenlänge eines Dreiecks): so dicht, dass sich die Schiffe berühren */
const CLUSTER_GAP: Partial<Record<EKind, number>> = { ks: 14, kj: 24 };

/**
 * Aufbau eines Kha'ak-Clusters wie ein in Dreiecke geteiltes großes Dreieck (x quer, y nach hinten, Spitze vorn,
 * Mitte im Schwerpunkt der Schiffe): Schiffe sitzen Kante an Kante in den aufrechten Dreiecken und – rückwärts
 * fliegend – in den umgedrehten dazwischen, so bleibt keine Lücke. Ein volles Dreieck mit Seite k hat k² Felder
 * (4, 9, 16, 25 …); nur bei anderen Anzahlen bleiben Felder übrig, die Kristallmasse füllt.
 */
export function clusterLayout(n: number, gap: number): { ships: { x: number; y: number; flip: boolean }[]; mass: [number, number][][] } {
  const h = gap * Math.sqrt(3) / 2;
  let k = 1;
  while (k * k < n) k++;
  const ships: { x: number; y: number; flip: boolean }[] = [];
  for (let i = 0; i < k && ships.length < n; i++) for (let j = 0; j <= i && ships.length < n; j++) ships.push({ x: (j - i / 2) * gap, y: i * h, flip: false });
  // umgedrehte Dreiecke zwischen den aufrechten, die mittleren zuerst
  const holes: { x: number; y: number; v: [number, number][] }[] = [];
  for (let i = 1; i < k; i++) for (let j = 0; j < i; j++) {
    const xu = (j - i / 2) * gap, y = i * h;
    holes.push({ x: xu + gap / 2, y: y - h / 3, v: [[xu, y - (2 * h) / 3], [xu + gap, y - (2 * h) / 3], [xu + gap / 2, y + h / 3]] });
  }
  const cy0 = (k - 1) * h * (2 / 3);
  holes.sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || Math.abs(a.y - cy0) - Math.abs(b.y - cy0));
  const used = new Set<number>();
  for (let q = 0; ships.length < n && q < holes.length; q++) { ships.push({ x: holes[q].x, y: holes[q].y, flip: true }); used.add(q); }
  const cy = ships.reduce((a, p) => a + p.y, 0) / ships.length;
  return {
    ships: ships.map((p) => ({ ...p, y: p.y - cy })),
    mass: holes.filter((_, q) => !used.has(q)).map((hl) => hl.v.map(([x, y]) => [x, y - cy] as [number, number])),
  };
}

/** nur die Plätze (x, y, umgedreht) – für Tests und Übersicht */
export function clusterSlots(n: number, gap: number): [number, number, boolean][] {
  return clusterLayout(n, gap).ships.map((p) => [p.x, p.y, p.flip]);
}

/**
 * Kha'ak-Cluster aus einer Anzahl Schiffe: nur volle Dreiecke 4, 9 und (wenn erlaubt) 25 – erst große, dann kleine,
 * höchstens max Cluster; ein Rest unter 4 entfällt
 */
export function khaakClusters(total: number, max: number, big = false): number[] {
  const out: number[] = [];
  let rem = total;
  while (rem >= 4 && out.length < max) {
    const s = big && rem >= 25 ? 25 : rem >= 9 ? 9 : 4;
    out.push(s);
    rem -= s;
  }
  return out.length ? out : [4];
}

/**
 * Kha'ak-Jäger: Cluster zu 9 (größer nicht) oder 4, lieber zwei Vierer als ein Neuner mit großem Rest; kleinere
 * Reste fliegen einzeln mit
 */
export function jaegerClusters(n: number): number[] {
  const out: number[] = [];
  while (n >= 13) { out.push(9); n -= 9; }
  if (n >= 9) out.push(9);
  else if (n >= 8) out.push(4, 4);
  else if (n >= 4) out.push(4);
  return out;
}

/** Winkel a um höchstens step in Richtung b drehen */
function turnTo(a: number, b: number, step: number): number {
  const d = wrapA(b - a);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

const CARDS: Card[] = [
  { id: 'spread', name: 'Streuschuss', desc: 'Zwei zusätzliche Geschosse schräg', max: 2 },
  { id: 'rapid', name: 'Schnellfeuer', desc: '+25 % Feuerrate', max: 3 },
  { id: 'heavy', name: 'Schwere Geschosse', desc: '+30 % Schaden', max: 3 },
  { id: 'pierce', name: 'Durchschlag', desc: 'Geschosse durchschlagen einen weiteren Gegner', max: 2 },
  { id: 'missiles', name: 'Große Salve', desc: '+2 Raketen pro Salve', max: 2 },
  { id: 'mreload', name: 'Raketenlader', desc: 'Raketen laden 20 % schneller', max: 2 },
  { id: 'shield', name: 'Schildgenerator', desc: '+40 % Schild', max: 2 },
  { id: 'regen', name: 'Schnellladung', desc: 'Schild lädt schneller und früher', max: 2 },
  { id: 'drone', name: 'Begleitdrohne', desc: 'Eine Drohne kämpft an deiner Seite', max: 2 },
  { id: 'repair', name: 'Reparatur', desc: 'Frachter +25 %, Jäger wieder voll', max: 99 },
  { id: 'dash', name: 'Bereitschaft', desc: 'Spezialfähigkeit lädt 25 % schneller', max: 2 },
  { id: 'speed', name: 'Nachbrenner', desc: '+12 % Tempo', max: 2 },
];



/** Zoomstufen des Kampffelds (kleiner = weiter herausgezoomt, mehr Überblick); per Taste wählbar, wird gemerkt */
const ZOOMS = [1.2, 0.95, 0.72, 0.58, 0.46, 0.36, 0.27, 0.2];
const ZOOM_KEY = 'x4-sektorbau-kampfzoom';
function readZoom(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(ZOOM_KEY));
    if (ZOOMS.includes(v)) return v;
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 0.58;
}

/** Normale Runde: drei Wellen und der Boss */
const NORMAL_WAVES = 4;

/** Größe des Schiffsbilds in Bildpunkten (das Bild hat Rand, das Schiff selbst ist etwa 85 % davon) */
const SPRITE_SIZE = 46;
/**
 * L-Turm-Rohr: Länge (Anteil der Schiffsgröße), Lage des Drehpunkts über der Wurzel (Anteil der Rohrlänge) und Verbreiterung –
 * bewusst größer als maßstabsgetreu, damit man Schwenken und Rückstoß in Spielgröße sieht.
 */
const LB_LEN = 0.12, LB_ROOT = 0.12, LB_WIDE = 1.6;


export class ShooterGame implements MiniGame {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly controls: string[] = [
    'Links hinhalten und ziehen: Joystick – der Jäger dreht sich in die Richtung und gibt Schub; im inneren Ring dreht er nur und driftet weiter (Trägheit) – so kannst du wenden und rückwärts fliegend schießen',
    'Bordkanonen schießen nur geradeaus: Feuertaste (F) halten; der Kreis vor dem Ziel zeigt, wohin du zielen musst',
    'Raketen (R) suchen ihr Ziel selbst, Ausweichen (A); ohne Gegner in der Nähe schaltet der Reiseantrieb zu',
    'Gegner kommen von weit her – fang sie ab, bevor sie den Frachter erreichen',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  /** Wertung zum Nachlesen: Sterne nach Frachter-Hülle (Endlos: nach Wellen), Punkte für Abschüsse und das Ziel */
  /** Kampfmusik „Invasion“: startet mit dem Spiel, pausiert mit ihm und blendet am Ende aus */
  private track: GameTrack | null = null;
  phase(p: 'play' | 'pause' | 'end'): void {
    if (p === 'play') { if (this.track) this.track.resume(); else this.track = playGameTrack(invasionUrl, 0.7); }
    else if (p === 'pause') this.track?.pause();
    else { this.track?.stop(3); this.track = null; }
    // keine Taste und kein Feuer „hängen“ lassen, wenn das Spiel unterbrochen wird
    if (p !== 'play') { this.keys.clear(); this.mouseFire = false; }
  }

  get rules(): Rules {
    const bounty = this.mutator?.id === 'bounty' ? ' (Kopfgeld: ×1,5)' : '';
    const foes = this.side === 'pirate'
      ? `Abschüsse: Jäger 100, Raketenboot 200, Kanonenboot und Schildträger 250, Geschützturm 200, Fregatte 1.500 (als Großziel mitten in der Welle 750)${bounty}`
      : this.side === 'xenon'
        ? `Abschüsse: Xenon N 60, Xenon M und Schirmdrohne 250, Geschützturm 200, K-Segment 1.500 (als Großziel 750)${bounty}`
        : `Abschüsse: Kha’ak-Späher 70, Jäger 130, Abfangjäger 220, Korvette 300, Kyon-Turm und Brutkammer 200, Brutschiff 1.500 (als Großziel 750)${bounty}`;
    const common = [
      foes,
      'Abgeschossene Rakete 30, gesprengte Mine 20',
      'Elite-Gegner (farbiger Rand): Abschuss ×1,5',
      'Kombo: jeder Abschuss kurz nach dem letzten erhöht den Faktor um 0,5 (bis ×6); nach 2,5 s ohne Abschuss fällt er auf ×1',
      ...(this.mutator && this.mutator.mult !== 1 ? [`Besonderheit „${this.mutator.name}“: alle Punkte ×${String(this.mutator.mult).replace('.', ',')}`] : []),
    ];
    const ms = this.missionRules();
    if (ms) return { stars: ms.stars, points: [...ms.points, ...common] };
    return {
      stars: this.mode === 'endless'
        ? ['4 Wellen überstehen', '7 Wellen überstehen', '10 Wellen überstehen']
        : ['Den Frachter bis zum Sprungtor bringen', '… mit mindestens 55 % Frachter-Hülle', '… mit mindestens 85 % Frachter-Hülle'],
      points: [
        foes,
        'Abgeschossene Rakete 30, gesprengte Mine 20',
        'Elite-Gegner (farbiger Rand): Abschuss ×1,5',
        'Stärkeres Schiff: Gegner bleiben gleich stark, es kommen aber mehr, in mehr Gruppen, schwerere Typen, Großziele und eine längere Route – mehr Punkte',
        this.mode === 'endless' ? 'Jede überstandene Welle: 300 × Wellennummer' : 'Am Sprungtor: 1.000 fürs Ankommen, dazu bis 2.000 nach Frachter-Hülle (100 % = 2.000)',
        'Kombo: jeder Abschuss kurz nach dem letzten erhöht den Faktor um 0,5 (bis ×6); nach 2,5 s ohne Abschuss fällt er auf ×1',
        ...(this.mutator && this.mutator.mult !== 1 ? [`Besonderheit „${this.mutator.name}“: alle Punkte ×${String(this.mutator.mult).replace('.', ',')}`] : []),
      ],
    };
  }
  /** Sterne und Punkte der Einsätze (null = Geleitschutz) */
  private missionRules(): { stars: string[]; points: string[] } | null {
    switch (this.mission) {
      case 'station': return { stars: ['Alle Wellen abwehren, die Station steht', '… mit mindestens 55 % Stations-Hülle', '… mit mindestens 85 % Stations-Hülle'], points: ['Alle Wellen abgewehrt: 1.000, dazu bis 2.000 nach Stations-Hülle und 300 je stehendem Stationsturm', 'Reparatur-Fundstück: Station +8 % und ein zerstörter Turm wieder instand'] };
      case 'konvoi': return { stars: ['Einen Frachter ans Tor bringen', 'Zwei Frachter ans Tor bringen', 'Alle drei Frachter ans Tor bringen'], points: ['Je Frachter am Tor: 1.500, dazu bis 1.000 nach seiner Hülle'] };
      case 'flucht': return { stars: ['Durchhalten, bis der Frachter springt', '… mit mindestens 35 % Frachter-Hülle', '… mit mindestens 60 % Frachter-Hülle'], points: ['Gesprungen: 1.000, dazu bis 2.000 nach Frachter-Hülle', `Der Sprungantrieb braucht ${Math.round(this.fluchtT)} s – auch wenn du nur ausweichst`] };
      case 'bergung': return { stars: [`${CRATES_MIN} Container bergen`, '6 Container bergen', `Alle ${CRATES} Container bergen`], points: ['Je abgelieferter Container 400', 'Am Ende: bis 1.000 nach Hülle des Bergungsschiffs', 'Wer einen Container schleppt, ist etwas langsamer; Treffer auf den Container zerstören ihn'] };
      case 'ueberfall': return { stars: ['Einen Piratenfrachter zerstören', 'Zwei Piratenfrachter zerstören', 'Alle drei Piratenfrachter zerstören'], points: ['Piratenfrachter 800, alle drei: 1.000 extra'] };
      case 'nest': return { stars: ['Das Nest ausheben', '… in unter 4 Minuten', '… in unter 2:30 Minuten'], points: ['Brutöffnung 200, Kern 1.500, dazu bis 2.000 für Tempo (je Sekunde unter 5 Minuten fast 7)', this.side === 'khaak' ? 'Zwei Nebennester (je 750, brüten Späher-Cluster) und vier Turmplattformen (je 200) – freiwillige Ziele' : 'Zwei Nebennester (je 750, schicken Xenon-N-Drohnen) und vier Turmplattformen (je 200: Gatling, Zwillingskanone, schwerer Laser) – freiwillige Ziele'] };
      default: return null;
    }
  }
  /** Flucht: Ladezeit des Sprungantriebs (höhere Stufen länger) */
  private get fluchtT(): number { return FLUCHT_T * (1 + (this.level - 1) * 0.08); }
  private level: Level;
  private mode: Mode;
  private r: () => number;
  private gear: Gear;
  private score: Score;
  private cards: Record<string, number> = {};
  // Welt und Kamera
  private WW = 900;
  private WH = 1300;
  private camX = 0;
  private camY = 0;
  /** aktueller Zoom (gleitet zur gewählten Stufe) */
  private zoom = readZoom();
  private zoomGoal = this.zoom;
  // Spieler
  private px = 0;
  private py = 0;
  /** Schub 0…1 (für Triebwerksflamme) */
  private thrust = 0;
  private pvx = 0;
  private pvy = 0;
  private hull = 100;
  private minHull = 100;
  private shield: number;
  private shieldWait = 0;
  private shieldHit = 0;
  private fireCd = 0;
  /** Blickrichtung des Jägers – die Bordkanonen feuern nur dorthin */
  private aimA = -Math.PI / 2;
  /** Finger auf der Feuertaste (99 = Autopilot) */
  private fireId: number | null = null;
  /**
   * PC-Steuerung (Maus und Tastatur): schaltet sich ein, sobald Maus oder Tastatur benutzt werden, und wieder aus,
   * sobald der Bildschirm berührt wird. Das Schiff dreht sich zur Maus; W/A/S/D (oder Pfeiltasten) geben Schub
   * aus Sicht des Schiffs – vorwärts, rückwärts und seitwärts.
   */
  private pc = false;
  private pcT = 0;
  private keys = new Set<string>();
  private mouseX = -1;
  private mouseY = -1;
  private mouseFire = false;
  /** Nachladen des Magazins: verbleibende und gesamte Zeit (Sekunden) – für die Anzeige */
  private reloadLeft = 0;
  private reloadMax = 1;
  private ringFlash = 0;
  /** Magazin leer, wird nachgeladen (Anzeige zeigt dann 0 statt des schon wieder vollen Zählers) */
  private reloading = false;
  /** Reiseantrieb 0…1 */
  private cruise = 0;
  /** Vorhaltepunkt des anvisierten Gegners */
  private lock: { e: Enemy; x: number; y: number; ok: boolean } | null = null;
  private missileCd = 2;
  private missilesUsed = 0;
  private dashCd = 0;
  private dashT = 0;
  // Ausrüstung: Schiff, Bordwaffe, Turmwaffe, Schild
  private readonly ship: ShipDef;
  private readonly wpn: GameGun;
  /** Waffenart (für den Schussklang) */
  private readonly wpnId: string;
  private readonly tw: GameGun;
  /** Schuss im Magazin bzw. in der Salve; Zeit ohne Feuern (danach ist das Magazin wieder voll) */
  private mag = 0;
  private idle = 0;
  /** Nachbrand haftender Geschosse: Gegner, Schaden pro Sekunde, Restzeit */
  private readonly sh: ShieldDef;
  /** Effekte der Schiffsmodifikationen */
  private readonly mods: ModStats;
  /** Waffenüberladung, Nachbrenner, Begleitjäger: Restzeit */
  private odT = 0;
  private sprintT = 0;
  private escortT = 0;
  /** Waffenplätze: mit Bordkanone bzw. mit Raketenwerfer (seitliche Lage) */
  private guns: number[] = [];
  private launchers: number[] = [];
  private mDef: MissileDef = MISSILES.lenk;
  /** Raketen im Lager */
  private ammo = 0;
  /** Gegner bei starken Schiffen: Anzahl (Faktor) sowie Hülle und Schaden (Faktor) */
  private foeCount = 1;
  /** Stärke des eigenen Schiffs (Mamba = 1): bestimmt Menge und Mischung der Gegner, nicht ihre Werte */
  private power = 1;
  /** Jäger, die gleichzeitig auf dich anfliegen dürfen (die übrigen kreisen in Abstand) */
  private attackCap = 2;
  /** Wellen bis zum Sprungtor: große Schiffe fliegen eine längere Route */
  private nWaves = NORMAL_WAVES;
  /** Deckkraft der Hülle/Schild-Anzeige über den Gegnern (Einstellung, 0 = aus) */
  private barAlpha = enemyBars();
  /** Gegnerstärke aus dem Entwicklungswerkzeug (beim Start der Runde gelesen) */
  private tune = enemyTune();
  private tuneVer = enemyTuneVersion();
  /** Türme des eigenen Schiffs: Pause und Richtung */
  private pTur: { cd: number; a: number; mag: number }[] = [];
  /** Drehtempo der Türme (rad/s) und Turmart (für das Bild) */
  private turTurn = 5;
  private turType = 'puls';
  /** Schwere L-Türme (Zerstörer): Schwenkwinkel zur Blickrichtung (0 = geradeaus, positiv = nach außen), Pause, Magazin, Rückstoß, Mündungsfeuer */
  private pL: { rel: number; cd: number; mag: number; recoil: number; flash: number }[] = [];
  private lt: GameGun | null = null;
  private lTurn = 1;
  private lTurType: LTurretId = 'plasma';
  /** Turmbefehle der M- und L-Türme (gemerkt) und ein laufendes Wischen am Befehlsknopf */
  orders = readOrders();
  private orderDrag: { id: number; which: 'm' | 'l'; x0: number; y0: number; pick: TurretOrder | null } | null = null;
  /** Strahler: Strahlen dieses Bilds (von – bis) für die Darstellung */
  private beams: [number, number, number, number][] = [];
  /** Strahlentürme: Strahlen dieses Bilds (von – bis) */
  private tBeams: [number, number, number, number][] = [];
  private dashVx = 0;
  private dashVy = 0;
  private droneA = 0;
  /** Blickrichtung je Drohne: zum letzten Ziel, sonst wie der Jäger */
  private droneAim: number[] = [];
  private droneCd = 0;
  // Mitte der Route (bzw. der Station): Position, Ziel des aktuellen Abschnitts, Tempo; die Schutzziele liegen darum
  private fX = 0;
  private fY = 0;
  private fGoal = 0;
  private fVy = 0;
  /** Schutzziele des Einsatzes (Frachter, Station, Bergungsschiff); leer bei Überfall und Nest */
  private wards: Ward[] = [];
  private readonly mission: Mission;
  // Einsätze: Ladung des Sprungantriebs (Flucht, 0…1), Container und Wracks (Bergung), Piratenfrachter (Überfall)
  private charge = 0;
  private crates: Crate[] = [];
  private wrecks: Wreck[] = [];
  private crateLost = 0;
  private crateDone = 0;
  private cargoTotal = 0;
  private cargoKilled = 0;
  private cargoEscaped = 0;
  private firstCargoT = -1;
  /** Flucht: Großkampfschiff gegen Ende schon unterwegs */
  private fluchtBoss = false;
  private gateX = 0;
  private gateY = 0;
  private grpN = 0;
  /** Kha'ak-Cluster: Mitte, Tempo, Drehung der Wabe, Flugrichtung */
  private clusters = new Map<number, { x: number; y: number; vx: number; vy: number; ang: number; kind: EKind; mass: [number, number][][] }>();
  // Welt-Objekte
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private missiles: Missile[] = [];
  private eMissiles: EMissile[] = [];
  private pickups: Pickup[] = [];
  private rocks: Rock[] = [];
  private mines: Mine[] = [];
  private section: 'none' | 'rocks' | 'mines' = 'none';
  private sectionPlan: ('none' | 'rocks' | 'mines')[] = [];
  // Ablauf
  private wave = -1;
  private waveT = 0;
  private banner = 0;
  private bannerText = '';
  private bannerSub = '';
  private kills = 0;
  private loot = 0;
  private bossKills = 0;
  private bossT = -1;
  private time = 0;
  private gateT = -1;
  private endT = -1;
  /** fail: Einsatzziel verfehlt (zu wenige Container, alle Piratenfrachter entkommen) */
  private outcome: 'win' | 'freighter' | 'player' | 'fail' | null = null;
  private choosing: Card[] | null = null;
  private pendingSpawn = -1;
  /** Verstärkung einer Welle: kommt einige Sekunden später von anderer Seite */
  private reinforce: { t: number; kinds: EKind[]; from: number; swarm?: boolean }[] = [];
  /** Elite-Gegner, die in dieser Welle noch kommen, und dafür in Frage kommende Gegner */
  private eliteLeft = 0;
  private eliteRest = 0;
  /** Sprengung eines Rächers: zündet nach kurzer Zeit */
  private blasts: { x: number; y: number; t: number; dmg: number }[] = [];
  private shake = 0;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(170, 31);
  private w = 1;
  private h = 1;
  // Eingabe
  private joy: { id: number; ox: number; oy: number; kx: number; ky: number } | null = null;
  /** Zwei Sticks: rechter Stick zum Zielen und Feuern */
  private aim: { id: number; ox: number; oy: number; kx: number; ky: number } | null = null;
  private readonly ctrl: ControlMode;
  /** Lanzenblitze: von – bis, Restzeit, Farbe */
  private rails: { x1: number; y1: number; x2: number; y2: number; t: number; color: string }[] = [];
  private done: GameResult | null = null;

  constructor(cfg: GameCfg, private side: Side) {
    this.level = cfg.level;
    this.mode = cfg.mode === 'endless' ? 'endless' : cfg.mode ?? 'normal';
    this.mission = this.mode === 'endless' ? 'geleit' : cfg.mission ?? 'geleit';
    this.r = rng(cfg.seed);
    this.gear = cfg.gear ?? { weapon: 1, shield: 1, engine: 1 };
    this.mutator = findMutator(SHOOTER_MUTATORS, cfg.mutator);
    const lo: Loadout = cfg.loadout ?? loadout();
    this.ctrl = cfg.controls ?? (cfg.loadout ? 'eins' : controlMode());
    if (this.ctrl === 'zwei') this.controls = [
      'Zwei Sticks: links hinhalten und ziehen zum Fliegen, aus Sicht des Jägers – nach oben Schub geradeaus, zur Seite seitwärts, nach unten rückwärts – seitwärts mit einem Viertel, rückwärts mit einem Drittel der Kraft und des Tempos; der Jäger driftet mit Trägheit',
      'Rechts hinhalten und ziehen zum Zielen: der Jäger dreht sich dorthin (so entsteht auch Drift); über den Ring hinaus feuern die Bordkanonen – mit kurzem Vibrieren',
      'Raketen (R) suchen ihr Ziel selbst, Spezialtaste darüber; ohne Gegner in der Nähe schaltet der Reiseantrieb zu',
      'Gegner kommen von weit her – fang sie ab, bevor sie den Frachter erreichen',
    ];
    this.ship = SHIPS[lo.ship];
    if (this.ship.turrets.length) this.controls = [...this.controls, `Turmbefehle: Knopf ${this.ship.lMounts?.length ? '„M“ bzw. „L“' : '„M“'} links halten und wischen – nach oben alle Ziele, links zuerst S-Schiffe (Jäger), rechts M-Schiffe (Boote), unten L-Schiffe (Fregatte, K-Segment); antippen schaltet weiter. Raketen schießen die M-Türme nur bei „alle“ und „S“ ab`];
    // schwere Waffen nur auf L-Plätzen, sonst der Pulslaser
    const wOk = weaponFits(WEAPONS[lo.weapon], SHIPS[lo.ship].gunSize);
    const wd = WEAPONS[wOk ? lo.weapon : 'puls'], td = TURRETS[lo.turret];
    this.mods = cfg.mods ?? (cfg.loadout ? {} : modStats());
    this.wpn = gameGun(weaponGun(wd, this.ship.gunSize), wd);
    this.wpnId = wOk ? lo.weapon : 'puls';
    // Mods: schnellere Geschosse fliegen weiter (gleiche Flugzeit), Fokussierlinse verengt die Streuung
    const mv = 1 + this.m('velocity');
    this.wpn.speed *= mv;
    this.wpn.range *= mv;
    this.wpn.jitter *= 1 - this.m('spread');
    this.tw = gameGun(td.gun, td);
    // Drehtempo der Türme aus den Daten (Pulsturm 180°/s = bisheriges Tempo)
    this.turTurn = (5 * td.turn) / 180;
    this.turType = lo.turret;
    this.mag = this.wpn.mag;
    this.sh = SHIELDS[lo.shield];
    this.pTur = this.ship.turrets.map(() => ({ cd: 0, a: -Math.PI / 2, mag: this.tw.mag }));
    // schwere L-Türme an der Bordwand (nur Zerstörer)
    const ltd = LTURRETS[lo.lturret ?? 'plasma'];
    if (this.ship.lMounts?.length) {
      this.lt = gameGun(ltd.gun, ltd);
      this.lTurn = (5 * ltd.turn) / 180;
      this.lTurType = lo.lturret ?? 'plasma';
      this.pL = this.ship.lMounts.map(() => ({ rel: 0, cd: 0, mag: this.lt!.mag, recoil: 0, flash: 0 }));
    }
    // Bordkanonen auf allen Waffenplätzen; Raketenwerfer haben (seit X4 9.0) eigene Plätze – nur bei manchen Schiffen
    this.guns = [...this.ship.guns];
    // jeder Raketenwerfer feuert aus seiner Lage im Bild (sonst aus der Mitte)
    this.launchers = this.ship.x4.launchers ? this.ship.launcherPos ?? new Array<number>(this.ship.x4.launchers).fill(0) : [];
    this.mDef = MISSILES[lo.missile ?? 'lenk'];
    this.ammo = this.ammoMax;
    // Stärke des Schiffs gegenüber der Mamba (Haltbarkeit × Feuerkraft): die Gegner werden zahlreicher, ab dem
    // 2,5-Fachen zusätzlich zäher und gefährlicher – so bleibt der Kampf mit den Originalwerten fordernd
    const durability = (this.ship.hull + this.ship.shield) / 2;
    // Feuerkraft: Dauerleistung aller Bordkanonen und Türme (X4-Werte), zwei S-Pulslaser der Mamba = 1
    // Raketen zählen mit: Salvenschaden je Nachladezeit, in X4-Schaden umgerechnet (eine Lenkrakete ≈ Bosonenlanze S),
    // nur zu einem Drittel – das Lager ist begrenzt
    const mX4 = MISSILE_DMG * this.mDef.dmg * (this.mDef.split ?? 1) / (DMG_SCALE * 6);
    const missileDps = this.launchers.length ? ((this.launchers.length * 2 / this.mDef.slots) * mX4) / (this.missileCdMax / TIME) / 3 : 0;
    const firepower = (this.guns.length * effectiveDps(weaponGun(wd, this.ship.gunSize), wd.beam) + this.ship.turrets.length * effectiveDps(td.gun, td.beam) + this.pL.length * effectiveDps(ltd.gun) + missileDps) / (2 * sustainedDps(WEAPONS.puls.s));
    // langsame Schiffe (Zerstörer) können nicht überall zugleich sein: ihre Stärke zählt entsprechend weniger
    const power = Math.sqrt(durability * firepower) * Math.min(1, this.ship.speed);
    // Gegner haben feste Werte (nur die Stufe macht sie zäher). Ein starkes Schiff bekommt dafür mehr Gegner,
    // mehr Gruppen gleichzeitig, eine schwerere Mischung, Großziele mitten in der Welle und eine längere Route.
    this.power = power;
    this.foeCount = clamp(Math.sqrt(power), 0.6, 3.6);
    this.attackCap = clamp(Math.round(1 + Math.sqrt(power)), 2, 6);
    this.nWaves = NORMAL_WAVES + (power >= 3.5 ? 1 : 0) + (power >= 10 ? 1 : 0) + (this.mission === 'station' ? 1 : 0);
    // Schiffsbilder liegen als eigene Dateien vor: gleich laden, bis dahin wird kurz per Code gezeichnet
    preloadSprites();
    this.score = new Score(this.mutator?.mult ?? 1, 6);
    this.goals = pickGoals(this.mode === 'endless' ? ENDLESS_GOALS : this.mission === 'geleit' ? NORMAL_GOALS : MISSION_GOALS[this.mission === 'nest' ? 'nestKhaak' : this.mission], rng(cfg.seed ^ 0x77));
    this.shield = this.shieldMax;
    this.eyebrow = side === 'pirate' ? 'Piraten' : side === 'xenon' ? 'Xenon' : 'Kha’ak';
    this.title = this.mode === 'endless' ? 'Endlos' : this.mission === 'bergung' ? 'Bergung' : this.mission !== 'geleit' ? MISSIONS[this.mission].name : side === 'pirate' ? 'Geleitschutz' : side === 'xenon' ? 'Abwehr' : 'Invasion';
    const foe = side === 'pirate' ? 'Piraten' : side === 'xenon' ? 'Xenon' : 'Kha’ak';
    this.intro = this.mission === 'station'
      ? `Deine Station wird angegriffen – ${foe} kommen in Wellen aus allen Richtungen. Sechs Stationstürme helfen dir; zerstörte Türme setzt du mit Reparatur-Fundstücken wieder instand. Zum Schluss greift ein Großkampfschiff an.`
      : this.mission === 'konvoi'
        ? `Drei Frachter fliegen weit auseinander zum Sprungtor. Die ${foe} teilen sich auf – du kannst nicht überall sein. Jeder Frachter, der das Tor erreicht, zählt.`
        : this.mission === 'flucht'
          ? `Ein beschädigter Frachter sitzt fest und lädt seinen Sprungantrieb. Die ${foe} wollen ihn vorher erwischen – halte sie fern, bis die Ladung voll ist. Gegen Ende kommt ein Großkampfschiff.`
          : this.mission === 'bergung'
            ? `Im Wrackfeld treiben ${CRATES} Container. Flieg nah heran, der Traktorstrahl koppelt an – dann zum Bergungsschiff schleppen. Mindestens ${CRATES_MIN} müssen ankommen. Treffer zerstören geschleppte Container, und die ${foe} greifen das Bergungsschiff an.`
            : this.mission === 'ueberfall'
              ? `Rollentausch: Ein Piratenkonvoi aus ${CARGO_N} Frachtern fliegt zum Sprungtor im Norden. Fang ihn ab, bevor er durch ist – Begleitjäger und Verstärkung aus dem Tor stellen sich dir in den Weg.`
              : this.mission === 'nest'
                ? `Ein ${side === 'khaak' ? 'Kha’ak-Nest' : 'Xenon-Nest'} spuckt ununterbrochen Drohnen aus. Zerstöre erst die ${NEST_OPEN} Brutöffnungen – solange sie stehen, schützt ein Schild den Kern. Dann den Kern.`
                : this.mode === 'endless'
      ? `Welle um Welle – alle fünf Wellen ein Boss. Der Frachter wird zwischen den Wellen etwas repariert. Wie weit kommst du?`
      : side === 'pirate'
        ? 'Dein Frachter fliegt zum Sprungtor, Piraten lauern auf der Route. Fang sie ab, bevor sie ihn erreichen – Raketen- und Kanonenboote zuerst. Zum Schluss stellt sich die Piratenfregatte: erst die Geschütztürme.'
        : side === 'xenon'
          ? 'Dein Frachter fliegt zum Sprungtor, Xenon fallen von allen Seiten ein. Fang sie weit draußen ab. Zum Schluss greift ein K-Segment an: erst Laser- und Plasmatürme, dann der Kern.'
          : 'Kha’ak fallen über die Route her: Späher kommen als geschlossene Cluster und schwärmen erst kurz vor dem Ziel aus – oder sobald du einen triffst. Jäger feuern Kyon-Strahlen, die Schilde schnell durchbrennen; Abfangjäger springen aus dem Visier. Zum Schluss ein Brutschiff: erst Kyon-Türme und Brutkammern, dann der Kern.';
    // Abschnitte: Welle 2 und 3 mit Asteroiden oder Minen
    for (let i = 0; i < 40; i++) this.sectionPlan.push(this.mutator?.id === 'mines' ? 'mines' : i === 0 ? 'none' : this.r() < 0.45 ? (this.r() < 0.5 ? 'rocks' : 'mines') : 'none');
  }

  // ---------- abgeleitete Werte ----------

  private c(id: string): number { return this.cards[id] ?? 0; }
  /** Effekt der Schiffsmodifikationen */
  private m(id: keyof ModStats): number { return this.mods[id] ?? 0; }
  private get speed(): number { return [200, 235, 270][this.gear.engine - 1] * (1 + 0.12 * this.c('speed')) * this.ship.speed * (1 + this.m('speed')) * (this.sprintT > 0 ? 1.7 : 1) * (this.towing ? 0.82 : 1); }
  private get turnRate(): number { return [3.8, 4.3, 4.8][this.gear.engine - 1] * (1 + 0.1 * this.c('speed')) * this.ship.turn * (1 + this.m('turn')) * (this.sprintT > 0 ? 1.3 : 1); }
  /** Drohnen: aus Verbesserungen, dazu der Begleitjäger der Cobra (immer der letzte) */
  private get droneN(): number { return this.c('drone') + (this.escortT > 0 ? 1 : 0); }
  /** Takt der Waffen: Mk-Stufe, Schnellfeuer-Verbesserung und Waffenüberladung verkürzen Schusspausen und Nachladen */
  private get tempo(): number { return [0.26, 0.21, 0.17][this.gear.weapon - 1] / 0.26 / (1 + 0.25 * this.c('rapid')) / (1 + this.m('rate')) * (this.odT > 0 ? 0.5 : 1); }
  /** Grundschaden je Mk-Stufe mit Verbesserungen (ohne Schiff und Waffentyp) */
  private get baseDmg(): number { return [6, 8, 11][this.gear.weapon - 1] * (1 + 0.3 * this.c('heavy')) * (1 + this.m('dmg')) * (this.mutator?.id === 'glass' ? 2 : 1); }
  /** Reichweite der Bordwaffe */
  private get reach(): number { return this.wpn.range; }
  /** Schaden je Geschoss einer Bordkanone (Strahl: pro Sekunde) */
  private get damage(): number { return this.baseDmg * this.wpn.dmg; }
  private get shieldMax(): number { return [40, 70, 100][this.gear.shield - 1] * (1 + 0.4 * this.c('shield')) * (this.mutator?.id === 'glass' ? 0.5 : 1) * this.ship.shield * this.sh.cap * (1 + this.m('shield')); }
  private get missileCdMax(): number { return 8 * (this.ship.missileReload ?? 1) * Math.pow(0.8, this.c('mreload')); }
  /** Raketenlager (mit Mod „Erweitertes Raketenlager“) */
  private get ammoMax(): number { return this.ship.x4.launchers ? this.ship.x4.missiles + Math.round(this.m('missiles')) : 0; }
  /** Schaden einer Rakete: etwa wie die Bosonenlanze, wächst mit der Ausrüstungsstufe wie die Bordwaffen */
  private get missileDmg(): number { return MISSILE_DMG * ([6, 8, 11][this.gear.weapon - 1] / 6) * this.mDef.dmg; }
  /** Raketen je Salve: zwei je Werfer (Verbesserung „Große Salve“: mehr) */
  private get salvo(): number { return this.launchers.length * 2 + 2 * this.c('missiles'); }
  private get dashCdMax(): number { return SPECIALS[this.ship.special].cd * Math.pow(0.75, this.c('dash')) * (1 - this.m('special')); }
  /**
   * Schaden am Frachter: der Frachter wird nicht stärker, wenn du ein stärkeres Schiff fliegst – über die Stärke
   * einer Fregatte hinaus (Gegnerfaktor 2) trifft der gesteigerte Gegnerschaden ihn nicht (sonst hätte der Zerstörer
   * keine Chance, ihn zu schützen).
   */
  private get fScale(): number { return 1; }
  private get enemyDmg(): number { return this.level >= 5 ? 1.3 : this.level >= 3 ? 1.15 : 1; }
  /** Einsätze mit fester Zahl von Wellen (der Rest endet über sein eigenes Ziel) */
  private get counted(): boolean { return this.mission === 'geleit' || this.mission === 'konvoi' || this.mission === 'station'; }
  /** Schutzziele fliegen eine Route (Geleit, Konvoi) */
  private get moving(): boolean { return this.mission === 'geleit' || this.mission === 'konvoi'; }
  private get totalWaves(): number { return this.mode === 'endless' || !this.counted ? Infinity : this.nWaves; }
  private isBossWave(i: number): boolean { return this.mode === 'endless' ? (i + 1) % 5 === 0 : this.counted && i === this.nWaves - 1; }

  resize(w: number, h: number): void {
    const first = this.w === 1;
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    // große Karte, unabhängig vom Bildschirm: der Frachter fliegt von unten nach oben zum Tor
    if (first) {
      this.setupMap();
      this.camX = this.px - w / 2 / this.zoom;
      this.camY = this.py - (h * 0.58) / this.zoom;
    }
  }

  /** Karte, Schutzziele und Startpunkt je Einsatz */
  private setupMap(): void {
    const m = this.mission;
    const frachter = (ox: number, oy = 0, ph = 0, name = 'Frachter'): Ward => ({
      kind: 'frachter', name, ox, oy, hull: F_MAX, max: F_MAX, flash: 0, dead: false, ph,
      tur: [{ ox: 0, oy: -30, cd: 0, a: -Math.PI / 2, hp: 1, max: 1 }, { ox: 0, oy: 34, cd: 0.3, a: Math.PI / 2, hp: 1, max: 1 }],
    });
    this.WW = MAP_W;
    if (m === 'geleit' || m === 'konvoi') {
      // der Frachter (bzw. der Konvoi) fliegt von unten nach oben zum Tor
      this.WH = MAP_PAD * 2 + LEG * (this.mode === 'endless' ? 5 : this.nWaves);
      this.fX = this.WW / 2;
      this.fY = this.fGoal = this.WH - MAP_PAD;
      this.wards = m === 'konvoi' ? [frachter(-KONVOI_GAP, 0, 0, 'West'), frachter(0, 50, 2.1, 'Mitte'), frachter(KONVOI_GAP, 0, 4.2, 'Ost')] : [frachter(0)];
      this.px = this.fX;
      this.py = this.fY + 120;
      return;
    }
    // die übrigen Einsätze auf einer quadratischen Karte
    this.WH = MAP_W;
    this.fX = this.WW / 2;
    this.fY = this.fGoal = this.WH / 2;
    this.px = this.fX;
    this.py = this.fY + 200;
    if (m === 'station') {
      // sechs Türme auf den runden Sockeln der Station
      const tur = Array.from({ length: 6 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / 3;
        return { ox: Math.cos(a) * STATION_SIZE * STATION_TUR, oy: Math.sin(a) * STATION_SIZE * STATION_TUR, cd: k * 0.1, a, hp: STATION_TUR_HP, max: STATION_TUR_HP };
      });
      this.wards = [{ kind: 'station', name: 'Station', ox: 0, oy: 0, hull: STATION_MAX, max: STATION_MAX, flash: 0, dead: false, ph: 0, tur }];
    } else if (m === 'flucht') {
      // beschädigt: drei Viertel der Hülle
      const w = frachter(0);
      w.hull = w.max * 0.75;
      this.wards = [w];
    } else if (m === 'bergung') {
      this.fY = this.fGoal = this.WH - 620;
      this.wards = [{ ...frachter(0), kind: 'berger', name: 'Bergungsschiff', hull: BERGER_MAX, max: BERGER_MAX }];
      this.py = this.fY - 160;
      this.spawnWreckField();
    } else if (m === 'nest') {
      // Nest oben in der Mitte, du kommst von unten
      this.fY = this.fGoal = 640;
      this.py = this.WH - 380;
    } else if (m === 'ueberfall') {
      // der Konvoi startet unten und fliegt zum Tor oben; du startest seitlich vor ihm
      this.WH = MAP_PAD * 2 + 2500;
      this.fY = this.fGoal = this.WH - MAP_PAD;
      this.gateX = this.fX;
      this.gateY = MAP_PAD - 120;
      this.gateT = 0;
      this.px = this.fX - 700;
      this.py = this.fY - 1100;
    }
  }

  /** Lage eines Schutzziels: Frachter pendeln etwas zur Seite; am Ende gleiten sie beschleunigt in die Mitte des Tors */
  private wx(w: Ward): number {
    const x = this.fX + w.ox + (w.kind === 'frachter' && this.mission !== 'flucht' ? Math.sin(this.time * 0.35 + w.ph) * 30 : 0);
    if (this.gateT < 0 || w.kind !== 'frachter' || this.mission === 'ueberfall') return x;
    const k = Math.min(1, this.gateT / 1.7);
    return x + (this.gateX - x) * k * k;
  }
  private wy(w: Ward): number {
    const y = this.fY + w.oy;
    if (this.gateT < 0 || w.kind !== 'frachter' || this.mission === 'ueberfall') return y;
    const k = Math.min(1, this.gateT / 1.7);
    return y + (this.gateCy - y) * k * k;
  }
  /** Schutzziele, die noch stehen */
  private get liveWards(): Ward[] { return this.wards.filter((w) => !w.dead); }
  /** Hauptziel (für Kamera, Anflugrichtungen, Anzeigen): das erste, das noch steht */
  private get mainWard(): Ward | undefined { return this.wards.find((w) => !w.dead) ?? this.wards[0]; }
  private get fx1(): number { const w = this.mainWard; return w ? this.wx(w) : this.fX; }
  private get fy1(): number { const w = this.mainWard; return w ? this.wy(w) : this.fY; }
  /** Liegt der Punkt im Schutzziel? (Frachter: längliche Box, Station: Kreis) */
  private wardHit(w: Ward, x: number, y: number, pad = 0): boolean {
    const dx = x - this.wx(w), dy = y - this.wy(w);
    return w.kind === 'station' ? Math.hypot(dx, dy) < STATION_R + pad : Math.abs(dx) < 20 + pad && Math.abs(dy) < 46 + pad;
  }
  private wardAt(x: number, y: number, pad = 0): Ward | undefined {
    return this.wards.find((w) => !w.dead && this.wardHit(w, x, y, pad));
  }
  /** Strahl (Abstandsfunktion zur Strahllinie) trifft das Schutzziel? Frachter entlang der Längsachse geprüft */
  private beamOnWard(w: Ward, dist: (x: number, y: number) => number): boolean {
    const x = this.wx(w), y = this.wy(w);
    if (w.kind === 'station') return dist(x, y) < STATION_R * 0.8;
    for (let k = -40; k <= 40; k += 10) if (dist(x, y + k) < 16) return true;
    return false;
  }
  /** Ziel eines Gegners (bzw. einer Rakete): sein Schutzziel, sonst das nächste, das noch steht (null = keins mehr) */
  private wardOf(e: { x: number; y: number; wd?: Ward }): Ward | null {
    if (e.wd && !e.wd.dead) return e.wd;
    let best: Ward | null = null, bd = Infinity;
    for (const w of this.wards) {
      if (w.dead) continue;
      const d = Math.hypot(this.wx(w) - e.x, this.wy(w) - e.y);
      if (d < bd) { bd = d; best = w; }
    }
    e.wd = best ?? undefined;
    return best;
  }
  /** Abstand zum nächsten Schutzziel (Infinity, wenn keins mehr steht) */
  private wardDist(x: number, y: number): number {
    let bd = Infinity;
    for (const w of this.wards) if (!w.dead) bd = Math.min(bd, Math.hypot(this.wx(w) - x, this.wy(w) - y));
    return bd;
  }
  /** Mitte des Sprungtors (rückt beim Öffnen etwas heran) */
  private get gateCy(): number { return this.gateY + Math.min(1, this.gateT * 0.8) * 60; }
  // Tasten rechts unten: Feuer groß unter dem Daumen, Raketen links daneben, Ausweichen darüber
  private get btnFire(): [number, number, number] { return [this.w - 66, this.h - 80, 40]; }
  private get btnMissile(): [number, number, number] { return [this.w - 160, this.h - 54, 27]; }
  /** Zoom-Tasten unter dem Radar: weiter weg (−) und näher heran (+) */
  private get btnZoomOut(): [number, number, number] { return [this.w - 82, TOP + 124, 15]; }
  private get btnZoomIn(): [number, number, number] { return [this.w - 38, TOP + 124, 15]; }
  private get btnDash(): [number, number, number] { return [this.w - 60, this.h - 182, 25]; }
  /** Befehlsknöpfe der Türme: links über dem Joystick (M oben, L darunter; nur wenn das Schiff solche Türme hat) */
  private get orderBtns(): ['m' | 'l', number, number, number][] {
    const out: ['m' | 'l', number, number, number][] = [];
    if (this.pTur.length) out.push(['m', 74, this.h - (this.pL.length ? 330 : 270), 22]);
    if (this.pL.length) out.push(['l', 74, this.h - 270, 22]);
    return out;
  }

  hud(): HudItem[] {
    const me: HudItem = { label: 'Jäger', value: `${Math.ceil(this.hull)} %`, warn: this.hull < 35 };
    const pct = (w: Ward | undefined) => (w && !w.dead ? w.hull / w.max : 0);
    const w0 = this.wards[0];
    switch (this.mission) {
      case 'konvoi': {
        const live = this.liveWards;
        return [{ label: 'Konvoi', value: `${live.length}/3`, warn: live.length < 3 || live.some((w) => w.hull / w.max < 0.35) }, me];
      }
      case 'station': return [{ label: 'Station', value: `${Math.ceil(pct(w0) * 100)} %`, warn: pct(w0) < 0.35 }, me];
      case 'flucht': return [{ label: 'Sprung', value: `${Math.floor(this.charge * 100)} %` }, { label: 'Frachter', value: `${Math.ceil(pct(w0) * 100)} %`, warn: pct(w0) < 0.35 }, me];
      case 'bergung': return [{ label: 'Container', value: `${this.crateDone}/${CRATES}`, warn: CRATES - this.crateLost < CRATES_MIN + 1 }, { label: 'Schiff', value: `${Math.ceil(pct(w0) * 100)} %`, warn: pct(w0) < 0.35 }, me];
      case 'ueberfall': return [{ label: 'Frachter', value: `${this.cargoKilled}/${CARGO_N}`, warn: this.cargoEscaped > 0 }, me];
      case 'nest': {
        const core = this.enemies.find((e) => e.nest);
        const open = this.enemies.filter((e) => e.parent?.nest && e.weapon === 'brut').length;
        return [{ label: open ? 'Brutöffnungen' : 'Kern', value: open ? `${open}` : `${core ? Math.ceil((core.hp / core.max) * 100) : 0} %` }, me];
      }
      default: return [{ label: 'Frachter', value: `${Math.ceil(pct(w0) * 100)} %`, warn: pct(w0) < 0.35 }, me];
    }
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  // ---------- Eingabe ----------

  pointerDown(id: number, x: number, y: number): void {
    if (id !== MOUSE_ID && this.pc) { this.pc = false; this.keys.clear(); this.mouseFire = false; }
    if (this.choosing) { this.pickCardAt(x, y); return; }
    const [fbx, fby, fbr] = this.btnFire;
    if (this.ctrl === 'eins' && Math.hypot(x - fbx, y - fby) < fbr + 12) { this.fireId = id; return; }
    for (const [btn, step] of [[this.btnZoomOut, 1], [this.btnZoomIn, -1]] as const) {
      if (Math.hypot(x - btn[0], y - btn[1]) < btn[2] + 8) { this.setZoom(step); return; }
    }
    const [bx, by, br] = this.btnMissile;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.fireMissiles(); return; }
    const [dx, dy, dr] = this.btnDash;
    if (Math.hypot(x - dx, y - dy) < dr + 10) { this.doSpecial(); return; }
    for (const [which, ox, oy, orr] of this.orderBtns) {
      if (Math.hypot(x - ox, y - oy) < orr + 8) { this.orderDrag = { id, which, x0: ox, y0: oy, pick: null }; sfx.tap(); return; }
    }
    // zwei Sticks: rechte Hälfte zielt und feuert, linke fliegt
    if (this.ctrl !== 'eins' && x > this.w / 2) { if (!this.aim) this.aim = { id, ox: x, oy: y, kx: 0, ky: 0 }; return; }
    if (!this.joy) this.joy = { id, ox: x, oy: y, kx: 0, ky: 0 };
  }

  pointerMove(id: number, x: number, y: number): void {
    const od = this.orderDrag;
    if (od?.id === id) {
      // Richtung des Wischens wählt den Befehl
      const dx = x - od.x0, dy = y - od.y0;
      const pick = Math.hypot(dx, dy) < 22 ? null : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'S' : 'M') : dy < 0 ? 'alle' : 'L';
      if (pick !== od.pick) { od.pick = pick; if (pick) sfx.tick(); }
      return;
    }
    const j = this.joy?.id === id ? this.joy : this.aim?.id === id ? this.aim : null;
    if (!j) return;
    let dx = x - j.ox, dy = y - j.oy;
    const d = Math.hypot(dx, dy), max = j === this.aim ? AIM_R : JOY_R;
    if (d > max) {
      // Basis wandert mit, damit man nie „am Anschlag hängt“
      j.ox += (dx / d) * (d - max);
      j.oy += (dy / d) * (d - max);
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    j.kx = dx / max;
    j.ky = dy / max;
  }

  pointerUp(id: number): void {
    const od = this.orderDrag;
    if (od?.id === id) {
      // gewischt: gewählter Befehl; nur angetippt: weiter zum nächsten
      const cur = this.orders[od.which];
      const next = od.pick ?? ORDER_DIRS[(ORDER_DIRS.findIndex(([o]) => o === cur) + 1) % ORDER_DIRS.length][0];
      this.setOrder(od.which, next);
      this.orderDrag = null;
    }
    if (this.joy?.id === id) this.joy = null;
    if (this.aim?.id === id) this.aim = null;
    if (this.fireId === id) this.fireId = null;
  }

  /** PC-Steuerung einschalten (Hinweis zur Belegung erscheint dann einige Sekunden) */
  private usePc(): void {
    if (!this.pc) { this.pc = true; this.pcT = 0; this.joy = null; this.aim = null; if (this.fireId !== 99) this.fireId = null; }
  }

  /** Liegt an dieser Stelle ein Knopf der Oberfläche (Zoom, Raketen, Spezial, Turmbefehle)? */
  private onButton(x: number, y: number): boolean {
    const near = (b: readonly [number, number, number], pad: number) => Math.hypot(x - b[0], y - b[1]) < b[2] + pad;
    return near(this.btnZoomOut, 8) || near(this.btnZoomIn, 8) || near(this.btnMissile, 10) || near(this.btnDash, 10) || this.orderBtns.some(([, ox, oy, orr]) => Math.hypot(x - ox, y - oy) < orr + 8);
  }

  /** PC: Maus – zielen mit der Position, Linksklick feuert (gehalten), Rechtsklick Raketen, Mitte Spezialfähigkeit */
  mouse(kind: 'down' | 'move' | 'up', x: number, y: number, button: number): void {
    this.usePc();
    this.mouseX = x;
    this.mouseY = y;
    if (kind === 'move') { if (this.orderDrag?.id === MOUSE_ID) this.pointerMove(MOUSE_ID, x, y); return; }
    if (kind === 'up') {
      if (button === 0) this.mouseFire = false;
      if (this.orderDrag?.id === MOUSE_ID) this.pointerUp(MOUSE_ID);
      return;
    }
    if (this.choosing || (button === 0 && this.onButton(x, y))) { this.pointerDown(MOUSE_ID, x, y); return; }
    if (button === 0) this.mouseFire = true;
    else if (button === 2) this.fireMissiles();
    else if (button === 1) this.doSpecial();
  }

  /** PC: Tastatur – W/A/S/D bzw. Pfeiltasten Schub, Leertaste Spezialfähigkeit, R Raketen, +/− Zoom */
  key(code: string, down: boolean, repeat: boolean): boolean {
    if (code === '*') { this.keys.clear(); this.mouseFire = false; return false; }
    if (!down) { this.keys.delete(code); return MOVE_KEYS.has(code); }
    if (MOVE_KEYS.has(code)) { this.usePc(); this.keys.add(code); return true; }
    if (repeat) return code === 'Space' || code === 'KeyR';
    if (code === 'Space') { this.usePc(); this.doSpecial(); return true; }
    if (code === 'KeyR') { this.usePc(); this.fireMissiles(); return true; }
    if (code === 'Equal' || code === 'NumpadAdd') { this.setZoom(-1); return true; }
    if (code === 'Minus' || code === 'NumpadSubtract') { this.setZoom(1); return true; }
    return false;
  }

  /** PC: Mausrad zoomt (vom Bildschirm weg = weiter heraus) */
  wheel(dy: number): void {
    if (Math.abs(dy) > 2) this.setZoom(dy > 0 ? 1 : -1);
  }

  /** Turmbefehl setzen und merken (auch für Tests) */
  setOrder(which: 'm' | 'l', o: TurretOrder): void {
    if (this.orders[which] === o) return;
    this.orders = { ...this.orders, [which]: o };
    try { globalThis.localStorage?.setItem(ORDER_KEY, JSON.stringify(this.orders)); } catch { /* Speicher nicht verfügbar */ }
    vibrate(15);
    sfx.tick();
    this.floats.add(this.px, this.py - 50, `${which === 'm' ? 'M-Türme' : 'L-Türme'}: ${o === 'alle' ? 'alle Ziele' : `zuerst ${o}-Schiffe`}`, '#9ffcff', 13);
  }

  /** Ziel nach Turmbefehl: bevorzugt die gewählte Klasse (sonst das nächste andere Ziel); ok prüft Winkel o. Ä. */
  private pickTarget(x: number, y: number, range: number, order: TurretOrder, ok: (e: Enemy, d: number) => boolean = () => true): Enemy | null {
    let best: Enemy | null = null, bd = range, pref: Enemy | null = null, pd = range;
    for (const e of this.enemies) {
      if (e.kind === 'boss' && e.shielded) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d >= range || !ok(e, d)) continue;
      if (d < bd) { bd = d; best = e; }
      if (order !== 'alle' && ECLASS[e.kind] === order && d < pd) { pd = d; pref = e; }
    }
    return pref ?? best;
  }

  /** Zoomstufe wechseln (+1 = weiter weg) und merken */
  private setZoom(step: number): void {
    const i = clamp(ZOOMS.indexOf(this.zoomGoal) + step, 0, ZOOMS.length - 1);
    this.zoomGoal = ZOOMS[i];
    try { globalThis.localStorage?.setItem(ZOOM_KEY, String(this.zoomGoal)); } catch { /* Speicher nicht verfügbar */ }
    sfx.tap();
  }

  private cardRects(): [number, number, number, number][] {
    const cw = Math.min(this.w - 40, 340), ch = 78, gap = 12;
    const total = 3 * ch + 2 * gap;
    const y0 = Math.max(TOP + 60, (this.h - total) / 2);
    return [0, 1, 2].map((i) => [(this.w - cw) / 2, y0 + i * (ch + gap), cw, ch]);
  }

  private pickCardAt(x: number, y: number): void {
    const rects = this.cardRects();
    const i = rects.findIndex(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh);
    if (i >= 0) this.chooseCard(i);
  }

  /** Verbesserung wählen (auch für Tests) */
  chooseCard(i: number): void {
    const c = this.choosing?.[i];
    if (!c) return;
    this.cards[c.id] = this.c(c.id) + 1;
    if (c.id === 'repair') { for (const w of this.liveWards) w.hull = Math.min(w.max, w.hull + w.max * 0.25); this.hull = 100; }
    if (c.id === 'shield') this.shield = this.shieldMax;
    this.choosing = null;
    this.pendingSpawn = 1.2;
    sfx.chime();
  }

  private offerCards(): void {
    const pool = CARDS.filter((c) => this.c(c.id) < c.max && !(c.id === 'repair' && this.liveWards.every((w) => w.hull > w.max * 0.85) && this.hull > 80));
    const pick: Card[] = [];
    while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(this.r() * pool.length), 1)[0]);
    this.choosing = pick;
    this.joy = null;
    this.fireId = null;
  }

  /** Raketensalve: zwei je Werfer aus dem Lager; free = Raketenschwarm (ohne Nachladen abzuwarten, doppelte Salve) */
  private fireMissiles(free = false): boolean {
    // Raketen nur mit Raketenwerfern und solange das Lager reicht
    if ((!free && this.missileCd > 0) || this.outcome || this.choosing || !this.launchers.length || this.ammo < this.mDef.slots) return false;
    if (!free) this.missileCd = this.missileCdMax;
    this.missilesUsed++;
    setGoal(this.goals, 'nomissile', false);
    const targets = this.missileTargets();
    // schwere Raketen belegen zwei Lagerplätze
    const n = Math.min(Math.floor(this.ammo / this.mDef.slots), this.salvo * (free ? 2 : 1));
    this.ammo -= n * this.mDef.slots;
    const c = Math.cos(this.aimA), sn = Math.sin(this.aimA), spread = free ? 0.9 : 0.4;
    for (let k = 0; k < n; k++) {
      const a = this.aimA + (k - (n - 1) / 2) * spread / Math.max(1, n / 6);
      const gx = this.launchers[k % this.launchers.length];
      this.missiles.push({ x: this.px - sn * gx, y: this.py + c * gx, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, target: targets[k % Math.max(1, targets.length)] ?? null, life: this.mDef.split ? 0.5 : this.mDef.life, def: this.mDef, dmg: this.missileDmg, split: this.mDef.split ? 0.28 : undefined });
    }
    sfx.missile();
    return true;
  }

  /**
   * Ziele einer Salve nach Art der Rakete: Lenkrakete nimmt, was vor dem Bug liegt (bis an ihre Reichweite), schwere
   * Raketen große Ziele zuerst, Störraketen Ziele mit Schild zuerst, Schwarmraketen einfach die nächsten
   */
  private missileTargets(): Enemy[] {
    const d = (e: Enemy) => Math.hypot(e.x - this.px, e.y - this.py);
    const all = this.enemies.filter((e) => !(e.kind === 'boss' && e.shielded));
    const byDist = (a: Enemy, b: Enemy) => d(a) - d(b);
    const def = this.mDef, reach = def.v * def.life * 0.9;
    if (def.lock === 'aim') {
      const ahead = all.filter((e) => d(e) < reach && Math.abs(wrapA(Math.atan2(e.y - this.py, e.x - this.px) - this.aimA)) < 0.6).sort(byDist);
      return ahead.length ? ahead : all.sort(byDist);
    }
    if (def.lock === 'big') {
      const rank = { L: 0, M: 1, S: 2 } as const;
      return all.filter((e) => d(e) < reach).sort((a, b) => rank[ECLASS[a.kind]] - rank[ECLASS[b.kind]] || byDist(a, b));
    }
    if (def.lock === 'shield') {
      const shielded = (e: Enemy) => (e.sh > 1 || e.kind === 'schild' || e.kind === 'xs' ? 0 : 1);
      return all.filter((e) => d(e) < reach).sort((a, b) => shielded(a) - shielded(b) || byDist(a, b));
    }
    return all.sort(byDist);
  }

  /** Spezialfähigkeit des Schiffs: Ausweichen, Waffenüberladung oder Schildüberladung */
  private doSpecial(): void {
    if (this.dashCd > 0 || this.outcome || this.choosing) return;
    if (this.ship.special === 'salvo') {
      // Raketenschwarm: sofort eine doppelte Salve im weiten Fächer, auch während des Nachladens
      if (!this.fireMissiles(true)) { this.floats.add(this.px, this.py - 30, 'Keine Raketen', '#ff5c6c', 13); return; }
      this.dashCd = this.dashCdMax;
      this.floats.add(this.px, this.py - 30, 'Raketenschwarm', '#ffb547', 13);
      return;
    }
    if (this.ship.special === 'overdrive') {
      this.odT = 3;
      this.dashCd = this.dashCdMax;
      this.floats.add(this.px, this.py - 30, 'Waffenüberladung', '#ffb547', 13);
      sfx.boost();
      return;
    }
    if (this.ship.special === 'sprint') {
      this.sprintT = 2.5;
      this.dashCd = this.dashCdMax;
      sfx.boost();
      return;
    }
    if (this.ship.special === 'torpedo') {
      // schwerer, langsamer Torpedo geradeaus aus dem Bug, großer Flächenschaden
      const a = this.aimA, d0 = this.ship.size * 0.45;
      this.bullets.push({ x: this.px + Math.cos(a) * d0, y: this.py + Math.sin(a) * d0, vx: Math.cos(a) * 300 + this.pvx * 0.5, vy: Math.sin(a) * 300 + this.pvy * 0.5, dmg: this.baseDmg * 14, from: 'p', life: 2.4, color: '#ffd27a', w: 7, pierce: 0, splash: 70 });
      this.dashCd = this.dashCdMax;
      sfx.shot('thermal');
      return;
    }
    if (this.ship.special === 'escort') {
      this.escortT = 15;
      this.dashCd = this.dashCdMax;
      this.floats.add(this.px, this.py - 40, 'Begleitjäger gestartet', '#ffb070', 13);
      sfx.launch();
      return;
    }
    const j = this.joy;
    let dx = j ? j.kx : Math.cos(this.aimA), dy = j ? j.ky : Math.sin(this.aimA);
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    this.dashT = 0.3;
    this.dashCd = this.dashCdMax;
    this.dashVx = dx * this.speed * 3.2;
    this.dashVy = dy * this.speed * 3.2;
    for (let k = 0; k < 10; k++) this.fx.add({ x: this.px, y: this.py, vx: -dx * 120 + (Math.random() - 0.5) * 80, vy: -dy * 120 + (Math.random() - 0.5) * 80, color: '#9ffff0', size: 1.5, max: 0.35 });
    sfx.thrust();
  }

  private apBrk = 0;
  private readonly seedDir = 1;
  /** Nur für Tests: einfacher Autopilot – fängt die Gegner ab, die dem Frachter am nächsten sind, zielt mit Vorhalt */
  autopilot(): void {
    if (this.choosing) { this.chooseCard(0); return; }
    const near = this.pickups.find((p) => Math.hypot(p.x - this.px, p.y - this.py) < 160);
    let best: Enemy | null = null, bd = 1e9;
    const tow = this.crates.find((c) => c.tow);
    for (const e of this.enemies) {
      if (e.parent ? false : e.kind === 'boss' && e.shielded) continue;
      // Bedrohung: Nähe zum Schutzziel, der Jäger selbst zählt etwas weniger; Piratenfrachter zuerst, Brutöffnungen vor dem Kern
      const dp = Math.hypot(e.x - this.px, e.y - this.py);
      let d = Math.min(this.wardDist(e.x, e.y), dp + 120);
      // Piratenfrachter zuerst – außer, jemand sitzt dir im Nacken
      const pressed = this.enemies.some((q) => q.kind !== 'cargo' && !q.parent && Math.hypot(q.x - this.px, q.y - this.py) < 250);
      if (e.kind === 'cargo' && !pressed) d = dp < 900 ? dp * 0.3 : dp * 0.6;
      if (e.parent?.nest) d = dp * 0.5;
      if (e.nest && !e.shielded) d = dp * 0.4;
      // beim Schleppen nur, was nah ist
      if (tow && dp > 300) d += 600;
      if (d < bd) { bd = d; best = e; }
    }
    let tx = this.fx1, ty = this.fy1 - 140;
    if (this.mission === 'nest' || this.mission === 'ueberfall') { tx = this.fX; ty = this.fY + 300; }
    if (this.mission === 'bergung') {
      // schleppen: zum Bergungsschiff; sonst zum nächsten Container, wenn nichts in der Nähe angreift
      const free = this.crates.filter((c) => !c.done && !c.tow).sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py))[0];
      const calm = !best || Math.hypot(best.x - this.px, best.y - this.py) > 420;
      if (tow) { tx = this.fx1; ty = this.fy1 - 60; if (calm || Math.hypot(tx - this.px, ty - this.py) < 500) best = null; }
      else if (free && calm) { tx = free.x; ty = free.y; best = null; }
    }
    if (near && !best) { tx = near.x; ty = near.y; }
    if (best) {
      const d = Math.hypot(best.x - this.px, best.y - this.py), t = this.wpn.beam ? 0 : d / this.wpn.speed;
      tx = best.x + best.vx * t; ty = best.y + best.vy * t;
    }
    const dx = tx - this.px, dy = ty - this.py, d = Math.hypot(dx, dy) || 1;
    const off = Math.abs(wrapA(Math.atan2(dy, dx) - this.aimA));
    // Anflug, nah dran abdrehen und neu anfliegen (Boss-Teile schon früher), weit weg volle Fahrt
    this.apBrk -= 1 / 60;
    // große Ziele (Boss) aus kurzer Entfernung beharken statt ständig abzudrehen
    if (best && d < (best.r >= 30 ? best.r + 45 : 70 + best.r * 2) && this.apBrk <= -0.6) this.apBrk = 0.6;
    if (this.apBrk > 0) {
      const a = Math.atan2(dy, dx) + Math.PI * 0.6 * this.seedDir;
      this.joy = { id: 99, ox: 0, oy: 0, kx: Math.cos(a), ky: Math.sin(a) };
    } else {
      const k = best ? (d < 260 ? 0.3 : off > 1.2 ? 0.5 : 1) : Math.min(1, d / 80);
      this.joy = { id: 99, ox: 0, oy: 0, kx: (dx / d) * k, ky: (dy / d) * k };
    }
    // Laserstrahl in Vorbereitung, der den Jäger trifft: quer dazu ausweichen
    for (const e of this.enemies) {
      if (!e.beamT || e.beamT <= LASER_FIRE) continue;
      const c = Math.cos(e.beamA!), sn = Math.sin(e.beamA!);
      const along = (this.px - e.x) * c + (this.py - e.y) * sn, across = -(this.px - e.x) * sn + (this.py - e.y) * c;
      if (along > 0 && along < LASER_LEN && Math.abs(across) < 30) {
        const sgn = across >= 0 ? 1 : -1;
        this.joy = { id: 99, ox: 0, oy: 0, kx: -sn * sgn, ky: c * sgn };
        if (e.beamT < LASER_FIRE + 0.25) this.doSpecial();
      }
    }
    this.fireId = best && off < 0.15 && d < this.reach - 15 ? 99 : null;
    if (this.enemies.filter((e) => Math.hypot(e.x - this.px, e.y - this.py) < 450).length >= 3) this.fireMissiles();
    if (this.eMissiles.some((m) => Math.hypot(m.x - this.px, m.y - this.py) < 60)) this.doSpecial();
    // Ausschlag als Schub verstehen: über den inneren Ring (nur drehen) hinaus abbilden
    if (this.joy) {
      const m = Math.hypot(this.joy.kx, this.joy.ky);
      if (m > 0.01) { const f = Math.min(1, TURN_ONLY + m * (1 - TURN_ONLY)) / m; this.joy.kx *= f; this.joy.ky *= f; }
    }
  }

  // ---------- Wellen ----------

  /** Gesamtstärke einer Welle (Punkte, die auf Gegner verteilt werden) */
  private waveBudget(i: number): number {
    const swarm = this.mutator?.id === 'swarm' ? 1.45 : 1;
    // mit einem starken Schiff schicken die Gegner mehr Schiffe
    // Einsätze: Konvoi mehr (die Gegner teilen sich auf), Nest weniger (es brütet selbst), Bergung und Flucht wachsen langsamer
    const ms = { geleit: 1, konvoi: 1.45, station: 1.4, flucht: 1.1, bergung: 0.85, nest: 0.4, ueberfall: 0.8 }[this.mission];
    const ii = this.mission === 'bergung' || this.mission === 'nest' || this.mission === 'ueberfall' ? Math.min(i, 3) * 0.8 : i;
    return (5 + ii * 3 + this.level * 1.6) * swarm * this.foeCount * ms * (this.mode === 'endless' ? 1 + i * 0.08 : 1);
  }

  /**
   * Anteil der Welle, der als eigener Schwarm kleiner Schiffe (Xenon N bzw. Piratenjäger) kommt: erst ab einem
   * stärkeren Schiff (dort wird die übrige Mischung schwerer), wächst langsam mit der Stärke, höchstens 55 %
   */
  private swarmShare(): number {
    // Kha'ak: Späher kommen immer in Clustern, auch gegen schwache Schiffe
    if (this.side === 'khaak') return clamp(0.3 + 0.05 * Math.log2(Math.max(1, this.power)), 0.3, 0.55);
    return this.power < 2.5 ? 0 : clamp(0.35 + 0.05 * Math.log2(this.power), 0.35, 0.55);
  }

  /** kleinster Gegner der Seite (Schwärme, Begleitschutz, Auffüllen) */
  private get smallKind(): EKind { return this.side === 'pirate' ? 'jaeger' : this.side === 'xenon' ? 'n' : 'ks'; }

  /** Kha'ak: zusätzliche Jäger für die Jäger-Cluster der Welle i (ein Teil des Schwarm-Anteils, ab Stärke 2,5) */
  jaegerSwarm(i: number): number {
    if (this.side !== 'khaak' || this.power < 2.5) return 0;
    return Math.min(21, Math.round((this.waveBudget(i) * this.swarmShare() * 0.7) / SPEC.kj.cost));
  }

  /** Schiffe in allen Schwärmen der Welle i zusammen (0 = keine), höchstens 40 */
  swarmSize(i: number): number {
    const share = this.swarmShare();
    if (!share) return 0;
    const small = this.smallKind;
    // Kha'ak ab Stärke 2,5: die Hälfte des Anteils geht an Jäger-Cluster (jaegerSwarm)
    const part = this.side === 'khaak' && this.power >= 2.5 ? 0.5 : 1;
    return clamp(Math.round((this.waveBudget(i) * share * part) / SPEC[small].cost), this.side === 'khaak' ? 4 : 6, 40);
  }

  /**
   * Schwärme der Welle i, die gleichzeitig aus verschiedenen Richtungen angreifen: je mindestens sechs Schiffe,
   * ab Stärke 4 bis zu zwei, ab Stärke 10 bis zu drei Schwärme
   */
  swarms(i: number): number[] {
    const total = this.swarmSize(i);
    if (!total) return [];
    const max = this.power >= 10 ? 3 : this.power >= 4 ? 2 : 1;
    if (this.side === 'khaak') return khaakClusters(total, max + 1, this.power >= 4);
    const n = clamp(Math.floor(total / 6), 1, max);
    return Array.from({ length: n }, (_, k) => Math.floor(total / n) + (k < total % n ? 1 : 0));
  }

  private waveKinds(i: number): EKind[] {
    let budget = this.waveBudget(i) * (1 - this.swarmShare());
    const pool: EKind[] = this.side === 'pirate'
      ? (i === 0 ? ['jaeger'] : i === 1 ? ['jaeger', 'jaeger', 'rakete', 'schild'] : ['jaeger', 'jaeger', 'rakete', 'kanone', 'schild'])
      : this.side === 'xenon'
        ? (i === 0 ? ['n'] : i === 1 ? ['n', 'n', 'm', 'xs'] : ['n', 'n', 'm', 'xs'])
        : (i === 0 ? ['kj'] : i === 1 ? ['kj', 'kj', 'ka'] : ['kj', 'kj', 'ka', 'kk']);
    // starke Schiffe: schwerere Mischung (mehr Kanonen-/Raketenboote, Xenon M bzw. Abfangjäger/Korvetten), ab der ersten Welle
    const heavy = this.side === 'pirate' ? (['kanone', 'rakete'] as EKind[]) : this.side === 'xenon' ? (['m'] as EKind[]) : (['ka', 'kk'] as EKind[]);
    // Kha'ak: dazu je Stufe zwei Jäger mehr – sie kommen dann in Clustern zu 9 oder 4 (mehrere gleichzeitig)
    for (let h = 0; h < Math.min(4, Math.floor((this.power - 1) / 2.5)); h++) pool.push(...heavy, ...(this.side === 'khaak' ? ['kj', 'kj'] as EKind[] : []));
    const out: EKind[] = [];
    let shields = 0;
    while (budget > 0.9) {
      let k = pool[Math.floor(this.r() * pool.length)];
      if ((k === 'schild' || k === 'xs') && (shields >= 1 + Math.floor(i / 4) || out.length < 2)) k = this.smallKind;
      if (k === 'schild' || k === 'xs') shields++;
      out.push(k);
      budget -= SPEC[k].cost;
    }
    // nicht zu viele auf einmal: statt immer mehr kleiner Jäger lieber größere Schiffe
    const small = this.smallKind;
    while (out.length > 34) {
      const a = out.indexOf(small), b = out.indexOf(small, a + 1);
      if (a < 0 || b < 0) break;
      out.splice(b, 1);
      out[a] = heavy[Math.floor(this.r() * heavy.length)];
    }
    return out;
  }

  private spawnWave(): void {
    this.wave++;
    this.waveT = 0;
    this.reinforce = [];
    this.eliteLeft = this.eliteRest = 0;
    // Endlos: Karte nach oben verschieben, wenn der Frachter oben ankommt
    if (this.mode === 'endless' && this.fY - LEG < MAP_PAD) this.shiftWorld(LEG * 3);
    // nächster Streckenabschnitt
    if (this.moving) this.fGoal = Math.max(MAP_PAD, this.fY - LEG);
    this.banner = 2.4;
    this.section = this.mode === 'endless' ? this.sectionPlan[this.wave % this.sectionPlan.length] : this.sectionPlan[this.wave] ?? 'none';
    // im Wrackfeld, am Nest und beim Überfall keine Felsen oder Minen (eigene Hindernisse genug)
    if (this.mission === 'bergung' || this.mission === 'nest' || this.mission === 'ueberfall') this.section = 'none';
    if (this.mutator?.id === 'mines') this.section = 'mines';
    // Einsatzbeginn: Nest bzw. Piratenkonvoi erscheinen mit der ersten Welle
    if (this.wave === 0 && this.mission === 'nest') this.spawnNest();
    if (this.wave === 0 && this.mission === 'ueberfall') this.spawnConvoy();
    if (this.wave === 0 && (this.mission === 'bergung' || this.mission === 'flucht')) this.spawnMissionPlats();
    if (this.section === 'rocks') this.spawnRocks();
    if (this.section === 'mines') this.spawnMines();
    const boss = this.isBossWave(this.wave);
    if (boss) {
      this.spawnBoss();
      this.bannerText = 'BOSS';
      this.bannerSub = this.side === 'pirate' ? 'Piratenfregatte – erst die Geschütztürme' : this.side === 'xenon' ? 'Xenon-K-Segment – erst Laser- und Plasmatürme' : 'Kha’ak-Brutschiff – erst Kyon-Türme und Brutkammern';
      this.spawnGroup(this.side === 'pirate' ? ['jaeger', 'jaeger'] : this.side === 'xenon' ? ['n', 'n', 'n'] : ['ks', 'ks', 'ks', 'ks', 'ks'], 1 + Math.floor(this.r() * 4), this.side === 'khaak');
    } else {
      // Gegner in zwei bis drei Gruppen aus verschiedenen Richtungen; die späteren kommen einige Sekunden danach
      let kinds = this.waveKinds(this.wave);
      // Kha'ak-Jäger fliegen in Clustern zu 9 oder 4 (größer nicht); je bis zu drei kommen gleichzeitig aus
      // verschiedenen Richtungen, die nächsten drei gut zehn Sekunden später
      const jCl = this.side === 'khaak' ? jaegerClusters(kinds.filter((k) => k === 'kj').length + this.jaegerSwarm(this.wave)) : [];
      if (jCl.length) {
        let drop = Math.max(0, jCl.reduce((a, b) => a + b, 0) - this.jaegerSwarm(this.wave));
        kinds = kinds.filter((k) => k !== 'kj' || drop-- <= 0);
        const jFirst = Math.floor(this.r() * 5);
        for (const [k, size] of jCl.entries()) this.reinforce.push({ t: 1 + Math.floor(k / 3) * 12 + (k % 3) * 0.5, kinds: new Array<EKind>(size).fill('kj'), from: (jFirst + (k % 3) * 2) % 5, swarm: true });
      }
      // Elite-Gegner: verteilt auf die Gruppen der Welle (Schwärme und Cluster bleiben gewöhnlich)
      // (bei den Kha'ak auch Jäger in ihren Clustern)
      this.eliteRest = kinds.filter((k) => ELITE_KINDS.has(k)).length + jCl.reduce((a, b) => a + b, 0);
      this.eliteLeft = Math.min(this.eliteRest, this.eliteCount(this.wave));
      const eliteN = this.eliteLeft;
      // starke Schiffe: mehr Gruppen (jede mit eigenen Anflügen), die von mehr Seiten kommen
      // Konvoi und Station: mindestens drei Gruppen aus verschiedenen Richtungen
      const groups = Math.min(6, Math.max(this.mission === 'konvoi' || this.mission === 'station' ? Math.min(3, kinds.length) : 1, (kinds.length >= 7 && this.wave >= 1 ? 3 : kinds.length >= 3 ? 2 : 1) + Math.max(0, Math.floor(Math.sqrt(this.power)) - 1)));
      const per = Math.ceil(kinds.length / groups);
      const first = Math.floor(this.r() * 5);
      for (let g = 0; g < groups; g++) {
        const part = kinds.slice(g * per, (g + 1) * per);
        if (!kinds.length) break;
        if (!part.length) continue;
        const from = (first + g * 2) % 5;
        if (g === 0) this.spawnGroup(part, from);
        // Konvoi: alle Gruppen fast gleichzeitig, jede auf einen anderen Frachter – man kann nicht überall sein
        else this.reinforce.push({ t: this.mission === 'konvoi' ? 1.5 + g * 1.2 : 6 + g * (groups > 3 ? 3.5 : 5) + this.r() * 3, kinds: part, from });
      }
      // Großziele mitten in der Welle (ab Fregatten-Stärke): eine kleinere Fregatte bzw. ein K-Segment mit Türmen
      const bigs = this.power >= 10 ? (this.wave >= 1 ? 2 : 1) : this.power >= 3.5 && this.wave >= 1 ? 1 : 0;
      for (let b = 0; b < bigs; b++) this.reinforce.push({ t: 12 + b * 14 + this.r() * 4, kinds: ['boss'], from: Math.floor(this.r() * 5) });
      // Schwärme kleiner Schiffe: kommen fast gleichzeitig (innerhalb von gut einer Sekunde) aus verschiedenen
      // Richtungen, kurz nach der ersten Gruppe – so steigt der Druck, statt dass sie nacheinander eintrudeln
      const swarms = this.swarms(this.wave), sw = swarms.reduce((a, b) => a + b, 0), swT = 3 + this.r() * 2;
      for (const [k, size] of swarms.entries()) this.reinforce.push({ t: swT + k * 0.6, kinds: new Array<EKind>(size).fill(this.smallKind), from: (first + 1 + k * 2) % 5, swarm: true });
      this.bannerText = this.mode === 'endless' || !this.counted ? `WELLE ${this.wave + 1}` : `WELLE ${this.wave + 1} VON ${this.nWaves}`;
      if (this.wave === 0 && this.mission === 'ueberfall') this.bannerText = 'PIRATENKONVOI';
      if (this.wave === 0 && this.mission === 'nest') this.bannerText = this.side === 'khaak' ? 'KHA’AK-NEST' : 'XENON-NEST';
      this.bannerSub = [...new Set(kinds.map((k) => SPEC[k].name))].join(' · ') + (jCl.length ? ` · Jäger-Cluster ${jCl.join(' + ')}` : '') + (sw ? this.side === 'khaak' ? ` · Späher-Cluster ${swarms.join(' + ')}` : ` · ${swarms.length > 1 ? `${swarms.length} Schwärme` : 'Schwarm'} aus ${sw} ${this.side === 'pirate' ? 'Jägern' : 'Xenon N'}` : '') + (this.section === 'rocks' ? ' · Asteroidenfeld' : this.section === 'mines' ? ' · Minenfeld' : '') + (eliteN ? ` · ${eliteN} Elite` : '');
    }
    if (this.wave > 0) { if (this.isBossWave(this.wave)) sfx.boss(); else sfx.alarm(); }
    // Nachschub vom Frachter nach jeder überstandenen Welle: ein Viertel des Raketenlagers
    if (this.wave > 0 && this.launchers.length && this.ammo < this.ammoMax) {
      const add = Math.min(this.ammoMax - this.ammo, Math.max(2, Math.round(this.ammoMax * 0.25)));
      this.ammo += add;
      this.floats.add(this.px, this.py - 56, `Nachschub: +${add} Raketen`, '#ffd27a', 13);
    }
  }

  /**
   * Anflugpunkt weit draußen, von der Route des Frachters aus gesehen: 0 vorn, 1 vorn links, 2 vorn rechts,
   * 3 links, 4 rechts (selten auch von hinten)
   */
  private farPoint(from: number): [number, number] {
    const dirs = [-Math.PI / 2, -Math.PI * 0.78, -Math.PI * 0.22, Math.PI, 0];
    let a = dirs[from % dirs.length] + (this.r() - 0.5) * 0.4;
    if (this.r() < 0.12) a = Math.PI / 2 + (this.r() - 0.5) * 0.8;
    // Station und Flucht: aus allen Richtungen gleich oft
    if (this.mission === 'station' || this.mission === 'flucht') a = (from / 5) * Math.PI * 2 + (this.r() - 0.5) * 0.9;
    // Nest: Verteidiger kommen aus dem Nest
    if (this.mission === 'nest') return [this.fX + (this.r() - 0.5) * 420, this.fY + 140 + this.r() * 160];
    // Überfall: Verstärkung aus dem Sprungtor oder von der Seite des Konvois
    if (this.mission === 'ueberfall') {
      if (from % 2 === 0) return [this.gateX + (this.r() - 0.5) * 260, this.gateCy + 90];
      const side = from % 4 === 1 ? -1 : 1;
      return [clamp(this.fX + side * (900 + this.r() * 200), 80, this.WW - 80), clamp(this.fY - 300 + (this.r() - 0.5) * 500, 80, this.WH - 80)];
    }
    const d = 1400 + this.r() * 300;
    return [clamp(this.fX + Math.cos(a) * d, 80, this.WW - 80), clamp(this.fY + Math.sin(a) * d, 80, this.WH - 80)];
  }

  /** Elite-Gegner je Welle: Stufe 1 ab der zweiten Welle einer, später und auf höheren Stufen mehr */
  eliteCount(wave: number): number {
    if (this.level <= 1 && wave === 0) return 0;
    return Math.min(6, Math.floor((this.level - 1) / 2) + (wave >= 1 ? 1 : 0) + (wave >= 3 ? 1 : 0) + (this.mode === 'endless' ? Math.floor(wave / 4) : 0));
  }

  /** Gegner zum Elite-Gegner machen; Kommandant nur in Gruppen mit Verbündeten */
  makeElite(e: Enemy, type?: Elite, groupSize = 3): void {
    let t = type ?? ELITE_IDS[Math.floor(this.r() * ELITE_IDS.length)];
    if (t === 'kommandant' && groupSize < 3 && !type) t = 'gepanzert';
    e.elite = t;
    if (t === 'gepanzert') e.sh = e.shMax = Math.max(e.shMax * 2, e.max * 0.6);
    else e.hp = e.max = e.max * 1.25;
  }

  private makeEnemy(kind: EKind, x: number, y: number): Enemy {
    const s = SPEC[kind];
    const { hp, sh } = enemyStats(kind, this.level, { extra: this.mode === 'endless' ? 1 + this.wave * 0.06 : 1, tune: this.tune });
    return { kind, x, y, vx: 0, vy: 0, hp, max: hp, sh, shMax: sh, shT: 9, shFlash: 0, cd: 1 + this.r() * 1.5, r: s.r, target: 'f', orbit: this.r() * Math.PI * 2, flash: 0, dir: this.r() < 0.5 ? 1 : -1, shielded: false, ang: -Math.PI / 2, inside: true };
  }

  private spawnGroup(list: EKind[], from: number, swarm = false): void {
    const [x0, y0] = this.farPoint(from);
    // Kha'ak-Schwärme fliegen als geschlossener Cluster
    if (swarm && this.side === 'khaak') { this.spawnCluster(list.length, x0, y0, list[0]); return; }
    const grp = ++this.grpN;
    // Konvoi: jede Gruppe sucht sich einen Frachter aus
    const live = this.liveWards;
    const wd = this.mission === 'konvoi' && live.length ? live[(this.grpN + Math.floor(this.r() * 2)) % live.length] : undefined;
    // Schwarm: lockere Wolke statt Ring, je größer, desto weiter gestreut
    const spread = swarm ? 40 + Math.sqrt(list.length) * 22 : 50;
    for (const [i, kind] of list.entries()) {
      const a = swarm ? this.r() * Math.PI * 2 : (i / list.length) * Math.PI * 2, rr = swarm ? spread * Math.sqrt(this.r()) : spread;
      const e = this.makeEnemy(kind, x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr);
      e.grp = grp;
      e.wd = wd;
      if (!swarm && this.eliteLeft > 0 && ELITE_KINDS.has(kind)) {
        if (this.r() < this.eliteLeft / Math.max(1, this.eliteRest)) { this.makeElite(e, undefined, list.length); this.eliteLeft--; }
        this.eliteRest--;
      }
      if (swarm) e.swarm = true;
      // ohne Schutzziel (Überfall, Nest) geht es gleich auf dich
      if (!this.wards.length) e.target = 'p';
      e.ang = Math.atan2(this.fY - e.y, this.fX - e.x);
      this.enemies.push(e);
    }
  }

  /**
   * Kha'ak-Cluster aus n Schiffen (Späher 4, 9 oder 25, Jäger 4 oder 9): geschlossenes Dreieck mit der Spitze in
   * Flugrichtung, das als Ganzes auf das Ziel zufliegt; erst kurz davor (oder beim ersten Treffer) schwärmen alle aus
   */
  spawnCluster(n: number, x0: number, y0: number, kind: EKind = 'ks'): void {
    const id = ++this.grpN;
    const tA = Math.atan2(this.fY - y0, this.fX - x0);
    const lay = clusterLayout(n, CLUSTER_GAP[kind] ?? SPEC[kind].r * 2);
    this.clusters.set(id, { x: x0, y: y0, vx: 0, vy: 0, ang: tA, kind, mass: lay.mass });
    const c = Math.cos(tA + Math.PI / 2), sn = Math.sin(tA + Math.PI / 2);
    for (const p of lay.ships) {
      const e = this.makeEnemy(kind, x0 + p.x * c - p.y * sn, y0 + p.x * sn + p.y * c);
      e.cl = id; e.grp = id; e.swarm = true;
      if (kind !== 'ks' && this.eliteLeft > 0) {
        if (this.r() < this.eliteLeft / Math.max(1, this.eliteRest)) { this.makeElite(e, undefined, n); this.eliteLeft--; }
        this.eliteRest--;
      }
      if (!this.wards.length) e.target = 'p';
      e.slotX = p.x; e.slotY = p.y; e.slotFlip = p.flip;
      e.ang = p.flip ? wrapA(tA + Math.PI) : tA;
      this.enemies.push(e);
    }
  }

  /** Brut nur, solange nicht schon viele Späher unterwegs sind (sonst fluten Brutkammern das Feld) */
  private broodRoom(): boolean {
    return this.enemies.length < 56 && this.enemies.filter((q) => q.kind === 'ks').length < 8;
  }

  /** Cluster bricht auf: alle Späher stieben nach außen auseinander und greifen einzeln an */
  private breakCluster(id: number): void {
    const c = this.clusters.get(id);
    if (!c) return;
    this.clusters.delete(id);
    // die Kristallmasse zwischen den Schiffen zerspringt
    const ca = Math.cos(c.ang + Math.PI / 2), sa = Math.sin(c.ang + Math.PI / 2);
    for (const tri of c.mass) {
      const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const wx = c.x + mx * ca - my * sa, wy = c.y + mx * sa + my * ca;
      this.fx.burst(wx, wy, '#6b3fa0', 3, 140, 1.4, 'chunk', 0.7);
      this.fx.burst(wx, wy, '#d9a6ff', 2, 180, 0.8, 'spark', 0.3);
    }
    if (c.mass.length) sfx.crack();
    for (const e of this.enemies) {
      if (e.cl !== id) continue;
      e.cl = undefined;
      e.slotFlip = undefined;
      const a = Math.hypot(e.slotX ?? 0, e.slotY ?? 0) > 1 ? Math.atan2(e.y - c.y, e.x - c.x) : c.ang;
      e.vx = c.vx + Math.cos(a) * 260; e.vy = c.vy + Math.sin(a) * 260;
      e.ang = a;
      e.brk = 0.5 + this.r() * 0.4; e.brkA = a;
      e.target = Math.hypot(this.px - e.x, this.py - e.y) < AGGRO * 1.3 ? 'p' : 'f';
      this.fx.add({ x: e.x, y: e.y, color: '#c77dff', size: 2, kind: 'ring', max: 0.3 });
    }
    sfx.phase(this.panAt(c.x));
  }

  /** Cluster bewegen: Mitte fliegt aufs Ziel (Jäger, wenn nah, sonst Frachter); kurz davor bricht er auf */
  private updateClusters(dt: number): void {
    for (const [id, c] of this.clusters) {
      if (!this.enemies.some((e) => e.cl === id)) { this.clusters.delete(id); continue; }
      const toP = Math.hypot(this.px - c.x, this.py - c.y);
      const cw = this.wardOf({ x: c.x, y: c.y });
      const onP = toP < AGGRO * 1.5 || !cw;
      const tx = onP || !cw ? this.px : this.wx(cw), ty = onP || !cw ? this.py : this.wy(cw);
      const d = Math.hypot(tx - c.x, ty - c.y);
      if (d < 380 && this.outcome !== 'player') { this.breakCluster(id); continue; }
      c.ang = turnTo(c.ang, Math.atan2(ty - c.y, tx - c.x), 1.2 * dt);
      const sp = SPEC[c.kind].speed * 0.62;
      c.vx += (Math.cos(c.ang) * sp - c.vx) * Math.min(1, dt * 2);
      c.vy += (Math.sin(c.ang) * sp - c.vy) * Math.min(1, dt * 2);
      c.x = clamp(c.x + c.vx * dt, 60, this.WW - 60);
      c.y = clamp(c.y + c.vy * dt, 60, this.WH - 60);
    }
  }

  /** Boss weit voraus auf der Route – oder als Großziel (mini) mitten in einer Welle aus einer Anflugrichtung */
  private spawnBoss(mini = false, from = 0): void {
    const [x, y] = mini ? this.farPoint(from) : [this.fX + (this.r() - 0.5) * 400, Math.max(120, this.fY - 1100)];
    const b = this.makeEnemy('boss', x, y);
    b.ang = mini ? Math.atan2(this.fY - y, this.fX - x) : Math.PI / 2;
    const bs = enemyStats('boss', this.level, { mini, extra: this.mode === 'endless' ? 1 + this.wave * 0.05 : 1, tune: this.tune });
    b.hp = b.max = bs.hp;
    b.sh = b.shMax = bs.sh;
    b.r = 34;
    b.mini = mini;
    this.enemies.push(b);
    const all: [number, number, ('laser' | 'plasma' | 'brut')?][] = this.side === 'pirate'
      // auf den drei Sockeln im Bild der Fregatte (Flügelenden links/rechts, Heckmitte); ab Stufe 4 ein vierter auf dem Bug
      ? [[-53, 4], [54, 4], [0, 30], ...(this.level >= 4 ? [[0, -40] as [number, number]] : [])]
      : this.side === 'xenon'
        // auf den vier Sockeln des K-Segments: Laser auf den Flügeln, Plasma auf Bug und Heck
        ? [[-61, 17, 'laser'], [61, 17, 'laser'], [0, -46, 'plasma'], [0, 39, 'plasma']]
        // Kha'ak-Brutschiff: Kyon-Türme (Strahl wie der Xenon-Laser) auf den runden Sockeln links und rechts,
        // Brutkästen auf den beiden Brutkammern vorn
        : [[-47, -2, 'laser'], [47, -2, 'laser'], [-25, -27, 'brut'], [25, -27, 'brut']];
    // Großziel: nur die beiden Flügeltürme; Kha'ak-Zerstörer: Kyon-Türme auf den Sockelpaaren an Bug und Heck
    const offs = mini ? (this.side === 'khaak' ? [[0, -37, 'laser'], [0, 37, 'laser']] as typeof all : all.slice(0, 2)) : all;
    for (const [ox, oy, weapon] of offs) {
      const t = this.makeEnemy('turret', b.x + ox, b.y + oy);
      t.parent = b; t.ox = ox; t.oy = oy; t.weapon = weapon;
      // Xenon-Türme feuern versetzt; ab Stufe 4 schneller (statt eines fünften Turms)
      if (weapon) t.cd = weapon === 'brut' ? 4 + this.r() * 3 : 1.5 + this.r() * 2;
      this.enemies.push(t);
    }
    if (!mini) this.bossT = 0;
  }

  /** Punkt im Abschnitt um die Route voraus, nicht direkt auf Frachter oder Jäger */
  private fieldPoint(): [number, number] {
    let x = 0, y = 0;
    for (let k = 0; k < 30; k++) {
      x = clamp(this.fX + (this.r() - 0.5) * 1500, 60, this.WW - 60);
      y = clamp(this.fY - LEG * 1.2 + this.r() * LEG * 1.4, 60, this.WH - 60);
      if (Math.hypot(x - this.fX, y - this.fY) > (this.mission === 'station' ? 280 : 200) && Math.hypot(x - this.px, y - this.py) > 140) break;
    }
    return [x, y];
  }

  private spawnRocks(): void {
    const n = 16 + Math.floor(this.r() * 6);
    for (let i = 0; i < n; i++) {
      const r = 16 + this.r() * 26;
      const pts: number[] = [];
      for (let k = 0; k < 9; k++) pts.push(0.75 + this.r() * 0.35);
      const [x, y] = this.fieldPoint();
      this.rocks.push({ x, y, r, vx: (this.r() - 0.5) * 16, vy: (this.r() - 0.5) * 16, rot: this.r() * 6, vr: (this.r() - 0.5) * 0.6, pts, v: Math.floor(r * 7) % 4 });
    }
  }

  private spawnMines(): void {
    const n = 14 + Math.floor(this.r() * 6);
    for (let i = 0; i < n; i++) {
      const [x, y] = this.fieldPoint();
      this.mines.push({ x, y, vx: (this.r() - 0.5) * 10, vy: (this.r() - 0.5) * 10, armed: -1, hp: 6 });
    }
  }

  // ---------- Einsätze: Bergung, Nest, Überfall ----------

  /** Wrackfeld mit Containern zwischen den Wracks (Bergung) */
  private spawnWreckField(): void {
    const cx = this.fX, cy = 1050;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.r() * 0.6, d = 180 + this.r() * 620;
      this.wrecks.push({ x: clamp(cx + Math.cos(a) * d * 1.3, 140, this.WW - 140), y: clamp(cy + Math.sin(a) * d * 0.75, 160, this.WH - 900), rot: this.r() * Math.PI * 2, size: 90 + this.r() * 90 });
    }
    for (let i = 0; i < CRATES; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 20; k++) {
        x = cx + (this.r() - 0.5) * 1700;
        y = cy + (this.r() - 0.5) * 900;
        if (this.wrecks.every((w) => Math.hypot(w.x - x, w.y - y) > w.size * 0.45 + 20) && this.crates.every((c) => Math.hypot(c.x - x, c.y - y) > 120)) break;
      }
      this.crates.push({ x, y, vx: (this.r() - 0.5) * 8, vy: (this.r() - 0.5) * 8, rot: this.r() * 6, hp: 60, tow: false, done: false });
    }
  }

  /** Container: treiben langsam; der Traktorstrahl koppelt nahe Container an, geschleppt hängen sie am Seil */
  private updateCrates(dt: number): void {
    let tow = this.crates.find((c) => c.tow);
    if (!tow && this.outcome !== 'player') {
      const near = this.crates.find((c) => !c.done && Math.hypot(c.x - this.px, c.y - this.py) < TOW_GRAB + this.ship.r);
      if (near) { near.tow = true; tow = near; sfx.pickup(); this.floats.add(this.px, this.py - 30, 'Traktorstrahl: Container angekoppelt', '#9ffff0', 13); }
    }
    for (const c of this.crates) {
      if (c.done) continue;
      if (c.tow) {
        // Seil: zieht den Container hinter dem Jäger her, wenn es gespannt ist
        const dx = this.px - c.x, dy = this.py - c.y, d = Math.hypot(dx, dy) || 1, len = TOW_LEN + this.ship.r;
        if (d > len) { const k = (d - len) / d; c.x += dx * k; c.y += dy * k; c.vx = this.pvx * 0.9; c.vy = this.pvy * 0.9; }
        c.vx *= Math.exp(-1.5 * dt); c.vy *= Math.exp(-1.5 * dt);
      }
      c.x = clamp(c.x + c.vx * dt, 20, this.WW - 20);
      c.y = clamp(c.y + c.vy * dt, 20, this.WH - 20);
      c.rot += dt * (c.tow ? 1.2 : 0.2);
      // abgeliefert: Container in der Abladezone (oder der Jäger fliegt dicht ans Schiff und übergibt ihn)
      const w = this.wards[0];
      if (c.tow && w && !w.dead && (Math.hypot(this.wx(w) - c.x, this.wy(w) - c.y) < TOW_DROP || Math.hypot(this.wx(w) - this.px, this.wy(w) - this.py) < 80)) {
        c.tow = false; c.done = true; this.crateDone++;
        this.gain(400, c.x, c.y, 'Container geborgen');
        this.floats.add(this.wx(w), this.wy(w) - 70, `Container geborgen (${this.crateDone}/${CRATES})`, '#6be38f', 15);
        this.fx.add({ x: c.x, y: c.y, color: '#6be38f', size: 8, kind: 'ring', max: 0.5 });
        sfx.chime();
      }
    }
  }

  private hitCrate(c: Crate, dmg: number): void {
    c.hp -= dmg;
    this.fx.burst(c.x, c.y, '#ffd27a', 3, 100, 1.2, 'spark', 0.2);
    if (c.hp > 0) return;
    c.done = true; c.tow = false; this.crateLost++;
    this.explode(c.x, c.y, '#ffb547', 0.9);
    this.floats.add(c.x, c.y - 20, 'Container verloren', '#ff9aa4', 14);
  }

  /** Langsamer, solange ein Container am Seil hängt */
  private get towing(): boolean { return this.mission === 'bergung' && this.crates.some((c) => c.tow); }

  /** Nest: großer Kern, rundum Brutöffnungen (spucken Drohnen) und zwei Strahltürme; Kern geschützt, solange die Teile stehen */
  private spawnNest(): void {
    const core = this.makeEnemy('boss', this.fX, this.fY);
    const st = enemyStats('boss', this.level, { extra: 2.4, tune: this.tune });
    core.hp = core.max = st.hp;
    core.sh = core.shMax = st.sh;
    const lay = NEST_LAYOUT[this.side === 'khaak' ? 'khaak' : 'xenon'];
    core.r = this.side === 'khaak' ? 36 : 52;
    core.nest = true;
    // das Nest steht fest, Bild wie geliefert: Kern oben, das untere Brutmodul zeigt zu dir
    core.ang = -Math.PI / 2;
    core.target = 'p';
    this.enemies.push(core);
    const parts: [number, number, 'brut' | 'laser'][] = [];
    for (const m of lay.mods) for (const [x, y] of m.opens) parts.push([x * NEST_SCALE, y * NEST_SCALE, 'brut']);
    for (const [x, y] of lay.lasers) parts.push([x * NEST_SCALE, y * NEST_SCALE, 'laser']);
    for (const [ox, oy, weapon] of parts) {
      const t = this.makeEnemy('turret', core.x + ox, core.y + oy);
      t.parent = core; t.ox = ox; t.oy = oy; t.weapon = weapon;
      if (weapon === 'brut') { const b = enemyStats('turret', this.level, { extra: 2.2, tune: this.tune }); t.hp = t.max = b.hp; t.sh = t.shMax = b.sh; t.r = 16; }
      t.cd = weapon === 'brut' ? 2 + this.r() * 4 : 2 + this.r() * 2;
      this.enemies.push(t);
    }
    this.bossT = 0;
    this.spawnNestSurroundings();
  }

  /**
   * Umgebung des Nests: zwei Nebennester (brüten Späher-Cluster bzw. Xenon-Drohnen) seitlich davor und vier
   * Turmplattformen auf dem Anflugweg – alles freiwillige Ziele, die das Ausheben schwerer machen
   */
  private spawnNestSurroundings(): void {
    const kh = this.side === 'khaak';
    const hives = kh ? ['khaak-nebennest-a-ki', 'khaak-nebennest-b-ki'] : ['xenon-nebennest-a-ki', 'xenon-nebennest-b-ki'];
    const plats = (kh ? ['dreifach', 'zwilling', 'lanze', 'strahl'] : ['xgatling', 'xzwilling', 'xlaser', 'xgatling']) as (keyof typeof PLATS)[];
    for (const [dx, dy, img] of [[-600, 520, hives[0]], [600, 520, hives[1]]] as const) {
      const h = this.makeEnemy('boss', this.fX + dx, this.fY + dy);
      const st = enemyStats('boss', this.level, { mini: true, tune: this.tune });
      h.hp = h.max = st.hp; h.sh = h.shMax = st.sh;
      h.r = 52; h.mini = true; h.hive = { img }; h.target = 'p';
      h.ang = this.r() * Math.PI * 2;
      h.broodT = 6 + this.r() * 6;
      this.enemies.push(h);
    }
    this.spawnPlats([[this.fX - 380, this.fY + 950, plats[0]], [this.fX + 380, this.fY + 950, plats[1]], [this.fX - 900, this.fY + 150, plats[2]], [this.fX + 900, this.fY + 150, plats[3]]]);
  }

  /** Turmplattformen an festen Punkten der Karte */
  private spawnPlats(list: [number, number, keyof typeof PLATS][]): void {
    for (const [x, y, type] of list) {
      const t = this.makeEnemy('turret', x, y);
      const st = enemyStats('turret', this.level, { extra: 2, tune: this.tune });
      t.hp = t.max = st.hp; t.sh = t.shMax = st.sh;
      t.r = 20; t.plat = PLATS[type]; t.target = 'p';
      t.ang = Math.atan2(this.py - t.y, this.px - t.x);
      t.cd = 2 + this.r() * 2;
      this.enemies.push(t);
    }
  }

  /**
   * Turmplattformen bei Bergung und Flucht (nur Xenon und Kha'ak – für Piraten gibt es keine): bei der Bergung bewachen
   * drei das Wrackfeld (ihre Geschosse zerstören auch Container), bei der Flucht stehen drei im Halbkreis um den
   * Frachter und nehmen ihn ins Visier, wenn du außer Reichweite bist
   */
  private spawnMissionPlats(): void {
    if (this.side === 'pirate') return;
    const kh = this.side === 'khaak';
    if (this.mission === 'bergung') {
      this.spawnPlats([[700, 780, kh ? 'dreifach' : 'xgatling'], [1900, 780, kh ? 'zwilling' : 'xzwilling'], [1300, 430, kh ? 'lanze' : 'xlaser']]);
    } else if (this.mission === 'flucht') {
      const x = this.fX, y = this.fY;
      this.spawnPlats([[x - 430, y - 260, kh ? 'dreifach' : 'xgatling'], [x + 430, y - 260, kh ? 'zwilling' : 'xzwilling'], [x, y - 560, kh ? 'strahl' : 'xlaser']]);
    }
  }

  /** Turmplattform: Kopf dreht sich mit begrenzter Rate zu dir, lädt sichtbar und feuert Kyon-Strahlen aus den Mündungen */
  private updatePlat(e: Enemy, dt: number): void {
    const d = e.plat!;
    e.vx = 0; e.vy = 0;
    // Ziel: du, solange du in Reichweite bist – sonst ein Schutzziel in Reichweite (Flucht: der Frachter)
    let tx = this.px, ty = this.py, dist = Math.hypot(this.px - e.x, this.py - e.y);
    if (dist > d.len + 30) {
      const w = this.wardOf(e);
      if (w) { const wd = Math.hypot(this.wx(w) - e.x, this.wy(w) - e.y); if (wd < d.len) { tx = this.wx(w); ty = this.wy(w); dist = wd; } }
    }
    const want = Math.atan2(ty - e.y, tx - e.x);
    // während des Ladens bleibt die Richtung stehen (wer ausweicht, entkommt)
    // Kanone im Feuerstoß: folgt dem Ziel weiter, Schuss um Schuss (Zwilling: abwechselnd aus beiden Rohren)
    if (e.burst) {
      e.ang = wrapA(turnTo(e.ang, want, d.turn * dt));
      e.burstT = (e.burstT ?? 0) - dt;
      if (e.burstT <= 0) {
        e.burstT = d.gap ?? 0.1;
        const sd = d.side[e.burst % d.side.length], [mx, my] = this.platMuzzle(e, sd), v = d.v ?? 400;
        const a = e.ang + (this.r() - 0.5) * 0.06;
        this.bullets.push({ x: mx, y: my, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: d.dmg * this.enemyDmg, from: 'e', life: d.len / v, color: d.color ?? '#ff5c6c', w: d.w ?? 2, pierce: 0 });
        e.burst--;
        const sx = (e.x - this.camX) * this.zoom, sy = (e.y - this.camY) * this.zoom;
        if (sx > -40 && sx < this.w + 40 && sy > -40 && sy < this.h + 40) sfx.enemyShot(this.panAt(e.x));
      }
      return;
    }
    if (e.plT == null) e.ang = wrapA(turnTo(e.ang, want, d.turn * dt));
    if (e.plT != null) {
      e.plT -= dt;
      if (e.plT <= 0) {
        e.plT = undefined;
        if (d.fire === 'gun') { e.burst = d.burst ?? 8; e.burstT = 0; return; }
        for (const a of d.fan ? [-d.fan, 0, d.fan] : [0]) for (const sd of d.side) {
          const [mx, my] = this.platMuzzle(e, sd);
          if (d.fire === 'beam') this.fireKyon(e, e.ang + a, d.dmg, d.len, [mx, my], d.color, 1);
          else this.fireKyon(e, e.ang + a, d.dmg, d.len, [mx, my]);
        }
      }
      return;
    }
    e.cd -= dt;
    if (e.cd <= 0 && dist < d.len + 30 && this.outcome !== 'player' && Math.abs(wrapA(want - e.ang)) < 0.25) {
      e.cd = d.cd * (this.level >= 4 ? 0.85 : 1) + this.r() * 0.6;
      e.plT = d.charge;
    }
  }

  /** Mündung eines Plattformturms (sd = Querversatz des Rohrs) */
  private platMuzzle(e: Enemy, sd: number): [number, number] {
    const d = e.plat!, c = Math.cos(e.ang), sn = Math.sin(e.ang);
    return [e.x + c * d.muzzle - sn * sd, e.y + sn * d.muzzle + c * sd];
  }

  /** Nebennest: steht still, dreht sich langsam und entlässt alle paar Sekunden einen Vierer-Cluster Späher */
  private updateHive(e: Enemy, dt: number): void {
    e.vx = 0; e.vy = 0;
    e.ang = wrapA(e.ang + dt * 0.04);
    e.broodT = (e.broodT ?? 8) - dt;
    if (e.broodT > 0) return;
    e.broodT = Math.max(9, 16 - this.level) + this.r() * 4;
    const a = Math.atan2(this.py - e.y, this.px - e.x);
    if (this.side !== 'khaak') {
      // Xenon: drei N-Drohnen, solange nicht schon viele unterwegs sind
      if (this.enemies.filter((q) => q.kind === 'n').length >= 10 || this.enemies.length > 56) return;
      for (let q = 0; q < 3; q++) {
        const j = this.makeEnemy('n', e.x + Math.cos(a) * 70 + (q - 1) * 16, e.y + Math.sin(a) * 70);
        const aa = a + (q - 1) * 0.5;
        j.ang = aa; j.vx = Math.cos(aa) * 200; j.vy = Math.sin(aa) * 200; j.target = 'p';
        this.enemies.push(j);
      }
      this.fx.add({ x: e.x, y: e.y, color: '#ff5c6c', size: 5, kind: 'ring', max: 0.5 });
      return;
    }
    if (!this.broodRoom()) return;
    this.spawnCluster(4, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
    this.fx.add({ x: e.x, y: e.y, color: '#c77dff', size: 5, kind: 'ring', max: 0.5 });
  }

  /** Nest-Kern: steht still und dreht sich; ohne Brutöffnungen feuert er Ringe */
  private updateNest(e: Enemy, dt: number): void {
    e.vx = 0; e.vy = 0;
    e.cd -= dt;
    if (e.shielded || e.cd > 0 || Math.hypot(this.px - e.x, this.py - e.y) > 620) return;
    e.cd = this.level >= 4 ? 2.4 : 3;
    const o = this.r() * Math.PI;
    if (this.side === 'khaak') for (let q = 0; q < 8; q++) this.fireKyon(e, o + (q / 8) * Math.PI * 2, 9, KYON_LEN + 260);
    else for (let q = 0; q < 12; q++) this.enemyShot(e, o + (q / 12) * Math.PI * 2, 230, 8, '#ff3b4a', 2.5, 2.8);
  }

  /** Brutöffnung des Nests: alle paar Sekunden zwei Drohnen, solange nicht schon viele unterwegs sind */
  private nestBrood(e: Enemy): void {
    const small = this.smallKind;
    if (this.enemies.filter((q) => q.kind === small).length >= 4 + this.level * 2 || this.enemies.length > 56) return;
    const p = e.parent!, a0 = Math.atan2(e.y - p.y, e.x - p.x);
    for (let q = 0; q < 2; q++) {
      const j = this.makeEnemy(small, e.x + Math.cos(a0) * 16, e.y + Math.sin(a0) * 16);
      const a = a0 + (q - 0.5) * 0.8;
      j.ang = a; j.vx = Math.cos(a) * 200; j.vy = Math.sin(a) * 200; j.target = 'p';
      this.enemies.push(j);
    }
    this.fx.add({ x: e.x, y: e.y, color: this.side === 'khaak' ? '#c77dff' : '#ff5c6c', size: 4, kind: 'ring', max: 0.5 });
  }

  /** Piratenkonvoi: drei Frachter in lockerer Reihe, dazu Begleitjäger */
  private spawnConvoy(): void {
    for (let k = 0; k < CARGO_N; k++) {
      const e = this.makeEnemy('cargo', this.fX + (k - 1) * 190, this.fY + Math.abs(k - 1) * 90);
      e.ang = -Math.PI / 2;
      e.target = 'p';
      e.orbit = (k - 1) * 120;
      this.enemies.push(e);
    }
    this.cargoTotal = CARGO_N;
    this.spawnGroup(['jaeger', 'jaeger', 'jaeger', 'jaeger', 'schild', ...(this.level >= 3 ? ['kanone'] as EKind[] : [])], 0);
    // Begleitschutz direkt am Konvoi statt weit draußen
    for (const e of this.enemies) if (e.grp === this.grpN) { e.x = this.fX + (this.r() - 0.5) * 300; e.y = this.fY - 120 + this.r() * 80; }
  }

  /** Piratenfrachter: fliegt zum Tor (leicht versetzt), zwei schwache Abwehrtürme; am Tor entkommt er */
  private updateCargo(e: Enemy, dt: number): void {
    const gx = this.gateX + e.orbit * Math.min(1, Math.max(0, (e.y - this.gateCy) / 900)), gy = this.gateCy;
    const a = Math.atan2(gy - e.y, gx - e.x);
    e.ang = wrapA(turnTo(e.ang, a, TURN.cargo * dt));
    const sp = SPEC.cargo.speed * (1 + 0.08 * (this.level - 1));
    e.vx = Math.cos(e.ang) * sp; e.vy = Math.sin(e.ang) * sp;
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (Math.hypot(gx - e.x, gy - e.y) < 50) {
      this.enemies = this.enemies.filter((q) => q !== e);
      this.cargoEscaped++;
      this.fx.add({ x: e.x, y: e.y, color: '#9fe6ff', size: 10, kind: 'ring', max: 0.6 });
      this.floats.add(e.x, e.y - 40, 'Piratenfrachter entkommen', '#ff9aa4', 15);
      sfx.alarm();
      return;
    }
    e.cd -= dt;
    if (e.cd <= 0 && Math.hypot(this.px - e.x, this.py - e.y) < 400) {
      e.cd = 1.3 + this.r() * 0.4;
      for (const oy of [-26, 30]) {
        const c = Math.cos(e.ang + Math.PI / 2), sn = Math.sin(e.ang + Math.PI / 2);
        const sx = e.x - oy * sn, sy = e.y + oy * c;
        const aa = Math.atan2(this.py + this.pvy * 0.3 - sy, this.px + this.pvx * 0.3 - sx);
        this.bullets.push({ x: sx, y: sy, vx: Math.cos(aa) * 300, vy: Math.sin(aa) * 300, dmg: 4.5 * this.enemyDmg, from: 'e', life: 1.45, color: '#ffd27a', w: 1.6, pierce: 0 });
      }
    }
  }

  // ---------- Ablauf ----------

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    this.banner = Math.max(0, this.banner - dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.gateT >= 0) this.gateT += dt;
      this.followCam(dt, true);
      if (this.endT > 2.2) this.done = this.finish();
      return;
    }
    if (this.choosing) return;
    this.time += dt;
    this.score.update(dt);
    this.shieldHit = Math.max(0, this.shieldHit - dt);
    if (this.wave < 0 && this.time > 0.8) this.spawnWave();
    this.waveT += dt;
    if (this.bossT >= 0) this.bossT += dt;
    this.updateWards(dt);
    this.updateMission(dt);
    if (this.outcome) return;
    // höchstens rund 60 Gegner zugleich – weitere Gruppen warten, bis Platz ist
    const due = this.enemies.length < 60 ? this.reinforce.find((g) => this.waveT >= g.t) : undefined;
    if (this.pendingSpawn >= 0) {
      this.pendingSpawn -= dt;
      if (this.pendingSpawn < 0) { this.pendingSpawn = -1; this.spawnWave(); }
    } else if (due) {
      if (due.kinds[0] === 'boss') this.spawnBoss(true, due.from);
      else this.spawnGroup(due.kinds, due.from, due.swarm);
      this.reinforce = this.reinforce.filter((g) => g !== due);
      this.floats.add(this.px, this.py - 40, due.kinds[0] === 'boss' ? (this.side === 'pirate' ? 'Piratenfregatte im Anflug!' : this.side === 'xenon' ? 'K-Segment im Anflug!' : 'Brutschiff im Anflug!') : due.swarm ? (this.side === 'khaak' ? `Cluster im Anflug! (${due.kinds.length})` : `Schwarm im Anflug! (${due.kinds.length})`) : 'Weitere Gruppe im Anflug!', '#ff9aa4', 14);
      sfx.alarm();
    } else if (this.wave >= 0 && this.waveCleared && !this.reinforce.length) {
      // Welle besiegt
      if (this.wave + 1 >= this.totalWaves) {
        this.winRound();
        return;
      }
      if (this.mode === 'endless') {
        this.score.add(300 * (this.wave + 1), 'Wellen überstanden');
        for (const w of this.liveWards) w.hull = Math.min(w.max, w.hull + w.max * 0.1);
        setGoal(this.goals, 'wave6', this.wave + 2 >= 6 || this.goals.find((g) => g.id === 'wave6')?.done === true);
        setGoal(this.goals, 'wave10', this.wave + 2 >= 10 || this.goals.find((g) => g.id === 'wave10')?.done === true);
      }
      this.section = 'none';
      this.offerCards();
      return;
    } else if (this.wave >= 0 && this.waveT > (!this.counted ? 35 : this.isBossWave(this.wave + 1) ? 100 : 75) && !this.isBossWave(this.wave) && this.wave + 1 < this.totalWaves) {
      // zu langsam: nächste Welle kommt trotzdem (ohne Verbesserung)
      this.spawnWave();
    }
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBlasts(dt);
    this.updateShots(dt);
    this.updateField(dt);
    this.updatePickups(dt);
    this.followCam(dt, false);
    this.minHull = Math.min(this.minHull, this.hull);
    setGoal(this.goals, 'tough', this.minHull >= 50 && this.outcome !== 'player');
    setGoal(this.goals, 'combo3', this.score.maxCombo >= 3);
    setGoal(this.goals, 'combo4', this.score.maxCombo >= 4);
    setGoal(this.goals, 'loot3', this.loot >= 3);
    setGoal(this.goals, 'boss2', this.bossKills >= 2);
    setGoal(this.goals, 'nomissile', this.missilesUsed === 0);
    // alle Schutzziele verloren
    if (this.wards.length && !this.liveWards.length && !this.outcome) {
      this.outcome = 'freighter';
      this.endT = 0;
    }
    if (this.hull <= 0 && !this.outcome) {
      this.outcome = 'player';
      this.endT = 0;
      this.explode(this.px, this.py, '#3fe0c5', 1.4);
    }
  }

  /**
   * Schutzziele: Frachter fliegen (Geleit, Konvoi) bis zum Ende des Abschnitts und warten dort; ihre Abwehrtürme zielen
   * frei – Raketen zuerst. Die Station hat sechs stärkere Türme mit eigener Hülle.
   */
  private updateWards(dt: number): void {
    const prev = this.fY;
    if (this.wave >= 0 && this.moving) this.fY = Math.max(this.fGoal, this.fY - F_SPEED * dt);
    this.fVy = (this.fY - prev) / Math.max(dt, 1e-6);
    for (const w of this.wards) {
      w.flash = Math.max(0, w.flash - dt);
      if (w.dead) continue;
      const st = w.kind === 'station';
      const range = st ? 270 : 240, cd = st ? 0.8 : 0.9, dmg = st ? 3.2 : 3, x0 = this.wx(w), y0 = this.wy(w);
      for (const t of w.tur) {
        if (t.hp <= 0) continue;
        t.cd -= dt;
        const tx0 = x0 + t.ox, ty0 = y0 + t.oy;
        let tgt: { x: number; y: number; vx: number; vy: number } | null = null, bd = range;
        for (const m of this.eMissiles) { const d = Math.hypot(m.x - tx0, m.y - ty0); if (d < bd) { bd = d; tgt = m; } }
        if (!tgt) {
          bd = range - 30;
          for (const e of this.enemies) {
            if (e.kind === 'boss' && e.shielded) continue;
            const d = Math.hypot(e.x - tx0, e.y - ty0);
            if (d < bd) { bd = d; tgt = e; }
          }
        }
        if (!tgt) continue;
        const lt = bd / 520;
        t.a = Math.atan2(tgt.y + tgt.vy * lt - ty0, tgt.x + tgt.vx * lt - tx0);
        if (t.cd <= 0) {
          t.cd = cd;
          this.bullets.push({ x: tx0 + Math.cos(t.a) * 8, y: ty0 + Math.sin(t.a) * 8, vx: Math.cos(t.a) * 520, vy: Math.sin(t.a) * 520, dmg, from: 'p', life: range / 520, color: st ? '#ffb070' : '#9fe6ff', w: st ? 2 : 1.4, pierce: 0 });
        }
      }
    }
  }

  /** Treffer am Schutzziel; bei der Station trifft es zuerst einen Turm in der Nähe. Ohne Hülle: zerstört */
  private hitWard(w: Ward, dmg: number, x: number, y: number): void {
    if (w.dead) return;
    if (w.kind === 'station') {
      const x0 = this.wx(w), y0 = this.wy(w);
      const t = w.tur.find((q) => q.hp > 0 && Math.hypot(x0 + q.ox - x, y0 + q.oy - y) < 24);
      if (t) {
        t.hp = Math.max(0, t.hp - dmg);
        if (t.hp <= 0) { this.explode(x0 + t.ox, y0 + t.oy, '#ffb070', 1); this.floats.add(x0 + t.ox, y0 + t.oy - 20, 'Stationsturm zerstört', '#ff9aa4', 13); }
        dmg *= 0.3;
      }
    }
    w.hull = Math.max(0, w.hull - dmg);
    w.flash = 0.12;
    this.fx.burst(x, y, '#ffb070', 4, 120, 1.2, 'spark', 0.25);
    if (w.hull <= 0) {
      w.dead = true;
      this.explode(this.wx(w), this.wy(w), '#5ff0d8', w.kind === 'station' ? 4 : 2.4);
      if (this.wards.length > 1) { this.floats.add(this.wx(w), this.wy(w) - 60, `Frachter ${w.name} verloren`, '#ff9aa4', 15); sfx.alarm(); }
    }
  }

  /** Welle besiegt? (Nest und Piratenfrachter zählen nicht mit – sie bleiben) */
  private get waveCleared(): boolean {
    return this.enemies.every((e) => e.nest || e.parent?.nest || e.kind === 'cargo' || e.plat || e.hive);
  }

  /** Runde gewonnen: Punkte und Abschluss je Einsatz */
  private winRound(): void {
    this.outcome = 'win';
    this.endT = 0;
    const live = this.liveWards;
    const f = (w?: Ward) => (w ? w.hull / w.max : 0);
    if (this.moving || this.mission === 'flucht') {
      // Sprungtor öffnet sich vor dem Frachter (Konvoi: vor der Mitte)
      this.gateT = 0;
      this.gateX = this.mission === 'konvoi' ? this.fX : this.fx1;
      this.gateY = this.fY - 330;
    }
    switch (this.mission) {
      case 'konvoi':
        for (const w of live) { this.score.add(1500, 'Frachter am Tor'); this.score.add(Math.round(f(w) * 1000), 'Frachter-Hülle'); }
        setGoal(this.goals, 'all3', live.length === 3);
        setGoal(this.goals, 'kv60', live.length > 0 && live.every((w) => f(w) > 0.6));
        break;
      case 'station': {
        const w = this.wards[0], intact = w.tur.filter((t) => t.hp > 0).length;
        this.score.add(1000, 'Alle Wellen abgewehrt');
        this.score.add(Math.round(f(w) * 2000), 'Stations-Hülle');
        this.score.add(300 * intact, 'Stationstürme');
        setGoal(this.goals, 'turrets', intact === 6);
        setGoal(this.goals, 'st80', f(w) > 0.8);
        break;
      }
      case 'flucht':
        this.score.add(1000, 'Gesprungen');
        this.score.add(Math.round(f(this.wards[0]) * 2000), 'Frachter-Hülle');
        setGoal(this.goals, 'fl50', f(this.wards[0]) > 0.5);
        break;
      case 'bergung':
        this.score.add(Math.round(f(this.wards[0]) * 1000), 'Bergungsschiff');
        setGoal(this.goals, 'crate8', this.crateDone === CRATES);
        setGoal(this.goals, 'nolost', this.crateLost === 0);
        break;
      case 'ueberfall':
        if (this.cargoKilled === CARGO_N) this.score.add(1000, 'Ganzer Konvoi');
        setGoal(this.goals, 'cargo3', this.cargoKilled === CARGO_N);
        break;
      case 'nest':
        this.score.add(Math.max(0, Math.round(2000 - this.time * 6.67)), 'Tempo');
        setGoal(this.goals, 'nest150', this.time < 150);
        setGoal(this.goals, 'hives', !this.enemies.some((q) => q.hive));
        setGoal(this.goals, 'plats', !this.enemies.some((q) => q.plat));
        break;
      default:
        this.score.add(1000, 'Sprungtor erreicht');
        this.score.add(Math.round(f(this.wards[0]) * 2000), 'Frachter-Hülle');
        setGoal(this.goals, 'hull80', f(this.wards[0]) > 0.8);
    }
    sfx.success();
  }

  /** Ziele der Einsätze, die nicht an Wellen hängen: Sprungantrieb, Container, Piratenkonvoi */
  private updateMission(dt: number): void {
    if (this.wave < 0) return;
    if (this.mission === 'flucht') {
      this.charge = Math.min(1, this.charge + dt / this.fluchtT);
      // gegen Ende ein Großkampfschiff, das den Sprung verhindern soll
      if (this.charge >= 0.62 && !this.fluchtBoss) {
        this.fluchtBoss = true;
        this.reinforce.push({ t: this.waveT, kinds: ['boss'], from: Math.floor(this.r() * 5) });
      }
      if (this.charge >= 1 && this.liveWards.length) { this.winRound(); return; }
    }
    if (this.mission === 'bergung') {
      this.updateCrates(dt);
      const open = this.crates.filter((c) => !c.done).length;
      if (!open || CRATES - this.crateLost < CRATES_MIN) {
        if (this.crateDone >= CRATES_MIN) this.winRound();
        else { this.outcome = 'fail'; this.endT = 0; }
        return;
      }
    }
    if (this.mission === 'ueberfall') {
      this.gateT += dt;
      // Konvoi-Mitte folgt den Frachtern (für Anflugrichtungen und Kamera am Ende)
      const cg = this.enemies.filter((e) => e.kind === 'cargo');
      if (cg.length) { this.fX = cg.reduce((a, e) => a + e.x, 0) / cg.length; this.fY = cg.reduce((a, e) => a + e.y, 0) / cg.length; }
      if (this.cargoKilled + this.cargoEscaped >= this.cargoTotal && this.cargoTotal) {
        if (this.cargoKilled > 0) this.winRound();
        else { this.outcome = 'fail'; this.endT = 0; }
      }
    }
  }

  /** Endlos-Modus: alles um dy nach unten verschieben, damit die Route nie zu Ende geht */
  private shiftWorld(dy: number): void {
    this.fY += dy; this.fGoal += dy; this.py += dy; this.camY += dy;
    for (const o of [...this.enemies, ...this.bullets, ...this.missiles, ...this.eMissiles, ...this.pickups, ...this.rocks, ...this.mines, ...this.clusters.values()]) o.y += dy;
  }

  private followCam(dt: number, toFreighter: boolean): void {
    // sanft zoomen, dabei die Bildmitte festhalten
    if (this.zoom !== this.zoomGoal) {
      const cx = this.camX + this.w / 2 / this.zoom, cy = this.camY + this.h / 2 / this.zoom;
      this.zoom += (this.zoomGoal - this.zoom) * Math.min(1, dt * 8);
      if (Math.abs(this.zoom - this.zoomGoal) < 0.002) this.zoom = this.zoomGoal;
      this.camX = cx - this.w / 2 / this.zoom;
      this.camY = cy - this.h / 2 / this.zoom;
    }
    // camX/camY: Weltpunkt in der linken oberen Bildschirmecke; Bildschirm = (Welt − cam) · Zoom
    const Z = this.zoom, vw = this.w / Z, vh = this.h / Z;
    const tx = (toFreighter ? this.fx1 : this.px) - vw / 2;
    const ty = (toFreighter ? this.fy1 : this.py) - (TOP + (this.h - TOP) * 0.5) / Z;
    const k = Math.min(1, dt * 4);
    this.camX += (clamp(tx, -40, this.WW - vw + 40) - this.camX) * k;
    this.camY += (clamp(ty, -TOP / Z - 40, this.WH - vh + 40) - this.camY) * k;
  }

  private updatePlayer(dt: number): void {
    // Joystick: Richtung = Kurs (der Jäger dreht sich mit begrenzter Rate dorthin), Ausschlag = Schub nach vorn
    // Trägheit wie in der Schwerelosigkeit: Schub beschleunigt in Blickrichtung, ohne Schub driftet der Jäger weiter.
    // Leichter Ausschlag (innerer Ring) dreht nur – so kann man im Driften wenden und nach hinten schießen.
    const j = this.joy;
    const defl = j ? Math.min(1, Math.hypot(j.kx, j.ky)) : 0;
    let thr: number, thrA = this.aimA, eff = 1;
    if (this.pc && j?.id !== 99) {
      // PC: Schiff dreht sich (mit seiner Wendigkeit) zur Maus; W/A/S/D geben Schub aus Sicht des Schiffs
      this.pcT += dt;
      if (this.mouseX >= 0) {
        const wx = this.camX + this.mouseX / this.zoom, wy = this.camY + this.mouseY / this.zoom;
        if (Math.hypot(wx - this.px, wy - this.py) > 8) this.aimA = wrapA(turnTo(this.aimA, Math.atan2(wy - this.py, wx - this.px), this.turnRate * dt));
      }
      if (this.fireId !== 99) this.fireId = this.mouseFire ? MOUSE_ID : null;
      const k = this.keys;
      const fx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const fy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      thr = fx || fy ? 1 : 0;
      if (thr) {
        // wie der linke Stick bei zwei Sticks: oben = geradeaus, zur Seite = seitwärts, unten = rückwärts
        const rel = Math.atan2(fy, fx) + Math.PI / 2;
        thrA = wrapA(this.aimA + rel);
        const c = Math.cos(rel);
        eff = c >= 0 ? SIDE_THRUST + (1 - SIDE_THRUST) * c * c : SIDE_THRUST + (BACK_THRUST - SIDE_THRUST) * c * c;
      }
    } else if (this.ctrl !== 'eins' && j?.id !== 99) {
      // zwei Sticks: rechts bestimmt die Blickrichtung (weit ausgelenkt: feuern), links der Schub in jede Richtung –
      // auch seitwärts und rückwärts, dort schwächer
      const a = this.aim, ad = a ? Math.min(1, Math.hypot(a.kx, a.ky)) : 0;
      if (this.ctrl === 'lenk') {
        // Lenkrad: oben = geradeaus, links/rechts = drehen (je weiter zur Seite, desto schneller), unten = volle Drehung
        if (a && ad > 0.12) {
          const rel = Math.atan2(a.kx, -a.ky);
          const k = clamp(rel / (Math.PI / 2), -1, 1) * Math.min(1, ad / 0.5);
          this.aimA = wrapA(this.aimA + k * this.turnRate * dt);
        }
      } else if (a && ad > 0.15) this.aimA = wrapA(turnTo(this.aimA, Math.atan2(a.ky, a.kx), this.turnRate * dt));
      if (this.fireId !== 99) {
        const fire = a && ad > AIM_FIRE ? a.id : null;
        // Rückmeldung, sobald der rechte Stick über den Ring geht und die Waffen auslösen: kurzes Vibrieren (wo das
        // Gerät es erlaubt), leiser Klick und ein Aufleuchten des Rings
        if (fire !== null && this.fireId === null) { vibrate(25); sfx.tick(); this.ringFlash = 0.25; }
        if (fire === null && this.fireId !== null) vibrate(8);
        this.fireId = fire;
      }
      thr = clamp((defl - 0.12) / 0.88, 0, 1);
      if (j && thr > 0) {
        // Stick aus Sicht des Jägers: nach oben = geradeaus Schub, zur Seite = seitwärts, nach unten = rückwärts
        const rel = Math.atan2(j.ky, j.kx) + Math.PI / 2;
        thrA = wrapA(this.aimA + rel);
        // Steuerdüsen: seitwärts ein Viertel, rückwärts ein Drittel von Schub und Tempo nach vorn
        const c = Math.cos(rel);
        eff = c >= 0 ? SIDE_THRUST + (1 - SIDE_THRUST) * c * c : SIDE_THRUST + (BACK_THRUST - SIDE_THRUST) * c * c;
      }
    } else {
      if (j && defl > 0.12) this.aimA = wrapA(turnTo(this.aimA, Math.atan2(j.ky, j.kx), this.turnRate * dt));
      thr = clamp((defl - TURN_ONLY) / (1 - TURN_ONLY), 0, 1);
      thrA = this.aimA;
    }
    this.thrust = thr;
    // Reiseantrieb: ohne Gegner in der Nähe und bei vollem Schub deutlich schneller
    const calm = this.fireId === null && !this.enemies.some((e) => Math.hypot(e.x - this.px, e.y - this.py) < 560) && !this.eMissiles.some((m) => Math.hypot(m.x - this.px, m.y - this.py) < 400);
    this.cruise = clamp(this.cruise + (calm && thr > 0.85 ? dt * 0.7 : -dt * 3), 0, 1);
    const vmax = this.speed * (1 + 1.5 * this.cruise);
    // Schub in Blickrichtung; etwas Flugassistent bremst die Drift langsam ab
    // in Schubrichtung höchstens so schnell, wie die Düsen dorthin schaffen (seitlich und rückwärts weniger)
    const along = this.pvx * Math.cos(thrA) + this.pvy * Math.sin(thrA);
    const acc = along < vmax * eff ? this.speed * ACCEL * thr * eff * (1 + this.cruise) : 0;
    this.pvx += Math.cos(thrA) * acc * dt;
    this.pvy += Math.sin(thrA) * acc * dt;
    const damp = Math.exp(-DRIFT_DAMP * dt);
    this.pvx *= damp;
    this.pvy *= damp;
    const v = Math.hypot(this.pvx, this.pvy);
    // über dem Höchsttempo (z. B. nach dem Reiseantrieb) zügig zurück
    if (v > vmax) { const f = Math.max(vmax / v, Math.exp(-2.5 * dt)); this.pvx *= f; this.pvy *= f; }
    let vx = this.pvx, vy = this.pvy;
    if (this.dashT > 0) { this.dashT -= dt; vx = this.dashVx; vy = this.dashVy; if (Math.random() < 0.7) this.fx.add({ x: this.px, y: this.py, color: '#9ffff0', size: 2, max: 0.25 }); }
    if (this.cruise > 0.4 && Math.random() < this.cruise) this.fx.add({ x: this.px - Math.cos(this.aimA) * 14, y: this.py - Math.sin(this.aimA) * 14, color: '#9ffff0', size: 1.4, max: 0.35 });
    this.px = clamp(this.px + vx * dt, 14, this.WW - 14);
    this.py = clamp(this.py + vy * dt, 14, this.WH - 14);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.shieldWait = Math.max(0, this.shieldWait - dt);
    if (!this.shieldWait && this.mutator?.id !== 'ion') this.shield = Math.min(this.shieldMax, this.shield + 12 * this.ship.regen * this.sh.regen * (1 + 0.5 * this.c('regen')) * (1 + this.m('regen')) * dt);
    this.odT = Math.max(0, this.odT - dt);
    this.sprintT = Math.max(0, this.sprintT - dt);
    this.escortT = Math.max(0, this.escortT - dt);
    if (this.sprintT > 0 && Math.random() < 0.8) this.fx.add({ x: this.px - Math.cos(this.aimA) * this.ship.size * 0.4, y: this.py - Math.sin(this.aimA) * this.ship.size * 0.4, color: '#ffb070', size: 1.8, max: 0.3 });
    // Vorhaltekreuz: Gegner vor der Nase bevorzugt, sonst der nächste in Reichweite
    let best: Enemy | null = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.kind === 'boss' && e.shielded) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d > Math.max(520, this.reach + 80)) continue;
      const off = Math.abs(wrapA(Math.atan2(e.y - this.py, e.x - this.px) - this.aimA));
      const score = d * (1 + off * 1.5);
      if (score < bs) { bs = score; best = e; }
    }
    if (best) {
      const t = this.wpn.beam ? 0 : Math.hypot(best.x - this.px, best.y - this.py) / this.wpn.speed;
      const lx = best.x + (best.vx - this.pvx * 0.3) * t, ly = best.y + (best.vy - this.pvy * 0.3) * t;
      const off = Math.abs(wrapA(Math.atan2(ly - this.py, lx - this.px) - this.aimA));
      this.lock = { e: best, x: lx, y: ly, ok: off < AIM_ASSIST };
    } else this.lock = null;
    // Bordkanonen: nur geradeaus; liegt der Vorhaltepunkt fast genau vorn, hilft eine kleine Zielhilfe (wie in X4)
    this.fireCd -= dt;
    this.ringFlash = Math.max(0, this.ringFlash - dt);
    if (this.reloading) { this.reloadLeft = Math.max(0, this.fireCd); if (this.fireCd <= 0) this.reloading = false; }
    this.beams = [];
    for (const r of this.rails) r.t -= dt;
    this.rails = this.rails.filter((r) => r.t > 0);
    const w = this.wpn;
    // Magazin bzw. Salve: nach einer Pause ohne Feuern ist es wieder voll (wie in X4)
    if (this.fireId === null) {
      this.idle += dt;
      if (w.mag && this.idle >= w.reload * this.tempo) this.mag = w.mag;
    } else this.idle = 0;
    if (w.beam) {
      if (this.fireId !== null) { this.fireBeams(dt); sustain('beam', 'beam', 0.8); }
    } else if (this.fireId !== null && this.fireCd <= 0) {
      sfx.shot(this.wpnId, this.panAt(this.px));
      let a0 = this.aimA;
      if (this.lock) {
        const la = Math.atan2(this.lock.y - this.py, this.lock.x - this.px);
        if (Math.abs(wrapA(la - this.aimA)) < AIM_ASSIST * w.gimbal) a0 = la;
      }
      const spread = this.c('spread');
      const c = Math.cos(this.aimA), sn = Math.sin(this.aimA);
      for (const gx of this.guns) {
        // alle Bordkanonen feuern; Lage quer zur Flugrichtung
        const fwd = this.ship.size * (this.ship.gunFwd ?? 0.3);
        const ox = this.px - sn * gx + c * fwd, oy = this.py + c * gx + sn * fwd;
        for (let s2 = -spread; s2 <= spread; s2++) for (let p = 0; p < w.pellets; p++) {
          const a = a0 + s2 * 0.16 + (this.r() - 0.5) * 2 * w.jitter;
          if (w.rail) { this.fireRail(ox, oy, a, this.damage * (s2 === 0 ? 1 : 0.7), w.range, w.color); continue; }
          this.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * w.speed + this.pvx * 0.3, vy: Math.sin(a) * w.speed + this.pvy * 0.3, dmg: this.damage * (s2 === 0 ? 1 : 0.7), from: 'p', life: w.life, color: w.color, w: w.w, pierce: this.c('pierce'), hullPierce: w.hullPierce || undefined });
        }
      }
      // nächster Schuss; ist das Magazin leer, erst nachladen
      this.fireCd = w.interval * this.tempo;
      if (w.mag && --this.mag <= 0) { this.mag = w.mag; this.fireCd = w.reload * this.tempo; this.reloadLeft = this.reloadMax = this.fireCd; this.reloading = true; }
    }
    this.updateTurrets(dt);
    if (this.tBeams.length) sustain('turretBeam', 'beam', 0.45);
    this.updateLTurrets(dt);
    // Drohnen kreisen und feuern selbst
    const drones = this.droneN;
    if (drones) {
      this.droneA += dt * 2.4;
      this.droneCd -= dt;
      for (let k = 0; k < drones; k++) this.droneAim[k] = wrapA(turnTo(this.droneAim[k] ?? this.aimA, this.aimA, dt * 1.5));
      if (this.droneCd <= 0) {
        this.droneCd = 0.6 / drones;
        const k2 = Math.floor(this.time * 10) % drones;
        const [dx, dy] = this.dronePos(k2);
        let tgt: Enemy | null = null, td = 230;
        for (const e of this.enemies) { const d = Math.hypot(e.x - dx, e.y - dy); if (d < td && !(e.kind === 'boss' && this.enemies.some((q) => q.parent === e))) { td = d; tgt = e; } }
        if (tgt) {
          const a = Math.atan2(tgt.y - dy, tgt.x - dx);
          this.droneAim[k2] = a;
          const escort = this.escortT > 0 && k2 === drones - 1;
          this.bullets.push({ x: dx + Math.cos(a) * 10, y: dy + Math.sin(a) * 10, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, dmg: escort ? 10 : 5, from: 'p', life: 0.5, color: escort ? '#7ffff0' : '#ffb547', w: 1.6, pierce: 0 });
        }
      }
    }
  }

  /** Bosonenlanze: blitzschneller Strahl, trifft sofort das erste Ziel auf der Linie */
  private fireRail(ox: number, oy: number, a: number, dmg: number, range: number, color: string): void {
    const c = Math.cos(a), sn = Math.sin(a);
    let hitT = range, hitE: Enemy | null = null, hitM: EMissile | null = null, hitMine: (typeof this.mines)[number] | null = null;
    const along = (x: number, y: number, r: number): number | null => {
      const t = (x - ox) * c + (y - oy) * sn;
      if (t < 0 || t > hitT) return null;
      return Math.abs(-(x - ox) * sn + (y - oy) * c) < r ? t : null;
    };
    for (const e of this.enemies) {
      if (e.kind === 'boss' && e.shielded) continue;
      const t = along(e.x, e.y, e.r + 3);
      if (t != null) { hitT = t; hitE = e; hitM = null; hitMine = null; }
    }
    for (const m of this.eMissiles) { const t = along(m.x, m.y, 8); if (t != null) { hitT = t; hitM = m; hitE = null; hitMine = null; } }
    for (const m of this.mines) { const t = along(m.x, m.y, 10); if (t != null) { hitT = t; hitMine = m; hitE = null; hitM = null; } }
    for (const k of this.rocks) { const t = along(k.x, k.y, k.r * 0.8); if (t != null) { hitT = t; hitE = null; hitM = null; hitMine = null; } }
    const x2 = ox + c * hitT, y2 = oy + sn * hitT;
    if (hitE) this.damageEnemy(hitE, dmg);
    if (hitM) { hitM.hp -= dmg; if (hitM.hp <= 0) { this.explode(hitM.x, hitM.y, '#ff8a5c', 0.5, false); this.gain(30, hitM.x, hitM.y, 'Raketen abgeschossen'); } }
    if (hitMine) { hitMine.hp -= dmg; if (hitMine.hp <= 0) this.detonate(hitMine); }
    if (hitE || hitM || hitMine) this.fx.burst(x2, y2, '#f2e6ff', 6, 160, 1.6, 'spark', 0.25);
    this.rails.push({ x1: ox, y1: oy, x2, y2, t: 0.22, color });
  }

  /** Strahler: je feuernde Bordkanone ein Strahl geradeaus; trifft das erste Ziel im Strahl (Schaden pro Sekunde) */
  private fireBeams(dt: number): void {
    const c0 = Math.cos(this.aimA), s0 = Math.sin(this.aimA);
    // Zielhilfe wie bei den Geschossen: liegt der Gegner fast genau vorn, schwenkt der Strahl auf ihn
    let ba = this.aimA;
    if (this.lock) {
      const la = Math.atan2(this.lock.y - this.py, this.lock.x - this.px);
      if (Math.abs(wrapA(la - this.aimA)) < AIM_ASSIST * this.wpn.gimbal) ba = la;
    }
    const c = Math.cos(ba), sn = Math.sin(ba);
    // Schaden pro Sekunde aus den Daten; Mk-Stufe und Verbesserungen wirken wie auf den Takt
    const dps = this.damage / TIME / this.tempo;
    for (const gx of this.guns) {
      const fwd = this.ship.size * (this.ship.gunFwd ?? 0.3);
      const ox = this.px - s0 * gx + c0 * fwd, oy = this.py + c0 * gx + s0 * fwd;
      // erstes Ziel entlang des Strahls
      let hitT = this.wpn.range, hitE: Enemy | null = null, hitM: EMissile | null = null;
      const along = (x: number, y: number, r: number): number | null => {
        const t = (x - ox) * c + (y - oy) * sn;
        if (t < 0 || t > hitT) return null;
        return Math.abs(-(x - ox) * sn + (y - oy) * c) < r ? t : null;
      };
      for (const e of this.enemies) {
        if (e.kind === 'boss' && e.shielded) continue;
        const t = along(e.x, e.y, e.r + 3);
        if (t != null) { hitT = t; hitE = e; hitM = null; }
      }
      for (const m of this.eMissiles) { const t = along(m.x, m.y, 8); if (t != null) { hitT = t; hitM = m; hitE = null; } }
      for (const k of this.rocks) { const t = along(k.x, k.y, k.r * 0.8); if (t != null) { hitT = t; hitE = null; hitM = null; } }
      if (hitE) {
        // auf Schilde ausgelegt: fremde Schutzschilde halten den Strahl nicht ab
        this.damageEnemy(hitE, dps * dt, 1);
        if (Math.random() < 0.5) this.fx.add({ x: ox + c * hitT, y: oy + sn * hitT, color: '#bffff6', size: 1.6, max: 0.15 });
      }
      if (hitM) { hitM.hp -= dps * dt; if (hitM.hp <= 0) { this.explode(hitM.x, hitM.y, '#ff8a5c', 0.5, false); this.gain(30, hitM.x, hitM.y, 'Raketen abgeschossen'); } }
      this.beams.push([ox, oy, ox + c * hitT, oy + sn * hitT]);
    }
  }

  /** Eigene Türme (Korvette): zielen frei mit Vorhalt – Raketen zuerst, sonst der nächste Gegner */
  private updateTurrets(dt: number): void {
    this.tBeams = [];
    if (!this.pTur.length) return;
    const w = this.tw, range = w.range;
    const c = Math.cos(this.aimA + Math.PI / 2), sn = Math.sin(this.aimA + Math.PI / 2);
    for (const [i, t] of this.pTur.entries()) {
      const [tx0, ty0] = this.ship.turrets[i];
      const x = this.px + tx0 * c - ty0 * sn, y = this.py + tx0 * sn + ty0 * c;
      t.cd -= dt;
      let tgt: { x: number; y: number; vx: number; vy: number } | null = null, bd = range;
      // Raketenabwehr zuerst – nur bei „alle“ und „S“; wer die Türme auf M- oder L-Schiffe ansetzt, gibt sie auf
      const order = this.orders.m;
      if (order === 'alle' || order === 'S') for (const m of this.eMissiles) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; tgt = m; } }
      if (!tgt) { tgt = this.pickTarget(x, y, range, order); if (tgt) bd = Math.hypot(tgt.x - x, tgt.y - y); }
      if (!tgt) { t.a = wrapA(turnTo(t.a, this.aimA, dt * 3)); continue; }
      const lt = w.beam ? 0 : bd / w.speed;
      const want = Math.atan2(tgt.y + tgt.vy * lt - y, tgt.x + tgt.vx * lt - x);
      t.a = wrapA(turnTo(t.a, want, dt * this.turTurn));
      if (w.beam) {
        // Dauerstrahl: trifft sofort, solange der Turm auf dem Ziel liegt (Schaden pro Sekunde wie die Bordstrahler)
        if (Math.abs(wrapA(want - t.a)) > 0.08) continue;
        const dps = (this.baseDmg * w.dmg) / TIME / this.tempo;
        this.tBeams.push([x + Math.cos(t.a) * 6, y + Math.sin(t.a) * 6, tgt.x, tgt.y]);
        if (this.eMissiles.includes(tgt as EMissile)) {
          const m = tgt as EMissile;
          m.hp -= dps * dt;
          if (m.hp <= 0) { this.explode(m.x, m.y, '#ff8a5c', 0.5, false); this.gain(30, m.x, m.y, 'Raketen abgeschossen'); }
        } else this.damageEnemy(tgt as Enemy, dps * dt, 0.3);
        if (Math.random() < 0.3) this.fx.add({ x: tgt.x, y: tgt.y, color: '#bffff6', size: 1.4, max: 0.15 });
        continue;
      }
      if (t.cd <= 0 && Math.abs(wrapA(want - t.a)) < 0.15) {
        for (let p = 0; p < w.pellets; p++) {
          const a = t.a + (this.r() - 0.5) * 2 * w.jitter;
          if (w.rail) { this.fireRail(x + Math.cos(a) * 8, y + Math.sin(a) * 8, a, this.baseDmg * w.dmg, w.range, w.color); continue; }
          this.bullets.push({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: this.baseDmg * w.dmg, from: 'p', life: w.life, color: w.color, w: Math.min(w.w, 4), pierce: 0 });
        }
        t.cd = w.interval * this.tempo;
        if (w.mag && --t.mag <= 0) { t.mag = w.mag; t.cd = w.reload * this.tempo; }
        sfx.turretShot(this.turType, this.panAt(x));
      }
    }
  }

  /**
   * Schwere L-Türme (Zerstörer): schwenken nur in ihrem Bereich – nach außen und hinten, aber auch spitz nach vorn
   * über den Bug (die Schüsse fliegen über den Rumpf hinweg). Ohne Ziel zurück in Ruhestellung (geradeaus).
   */
  private updateLTurrets(dt: number): void {
    const mounts = this.ship.lMounts, w = this.lt;
    if (!mounts?.length || !w) return;
    const S = this.ship.size;
    const c = Math.cos(this.aimA + Math.PI / 2), sn = Math.sin(this.aimA + Math.PI / 2);
    for (const [i, t] of this.pL.entries()) {
      const mt = mounts[i], side = mt.x < 0 ? -1 : 1;
      const lx = mt.x * S, ly = mt.y * S;
      const x = this.px + lx * c - ly * sn, y = this.py + lx * sn + ly * c;
      t.cd -= dt;
      t.recoil = Math.max(0, t.recoil - dt * 3.5);
      t.flash = Math.max(0, t.flash - dt);
      const lo = (mt.min * Math.PI) / 180, hi = (mt.max * Math.PI) / 180;
      // Ziel im Schwenkbereich, nach Turmbefehl
      const relTo = (e: Enemy, d: number) => {
        const lead = w.rail ? 0 : d / w.speed;
        return wrapA(Math.atan2(e.y + e.vy * lead - y, e.x + e.vx * lead - x) - this.aimA) * side;
      };
      const tgt = this.pickTarget(x, y, w.range, this.orders.l, (e, d) => { const r = relTo(e, d); return r >= lo && r <= hi; });
      const want = tgt ? relTo(tgt, Math.hypot(tgt.x - x, tgt.y - y)) : 0;
      t.rel = clamp(turnTo(t.rel, tgt ? want : 0, dt * this.lTurn), lo, hi);
      if (!tgt || t.cd > 0 || Math.abs(want - t.rel) > 0.1) continue;
      // Schuss aus der Mündung
      const a0 = this.aimA + side * t.rel, L = S * LB_LEN * (1 - LB_ROOT);
      const mx = x + Math.cos(a0) * L, my = y + Math.sin(a0) * L;
      for (let p = 0; p < w.pellets; p++) {
        const a = a0 + (this.r() - 0.5) * 2 * w.jitter;
        if (w.rail) { this.fireRail(mx, my, a, this.baseDmg * w.dmg, w.range, w.color); continue; }
        this.bullets.push({ x: mx, y: my, vx: Math.cos(a) * w.speed + this.pvx * 0.3, vy: Math.sin(a) * w.speed + this.pvy * 0.3, dmg: this.baseDmg * w.dmg, from: 'p', life: w.life, color: w.color, w: Math.min(w.w, 5), pierce: 0 });
      }
      t.cd = w.interval * this.tempo;
      if (w.mag && --t.mag <= 0) { t.mag = w.mag; t.cd = w.reload * this.tempo; }
      t.recoil = 1;
      t.flash = 0.09;
      sfx.heavyShot(this.lTurType, this.panAt(x));
    }
  }

  private dronePos(k: number): [number, number] {
    const a = this.droneA + (k * Math.PI * 2) / Math.max(1, this.droneN);
    const r = this.ship.size * 0.5 + 18;
    return [this.px + Math.cos(a) * r, this.py + Math.sin(a) * r];
  }

  /**
   * Gegnerstärke wurde (z. B. im Pausenmenü) verstellt: alle Gegner im Feld im selben Verhältnis anpassen –
   * angeschlagene bleiben anteilig angeschlagen
   */
  retune(): void {
    const v = enemyTuneVersion();
    if (v === this.tuneVer) return;
    this.tuneVer = v;
    const t = enemyTune(), rh = t.hull / this.tune.hull, rs = t.shield / this.tune.shield;
    this.tune = t;
    for (const e of this.enemies) { e.hp *= rh; e.max *= rh; e.sh *= rs; e.shMax *= rs; }
  }

  /** aktuelle Stufe (für die Werte-Tabelle im Pausenmenü) */
  get tuneLevel(): Level { return this.level; }

  private updateEnemies(dt: number): void {
    this.retune();
    this.updateClusters(dt);
    // Schilde laden nach 3 s ohne Treffer wieder auf (ein Viertel je Sekunde)
    for (const e of this.enemies) {
      e.shT += dt;
      e.shFlash = Math.max(0, e.shFlash - dt);
      // Piratenfrachter haben keinen Schildgenerator, der nachlädt
      if (e.shT > 3 && e.sh < e.shMax && e.kind !== 'cargo') e.sh = Math.min(e.shMax, e.sh + e.shMax * 0.25 * dt);
      if (e.dodgeCd) e.dodgeCd = Math.max(0, e.dodgeCd - dt);
    }
    // Kommandant: lädt die Schilde naher Verbündeter, auch unter Beschuss
    const cmds = this.enemies.filter((e) => e.elite === 'kommandant');
    for (const e of this.enemies) {
      e.cmdBy = undefined;
      if (!cmds.length || e.elite === 'kommandant' || e.parent || e.plat || e.hive || e.nest) continue;
      const c = cmds.find((q) => Math.hypot(q.x - e.x, q.y - e.y) < CMD_R);
      if (!c) continue;
      e.cmdBy = c;
      if (e.sh < e.shMax) e.sh = Math.min(e.shMax, e.sh + e.shMax * 0.2 * dt);
    }
    const fx = this.fx1, fy = this.fy1;
    // Schildträger schützen Verbündete in der Nähe
    const shielders = this.enemies.filter((e) => e.kind === 'schild' || e.kind === 'xs');
    // Ohne Verbündete fliehen Schildträger aus dem Feld
    const alone = shielders.length > 0 && shielders.length === this.enemies.length;
    if (alone) for (const e of shielders) {
      // vom Frachter weg; außer Sicht und weit genug weg verschwinden sie
      const ax = e.x - fx, ay = e.y - fy, ad = Math.hypot(ax, ay) || 1;
      if (ad > 1100 && Math.hypot(e.x - this.px, e.y - this.py) > 700) { this.enemies = this.enemies.filter((q) => q !== e); continue; }
      e.ang = turnTo(e.ang, Math.atan2(ay, ax), TURN[e.kind] * dt);
      e.vx = Math.cos(e.ang) * 130;
      e.vy = Math.sin(e.ang) * 130;
      e.x = clamp(e.x + e.vx * dt, 20, this.WW - 20);
      e.y = clamp(e.y + e.vy * dt, 20, this.WH - 20);
    }
    if (alone) return;
    for (const e of this.enemies) {
      if (e.parent) { e.shielded = false; continue; }
      e.shielded = e.kind === 'boss' ? this.enemies.some((q) => q.parent === e) : shielders.some((s) => s !== e && Math.hypot(s.x - e.x, s.y - e.y) < 115);
    }
    for (const e of this.enemies) {
      const s = SPEC[e.kind];
      e.flash = Math.max(0, e.flash - dt);
      if (e.parent) {
        // Geschützturm am Boss (dreht frei, sitzt fest auf seinem Sockel)
        const p = e.parent, a = p.ang + Math.PI / 2;
        const c = Math.cos(a), sn = Math.sin(a);
        e.x = p.x + e.ox! * c - e.oy! * sn;
        e.y = p.y + e.ox! * sn + e.oy! * c;
        e.vx = p.vx; e.vy = p.vy;
        const pw = this.wardOf(p);
        const pfx = pw ? this.wx(pw) : this.px, pfy = pw ? this.wy(pw) : this.py;
        if (e.weapon === 'laser') { this.updateLaser(e, dt, pfx, pfy); continue; }
        e.cd -= dt;
        if (e.weapon === 'brut' && p.nest) {
          if (e.cd <= 0) { e.cd = Math.max(6, 10 - this.level * 0.6) + this.r() * 3; this.nestBrood(e); }
          continue;
        }
        if (e.weapon === 'brut') {
          // Brutkasten des Brutschiffs: entlässt alle paar Sekunden zwei Kha'ak-Jäger (solange nur wenige unterwegs sind, höchstens dreimal)
          if (e.cd <= 0) {
            e.cd = 12 + this.r() * 2;
            // höchstens drei Bruten je Brutkasten, damit der Kampf nicht endlos wird
            if ((e.brood ?? 0) < 3 && this.enemies.length < 56 && this.enemies.filter((q) => q.kind === 'kj').length < 4) {
              e.brood = (e.brood ?? 0) + 1;
              for (let q = 0; q < 2; q++) {
                const j = this.makeEnemy('kj', e.x + (q - 0.5) * 14, e.y);
                const a = p.ang + (q - 0.5) * 1.2;
                j.ang = a; j.vx = Math.cos(a) * 200; j.vy = Math.sin(a) * 200; j.target = 'p';
                this.enemies.push(j);
              }
              this.fx.add({ x: e.x, y: e.y, color: '#c77dff', size: 4, kind: 'ring', max: 0.5 });
            }
          }
          continue;
        }
        const tx = this.r() < 0.5 || !pw ? this.px : pfx, ty = tx === this.px ? this.py : pfy;
        if (e.weapon === 'plasma') {
          if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < PLASMA_RANGE) {
            e.cd = (this.level >= 4 ? 2.6 : 3.2) + this.r() * 0.8;
            // dicke, langsame Plasmakugel: leicht gestreut, gut sichtbar, schwer
            const a2 = Math.atan2(ty - e.y, tx - e.x) + (this.r() - 0.5) * 0.08;
            this.enemyShot(e, a2, 175, 14, '#ff6a3d', 6, (PLASMA_RANGE + 40) / 175);
            // aus den Mündungen, nicht aus der Turmmitte
            const pb = this.bullets[this.bullets.length - 1];
            pb.x += Math.cos(a2) * 19; pb.y += Math.sin(a2) * 19;
          }
          continue;
        }
        if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < TURRET_RANGE) {
          e.cd = 2.2 + this.r() * 0.8;
          const a2 = Math.atan2(ty - e.y, tx - e.x), v = this.side === 'pirate' ? 250 : 280;
          for (let q = 0; q < 2; q++) this.enemyShot(e, a2 + (q - 0.5) * 0.1, v, 5.5, this.side === 'pirate' ? '#ffd27a' : '#ff5c6c', 2, (TURRET_RANGE + 40) / v);
        }
        continue;
      }
      // Kha'ak-Turmplattformen und Nebennester (Nest-Einsatz) stehen fest
      if (e.plat) { this.updatePlat(e, dt); continue; }
      if (e.hive) { this.updateHive(e, dt); continue; }
      // Kha'ak im Cluster: Platz im Dreieck halten (Spitze in Flugrichtung), nicht feuern
      if (e.cl != null) {
        const c = this.clusters.get(e.cl);
        if (c) {
          const cr = Math.cos(c.ang + Math.PI / 2), sr = Math.sin(c.ang + Math.PI / 2);
          const gx = c.x + e.slotX! * cr - e.slotY! * sr, gy = c.y + e.slotX! * sr + e.slotY! * cr;
          // fest im Verbund: Platz genau halten
          e.vx = c.vx + (gx - e.x) * 12; e.vy = c.vy + (gy - e.y) * 12;
          e.x = clamp(e.x + e.vx * dt, 20, this.WW - 20);
          e.y = clamp(e.y + e.vy * dt, 20, this.WH - 20);
          e.ang = wrapA(turnTo(e.ang, e.slotFlip ? c.ang + Math.PI : c.ang, TURN[e.kind] * 3 * dt));
          continue;
        }
        e.cl = undefined;
      }
      // Kyon-Strahl fertig geladen: trifft sofort entlang der Blickrichtung (Korvette: Fächer aus drei Strahlen)
      if (e.kyT != null) {
        e.kyT -= dt;
        if (e.kyT <= 0) {
          e.kyT = undefined;
          if (e.kind === 'kk') for (let q = -1; q <= 1; q++) this.fireKyon(e, e.ang + q * 0.22, 8);
          else this.fireKyon(e, e.ang, e.kind === 'ka' ? 7 : 8);
        }
      }
      // Abfangjäger: zu lange im Visier oder getroffen → Phasensprung zur Seite
      if (e.kind === 'ka') {
        e.jumpCd = (e.jumpCd ?? 1) - dt;
        const pa = Math.atan2(e.y - this.py, e.x - this.px), pd = Math.hypot(e.x - this.px, e.y - this.py);
        const aimed = pd < this.reach + 40 && Math.abs(wrapA(pa - this.aimA)) < 0.12;
        e.aimedT = aimed ? (e.aimedT ?? 0) + dt : Math.max(0, (e.aimedT ?? 0) - dt);
        if (e.jumpCd <= 0 && (e.jumpReq || e.aimedT > 0.6)) this.phaseJump(e);
      }
      // Korvette: alle 10 s abwechselnd aus einem ihrer zwei Brutkästen ein Vierer-Cluster Späher (höchstens zweimal)
      if (e.kind === 'kk') {
        e.broodT = (e.broodT ?? 3 + this.r() * 3) - dt;
        if (e.broodT <= 0 && (e.brood ?? 0) < 2) {
          e.broodT = 10;
          if (this.broodRoom()) {
            e.brood = (e.brood ?? 0) + 1;
            // Brutöffnungen im Bild: seitlich hinten (Bildanteil ±0,18 quer, 0,16 hinter der Mitte)
            const size = e.r * 3.5, a = e.ang + Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
            const ox = (e.brood % 2 ? -0.18 : 0.18) * size, oy = 0.16 * size;
            const bx = e.x + ox * c - oy * sn, by = e.y + ox * sn + oy * c;
            this.spawnCluster(4, bx, by);
            this.fx.add({ x: bx, y: by, color: '#c77dff', size: 2, kind: 'ring', max: 0.4 });
          }
        }
      }
      // Piratenfrachter (Überfall) fliegen stur zum Tor
      if (e.kind === 'cargo') { this.updateCargo(e, dt); continue; }
      // Nest: steht still; ohne Brutöffnungen feuert der Kern Ringe
      if (e.nest) { this.updateNest(e, dt); continue; }
      // Abfangen: wer dem Jäger nahe kommt, kämpft mit ihm; Raketen- und Kanonenboote bleiben stur am Frachter
      const toP = Math.hypot(this.px - e.x, this.py - e.y);
      const ew = this.wardOf(e);
      if (!ew) e.target = 'p';
      else if (e.kind !== 'kanone' && e.kind !== 'rakete' && e.kind !== 'boss') {
        // Konvoi: die Angreifer bleiben stur an ihrem Frachter, nur ganz nah lassen sie sich ablenken
        if (e.target === 'f' && toP < (this.mission === 'konvoi' || this.mission === 'station' ? AGGRO * 0.55 : AGGRO) && this.outcome !== 'player') e.target = 'p';
        else if (e.target === 'p' && toP > AGGRO * 2.2) e.target = 'f';
      } else e.target = 'f';
      const onP = e.target === 'p' || !ew;
      const tx = onP || !ew ? this.px : this.wx(ew), ty = onP || !ew ? this.py : this.wy(ew);
      const tvx = onP ? this.pvx : 0, tvy = onP ? this.pvy : this.moving ? this.fVy : 0;
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      // Vorhaltepunkt für die eigenen Bordkanonen
      const lt = d / (SHOT_V[e.kind] ?? 300);
      const aimAt = Math.atan2(ty + tvy * lt - e.y, tx + tvx * lt - e.x);
      const fighter = FIGHTERS.has(e.kind);
      let want: number, sp = s.speed, face = aimAt;
      if (fighter) {
        // Angriff in Anflügen: anfliegen, Salve abgeben, abdrehen und in einem Bogen weg, dann neuer Anflug.
        // Auf den Jäger greifen höchstens zwei zugleich an – die anderen kreisen solange in Abstand.
        if (e.brk && e.brk > 0) {
          e.brk -= dt;
          want = e.brkA!;
          sp = s.speed * 1.15;
        } else {
          const attackers = onP ? this.enemies.filter((q) => q !== e && q.target === 'p' && FIGHTERS.has(q.kind) && (q.runT ?? 0) > 0).length : 0;
          // je Gruppe höchstens zwei zugleich, insgesamt je nach Stärke deines Schiffs mehr (mehr Gruppen = mehr Druck)
          const mates = onP && e.grp != null ? this.enemies.filter((q) => q !== e && q.grp === e.grp && q.target === 'p' && (q.runT ?? 0) > 0).length : 0;
          // Schwärme greifen breiter an: bis zu fünf aus dem Schwarm zugleich, dazu drei über der Gesamtgrenze
          if (onP && (attackers >= this.attackCap + (e.swarm ? 3 : 0) || mates >= (e.swarm ? 5 : 2)) && d < 420) {
            // warten: seitlich um den Jäger kreisen
            want = Math.atan2(dy, dx) + e.dir * (d < 260 ? 2.1 : 1.4);
            sp = s.speed * 0.8;
          } else {
            want = aimAt;
            e.runT = (e.runT ?? 0) + dt;
            // Kyon-Jäger: zwei Strahlen je Anflug
            const salvo = e.kind === 'kj' || e.kind === 'ka' ? 2 : 3;
            // Anflug vorbei: Salve abgegeben, zu nah dran oder zu lange
            if ((e.shots ?? 0) >= salvo || d < (onP ? 90 : 95) || e.runT > 4) {
              e.dir = this.r() < 0.5 ? 1 : -1;
              e.brk = 1.5 + this.r() * 1.1;
              e.brkA = e.ang + e.dir * (0.9 + this.r() * 0.6);
              e.shots = 0;
              e.runT = 0;
            }
          }
        }
        face = want;
      } else {
        let wx: number, wy: number;
        if (e.kind === 'schild' || e.kind === 'xs') {
          // zur Mitte der Verbündeten
          const allies = this.enemies.filter((q) => q !== e && !q.parent && q.kind !== 'schild' && q.kind !== 'xs');
          const mx = allies.length ? allies.reduce((a2, q) => a2 + q.x, 0) / allies.length : fx;
          const my = allies.length ? allies.reduce((a2, q) => a2 + q.y, 0) / allies.length : fy - 200;
          const ddx = mx - e.x, ddy = my - e.y, dd = Math.hypot(ddx, ddy) || 1;
          wx = (ddx / dd) * clamp(dd / 60, 0, 1); wy = (ddy / dd) * clamp(dd / 60, 0, 1);
          // Abstand zum Jäger halten
          if (toP < 120) { wx -= (this.px - e.x) / toP; wy -= (this.py - e.y) / toP; }
          face = Math.atan2(wy, wx);
        } else {
          // Kanonen-, Raketenboote, Xenon M und Boss: Abstand halten, langsam kreisen, Bug zum Ziel drehen
          const keep = e.kind === 'boss' ? 240 : e.kind === 'kanone' ? 190 : e.kind === 'rakete' ? 240 : e.kind === 'kk' ? 230 : 170;
          const radial = clamp((d - keep) / 60, -1, 1);
          const side = Math.abs(radial) < 0.5 ? 0.45 : 0.15;
          wx = (dx / d) * radial + (-dy / d) * e.dir * side;
          wy = (dy / d) * radial + (dx / d) * e.dir * side;
          if (e.kind === 'boss') face = Math.atan2(e.vy, e.vx);
        }
        const wl = Math.hypot(wx, wy);
        want = Math.atan2(wy, wx);
        sp = s.speed * clamp(wl, 0, 1);
      }
      if (e.elite === 'gepanzert') sp *= 0.7;
      else if (e.elite === 'flink') sp *= 1.25;
      // am Kartenrand umkehren
      if (e.x < 60 || e.x > this.WW - 60 || e.y < 60 || e.y > this.WH - 60) {
        want = Math.atan2(clamp(e.y, 200, this.WH - 200) - e.y, clamp(e.x, 200, this.WW - 200) - e.x);
        if (fighter) face = want;
      }
      e.ang = wrapA(turnTo(e.ang, face, TURN[e.kind] * (e.elite === 'flink' ? 1.4 : 1) * dt));
      // Jäger fliegen dorthin, wohin ihre Nase zeigt; die schweren Schiffe können seitlich versetzen
      const mvA = fighter ? e.ang : want;
      const k = Math.min(1, dt * (fighter ? 3 : 2));
      e.vx += (Math.cos(mvA) * sp - e.vx) * k;
      e.vy += (Math.sin(mvA) * sp - e.vy) * k;
      e.x = clamp(e.x + e.vx * dt, 20, this.WW - 20);
      e.y = clamp(e.y + e.vy * dt, 20, this.WH - 20);
      // Bordkanonen: nur wenn das Ziel genau vor dem Bug liegt
      e.cd -= dt;
      const off = Math.abs(wrapA(aimAt - e.ang));
      const range = e.kind === 'n' || e.kind === 'ks' ? 210 : e.kind === 'boss' ? 480 : e.kind === 'rakete' ? 360 : e.kind === 'kj' || e.kind === 'ka' || e.kind === 'kk' ? KYON_LEN - 20 : 320;
      const cone = e.kind === 'kanone' ? 0.2 : e.kind === 'rakete' ? 0.5 : e.kind === 'kk' ? 0.3 : 0.12;
      // Jäger feuern nur im Anflug, nicht beim Abdrehen
      const breaking = fighter && !!e.brk && e.brk > 0;
      if (e.cd <= 0 && !breaking && e.kyT == null && d < range && (e.kind === 'boss' || off < cone)) {
        const a = e.ang + (this.r() - 0.5) * (fighter ? 0.14 : 0.06);
        if (e.kind === 'jaeger') { e.cd = 0.4; e.shots = (e.shots ?? 0) + 1; this.enemyShot(e, a, 300, 6, '#ffb070'); }
        else if (e.kind === 'kanone') { e.cd = 2.4; for (let q = 0; q < 3; q++) this.enemyShot(e, a + (q - 1) * 0.08, 240, 8, '#ffd27a'); }
        else if (e.kind === 'rakete') { e.cd = 4; this.eMissiles.push({ x: e.x, y: e.y, vx: Math.cos(e.ang) * 90, vy: Math.sin(e.ang) * 90, hp: 6, life: 7, target: e.target, wd: e.wd }); }
        else if (e.kind === 'n') { e.cd = 0.32; e.shots = (e.shots ?? 0) + 1; this.enemyShot(e, a, 340, 4, '#ff5c6c'); }
        else if (e.kind === 'm') { e.cd = 1.8; this.enemyShot(e, a, 430, 11, '#ff3b4a', 3); }
        else if (e.kind === 'ks') { e.cd = 0.36; e.shots = (e.shots ?? 0) + 1; this.enemyShot(e, a, 360, 3.5, '#d9a6ff'); }
        // Kyon: erst laden (dünne Ziellinie), dann trifft der Strahl
        else if (e.kind === 'kj' || e.kind === 'ka') { e.cd = e.kind === 'ka' ? 0.8 : 1; e.shots = (e.shots ?? 0) + 1; e.kyT = 0.35; }
        else if (e.kind === 'kk') { e.cd = 3.6; e.kyT = 0.6; }
        else if (e.kind === 'boss') {
          e.cd = 3.5;
          // erst ohne Türme feuert der Kern: Fächer bzw. Ring
          if (!e.shielded) {
            if (this.side === 'khaak') {
              // Brutschiff-Kern: Ring aus Kyon-Strahlen, leicht versetzt
              const o = this.r() * Math.PI;
              for (let q = 0; q < 8; q++) this.fireKyon(e, o + (q / 8) * Math.PI * 2, 10, KYON_LEN + 200);
            } else {
              const n = this.side === 'pirate' ? 5 : 10;
              for (let q = 0; q < n; q++) this.enemyShot(e, this.side === 'pirate' ? aimAt + (q - 2) * 0.16 : (q / n) * Math.PI * 2, 240, 9, this.side === 'pirate' ? '#ffd27a' : '#ff3b4a', 2.5);
            }
          }
        } else e.cd = 1;
      }
    }
    // gegnerische Raketen
    for (const m of this.eMissiles) {
      const mw = m.target === 'f' ? this.wardOf(m) : null;
      const tx = mw ? this.wx(mw) : this.px, ty = mw ? this.wy(mw) : this.py;
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
      m.vx += (dx / d) * 220 * dt;
      m.vy += (dy / d) * 220 * dt;
      const v = Math.hypot(m.vx, m.vy);
      if (v > 150) { m.vx *= 150 / v; m.vy *= 150 / v; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (Math.random() < 0.6) this.fx.add({ x: m.x, y: m.y, color: '#ff8a5c', size: 1.2, max: 0.3 });
      const hw = this.wardAt(m.x, m.y, 2);
      if (hw) { this.hitWard(hw, 18 * this.enemyDmg * this.fScale, m.x, m.y); m.life = 0; this.explode(m.x, m.y, '#ff8a5c', 0.6, false); }
      else if (Math.hypot(this.px - m.x, this.py - m.y) < this.ship.r + 2) { this.damagePlayer(18 * this.enemyDmg); m.life = 0; this.explode(m.x, m.y, '#ff8a5c', 0.6, false); }
    }
    this.eMissiles = this.eMissiles.filter((m) => m.life > 0 && m.hp > 0);
  }

  /**
   * Kyon-Strahl: trifft sofort alles auf der Linie (Jäger, Frachter); gegen Schilde ×1,5 – Kha'ak brennen Schilde
   * schnell durch, die Hülle hält länger
   */
  private fireKyon(e: Enemy, a: number, dmg: number, len = KYON_LEN, start: [number, number] = [e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r], color = '#b45cff', vsShield = KYON_SHIELD): void {
    const cx = Math.cos(a), cy = Math.sin(a);
    const [x0, y0] = start;
    const dist = (x: number, y: number): number => {
      const t = clamp((x - x0) * cx + (y - y0) * cy, 0, len);
      return Math.hypot(x0 + cx * t - x, y0 + cy * t - y);
    };
    let end = len;
    if (dist(this.px, this.py) < this.ship.r + 2) {
      this.damagePlayer(dmg * this.enemyDmg, vsShield);
      end = Math.min(end, (this.px - x0) * cx + (this.py - y0) * cy);
    }
    for (const w of this.wards) {
      if (w.dead || !this.beamOnWard(w, dist)) continue;
      const wx = this.wx(w), wy = this.wy(w), t = Math.max(0, (wx - x0) * cx + (wy - y0) * cy);
      this.hitWard(w, dmg * this.enemyDmg * this.fScale, x0 + cx * t, y0 + cy * t);
      end = Math.min(end, t);
    }
    this.rails.push({ x1: x0, y1: y0, x2: x0 + cx * end, y2: y0 + cy * end, t: 0.22, color });
    const sx = (e.x - this.camX) * this.zoom, sy = (e.y - this.camY) * this.zoom;
    if (sx > -40 && sx < this.w + 40 && sy > -40 && sy < this.h + 40) sfx.kyon(this.panAt(e.x));
  }

  /** Phasensprung des Abfangjägers: 90–140 px quer zur Schusslinie des Jägers versetzen */
  private phaseJump(e: Enemy): void {
    const pa = Math.atan2(e.y - this.py, e.x - this.px) + (this.r() < 0.5 ? 1 : -1) * Math.PI / 2;
    const jd = 90 + this.r() * 50;
    this.fx.burst(e.x, e.y, '#d08cff', 10, 120, 1, 'spark', 0.3);
    e.x = clamp(e.x + Math.cos(pa) * jd, 30, this.WW - 30);
    e.y = clamp(e.y + Math.sin(pa) * jd, 30, this.WH - 30);
    this.fx.add({ x: e.x, y: e.y, color: '#d08cff', size: 3, kind: 'ring', max: 0.35 });
    e.jumpCd = 3.5; e.aimedT = 0; e.jumpReq = false;
    sfx.phase(this.panAt(e.x));
  }

  private enemyShot(e: Enemy, a: number, v: number, dmg: number, color: string, w = 2, life = 1.8): void {
    this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: dmg * this.enemyDmg, from: 'e', life, color, w, pierce: 0 });
    // nur hörbar, wenn der Schütze im Bild ist
    const sx = (e.x - this.camX) * this.zoom, sy = (e.y - this.camY) * this.zoom;
    if (sx > -40 && sx < this.w + 40 && sy > -40 && sy < this.h + 40) sfx.enemyShot(this.panAt(e.x));
  }

  /**
   * Laserturm: zielt auf Jäger oder Frachter, lädt LASER_CHARGE s sichtbar auf (dünne Ziellinie, Richtung steht fest),
   * dann brennt der Strahl LASER_FIRE s – wer rechtzeitig ausweicht, bleibt heil.
   */
  private updateLaser(e: Enemy, dt: number, fx: number, fy: number): void {
    if (e.beamT && e.beamT > 0) {
      e.beamT -= dt;
      if (e.beamT > 0 && e.beamT < LASER_FIRE) {
        const a = e.beamA!, cx = Math.cos(a), cy = Math.sin(a);
        const dist = (x: number, y: number): number => {
          const t = clamp((x - e.x) * cx + (y - e.y) * cy, 0, LASER_LEN);
          return Math.hypot(e.x + cx * t - x, e.y + cy * t - y);
        };
        if (dist(this.px, this.py) < this.ship.r - 3) this.damagePlayer(LASER_DPS * this.enemyDmg * dt);
        // Schutzziele: Frachter entlang der Längsachse prüfen; Schaden gesammelt, damit nicht jedes Bild Funken sprühen
        const hw = this.wards.find((w) => !w.dead && this.beamOnWard(w, dist));
        if (hw) {
          e.beamAcc = (e.beamAcc ?? 0) + LASER_DPS * this.enemyDmg * dt;
          if (e.beamAcc > 4) { const t = clamp((this.wx(hw) - e.x) * cx + (this.wy(hw) - e.y) * cy, 0, LASER_LEN); this.hitWard(hw, e.beamAcc * this.fScale, e.x + cx * t, e.y + cy * t); e.beamAcc = 0; }
        }
      }
      return;
    }
    e.cd -= dt;
    const toP = this.r() < 0.55 || !this.liveWards.length;
    const tx = toP ? this.px : fx, ty = toP ? this.py : fy;
    if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < LASER_LEN - 20) {
      // Kha'ak-Kyon-Türme laden etwas länger nach (das Brutschiff bringt dafür Jäger mit)
      e.cd = (this.level >= 4 ? 3 : 3.8) + this.r() + (this.side === 'khaak' ? 1.5 : 0);
      e.beamT = LASER_CHARGE + LASER_FIRE;
      e.beamA = Math.atan2(ty - e.y, tx - e.x);
      e.beamAcc = 0;
    }
  }

  private rockAt(x: number, y: number): Rock | undefined {
    return this.rocks.find((k) => Math.hypot(k.x - x, k.y - y) < k.r);
  }

  private updateShots(dt: number): void {
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      // Asteroiden bieten Deckung
      const rock = this.rocks.length ? this.rockAt(b.x, b.y) : undefined;
      if (rock) { this.fx.burst(b.x, b.y, '#a89a8a', 3, 90, 1.4, 'chunk', 0.3); continue; }
      if (b.from === 'p') {
        const em = this.eMissiles.find((m) => Math.hypot(m.x - b.x, m.y - b.y) < 9);
        if (em) { em.hp -= b.dmg; if (em.hp <= 0) { this.explode(em.x, em.y, '#ff8a5c', 0.5, false); this.gain(30, em.x, em.y, 'Raketen abgeschossen'); } continue; }
        const mine = this.mines.find((m) => Math.hypot(m.x - b.x, m.y - b.y) < 10);
        if (mine) { mine.hp -= b.dmg; if (mine.hp <= 0) this.detonate(mine); continue; }
        // Der geschützte Boss-Rumpf lässt Geschosse durch – so erreicht man auch die Türme dahinter
        const e = this.enemies.find((q) => !b.hit?.has(q) && !(q.kind === 'boss' && q.shielded) && Math.hypot(q.x - b.x, q.y - b.y) < q.r + 3);
        if (e) {
          this.damageEnemy(e, b.dmg, 0.3, b.hullPierce ?? 0);
          // Thermal: glühende Funken, wo die Hitze durch den Schild auf die Hülle schlägt
          if (b.hullPierce) this.fx.burst(b.x, b.y, '#ff9d2e', 4, 90, 1.4, 'spark', 0.3);
          if (b.splash) {
            // Torpedo: Flächenschaden in der Umgebung
            for (const q of [...this.enemies]) if (q !== e && !(q.kind === 'boss' && q.shielded) && Math.hypot(q.x - b.x, q.y - b.y) < b.splash + q.r) this.damageEnemy(q, b.dmg * 0.5);
            this.fx.add({ x: b.x, y: b.y, color: b.color, size: b.splash * 0.5, kind: 'ring', max: 0.3 });
          }
          this.fx.burst(b.x, b.y, '#bffff6', 3, 120, 1.2, 'spark', 0.2);
          if (b.pierce > 0) { b.pierce--; (b.hit ??= new Set()).add(e); keep.push(b); }
          continue;
        }
      } else {
        if (Math.hypot(this.px - b.x, this.py - b.y) < this.ship.r) { this.damagePlayer(b.dmg); this.fx.burst(b.x, b.y, b.color, 4, 120, 1.2, 'spark', 0.2); continue; }
        const hw = this.wardAt(b.x, b.y);
        if (hw) { this.hitWard(hw, b.dmg * this.fScale, b.x, b.y); continue; }
        // geschleppte und treibende Container (Bergung) gehen zu Bruch
        const cr = this.crates.length ? this.crates.find((c) => !c.done && Math.hypot(c.x - b.x, c.y - b.y) < 11) : undefined;
        if (cr) { this.hitCrate(cr, b.dmg); continue; }
      }
      keep.push(b);
    }
    this.bullets = keep;
    const km: Missile[] = [];
    for (const m of this.missiles) {
      m.life -= dt;
      if (m.target && !this.enemies.includes(m.target)) m.target = this.enemies.find((e) => !(e.kind === 'boss' && e.shielded)) ?? null;
      if (m.target) {
        const dx = m.target.x - m.x, dy = m.target.y - m.y, d = Math.hypot(dx, dy) || 1;
        // Flinker Elite-Gegner: weicht kurz vor dem Einschlag zur Seite aus, die Rakete verliert ihr Ziel
        if (m.target.elite === 'flink' && d < 150 && !m.target.dodgeCd) { this.dodgeMissile(m.target, m); m.target = null; }
      }
      if (m.target) {
        const dx = m.target.x - m.x, dy = m.target.y - m.y, d = Math.hypot(dx, dy) || 1;
        // Lenkung: die Rakete dreht ihren Flugvektor (begrenzte Drehrate) auf den Abfangpunkt – dort, wo das Ziel
        // ankommt, wenn sie es erreicht – statt nur dorthin zu beschleunigen (das ließ sie um das Ziel kreisen)
        let v = Math.hypot(m.vx, m.vy) || 1;
        const t = Math.min(2, d / Math.max(200, v));
        const ix = m.target.x + m.target.vx * t - m.x, iy = m.target.y + m.target.vy * t - m.y;
        const cur = Math.atan2(m.vy, m.vx), err = wrapA(Math.atan2(iy, ix) - cur);
        const turn = m.def.turn * (m.mini ? 1.3 : 1) * dt;
        const na = cur + clamp(err, -turn, turn);
        // weit vom Kurs (Ziel seitlich oder hinter ihr): Gas weg, damit der Wendekreis enger wird
        const want = Math.abs(err) > 1.2 ? m.def.v * 0.55 : m.def.v;
        v = v < want ? Math.min(want, v + m.def.acc * dt) : Math.max(want, v - m.def.acc * 1.5 * dt);
        m.vx = Math.cos(na) * v;
        m.vy = Math.sin(na) * v;
        // Schwarmrakete trifft erst als Lenkköpfe (vorher fliegt sie durch)
        if (d < m.target.r + 4 && m.split == null) { this.missileHit(m, m.target); continue; }
      }
      // Schwarmrakete: kurz nach dem Start in kleine Lenkköpfe zerfallen, die sich verschiedene Ziele suchen
      if (m.split != null && (m.split -= dt) <= 0) {
        const near = [...this.enemies].filter((e) => !(e.kind === 'boss' && e.shielded)).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y));
        const k0 = Math.floor(this.r() * 3);
        for (let k = 0; k < (m.def.split ?? 0); k++) {
          const a = Math.atan2(m.vy, m.vx) + (k - 1.5) * 0.5;
          km.push({ x: m.x, y: m.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, target: near[(k0 + k) % Math.max(1, near.length)] ?? null, life: m.def.life, def: m.def, dmg: m.dmg, mini: true });
        }
        this.fx.burst(m.x, m.y, '#ffd27a', 6, 120, 1.2, 'spark', 0.2);
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      // Rauchspur hinter dem Heck
      const v = Math.hypot(m.vx, m.vy) || 1;
      if (Math.random() < 0.8) this.fx.add({ x: m.x - (m.vx / v) * 12, y: m.y - (m.vy / v) * 12, color: fighterKind() === 'argon' ? '#7fe8ff' : '#ffb070', size: 1.3, max: 0.3 });
      if (m.life > 0) km.push(m);
    }
    this.missiles = km;
  }

  private updateField(dt: number): void {
    for (const k of this.rocks) {
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.rot += k.vr * dt;
      // Jäger prallt ab
      const d = Math.hypot(this.px - k.x, this.py - k.y);
      const pr = k.r + this.ship.r - 2;
      if (d < pr && d > 0) {
        const nx = (this.px - k.x) / d, ny = (this.py - k.y) / d;
        this.px = k.x + nx * pr;
        this.py = k.y + ny * pr;
        this.pvx = nx * 120; this.pvy = ny * 120;
        if (this.dashT <= 0) this.damagePlayer(3);
      }
    }
    // Felsen weit hinter dem Frachter: solange der Abschnitt dauert, voraus neu; danach verschwinden sie
    for (const k of this.rocks) if (k.y > this.fY + 700) {
      if (this.section === 'rocks') { [k.x, k.y] = this.fieldPoint(); k.y = Math.min(k.y, this.fY - LEG * 0.6); }
      else k.r = 0;
    }
    this.rocks = this.rocks.filter((k) => k.r > 0);
    for (const m of this.mines) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.armed < 0) {
        const near = Math.hypot(this.px - m.x, this.py - m.y) < 44 || !!this.wardAt(m.x, m.y, 14) || this.enemies.some((e) => Math.hypot(e.x - m.x, e.y - m.y) < 40);
        if (near) { m.armed = 0.7; sfx.warn(); }
      } else {
        m.armed -= dt;
        if (m.armed <= 0) this.detonate(m);
      }
    }
    this.mines = this.mines.filter((m) => m.hp > 0);
    if (this.section !== 'mines' && this.mutator?.id !== 'mines' && this.mines.length && this.waveT < 0.1) this.mines = [];
  }

  private detonate(m: Mine): void {
    if (m.hp <= -99) return;
    m.hp = -100;
    this.explode(m.x, m.y, '#ffb547', 1.2);
    this.fx.add({ x: m.x, y: m.y, color: '#ffd27a', size: 20, kind: 'ring', max: 0.4 });
    if (Math.hypot(this.px - m.x, this.py - m.y) < 70 && this.dashT <= 0) this.damagePlayer(25);
    for (const w of this.wards) if (!w.dead && this.wardHit(w, m.x, m.y, 40)) this.hitWard(w, 30, m.x, m.y);
    for (const e of [...this.enemies]) if (Math.hypot(e.x - m.x, e.y - m.y) < 70) this.damageEnemy(e, 60);
    this.gain(20, m.x, m.y, 'Minen gesprengt');
  }

  private updatePickups(dt: number): void {
    for (const p of this.pickups) {
      p.life -= dt;
      const d = Math.hypot(this.px - p.x, this.py - p.y);
      if (d < 80) { p.x += ((this.px - p.x) / d) * 200 * dt; p.y += ((this.py - p.y) / d) * 200 * dt; }
      if (d < 22) {
        p.life = 0;
        this.loot++;
        if (p.kind === 'repair') {
          for (const w of this.liveWards) w.hull = Math.min(w.max, w.hull + w.max * 0.08);
          this.hull = Math.min(100, this.hull + 20);
          // Station: ein zerstörter Turm wird wieder instand gesetzt
          const st = this.wards.find((w) => w.kind === 'station' && !w.dead);
          const broken = st?.tur.find((t) => t.hp <= 0);
          if (broken) broken.hp = broken.max;
          this.floats.add(this.px, this.py - 20, broken ? 'Reparatur: Stationsturm instand' : 'Reparatur', '#6be38f', 13);
        }
        else if (p.kind === 'shield') { this.shield = this.shieldMax; this.floats.add(this.px, this.py - 20, 'Schild voll', '#7fd8ff', 13); }
        else if (p.kind === 'ammo') { this.missileCd = 0; this.ammo = this.ammoMax; this.floats.add(this.px, this.py - 20, this.launchers.length ? 'Munitionskiste: Raketenlager voll' : 'Munition (kein Werfer)', '#ffd27a', 13); }
        // Raketen-Fundstück: die Hälfte des Lagers (mindestens vier), Werfer sofort bereit
        else { this.missileCd = 0; this.ammo = Math.min(this.ammoMax, this.ammo + Math.max(4, Math.round(this.ammoMax * 0.5))); this.floats.add(this.px, this.py - 20, this.launchers.length ? 'Raketen nachgeladen' : 'Raketen (kein Werfer)', '#ffd27a', 13); }
        sfx.pickup();
      }
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }

  private gain(base: number, x: number, y: number, cat = 'Abschüsse'): void {
    const p = this.score.add(base, cat);
    if (p >= 50) this.floats.add(x, y - 14, `+${p}`, '#ffd27a', p >= 500 ? 18 : 13);
  }

  /** bypass: Anteil des Schadens, der durch fremde Schilde dringt (Thermal-Desintegrator: teilweise) */
  /** Raketentreffer: Schaden, bei schweren Raketen Druckwelle, bei Störraketen Schild aus */
  private missileHit(m: Missile, e: Enemy): void {
    const def = m.def;
    // Wirkung je Zielklasse (schwere Raketen gegen große Ziele stark, gegen Jäger schwach)
    let dmg = m.dmg * (def.vs?.[ECLASS[e.kind]] ?? 1);
    // kleine Ladungen (Schwarm): nur ein Teil wirkt auf den Schild, der Rest verpufft
    if (def.vsShield != null && e.sh > 0 && !e.shielded) {
      const onShield = Math.min(e.sh, dmg * def.vsShield);
      e.sh -= onShield;
      e.shFlash = 0.18;
      dmg -= onShield / def.vsShield;
    }
    if (dmg > 0) this.damageEnemy(e, dmg);
    else e.shT = 0;
    // Störrakete: Waffen kurz gestört
    if (def.jam) e.cd = Math.max(e.cd, def.jam);
    // Störrakete: Schild weg; geladen wird erst wieder nach stun Sekunden (sonst nach 3 s ohne Treffer)
    if (def.stun && !(e.kind === 'boss' && e.shielded)) { e.sh = 0; e.shT = 3 - def.stun; e.shFlash = 0.4; }
    if (def.splash) {
      const [rad, f] = def.splash;
      for (const q of [...this.enemies]) if (q !== e && Math.hypot(q.x - m.x, q.y - m.y) < rad + q.r) this.damageEnemy(q, m.dmg * f);
      this.explode(m.x, m.y, '#ffb070', 1.2, false);
    }
    this.fx.burst(m.x, m.y, def.stun ? '#8fe0ff' : '#ffd27a', m.mini ? 7 : 12, 180, 1.8, 'spark', 0.35);
  }

  /** toHull: Anteil, der den eigenen Schild umgeht und sofort die Hülle trifft (Thermal-Desintegrator) */
  private damageEnemy(e: Enemy, dmg: number, bypass = 0.3, toHull = 0): void {
    if (e.kind === 'boss' && e.shielded) { e.flash = 0.05; return; }
    let d = e.shielded ? dmg * bypass : dmg;
    if (toHull > 0) { e.hp -= d * toHull; d *= 1 - toHull; }
    // eigener Schild fängt zuerst ab
    e.shT = 0;
    if (e.sh > 0) {
      const a = Math.min(e.sh, d);
      e.sh -= a;
      d -= a;
      e.shFlash = 0.18;
    }
    e.hp -= d;
    e.flash = 0.08;
    // Kha'ak: Treffer im Cluster lässt ihn aufbrechen; Abfangjäger springen nach Treffern weg
    if (e.cl != null) this.breakCluster(e.cl);
    if (e.kind === 'ka') e.jumpReq = true;
    if (e.hp <= 0) this.killEnemy(e, true);
    else sfx.hit(this.panAt(e.x));
  }

  private killEnemy(e: Enemy, byPlayer: boolean): void {
    if (!this.enemies.includes(e)) return;
    this.enemies = this.enemies.filter((q) => q !== e && q.parent !== e);
    this.explode(e.x, e.y, SPEC[e.kind].color, e.kind === 'boss' ? 4 : e.r / 10);
    if (e.elite) this.eliteDeath(e);
    if (!byPlayer) return;
    this.kills++;
    this.score.bump(0.5, 2.5);
    this.gain(SPEC[e.kind].pts * (e.mini ? 0.5 : 1) * (e.elite ? 1.5 : 1) * (this.mutator?.id === 'bounty' ? 1.5 : 1), e.x, e.y, e.kind === 'boss' ? (e.mini ? 'Großziele' : 'Boss') : e.kind === 'turret' ? 'Geschütztürme' : e.elite ? 'Elite-Gegner' : 'Abschüsse');
    if (e.kind === 'cargo') {
      this.cargoKilled++;
      if (this.firstCargoT < 0) { this.firstCargoT = this.time; setGoal(this.goals, 'cargo45', this.time < 45); }
      this.floats.add(e.x, e.y - 40, `Piratenfrachter zerstört (${this.cargoKilled}/${CARGO_N})`, '#6be38f', 15);
    }
    if (e.nest && this.mission === 'nest' && !this.outcome) { this.bossKills++; this.winRound(); return; }
    if (e.kind === 'boss' && !e.mini) {
      this.bossKills++;
      setGoal(this.goals, 'boss30', this.bossT < 30);
      this.bossT = -1;
      buzz(120);
    }
    const chance = (this.mutator?.id === 'bounty' ? 0.3 : 0.14) * (e.elite ? 2.5 : 1);
    if (e.kind !== 'turret' && this.r() < chance) {
      const kinds: Pickup['kind'][] = ['repair', 'shield', 'missile'];
      // selten (jedes zehnte Fundstück, nur mit Raketenwerfern): Munitionskiste
      const kind = this.launchers.length && this.r() < 0.1 ? 'ammo' : kinds[Math.floor(this.r() * 3)];
      this.pickups.push({ x: e.x, y: e.y, kind, life: 12 });
    }
  }

  /** Ausweichen eines flinken Elite-Gegners: kräftiger Satz quer zur Flugbahn der Rakete */
  private dodgeMissile(e: Enemy, m: Missile): void {
    const v = Math.hypot(m.vx, m.vy) || 1, side = this.r() < 0.5 ? 1 : -1;
    const nx = (-m.vy / v) * side, ny = (m.vx / v) * side;
    e.vx += nx * 520; e.vy += ny * 520;
    e.x = clamp(e.x + nx * 26, 20, this.WW - 20); e.y = clamp(e.y + ny * 26, 20, this.WH - 20);
    e.dodgeCd = 3;
    this.fx.burst(e.x, e.y, ELITES.flink.color, 6, 160, 1, 'spark', 0.25);
    this.floats.add(e.x, e.y - 24, 'ausgewichen!', ELITES.flink.color, 12);
  }

  /** Splitter zerfällt, Rächer zündet, Kommandant fällt (Gruppe löst sich auf) */
  private eliteDeath(e: Enemy): void {
    if (e.elite === 'splitter') {
      for (let q = 0; q < 2; q++) {
        const a = e.ang + (q ? 1 : -1) * Math.PI / 2;
        const k = this.makeEnemy(this.smallKind, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
        k.hp = k.max = k.max * 0.7; k.sh = k.shMax = k.shMax * 0.5;
        k.ang = a; k.vx = Math.cos(a) * 240; k.vy = Math.sin(a) * 240;
        k.grp = e.grp; k.wd = e.wd; k.target = e.target;
        k.brk = 0.6; k.brkA = a;
        this.enemies.push(k);
      }
      this.fx.burst(e.x, e.y, ELITES.splitter.color, 10, 200, 1.4, 'spark', 0.4);
    } else if (e.elite === 'raecher') {
      this.blasts.push({ x: e.x, y: e.y, t: BLAST_T, dmg: 20 * this.enemyDmg });
      this.floats.add(e.x, e.y - 26, 'Rächer – weg da!', ELITES.raecher.color, 13);
    } else if (e.elite === 'kommandant') {
      // Verbündete in seiner Nähe und aus seiner Gruppe: Schild weg, drehen ab und feuern kurz nicht
      let n = 0;
      for (const q of this.enemies) {
        if (q === e || q.parent || q.plat || q.hive || q.nest || q.kind === 'boss' || q.kind === 'cargo') continue;
        if (q.cmdBy !== e && (q.grp == null || q.grp !== e.grp)) continue;
        q.sh = 0; q.shT = 0; q.shFlash = 0.4; q.cmdBy = undefined;
        q.cd = Math.max(q.cd, 1.8);
        q.brk = 1.6 + this.r() * 0.8; q.brkA = Math.atan2(q.y - e.y, q.x - e.x);
        n++;
      }
      this.floats.add(e.x, e.y - 26, n ? 'Kommandant gefallen – Gruppe löst sich auf' : 'Kommandant gefallen', ELITES.kommandant.color, 13);
    }
  }

  /** Rächer-Sprengungen: zünden nach kurzer Zeit und treffen alles im Umkreis */
  private updateBlasts(dt: number): void {
    if (!this.blasts.length) return;
    const keep: typeof this.blasts = [];
    for (const b of this.blasts) {
      b.t -= dt;
      if (b.t > 0) { keep.push(b); continue; }
      this.explode(b.x, b.y, ELITES.raecher.color, 2.4);
      this.fx.add({ x: b.x, y: b.y, color: '#ffb070', size: BLAST_R / 6, kind: 'ring', max: 0.5 });
      if (this.outcome !== 'player' && Math.hypot(this.px - b.x, this.py - b.y) < BLAST_R + 12) this.damagePlayer(b.dmg);
      for (const w of this.wards) if (!w.dead && Math.hypot(this.wx(w) - b.x, this.wy(w) - b.y) < BLAST_R + 60) this.hitWard(w, b.dmg, b.x, b.y);
      for (const q of [...this.enemies]) if (!q.parent && Math.hypot(q.x - b.x, q.y - b.y) < BLAST_R + q.r) this.damageEnemy(q, (q.max + q.shMax) * 0.4, 1);
    }
    this.blasts = keep;
  }

  /** Schaden am Jäger: erst Schild, dann Hülle; vsShield > 1 trifft den Schild stärker (Kyon) */
  private damagePlayer(dmg: number, vsShield = 1): void {
    if (this.dashT > 0) return;
    this.shieldWait = (2.5 * this.sh.delay * this.ship.delay) / (1 + 0.5 * this.c('regen')) * (1 - this.m('delay'));
    if (this.shield > 0) {
      const s = Math.min(this.shield, dmg * vsShield);
      this.shield -= s;
      dmg -= s / vsShield;
      this.shieldHit = 0.25;
      if (dmg <= 0) sfx.shield();
    }
    if (dmg > 0) {
      // Hülle in Prozent: größere Schiffe halten entsprechend mehr aus
      this.hull = Math.max(0, this.hull - dmg / (this.ship.hull * Math.max(0.5, 1 + this.m('hull'))));
      this.shake = Math.max(this.shake, 0.2);
      sfx.hull();
      buzz(20);
    }
  }

  private explode(x: number, y: number, color: string, size: number, sound = true): void {
    this.fx.burst(x, y, color, Math.round(14 * size), 220 * Math.sqrt(size), 2.4, 'chunk', 0.8);
    this.fx.burst(x, y, '#fff2c8', Math.round(12 * size), 300 * Math.sqrt(size), 1.4, 'spark', 0.35);
    this.fx.add({ x, y, color, size: 6 * size, kind: 'ring', max: 0.45 });
    this.shake = Math.max(this.shake, Math.min(0.5, 0.12 * size));
    if (sound) sfx.explosion(size, this.panAt(x));
    else sfx.hit(this.panAt(x));
  }

  /** Stereo-Position (−1 links … 1 rechts) eines Weltpunkts auf dem Bildschirm */
  private panAt(x: number): number {
    return Math.max(-1, Math.min(1, (((x - this.camX) * this.zoom) / Math.max(1, this.w)) * 2 - 1));
  }

  private finish(): GameResult {
    if (this.mission !== 'geleit') return this.finishMission();
    const f = this.wards[0].hull / this.wards[0].max;
    let ok: boolean, stars: 0 | 1 | 2 | 3, headline: string;
    const waves = this.wave + (this.outcome === 'win' ? 1 : 0);
    if (this.mode === 'endless') {
      ok = waves >= 3;
      stars = waves >= 10 ? 3 : waves >= 7 ? 2 : waves >= 4 ? 1 : 0;
      headline = `Welle ${this.wave + 1} erreicht`;
    } else {
      ok = this.outcome === 'win';
      stars = !ok ? 0 : f >= 0.85 ? 3 : f >= 0.55 ? 2 : 1;
      headline = ok ? 'Frachter in Sicherheit' : this.outcome === 'player' ? 'Jäger zerstört' : 'Frachter verloren';
    }
    if (!ok) for (const g of this.goals) if (g.id === 'nomissile' || g.id === 'tough' || g.id === 'hull80') g.done = false;
    const hull = `Frachter-Hülle ${Math.round(f * 100)} %`;
    const starRules = this.mode === 'endless'
      ? [4, 7, 10].map((n, i) => ({ text: this.rules.stars[i], ok: waves >= n, got: `${waves} Wellen` }))
      : [
        { text: this.rules.stars[0], ok, got: ok ? undefined : headline },
        { text: this.rules.stars[1], ok: ok && f >= 0.55, got: hull },
        { text: this.rules.stars[2], ok: ok && f >= 0.85, got: hull },
      ];
    return {
      success: ok,
      stars,
      starRules,
      breakdown: this.score.breakdown(),
      score: Math.round(f * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline,
      lines: [
        ...(this.mode === 'endless' ? [['Wellen', `${Math.max(0, this.wave)}`] as [string, string]] : []),
        ['Frachter-Hülle', `${Math.round(f * 100)} %`],
        ['Abschüsse', `${this.kills}`],
        ['Beste Kombo', `×${String(this.score.maxCombo).replace('.', ',')}`],
        ['Verbesserungen', `${Object.values(this.cards).reduce((a, b) => a + b, 0)}`],
      ],
    };
  }

  /** Auswertung der Einsätze: Sterne nach Einsatzziel, Zeilen passend zum Einsatz */
  private finishMission(): GameResult {
    const win = this.outcome === 'win';
    const w0 = this.wards[0];
    const f = w0 && !w0.dead ? w0.hull / w0.max : 0;
    const pct = (x: number) => `${Math.round(x * 100)} %`;
    const lost = this.outcome === 'player' ? 'Jäger zerstört' : '';
    let ok = win, stars: 0 | 1 | 2 | 3 = 0, headline = '', got: string[] = [], oks: boolean[] = [];
    const lines: [string, string][] = [];
    const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    switch (this.mission) {
      case 'konvoi': {
        const n = win ? this.liveWards.length : 0;
        oks = [n >= 1, n >= 2, n >= 3];
        got = [`${n} am Tor`, `${n} am Tor`, `${n} am Tor`];
        headline = win ? (n === 3 ? 'Ganzer Konvoi in Sicherheit' : `${n} von 3 Frachtern in Sicherheit`) : lost || 'Konvoi verloren';
        lines.push(['Frachter am Tor', `${n} von 3`]);
        break;
      }
      case 'station':
        oks = [win, win && f >= 0.55, win && f >= 0.85];
        got = [win ? '' : lost || 'Station zerstört', pct(f), pct(f)];
        headline = win ? 'Station gehalten' : lost || 'Station zerstört';
        lines.push(['Stations-Hülle', pct(f)], ['Stationstürme', `${w0.tur.filter((t) => t.hp > 0).length} von 6`]);
        break;
      case 'flucht':
        oks = [win, win && f >= 0.35, win && f >= 0.6];
        got = [win ? '' : lost || 'Frachter verloren', pct(f), pct(f)];
        headline = win ? 'Sprung geglückt' : lost || 'Frachter verloren';
        lines.push(['Sprungantrieb', pct(this.charge)], ['Frachter-Hülle', pct(f)]);
        break;
      case 'bergung': {
        const n = this.crateDone;
        ok = win && n >= CRATES_MIN;
        oks = [ok, ok && n >= 6, ok && n >= CRATES];
        got = [`${n} geborgen`, `${n} geborgen`, `${n} geborgen`];
        headline = ok ? `${n} Container geborgen` : lost || (this.outcome === 'freighter' ? 'Bergungsschiff verloren' : 'Zu viele Container verloren');
        lines.push(['Container', `${n} von ${CRATES}`], ['Verloren', `${this.crateLost}`], ['Bergungsschiff', pct(f)]);
        break;
      }
      case 'ueberfall': {
        const n = this.cargoKilled;
        ok = win && n >= 1;
        oks = [n >= 1 && ok, n >= 2 && ok, n >= 3 && ok];
        got = [`${n} zerstört`, `${n} zerstört`, `${n} zerstört`];
        headline = ok ? (n === CARGO_N ? 'Ganzer Konvoi zerstört' : `${n} von ${CARGO_N} Frachtern zerstört`) : lost || 'Konvoi entkommen';
        lines.push(['Zerstört', `${n} von ${CARGO_N}`], ['Entkommen', `${this.cargoEscaped}`]);
        break;
      }
      case 'nest':
        oks = [win, win && this.time < 240, win && this.time < 150];
        got = [win ? '' : lost || 'Nest steht noch', mm(this.time), mm(this.time)];
        headline = win ? 'Nest ausgehoben' : lost || 'Nest steht noch';
        lines.push(['Zeit', mm(this.time)]);
        break;
    }
    stars = (oks.filter(Boolean).length as 0 | 1 | 2 | 3);
    if (!ok) { stars = 0; for (const g of this.goals) g.done = false; }
    const rules = this.rules.stars;
    return {
      success: ok,
      stars,
      starRules: rules.map((text, i) => ({ text, ok: oks[i] ?? false, got: got[i] || undefined })),
      breakdown: this.score.breakdown(),
      score: Math.round(f * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline,
      lines: [...lines, ['Abschüsse', `${this.kills}`], ['Beste Kombo', `×${String(this.score.maxCombo).replace('.', ',')}`]],
    };
  }

  result(): GameResult | null {
    return this.done;
  }

  abort(): GameResult {
    const r = this.finish();
    if (this.mode !== 'endless') { r.success = false; r.stars = 0; }
    for (const g of r.goals) g.done = false;
    r.headline = 'Rückzug';
    return r;
  }

  /** Für Tests */
  get state(): { wave: number; enemies: number; fHull: number; hull: number; outcome: string | null; choosing: boolean; time: number; mission: Mission; wards: number; charge: number; crates: number; cargo: number } {
    return { wave: this.wave, enemies: this.enemies.length, fHull: this.wards.reduce((a, w) => a + (w.dead ? 0 : w.hull), 0), hull: this.hull, outcome: this.outcome, choosing: !!this.choosing, time: this.time, mission: this.mission, wards: this.liveWards.length, charge: this.charge, crates: this.crateDone, cargo: this.cargoKilled };
  }

  // ---------- Darstellung ----------

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.stars.draw(ctx, -this.camY * 0.3, this.side === 'xenon' ? '#ffd0d0' : this.side === 'khaak' ? '#e6d4ff' : '#cfe4ff', -this.camX * 0.3);
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 12 * this.shake, (Math.random() - 0.5) * 12 * this.shake);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);
    // Rand des Spielfelds
    ctx.strokeStyle = 'rgba(110,220,205,0.12)';
    ctx.setLineDash([6, 10]);
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, this.WW, this.WH);
    ctx.setLineDash([]);
    if (this.gateT >= 0) this.drawGate(ctx, t);
    for (const k of this.rocks) this.drawRock(ctx, k);
    for (const m of this.mines) this.drawMine(ctx, m, t);
    for (const p of this.pickups) this.drawPickup(ctx, p, t);
    if (this.wrecks.length || this.crates.length) this.drawSalvage(ctx, t);
    this.drawWards(ctx, t);
    this.drawClusterMass(ctx, t);
    for (const e of this.enemies) this.drawEnemy(ctx, e, t);
    this.drawBlasts(ctx, t);
    this.drawBeams(ctx, t);
    // Geschosse über den Schiffen: die Türme liegen oben auf dem Rumpf, ihre Schüsse fliegen darüber hinweg
    if (this.outcome !== 'player') this.drawPlayer(ctx, t);
    this.drawShots(ctx);
    if (this.outcome !== 'player') this.drawLock(ctx);
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    ctx.restore();
    this.drawIndicators(ctx);
    this.drawRadar(ctx);
    this.drawControls(ctx, t);
    this.drawProgress(ctx);
    if (this.banner > 0) {
      const a = Math.min(1, this.banner * 2) * Math.min(1, (2.4 - this.banner) * 4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '700 26px "Chakra Petch", Barlow, sans-serif';
      ctx.fillStyle = this.bannerText === 'BOSS' ? '#ff9aa4' : this.side === 'xenon' ? '#ff8a96' : this.side === 'khaak' ? '#d9a6ff' : '#ffc77a';
      ctx.fillText(this.bannerText, this.w / 2, TOP + 236);
      ctx.font = '500 14px Barlow, sans-serif';
      // lange Zeilen verkleinern, damit sie aufs Handy passen
      const sw = ctx.measureText(this.bannerSub).width;
      if (sw > this.w - 24) ctx.font = `500 ${Math.max(10, Math.floor((14 * (this.w - 24)) / sw))}px Barlow, sans-serif`;
      ctx.fillStyle = 'rgba(228,243,240,0.85)';
      ctx.fillText(this.bannerSub, this.w / 2, TOP + 260);
      ctx.restore();
    }
    if (this.choosing) this.drawCards(ctx);
  }

  /**
   * Kha'ak-Cluster: dunkle Kristallmasse in den Lücken zwischen den Schiffen (umgedrehte Dreiecke), mit violett
   * glimmenden Kanten – sie hält den Verbund zusammen und zerspringt, sobald er aufbricht
   */
  private drawClusterMass(ctx: CanvasRenderingContext2D, t: number): void {
    if (!this.clusters.size) return;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const c of this.clusters.values()) {
      if (!c.mass.length) continue;
      const ca = Math.cos(c.ang + Math.PI / 2), sa = Math.sin(c.ang + Math.PI / 2);
      ctx.beginPath();
      for (const tri of c.mass) {
        for (const [i, [x, y]] of tri.entries()) {
          const wx = c.x + x * ca - y * sa, wy = c.y + x * sa + y * ca;
          if (i) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy);
        }
        ctx.closePath();
      }
      ctx.fillStyle = '#1c1028';
      ctx.fill();
      // Facetten: von jeder Ecke ein feiner Grat zur Mitte
      ctx.strokeStyle = rgba('#3a2552', 0.9);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const tri of c.mass) {
        const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const cx = c.x + mx * ca - my * sa, cy = c.y + mx * sa + my * ca;
        for (const [x, y] of tri) { ctx.moveTo(cx, cy); ctx.lineTo(c.x + x * ca - y * sa, c.y + x * sa + y * ca); }
      }
      ctx.stroke();
      // glimmende Kanten (Kyon-Adern)
      ctx.beginPath();
      for (const tri of c.mass) {
        for (const [i, [x, y]] of tri.entries()) {
          const wx = c.x + x * ca - y * sa, wy = c.y + x * sa + y * ca;
          if (i) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy);
        }
        ctx.closePath();
      }
      ctx.strokeStyle = rgba('#b45cff', 0.45 + 0.2 * Math.sin(t * 4 + c.x * 0.01));
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Laserstrahlen der Xenon-Türme (Kha'ak: Kyon-Türme, violett): erst dünne, blinkende Ziellinie, dann der Strahl */
  private drawBeams(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const kh = this.side === 'khaak';
    const [c1, c2, c3] = kh ? ['#a855f7', '#c98cff', '#f6ecff'] : ['#ff3b4a', '#ff7a84', '#fff0f0'];
    // Kyon-Strahl lädt: dünne, flackernde Ziellinie entlang der Blickrichtung
    for (const e of this.enemies) {
      if (e.kyT == null) continue;
      const k = 1 - e.kyT / (e.kind === 'kk' ? 0.6 : 0.35);
      ctx.strokeStyle = rgba('#c98cff', 0.2 + 0.4 * k * (0.6 + 0.4 * Math.sin(t * 50)));
      ctx.lineWidth = 0.8 + k;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      for (let q = e.kind === 'kk' ? -1 : 0; q <= (e.kind === 'kk' ? 1 : 0); q++) {
        const a = e.ang + q * 0.22;
        ctx.moveTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
        ctx.lineTo(e.x + Math.cos(a) * KYON_LEN, e.y + Math.sin(a) * KYON_LEN);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // Kristall an der Spitze glüht auf
      ctx.fillStyle = rgba('#e0b8ff', 0.4 + 0.5 * k);
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.ang) * e.r * 0.8, e.y + Math.sin(e.ang) * e.r * 0.8, 1.5 + 2.5 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of this.enemies) {
      if (!e.beamT || e.beamT <= 0) continue;
      const c = Math.cos(e.beamA!), sn = Math.sin(e.beamA!);
      const ex = e.x + c * LASER_LEN, ey = e.y + sn * LASER_LEN;
      ctx.beginPath();
      // ab der Spitze des Laserrohrs
      ctx.moveTo(e.x + c * 26, e.y + sn * 26);
      ctx.lineTo(ex, ey);
      if (e.beamT > LASER_FIRE) {
        const k = 1 - (e.beamT - LASER_FIRE) / LASER_CHARGE;
        ctx.strokeStyle = rgba(c1, 0.25 + 0.35 * k * (0.6 + 0.4 * Math.sin(t * 40)));
        ctx.lineWidth = 1 + k;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const k = Math.min(1, e.beamT / 0.12, (LASER_FIRE - e.beamT) / 0.06);
        ctx.strokeStyle = rgba(c1, 0.35 * k);
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = rgba(c2, 0.8 * k);
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = rgba(c3, k);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawShots(ctx: CanvasRenderingContext2D): void {
    // Bosonenlanze: kurz aufblitzender Strahl (über den Schiffen, wie die Geschosse)
    if (this.rails.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const r of this.rails) {
        const k = r.t / 0.22;
        ctx.beginPath();
        ctx.moveTo(r.x1, r.y1);
        ctx.lineTo(r.x2, r.y2);
        ctx.strokeStyle = rgba(r.color, 0.45 * k);
        ctx.lineWidth = 2 + 7 * k;
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.95 * k);
        ctx.lineWidth = 1.2 + 1.2 * k;
        ctx.stroke();
      }
      ctx.restore();
    }
    // Strahlentürme: dünner, flackernder Dauerstrahl
    if (this.tBeams.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2] of this.tBeams) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = rgba(this.tw.color, 0.28);
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = rgba('#e8ffff', 0.75 + 0.25 * Math.random());
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      if (b.w >= 5) {
        // Plasmakugel: glühender Kern mit Hof
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.w * 2.2);
        g.addColorStop(0, '#fff1d8');
        g.addColorStop(0.3, b.color);
        g.addColorStop(1, rgba(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.w * 2.2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const v = Math.hypot(b.vx, b.vy) || 1, L = b.from === 'p' ? 12 : 8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / v) * L, b.y - (b.vy / v) * L);
      ctx.strokeStyle = rgba(b.color, 0.3);
      ctx.lineWidth = b.w * 3;
      ctx.stroke();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.w;
      ctx.stroke();
    }
    // Eigene Raketen: passend zur Bauart des Jägers als Bild, sonst als Leuchtpunkt
    const ownKind = fighterKind();
    const ownMissile = projectileSprite(`${ownKind}-rakete-ki`);
    if (!ownMissile) for (const m of this.missiles) {
      ctx.fillStyle = '#fff2c8';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (ownMissile) for (const m of this.missiles) {
      // Größe nach Raketenart: schwere größer, Lenkköpfe der Schwarmrakete klein; Störrakete mit blauem Schein
      const size = m.mini ? 11 : m.def.size;
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.def.stun) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.7);
        g.addColorStop(0, rgba('#8fe0ff', 0.55));
        g.addColorStop(1, rgba('#8fe0ff', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);
      ctx.fillStyle = rgba(ownKind === 'argon' ? '#7fe8ff' : m.def.color, 0.6 + 0.3 * Math.random());
      ctx.beginPath();
      ctx.moveTo(-1.8, size * 0.46); ctx.lineTo(1.8, size * 0.46); ctx.lineTo(0, size * 0.46 + 4 + Math.random() * 5);
      ctx.closePath();
      ctx.fill();
      ctx.drawImage(ownMissile, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    for (const m of this.eMissiles) {
      const a = Math.atan2(m.vy, m.vx);
      ctx.save();
      ctx.translate(m.x, m.y);
      const img = projectileSprite('pirat-rakete-ki');
      if (img) {
        // Bild: Spitze zeigt im Bild nach oben, Flamme flackert am Heck
        ctx.rotate(a + Math.PI / 2);
        const size = 24;
        ctx.fillStyle = rgba('#ff9a4a', 0.6 + 0.3 * Math.random());
        ctx.beginPath();
        ctx.moveTo(-2, size * 0.44); ctx.lineTo(2, size * 0.44); ctx.lineTo(0, size * 0.44 + 5 + Math.random() * 5);
        ctx.closePath();
        ctx.fill();
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
      } else {
        ctx.rotate(a);
        ctx.fillStyle = '#2a1008';
        ctx.strokeStyle = '#ff8a5c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(-6, 4); ctx.lineTo(-6, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // Warnring: abschießen!
      ctx.strokeStyle = 'rgba(255,138,92,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawRock(ctx: CanvasRenderingContext2D, k: Rock): void {
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.rot);
    const img = projectileSprite(`asteroid-${k.v + 1}-ki`);
    if (img) {
      // Bild-Grafik: der Brocken füllt rund 70 % des Bildes – so passt er zum Kollisionsradius
      const size = k.r * 2.9;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    for (let i = 0; i < k.pts.length; i++) {
      const a = (i / k.pts.length) * Math.PI * 2, r = k.r * k.pts[i];
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-k.r * 0.3, -k.r * 0.3, 0, 0, 0, k.r);
    g.addColorStop(0, '#4d443c');
    g.addColorStop(1, '#1a1612');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,200,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawMine(ctx: CanvasRenderingContext2D, m: Mine, t: number): void {
    const blink = m.armed >= 0 ? Math.sin(t * 40) > 0 : Math.sin(t * 3 + m.x) > 0.7;
    const img = projectileSprite('mine-ki');
    if (img) {
      // Bild-Grafik: dreht sich langsam, rote Lampe in der Mitte blinkt (scharf: schnell und hell), Wirkungskreis
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.armed >= 0) {
        ctx.strokeStyle = 'rgba(255,92,108,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 70, 0, Math.PI * 2);
        ctx.stroke();
      }
      // schwacher Warnschein, damit die dunkle Mine auch weit herausgezoomt auffällt
      const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, 22);
      halo.addColorStop(0, m.armed >= 0 ? 'rgba(255,92,108,0.35)' : 'rgba(255,181,71,0.28)');
      halo.addColorStop(1, 'rgba(255,181,71,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(t * 0.3 + m.y * 0.01);
      const size = 30;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      if (blink) {
        ctx.globalCompositeOperation = 'lighter';
        const r = m.armed >= 0 ? 7 : 4.5;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, 'rgba(255,200,200,0.95)');
        g.addColorStop(0.35, 'rgba(255,60,70,0.8)');
        g.addColorStop(1, 'rgba(255,40,50,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.strokeStyle = m.armed >= 0 ? '#ff5c6c' : 'rgba(255,181,71,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); }
    ctx.stroke();
    ctx.fillStyle = '#1a1008';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = blink ? '#ff5c6c' : 'rgba(255,92,108,0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (m.armed >= 0) {
      ctx.strokeStyle = 'rgba(255,92,108,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, t: number): void {
    if (p.life < 3 && Math.sin(t * 16) < 0) return;
    const col = p.kind === 'repair' ? '#6be38f' : p.kind === 'shield' ? '#7fd8ff' : p.kind === 'ammo' ? '#ff9a4a' : '#ffd27a';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 1.5);
    ctx.fillStyle = rgba(col, 0.2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-t * 1.5);
    ctx.fillStyle = col;
    ctx.font = '700 10px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.kind === 'repair' ? '+' : p.kind === 'shield' ? 'S' : p.kind === 'ammo' ? 'R+' : 'R', 0, 0.5);
    ctx.restore();
  }

  private drawGate(ctx: CanvasRenderingContext2D, t: number): void {
    const gx = this.gateX, gy = this.gateCy;
    const img = projectileSprite('sprungtor-ki');
    if (img) {
      // Bild-Grafik (von oben, flach im Raum): öffnet sich mit einem Lichtblitz, darüber ein sich drehender Lichtwirbel
      const open = Math.min(1, this.gateT / 0.6);
      const size = 300 * (0.55 + 0.45 * (1 - Math.pow(1 - open, 3)));
      ctx.save();
      ctx.translate(gx, gy);
      ctx.globalAlpha = open;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = 'rgba(160,230,255,0.35)';
      ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.16 + k * 0.08), k * 2.1, k * 2.1 + 2.2);
        ctx.stroke();
      }
      const flash = Math.max(0, 1 - this.gateT * 1.6);
      if (flash > 0) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
        g.addColorStop(0, `rgba(230,250,255,${0.9 * flash})`);
        g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, 0.45);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 80);
    g.addColorStop(0, 'rgba(160,230,255,0.75)');
    g.addColorStop(0.6, 'rgba(60,140,255,0.25)');
    g.addColorStop(1, 'rgba(60,140,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9fe6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(t);
    ctx.strokeStyle = 'rgba(200,245,255,0.5)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Schutzziele: Frachter, Bergungsschiff und Station samt Türmen und Hüllenbalken */
  private drawWards(ctx: CanvasRenderingContext2D, t: number): void {
    for (const w of this.wards) {
      if (w.dead) continue;
      if (w.kind === 'station') this.drawStation(ctx, w, t);
      else this.drawFreighter(ctx, w, t);
    }
  }

  private drawFreighter(ctx: CanvasRenderingContext2D, w: Ward, t: number): void {
    const x = this.wx(w), y = this.wy(w);
    const jump = this.gateT >= 0 && this.mission !== 'ueberfall';
    const shrink = jump ? Math.max(0, 1 - Math.max(0, this.gateT - 1.2) * 1.6) : 1;
    if (shrink <= 0) return;
    // Bergungsschiff: Abladezone als gestrichelter Ring
    if (w.kind === 'berger') {
      ctx.save();
      ctx.strokeStyle = rgba('#6be38f', this.towing ? 0.55 + 0.25 * Math.sin(t * 5) : 0.25);
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, TOW_DROP, t * 0.3, t * 0.3 + Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(shrink, shrink);
    const spr = projectileSprite('frachter-m-ki');
    if (spr) {
      // Bild-Grafik: Containerschiff, gut 105 px lang; vier flackernde Triebwerke; Treffer blitzen hell auf
      const size = 110;
      ctx.fillStyle = rgba('#ffa040', 0.5 + 0.3 * Math.random());
      // Flucht: Triebwerke aus, der Antrieb lädt (blaues Flackern am Heck)
      if (this.mission === 'flucht' && !jump) ctx.fillStyle = rgba('#7fd8ff', 0.25 + 0.5 * this.charge * Math.random());
      for (const fx of [-0.104, -0.053, 0.05, 0.105]) {
        const ex = fx * size, ey = 0.462 * size;
        ctx.beginPath();
        ctx.moveTo(ex - 2, ey); ctx.lineTo(ex + 2, ey); ctx.lineTo(ex, ey + 5 + Math.random() * 5 + (jump ? 10 : 0));
        ctx.closePath();
        ctx.fill();
      }
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      if (w.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      }
    } else {
      const col = w.flash > 0 ? '#ffffff' : w.kind === 'berger' ? '#6be38f' : '#5ff0d8';
      ctx.beginPath();
      ctx.moveTo(0, -48); ctx.lineTo(12, -36); ctx.lineTo(14, 34); ctx.lineTo(8, 46); ctx.lineTo(-8, 46); ctx.lineTo(-14, 34); ctx.lineTo(-12, -36);
      ctx.closePath();
      ctx.fillStyle = '#0c1d29';
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.22);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        for (const sd of [-1, 1]) {
          ctx.fillStyle = '#10283a';
          ctx.fillRect(sd * 15 - (sd < 0 ? 10 : 0), -24 + k * 13, 10, 11);
          ctx.strokeStyle = rgba('#8fd3ff', 0.7);
          ctx.lineWidth = 1;
          ctx.strokeRect(sd * 15 - (sd < 0 ? 10 : 0) + 0.5, -24 + k * 13 + 0.5, 9, 10);
        }
      }
      ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 25));
      ctx.fillRect(-7, 46, 5, 6 + Math.random() * 4);
      ctx.fillRect(2, 46, 5, 6 + Math.random() * 4);
    }
    // Flucht: Ladering des Sprungantriebs um den Frachter
    if (this.mission === 'flucht' && !jump) {
      ctx.strokeStyle = rgba('#7fd8ff', 0.25);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgba('#9fe6ff', 0.75 + 0.2 * Math.sin(t * 6));
      ctx.beginPath();
      ctx.arc(0, 0, 68, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.charge);
      ctx.stroke();
    }
    ctx.restore();
    if (!jump) this.drawWardTurrets(ctx, w);
    this.drawWardHull(ctx, w, x, y + 62, 60);
    if (this.wards.length > 1 || w.kind === 'berger') {
      ctx.save();
      ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(228,243,240,0.75)';
      ctx.fillText(w.kind === 'berger' ? 'Bergungsschiff' : w.name, x, y + 80);
      ctx.restore();
    }
  }

  /** Station: Bild mit sechs Turmsockeln, darauf die Stationstürme; zerstörte Türme rauchen */
  private drawStation(ctx: CanvasRenderingContext2D, w: Ward, t: number): void {
    const x = this.wx(w), y = this.wy(w);
    const spr = projectileSprite('split-station-kern-mittel-ki');
    ctx.save();
    ctx.translate(x, y);
    if (spr) {
      ctx.drawImage(spr, -STATION_SIZE / 2, -STATION_SIZE / 2, STATION_SIZE, STATION_SIZE);
      if (w.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35;
        ctx.drawImage(spr, -STATION_SIZE / 2, -STATION_SIZE / 2, STATION_SIZE, STATION_SIZE);
      }
    } else {
      // Neon-Ersatz: Sechseck mit Speichen
      ctx.strokeStyle = w.flash > 0 ? '#ffffff' : '#ffb070';
      ctx.fillStyle = '#1a0f0a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 3; ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const tu of w.tur) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tu.ox, tu.oy); ctx.stroke(); }
    }
    ctx.restore();
    this.drawWardTurrets(ctx, w);
    // Rauch über zerstörten Türmen
    for (const tu of w.tur) if (tu.hp <= 0 && Math.random() < 0.3) this.fx.add({ x: x + tu.ox + (Math.random() - 0.5) * 8, y: y + tu.oy, vy: -14, color: '#6a5a52', size: 2.4, max: 0.9 });
    this.drawWardHull(ctx, w, x, y + STATION_SIZE / 2 + 6, 110);
    void t;
  }

  /** Abwehrtürme eines Schutzziels (zielen frei); Stationstürme mit Bild und eigenem Hüllenbalken */
  private drawWardTurrets(ctx: CanvasRenderingContext2D, w: Ward): void {
    const x = this.wx(w), y = this.wy(w), st = w.kind === 'station';
    const ts = st ? turretSprite('tau', 'split-cobra') : null;
    for (const tur of w.tur) {
      ctx.save();
      ctx.translate(x + tur.ox, y + tur.oy);
      if (st && tur.hp <= 0) {
        // zerstört: verkohlter Sockel
        ctx.fillStyle = '#1a1210';
        ctx.strokeStyle = 'rgba(255,92,108,0.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (ts) {
        const W = 30 / ts.d;
        ctx.rotate(tur.a + Math.PI / 2);
        ctx.drawImage(ts.img, -ts.px * W, -ts.py * W, W, W);
      } else {
        const r = st ? 8 : 4.5;
        ctx.fillStyle = '#0a1a24';
        ctx.strokeStyle = st ? '#ffb070' : '#9fe6ff';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(Math.cos(tur.a) * r * 0.6, Math.sin(tur.a) * r * 0.6);
        ctx.lineTo(Math.cos(tur.a) * r * 2, Math.sin(tur.a) * r * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (st && tur.hp < tur.max) {
        ctx.fillStyle = 'rgba(14,30,44,0.85)';
        ctx.fillRect(x + tur.ox - 12, y + tur.oy + 16, 24, 3);
        ctx.fillStyle = tur.hp / tur.max > 0.5 ? '#ffb070' : '#ff5c6c';
        ctx.fillRect(x + tur.ox - 12, y + tur.oy + 16, 24 * (tur.hp / tur.max), 3);
      }
    }
  }

  /** Hüllenbalken unter einem Schutzziel */
  private drawWardHull(ctx: CanvasRenderingContext2D, w: Ward, x: number, y: number, width: number): void {
    const f = w.hull / w.max;
    ctx.fillStyle = 'rgba(14,30,44,0.85)';
    ctx.fillRect(x - width / 2, y, width, 4);
    ctx.fillStyle = f > 0.5 ? '#3fe0c5' : f > 0.25 ? '#ffb547' : '#ff5c6c';
    ctx.fillRect(x - width / 2, y, width * f, 4);
  }

  /** Wracks (dunkel, langsam drehend) und Container im Wrackfeld; geschleppt mit leuchtendem Traktorstrahl */
  private drawSalvage(ctx: CanvasRenderingContext2D, t: number): void {
    const imgs = ['frachter-m-ki', 'pirat-fregatte-ki', 'split-dock-ki'];
    for (const [i, wr] of this.wrecks.entries()) {
      const img = projectileSprite(imgs[i % imgs.length]);
      ctx.save();
      ctx.translate(wr.x, wr.y);
      ctx.rotate(wr.rot + t * 0.01 * (i % 2 ? 1 : -1));
      if (img) {
        ctx.globalAlpha = 0.42;
        ctx.drawImage(img, -wr.size / 2, -wr.size / 2, wr.size, wr.size);
      } else {
        ctx.strokeStyle = 'rgba(168,154,138,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-wr.size * 0.15, -wr.size * 0.4, wr.size * 0.3, wr.size * 0.8);
      }
      ctx.restore();
      // ab und zu sprüht ein Funke aus dem Wrack
      if (Math.random() < 0.02) this.fx.burst(wr.x + (Math.random() - 0.5) * wr.size * 0.4, wr.y + (Math.random() - 0.5) * wr.size * 0.4, '#ffb070', 3, 60, 1, 'spark', 0.3);
    }
    for (const c of this.crates) {
      if (c.done) continue;
      if (c.tow) {
        // Traktorstrahl: flimmernde Doppellinie vom Jäger zum Container
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba('#9ffff0', 0.25 + 0.15 * Math.sin(t * 20));
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(this.px, this.py); ctx.lineTo(c.x, c.y); ctx.stroke();
        ctx.strokeStyle = rgba('#e6fffb', 0.8);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); ctx.moveTo(this.px, this.py); ctx.lineTo(c.x, c.y); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      // Container: Kasten mit Rippen und Warnstreifen, Leuchtpunkt blinkt
      ctx.fillStyle = '#3a2a18';
      ctx.strokeStyle = c.tow ? '#9ffff0' : '#ffb547';
      ctx.lineWidth = 1.4;
      ctx.fillRect(-10, -7, 20, 14);
      ctx.strokeRect(-10, -7, 20, 14);
      ctx.strokeStyle = 'rgba(255,181,71,0.55)';
      for (const k of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(k, -7); ctx.lineTo(k, 7); ctx.stroke(); }
      ctx.fillStyle = Math.sin(t * 5 + c.x) > 0 ? '#ffd27a' : '#6a4a20';
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
      if (c.hp < 60) {
        ctx.fillStyle = 'rgba(14,30,44,0.85)';
        ctx.fillRect(c.x - 11, c.y + 12, 22, 3);
        ctx.fillStyle = '#ffb547';
        ctx.fillRect(c.x - 11, c.y + 12, 22 * Math.max(0, c.hp / 60), 3);
      }
    }
  }

  /**
   * Nest aus Bildern: Module, Verbindungsblitze (Kha'ak), dann der Kern; zerstörte Brutöffnungen verkohlt und rauchend,
   * ein Modul ohne lebende Öffnung brennt aus und sein Blitz erlischt. false, solange die Bilder noch laden (dann
   * Neon-Zeichnung).
   */
  private drawNestSprites(ctx: CanvasRenderingContext2D, e: Enemy, t: number): boolean {
    const lay = NEST_LAYOUT[this.side === 'khaak' ? 'khaak' : 'xenon'];
    const core = projectileSprite(lay.core);
    const mods = lay.mods.map((m) => projectileSprite(m.name));
    if (!core || mods.some((m) => !m)) return false;
    const S = NEST_SCALE, size = 1024 * S;
    const alive = (x: number, y: number) => this.enemies.some((q) => q.parent === e && q.weapon === 'brut' && Math.abs(q.ox! - x * S) < 1 && Math.abs(q.oy! - y * S) < 1);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.ang + Math.PI / 2);
    // Glimmen unter dem Nest
    const g = ctx.createRadialGradient(0, 60, 0, 0, 60, 260);
    g.addColorStop(0, `rgba(${lay.glow},0.18)`);
    g.addColorStop(1, `rgba(${lay.glow},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 60, 260, 0, Math.PI * 2); ctx.fill();
    for (const [i, m] of lay.mods.entries()) {
      const dead = m.opens.every(([x, y]) => !alive(x, y));
      ctx.globalAlpha = dead ? 0.5 : 1;
      ctx.drawImage(mods[i]!, m.x * S - size / 2, m.y * S - size / 2, size, size);
      ctx.globalAlpha = 1;
      // Kha'ak: lila Blitze vom Kern zum Modul – zucken ständig neu, erlöschen mit dem Modul
      if (m.link && !dead) this.drawNestBolt(ctx, m.link.from[0] * S, m.link.from[1] * S, m.link.to[0] * S, m.link.to[1] * S, t);
    }
    ctx.drawImage(core, -size / 2, -size / 2, size, size);
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.drawImage(core, -size / 2, -size / 2, size, size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Brutöffnungen: lebende pulsieren, zerstörte sind verkohlt
    for (const m of lay.mods) for (const [x, y] of m.opens) {
      const ox = x * S, oy = y * S;
      if (alive(x, y)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pg = ctx.createRadialGradient(ox, oy, 0, ox, oy, 18);
        pg.addColorStop(0, `rgba(${lay.glow},${0.35 + 0.25 * Math.sin(t * 3 + x)})`);
        pg.addColorStop(1, `rgba(${lay.glow},0)`);
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(ox, oy, 18, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(12,8,12,0.85)';
        ctx.beginPath(); ctx.arc(ox, oy, 13, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.25) {
          const c = Math.cos(e.ang + Math.PI / 2), sn = Math.sin(e.ang + Math.PI / 2);
          this.fx.add({ x: e.x + ox * c - oy * sn + (Math.random() - 0.5) * 10, y: e.y + ox * sn + oy * c, vy: -16, color: '#5a4a46', size: 2.6, max: 1 });
        }
      }
    }
    // Schild um den Kern, solange Teile stehen
    if (e.shielded) {
      ctx.strokeStyle = rgba('#7fd8ff', 0.3 + 0.2 * Math.sin(t * 6));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 1.7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  /** Turmplattform: Sockel (fest), darauf der drehende Turmkopf; beim Laden flackernde Ziellinien aus den Mündungen */
  private drawPlat(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    const d = e.plat!, base = projectileSprite(d.base), head = projectileSprite(d.head);
    ctx.save();
    ctx.translate(e.x, e.y);
    if (base) ctx.drawImage(base, -d.baseSize / 2, -d.baseSize / 2, d.baseSize, d.baseSize);
    else { ctx.strokeStyle = '#9b5cff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.stroke(); }
    ctx.rotate(e.ang + Math.PI / 2);
    if (head) {
      ctx.drawImage(head, -d.size / 2, -d.py * d.size, d.size, d.size);
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
        ctx.drawImage(head, -d.size / 2, -d.py * d.size, d.size, d.size);
      }
    } else {
      ctx.fillStyle = '#2a1640'; ctx.strokeStyle = '#d9a6ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -d.muzzle); ctx.stroke();
    }
    ctx.restore();
    if (e.plT != null) {
      const k = 1 - e.plT / d.charge, glow = d.color === '#ff3b4a' || d.color === '#ff5c6c' ? ['255,200,200', '255,59,74'] : ['240,210,255', '180,92,255'];
      ctx.save();
      // Kanonen laufen nur warm (Mündungsglühen), Strahlwaffen zeigen dazu die Ziellinie
      ctx.strokeStyle = rgba(d.fire === 'gun' ? '#000000' : d.color === '#ff3b4a' ? '#ff8a96' : '#c98cff', d.fire === 'gun' ? 0 : 0.2 + 0.45 * k * (0.6 + 0.4 * Math.sin(t * 50)));
      ctx.lineWidth = 0.8 + k * 1.4;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      for (const a of d.fan ? [-d.fan, 0, d.fan] : [0]) for (const sd of d.side) {
        const [mx, my] = this.platMuzzle(e, sd), aa = e.ang + a;
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(aa) * d.len, my + Math.sin(aa) * d.len);
      }
      ctx.stroke();
      // Mündungen glühen auf
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      for (const sd of d.side) {
        const [mx, my] = this.platMuzzle(e, sd);
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 6 + 8 * k);
        g.addColorStop(0, `rgba(${glow[0]},0.9)`);
        g.addColorStop(1, `rgba(${glow[1]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(mx, my, 6 + 8 * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Nebennest: Kristallbild, dreht sich langsam; Treffer blitzen hell */
  private drawHive(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    const img = projectileSprite(e.hive!.img), size = 190, col = this.side === 'khaak' ? '180,92,255' : '255,59,74';
    ctx.save();
    ctx.translate(e.x, e.y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.6);
    g.addColorStop(0, `rgba(${col},${0.16 + 0.06 * Math.sin(t * 2 + e.x)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(e.ang);
    if (img) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.drawImage(img, -size / 2, -size / 2, size, size); }
    } else {
      ctx.strokeStyle = '#d9a6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, r = k % 2 ? 30 : 60; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  /** Lila Blitz zwischen zwei Punkten: zwei zuckende Zickzack-Bahnen mit Schein, alle paar Hundertstel neu gewürfelt */
  private drawNestBolt(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, t: number): void {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const seed = Math.floor(t * 18) + Math.round(x1 * 7 + y1 * 13);
    const rnd = rng(seed);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let strand = 0; strand < 2; strand++) {
      const n = 6;
      const pts: [number, number][] = [[x1, y1]];
      for (let k = 1; k < n; k++) {
        const f = k / n, off = (rnd() - 0.5) * Math.min(14, len * 0.45);
        pts.push([x1 + dx * f + nx * off, y1 + dy * f + ny * off]);
      }
      pts.push([x2, y2]);
      for (const [w, col] of [[5, 'rgba(180,92,255,0.25)'], [2, 'rgba(217,166,255,0.85)'], [0.8, 'rgba(255,240,255,0.95)']] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = strand ? w * 0.6 : w;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
    // Glühpunkte an beiden Anschlüssen
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      const gg = ctx.createRadialGradient(px, py, 0, px, py, 7);
      gg.addColorStop(0, 'rgba(240,210,255,0.9)');
      gg.addColorStop(1, 'rgba(180,92,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** Nest: Neon-Wabe (Xenon: Metallringe mit rotem Auge; Kha'ak: Kristallstacheln mit violettem Kern) */
  private drawNest(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    if (this.drawNestSprites(ctx, e, t)) return;
    const kh = this.side === 'khaak', col = kh ? '#b45cff' : '#ff3b4a', r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    // Glimmen
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    g.addColorStop(0, rgba(col, 0.35));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
    if (kh) {
      // Kristallstacheln, langsam drehend
      for (let k = 0; k < 9; k++) {
        const a = t * 0.08 + (k / 9) * Math.PI * 2, L = r * (1.25 + 0.25 * ((k * 7) % 3));
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-r * 0.28, 0); ctx.lineTo(0, -L); ctx.lineTo(r * 0.28, 0); ctx.closePath();
        ctx.fillStyle = '#2a1640';
        ctx.fill();
        ctx.strokeStyle = rgba('#d9a6ff', 0.75);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // drei Sechseck-Ringe, gegenläufig
      for (let ring = 0; ring < 3; ring++) {
        const rr = r * (1.25 - ring * 0.3), a0 = t * (ring % 2 ? -0.15 : 0.12);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = a0 + (k * Math.PI) / 3; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath();
        ctx.fillStyle = ring === 0 ? '#1a1416' : 'rgba(40,30,34,0.9)';
        ctx.fill();
        ctx.strokeStyle = rgba('#ff8a96', 0.55 - ring * 0.1);
        ctx.lineWidth = 2;
        ctx.stroke();
        // leuchtende Segmente
        ctx.strokeStyle = rgba(col, 0.6 + 0.3 * Math.sin(t * 3 + ring));
        ctx.lineWidth = 3;
        for (let k = 0; k < 6; k += 2) {
          const a = a0 + (k * Math.PI) / 3, b = a0 + ((k + 1) * Math.PI) / 3;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); ctx.stroke();
        }
      }
    }
    // Kern: pulsierendes Auge, beim Treffer hell
    const pulse = 0.75 + 0.25 * Math.sin(t * 4);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
    cg.addColorStop(0, e.flash > 0 ? '#ffffff' : kh ? '#f2e0ff' : '#ffd0d4');
    cg.addColorStop(0.4, rgba(col, pulse));
    cg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
    // Schild, solange Brutöffnungen oder Türme stehen
    if (e.shielded) {
      ctx.strokeStyle = rgba('#7fd8ff', 0.3 + 0.2 * Math.sin(t * 6));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.75, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    if (e.nest) { this.drawNest(ctx, e, t); this.drawEnemyStatus(ctx, e); return; }
    if (e.plat) { this.drawPlat(ctx, e, t); this.drawEnemyStatus(ctx, e); return; }
    if (e.hive) { this.drawHive(ctx, e, t); this.drawEnemyStatus(ctx, e); return; }
    if (e.parent?.nest && e.weapon === 'brut' && projectileSprite(NEST_LAYOUT[this.side === 'khaak' ? 'khaak' : 'xenon'].core)) { this.drawEnemyStatus(ctx, e); return; }
    const s = SPEC[e.kind];
    const xen = this.side === 'xenon', kh = this.side === 'khaak';
    const base = e.kind === 'turret' ? (kh ? '#c77dff' : xen ? '#ff5c6c' : '#ffd27a') : e.kind === 'boss' ? (kh ? '#a855f7' : xen ? '#ff3b4a' : '#ffb547') : s.color;
    const col = e.flash > 0 ? '#ffffff' : base;
    // Blickrichtung (Bordkanonen und Boss-Sockel hängen daran)
    const a = e.ang + Math.PI / 2;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.shielded) {
      ctx.strokeStyle = rgba('#7fd8ff', 0.35 + 0.2 * Math.sin(t * 6));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Boss: Schild umschließt den ganzen Rumpf
      ctx.arc(0, 0, e.kind === 'boss' ? e.r * (xen || kh ? 2.4 : 2.1) : e.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Brutkästen drehen nicht, sie sitzen fest auf dem Rumpf
    ctx.rotate(e.beamT && e.beamT > 0 ? e.beamA! + Math.PI / 2 : e.weapon === 'brut' ? e.parent!.ang + Math.PI / 2 : e.parent ? Math.atan2(this.py - e.y, this.px - e.x) + Math.PI / 2 : a);
    const spr = enemySprite(e.weapon ? `turret-${e.weapon}` : e.kind === 'boss' && e.mini && kh ? 'boss-mini' : e.kind, this.side === 'pirate' ? 'pirat' : this.side);
    if (spr) {
      // Bild-Grafik: flackernde Triebwerke, Schiff, bei Treffern kurz hell aufblitzen
      const size = e.r * spr.scale;
      ctx.fillStyle = rgba(spr.engines.color, 0.5 + 0.3 * Math.random());
      for (const fx of spr.engines.xs) {
        const ex = fx * size, ey = spr.engines.y * size;
        ctx.beginPath();
        ctx.moveTo(ex - 1.6, ey); ctx.lineTo(ex + 1.6, ey); ctx.lineTo(ex, ey + 5 + Math.random() * 4);
        ctx.closePath();
        ctx.fill();
      }
      const top = -size / 2 - spr.oy * size;
      // Elite: leuchtende Umrandung in der Farbe der Eigenschaft (Silhouette des Bilds, dahinter gezeichnet)
      if (e.elite) {
        const g = eliteGlow(spr.img, ELITES[e.elite].color), k = size * (1 + 2 * GLOW_PAD);
        ctx.globalAlpha = this.eliteAlpha(e);
        ctx.drawImage(g, -k / 2, top - size * GLOW_PAD, k, k);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(spr.img, -size / 2, top, size, size);
      if (e.kind === 'schild' || e.kind === 'xs') {
        // Reichweite des Schutzschilds
        ctx.strokeStyle = rgba('#7fd8ff', 0.5);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, 115, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(spr.img, -size / 2, top, size, size);
      }
      ctx.restore();
      this.drawEnemyStatus(ctx, e);
      return;
    }
    const r = e.r;
    ctx.beginPath();
    switch (e.kind) {
      case 'jaeger': ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, r * 0.7); ctx.lineTo(0, r * 0.3); ctx.lineTo(-r * 0.9, r * 0.7); break;
      case 'kanone': for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2; ctx.lineTo(Math.cos(q) * r, Math.sin(q) * r * 1.15); } break;
      case 'rakete': ctx.moveTo(0, -r); ctx.lineTo(r * 0.6, -r * 0.2); ctx.lineTo(r * 0.6, r); ctx.lineTo(-r * 0.6, r); ctx.lineTo(-r * 0.6, -r * 0.2); break;
      case 'schild': case 'xs': ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); break;
      case 'n': ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, r * 0.8); ctx.lineTo(-r * 0.8, r * 0.8); break;
      case 'm': ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.5, -r * 0.2); ctx.lineTo(r, r); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, -r * 0.2); break;
      case 'turret':
        if (e.weapon === 'plasma') { ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.moveTo(r * 0.3, -r * 0.6); ctx.lineTo(r * 0.3, -r * 1.3); ctx.moveTo(-r * 0.3, -r * 0.6); ctx.lineTo(-r * 0.3, -r * 1.3); break; }
        if (e.weapon === 'brut') { for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2; ctx.lineTo(Math.cos(q) * r * 0.9, Math.sin(q) * r * 0.9); } ctx.closePath(); ctx.moveTo(r * 0.45, 0); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); break; }
        if (e.weapon === 'laser') { ctx.moveTo(0, -r * 1.7); ctx.lineTo(r * 0.7, r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7); ctx.lineTo(0, -r * 1.7); break; }
        ctx.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, -r * 1.5); break;
      // Kha'ak: kantige Kristallformen ohne Flügel und Triebwerke
      case 'ks': ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, r * 0.55); ctx.lineTo(0, r * 0.25); ctx.lineTo(-r * 0.75, r * 0.55); break;
      case 'kj': ctx.moveTo(0, -r); ctx.lineTo(r * 0.35, -r * 0.2); ctx.lineTo(r * 0.95, r * 0.7); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.95, r * 0.7); ctx.lineTo(-r * 0.35, -r * 0.2); break;
      case 'ka': ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.45, 0); ctx.lineTo(r * 0.7, r * 0.8); ctx.lineTo(0, r * 0.35); ctx.lineTo(-r * 0.7, r * 0.8); ctx.lineTo(-r * 0.45, 0); break;
      case 'kk': ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.6, -r * 0.5); ctx.lineTo(r, r * 0.3); ctx.lineTo(r * 0.45, r); ctx.lineTo(-r * 0.45, r); ctx.lineTo(-r, r * 0.3); ctx.lineTo(-r * 0.6, -r * 0.5); break;
      case 'boss':
        if (kh) { for (let k = 0; k < 8; k++) { const q = (k / 8) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.75 : r * 1.25; ctx.lineTo(Math.cos(q) * rr, Math.sin(q) * rr); } break; }
        if (xen) for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(q) * r, Math.sin(q) * r); }
        else { ctx.moveTo(0, -r * 1.5); ctx.lineTo(r * 0.7, -r * 0.6); ctx.lineTo(r * 0.8, r); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * 0.8, r); ctx.lineTo(-r * 0.7, -r * 0.6); }
        break;
    }
    ctx.closePath();
    if (e.elite) {
      // Elite: leuchtende Umrandung der Neon-Form
      ctx.save();
      ctx.globalAlpha = this.eliteAlpha(e);
      ctx.shadowColor = ELITES[e.elite].color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = ELITES[e.elite].color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = kh ? '#140a1e' : '#1a0c10';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = e.kind === 'boss' ? 2.2 : 1.5;
    ctx.stroke();
    if (e.kind === 'schild' || e.kind === 'xs') {
      ctx.strokeStyle = rgba('#7fd8ff', 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, 115, 0, Math.PI * 2);
      ctx.setLineDash([3, 9]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (xen || kh || e.kind === 'boss') {
      ctx.fillStyle = rgba(kh ? '#c77dff' : xen ? '#ff3b4a' : '#ffb547', 0.6 + 0.4 * Math.sin(t * 8 + e.orbit));
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.drawEnemyStatus(ctx, e);
  }

  /** Schild-Aufblitzen sowie Hülle und Schild als feine Linien über dem Gegner (Deckkraft einstellbar) */
  /** Deckkraft der Elite-Umrandung: leicht atmend; der Rächer pulst schnell, wenn er angeschlagen ist */
  private eliteAlpha(e: Enemy): number {
    if (e.elite === 'raecher' && e.hp < e.max * 0.5) return 0.55 + 0.45 * Math.sin(this.time * 14);
    return 0.8 + 0.2 * Math.sin(this.time * 3 + e.orbit);
  }

  /** Rächer-Sprengung vor dem Zünden: roter Kreis, der sich zusammenzieht und immer schneller pulst */
  private drawBlasts(ctx: CanvasRenderingContext2D, t: number): void {
    for (const b of this.blasts) {
      const k = 1 - b.t / BLAST_T, pulse = 0.5 + 0.5 * Math.sin(t * (10 + k * 30));
      ctx.fillStyle = rgba(ELITES.raecher.color, 0.06 + 0.12 * k * pulse);
      ctx.beginPath(); ctx.arc(b.x, b.y, BLAST_R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(ELITES.raecher.color, 0.5 + 0.4 * pulse);
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(b.x, b.y, BLAST_R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba('#ffe0c0', 0.6 + 0.4 * pulse);
      ctx.beginPath(); ctx.arc(b.x, b.y, 4 + 8 * k, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawEnemyStatus(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const base = SPEC[e.kind].color;
    // Kommandant: feine goldene Linie zu jedem Verbündeten, dessen Schild er lädt
    if (e.cmdBy) {
      ctx.strokeStyle = rgba(ELITES.kommandant.color, 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.cmdBy.x, e.cmdBy.y); ctx.stroke();
    }
    // Schild-Aufblitzen: Treffer auf den Schild zeigen eine dünne Blase
    if (e.shFlash > 0) {
      ctx.strokeStyle = rgba('#8fe0ff', e.shFlash * 2.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (e.kind === 'boss' ? 1.6 : 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Hülle und Schild: zwei feine Linien über dem Gegner, Deckkraft einstellbar; unbeschädigt noch blasser
    const alpha = this.barAlpha * (e.hp < e.max || e.sh < e.shMax ? 1 : 0.45);
    if (alpha > 0.01) {
      const bw = e.kind === 'boss' ? 80 : Math.max(18, e.r * 2.2), by = e.y - e.r - (e.kind === 'boss' ? 30 : 9);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(14,30,44,0.9)';
      ctx.fillRect(e.x - bw / 2, by - 3, bw, 5);
      if (e.shMax > 0) { ctx.fillStyle = '#8fe0ff'; ctx.fillRect(e.x - bw / 2, by - 3, bw * (e.sh / e.shMax), 2); }
      ctx.fillStyle = base;
      ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.max), 2);
      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, t: number): void {
    // Drohnen
    const dImg = projectileSprite('split-drohne-ki');
    for (let k = 0; k < this.droneN; k++) {
      const [dx, dy] = this.dronePos(k);
      // Begleitjäger der Cobra: eine kleine Mamba
      const escort = this.escortT > 0 && k === this.droneN - 1;
      const eImg = escort ? shipSprite('split-jaeger-s', 'split-jaeger-s')?.img : null;
      const img = eImg ?? dImg;
      if (img) {
        // Bild-Grafik: Split-Drohne, Bug zum Ziel, flackernde Düse
        const size = escort ? 32 : 24;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate((this.droneAim[k] ?? this.aimA) + Math.PI / 2);
        ctx.fillStyle = rgba('#ffa040', 0.5 + 0.3 * Math.random());
        ctx.beginPath();
        ctx.moveTo(-1.2, 0.4 * size); ctx.lineTo(1.2, 0.4 * size); ctx.lineTo(0, 0.4 * size + 3 + Math.random() * 3);
        ctx.closePath();
        ctx.fill();
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = '#1a1030';
      ctx.strokeStyle = '#b690ff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Strahler: Strahlen unter dem Schiff
    if (this.beams.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2] of this.beams) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = rgba(this.wpn.color, 0.3);
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = rgba('#e8ffff', 0.85 + 0.15 * Math.random());
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }
    // Schildblase: beim langen Zerstörer um das ganze Schiff
    const R = this.ship.cls === 'L' ? this.ship.size * 0.5 : this.ship.r;
    ctx.save();
    ctx.translate(this.px, this.py);
    if (this.dashT > 0) ctx.globalAlpha = 0.55;
    if (this.shieldHit > 0 || this.shield < this.shieldMax) {
      const sa = this.shieldHit > 0 ? 0.6 : 0.12 * (this.shield / Math.max(1, this.shieldMax));
      ctx.strokeStyle = rgba('#7fd8ff', sa);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(this.aimA + Math.PI / 2);
    // Flamme nach Schub (driftet der Jäger ohne Schub, glimmen die Düsen nur)
    const thrust = Math.min(1.6, 0.15 + this.thrust * (1 + this.cruise * 0.6));
    const sprite = shipSprite(this.ship.sprite, this.ship.fallback);
    if (sprite) {
      // Bild-Grafik: flackernde Triebwerksflammen hinter den Düsen, darüber das Schiff.
      // Jäger: KI-Bilder füllen das Bild fast ganz aus, die gerenderten haben mehr Rand – daher kleiner gezeichnet.
      const size = this.ship.size === 40 ? (shipArt() === 'ai' ? SPRITE_SIZE * 0.86 : SPRITE_SIZE) : this.ship.size;
      const { xs, y, color } = sprite.engines;
      ctx.fillStyle = rgba(color, 0.35 + 0.5 * thrust);
      const fw = size / 22;
      for (const fx of xs) {
        const ex = fx * size, ey = y * size;
        ctx.beginPath();
        ctx.moveTo(ex - fw, ey); ctx.lineTo(ex + fw, ey); ctx.lineTo(ex, ey + 2 + (thrust * 12 + Math.random() * 3) * (Math.min(size, 92) / 40));
        ctx.closePath();
        ctx.fill();
      }
      ctx.drawImage(sprite.img, -size / 2, -size / 2, size, size);
      if (this.pL.length) this.drawLTurrets(ctx, sprite.img, size);
      if (this.odT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 30);
        ctx.drawImage(sprite.img, -size / 2, -size / 2, size, size);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.scale(this.ship.size / 40, this.ship.size / 40);
      drawFighterVector(ctx);
      ctx.fillStyle = rgba('#9ffff0', 0.4 + 0.5 * thrust);
      ctx.beginPath();
      ctx.moveTo(-3, 10); ctx.lineTo(3, 10); ctx.lineTo(0, 12 + thrust * 10 + Math.random() * 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // eigene Türme (zielen frei)
    const c = Math.cos(this.aimA + Math.PI / 2), sn = Math.sin(this.aimA + Math.PI / 2);
    for (const [i, tur] of this.pTur.entries()) {
      const [tx0, ty0] = this.ship.turrets[i];
      ctx.save();
      ctx.translate(this.px + tx0 * c - ty0 * sn, this.py + tx0 * sn + ty0 * c);
      // Turmbild in der Farbe, die zum Rumpf passt; der runde Sockel deckt den Sockel im Schiffsbild
      const ts = turretSprite(this.turType, this.ship.sprite);
      if (ts) {
        const W = (this.ship.size * (this.ship.turretD ?? 0.1)) / ts.d;
        ctx.rotate(tur.a + Math.PI / 2);
        ctx.drawImage(ts.img, -ts.px * W, -ts.py * W, W, W);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = '#2a1408';
      ctx.strokeStyle = '#ffb070';
      ctx.lineWidth = 1.4;
      // Größe passend zu den Sockeln im Schiffsbild
      const tr = this.ship.size * (this.ship.turretD ?? 0.1) * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffd0a0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(tur.a) * tr * 0.6, Math.sin(tur.a) * tr * 0.6);
      ctx.lineTo(Math.cos(tur.a) * tr * 2.6, Math.sin(tur.a) * tr * 2.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(127,216,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.px, this.py, R + 11, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.shield) / Math.max(1, this.shieldMax));
    ctx.stroke();
    void t;
  }

  /**
   * Schwere L-Türme in Schiffslage (Bug oben, Mitte = 0): erst alle Rohre über dem Rumpf, mit dem Schatten der Flügelkante,
   * dann die erhöhten Flügelplatten noch einmal aus dem Schiffsbild darüber – so kommt das Rohr unter dem Flügel hervor.
   */
  private drawLTurrets(ctx: CanvasRenderingContext2D, hull: HTMLImageElement, size: number): void {
    const mounts = this.ship.lMounts!, L = size * LB_LEN;
    const bimg = projectileSprite(LTURRETS[this.lTurType].barrel);
    const col = this.lt?.color ?? '#ffb070';
    const cover = (pts: [number, number][], dx = 0, dy = 0) => {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x * size + dx, y * size + dy) : ctx.moveTo(x * size + dx, y * size + dy)));
      ctx.closePath();
    };
    // Rohr in seiner Lage: Mündung zeigt nach oben (-y), Drehpunkt im Ursprung; Rückstoß schiebt es zurück
    const frame = (k: number) => {
      const mt = mounts[k], tt = this.pL[k], side = mt.x < 0 ? -1 : 1;
      ctx.translate(mt.x * size, mt.y * size);
      ctx.rotate(side * tt.rel);
      ctx.translate(0, tt.recoil * L * 0.14);
    };
    const bw = (bimg ? (L * bimg.naturalWidth) / bimg.naturalHeight : L * 0.12) * LB_WIDE;
    for (const [k, mt] of mounts.entries()) {
      ctx.save();
      frame(k);
      // Schlagschatten aufs tiefere Deck, damit sich das dunkle Rohr auch über dem Rumpf abhebt
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1.5;
      ctx.shadowOffsetY = 2.5;
      if (bimg) ctx.drawImage(bimg, -bw / 2, -L * (1 - LB_ROOT), bw, L);
      else {
        ctx.fillStyle = '#3a3d42';
        ctx.fillRect(-bw / 2, -L * (1 - LB_ROOT), bw, L);
      }
      ctx.shadowColor = 'transparent';
      // Schatten der Flügelkante nur auf dem Rohr
      ctx.beginPath();
      ctx.rect(-bw / 2, -L * (1 - LB_ROOT), bw, L);
      ctx.clip();
      const tt = this.pL[k], side = mt.x < 0 ? -1 : 1;
      ctx.translate(0, -tt.recoil * L * 0.14);
      ctx.rotate(-side * tt.rel);
      ctx.translate(-mt.x * size, -mt.y * size);
      const u = size / 200;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      cover(mt.cover, 1.2 * u, 1.8 * u);
      ctx.fill();
      cover(mt.cover, 2.6 * u, 3.6 * u);
      ctx.fill();
      ctx.restore();
    }
    // erhöhte Flügelplatten wieder obenauf
    for (const mt of mounts) {
      ctx.save();
      cover(mt.cover);
      ctx.clip();
      ctx.drawImage(hull, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    // Mündungsfeuer
    for (const [k, tt] of this.pL.entries()) {
      if (tt.flash <= 0) continue;
      ctx.save();
      frame(k);
      const f = tt.flash / 0.09, y = -L * (1 - LB_ROOT) - L * 0.04, r = L * (0.18 + 0.22 * f);
      const g = ctx.createRadialGradient(0, y, 0, 0, y, r);
      g.addColorStop(0, rgba('#ffffff', 0.95 * f));
      g.addColorStop(0.35, rgba(col, 0.8 * f));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, y - r * 0.3, r * 0.6, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Vorhaltekreuz: Kreis am Vorhaltepunkt des Ziels, grün wenn die Nase genau darauf zeigt; dazu die Visierlinie */
  private drawLock(ctx: CanvasRenderingContext2D): void {
    const L = this.lock;
    ctx.save();
    // kurze Visierlinie vor der Nase (Reichweite der Bordkanonen)
    const reach = this.reach;
    ctx.strokeStyle = 'rgba(127,255,240,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.moveTo(this.px + Math.cos(this.aimA) * 24, this.py + Math.sin(this.aimA) * 24);
    ctx.lineTo(this.px + Math.cos(this.aimA) * reach, this.py + Math.sin(this.aimA) * reach);
    ctx.stroke();
    ctx.setLineDash([]);
    if (L) {
      const col = L.ok ? '#6bffb0' : '#ffe08a';
      ctx.strokeStyle = rgba(col, 0.35);
      ctx.beginPath();
      ctx.moveTo(L.e.x, L.e.y);
      ctx.lineTo(L.x, L.y);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(L.x, L.y, 7, 0, Math.PI * 2);
      ctx.moveTo(L.x - 11, L.y); ctx.lineTo(L.x - 4, L.y);
      ctx.moveTo(L.x + 4, L.y); ctx.lineTo(L.x + 11, L.y);
      ctx.moveTo(L.x, L.y - 11); ctx.lineTo(L.x, L.y - 4);
      ctx.moveTo(L.x, L.y + 4); ctx.lineTo(L.x, L.y + 11);
      ctx.stroke();
      // Ziel markieren
      ctx.strokeStyle = rgba(col, 0.6);
      ctx.lineWidth = 1.2;
      const r = L.e.r + 8;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(L.e.x, L.e.y, r, a - 0.3, a + 0.3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Pfeile am Rand für Gegner (und Frachter) außerhalb des Bildes */
  private drawIndicators(ctx: CanvasRenderingContext2D): void {
    const arrow = (wx: number, wy: number, color: string, size = 6): [number, number] | null => {
      const sx = (wx - this.camX) * this.zoom, sy = (wy - this.camY) * this.zoom;
      if (sx > 0 && sx < this.w && sy > TOP && sy < this.h) return null;
      const x = clamp(sx, 12, this.w - 12);
      // nicht unter dem Radar oben rechts
      const y = clamp(sy, x > this.w - 116 ? TOP + 162 : TOP + 12, this.h - 12);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(sy - y, sx - x));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size + 1, 0); ctx.lineTo(-size + 1, size - 1); ctx.lineTo(-size + 1, -size + 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return [x, y];
    };
    // Gruppen im Anflug auf den Frachter: Restzeit am Pfeil des vordersten Schiffs
    const lead = new Map<number, { e: Enemy; d: number }>();
    for (const e of this.enemies) {
      if (e.parent || e.target !== 'f' || e.grp == null) continue;
      const d = this.wardDist(e.x, e.y);
      const cur = lead.get(e.grp);
      if (!cur || d < cur.d) lead.set(e.grp, { e, d });
    }
    ctx.save();
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of this.enemies) {
      if (e.parent) continue;
      const pos = arrow(e.x, e.y, rgba(e.kind === 'boss' ? '#ff5c6c' : SPEC[e.kind].color, 0.85), e.kind === 'boss' || e.kind === 'cargo' ? 9 : 6);
      const L = e.grp != null ? lead.get(e.grp) : undefined;
      if (pos && L && L.e === e && L.d > 220) {
        const eta = Math.max(1, Math.ceil((L.d - 120) / SPEC[e.kind].speed));
        const tx = clamp(pos[0], 30, this.w - 30), ty = clamp(pos[1] + (pos[1] > this.h - 30 ? -16 : 16), TOP + 10, this.h - 10);
        ctx.fillStyle = 'rgba(5,14,22,0.8)';
        ctx.fillRect(tx - 17, ty - 8, 34, 16);
        ctx.fillStyle = eta <= 8 ? '#ff9aa4' : '#ffd27a';
        ctx.fillText(`${eta} s`, tx, ty + 0.5);
      }
    }
    ctx.restore();
    for (const m of this.eMissiles) arrow(m.x, m.y, 'rgba(255,138,92,0.9)', 5);
    for (const w of this.liveWards) arrow(this.wx(w), this.wy(w), w.kind === 'berger' ? '#6be38f' : '#5ff0d8', 9);
    // Bergung: ohne Container am Seil zeigt ein Pfeil zum nächsten Container
    if (this.mission === 'bergung' && !this.towing) {
      const c = this.crates.filter((q) => !q.done).sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py))[0];
      if (c) arrow(c.x, c.y, '#ffd27a', 7);
    }
    if (this.mission === 'ueberfall') arrow(this.gateX, this.gateCy, '#9fe6ff', 8);
  }

  /** Radar um den eigenen Jäger (±RADAR Welteinheiten); Gegner außerhalb erscheinen am Rand */
  private drawRadar(ctx: CanvasRenderingContext2D): void {
    const RADAR = 1500, rw = 92, rh = 92;
    const x0 = this.w - rw - 10, y0 = TOP + 6;
    const sc = rw / (RADAR * 2);
    ctx.save();
    ctx.fillStyle = 'rgba(5,14,22,0.78)';
    ctx.fillRect(x0, y0, rw, rh);
    ctx.strokeStyle = 'rgba(110,220,205,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, rw - 1, rh - 1);
    ctx.beginPath();
    ctx.rect(x0, y0, rw, rh);
    ctx.clip();
    const cx = x0 + rw / 2, cy = y0 + rh / 2;
    const pos = (x: number, y: number, edge = false): [number, number] | null => {
      let rx = (x - this.px) * sc, ry = (y - this.py) * sc;
      const m = Math.max(Math.abs(rx) / (rw / 2 - 3), Math.abs(ry) / (rh / 2 - 3));
      if (m > 1) { if (!edge) return null; rx /= m; ry /= m; }
      return [cx + rx, cy + ry];
    };
    // Kartenrand und Bildausschnitt
    ctx.strokeStyle = 'rgba(110,220,205,0.18)';
    ctx.strokeRect(cx + (0 - this.px) * sc, cy + (0 - this.py) * sc, this.WW * sc, this.WH * sc);
    ctx.strokeStyle = 'rgba(228,243,240,0.3)';
    ctx.strokeRect(cx + (this.camX - this.px) * sc, cy + (this.camY + TOP / this.zoom - this.py) * sc, (this.w / this.zoom) * sc, ((this.h - TOP) / this.zoom) * sc);
    // Kreis um jedes Schutzziel: ab hier wird es für es gefährlich
    const wps = this.liveWards.map((w) => pos(this.wx(w), this.wy(w), true)!);
    ctx.strokeStyle = 'rgba(95,240,216,0.25)';
    for (const fp of wps) {
      ctx.beginPath();
      ctx.arc(fp[0], fp[1], 300 * sc, 0, Math.PI * 2);
      ctx.stroke();
    }
    const dot = (p: [number, number] | null, c: string, r = 1.6) => { if (!p) return; ctx.fillStyle = c; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); };
    for (const c of this.crates) if (!c.done) dot(pos(c.x, c.y), c.tow ? '#9ffff0' : '#ffd27a', 1.6);
    if (this.mission === 'ueberfall') dot(pos(this.gateX, this.gateCy, true), '#9fe6ff', 3);
    for (const k of this.rocks) dot(pos(k.x, k.y), 'rgba(168,154,138,0.6)', 1.2);
    for (const m of this.mines) dot(pos(m.x, m.y), 'rgba(255,181,71,0.7)', 1);
    for (const p of this.pickups) dot(pos(p.x, p.y), '#6be38f', 1.4);
    for (const e of this.enemies) if (!e.parent) dot(pos(e.x, e.y, true), e.kind === 'boss' ? '#ff5c6c' : SPEC[e.kind].color, e.kind === 'boss' || e.kind === 'cargo' ? 3 : 1.7);
    for (const fp of wps) dot(fp, '#5ff0d8', 2.8);
    // eigener Jäger als kleiner Pfeil
    ctx.translate(cx, cy);
    ctx.rotate(this.aimA + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(3, 3); ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawProgress(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(169,195,198,0.85)';
    const x = 12, y = TOP + 14;
    const bar = (label: string, f: number, col: string) => {
      ctx.fillText(label, x, y);
      const bx = x + ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(110,220,205,0.2)';
      ctx.fillRect(bx, y - 6, 110, 4);
      ctx.fillStyle = col;
      ctx.fillRect(bx, y - 6, 110 * clamp(f, 0, 1), 4);
    };
    const m = this.mission;
    if (m === 'flucht') bar('SPRUNGANTRIEB', this.charge, '#7fd8ff');
    else if (m === 'bergung') bar(`CONTAINER ${this.crateDone}/${CRATES}${this.crateLost ? ` · ${this.crateLost} VERLOREN` : ''}`, this.crateDone / CRATES, '#6be38f');
    else if (m === 'ueberfall') {
      ctx.fillText(`PIRATENKONVOI · ${this.cargoKilled} ZERSTÖRT${this.cargoEscaped ? ` · ${this.cargoEscaped} ENTKOMMEN` : ''}`, x, y);
      // Vorsprung des vordersten Frachters zum Tor
      const lead = this.enemies.filter((e) => e.kind === 'cargo').reduce((a, e) => Math.min(a, e.y - this.gateCy), Infinity);
      if (Number.isFinite(lead)) { ctx.fillStyle = lead < 600 ? '#ff9aa4' : 'rgba(169,195,198,0.85)'; ctx.fillText(`TOR IN ${Math.max(0, Math.round(lead / (SPEC.cargo.speed * (1 + 0.08 * (this.level - 1)))))} s`, x, y + 16); }
    } else if (m === 'nest') {
      const open = this.enemies.filter((e) => e.parent?.nest && e.weapon === 'brut').length;
      ctx.fillText(open ? `BRUTÖFFNUNGEN ${open}/${NEST_OPEN}` : this.enemies.some((e) => e.nest) ? 'KERN UNGESCHÜTZT' : 'NEST', x, y);
    } else if (m === 'station') {
      ctx.fillText(`WELLE ${Math.max(1, this.wave + 1)} VON ${this.nWaves}${this.isBossWave(Math.max(0, this.wave)) ? ' · GROSSKAMPFSCHIFF' : ''}`, x, y);
      const st = this.wards[0];
      ctx.fillStyle = 'rgba(169,195,198,0.85)';
      if (st) ctx.fillText(`STATIONSTÜRME ${st.tur.filter((q) => q.hp > 0).length}/6`, x, y + 16);
    } else if (this.mode === 'endless') {
      ctx.fillText(`WELLE ${Math.max(1, this.wave + 1)}${this.isBossWave(Math.max(0, this.wave)) ? ' · BOSS' : ''}`, x, y);
    } else {
      ctx.fillText('STRECKE', x, y);
      for (let i = 0; i < this.nWaves; i++) {
        const bx = x + 58 + i * 26;
        const doneW = i < this.wave || (i === this.wave && this.enemies.length === 0 && this.wave >= 0);
        ctx.fillStyle = doneW ? '#5ff0d8' : i === this.wave ? '#ffb547' : 'rgba(110,220,205,0.2)';
        if (i === this.nWaves - 1) { ctx.beginPath(); ctx.arc(bx + 8, y - 4, 5, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(bx, y - 6, 20, 4);
      }
    }
    const waiting = this.moving && this.fY <= this.fGoal + 1 && this.wave >= 0 && this.enemies.length > 0 && this.gateT < 0;
    if (waiting) {
      ctx.fillStyle = '#ffb547';
      ctx.fillText(this.mission === 'konvoi' ? 'KONVOI WARTET' : 'FRACHTER WARTET', x, y + 18);
    }
    if (this.towing) {
      ctx.fillStyle = '#9ffff0';
      ctx.fillText('CONTAINER AM SEIL', x, y + 18);
    }
    if (this.cruise > 0.3) {
      ctx.fillStyle = rgba('#9ffff0', 0.5 + 0.5 * this.cruise);
      ctx.fillText('REISEANTRIEB', x, y + (waiting || this.towing || m === 'station' || m === 'ueberfall' ? 34 : 18));
    }
    ctx.restore();
  }

  /**
   * Magazinanzeige rechts unten: Füllstand als Segmente (bei kleinen Magazinen) oder Balken, Schusszahl,
   * beim Nachladen ein bernsteinfarbener Fortschrittsbalken mit Restzeit. Strahlwaffen haben kein Magazin.
   */
  /** Befehlsknöpfe der Türme; beim Halten klappen die vier Befehle um den Knopf auf (oben alle, links S, rechts M, unten L) */
  private drawOrders(ctx: CanvasRenderingContext2D): void {
    const btns = this.orderBtns;
    if (!btns.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // beim Aufklappen nur der gehaltene Knopf (die Auswahl liegt sonst über dem anderen)
    const shown = this.orderDrag ? btns.filter(([w]) => w === this.orderDrag!.which) : btns;
    for (const [which, x, y, r] of shown) {
      const cur = this.orders[which], open = this.orderDrag?.which === which;
      ctx.fillStyle = open ? 'rgba(20,48,60,0.92)' : 'rgba(5,14,22,0.78)';
      ctx.strokeStyle = cur === 'alle' ? 'rgba(110,220,205,0.45)' : 'rgba(255,181,71,0.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e4f3f0';
      ctx.font = '700 13px "Chakra Petch", Barlow, sans-serif';
      ctx.fillText(which === 'm' ? 'M' : 'L', x, y - 5);
      ctx.fillStyle = cur === 'alle' ? 'rgba(169,195,198,0.85)' : '#ffb547';
      ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
      ctx.fillText(cur === 'alle' ? 'ALLE' : `→ ${cur}`, x, y + 8);
      if (!open) continue;
      // aufgeklappte Auswahl
      const pick = this.orderDrag!.pick;
      for (const [o, dx, dy] of ORDER_DIRS) {
        const bx = x + dx * 52, by = y + dy * 52, on = pick === o, active = cur === o;
        ctx.fillStyle = on ? 'rgba(255,181,71,0.9)' : 'rgba(5,14,22,0.88)';
        ctx.strokeStyle = active ? '#ffb547' : 'rgba(110,220,205,0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(bx, by, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = on ? '#1a1206' : '#e4f3f0';
        ctx.font = `700 ${o === 'alle' ? 10 : 13}px "Chakra Petch", Barlow, sans-serif`;
        ctx.fillText(o === 'alle' ? 'ALLE' : o, bx, by);
      }
    }
    ctx.restore();
  }

  private drawAmmo(ctx: CanvasRenderingContext2D): void {
    const w = this.wpn;
    if (!w.mag || w.beam) return;
    // klein und unaufdringlich unter den Zoom-Knöpfen – frei vom großen Zielstick
    const W = 84, H = 4;
    const x = this.w - W - 20, y = TOP + 184;
    ctx.save();
    ctx.fillStyle = 'rgba(5,14,22,0.72)';
    ctx.strokeStyle = 'rgba(110,220,205,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 14, W + 12, H + 20, 6);
    ctx.fill();
    ctx.stroke();
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textBaseline = 'alphabetic';
    if (this.reloading) {
      const f = 1 - this.reloadLeft / Math.max(0.01, this.reloadMax);
      ctx.fillStyle = '#ffb547';
      ctx.textAlign = 'left';
      ctx.fillText('NACHLADEN', x, y - 4);
      ctx.textAlign = 'right';
      ctx.fillText(`${this.reloadLeft.toFixed(1).replace('.', ',')} s`, x + W, y - 4);
      ctx.fillStyle = 'rgba(255,181,71,0.18)';
      ctx.fillRect(x, y, W, H);
      ctx.fillStyle = '#ffb547';
      ctx.fillRect(x, y, W * f, H);
    } else {
      const n = this.mag, max = w.mag;
      const low = n / max <= 0.25;
      ctx.fillStyle = low ? '#ffb547' : 'rgba(169,195,198,0.85)';
      ctx.textAlign = 'left';
      ctx.fillText('MAGAZIN', x, y - 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = low ? '#ffb547' : '#e4f3f0';
      ctx.fillText(`${n} / ${max}`, x + W, y - 4);
      if (max <= 24) {
        const gap = max > 12 ? 1 : 2, sw = (W - gap * (max - 1)) / max;
        for (let i = 0; i < max; i++) {
          ctx.fillStyle = i < n ? (low ? '#ffb547' : '#7ffff0') : 'rgba(127,255,240,0.14)';
          ctx.fillRect(x + i * (sw + gap), y, sw, H);
        }
      } else {
        ctx.fillStyle = 'rgba(127,255,240,0.14)';
        ctx.fillRect(x, y, W, H);
        ctx.fillStyle = low ? '#ffb547' : '#7ffff0';
        ctx.fillRect(x, y, (W * n) / max, H);
      }
    }
    ctx.restore();
  }

  /** PC: Belegung der Tasten – nach dem Umschalten deutlich, danach nur noch blass unten links */
  private drawPcHint(ctx: CanvasRenderingContext2D): void {
    const a = this.pcT < 10 ? 0.85 : this.pcT < 12 ? 0.85 - (this.pcT - 10) * 0.3 : 0.25;
    const lines = ['W/A/S/D  fliegen (vor, zurück, seitwärts)', 'Maus  zielen · Linksklick  feuern', `Rechtsklick / R  Raketen · Leertaste  ${SPECIALS[this.ship.special].name}`, 'Mausrad  Zoom'];
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a9c3c6';
    for (const [i, l] of lines.entries()) ctx.fillText(l, 14, this.h - 18 - (lines.length - 1 - i) * 15);
    ctx.restore();
  }

  private drawControls(ctx: CanvasRenderingContext2D, t: number): void {
    const stick = (j: { ox: number; oy: number; kx: number; ky: number }, inner: number, dashed: boolean, color: string, R = JOY_R) => {
      ctx.strokeStyle = rgba(color, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, R, 0, Math.PI * 2);
      ctx.stroke();
      // innerer Ring: ein Stick – nur drehen (ohne Schub); zwei Sticks rechts – bis hier nur zielen, darüber feuern
      ctx.setLineDash(dashed ? [4, 5] : []);
      ctx.strokeStyle = rgba(color, 0.3);
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, R * inner, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(color, 0.35);
      ctx.beginPath();
      ctx.arc(j.ox + j.kx * R, j.oy + j.ky * R, 22, 0, Math.PI * 2);
      ctx.fill();
    };
    const j = this.joy;
    if (this.pc) this.drawPcHint(ctx);
    if (j && j.id !== 99 && !this.pc) stick(j, this.ctrl === 'zwei' ? 0.12 : TURN_ONLY, true, '#3fe0c5');
    if (this.aim) {
      stick(this.aim, AIM_FIRE, true, this.fireId !== null ? '#ffb547' : '#3fe0c5', AIM_R);
      // Feuerschwelle leuchtet beim Überschreiten kurz auf
      if (this.ringFlash > 0) {
        ctx.strokeStyle = rgba('#ffd27a', this.ringFlash * 3);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.aim.ox, this.aim.oy, AIM_R * AIM_FIRE, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Lenkrad: Hilfslinie „geradeaus“ nach oben
      if (this.ctrl === 'lenk') {
        ctx.strokeStyle = 'rgba(110,220,205,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.aim.ox, this.aim.oy - AIM_R * 0.2);
        ctx.lineTo(this.aim.ox, this.aim.oy - AIM_R);
        ctx.stroke();
      }
    }
    this.drawAmmo(ctx);
    this.drawOrders(ctx);
    for (const [btn, label, can] of [[this.btnZoomOut, '−', this.zoomGoal > ZOOMS[ZOOMS.length - 1]], [this.btnZoomIn, '+', this.zoomGoal < ZOOMS[0]]] as const) {
      ctx.fillStyle = 'rgba(5,14,22,0.78)';
      ctx.strokeStyle = can ? 'rgba(110,220,205,0.55)' : 'rgba(110,220,205,0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(btn[0], btn[1], btn[2], 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = can ? '#9ffff0' : 'rgba(159,255,240,0.3)';
      ctx.font = '700 18px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, btn[0], btn[1] + 1);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.fillStyle = 'rgba(169,195,198,0.7)';
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZOOM', this.w - 60, TOP + 152);
    const [fbx, fby, fbr] = this.btnFire;
    if (this.ctrl === 'eins' && !this.pc && this.fireId !== null && this.fireId !== 99) {
      ctx.fillStyle = 'rgba(127,255,240,0.25)';
      ctx.beginPath();
      ctx.arc(fbx, fby, fbr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.ctrl === 'eins' && !this.pc) drawButton(ctx, fbx, fby, fbr, 1, '#7ffff0', 'F', t);
    const [bx, by, br] = this.btnMissile;
    if (this.launchers.length) {
      drawButton(ctx, bx, by, br, this.ammo > 0 ? 1 - this.missileCd / this.missileCdMax : 0, '#ffb547', 'R', t);
      // Raketen im Lager
      ctx.fillStyle = this.ammo > 0 ? 'rgba(255,210,122,0.9)' : 'rgba(255,92,108,0.9)';
      ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(this.ammo), bx, by - br - 6);
    }
    const [dx, dy, dr] = this.btnDash;
    drawButton(ctx, dx, dy, dr, 1 - this.dashCd / this.dashCdMax, '#5ff0d8', SPECIALS[this.ship.special].key, t);
  }

  private drawCards(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(1,5,10,0.6)';
    ctx.fillRect(0, 0, this.w, this.h);
    const rects = this.cardRects();
    ctx.textAlign = 'center';
    ctx.font = '700 20px "Chakra Petch", Barlow, sans-serif';
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(`Welle ${this.wave + 1} geschafft`, this.w / 2, rects[0][1] - 38);
    ctx.font = '500 14px Barlow, sans-serif';
    ctx.fillStyle = 'rgba(228,243,240,0.85)';
    ctx.fillText('Wähle eine Verbesserung', this.w / 2, rects[0][1] - 16);
    for (const [i, c] of this.choosing!.entries()) {
      const [x, y, w, h] = rects[i];
      ctx.fillStyle = '#0b1a28';
      ctx.strokeStyle = 'rgba(63,224,197,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect?.(x, y, w, h, 14);
      if (!ctx.roundRect) ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e4f3f0';
      ctx.font = '600 17px "Chakra Petch", Barlow, sans-serif';
      ctx.fillText(c.name, x + 16, y + 30);
      ctx.fillStyle = 'rgba(169,195,198,0.95)';
      ctx.font = '500 14px Barlow, sans-serif';
      ctx.fillText(c.desc, x + 16, y + 54);
      // Stufe als Rauten
      const lvl = this.c(c.id);
      if (c.max < 10) for (let k = 0; k < c.max; k++) {
        ctx.fillStyle = k < lvl ? '#ffb547' : k === lvl ? 'rgba(255,181,71,0.5)' : 'rgba(110,220,205,0.2)';
        ctx.save();
        ctx.translate(x + w - 18 - k * 14, y + 24);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
    }
  }
}
