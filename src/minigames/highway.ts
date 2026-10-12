// Minispiel „Superhighway“: Mit dem Frachter durch den Feldstrom eines Highways – nach Newton gesteuert.
// Science-Fiction: Der Highway trägt die Schiffe in einem Feldstrom. Sein Strömungsprofil ist wie bei einer
// laminaren Strömung im Rohr: in der Mitte am schnellsten, zum Rand hin langsamer.
// Physik: Quer zum Strom gibt es keine Reibung. Ein Seitenschub setzt das Schiff in Drift, und es driftet weiter,
// bis ein gleich starker Gegenschub es stoppt (Bremsweg v²/2a – ein Geisterbild zeigt, wo es stehen bliebe).
// Beide Daumen zugleich: Gegenschub nach vorn. Jeder Schub kostet Δv (Treibstoff). Zusammenstöße erhalten den Impuls:
// ein schwerer Frachter stößt den eigenen Frachter weg, ein leichter Kurier wird selbst weggestoßen.
// Am Ende die Ausfahrt auf der richtigen Seite treffen.
import { sfx } from '../ui/sound';
import { BG_IMAGES } from '../render/bgImages';
import { mapShipSprite, shipSprite, type FighterSprite } from '../render/shipArt';
import {
  buzz, clamp, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, roundRect, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

/** Spuren des Highways */
const LANES = 5;
/** Feldtempo in der Mitte und am Rand (px/s) */
const V_MAX = 520;
const V_MIN = 290;
/** Kopplung an den Feldstrom (1/s): wie schnell sich das eigene Tempo dem Feld anpasst */
const COUPLE = 0.9;
/** Seitenschub (Spuren/s²) und Gegenschub nach vorn (px/s²) */
const ACC_LAT = 2.4;
const ACC_RETRO = 260;
/** Strafzeit für die verpasste Ausfahrt (s) */
const PEN_EXIT = 10;

export const HIGHWAY_MUTATORS: Mutator[] = [
  { id: 'dense', name: 'Stoßzeit', desc: 'Doppelt so viel Verkehr', mult: 1.4 },
  { id: 'lowfuel', name: 'Knapper Treibstoff', desc: 'Nur halb so viel Δv', mult: 1.4 },
  { id: 'ion', name: 'Ionensturm', desc: 'Seitliche Feldböen schieben das Schiff', mult: 1.5 },
  { id: 'heavy', name: 'Schwer beladen', desc: 'Doppelte Masse: halber Seitenschub', mult: 1.3 },
];

export const HIGHWAY_GOALS: GoalDef[] = [
  { id: 'nocrash', text: 'Keine Kollision' },
  { id: 'fuel', text: 'Mit mehr als der Hälfte Δv ankommen' },
  { id: 'exit', text: 'Die Ausfahrt treffen' },
  { id: 'noretro', text: 'Ohne Gegenschub nach vorn' },
  { id: 'fast', text: 'Zielzeit für drei Sterne' },
];

interface Ship {
  /** Lage quer (Spuren, 0 … LANES) und längs (px Strecke) */
  x: number; y: number; vx: number; vy: number;
  mass: number;
  /** Breite (Spuren) und Länge (px) */
  w: number; l: number;
  /** Anteil des Feldtempos (schwere Frachter koppeln schwächer) */
  k: number;
  sprite: string;
  /** Spurwechsel: Zielspur und Blinkzeit */
  goal: number; blink: number;
  hit: number;
}

let bgImg: HTMLImageElement | null = null;
function background(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!bgImg) {
    bgImg = new Image();
    bgImg.decoding = 'async';
    bgImg.src = BG_IMAGES.find((b) => b.id === 'nebelband-tuerkis')?.url ?? '';
  }
  return bgImg.complete && bgImg.naturalWidth ? bgImg : null;
}

/** Sprites für den Verkehr: Masse, Breite, Länge, Kopplung */
const TRAFFIC: { sprite: string; mass: number; w: number; l: number; k: [number, number] }[] = [
  { sprite: 'tuatara', mass: 1, w: 0.42, l: 46, k: [0.7, 0.85] },
  { sprite: 'boa', mass: 2, w: 0.5, l: 58, k: [0.62, 0.78] },
  { sprite: 'frachter-m', mass: 3, w: 0.62, l: 70, k: [0.55, 0.7] },
  { sprite: 'buffalo', mass: 4, w: 0.66, l: 78, k: [0.5, 0.66] },
  { sprite: 'wyvern_min', mass: 9, w: 0.9, l: 104, k: [0.42, 0.55] },
];

