// Minispiel „Piratenangriff“ / „Xenon-Schwarm“: Den Frachter bis zum Sprungtor beschützen.
// Große Karte: der Frachter fliegt seine Route bis zum Sprungtor, Gegner kommen in Gruppen von weit her und
// werden abgefangen. Alle Schiffe haben feste Bordkanonen (schießen nur geradeaus) – frei zielen nur
// Geschütztürme (Boss, Frachter), Lenkraketen und die Begleitdrohne. Schwebender Joystick (Drehen + Schub),
// Feuertaste mit Vorhaltekreuz, Reiseantrieb ohne Gegner in der Nähe, Raketensalve und Ausweichmanöver. Nach jeder besiegten Welle wählt man eine von drei Verbesserungen.
// Gegner: Jäger, Kanonenboote, Raketenboote (Raketen abschießbar), Schildträger; Xenon N, M und
// Schirmdrohnen; zum Schluss ein Boss mit Geschütztürmen. Abschnitte mit Asteroiden (Deckung) oder Minen.
// Endlos-Modus: Wellen ohne Ende, alle fünf Wellen ein Boss.
import { sfx } from '../ui/sound';
import { enemySprite, fighterKind, preloadSprites, projectileSprite, shipArt, shipSprite } from '../render/shipArt';
import { BEAM_LEN, SHIELDS, SHIPS, SPECIALS, WEAPONS, loadout, type Loadout, type ShieldDef, type ShipDef, type WeaponDef } from './loadout';
import {
  buzz, clamp, drawButton, findMutator, Floaters, Particles, pickGoals, rgba, rng, Score, setGoal, Starfield, TOP,
  type GameCfg, type GameResult, type Gear, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mode, type Mutator,
} from './common';

export type { Gear } from './common';

type Side = 'pirate' | 'xenon';
type EKind = 'jaeger' | 'kanone' | 'rakete' | 'schild' | 'n' | 'm' | 'xs' | 'boss' | 'turret';

interface Enemy {
  kind: EKind; x: number; y: number; vx: number; vy: number;
  hp: number; max: number; cd: number; r: number;
  target: 'f' | 'p'; orbit: number; flash: number; dir: number;
  /** Blickrichtung (Bordkanonen feuern nur dorthin) */
  ang: number;
  /** Jäger-Anflug: nach dem Überflug kurz abdrehen (Restzeit, Richtung) */
  brk?: number; brkA?: number;
  /** Gruppe, mit der der Gegner angeflogen kam */
  grp?: number;
  /** Boss-Teile: Eltern und Versatz */
  parent?: Enemy; ox?: number; oy?: number;
  /** Xenon-Türme: Laserstrahl (zielt, lädt auf, feuert einen Strahl) oder dicke Plasmakugeln */
  weapon?: 'laser' | 'plasma';
  /** Laserstrahl: Restzeit (aufladen, dann feuern), Richtung, angesammelter Schaden am Frachter */
  beamT?: number; beamA?: number; beamAcc?: number;
  shielded: boolean;
  inside?: boolean;
}
interface Bullet { x: number; y: number; vx: number; vy: number; dmg: number; from: 'p' | 'e'; life: number; color: string; w: number; pierce: number; hit?: Set<Enemy>; /** Flächenschaden beim Einschlag (Plasma) */ splash?: number }
interface Missile { x: number; y: number; vx: number; vy: number; target: Enemy | null; life: number }
/** Gegnerische Lenkrakete: kann abgeschossen werden */
interface EMissile { x: number; y: number; vx: number; vy: number; hp: number; life: number; target: 'f' | 'p' }
interface Pickup { x: number; y: number; kind: 'repair' | 'shield' | 'missile'; life: number }
interface Rock { x: number; y: number; r: number; vx: number; vy: number; rot: number; vr: number; pts: number[]; /** welches der vier Asteroidenbilder */ v: number }
interface Mine { x: number; y: number; vx: number; vy: number; armed: number; hp: number }
interface Card { id: string; name: string; desc: string; max: number }

/** Laserturm der Xenon: Reichweite, Aufladezeit, Brenndauer, Schaden pro Sekunde */
const LASER_LEN = 400, LASER_CHARGE = 0.9, LASER_FIRE = 0.55, LASER_DPS = 34;

/** Drehrate je Gegnerart (rad/s): Jäger wendig, Kanonenboote träge – wer sie umkreist, ist vor ihren Kanonen sicher */
const TURN: Record<EKind, number> = { jaeger: 2.4, kanone: 0.8, rakete: 1, schild: 1.6, n: 3, m: 1.3, xs: 1.6, boss: 0.45, turret: 0 };
/** Geschossgeschwindigkeit der Bordkanonen je Gegnerart (für den Vorhalt) */
const SHOT_V: Partial<Record<EKind, number>> = { jaeger: 300, kanone: 240, n: 340, m: 430, rakete: 150 };
/** Bis zu dieser Entfernung lassen sich Gegner vom Jäger abfangen (danach kämpfen sie mit ihm statt mit dem Frachter) */
const AGGRO = 380;
/** Karte: Breite, Länge je Streckenabschnitt, Rand oben/unten */
const MAP_W = 2600, LEG = 900, MAP_PAD = 520;
/** Frachter-Tempo auf seiner Route */
const F_SPEED = 24;
/** Zielhilfe: liegt der Vorhaltepunkt so nah vor der Nase (rad), gehen die Schüsse genau dorthin */
const AIM_ASSIST = 0.15;

