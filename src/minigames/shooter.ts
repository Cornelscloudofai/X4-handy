// Minispiel „Piratenangriff“ / „Xenon-Schwarm“: Den Frachter bis zum Sprungtor beschützen.
// Großes Spielfeld (Kamera folgt dem Jäger, Radar oben rechts), schwebender Joystick, Autofeuer mit Vorhalt,
// Raketensalve und Ausweichmanöver. Nach jeder besiegten Welle wählt man eine von drei Verbesserungen.
// Gegner: Jäger, Kanonenboote, Raketenboote (Raketen abschießbar), Schildträger, Kamikaze; Xenon N, M, Rammer,
// Schirmdrohnen; zum Schluss ein Boss mit Geschütztürmen. Abschnitte mit Asteroiden (Deckung) oder Minen.
// Endlos-Modus: Wellen ohne Ende, alle fünf Wellen ein Boss.
import { sfx } from '../ui/sound';
import { enemySprite, fighterSprite, shipArt } from '../render/shipArt';
import {
  buzz, clamp, drawButton, findMutator, Floaters, Particles, pickGoals, rgba, rng, Score, setGoal, Starfield, TOP,
  type GameCfg, type GameResult, type Gear, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mode, type Mutator,
} from './common';

export type { Gear } from './common';

type Side = 'pirate' | 'xenon';
type EKind = 'jaeger' | 'kanone' | 'rakete' | 'schild' | 'kamikaze' | 'n' | 'm' | 'xr' | 'xs' | 'boss' | 'turret';

interface Enemy {
  kind: EKind; x: number; y: number; vx: number; vy: number;
  hp: number; max: number; cd: number; r: number;
  target: 'f' | 'p'; orbit: number; flash: number; dir: number;
  /** Boss-Teile: Eltern und Versatz */
  parent?: Enemy; ox?: number; oy?: number;
  shielded: boolean;
  inside?: boolean;
}
interface Bullet { x: number; y: number; vx: number; vy: number; dmg: number; from: 'p' | 'e'; life: number; color: string; w: number; pierce: number; hit?: Set<Enemy> }
interface Missile { x: number; y: number; vx: number; vy: number; target: Enemy | null; life: number }
/** Gegnerische Lenkrakete: kann abgeschossen werden */
interface EMissile { x: number; y: number; vx: number; vy: number; hp: number; life: number; target: 'f' | 'p' }
interface Pickup { x: number; y: number; kind: 'repair' | 'shield' | 'missile'; life: number }
interface Rock { x: number; y: number; r: number; vx: number; vy: number; rot: number; vr: number; pts: number[] }
interface Mine { x: number; y: number; vx: number; vy: number; armed: number; hp: number }
interface Card { id: string; name: string; desc: string; max: number }