export class HighwayGame implements MiniGame {
  readonly eyebrow = 'Superhighway';
  readonly title: string;
  readonly intro: string;
  readonly controls = [
    'Links halten: Seitenschub nach links · rechts halten: nach rechts',
    'Keine Reibung quer zum Strom: zum Anhalten genauso lange gegenschieben (Geisterbild = Haltepunkt)',
    'Beide Daumen zugleich: Gegenschub nach vorn (bremsen)',
    'Mitte des Feldstroms ist am schnellsten, der Rand langsamer',
    'Jeder Schub kostet Δv; ohne Schub lädt das Feld langsam nach – am Ende die Ausfahrt treffen',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  private level: Level;
  private r: () => number;
  private score: Score;
  private dist: number;
  private exitSide: -1 | 1;
  private exitName: string;
  private me: Ship;
  private traffic: Ship[] = [];
  private time = 0;
  private penalty = 0;
  private fuel: number;
  private fuel0: number;
  private retroUsed = false;
  /** Restzeit gestörter Feldkopplung nach einer Kollision */
  private decouple = 0;
  /** Nachladen des Δv aus dem Feld (je Sekunde ohne Schub) */
  private regen: number;
  private autoLane = -1;
  private crashes = 0;
  private exitOk: boolean | null = null;
  private gust = 0;
  private gustT = 6;
  private nextSpawn = 0;
  private density: number;
  private touches = new Map<number, -1 | 1>();
  private auto: { l: boolean; r: boolean } | null = null;
  private thrust: { l: boolean; r: boolean; retro: boolean } = { l: false, r: false, retro: false };
  private fx = new Particles();
  private floats = new Floaters();
  private stars = new Starfield(140, 41);
  private streaks: { x: number; y: number; len: number }[] = [];
  private w = 1;
  private h = 1;
  private hx = 0;
  private hw = 1;
  private shake = 0;
  private bgCache: HTMLCanvasElement | null = null;
  private done: GameResult | null = null;
  private endT = -1;

  constructor(cfg: GameCfg) {
    const L = (this.level = cfg.level);
    this.r = rng(cfg.seed);
    this.mutator = findMutator(HIGHWAY_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 4);
    this.dist = [16000, 19000, 22000, 25000, 28000][L - 1];
    this.exitSide = this.r() < 0.5 ? -1 : 1;
    const names = ['Zyarths Herrschaft', 'Tharkas Kaskade', 'Familie Zhin', 'Familie Tkr', 'Rhys Wunsch'];
    this.exitName = names[Math.floor(this.r() * names.length)];
    this.title = `Nach ${this.exitName}`;
    this.fuel0 = this.fuel = [30, 29, 28, 28, 28][L - 1] * (this.mutator?.id === 'lowfuel' ? 0.5 : 1);
    this.regen = [0.45, 0.4, 0.38, 0.36, 0.34][L - 1] * (this.mutator?.id === 'lowfuel' ? 0.5 : 1);
    this.density = [0.5, 0.62, 0.72, 0.82, 0.92][L - 1] * (this.mutator?.id === 'dense' ? 2 : 1);
    this.me = { x: LANES / 2, y: 0, vx: 0, vy: V_MAX, mass: this.mutator?.id === 'heavy' ? 2 : 1, w: 0.42, l: 48, k: 1, sprite: 'tuatara', goal: 0, blink: 0, hit: 0 };
    // Anfangsverkehr
    for (let y = 500; y < 2600; y += 260 / this.density) this.spawn(y);
    this.intro = `Der Highway trägt dich zur Ausfahrt ${this.exitName} (${this.exitSide < 0 ? 'links' : 'rechts'}). In der Mitte fließt das Feld am schnellsten. `
      + 'Quer zum Strom gibt es keine Reibung: Ein Seitenschub lässt dich driften, bis du genauso lange gegenschiebst. Weiche langsameren Frachtern aus und spar Δv – am Ende musst du die Ausfahrt treffen.'
      + (this.mutator?.id === 'ion' ? ' Ein Ionensturm schiebt dich mit seitlichen Böen.' : '');
    this.goals = pickGoals(HIGHWAY_GOALS, rng(cfg.seed ^ 0x77));
  }

  /** Feldtempo quer über den Highway (Spuren): Parabelprofil, Mitte am schnellsten */
  field(x: number): number {
    const u = (x - LANES / 2) / (LANES / 2);
    return V_MIN + (V_MAX - V_MIN) * clamp(1 - u * u, 0, 1);
  }

  private spawn(y: number): void {
    const t = TRAFFIC[Math.min(TRAFFIC.length - 1, Math.floor(this.r() ** 1.4 * TRAFFIC.length))];
    // mittlere Spuren sind beliebter (dort ist es schnell)
    const lane = clamp(Math.floor(LANES / 2 + (this.r() + this.r() - 1) * 2.6), 0, LANES - 1);
    const x = lane + 0.5;
    const k = t.k[0] + this.r() * (t.k[1] - t.k[0]);
    if (this.traffic.some((o) => Math.abs(o.x - x) < 0.8 && Math.abs(o.y - y) < 200)) return;
    this.traffic.push({ x, y, vx: 0, vy: this.field(x) * k, mass: t.mass, w: t.w, l: t.l, k, sprite: t.sprite, goal: x, blink: 0, hit: 0 });
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.bgCache = null;
    this.hw = w * 0.88;
    this.hx = (w - this.hw) / 2;
    if (!this.streaks.length) for (let k = 0; k < 120; k++) this.streaks.push({ x: this.r() * LANES, y: this.r() * h, len: 10 + this.r() * 26 });
  }

  private get laneW(): number { return this.hw / LANES; }
  private get shipY(): number { return this.h * 0.74; }
  private sx(x: number): number { return this.hx + x * this.laneW; }
  private sy(y: number): number { return this.shipY - (y - this.me.y); }

  hud(): HudItem[] {
    return [
      { label: 'Zeit', value: fmtTime(this.time + this.penalty) },
      { label: 'Strecke', value: `${Math.min(100, Math.round((this.me.y / this.dist) * 100))} %` },
      { label: 'Δv', value: `${Math.round((this.fuel / this.fuel0) * 100)} %`, warn: this.fuel < this.fuel0 * 0.2 },
    ];
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  pointerDown(id: number, x: number, y: number): void {
    if (y < TOP) return;
    this.touches.set(id, x < this.w / 2 ? -1 : 1);
  }

  pointerMove(): void { /* nur halten */ }

  pointerUp(id: number): void {
    this.touches.delete(id);
  }

  /** Haltepunkt quer: wo das Schiff bei sofortigem Gegenschub stünde */
  stopPoint(): number {
    const a = ACC_LAT / this.me.mass;
    return this.me.x + (this.me.vx * Math.abs(this.me.vx)) / (2 * a);
  }

  /** Nur für Tests: Autopilot (freie, schnelle Spur wählen; mit Bremsweg anfahren; zum Schluss zur Ausfahrt) */
  autopilot(): void {
    const me = this.me;
    const left = this.dist - me.y;
    let target: number;
    if (left < 3400) target = this.exitSide < 0 ? 0.5 : LANES - 0.5;
    else {
      // Spur bewerten: Tempo minus Hindernisse voraus
      let best = me.x, bs = -Infinity;
      for (let lane = 0; lane < LANES; lane++) {
        const x = lane + 0.5;
        let s = this.field(x);
        for (const o of this.traffic) {
          const ahead = o.y - me.y;
          if (ahead < -60 || ahead > 900) continue;
          if (Math.abs(o.x - x) < (o.w + me.w) / 2 + 0.15) s -= 900 * (1 - ahead / 900) + 200;
        }
        s -= Math.abs(x - me.x) * 60;
        if (lane === this.autoLane) s += 120; // Beharrung: nicht ständig umentscheiden
        if (s > bs) { bs = s; best = x; }
      }
      this.autoLane = Math.floor(best);
      target = best;
    }
    const a = ACC_LAT / me.mass;
    const dx = target - me.x;
    const want = Math.sign(dx) * Math.min(1.3, Math.sqrt(2 * a * Math.abs(dx)) * 0.8);
    const ev = want - me.vx;
    this.auto = { l: ev < -0.25, r: ev > 0.25 };
    // Hindernis direkt voraus in der eigenen Spur und zu nah: bremsen (beide)
    const block = this.traffic.some((o) => Math.abs(o.x - me.x) < (o.w + me.w) / 2 && o.y - me.y > 0 && o.y - me.y < 140 + (me.vy - o.vy) * 0.8);
    if (block && Math.abs(dx) < 0.3) this.auto = { l: true, r: true };
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    const me = this.me;
    if (this.endT >= 0) {
      this.endT += dt;
      me.y += me.vy * dt;
      me.x += me.vx * dt;
      if (this.endT > 2) this.done = this.finish();
      return;
    }
    this.time += dt;
    // Steuerung: links/rechts = Seitenschub, beide = Gegenschub nach vorn
    let l: boolean, rr: boolean;
    if (this.auto) ({ l, r: rr } = this.auto);
    else { const v = [...this.touches.values()]; l = v.includes(-1); rr = v.includes(1); }
    const retro = l && rr;
    const lat = retro ? 0 : (rr ? 1 : 0) - (l ? 1 : 0);
    const a = ACC_LAT / me.mass;
    this.thrust = { l: lat < 0, r: lat > 0, retro };
    // Der Feldstrom lädt die Steuerdüsen langsam nach (Science-Fiction: Feldenergie)
    if (!lat && !retro) this.fuel = Math.min(this.fuel0, this.fuel + this.regen * dt);
    if (this.fuel > 0) {
      if (lat) { me.vx += lat * a * dt; this.fuel = Math.max(0, this.fuel - a * dt); }
      if (retro) { me.vy -= (ACC_RETRO / me.mass) * dt; this.fuel = Math.max(0, this.fuel - a * dt * 0.8); this.retroUsed = true; }
    } else this.thrust = { l: false, r: false, retro: false };
    // Ionensturm: seitliche Böen (äußere Kraft)
    if (this.mutator?.id === 'ion') {
      this.gustT -= dt;
      if (this.gustT <= 0) { this.gust = (this.r() < 0.5 ? -1 : 1) * (0.9 + this.r() * 0.6); this.gustT = 4 + this.r() * 3; this.floats.add(this.w / 2, TOP + 60, this.gust < 0 ? '← Feldböe' : 'Feldböe →', '#9fd8ff', 15); }
      if (this.gust) { me.vx += this.gust * dt; this.gust *= 1 - Math.min(1, dt * 0.8); if (Math.abs(this.gust) < 0.05) this.gust = 0; }
    }
    // Längs: Kopplung an den Feldstrom (Science-Fiction-Teil)
    this.decouple = Math.max(0, this.decouple - dt);
    me.vy += (this.field(me.x) * (this.decouple > 0 ? 0.55 : 1) - me.vy) * Math.min(1, COUPLE * dt * (this.decouple > 0 ? 2 : 1));
    me.x += me.vx * dt;
    me.y += me.vy * dt;
    // Feldwände: weich, aber fest (Abprall)
    const hw = me.w / 2;
    if (me.x - hw < 0) { me.x = hw; if (me.vx < 0) { me.vx = -me.vx * 0.5; this.wall(); } }
    if (me.x + hw > LANES) { me.x = LANES - hw; if (me.vx > 0) { me.vx = -me.vx * 0.5; this.wall(); } }
    this.updateTraffic(dt);
    this.collide();
    me.hit = Math.max(0, me.hit - dt * 2);
    // Ausfahrt
    if (me.y >= this.dist) {
      const lane = Math.floor(me.x);
      this.exitOk = this.exitSide < 0 ? lane === 0 : lane === LANES - 1;
      if (!this.exitOk) { this.penalty += PEN_EXIT; this.floats.add(this.w / 2, this.h * 0.4, `Ausfahrt verpasst! +${PEN_EXIT} s`, '#ff9aa4', 18); sfx.warn(); }
      else { const p = this.score.add(500); this.floats.add(this.w / 2, this.h * 0.4, `Ausfahrt ${this.exitName} +${p}`, '#6be38f', 17); sfx.coin(); }
      me.vx += this.exitSide * 1.2;
      this.endT = 0;
      setGoal(this.goals, 'exit', this.exitOk);
      setGoal(this.goals, 'fast', this.time + this.penalty <= this.targets()[0]);
    }
    setGoal(this.goals, 'nocrash', this.crashes === 0);
    setGoal(this.goals, 'fuel', this.fuel > this.fuel0 / 2);
    setGoal(this.goals, 'noretro', !this.retroUsed);
    // Punkte: schnelle Fahrt in der Mitte
    this.score.points += Math.round((me.vy / V_MAX) * dt * 30 * this.score.mult);
  }

  private wall(): void {
    if (Math.abs(this.me.vx) < 0.2) return;
    this.shake = 0.2;
    this.fx.burst(this.sx(this.me.x), this.shipY, '#7fe8ff', 10, 140, 1.4, 'spark', 0.3);
    sfx.tap();
  }

  private updateTraffic(dt: number): void {
    const me = this.me;
    // neuer Verkehr vorn außerhalb des Bildes; Einfädler von der Seite
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this.spawn(me.y + this.shipY + 200 + this.r() * 300);
      this.nextSpawn = (0.9 + this.r() * 0.8) / this.density;
    }
    for (const o of this.traffic) {
      // Spurwechsel ankündigen (blinken) und dann mit Seitenschub fahren
      if (o.blink <= 0 && Math.abs(o.goal - o.x) < 0.02 && this.r() < dt * 0.06 * this.level) {
        const dir = this.r() < 0.5 ? -1 : 1;
        const g = clamp(Math.round(o.x - 0.5) + dir, 0, LANES - 1) + 0.5;
        if (g !== o.goal) { o.goal = g; o.blink = 1.3; }
      }
      if (o.blink > 0) o.blink -= dt;
      else if (Math.abs(o.goal - o.x) > 0.01) {
        const dx = o.goal - o.x;
        const want = Math.sign(dx) * Math.min(0.9, Math.sqrt(2 * 1.2 * Math.abs(dx)));
        o.vx += clamp(want - o.vx, -1.2 * dt, 1.2 * dt);
      } else o.vx *= 1 - Math.min(1, dt * 3);
      o.vy += (this.field(o.x) * o.k - o.vy) * Math.min(1, dt * 0.8);
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.x = clamp(o.x, o.w / 2, LANES - o.w / 2);
      o.hit = Math.max(0, o.hit - dt * 2);
    }
    this.traffic = this.traffic.filter((o) => o.y > me.y - this.h * 0.5);
  }

  /** Zusammenstöße: Kreise je Schiff, elastisch mit Masse (Impulserhaltung), quer in Spuren, längs in px */
  private collide(): void {
    const all = [this.me, ...this.traffic];
    const LW = this.laneW;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const dxp = (b.x - a.x) * LW, dyp = b.y - a.y;
      const ra = Math.max(a.w * LW, a.l) * 0.42, rb = Math.max(b.w * LW, b.l) * 0.42;
      const d = Math.hypot(dxp, dyp);
      if (d >= ra + rb || d < 1e-6) continue;
      const nx = dxp / d, ny = dyp / d;
      const ia = 1 / a.mass, ib = 1 / b.mass;
      const pen = ra + rb - d;
      a.x -= (nx * pen * ia) / (ia + ib) / LW; a.y -= (ny * pen * ia) / (ia + ib);
      b.x += (nx * pen * ib) / (ia + ib) / LW; b.y += (ny * pen * ib) / (ia + ib);
      // Geschwindigkeiten in px/s vergleichen (quer: Spuren/s × Spurbreite)
      const vrel = (b.vx - a.vx) * LW * nx + (b.vy - a.vy) * ny;
      if (vrel >= 0) continue;
      const e = 0.6;
      const jn = (-(1 + e) * vrel) / (ia + ib);
      a.vx -= (jn * nx * ia) / LW; a.vy -= jn * ny * ia;
      b.vx += (jn * nx * ib) / LW; b.vy += jn * ny * ib;
      if (a === this.me || b === this.me) {
        const o = a === this.me ? b : a;
        if (Math.abs(vrel) > 40) {
          this.crashes++;
          this.me.hit = 1;
          // Feldkopplung gestört: das Schiff fällt kurz aus dem Strom
          this.decouple = 1.5;
          o.hit = 1;
          this.score.reset();
          this.shake = clamp(Math.abs(vrel) / 300, 0.2, 0.6);
          const px = this.sx((this.me.x + o.x) / 2), py = this.sy((this.me.y + o.y) / 2);
          this.fx.burst(px, py, '#ffd0a0', 18, 220, 1.6, 'spark', 0.4);
          this.fx.add({ x: px, y: py, color: '#ff9a7a', size: 10, kind: 'ring', max: 0.4 });
          this.floats.add(px, py - 20, o.mass > this.me.mass ? 'Abgeprallt!' : 'Weggestoßen!', '#ff9aa4', 14);
          sfx.warn();
          buzz(50);
        }
      }
    }
  }