/** Winkel auf (−π, π] */
function wrapA(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
/** Winkel a um höchstens step in Richtung b drehen */
function turnTo(a: number, b: number, step: number): number {
  const d = wrapA(b - a);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

const SPEC: Record<EKind, { hp: number; speed: number; r: number; color: string; name: string; pts: number; cost: number }> = {
  jaeger: { hp: 30, speed: 165, r: 10, color: '#ff8a5c', name: 'Piratenjäger', pts: 100, cost: 2 },
  kanone: { hp: 95, speed: 70, r: 16, color: '#ffb547', name: 'Kanonenboot', pts: 250, cost: 4 },
  rakete: { hp: 55, speed: 90, r: 13, color: '#ffd27a', name: 'Raketenboot', pts: 200, cost: 3.5 },
  schild: { hp: 70, speed: 85, r: 13, color: '#7fd8ff', name: 'Schildträger', pts: 250, cost: 4 },
  n: { hp: 15, speed: 205, r: 8, color: '#ff3b4a', name: 'Xenon N', pts: 60, cost: 1.5 },
  m: { hp: 75, speed: 95, r: 14, color: '#ff5c6c', name: 'Xenon M', pts: 250, cost: 4 },
  xs: { hp: 70, speed: 85, r: 13, color: '#ff9ab0', name: 'Schirmdrohne', pts: 250, cost: 4 },
  boss: { hp: 450, speed: 45, r: 34, color: '#ffb547', name: 'Boss', pts: 1500, cost: 0 },
  turret: { hp: 90, speed: 0, r: 13, color: '#ffd27a', name: 'Geschützturm', pts: 200, cost: 0 },
};

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

export const SHOOTER_MUTATORS: Mutator[] = [
  { id: 'swarm', name: 'Schwarm', desc: 'Deutlich mehr Gegner pro Welle', mult: 1.5 },
  { id: 'glass', name: 'Glaskanone', desc: 'Doppelter Schaden, aber nur halber Schild', mult: 1.4 },
  { id: 'ion', name: 'Ionensturm', desc: 'Schilde laden sich nicht von selbst auf', mult: 1.5 },
  { id: 'mines', name: 'Minengürtel', desc: 'Minen auf der ganzen Strecke', mult: 1.3 },
  { id: 'bounty', name: 'Kopfgeld', desc: 'Mehr Fundstücke, Abschüsse zählen mehr', mult: 1.2 },
];

const NORMAL_GOALS: GoalDef[] = [
  { id: 'hull80', text: 'Frachter mit über 80 % Hülle ans Tor' },
  { id: 'boss30', text: 'Den Boss in unter 30 s zerstören' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'nomissile', text: 'Ohne Raketensalve gewinnen' },
  { id: 'tough', text: 'Jäger-Hülle nie unter 50 %' },
  { id: 'loot3', text: 'Drei Fundstücke einsammeln' },
];
const ENDLESS_GOALS: GoalDef[] = [
  { id: 'wave6', text: 'Welle 6 erreichen' },
  { id: 'wave10', text: 'Welle 10 erreichen' },
  { id: 'combo4', text: 'Kombo ×4 erreichen' },
  { id: 'boss2', text: 'Zwei Bosse besiegen' },
];
export const SHOOTER_GOALS: GoalDef[] = [...NORMAL_GOALS, ...ENDLESS_GOALS];

/** Zoomstufen des Kampffelds (kleiner = weiter herausgezoomt, mehr Überblick); per Taste wählbar, wird gemerkt */
const ZOOMS = [0.72, 0.58, 0.46, 0.36];
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
const HP_MUL: Record<Level, number> = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.45, 5: 1.6 };
/** Größe des Schiffsbilds in Bildpunkten (das Bild hat Rand, das Schiff selbst ist etwa 85 % davon) */
const SPRITE_SIZE = 46;

/** Der eigene Jäger als Neon-Zeichnung (Nase oben, etwa 25 Bildpunkte lang) */
export function drawFighterVector(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.lineTo(5, -4); ctx.lineTo(12, 8); ctx.lineTo(4, 6); ctx.lineTo(0, 11); ctx.lineTo(-4, 6); ctx.lineTo(-12, 8); ctx.lineTo(-5, -4);
  ctx.closePath();
  ctx.fillStyle = '#0a2028';
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,224,197,0.3)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = '#3fe0c5';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

export class ShooterGame implements MiniGame {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly controls = [
    'Links hinhalten und ziehen: Joystick – der Jäger dreht sich in die Richtung und fliegt vorwärts',
    'Bordkanonen schießen nur geradeaus: Feuertaste (F) halten; der Kreis vor dem Ziel zeigt, wohin du zielen musst',
    'Raketen (R) suchen ihr Ziel selbst, Ausweichen (A); ohne Gegner in der Nähe schaltet der Reiseantrieb zu',
    'Gegner kommen von weit her – fang sie ab, bevor sie den Frachter erreichen',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
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
  private readonly wpn: WeaponDef;
  private readonly tw: WeaponDef;
  private readonly sh: ShieldDef;
  /** Waffenüberladung, Nachbrenner, Begleitjäger: Restzeit */
  private odT = 0;
  private sprintT = 0;
  private escortT = 0;
  /** nächste Bordkanone (reihum) */
  private gunI = 0;
  /** Türme des eigenen Schiffs: Pause und Richtung */
  private pTur: { cd: number; a: number }[] = [];
  /** Strahler: Strahlen dieses Bilds (von – bis) für die Darstellung */
  private beams: [number, number, number, number][] = [];
  private dashVx = 0;
  private dashVy = 0;
  private droneA = 0;
  /** Blickrichtung je Drohne: zum letzten Ziel, sonst wie der Jäger */
  private droneAim: number[] = [];
  private droneCd = 0;
  // Frachter: Position auf der Route, Ziel des aktuellen Abschnitts, eigene Abwehrtürme
  private fX = 0;
  private fY = 0;
  private fGoal = 0;
  private fVy = 0;
  private fTur = [{ oy: -30, cd: 0, a: -Math.PI / 2 }, { oy: 34, cd: 0.3, a: Math.PI / 2 }];
  private gateX = 0;
  private gateY = 0;
  private grpN = 0;
  private fHull = 400;
  private readonly fMax = 400;
  private fFlash = 0;
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
  private outcome: 'win' | 'freighter' | 'player' | null = null;
  private choosing: Card[] | null = null;
  private pendingSpawn = -1;
  /** Verstärkung einer Welle: kommt einige Sekunden später von anderer Seite */
  private reinforce: { t: number; kinds: EKind[]; from: number }[] = [];
  private shake = 0;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(170, 31);
  private w = 1;
  private h = 1;
  // Eingabe
  private joy: { id: number; ox: number; oy: number; kx: number; ky: number } | null = null;
  private done: GameResult | null = null;

  constructor(cfg: GameCfg, private side: Side) {
    this.level = cfg.level;
    this.mode = cfg.mode === 'endless' ? 'endless' : cfg.mode ?? 'normal';
    this.r = rng(cfg.seed);
    this.gear = cfg.gear ?? { weapon: 1, shield: 1, engine: 1 };
    this.mutator = findMutator(SHOOTER_MUTATORS, cfg.mutator);
    const lo: Loadout = cfg.loadout ?? loadout();
    this.ship = SHIPS[lo.ship];
    this.wpn = WEAPONS[lo.weapon];
    this.tw = WEAPONS[lo.turret];
    this.sh = SHIELDS[lo.shield];
    this.pTur = this.ship.turrets.map(() => ({ cd: 0, a: -Math.PI / 2 }));
    // Schiffsbilder liegen als eigene Dateien vor: gleich laden, bis dahin wird kurz per Code gezeichnet
    preloadSprites();
    this.score = new Score(this.mutator?.mult ?? 1, 6);
    this.goals = pickGoals(this.mode === 'endless' ? ENDLESS_GOALS : NORMAL_GOALS, rng(cfg.seed ^ 0x77));
    this.shield = this.shieldMax;
    this.eyebrow = side === 'pirate' ? 'Piraten' : 'Xenon';
    this.title = this.mode === 'endless' ? 'Endlos' : side === 'pirate' ? 'Geleitschutz' : 'Abwehr';
    this.intro = this.mode === 'endless'
      ? `Welle um Welle – alle fünf Wellen ein Boss. Der Frachter wird zwischen den Wellen etwas repariert. Wie weit kommst du?`
      : side === 'pirate'
        ? 'Dein Frachter fliegt zum Sprungtor, Piraten lauern auf der Route. Fang sie ab, bevor sie ihn erreichen – Raketen- und Kanonenboote zuerst. Zum Schluss stellt sich die Piratenfregatte: erst die Geschütztürme.'
        : 'Dein Frachter fliegt zum Sprungtor, Xenon fallen von allen Seiten ein. Fang sie weit draußen ab. Zum Schluss greift ein K-Segment an: erst Laser- und Plasmatürme, dann der Kern.';
    // Abschnitte: Welle 2 und 3 mit Asteroiden oder Minen
    for (let i = 0; i < 40; i++) this.sectionPlan.push(this.mutator?.id === 'mines' ? 'mines' : i === 0 ? 'none' : this.r() < 0.45 ? (this.r() < 0.5 ? 'rocks' : 'mines') : 'none');
  }

  // ---------- abgeleitete Werte ----------

  private c(id: string): number { return this.cards[id] ?? 0; }
  private get speed(): number { return [200, 235, 270][this.gear.engine - 1] * (1 + 0.12 * this.c('speed')) * this.ship.speed * (this.sprintT > 0 ? 1.7 : 1); }
  private get turnRate(): number { return [3.8, 4.3, 4.8][this.gear.engine - 1] * (1 + 0.1 * this.c('speed')) * this.ship.turn * (this.sprintT > 0 ? 1.3 : 1); }
  /** Drohnen: aus Verbesserungen, dazu der Begleitjäger der Cobra (immer der letzte) */
  private get droneN(): number { return this.c('drone') + (this.escortT > 0 ? 1 : 0); }
  private get fireRate(): number { return [0.26, 0.21, 0.17][this.gear.weapon - 1] / (1 + 0.25 * this.c('rapid')) * this.ship.rate * this.wpn.rate * (this.odT > 0 ? 0.5 : 1); }
  /** Grundschaden je Mk-Stufe mit Verbesserungen (ohne Schiff und Waffentyp) */
  private get baseDmg(): number { return [6, 8, 11][this.gear.weapon - 1] * (1 + 0.3 * this.c('heavy')) * (this.mutator?.id === 'glass' ? 2 : 1); }
  /** Reichweite der Bordwaffe */
  private get reach(): number { return this.wpn.beam ? BEAM_LEN : this.wpn.speed * this.wpn.life; }
  private get damage(): number { return this.baseDmg * this.ship.dmg * this.wpn.dmg; }
  private get shieldMax(): number { return [40, 70, 100][this.gear.shield - 1] * (1 + 0.4 * this.c('shield')) * (this.mutator?.id === 'glass' ? 0.5 : 1) * this.ship.shield * this.sh.cap; }
  private get missileCdMax(): number { return 9 * Math.pow(0.8, this.c('mreload')); }
  private get dashCdMax(): number { return SPECIALS[this.ship.special].cd * Math.pow(0.75, this.c('dash')); }
  private get enemyDmg(): number { return this.level >= 5 ? 1.3 : this.level >= 3 ? 1.15 : 1; }
  private get totalWaves(): number { return this.mode === 'endless' ? Infinity : NORMAL_WAVES; }
  private isBossWave(i: number): boolean { return this.mode === 'endless' ? (i + 1) % 5 === 0 : i === NORMAL_WAVES - 1; }

  resize(w: number, h: number): void {
    const first = this.w === 1;
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    // große Karte, unabhängig vom Bildschirm: der Frachter fliegt von unten nach oben zum Tor
    if (first) {
      this.WW = MAP_W;
      this.WH = MAP_PAD * 2 + LEG * (this.mode === 'endless' ? 5 : NORMAL_WAVES);
      this.fX = this.WW / 2;
      this.fY = this.fGoal = this.WH - MAP_PAD;
      this.px = this.fX;
      this.py = this.fY + 120;
      this.camX = this.px - w / 2 / this.zoom;
      this.camY = this.py - (h * 0.58) / this.zoom;
    }
  }

  private get fx1(): number { return this.fX + Math.sin(this.time * 0.35) * 30; }
  private get fy1(): number {
    if (this.gateT < 0) return this.fY;
    // ins Tor: beschleunigt bis genau in die Mitte des Wirbels
    const k = Math.min(1, this.gateT / 1.7);
    return this.fY + (this.gateCy - this.fY) * k * k;
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

  hud(): HudItem[] {
    return [
      { label: 'Frachter', value: `${Math.ceil((this.fHull / this.fMax) * 100)} %`, warn: this.fHull / this.fMax < 0.35 },
      { label: 'Jäger', value: `${Math.ceil(this.hull)} %`, warn: this.hull < 35 },
    ];
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  // ---------- Eingabe ----------

  pointerDown(id: number, x: number, y: number): void {
    if (this.choosing) { this.pickCardAt(x, y); return; }
    const [fbx, fby, fbr] = this.btnFire;
    if (Math.hypot(x - fbx, y - fby) < fbr + 12) { this.fireId = id; return; }
    for (const [btn, step] of [[this.btnZoomOut, 1], [this.btnZoomIn, -1]] as const) {
      if (Math.hypot(x - btn[0], y - btn[1]) < btn[2] + 8) { this.setZoom(step); return; }
    }
    const [bx, by, br] = this.btnMissile;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.fireMissiles(); return; }
    const [dx, dy, dr] = this.btnDash;
    if (Math.hypot(x - dx, y - dy) < dr + 10) { this.doSpecial(); return; }
    if (!this.joy) this.joy = { id, ox: x, oy: y, kx: 0, ky: 0 };
  }

  pointerMove(id: number, x: number, y: number): void {
    const j = this.joy;
    if (!j || j.id !== id) return;
    let dx = x - j.ox, dy = y - j.oy;
    const d = Math.hypot(dx, dy), max = 52;
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
    if (this.joy?.id === id) this.joy = null;
    if (this.fireId === id) this.fireId = null;
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
    if (c.id === 'repair') { this.fHull = Math.min(this.fMax, this.fHull + this.fMax * 0.25); this.hull = 100; }
    if (c.id === 'shield') this.shield = this.shieldMax;
    this.choosing = null;
    this.pendingSpawn = 1.2;
    sfx.build();
  }

  private offerCards(): void {
    const pool = CARDS.filter((c) => this.c(c.id) < c.max && !(c.id === 'repair' && this.fHull > this.fMax * 0.85 && this.hull > 80));
    const pick: Card[] = [];
    while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(this.r() * pool.length), 1)[0]);
    this.choosing = pick;
    this.joy = null;
    this.fireId = null;
  }

  private fireMissiles(): void {
    if (this.missileCd > 0 || this.outcome || this.choosing) return;
    this.missileCd = this.missileCdMax;
    this.missilesUsed++;
    setGoal(this.goals, 'nomissile', false);
    const targets = [...this.enemies].filter((e) => !e.shielded || e.kind !== 'boss').sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py));
    const n = this.ship.missiles + 2 * this.c('missiles');
    for (let k = 0; k < n; k++) {
      const a = this.aimA + (k - (n - 1) / 2) * 0.4;
      this.missiles.push({ x: this.px, y: this.py, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, target: targets[k % Math.max(1, targets.length)] ?? null, life: 3.2 });
    }
    sfx.open();
  }

  /** Spezialfähigkeit des Schiffs: Ausweichen, Waffenüberladung oder Schildüberladung */
  private doSpecial(): void {
    if (this.dashCd > 0 || this.outcome || this.choosing) return;
    if (this.ship.special === 'overdrive') {
      this.odT = 3;
      this.dashCd = this.dashCdMax;
      this.floats.add(this.px, this.py - 30, 'Waffenüberladung', '#ffb547', 13);
      sfx.tap();
      return;
    }
    if (this.ship.special === 'sprint') {
      this.sprintT = 2.5;
      this.dashCd = this.dashCdMax;
      sfx.tap();
      return;
    }
    if (this.ship.special === 'torpedo') {
      // schwerer, langsamer Torpedo geradeaus aus dem Bug, großer Flächenschaden
      const a = this.aimA, d0 = this.ship.size * 0.45;
      this.bullets.push({ x: this.px + Math.cos(a) * d0, y: this.py + Math.sin(a) * d0, vx: Math.cos(a) * 300 + this.pvx * 0.5, vy: Math.sin(a) * 300 + this.pvy * 0.5, dmg: this.baseDmg * 14, from: 'p', life: 2.4, color: '#ffd27a', w: 7, pierce: 0, splash: 70 });
      this.dashCd = this.dashCdMax;
      sfx.open();
      return;
    }
    if (this.ship.special === 'escort') {
      this.escortT = 15;
      this.dashCd = this.dashCdMax;
      this.floats.add(this.px, this.py - 40, 'Begleitjäger gestartet', '#ffb070', 13);
      sfx.open();
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
    sfx.tap();
  }

  private apBrk = 0;
  private readonly seedDir = 1;
  /** Nur für Tests: einfacher Autopilot – fängt die Gegner ab, die dem Frachter am nächsten sind, zielt mit Vorhalt */
  autopilot(): void {
    if (this.choosing) { this.chooseCard(0); return; }
    const near = this.pickups.find((p) => Math.hypot(p.x - this.px, p.y - this.py) < 160);
    let best: Enemy | null = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.parent ? false : e.kind === 'boss' && e.shielded) continue;
      // Bedrohung: Nähe zum Frachter, der Jäger selbst zählt etwas weniger
      const d = Math.min(Math.hypot(e.x - this.fx1, e.y - this.fy1), Math.hypot(e.x - this.px, e.y - this.py) + 120);
      if (d < bd) { bd = d; best = e; }
    }
    let tx = this.fx1, ty = this.fy1 - 140;
    if (near && !best) { tx = near.x; ty = near.y; }
    if (best) {
      const d = Math.hypot(best.x - this.px, best.y - this.py), t = this.wpn.beam ? 0 : d / this.wpn.speed;
      tx = best.x + best.vx * t; ty = best.y + best.vy * t;
    }
    const dx = tx - this.px, dy = ty - this.py, d = Math.hypot(dx, dy) || 1;
    const off = Math.abs(wrapA(Math.atan2(dy, dx) - this.aimA));
    // Anflug, nah dran abdrehen und neu anfliegen (Boss-Teile schon früher), weit weg volle Fahrt
    this.apBrk -= 1 / 60;
    if (best && d < 70 + best.r * 2 && this.apBrk <= -0.6) this.apBrk = 0.6;
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
  }

  // ---------- Wellen ----------

  private waveKinds(i: number): EKind[] {
    const swarm = this.mutator?.id === 'swarm' ? 1.45 : 1;
    // mit einem M-Schiff schicken die Gegner mehr Schiffe
    const threat = this.ship.cls === 'M' ? 1.6 : 1;
    let budget = (5 + i * 3 + this.level * 1.6) * swarm * threat * (this.mode === 'endless' ? 1 + i * 0.08 : 1);
    const pool: EKind[] = this.side === 'pirate'
      ? (i === 0 ? ['jaeger'] : i === 1 ? ['jaeger', 'jaeger', 'rakete', 'schild'] : ['jaeger', 'jaeger', 'rakete', 'kanone', 'schild'])
      : (i === 0 ? ['n'] : i === 1 ? ['n', 'n', 'm', 'xs'] : ['n', 'n', 'm', 'xs']);
    const out: EKind[] = [];
    let shields = 0;
    while (budget > 0.9) {
      let k = pool[Math.floor(this.r() * pool.length)];
      if ((k === 'schild' || k === 'xs') && (shields >= 1 + Math.floor(i / 4) || out.length < 2)) k = this.side === 'pirate' ? 'jaeger' : 'n';
      if (k === 'schild' || k === 'xs') shields++;
      out.push(k);
      budget -= SPEC[k].cost;
    }
    return out;
  }

  private spawnWave(): void {
    this.wave++;
    this.waveT = 0;
    this.reinforce = [];
    // Endlos: Karte nach oben verschieben, wenn der Frachter oben ankommt
    if (this.mode === 'endless' && this.fY - LEG < MAP_PAD) this.shiftWorld(LEG * 3);
    // nächster Streckenabschnitt
    this.fGoal = Math.max(MAP_PAD, this.fY - LEG);
    this.banner = 2.4;
    this.section = this.mode === 'endless' ? this.sectionPlan[this.wave % this.sectionPlan.length] : this.sectionPlan[this.wave] ?? 'none';
    if (this.mutator?.id === 'mines') this.section = 'mines';
    if (this.section === 'rocks') this.spawnRocks();
    if (this.section === 'mines') this.spawnMines();
    const boss = this.isBossWave(this.wave);
    if (boss) {
      this.spawnBoss();
      this.bannerText = 'BOSS';
      this.bannerSub = this.side === 'pirate' ? 'Piratenfregatte – erst die Geschütztürme' : 'Xenon-K-Segment – erst Laser- und Plasmatürme';
      this.spawnGroup(this.side === 'pirate' ? ['jaeger', 'jaeger'] : ['n', 'n', 'n'], 1 + Math.floor(this.r() * 4));
    } else {
      // Gegner in zwei bis drei Gruppen aus verschiedenen Richtungen; die späteren kommen einige Sekunden danach
      const kinds = this.waveKinds(this.wave);
      const groups = kinds.length >= 7 && this.wave >= 1 ? 3 : kinds.length >= 3 ? 2 : 1;
      const per = Math.ceil(kinds.length / groups);
      const first = Math.floor(this.r() * 5);
      for (let g = 0; g < groups; g++) {
        const part = kinds.slice(g * per, (g + 1) * per);
        if (!part.length) continue;
        const from = (first + g * 2) % 5;
        if (g === 0) this.spawnGroup(part, from);
        else this.reinforce.push({ t: 6 + g * 5 + this.r() * 3, kinds: part, from });
      }
      this.bannerText = this.mode === 'endless' ? `WELLE ${this.wave + 1}` : `WELLE ${this.wave + 1} VON ${NORMAL_WAVES}`;
      this.bannerSub = [...new Set(kinds.map((k) => SPEC[k].name))].join(' · ') + (this.section === 'rocks' ? ' · Asteroidenfeld' : this.section === 'mines' ? ' · Minenfeld' : '');
    }
    if (this.wave > 0) sfx.warn();
  }

  /**
   * Anflugpunkt weit draußen, von der Route des Frachters aus gesehen: 0 vorn, 1 vorn links, 2 vorn rechts,
   * 3 links, 4 rechts (selten auch von hinten)
   */
  private farPoint(from: number): [number, number] {
    const dirs = [-Math.PI / 2, -Math.PI * 0.78, -Math.PI * 0.22, Math.PI, 0];
    let a = dirs[from % dirs.length] + (this.r() - 0.5) * 0.4;
    if (this.r() < 0.12) a = Math.PI / 2 + (this.r() - 0.5) * 0.8;
    const d = 1400 + this.r() * 300;
    return [clamp(this.fX + Math.cos(a) * d, 80, this.WW - 80), clamp(this.fY + Math.sin(a) * d, 80, this.WH - 80)];
  }

  private makeEnemy(kind: EKind, x: number, y: number): Enemy {
    const s = SPEC[kind];
    const hp = s.hp * HP_MUL[this.level] * (this.mode === 'endless' ? 1 + this.wave * 0.06 : 1);
    return { kind, x, y, vx: 0, vy: 0, hp, max: hp, cd: 1 + this.r() * 1.5, r: s.r, target: 'f', orbit: this.r() * Math.PI * 2, flash: 0, dir: this.r() < 0.5 ? 1 : -1, shielded: false, ang: -Math.PI / 2, inside: true };
  }

  private spawnGroup(list: EKind[], from: number): void {
    const [x0, y0] = this.farPoint(from);
    const grp = ++this.grpN;
    for (const [i, kind] of list.entries()) {
      const a = (i / list.length) * Math.PI * 2;
      const e = this.makeEnemy(kind, x0 + Math.cos(a) * 50, y0 + Math.sin(a) * 50);
      e.grp = grp;
      e.ang = Math.atan2(this.fY - e.y, this.fX - e.x);
      this.enemies.push(e);
    }
  }

  private spawnBoss(): void {
    // weit voraus auf der Route
    const b = this.makeEnemy('boss', this.fX + (this.r() - 0.5) * 400, Math.max(120, this.fY - 1100));
    b.ang = Math.PI / 2;
    b.hp = b.max = SPEC.boss.hp * HP_MUL[this.level] * (this.mode === 'endless' ? 1 + this.wave * 0.05 : 1);
    b.r = 34;
    this.enemies.push(b);
    const offs: [number, number, ('laser' | 'plasma')?][] = this.side === 'pirate'
      // auf den drei Sockeln im Bild der Fregatte (Flügelenden links/rechts, Heckmitte); ab Stufe 4 ein vierter auf dem Bug
      ? [[-53, 4], [54, 4], [0, 30], ...(this.level >= 4 ? [[0, -40] as [number, number]] : [])]
      // auf den vier Sockeln des K-Segments: Laser auf den Flügeln, Plasma auf Bug und Heck
      : [[-61, 17, 'laser'], [61, 17, 'laser'], [0, -46, 'plasma'], [0, 39, 'plasma']];
    for (const [ox, oy, weapon] of offs) {
      const t = this.makeEnemy('turret', b.x + ox, b.y + oy);
      t.parent = b; t.ox = ox; t.oy = oy; t.weapon = weapon;
      // Xenon-Türme feuern versetzt; ab Stufe 4 schneller (statt eines fünften Turms)
      if (weapon) t.cd = 1.5 + this.r() * 2;
      this.enemies.push(t);
    }
    this.bossT = 0;
  }

  /** Punkt im Abschnitt um die Route voraus, nicht direkt auf Frachter oder Jäger */
  private fieldPoint(): [number, number] {
    let x = 0, y = 0;
    for (let k = 0; k < 30; k++) {
      x = clamp(this.fX + (this.r() - 0.5) * 1500, 60, this.WW - 60);
      y = clamp(this.fY - LEG * 1.2 + this.r() * LEG * 1.4, 60, this.WH - 60);
      if (Math.hypot(x - this.fX, y - this.fY) > 200 && Math.hypot(x - this.px, y - this.py) > 140) break;
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
    this.fFlash = Math.max(0, this.fFlash - dt);
    this.shieldHit = Math.max(0, this.shieldHit - dt);
    if (this.wave < 0 && this.time > 0.8) this.spawnWave();
    this.waveT += dt;
    if (this.bossT >= 0) this.bossT += dt;
    this.updateFreighter(dt);
    const due = this.reinforce.find((g) => this.waveT >= g.t);
    if (this.pendingSpawn >= 0) {
      this.pendingSpawn -= dt;
      if (this.pendingSpawn < 0) { this.pendingSpawn = -1; this.spawnWave(); }
    } else if (due) {
      this.spawnGroup(due.kinds, due.from);
      this.reinforce = this.reinforce.filter((g) => g !== due);
      this.floats.add(this.px, this.py - 40, 'Weitere Gruppe im Anflug!', '#ff9aa4', 14);
      sfx.warn();
    } else if (this.wave >= 0 && this.enemies.length === 0 && !this.reinforce.length) {
      // Welle besiegt
      if (this.wave + 1 >= this.totalWaves) {
        this.gateT = 0;
        this.gateX = this.fx1;
        this.gateY = this.fY - 330;
        this.outcome = 'win';
        this.endT = 0;
        this.score.add(1000 + Math.round((this.fHull / this.fMax) * 2000));
        setGoal(this.goals, 'hull80', this.fHull / this.fMax > 0.8);
        sfx.success();
        return;
      }
      if (this.mode === 'endless') {
        this.score.add(300 * (this.wave + 1));
        this.fHull = Math.min(this.fMax, this.fHull + this.fMax * 0.1);
        setGoal(this.goals, 'wave6', this.wave + 2 >= 6 || this.goals.find((g) => g.id === 'wave6')?.done === true);
        setGoal(this.goals, 'wave10', this.wave + 2 >= 10 || this.goals.find((g) => g.id === 'wave10')?.done === true);
      }
      this.section = 'none';
      this.offerCards();
      return;
    } else if (this.wave >= 0 && this.waveT > (this.isBossWave(this.wave + 1) ? 100 : 75) && !this.isBossWave(this.wave) && this.wave + 1 < this.totalWaves) {
      // zu langsam: nächste Welle kommt trotzdem (ohne Verbesserung)
      this.spawnWave();
    }
    this.updatePlayer(dt);
    this.updateEnemies(dt);
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
    if (this.fHull <= 0 && !this.outcome) {
      this.outcome = 'freighter';
      this.endT = 0;
      this.explode(this.fx1, this.fy1, '#5ff0d8', 2.4);
    }
    if (this.hull <= 0 && !this.outcome) {
      this.outcome = 'player';
      this.endT = 0;
      this.explode(this.px, this.py, '#3fe0c5', 1.4);
    }
  }

  /** Frachter fliegt bis zum Ende des Abschnitts und wartet dort; seine zwei Abwehrtürme zielen frei */
  private updateFreighter(dt: number): void {
    const prev = this.fY;
    if (this.wave >= 0) this.fY = Math.max(this.fGoal, this.fY - F_SPEED * dt);
    this.fVy = (this.fY - prev) / Math.max(dt, 1e-6);
    const fx = this.fx1, fy = this.fy1;
    for (const t of this.fTur) {
      t.cd -= dt;
      const tx0 = fx, ty0 = fy + t.oy;
      // Raketen zuerst, sonst der nächste Gegner in Reichweite
      let tgt: { x: number; y: number; vx: number; vy: number } | null = null, bd = 240;
      for (const m of this.eMissiles) { const d = Math.hypot(m.x - tx0, m.y - ty0); if (d < bd) { bd = d; tgt = m; } }
      if (!tgt) {
        bd = 210;
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
        t.cd = 0.9;
        this.bullets.push({ x: tx0 + Math.cos(t.a) * 8, y: ty0 + Math.sin(t.a) * 8, vx: Math.cos(t.a) * 520, vy: Math.sin(t.a) * 520, dmg: 3, from: 'p', life: 0.5, color: '#9fe6ff', w: 1.4, pierce: 0 });
      }
    }
  }

  /** Endlos-Modus: alles um dy nach unten verschieben, damit die Route nie zu Ende geht */
  private shiftWorld(dy: number): void {
    this.fY += dy; this.fGoal += dy; this.py += dy; this.camY += dy;
    for (const o of [...this.enemies, ...this.bullets, ...this.missiles, ...this.eMissiles, ...this.pickups, ...this.rocks, ...this.mines]) o.y += dy;
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
    const j = this.joy;
    const thr = j ? Math.min(1, Math.hypot(j.kx, j.ky)) : 0;
    if (j && thr > 0.12) this.aimA = wrapA(turnTo(this.aimA, Math.atan2(j.ky, j.kx), this.turnRate * dt));
    // Reiseantrieb: ohne Gegner in der Nähe und bei vollem Schub deutlich schneller
    const calm = this.fireId === null && !this.enemies.some((e) => Math.hypot(e.x - this.px, e.y - this.py) < 560) && !this.eMissiles.some((m) => Math.hypot(m.x - this.px, m.y - this.py) < 400);
    this.cruise = clamp(this.cruise + (calm && thr > 0.85 ? dt * 0.7 : -dt * 3), 0, 1);
    const sp = this.speed * thr * (1 + 1.5 * this.cruise);
    const tvx = Math.cos(this.aimA) * sp, tvy = Math.sin(this.aimA) * sp;
    const k = Math.min(1, dt * 4);
    this.pvx += (tvx - this.pvx) * k;
    this.pvy += (tvy - this.pvy) * k;
    let vx = this.pvx, vy = this.pvy;
    if (this.dashT > 0) { this.dashT -= dt; vx = this.dashVx; vy = this.dashVy; if (Math.random() < 0.7) this.fx.add({ x: this.px, y: this.py, color: '#9ffff0', size: 2, max: 0.25 }); }
    if (this.cruise > 0.4 && Math.random() < this.cruise) this.fx.add({ x: this.px - Math.cos(this.aimA) * 14, y: this.py - Math.sin(this.aimA) * 14, color: '#9ffff0', size: 1.4, max: 0.35 });
    this.px = clamp(this.px + vx * dt, 14, this.WW - 14);
    this.py = clamp(this.py + vy * dt, 14, this.WH - 14);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.shieldWait = Math.max(0, this.shieldWait - dt);
    if (!this.shieldWait && this.mutator?.id !== 'ion') this.shield = Math.min(this.shieldMax, this.shield + 12 * this.ship.shield * this.sh.regen * (1 + 0.5 * this.c('regen')) * dt);
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
    this.beams = [];
    if (this.wpn.beam) {
      if (this.fireId !== null) this.fireBeams(dt);
    } else if (this.fireId !== null && this.fireCd <= 0) {
      this.fireCd = this.fireRate;
      let a0 = this.aimA;
      if (this.lock) {
        const la = Math.atan2(this.lock.y - this.py, this.lock.x - this.px);
        if (Math.abs(wrapA(la - this.aimA)) < AIM_ASSIST) a0 = la;
      }
      const w = this.wpn, spread = this.c('spread');
      const c = Math.cos(this.aimA), sn = Math.sin(this.aimA);
      for (let g = 0; g < this.ship.salvo; g++) {
        // Bordkanonen reihum; Lage quer zur Flugrichtung
        const gx = this.ship.guns[this.gunI++ % this.ship.guns.length];
        const ox = this.px - sn * gx + c * (this.ship.size * 0.3), oy = this.py + c * gx + sn * (this.ship.size * 0.3);
        for (let s2 = -spread; s2 <= spread; s2++) for (let p = 0; p < w.pellets; p++) {
          const a = a0 + s2 * 0.16 + (w.pellets > 1 ? (p / (w.pellets - 1) - 0.5) * 2 * w.spread + (this.r() - 0.5) * 0.04 : 0);
          this.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * w.speed + this.pvx * 0.3, vy: Math.sin(a) * w.speed + this.pvy * 0.3, dmg: this.damage * (s2 === 0 ? 1 : 0.7), from: 'p', life: w.life, color: w.color, w: w.w, pierce: this.c('pierce'), splash: w.splash || undefined });
        }
      }
    }
    this.updateTurrets(dt);
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

  /** Strahler: je feuernde Bordkanone ein Strahl geradeaus; trifft das erste Ziel im Strahl (Schaden pro Sekunde) */
  private fireBeams(dt: number): void {
    const c = Math.cos(this.aimA), sn = Math.sin(this.aimA);
    // je Strahl so viel Schaden pro Sekunde wie eine Bordkanone mit Geschossen
    const dps = this.damage / this.fireRate;
    const n = this.ship.salvo;
    for (let g = 0; g < n; g++) {
      const gx = this.ship.guns.length === 1 ? 0 : this.ship.guns[Math.round((g + 0.5) * this.ship.guns.length / n - 0.5)];
      const ox = this.px - sn * gx + c * (this.ship.size * 0.3), oy = this.py + c * gx + sn * (this.ship.size * 0.3);
      // erstes Ziel entlang des Strahls
      let hitT = BEAM_LEN, hitE: Enemy | null = null, hitM: EMissile | null = null;
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
        this.damageEnemy(hitE, dps * dt);
        if (Math.random() < 0.5) this.fx.add({ x: ox + c * hitT, y: oy + sn * hitT, color: '#bffff6', size: 1.6, max: 0.15 });
      }
      if (hitM) { hitM.hp -= dps * dt; if (hitM.hp <= 0) { this.explode(hitM.x, hitM.y, '#ff8a5c', 0.5, false); this.gain(30, hitM.x, hitM.y); } }
      this.beams.push([ox, oy, ox + c * hitT, oy + sn * hitT]);
    }
  }

  /** Eigene Türme (Korvette): zielen frei mit Vorhalt – Raketen zuerst, sonst der nächste Gegner */
  private updateTurrets(dt: number): void {
    if (!this.pTur.length) return;
    const w = this.tw, range = w.speed * w.life;
    const c = Math.cos(this.aimA + Math.PI / 2), sn = Math.sin(this.aimA + Math.PI / 2);
    for (const [i, t] of this.pTur.entries()) {
      const [tx0, ty0] = this.ship.turrets[i];
      const x = this.px + tx0 * c - ty0 * sn, y = this.py + tx0 * sn + ty0 * c;
      t.cd -= dt;
      let tgt: { x: number; y: number; vx: number; vy: number } | null = null, bd = range;
      for (const m of this.eMissiles) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; tgt = m; } }
      if (!tgt) for (const e of this.enemies) {
        if (e.kind === 'boss' && e.shielded) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; tgt = e; }
      }
      if (!tgt) { t.a = wrapA(turnTo(t.a, this.aimA, dt * 3)); continue; }
      const lt = bd / w.speed;
      const want = Math.atan2(tgt.y + tgt.vy * lt - y, tgt.x + tgt.vx * lt - x);
      t.a = wrapA(turnTo(t.a, want, dt * 5));
      if (t.cd <= 0 && Math.abs(wrapA(want - t.a)) < 0.15) {
        t.cd = [0.4, 0.34, 0.28][this.gear.weapon - 1] * w.rate;
        for (let p = 0; p < w.pellets; p++) {
          const a = t.a + (w.pellets > 1 ? (p / (w.pellets - 1) - 0.5) * 2 * w.spread : 0);
          this.bullets.push({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: this.baseDmg * 0.3 * w.dmg, from: 'p', life: w.life, color: w.color, w: Math.min(w.w, 4), pierce: 0, splash: w.splash ? w.splash * 0.7 : undefined });
        }
      }
    }
  }

  private dronePos(k: number): [number, number] {
    const a = this.droneA + (k * Math.PI * 2) / Math.max(1, this.droneN);
    const r = this.ship.size * 0.5 + 18;
    return [this.px + Math.cos(a) * r, this.py + Math.sin(a) * r];
  }

  private updateEnemies(dt: number): void {
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
        if (e.weapon === 'laser') { this.updateLaser(e, dt, fx, fy); continue; }
        e.cd -= dt;
        const tx = this.r() < 0.5 ? this.px : fx, ty = tx === this.px ? this.py : fy;
        if (e.weapon === 'plasma') {
          if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < 380) {
            e.cd = (this.level >= 4 ? 2.6 : 3.2) + this.r() * 0.8;
            // dicke, langsame Plasmakugel: leicht gestreut, gut sichtbar, schwer
            const a2 = Math.atan2(ty - e.y, tx - e.x) + (this.r() - 0.5) * 0.08;
            this.enemyShot(e, a2, 175, 14, '#ff6a3d', 6, 2.6);
            // aus den Mündungen, nicht aus der Turmmitte
            const pb = this.bullets[this.bullets.length - 1];
            pb.x += Math.cos(a2) * 19; pb.y += Math.sin(a2) * 19;
          }
          continue;
        }
        if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < 340) {
          e.cd = 2.2 + this.r() * 0.8;
          const a2 = Math.atan2(ty - e.y, tx - e.x);
          for (let q = 0; q < 2; q++) this.enemyShot(e, a2 + (q - 0.5) * 0.1, this.side === 'pirate' ? 250 : 280, 5.5, this.side === 'pirate' ? '#ffd27a' : '#ff5c6c');
        }
        continue;
      }
      // Abfangen: wer dem Jäger nahe kommt, kämpft mit ihm; Raketen- und Kanonenboote bleiben stur am Frachter
      const toP = Math.hypot(this.px - e.x, this.py - e.y);
      if (e.kind !== 'kanone' && e.kind !== 'rakete' && e.kind !== 'boss') {
        if (e.target === 'f' && toP < AGGRO && this.outcome !== 'player') e.target = 'p';
        else if (e.target === 'p' && toP > AGGRO * 2.2) e.target = 'f';
      }
      const onP = e.target === 'p';
      const tx = onP ? this.px : fx, ty = onP ? this.py : fy;
      const tvx = onP ? this.pvx : 0, tvy = onP ? this.pvy : this.fVy;
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      // Vorhaltepunkt für die eigenen Bordkanonen
      const lt = d / (SHOT_V[e.kind] ?? 300);
      const aimAt = Math.atan2(ty + tvy * lt - e.y, tx + tvx * lt - e.x);
      const fighter = e.kind === 'jaeger' || e.kind === 'n';
      let want: number, sp = s.speed, face = aimAt;
      if (fighter) {
        // Anflug wie ein Flugzeug: draufhalten, nach dem Überflug abdrehen, wenden, neuer Anflug
        if (e.brk && e.brk > 0) { e.brk -= dt; want = e.brkA!; }
        else {
          want = aimAt;
          if (d < (onP ? 70 : 95)) { e.brk = 0.8 + this.r() * 0.7; e.brkA = e.ang + e.dir * (1.1 + this.r() * 0.6); e.dir = this.r() < 0.5 ? 1 : -1; }
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
          const keep = e.kind === 'boss' ? 240 : e.kind === 'kanone' ? 190 : e.kind === 'rakete' ? 240 : 170;
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
      // am Kartenrand umkehren
      if (e.x < 60 || e.x > this.WW - 60 || e.y < 60 || e.y > this.WH - 60) {
        want = Math.atan2(clamp(e.y, 200, this.WH - 200) - e.y, clamp(e.x, 200, this.WW - 200) - e.x);
        if (fighter) face = want;
      }
      e.ang = wrapA(turnTo(e.ang, face, TURN[e.kind] * dt));
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
      const range = e.kind === 'n' ? 200 : e.kind === 'boss' ? 380 : e.kind === 'rakete' ? 360 : 320;
      const cone = e.kind === 'kanone' ? 0.2 : e.kind === 'rakete' ? 0.5 : 0.12;
      if (e.cd <= 0 && d < range && (e.kind === 'boss' || off < cone)) {
        const a = e.ang + (this.r() - 0.5) * (fighter ? 0.14 : 0.06);
        if (e.kind === 'jaeger') { e.cd = 1.1; this.enemyShot(e, a, 300, 6, '#ffb070'); }
        else if (e.kind === 'kanone') { e.cd = 2.4; for (let q = 0; q < 3; q++) this.enemyShot(e, a + (q - 1) * 0.08, 240, 8, '#ffd27a'); }
        else if (e.kind === 'rakete') { e.cd = 4; this.eMissiles.push({ x: e.x, y: e.y, vx: Math.cos(e.ang) * 90, vy: Math.sin(e.ang) * 90, hp: 6, life: 7, target: e.target }); }
        else if (e.kind === 'n') { e.cd = 0.85; this.enemyShot(e, a, 340, 4, '#ff5c6c'); }
        else if (e.kind === 'm') { e.cd = 1.8; this.enemyShot(e, a, 430, 11, '#ff3b4a', 3); }
        else if (e.kind === 'boss') {
          e.cd = 3.5;
          // erst ohne Türme feuert der Kern: Fächer bzw. Ring
          if (!e.shielded) {
            const n = this.side === 'pirate' ? 5 : 10;
            for (let q = 0; q < n; q++) this.enemyShot(e, this.side === 'pirate' ? aimAt + (q - 2) * 0.16 : (q / n) * Math.PI * 2, 240, 9, this.side === 'pirate' ? '#ffd27a' : '#ff3b4a', 2.5);
          }
        } else e.cd = 1;
      }
    }
    // gegnerische Raketen
    for (const m of this.eMissiles) {
      const tx = m.target === 'f' ? fx : this.px, ty = m.target === 'f' ? fy : this.py;
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
      m.vx += (dx / d) * 220 * dt;
      m.vy += (dy / d) * 220 * dt;
      const v = Math.hypot(m.vx, m.vy);
      if (v > 150) { m.vx *= 150 / v; m.vy *= 150 / v; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (Math.random() < 0.6) this.fx.add({ x: m.x, y: m.y, color: '#ff8a5c', size: 1.2, max: 0.3 });
      if (m.target === 'f' && Math.abs(m.x - fx) < 22 && Math.abs(m.y - fy) < 48) { this.hitFreighter(18 * this.enemyDmg, m.x, m.y); m.life = 0; this.explode(m.x, m.y, '#ff8a5c', 0.6, false); }
      else if (Math.hypot(this.px - m.x, this.py - m.y) < this.ship.r + 2) { this.damagePlayer(18 * this.enemyDmg); m.life = 0; this.explode(m.x, m.y, '#ff8a5c', 0.6, false); }
    }
    this.eMissiles = this.eMissiles.filter((m) => m.life > 0 && m.hp > 0);
  }

  private enemyShot(e: Enemy, a: number, v: number, dmg: number, color: string, w = 2, life = 1.8): void {
    this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: dmg * this.enemyDmg, from: 'e', life, color, w, pierce: 0 });
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
        // Frachter: entlang seiner Längsachse prüfen; Schaden gesammelt, damit nicht jedes Bild Funken sprühen
        let onF = false;
        for (let k = -40; k <= 40 && !onF; k += 10) onF = dist(fx, fy + k) < 16;
        if (onF) {
          e.beamAcc = (e.beamAcc ?? 0) + LASER_DPS * this.enemyDmg * dt;
          if (e.beamAcc > 4) { this.hitFreighter(e.beamAcc, fx, fy); e.beamAcc = 0; }
        }
      }
      return;
    }
    e.cd -= dt;
    const toP = this.r() < 0.55;
    const tx = toP ? this.px : fx, ty = toP ? this.py : fy;
    if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < LASER_LEN - 20) {
      e.cd = (this.level >= 4 ? 3 : 3.8) + this.r();
      e.beamT = LASER_CHARGE + LASER_FIRE;
      e.beamA = Math.atan2(ty - e.y, tx - e.x);
      e.beamAcc = 0;
    }
  }

  private hitFreighter(dmg: number, x: number, y: number): void {
    this.fHull = Math.max(0, this.fHull - dmg);
    this.fFlash = 0.12;
    this.fx.burst(x, y, '#ffb070', 4, 120, 1.2, 'spark', 0.25);
  }

  private rockAt(x: number, y: number): Rock | undefined {
    return this.rocks.find((k) => Math.hypot(k.x - x, k.y - y) < k.r);
  }

  private updateShots(dt: number): void {
    const fx = this.fx1, fy = this.fy1;
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
        if (em) { em.hp -= b.dmg; if (em.hp <= 0) { this.explode(em.x, em.y, '#ff8a5c', 0.5, false); this.gain(30, em.x, em.y); } continue; }
        const mine = this.mines.find((m) => Math.hypot(m.x - b.x, m.y - b.y) < 10);
        if (mine) { mine.hp -= b.dmg; if (mine.hp <= 0) this.detonate(mine); continue; }
        // Der geschützte Boss-Rumpf lässt Geschosse durch – so erreicht man auch die Türme dahinter
        const e = this.enemies.find((q) => !b.hit?.has(q) && !(q.kind === 'boss' && q.shielded) && Math.hypot(q.x - b.x, q.y - b.y) < q.r + 3);
        if (e) {
          this.damageEnemy(e, b.dmg);
          if (b.splash) {
            // Plasma: Flächenschaden in der Umgebung
            for (const q of [...this.enemies]) if (q !== e && !(q.kind === 'boss' && q.shielded) && Math.hypot(q.x - b.x, q.y - b.y) < b.splash + q.r) this.damageEnemy(q, b.dmg * 0.5);
            this.fx.add({ x: b.x, y: b.y, color: b.color, size: b.splash * 0.5, kind: 'ring', max: 0.3 });
          }
          this.fx.burst(b.x, b.y, '#bffff6', 3, 120, 1.2, 'spark', 0.2);
          if (b.pierce > 0) { b.pierce--; (b.hit ??= new Set()).add(e); keep.push(b); }
          continue;
        }
      } else {
        if (Math.hypot(this.px - b.x, this.py - b.y) < this.ship.r) { this.damagePlayer(b.dmg); this.fx.burst(b.x, b.y, b.color, 4, 120, 1.2, 'spark', 0.2); continue; }
        if (Math.abs(b.x - fx) < 20 && Math.abs(b.y - fy) < 46) { this.hitFreighter(b.dmg, b.x, b.y); continue; }
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
        m.vx += (dx / d) * 900 * dt;
        m.vy += (dy / d) * 900 * dt;
        const v = Math.hypot(m.vx, m.vy);
        if (v > 380) { m.vx *= 380 / v; m.vy *= 380 / v; }
        if (d < m.target.r + 4) { this.damageEnemy(m.target, 34); this.fx.burst(m.x, m.y, '#ffd27a', 12, 180, 1.8, 'spark', 0.35); continue; }
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
    const fx = this.fx1, fy = this.fy1;
    for (const m of this.mines) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.armed < 0) {
        const near = Math.hypot(this.px - m.x, this.py - m.y) < 44 || Math.hypot(fx - m.x, fy - m.y) < 60 || this.enemies.some((e) => Math.hypot(e.x - m.x, e.y - m.y) < 40);
        if (near) { m.armed = 0.7; sfx.tap(); }
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
    if (Math.hypot(this.fx1 - m.x, this.fy1 - m.y) < 80) this.hitFreighter(30, m.x, m.y);
    for (const e of [...this.enemies]) if (Math.hypot(e.x - m.x, e.y - m.y) < 70) this.damageEnemy(e, 60);
    this.gain(20, m.x, m.y);
  }

  private updatePickups(dt: number): void {
    for (const p of this.pickups) {
      p.life -= dt;
      const d = Math.hypot(this.px - p.x, this.py - p.y);
      if (d < 80) { p.x += ((this.px - p.x) / d) * 200 * dt; p.y += ((this.py - p.y) / d) * 200 * dt; }
      if (d < 22) {
        p.life = 0;
        this.loot++;
        if (p.kind === 'repair') { this.fHull = Math.min(this.fMax, this.fHull + this.fMax * 0.08); this.hull = Math.min(100, this.hull + 20); this.floats.add(this.px, this.py - 20, 'Reparatur', '#6be38f', 13); }
        else if (p.kind === 'shield') { this.shield = this.shieldMax; this.floats.add(this.px, this.py - 20, 'Schild voll', '#7fd8ff', 13); }
        else { this.missileCd = 0; this.floats.add(this.px, this.py - 20, 'Raketen bereit', '#ffd27a', 13); }
        sfx.coin();
      }
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }

  private gain(base: number, x: number, y: number): void {
    const p = this.score.add(base);
    if (p >= 50) this.floats.add(x, y - 14, `+${p}`, '#ffd27a', p >= 500 ? 18 : 13);
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    if (e.kind === 'boss' && e.shielded) { e.flash = 0.05; return; }
    e.hp -= e.shielded ? dmg * 0.3 : dmg;
    e.flash = 0.08;
    if (e.hp <= 0) this.killEnemy(e, true);
  }

  private killEnemy(e: Enemy, byPlayer: boolean): void {
    if (!this.enemies.includes(e)) return;
    this.enemies = this.enemies.filter((q) => q !== e && q.parent !== e);
    this.explode(e.x, e.y, SPEC[e.kind].color, e.kind === 'boss' ? 4 : e.r / 10);
    if (!byPlayer) return;
    this.kills++;
    this.score.bump(0.5, 2.5);
    this.gain(SPEC[e.kind].pts * (this.mutator?.id === 'bounty' ? 1.5 : 1), e.x, e.y);
    if (e.kind === 'boss') {
      this.bossKills++;
      setGoal(this.goals, 'boss30', this.bossT < 30);
      this.bossT = -1;
      buzz(120);
    }
    const chance = this.mutator?.id === 'bounty' ? 0.3 : 0.14;
    if (e.kind !== 'turret' && this.r() < chance) {
      const kinds: Pickup['kind'][] = ['repair', 'shield', 'missile'];
      this.pickups.push({ x: e.x, y: e.y, kind: kinds[Math.floor(this.r() * 3)], life: 12 });
    }
  }

  private damagePlayer(dmg: number): void {
    if (this.dashT > 0) return;
    this.shieldWait = (2.5 * this.sh.delay) / (1 + 0.5 * this.c('regen'));
    if (this.shield > 0) {
      const s = Math.min(this.shield, dmg);
      this.shield -= s;
      dmg -= s;
      this.shieldHit = 0.25;
    }
    if (dmg > 0) {
      // Hülle in Prozent: größere Schiffe halten entsprechend mehr aus
      this.hull = Math.max(0, this.hull - dmg / this.ship.hull);
      this.shake = Math.max(this.shake, 0.2);
      buzz(20);
    }
  }

  private explode(x: number, y: number, color: string, size: number, sound = true): void {
    this.fx.burst(x, y, color, Math.round(14 * size), 220 * Math.sqrt(size), 2.4, 'chunk', 0.8);
    this.fx.burst(x, y, '#fff2c8', Math.round(12 * size), 300 * Math.sqrt(size), 1.4, 'spark', 0.35);
    this.fx.add({ x, y, color, size: 6 * size, kind: 'ring', max: 0.45 });
    this.shake = Math.max(this.shake, Math.min(0.5, 0.12 * size));
    if (sound) sfx.tap();
  }

  private finish(): GameResult {
    const f = this.fHull / this.fMax;
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
    return {
      success: ok,
      stars,
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
  get state(): { wave: number; enemies: number; fHull: number; hull: number; outcome: string | null; choosing: boolean; time: number } {
    return { wave: this.wave, enemies: this.enemies.length, fHull: this.fHull, hull: this.hull, outcome: this.outcome, choosing: !!this.choosing, time: this.time };
  }

  // ---------- Darstellung ----------

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.stars.draw(ctx, -this.camY * 0.3, this.side === 'xenon' ? '#ffd0d0' : '#cfe4ff', -this.camX * 0.3);
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
    if (this.outcome !== 'freighter') { this.drawFreighter(ctx, t); this.drawFreighterTurrets(ctx); }
    for (const e of this.enemies) this.drawEnemy(ctx, e, t);
    this.drawBeams(ctx, t);
    this.drawShots(ctx);
    if (this.outcome !== 'player') { this.drawPlayer(ctx, t); this.drawLock(ctx); }
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
      ctx.fillStyle = this.bannerText === 'BOSS' ? '#ff9aa4' : this.side === 'xenon' ? '#ff8a96' : '#ffc77a';
      ctx.fillText(this.bannerText, this.w / 2, TOP + 160);
      ctx.font = '500 14px Barlow, sans-serif';
      // lange Zeilen verkleinern, damit sie aufs Handy passen
      const sw = ctx.measureText(this.bannerSub).width;
      if (sw > this.w - 24) ctx.font = `500 ${Math.max(10, Math.floor((14 * (this.w - 24)) / sw))}px Barlow, sans-serif`;
      ctx.fillStyle = 'rgba(228,243,240,0.85)';
      ctx.fillText(this.bannerSub, this.w / 2, TOP + 184);
      ctx.restore();
    }
    if (this.choosing) this.drawCards(ctx);
  }

  /** Laserstrahlen der Xenon-Türme: erst dünne, blinkende Ziellinie, dann der Strahl */
  private drawBeams(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
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
        ctx.strokeStyle = rgba('#ff3b4a', 0.25 + 0.35 * k * (0.6 + 0.4 * Math.sin(t * 40)));
        ctx.lineWidth = 1 + k;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const k = Math.min(1, e.beamT / 0.12, (LASER_FIRE - e.beamT) / 0.06);
        ctx.strokeStyle = rgba('#ff3b4a', 0.35 * k);
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = rgba('#ff7a84', 0.8 * k);
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = rgba('#fff0f0', k);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawShots(ctx: CanvasRenderingContext2D): void {
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
      const size = 20;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);
      ctx.fillStyle = rgba(ownKind === 'argon' ? '#7fe8ff' : '#ffb070', 0.6 + 0.3 * Math.random());
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
    const col = p.kind === 'repair' ? '#6be38f' : p.kind === 'shield' ? '#7fd8ff' : '#ffd27a';
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
    ctx.fillText(p.kind === 'repair' ? '+' : p.kind === 'shield' ? 'S' : 'R', 0, 0.5);
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

  private drawFreighter(ctx: CanvasRenderingContext2D, t: number): void {
    const x = this.fx1, y = this.fy1;
    const shrink = this.gateT >= 0 ? Math.max(0, 1 - Math.max(0, this.gateT - 1.2) * 1.6) : 1;
    if (shrink <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(shrink, shrink);
    const spr = projectileSprite('frachter-m-ki');
    if (spr) {
      // Bild-Grafik: Containerschiff, gut 105 px lang; vier flackernde Triebwerke; Treffer blitzen hell auf
      const size = 110;
      ctx.fillStyle = rgba('#ffa040', 0.5 + 0.3 * Math.random());
      for (const fx of [-0.104, -0.053, 0.05, 0.105]) {
        const ex = fx * size, ey = 0.462 * size;
        ctx.beginPath();
        ctx.moveTo(ex - 2, ey); ctx.lineTo(ex + 2, ey); ctx.lineTo(ex, ey + 5 + Math.random() * 5 + (this.gateT >= 0 ? 10 : 0));
        ctx.closePath();
        ctx.fill();
      }
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      if (this.fFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      }
      ctx.restore();
      this.drawFreighterHull(ctx, x, y);
      return;
    }
    const col = this.fFlash > 0 ? '#ffffff' : '#5ff0d8';
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
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#10283a';
        ctx.fillRect(s * 15 - (s < 0 ? 10 : 0), -24 + k * 13, 10, 11);
        ctx.strokeStyle = rgba('#8fd3ff', 0.7);
        ctx.lineWidth = 1;
        ctx.strokeRect(s * 15 - (s < 0 ? 10 : 0) + 0.5, -24 + k * 13 + 0.5, 9, 10);
      }
    }
    ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 25));
    ctx.fillRect(-7, 46, 5, 6 + Math.random() * 4);
    ctx.fillRect(2, 46, 5, 6 + Math.random() * 4);
    ctx.restore();
    this.drawFreighterHull(ctx, x, y);
  }

  /** Die zwei Abwehrtürme des Frachters (zielen frei) */
  private drawFreighterTurrets(ctx: CanvasRenderingContext2D): void {
    if (this.gateT >= 0) return;
    const x = this.fx1, y = this.fy1;
    for (const tur of this.fTur) {
      ctx.save();
      ctx.translate(x, y + tur.oy);
      ctx.fillStyle = '#0a1a24';
      ctx.strokeStyle = '#9fe6ff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(Math.cos(tur.a) * 3, Math.sin(tur.a) * 3);
      ctx.lineTo(Math.cos(tur.a) * 9, Math.sin(tur.a) * 9);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Hüllenbalken unter dem Frachter */
  private drawFreighterHull(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const f = this.fHull / this.fMax;
    ctx.fillStyle = 'rgba(14,30,44,0.85)';
    ctx.fillRect(x - 30, y + 62, 60, 4);
    ctx.fillStyle = f > 0.5 ? '#3fe0c5' : f > 0.25 ? '#ffb547' : '#ff5c6c';
    ctx.fillRect(x - 30, y + 62, 60 * f, 4);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    const s = SPEC[e.kind];
    const xen = this.side === 'xenon';
    const base = e.kind === 'turret' ? (xen ? '#ff5c6c' : '#ffd27a') : e.kind === 'boss' ? (xen ? '#ff3b4a' : '#ffb547') : s.color;
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
      ctx.arc(0, 0, e.kind === 'boss' ? e.r * (xen ? 2.4 : 2.1) : e.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(e.beamT && e.beamT > 0 ? e.beamA! + Math.PI / 2 : e.parent ? Math.atan2(this.py - e.y, this.px - e.x) + Math.PI / 2 : a);
    const spr = enemySprite(e.weapon ? `turret-${e.weapon}` : e.kind, this.side === 'pirate' ? 'pirat' : 'xenon');
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
        if (e.weapon === 'laser') { ctx.moveTo(0, -r * 1.7); ctx.lineTo(r * 0.7, r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7); ctx.lineTo(0, -r * 1.7); break; }
        ctx.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, -r * 1.5); break;
      case 'boss':
        if (xen) for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(q) * r, Math.sin(q) * r); }
        else { ctx.moveTo(0, -r * 1.5); ctx.lineTo(r * 0.7, -r * 0.6); ctx.lineTo(r * 0.8, r); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * 0.8, r); ctx.lineTo(-r * 0.7, -r * 0.6); }
        break;
    }
    ctx.closePath();
    ctx.fillStyle = '#1a0c10';
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
    if (xen || e.kind === 'boss') {
      ctx.fillStyle = rgba(xen ? '#ff3b4a' : '#ffb547', 0.6 + 0.4 * Math.sin(t * 8 + e.orbit));
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if ((e.max > 40 || e.kind === 'boss') && e.hp < e.max) {
      const bw = e.kind === 'boss' ? 80 : 32;
      ctx.fillStyle = 'rgba(14,30,44,0.85)';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - (e.kind === 'boss' ? 30 : 9), bw, 3);
      ctx.fillStyle = base;
      ctx.fillRect(e.x - bw / 2, e.y - e.r - (e.kind === 'boss' ? 30 : 9), bw * (e.hp / e.max), 3);
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
    const R = this.ship.r;
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
    const thrust = Math.min(1.6, Math.hypot(this.pvx, this.pvy) / this.speed);
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
        ctx.moveTo(ex - fw, ey); ctx.lineTo(ex + fw, ey); ctx.lineTo(ex, ey + 2 + (thrust * 12 + Math.random() * 3) * (size / 40));
        ctx.closePath();
        ctx.fill();
      }
      ctx.drawImage(sprite.img, -size / 2, -size / 2, size, size);
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
      ctx.fillStyle = '#2a1408';
      ctx.strokeStyle = '#ffb070';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffd0a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(tur.a) * 3, Math.sin(tur.a) * 3);
      ctx.lineTo(Math.cos(tur.a) * 11, Math.sin(tur.a) * 11);
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
      const d = Math.hypot(e.x - this.fx1, e.y - this.fy1);
      const cur = lead.get(e.grp);
      if (!cur || d < cur.d) lead.set(e.grp, { e, d });
    }
    ctx.save();
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of this.enemies) {
      if (e.parent) continue;
      const pos = arrow(e.x, e.y, rgba(e.kind === 'boss' ? '#ff5c6c' : SPEC[e.kind].color, 0.85), e.kind === 'boss' ? 9 : 6);
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
    arrow(this.fx1, this.fy1, '#5ff0d8', 9);
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
    // Kreis um den Frachter: ab hier wird es für ihn gefährlich
    const fp = pos(this.fx1, this.fy1, true)!;
    ctx.strokeStyle = 'rgba(95,240,216,0.25)';
    ctx.beginPath();
    ctx.arc(fp[0], fp[1], 300 * sc, 0, Math.PI * 2);
    ctx.stroke();
    const dot = (p: [number, number] | null, c: string, r = 1.6) => { if (!p) return; ctx.fillStyle = c; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); };
    for (const k of this.rocks) dot(pos(k.x, k.y), 'rgba(168,154,138,0.6)', 1.2);
    for (const m of this.mines) dot(pos(m.x, m.y), 'rgba(255,181,71,0.7)', 1);
    for (const p of this.pickups) dot(pos(p.x, p.y), '#6be38f', 1.4);
    for (const e of this.enemies) if (!e.parent) dot(pos(e.x, e.y, true), e.kind === 'boss' ? '#ff5c6c' : SPEC[e.kind].color, e.kind === 'boss' ? 3 : 1.7);
    dot(fp, '#5ff0d8', 2.8);
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
    if (this.mode === 'endless') {
      ctx.fillText(`WELLE ${Math.max(1, this.wave + 1)}${this.isBossWave(Math.max(0, this.wave)) ? ' · BOSS' : ''}`, x, y);
    } else {
      ctx.fillText('STRECKE', x, y);
      for (let i = 0; i < NORMAL_WAVES; i++) {
        const bx = x + 58 + i * 26;
        const doneW = i < this.wave || (i === this.wave && this.enemies.length === 0 && this.wave >= 0);
        ctx.fillStyle = doneW ? '#5ff0d8' : i === this.wave ? '#ffb547' : 'rgba(110,220,205,0.2)';
        if (i === NORMAL_WAVES - 1) { ctx.beginPath(); ctx.arc(bx + 8, y - 4, 5, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(bx, y - 6, 20, 4);
      }
    }
    if (this.fY <= this.fGoal + 1 && this.wave >= 0 && this.enemies.length && this.gateT < 0) {
      ctx.fillStyle = '#ffb547';
      ctx.fillText('FRACHTER WARTET', x, y + 18);
    }
    if (this.cruise > 0.3) {
      ctx.fillStyle = rgba('#9ffff0', 0.5 + 0.5 * this.cruise);
      ctx.fillText('REISEANTRIEB', x, y + (this.fY <= this.fGoal + 1 && this.enemies.length ? 34 : 18));
    }
    ctx.restore();
  }

  private drawControls(ctx: CanvasRenderingContext2D, t: number): void {
    const j = this.joy;
    if (j && j.id !== 99) {
      ctx.strokeStyle = 'rgba(110,220,205,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(63,224,197,0.35)';
      ctx.beginPath();
      ctx.arc(j.ox + j.kx * 52, j.oy + j.ky * 52, 20, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (this.fireId !== null && this.fireId !== 99) {
      ctx.fillStyle = 'rgba(127,255,240,0.25)';
      ctx.beginPath();
      ctx.arc(fbx, fby, fbr, 0, Math.PI * 2);
      ctx.fill();
    }
    drawButton(ctx, fbx, fby, fbr, 1, '#7ffff0', 'F', t);
    const [bx, by, br] = this.btnMissile;
    drawButton(ctx, bx, by, br, 1 - this.missileCd / this.missileCdMax, '#ffb547', 'R', t);
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
