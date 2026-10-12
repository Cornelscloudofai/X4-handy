// Minispiel „Frachtraum“: Container in Schwerelosigkeit in die Ladebucht stoßen.
// Physik statt Erdgewohnheit:
// - Keine Reibung: Ein angestoßener Container treibt geradeaus weiter, bis ein Gegenstoß ihn bremst oder eine
//   Magnetklammer ihn fängt (die Klammer hält nur langsame Container).
// - Masse: Derselbe Stoß (Impuls) bringt einen schweren Container kaum in Fahrt, einen leichten schnell (v = J/m).
// - Stöße zwischen Containern erhalten den Impuls: der schwere schiebt den leichten weg.
// - Kein „Unten“: Wichtig ist allein der Schwerpunkt – und davon nur der Abstand zur Schubachse, denn nur er erzeugt
//   beim Beschleunigen ein Drehmoment. Schiefe Beladung kostet Steuerdüsenzeit beim Ablegen.
// - Die Bucht ist zum All hin offen: was hinaustreibt, muss eine Drohne zurückholen.
// Dazu die Lieferreihenfolge: Ware für die erste Station gehört an die Luke, sonst muss beim Entladen umgeräumt werden.
// Ab Stufe 4 driften Station und Schiff gegeneinander – die Container kommen mit Eigengeschwindigkeit heraus.
import { sfx } from '../ui/sound';
import { BG_IMAGES } from '../render/bgImages';
import {
  buzz, clamp, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, roundRect, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

/** Zeitlimit der Runde (s) */
const LIMIT = 120;
/** Klammer fängt nur langsamer als (Slotgrößen je Sekunde) */
const CAPTURE = 1.1;
/** Stoß: Impuls je Pixel Zuglänge (Masse 1 → Slots/s) */
const PUSH = 0.03;
/** Größter Impuls */
const PUSH_MAX = 4.5;
/** Strafzeiten (s) */
const PEN_SWAP = 4;
const PEN_LOST = 6;
const PEN_LEFT = 10;
/** Abfertigungszeit für 3/2/1 Sterne je Stufe (s): weniger ist besser */
const TARGET: Record<Level, [number, number, number]> = { 1: [40, 60, 85], 2: [55, 78, 105], 3: [70, 95, 125], 4: [80, 108, 140], 5: [90, 120, 155] };

export const CARGO_MUTATORS: Mutator[] = [
  { id: 'heavy', name: 'Schwerlast', desc: 'Alle Container doppelt so schwer', mult: 1.3 },
  { id: 'bouncy', name: 'Prallwände', desc: 'Die Wände federn voll zurück', mult: 1.2 },
  { id: 'drift', name: 'Relativdrift', desc: 'Station und Schiff treiben gegeneinander', mult: 1.4 },
  { id: 'dark', name: 'Notbeleuchtung', desc: 'Keine vorausberechnete Bahn', mult: 1.5 },
];

export const CARGO_GOALS: GoalDef[] = [
  { id: 'order', text: 'Keine Umräumung beim Entladen' },
  { id: 'balance', text: 'Schwerpunkt höchstens 5 % neben der Achse' },
  { id: 'nolost', text: 'Kein Container treibt ins All' },
  { id: 'clean', text: 'Fünf Container mit je einem Stoß verladen' },
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
  state: 'queue' | 'float' | 'clamped' | 'lost' | 'fixed';
  /** Ankerslot, wenn festgeklammert */
  c0: number; r0: number;
  pushes: number;
  /** Einrast-Animation */
  snap: number;
  hit: number;
}

interface Drag { id: number; box: Box; sx: number; sy: number; x: number; y: number }

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
    'Container antippen und in die Wunschrichtung ziehen: Pfeil = Stoß (Impuls), loslassen = stoßen',
    'Keine Reibung: der Container treibt, bis du gegenstößt oder eine Klammer ihn fängt – Klammern fangen nur langsame',
    'Schwere Container (t) kommen bei gleichem Stoß kaum in Fahrt',
    'Ware für A an die Luke (oben), dann B, dann C – sonst wird beim Entladen umgeräumt',
    'Schwerpunkt auf die Schubachse (Mittellinie) bringen; unten ist die Bucht zum All offen',
    'Festgeklammerten Container wieder anstoßen: löst die Klammer',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  private level: Level;
  private r: () => number;
  private score: Score;
  private cols: number;
  private rows: number;
  private boxes: Box[] = [];
  private stops: number;
  private time = 0;
  private lost = 0;
  private cleanCount = 0;
  private drift = 0;
  private rest: number;
  private drag: Drag | null = null;
  private auto: { box: Box; tc: number; tr: number; cd: number } | null = null;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(120, 31);
  private w = 1;
  private h = 1;
  /** Slotgröße (px) und Lage der Bucht */
  private S = 60;
  private bx = 0;
  private by = 0;
  private done: GameResult | null = null;
  private endT = -1;
  private finale: { penalty: number; swaps: number; com: number; total: number } | null = null;
  private bgCache: HTMLCanvasElement | null = null;
  private nextId = 1;

  constructor(cfg: GameCfg) {
    const L = (this.level = cfg.level);
    this.r = rng(cfg.seed);
    this.mutator = findMutator(CARGO_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 4);
    this.cols = L >= 3 ? 5 : 4;
    this.rows = L >= 4 ? 6 : 5;
    this.stops = L === 1 ? 1 : L === 2 ? 2 : 3;
    this.rest = this.mutator?.id === 'bouncy' ? 1 : 0.55;
    if (L >= 4 || this.mutator?.id === 'drift') this.drift = (this.r() < 0.5 ? -1 : 1) * (0.35 + this.r() * 0.3) * (L >= 5 ? 1.3 : 1);
    const n = [7, 9, 10, 11, 12][L - 1];
    const heavy = this.mutator?.id === 'heavy' ? 2 : 1;
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
      this.boxes.push(this.mkBox(big ? 2 : 1, 1, ware, stop, 'queue', 0, 0, heavy * (big ? 2 : 1)));
    }
    this.intro = `Lade ${n} Container in die Bucht deines Frachters – in Schwerelosigkeit. Ein Stoß setzt einen Container in Bewegung, und er treibt weiter, bis du gegenstößt oder eine Magnetklammer ihn fängt. `
      + (this.stops > 1 ? 'Ware für die erste Station (A) gehört nach oben an die Luke. ' : '')
      + 'Achte auf den Schwerpunkt: Liegt er neben der Schubachse, dreht sich das Schiff beim Ablegen.'
      + (this.drift ? ' Station und Schiff treiben gegeneinander – die Container kommen schon mit Schwung heraus.' : '');
    const pool = CARGO_GOALS.filter((g) => this.stops > 1 || g.id !== 'order');
    this.goals = pickGoals(pool, rng(cfg.seed ^ 0x77));
  }

  private mkBox(cw: number, ch: number, ware: number, stop: number, state: Box['state'], c0: number, r0: number, massMul: number): Box {
    const b: Box = { id: this.nextId++, cw, ch, x: 0, y: 0, vx: 0, vy: 0, mass: WARES[ware].mass * massMul, ware, stop, state, c0, r0, pushes: 0, snap: 1, hit: 0 };
    if (state === 'fixed') { b.x = c0 + cw / 2; b.y = r0 + ch / 2; b.mass = 6 * massMul; }
    return b;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.bgCache = null;
    const areaH = h - TOP - 190;
    this.S = Math.floor(Math.min((w - 48) / this.cols, areaH / this.rows));
    this.bx = (w - this.cols * this.S) / 2;
    this.by = TOP + 100;
  }

  // ---------- Hilfen ----------

  private toPx(x: number, y: number): [number, number] { return [this.bx + x * this.S, this.by + y * this.S]; }
  private toSlot(px: number, py: number): [number, number] { return [(px - this.bx) / this.S, (py - this.by) / this.S]; }

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
  private get queue(): Box[] { return this.boxes.filter((b) => b.state === 'queue'); }
  private get loaded(): Box[] { return this.boxes.filter((b) => b.state === 'clamped'); }
  private get total(): number { return this.boxes.filter((b) => b.state !== 'fixed').length; }

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
      // b (später) blockiert a (früher), wenn b in einer gemeinsamen Spalte über a liegt
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

  // ---------- Steuerung ----------

  private boxAt(px: number, py: number): Box | null {
    const [x, y] = this.toSlot(px, py);
    let best: Box | null = null, bd = 0.9;
    for (const b of this.boxes) {
      if (b.state !== 'float' && b.state !== 'clamped') continue;
      const dx = Math.max(0, Math.abs(x - b.x) - b.cw * 0.45), dy = Math.max(0, Math.abs(y - b.y) - b.ch * 0.45);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  pointerDown(id: number, x: number, y: number): void {
    if (this.drag || this.endT >= 0) return;
    const b = this.boxAt(x, y);
    if (b) this.drag = { id, box: b, sx: x, sy: y, x, y };
  }

  pointerMove(id: number, x: number, y: number): void {
    if (this.drag?.id === id) { this.drag.x = x; this.drag.y = y; }
  }

  pointerUp(id: number): void {
    const d = this.drag;
    if (!d || d.id !== id) return;
    this.drag = null;
    const [jx, jy] = this.impulse(d);
    if (Math.hypot(jx, jy) < 0.15) return;
    this.push(d.box, jx, jy);
  }

  /** Impuls aus der Zugstrecke (Richtung = Zugrichtung) */
  private impulse(d: Drag): [number, number] {
    let jx = (d.x - d.sx) * PUSH, jy = (d.y - d.sy) * PUSH;
    const l = Math.hypot(jx, jy);
    if (l > PUSH_MAX) { jx *= PUSH_MAX / l; jy *= PUSH_MAX / l; }
    return [jx, jy];
  }

  /** Stoß: Geschwindigkeitsänderung = Impuls / Masse; löst eine Klammer */
  push(b: Box, jx: number, jy: number): void {
    if (b.state === 'clamped') { b.state = 'float'; this.floats.add(...this.toPx(b.x, b.y - 0.6), 'Klammer gelöst', '#9fd8ff', 12); }
    if (b.state !== 'float') return;
    b.vx += jx / b.mass;
    b.vy += jy / b.mass;
    b.pushes++;
    const [px, py] = this.toPx(b.x, b.y);
    // Stoßwelle der Ladedrohne
    this.fx.add({ x: px - jx * 8, y: py - jy * 8, color: '#7fd8ff', size: 6, kind: 'ring', max: 0.35 });
    for (let k = 0; k < 6; k++) this.fx.add({ x: px, y: py, vx: -jx * 40 + (Math.random() - 0.5) * 60, vy: -jy * 40 + (Math.random() - 0.5) * 60, color: '#bfefff', size: 1.6, kind: 'spark', max: 0.3 });
    sfx.tap();
  }

  /** Nur für Tests: Autopilot (Zielslot nach Reihenfolge und Schwerpunkt; erst über die Spalte, dann hinab; Stöße nur bei großer Abweichung) */
  autopilot(): void {
    if (this.auto && this.auto.box.state !== 'float') this.auto = null;
    if (!this.auto) {
      for (const b of this.floating) {
        const slot = this.pickSlot(b);
        if (slot) { this.auto = { box: b, tc: slot[0], tr: slot[1], cd: 0 }; break; }
      }
      if (!this.auto) return;
    }
    const s = this.auto!;
    s.cd -= 1 / 60;
    if (s.cd > 0) return;
    const b = s.box;
    const tx = s.tc + b.cw / 2, ty = s.tr + b.ch / 2;
    // Wegpunkt: erst auf Höhe der obersten Reihe über die Zielspalte
    const lane = 0.5;
    const [wx, wy, last] = Math.abs(b.x - tx) > 0.12 && b.y < ty - 0.3 ? [tx + Math.sign(tx - b.x) * 0.3, Math.min(lane, ty), false] : [tx, ty, true];
    const dx = wx - b.x, dy = wy - b.y, d = Math.hypot(dx, dy);
    // unterwegs schneller als die Fanggrenze (sonst greift eine falsche Klammer), am Ziel langsam
    const want = last ? Math.min(2.4, 0.5 + d * 1.1, d < 0.7 ? CAPTURE * 0.7 : 9) : clamp(0.4 + d * 1.6, CAPTURE * 1.4, 2.4);
    const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 0;
    const ex = ux * want - b.vx, ey = uy * want - b.vy;
    if (Math.hypot(ex, ey) > 0.45) { this.push(b, ex * b.mass, ey * b.mass); s.cd = 0.2; }
  }

  /** Zielslot für den Autopiloten: Reihenfolge (A oben), Schwerpunkt ausgleichen */
  private pickSlot(b: Box): [number, number] | null {
    let best: [number, number] | null = null, bs = Infinity;
    const com = this.comOffset();
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!this.fits(b, c, r)) continue;
      // erreichbar von oben (Luke): darüber muss die Spalte frei sein
      let open = true;
      for (let rr = 0; rr < r && open; rr++) for (let cc = c; cc < c + b.cw; cc++) if (this.occupied(cc, rr)) open = false;
      if (!open) continue;
      // nicht über einer Lücke parken (sonst wird die Lücke unerreichbar)
      if (r + 1 < this.rows && this.fits(b, c, r + 1)) continue;
      const cx = c + b.cw / 2;
      // gewünschte Reihe nach Station: A oben, C unten
      const want = this.stops > 1 ? (b.stop / (this.stops - 1)) * (this.rows - 1) : this.rows - 1;
      let s = Math.abs(r - want) * 1.5;
      // Schwerpunkt: schwere Container auf die Gegenseite
      s += ((cx - this.cols / 2) * Math.sign(com || 1) * b.mass) * 0.4;
      // nichts Späteres darüber blockieren
      for (const o of this.loaded) if (o.stop < b.stop && o.c0 < c + b.cw && c < o.c0 + o.cw && o.r0 > r) s += 6;
      for (const o of this.loaded) if (o.stop > b.stop && o.c0 < c + b.cw && c < o.c0 + o.cw && o.r0 < r) s += 6;
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
    // nächsten Container aus der Luke schieben, sobald die Luke frei ist
    const [h0, h1] = this.hatch;
    const inHatch = this.floating.some((b) => b.y < 0.9 && b.x > h0 - 0.5 && b.x < h1 + 0.5);
    const q = this.queue;
    if (!inHatch && q.length && this.floating.length < 3) {
      const b = q[0];
      b.state = 'float';
      b.x = this.cols / 2;
      b.y = -0.55;
      b.vx = this.drift;
      b.vy = 0.25;
      b.snap = 1;
    }
    // Physik in Teilschritten
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) this.step(h);
    for (const b of this.boxes) { b.snap = Math.min(1, b.snap + dt * 6); b.hit = Math.max(0, b.hit - dt * 3); }
    this.capture();
    setGoal(this.goals, 'nolost', this.lost === 0);
    setGoal(this.goals, 'clean', this.cleanCount >= 5);
    const allIn = !this.queue.length && !this.floating.length;
    if (allIn || this.time >= LIMIT) this.startFinale();
  }

  private step(h: number): void {
    const F = this.floating;
    for (const b of F) { b.x += b.vx * h; b.y += b.vy * h; }
    const e = this.rest;
    const [h0, h1] = this.hatch;
    for (const b of F) {
      const hw = b.cw * 0.45, hh = b.ch * 0.45;
      // Seitenwände (Schiffshülle)
      if (b.x - hw < 0 && b.vx < 0) { b.x = hw; b.vx = -b.vx * e; this.bump(b); }
      if (b.x + hw > this.cols && b.vx > 0) { b.x = this.cols - hw; b.vx = -b.vx * e; this.bump(b); }
      // oben: Stationswand, nur die Luke ist offen (dort zurück in die Station)
      if (b.y - hh < 0 && b.vy < 0) {
        const inHatch = b.x - hw > h0 && b.x + hw < h1;
        if (!inHatch) { b.y = hh; b.vy = -b.vy * e; this.bump(b); }
        else if (b.y < -0.9) {
          // zurück in die Station: hinten anstellen
          b.state = 'queue'; b.vx = 0; b.vy = 0;
          this.boxes.splice(this.boxes.indexOf(b), 1);
          this.boxes.push(b);
          this.time += 2;
          this.floats.add(...this.toPx(this.cols / 2, -0.6), 'Zurück in die Station +2 s', '#ffb547', 13);
        }
      }
      // unten offen: ins All
      if (b.y - hh > this.rows + 0.2) {
        b.state = 'lost';
        this.lost++;
        this.floats.add(...this.toPx(b.x, this.rows), `Ins All getrieben! +${PEN_LOST} s`, '#ff9aa4', 14);
        sfx.warn();
        buzz(40);
        // Bergungsdrohne bringt ihn zurück in die Warteschlange
        b.state = 'queue'; b.vx = 0; b.vy = 0;
        this.boxes.splice(this.boxes.indexOf(b), 1);
        this.boxes.push(b);
        this.time += PEN_LOST;
      }
    }
    // Stöße zwischen Containern (achsparallele Kästen, Impulserhaltung)
    const solid = this.boxes.filter((b) => b.state === 'float' || b.state === 'clamped' || b.state === 'fixed');
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (a.state !== 'float' && b.state !== 'float') continue;
      const ox = (a.cw + b.cw) * 0.45 - Math.abs(a.x - b.x), oy = (a.ch + b.ch) * 0.45 - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      const ia = a.state === 'float' ? 1 / a.mass : 0, ib = b.state === 'float' ? 1 / b.mass : 0;
      let nx = 0, ny = 0, pen = 0;
      if (ox < oy) { nx = Math.sign(b.x - a.x) || 1; pen = ox; } else { ny = Math.sign(b.y - a.y) || 1; pen = oy; }
      // auseinanderschieben nach Masse
      const k = pen / (ia + ib);
      a.x -= nx * k * ia; a.y -= ny * k * ia;
      b.x += nx * k * ib; b.y += ny * k * ib;
      const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vrel >= 0) continue;
      const jn = (-(1 + e) * vrel) / (ia + ib);
      a.vx -= jn * nx * ia; a.vy -= jn * ny * ia;
      b.vx += jn * nx * ib; b.vy += jn * ny * ib;
      if (Math.abs(vrel) > 0.4) {
        a.hit = b.hit = 1;
        const [px, py] = this.toPx((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.fx.burst(px, py, '#ffd0a0', 6, 90, 1.4, 'spark', 0.25);
        sfx.tap();
      }
    }
  }

  private bump(b: Box): void {
    if (Math.hypot(b.vx, b.vy) < 0.3) return;
    b.hit = 1;
    const [px, py] = this.toPx(b.x, b.y);
    this.fx.burst(px, py, '#ffd0a0', 5, 80, 1.2, 'spark', 0.2);
  }

  /** Magnetklammern: fangen langsame Container über einem freien, passenden Platz */
  private capture(): void {
    for (const b of this.floating) {
      const sp = Math.hypot(b.vx, b.vy);
      // erst nach dem ersten Stoß: frisch ausgestoßene Container treiben noch frei
      if (sp > CAPTURE || !b.pushes) continue;
      const c0 = Math.round(b.x - b.cw / 2), r0 = Math.round(b.y - b.ch / 2);
      const tx = c0 + b.cw / 2, ty = r0 + b.ch / 2;
      if (Math.hypot(tx - b.x, ty - b.y) > 0.32 || !this.fits(b, c0, r0)) continue;
      b.state = 'clamped';
      b.c0 = c0; b.r0 = r0;
      b.x = tx; b.y = ty;
      b.vx = b.vy = 0;
      b.snap = 0;
      const [px, py] = this.toPx(tx, ty);
      this.fx.add({ x: px, y: py, color: '#7fd8ff', size: this.S * 0.35, kind: 'ring', max: 0.45 });
      this.fx.burst(px, py, '#9fe8ff', 10, 120, 1.3, 'spark', 0.3);
      // sauberer Stoß: mit einem einzigen Stoß verladen → Kombo
      if (b.pushes <= 1) { this.cleanCount++; this.score.bump(0.5, 999); } else this.score.reset();
      const p = this.score.add(100);
      this.floats.add(px, py - this.S * 0.5, b.pushes <= 1 ? `Sauber +${p}` : `+${p}`, b.pushes <= 1 ? '#9fffd0' : '#ffd27a', 13);
      sfx.coin();
    }
  }

  private startFinale(): void {
    if (this.endT >= 0) return;
    this.endT = 0;
    this.drag = null;
    const swaps = this.swaps();
    const com = Math.abs(this.comOffset());
    const left = this.queue.length + this.floating.length;
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
    const left = this.queue.length + this.floating.length;
    const stars = left > this.total / 2 ? 0 : starsFor(-f.total, -t1, -t2, -t3);
    // Punkte: Zeitbonus
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
        ...(this.stops > 1 ? [['Umräumungen beim Entladen', `${f.swaps} (+${f.swaps * PEN_SWAP} s)`] as [string, string]] : []),
        ['Schwerpunkt neben der Achse', `${Math.round(f.com)} %`],
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
      dy = k * k * 60;
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
    for (const b of this.boxes) if (b.state === 'float') this.drawBox(ctx, b, t);
    this.drawDrag(ctx, t);
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    this.drawQueue(ctx, t);
    if (this.endT >= 0 && this.finale) this.drawFinale(ctx);
  }

  /** Station oben: Hüllenband mit Ladeluke und Warnlichtern */
  private drawStation(ctx: CanvasRenderingContext2D, t: number): void {
    const S = this.S;
    const y1 = this.by - S * 0.12;
    const [h0, h1] = this.hatch;
    const [hx0] = this.toPx(h0, 0), [hx1] = this.toPx(h1, 0);
    const g = ctx.createLinearGradient(0, TOP, 0, y1);
    g.addColorStop(0, '#1a222c');
    g.addColorStop(1, '#2c3846');
    ctx.fillStyle = g;
    ctx.fillRect(0, TOP + 10, this.w, y1 - TOP - 10);
    ctx.fillStyle = 'rgba(4,8,14,0.85)';
    ctx.fillRect(hx0, y1 - S * 0.9, hx1 - hx0, S * 0.9);
    // Paneele und Nieten
    ctx.strokeStyle = 'rgba(160,190,210,0.12)';
    ctx.lineWidth = 1;
    for (let x = 12; x < this.w; x += 46) {
      if (x > hx0 - 4 && x < hx1 + 4) continue;
      ctx.strokeRect(x, TOP + 18, 40, y1 - TOP - 26);
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
      ctx.fillRect(x - 4, y1 - S * 0.95, 8, S * 0.95);
      for (let k = 0; k < 4; k++) {
        const on = Math.floor(t * 4 + k) % 4 === 0;
        ctx.fillStyle = on ? '#ffb547' : 'rgba(255,181,71,0.25)';
        ctx.beginPath();
        ctx.arc(x, y1 - S * 0.85 + k * S * 0.22, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(169,195,198,0.8)';
    ctx.fillText('STATION · LADELUKE', (hx0 + hx1) / 2, TOP + 24);
    if (this.drift) {
      const dir = Math.sign(this.drift);
      ctx.fillStyle = 'rgba(255,181,71,0.85)';
      ctx.fillText(dir > 0 ? 'RELATIVDRIFT →' : '← RELATIVDRIFT', (hx0 + hx1) / 2, TOP + 38);
    }
  }

  /** Ladebucht: Rahmen, Hüllenwände, Magnetklammern; unten offen zum All */
  private drawBay(ctx: CanvasRenderingContext2D, t: number): void {
    const S = this.S, x0 = this.bx, y0 = this.by, W = this.cols * S, H = this.rows * S;
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
    // offene Kante unten: Warnstreifen
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0 + H, W, 8);
    ctx.clip();
    for (let k = -2; k < W / 10 + 2; k++) {
      ctx.fillStyle = k % 2 ? 'rgba(255,181,71,0.55)' : 'rgba(20,20,20,0.6)';
      ctx.beginPath();
      ctx.moveTo(x0 + k * 10, y0 + H + 8); ctx.lineTo(x0 + k * 10 + 8, y0 + H); ctx.lineTo(x0 + k * 10 + 18, y0 + H); ctx.lineTo(x0 + k * 10 + 10, y0 + H + 8);
      ctx.fill();
    }
    ctx.restore();
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,181,71,0.75)';
    ctx.fillText('OFFEN ZUM ALL', x0 + W / 2, y0 + H + 20);
    // Slots mit Magnetklammern
    const floatNear = this.floating;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const px = x0 + c * S, py = y0 + r * S;
      ctx.strokeStyle = 'rgba(110,160,190,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2.5, py + 2.5, S - 5, S - 5);
      if (this.occupied(c, r)) continue;
      // Klammerpads leuchten, wenn ein Container sich langsam genug nähert
      let glow = 0, tooFast = false;
      for (const b of floatNear) {
        const d = Math.hypot(b.x - (c + 0.5), b.y - (r + 0.5));
        if (d < 0.9) { const sp = Math.hypot(b.vx, b.vy); if (sp > CAPTURE) tooFast = true; else glow = Math.max(glow, 1 - d / 0.9); }
      }
      const col = tooFast ? '#ff6b6b' : '#7fd8ff';
      ctx.fillStyle = rgba(col, 0.18 + glow * 0.5 + (tooFast ? 0.25 : 0));
      for (const [ox, oy] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) {
        ctx.beginPath();
        ctx.arc(px + ox * S, py + oy * S, S * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      // Reihenhinweis für die Lieferreihenfolge (A oben)
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
    ctx.lineTo(ax, ay1 + 26);
    ctx.stroke();
    ctx.setLineDash([]);
    // Triebwerkssymbol unten
    ctx.fillStyle = 'rgba(159,216,255,0.6)';
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCHUBACHSE', ax, ay1 + 36);
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
      const g = ctx.createLinearGradient(x, y, x, y - L);
      g.addColorStop(0, rgba('#e8f4ff', 0.9));
      g.addColorStop(0.4, rgba('#7fd8ff', 0.5));
      g.addColorStop(1, rgba('#7fd8ff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y - L);
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
    if (b.state === 'float') {
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
      ctx.fillText(`${b.mass} t`, w / 2 - S * 0.08, h / 2 - S * 0.21);
    } else {
      ctx.fillStyle = 'rgba(220,220,220,0.7)';
      ctx.font = `600 ${Math.round(S * 0.16)}px "Chakra Petch", Barlow, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`fest ${b.mass} t`, 0, h * 0.12);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    // Geschwindigkeitsanzeige treibender Container: Pfeil
    if (b.state === 'float') {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.08) {
        const ux = b.vx / sp, uy = b.vy / sp, L = Math.min(60, sp * 18);
        const sx = px + ux * (w / 2 + 4), sy = py + uy * (h / 2 + 4);
        const col = sp > CAPTURE ? '#ff9a7a' : '#9fffd0';
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

  /** Stoßpfeil und vorausberechnete Bahn (mit Abprallern an den Wänden) */
  private drawDrag(ctx: CanvasRenderingContext2D, t: number): void {
    const d = this.drag;
    if (!d) return;
    const b = d.box;
    const [jx, jy] = this.impulse(d);
    const [px, py] = this.toPx(b.x, b.y);
    const J = Math.hypot(jx, jy);
    const col = J >= PUSH_MAX - 0.01 ? '#ffb547' : '#7fd8ff';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + jx / PUSH, py + jy / PUSH);
    ctx.stroke();
    ctx.font = '700 12px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    const vx = b.vx + jx / b.mass, vy = b.vy + jy / b.mass;
    const v = Math.hypot(vx, vy);
    ctx.fillText(`Δv ${(J / b.mass).toFixed(1).replace('.', ',')} → v ${v.toFixed(1).replace('.', ',')}`, px + jx / PUSH, py + jy / PUSH - 12);
    if (this.mutator?.id !== 'dark' && v > 0.05) {
      // Bahn: geradeaus (keine Reibung), Abpraller an Hülle und Stationswand
      let x = b.x, y = b.y, ux = vx, uy = vy;
      const hw = b.cw * 0.45, hh = b.ch * 0.45;
      ctx.fillStyle = rgba(v > CAPTURE ? '#ff9a7a' : '#9fffd0', 0.8);
      for (let k = 1; k <= 40; k++) {
        const h = 0.08;
        x += ux * h; y += uy * h;
        if (x - hw < 0 && ux < 0) { x = hw; ux = -ux * this.rest; }
        if (x + hw > this.cols && ux > 0) { x = this.cols - hw; ux = -ux * this.rest; }
        if (y - hh < 0 && uy < 0) { y = hh; uy = -uy * this.rest; }
        if (y > this.rows + 0.8) break;
        if (k % 2) continue;
        const [qx, qy] = this.toPx(x, y);
        ctx.globalAlpha = 1 - k / 44;
        ctx.beginPath();
        ctx.arc(qx, qy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    void t;
  }

  /** Warteschlange in der Station (oben) */
  private drawQueue(ctx: CanvasRenderingContext2D, t: number): void {
    const q = this.queue;
    if (!q.length) return;
    const S = Math.min(22, this.S * 0.4);
    let x = 14;
    const y = TOP + 44;
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
