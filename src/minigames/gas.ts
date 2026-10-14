// Minispiel „Gasströme“: Mit dem Sammeltrichter Gas aus ziehenden Strömen fangen und am Mutterschiff sichern.
// Zwei Sticks: links fliegt der Sammler, rechts wird der Trichter vergrößert (nach oben) oder verkleinert (nach unten).
// Ein großer Trichter fängt viel, zieht aber auch trübes Fremdgas und Funken an und macht den Sammler träge;
// ein kleiner ist präzise und wendig. Fremdgas verdünnt die Ladung (Wert × Reinheit), Funken laden den Sammler auf –
// bei voller Ladung schlägt die Spannung über und ein Teil des Tanks geht verloren. Goldene Ströme zählen dreifach.
// Sturmzellen kündigen ihre Blitze mit einem Ring an. Gesichert wird beim langsamen Andocken am Mutterschiff;
// volle, reine Tanks in Folge erhöhen die Kombo.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import { sustain } from '../audio/ambience';
import { playGameTrack, type GameTrack } from '../audio/music';
import { beatAt, beatPos, downbeatFrom, musicFx, NO_BEAT, type Beat, type BeatMap } from '../audio/rhythm';
import { DANCE_BEATS, danceFrame, type DanceFrame } from './gasDance';
import trackUrl from '../assets/music/gas-celestial-drift.mp3';
import trackBeats from '../assets/music/gas-celestial-drift.beats.json';
import { BG_IMAGES } from '../render/bgImages';
import { mapShipSprite, projectileSprite } from '../render/shipArt';
import { fbm, perlin } from '../render/noise';
import {
  buzz, clamp, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator, type Rules,
} from './common';

/** Eine Runde dauert so lange wie das Lied (Celestial Drift, 3:48) */
const DURATION = Math.round((trackBeats as { duration: number }).duration);
/** Höhepunkt des Liedes: ab der „Eins“ bei etwa 1:57 tanzen zwei Gassammeldrohnen um den Sammler */
const DANCE_AT = 117;
const DANCE_START = downbeatFrom(trackBeats as unknown as BeatMap, DANCE_AT);
const DRONE = 'gasdrohne-b-ki';
/** Lage im Drohnenbild (Anteile der Bildgröße, Mitte = 0): Triebwerk unten, zwei Ansaugtrichter an den Greifarmen */
const DRONE_ENGINE: [number, number] = [0, 0.4];
const DRONE_FUNNELS: [number, number][] = [[-0.27, -0.37], [0.33, -0.25]];

interface Drone { x: number; y: number; vx: number; vy: number; rot: number; trail: [number, number][] }
const UNITS = 50;
/** Gesicherter Wert für 1/2/3 Sterne – ursprünglich für 50 s, mit der Rundenlänge hochgerechnet */
const GOALS_50: Record<Level, [number, number, number]> = { 1: [14, 24, 34], 2: [12, 21, 30], 3: [10, 18, 26], 4: [9, 15, 22], 5: [8, 13, 20] };
const GOALS = Object.fromEntries(Object.entries(GOALS_50).map(([l, g]) => [l, g.map((v) => Math.round(v * (DURATION / 50) * 0.92))])) as Record<Level, [number, number, number]>;
/** Andocken nur langsamer als (px/s) */
const DOCK_SPEED = 120;
/** Reinheit für eine „reine Ladung“ */
const PURE = 0.95;
const FOREIGN = '#8c9468';
const GOLD = '#ffc860';
const SPARK = '#e6dcff';
/** Tankmenge je Flocke */
const FLAKE = 0.042;
/** Joystick: Ausschlag in Pixeln */
const JOY_R = 64;
/** Trichterradius (klein … groß) */
const FUN_MIN = 12;
const FUN_MAX = 72;

export const GAS_MUTATORS: Mutator[] = [
  { id: 'storm', name: 'Gewittersturm', desc: 'Mehr Sturmzellen und Funken', mult: 1.5 },
  { id: 'gold', name: 'Goldrausch', desc: 'Goldene Ströme viel häufiger', mult: 1.2 },
  { id: 'leak', name: 'Leckender Tank', desc: 'Ungesicherte Ladung entweicht langsam', mult: 1.4 },
  { id: 'fast', name: 'Starke Strömung', desc: 'Die Ströme ziehen viel schneller', mult: 1.4 },
  { id: 'smog', name: 'Verschmutzter Nebel', desc: 'Doppelt so viel Fremdgas', mult: 1.3 },
];

export const GAS_GOALS: GoalDef[] = [
  { id: 'nohit', text: 'Kein Überschlag, kein Blitz' },
  { id: 'gold3', text: 'Aus goldenen Strömen 30 Flocken fangen' },
  { id: 'full4', text: 'Viermal mit vollem Tank entladen' },
  { id: 'combo', text: 'Kombo ×2,5 (volle, reine Tanks in Folge)' },
  { id: 'nowaste', text: 'Am Ende nichts mehr ungesichert im Tank' },
  { id: 'pure3', text: 'Drei reine Ladungen sichern' },
  { id: 'nospark', text: 'Keinen einzigen Funken fangen' },
];

type Kind = 'gas' | 'gold' | 'foreign';
type FlakeKind = 'gas' | 'gold' | 'foreign' | 'spark';

