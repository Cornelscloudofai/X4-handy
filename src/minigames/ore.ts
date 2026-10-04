// Minispiel „Reiche Erzader“: Mit dem Bohrlaser den leuchtenden Adern eines Asteroiden folgen.
// Weiches und hartes Gestein (dunkle, geriefte Zonen heizen stark), Kristallnester (nur mit kühlem Laser bergen,
// sonst zerspringen sie), Gastaschen (explodieren). Wer eine Ader ohne Unterbrechung abfährt, baut die Kombo auf.
// Kühlspülung per Taste. Ist ein Asteroid ausgebeutet, zerbricht er – darin wartet der nächste.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import {
  buzz, clamp, drawButton, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

const DURATION = 45;
/** Fingerversatz: der Laser trifft etwas oberhalb des Fingers, damit man den Treffpunkt sieht */
const AIM_OFFSET = 56;
/** Einheiten Rohstoff je Aderpunkt (für die Anzeige) */
const UNITS_PER_POINT = 40;

export const ORE_MUTATORS: Mutator[] = [
  { id: 'rich', name: 'Reiche Adern', desc: 'Mehr Adern, aber ein Viertel weniger Zeit', mult: 1.3 },
  { id: 'hot', name: 'Hitzewelle', desc: 'Der Laser kühlt nur halb so schnell ab', mult: 1.4 },
  { id: 'spin', name: 'Taumelnder Asteroid', desc: 'Der Asteroid dreht sich schnell', mult: 1.4 },
  { id: 'crystal', name: 'Kristallfeld', desc: 'Doppelt so viele Kristallnester', mult: 1.2 },
];

