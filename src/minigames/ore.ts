// Minispiel „Reiche Erzader“: Mit dem Bohrlaser den leuchtenden Adern eines Asteroiden folgen.
// Weiches und hartes Gestein (dunkle, geriefte Zonen heizen stark), Kristallnester (nur mit kühlem Laser bergen,
// sonst zerspringen sie), Gastaschen (Druck steigt, wenn in der Nähe gebohrt wird; reißen Nachbartaschen mit).
// Wer eine Ader ohne Unterbrechung abfährt, baut die Kombo auf. Kühlspülung per Taste.
// Tiefe: Zwei Lasermodi (breit: schnell, heiß, reißt Gestein auf – fein: langsam, kühl, lässt Gastaschen ab),
// Gesteinsspannung (Bohren im Gestein erzeugt Risse; bei 100 % stürzt der Asteroid ein und die Restladung ist weg),
// Kernader (liegt frei, sobald die Hälfte der Deckadern abgebaut ist; zählt 2,5-fach), Heißlauf (ab 70 % Hitze
// gibt es mehr Punkte – aber Kristalle zerspringen). Ist ein Asteroid ausgebeutet, zerbricht er – der nächste kommt.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import { BG_IMAGES } from '../render/bgImages';
import { mapShipSprite } from '../render/shipArt';
import { fbm, perlin } from '../render/noise';
import {
  buzz, clamp, drawButton, roundRect, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

const DURATION = 45;
/** Fingerversatz: der Laser trifft etwas oberhalb des Fingers, damit man den Treffpunkt sieht */
const AIM_OFFSET = 56;
/** Einheiten Rohstoff je Aderpunkt (für die Anzeige) */
const UNITS_PER_POINT = 40;
/** Kernader zählt mehrfach */
const CORE_VALUE = 2.5;
/** Ab dieser Hitze: Heißlauf (mehr Punkte) */
const HOT_RUN = 70;

type LaserMode = 'wide' | 'fine';
/** Kennwerte der Lasermodi: Radius, Abbaurate, Hitze (Ader/Gestein), Spannung (Gestein), Druck auf Gastaschen */
const MODES: Record<LaserMode, { name: string; rr: number; rate: number; heatVein: number; heatRock: number; stress: number; press: number }> = {
  wide: { name: 'Breit', rr: 0.085, rate: 3.4, heatVein: 11, heatRock: 24, stress: 9, press: 0.4 },
  fine: { name: 'Fein', rr: 0.05, rate: 2.1, heatVein: 6, heatRock: 13, stress: 3.5, press: 0.13 },
};

export const ORE_MUTATORS: Mutator[] = [
  { id: 'rich', name: 'Reiche Adern', desc: 'Mehr Adern, aber ein Viertel weniger Zeit', mult: 1.3 },
  { id: 'hot', name: 'Hitzewelle', desc: 'Der Laser kühlt nur halb so schnell ab', mult: 1.4 },
  { id: 'spin', name: 'Taumelnder Asteroid', desc: 'Der Asteroid dreht sich schnell', mult: 1.4 },
  { id: 'crystal', name: 'Kristallfeld', desc: 'Doppelt so viele Kristallnester', mult: 1.2 },
  { id: 'brittle', name: 'Brüchiges Gestein', desc: 'Risse wachsen doppelt so schnell', mult: 1.35 },
];

export const ORE_GOALS: GoalDef[] = [
  { id: 'cool', text: 'Nie überhitzen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'crystal2', text: 'Zwei Kristallnester bergen' },
  { id: 'break', text: 'Einen Asteroiden ganz zerlegen' },
  { id: 'nopocket', text: 'Keine Gastasche treffen' },
  { id: 'noflush', text: 'Ohne Kühlspülung auskommen' },
  { id: 'core', text: 'Eine Kernader ausbeuten' },
  { id: 'vent', text: 'Eine Gastasche gefahrlos ablassen' },
  { id: 'stable', text: 'Kein Einsturz' },
];

interface VeinPt { x: number; y: number; a: number }
interface Pocket {
  x: number; y: number; alive: boolean;
  /** Druck 0–1: bei 1 explodiert die Tasche von selbst */
  press: number;
  /** Fortschritt beim Ablassen (feiner Laser) */
  vent: number;
}
interface Crystal { x: number; y: number; prog: number; state: 'ok' | 'got' | 'broken' }
interface Zone { x: number; y: number; r: number }
interface Crack { pts: { x: number; y: number; o: number }[]; w: number }
interface Frag { pts: [number, number][]; rim: [number, number]; x: number; y: number; vx: number; vy: number; a: number; vr: number; t: number; slow: boolean }
/** Asteroidenbild: Umgebungslicht, vier gerichtete Lichtschichten (+x, +y, −x, −y), Umrissmaske und das Ergebnis */
interface AstArt { R: number; dpr: number; ambient: HTMLCanvasElement; dirs: HTMLCanvasElement[]; mask: HTMLCanvasElement; comp: HTMLCanvasElement; light: number; path: Path2D }

/** Sonnenlicht kommt von links oben (passend zum Hintergrundbild) */
const SUN_ANGLE = Math.atan2(-0.78, -0.62);
/** Gesteinsfarben je Rohstoff: dunkel, hell, harte Zonen */
const ROCK: Record<string, [number[], number[], number[]]> = {
  ore: [[52, 44, 38], [118, 102, 88], [40, 44, 54]],
  silicon: [[50, 52, 56], [122, 124, 128], [38, 42, 56]],
  ice: [[62, 72, 84], [138, 152, 166], [46, 58, 78]],
  nividium: [[44, 38, 52], [104, 92, 118], [34, 32, 52]],
};

let bgImg: HTMLImageElement | null = null;
/** Hintergrundbild (Asteroiden im Sonnenlicht), sobald geladen */
function background(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!bgImg) {
    bgImg = new Image();
    bgImg.decoding = 'async';
    bgImg.src = BG_IMAGES.find((b) => b.id === 'asteroiden-sonne')?.url ?? '';
  }
  return bgImg.complete && bgImg.naturalWidth ? bgImg : null;
}

export class OreGame implements MiniGame {
  readonly eyebrow = 'Bergbau';
  readonly title: string;
  readonly intro: string;
  readonly controls = [
    'Finger halten und ziehen: Laser führen (trifft knapp über dem Finger)',
    'Ader ohne Absetzen abfahren: Kombo steigt',
    'Taste B/F: Laser breit (schnell, heiß, reißt Gestein) oder fein (kühl, lässt Gastaschen ab)',
    'Bohren im Gestein erzeugt Risse – bei voller Spannung stürzt der Asteroid ein',
    'Die Hälfte der Adern abgebaut: Die Kernader liegt frei (2,5-fach)',
    'Taste K: Kühlspülung',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  private level: Level;
  private seed: number;
  private ware: string;
  private color: string;
  private duration: number;
  private score: Score;
  // Asteroid
  private shape: number[] = [];
  private veins: VeinPt[][] = [];
  /** Kernader (erst sichtbar und abbaubar, wenn `coreOpen`) */
  private core: VeinPt[] = [];
  private coreOpen = false;
  private coreTotal = 0;
  private coresDone = 0;
  /** Bruchlinien (lokale Punkte, vom Rand nach innen) */
  /** Rissnetz: Äste aus Punkten mit Abstand `o` vom Rand (wächst mit der Spannung von außen nach innen) */
  private cracks: Crack[] = [];
  private crackMax = 1;
  /** Gesteinsspannung 0–100 */
  private stress = 0;
  private collapses = 0;
  private collapsing = false;
  private tremorT = 0;
  private mode: LaserMode = 'wide';
  private vented = 0;
  private hotRun = false;
  private pockets: Pocket[] = [];
  private crystals: Crystal[] = [];
  private zones: Zone[] = [];
  private craters: { x: number; y: number; r: number }[] = [];
  private burns: { x: number; y: number; t: number }[] = [];
  private astTotal = 0;
  /** Aderpunkte des ersten Asteroiden (Bezug für die Sterne) */
  private total = 0;
  private asteroids = 0;
  private breakT = -1;
  // Zustand
  private mined = 0;
  private lost = 0;
  private time = 0;
  private heat = 0;
  private overheated = false;
  private overheats = 0;
  private rot = 0;
  private spin: number;
  private firing = false;
  private aim: [number, number] = [0, 0];
  private hit: 'vein' | 'rock' | 'space' = 'space';
  private hardHere = 0;
  private streak = 0;
  private offVein = 0;
  private flushes: number;
  private flushesUsed = 0;
  private gotCrystals = 0;
  private pocketHits = 0;
  private pid = -1;
  private chunkAcc = 0;
  private shake = 0;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(120, 11);
  private w = 1;
  private h = 1;
  private cx = 0;
  private cy = 0;
  private R = 100;
  /** Beleuchteter Asteroid (Schichten für wanderndes Sonnenlicht) */
  private art: AstArt | null = null;
  private artJob: Generator<void, void> | null = null;
  private bgCache: HTMLCanvasElement | null = null;
  /** Bruchstücke beim Zerbrechen/Einsturz */
  private frags: Frag[] = [];
  private fragImg: HTMLCanvasElement | null = null;
  private fragRot = 0;
  /** Heller Blitz (Explosion, Zerbrechen) */
  private flash = 0;
  private flashColor = '#ffffff';
  /** Staubkörner im Vordergrund (Tiefe) */
  private motes: { x: number; y: number; z: number; vx: number; vy: number }[] = [];
  /** Aufleuchten der Kernader beim Freilegen */
  private coreFlash = 0;
  private shipAng = 0;
  private done: GameResult | null = null;
  private endT = -1;

  constructor(cfg: GameCfg) {
    this.level = cfg.level;
    this.seed = cfg.seed;
    this.mutator = findMutator(ORE_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 4);
    const r = rng(cfg.seed ^ 0x13);
    this.ware = cfg.ware && WARES[cfg.ware] ? cfg.ware : ['ore', 'ore', 'silicon', 'ice', 'nividium'][Math.floor(r() * 5)];
    this.color = WARES[this.ware]?.color ?? '#e0913d';
    const name = WARES[this.ware]?.name ?? 'Erz';
    this.title = name;
    this.duration = DURATION * (this.mutator?.id === 'rich' ? 0.75 : 1);
    this.spin = [0, 0.1, 0.17, 0.22, 0.28][this.level - 1] * (this.mutator?.id === 'spin' ? 2.2 : 1) + (this.mutator?.id === 'spin' && this.level === 1 ? 0.2 : 0);
    this.flushes = this.level <= 2 ? 2 : 1;
    this.generate(cfg.seed);
    this.total = this.astTotal;
    this.intro = `Ein Asteroid mit reichen ${name}-Adern. Fahre die leuchtenden Adern ab – ohne Absetzen steigt die Kombo. `
      + 'Bohren im Gestein lässt Risse wachsen: Bei voller Spannung stürzt der Asteroid ein und die Restladung ist verloren. '
      + 'Ist die Hälfte abgebaut, liegt die wertvolle Kernader frei. Kristalle nur mit kühlem Laser bergen – am besten fein.'
      + (this.pockets.length ? ' Gastaschen stehen unter Druck, sobald nebenan gebohrt wird; mit feinem, kühlem Laser lassen sie sich gefahrlos ablassen.' : '');
    const pool = ORE_GOALS.filter((g) => this.pockets.length > 0 || (g.id !== 'nopocket' && g.id !== 'vent'));
    this.goals = pickGoals(pool, rng(cfg.seed ^ 0x77));
  }

  /** Neuen Asteroiden erzeugen (auch nach dem Zerbrechen) */
  private generate(seed: number): void {
    const r = rng(seed);
    const L = this.level;
    this.shape = [];
    const ph = [r() * 6, r() * 6, r() * 6];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      this.shape.push(1 + 0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.025 * Math.sin(11 * a + ph[2]));
    }
    this.veins = [];
    const veinCount = (L >= 3 ? 4 : 5) + (this.mutator?.id === 'rich' ? 2 : 0);
    for (let v = 0; v < veinCount; v++) {
      const pts: VeinPt[] = [];
      const a = r() * Math.PI * 2, d = 0.15 + r() * 0.45;
      let x = Math.cos(a) * d, y = Math.sin(a) * d;
      let dir = r() * Math.PI * 2;
      const len = 12 + Math.floor(r() * 8);
      for (let i = 0; i < len; i++) {
        if (Math.hypot(x, y) > 0.8 * this.radiusAt(Math.atan2(y, x))) break;
        pts.push({ x, y, a: 1 });
        dir += (r() - 0.5) * 0.9;
        x += Math.cos(dir) * 0.055;
        y += Math.sin(dir) * 0.055;
      }
      if (pts.length >= 5) this.veins.push(pts);
    }
    this.astTotal = this.veins.reduce((s, v) => s + v.length, 0);
    // Kernader: tief innen, kurz, sehr reich – liegt erst frei, wenn die Hälfte der Deckadern abgebaut ist
    this.core = [];
    {
      const a = r() * Math.PI * 2, d = r() * 0.15;
      let x = Math.cos(a) * d, y = Math.sin(a) * d, dir = r() * Math.PI * 2;
      const len = 7 + Math.floor(r() * 3);
      for (let i = 0; i < len; i++) {
        this.core.push({ x, y, a: 1 });
        dir += (r() - 0.5) * 0.8;
        x += Math.cos(dir) * 0.05;
        y += Math.sin(dir) * 0.05;
        if (Math.hypot(x, y) > 0.45) dir += Math.PI;
      }
    }
    this.coreTotal = this.core.length;
    this.coreOpen = false;
    // Bruchlinien: wachsen mit der Spannung vom Rand nach innen
    this.makeCracks(seed);
    this.stress = 0;
    // Harte Zonen
    this.zones = [];
    const zc = [1, 2, 3, 3, 4][L - 1];
    for (let k = 0; k < zc; k++) {
      const a = r() * Math.PI * 2, d = 0.2 + r() * 0.5;
      this.zones.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.22 + r() * 0.16 });
    }
    // Gastaschen neben Adern
    this.pockets = [];
    const pocketCount = [0, 2, 4, 5, 6][L - 1];
    for (let k = 0; k < pocketCount && this.veins.length; k++) {
      const v = this.veins[k % this.veins.length];
      const p = v[Math.floor(r() * v.length)];
      const a2 = r() * Math.PI * 2;
      this.pockets.push({ x: p.x + Math.cos(a2) * 0.11, y: p.y + Math.sin(a2) * 0.11, alive: true, press: 0, vent: 0 });
    }
    // Kristallnester, gern in harten Zonen
    this.crystals = [];
    const cc = (L === 1 ? 2 : 3) * (this.mutator?.id === 'crystal' ? 2 : 1);
    for (let k = 0; k < cc; k++) {
      const z = this.zones[k % this.zones.length];
      const a2 = r() * Math.PI * 2, d2 = r() * z.r * 0.7;
      this.crystals.push({ x: z.x + Math.cos(a2) * d2, y: z.y + Math.sin(a2) * d2, prog: 0, state: 'ok' });
    }
    this.craters = [];
    for (let k = 0; k < 14; k++) {
      const a2 = r() * Math.PI * 2, d2 = Math.sqrt(r()) * 0.8;
      this.craters.push({ x: Math.cos(a2) * d2, y: Math.sin(a2) * d2, r: 0.04 + r() * 0.1 });
    }
    this.burns = [];
    this.art = null;
    this.artJob = null;
  }

  /**
   * Rissnetz: sechs Hauptrisse vom Rand nach innen, zackig (kurze Stücke, scharfe Knicke), mit Verästelungen
   * in zwei Ebenen. Eigener Zufall, damit der übrige Asteroid gleich bleibt.
   */
  private makeCracks(seed: number): void {
    const r = rng(seed ^ 0xc4ac);
    this.cracks = [];
    const grow = (x: number, y: number, dir: number, o: number, steps: number, w: number, depth: number): void => {
      const pts = [{ x, y, o }];
      for (let i = 0; i < steps; i++) {
        // Zickzack: kleine Schwankung, ab und zu ein scharfer Knick
        dir += (r() - 0.5) * 0.7 + (r() < 0.25 ? (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5) : 0);
        const st = 0.018 + r() * 0.022;
        x += Math.cos(dir) * st;
        y += Math.sin(dir) * st;
        if (Math.hypot(x, y) > this.radiusAt(Math.atan2(y, x)) * 0.97) break;
        o += st;
        pts.push({ x, y, o });
        // Verästelung
        if (depth < 2 && i > 1 && r() < (depth ? 0.12 : 0.2)) {
          const side = r() < 0.5 ? -1 : 1;
          grow(x, y, dir + side * (0.45 + r() * 0.7), o, Math.floor((depth ? 3 : 5) + r() * (depth ? 5 : 9)), w * 0.62, depth + 1);
        }
      }
      if (pts.length > 1) this.cracks.push({ pts, w });
    };
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + r() * 0.8;
      const rr = this.radiusAt(a0) * 0.99;
      grow(Math.cos(a0) * rr, Math.sin(a0) * rr, a0 + Math.PI + (r() - 0.5) * 0.7, 0, 16 + Math.floor(r() * 10), 1, 0);
    }
    this.crackMax = Math.max(0.1, ...this.cracks.map((c) => c.pts[c.pts.length - 1].o));
  }

  private radiusAt(a: number): number {
    const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * 64;
    const i = Math.floor(f), t = f - i;
    return this.shape[i % 64] * (1 - t) + this.shape[(i + 1) % 64] * t;
  }

  private hardness(x: number, y: number): number {
    let h = 0;
    for (const z of this.zones) h = Math.max(h, 1 - Math.hypot(x - z.x, y - z.y) / z.r);
    return clamp(h * 1.6, 0, 1);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    if (!this.motes.length) {
      const r = rng(5);
      for (let k = 0; k < 36; k++) this.motes.push({ x: r() * w, y: r() * h, z: 0.3 + r() * 0.7, vx: -6 - r() * 8, vy: 10 + r() * 14 });
    }
    this.R = Math.min(w * 0.42, (h - TOP - 190) * 0.5);
    this.cx = w / 2;
    this.cy = TOP + 20 + this.R * 1.08;
  }

  private get ship(): [number, number] {
    return [this.w / 2, this.h - 66];
  }

  private get btn(): [number, number, number] { return [this.w - 46, this.h - 60, 26]; }
  private get modeBtn(): [number, number, number] { return [this.w - 108, this.h - 60, 24]; }

  hud(): HudItem[] {
    const left = this.duration - this.time;
    return [
      { label: 'Zeit', value: fmtTime(left), warn: left < 10 },
      { label: 'Ausbeute', value: `${Math.round(this.fraction() * 100)} %` },
      { label: 'Ladung', value: Math.round(Math.max(0, this.mined - this.lost) * UNITS_PER_POINT).toLocaleString('de-DE') },
    ];
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  private fraction(): number {
    return this.total ? Math.max(0, this.mined - this.lost) / this.total : 0;
  }

  /** Weltpunkt → lokale, normierte Asteroidenkoordinaten */
  private toLocal(x: number, y: number): [number, number] {
    const dx = (x - this.cx) / this.R, dy = (y - this.cy) / this.R;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    return [dx * c - dy * s, dx * s + dy * c];
  }

  private toWorld(x: number, y: number): [number, number] {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.cx + (x * c - y * s) * this.R, this.cy + (x * s + y * c) * this.R];
  }

  /** Für Tests: Ziel auf den ersten noch vollen Aderpunkt (Bildschirmkoordinaten des Fingers) */
  debugVeinTouch(): [number, number] | null {
    const all = this.coreOpen ? [...this.veins, this.core] : this.veins;
    for (const v of all) for (const p of v) if (p.a > 0.5) { const [x, y] = this.toWorld(p.x, p.y); return [x, y + AIM_OFFSET]; }
    for (const v of all) for (const p of v) if (p.a > 0.05) { const [x, y] = this.toWorld(p.x, p.y); return [x, y + AIM_OFFSET]; }
    return null;
  }

  /** Für Tests: Fingerposition für einen lokalen Asteroidenpunkt */
  debugTouchAt(lx: number, ly: number): [number, number] {
    const [x, y] = this.toWorld(lx, ly);
    return [x, y + AIM_OFFSET];
  }

  pointerDown(id: number, x: number, y: number): void {
    const [bx, by, br] = this.btn;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.flush(); return; }
    const [mx, my, mr] = this.modeBtn;
    if (Math.hypot(x - mx, y - my) < mr + 8) { this.toggleMode(); return; }
    if (this.pid >= 0) return;
    this.pid = id;
    this.firing = true;
    this.aim = [x, y - AIM_OFFSET];
  }

  pointerMove(id: number, x: number, y: number): void {
    if (id === this.pid) this.aim = [x, y - AIM_OFFSET];
  }

  pointerUp(id: number): void {
    if (id !== this.pid) return;
    this.pid = -1;
    this.firing = false;
    this.endStreak();
  }

  /** Kühlspülung: sofort kalt */
  flush(): void {
    if (this.flushes <= 0 || this.endT >= 0) return;
    this.flushes--;
    this.flushesUsed++;
    this.heat = 0;
    this.overheated = false;
    const [sx, sy] = this.ship;
    for (let k = 0; k < 24; k++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; this.fx.add({ x: sx, y: sy, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, color: '#bfefff', size: 2.4, max: 0.7 }); }
    sfx.open();
  }

  /** Laser umschalten: breit ↔ fein */
  toggleMode(): void {
    if (this.endT >= 0) return;
    this.mode = this.mode === 'wide' ? 'fine' : 'wide';
    const [mx, my] = this.modeBtn;
    this.floats.add(mx, my - 34, `Laser ${MODES[this.mode].name}`, '#ffd27a', 13);
    sfx.open();
  }

  private endStreak(): void {
    this.streak = 0;
    this.score.reset();
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 0.6);
    for (const m of this.motes) {
      m.x += m.vx * m.z * dt;
      m.y += m.vy * m.z * dt;
      if (m.x < -10) m.x += this.w + 20;
      if (m.x > this.w + 10) m.x -= this.w + 20;
      if (m.y > this.h + 10) m.y -= this.h + 20;
    }
    for (const f of this.frags) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.vr * dt; }
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 1.2 && !this.fx.list.some((p) => p.tx != null)) this.done = this.finish();
      return;
    }
    this.time += dt;
    this.rot += this.spin * dt;
    for (const b of this.burns) b.t += dt;
    if (this.breakT >= 0) {
      // Zerbrechen bzw. Einsturz: kurze Pause, dann der nächste Asteroid
      this.breakT += dt;
      // Bild des nächsten Asteroiden noch in Arbeit: mit dem Einschweben warten
      const from = this.collapsing ? 1.35 : 0.6;
      if (this.artJob && this.breakT > from) this.breakT = from;
      if (this.breakT > (this.collapsing ? 2 : 1.1)) {
        this.breakT = -1;
        this.collapsing = false;
        this.frags = [];
        this.fragImg = null;
        // Finger noch auf dem Schirm: gleich weiterbohren
        this.firing = this.pid >= 0;
      }
      this.cool(dt);
      if (this.time >= this.duration) this.endT = 0;
      return;
    }
    const m = MODES[this.mode];
    const active = this.firing && !this.overheated;
    const brittle = this.mutator?.id === 'brittle' ? 2 : 1;
    this.hit = 'space';
    this.hotRun = false;
    let lx = 0, ly = 0;
    if (active) {
      [lx, ly] = this.toLocal(...this.aim);
      const inside = Math.hypot(lx, ly) <= this.radiusAt(Math.atan2(ly, lx));
      this.hardHere = inside ? this.hardness(lx, ly) : 0;
      if (inside) {
        this.hit = 'rock';
        this.hotRun = this.heat >= HOT_RUN;
        const take1 = (v: VeinPt[]): number => {
          let took = 0;
          for (const p of v) {
            if (p.a <= 0) continue;
            const d = Math.hypot(p.x - lx, p.y - ly);
            if (d >= m.rr) continue;
            const take = Math.min(p.a, m.rate * dt * (1 - d / m.rr) * (1 - this.hardHere * 0.35));
            p.a -= take;
            took += take;
          }
          return took;
        };
        let took = 0;
        for (const v of this.veins) took += take1(v);
        const coreTook = this.coreOpen ? take1(this.core) : 0;
        if (took + coreTook > 0.002) this.hit = 'vein';
        const value = took + coreTook * CORE_VALUE;
        this.mined += value;
        this.chunkAcc += value;
        const [hx, hy] = this.aim;
        if (this.hit === 'vein') {
          this.streak += dt;
          this.offVein = 0;
          const c = Math.min(4, 1 + Math.floor(this.streak / 1.2) * 0.5);
          if (c > this.score.combo) { this.score.combo = c; this.score.maxCombo = Math.max(this.score.maxCombo, c); this.floats.add(hx, hy - 20, `×${String(c).replace('.', ',')}`, '#ffd27a', 15); }
          this.score.add(value * 120 * (this.hotRun ? 1.5 : 1));
          while (this.chunkAcc >= 0.12) {
            this.chunkAcc -= 0.12;
            const [sx, sy] = this.ship;
            const a = Math.random() * Math.PI * 2;
            this.fx.add({ x: hx, y: hy, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, color: coreTook > took ? '#fff0b0' : this.color, size: 2.2 + Math.random() * 1.6, kind: 'chunk', max: 3, vr: (Math.random() - 0.5) * 12, tx: sx, ty: sy - 10 });
          }
          if (Math.random() < dt * 30) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, color: '#fff2c8', size: 1.6, kind: 'spark', max: 0.25 });
          // auch die Ader selbst belastet das Gestein ein wenig
          this.stress += m.stress * 0.12 * brittle * dt;
        } else {
          this.offVein += dt;
          if (this.offVein > 0.3 && this.streak > 0) this.endStreak();
          if (Math.random() < dt * 22) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, color: this.hardHere > 0.3 ? '#6a625a' : '#8a8580', size: 1.6 + Math.random(), kind: 'chunk', max: 0.6, vr: (Math.random() - 0.5) * 10 });
          if (Math.random() < dt * (30 + this.hardHere * 40)) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, color: '#ffb070', size: 1.4, kind: 'spark', max: 0.2 });
          const last = this.burns[this.burns.length - 1];
          if (!last || Math.hypot(last.x - lx, last.y - ly) > 0.02) {
            this.burns.push({ x: lx, y: ly, t: 0 });
            if (this.burns.length > 260) this.burns.shift();
          }
          // Gestein reißt: Spannung steigt, im harten Gestein deutlich mehr
          this.stress += m.stress * (1 + this.hardHere * 1.5) * brittle * dt;
        }
        this.mineCrystals(lx, ly, dt);
        this.pocketsUnderLaser(lx, ly, dt);
      }
      const heatRate = this.hit === 'vein' ? m.heatVein * (1 + this.hardHere * 0.8) : this.hit === 'rock' ? m.heatRock + this.hardHere * m.heatRock * 1.4 : 8;
      this.heat += heatRate * dt;
      if (this.heat >= 100) {
        this.heat = 100;
        this.overheated = true;
        this.overheats++;
        this.endStreak();
        sfx.warn();
        buzz(30);
      }
    } else this.cool(dt);
    // Überhitzt: Dampf am Emitter
    if (this.overheated && Math.random() < dt * 18) {
      const [sx, sy] = this.ship;
      this.fx.add({ x: sx + (Math.random() - 0.5) * 16, y: sy - 30, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, color: '#9aaab2', size: 3 + Math.random() * 3, kind: 'dot', max: 0.9, drag: 1, solid: true, alpha: 0.35 });
    }
    // Druck in den Gastaschen baut sich langsam ab; volle Taschen explodieren von selbst
    for (const p of this.pockets) {
      if (!p.alive) continue;
      if (p.press >= 1) { this.explode(p); continue; }
      p.press = Math.max(0, p.press - 0.07 * dt);
    }
    // Gesteinsspannung: entspannt sich, wenn nicht gebohrt wird
    this.stress = Math.max(0, this.stress - (active && this.hit !== 'space' ? 0.6 : 3.5) * dt);
    if (this.stress >= 75) {
      this.tremorT -= dt;
      this.shake = Math.max(this.shake, 0.08 + (this.stress - 75) / 250);
      if (this.tremorT <= 0) { this.tremorT = 1.4; sfx.warn(); buzz(15); this.floats.add(this.cx, this.cy - this.R - 6, 'Risse! Gestein entlasten', '#ffb547', 13); }
      // Staub rieselt aus den Rissen
      if (Math.random() < dt * (this.stress - 70) * 0.6) {
        const lim = this.crackMax * clamp((this.stress - 20) / 80, 0, 1);
        const c = this.cracks[Math.floor(Math.random() * this.cracks.length)].pts.filter((p) => p.o <= lim);
        const q = c[Math.floor(Math.random() * c.length)] ?? { x: 0, y: 0 };
        const [x, y] = this.toWorld(q.x, q.y);
        this.fx.add({ x, y, vx: (Math.random() - 0.5) * 30, vy: 15 + Math.random() * 25, color: '#8a7a68', size: 2 + Math.random() * 3, kind: 'dot', max: 1.2, drag: 0.5, solid: true, alpha: 0.6 });
      }
    } else this.tremorT = 0;
    if (this.stress >= 100) { this.collapse(); return; }
    // Kernader freilegen
    const leftNormal = this.veins.reduce((s, v) => s + v.reduce((q, p) => q + Math.max(0, p.a), 0), 0);
    if (!this.coreOpen && leftNormal < this.astTotal * 0.5) {
      this.coreOpen = true;
      this.floats.add(this.cx, this.cy - 20, 'Kernader frei!', '#fff0b0', 18);
      const [wx, wy] = this.toWorld(this.core[0].x, this.core[0].y);
      this.fx.add({ x: wx, y: wy, color: '#fff0b0', size: 12, kind: 'ring', max: 0.8 });
      this.fx.add({ x: wx, y: wy, color: '#ffe08a', size: 26, kind: 'ring', max: 1.2 });
      this.fx.burst(wx, wy, '#fff0b0', 30, 260, 2, 'spark', 0.7);
      this.coreFlash = 1;
      this.flash = 0.35;
      this.flashColor = '#fff0b0';
      sfx.coin();
    }
    const leftCore = this.core.reduce((q, p) => q + Math.max(0, p.a), 0);
    if (this.coreOpen && this.coreTotal && leftCore < this.coreTotal * 0.15 && !this.core.every((p) => p.a < -1)) {
      // Kernader ausgebeutet (einmal zählen: Punkte auf −2 setzen)
      this.coresDone++;
      for (const p of this.core) p.a = -2;
      const p = this.score.add(500);
      this.floats.add(this.cx, this.cy - 30, `Kernader ausgebeutet +${p}`, '#fff0b0', 16);
      sfx.build();
    }
    // Ausgebeutet (Deckadern und Kern): Asteroid zerbricht
    if (leftNormal < this.astTotal * 0.08 && this.core.every((p) => p.a < -1)) this.breakAsteroid();
    setGoal(this.goals, 'cool', this.overheats === 0);
    setGoal(this.goals, 'combo3', this.score.maxCombo >= 3);
    setGoal(this.goals, 'crystal2', this.gotCrystals >= 2);
    setGoal(this.goals, 'break', this.asteroids >= 1);
    setGoal(this.goals, 'nopocket', this.pocketHits === 0);
    setGoal(this.goals, 'noflush', this.flushesUsed === 0);
    setGoal(this.goals, 'core', this.coresDone >= 1);
    setGoal(this.goals, 'vent', this.vented >= 1);
    setGoal(this.goals, 'stable', this.collapses === 0);
    if (this.time >= this.duration) {
      this.endT = 0;
      this.firing = false;
    }
  }

  private cool(dt: number): void {
    const k = this.mutator?.id === 'hot' ? 0.5 : 1;
    this.heat = Math.max(0, this.heat - (this.overheated ? 38 : 30) * k * dt);
    if (this.overheated && this.heat <= 30) this.overheated = false;
  }

  /** Gastaschen unter und neben dem Laser: direkt getroffen ablassen (fein, kühl) oder explodieren; daneben steigt der Druck */
  private pocketsUnderLaser(lx: number, ly: number, dt: number): void {
    const m = MODES[this.mode];
    for (const p of this.pockets) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - lx, p.y - ly);
      if (d <= 0.075) {
        if (this.mode === 'fine' && this.heat < 60) {
          // kontrolliert ablassen
          p.vent += dt / 0.8;
          p.press = Math.max(0, p.press - dt);
          const [px, py] = this.toWorld(p.x, p.y);
          if (Math.random() < dt * 25) this.fx.add({ x: px, y: py, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60, color: '#ffb0a0', size: 2.4, max: 0.6 });
          if (p.vent >= 1) {
            p.alive = false;
            this.vented++;
            const pts = this.score.add(150);
            this.floats.add(px, py - 12, `Abgelassen +${pts}`, '#7fd8ff', 14);
            this.fx.add({ x: px, y: py, color: '#7fd8ff', size: 8, kind: 'ring', max: 0.5 });
            sfx.open();
          }
        } else this.explode(p);
      } else if (d <= 0.2) {
        // Bohren in der Nähe setzt die Tasche unter Druck (Hitze verstärkt)
        p.press += m.press * (1 - d / 0.2) * (0.6 + this.heat / 100) * dt;
      }
    }
  }

  private explode(p: Pocket): void {
    if (!p.alive) return;
    p.alive = false;
    this.pocketHits++;
    const [px, py] = this.toWorld(p.x, p.y);
    this.fx.burst(px, py, '#ff6a4a', 26, 300, 2.6, 'chunk', 0.9);
    this.fx.burst(px, py, '#ffd0a0', 18, 380, 1.6, 'spark', 0.4);
    this.fx.add({ x: px, y: py, color: '#ff8a5c', size: 10, kind: 'ring', max: 0.5 });
    this.heat = Math.min(100, this.heat + 45);
    this.lost += Math.min(this.mined - this.lost, this.total * 0.05);
    this.score.points = Math.max(0, this.score.points - 200);
    this.floats.add(px, py - 10, '−200', '#ff9aa4', 15);
    // Druckwelle: zerstört nahe Aderstücke, erschüttert das Gestein, setzt Nachbartaschen unter Druck
    for (const v of [...this.veins, ...(this.coreOpen ? [this.core] : [])]) for (const q of v) {
      if (q.a > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 0.13) q.a *= 0.4;
    }
    this.stress += 22;
    this.flash = Math.max(this.flash, 0.45);
    this.flashColor = '#ff8a5c';
    this.fx.add({ x: px, y: py, color: '#ffd0a0', size: 22, kind: 'ring', max: 0.7 });
    for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60; this.fx.add({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: '#3a2c24', size: 6 + Math.random() * 7, kind: 'dot', max: 1.4 + Math.random(), drag: 0.8, solid: true, alpha: 0.45 }); }
    for (const o of this.pockets) if (o.alive && Math.hypot(o.x - p.x, o.y - p.y) < 0.32) o.press += 0.6;
    this.endStreak();
    this.shake = 0.45;
    sfx.warn();
    buzz(60);
  }

  private mineCrystals(lx: number, ly: number, dt: number): void {
    const fine = this.mode === 'fine';
    for (const c of this.crystals) {
      if (c.state !== 'ok' || Math.hypot(c.x - lx, c.y - ly) > 0.07) continue;
      const [px, py] = this.toWorld(c.x, c.y);
      if (this.heat >= (fine ? 55 : 40)) {
        // zu heiß: Kristall zerspringt
        c.state = 'broken';
        this.fx.burst(px, py, '#9ff3ff', 18, 220, 1.8, 'chunk', 0.7);
        this.floats.add(px, py - 14, 'Zersprungen', '#9ff3ff', 13);
        sfx.warn();
        continue;
      }
      c.prog += dt * (fine ? 1.4 : 0.6);
      if (Math.random() < dt * 20) this.fx.add({ x: px, y: py, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, color: '#9ff3ff', size: 1.4, kind: 'spark', max: 0.3 });
      if (c.prog >= 1) {
        c.state = 'got';
        this.gotCrystals++;
        const p = this.score.add(400);
        this.floats.add(px, py - 14, `Kristall +${p}`, '#9ff3ff', 16);
        const [sx, sy] = this.ship;
        for (let k = 0; k < 8; k++) this.fx.add({ x: px, y: py, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, color: '#9ff3ff', size: 2.6, kind: 'chunk', max: 3, tx: sx, ty: sy - 10 });
        sfx.coin();
      }
    }
  }

  private breakAsteroid(): void {
    this.asteroids++;
    this.breakT = 0;
    this.firing = false;
    const p = this.score.add(800);
    this.floats.add(this.cx, this.cy, `Zerlegt! +${p}`, '#ffd27a', 20);
    this.shatter(false);
    this.flash = 0.6;
    this.flashColor = '#ffe6c0';
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * this.R;
      this.fx.add({ x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d, vx: Math.cos(a) * (120 + Math.random() * 200), vy: Math.sin(a) * (120 + Math.random() * 200), color: k % 3 ? (k % 2 ? '#4a4038' : '#6a5e52') : this.color, size: 2 + Math.random() * 4, kind: 'chunk', max: 1.2, vr: (Math.random() - 0.5) * 8, solid: k % 3 !== 0 });
    }
    this.shake = 0.5;
    sfx.build();
    buzz(80);
  }

  /** Asteroid in Bruchstücke zerlegen (Bild des alten Asteroiden) und den nächsten schon erzeugen */
  private shatter(collapse: boolean): void {
    this.fragImg = this.art?.comp ?? null;
    this.fragRot = this.rot;
    this.frags = [];
    const r = rng(this.seed ^ (this.asteroids * 977 + this.collapses * 131));
    const n = collapse ? 11 : 8;
    const cuts: number[] = [];
    for (let k = 0; k < n; k++) cuts.push((k + 0.2 + r() * 0.6) / n * Math.PI * 2);
    const ox = (r() - 0.5) * 0.2, oy = (r() - 0.5) * 0.2;
    // gezackte Bruchkante je Schnitt – beide Nachbarstücke teilen sie
    const jag = (a: number): [number, number][] => {
      const out: [number, number][] = [];
      let d = 0;
      for (let f = 0.05; f < 0.92; f += 0.025 + r() * 0.03) {
        // Zickzack mit gelegentlichen scharfen Knicken
        d = clamp(d + (r() - 0.5) * 0.16 + (r() < 0.25 ? (r() < 0.5 ? -0.1 : 0.1) : 0), -0.16, 0.16);
        out.push([Math.cos(a + d) * f, Math.sin(a + d) * f]);
      }
      return out;
    };
    const edges = cuts.map(jag);
    for (let k = 0; k < n; k++) {
      const a0 = cuts[k], a1 = cuts[(k + 1) % n] + (k === n - 1 ? Math.PI * 2 : 0);
      const pts: [number, number][] = [[ox, oy]];
      const j0 = edges[k], j1 = edges[(k + 1) % n].slice().reverse();
      pts.push(...j0);
      const rim0 = pts.length;
      for (let s = 0; s <= 6; s++) { const a = a0 + (a1 - a0) * (s / 6); const rr = this.radiusAt(a) * 1.04; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      const rim1 = pts.length - 1;
      pts.push(...j1);
      const mid = (a0 + a1) / 2 + this.rot;
      const v = collapse ? 25 + r() * 40 : 90 + r() * 140;
      this.frags.push({ pts, rim: [rim0, rim1], x: 0, y: 0, vx: Math.cos(mid) * v, vy: Math.sin(mid) * v + (collapse ? 30 : 0), a: 0, vr: (r() - 0.5) * (collapse ? 0.8 : 2.4), t: 0, slow: collapse });
    }
    this.generate(this.seed + 101 * (this.asteroids + this.collapses + 1));
  }

  /** Einsturz: Gestein gibt nach, die restlichen Adern sind verschüttet; ein Teil der Ladung geht verloren */
  private collapse(): void {
    this.collapses++;
    this.collapsing = true;
    this.breakT = 0;
    this.firing = false;
    this.stress = 0;
    this.endStreak();
    this.lost += Math.min(this.mined - this.lost, this.total * 0.08);
    this.score.points = Math.max(0, this.score.points - 400);
    this.floats.add(this.cx, this.cy, 'Einsturz! −400', '#ff9aa4', 20);
    this.shatter(true);
    this.flash = 0.4;
    this.flashColor = '#ff8a4a';
    for (let k = 0; k < 90; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * this.R;
      this.fx.add({ x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d, vx: Math.cos(a) * (40 + Math.random() * 120), vy: Math.sin(a) * (40 + Math.random() * 120) + 40, color: k % 4 ? (k % 2 ? '#3e352e' : '#5a4e44') : '#ff8a4a', size: 2 + Math.random() * 5, kind: 'chunk', max: 1.6, vr: (Math.random() - 0.5) * 6, solid: k % 4 !== 0 });
    }
    this.shake = 0.9;
    sfx.warn();
    buzz(120);
  }

  private finish(): GameResult {
    const f = this.fraction();
    const stars = starsFor(f, 0.5, 1, 1.6);
    return {
      success: stars > 0,
      stars,
      score: Math.round(f * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: this.asteroids ? `${this.asteroids + 1}. Asteroid angebohrt` : this.collapses && !stars ? 'Eingestürzt' : stars === 3 ? 'Ader ausgebeutet' : stars > 0 ? 'Gute Ausbeute' : 'Zu wenig abgebaut',
      lines: [
        ['Ausbeute', `${Math.round(f * 100)} %`],
        [WARES[this.ware]?.name ?? 'Erz', `${Math.round(Math.max(0, this.mined - this.lost) * UNITS_PER_POINT).toLocaleString('de-DE')} Einheiten`],
        ['Kristalle', `${this.gotCrystals}`],
        ...(this.coresDone ? [['Kernadern', `${this.coresDone}`] as [string, string]] : []),
        ...(this.vented ? [['Gastaschen abgelassen', `${this.vented}`] as [string, string]] : []),
        ...(this.collapses ? [['Einstürze', `${this.collapses}`] as [string, string]] : []),
        ['Beste Kombo', `×${String(this.score.maxCombo).replace('.', ',')}`],
        ...(this.asteroids ? [['Asteroiden zerlegt', `${this.asteroids}`] as [string, string]] : []),
      ],
    };
  }

  result(): GameResult | null {
    return this.done;
  }

  abort(): GameResult {
    const r = this.finish();
    r.success = false;
    r.stars = 0;
    for (const g of r.goals) g.done = false;
    r.headline = 'Abgebrochen';
    return r;
  }

  // ---------- Darstellung ----------

  /**
   * Asteroid Bildpunkt für Bildpunkt berechnen: Höhenfeld (Kugel, Rauschen, Krater mit Wall) → Normalen →
   * Umgebungslicht und vier gerichtete Lichtschichten. Beim Drehen werden die Schichten passend zum festen
   * Sonnenstand gemischt – das Licht bleibt links oben, auch wenn sich der Asteroid dreht.
   */
  private *buildArt(): Generator<void, void> {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const R = this.R;
    const S = Math.ceil(R * 2.3 * dpr);
    const half = S / 2;
    const unit = 1 / (R * dpr);
    const N = perlin((this.seed ^ (this.asteroids * 7919 + this.collapses * 104729)) >>> 0);
    const G = perlin((this.seed * 31 + 7) >>> 0);
    const [dark, light, hard] = ROCK[this.ware] ?? ROCK.ore;
    const H = new Float32Array(S * S);
    const E = new Float32Array(S * S);
    const A = new Float32Array(S * S * 3);
    const O = new Float32Array(S * S);
    const inside = new Uint8Array(S * S);
    // Grobe Felder (Rauschen, Krater, Farbe) auf einem Raster alle C Bildpunkte – sie ändern sich langsam;
    // fein (je Bildpunkt) nur Umriss, Kugelform und Körnung. Spart den Großteil der Rechenzeit.
    const C = dpr >= 2.5 ? 4 : dpr >= 1.5 ? 3 : 2;
    const GS = Math.ceil(S / C) + 2;
    const CH = new Float32Array(GS * GS), CO = new Float32Array(GS * GS), CG = new Float32Array(GS * GS), CA = new Float32Array(GS * GS * 3);
    for (let gy = 0; gy < GS; gy++) {
      if (gy % 24 === 23) yield;
      const y = (gy * C + 0.5 - half) * unit;
      for (let gx = 0; gx < GS; gx++) {
        const x = (gx * C + 0.5 - half) * unit;
        if (x * x + y * y > 1.5625) continue;
        const gi = gy * GS + gx;
        const big = fbm(N, x * 2.1, y * 2.1, 5);
        CG[gi] = G(x * 38, y * 38) * 0.6;
        let h = (big - 0.5) * 0.3;
        let ao = 1;
        for (const c of this.craters) {
          const ex = x - c.x, ey = y - c.y, lim = 1.8 * c.r;
          if (ex * ex + ey * ey > lim * lim) continue;
          const dd = Math.sqrt(ex * ex + ey * ey) / c.r;
          // Schüssel mit weichem Wall (stetig, keine harte Kante)
          const bowl = dd < 1 ? (1 - dd * dd) ** 2 : 0;
          const rim = Math.exp(-(((dd - 1) / 0.28) ** 2));
          h += c.r * (rim * 0.16 - bowl * 0.5);
          ao -= bowl * 0.28;
        }
        CH[gi] = h;
        CO[gi] = clamp(ao * (0.82 + (big - 0.5) * 0.9), 0.3, 1.05);
        // Grundfarbe: dunkles und helles Gestein, harte Zonen kühl und gerieft
        const m = clamp((fbm(N, x * 1.2 + 7.3, y * 1.2 - 2.1, 3) - 0.3) * 1.8, 0, 1);
        let r = dark[0] + (light[0] - dark[0]) * m, g = dark[1] + (light[1] - dark[1]) * m, b = dark[2] + (light[2] - dark[2]) * m;
        const hz = this.hardness(x, y);
        if (hz > 0) {
          const st = 0.7 + 0.3 * Math.sin((x * 0.7 + y * 0.7) * 95 + big * 9);
          r += (hard[0] * st - r) * hz; g += (hard[1] * st - g) * hz; b += (hard[2] * st - b) * hz;
        }
        CA[gi * 3] = r; CA[gi * 3 + 1] = g; CA[gi * 3 + 2] = b;
      }
    }
    for (let py = 0; py < S; py++) {
      if (py % 48 === 47) yield;
      const y = (py + 0.5 - half) * unit;
      const fy = py / C, gy = Math.floor(fy), ty = fy - gy;
      for (let px = 0; px < S; px++) {
        const x = (px + 0.5 - half) * unit;
        const d2 = x * x + y * y;
        if (d2 > 1.44) continue;
        const d = Math.sqrt(d2);
        const rad = this.radiusAt(Math.atan2(y, x));
        const e = (rad - d) / unit + 0.5;
        if (e <= -1.5) continue;
        const i = py * S + px;
        inside[i] = 1;
        E[i] = clamp(e, 0, 1);
        const fx = px / C, gx = Math.floor(fx), tx = fx - gx;
        const g00 = gy * GS + gx, g10 = g00 + 1, g01 = g00 + GS, g11 = g01 + 1;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const q = Math.min(1, d / rad);
        const grain = CG[g00] * w00 + CG[g10] * w10 + CG[g01] * w01 + CG[g11] * w11 + G(x * 95 + 3, y * 95) * 0.35;
        H[i] = Math.sqrt(Math.max(0, 1 - q * q)) * 0.9 + CH[g00] * w00 + CH[g10] * w10 + CH[g01] * w01 + CH[g11] * w11 + grain * 0.004;
        O[i] = CO[g00] * w00 + CO[g10] * w10 + CO[g01] * w01 + CO[g11] * w11;
        // einzelne helle Körner
        const sp = grain > 0.42 ? 1.35 : 1 + grain * 0.12;
        for (let k = 0; k < 3; k++) A[i * 3 + k] = (CA[g00 * 3 + k] * w00 + CA[g10 * 3 + k] * w10 + CA[g01 * 3 + k] * w01 + CA[g11 * 3 + k] * w11) * sp;
      }
    }
    const amb = new ImageData(S, S), mask = new ImageData(S, S);
    const dirs = [0, 1, 2, 3].map(() => new ImageData(S, S));
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], LZ = 0.6, LN = 1 / Math.hypot(1, LZ);
    for (let py = 1; py < S - 1; py++) {
      if (py % 64 === 63) yield;
      for (let px = 1; px < S - 1; px++) {
        const i = py * S + px;
        if (!inside[i]) continue;
        const hx = (H[i + 1] - H[i - 1]) / (2 * unit), hy = (H[i + S] - H[i - S]) / (2 * unit);
        const l = Math.sqrt(hx * hx + hy * hy + 1);
        const nx = -hx / l, ny = -hy / l, nz = 1 / l;
        const o = O[i], j = i * 4;
        const ar = A[i * 3], ag = A[i * 3 + 1], ab = A[i * 3 + 2];
        const k0 = (0.07 + 0.08 * nz) * o;
        amb.data[j] = ar * k0 * 0.8; amb.data[j + 1] = ag * k0 * 0.9; amb.data[j + 2] = ab * k0 * 1.1; amb.data[j + 3] = 255;
        for (let k = 0; k < 4; k++) {
          const dot = Math.max(0, (nx * DX[k] + ny * DY[k] + nz * LZ) * LN);
          const lit = dot * (0.85 + 0.15 * dot) * 1.25 * (0.55 + 0.45 * o);
          const dd = dirs[k].data;
          dd[j] = ar * lit * 1.08; dd[j + 1] = ag * lit * 0.95; dd[j + 2] = ab * lit * 0.8; dd[j + 3] = 255;
        }
        mask.data[j + 3] = E[i] * 255;
      }
    }
    const put = (img: ImageData): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      c.getContext('2d')!.putImageData(img, 0, 0);
      return c;
    };
    const comp = document.createElement('canvas');
    comp.width = comp.height = S;
    const path = new Path2D();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2, r = this.shape[k % 64] * R;
      k ? path.lineTo(Math.cos(a) * r, Math.sin(a) * r) : path.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.art = { R, dpr, ambient: put(amb), dirs: dirs.map(put), mask: put(mask), comp, light: -1, path };
  }

  /** Asteroidenbild weiterrechnen: höchstens `budget` ms (Infinity: fertig rechnen) */
  private pumpArt(budget: number): void {
    if ((!this.art && !this.artJob) || (this.art && this.art.R !== this.R)) this.artJob = this.buildArt();
    const t0 = performance.now();
    while (this.artJob) {
      if (this.artJob.next().done) this.artJob = null;
      else if (performance.now() - t0 > budget) break;
    }
  }

  /** Lichtschichten passend zum Sonnenstand mischen (nur wenn sich der Winkel geändert hat) */
  private composeArt(): void {
    const a = this.art;
    if (!a) return;
    const TAU = Math.PI * 2;
    const phi = (((SUN_ANGLE - this.rot) % TAU) + TAU) % TAU;
    if (a.light >= 0 && Math.abs(phi - a.light) < 0.015) return;
    a.light = phi;
    const g = a.comp.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, a.comp.width, a.comp.height);
    g.drawImage(a.ambient, 0, 0);
    g.globalCompositeOperation = 'lighter';
    const q = phi / (Math.PI / 2), k = Math.floor(q) % 4, f = q - Math.floor(q);
    g.globalAlpha = Math.cos((f * Math.PI) / 2);
    g.drawImage(a.dirs[k], 0, 0);
    g.globalAlpha = Math.sin((f * Math.PI) / 2);
    g.drawImage(a.dirs[(k + 1) % 4], 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(a.mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.drawBackground(ctx);
    // Erster Asteroid sofort, spätere stückweise während des Zerbrechens (kein Ruckeln)
    this.pumpArt(this.breakT < 0 ? Infinity : 8);
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    const R = this.R;
    if (this.breakT < 0) {
      this.composeArt();
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot);
      this.drawShadowHalo(ctx);
      ctx.drawImage(this.art!.comp, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      this.drawVeinBeds(ctx);
      this.drawBurns(ctx);
      this.drawCracks(ctx, t);
      this.drawVeins(ctx, t);
      this.drawCore(ctx, t);
      this.drawCrystals(ctx, t);
      this.drawPockets(ctx, t);
      ctx.restore();
    } else {
      this.drawFrags(ctx);
      const from = this.collapsing ? 1.35 : 0.6, len = this.collapsing ? 0.65 : 0.5;
      if (this.breakT > from && this.art) {
        // neuer Asteroid schwebt ein
        const a = clamp((this.breakT - from) / len, 0, 1);
        this.composeArt();
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(this.cx, this.cy);
        ctx.scale(0.6 + 0.4 * a, 0.6 + 0.4 * a);
        ctx.rotate(this.rot);
        ctx.drawImage(this.art!.comp, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
        ctx.restore();
      }
    }
    this.drawShipAndLaser(ctx, t);
    this.fx.draw(ctx);
    this.drawMotes(ctx);
    this.floats.draw(ctx);
    ctx.restore();
    if (this.flash > 0 && !document.documentElement.classList.contains('calm')) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(this.flashColor, this.flash * 0.3);
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    this.drawHeat(ctx, t);
    const [bx, by, br] = this.btn;
    drawButton(ctx, bx, by, br, this.flushes > 0 ? 1 : 0, '#7fd8ff', 'K', t, this.flushes);
    const [mx, my, mr] = this.modeBtn;
    drawButton(ctx, mx, my, mr, 1, this.mode === 'fine' ? '#9ff3ff' : '#ffb547', this.mode === 'fine' ? 'F' : 'B', t);
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(169,195,198,0.85)';
    ctx.fillText(`LASER ${MODES[this.mode].name.toUpperCase()}`, mx, my + mr + 14);
  }

  /** Hintergrundbild (Sonne links oben), abgedunkelt, mit leichter Drift und Vignette */
  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const img = background();
    if (!img) { this.stars.draw(ctx, 0, '#ffe6c8'); return; }
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const W = Math.round(this.w * dpr), Hh = Math.round(this.h * dpr);
    if (!this.bgCache || this.bgCache.width !== W || this.bgCache.height !== Hh) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = Hh;
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      this.paintBackground(g, img);
      this.bgCache = c;
    }
    ctx.drawImage(this.bgCache, 0, 0, this.w, this.h);
  }

  private paintBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
    const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    const ox = (this.w - iw) / 2, oy = (this.h - ih) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ox, oy, iw, ih);
    ctx.fillStyle = 'rgba(2,5,10,0.52)';
    ctx.fillRect(0, 0, this.w, this.h);
    const v = ctx.createRadialGradient(this.cx, this.cy, this.R * 0.9, this.cx, this.cy, Math.max(this.w, this.h) * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  private drawMotes(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const m of this.motes) {
      ctx.fillStyle = rgba('#ffe6c8', 0.08 + 0.22 * m.z);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 0.5 + 1.4 * m.z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Weicher Schatten hinter dem Asteroiden (hebt ihn vom Hintergrund ab) */
  private drawShadowHalo(ctx: CanvasRenderingContext2D): void {
    const R = this.R;
    const g = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.3);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Bruchstücke fliegen auseinander (Zerbrechen) bzw. sacken in sich zusammen (Einsturz) */
  private drawFrags(ctx: CanvasRenderingContext2D): void {
    const img = this.fragImg;
    if (!img) return;
    const R = this.R;
    for (const f of this.frags) {
      const life = f.slow ? 1.6 : 1.1;
      const k = f.t / life;
      if (k >= 1) continue;
      ctx.save();
      ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      ctx.translate(this.cx + f.x, this.cy + f.y);
      ctx.rotate(this.fragRot + f.a);
      if (f.slow) ctx.scale(1 - 0.3 * k, 1 - 0.3 * k);
      const p = new Path2D();
      f.pts.forEach(([x, y], i) => (i ? p.lineTo(x * R, y * R) : p.moveTo(x * R, y * R)));
      p.closePath();
      ctx.save();
      ctx.clip(p);
      ctx.drawImage(img, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      ctx.restore();
      // glühende Bruchkanten (nur innen, nicht am Außenrand)
      const edge = new Path2D();
      ctx.miterLimit = 3;
      const [r0, r1] = f.rim;
      for (let i = r1; i < f.pts.length + r0 + 1; i++) {
        const [x, y] = f.pts[i % f.pts.length];
        i === r1 ? edge.moveTo(x * R, y * R) : edge.lineTo(x * R, y * R);
      }
      const hot = Math.max(0, 1 - k * 1.6);
      if (hot > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(f.slow ? '#ff5a2a' : '#ff9a40', 0.3 * hot);
        ctx.lineWidth = 2.5;
        ctx.stroke(edge);
        ctx.strokeStyle = rgba('#ffe0a0', 0.85 * hot);
        ctx.lineWidth = 0.7;
        ctx.stroke(edge);
      }
      ctx.restore();
    }
  }

  /** Aderbett: Erz färbt das Gestein; abgebaute Stellen bleiben als dunkle Rinne zurück */
  private drawVeinBeds(ctx: CanvasRenderingContext2D): void {
    const R = this.R;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = this.coreOpen ? [...this.veins, this.core] : this.veins;
    for (const v of all) {
      ctx.beginPath();
      v.forEach((p, i) => (i ? ctx.lineTo(p.x * R, p.y * R) : ctx.moveTo(p.x * R, p.y * R)));
      ctx.strokeStyle = rgba(v === this.core ? '#c8a050' : this.color, 0.13);
      ctx.lineWidth = R * 0.12;
      ctx.stroke();
    }
    // Rinne: Licht fällt von der Sonne her auf die Kante
    const c = Math.cos(SUN_ANGLE - this.rot), s = Math.sin(SUN_ANGLE - this.rot);
    for (const v of all) {
      for (const [i0, i1, a] of runs(v, true)) {
        const cut = 1 - a;
        if (cut < 0.05) continue;
        const line = (ox: number, oy: number) => {
          ctx.beginPath();
          ctx.moveTo(v[i0].x * R + ox, v[i0].y * R + oy);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(v[i].x * R + ox, v[i].y * R + oy);
        };
        line(c * 1.5, s * 1.5);
        ctx.strokeStyle = `rgba(255,220,180,${0.12 * cut})`;
        ctx.lineWidth = R * 0.05 * cut;
        ctx.stroke();
        line(0, 0);
        ctx.strokeStyle = `rgba(6,4,3,${0.8 * cut})`;
        ctx.lineWidth = R * 0.05 * cut;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Brennspur des Lasers: weißglühend → orange → rot → verkohlt */
  private drawBurns(ctx: CanvasRenderingContext2D): void {
    const R = this.R, B = this.burns;
    if (!B.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    const seg = (i: number) => {
      ctx.beginPath();
      const a = B[i - 1] && Math.hypot(B[i - 1].x - B[i].x, B[i - 1].y - B[i].y) < 0.06 ? B[i - 1] : B[i];
      ctx.moveTo(a.x * R, a.y * R);
      ctx.lineTo(B[i].x * R + 0.01, B[i].y * R);
    };
    const scorch = new Path2D();
    for (let i = 0; i < B.length; i++) {
      const join = i > 0 && Math.hypot(B[i - 1].x - B[i].x, B[i - 1].y - B[i].y) < 0.06;
      if (join) scorch.lineTo(B[i].x * R, B[i].y * R);
      else { scorch.moveTo(B[i].x * R, B[i].y * R); scorch.lineTo(B[i].x * R + 0.01, B[i].y * R); }
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(14,9,6,0.5)';
    ctx.lineWidth = R * 0.036;
    ctx.stroke(scorch);
    ctx.strokeStyle = 'rgba(40,24,14,0.35)';
    ctx.lineWidth = R * 0.06;
    ctx.stroke(scorch);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < B.length; i++) {
      const h = 1 - B[i].t / 1.6;
      if (h <= 0) continue;
      const col = h > 0.75 ? '#fff0c8' : h > 0.45 ? '#ffa040' : '#ff4a20';
      seg(i);
      ctx.strokeStyle = rgba(col, 0.22 * h);
      ctx.lineWidth = R * 0.07 * (0.5 + 0.5 * h);
      ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.85 * h);
      ctx.lineWidth = R * 0.02 * (0.5 + 0.5 * h);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Bruchlinien: wachsen mit der Spannung vom Rand nach innen, glühen kurz vor dem Einsturz */
  private drawCracks(ctx: CanvasRenderingContext2D, t: number): void {
    const f = clamp((this.stress - 20) / 80, 0, 1);
    if (f <= 0) return;
    const R = this.R;
    const lim = f * this.crackMax;
    const glow = this.stress >= 60 ? clamp((this.stress - 60) / 40, 0, 1) * (0.6 + 0.4 * Math.sin(t * 14)) : 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3;
    for (const c of this.cracks) {
      const P = c.pts;
      if (P[0].o >= lim) continue;
      const path = new Path2D();
      path.moveTo(P[0].x * R, P[0].y * R);
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        if (b.o <= lim) { path.lineTo(b.x * R, b.y * R); continue; }
        const k = (lim - a.o) / (b.o - a.o);
        path.lineTo((a.x + (b.x - a.x) * k) * R, (a.y + (b.y - a.y) * k) * R);
        break;
      }
      // feiner, dunkler Spalt mit heller Kante auf der Sonnenseite
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 0.6 + 1.1 * c.w;
      ctx.stroke(path);
      ctx.save();
      ctx.translate(-Math.cos(SUN_ANGLE - this.rot) * -1, -Math.sin(SUN_ANGLE - this.rot) * -1);
      ctx.strokeStyle = 'rgba(255,215,175,0.16)';
      ctx.lineWidth = 0.5;
      ctx.stroke(path);
      ctx.restore();
      if (glow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba('#ff6a2a', 0.22 * glow * c.w);
        ctx.lineWidth = 2.5 + 2 * c.w;
        ctx.stroke(path);
        ctx.strokeStyle = rgba('#ffc070', 0.9 * glow);
        ctx.lineWidth = 0.5 + 0.5 * c.w;
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }

  /** Kernader: vorher nur ein Schimmern in der Tiefe, danach golden mit Lichtstrahlen */
  private drawCore(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R, v = this.core;
    if (!v.length) return;
    const c = v[Math.floor(v.length / 2)];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!this.coreOpen) {
      const gr = ctx.createRadialGradient(c.x * R, c.y * R, 0, c.x * R, c.y * R, R * 0.3);
      gr.addColorStop(0, rgba('#fff0b0', 0.08 + 0.05 * Math.sin(t * 2)));
      gr.addColorStop(1, 'rgba(255,240,176,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(c.x * R, c.y * R, R * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const left = v.reduce((q, p) => q + Math.max(0, p.a), 0) / Math.max(1, this.coreTotal);
    if (left > 0.02) {
      // Lichtstrahlen
      const L = R * (0.55 + 0.6 * this.coreFlash);
      for (let k = 0; k < 10; k++) {
        const a = k * 0.628 + t * 0.15 + Math.sin(t * 0.7 + k) * 0.1;
        const w = 0.05 + 0.03 * Math.sin(t * 1.3 + k * 2);
        const g = ctx.createLinearGradient(c.x * R, c.y * R, c.x * R + Math.cos(a) * L, c.y * R + Math.sin(a) * L);
        g.addColorStop(0, rgba('#ffe8a0', (0.12 + 0.3 * this.coreFlash) * left));
        g.addColorStop(1, 'rgba(255,232,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(c.x * R, c.y * R);
        ctx.lineTo(c.x * R + Math.cos(a - w) * L, c.y * R + Math.sin(a - w) * L);
        ctx.lineTo(c.x * R + Math.cos(a + w) * L, c.y * R + Math.sin(a + w) * L);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const [i0, i1, a] of runs(v)) {
      ctx.beginPath();
      ctx.moveTo(v[i0].x * R, v[i0].y * R);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(v[i].x * R, v[i].y * R);
      ctx.strokeStyle = rgba('#ffd870', (0.22 + 0.08 * Math.sin(t * 5)) * a);
      ctx.lineWidth = R * 0.11 * (0.5 + a * 0.5);
      ctx.stroke();
      ctx.strokeStyle = rgba('#fff4c8', 0.95 * a);
      ctx.lineWidth = R * 0.03 * (0.4 + a * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawVeins(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R;
    const bright = mixHex(this.color, '#ffffff', 0.55);
    const deep = mixHex(this.color, '#000000', 0.35);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.veins.forEach((v, vi) => {
      for (const [i0, i1, a] of runs(v)) {
        ctx.beginPath();
        ctx.moveTo(v[i0].x * R, v[i0].y * R);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(v[i].x * R, v[i].y * R);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba(deep, 0.85 * a);
        ctx.lineWidth = R * 0.034 * (0.5 + a * 0.5);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(this.color, 0.16 * a);
        ctx.lineWidth = R * 0.085 * (0.5 + a * 0.5);
        ctx.stroke();
        ctx.strokeStyle = rgba(this.color, 0.9 * a);
        ctx.lineWidth = R * 0.017 * (0.4 + a * 0.6);
        ctx.stroke();
      }
      // Lichtwelle entlang der Ader
      ctx.globalCompositeOperation = 'lighter';
      const wave = (t * 2.2 + vi * 1.9) % (v.length + 6) - 3;
      for (let i = 1; i < v.length; i++) {
        const a = Math.min(v[i - 1].a, v[i].a);
        const sh = Math.max(0, 1 - Math.abs(i - 0.5 - wave) / 2.5);
        if (a <= 0.02 || sh <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(v[i - 1].x * R, v[i - 1].y * R);
        ctx.lineTo(v[i].x * R, v[i].y * R);
        ctx.strokeStyle = rgba(bright, 0.45 * sh * a);
        ctx.lineWidth = R * 0.014;
        ctx.stroke();
      }
      // Erzbrocken in der Ader
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < v.length; i++) {
        const p = v[i];
        if (p.a < 0.35 || (i + vi) % 3) continue;
        const s = R * 0.013 * (0.6 + 0.4 * p.a);
        ctx.save();
        ctx.translate(p.x * R, p.y * R);
        ctx.rotate(i * 1.7 + vi);
        ctx.beginPath();
        ctx.moveTo(s, 0); ctx.lineTo(s * 0.3, s * 0.9); ctx.lineTo(-s * 0.8, s * 0.5); ctx.lineTo(-s * 0.7, -s * 0.6); ctx.lineTo(s * 0.3, -s * 0.9);
        ctx.closePath();
        const g = ctx.createLinearGradient(-s, -s, s, s);
        g.addColorStop(0, bright);
        g.addColorStop(1, this.color);
        ctx.fillStyle = g;
        ctx.globalAlpha = p.a;
        ctx.fill();
        ctx.restore();
        const tw = Math.sin(t * 3 + i * 2.3 + p.x * 20);
        if (tw > 0.9) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          this.glint(ctx, p.x * R, p.y * R, R * 0.05 * (tw - 0.9) * 10 * p.a, '#fff4d8');
          ctx.restore();
        }
      }
    });
    ctx.restore();
  }

  /** Vierstrahliger Lichtfunke */
  private glint(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
    if (s < 0.5) return;
    ctx.fillStyle = rgba(color, 0.9);
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.15, y - s * 0.15); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.15, y + s * 0.15);
    ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.15, y + s * 0.15); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.15, y - s * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  private drawCrystals(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R;
    const limit = this.mode === 'fine' ? 55 : 40;
    for (const c of this.crystals) {
      if (c.state !== 'ok') continue;
      ctx.save();
      ctx.translate(c.x * R, c.y * R);
      // Leuchten im Gestein
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.11);
      halo.addColorStop(0, rgba('#9ff3ff', 0.3 + 0.1 * Math.sin(t * 2 + c.x * 9)));
      halo.addColorStop(1, 'rgba(159,243,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // Prismen mit heller und dunkler Fläche
      for (let k = 0; k < 5; k++) {
        const a = k * 1.25 + c.x * 7 - 0.4;
        const L = R * (0.045 + 0.022 * ((k * 37 + Math.floor(c.y * 100)) % 5) / 4), w = R * 0.017;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -L); ctx.lineTo(-w, -L * 0.3); ctx.lineTo(-w * 0.7, w * 0.6); ctx.lineTo(0, w * 0.7);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200,250,255,0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -L); ctx.lineTo(w, -L * 0.3); ctx.lineTo(w * 0.7, w * 0.6); ctx.lineTo(0, w * 0.7);
        ctx.closePath();
        ctx.fillStyle = 'rgba(40,150,190,0.92)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -L); ctx.lineTo(-w, -L * 0.3); ctx.lineTo(-w * 0.7, w * 0.6); ctx.lineTo(w * 0.7, w * 0.6); ctx.lineTo(w, -L * 0.3);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(230,255,255,0.75)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        const gl = Math.max(0, Math.sin(t * 1.7 + k * 1.9 + c.x * 10)) ** 14;
        if (gl > 0.05) { ctx.globalCompositeOperation = 'lighter'; this.glint(ctx, 0, -L, R * 0.05 * gl, '#e8ffff'); }
        ctx.restore();
      }
      if (c.prog > 0) {
        ctx.strokeStyle = '#9ff3ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.09, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.prog);
        ctx.stroke();
      }
      if (this.heat >= limit && this.firing) {
        ctx.strokeStyle = rgba('#ff5c6c', 0.4 + 0.3 * Math.sin(t * 10));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPockets(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R;
    for (const p of this.pockets) {
      if (!p.alive) continue;
      const pr = clamp(p.press, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(t * (4 + pr * 14) + p.x * 9);
      ctx.save();
      ctx.translate(p.x * R, p.y * R);
      ctx.rotate(p.x * 10);
      // dunkle Kammer im Gestein
      ctx.fillStyle = 'rgba(18,5,3,0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, R * (0.045 + pr * 0.01), R * 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const rr = R * (0.085 + pr * 0.05);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      gr.addColorStop(0, rgba('#ff7a4a', 0.55 + 0.3 * pr));
      gr.addColorStop(0.45, rgba('#ff3a2a', 0.2 + 0.25 * pulse * (0.4 + pr)));
      gr.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      // wirbelndes Gas
      for (let k = 0; k < 3; k++) {
        const a0 = t * (1.2 + pr * 6) * (k % 2 ? -1 : 1) + k * 2.1;
        ctx.strokeStyle = rgba('#ffb08a', 0.35 + 0.3 * pr);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, 0, R * (0.026 + k * 0.012), a0, a0 + 1.6);
        ctx.stroke();
      }
      // Haarrisse bei hohem Druck
      if (pr > 0.4) {
        const f = (pr - 0.4) / 0.6;
        ctx.strokeStyle = rgba('#ffa060', 0.4 + 0.5 * f * pulse);
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 7; k++) {
          const a = k * 0.9 + p.y * 5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * 0.045, Math.sin(a) * R * 0.045);
          ctx.lineTo(Math.cos(a + 0.2) * R * (0.06 + 0.06 * f), Math.sin(a + 0.2) * R * (0.06 + 0.06 * f));
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.save();
      ctx.translate(p.x * R, p.y * R);
      // Druckanzeige bzw. Ablass-Fortschritt
      if (pr > 0.05) {
        ctx.strokeStyle = pr > 0.7 ? rgba('#ff3a2a', 0.7 + 0.3 * pulse) : '#ffb547';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
        ctx.stroke();
      }
      if (p.vent > 0) {
        ctx.strokeStyle = '#7fd8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.145, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.vent));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Laserfarbe nach Hitze: kühl türkisweiß → weiß → bernstein → rot */
  private laserColor(): string {
    const h = this.heat / 100;
    const stops: [number, string][] = [[0, '#8fe8ff'], [0.4, '#fff4e0'], [0.7, '#ffb547'], [1, '#ff4a3a']];
    for (let i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) return mixHex(stops[i - 1][1], stops[i][1], (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return '#ff4a3a';
  }

  private drawShipAndLaser(ctx: CanvasRenderingContext2D, t: number): void {
    const [sx, sy] = this.ship;
    const [ax, ay] = this.aim;
    const active = this.firing && !this.overheated && this.endT < 0 && this.breakT < 0;
    const want = this.firing && this.breakT < 0 ? clamp(Math.atan2(ay - sy, ax - sx) + Math.PI / 2, -0.75, 0.75) : 0;
    this.shipAng += (want - this.shipAng) * 0.2;
    const ang = this.shipAng;
    const sp = mapShipSprite('alligator_min');
    const SH = 88;
    const noseD = sp ? SH * 0.42 : 22;
    const nx = sx + Math.sin(ang) * noseD, ny = sy - Math.cos(ang) * noseD;
    const lc = this.laserColor();
    const col = this.hit === 'vein' ? mixHex(this.color, lc, 0.35) : lc;
    // Sammelstrahl: Brocken werden zum Schiff gezogen
    const pulled = this.fx.list.filter((p) => p.tx != null).length;
    if (active && pulled > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(nx, ny, ax, ay);
      g.addColorStop(0, rgba('#7fd8ff', 0.05 * Math.min(1, pulled / 8)));
      g.addColorStop(1, 'rgba(127,216,255,0)');
      ctx.fillStyle = g;
      const px = -(ay - ny), py = ax - nx, pl = Math.hypot(px, py) || 1;
      ctx.beginPath();
      ctx.moveTo(nx + (px / pl) * 5, ny + (py / pl) * 5);
      ctx.lineTo(ax + (px / pl) * 14, ay + (py / pl) * 14);
      ctx.lineTo(ax - (px / pl) * 14, ay - (py / pl) * 14);
      ctx.lineTo(nx - (px / pl) * 5, ny - (py / pl) * 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (active) {
      const fine = this.mode === 'fine';
      const flick = 0.85 + 0.15 * Math.sin(t * 60);
      const dx = ax - nx, dy = ay - ny, len = Math.hypot(dx, dy) || 1, pxn = -dy / len, pyn = dx / len;
      const beam = new Path2D();
      for (let i = 0; i <= 12; i++) {
        const f = i / 12, wob = i === 0 || i === 12 ? 0 : Math.sin(t * 50 + i * 1.7) * (fine ? 0.5 : 1.1);
        const x = nx + dx * f + pxn * wob, y = ny + dy * f + pyn * wob;
        i ? beam.lineTo(x, y) : beam.moveTo(x, y);
      }
      const wm = (fine ? 0.55 : 1) * (1 + (this.score.combo - 1) * 0.25);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(col, 0.09 * flick);
      ctx.lineWidth = 13 * wm;
      ctx.stroke(beam);
      ctx.strokeStyle = rgba(col, 0.45 * flick);
      ctx.lineWidth = 5.5 * wm;
      ctx.stroke(beam);
      ctx.strokeStyle = rgba('#ffffff', 0.95);
      ctx.lineWidth = 1.6 * Math.max(0.8, wm);
      ctx.stroke(beam);
      // Energiepulse entlang des Strahls
      for (let k = 0; k < 3; k++) {
        const f = (t * 2.2 + k / 3) % 1;
        const x = nx + dx * f, y = ny + dy * f;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7 * wm + 2);
        g.addColorStop(0, rgba('#ffffff', 0.7));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 7 * wm + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.hit !== 'space') {
        // Licht des Treffpunkts auf der Oberfläche
        if (this.art) {
          ctx.save();
          ctx.translate(this.cx, this.cy);
          ctx.rotate(this.rot);
          ctx.clip(this.art.path);
          ctx.rotate(-this.rot);
          ctx.translate(-this.cx, -this.cy);
          const lr = this.R * 0.45;
          const sl = ctx.createRadialGradient(ax, ay, 0, ax, ay, lr);
          sl.addColorStop(0, rgba(col, 0.28));
          sl.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = sl;
          ctx.fillRect(ax - lr, ay - lr, lr * 2, lr * 2);
          ctx.restore();
        }
        const fr = this.R * MODES[this.mode].rr * 1.3 * (0.9 + 0.2 * Math.sin(t * 37));
        const gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, fr);
        gr.addColorStop(0, rgba('#ffffff', 0.95));
        gr.addColorStop(0.25, rgba(col, 0.6));
        gr.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(ax, ay, fr, 0, Math.PI * 2);
        ctx.fill();
        // Lichtstreifen
        for (const [lx, ly, l] of [[1, 0, fr * 2.2], [0, 1, fr * 1.2]] as const) {
          const g = ctx.createLinearGradient(ax - lx * l, ay - ly * l, ax + lx * l, ay + ly * l);
          g.addColorStop(0, rgba(col, 0));
          g.addColorStop(0.5, rgba('#ffffff', 0.55));
          g.addColorStop(1, rgba(col, 0));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ax - lx * l, ay - ly * l);
          ctx.lineTo(ax + lx * l, ay + ly * l);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (this.firing && this.overheated) {
      ctx.strokeStyle = 'rgba(255,92,108,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ax, ay, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    if (sp) {
      // Triebwerksflammen
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const ex of sp.engines.xs) {
        const fx = ex * SH, fy = sp.engines.y * SH, fl = 9 + Math.random() * 6;
        const g = ctx.createLinearGradient(fx, fy, fx, fy + fl);
        g.addColorStop(0, rgba('#fff0d0', 0.9));
        g.addColorStop(0.3, rgba(sp.engines.color, 0.7));
        g.addColorStop(1, rgba(sp.engines.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(fx - 4, fy);
        ctx.lineTo(fx + 4, fy);
        ctx.lineTo(fx, fy + fl);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, -SH / 2, -SH / 2, SH, SH);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -24); ctx.lineTo(12, -10); ctx.lineTo(16, 14); ctx.lineTo(6, 20); ctx.lineTo(-6, 20); ctx.lineTo(-16, 14); ctx.lineTo(-12, -10);
      ctx.closePath();
      ctx.fillStyle = '#0d1e2a';
      ctx.fill();
      ctx.strokeStyle = rgba('#ffc45e', 0.25);
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffc45e';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = rgba(this.color, 0.3 + 0.5 * clamp(pulled / 20, 0, 1));
      ctx.fillRect(-7, -4, 14, 14);
    }
    // Emitter am Bug: glüht mit der Hitze
    const eg = ctx.createRadialGradient(0, -noseD, 0, 0, -noseD, 9 + this.heat / 12);
    eg.addColorStop(0, rgba(this.overheated ? '#ff5c4a' : lc, this.overheated ? 0.6 + 0.4 * Math.sin(t * 12) : active ? 0.9 : 0.25 + this.heat / 200));
    eg.addColorStop(1, rgba(lc, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, -noseD, 9 + this.heat / 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Balken mit Verlauf, Teilstrichen und Marken */
  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, c0: string, c1: string): void {
    ctx.fillStyle = 'rgba(8,18,28,0.85)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (f > 0) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * clamp(f, 0, 1), h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, w * clamp(f, 0, 1), h * 0.4);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = 1; k < 10; k++) ctx.fillRect(x + (w * k) / 10, y + 1, 1, h - 2);
    ctx.strokeStyle = 'rgba(110,220,205,0.3)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2);
    ctx.stroke();
  }

  private drawHeat(ctx: CanvasRenderingContext2D, t: number): void {
    const [, sy] = this.ship;
    const W = 100, H = 8, bx = 16, y = sy - 5;
    const f = this.heat / 100;
    const blink = Math.sin(t * 12) > 0;
    if (this.overheated) this.bar(ctx, bx, y, W, H, f, blink ? '#ff5c6c' : '#802030', '#ff5c6c');
    else this.bar(ctx, bx, y, W, H, f, '#3fe0c5', f > 0.7 ? '#ffb547' : mixHex('#3fe0c5', '#ffb547', f / 0.7));
    // Grenze für Kristalle (fein: höher) und Beginn des Heißlaufs
    ctx.fillStyle = '#9ff3ff';
    ctx.fillRect(bx + W * (this.mode === 'fine' ? 0.55 : 0.4) - 0.75, y - 3, 1.5, H + 6);
    ctx.fillStyle = '#fff0b0';
    ctx.fillRect(bx + (W * HOT_RUN) / 100 - 0.75, y - 3, 1.5, H + 6);
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.overheated ? '#ff9aa4' : this.hotRun && this.hit === 'vein' ? '#fff0b0' : this.hardHere > 0.3 && this.firing ? '#ffb547' : 'rgba(169,195,198,0.85)';
    ctx.fillText(this.overheated ? 'ÜBERHITZT – LOSLASSEN' : this.hotRun && this.hit === 'vein' ? 'HEISSLAUF ×1,5' : this.hardHere > 0.3 && this.firing ? 'HARTES GESTEIN' : 'LASERHITZE', bx, y - 6);
    // Gesteinsspannung
    const y2 = y + 32, s = clamp(this.stress / 100, 0, 1);
    if (s >= 0.75) this.bar(ctx, bx, y2, W, H, s, '#ffb547', blink ? '#ff5c6c' : '#ff9a4a');
    else this.bar(ctx, bx, y2, W, H, s, '#7a6e60', s >= 0.5 ? '#ffb547' : '#b8a690');
    ctx.fillStyle = s >= 0.75 ? '#ff9aa4' : 'rgba(169,195,198,0.85)';
    ctx.fillText(s >= 0.75 ? 'EINSTURZGEFAHR' : 'GESTEINSSPANNUNG', bx, y2 - 6);
  }
}

/**
 * Aderabschnitte zu Läufen mit gleicher (gerundeter) Stärke zusammenfassen: [Start, Ende, Stärke].
 * So entstehen an den Stößen keine hellen Perlen durch überlappende Linienenden.
 */
function runs(v: VeinPt[], all = false): [number, number, number][] {
  const out: [number, number, number][] = [];
  let start = -1, cur = 0;
  for (let i = 1; i < v.length; i++) {
    const a = Math.round(Math.max(0, Math.min(v[i - 1].a, v[i].a)) * 10) / 10;
    const ok = all || a > 0.02;
    if (start >= 0 && (!ok || a !== cur)) { out.push([start, i - 1, cur]); start = -1; }
    if (ok && start < 0) { start = i - 1; cur = a; }
  }
  if (start >= 0) out.push([start, v.length - 1, cur]);
  return out;
}

/** Zwei Hex-Farben mischen */
function mixHex(a: string, b: string, f: number): string {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const k = clamp(f, 0, 1);
  const ch = (s: number) => Math.round(((p >> s) & 255) + ((((q >> s) & 255) - ((p >> s) & 255)) * k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