/** Ein Gasstrom: Band entlang einer Kurve von Rand zu Rand, das Flocken mitführt */
interface Stream {
  kind: Kind;
  /** Start, Kontrollpunkt, Ende (Bildschirmanteile 0–1 im Spielfeld) */
  p: [number, number][];
  /** Breite in Pixeln */
  width: number;
  /** Fließtempo (px/s) */
  speed: number;
  /** Flocken je Sekunde */
  rate: number;
  /** Anteil Funken */
  sparks: number;
  /** Ankündigung (s), dann Laufzeit (s) */
  warn: number;
  life: number;
  acc: number;
  ph: number;
  len: number;
}
interface Flake { s: Stream; u: number; off: number; kind: FlakeKind; size: number; rot: number; v: number; x: number; y: number }
interface Storm { x: number; y: number; r: number; ph: number; state: 'idle' | 'charge' | 'strike'; t: number; bolts: [number, number][][] }
interface Stick { id: number; ox: number; oy: number; kx: number; ky: number }

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
    'Linker Daumen: Stick zum Fliegen (überall auf der linken Hälfte)',
    'Rechter Daumen: nach oben Trichter größer, nach unten kleiner',
    'Großer Trichter fängt viel – aber auch Fremdgas und Funken, und der Sammler wird träge',
    'Funken laden auf: bei voller Ladung Überschlag. Leuchtender Ring: gleich schlägt ein Blitz ein',
    'Voller Tank? Langsam am Mutterschiff andocken',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  /** Wertung zum Nachlesen: Sterne nach gesicherter Menge, Punkte nach Wert der Ladung */
  get rules(): Rules {
    const u = (v: number) => (v * UNITS).toLocaleString('de-DE');
    const [g1, g2, g3] = GOALS[this.level];
    return {
      stars: [`${u(g1)} Einheiten sichern`, `${u(g2)} Einheiten sichern`, `${u(g3)} Einheiten sichern`],
      points: [
        'Gesichert wird beim Andocken am Mutterschiff; was am Ende noch im Tank ist, zählt halb',
        'Je gesicherte Einheit 2 Punkte – goldenes Gas zählt dreifach, Fremdgas verdünnt die Ladung (Wert × Reinheit)',
        'Reine Ladung (mindestens 95 %): +20 %',
        'Volle und reine Ladung: Kombo +0,5 bis ×4; eine volle, aber trübe Ladung setzt sie zurück',
        ...(this.mutator && this.mutator.mult !== 1 ? [`Besonderheit „${this.mutator.name}“: alle Punkte ×${String(this.mutator.mult).replace('.', ',')}`] : []),
      ],
    };
  }
  private level: Level;
  private ware: string;
  private color: string;
  private streams: Stream[] = [];
  private flakes: Flake[] = [];
  private storms: Storm[] = [];
  private r: () => number;
  private score: Score;
  private time = 0;
  /** Tank: Menge, Wert (gold dreifach) und Fremdgasanteil */
  private tank = 0;
  private tankValue = 0;
  private foreign = 0;
  private cap: number;
  /** elektrische Ladung 0–1 (Funken) */
  private charge = 0;
  private secured = 0;
  private fullUnloads = 0;
  private pureUnloads = 0;
  private unloading = false;
  private unloadStart = 0;
  private unloadForeign = 0;
  private dockWarn = 0;
  private goldFlakes = 0;
  private sparksCaught = 0;
  private hits = 0;
  private stun = 0;
  private shake = 0;
  private flash = 0;
  /** Musik und ihr Takt: Gasflocken glitzern auf dem Schlag, der Nebel atmet mit dem Bass, Höhen funkeln als Sterne */
  private track: GameTrack | null = null;
  private beatClock = 0;
  private beat: Beat = NO_BEAT;
  private lastBeat = -1;
  private lastLevel = 0;
  private twinkles: { x: number; y: number; t: number; s: number }[] = [];
  private drones: Drone[] | null = null;
  private dance: DanceFrame | null = null;
  private nextGas = 0;
  private nextForeign = 4;
  private nextGold = 14;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  /** Trichtergröße 0–1 */
  private funnel = 0.45;
  private move: Stick | null = null;
  private size: Stick | null = null;
  /** Autopilot (Tests): Wunschrichtung und Trichterwunsch statt Sticks */
  private auto: { mx: number; my: number; fs: number } | null = null;
  private catching = 0;
  private motherX = 0.5;
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(110, 23);
  private w = 1;
  private h = 1;
  private art: { clouds: Record<string, HTMLCanvasElement[]>; dark: HTMLCanvasElement } | null = null;
  private bgCache: HTMLCanvasElement | null = null;
  private done: GameResult | null = null;
  private endT = -1;
  private flow: number;
  private sparkShare: number;
  private gasCount: number;
  private foreignCount: number;

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
    const m = this.mutator?.id;
    this.flow = [70, 80, 90, 100, 112][level - 1] * (m === 'fast' ? 1.5 : 1);
    this.sparkShare = [0, 0.02, 0.03, 0.04, 0.05][level - 1] + (m === 'storm' ? 0.03 : 0);
    this.gasCount = level >= 3 ? 3 : 2;
    this.foreignCount = [0, 1, 1, 2, 2][level - 1] * (m === 'smog' ? 2 : 1) + (m === 'smog' && level === 1 ? 1 : 0);
    const sc = [0, 0, 1, 2, 3][level - 1] + (m === 'storm' ? 2 : 0);
    for (let i = 0; i < sc; i++) this.storms.push({ x: 0.2 + this.r() * 0.6, y: 0.15 + this.r() * 0.5, r: 0.11 + this.r() * 0.04, ph: this.r() * 6, state: 'idle', t: 3 + this.r() * 4, bolts: [] });
    this.intro = `In diesem Nebel ziehen Ströme aus ${name}. Fang sie mit dem Sammeltrichter ein und dock langsam am Mutterschiff an – nur gesicherte Ladung zählt voll. `
      + 'Links fliegst du, rechts stellst du die Trichtergröße ein: groß fängt viel, klein ist präzise.'
      + (this.foreignCount ? ' Trübes Fremdgas verdünnt die Ladung.' : '')
      + (this.sparkShare ? ' Funken laden den Sammler auf – zu viele, und die Spannung schlägt über.' : '')
      + (sc ? ' Sturmzellen kündigen ihre Blitze mit einem Ring an.' : '');
    const pool = GAS_GOALS.filter((g) => (sc > 0 || this.sparkShare > 0 || g.id !== 'nohit') && (this.foreignCount > 0 || g.id !== 'pure3') && (this.sparkShare > 0 || g.id !== 'nospark'));
    this.goals = pickGoals(pool, rng(cfg.seed ^ 0x77));
  }

  // ---------- Spielfeld ----------

  /** Spielfeld: unter der Titelleiste bis zum unteren Rand */
  private get field(): [number, number, number, number] {
    return [0, TOP + 8, this.w, this.h - TOP - 8];
  }

  private fp(u: number, v: number): [number, number] {
    const [fx, fy, fw, fh] = this.field;
    return [fx + u * fw, fy + v * fh];
  }

  private get mother(): [number, number] {
    return this.fp(this.motherX, 0.86);
  }

  /** Punkt auf einem Strom (u 0–1 entlang, off −1…1 quer), mit langsamem Schwingen */
  private streamPoint(s: Stream, u: number, off: number): [number, number] {
    const [a, b, c] = s.p;
    const sway = Math.sin(this.time * 0.25 + s.ph) * 0.12;
    const bx = b[0] + sway, by = b[1] + Math.cos(this.time * 0.2 + s.ph) * 0.06;
    const k = 1 - u;
    const x = k * k * a[0] + 2 * k * u * bx + u * u * c[0];
    const y = k * k * a[1] + 2 * k * u * by + u * u * c[1];
    // Normale aus der Ableitung
    const dx = 2 * k * (bx - a[0]) + 2 * u * (c[0] - bx), dy = 2 * k * (by - a[1]) + 2 * u * (c[1] - by);
    const [px, py] = this.fp(x, y);
    const [, , fw, fh] = this.field;
    const l = Math.hypot(dx * fw, dy * fh) || 1;
    return [px - ((dy * fh) / l) * off * s.width * 0.5, py + ((dx * fw) / l) * off * s.width * 0.5];
  }

  private newStream(kind: Kind): Stream {
    const r = this.r;
    // Einstieg an einem Rand, Ausstieg am gegenüberliegenden
    const side = Math.floor(r() * 3);
    let a: [number, number], c: [number, number];
    if (side === 0) { a = [-0.08, 0.05 + r() * 0.65]; c = [1.08, 0.05 + r() * 0.65]; }
    else if (side === 1) { a = [1.08, 0.05 + r() * 0.65]; c = [-0.08, 0.05 + r() * 0.65]; }
    else { a = [0.15 + r() * 0.7, -0.06]; c = [0.15 + r() * 0.7, 0.78]; }
    const b: [number, number] = [0.2 + r() * 0.6, 0.15 + r() * 0.5];
    const s: Stream = {
      kind, p: [a, b, c],
      width: kind === 'gold' ? 34 + r() * 14 : kind === 'foreign' ? 60 + r() * 40 : 46 + r() * 40,
      speed: this.flow * (0.8 + r() * 0.4), rate: kind === 'gold' ? 10 : kind === 'foreign' ? 13 : 14 + r() * 6,
      sparks: kind === 'gas' ? this.sparkShare : 0, warn: 1.6, life: kind === 'gold' ? 7 : 10 + r() * 6, acc: 0, ph: r() * 6, len: 1,
    };
    let len = 0, [px, py] = this.streamPoint(s, 0, 0);
    for (let i = 1; i <= 16; i++) { const [qx, qy] = this.streamPoint(s, i / 16, 0); len += Math.hypot(qx - px, qy - py); px = qx; py = qy; }
    s.len = Math.max(100, len);
    return s;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.bgCache = null;
    if (!this.x) { const [mx, my] = this.mother; this.x = mx; this.y = my - 90; }
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

  private purity(): number {
    return this.tank > 0.001 ? clamp(1 - this.foreign / this.tank, 0, 1) : 1;
  }

  private funnelR(): number { return FUN_MIN + (FUN_MAX - FUN_MIN) * this.funnel; }

  private strikeR(s: Storm): number { return s.r * this.w * 1.25; }

  private stormPos(s: Storm): [number, number] {
    return this.fp(s.x + Math.sin(this.time * 0.15 + s.ph) * 0.05, s.y + Math.cos(this.time * 0.12 + s.ph) * 0.04);
  }

  /** Für Tests und Autopilot: ergiebigste Stelle (Raster 40 px: gute Flocken minus Fremdgas und Funken, gewichtet nach Nähe) */
  debugBestBlob(): [number, number] | null {
    const C = 40, cells = new Map<number, { v: number; x: number; y: number; n: number }>();
    for (const f of this.flakes) {
      if (f.x < 0 || f.y < 0 || f.x > this.w || f.y > this.h) continue;
      const key = Math.floor(f.x / C) * 1000 + Math.floor(f.y / C);
      const c = cells.get(key) ?? { v: 0, x: 0, y: 0, n: 0 };
      c.v += f.kind === 'gold' ? 3 : f.kind === 'gas' ? 1 : f.kind === 'spark' ? -3 : -1.5;
      if (f.kind === 'gas' || f.kind === 'gold') { c.x += f.x; c.y += f.y; c.n++; }
      cells.set(key, c);
    }
    let best: [number, number] | null = null, bs = 0;
    for (const [key, c] of cells) {
      if (!c.n) continue;
      let v = 0;
      const cx = Math.floor(key / 1000), cy = key % 1000;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) v += cells.get((cx + dx) * 1000 + cy + dy)?.v ?? 0;
      const x = c.x / c.n, y = c.y / c.n;
      const sc = v / (1 + Math.hypot(x - this.x, y - this.y) / 160);
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    return best;
  }

  pointerDown(id: number, x: number, y: number): void {
    if (y < TOP) return;
    if (x < this.w / 2) { if (!this.move) this.move = { id, ox: x, oy: y, kx: 0, ky: 0 }; }
    else if (!this.size) this.size = { id, ox: x, oy: y, kx: 0, ky: 0 };
  }

  pointerMove(id: number, x: number, y: number): void {
    const j = this.move?.id === id ? this.move : this.size?.id === id ? this.size : null;
    if (!j) return;
    let dx = x - j.ox, dy = y - j.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) {
      // Basis wandert mit, damit man nie am Anschlag hängt
      j.ox += (dx / d) * (d - JOY_R);
      j.oy += (dy / d) * (d - JOY_R);
      dx = (dx / d) * JOY_R;
      dy = (dy / d) * JOY_R;
    }
    j.kx = dx / JOY_R;
    j.ky = dy / JOY_R;
  }

  pointerUp(id: number): void {
    if (this.move?.id === id) this.move = null;
    if (this.size?.id === id) this.size = null;
  }

  /** Nur für Tests: Autopilot (gute Stellen anfliegen, Trichter nach Lage, Blitzen ausweichen, langsam andocken) */
  autopilot(): void {
    const left = DURATION - this.time;
    const steer = (tx: number, ty: number, slow = false) => {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      const k = Math.min(1, d / (slow ? 120 : 60));
      this.auto = { mx: d > 1 ? (dx / d) * k : 0, my: d > 1 ? (dy / d) * k : 0, fs: this.auto?.fs ?? 0.5 };
    };
    for (const s of this.storms) {
      if (s.state !== 'charge') continue;
      const [sx, sy] = this.stormPos(s);
      const d = Math.hypot(this.x - sx, this.y - sy);
      if (d < this.strikeR(s) * 1.25) { const k = (this.strikeR(s) * 1.6) / Math.max(1, d); steer(sx + (this.x - sx) * k, sy + (this.y - sy) * k); return; }
    }
    if (this.tank >= this.cap * 0.95 || (left < 8 && this.tank > 0.3) || this.unloading) {
      const [mx, my] = this.mother;
      steer(mx, my, true);
      this.auto!.fs = 0;
      return;
    }
    const b = this.debugBestBlob();
    if (b) steer(b[0], b[1]); else this.auto = { mx: 0, my: 0, fs: 0.5 };
    // Funken in der Nähe: zur Seite ausweichen
    for (const f of this.flakes) {
      if (f.kind !== 'spark') continue;
      const dx = this.x - f.x, dy = this.y - f.y, d = Math.hypot(dx, dy);
      if (d < 70 && d > 0.1) { this.auto!.mx += (dx / d) * (1 - d / 70) * 1.5; this.auto!.my += (dy / d) * (1 - d / 70) * 1.5; }
    }
    const l = Math.hypot(this.auto!.mx, this.auto!.my);
    if (l > 1) { this.auto!.mx /= l; this.auto!.my /= l; }
    // Trichter: klein, wenn Funken oder Fremdgas nahe sind, sonst groß
    let bad = 0;
    for (const f of this.flakes) {
      if (f.kind !== 'spark' && f.kind !== 'foreign') continue;
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if (d < FUN_MAX + 20) bad += f.kind === 'spark' ? 3 : 1;
    }
    this.auto!.fs = bad > 2 ? 0 : bad > 0 ? 0.35 : 0.85;
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
    this.beatClock += dt;
    this.score.update(dt);
    this.stun = Math.max(0, this.stun - dt);
    this.dockWarn = Math.max(0, this.dockWarn - dt);
    this.charge = Math.max(0, this.charge - 0.08 * dt);
    this.motherX = 0.5 + Math.sin(this.time * 0.12) * 0.24;
    this.updateStreams(dt);
    // Trichtergröße: rechter Stick nach oben = größer, nach unten = kleiner (bleibt beim Loslassen)
    const fs = this.auto ? this.auto.fs : null;
    if (fs != null) this.funnel += clamp(fs - this.funnel, -1.2 * dt, 1.2 * dt);
    else if (this.size) this.funnel = clamp(this.funnel - this.size.ky * 1.1 * dt, 0, 1);
    // Sauger (größerer Trichter = tiefer und kräftiger) und Triebwerk nach Tempo
    // kein Dauerrauschen mehr: die Musik steht im Vordergrund; das Triebwerk nur leise und nur bei Fahrt
    const sp = Math.min(1, Math.hypot(this.vx, this.vy) / 270);
    if (sp > 0.15) sustain('gas-engine', 'engine', sp * 0.35);
    // Fliegen: linker Stick, Trägheit; großer Trichter macht träge
    const maxV = 270 * (1 - 0.45 * this.funnel);
    const mx = this.auto ? this.auto.mx : this.move?.kx ?? 0, my = this.auto ? this.auto.my : this.move?.ky ?? 0;
    const k = Math.min(1, dt * (this.stun ? 0.6 : 3.2));
    this.vx += ((this.stun ? 0 : mx * maxV) - this.vx) * k;
    this.vy += ((this.stun ? 0 : my * maxV) - this.vy) * k;
    const [, fy, fw, fh] = this.field;
    this.x = clamp(this.x + this.vx * dt, 18, fw - 18);
    this.y = clamp(this.y + this.vy * dt, fy + 18, fy + fh - 18);
    this.catch(dt);
    if (this.mutator?.id === 'leak' && this.tank > 0) {
      const l = Math.min(this.tank, this.tank * 0.035 * dt), f = l / this.tank;
      this.tankValue -= this.tankValue * f;
      this.foreign -= this.foreign * f;
      this.tank -= l;
    }
    for (const p of this.fx.list) if (p.tx != null) { p.tx = this.x; p.ty = this.y; }
    this.updateMother(dt);
    this.updateStorms(dt);
    setGoal(this.goals, 'nohit', this.hits === 0);
    setGoal(this.goals, 'gold3', this.goldFlakes >= 30);
    setGoal(this.goals, 'full4', this.fullUnloads >= 4);
    setGoal(this.goals, 'combo', this.score.maxCombo >= 2.5);
    setGoal(this.goals, 'nowaste', this.tank < 0.05 && this.secured > 0);
    setGoal(this.goals, 'pure3', this.pureUnloads >= 3);
    setGoal(this.goals, 'nospark', this.sparksCaught === 0);
    if (this.time >= DURATION) this.endT = 0;
  }

  /** Ströme anlegen, Flocken ausstoßen und fließen lassen */
  private updateStreams(dt: number): void {
    const live = (k: Kind) => this.streams.filter((s) => s.kind === k && s.life > 0).length;
    this.nextGas -= dt;
    if (live('gas') < this.gasCount && this.nextGas <= 0) { this.streams.push(this.newStream('gas')); this.nextGas = 1.5 + this.r() * 2; }
    this.nextForeign -= dt;
    if (live('foreign') < this.foreignCount && this.nextForeign <= 0) { this.streams.push(this.newStream('foreign')); this.nextForeign = 3 + this.r() * 3; }
    this.nextGold -= dt;
    if (this.nextGold <= 0) { this.streams.push(this.newStream('gold')); this.nextGold = this.mutator?.id === 'gold' ? 7 + this.r() * 4 : 16 + this.r() * 6; }
    for (const s of this.streams) {
      if (s.warn > 0) { s.warn -= dt; continue; }
      s.life -= dt;
      if (s.life <= 0) continue;
      s.acc += s.rate * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        const kind: FlakeKind = s.kind === 'gas' && this.r() < s.sparks ? 'spark' : s.kind;
        const off = this.r() + this.r() - 1;
        this.flakes.push({ s, u: 0, off, kind, size: kind === 'spark' ? 4 : 18 + this.r() * 18, rot: this.r() * 6, v: Math.floor(this.r() * 4), x: 0, y: 0 });
      }
    }
    for (const f of this.flakes) {
      f.u += (f.s.speed * dt) / f.s.len * (f.kind === 'spark' ? 1.3 : 1);
      f.rot += dt * 0.4;
      [f.x, f.y] = this.streamPoint(f.s, f.u, f.off);
    }
    this.flakes = this.flakes.filter((f) => f.u < 1);
    this.streams = this.streams.filter((s) => s.life > 0 || s.warn > 0 || this.flakes.some((f) => f.s === s));
  }

  /** Trichter: alles im Radius wird eingesogen (solange Platz ist) */
  private catch(dt: number): void {
    this.catching = Math.max(0, this.catching - dt * 3);
    if (this.stun) return;
    const R = this.funnelR();
    const keep: Flake[] = [];
    for (const f of this.flakes) {
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if (d > R + (f.kind === 'spark' ? 2 : f.size * 0.25) || (f.kind !== 'spark' && this.tank >= this.cap)) { keep.push(f); continue; }
      if (f.kind === 'spark') {
        this.sparksCaught++;
        this.charge += 0.15;
        this.fx.burst(f.x, f.y, SPARK, 6, 120, 1.2, 'spark', 0.25);
        sfx.zap(this.charge, (this.x / this.w) * 2 - 1);
        if (this.charge >= 1) this.overload();
        continue;
      }
      const amt = Math.min(FLAKE, this.cap - this.tank);
      this.tank += amt;
      if (f.kind === 'foreign') this.foreign += amt;
      else this.tankValue += amt * (f.kind === 'gold' ? 3 : 1);
      if (f.kind === 'gold') this.goldFlakes++;
      this.catching = 1;
      this.fx.add({ x: f.x, y: f.y, vx: (f.x - this.x) * -0.5, vy: (f.y - this.y) * -0.5, color: f.kind === 'foreign' ? FOREIGN : f.kind === 'gold' ? GOLD : this.color, size: 2 + Math.random() * 1.5, max: 1, tx: this.x, ty: this.y });
      if (this.tank >= this.cap - 0.001) { this.floats.add(this.x, this.y - 40, 'Tank voll', '#ffb547', 13); sfx.warn(); }
    }
    this.flakes = keep;
    void dt;
  }

  /** Überschlag: zu viel Ladung – ein Teil des Tanks geht verloren, kurz gelähmt */
  private overload(): void {
    this.charge = 0;
    this.hits++;
    this.loseCargo(0.4);
    this.stun = 1;
    this.flash = 0.8;
    this.shake = 0.4;
    this.fx.burst(this.x, this.y, SPARK, 26, 280, 1.6, 'spark', 0.5);
    this.floats.add(this.x, this.y - 44, 'Überschlag!', '#d9c2ff', 15);
    sfx.explosion(0.8);
    buzz(60);
  }

  private loseCargo(f: number): void {
    const loss = this.tank * f;
    this.tankValue *= 1 - f;
    this.foreign *= 1 - f;
    this.tank -= loss;
    this.score.reset();
    if (loss > 0.1) this.floats.add(this.x, this.y - 26, `−${Math.round(loss * UNITS)}`, '#ff9aa4', 15);
  }

  /** Sturmzellen: Ruhe → Aufladen (Ring) → Blitz (trifft alles im Ring, wirft Funken aus) */
  private updateStorms(dt: number): void {
    const charge = [1.5, 1.4, 1.3, 1.15, 1.05][this.level - 1];
    for (const s of this.storms) {
      s.t -= dt;
      if (s.state === 'idle' && s.t <= 0) { s.state = 'charge'; s.t = charge; }
      else if (s.state === 'charge' && s.t <= 0) { s.state = 'strike'; s.t = 0.35; this.strike(s); }
      else if (s.state === 'strike' && s.t <= 0) { s.state = 'idle'; s.t = 3 + this.r() * 3; s.bolts = []; }
    }
  }

  private strike(s: Storm): void {
    const [sx, sy] = this.stormPos(s);
    const R = this.strikeR(s);
    s.bolts = [];
    for (let k = 0; k < 4; k++) {
      const a = this.r() * Math.PI * 2, d = R * (0.5 + this.r() * 0.5);
      s.bolts.push(bolt(sx, sy, sx + Math.cos(a) * d, sy + Math.sin(a) * d, this.r));
    }
    const dShip = Math.hypot(this.x - sx, this.y - sy);
    if (dShip <= R) {
      s.bolts.push(bolt(sx, sy, this.x, this.y, this.r));
      this.hits++;
      this.loseCargo(0.5);
      this.charge = 0;
      this.stun = 1.2;
      this.shake = 0.5;
      this.flash = 1;
      this.vx = ((this.x - sx) / Math.max(1, dShip)) * 220;
      this.vy = ((this.y - sy) / Math.max(1, dShip)) * 220;
      this.fx.burst(this.x, this.y, SPARK, 24, 300, 1.6, 'spark', 0.45);
      sfx.hull();
      buzz(60);
    } else {
      this.flash = Math.max(this.flash, 0.18);
      if (dShip < R * 2) buzz(15);
    }
  }

  private updateMother(dt: number): void {
    const [mx, my] = this.mother;
    const near = Math.hypot(mx - this.x, my - this.y) < 50;
    const speed = Math.hypot(this.vx, this.vy);
    if (near) this.charge = Math.max(0, this.charge - dt * 0.5);
    if (near && this.tank > 0.01) {
      if (!this.unloading && speed > DOCK_SPEED) {
        if (this.dockWarn <= 0) { this.floats.add(mx, my - 58, 'Langsamer andocken!', '#ffb547', 14); this.dockWarn = 1.5; }
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
      this.score.add(gain * 100, pureStart >= PURE ? 'Reine Ladungen (+20 %)' : 'Gesicherte Ladung');
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
        this.floats.add(mx, my - 44, pure ? 'Rein gesichert +20 %' : `Gesichert (Reinheit ${Math.round(pureStart * 100)} %)`, pure ? '#6be38f' : '#c8d0a0', 14);
        sfx.coin(pure ? 60000 : 20000);
        // Volle, reine Ladung: Kombo steigt (hält bis zur nächsten; Überschlag, Blitz und trübe Ladung setzen zurück)
        if (full && pure) { this.fullUnloads++; this.score.bump(0.5, 30); this.floats.add(mx, my - 64, `Volle Ladung ×${String(this.score.combo).replace('.', ',')}`, '#ffd27a', 15); }
        else if (full) { this.fullUnloads++; this.score.reset(); }
      }
    } else if (!near) this.unloading = false;
  }

  private finish(): GameResult {
    const [g1, g2, g3] = GOALS[this.level];
    // Ungesicherte Ladung zählt nur halb
    const open = this.tankValue * this.purity() * 0.5;
    const total = this.secured + open;
    this.score.bonus(open * 100, 'Rest im Tank (halb)');
    const stars = starsFor(total, g1, g2, g3);
    const got = `${Math.round(total * UNITS).toLocaleString('de-DE')} Einheiten`;
    return {
      success: stars > 0,
      stars,
      starRules: [g1, g2, g3].map((g, i) => ({ text: this.rules.stars[i], ok: total >= g, got })),
      breakdown: this.score.breakdown(),
      score: Math.round((total / g3) * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: stars === 3 ? 'Laderaum randvoll' : stars > 0 ? 'Gute Ausbeute' : 'Zu wenig gesichert',
      lines: [
        ['Gesichert', `${Math.round(this.secured * UNITS).toLocaleString('de-DE')} Einheiten`],
        ...(this.tank > 0.05 ? [['Im Tank (halb gewertet)', `${Math.round(this.tankValue * UNITS).toLocaleString('de-DE')}`] as [string, string]] : []),
        ['Volle Ladungen', `${this.fullUnloads}`],
        ['Reine Ladungen', `${this.pureUnloads}`],
        ['Goldene Flocken', `${this.goldFlakes}`],
        ...(this.sparkShare || this.storms.length ? [['Überschläge und Blitze', `${this.hits}`] as [string, string]] : []),
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

  /** Wolkenbilder aus fraktalem Rauschen (vier Formen je Gasart, weich auslaufend), einmal berechnet */
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
    const size = Math.round(Math.min(256, 96 * dpr));
    const set = (col: string, dark = false) => [0, 1, 2, 3].map((k) => cloud(k + (dark ? 11 : 0), size, col, dark));
    this.art = {
      clouds: { gas: set(this.color), gold: set(GOLD), foreign: set(FOREIGN), storm: set('#7a4dff', true) },
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
      const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (this.w - iw) / 2, (this.h - ih) / 2, iw, ih);
      g.fillStyle = 'rgba(3,4,12,0.68)';
      g.fillRect(0, 0, this.w, this.h);
      const v = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, this.w, this.h);
      this.bgCache = c;
    }
    ctx.drawImage(this.bgCache, 0, 0, this.w, this.h);
  }

  /**
   * Nebel atmet mit dem Bass und blitzt so hell, wie die Musik anschlägt (Eins hell, Zwei kurz nach, Drei/Vier leise);
   * die Takte wechseln sich ab – gerade Takte gehören dem Nebel, ungerade dem Glitzern der Flocken –, und jede
   * Viertakt-Phrase beginnt mit einer weichen Lichtwelle. Dazu funkelnde Sterne aus den Höhen.
   */
  private drawPulse(ctx: CanvasRenderingContext2D): void {
    const b = this.beat;
    if (b.index < 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const nebula = b.bar % 2 === 0 ? 1 : 0.7;
    const a = 0.05 * b.bass + 0.28 * b.flash * nebula + 0.12 * b.phrase + (b.level === 2 ? 0.03 : 0);
    const g = ctx.createRadialGradient(this.w / 2, this.h * 0.45, 0, this.w / 2, this.h * 0.45, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, rgba(this.color, a));
    g.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // Phrasenbeginn in lebhaften Abschnitten: Lichtring läuft von der Mitte nach außen
    if (b.phrase > 0.05 && b.level > 0) {
      const R = Math.max(this.w, this.h) * (0.15 + 0.75 * (1 - b.phrase)), cx = this.w / 2, cy = this.h * 0.45;
      const ring = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R);
      ring.addColorStop(0, rgba(this.color, 0));
      ring.addColorStop(0.7, rgba(this.color, 0.18 * b.phrase));
      ring.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = ring;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    for (const w of this.twinkles) {
      if (w.t < 0) continue;
      const k = Math.sin((w.t / 0.7) * Math.PI), r = w.s * (0.6 + k);
      ctx.fillStyle = rgba('#ffffff', 0.55 * k);
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - r * 2); ctx.lineTo(w.x + r * 0.35, w.y); ctx.lineTo(w.x, w.y + r * 2); ctx.lineTo(w.x - r * 0.35, w.y); ctx.closePath();
      ctx.moveTo(w.x - r * 2, w.y); ctx.lineTo(w.x, w.y + r * 0.35); ctx.lineTo(w.x + r * 2, w.y); ctx.lineTo(w.x, w.y - r * 0.35); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Musik: startet mit dem Spiel, pausiert mit ihm und blendet am Ende aus */
  phase(p: 'play' | 'pause' | 'end'): void {
    if (p === 'play') {
      if (this.track) this.track.resume(); else this.track = playGameTrack(trackUrl, 0.8);
      projectileSprite(DRONE); // Drohnenbild schon anfordern, damit es zum Tanz bereitliegt
    }
    else if (p === 'pause') this.track?.pause();
    else { this.track?.stop(3); this.track = null; }
  }

  /** Taktwerte für dieses Bild (aus, wenn Musik-Effekte abgeschaltet sind oder Bewegung reduziert ist) */
  private updateBeat(dt: number): void {
    const calm = typeof document !== 'undefined' && document.documentElement.classList.contains('calm');
    if (!musicFx() || calm) { this.beat = NO_BEAT; return; }
    this.beat = beatAt(trackBeats as unknown as BeatMap, this.track?.time() ?? this.beatClock);
    const b = this.beat;
    // Höhen funkeln: bei jedem neuen Schlag ein paar Sterne, je heller die Höhen, desto mehr
    if (b.index !== this.lastBeat) {
      this.lastBeat = b.index;
      const n = Math.round((b.high * 2.5 + b.level * 0.5) * (b.inBar === 0 ? 1.5 : b.inBar === 1 ? 1 : 0.4));
      for (let k = 0; k < n; k++) this.twinkles.push({ x: Math.random() * this.w, y: TOP + Math.random() * (this.h - TOP), t: 0, s: 1 + Math.random() * 1.5 });
    }
    // kräftiger Abschnitt beginnt: Lichtschauer
    if (b.level === 2 && this.lastLevel < 2 && b.sectionT < 1) for (let k = 0; k < 18; k++) this.twinkles.push({ x: Math.random() * this.w, y: TOP + Math.random() * (this.h - TOP), t: -Math.random() * 0.8, s: 1.2 + Math.random() * 1.6 });
    this.lastLevel = b.level;
    for (const w of this.twinkles) w.t += dt;
    this.twinkles = this.twinkles.filter((w) => w.t < 0.7);
  }

  private lastDraw = 0;

  /** Tanzende Drohnen: folgen den Zielpunkten der Choreografie federnd (leichtes Überschwingen wirkt verspielt) */
  private updateDance(dt: number): void {
    const map = trackBeats as unknown as BeatMap;
    const d = DANCE_START < 0 || this.endT >= 0 ? -1 : beatPos(map, this.track?.time() ?? this.beatClock) - DANCE_START;
    const fr = danceFrame(d, this.w, this.h, this.beat.flash);
    this.dance = fr;
    if (!fr) { if (d > DANCE_BEATS || d < 0) this.drones = null; return; }
    const targets = [fr.a, fr.b];
    if (!this.drones) this.drones = targets.map(([ox, oy]) => ({ x: this.x + ox, y: this.y + oy, vx: 0, vy: 0, rot: 0, trail: [] }));
    const k = fr.grip * fr.grip, c = 2 * fr.grip * 0.62;
    for (const [i, dr] of this.drones.entries()) {
      const tx = this.x + targets[i][0], ty = this.y + targets[i][1];
      dr.vx += ((tx - dr.x) * k - dr.vx * c) * dt;
      dr.vy += ((ty - dr.y) * k - dr.vy * c) * dt;
      dr.x += dr.vx * dt;
      dr.y += dr.vy * dt;
      // Nase in Flugrichtung, im Stand wieder aufrecht; beim Wackeln neben dem Sammler aufrecht und nur seitlich geneigt
      const sp = Math.hypot(dr.vx, dr.vy);
      const want = fr.figure === 'wackeln' ? clamp(dr.vx / 250, -0.5, 0.5) : sp > 25 ? Math.atan2(dr.vx, -dr.vy) : 0;
      let da = want - dr.rot;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      dr.rot += da * Math.min(1, dt * 6);
      dr.trail.unshift([dr.x, dr.y]);
      if (dr.trail.length > 14) dr.trail.pop();
    }
  }

  private drawDrones(ctx: CanvasRenderingContext2D, t: number): void {
    const fr = this.dance;
    if (!fr || !this.drones) return;
    const img = projectileSprite(DRONE), S = 40, kick = this.beat.flash;
    ctx.save();
    ctx.globalAlpha = fr.alpha;
    for (const [i, dr] of this.drones.entries()) {
      // Gasspur: kleine leuchtende Punkte, die hinter der Drohne verblassen
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [k, [x, y]] of dr.trail.entries()) {
        if (k % 2) continue;
        const a = (1 - k / dr.trail.length) * 0.22;
        ctx.fillStyle = rgba(this.color, a);
        ctx.beginPath();
        ctx.arc(x, y, 2 + (1 - k / dr.trail.length) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(dr.x, dr.y);
      ctx.rotate(dr.rot);
      const sc = 1 + 0.07 * kick;
      ctx.scale(sc, sc);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Triebwerk: Flamme nach hinten, länger bei schneller Fahrt
      const sp = Math.min(1, Math.hypot(dr.vx, dr.vy) / 220);
      const ex = DRONE_ENGINE[0] * S, ey = DRONE_ENGINE[1] * S, fl = 5 + 12 * sp + Math.random() * 3;
      const eg = ctx.createLinearGradient(ex, ey, ex, ey + fl);
      eg.addColorStop(0, rgba('#fff0d0', 0.9));
      eg.addColorStop(0.35, rgba('#ff9a3a', 0.7));
      eg.addColorStop(1, rgba('#ff9a3a', 0));
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey);
      ctx.lineTo(ex + 3, ey);
      ctx.lineTo(ex, ey + fl);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -S / 2, -S / 2, S, S);
      } else {
        // Ersatz ohne Bilder: Rumpf mit zwei Tankkugeln
        ctx.fillStyle = '#9a4a32';
        ctx.fillRect(-S * 0.08, -S * 0.4, S * 0.16, S * 0.8);
        ctx.fillStyle = '#2fa7a8';
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * S * 0.22, S * 0.05, S * 0.18, 0, Math.PI * 2); ctx.fill(); }
      }
      // Ansaugtrichter leuchten im Takt (abwechselnd je Drohne) und atmen leise weiter
      ctx.globalCompositeOperation = 'lighter';
      for (const [j, [fx, fy]] of DRONE_FUNNELS.entries()) {
        const glow = 0.25 + 0.15 * Math.sin(t * 3 + i * 2 + j) + 0.6 * kick * ((this.beat.index + i + j) % 2 ? 1 : 0.4);
        const gx = fx * S, gy = fy * S, gr = S * 0.16;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, rgba('#bff8ff', Math.min(1, glow)));
        g.addColorStop(1, rgba(this.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    const fdt = this.lastDraw ? Math.min(0.1, t - this.lastDraw) : 0.016;
    this.updateBeat(fdt);
    this.updateDance(fdt);
    this.lastDraw = t;
    this.drawBackground(ctx);
    this.drawPulse(ctx);
    if (!this.art) this.makeArt();
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 9 * this.shake, (Math.random() - 0.5) * 9 * this.shake);
    this.drawStreams(ctx, t);
    this.drawStorms(ctx, t);
    this.drawMother(ctx, t);
    this.fx.draw(ctx);
    this.drawDrones(ctx, t);
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
    this.drawSticks(ctx);
  }

  private drawStreams(ctx: CanvasRenderingContext2D, t: number): void {
    const art = this.art!;
    // Strombett: breites, schwaches Leuchten entlang der Kurve; Ankündigung am Einstieg
    const spans = new Map<Stream, [number, number]>();
    for (const f of this.flakes) {
      if (f.kind === 'spark') continue;
      const sp = spans.get(f.s);
      if (!sp) spans.set(f.s, [f.u, f.u]);
      else { sp[0] = Math.min(sp[0], f.u); sp[1] = Math.max(sp[1], f.u); }
    }
    for (const s of this.streams) {
      const col = s.kind === 'foreign' ? FOREIGN : s.kind === 'gold' ? GOLD : this.color;
      if (s.warn > 0) {
        const [x, y] = this.streamPoint(s, 0.04, 0);
        const [x2, y2] = this.streamPoint(s, 0.12, 0);
        const a = Math.atan2(y2 - y, x2 - x);
        const p = 0.5 + 0.5 * Math.sin(t * 10);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s.width);
        g.addColorStop(0, rgba(col, 0.35 * p + 0.15));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s.width, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(col, 0.9);
        for (let k = 0; k < 3; k++) {
          const ox = 12 + k * 12 + ((t * 30) % 12);
          ctx.beginPath();
          ctx.moveTo(ox + 7, 0); ctx.lineTo(ox, -6); ctx.lineTo(ox + 2, 0); ctx.lineTo(ox, 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        continue;
      }
      const fade = clamp(Math.min(s.life, 1.5) / 1.5, 0.15, 1);
      // Strombett nur dort, wo schon Gas fließt – der Weg voraus bleibt unsichtbar
      const span = spans.get(s);
      if (!span) continue;
      ctx.save();
      ctx.globalCompositeOperation = s.kind === 'foreign' ? 'source-over' : 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const [x, y] = this.streamPoint(s, span[0] + ((span[1] - span[0]) * i) / 16, 0);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      // Strombett leuchtet auf dem Schlag auf und schwillt mit dem Bass (nicht beim Fremdgas)
      const bt = s.kind === 'foreign' ? 0 : 1;
      const glow = 1 + bt * (3.5 * this.beat.flash + 1.2 * this.beat.phrase);
      ctx.strokeStyle = rgba(col, (s.kind === 'foreign' ? 0.05 : 0.035) * fade * glow);
      ctx.lineWidth = s.width * (1 + bt * 0.12 * this.beat.bass);
      ctx.stroke();
      ctx.strokeStyle = rgba(col, (s.kind === 'foreign' ? 0.05 : 0.05) * fade * glow);
      ctx.lineWidth = s.width * 0.35;
      ctx.stroke();
      ctx.restore();
    }
    // Flocken: Fremdgas trüb und deckend, Gas leuchtend
    ctx.save();
    // Glitzer: in ungeraden Takten jede dritte Flocke, sonst jede fünfte (Gold jede zweite) – mit wechselnden Gruppen
    const bp = this.beat.flash, gi = this.beat.index, every = this.beat.bar % 2 === 1 ? 3 : 5;
    for (const [fi, f] of this.flakes.entries()) {
      if (f.kind === 'spark') continue;
      const edge = Math.min(1, f.u * 8, (1 - f.u) * 8);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      const s = f.size * 2.2;
      if (f.kind === 'foreign') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.55 * edge;
        ctx.drawImage(art.clouds.foreign[f.v], -s / 2, -s / 2, s, s);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, (f.kind === 'gold' ? 0.7 : 0.5) * edge * (1 + 0.8 * bp + 0.3 * this.beat.phrase));
        ctx.drawImage((f.kind === 'gold' ? art.clouds.gold : art.clouds.gas)[f.v], -s / 2, -s / 2, s, s);
        if (bp > 0.08 && (fi + gi) % (f.kind === 'gold' ? 2 : every) === 0) {
          const r = Math.min(7, f.size * (0.06 + 0.1 * bp));
          ctx.globalAlpha = 0.55 * bp * edge;
          ctx.fillStyle = f.kind === 'gold' ? '#fff3c4' : '#ffffff';
          ctx.beginPath();
          ctx.moveTo(0, -r * 2); ctx.lineTo(r * 0.3, 0); ctx.lineTo(0, r * 2); ctx.lineTo(-r * 0.3, 0); ctx.closePath();
          ctx.moveTo(-r * 2, 0); ctx.lineTo(0, r * 0.3); ctx.lineTo(r * 2, 0); ctx.lineTo(0, -r * 0.3); ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // Funken: knisternde Lichtpunkte
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flakes) {
      if (f.kind !== 'spark') continue;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 10);
      g.addColorStop(0, rgba('#ffffff', 0.95));
      g.addColorStop(0.3, rgba(SPARK, 0.6));
      g.addColorStop(1, rgba('#9a7aff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
      ctx.fill();
      if (Math.random() < 0.5) {
        ctx.strokeStyle = rgba(SPARK, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        let x = f.x, y = f.y;
        ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) { x += (Math.random() - 0.5) * 14; y += (Math.random() - 0.5) * 14; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawStorms(ctx: CanvasRenderingContext2D, t: number): void {
    const art = this.art!;
    for (const s of this.storms) {
      const [sx, sy] = this.stormPos(s);
      const rr = s.r * this.w * 0.7;
      const R = this.strikeR(s);
      const charge = s.state === 'charge' ? 1 - s.t / [1.5, 1.4, 1.3, 1.15, 1.05][this.level - 1] : s.state === 'strike' ? 1 : 0;
      ctx.save();
      ctx.translate(sx, sy);
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.rotate(s.ph + k * 2 + t * 0.2 * (k % 2 ? 1 : -1));
        const sz = rr * (k === 0 ? 3 : 2.3);
        ctx.globalAlpha = k === 0 ? 0.9 : 0.7;
        ctx.drawImage(art.clouds.storm[k], -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
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
        if (Math.random() < 0.3 + charge * 0.6) {
          const a = Math.random() * Math.PI * 2;
          strokeBolt(ctx, bolt(Math.cos(a) * rr * 0.4, Math.sin(a) * rr * 0.4, Math.cos(a) * rr * (1 + charge), Math.sin(a) * rr * (1 + charge), Math.random), 0.6 + charge * 0.4, 1);
        }
      }
      ctx.restore();
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
    ctx.save();
    ctx.translate(mx, my);
    ctx.globalCompositeOperation = 'lighter';
    const ok = this.unloading;
    ctx.strokeStyle = rgba('#6be38f', ok ? 0.85 : 0.35 + 0.15 * Math.sin(t * 3));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 50, t * 0.8, t * 0.8 + Math.PI * 1.6);
    ctx.stroke();
    ctx.strokeStyle = rgba('#6be38f', 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 56, -t * 0.5, -t * 0.5 + Math.PI * 0.8);
    ctx.stroke();
    if (ok) {
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
    // fliegt quer: Bug in Fahrtrichtung
    const dir = Math.cos(this.time * 0.12) >= 0 ? 1 : -1;
    ctx.rotate((dir * Math.PI) / 2);
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
      ctx.beginPath();
      ctx.moveTo(-10, -26); ctx.lineTo(10, -26); ctx.lineTo(10, 26); ctx.lineTo(-10, 26);
      ctx.closePath();
      ctx.fillStyle = '#0d1e2a';
      ctx.fill();
      ctx.strokeStyle = '#6be38f';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.funnelR();
    const stun = this.stun > 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Sammeltrichter: Sogfeld mit wirbelndem Rand, beim Fangen heller
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    g.addColorStop(0, rgba(this.color, 0.04 + 0.12 * this.catching));
    g.addColorStop(0.85, rgba(this.color, 0.1 + 0.12 * this.catching));
    g.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(this.color, 0.5 + 0.3 * this.catching);
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const a0 = -t * (2.5 - this.funnel) + k * 2.09;
      ctx.beginPath();
      ctx.arc(0, 0, R, a0, a0 + 1.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.6, -a0 * 1.3, -a0 * 1.3 + 0.8);
      ctx.stroke();
    }
    ctx.restore();
    // Ladungsring (Funken): violett, flackert kurz vor dem Überschlag
    if (this.charge > 0.02) {
      ctx.strokeStyle = rgba(SPARK, this.charge > 0.75 && Math.sin(t * 20) > 0 ? 1 : 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.charge);
      ctx.stroke();
    }
    // Tankring
    const f = clamp(this.tank / this.cap, 0, 1), pur = this.purity();
    const TR = 30, a0 = -Math.PI / 2;
    ctx.strokeStyle = 'rgba(8,18,28,0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, TR, 0, Math.PI * 2);
    ctx.stroke();
    const good = f * pur;
    ctx.strokeStyle = f >= 0.99 ? (Math.sin(t * 8) > 0 ? '#ffb547' : this.color) : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, TR, a0, a0 + Math.PI * 2 * good);
    ctx.stroke();
    if (f - good > 0.002) {
      ctx.strokeStyle = FOREIGN;
      ctx.beginPath();
      ctx.arc(0, 0, TR, a0 + Math.PI * 2 * good, a0 + Math.PI * 2 * f);
      ctx.stroke();
    }
    // Sammler: leicht in Flugrichtung geneigt
    ctx.rotate(clamp(this.vx / 400, -0.4, 0.4));
    const sp = mapShipSprite('alligator_gas');
    if (sp) {
      const S = 50;
      if (!stun) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const thrust = clamp(Math.hypot(this.vx, this.vy) / 200, 0.3, 1);
        for (const ex of sp.engines.xs) {
          const fx = ex * S, fy = sp.engines.y * S, fl = 5 + 9 * thrust + Math.random() * 4;
          const eg = ctx.createLinearGradient(fx, fy, fx, fy + fl);
          eg.addColorStop(0, rgba('#fff0d0', 0.9));
          eg.addColorStop(0.3, rgba(sp.engines.color, 0.7));
          eg.addColorStop(1, rgba(sp.engines.color, 0));
          ctx.fillStyle = eg;
          ctx.beginPath();
          ctx.moveTo(fx - 3, fy);
          ctx.lineTo(fx + 3, fy);
          ctx.lineTo(fx, fy + fl);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, -S / 2, -S / 2, S, S);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(pur >= PURE ? this.color : FOREIGN, 0.15 + 0.45 * f);
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
      ctx.beginPath();
      ctx.moveTo(-9, -16); ctx.lineTo(9, -16); ctx.lineTo(13, -6); ctx.lineTo(13, 12); ctx.lineTo(6, 18); ctx.lineTo(-6, 18); ctx.lineTo(-13, 12); ctx.lineTo(-13, -6);
      ctx.closePath();
      ctx.fillStyle = '#0d1e2a';
      ctx.fill();
      ctx.strokeStyle = stun && Math.sin(t * 30) > 0 ? '#c9a6ff' : '#ffc45e';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
    // Reinheit unter dem Sammler
    if (this.tank > 0.05 && pur < 0.999 && this.endT < 0) {
      ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = pur < PURE ? '#d8dca0' : '#9fe8c0';
      ctx.fillText(`Reinheit ${Math.round(pur * 100)} %`, this.x, this.y + Math.max(R, TR) + 16);
    }
  }

  /** Sticks: links Flugstick, rechts Trichterregler (nur hoch/runter) mit Größenanzeige */
  private drawSticks(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const m = this.move;
    if (m) {
      ctx.strokeStyle = 'rgba(63,224,197,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.ox, m.oy, JOY_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(63,224,197,0.35)';
      ctx.beginPath();
      ctx.arc(m.ox + m.kx * JOY_R, m.oy + m.ky * JOY_R, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    const s = this.size;
    if (s) {
      ctx.strokeStyle = 'rgba(255,200,96,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.ox, s.oy - JOY_R);
      ctx.lineTo(s.ox, s.oy + JOY_R);
      ctx.stroke();
      ctx.font = '700 14px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,200,96,0.7)';
      ctx.fillText('+', s.ox, s.oy - JOY_R - 8);
      ctx.fillText('−', s.ox, s.oy + JOY_R + 18);
      ctx.fillStyle = 'rgba(255,200,96,0.4)';
      ctx.beginPath();
      ctx.arc(s.ox, s.oy + s.ky * JOY_R, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    // Trichtergröße (immer sichtbar, unten rechts)
    const bx = this.w - 26, by = this.h - 30, H = 120;
    ctx.fillStyle = 'rgba(8,18,28,0.75)';
    ctx.fillRect(bx - 4, by - H, 8, H);
    const g = ctx.createLinearGradient(0, by, 0, by - H);
    g.addColorStop(0, '#3fe0c5');
    g.addColorStop(1, '#ffc860');
    ctx.fillStyle = g;
    ctx.fillRect(bx - 4, by - H * this.funnel, 8, H * this.funnel);
    ctx.strokeStyle = 'rgba(110,220,205,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 4.5, by - H - 0.5, 9, H + 1);
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(169,195,198,0.85)';
    ctx.fillText('TRICHTER', bx + 6, by - H - 8);
    ctx.restore();
  }
}

/** Gezackter Blitz von A nach B (Mittelpunktverschiebung) */
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
