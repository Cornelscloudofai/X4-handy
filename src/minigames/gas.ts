// Minispiel „Gaswirbel“: Gas sammeln und am Mutterschiff sichern.
// Der Tank fasst nur begrenzt viel; erst am Mutterschiff entladene Ladung zählt voll. Blitze der Sturmzellen kosten
// die Hälfte der ungesicherten Ladung – also abwägen: noch eine Schwade oder erst sichern? Goldene Schwaden zählen
// dreifach, Böen kehren den Wirbel kurz um, der Strudel in der Mitte zieht den Sammler an. Schub per Taste.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import {
  buzz, clamp, drawButton, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, Score, setGoal, starsFor, Starfield, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mutator,
} from './common';

const DURATION = 50;
const UNITS = 50;
/** Gesicherter Wert für 1/2/3 Sterne */
const GOALS: Record<Level, [number, number, number]> = { 1: [10, 17, 24], 2: [9, 15, 21], 3: [8, 13, 18], 4: [7, 12, 17], 5: [7, 11, 16] };

export const GAS_MUTATORS: Mutator[] = [
  { id: 'storm', name: 'Gewittersturm', desc: 'Zwei zusätzliche Sturmzellen', mult: 1.5 },
  { id: 'gold', name: 'Goldrausch', desc: 'Goldene Schwaden viel häufiger', mult: 1.2 },
  { id: 'leak', name: 'Leckender Tank', desc: 'Ungesicherte Ladung entweicht langsam', mult: 1.4 },
  { id: 'fast', name: 'Wirbelsturm', desc: 'Der Wirbel dreht viel schneller', mult: 1.4 },
];

export const GAS_GOALS: GoalDef[] = [
  { id: 'nohit', text: 'Kein Blitzeinschlag' },
  { id: 'gold3', text: 'Drei goldene Schwaden anzapfen' },
  { id: 'full4', text: 'Viermal mit vollem Tank entladen' },
  { id: 'combo', text: 'Kombo ×2,5 (volle Tanks in Folge)' },
  { id: 'nowaste', text: 'Am Ende nichts mehr ungesichert im Tank' },
  { id: 'noboost', text: 'Ohne Schub auskommen' },
];

interface Blob { a: number; d: number; r0: number; amount: number; max: number; dens: number; ph: number; born: number; gold: boolean; life: number }
interface Storm { a: number; d: number; r: number; ph: number; drift: number }

