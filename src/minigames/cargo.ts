// Minispiel „Frachtraum“: Container in Schwerelosigkeit in die Ladebucht schießen.
// Bedienung: Zielplatz antippen (sein Magnetfeld schaltet sich ein), Container wie eine Zwille zurückziehen und
// loslassen. Kurz antippen hält einen treibenden Container mit dem Traktorstrahl an (kostet Zeit).
// Physik statt Erdgewohnheit:
// - Keine Reibung: Ein Container fliegt geradeaus weiter und prallt von der Hülle ab, bis ihn etwas bremst.
// - Masse: Derselbe Zug (Impuls) bringt einen schweren Container kaum in Fahrt, einen leichten schnell (v = J/m).
// - Das Magnetfeld des Zielplatzes zieht an und bremst als Wirbelstrombremse – je schneller, desto stärker. Wer zu
//   schnell kommt, schießt trotzdem durch (wie ein Raumschiff, das zu schnell für einen Einfang ist).
// - Stöße erhalten den Impuls; Wartungsdrohnen (ab Stufe 3) lenken Container ab.
// - Kein „Unten“: Wichtig ist allein der seitliche Abstand des Schwerpunkts zur Schubachse (Drehmoment).
// - Die Bucht ist zum All hin offen: was hinaustreibt, muss eine Drohne zurückholen.
// Dazu die Lieferreihenfolge: Ware für die erste Station gehört an die Luke, sonst muss beim Entladen umgeräumt werden.
import { sfx } from '../ui/sound';
import { BG_IMAGES } from '../render/bgImages';
import { shipSprite } from '../render/shipArt';
import {
  buzz, clamp, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, roundRect, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

/** Zeitlimit der Runde (s) */
const LIMIT = 150;
/** Einfang: so nah an der Platzmitte und so langsam (Slots, Slots/s) */
const SNAP_D = 0.2;
const SNAP_V = 0.9;
/** Magnetfeld des Zielplatzes: Reichweite (Slots), Zugkraft und Wirbelstrombremse */
const WELL_R = 1.0;
const WELL_K = 3.5;
const WELL_C = 2.6;
/** Zwille: Impuls je Pixel Zuglänge und größter Impuls */
const PULL = 0.075;
const PULL_MAX = 12;
/** Fester Physikschritt (s) */
const STEP = 1 / 120;
/** Schnellster Container (Slots/s) */
const V_MAX = 7;
/** Strafzeiten (s) */
const PEN_SWAP = 4;
const PEN_LOST = 6;
const PEN_LEFT = 10;
const PEN_TRACTOR = 1.5;
/** Reichweite der Bahnvorhersage je Stufe (s) */
const PREDICT: Record<Level, number> = { 1: 3, 2: 2.4, 3: 1.8, 4: 1.3, 5: 0.9 };
/** Abfertigungszeit für 3/2/1 Sterne je Stufe (s): weniger ist besser */
const TARGET: Record<Level, [number, number, number]> = { 1: [40, 60, 85], 2: [55, 78, 105], 3: [70, 95, 125], 4: [80, 108, 140], 5: [90, 120, 155] };

export const CARGO_MUTATORS: Mutator[] = [
  { id: 'heavy', name: 'Schwerlast', desc: 'Alle Container 60 % schwerer', mult: 1.3 },
  { id: 'bouncy', name: 'Prallwände', desc: 'Die Wände federn voll zurück', mult: 1.2 },
  { id: 'drift', name: 'Relativdrift', desc: 'Station und Schiff treiben gegeneinander', mult: 1.4 },
  { id: 'dark', name: 'Notbeleuchtung', desc: 'Bahnvorhersage nur ganz kurz', mult: 1.5 },
  { id: 'weak', name: 'Schwache Magnete', desc: 'Das Magnetfeld bremst nur halb so stark', mult: 1.4 },
];

export const CARGO_GOALS: GoalDef[] = [
  { id: 'order', text: 'Keine Umräumung beim Entladen' },
  { id: 'balance', text: 'Schwerpunkt höchstens 5 % neben der Achse' },
  { id: 'nolost', text: 'Kein Container treibt ins All' },
  { id: 'clean', text: 'Fünf Volltreffer (mit dem ersten Schuss eingefangen)' },
  { id: 'notractor', text: 'Ohne Traktorstrahl auskommen' },
  { id: 'fast', text: 'Alles in der Zielzeit für drei Sterne' },
];

/** Containerwaren: Name, Farbe, Masse (t) */
const WARES: { id: string; name: string; color: string; mass: number }[] = [
  { id: 'energycells', name: 'Energiezellen', color: '#ffd84d', mass: 1 },
  { id: 'foodrations', name: 'Nahrungsrationen', color: '#9ccf5a', mass: 1 },
  { id: 'medicalsupplies', name: 'Medizin', color: '#ff7a8a', mass: 1 },
  { id: 'siliconwafers', name: 'Siliziumscheiben', color: '#b8c2cf', mass: 2 },
  { id: 'claytronics', name: 'Claytronik', color: '#5fe0ff', mass: 2 },
  { id: 'quantumtubes', name: 'Quantenröhren', color: '#b48cff', mass: 2 },
  { id: 'hullparts', name: 'Hüllenteile', color: '#e0913d', mass: 4 },
  { id: 'refinedmetals', name: 'Veredelte Metalle', color: '#c9a27a', mass: 5 },
];
const STOP_COLORS = ['#3fe0c5', '#ffb547', '#ff6b9a'];
const STOP_NAMES = ['A', 'B', 'C'];

interface Box {
  id: number;
  /** Größe in Slots */
  cw: number; ch: number;
  /** Mittelpunkt und Geschwindigkeit in Slot-Einheiten (Bucht: x 0…cols, y 0…rows; Station darüber bei y < 0) */
  x: number; y: number; vx: number; vy: number;
  mass: number;
  ware: number;
  stop: number;
  /** queue: in der Station · held: in der Luke, wartet auf den Schuss · float: fliegt · clamped/fixed: fest */
  state: 'queue' | 'held' | 'float' | 'clamped' | 'fixed';
  /** Ankerslot, wenn festgeklammert */
  c0: number; r0: number;
  shots: number;
  /** Einrast-Animation */
  snap: number;
  hit: number;
  /** Wirbelstrom-Bremsen (Anzeige) */
  brake: number;
}

interface Drone { y: number; x: number; amp: number; speed: number; ph: number; vx: number }
interface Drag { id: number; box: Box | null; sx: number; sy: number; x: number; y: number }

let bgImg: HTMLImageElement | null = null;
function background(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!bgImg) {
    bgImg = new Image();
    bgImg.decoding = 'async';
    bgImg.src = BG_IMAGES.find((b) => b.id === 'planet-blau')?.url ?? '';
  }
  return bgImg.complete && bgImg.naturalWidth ? bgImg : null;
}