export const ORE_GOALS: GoalDef[] = [
  { id: 'cool', text: 'Nie überhitzen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'crystal2', text: 'Zwei Kristallnester bergen' },
  { id: 'break', text: 'Einen Asteroiden ganz zerlegen' },
  { id: 'nopocket', text: 'Keine Gastasche treffen' },
  { id: 'noflush', text: 'Ohne Kühlspülung auskommen' },
];

interface VeinPt { x: number; y: number; a: number }
interface Pocket { x: number; y: number; alive: boolean }
interface Crystal { x: number; y: number; prog: number; state: 'ok' | 'got' | 'broken' }
interface Zone { x: number; y: number; r: number }

export class OreGame implements MiniGame {
  readonly eyebrow = 'Bergbau';
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Finger halten und ziehen: Laser führen (trifft knapp über dem Finger)', 'Ader ohne Absetzen abfahren: Kombo steigt', 'Dunkles, gerieftes Gestein heizt stark; Kristalle nur mit kühlem Laser', 'Taste K: Kühlspülung'];
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
  private sprite: HTMLCanvasElement | null = null;
  private spriteKey = '';
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
    this.intro = `Ein Asteroid mit reichen ${name}-Adern. Fahre die leuchtenden Adern ab – ohne Absetzen steigt die Kombo. Hartes Gestein heizt den Laser stark auf. Kristallnester lassen sich nur mit kühlem Laser bergen.${this.pockets.length ? ' Rot pulsierende Gastaschen explodieren bei Beschuss.' : ''}`;
    const pool = ORE_GOALS.filter((g) => this.pockets.length > 0 || g.id !== 'nopocket');
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
      this.pockets.push({ x: p.x + Math.cos(a2) * 0.11, y: p.y + Math.sin(a2) * 0.11, alive: true });
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
    this.sprite = null;
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
    this.R = Math.min(w * 0.42, (h - TOP - 190) * 0.5);
    this.cx = w / 2;
    this.cy = TOP + 20 + this.R * 1.08;
  }

  private get ship(): [number, number] {
    return [this.w / 2, this.h - 66];
  }

  private get btn(): [number, number, number] { return [this.w - 46, this.h - 60, 26]; }

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
    for (const v of this.veins) for (const p of v) if (p.a > 0.5) { const [x, y] = this.toWorld(p.x, p.y); return [x, y + AIM_OFFSET]; }
    for (const v of this.veins) for (const p of v) if (p.a > 0.05) { const [x, y] = this.toWorld(p.x, p.y); return [x, y + AIM_OFFSET]; }
    return null;
  }

  pointerDown(id: number, x: number, y: number): void {
    const [bx, by, br] = this.btn;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.flush(); return; }
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

  private endStreak(): void {
    this.streak = 0;
    this.score.reset();
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 1.2 && !this.fx.list.some((p) => p.tx != null)) this.done = this.finish();
      return;
    }
    this.time += dt;
    this.rot += this.spin * dt;
    for (const b of this.burns) b.t += dt;
    if (this.breakT >= 0) {
      // Zerbrechen: kurze Pause, dann der nächste Asteroid
      this.breakT += dt;
      if (this.breakT > 1.1) { this.breakT = -1; this.generate(this.seed + 101 * (this.asteroids + 1)); }
      this.cool(dt);
      if (this.time >= this.duration) this.endT = 0;
      return;
    }
    const active = this.firing && !this.overheated;
    this.hit = 'space';
    if (active) {
      const [lx, ly] = this.toLocal(...this.aim);
      const inside = Math.hypot(lx, ly) <= this.radiusAt(Math.atan2(ly, lx));
      this.hardHere = inside ? this.hardness(lx, ly) : 0;
      if (inside) {
        this.hit = 'rock';
        const rr = 0.075;
        let took = 0;
        for (const v of this.veins) for (const p of v) {
          if (p.a <= 0) continue;
          const d = Math.hypot(p.x - lx, p.y - ly);
          if (d >= rr) continue;
          const take = Math.min(p.a, 3.2 * dt * (1 - d / rr) * (1 - this.hardHere * 0.35));
          p.a -= take;
          took += take;
        }
        if (took > 0.002) this.hit = 'vein';
        this.mined += took;
        this.chunkAcc += took;
        const [hx, hy] = this.aim;
        if (this.hit === 'vein') {
          this.streak += dt;
          this.offVein = 0;
          const c = Math.min(4, 1 + Math.floor(this.streak / 1.2) * 0.5);
          if (c > this.score.combo) { this.score.combo = c; this.score.maxCombo = Math.max(this.score.maxCombo, c); this.floats.add(hx, hy - 20, `×${String(c).replace('.', ',')}`, '#ffd27a', 15); }
          this.score.add(took * 120);
          while (this.chunkAcc >= 0.12) {
            this.chunkAcc -= 0.12;
            const [sx, sy] = this.ship;
            const a = Math.random() * Math.PI * 2;
            this.fx.add({ x: hx, y: hy, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, color: this.color, size: 2.2 + Math.random() * 1.6, kind: 'chunk', max: 3, vr: (Math.random() - 0.5) * 12, tx: sx, ty: sy - 10 });
          }
          if (Math.random() < dt * 30) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, color: '#fff2c8', size: 1.6, kind: 'spark', max: 0.25 });
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
        }
        this.mineCrystals(lx, ly, dt);
        for (const p of this.pockets) {
          if (!p.alive || Math.hypot(p.x - lx, p.y - ly) > 0.075) continue;
          p.alive = false;
          this.pocketHits++;
          const [px, py] = this.toWorld(p.x, p.y);
          this.fx.burst(px, py, '#ff6a4a', 26, 300, 2.6, 'chunk', 0.9);
          this.fx.burst(px, py, '#ffd0a0', 18, 380, 1.6, 'spark', 0.4);
          this.fx.add({ x: px, y: py, color: '#ff8a5c', size: 10, kind: 'ring', max: 0.5 });
          this.heat = Math.min(100, this.heat + 55);
          this.lost += Math.min(this.mined - this.lost, this.total * 0.06);
          this.score.points = Math.max(0, this.score.points - 200);
          this.floats.add(px, py - 10, '−200', '#ff9aa4', 15);
          this.endStreak();
          this.shake = 0.45;
          sfx.warn();
          buzz(60);
        }
      }
      const heatRate = this.hit === 'vein' ? 10 * (1 + this.hardHere * 0.8) : this.hit === 'rock' ? 22 + this.hardHere * 32 : 8;
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
    // Ausgebeutet: Asteroid zerbricht
    const left = this.veins.reduce((s, v) => s + v.reduce((q, p) => q + Math.max(0, p.a), 0), 0);
    if (left < this.astTotal * 0.08) this.breakAsteroid();
    setGoal(this.goals, 'cool', this.overheats === 0);
    setGoal(this.goals, 'combo3', this.score.maxCombo >= 3);
    setGoal(this.goals, 'crystal2', this.gotCrystals >= 2);
    setGoal(this.goals, 'break', this.asteroids >= 1);
    setGoal(this.goals, 'nopocket', this.pocketHits === 0);
    setGoal(this.goals, 'noflush', this.flushesUsed === 0);
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

  private mineCrystals(lx: number, ly: number, dt: number): void {
    for (const c of this.crystals) {
      if (c.state !== 'ok' || Math.hypot(c.x - lx, c.y - ly) > 0.07) continue;
      const [px, py] = this.toWorld(c.x, c.y);
      if (this.heat >= 40) {
        // zu heiß: Kristall zerspringt
        c.state = 'broken';
        this.fx.burst(px, py, '#9ff3ff', 18, 220, 1.8, 'chunk', 0.7);
        this.floats.add(px, py - 14, 'Zersprungen', '#9ff3ff', 13);
        sfx.warn();
        continue;
      }
      c.prog += dt * 1.1;
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
    this.pid = -1;
    const p = this.score.add(800);
    this.floats.add(this.cx, this.cy, `Zerlegt! +${p}`, '#ffd27a', 20);
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * this.R;
      this.fx.add({ x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d, vx: Math.cos(a) * (120 + Math.random() * 200), vy: Math.sin(a) * (120 + Math.random() * 200), color: k % 3 ? '#6a5e52' : this.color, size: 3 + Math.random() * 5, kind: 'chunk', max: 1.2, vr: (Math.random() - 0.5) * 8 });
    }
    this.shake = 0.5;
    sfx.build();
    buzz(80);
  }

  private finish(): GameResult {
    const f = this.fraction();
    const stars = starsFor(f, 0.4, 0.7, 1.05);
    return {
      success: stars > 0,
      stars,
      score: Math.round(f * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: this.asteroids ? `${this.asteroids + 1}. Asteroid angebohrt` : stars === 3 ? 'Ader ausgebeutet' : stars > 0 ? 'Gute Ausbeute' : 'Zu wenig abgebaut',
      lines: [
        ['Ausbeute', `${Math.round(f * 100)} %`],
        [WARES[this.ware]?.name ?? 'Erz', `${Math.round(Math.max(0, this.mined - this.lost) * UNITS_PER_POINT).toLocaleString('de-DE')} Einheiten`],
        ['Kristalle', `${this.gotCrystals}`],
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

  private makeSprite(): void {
    const dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
    const R = this.R;
    const size = Math.ceil(R * 2.3 * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.translate(R * 1.15, R * 1.15);
    const path = new Path2D();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2, r = this.shape[k % 64] * R;
      k ? path.lineTo(Math.cos(a) * r, Math.sin(a) * r) : path.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const grad = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
    grad.addColorStop(0, '#5a5048');
    grad.addColorStop(0.55, '#2e2924');
    grad.addColorStop(1, '#141210');
    g.fillStyle = grad;
    g.fill(path);
    g.save();
    g.clip(path);
    // harte Zonen: dunkler, gerieft
    for (const z of this.zones) {
      const zg = g.createRadialGradient(z.x * R, z.y * R, 0, z.x * R, z.y * R, z.r * R);
      zg.addColorStop(0, 'rgba(8,10,16,0.6)');
      zg.addColorStop(0.65, 'rgba(8,10,16,0.45)');
      zg.addColorStop(1, 'rgba(8,10,16,0)');
      g.fillStyle = zg;
      g.beginPath();
      g.arc(z.x * R, z.y * R, z.r * R, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.beginPath();
      g.arc(z.x * R, z.y * R, z.r * R * 0.8, 0, Math.PI * 2);
      g.clip();
      g.strokeStyle = 'rgba(140,160,190,0.12)';
      g.lineWidth = 1;
      for (let k = -8; k <= 8; k++) {
        g.beginPath();
        g.moveTo(z.x * R + k * R * 0.03 - R * 0.3, z.y * R - R * 0.3);
        g.lineTo(z.x * R + k * R * 0.03 + R * 0.3, z.y * R + R * 0.3);
        g.stroke();
      }
      g.restore();
    }
    const r = rng(99);
    for (let k = 0; k < 900; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,220,0.06)';
      g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1 + r() * 2, 1 + r() * 2);
    }
    for (const k of this.craters) {
      const x = k.x * R, y = k.y * R, rr = k.r * R;
      const cg = g.createRadialGradient(x + rr * 0.2, y + rr * 0.25, 0, x, y, rr);
      cg.addColorStop(0, 'rgba(0,0,0,0.45)');
      cg.addColorStop(0.8, 'rgba(0,0,0,0.25)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,235,210,0.12)';
      g.lineWidth = Math.max(1, rr * 0.12);
      g.beginPath();
      g.arc(x, y, rr * 0.92, Math.PI * 0.75, Math.PI * 1.6);
      g.stroke();
    }
    const sh = g.createLinearGradient(-R, -R, R, R);
    sh.addColorStop(0.45, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = sh;
    g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    g.restore();
    g.strokeStyle = 'rgba(255,230,200,0.18)';
    g.lineWidth = 1.2;
    g.stroke(path);
    this.sprite = c;
    this.spriteKey = `${R}`;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.stars.draw(ctx, 0, '#ffe6c8');
    if (!this.sprite || this.spriteKey !== `${this.R}`) this.makeSprite();
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    const R = this.R;
    if (this.breakT < 0) {
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot);
      ctx.drawImage(this.sprite!, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      for (const b of this.burns) {
        const hot = Math.max(0, 1 - b.t / 1.2);
        ctx.fillStyle = hot > 0 ? rgba('#ff8a4a', 0.5 * hot) : 'rgba(10,8,6,0.35)';
        ctx.beginPath();
        ctx.arc(b.x * R, b.y * R, R * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawVeins(ctx, t);
      this.drawCrystals(ctx, t);
      this.drawPockets(ctx, t);
      ctx.restore();
    } else if (this.breakT > 0.6) {
      // neuer Asteroid schwebt ein
      const a = (this.breakT - 0.6) / 0.5;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.translate(this.cx, this.cy);
      ctx.scale(0.6 + 0.4 * a, 0.6 + 0.4 * a);
      ctx.drawImage(this.sprite!, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      ctx.restore();
    }
    this.drawShipAndLaser(ctx, t);
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    ctx.restore();
    this.drawHeat(ctx, t);
    const [bx, by, br] = this.btn;
    drawButton(ctx, bx, by, br, this.flushes > 0 ? 1 : 0, '#7fd8ff', 'K', t, this.flushes);
  }

  private drawVeins(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const v of this.veins) {
      for (let i = 1; i < v.length; i++) {
        const a = Math.min(v[i - 1].a, v[i].a);
        if (a <= 0.02) continue;
        ctx.beginPath();
        ctx.moveTo(v[i - 1].x * R, v[i - 1].y * R);
        ctx.lineTo(v[i].x * R, v[i].y * R);
        ctx.strokeStyle = rgba(this.color, 0.22 * a);
        ctx.lineWidth = R * 0.07 * (0.5 + a * 0.5);
        ctx.stroke();
        ctx.strokeStyle = rgba(this.color, 0.85 * a);
        ctx.lineWidth = R * 0.022 * (0.4 + a * 0.6);
        ctx.stroke();
      }
      for (let i = 0; i < v.length; i++) {
        const p = v[i];
        if (p.a < 0.4) continue;
        const tw = Math.sin(t * 3 + i * 2.3 + p.x * 20);
        if (tw < 0.85) continue;
        ctx.fillStyle = rgba('#fff4d8', (tw - 0.85) * 6 * p.a);
        ctx.beginPath();
        ctx.arc(p.x * R, p.y * R, R * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawCrystals(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R;
    for (const c of this.crystals) {
      if (c.state !== 'ok') continue;
      ctx.save();
      ctx.translate(c.x * R, c.y * R);
      const hot = this.heat >= 40;
      // Kristallnest: mehrere Prismen
      for (let k = 0; k < 4; k++) {
        const a = k * 1.6 + c.x * 7;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.06); ctx.lineTo(R * 0.022, 0); ctx.lineTo(0, R * 0.02); ctx.lineTo(-R * 0.022, 0);
        ctx.closePath();
        ctx.fillStyle = rgba('#9ff3ff', 0.35 + 0.25 * Math.sin(t * 3 + k));
        ctx.fill();
        ctx.strokeStyle = '#cffaff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      if (c.prog > 0) {
        ctx.strokeStyle = '#9ff3ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.08, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.prog);
        ctx.stroke();
      }
      if (hot && this.firing) {
        ctx.strokeStyle = rgba('#ff5c6c', 0.4 + 0.3 * Math.sin(t * 10));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.09, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPockets(ctx: CanvasRenderingContext2D, t: number): void {
    const R = this.R;
    for (const p of this.pockets) {
      if (!p.alive) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + p.x * 9);
      const gr = ctx.createRadialGradient(p.x * R, p.y * R, 0, p.x * R, p.y * R, R * 0.09);
      gr.addColorStop(0, rgba('#ff5c4a', 0.75));
      gr.addColorStop(0.5, rgba('#ff3a2a', 0.25 + 0.2 * pulse));
      gr.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(p.x * R, p.y * R, R * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba('#ff8a7a', 0.4 + 0.4 * pulse);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x * R, p.y * R, R * (0.05 + 0.015 * pulse), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawShipAndLaser(ctx: CanvasRenderingContext2D, t: number): void {
    const [sx, sy] = this.ship;
    const [ax, ay] = this.aim;
    const active = this.firing && !this.overheated && this.endT < 0 && this.breakT < 0;
    const ang = active ? Math.atan2(ay - sy, ax - sx) + Math.PI / 2 : 0;
    if (active) {
      const nx = sx + Math.sin(ang) * 22, ny = sy - Math.cos(ang) * 22;
      const flick = 0.8 + 0.2 * Math.sin(t * 60);
      const col = this.hit === 'vein' ? this.color : '#ff7a4a';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = rgba(col, 0.18 * flick);
      ctx.lineWidth = 9 + (this.score.combo - 1) * 3;
      ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.6 * flick);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = rgba('#fff6e0', 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (this.hit !== 'space') {
        const gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, 22);
        gr.addColorStop(0, rgba('#fff4d8', 0.9));
        gr.addColorStop(0.3, rgba(col, 0.5));
        gr.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(ax, ay, 22, 0, Math.PI * 2);
        ctx.fill();
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
    ctx.fillStyle = rgba(this.color, 0.3 + 0.5 * clamp(this.fx.list.filter((p) => p.tx != null).length / 20, 0, 1));
    ctx.fillRect(-7, -4, 14, 14);
    ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 30));
    ctx.fillRect(-9, 20, 5, 4 + Math.random() * 3);
    ctx.fillRect(4, 20, 5, 4 + Math.random() * 3);
    ctx.restore();
  }

  private drawHeat(ctx: CanvasRenderingContext2D, t: number): void {
    const [, sy] = this.ship;
    const W = 90, H = 6, bx = 16, y = sy - 3;
    const f = this.heat / 100;
    ctx.fillStyle = 'rgba(14,30,44,0.85)';
    ctx.fillRect(bx, y, W, H);
    const col = this.overheated ? '#ff5c6c' : f > 0.7 ? '#ffb547' : '#3fe0c5';
    ctx.fillStyle = this.overheated && Math.sin(t * 12) > 0 ? 'rgba(255,92,108,0.5)' : col;
    ctx.fillRect(bx, y, W * f, H);
    // Grenze für Kristalle
    ctx.fillStyle = '#9ff3ff';
    ctx.fillRect(bx + W * 0.4 - 0.5, y - 3, 1.5, H + 6);
    ctx.strokeStyle = 'rgba(110,220,205,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, y + 0.5, W - 1, H - 1);
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.overheated ? '#ff9aa4' : this.hardHere > 0.3 && this.firing ? '#ffb547' : 'rgba(169,195,198,0.85)';
    ctx.fillText(this.overheated ? 'ÜBERHITZT – LOSLASSEN' : this.hardHere > 0.3 && this.firing ? 'HARTES GESTEIN' : 'LASERHITZE', bx, y - 6);
  }
}
