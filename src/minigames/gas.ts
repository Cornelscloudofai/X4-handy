// Minispiel „Gaswirbel“: Gas sammeln und am Mutterschiff sichern.
// Der Tank fasst nur begrenzt viel; erst am Mutterschiff entladene Ladung zählt voll.
// Tiefe:
// - Staudruck: Der Sammler schöpft im Flug – wer zügig durch eine Schwade zieht, sammelt bis fast dreimal so viel
//   wie im Stillstand. Durchflüge statt Schweben.
// - Reinheit: Trübe Fremdgasschwaden belegen Tankplatz und verdünnen die Ladung (Wert × Reinheit). Reine Ladungen
//   (≥ 95 %) bringen 20 % mehr; volle und reine Tanks in Folge erhöhen die Kombo.
// - Sturmzellen kündigen ihren Blitz an (Ring lädt sich auf). Wer im Ring ist, verliert die Hälfte der ungesicherten
//   Ladung. Der Blitz lädt aber auch die Schwaden ringsum auf – aufgeladenes Gas zählt doppelt, solange es glüht.
// - Andocken: Entladen nur bei langsamem Anflug ans Mutterschiff.
// - Böen kündigen sich an und kehren den Wirbel kurz um, der Strudel in der Mitte zieht den Sammler an.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import { BG_IMAGES } from '../render/bgImages';
import { mapShipSprite } from '../render/shipArt';
import { fbm, perlin } from '../render/noise';
import {
  buzz, clamp, drawButton, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

const DURATION = 50;
const UNITS = 50;
/** Gesicherter Wert für 1/2/3 Sterne */
const GOALS: Record<Level, [number, number, number]> = { 1: [10, 17, 25], 2: [10, 17, 26], 3: [10, 17, 26], 4: [10, 16, 25], 5: [9, 15, 24] };
/** Staudruck: ab dieser Geschwindigkeit (px/s) volle Schöpfleistung */
const RAM_SPEED = 210;
/** Andocken nur langsamer als (px/s) */
const DOCK_SPEED = 120;
/** Reinheit für eine „reine Ladung“ */
const PURE = 0.95;
const FOREIGN = '#8c9468';

export const GAS_MUTATORS: Mutator[] = [
  { id: 'storm', name: 'Gewittersturm', desc: 'Zwei zusätzliche Sturmzellen', mult: 1.5 },
  { id: 'gold', name: 'Goldrausch', desc: 'Goldene Schwaden viel häufiger', mult: 1.2 },
  { id: 'leak', name: 'Leckender Tank', desc: 'Ungesicherte Ladung entweicht langsam', mult: 1.4 },
  { id: 'fast', name: 'Wirbelsturm', desc: 'Der Wirbel dreht viel schneller', mult: 1.4 },
  { id: 'smog', name: 'Verschmutzter Nebel', desc: 'Doppelt so viel Fremdgas', mult: 1.3 },
];

export const GAS_GOALS: GoalDef[] = [
  { id: 'nohit', text: 'Kein Blitzeinschlag' },
  { id: 'gold3', text: 'Drei goldene oder aufgeladene Schwaden anzapfen' },
  { id: 'full4', text: 'Viermal mit vollem Tank entladen' },
  { id: 'combo', text: 'Kombo ×2,5 (volle, reine Tanks in Folge)' },
  { id: 'nowaste', text: 'Am Ende nichts mehr ungesichert im Tank' },
  { id: 'noboost', text: 'Ohne Schub auskommen' },
  { id: 'pure3', text: 'Drei reine Ladungen sichern' },
];

interface Blob {
  a: number; d: number; r0: number; amount: number; max: number; dens: number; ph: number; born: number;
  /** goldene Schwade (zählt dreifach) */
  gold: boolean;
  life: number;
  /** Fremdgas: belegt Platz, verdünnt die Ladung */
  foreign: boolean;
  /** Restzeit aufgeladen (Blitz): zählt doppelt */
  charged: number;
  /** Bildvariante */
  v: number;
  /** schon als Gold gezählt */
  counted: boolean;
}
interface Storm {
  a: number; d: number; r: number; ph: number; drift: number;
  state: 'idle' | 'charge' | 'strike';
  t: number;
  /** Blitzäste (nur Darstellung) */
  bolts: [number, number][][];
}

let bgImg: HTMLImageElement | null = null;
function background(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!bgImg) {
    bgImg = new Image();
    bgImg.decoding = 'async';
    bgImg.src = BG_IMAGES.find((b) => b.id === 'wirbel-violett')?.url ?? '';
  }
  return bgImg.complete && bgImg.naturalWidth ? bgImg : null;
}