  private targets(): [number, number, number] {
    const ideal = this.dist / V_MAX;
    return [ideal * 1.15, ideal * 1.3, ideal * 1.45];
  }

  private finish(): GameResult {
    const total = this.time + this.penalty;
    const [t3, t2, t1] = this.targets();
    const stars = starsFor(-total, -t1, -t2, -t3);
    this.score.points += Math.round(this.fuel * 40 * this.score.mult);
    return {
      success: stars > 0,
      stars,
      score: Math.round(total),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: this.exitOk === false ? 'Ausfahrt verpasst' : stars === 3 ? 'Rekordfahrt' : stars > 0 ? 'Gut angekommen' : 'Zu langsam',
      lines: [
        ['Reisezeit', `${total.toFixed(1).replace('.', ',')} s`],
        ['Ausfahrt', this.exitOk ? 'getroffen' : `verpasst (+${PEN_EXIT} s)`],
        ['Kollisionen', `${this.crashes}`],
        ['Δv übrig', `${Math.round((this.fuel / this.fuel0) * 100)} %`],
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
    if (img) {
      const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
      const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
      if (!this.bgCache || this.bgCache.width !== W || this.bgCache.height !== H) {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d')!;
        g.scale(dpr, dpr);
        const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, (this.w - img.naturalWidth * s) / 2, (this.h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        g.fillStyle = 'rgba(2,5,10,0.55)';
        g.fillRect(0, 0, this.w, this.h);
        this.bgCache = c;
      }
      ctx.drawImage(this.bgCache, 0, 0, this.w, this.h);
    } else ctx.fillStyle = '#03070d', ctx.fillRect(0, 0, this.w, this.h);
    // Sterne mit Parallaxe (ziehen langsam vorbei)
    this.stars.draw(ctx, this.me.y * 0.05, '#cfe4ff');
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.drawBackground(ctx);
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    this.drawHighway(ctx, t);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, this.w, this.h - TOP);
    ctx.clip();
    this.drawExit(ctx, t);
    for (const o of this.traffic) this.drawShip(ctx, o, t, false);
    this.drawGhost(ctx);
    this.drawShip(ctx, this.me, t, true);
    ctx.restore();
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    ctx.restore();
    this.drawControls(ctx, t);
  }

  /** Feldstrom: leuchtende Wände, Spurlinien, Ringe und Strömungsschlieren (Mitte schneller) */
  private drawHighway(ctx: CanvasRenderingContext2D, t: number): void {
    const x0 = this.hx, W = this.hw, top = TOP, H = this.h - TOP;
    // Feldkörper
    const g = ctx.createLinearGradient(x0, 0, x0 + W, 0);
    g.addColorStop(0, 'rgba(60,200,220,0.16)');
    g.addColorStop(0.15, 'rgba(30,90,120,0.10)');
    g.addColorStop(0.5, 'rgba(60,170,220,0.14)');
    g.addColorStop(0.85, 'rgba(30,90,120,0.10)');
    g.addColorStop(1, 'rgba(60,200,220,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Wände
    for (const x of [x0, x0 + W]) {
      const wg = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
      wg.addColorStop(0, 'rgba(90,230,255,0)');
      wg.addColorStop(0.5, 'rgba(120,240,255,0.55)');
      wg.addColorStop(1, 'rgba(90,230,255,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(x - 8, top, 16, H);
    }
    // Strömungsschlieren: Tempo nach Profil
    const scroll = this.me.y;
    for (const s of this.streaks) {
      const v = this.field(s.x) / V_MAX;
      const y = ((((s.y + scroll * v * 1.15) % H) + H) % H) + top;
      const x = this.sx(s.x);
      ctx.strokeStyle = rgba('#8fe8ff', 0.1 + 0.25 * v);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + s.len * v);
      ctx.stroke();
    }
    // Ringe des Highways (alle 600 px)
    const step = 600;
    for (let k = Math.floor((this.me.y - this.h) / step); k < Math.ceil((this.me.y + this.h) / step); k++) {
      const y = this.sy(k * step);
      if (y < top - 10 || y > this.h + 10) continue;
      ctx.strokeStyle = 'rgba(140,240,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x0 + W / 2, y, W / 2 + 6, 10, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140,240,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(x0 + W / 2, y, W / 2 + 6, 10, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    // Leuchtbojen an den Feldwänden (alle 220 px) – zeigen das Tempo
    for (let k = Math.floor((this.me.y - this.h) / 220); k < Math.ceil((this.me.y + this.h) / 220); k++) {
      const y = this.sy(k * 220);
      if (y < top || y > this.h) continue;
      for (const x of [x0, x0 + W]) {
        const bg = ctx.createRadialGradient(x, y, 0, x, y, 9);
        bg.addColorStop(0, 'rgba(220,250,255,0.9)');
        bg.addColorStop(1, 'rgba(120,230,255,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // Spurlinien
    ctx.strokeStyle = 'rgba(160,220,240,0.12)';
    ctx.setLineDash([14, 22]);
    ctx.lineDashOffset = scroll % 36;
    ctx.lineWidth = 1;
    for (let k = 1; k < LANES; k++) {
      ctx.beginPath();
      ctx.moveTo(this.sx(k), top);
      ctx.lineTo(this.sx(k), this.h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    void t;
  }

  /** Ausfahrt: seitliches Tor mit Schild; Hinweis rechtzeitig vorher */
  private drawExit(ctx: CanvasRenderingContext2D, t: number): void {
    const left = this.dist - this.me.y;
    const y = this.sy(this.dist);
    const side = this.exitSide;
    if (left < 3200 && this.endT < 0) {
      ctx.font = '700 13px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.sin(t * 6) > 0 || left > 1500 ? '#ffd27a' : 'rgba(255,210,122,0.5)';
      ctx.fillText(`${side < 0 ? '←' : ''} Ausfahrt ${this.exitName} in ${Math.max(0, Math.round(left / 100) / 10).toFixed(1).replace('.', ',')} km ${side > 0 ? '→' : ''}`, this.w / 2, TOP + 26);
    }
    if (y < TOP - 60 || y > this.h + 60) return;
    const lx = side < 0 ? this.sx(0) : this.sx(LANES - 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
    g.addColorStop(0, 'rgba(107,227,143,0)');
    g.addColorStop(0.5, 'rgba(107,227,143,0.35)');
    g.addColorStop(1, 'rgba(107,227,143,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx, y - 40, this.laneW, 80);
    ctx.strokeStyle = 'rgba(107,227,143,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx + 2, y - 4, this.laneW - 4, 8);
    ctx.restore();
    ctx.font = '700 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6be38f';
    ctx.fillText('AUSFAHRT', lx + this.laneW / 2, y - 12);
  }

  /** Geisterbild: Haltepunkt quer bei sofortigem Gegenschub */
  private drawGhost(ctx: CanvasRenderingContext2D): void {
    const me = this.me;
    if (Math.abs(me.vx) < 0.25 || this.endT >= 0) return;
    const gx = clamp(this.stopPoint(), 0, LANES);
    const x = this.sx(gx), y = this.shipY - 24;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,210,122,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.sx(me.x), y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, this.shipY - 34); ctx.lineTo(x + 9, this.shipY + 4); ctx.lineTo(x, this.shipY - 2); ctx.lineTo(x - 9, this.shipY + 4);
    ctx.closePath();
    ctx.stroke();
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,210,122,0.9)';
    ctx.fillText('HALTEPUNKT', x, this.shipY - 40);
    ctx.restore();
  }

  private sprite(name: string): FighterSprite | null {
    return name === 'frachter-m' ? shipSprite('frachter-m', 'frachter-m') : mapShipSprite(name);
  }

  private drawShip(ctx: CanvasRenderingContext2D, o: Ship, t: number, me: boolean): void {
    const x = this.sx(o.x), y = me ? this.shipY : this.sy(o.y);
    if (y < TOP - 80 || y > this.h + 80) return;
    const size = Math.max(o.l, o.w * this.laneW) * 1.05;
    ctx.save();
    ctx.translate(x, y);
    // leichte Neigung beim Driften (nur Optik)
    ctx.rotate(clamp(o.vx * 0.08, -0.25, 0.25));
    const sp = this.sprite(o.sprite);
    // Triebwerke: Feldschiffe laufen auf Sparflamme
    if (sp) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const ex of sp.engines.xs) {
        const fx = ex * size, fy = sp.engines.y * size, fl = (me ? 8 : 5) + Math.random() * 4;
        const g = ctx.createLinearGradient(fx, fy, fx, fy + fl);
        g.addColorStop(0, rgba('#fff0d0', 0.8));
        g.addColorStop(1, rgba(sp.engines.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(fx - 2.5, fy, 5, fl);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = me ? '#1a3a4a' : '#2a2f36';
      roundRect(ctx, -o.w * this.laneW * 0.4, -o.l / 2, o.w * this.laneW * 0.8, o.l, 6);
      ctx.fill();
      ctx.strokeStyle = me ? '#ffc45e' : 'rgba(200,210,220,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (o.hit > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#ff9a7a', 0.35 * o.hit);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    // Blinker vor dem Spurwechsel
    if (!me && o.blink > 0 && Math.sin(t * 14) > 0) {
      const dir = Math.sign(o.goal - o.x);
      ctx.fillStyle = '#ffb547';
      for (const yy of [-size * 0.3, size * 0.3]) { ctx.beginPath(); ctx.arc(dir * size * 0.32, yy, 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    // eigene Steuerdüsen: Ausstoß entgegen der Schubrichtung (Rückstoß)
    if (me && this.endT < 0) {
      const th = this.thrust;
      const puff = (sx: number, sy: number, vx: number, vy: number) => this.fx.add({ x: sx, y: sy, vx: vx + (Math.random() - 0.5) * 30, vy: vy + (Math.random() - 0.5) * 30, color: '#dff4ff', size: 2.6 + Math.random() * 2, max: 0.35, solid: true, alpha: 0.55 });
      const hw = size * 0.3;
      if (th.r) { puff(x - hw, y - size * 0.25, -160, 0); puff(x - hw, y + size * 0.2, -160, 0); }
      if (th.l) { puff(x + hw, y - size * 0.25, 160, 0); puff(x + hw, y + size * 0.2, 160, 0); }
      if (th.retro) { puff(x - hw * 0.6, y - size * 0.45, 0, -200); puff(x + hw * 0.6, y - size * 0.45, 0, -200); }
    }
  }

  /** Daumenflächen und Anzeigen: Quergeschwindigkeit, Δv */
  private drawControls(ctx: CanvasRenderingContext2D, t: number): void {
    const me = this.me;
    const y = this.h - 56;
    for (const side of [-1, 1] as const) {
      const on = side < 0 ? this.thrust.l || this.thrust.retro : this.thrust.r || this.thrust.retro;
      const x = side < 0 ? 46 : this.w - 46;
      ctx.fillStyle = on ? 'rgba(127,216,255,0.25)' : 'rgba(8,18,28,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = on ? '#7fd8ff' : 'rgba(110,220,205,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = on ? '#bfefff' : 'rgba(169,195,198,0.7)';
      ctx.beginPath();
      ctx.moveTo(x + side * 10, y); ctx.lineTo(x - side * 6, y - 9); ctx.lineTo(x - side * 6, y + 9);
      ctx.closePath();
      ctx.fill();
    }
    // Quergeschwindigkeit
    const cx = this.w / 2, W = 120;
    ctx.fillStyle = 'rgba(8,18,28,0.75)';
    ctx.fillRect(cx - W / 2, y + 14, W, 6);
    const v = clamp(me.vx / 2.5, -1, 1);
    ctx.fillStyle = Math.abs(me.vx) > 1.6 ? '#ffb547' : '#7fd8ff';
    ctx.fillRect(Math.min(cx, cx + v * W / 2), y + 14, Math.abs(v) * W / 2, 6);
    ctx.fillStyle = '#e8f6ff';
    ctx.fillRect(cx - 0.5, y + 11, 1, 12);
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(169,195,198,0.85)';
    ctx.fillText(`QUERDRIFT ${Math.abs(me.vx).toFixed(1).replace('.', ',')} Spuren/s`, cx, y + 6);
    ctx.fillText(`FELD ${(me.vy / 100).toFixed(1).replace('.', ',')} km/s · Δv ${Math.round((this.fuel / this.fuel0) * 100)} %`, cx, y + 36);
    if (this.fuel <= 0 && Math.sin(t * 6) > 0) { ctx.fillStyle = '#ff9aa4'; ctx.fillText('KEIN Δv MEHR', cx, y - 8); }
  }
}