export class CargoGame implements MiniGame {
  readonly eyebrow = 'Frachtraum';
  readonly title = 'Schwerelos laden';
  readonly intro: string;
  readonly controls = [
    '1. Zielplatz antippen – sein Magnetfeld schaltet sich ein (ein sinnvoller Platz ist vorgewählt)',
    '2. Container in der Luke zu dir heranziehen wie eine Zwille und loslassen – die Linie zeigt die Bahn',
    'Keine Reibung: zu schnell geschossen fliegt er durch das Feld und prallt von der Hülle ab',
    'Schwere Container (t) brauchen einen kräftigen Zug',
    'Kurz antippen: Traktorstrahl hält einen treibenden Container an (+1,5 s)',
    'Ware für A unten an die Luke, dann B, dann C weiter oben · Schwerpunkt auf die Schubachse (Mittellinie)',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  private level: Level;
  private r: () => number;
  private score: Score;
  private cols: number;
  private rows: number;
  private boxes: Box[] = [];
  private drones: Drone[] = [];
  private stops: number;
  private time = 0;
  private lost = 0;
  private tractors = 0;
  private cleanCount = 0;
  private drift = 0;
  private rest: number;
  private wellC: number;
  /** gewählter Zielplatz (Magnetfeld an) */
  private target: [number, number] | null = null;
  private targetPicked = false;
  private drag: Drag | null = null;
  private auto: { box: Box; wait: number } | null = null;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(120, 31);
  private w = 1;
  private h = 1;
  /** Slotgröße (px) und Lage der Bucht (by = Unterkante an der Station; Reihe 0 liegt unten an der Luke) */
  private S = 60;
  private bx = 0;
  private by = 0;
  private done: GameResult | null = null;
  private endT = -1;
  private finale: { penalty: number; swaps: number; com: number; total: number } | null = null;
  private bgCache: HTMLCanvasElement | null = null;
  private nextId = 1;
  private acc = 0;
  private simT = 0;

  constructor(cfg: GameCfg) {
    const L = (this.level = cfg.level);
    this.r = rng(cfg.seed);
    this.mutator = findMutator(CARGO_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 4);
    this.cols = L >= 3 ? 5 : 4;
    this.rows = L >= 4 ? 6 : 5;
    this.stops = L === 1 ? 1 : L === 2 ? 2 : 3;
    this.rest = this.mutator?.id === 'bouncy' ? 1 : 0.6;
    this.wellC = WELL_C * (1 - 0.05 * (L - 1)) * (this.mutator?.id === 'weak' ? 0.6 : 1);
    if (L >= 4 || this.mutator?.id === 'drift') this.drift = (this.r() < 0.5 ? -1 : 1) * (0.25 + this.r() * 0.2) * (L >= 5 ? 1.3 : 1);
    const n = [7, 9, 10, 11, 12][L - 1];
    const heavy = this.mutator?.id === 'heavy' ? 1.6 : 1;
    // Vorbeladung (feste Fracht anderer Kunden) ab Stufe 4
    const fixed = L >= 4 ? 2 : 0;
    for (let k = 0; k < fixed; k++) {
      const c = Math.floor(this.r() * this.cols), rr = this.rows - 1 - Math.floor(this.r() * 2);
      if (this.boxes.some((b) => b.c0 === c && b.r0 === rr)) continue;
      this.boxes.push(this.mkBox(1, 1, 7, 0, 'fixed', c, rr, heavy));
    }
    for (let k = 0; k < n; k++) {
      const big = L >= 3 && this.r() < 0.22;
      const ware = Math.floor(this.r() * WARES.length);
      const stop = Math.floor(this.r() * this.stops);
      this.boxes.push(this.mkBox(big ? 2 : 1, 1, ware, stop, 'queue', 0, 0, heavy * (big ? 1.5 : 1)));
    }
    // Wartungsdrohnen kreuzen die Bucht
    const dn = L >= 5 ? 2 : L >= 3 ? 1 : 0;
    for (let k = 0; k < dn; k++) this.drones.push({ y: k === 0 ? 1.5 : this.rows - 2.5, x: 0, amp: this.cols / 2 - 0.4, speed: 0.55 + this.r() * 0.25, ph: this.r() * 6, vx: 0 });
    this.intro = `Lade ${n} Container in die Bucht deines Frachters – in Schwerelosigkeit. Tipp einen Zielplatz an, zieh den Container in der Luke zu dir heran wie eine Zwille und lass los. `
      + 'Das Magnetfeld des Zielplatzes bremst und fängt ihn – aber nur, wenn er nicht zu schnell ist. Ohne Reibung fliegt ein zu schneller Container weiter und prallt von der Hülle ab. '
      + (this.stops > 1 ? 'Ware für die erste Station (A) gehört nach unten an die Luke. ' : '')
      + 'Achte auf den Schwerpunkt: Liegt er neben der Schubachse, dreht sich das Schiff beim Ablegen.'
      + (this.drones.length ? ' Wartungsdrohnen kreuzen die Bucht.' : '')
      + (this.drift ? ' Station und Schiff treiben gegeneinander – der Container in der Luke driftet mit.' : '');
    const pool = CARGO_GOALS.filter((g) => this.stops > 1 || g.id !== 'order');
    this.goals = pickGoals(pool, rng(cfg.seed ^ 0x77));
  }

  private mkBox(cw: number, ch: number, ware: number, stop: number, state: Box['state'], c0: number, r0: number, massMul: number): Box {
    const b: Box = { id: this.nextId++, cw, ch, x: 0, y: 0, vx: 0, vy: 0, mass: WARES[ware].mass * massMul, ware, stop, state, c0, r0, shots: 0, snap: 1, hit: 0, brake: 0 };
    if (state === 'fixed') { b.x = c0 + cw / 2; b.y = r0 + ch / 2; b.mass = 6 * massMul; }
    return b;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.bgCache = null;
    // Station unten, Bucht darüber (offen nach oben): Man zieht die Zwille zu sich heran und schießt vom Daumen weg
    const areaH = h - TOP - 70 - 250;
    this.S = Math.floor(Math.min((w - 48) / this.cols, areaH / this.rows));
    this.bx = (w - this.cols * this.S) / 2;
    this.by = TOP + 70 + this.rows * this.S;
  }

  // ---------- Hilfen ----------

  private toPx(x: number, y: number): [number, number] { return [this.bx + x * this.S, this.by - y * this.S]; }
  private toSlot(px: number, py: number): [number, number] { return [(px - this.bx) / this.S, (this.by - py) / this.S]; }

  /** Luke: Öffnung der Station mittig über der Bucht (Slot-Einheiten) */
  private get hatch(): [number, number] { return [this.cols / 2 - 1.1, this.cols / 2 + 1.1]; }

  private occupied(c: number, r: number, except?: Box): boolean {
    return this.boxes.some((b) => b !== except && (b.state === 'clamped' || b.state === 'fixed') && c >= b.c0 && c < b.c0 + b.cw && r >= b.r0 && r < b.r0 + b.ch);
  }

  private fits(b: Box, c0: number, r0: number): boolean {
    if (c0 < 0 || r0 < 0 || c0 + b.cw > this.cols || r0 + b.ch > this.rows) return false;
    for (let c = c0; c < c0 + b.cw; c++) for (let r = r0; r < r0 + b.ch; r++) if (this.occupied(c, r, b)) return false;
    return true;
  }

  private get floating(): Box[] { return this.boxes.filter((b) => b.state === 'float'); }
  private get held(): Box | null { return this.boxes.find((b) => b.state === 'held') ?? null; }
  private get queue(): Box[] { return this.boxes.filter((b) => b.state === 'queue'); }
  private get loaded(): Box[] { return this.boxes.filter((b) => b.state === 'clamped'); }
  private get total(): number { return this.boxes.filter((b) => b.state !== 'fixed').length; }
  /** Container, für den das Ziel gilt: der in der Luke, sonst der erste fliegende */
  private get current(): Box | null { return this.held ?? this.floating[0] ?? null; }

  /** Schwerpunkt seitlich: Abstand zur Schubachse in % der halben Buchtbreite (nur Fracht in der Bucht) */
  comOffset(): number {
    let m = 0, mx = 0;
    for (const b of this.boxes) if (b.state === 'clamped' || b.state === 'fixed') { m += b.mass; mx += b.mass * b.x; }
    if (!m) return 0;
    return ((mx / m - this.cols / 2) / (this.cols / 2)) * 100;
  }

  /** Umräumungen beim Entladen: Container einer späteren Station liegen näher an der Luke als einer einer früheren */
  swaps(): number {
    const L = this.loaded;
    let n = 0;
    for (const a of L) for (const b of L) {
      if (b.stop <= a.stop) continue;
      const share = b.c0 < a.c0 + a.cw && a.c0 < b.c0 + b.cw;
      if (share && b.r0 < a.r0) n++;
    }
    return n;
  }

  hud(): HudItem[] {
    const com = this.comOffset();
    return [
      { label: 'Zeit', value: fmtTime(this.time), warn: LIMIT - this.time < 15 },
      { label: 'Geladen', value: `${this.loaded.length}/${this.total}` },
      { label: 'Schwerpunkt', value: `${com >= 0 ? '+' : '−'}${Math.abs(Math.round(com))} %`, warn: Math.abs(com) > 10 },
    ];
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  /** Vorschlag für den Zielplatz: tiefster freier, von oben erreichbarer Platz nahe der Mitte */
  private defaultTarget(b: Box): [number, number] | null {
    let best: [number, number] | null = null, bs = Infinity;
    for (let c = 0; c + b.cw <= this.cols; c++) for (let r = this.rows - b.ch; r >= 0; r--) {
      if (!this.fits(b, c, r) || !this.reachable(b, c, r)) continue;
      const s = -r * 10 + Math.abs(c + b.cw / 2 - this.cols / 2);
      if (s < bs) { bs = s; best = [c, r]; }
      break;
    }
    return best;
  }

  private reachable(b: Box, c: number, r: number): boolean {
    for (let rr = 0; rr < r; rr++) for (let cc = c; cc < c + b.cw; cc++) if (this.occupied(cc, rr)) return false;
    return true;
  }

  /** Ziel gültig halten (nach dem Einrasten, für einen neuen Container) */
  private ensureTarget(): void {
    const b = this.current;
    if (!b) { this.target = null; return; }
    if (this.target && this.fits(b, this.target[0], this.target[1])) return;
    this.target = this.defaultTarget(b);
    this.targetPicked = false;
  }

  // ---------- Steuerung ----------

  private boxAt(px: number, py: number): Box | null {
    const [x, y] = this.toSlot(px, py);
    let best: Box | null = null, bd = 0.75;
    for (const b of this.boxes) {
      if (b.state !== 'float' && b.state !== 'held' && b.state !== 'clamped') continue;
      const dx = Math.max(0, Math.abs(x - b.x) - b.cw * 0.45), dy = Math.max(0, Math.abs(y - b.y) - b.ch * 0.45);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  pointerDown(id: number, x: number, y: number): void {
    if (this.drag || this.endT >= 0) return;
    const b = this.boxAt(x, y);
    // freier Platz angetippt: neues Ziel
    if (!b || b.state === 'clamped') {
      const [sx, sy] = this.toSlot(x, y);
      const cur = this.current;
      if (cur && sx >= 0 && sy >= 0 && sx < this.cols && sy < this.rows) {
        const c = clamp(Math.floor(sx - cur.cw / 2 + 0.5), 0, this.cols - cur.cw), r = Math.floor(sy);
        if (this.fits(cur, c, r)) { this.target = [c, r]; this.targetPicked = true; sfx.tap(); return; }
      }
      if (!b) return;
    }
    this.drag = { id, box: b, sx: x, sy: y, x, y };
  }

  pointerMove(id: number, x: number, y: number): void {
    if (this.drag?.id === id) { this.drag.x = x; this.drag.y = y; }
  }

  pointerUp(id: number): void {
    const d = this.drag;
    if (!d || d.id !== id) return;
    this.drag = null;
    const b = d.box;
    if (!b) return;
    const len = Math.hypot(d.x - d.sx, d.y - d.sy);
    if (len < 14) {
      // kurz angetippt: treibenden Container mit dem Traktorstrahl anhalten
      if (b.state === 'float' && Math.hypot(b.vx, b.vy) > 0.1) this.tractor(b);
      return;
    }
    const [jx, jy] = this.impulse(d);
    this.shoot(b, jx, jy);
  }

  /** Zwille: Impuls entgegen der Zugrichtung, begrenzt */
  private impulse(d: Drag): [number, number] {
    let jx = (d.sx - d.x) * PULL, jy = -(d.sy - d.y) * PULL;
    const l = Math.hypot(jx, jy);
    if (l > PULL_MAX) { jx *= PULL_MAX / l; jy *= PULL_MAX / l; }
    return [jx, jy];
  }

  /** Schuss: Geschwindigkeitsänderung = Impuls / Masse; löst eine Klammer */
  shoot(b: Box, jx: number, jy: number): void {
    if (b.state === 'clamped') { b.state = 'float'; this.floats.add(...this.toPx(b.x, b.y - 0.6), 'Klammer gelöst', '#9fd8ff', 12); }
    if (b.state !== 'float' && b.state !== 'held') return;
    b.state = 'float';
    b.vx += jx / b.mass;
    b.vy += jy / b.mass;
    const v = Math.hypot(b.vx, b.vy);
    if (v > V_MAX) { b.vx *= V_MAX / v; b.vy *= V_MAX / v; }
    b.shots++;
    const [px, py] = this.toPx(b.x, b.y);
    this.fx.add({ x: px, y: py, color: '#7fd8ff', size: 8, kind: 'ring', max: 0.35 });
    for (let k = 0; k < 8; k++) this.fx.add({ x: px, y: py, vx: -jx * 20 + (Math.random() - 0.5) * 60, vy: -jy * 20 + (Math.random() - 0.5) * 60, color: '#bfefff', size: 1.6, kind: 'spark', max: 0.3 });
    sfx.tap();
  }

  /** Traktorstrahl: Container anhalten (Gegenimpuls), kostet Zeit */
  private tractor(b: Box): void {
    b.vx = 0;
    b.vy = 0;
    this.tractors++;
    this.time += PEN_TRACTOR;
    this.score.reset();
    const [px, py] = this.toPx(b.x, b.y);
    this.fx.add({ x: px, y: py, color: '#9fffd0', size: this.S * 0.4, kind: 'ring', max: 0.4 });
    this.floats.add(px, py - this.S * 0.5, `Traktorstrahl +${String(PEN_TRACTOR).replace('.', ',')} s`, '#9fffd0', 12);
    sfx.open();
  }

  // ---------- Physik ----------

  /** Ein Körper ein Stück weiter: Feld des Zielplatzes, Wände, feste Fracht und Drohnen (für Spiel und Vorhersage) */
  private move1(b: { x: number; y: number; vx: number; vy: number; cw: number; ch: number; mass: number; brake?: number }, h: number, solids: Box[], t: number): 'ok' | 'out' | 'station' {
    // Magnetfeld des Zielplatzes: Zug zur Mitte und Wirbelstrombremse (proportional zur Geschwindigkeit).
    // Beide Kräfte wachsen mit der Metallmasse des Containers – die Beschleunigung ist daher für alle gleich.
    const tg = this.target;
    if (tg) {
      const tx = tg[0] + b.cw / 2, ty = tg[1] + b.ch / 2;
      const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
      if (d < WELL_R) {
        const f = 1 - d / WELL_R;
        if (d > 1e-4) { b.vx += (dx / d) * WELL_K * f * h; b.vy += (dy / d) * WELL_K * f * h; }
        const k = Math.min(1, this.wellC * f * h);
        b.vx -= b.vx * k;
        b.vy -= b.vy * k;
        if (b.brake !== undefined) b.brake = Math.max(b.brake, f);
      }
    }
    b.x += b.vx * h;
    b.y += b.vy * h;
    const e = this.rest;
    const hw = b.cw * 0.45, hh = b.ch * 0.45;
    if (b.x - hw < 0 && b.vx < 0) { b.x = hw; b.vx = -b.vx * e; }
    if (b.x + hw > this.cols && b.vx > 0) { b.x = this.cols - hw; b.vx = -b.vx * e; }
    const [h0, h1] = this.hatch;
    if (b.y - hh < 0 && b.vy < 0) {
      const inHatch = b.x - hw > h0 && b.x + hw < h1;
      if (!inHatch) { b.y = hh; b.vy = -b.vy * e; }
      else if (b.y < -0.9) return 'station';
    }
    if (b.y - hh > this.rows + 0.2) return 'out';
    // feste Fracht (unbeweglich)
    for (const o of solids) {
      const ox = (b.cw + o.cw) * 0.45 - Math.abs(b.x - o.x), oy = (b.ch + o.ch) * 0.45 - Math.abs(b.y - o.y);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) { const s = Math.sign(b.x - o.x) || 1; b.x += s * ox; if (b.vx * s < 0) b.vx = -b.vx * e; }
      else { const s = Math.sign(b.y - o.y) || 1; b.y += s * oy; if (b.vy * s < 0) b.vy = -b.vy * e; }
    }
    // Drohnen: geführt (wie unendlich schwer), Kreis gegen Kasten grob als Kreis
    for (const dr of this.drones) {
      const [dx, dy] = this.dronePos(dr, t);
      const rx = b.x - dx, ry = b.y - dy, d = Math.hypot(rx, ry), R = 0.3 + Math.max(hw, hh) * 0.85;
      if (d < R && d > 1e-4) {
        const nx = rx / d, ny = ry / d;
        b.x += nx * (R - d); b.y += ny * (R - d);
        const vr = (b.vx - dr.vx) * nx + b.vy * ny;
        if (vr < 0) { b.vx -= (1 + e) * vr * nx; b.vy -= (1 + e) * vr * ny; }
      }
    }
    return 'ok';
  }

  private dronePos(d: Drone, t: number): [number, number] {
    return [this.cols / 2 + Math.sin(t * d.speed + d.ph) * d.amp, d.y];
  }

  /** Bahnvorhersage: Punkte bis zur Reichweite der Stufe; endet beim Einfang */
  predict(b: Box, vx: number, vy: number, horizon: number): { pts: [number, number][]; caught: boolean; out: boolean } {
    const p = { x: b.x, y: b.y, vx, vy, cw: b.cw, ch: b.ch, mass: b.mass };
    const solids = this.boxes.filter((o) => o.state === 'clamped' || o.state === 'fixed');
    const pts: [number, number][] = [];
    const h = STEP;
    const tg = this.target;
    for (let k = 0; k < horizon / STEP; k++) {
      const r = this.move1(p, h, solids, this.simT + (k + 1) * h);
      if (k % 6 === 0) pts.push([p.x, p.y]);
      if (r !== 'ok') return { pts, caught: false, out: r === 'out' };
      if (tg && Math.hypot(tg[0] + p.cw / 2 - p.x, tg[1] + p.ch / 2 - p.y) < SNAP_D && Math.hypot(p.vx, p.vy) < SNAP_V) { pts.push([p.x, p.y]); return { pts, caught: true, out: false }; }
    }
    return { pts, caught: false, out: false };
  }

  /** Nur für Tests: Autopilot (Zielplatz nach Reihenfolge und Schwerpunkt; Schuss per Suche über Winkel und Stärke) */
  autopilot(): void {
    const b = this.current;
    if (!b) return;
    if (this.auto && this.auto.box === b) { this.auto.wait -= 1 / 60; if (this.auto.wait > 0) return; }
    // fliegt noch ohne Einfang: anhalten (Traktorstrahl) und neu ansetzen
    if (b.state === 'float' && Math.hypot(b.vx, b.vy) > 0.05) this.tractor(b);
    const slot = this.pickSlot(b);
    if (slot) { this.target = slot; this.targetPicked = true; }
    // beste Schussrichtung und -stärke suchen
    let best: [number, number] | null = null, bt = Infinity;
    for (let a = 0; a < 40; a++) {
      const ang = (a / 40) * Math.PI * 2;
      if (Math.sin(ang) < -0.2 && b.state === 'held') continue; // aus der Luke nicht zurück in die Station
      for (const J of [0.3, 0.5, 0.8, 1.2, 1.8, 2.6, 3.6, 5, 7, 9.5, 12]) {
        const vx = b.vx + (Math.cos(ang) * J) / b.mass, vy = b.vy + (Math.sin(ang) * J) / b.mass;
        if (Math.hypot(vx, vy) > V_MAX) continue;
        const p = this.predict(b, vx, vy, 4 + b.mass * 0.35);
        if (p.caught && p.pts.length < bt) { bt = p.pts.length; best = [Math.cos(ang) * J, Math.sin(ang) * J]; }
      }
    }
    if (best) { this.shoot(b, best[0], best[1]); this.auto = { box: b, wait: 3.2 }; }
    else { const p = this.defaultTarget(b); if (p) this.target = p; this.auto = { box: b, wait: 0.4 }; }
  }

  /** Zielplatz für den Autopiloten: Reihenfolge (A an der Luke), Schwerpunkt ausgleichen, erreichbar */
  private pickSlot(b: Box): [number, number] | null {
    let best: [number, number] | null = null, bs = Infinity;
    const com = this.comOffset();
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!this.fits(b, c, r) || !this.reachable(b, c, r)) continue;
      if (r + 1 < this.rows && this.fits(b, c, r + 1)) continue;
      const cx = c + b.cw / 2;
      const want = this.stops > 1 ? (b.stop / (this.stops - 1)) * (this.rows - 1) : this.rows - 1;
      let s = Math.abs(r - want) * 1.5;
      s += (cx - this.cols / 2) * Math.sign(com || 1) * b.mass * 0.4;
      for (const o of this.loaded) if (o.stop < b.stop && o.c0 < c + b.cw && c < o.c0 + o.cw && o.r0 > r) s += 6;
      // Luke nicht zubauen
      if (r === 0) s += 4;
      if (s < bs) { bs = s; best = [c, r]; }
    }
    return best;
  }

  // ---------- Ablauf ----------

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 3.2) this.done = this.finish();
      return;
    }
    this.time += dt;
    // nächsten Container in die Luke holen, sobald der vorige festgeklammert ist (immer einer nach dem anderen)
    if (!this.held && !this.floating.length) {
      const q = this.queue;
      if (q.length) {
        const b = q[0];
        b.state = 'held';
        b.x = this.cols / 2;
        b.y = -0.5;
        b.vx = b.vy = 0;
        b.snap = 0;
      }
    }
    // in der Luke: driftet mit der Relativbewegung hin und her (Station gegen Schiff)
    const hb = this.held;
    if (hb && this.drift) {
      const [h0, h1] = this.hatch;
      hb.x = (h0 + h1) / 2 + Math.sin(this.simT * Math.abs(this.drift) * 1.6) * (h1 - h0 - hb.cw * 0.95) / 2;
      hb.vx = Math.cos(this.simT * Math.abs(this.drift) * 1.6) * Math.abs(this.drift) * 1.6 * (h1 - h0 - hb.cw * 0.95) / 2;
    }
    for (const d of this.drones) {
      const x0 = this.dronePos(d, this.simT)[0];
      d.x = x0;
      d.vx = Math.cos(this.simT * d.speed + d.ph) * d.amp * d.speed;
    }
    this.ensureTarget();
    // Physik in Teilschritten
    // feste Schritte von 1/120 s – genau wie die Bahnvorhersage, damit die Linie stimmt
    this.acc += dt;
    while (this.acc >= STEP - 1e-9) { this.acc -= STEP; this.simT += STEP; this.step(STEP, this.simT); }
    for (const b of this.boxes) { b.snap = Math.min(1, b.snap + dt * 6); b.hit = Math.max(0, b.hit - dt * 3); b.brake = Math.max(0, b.brake - dt * 2); }
    setGoal(this.goals, 'nolost', this.lost === 0);
    setGoal(this.goals, 'clean', this.cleanCount >= 5);
    setGoal(this.goals, 'notractor', this.tractors === 0);
    const allIn = !this.queue.length && !this.floating.length && !this.held;
    if (allIn || this.time >= LIMIT) this.startFinale();
  }

  private step(h: number, t: number): void {
    const solids = this.boxes.filter((o) => o.state === 'clamped' || o.state === 'fixed');
    for (const b of this.floating) {
      const v0 = Math.hypot(b.vx, b.vy);
      const r = this.move1(b, h, solids, t);
      if (r === 'station') {
        b.state = 'queue'; b.vx = b.vy = 0;
        this.boxes.splice(this.boxes.indexOf(b), 1);
        this.boxes.push(b);
        this.time += 2;
        this.floats.add(...this.toPx(this.cols / 2, -0.6), 'Zurück in die Station +2 s', '#ffb547', 13);
        continue;
      }
      if (r === 'out') {
        this.lost++;
        this.floats.add(...this.toPx(b.x, this.rows), `Ins All getrieben! +${PEN_LOST} s`, '#ff9aa4', 14);
        sfx.warn();
        buzz(40);
        b.state = 'queue'; b.vx = b.vy = 0;
        this.boxes.splice(this.boxes.indexOf(b), 1);
        this.boxes.push(b);
        this.time += PEN_LOST;
        this.score.reset();
        continue;
      }
      if (Math.abs(Math.hypot(b.vx, b.vy) - v0) > 0.8 && b.brake < 0.3) this.bump(b);
      // Einfang am Zielplatz
      const tg = this.target;
      if (tg && this.fits(b, tg[0], tg[1])) {
        const tx = tg[0] + b.cw / 2, ty = tg[1] + b.ch / 2;
        if (Math.hypot(tx - b.x, ty - b.y) < SNAP_D && Math.hypot(b.vx, b.vy) < SNAP_V) this.clamp(b, tg[0], tg[1]);
      }
    }
    // Stöße zwischen fliegenden Containern (Impulserhaltung)
    const F = this.floating;
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      const a = F[i], b = F[j];
      const ox = (a.cw + b.cw) * 0.45 - Math.abs(a.x - b.x), oy = (a.ch + b.ch) * 0.45 - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      const ia = 1 / a.mass, ib = 1 / b.mass;
      let nx = 0, ny = 0, pen = 0;
      if (ox < oy) { nx = Math.sign(b.x - a.x) || 1; pen = ox; } else { ny = Math.sign(b.y - a.y) || 1; pen = oy; }
      const k = pen / (ia + ib);
      a.x -= nx * k * ia; a.y -= ny * k * ia;
      b.x += nx * k * ib; b.y += ny * k * ib;
      const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vrel >= 0) continue;
      const jn = (-(1 + this.rest) * vrel) / (ia + ib);
      a.vx -= jn * nx * ia; a.vy -= jn * ny * ia;
      b.vx += jn * nx * ib; b.vy += jn * ny * ib;
      if (Math.abs(vrel) > 0.4) { a.hit = b.hit = 1; this.bump(a); }
    }
  }

  private bump(b: Box): void {
    b.hit = 1;
    const [px, py] = this.toPx(b.x, b.y);
    this.fx.burst(px, py, '#ffd0a0', 6, 90, 1.3, 'spark', 0.25);
    sfx.tap();
  }

  /** Einrasten: Klammern schließen, Kombo für Volltreffer */
  private clamp(b: Box, c0: number, r0: number): void {
    b.state = 'clamped';
    b.c0 = c0; b.r0 = r0;
    b.x = c0 + b.cw / 2; b.y = r0 + b.ch / 2;
    b.vx = b.vy = 0;
    b.snap = 0;
    const [px, py] = this.toPx(b.x, b.y);
    this.fx.add({ x: px, y: py, color: '#7fd8ff', size: this.S * 0.35, kind: 'ring', max: 0.45 });
    this.fx.burst(px, py, '#9fe8ff', 12, 130, 1.3, 'spark', 0.3);
    const clean = b.shots <= 1;
    if (clean) { this.cleanCount++; this.score.bump(0.5, 999); }
    const p = this.score.add(100);
    this.floats.add(px, py - this.S * 0.5, clean ? `Volltreffer +${p}` : `+${p}`, clean ? '#9fffd0' : '#ffd27a', 13);
    sfx.coin();
    buzz(15);
    this.target = null;
    this.targetPicked = false;
  }

  private startFinale(): void {
    if (this.endT >= 0) return;
    this.endT = 0;
    this.drag = null;
    const swaps = this.swaps();
    const com = Math.abs(this.comOffset());
    const left = this.queue.length + this.floating.length + (this.held ? 1 : 0);
    // Schiefer Schwerpunkt: Steuerdüsen halten gegen – kostet Zeit (quadratisch, kleine Abweichungen sind harmlos)
    const comPen = Math.round(((com / 10) ** 2) * 2 * 10) / 10;
    const penalty = swaps * PEN_SWAP + comPen + left * PEN_LEFT;
    this.finale = { penalty, swaps, com, total: this.time + penalty };
    setGoal(this.goals, 'order', swaps === 0 && left === 0);
    setGoal(this.goals, 'balance', com <= 5 && left === 0);
    setGoal(this.goals, 'fast', left === 0 && this.time + penalty <= TARGET[this.level][0]);
    if (left) this.floats.add(this.w / 2, this.h / 2, 'Zeit abgelaufen', '#ff9aa4', 18);
    else sfx.build();
  }

  private finish(): GameResult {
    const f = this.finale ?? { penalty: 0, swaps: this.swaps(), com: Math.abs(this.comOffset()), total: this.time };
    const [t3, t2, t1] = TARGET[this.level];
    const left = this.queue.length + this.floating.length + (this.held ? 1 : 0);
    const stars = left > this.total / 2 ? 0 : starsFor(-f.total, -t1, -t2, -t3);
    this.score.points += Math.max(0, Math.round((t1 - f.total) * 20 * this.score.mult));
    return {
      success: stars > 0,
      stars,
      score: Math.round(f.total),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: stars === 3 ? 'Abfertigung in Rekordzeit' : stars > 0 ? 'Fracht verladen' : 'Zu langsam abgefertigt',
      lines: [
        ['Abfertigungszeit', `${f.total.toFixed(1).replace('.', ',')} s`],
        ['Ladezeit', `${this.time.toFixed(1).replace('.', ',')} s`],
        ['Volltreffer', `${this.cleanCount}`],
        ...(this.stops > 1 ? [['Umräumungen beim Entladen', `${f.swaps} (+${f.swaps * PEN_SWAP} s)`] as [string, string]] : []),
        ['Schwerpunkt neben der Achse', `${Math.round(f.com)} %`],
        ...(this.tractors ? [['Traktorstrahl', `${this.tractors}×`] as [string, string]] : []),
        ...(this.lost ? [['Ins All getrieben', `${this.lost}`] as [string, string]] : []),
        ...(left ? [['Nicht verladen', `${left}`] as [string, string]] : []),
      ],
    };
  }

  result(): GameResult | null { return this.done; }

  abort(): GameResult {
    const r = this.finish();
    r.success = false;
    r.stars = 0;
    for (const g of r.goals) g.done = false;
    r.headline = 'Abgebrochen';
    return r;
  }

  // ---------- Darstellung ----------

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const img = background();
    if (!img) { this.stars.draw(ctx, 0, '#cfe4ff'); return; }
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
    if (!this.bgCache || this.bgCache.width !== W || this.bgCache.height !== H) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (this.w - iw) / 2, (this.h - ih) / 2, iw, ih);
      g.fillStyle = 'rgba(2,5,10,0.55)';
      g.fillRect(0, 0, this.w, this.h);
      this.bgCache = c;
    }
    ctx.drawImage(this.bgCache, 0, 0, this.w, this.h);
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.drawBackground(ctx);
    // Abflug: das Schiff legt ab – mit schiefem Schwerpunkt dreht es sich
    let dy = 0, rot = 0;
    if (this.endT > 0.6 && this.finale) {
      const k = this.endT - 0.6;
      dy = -k * k * 60;
      rot = (Math.sign(this.comOffset()) * Math.min(this.finale.com, 60) / 100) * k * k * 0.35;
    }
    this.drawStation(ctx, t);
    ctx.save();
    if (dy || rot) {
      const [cx, cy] = this.toPx(this.cols / 2, this.rows / 2);
      ctx.translate(cx, cy + dy);
      ctx.rotate(rot);
      ctx.translate(-cx, -cy);
    }
    this.drawBay(ctx, t);
    for (const b of this.boxes) if (b.state === 'clamped' || b.state === 'fixed') this.drawBox(ctx, b, t);
    this.drawAxis(ctx, t);
    if (this.endT > 0.6 && this.finale) this.drawThrust(ctx, t);
    ctx.restore();
    this.drawTarget(ctx, t);
    this.drawDrones(ctx, t);
    for (const b of this.boxes) if (b.state === 'float' || b.state === 'held') this.drawBox(ctx, b, t);
    this.drawDrag(ctx, t);
    this.drawHint(ctx, t);
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    this.drawQueue(ctx, t);
    if (this.endT >= 0 && this.finale) this.drawFinale(ctx);
  }

  /** Station unten: Hüllenband mit Ladeluke und Warnlichtern */
  private drawStation(ctx: CanvasRenderingContext2D, t: number): void {
    const S = this.S;
    const y1 = this.by + S * 0.12, y2 = y1 + S * 1.25;
    const [h0, h1] = this.hatch;
    const [hx0] = this.toPx(h0, 0), [hx1] = this.toPx(h1, 0);
    const g = ctx.createLinearGradient(0, y1, 0, y2);
    g.addColorStop(0, '#2c3846');
    g.addColorStop(1, '#1a222c');
    ctx.fillStyle = g;
    ctx.fillRect(0, y1, this.w, y2 - y1);
    ctx.fillStyle = 'rgba(4,8,14,0.85)';
    ctx.fillRect(hx0, y1, hx1 - hx0, S * 0.9);
    // Paneele
    ctx.strokeStyle = 'rgba(160,190,210,0.12)';
    ctx.lineWidth = 1;
    for (let x = 12; x < this.w; x += 46) {
      if (x > hx0 - 44 && x < hx1 + 4) continue;
      ctx.strokeRect(x, y1 + 8, 40, y2 - y1 - 16);
    }
    ctx.strokeStyle = 'rgba(200,220,235,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y1); ctx.lineTo(hx0, y1);
    ctx.moveTo(hx1, y1); ctx.lineTo(this.w, y1);
    ctx.stroke();
    // Lukenrahmen mit Lauflichtern
    for (const x of [hx0, hx1]) {
      ctx.fillStyle = '#3a4a5a';
      ctx.fillRect(x - 4, y1, 8, S * 0.95);
      for (let k = 0; k < 4; k++) {
        const on = Math.floor(t * 4 + k) % 4 === 0;
        ctx.fillStyle = on ? '#ffb547' : 'rgba(255,181,71,0.25)';
        ctx.beginPath();
        ctx.arc(x, y1 + S * 0.85 - k * S * 0.22, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(169,195,198,0.8)';
    ctx.fillText('STATION · LADELUKE', (hx0 + hx1) / 2, y2 - 8);
    if (this.drift) {
      const dir = Math.sign(this.drift);
      ctx.fillStyle = 'rgba(255,181,71,0.85)';
      ctx.fillText(dir > 0 ? 'RELATIVDRIFT →' : '← RELATIVDRIFT', (hx0 + hx1) / 2, y2 + 10);
    }
  }

  /** Ladebucht: Rahmen, Hüllenwände, Magnetklammern; oben offen zum All */
  private drawBay(ctx: CanvasRenderingContext2D, t: number): void {
    const S = this.S, x0 = this.bx, W = this.cols * S, H = this.rows * S, y0 = this.by - H;
    // Boden der Bucht (Gitter, halbdurchsichtig – man sieht den Planeten darunter)
    ctx.fillStyle = 'rgba(10,18,26,0.72)';
    ctx.fillRect(x0, y0, W, H);
    // Hüllenwände
    for (const x of [x0 - 14, x0 + W]) {
      const g = ctx.createLinearGradient(x, 0, x + 14, 0);
      g.addColorStop(0, '#2a3644');
      g.addColorStop(0.5, '#4a5a6c');
      g.addColorStop(1, '#2a3644');
      ctx.fillStyle = g;
      ctx.fillRect(x, y0 - 4, 14, H + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let y = y0 + 8; y < y0 + H; y += 18) { ctx.beginPath(); ctx.arc(x + 7, y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    }
    // offene Kante oben: Warnstreifen
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0 - 8, W, 8);
    ctx.clip();
    for (let k = -2; k < W / 10 + 2; k++) {
      ctx.fillStyle = k % 2 ? 'rgba(255,181,71,0.55)' : 'rgba(20,20,20,0.6)';
      ctx.beginPath();
      ctx.moveTo(x0 + k * 10, y0); ctx.lineTo(x0 + k * 10 + 8, y0 - 8); ctx.lineTo(x0 + k * 10 + 18, y0 - 8); ctx.lineTo(x0 + k * 10 + 10, y0);
      ctx.fill();
    }
    ctx.restore();
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,181,71,0.75)';
    ctx.fillText('OFFEN ZUM ALL', x0 + W / 2, y0 - 14);
    // Slots mit Magnetklammern
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const px = x0 + c * S, py = this.by - (r + 1) * S;
      ctx.strokeStyle = 'rgba(110,160,190,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2.5, py + 2.5, S - 5, S - 5);
      if (this.occupied(c, r)) continue;
      // Klammerpads: nur am Zielplatz aktiv
      const tg = this.target, cur = this.current;
      const on = !!tg && !!cur && c >= tg[0] && c < tg[0] + cur.cw && r >= tg[1] && r < tg[1] + cur.ch;
      ctx.fillStyle = on ? rgba('#7fd8ff', 0.8) : 'rgba(127,216,255,0.16)';
      for (const [ox, oy] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) {
        ctx.beginPath();
        ctx.arc(px + ox * S, py + oy * S, S * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      // Reihenhinweis für die Lieferreihenfolge (A an der Luke, unten)
      if (this.stops > 1 && c === 0) {
        const k = Math.min(this.stops - 1, Math.floor((r / this.rows) * this.stops));
        ctx.fillStyle = rgba(STOP_COLORS[k], 0.35);
        ctx.fillRect(x0 - 3, py + 4, 3, S - 8);
      }
    }
    void t;
  }

  /** Schubachse und Schwerpunkt mit Drehmoment-Pfeil */
  private drawAxis(ctx: CanvasRenderingContext2D, t: number): void {
    const [ax, ay0] = this.toPx(this.cols / 2, 0), [, ay1] = this.toPx(0, this.rows);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(159,216,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay0);
    ctx.lineTo(ax, ay1);
    ctx.stroke();
    ctx.setLineDash([]);
    // Beschriftung senkrecht an der Achse
    ctx.save();
    ctx.translate(ax - 4, ay1 + 8);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(159,216,255,0.6)';
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('SCHUBACHSE', 0, 0);
    ctx.restore();
    let m = 0, mx = 0, my = 0;
    for (const b of this.boxes) if (b.state === 'clamped' || b.state === 'fixed') { m += b.mass; mx += b.mass * b.x; my += b.mass * b.y; }
    if (m) {
      const [cx, cy] = this.toPx(mx / m, my / m);
      const off = this.comOffset();
      const col = Math.abs(off) <= 5 ? '#6be38f' : Math.abs(off) <= 15 ? '#ffb547' : '#ff6b6b';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 9, (k * Math.PI) / 2, (k * Math.PI) / 2 + Math.PI / 2);
        ctx.closePath();
        if (k % 2 === 0) ctx.fill();
      }
      // Hebelarm zur Achse und Drehmomentpfeil
      if (Math.abs(off) > 2) {
        ctx.strokeStyle = rgba(col, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, cy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        const dir = Math.sign(off);
        ctx.beginPath();
        ctx.arc(ax, cy, 22, -Math.PI / 2 - dir * 0.2, -Math.PI / 2 + dir * 1.1, dir < 0);
        ctx.stroke();
        const ea = -Math.PI / 2 + dir * 1.1;
        const ex = ax + Math.cos(ea) * 22, ey = cy + Math.sin(ea) * 22;
        // Pfeilspitze tangential zur Drehrichtung
        const tx = -Math.sin(ea) * dir, ty = Math.cos(ea) * dir;
        ctx.beginPath();
        ctx.moveTo(ex + tx * 7, ey + ty * 7);
        ctx.lineTo(ex - ty * 4, ey + tx * 4);
        ctx.lineTo(ex + ty * 4, ey - tx * 4);
        ctx.closePath();
        ctx.fillStyle = rgba(col, 0.8);
        ctx.fill();
      }
    }
    ctx.restore();
    void t;
  }

  /**
   * Ablegen: Die Bugdüsen an beiden vorderen Ecken stoßen zur Station hin aus und schieben das Schiff weg
   * (Rückstoß). Liegt der Schwerpunkt neben der Achse, erzeugt derselbe Schub ein Drehmoment – die Düse auf der
   * schweren Seite muss stärker arbeiten, und das Schiff dreht trotzdem ein wenig.
   */
  private drawThrust(ctx: CanvasRenderingContext2D, t: number): void {
    const off = this.comOffset();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) {
      const [x, y] = this.toPx(side < 0 ? 0.15 : this.cols - 0.15, 0);
      // schwere Seite (Schwerpunkt dort) braucht mehr Schub
      const k = clamp(1 + (side * off) / 40, 0.3, 2);
      const L = (18 + Math.random() * 8) * k;
      // Ausstoß zur Station hin (nach unten) – der Rückstoß schiebt das Schiff weg (nach oben)
      const g = ctx.createLinearGradient(x, y, x, y + L);
      g.addColorStop(0, rgba('#e8f4ff', 0.9));
      g.addColorStop(0.4, rgba('#7fd8ff', 0.5));
      g.addColorStop(1, rgba('#7fd8ff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + L);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    void t;
  }

  private drawBox(ctx: CanvasRenderingContext2D, b: Box, t: number): void {
    const S = this.S;
    const [px, py] = this.toPx(b.x, b.y);
    const w = b.cw * S * 0.9, h = b.ch * S * 0.9;
    const ware = WARES[b.ware];
    const fixed = b.state === 'fixed';
    const sc = 1 + (1 - b.snap) * 0.08;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sc, sc);
    // Schatten (treibende Container schweben „höher“)
    if (b.state === 'float' || b.state === 'held') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, -w / 2 + 5, -h / 2 + 7, w, h, 4);
      ctx.fill();
    }
    // Korpus mit Rippen
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, fixed ? '#5a5f66' : '#6b7684');
    g.addColorStop(1, fixed ? '#2e3238' : '#323a46');
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let x = -w / 2 + 6; x < w / 2 - 3; x += 5) { ctx.beginPath(); ctx.moveTo(x, -h / 2 + 4); ctx.lineTo(x, h / 2 - 4); ctx.stroke(); }
    // Warenstreifen
    ctx.fillStyle = fixed ? 'rgba(160,160,160,0.6)' : ware.color;
    ctx.fillRect(-w / 2, -h / 2 + h * 0.12, w, h * 0.16);
    // Kanten
    ctx.strokeStyle = b.hit > 0 ? rgba('#ffd0a0', 0.5 + 0.5 * b.hit) : 'rgba(220,235,245,0.4)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, -w / 2 + 0.7, -h / 2 + 0.7, w - 1.4, h - 1.4, 4);
    ctx.stroke();
    // Zielstation und Masse
    if (!fixed) {
      if (this.stops > 1) {
        ctx.fillStyle = STOP_COLORS[b.stop];
        ctx.beginPath();
        ctx.arc(-w / 2 + S * 0.2, h / 2 - S * 0.22, S * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#05101a';
        ctx.font = `700 ${Math.round(S * 0.2)}px "Chakra Petch", Barlow, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(STOP_NAMES[b.stop], -w / 2 + S * 0.2, h / 2 - S * 0.21);
      }
      ctx.fillStyle = '#eef6ff';
      ctx.font = `700 ${Math.round(S * 0.22)}px "Chakra Petch", Barlow, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${String(Math.round(b.mass * 10) / 10).replace('.', ',')} t`, w / 2 - S * 0.08, h / 2 - S * 0.21);
    } else {
      ctx.fillStyle = 'rgba(220,220,220,0.7)';
      ctx.font = `600 ${Math.round(S * 0.16)}px "Chakra Petch", Barlow, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`fest ${String(Math.round(b.mass * 10) / 10).replace('.', ',')} t`, 0, h * 0.12);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    // Geschwindigkeitsanzeige treibender Container: Pfeil
    if (b.state === 'float') {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.08) {
        const ux = b.vx / sp, uy = b.vy / sp, L = Math.min(60, sp * 18);
        const sx = px + ux * (w / 2 + 4), sy = py + uy * (h / 2 + 4);
        const col = sp > SNAP_V ? '#ff9a7a' : '#9fffd0';
        ctx.strokeStyle = rgba(col, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + ux * L, sy + uy * L);
        ctx.stroke();
        ctx.fillStyle = rgba(col, 0.8);
        ctx.beginPath();
        ctx.moveTo(sx + ux * (L + 6), sy + uy * (L + 6));
        ctx.lineTo(sx + ux * L - uy * 4, sy + uy * L + ux * 4);
        ctx.lineTo(sx + ux * L + uy * 4, sy + uy * L - ux * 4);
        ctx.closePath();
        ctx.fill();
      }
    }
    void t;
  }

  /**
   * Zwille: Gummiband vom Container zum Finger, Startpfeil in Gegenrichtung, Δv und Tempo,
   * vorausberechnete Bahn (Reichweite nach Stufe) – grün, wenn der Container am Ziel eingefangen wird.
   */
  private drawDrag(ctx: CanvasRenderingContext2D, t: number): void {
    const d = this.drag;
    if (!d || !d.box || Math.hypot(d.x - d.sx, d.y - d.sy) < 14) return;
    const b = d.box;
    const [jx, jy] = this.impulse(d);
    const [px, py] = this.toPx(b.x, b.y);
    const J = Math.hypot(jx, jy);
    const vx = b.vx + jx / b.mass, vy = b.vy + jy / b.mass;
    const v = Math.min(V_MAX, Math.hypot(vx, vy));
    ctx.save();
    // Gummiband
    const k = J / PULL_MAX;
    ctx.strokeStyle = rgba(k >= 0.999 ? '#ffb547' : '#7fd8ff', 0.7);
    ctx.lineWidth = 2 + 3 * (1 - k);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    const fx = px - jx / PULL, fy = py + jy / PULL;
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba('#7fd8ff', 0.5);
    ctx.beginPath();
    ctx.arc(fx, fy, 7, 0, Math.PI * 2);
    ctx.fill();
    // Bahnvorhersage
    const horizon = this.mutator?.id === 'dark' ? 0.35 : PREDICT[this.level];
    const p = this.predict(b, vx * (v / Math.max(1e-6, Math.hypot(vx, vy))), vy * (v / Math.max(1e-6, Math.hypot(vx, vy))), horizon);
    const col = p.caught ? '#6be38f' : p.out ? '#ff6b6b' : '#ffd27a';
    p.pts.forEach(([x, y], i) => {
      const [qx, qy] = this.toPx(x, y);
      ctx.globalAlpha = 0.95 - (i / p.pts.length) * 0.75;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(qx, qy, i % 4 === 0 ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (p.caught) {
      const [qx, qy] = this.toPx(...p.pts[p.pts.length - 1]);
      ctx.strokeStyle = '#6be38f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(qx, qy, 10 + 2 * Math.sin(t * 10), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Anzeige: Δv und Tempo (rot: zu schnell zum Einfangen am Ziel)
    ctx.font = '700 12px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    ctx.fillText(`Δv ${(J / b.mass).toFixed(1).replace('.', ',')} · v ${v.toFixed(1).replace('.', ',')}${p.caught ? ' · TREFFER' : ''}`, clamp(fx, 90, this.w - 90), fy + 26);
    ctx.restore();
  }

  /** Magnetfeld des Zielplatzes: rotierende Feldlinien, Bremsglühen, Klammern */
  private drawTarget(ctx: CanvasRenderingContext2D, t: number): void {
    const tg = this.target, cur = this.current;
    if (!tg || !cur || this.endT >= 0) return;
    const [cx, cy] = this.toPx(tg[0] + cur.cw / 2, tg[1] + cur.ch / 2);
    const S = this.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const R = WELL_R * S;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, rgba('#7fd8ff', 0.28));
    g.addColorStop(1, rgba('#7fd8ff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    // Feldlinien laufen zur Mitte
    ctx.strokeStyle = rgba('#9fe8ff', 0.45);
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const f = ((t * 0.7 + k / 3) % 1);
      ctx.globalAlpha = f;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * (1 - f) * (cur.cw > 1 ? 1.3 : 1), R * (1 - f), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Rahmen mit Klammern
    const w = cur.cw * S * 0.94, h = cur.ch * S * 0.94;
    ctx.strokeStyle = rgba('#7fd8ff', 0.7 + 0.3 * Math.sin(t * 5));
    ctx.lineWidth = 2;
    const L = S * 0.18;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + (sx * w) / 2, y = cy + (sy * h) / 2;
      ctx.beginPath();
      ctx.moveTo(x - sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * L);
      ctx.stroke();
    }
    // Wirbelstrombremse: Glühen am bremsenden Container
    for (const b of this.floating) {
      if (b.brake < 0.05) continue;
      const [bx, by] = this.toPx(b.x, b.y);
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, S * 0.6);
      bg.addColorStop(0, rgba('#bfefff', 0.35 * b.brake));
      bg.addColorStop(1, 'rgba(127,216,255,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, S * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Wartungsdrohnen: kreuzen die Bucht auf festen Bahnen */
  private drawDrones(ctx: CanvasRenderingContext2D, t: number): void {
    for (const d of this.drones) {
      const [x, y] = this.toPx(...this.dronePos(d, this.simT));
      const R = 0.3 * this.S;
      // Bahn
      ctx.strokeStyle = 'rgba(255,181,71,0.15)';
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(this.bx + 4, y);
      ctx.lineTo(this.bx + this.cols * this.S - 4, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const sp = shipSprite('split-drohne', 'split-drohne');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sign(d.vx) * Math.PI / 2);
      if (sp) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sp.img, -R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
      } else {
        ctx.fillStyle = '#3a4656';
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffb547';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = Math.sin(t * 8 + d.ph) > 0 ? '#ffb547' : 'rgba(255,181,71,0.3)';
      ctx.beginPath();
      ctx.arc(x, y - R - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Hinweis unten: was als Nächstes zu tun ist */
  private drawHint(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.endT >= 0) return;
    const cur = this.current;
    let text = '';
    if (this.drag?.box) text = 'Loslassen: Schuss · zurück zum Container: Abbruch';
    else if (cur?.state === 'held') text = this.targetPicked ? 'Container zu dir ziehen und loslassen' : 'Ziel antippen – oder gleich ziehen und schießen';
    else if (cur?.state === 'float') text = 'Antippen: Traktorstrahl stoppt · ziehen: neuer Schuss';
    if (!text) return;
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba('#cfe8f0', 0.75 + 0.15 * Math.sin(t * 3));
    ctx.fillText(text, this.w / 2, this.h - 18);
  }

  /** Warteschlange in der Station (unten) */
  private drawQueue(ctx: CanvasRenderingContext2D, t: number): void {
    const q = this.queue;
    if (!q.length) return;
    const S = Math.min(22, this.S * 0.4);
    let x = 14;
    const y = this.by + this.S * 0.42;
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(169,195,198,0.8)';
    ctx.fillText(`WARTET: ${q.length}`, 14, y - 4);
    for (const b of q.slice(0, 10)) {
      const w = S * b.cw;
      ctx.fillStyle = '#4a5664';
      ctx.fillRect(x, y, w - 3, S - 3);
      ctx.fillStyle = WARES[b.ware].color;
      ctx.fillRect(x, y + 2, w - 3, 3);
      if (this.stops > 1) { ctx.fillStyle = STOP_COLORS[b.stop]; ctx.fillRect(x + 2, y + S - 9, 5, 5); }
      x += w + 2;
      if (x + S * 2 > this.toPx(this.hatch[0], 0)[0] - 8) break;
    }
    void t;
  }

  private drawFinale(ctx: CanvasRenderingContext2D): void {
    const f = this.finale!;
    const k = clamp(this.endT / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = k;
    const w = Math.min(this.w - 40, 300), h = 120, x = (this.w - w) / 2, y = TOP + 60;
    ctx.fillStyle = 'rgba(5,14,22,0.88)';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,220,205,0.4)';
    ctx.stroke();
    ctx.font = '700 15px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f6ff';
    ctx.fillText('Ablegen', this.w / 2, y + 24);
    ctx.font = '600 12px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    const rows: [string, string][] = [
      ['Ladezeit', `${this.time.toFixed(1).replace('.', ',')} s`],
      ['Umräumen', `+${(f.swaps * PEN_SWAP).toFixed(0)} s`],
      ['Steuerdüsen (Schwerpunkt)', `+${(f.penalty - f.swaps * PEN_SWAP - (this.queue.length + this.floating.length) * PEN_LEFT).toFixed(1).replace('.', ',')} s`],
      ['Abfertigung gesamt', `${f.total.toFixed(1).replace('.', ',')} s`],
    ];
    rows.forEach(([a, b], i) => {
      ctx.fillStyle = i === 3 ? '#ffd27a' : 'rgba(200,220,230,0.85)';
      ctx.fillText(a, x + 14, y + 46 + i * 18);
      ctx.textAlign = 'right';
      ctx.fillText(b, x + w - 14, y + 46 + i * 18);
      ctx.textAlign = 'left';
    });
    ctx.restore();
  }
}