export class GasGame implements MiniGame {
  readonly eyebrow = 'Gas sammeln';
  readonly title: string;
  readonly intro: string;
  readonly controls = [
    'Finger halten und ziehen: der Sammler folgt',
    'Zügig durch die Schwaden fliegen: Staudruck – im Stillstand sammelt man kaum',
    'Trübes Fremdgas meiden: es verdünnt die Ladung',
    'Leuchtender Ring: gleich schlägt ein Blitz ein – raus da! Danach glüht das Gas ringsum (×2)',
    'Voller Tank? Langsam am Mutterschiff andocken',
    'Taste S: kurzer Schub',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  private level: Level;
  private ware: string;
  private color: string;
  private blobs: Blob[] = [];
  private storms: Storm[] = [];
  private r: () => number;
  private score: Score;
  private time = 0;
  /** Tank: Menge, Wert (gold dreifach, aufgeladen doppelt) und Fremdgasanteil */
  private tank = 0;
  private tankValue = 0;
  private foreign = 0;
  private cap: number;
  private secured = 0;
  private fullUnloads = 0;
  private pureUnloads = 0;
  private unloading = false;
  private unloadStart = 0;
  private unloadForeign = 0;
  private dockWarn = 0;
  private golds = 0;
  private goldTimer = 14;
  private hits = 0;
  private boosts = 0;
  private stun = 0;
  private shake = 0;
  private flash = 0;
  private boostT = 0;
  private boostCd = 0;
  private gustT = 12;
  private gust = 0;
  private gustWarn = 0;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private heading = -Math.PI / 2;
  private target: [number, number] | null = null;
  private pid = -1;
  private sucking = 0;
  /** Staudruck 0–1 (Anzeige) */
  private ram = 0;
  private wispAcc = 0;
  private spinRate: number;
  private swirl = 0;
  private motherA = Math.PI * 0.5;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(110, 23);
  private w = 1;
  private h = 1;
  private cx = 0;
  private cy = 0;
  private S = 100;
  /** Höhe/Breite des Wirbels (Hochformat: gestreckt) */
  private ys = 0.82;
  private art: { clouds: Record<string, HTMLCanvasElement[]>; swirl: HTMLCanvasElement; dark: HTMLCanvasElement } | null = null;
  private bgCache: HTMLCanvasElement | null = null;
  private done: GameResult | null = null;
  private endT = -1;

  constructor(cfg: GameCfg) {
    const level = (this.level = cfg.level);
    this.r = rng(cfg.seed);
    this.mutator = findMutator(GAS_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 4);
    this.ware = cfg.ware && WARES[cfg.ware] ? cfg.ware : ['hydrogen', 'helium', 'methane'][Math.floor(this.r() * 3)];
    this.color = WARES[this.ware]?.color ?? '#5a9dff';
    const name = WARES[this.ware]?.name ?? 'Gas';
    this.title = name;
    this.cap = level >= 3 ? 4.5 : 5;
    const sc = [0, 2, 3, 4, 5][level - 1] + (this.mutator?.id === 'storm' ? 2 : 0);
    const fc = [0, 2, 3, 3, 4][level - 1] * (this.mutator?.id === 'smog' ? 2 : 1) + (this.mutator?.id === 'smog' && level === 1 ? 2 : 0);
    this.intro = `In diesem Wirbel ballt sich ${name}. Zieh zügig durch die Schwaden – der Staudruck füllt den Tank – und dock langsam am Mutterschiff an: nur gesicherte Ladung zählt voll.`
      + (fc ? ' Trübes Fremdgas verdünnt die Ladung.' : '')
      + (sc ? ' Sturmzellen kündigen ihre Blitze mit einem Ring an; was der Blitz trifft, glüht danach und zählt doppelt.' : '');
    this.spinRate = [0.18, 0.24, 0.3, 0.34, 0.38][level - 1] * (this.mutator?.id === 'fast' ? 1.6 : 1);
    for (let i = 0; i < 9; i++) this.blobs.push(this.newBlob(true));
    for (let i = 0; i < fc; i++) this.blobs.push(this.newBlob(true, false, true));
    for (let i = 0; i < sc; i++) {
      this.storms.push({ a: (i / sc) * Math.PI * 2 + this.r(), d: 0.3 + this.r() * 0.5, r: 0.12 + this.r() * 0.05, ph: this.r() * 6, drift: level >= 4 ? 0.08 : 0, state: 'idle', t: 2 + this.r() * 4, bolts: [] });
    }
    const pool = GAS_GOALS.filter((g) => (sc > 0 || g.id !== 'nohit') && (fc > 0 || g.id !== 'pure3'));
    this.goals = pickGoals(pool, rng(cfg.seed ^ 0x77));
  }

  private newBlob(initial: boolean, gold = false, foreign = false): Blob {
    const r = this.r;
    const max = gold ? 1.2 : 1.5 + r() * 2.5;
    return {
      a: r() * Math.PI * 2, d: initial ? 0.2 + r() * 0.7 : gold ? 0.3 + r() * 0.5 : 0.75 + r() * 0.2,
      r0: gold ? 0.09 : (foreign ? 0.13 : 0.11) + max * 0.025, amount: max, max, dens: gold ? 1.6 : 0.75 + r() * 0.6, ph: r() * 6,
      born: initial ? -9 : this.time, gold, life: gold ? 8 : Infinity, foreign, charged: 0, v: Math.floor(r() * 4), counted: false,
    };
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.cx = w / 2;
    this.cy = TOP + (h - TOP) / 2;
    this.S = Math.min(w, h - TOP) / 2 - 8;
    this.ys = clamp((h - TOP - 30) / (2 * this.S), 0.82, 1.75);
    if (!this.x) { const [mx, my] = this.mother; this.x = mx; this.y = my - 60; }
  }

  hud(): HudItem[] {
    const left = DURATION - this.time;
    return [
      { label: 'Zeit', value: fmtTime(left), warn: left < 10 },
      { label: 'Tank', value: `${Math.round((this.tank / this.cap) * 100)} %`, warn: this.tank >= this.cap * 0.99 },
      { label: 'Gesichert', value: Math.round(this.secured * UNITS).toLocaleString('de-DE') },
    ];
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  private pos(a: number, d: number): [number, number] {
    return [this.cx + Math.cos(a) * d * this.S, this.cy + Math.sin(a) * d * this.S * this.ys];
  }

  private get mother(): [number, number] {
    return this.pos(this.motherA, 0.93);
  }

  private blobRadius(b: Blob): number {
    return (b.r0 * (0.45 + 0.55 * Math.sqrt(b.amount / b.max))) * this.S;
  }

  private strikeR(s: Storm): number { return s.r * this.S * 1.7; }

  /** Reinheit der Tankladung */
  private purity(): number {
    return this.tank > 0.001 ? clamp(1 - this.foreign / this.tank, 0, 1) : 1;
  }

  private get btn(): [number, number, number] { return [this.w - 46, this.h - 54, 26]; }

  /** Wert einer Schwade für den Autopiloten (Fremdgas: nichts) */
  private blobWorth(b: Blob): number {
    if (b.foreign || b.amount < 0.2) return 0;
    let s = b.amount * b.dens * (b.gold || b.charged > 0 ? 3 : 1);
    const [bx, by] = this.pos(b.a, b.d);
    for (const o of this.blobs) if (o.foreign && Math.hypot(...sub(this.pos(o.a, o.d), [bx, by])) < this.blobRadius(o) + this.blobRadius(b)) s *= 0.4;
    for (const st of this.storms) if (st.state !== 'idle' && Math.hypot(...sub(this.pos(st.a, st.d), [bx, by])) < this.strikeR(st) * 1.2) s *= 0.1;
    return s;
  }

  /** Für Tests und Autopilot: Mitte der ergiebigsten Schwade */
  debugBestBlob(): [number, number] | null {
    let best: Blob | null = null, bs = 0;
    for (const b of this.blobs) {
      const [bx, by] = this.pos(b.a, b.d);
      const s = this.blobWorth(b) / (1 + Math.hypot(bx - this.x, by - this.y) / 150);
      if (s > bs) { bs = s; best = b; }
    }
    return best ? this.pos(best.a, best.d) : null;
  }

  pointerDown(id: number, x: number, y: number): void {
    const [bx, by, br] = this.btn;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.doBoost(); return; }
    if (this.pid >= 0) return;
    this.pid = id;
    this.target = [x, y];
  }

  pointerMove(id: number, x: number, y: number): void {
    if (id === this.pid) this.target = [x, y];
  }

  pointerUp(id: number): void {
    if (id !== this.pid) return;
    this.pid = -1;
    this.target = null;
  }

  private doBoost(): void {
    if (this.boostCd > 0 || this.endT >= 0) return;
    this.boostT = 1;
    this.boostCd = 6;
    this.boosts++;
    sfx.tap();
  }

  /** Nur für Tests: Autopilot (Durchflüge durch gute Schwaden, Blitzen ausweichen, langsam andocken) */
  autopilot(): void {
    const left = DURATION - this.time;
    // drohendem Blitz ausweichen
    for (const s of this.storms) {
      if (s.state !== 'charge') continue;
      const [sx, sy] = this.pos(s.a, s.d);
      const d = Math.hypot(this.x - sx, this.y - sy);
      if (d < this.strikeR(s) * 1.25) {
        const k = (this.strikeR(s) * 1.6) / Math.max(1, d);
        this.target = [sx + (this.x - sx) * k, sy + (this.y - sy) * k];
        return;
      }
    }
    if (this.tank >= this.cap * 0.95 || (left < 9 && this.tank > 0.3) || this.unloading) {
      const [mx, my] = this.mother;
      const d = Math.hypot(mx - this.x, my - this.y);
      this.target = [mx, my];
      if (d > 220) this.doBoost();
      return;
    }
    const b = this.debugBestBlob();
    if (!b) { this.target = null; return; }
    // durch die Schwade hindurch zielen
    const dx = b[0] - this.x, dy = b[1] - this.y, d = Math.hypot(dx, dy) || 1;
    this.target = [b[0] + (dx / d) * 70, b[1] + (dy / d) * 70];
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.endT >= 0) {
      this.endT += dt;
      this.vx *= 1 - Math.min(1, dt * 2);
      this.vy *= 1 - Math.min(1, dt * 2);
      if (this.endT > 1.2 && !this.fx.list.some((p) => p.tx != null)) this.done = this.finish();
      return;
    }
    this.time += dt;
    this.score.update(dt);
    this.stun = Math.max(0, this.stun - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.boostCd = Math.max(0, this.boostCd - dt);
    this.dockWarn = Math.max(0, this.dockWarn - dt);
    // Böen: angekündigt, dann kehrt der Wirbel kurz um
    this.gustT -= dt;
    if (this.gustT <= 1.5 && this.gustWarn <= 0 && this.gust <= 0) { this.gustWarn = 1.5; this.floats.add(this.w / 2, TOP + 70, 'Böe naht!', '#9fd8ff', 16); }
    if (this.gustWarn > 0) { this.gustWarn -= dt; if (this.gustWarn <= 0) { this.gust = 3.5; this.gustT = 12 + this.r() * 5; } }
    this.gust = Math.max(0, this.gust - dt);
    const dir = this.gust > 0 ? -1.4 : 1;
    this.swirl += this.spinRate * dir * dt;
    for (const b of this.blobs) {
      b.a += ((this.spinRate * dir) / (0.35 + b.d)) * dt;
      b.d += Math.sin(this.time * 0.6 + b.ph) * 0.02 * dt;
      if (b.gold) b.life -= dt;
      b.charged = Math.max(0, b.charged - dt);
    }
    for (const s of this.storms) { s.a += ((this.spinRate * 0.8 * dir) / (0.35 + s.d)) * dt; s.d = clamp(s.d + Math.sin(this.time * 0.5 + s.ph) * s.drift * dt, 0.2, 0.85); }
    this.motherA += 0.05 * dt;
    // Goldene Schwaden (selten; bei Goldrausch häufig)
    this.goldTimer -= dt;
    if (this.goldTimer <= 0) { this.blobs.push(this.newBlob(false, true)); this.goldTimer = this.mutator?.id === 'gold' ? 4 + this.r() * 3 : 15 + this.r() * 6; }
    // Steuerung: der Sammler fliegt zum Finger, mit Trägheit
    const maxV = 250 * (this.boostT > 0 ? 2 : 1);
    let dvx = 0, dvy = 0;
    if (this.target && !this.stun) {
      const dx = this.target[0] - this.x, dy = this.target[1] - this.y;
      const dist = Math.hypot(dx, dy);
      const v = Math.min(maxV, dist * 3.2 * (this.boostT > 0 ? 2 : 1));
      if (dist > 1) { dvx = (dx / dist) * v; dvy = (dy / dist) * v; }
    }
    // Strudel in der Mitte zieht an
    const cdx = this.cx - this.x, cdy = (this.cy - this.y) / this.ys, cd = Math.hypot(cdx, cdy) / this.S;
    if (cd < 0.22 && cd > 0.001) { const pull = (1 - cd / 0.22) * 170; dvx += (cdx / (cd * this.S)) * pull; dvy += (cdy / (cd * this.S)) * pull * this.ys; }
    const k = Math.min(1, dt * (this.stun ? 0.8 : 4));
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 14, this.w - 14);
    this.y = clamp(this.y + this.vy * dt, TOP + 10, this.h - 14);
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 20) {
      const want = Math.atan2(this.vy, this.vx);
      let da = want - this.heading;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.heading += da * Math.min(1, dt * 8);
    }
    if (this.boostT > 0 && Math.random() < 0.8) {
      const bx = this.x - Math.cos(this.heading) * 26, by = this.y - Math.sin(this.heading) * 26;
      this.fx.add({ x: bx, y: by, vx: -this.vx * 0.3, vy: -this.vy * 0.3, color: '#9ffff0', size: 1.8, max: 0.35 });
    }
    // Sammeln mit Staudruck, solange Platz im Tank ist
    this.sucking = 0;
    this.ram = clamp(speed / RAM_SPEED, 0, 1);
    const ram = 0.35 + 0.65 * this.ram;
    if (!this.stun && this.tank < this.cap) {
      for (const b of this.blobs) {
        if (b.amount <= 0) continue;
        const [bx, by] = this.pos(b.a, b.d);
        const rr = this.blobRadius(b);
        const d = Math.hypot(bx - this.x, by - this.y);
        if (d > rr) continue;
        const rate = 0.95 * b.dens * (1 - (d / rr) * 0.55) * ram;
        const take = Math.min(b.amount, rate * dt, this.cap - this.tank);
        if (take <= 0) continue;
        b.amount -= take;
        this.tank += take;
        const triple = b.gold || b.charged > 0;
        if (b.foreign) this.foreign += take;
        else this.tankValue += take * (b.gold ? 3 : b.charged > 0 ? 2 : 1);
        this.sucking += rate;
        if (triple && !b.counted && b.max - b.amount > 0.6) { b.counted = true; this.golds++; this.floats.add(bx, by, b.gold ? 'Gold ×3' : 'Aufgeladen ×2', '#ffd27a', 15); sfx.coin(); }
        this.wispAcc += take;
        while (this.wispAcc > 0.04) {
          this.wispAcc -= 0.04;
          const a = Math.random() * Math.PI * 2, dd = rr * (0.4 + Math.random() * 0.6);
          const col = b.foreign ? FOREIGN : triple ? '#ffd27a' : this.color;
          this.fx.add({ x: this.x + Math.cos(a) * dd, y: this.y + Math.sin(a) * dd, vx: -Math.sin(a) * 90, vy: Math.cos(a) * 90, color: col, size: 1.6 + Math.random(), max: 1.2, tx: this.x, ty: this.y });
        }
        if (this.tank >= this.cap - 0.001) { this.floats.add(this.x, this.y - 30, 'Tank voll', '#ffb547', 13); sfx.warn(); }
      }
    }
    if (this.mutator?.id === 'leak' && this.tank > 0) {
      const l = Math.min(this.tank, this.tank * 0.035 * dt), f = l / this.tank;
      this.tankValue -= this.tankValue * f;
      this.foreign -= this.foreign * f;
      this.tank -= l;
    }
    for (const p of this.fx.list) if (p.tx != null) { p.tx = this.x; p.ty = this.y; }
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      if (b.amount <= 0.05 || b.life <= 0) {
        if (b.gold) { this.blobs.splice(i, 1); i--; } else this.blobs[i] = this.newBlob(false, false, b.foreign);
      }
    }
    this.updateMother(dt);
    this.updateStorms(dt);
    setGoal(this.goals, 'nohit', this.hits === 0);
    setGoal(this.goals, 'gold3', this.golds >= 3);
    setGoal(this.goals, 'full4', this.fullUnloads >= 4);
    setGoal(this.goals, 'combo', this.score.maxCombo >= 2.5);
    setGoal(this.goals, 'noboost', this.boosts === 0);
    setGoal(this.goals, 'nowaste', this.tank < 0.05 && this.secured > 0);
    setGoal(this.goals, 'pure3', this.pureUnloads >= 3);
    if (this.time >= DURATION) this.endT = 0;
  }

  /** Sturmzellen: Ruhe → Aufladen (Ring) → Blitz (trifft alles im Ring, lädt Gas auf) */
  private updateStorms(dt: number): void {
    const charge = [1.5, 1.4, 1.3, 1.15, 1.05][this.level - 1];
    for (const s of this.storms) {
      s.t -= dt;
      if (s.state === 'idle' && s.t <= 0) { s.state = 'charge'; s.t = charge; }
      else if (s.state === 'charge' && s.t <= 0) { s.state = 'strike'; s.t = 0.35; this.strike(s); }
      else if (s.state === 'strike' && s.t <= 0) { s.state = 'idle'; s.t = 2.5 + this.r() * 2.5; s.bolts = []; }
    }
  }

  private strike(s: Storm): void {
    const [sx, sy] = this.pos(s.a, s.d);
    const R = this.strikeR(s);
    s.bolts = [];
    // Blitzäste zu den Schwaden im Ring (sie werden aufgeladen) und ins Leere
    for (const b of this.blobs) {
      if (b.foreign || b.amount <= 0.1) continue;
      const [bx, by] = this.pos(b.a, b.d);
      if (Math.hypot(bx - sx, by - sy) > R * 1.15) continue;
      if (b.charged <= 0) this.floats.add(bx, by - 16, 'Aufgeladen!', '#ffe08a', 13);
      b.charged = 5;
      b.counted = false;
      s.bolts.push(bolt(sx, sy, bx, by, this.r));
    }
    for (let k = s.bolts.length; k < 3; k++) {
      const a = this.r() * Math.PI * 2, d = R * (0.5 + this.r() * 0.5);
      s.bolts.push(bolt(sx, sy, sx + Math.cos(a) * d, sy + Math.sin(a) * d, this.r));
    }
    const dShip = Math.hypot(this.x - sx, this.y - sy);
    if (dShip <= R) {
      s.bolts.push(bolt(sx, sy, this.x, this.y, this.r));
      this.stun = 1.2;
      this.hits++;
      const f = 0.5;
      const loss = this.tank * f;
      this.tankValue *= 1 - f;
      this.foreign *= 1 - f;
      this.tank -= loss;
      this.score.reset();
      this.shake = 0.5;
      this.flash = 1;
      this.vx = ((this.x - sx) / Math.max(1, dShip)) * 260;
      this.vy = ((this.y - sy) / Math.max(1, dShip)) * 260;
      this.fx.burst(this.x, this.y, '#d9c2ff', 24, 300, 1.6, 'spark', 0.45);
      this.fx.burst(this.x, this.y, this.color, 16, 140, 2.2, 'dot', 0.8);
      if (loss > 0.1) this.floats.add(this.x, this.y - 26, `−${Math.round(loss * UNITS)}`, '#ff9aa4', 15);
      sfx.warn();
      buzz(60);
    } else {
      this.flash = Math.max(this.flash, 0.18);
      if (dShip < R * 2) buzz(15);
    }
  }

  private updateMother(dt: number): void {
    const [mx, my] = this.mother;
    const near = Math.hypot(mx - this.x, my - this.y) < 46;
    const speed = Math.hypot(this.vx, this.vy);
    if (near && this.tank > 0.01) {
      if (!this.unloading && speed > DOCK_SPEED) {
        if (this.dockWarn <= 0) { this.floats.add(mx, my - 54, 'Langsamer andocken!', '#ffb547', 14); this.dockWarn = 1.5; }
        return;
      }
      if (!this.unloading) { this.unloading = true; this.unloadStart = this.tank; this.unloadForeign = this.foreign; }
      const n = Math.min(this.tank, 5 * dt);
      const part = n / this.tank;
      const pur = this.purity();
      const v = this.tankValue * part;
      this.tank -= n;
      this.tankValue -= v;
      this.foreign -= this.foreign * part;
      // verdünnte Ladung ist weniger wert; reine Ladung bringt 20 % mehr
      const pureStart = this.unloadStart > 0 ? 1 - this.unloadForeign / this.unloadStart : 1;
      const gain = v * pur * (pureStart >= PURE ? 1.2 : 1);
      this.secured += gain;
      this.score.add(gain * 100);
      if (Math.random() < 0.6) this.fx.add({ x: this.x, y: this.y, vx: (mx - this.x) * 2, vy: (my - this.y) * 2, color: this.color, size: 2.2, max: 0.4 });
      if (this.tank <= 0.01) {
        this.tank = 0;
        this.tankValue = 0;
        this.foreign = 0;
        this.unloading = false;
        const pure = pureStart >= PURE;
        const full = this.unloadStart >= this.cap * 0.9;
        // Restmengen zählen nicht als Ladung
        if (this.unloadStart < this.cap * 0.3) return;
        if (pure) this.pureUnloads++;
        this.floats.add(mx, my - 40, pure ? 'Rein gesichert +20 %' : `Gesichert (Reinheit ${Math.round(pureStart * 100)} %)`, pure ? '#6be38f' : '#c8d0a0', 14);
        sfx.coin();
        // Volle, reine Ladung: Kombo steigt (hält bis zur nächsten, Blitz und trübe Ladung setzen zurück)
        if (full && pure) { this.fullUnloads++; this.score.bump(0.5, 30); this.floats.add(mx, my - 60, `Volle Ladung ×${String(this.score.combo).replace('.', ',')}`, '#ffd27a', 15); }
        else if (full) { this.fullUnloads++; if (!pure) this.score.reset(); }
      }
    } else if (!near) this.unloading = false;
  }

  private finish(): GameResult {
    const [g1, g2, g3] = GOALS[this.level];
    // Ungesicherte Ladung zählt nur halb
    const open = this.tankValue * this.purity() * 0.5;
    const total = this.secured + open;
    this.score.points += Math.round(open * 100 * this.score.mult);
    const stars = starsFor(total, g1, g2, g3);
    return {
      success: stars > 0,
      stars,
      score: Math.round((total / g3) * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: stars === 3 ? 'Laderaum randvoll' : stars > 0 ? 'Gute Ausbeute' : 'Zu wenig gesichert',
      lines: [
        ['Gesichert', `${Math.round(this.secured * UNITS).toLocaleString('de-DE')} Einheiten`],
        ...(this.tank > 0.05 ? [['Im Tank (halb gewertet)', `${Math.round(this.tankValue * UNITS).toLocaleString('de-DE')}`] as [string, string]] : []),
        ['Volle Ladungen', `${this.fullUnloads}`],
        ['Reine Ladungen', `${this.pureUnloads}`],
        ['Gold/aufgeladen', `${this.golds}`],
        ...(this.storms.length ? [['Blitzeinschläge', `${this.hits}`] as [string, string]] : []),
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
   * Bilder einmal berechnen: Wolken aus fraktalem Rauschen (vier Formen je Gasart, weich auslaufend),
   * ein Wirbelschleier (Rauschen in Polarkoordinaten verdreht) und dunkle Sturmwolken.
   */
  private makeArt(): void {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const N = perlin(4711);
    const cloud = (seed: number, size: number, col: string, dark = false): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      const img = g.createImageData(size, size);
      const n = parseInt(col.slice(1), 16), cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x / size) * 2 - 1, v = (y / size) * 2 - 1;
        const d = Math.hypot(u, v);
        if (d >= 1) continue;
        const f = fbm(N, u * 2.4 + seed * 7.1, v * 2.4 - seed * 3.3, 5);
        const fall = (1 - d) ** 1.6;
        const a = clamp((f - 0.35) * 2.2, 0, 1) * fall + fall * 0.25;
        const lum = 0.55 + f * 0.7;
        const j = (y * size + x) * 4;
        if (dark) { img.data[j] = cr * 0.35 * lum; img.data[j + 1] = cg * 0.3 * lum; img.data[j + 2] = cb * 0.45 * lum; }
        else { img.data[j] = Math.min(255, cr * lum + 40 * f * f); img.data[j + 1] = Math.min(255, cg * lum + 40 * f * f); img.data[j + 2] = Math.min(255, cb * lum + 40 * f * f); }
        img.data[j + 3] = clamp(a, 0, 1) * 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    };
    const size = Math.round(Math.min(384, 128 * dpr));
    const set = (col: string, dark = false) => [0, 1, 2, 3].map((k) => cloud(k + (dark ? 11 : 0), size, col, dark));
    // Wirbelschleier
    const ss = Math.round(Math.min(900, this.S * 2 * Math.min(dpr, 1.5)));
    const sw = document.createElement('canvas');
    sw.width = sw.height = ss;
    const sg = sw.getContext('2d')!;
    const si = sg.createImageData(ss, ss);
    const n = parseInt(this.color.slice(1), 16), cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
    for (let y = 0; y < ss; y++) for (let x = 0; x < ss; x++) {
      const u = (x / ss) * 2 - 1, v = (y / ss) * 2 - 1;
      const d = Math.hypot(u, v);
      if (d >= 1) continue;
      // Spirale: Winkel mit dem Abstand verdrehen
      const a = Math.atan2(v, u) + d * 5.5;
      const arms = 0.5 + 0.5 * Math.cos(a * 3);
      const f = fbm(N, Math.cos(a) * d * 3 + 20, Math.sin(a) * d * 3 - 9, 4);
      const k = clamp(arms * 0.7 + (f - 0.4) * 1.2, 0, 1) * (1 - d) ** 0.8 * Math.min(1, d * 4);
      const j = (y * ss + x) * 4;
      si.data[j] = cr; si.data[j + 1] = cg; si.data[j + 2] = cb;
      si.data[j + 3] = k * 150;
    }
    sg.putImageData(si, 0, 0);
    this.art = {
      clouds: { gas: set(this.color), gold: set('#ffc860'), foreign: set(FOREIGN), storm: set('#7a4dff', true) },
      swirl: sw,
      dark: cloud(23, size, '#000000', true),
    };
  }

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
      // Wirbelmitte des Bildes (etwa 51 %/47 %) auf die Spielmitte legen
      const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight) * 1.12;
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      const ox = clamp(this.cx - iw * 0.51, this.w - iw, 0), oy = clamp(this.cy - ih * 0.47, this.h - ih, 0);
      g.drawImage(img, ox, oy, iw, ih);
      g.fillStyle = 'rgba(3,4,12,0.7)';
      g.fillRect(0, 0, this.w, this.h);
      const v = g.createRadialGradient(this.cx, this.cy, this.S * 0.6, this.cx, this.cy, Math.max(this.w, this.h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      g.fillStyle = v;
      g.fillRect(0, 0, this.w, this.h);
      this.bgCache = c;
    }
    ctx.drawImage(this.bgCache, 0, 0, this.w, this.h);
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.drawBackground(ctx);
    if (!this.art) this.makeArt();
    const art = this.art!;
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 9 * this.shake, (Math.random() - 0.5) * 9 * this.shake);
    // Wirbelschleier: zwei Lagen, verschieden schnell
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(1, this.ys);
    ctx.globalCompositeOperation = 'lighter';
    for (const [k, sp, al] of [[1, 0.6, 0.4], [1.15, 0.35, 0.22]] as const) {
      ctx.save();
      ctx.rotate(-this.swirl * sp);
      ctx.globalAlpha = al * (this.gust > 0 ? 1.3 : 1);
      const s = this.S * k;
      ctx.drawImage(art.swirl, -s, -s, s * 2, s * 2);
      ctx.restore();
    }
    // Strudel in der Mitte
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.S * 0.24);
    g.addColorStop(0, rgba('#ffffff', 0.35));
    g.addColorStop(0.25, rgba(this.color, 0.25));
    g.addColorStop(1, rgba(this.color, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.S * 0.24, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = rgba(this.color, 0.1 + k * 0.05);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const a0 = -this.swirl * (2 + k);
      ctx.arc(0, 0, this.S * (0.21 - k * 0.045), a0, a0 + 3.6);
      ctx.stroke();
    }
    ctx.restore();
    // Böe: Windschlieren
    if (this.gust > 0 || this.gustWarn > 0) this.drawGust(ctx, t);
    this.drawBlobs(ctx, t);
    this.drawStorms(ctx, t);
    this.drawMother(ctx, t);
    this.fx.draw(ctx);
    this.drawShip(ctx, t);
    this.floats.draw(ctx);
    ctx.restore();
    if (this.flash > 0 && !document.documentElement.classList.contains('calm')) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#d9c2ff', this.flash * 0.25);
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    if (this.target && this.endT < 0) {
      ctx.strokeStyle = 'rgba(110,220,205,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.target[0], this.target[1], 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.drawGauges(ctx, t);
    const [bx, by, br] = this.btn;
    drawButton(ctx, bx, by, br, 1 - this.boostCd / 6, '#5ff0d8', 'S', t);
  }

  private drawGust(ctx: CanvasRenderingContext2D, t: number): void {
    const warn = this.gust <= 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#bfe8ff', warn ? 0.08 + 0.06 * Math.sin(t * 10) : 0.16);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let k = 0; k < 14; k++) {
      const d = 0.25 + ((k * 0.37) % 0.7);
      const a = -this.swirl * 1.8 + k * 0.9 + t * (warn ? 0.2 : -1.2);
      ctx.beginPath();
      for (let s = 0; s <= 8; s++) {
        const aa = a + s * 0.06 * (warn ? 1 : -1);
        const [x, y] = this.pos(aa, d);
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBlobs(ctx: CanvasRenderingContext2D, t: number): void {
    const art = this.art!;
    for (const b of this.blobs) {
      const [bx, by] = this.pos(b.a, b.d);
      const rr = this.blobRadius(b);
      const fade = Math.min(1, (this.time - b.born) / 1.5, b.gold ? b.life / 1.5 : 1);
      if (fade <= 0) continue;
      const triple = b.gold || b.charged > 0;
      const set = b.foreign ? art.clouds.foreign : triple ? art.clouds.gold : art.clouds.gas;
      ctx.save();
      ctx.translate(bx, by);
      if (b.foreign) {
        // trübes Fremdgas: deckend, schmutzig
        ctx.globalCompositeOperation = 'source-over';
        for (let k = 0; k < 3; k++) {
          ctx.save();
          ctx.rotate(b.ph + k * 2.1 + t * 0.12 * (k % 2 ? 1 : -1));
          const s = rr * (k === 0 ? 3 : 2.3);
          ctx.globalAlpha = fade * (k === 0 ? 0.7 : 0.5);
          ctx.drawImage(set[(b.v + k) % 4], -s / 2, -s / 2, s, s);
          ctx.restore();
        }
        // schmutzig-dunkler Kern
        ctx.globalAlpha = fade * 0.5;
        ctx.drawImage(art.dark, -rr * 0.9, -rr * 0.9, rr * 1.8, rr * 1.8);
      } else {
        // leuchtendes Gas: drei Lagen, gegenläufig drehend
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade * 0.55;
        ctx.drawImage(art.dark, -rr * 1.6, -rr * 1.6, rr * 3.2, rr * 3.2);
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          ctx.save();
          ctx.rotate(b.ph + k * 2.1 + t * (0.15 + k * 0.08) * (k % 2 ? 1 : -1));
          const s = rr * (k === 0 ? 3.1 : 2.3 - k * 0.2);
          const pulse = triple ? 0.85 + 0.15 * Math.sin(t * 7 + k) : 1;
          ctx.globalAlpha = fade * (0.5 + 0.3 * b.dens) * (k === 0 ? 0.85 : 0.7) * pulse;
          ctx.drawImage(set[(b.v + k) % 4], -s / 2, -s / 2, s, s);
          ctx.restore();
        }
        // dichter Kern
        const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 0.6);
        cg.addColorStop(0, rgba(triple ? '#fff4c8' : '#ffffff', 0.18 * b.dens * fade));
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // aufgeladen: knisternde Funken
        if (triple && Math.random() < 0.5) {
          ctx.strokeStyle = rgba('#fff0b0', 0.8);
          ctx.lineWidth = 1;
          ctx.beginPath();
          let x = (Math.random() - 0.5) * rr, y = (Math.random() - 0.5) * rr;
          ctx.moveTo(x, y);
          for (let s = 0; s < 3; s++) { x += (Math.random() - 0.5) * rr * 0.4; y += (Math.random() - 0.5) * rr * 0.4; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private drawStorms(ctx: CanvasRenderingContext2D, t: number): void {
    const art = this.art!;
    for (const s of this.storms) {
      const [sx, sy] = this.pos(s.a, s.d);
      const rr = s.r * this.S;
      const R = this.strikeR(s);
      const charge = s.state === 'charge' ? 1 - s.t / [1.5, 1.4, 1.3, 1.15, 1.05][this.level - 1] : s.state === 'strike' ? 1 : 0;
      ctx.save();
      ctx.translate(sx, sy);
      // dunkle Gewitterwolke
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.rotate(s.ph + k * 2 + t * 0.2 * (k % 2 ? 1 : -1));
        const sz = rr * (k === 0 ? 3 : 2.3);
        ctx.globalAlpha = k === 0 ? 0.9 : 0.7;
        ctx.drawImage(art.clouds.storm[k], -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
      // inneres Wetterleuchten, beim Aufladen immer heller
      ctx.globalCompositeOperation = 'lighter';
      const flick = Math.random() < 0.15 + charge * 0.6 ? 1 : 0.3;
      const ig = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 1.2);
      ig.addColorStop(0, rgba('#c9a6ff', (0.12 + charge * 0.5) * flick));
      ig.addColorStop(1, 'rgba(160,110,255,0)');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.arc(0, 0, rr * 1.2, 0, Math.PI * 2);
      ctx.fill();
      if (s.state === 'charge') {
        // Warnring: zeigt, wo der Blitz einschlägt; füllt sich bis zum Einschlag
        ctx.strokeStyle = rgba('#e6d4ff', 0.25 + 0.5 * charge);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -t * 30;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba('#ffffff', 0.85);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
        ctx.stroke();
        const fill = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R);
        fill.addColorStop(0, 'rgba(180,140,255,0)');
        fill.addColorStop(1, rgba('#b48cff', 0.18 * charge));
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        // kriechende Entladungen am Rand der Wolke
        if (Math.random() < 0.3 + charge * 0.6) {
          const a = Math.random() * Math.PI * 2;
          const p = bolt(Math.cos(a) * rr * 0.4, Math.sin(a) * rr * 0.4, Math.cos(a) * rr * (1 + charge), Math.sin(a) * rr * (1 + charge), Math.random);
          strokeBolt(ctx, p, 0.6 + charge * 0.4, 1);
        }
      }
      ctx.restore();
      // Blitz
      if (s.state === 'strike') {
        const k = s.t / 0.35;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const b of s.bolts) strokeBolt(ctx, b, k, 2.2);
        const fl = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.2);
        fl.addColorStop(0, rgba('#f0e6ff', 0.5 * k));
        fl.addColorStop(1, 'rgba(200,170,255,0)');
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.arc(sx, sy, R * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawMother(ctx: CanvasRenderingContext2D, t: number): void {
    const [mx, my] = this.mother;
    const full = this.tank >= this.cap * 0.9;
    // Hinweislinie bei vollem Tank
    if (full && !this.unloading) {
      ctx.strokeStyle = rgba('#6be38f', 0.25 + 0.2 * Math.sin(t * 6));
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Andockring
    ctx.save();
    ctx.translate(mx, my);
    ctx.globalCompositeOperation = 'lighter';
    const ok = this.unloading;
    ctx.strokeStyle = rgba('#6be38f', ok ? 0.85 : 0.35 + 0.15 * Math.sin(t * 3));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 46, t * 0.8, t * 0.8 + Math.PI * 1.6);
    ctx.stroke();
    ctx.strokeStyle = rgba('#6be38f', 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 52, -t * 0.5, -t * 0.5 + Math.PI * 0.8);
    ctx.stroke();
    if (ok) {
      // Übertragungsstrahl
      const g = ctx.createLinearGradient(this.x - mx, this.y - my, 0, 0);
      g.addColorStop(0, rgba(this.color, 0.6));
      g.addColorStop(1, rgba(this.color, 0.1));
      ctx.strokeStyle = g;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(this.x - mx, this.y - my);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(this.motherA + Math.PI);
    const sp = mapShipSprite('wyvern_gas');
    if (sp) {
      const S = 104;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const ex of sp.engines.xs) {
        const fx = ex * S, fy = sp.engines.y * S, fl = 7 + Math.random() * 4;
        const eg = ctx.createLinearGradient(fx, fy, fx, fy + fl);
        eg.addColorStop(0, rgba('#fff0d0', 0.8));
        eg.addColorStop(1, rgba(sp.engines.color, 0));
        ctx.fillStyle = eg;
        ctx.fillRect(fx - 3, fy, 6, fl);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, -S / 2, -S / 2, S, S);
    } else {
      ctx.rotate(-Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-26, -10); ctx.lineTo(26, -10); ctx.lineTo(30, 0); ctx.lineTo(26, 10); ctx.lineTo(-26, 10); ctx.lineTo(-30, 0);
      ctx.closePath();
      ctx.fillStyle = '#0d1e2a';
      ctx.fill();
      ctx.strokeStyle = '#6be38f';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
    // Leuchtfeuer
    ctx.fillStyle = Math.sin(t * 4) > 0 ? '#6be38f' : 'rgba(107,227,143,0.3)';
    ctx.beginPath();
    ctx.arc(mx, my - 50, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawShip(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    const stun = this.stun > 0;
    // Schöpfkegel vor dem Bug
    if (this.sucking > 0 && !stun) {
      ctx.save();
      ctx.rotate(this.heading);
      ctx.globalCompositeOperation = 'lighter';
      const L = 30 + 26 * this.ram;
      const g = ctx.createRadialGradient(18, 0, 0, 18, 0, L);
      g.addColorStop(0, rgba(this.color, 0.45));
      g.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.arc(14, 0, L, -0.55, 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.rotate(this.heading + Math.PI / 2);
    const sp = mapShipSprite('alligator_gas');
    if (sp) {
      const S = 66;
      if (!stun) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const ex of sp.engines.xs) {
          const fx = ex * S, fy = sp.engines.y * S, fl = (this.boostT > 0 ? 18 : 8) + Math.random() * 5;
          const g = ctx.createLinearGradient(fx, fy, fx, fy + fl);
          g.addColorStop(0, rgba('#fff0d0', 0.9));
          g.addColorStop(0.3, rgba(this.boostT > 0 ? '#9ffff0' : sp.engines.color, 0.7));
          g.addColorStop(1, rgba(sp.engines.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(fx - 3.5, fy);
          ctx.lineTo(fx + 3.5, fy);
          ctx.lineTo(fx, fy + fl);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, -S / 2, -S / 2, S, S);
      // Tanks leuchten mit der Füllung
      ctx.globalCompositeOperation = 'lighter';
      const f = clamp(this.tank / this.cap, 0, 1);
      ctx.fillStyle = rgba(this.purity() >= PURE ? this.color : FOREIGN, 0.15 + 0.45 * f);
      for (const [x, y] of [[-0.14, -0.02], [0.14, -0.02], [-0.14, 0.17], [0.14, 0.17]]) {
        ctx.beginPath();
        ctx.arc(x * S, y * S, S * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
      if (stun && Math.sin(t * 30) > 0) {
        ctx.fillStyle = 'rgba(200,170,255,0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, S * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const col = stun && Math.sin(t * 30) > 0 ? '#c9a6ff' : '#ffc45e';
      ctx.beginPath();
      ctx.moveTo(-9, -16); ctx.lineTo(9, -16); ctx.lineTo(13, -6); ctx.lineTo(13, 12); ctx.lineTo(6, 18); ctx.lineTo(-6, 18); ctx.lineTo(-13, 12); ctx.lineTo(-13, -6);
      ctx.closePath();
      ctx.fillStyle = '#0d1e2a';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Anzeige am Sammler: Tankring (Fremdgas trüb am Ende), innen der Staudruck, darunter die Reinheit */
  private drawGauges(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.endT >= 0) return;
    const f = clamp(this.tank / this.cap, 0, 1), pur = this.purity();
    const R = 40, a0 = -Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(8,18,28,0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    const good = f * pur, bad = f - good;
    ctx.strokeStyle = f >= 0.99 ? (Math.sin(t * 8) > 0 ? '#ffb547' : this.color) : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a0 + Math.PI * 2 * good);
    ctx.stroke();
    if (bad > 0.002) {
      ctx.strokeStyle = FOREIGN;
      ctx.beginPath();
      ctx.arc(0, 0, R, a0 + Math.PI * 2 * good, a0 + Math.PI * 2 * f);
      ctx.stroke();
    }
    // Marke: ab hier gilt der Tank als voll (Kombo)
    const am = a0 + Math.PI * 2 * 0.9;
    ctx.strokeStyle = '#9ff3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(am) * (R - 4), Math.sin(am) * (R - 4));
    ctx.lineTo(Math.cos(am) * (R + 4), Math.sin(am) * (R + 4));
    ctx.stroke();
    // Staudruck: innerer Bogen, hell bei voller Fahrt
    if (this.sucking > 0 || this.ram > 0.05) {
      ctx.strokeStyle = rgba(this.ram > 0.85 ? '#fff0b0' : '#7fe8ff', this.sucking > 0 ? 0.85 : 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R - 6, Math.PI / 2 + Math.PI * 0.35, Math.PI / 2 + Math.PI * 0.35 + Math.PI * 1.3 * this.ram);
      ctx.stroke();
    }
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    if (this.tank > 0.05 && pur < 0.999) {
      ctx.fillStyle = pur < PURE ? '#d8dca0' : '#9fe8c0';
      ctx.fillText(`Reinheit ${Math.round(pur * 100)} %`, 0, R + 14);
    } else if (this.sucking > 0) {
      ctx.fillStyle = '#9ffff0';
      ctx.fillText(`Staudruck ×${(0.35 + 0.65 * this.ram).toFixed(1).replace('.', ',')}`, 0, R + 14);
    }
    ctx.restore();
  }
}

function sub(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}

/** Gezackter Blitz von A nach B (Mittelpunktverschiebung) mit kleinen Seitenästen */
function bolt(ax: number, ay: number, bx: number, by: number, r: () => number): [number, number][] {
  let pts: [number, number][] = [[ax, ay], [bx, by]];
  let amp = Math.hypot(bx - ax, by - ay) * 0.22;
  for (let it = 0; it < 5; it++) {
    const out: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
      const o = (r() - 0.5) * amp;
      out.push([(x0 + x1) / 2 - (dy / l) * o, (y0 + y1) / 2 + (dx / l) * o], pts[i]);
    }
    pts = out;
    amp *= 0.55;
  }
  return pts;
}

function strokeBolt(ctx: CanvasRenderingContext2D, p: [number, number][], k: number, w: number): void {
  ctx.beginPath();
  p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 3;
  ctx.strokeStyle = rgba('#a77bff', 0.35 * k);
  ctx.lineWidth = w * 3.5;
  ctx.stroke();
  ctx.strokeStyle = rgba('#f4ecff', 0.95 * k);
  ctx.lineWidth = w * 0.7;
  ctx.stroke();
}