export class GasGame implements MiniGame {
  readonly eyebrow = 'Gas sammeln';
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Finger halten und ziehen: der Sammler folgt', 'Voller Tank? Zum Mutterschiff fliegen und entladen', 'Taste S: kurzer Schub', 'Goldene Schwaden zählen dreifach'];
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
  /** Tank: Menge und Wert (goldene Schwaden zählen dreifach) */
  private tank = 0;
  private tankValue = 0;
  private cap: number;
  private secured = 0;
  private fullUnloads = 0;
  private unloading = false;
  private unloadStart = 0;
  private golds = 0;
  private goldTimer = 6;
  private hits = 0;
  private boosts = 0;
  private stun = 0;
  private immune = 0;
  private shake = 0;
  private boostT = 0;
  private boostCd = 0;
  private gustT = 12;
  private gust = 0;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private heading = -Math.PI / 2;
  private target: [number, number] | null = null;
  private pid = -1;
  private sucking = 0;
  private wispAcc = 0;
  private spinRate: number;
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
  private puff: HTMLCanvasElement | null = null;
  private goldPuff: HTMLCanvasElement | null = null;
  private stormPuff: HTMLCanvasElement | null = null;
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
    this.intro = `In diesem Wirbel ballt sich ${name}. Sammle es ein und bring volle Tanks zum Mutterschiff – nur gesicherte Ladung zählt voll.${sc ? ' Violette Sturmzellen kosten bei einem Blitz die Hälfte der ungesicherten Ladung.' : ''}`;
    this.spinRate = [0.18, 0.24, 0.3, 0.34, 0.38][level - 1] * (this.mutator?.id === 'fast' ? 1.6 : 1);
    for (let i = 0; i < 9; i++) this.blobs.push(this.newBlob(true));
    for (let i = 0; i < sc; i++) this.storms.push({ a: (i / sc) * Math.PI * 2 + this.r(), d: 0.3 + this.r() * 0.5, r: 0.12 + this.r() * 0.05, ph: this.r() * 6, drift: level >= 4 ? 0.08 : 0 });
    const pool = GAS_GOALS.filter((g) => sc > 0 || g.id !== 'nohit');
    this.goals = pickGoals(pool, rng(cfg.seed ^ 0x77));
  }

  private newBlob(initial: boolean, gold = false): Blob {
    const r = this.r;
    const max = gold ? 1.2 : 1.5 + r() * 2.5;
    return { a: r() * Math.PI * 2, d: initial ? 0.2 + r() * 0.7 : gold ? 0.3 + r() * 0.5 : 0.75 + r() * 0.2, r0: gold ? 0.09 : 0.11 + max * 0.025, amount: max, max, dens: gold ? 1.6 : 0.75 + r() * 0.6, ph: r() * 6, born: initial ? -9 : this.time, gold, life: gold ? 8 : Infinity };
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.cx = w / 2;
    this.cy = TOP + (h - TOP) / 2;
    this.S = Math.min(w, h - TOP) / 2 - 8;
    this.ys = clamp((h - TOP - 30) / (2 * this.S), 0.82, 1.75);
    if (!this.x) { const [mx, my] = this.mother; this.x = mx; this.y = my - 40; }
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

  private get btn(): [number, number, number] { return [this.w - 46, this.h - 54, 26]; }

  /** Für Tests und Autopilot: Mitte der ergiebigsten Schwade */
  debugBestBlob(): [number, number] | null {
    let best: Blob | null = null, bs = -1;
    for (const b of this.blobs) {
      if (b.amount < 0.2) continue;
      const [bx, by] = this.pos(b.a, b.d);
      const s = (b.amount * b.dens * (b.gold ? 3 : 1)) / (1 + Math.hypot(bx - this.x, by - this.y) / 150);
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

  /** Nur für Tests: Autopilot (sammeln, bei vollem Tank zum Mutterschiff) */
  autopilot(): void {
    const left = DURATION - this.time;
    if (this.tank >= this.cap * 0.95 || (left < 9 && this.tank > 0.3) || this.unloading) {
      this.target = this.mother;
      if (Math.hypot(this.mother[0] - this.x, this.mother[1] - this.y) > 200) this.doBoost();
    } else this.target = this.debugBestBlob();
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    this.shake = Math.max(0, this.shake - dt);
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
    this.immune = Math.max(0, this.immune - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.boostCd = Math.max(0, this.boostCd - dt);
    // Böen: der Wirbel kehrt kurz um
    this.gustT -= dt;
    if (this.gustT <= 0 && this.gust <= 0) { this.gust = 3.5; this.gustT = 12 + this.r() * 5; this.floats.add(this.w / 2, TOP + 70, 'Böe!', '#9fd8ff', 18); }
    this.gust = Math.max(0, this.gust - dt);
    const dir = this.gust > 0 ? -1.4 : 1;
    for (const b of this.blobs) {
      b.a += ((this.spinRate * dir) / (0.35 + b.d)) * dt;
      b.d += Math.sin(this.time * 0.6 + b.ph) * 0.02 * dt;
      if (b.gold) b.life -= dt;
    }
    for (const s of this.storms) { s.a += ((this.spinRate * 0.8 * dir) / (0.35 + s.d)) * dt; s.d = clamp(s.d + Math.sin(this.time * 0.5 + s.ph) * s.drift * dt, 0.2, 0.85); }
    this.motherA += 0.05 * dt;
    // Goldene Schwaden
    this.goldTimer -= dt;
    if (this.goldTimer <= 0) { this.blobs.push(this.newBlob(false, true)); this.goldTimer = this.mutator?.id === 'gold' ? 4 + this.r() * 3 : 10 + this.r() * 5; }
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
    if (this.boostT > 0 && Math.random() < 0.8) this.fx.add({ x: this.x, y: this.y, vx: -this.vx * 0.3, vy: -this.vy * 0.3, color: '#9ffff0', size: 1.6, max: 0.35 });
    if (Math.hypot(this.vx, this.vy) > 20) {
      const want = Math.atan2(this.vy, this.vx);
      let da = want - this.heading;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.heading += da * Math.min(1, dt * 8);
    }
    // Sammeln, solange Platz im Tank ist
    this.sucking = 0;
    if (!this.stun && this.tank < this.cap) {
      for (const b of this.blobs) {
        if (b.amount <= 0) continue;
        const [bx, by] = this.pos(b.a, b.d);
        const rr = this.blobRadius(b);
        const d = Math.hypot(bx - this.x, by - this.y);
        if (d > rr) continue;
        const rate = 0.95 * b.dens * (1 - (d / rr) * 0.55);
        const take = Math.min(b.amount, rate * dt, this.cap - this.tank);
        if (take <= 0) continue;
        b.amount -= take;
        this.tank += take;
        this.tankValue += take * (b.gold ? 3 : 1);
        this.sucking += rate;
        if (b.gold && b.amount <= 0.05) { this.golds++; this.floats.add(bx, by, 'Gold!', '#ffd27a', 16); sfx.coin(); }
        this.wispAcc += take;
        while (this.wispAcc > 0.05) {
          this.wispAcc -= 0.05;
          const a = Math.random() * Math.PI * 2, dd = rr * (0.4 + Math.random() * 0.6);
          this.fx.add({ x: this.x + Math.cos(a) * dd, y: this.y + Math.sin(a) * dd, vx: -Math.sin(a) * 90, vy: Math.cos(a) * 90, color: b.gold ? '#ffd27a' : this.color, size: 1.6 + Math.random(), max: 1.2, tx: this.x, ty: this.y });
        }
        if (this.tank >= this.cap - 0.001) { this.floats.add(this.x, this.y - 24, 'Tank voll', '#ffb547', 13); sfx.warn(); }
      }
    }
    if (this.mutator?.id === 'leak' && this.tank > 0) { const l = Math.min(this.tank, this.tank * 0.035 * dt); this.tankValue -= (this.tankValue / this.tank) * l; this.tank -= l; }
    for (const p of this.fx.list) if (p.tx != null) { p.tx = this.x; p.ty = this.y; }
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      if (b.amount <= 0.05 || b.life <= 0) {
        if (b.gold) { this.blobs.splice(i, 1); i--; } else this.blobs[i] = this.newBlob(false);
      }
    }
    this.updateMother(dt);
    // Sturmzellen
    if (!this.immune) {
      for (const s of this.storms) {
        const [sx, sy] = this.pos(s.a, s.d);
        if (Math.hypot(sx - this.x, sy - this.y) > s.r * this.S * 0.8) continue;
        this.stun = 1.2;
        this.immune = 2.2;
        this.hits++;
        const loss = this.tank * 0.5;
        if (this.tank > 0) this.tankValue *= 0.5;
        this.tank -= loss;
        this.score.reset();
        this.shake = 0.4;
        this.vx = (this.x - sx) * 3;
        this.vy = (this.y - sy) * 3;
        this.fx.burst(this.x, this.y, '#c9a6ff', 20, 260, 1.6, 'spark', 0.4);
        this.fx.burst(this.x, this.y, this.color, 14, 120, 2, 'dot', 0.8);
        if (loss > 0.1) this.floats.add(this.x, this.y - 20, `−${Math.round(loss * UNITS)}`, '#ff9aa4', 14);
        sfx.warn();
        buzz(50);
        break;
      }
    }
    setGoal(this.goals, 'nohit', this.hits === 0);
    setGoal(this.goals, 'gold3', this.golds >= 3);
    setGoal(this.goals, 'full4', this.fullUnloads >= 4);
    setGoal(this.goals, 'combo', this.score.maxCombo >= 2.5);
    setGoal(this.goals, 'noboost', this.boosts === 0);
    setGoal(this.goals, 'nowaste', this.tank < 0.05 && this.secured > 0);
    if (this.time >= DURATION) this.endT = 0;
  }

  private updateMother(dt: number): void {
    const [mx, my] = this.mother;
    const near = Math.hypot(mx - this.x, my - this.y) < 38;
    if (near && this.tank > 0.01) {
      if (!this.unloading) { this.unloading = true; this.unloadStart = this.tank; }
      const n = Math.min(this.tank, 5 * dt);
      const v = (this.tankValue / this.tank) * n;
      this.tank -= n;
      this.tankValue -= v;
      this.secured += v;
      const p = this.score.add(v * 100);
      if (Math.random() < 0.5) this.fx.add({ x: this.x, y: this.y, vx: (mx - this.x) * 2, vy: (my - this.y) * 2, color: this.color, size: 2, max: 0.4 });
      if (this.tank <= 0.01) {
        this.tank = 0;
        this.tankValue = 0;
        this.unloading = false;
        this.floats.add(mx, my - 30, 'Gesichert', '#6be38f', 14);
        sfx.coin();
        // Voller Tank: Kombo steigt (hält bis zum nächsten vollen Tank, Blitz setzt zurück)
        if (this.unloadStart >= this.cap * 0.9) { this.fullUnloads++; this.score.bump(0.5, 30); this.floats.add(mx, my - 50, `Volle Ladung ×${String(this.score.combo).replace('.', ',')}`, '#ffd27a', 15); }
      }
      void p;
    } else if (!near) this.unloading = false;
  }

  private finish(): GameResult {
    const [g1, g2, g3] = GOALS[this.level];
    // Ungesicherte Ladung zählt nur halb
    const total = this.secured + this.tankValue * 0.5;
    this.score.points += Math.round(this.tankValue * 0.5 * 100 * this.score.mult);
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
        ['Goldene Schwaden', `${this.golds}`],
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

  private sprite(color: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(color, 0.55));
    gr.addColorStop(0.35, rgba(color, 0.28));
    gr.addColorStop(0.7, rgba(color, 0.08));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.stars.draw(ctx, 0, '#cfe4ff');
    this.puff ??= this.sprite(this.color);
    this.goldPuff ??= this.sprite('#ffd27a');
    this.stormPuff ??= this.sprite('#8a4dff');
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 9 * this.shake, (Math.random() - 0.5) * 9 * this.shake);
    // Wirbelarme
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(1, this.ys);
    ctx.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const f = k / 60;
        const a = arm * ((Math.PI * 2) / 3) + f * 4.2 - t * this.spinRate * 0.8;
        const d = (0.08 + f * 0.95) * this.S;
        k ? ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d) : ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.strokeStyle = rgba(this.gust > 0 ? '#9fd8ff' : this.color, this.gust > 0 ? 0.09 : 0.05);
      ctx.lineWidth = this.S * 0.16;
      ctx.stroke();
      ctx.strokeStyle = rgba(this.color, 0.07);
      ctx.lineWidth = this.S * 0.03;
      ctx.stroke();
    }
    // Strudel
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(this.color, 0.12 + k * 0.05);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.S * (0.2 - k * 0.06), t * (2 + k) , t * (2 + k) + 4);
      ctx.stroke();
    }
    ctx.restore();
    // Schwaden
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blobs) {
      const [bx, by] = this.pos(b.a, b.d);
      const rr = this.blobRadius(b);
      const fade = Math.min(1, (this.time - b.born) / 1.5, b.gold ? b.life / 1.5 : 1);
      for (let k = 0; k < 4; k++) {
        const a = b.ph + k * 1.7 + t * 0.4 * (k % 2 ? 1 : -1);
        const ox = Math.cos(a) * rr * 0.35, oy = Math.sin(a) * rr * 0.35;
        const s = rr * (k === 0 ? 2.3 : 1.6);
        ctx.globalAlpha = Math.max(0, (0.55 + 0.3 * b.dens) * fade * (k === 0 ? 1 : 0.7) * (b.gold ? 0.8 + 0.2 * Math.sin(t * 6) : 1));
        ctx.drawImage(b.gold ? this.goldPuff : this.puff, bx + ox - s / 2, by + oy - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    for (const s of this.storms) {
      const [sx, sy] = this.pos(s.a, s.d);
      const rr = s.r * this.S;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.stormPuff!, sx - rr * 1.3, sy - rr * 1.3, rr * 2.6, rr * 2.6);
      ctx.globalAlpha = 1;
      if (Math.sin(t * 7 + s.ph * 3) > 0.55) {
        ctx.strokeStyle = 'rgba(230,210,255,0.85)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        let lx = sx + (Math.random() - 0.5) * rr, ly = sy - rr * 0.6;
        ctx.moveTo(lx, ly);
        for (let k = 0; k < 5; k++) { lx += (Math.random() - 0.5) * rr * 0.5; ly += rr * 0.25; ctx.lineTo(lx, ly); }
        ctx.stroke();
      }
    }
    ctx.restore();
    this.drawMother(ctx, t);
    this.fx.draw(ctx);
    this.drawShip(ctx, t);
    this.floats.draw(ctx);
    ctx.restore();
    if (this.target && this.endT < 0) {
      ctx.strokeStyle = 'rgba(110,220,205,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.target[0], this.target[1], 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    const [bx, by, br] = this.btn;
    drawButton(ctx, bx, by, br, 1 - this.boostCd / 6, '#5ff0d8', 'S', t);
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
    ctx.save();
    ctx.translate(mx, my);
    ctx.strokeStyle = rgba('#6be38f', this.unloading ? 0.8 : 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 38, t * 0.8, t * 0.8 + Math.PI * 1.6);
    ctx.stroke();
    ctx.rotate(this.motherA + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-26, -10); ctx.lineTo(26, -10); ctx.lineTo(30, 0); ctx.lineTo(26, 10); ctx.lineTo(-26, 10); ctx.lineTo(-30, 0);
    ctx.closePath();
    ctx.fillStyle = '#0d1e2a';
    ctx.fill();
    ctx.strokeStyle = '#6be38f';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    for (let k = -2; k <= 2; k++) {
      ctx.fillStyle = rgba(this.color, 0.3 + (this.unloading ? 0.4 : 0));
      ctx.fillRect(k * 10 - 3.5, -5, 7, 10);
    }
    ctx.fillStyle = Math.sin(t * 4) > 0 ? '#6be38f' : 'rgba(107,227,143,0.3)';
    ctx.beginPath();
    ctx.arc(0, -14, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.sucking > 0) {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
      gr.addColorStop(0, rgba(this.color, 0.4));
      gr.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    // Tankring
    ctx.strokeStyle = 'rgba(14,30,44,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = this.tank >= this.cap * 0.99 ? '#ffb547' : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.tank / this.cap));
    ctx.stroke();
    ctx.rotate(this.heading + Math.PI / 2);
    const stun = this.stun > 0 && Math.sin(t * 30) > 0;
    const col = stun ? '#c9a6ff' : '#ffc45e';
    ctx.beginPath();
    ctx.moveTo(-9, -16); ctx.lineTo(9, -16); ctx.lineTo(13, -6); ctx.lineTo(13, 12); ctx.lineTo(6, 18); ctx.lineTo(-6, 18); ctx.lineTo(-13, 12); ctx.lineTo(-13, -6);
    ctx.closePath();
    ctx.fillStyle = '#0d1e2a';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 2, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = rgba(this.color, 0.25 + 0.5 * clamp(this.tank / this.cap, 0, 1));
    ctx.fill();
    ctx.strokeStyle = rgba(this.color, 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 30));
    if (!this.stun) { const l = this.boostT > 0 ? 10 : 4; ctx.fillRect(-8, 18, 4, l + Math.random() * 4); ctx.fillRect(4, 18, 4, l + Math.random() * 4); }
    ctx.restore();
  }
}