const SPEC: Record<EKind, { hp: number; speed: number; r: number; color: string; name: string; pts: number; cost: number }> = {
  jaeger: { hp: 30, speed: 165, r: 10, color: '#ff8a5c', name: 'Piratenjäger', pts: 100, cost: 2 },
  kanone: { hp: 95, speed: 70, r: 16, color: '#ffb547', name: 'Kanonenboot', pts: 250, cost: 4 },
  rakete: { hp: 55, speed: 90, r: 13, color: '#ffd27a', name: 'Raketenboot', pts: 200, cost: 3.5 },
  schild: { hp: 70, speed: 85, r: 13, color: '#7fd8ff', name: 'Schildträger', pts: 250, cost: 4 },
  kamikaze: { hp: 14, speed: 255, r: 8, color: '#ff6a4a', name: 'Kamikaze', pts: 80, cost: 1.5 },
  n: { hp: 15, speed: 205, r: 8, color: '#ff3b4a', name: 'Xenon N', pts: 60, cost: 1 },
  m: { hp: 75, speed: 95, r: 14, color: '#ff5c6c', name: 'Xenon M', pts: 250, cost: 4 },
  xr: { hp: 12, speed: 275, r: 7, color: '#ff7a8a', name: 'Xenon-Rammer', pts: 70, cost: 1.5 },
  xs: { hp: 70, speed: 85, r: 13, color: '#ff9ab0', name: 'Schirmdrohne', pts: 250, cost: 4 },
  boss: { hp: 600, speed: 45, r: 34, color: '#ffb547', name: 'Boss', pts: 1500, cost: 0 },
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
  { id: 'dash', name: 'Ausweichtriebwerk', desc: 'Ausweichen lädt 25 % schneller', max: 2 },
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
  readonly controls = ['Irgendwo hinhalten und ziehen: Joystick zum Fliegen', 'Dein Jäger feuert von selbst; Fundstücke einfach überfliegen', 'Rechts unten: Raketensalve (R) und Ausweichen (A)', 'Nach jeder Welle eine von drei Verbesserungen wählen'];
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
  private aimA = -Math.PI / 2;
  private missileCd = 2;
  private missilesUsed = 0;
  private dashCd = 0;
  private dashT = 0;
  private dashVx = 0;
  private dashVy = 0;
  private droneA = 0;
  private droneCd = 0;
  // Frachter
  private fx0 = 0;
  private fy0 = 0;
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
  private reinforce: { t: number; kinds: EKind[] } | null = null;
  private shake = 0;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(170, 31);
  private scroll = 0;
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
    this.score = new Score(this.mutator?.mult ?? 1, 6);
    this.goals = pickGoals(this.mode === 'endless' ? ENDLESS_GOALS : NORMAL_GOALS, rng(cfg.seed ^ 0x77));
    this.shield = this.shieldMax;
    this.eyebrow = side === 'pirate' ? 'Piraten' : 'Xenon';
    this.title = this.mode === 'endless' ? 'Endlos' : side === 'pirate' ? 'Geleitschutz' : 'Abwehr';
    this.intro = this.mode === 'endless'
      ? `Welle um Welle – alle fünf Wellen ein Boss. Der Frachter wird zwischen den Wellen etwas repariert. Wie weit kommst du?`
      : side === 'pirate'
        ? 'Piraten haben es auf deinen Frachter abgesehen. Beschütze ihn über drei Wellen, dann stellt sich die Piratenfregatte – zerstöre zuerst ihre Geschütztürme.'
        : 'Ein Xenon-Schwarm hält auf deinen Frachter zu. Nach drei Wellen greift ein K-Segment an – erst die Pylone, dann der Kern.';
    // Abschnitte: Welle 2 und 3 mit Asteroiden oder Minen
    for (let i = 0; i < 40; i++) this.sectionPlan.push(this.mutator?.id === 'mines' ? 'mines' : i === 0 ? 'none' : this.r() < 0.45 ? (this.r() < 0.5 ? 'rocks' : 'mines') : 'none');
  }

  // ---------- abgeleitete Werte ----------

  private c(id: string): number { return this.cards[id] ?? 0; }
  private get speed(): number { return [200, 235, 270][this.gear.engine - 1] * (1 + 0.12 * this.c('speed')); }
  private get fireRate(): number { return [0.26, 0.21, 0.17][this.gear.weapon - 1] / (1 + 0.25 * this.c('rapid')); }
  private get damage(): number { return [6, 8, 11][this.gear.weapon - 1] * (1 + 0.3 * this.c('heavy')) * (this.mutator?.id === 'glass' ? 2 : 1); }
  private get shieldMax(): number { return [40, 70, 100][this.gear.shield - 1] * (1 + 0.4 * this.c('shield')) * (this.mutator?.id === 'glass' ? 0.5 : 1); }
  private get missileCdMax(): number { return 9 * Math.pow(0.8, this.c('mreload')); }
  private get dashCdMax(): number { return 3 * Math.pow(0.75, this.c('dash')); }
  private get enemyDmg(): number { return this.level >= 5 ? 1.3 : this.level >= 3 ? 1.15 : 1; }
  private get totalWaves(): number { return this.mode === 'endless' ? Infinity : NORMAL_WAVES; }
  private isBossWave(i: number): boolean { return this.mode === 'endless' ? (i + 1) % 5 === 0 : i === NORMAL_WAVES - 1; }

  resize(w: number, h: number): void {
    const first = this.w === 1;
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    // Spielfeld deutlich größer als der Bildschirm
    this.WW = Math.max(w * 2.3, 860);
    this.WH = Math.max(h * 1.6, 1250);
    this.fx0 = this.WW / 2;
    this.fy0 = this.WH * 0.6;
    if (first) {
      this.px = this.fx0;
      this.py = this.fy0 + 120;
      this.camX = this.px - w / 2;
      this.camY = this.py - h * 0.58;
    }
  }

  private get fx1(): number { return this.fx0 + Math.sin(this.time * 0.35) * 60; }
  private get fy1(): number { return this.fy0 + Math.sin(this.time * 0.6) * 14 - (this.gateT >= 0 ? this.gateT * this.gateT * 140 : 0); }
  private get btnMissile(): [number, number, number] { return [this.w - 50, this.h - 62, 30]; }
  private get btnDash(): [number, number, number] { return [this.w - 50, this.h - 138, 25]; }

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
    const [bx, by, br] = this.btnMissile;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.fireMissiles(); return; }
    const [dx, dy, dr] = this.btnDash;
    if (Math.hypot(x - dx, y - dy) < dr + 10) { this.doDash(); return; }
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
  }

  private fireMissiles(): void {
    if (this.missileCd > 0 || this.outcome || this.choosing) return;
    this.missileCd = this.missileCdMax;
    this.missilesUsed++;
    setGoal(this.goals, 'nomissile', false);
    const targets = [...this.enemies].filter((e) => !e.shielded || e.kind !== 'boss').sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py));
    const n = 4 + 2 * this.c('missiles');
    for (let k = 0; k < n; k++) {
      const a = this.aimA + (k - (n - 1) / 2) * 0.4;
      this.missiles.push({ x: this.px, y: this.py, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, target: targets[k % Math.max(1, targets.length)] ?? null, life: 3.2 });
    }
    sfx.open();
  }

  private doDash(): void {
    if (this.dashCd > 0 || this.outcome || this.choosing) return;
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

  /** Nur für Tests: einfacher Autopilot */
  autopilot(): void {
    if (this.choosing) { this.chooseCard(0); return; }
    const near = this.pickups.find((p) => Math.hypot(p.x - this.px, p.y - this.py) < 160);
    let best: Enemy | null = null, bd = 1e9;
    for (const e of this.enemies) { const d = Math.hypot(e.x - this.fx1, e.y - this.fy1); if (d < bd) { bd = d; best = e; } }
    const tx = near ? near.x : best ? best.x + (this.fx1 - best.x) * 0.3 : this.fx1, ty = near ? near.y : best ? best.y + (this.fy1 - best.y) * 0.3 : this.fy1 + 90;
    const dx = tx - this.px, dy = ty - this.py, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 60);
    this.joy = { id: 99, ox: 0, oy: 0, kx: (dx / d) * k, ky: (dy / d) * k };
    if (this.enemies.length >= 3) this.fireMissiles();
    if (this.eMissiles.some((m) => Math.hypot(m.x - this.px, m.y - this.py) < 60)) this.doDash();
  }

  // ---------- Wellen ----------

  private waveKinds(i: number): EKind[] {
    const swarm = this.mutator?.id === 'swarm' ? 1.45 : 1;
    let budget = (5 + i * 3 + this.level * 1.6) * swarm * (this.mode === 'endless' ? 1 + i * 0.08 : 1);
    const pool: EKind[] = this.side === 'pirate'
      ? (i === 0 ? ['jaeger', 'jaeger', 'kamikaze'] : i === 1 ? ['jaeger', 'jaeger', 'kamikaze', 'rakete', 'schild'] : ['jaeger', 'kamikaze', 'rakete', 'kanone', 'schild'])
      : (i === 0 ? ['n', 'n', 'xr'] : i === 1 ? ['n', 'n', 'xr', 'm', 'xs'] : ['n', 'xr', 'm', 'xs']);
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
    this.banner = 2.4;
    this.section = this.mode === 'endless' ? this.sectionPlan[this.wave % this.sectionPlan.length] : this.sectionPlan[this.wave] ?? 'none';
    if (this.mutator?.id === 'mines') this.section = 'mines';
    if (this.section === 'rocks') this.spawnRocks();
    if (this.section === 'mines') this.spawnMines();
    const boss = this.isBossWave(this.wave);
    if (boss) {
      this.spawnBoss();
      this.bannerText = 'BOSS';
      this.bannerSub = this.side === 'pirate' ? 'Piratenfregatte – erst die Geschütztürme' : 'Xenon K-Segment – erst die Pylone';
      this.spawnGroup(this.side === 'pirate' ? ['jaeger', 'jaeger'] : ['n', 'n', 'n']);
    } else {
      const kinds = this.waveKinds(this.wave);
      const cut = Math.max(1, Math.ceil(kinds.length * 0.6));
      this.spawnGroup(kinds.slice(0, cut));
      if (kinds.length > cut) this.reinforce = { t: 7 + this.r() * 3, kinds: kinds.slice(cut) };
      this.bannerText = this.mode === 'endless' ? `WELLE ${this.wave + 1}` : `WELLE ${this.wave + 1} VON ${NORMAL_WAVES}`;
      this.bannerSub = [...new Set(kinds.map((k) => SPEC[k].name))].join(' · ') + (this.section === 'rocks' ? ' · Asteroidenfeld' : this.section === 'mines' ? ' · Minenfeld' : '');
    }
    if (this.wave > 0) sfx.warn();
  }

  private edgePoint(): [number, number] {
    const side = Math.floor(this.r() * 3);
    if (side === 0) return [this.r() * this.WW, -40];
    if (side === 1) return [-40, this.r() * this.WH * 0.7];
    return [this.WW + 40, this.r() * this.WH * 0.7];
  }

  private makeEnemy(kind: EKind, x: number, y: number): Enemy {
    const s = SPEC[kind];
    const hp = s.hp * HP_MUL[this.level] * (this.mode === 'endless' ? 1 + this.wave * 0.06 : 1);
    return { kind, x, y, vx: 0, vy: 0, hp, max: hp, cd: 1 + this.r() * 1.5, r: s.r, target: kind === 'kanone' || kind === 'rakete' || this.r() < 0.65 ? 'f' : 'p', orbit: this.r() * Math.PI * 2, flash: 0, dir: this.r() < 0.5 ? 1 : -1, shielded: false };
  }

  private spawnGroup(list: EKind[]): void {
    const [x0, y0] = this.edgePoint();
    for (const [i, kind] of list.entries()) {
      const a = (i / list.length) * Math.PI * 2;
      this.enemies.push(this.makeEnemy(kind, x0 + Math.cos(a) * 50, y0 + Math.sin(a) * 50));
    }
  }

  private spawnBoss(): void {
    const b = this.makeEnemy('boss', this.WW / 2, -80);
    b.hp = b.max = SPEC.boss.hp * HP_MUL[this.level] * (this.mode === 'endless' ? 1 + this.wave * 0.05 : 1);
    b.r = this.side === 'pirate' ? 34 : 30;
    this.enemies.push(b);
    const offs: [number, number][] = this.side === 'pirate'
      ? [[-50, -6], [50, -6], [0, 50], ...(this.level >= 4 ? [[0, -56] as [number, number]] : [])]
      : [[-46, -46], [46, -46], [-46, 46], [46, 46], ...(this.level >= 4 ? [[0, -62] as [number, number]] : [])];
    for (const [ox, oy] of offs) {
      const t = this.makeEnemy('turret', b.x + ox, b.y + oy);
      t.parent = b; t.ox = ox; t.oy = oy;
      this.enemies.push(t);
    }
    this.bossT = 0;
  }

  private spawnRocks(): void {
    const n = 9 + Math.floor(this.r() * 5);
    for (let i = 0; i < n; i++) {
      const r = 16 + this.r() * 26;
      const pts: number[] = [];
      for (let k = 0; k < 9; k++) pts.push(0.75 + this.r() * 0.35);
      this.rocks.push({ x: this.r() * this.WW, y: -60 - this.r() * this.WH * 0.8, r, vx: (this.r() - 0.5) * 14, vy: 28 + this.r() * 22, rot: this.r() * 6, vr: (this.r() - 0.5) * 0.6, pts });
    }
  }

  private spawnMines(): void {
    const n = 8 + Math.floor(this.r() * 5);
    for (let i = 0; i < n; i++) {
      // nicht direkt auf dem Frachter
      let x = 0, y = 0;
      do { x = 60 + this.r() * (this.WW - 120); y = 60 + this.r() * (this.WH - 120); } while (Math.hypot(x - this.fx0, y - this.fy0) < 160 || Math.hypot(x - this.px, y - this.py) < 120);
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
      this.scroll += dt * 160;
      this.followCam(dt, true);
      if (this.endT > 2.2) this.done = this.finish();
      return;
    }
    if (this.choosing) return;
    this.time += dt;
    this.scroll += dt * 45;
    this.score.update(dt);
    this.fFlash = Math.max(0, this.fFlash - dt);
    this.shieldHit = Math.max(0, this.shieldHit - dt);
    if (this.wave < 0 && this.time > 0.8) this.spawnWave();
    this.waveT += dt;
    if (this.bossT >= 0) this.bossT += dt;
    if (this.pendingSpawn >= 0) {
      this.pendingSpawn -= dt;
      if (this.pendingSpawn < 0) { this.pendingSpawn = -1; this.spawnWave(); }
    } else if (this.reinforce && this.waveT >= this.reinforce.t) {
      this.spawnGroup(this.reinforce.kinds);
      this.reinforce = null;
      this.floats.add(this.px, this.py - 40, 'Verstärkung!', '#ff9aa4', 15);
    } else if (this.wave >= 0 && this.enemies.length === 0 && !this.reinforce) {
      // Welle besiegt
      if (this.wave + 1 >= this.totalWaves) {
        this.gateT = 0;
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
    } else if (this.wave >= 0 && this.waveT > 30 && !this.isBossWave(this.wave) && this.wave + 1 < this.totalWaves && !this.isBossWave(this.wave + 1)) {
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

  private followCam(dt: number, toFreighter: boolean): void {
    const tx = (toFreighter ? this.fx1 : this.px) - this.w / 2;
    const ty = (toFreighter ? this.fy1 : this.py) - (TOP + (this.h - TOP) * 0.5);
    const k = Math.min(1, dt * 4);
    this.camX += (clamp(tx, -40, this.WW - this.w + 40) - this.camX) * k;
    this.camY += (clamp(ty, -TOP - 40, this.WH - this.h + 40) - this.camY) * k;
  }

  private updatePlayer(dt: number): void {
    const j = this.joy;
    const tvx = j ? j.kx * this.speed : 0, tvy = j ? j.ky * this.speed : 0;
    const k = Math.min(1, dt * 6);
    this.pvx += (tvx - this.pvx) * k;
    this.pvy += (tvy - this.pvy) * k;
    let vx = this.pvx, vy = this.pvy;
    if (this.dashT > 0) { this.dashT -= dt; vx = this.dashVx; vy = this.dashVy; if (Math.random() < 0.7) this.fx.add({ x: this.px, y: this.py, color: '#9ffff0', size: 2, max: 0.25 }); }
    this.px = clamp(this.px + vx * dt, 14, this.WW - 14);
    this.py = clamp(this.py + vy * dt, 14, this.WH - 14);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.shieldWait = Math.max(0, this.shieldWait - dt);
    if (!this.shieldWait && this.mutator?.id !== 'ion') this.shield = Math.min(this.shieldMax, this.shield + 12 * (1 + 0.5 * this.c('regen')) * dt);
    // Autofeuer: Raketen nahe am Frachter zuerst, sonst nächster Gegner (mit Vorhalt)
    this.fireCd -= dt;
    let tx = 0, ty = 0, tvx2 = 0, tvy2 = 0, bd = 280, found = false;
    for (const m of this.eMissiles) { const d = Math.hypot(m.x - this.px, m.y - this.py); if (d < bd) { bd = d; tx = m.x; ty = m.y; tvx2 = m.vx; tvy2 = m.vy; found = true; } }
    if (!found) bd = 280;
    for (const e of this.enemies) {
      if (e.kind === 'boss' && this.enemies.some((q) => q.parent === e)) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py) - (found ? 60 : 0);
      if (d < bd) { bd = d; tx = e.x; ty = e.y; tvx2 = e.vx; tvy2 = e.vy; found = true; }
    }
    if (!found) for (const m of this.mines) { const d = Math.hypot(m.x - this.px, m.y - this.py); if (d < 200 && d < bd) { bd = d; tx = m.x; ty = m.y; tvx2 = 0; tvy2 = 0; found = true; } }
    if (found) {
      const t = Math.hypot(tx - this.px, ty - this.py) / 620;
      this.aimA = Math.atan2(ty + tvy2 * t - this.py, tx + tvx2 * t - this.px);
      if (this.fireCd <= 0) {
        this.fireCd = this.fireRate;
        const spread = this.c('spread');
        for (let s = -spread; s <= spread; s++) {
          const a = this.aimA + s * 0.16;
          this.bullets.push({ x: this.px + Math.cos(a) * 12, y: this.py + Math.sin(a) * 12, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, dmg: this.damage * (s === 0 ? 1 : 0.7), from: 'p', life: 0.6, color: '#7ffff0', w: 2, pierce: this.c('pierce') });
        }
      }
    } else if (Math.hypot(this.pvx, this.pvy) > 30) this.aimA = Math.atan2(this.pvy, this.pvx);
    // Drohnen kreisen und feuern selbst
    const drones = this.c('drone');
    if (drones) {
      this.droneA += dt * 2.4;
      this.droneCd -= dt;
      if (this.droneCd <= 0) {
        this.droneCd = 0.6 / drones;
        const k2 = Math.floor(this.time * 10) % drones;
        const [dx, dy] = this.dronePos(k2);
        let tgt: Enemy | null = null, td = 230;
        for (const e of this.enemies) { const d = Math.hypot(e.x - dx, e.y - dy); if (d < td && !(e.kind === 'boss' && this.enemies.some((q) => q.parent === e))) { td = d; tgt = e; } }
        if (tgt) {
          const a = Math.atan2(tgt.y - dy, tgt.x - dx);
          this.bullets.push({ x: dx, y: dy, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, dmg: 5, from: 'p', life: 0.5, color: '#b690ff', w: 1.6, pierce: 0 });
        }
      }
    }
  }

  private dronePos(k: number): [number, number] {
    const a = this.droneA + (k * Math.PI * 2) / Math.max(1, this.c('drone'));
    return [this.px + Math.cos(a) * 30, this.py + Math.sin(a) * 30];
  }

  private updateEnemies(dt: number): void {
    const fx = this.fx1, fy = this.fy1;
    // Schildträger schützen Verbündete in der Nähe
    const shielders = this.enemies.filter((e) => e.kind === 'schild' || e.kind === 'xs');
    // Ohne Verbündete fliehen Schildträger aus dem Feld
    const alone = shielders.length > 0 && shielders.length === this.enemies.length;
    if (alone) for (const e of shielders) {
      if (!e.inside && (e.x < -30 || e.x > this.WW + 30 || e.y < -30)) { this.enemies = this.enemies.filter((q) => q !== e); continue; }
      e.inside = false;
      const ex = e.x < this.WW / 2 ? -80 : this.WW + 80;
      const d = Math.hypot(ex - e.x, -80 - e.y) || 1;
      e.vx = ((ex - e.x) / d) * 110;
      e.vy = ((-80 - e.y) / d) * 110;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
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
        // Geschützturm am Boss
        const p = e.parent, a = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        const c = Math.cos(a), sn = Math.sin(a);
        e.x = p.x + e.ox! * c - e.oy! * sn;
        e.y = p.y + e.ox! * sn + e.oy! * c;
        e.vx = p.vx; e.vy = p.vy;
        e.cd -= dt;
        const tx = this.r() < 0.5 ? this.px : fx, ty = tx === this.px ? this.py : fy;
        if (e.cd <= 0 && Math.hypot(tx - e.x, ty - e.y) < 340) {
          e.cd = 2.2 + this.r() * 0.8;
          const a2 = Math.atan2(ty - e.y, tx - e.x);
          for (let q = 0; q < 2; q++) this.enemyShot(e, a2 + (q - 0.5) * 0.1, this.side === 'pirate' ? 250 : 280, 5.5, this.side === 'pirate' ? '#ffd27a' : '#ff5c6c');
        }
        continue;
      }
      const tx = e.target === 'f' ? fx : this.px, ty = e.target === 'f' ? fy : this.py;
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      let wx: number, wy: number;
      if (e.kind === 'kamikaze' || e.kind === 'xr') {
        wx = dx / d; wy = dy / d;
      } else if (e.kind === 'n') {
        const sideW = d < 70 ? 1.4 : 0.25;
        wx = (dx / d) * (1 - sideW) + (-dy / d) * sideW * e.dir;
        wy = (dy / d) * (1 - sideW) + (dx / d) * sideW * e.dir;
      } else if (e.kind === 'schild' || e.kind === 'xs') {
        // zur Mitte der Verbündeten
        const allies = this.enemies.filter((q) => q !== e && !q.parent && q.kind !== 'schild' && q.kind !== 'xs');
        const mx = allies.length ? allies.reduce((a2, q) => a2 + q.x, 0) / allies.length : fx;
        const my = allies.length ? allies.reduce((a2, q) => a2 + q.y, 0) / allies.length : fy - 200;
        const ddx = mx - e.x, ddy = my - e.y, dd = Math.hypot(ddx, ddy) || 1;
        wx = (ddx / dd) * clamp(dd / 60, 0, 1); wy = (ddy / dd) * clamp(dd / 60, 0, 1);
        // Abstand zum Jäger halten
        const pd = Math.hypot(this.px - e.x, this.py - e.y);
        if (pd < 120) { wx -= (this.px - e.x) / pd; wy -= (this.py - e.y) / pd; }
      } else {
        const want = e.kind === 'boss' ? 240 : e.kind === 'kanone' ? 170 : e.kind === 'rakete' ? 230 : e.kind === 'm' ? 150 : 120;
        const radial = clamp((d - want) / 60, -1, 1);
        wx = (dx / d) * radial + (-dy / d) * e.dir * 0.8;
        wy = (dy / d) * radial + (dx / d) * e.dir * 0.8;
      }
      const wl = Math.hypot(wx, wy) || 1;
      const k = Math.min(1, dt * 2.5);
      const sp = s.speed * (Math.hypot(wx, wy) < 0.05 ? 0 : 1);
      e.vx += ((wx / wl) * sp - e.vx) * k;
      e.vy += ((wy / wl) * sp - e.vy) * k;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // einmal im Feld, bleiben Gegner darin
      if (e.x > 20 && e.x < this.WW - 20 && e.y > 20 && e.y < this.WH - 20) e.inside = true;
      if (e.inside) {
        const cx = clamp(e.x, 20, this.WW - 20), cy = clamp(e.y, 20, this.WH - 20);
        if (cx !== e.x) { e.x = cx; e.vx = 0; e.dir = -e.dir; }
        if (cy !== e.y) { e.y = cy; e.vy = 0; e.dir = -e.dir; }
      }
      if (e.kind !== 'kanone' && e.kind !== 'rakete' && e.kind !== 'boss' && Math.hypot(this.px - e.x, this.py - e.y) < 90 && this.r() < dt) e.target = 'p';
      // Rammen
      if (e.kind === 'kamikaze' || e.kind === 'xr') {
        if (Math.hypot(fx - e.x, (fy - e.y) * 0.45) < 22 && e.target === 'f') { this.hitFreighter(30 * this.enemyDmg, e.x, e.y); this.killEnemy(e, false); continue; }
        if (Math.hypot(this.px - e.x, this.py - e.y) < 16) { this.damagePlayer(20 * this.enemyDmg); this.killEnemy(e, false); continue; }
      }
      e.cd -= dt;
      const range = e.kind === 'n' ? 150 : e.kind === 'boss' ? 340 : 270;
      if (e.cd <= 0 && d < range) {
        const a = Math.atan2(dy, dx) + (this.r() - 0.5) * 0.12;
        if (e.kind === 'jaeger') { e.cd = 1.3; this.enemyShot(e, a, 270, 6, '#ffb070'); }
        else if (e.kind === 'kanone') { e.cd = 2.6; for (let q = 0; q < 3; q++) this.enemyShot(e, a + (q - 1) * 0.08, 230, 8, '#ffd27a'); }
        else if (e.kind === 'rakete') { e.cd = 4; this.eMissiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, hp: 4, life: 7, target: e.target }); }
        else if (e.kind === 'n') { e.cd = 0.9; this.enemyShot(e, a, 320, 4, '#ff5c6c'); }
        else if (e.kind === 'm') { e.cd = 2; this.enemyShot(e, a, 430, 11, '#ff3b4a', 3); }
        else if (e.kind === 'boss') {
          e.cd = 3;
          // erst ohne Türme feuert der Kern: Fächer bzw. Ring
          if (!e.shielded) {
            const n = this.side === 'pirate' ? 5 : 10;
            for (let q = 0; q < n; q++) this.enemyShot(e, this.side === 'pirate' ? a + (q - 2) * 0.16 : (q / n) * Math.PI * 2, 240, 9, this.side === 'pirate' ? '#ffd27a' : '#ff3b4a', 2.5);
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
      else if (Math.hypot(this.px - m.x, this.py - m.y) < 14) { this.damagePlayer(18 * this.enemyDmg); m.life = 0; this.explode(m.x, m.y, '#ff8a5c', 0.6, false); }
    }
    this.eMissiles = this.eMissiles.filter((m) => m.life > 0 && m.hp > 0);
  }

  private enemyShot(e: Enemy, a: number, v: number, dmg: number, color: string, w = 2): void {
    this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: dmg * this.enemyDmg, from: 'e', life: 1.8, color, w, pierce: 0 });
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
          this.fx.burst(b.x, b.y, '#bffff6', 3, 120, 1.2, 'spark', 0.2);
          if (b.pierce > 0) { b.pierce--; (b.hit ??= new Set()).add(e); keep.push(b); }
          continue;
        }
      } else {
        if (Math.hypot(this.px - b.x, this.py - b.y) < 12) { this.damagePlayer(b.dmg); this.fx.burst(b.x, b.y, b.color, 4, 120, 1.2, 'spark', 0.2); continue; }
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
      if (Math.random() < 0.8) this.fx.add({ x: m.x, y: m.y, color: '#ffb070', size: 1.3, max: 0.3 });
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
      if (d < k.r + 10 && d > 0) {
        const nx = (this.px - k.x) / d, ny = (this.py - k.y) / d;
        this.px = k.x + nx * (k.r + 10);
        this.py = k.y + ny * (k.r + 10);
        this.pvx = nx * 120; this.pvy = ny * 120;
        if (this.dashT <= 0) this.damagePlayer(3);
      }
    }
    // Felsen, die unten hinaus sind, oben neu – solange der Abschnitt dauert
    for (const k of this.rocks) if (k.y > this.WH + 80 && this.section === 'rocks') { k.y = -60; k.x = this.r() * this.WW; }
    this.rocks = this.rocks.filter((k) => k.y < this.WH + 80);
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
    this.shieldWait = 2.5 / (1 + 0.5 * this.c('regen'));
    if (this.shield > 0) {
      const s = Math.min(this.shield, dmg);
      this.shield -= s;
      dmg -= s;
      this.shieldHit = 0.25;
    }
    if (dmg > 0) {
      this.hull = Math.max(0, this.hull - dmg);
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
    this.stars.draw(ctx, this.scroll - this.camY * 0.25, this.side === 'xenon' ? '#ffd0d0' : '#cfe4ff');
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 12 * this.shake, (Math.random() - 0.5) * 12 * this.shake);
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));
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
    if (this.outcome !== 'freighter') this.drawFreighter(ctx, t);
    for (const e of this.enemies) this.drawEnemy(ctx, e, t);
    this.drawShots(ctx);
    if (this.outcome !== 'player') this.drawPlayer(ctx, t);
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

  private drawShots(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
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
    for (const m of this.missiles) {
      ctx.fillStyle = '#fff2c8';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const m of this.eMissiles) {
      const a = Math.atan2(m.vy, m.vx);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(a);
      ctx.fillStyle = '#2a1008';
      ctx.strokeStyle = '#ff8a5c';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-6, 4); ctx.lineTo(-6, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
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
    const gx = this.fx0, gy = this.fy0 - 330 + Math.min(1, this.gateT * 0.8) * 60;
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
    const shrink = this.gateT >= 0 ? Math.max(0, 1 - Math.max(0, this.gateT - 1.3) * 1.4) : 1;
    if (shrink <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(shrink, shrink);
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
    const f = this.fHull / this.fMax;
    ctx.fillStyle = 'rgba(14,30,44,0.85)';
    ctx.fillRect(x - 30, y + 58, 60, 4);
    ctx.fillStyle = f > 0.5 ? '#3fe0c5' : f > 0.25 ? '#ffb547' : '#ff5c6c';
    ctx.fillRect(x - 30, y + 58, 60 * f, 4);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    const s = SPEC[e.kind];
    const xen = this.side === 'xenon';
    const base = e.kind === 'turret' ? (xen ? '#ff5c6c' : '#ffd27a') : e.kind === 'boss' ? (xen ? '#ff3b4a' : '#ffb547') : s.color;
    const col = e.flash > 0 ? '#ffffff' : base;
    const a = Math.atan2(e.vy, e.vx) + Math.PI / 2;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.shielded) {
      ctx.strokeStyle = rgba('#7fd8ff', 0.35 + 0.2 * Math.sin(t * 6));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(e.parent ? Math.atan2(this.py - e.y, this.px - e.x) + Math.PI / 2 : a);
    const spr = enemySprite(e.kind);
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
      ctx.drawImage(spr.img, -size / 2, -size / 2, size, size);
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(spr.img, -size / 2, -size / 2, size, size);
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
      case 'kamikaze': case 'xr': ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.5, r * 0.6); ctx.lineTo(-r * 0.5, r * 0.6); break;
      case 'n': ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, r * 0.8); ctx.lineTo(-r * 0.8, r * 0.8); break;
      case 'm': ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.5, -r * 0.2); ctx.lineTo(r, r); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, -r * 0.2); break;
      case 'turret': ctx.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, -r * 1.5); break;
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
    if (e.kind === 'kamikaze' || e.kind === 'xr') {
      ctx.fillStyle = rgba('#ffd27a', 0.5 + 0.5 * Math.sin(t * 20));
      ctx.beginPath();
      ctx.arc(0, r * 0.8, 2.5, 0, Math.PI * 2);
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
    for (let k = 0; k < this.c('drone'); k++) {
      const [dx, dy] = this.dronePos(k);
      ctx.fillStyle = '#1a1030';
      ctx.strokeStyle = '#b690ff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(this.px, this.py);
    if (this.dashT > 0) ctx.globalAlpha = 0.55;
    if (this.shieldHit > 0 || this.shield < this.shieldMax) {
      const sa = this.shieldHit > 0 ? 0.6 : 0.12 * (this.shield / Math.max(1, this.shieldMax));
      ctx.strokeStyle = rgba('#7fd8ff', sa);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    const heading = Math.hypot(this.pvx, this.pvy) > 20 ? Math.atan2(this.pvy, this.pvx) : this.aimA;
    ctx.rotate(heading + Math.PI / 2);
    const thrust = Math.hypot(this.pvx, this.pvy) / this.speed;
    const sprite = fighterSprite();
    if (sprite) {
      // Bild-Grafik: flackernde Triebwerksflammen hinter den Düsen, darüber das Schiff.
      // KI-Bilder füllen das Bild fast ganz aus, die gerenderten haben mehr Rand – daher kleiner gezeichnet.
      const size = shipArt() === 'ai' ? SPRITE_SIZE * 0.86 : SPRITE_SIZE;
      const { xs, y, color } = sprite.engines;
      ctx.fillStyle = rgba(color, 0.35 + 0.5 * thrust);
      for (const fx of xs) {
        const ex = fx * size, ey = y * size;
        ctx.beginPath();
        ctx.moveTo(ex - 1.8, ey); ctx.lineTo(ex + 1.8, ey); ctx.lineTo(ex, ey + 2 + thrust * 12 + Math.random() * 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.drawImage(sprite.img, -size / 2, -size / 2, size, size);
    } else {
      drawFighterVector(ctx);
      ctx.fillStyle = rgba('#9ffff0', 0.4 + 0.5 * thrust);
      ctx.beginPath();
      ctx.moveTo(-3, 10); ctx.lineTo(3, 10); ctx.lineTo(0, 12 + thrust * 10 + Math.random() * 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(127,216,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.px, this.py, 23, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.shield) / Math.max(1, this.shieldMax));
    ctx.stroke();
    void t;
  }

  /** Pfeile am Rand für Gegner (und Frachter) außerhalb des Bildes */
  private drawIndicators(ctx: CanvasRenderingContext2D): void {
    const arrow = (wx: number, wy: number, color: string, size = 6) => {
      const sx = wx - this.camX, sy = wy - this.camY;
      if (sx > 0 && sx < this.w && sy > TOP && sy < this.h) return;
      const x = clamp(sx, 12, this.w - 12), y = clamp(sy, TOP + 12, this.h - 12);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(sy - y, sx - x));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size + 1, 0); ctx.lineTo(-size + 1, size - 1); ctx.lineTo(-size + 1, -size + 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    for (const e of this.enemies) if (!e.parent) arrow(e.x, e.y, rgba(e.kind === 'boss' ? '#ff5c6c' : SPEC[e.kind].color, 0.85), e.kind === 'boss' ? 9 : 6);
    for (const m of this.eMissiles) arrow(m.x, m.y, 'rgba(255,138,92,0.9)', 5);
    arrow(this.fx1, this.fy1, '#5ff0d8', 9);
  }

  private drawRadar(ctx: CanvasRenderingContext2D): void {
    const rw = 74, rh = (rw * this.WH) / this.WW;
    const x0 = this.w - rw - 10, y0 = TOP + 6;
    const sx = rw / this.WW, sy = rh / this.WH;
    ctx.fillStyle = 'rgba(5,14,22,0.75)';
    ctx.fillRect(x0, y0, rw, rh);
    ctx.strokeStyle = 'rgba(110,220,205,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, rw - 1, rh - 1);
    // Bildausschnitt
    ctx.strokeStyle = 'rgba(228,243,240,0.35)';
    ctx.strokeRect(x0 + clamp(this.camX * sx, 0, rw), y0 + clamp((this.camY + TOP) * sy, 0, rh), (this.w * sx), ((this.h - TOP) * sy));
    const dot = (x: number, y: number, c: string, r = 1.6) => { ctx.fillStyle = c; ctx.fillRect(x0 + x * sx - r, y0 + y * sy - r, r * 2, r * 2); };
    for (const k of this.rocks) dot(k.x, k.y, 'rgba(168,154,138,0.6)', 1.2);
    for (const m of this.mines) dot(m.x, m.y, 'rgba(255,181,71,0.7)', 1);
    for (const e of this.enemies) if (!e.parent) dot(e.x, e.y, e.kind === 'boss' ? '#ff5c6c' : SPEC[e.kind].color, e.kind === 'boss' ? 3 : 1.6);
    for (const p of this.pickups) dot(p.x, p.y, '#6be38f', 1.4);
    dot(this.fx1, this.fy1, '#5ff0d8', 2.6);
    dot(this.px, this.py, '#ffffff', 1.8);
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
    const [bx, by, br] = this.btnMissile;
    drawButton(ctx, bx, by, br, 1 - this.missileCd / this.missileCdMax, '#ffb547', 'R', t);
    const [dx, dy, dr] = this.btnDash;
    drawButton(ctx, dx, dy, dr, 1 - this.dashCd / this.dashCdMax, '#5ff0d8', 'A', t);
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
