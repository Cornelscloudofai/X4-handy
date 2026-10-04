// Minispiel „Gaswirbel“: Den Sammler mit dem Finger durch dichte Gasschwaden steuern.
// Schwaden kreisen um das Zentrum des Wirbels; ab Stufe 2 gibt es Sturmzellen, die den Sammler lähmen.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import { buzz, Particles, clamp, fmtTime, rgba, rng, starsFor, Starfield, type GameResult, type HudItem, type Level, type MiniGame } from './common';

const TOP = 92;
const DURATION = 45;
const UNITS = 50;
/** Ziele für 1/2/3 Sterne (gesammelte Menge) */
const GOALS: Record<Level, [number, number, number]> = { 1: [9, 15, 21], 2: [7, 11, 15], 3: [6, 10, 14] };

interface Blob { a: number; d: number; r0: number; amount: number; max: number; dens: number; ph: number; born: number }
interface Storm { a: number; d: number; r: number; ph: number }

export class GasGame implements MiniGame {
  readonly eyebrow = 'Gas sammeln';
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Finger halten und ziehen: der Sammler folgt', 'In dichten Schwaden sammelt er am schnellsten', 'Schwaden kreisen um den Wirbel – vorausfliegen lohnt sich'];
  private ware: string;
  private color: string;
  private blobs: Blob[] = [];
  private storms: Storm[] = [];
  private r: () => number;
  private time = 0;
  private got = 0;
  private lost = 0;
  private hits = 0;
  private stun = 0;
  private immune = 0;
  private shake = 0;
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
  private fx = new Particles();
  private stars = new Starfield(110, 23);
  private w = 1;
  private h = 1;
  private cx = 0;
  private cy = 0;
  private S = 100;
  /** Höhe/Breite des Wirbels (Hochformat: gestreckt) */
  private ys = 0.82;
  private puff: HTMLCanvasElement | null = null;
  private stormPuff: HTMLCanvasElement | null = null;
  private done: GameResult | null = null;
  private endT = -1;

  constructor(private level: Level, seed: number, ware?: string) {
    this.r = rng(seed);
    this.ware = ware && WARES[ware] ? ware : 'hydrogen';
    this.color = WARES[this.ware]?.color ?? '#5a9dff';
    const name = WARES[this.ware]?.name ?? 'Gas';
    this.title = name;
    this.intro = `In diesem Wirbel ballt sich ${name}. Steuere den Sammler durch die dichtesten Schwaden und fülle den Tank, bevor die Zeit abläuft.${level >= 2 ? ' Meide die violetten Sturmzellen – Blitze legen den Sammler kurz lahm und kosten Ladung.' : ''}`;
    this.spinRate = level === 1 ? 0.18 : level === 2 ? 0.24 : 0.3;
    for (let i = 0; i < 9; i++) this.blobs.push(this.newBlob(true));
    const sc = level === 1 ? 0 : level === 2 ? 2 : 3;
    for (let i = 0; i < sc; i++) this.storms.push({ a: (i / sc) * Math.PI * 2 + this.r(), d: 0.35 + this.r() * 0.45, r: 0.13 + this.r() * 0.05, ph: this.r() * 6 });
  }

  private newBlob(initial: boolean): Blob {
    const r = this.r;
    const max = 1.5 + r() * 2.5;
    return { a: r() * Math.PI * 2, d: initial ? 0.15 + r() * 0.75 : 0.75 + r() * 0.2, r0: 0.11 + max * 0.025, amount: max, max, dens: 0.75 + r() * 0.6, ph: r() * 6, born: initial ? -9 : this.time };
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.cx = w / 2;
    this.cy = TOP + (h - TOP) / 2;
    this.S = Math.min(w, h - TOP) / 2 - 8;
    this.ys = clamp((h - TOP - 30) / (2 * this.S), 0.82, 1.75);
    if (!this.x) { this.x = w / 2; this.y = h - 90; }
  }

  hud(): HudItem[] {
    const left = DURATION - this.time;
    const goal = GOALS[this.level][2];
    return [
      { label: 'Zeit', value: fmtTime(left), warn: left < 10 },
      { label: 'Tank', value: `${Math.round((this.net() / goal) * 100)} %` },
      { label: 'Ladung', value: Math.round(this.net() * UNITS).toLocaleString('de-DE') },
    ];
  }

  private net(): number {
    return Math.max(0, this.got - this.lost);
  }

  private pos(a: number, d: number): [number, number] {
    return [this.cx + Math.cos(a) * d * this.S, this.cy + Math.sin(a) * d * this.S * this.ys];
  }

  private blobRadius(b: Blob): number {
    return (b.r0 * (0.45 + 0.55 * Math.sqrt(b.amount / b.max))) * this.S;
  }

  /** Für Tests und Autopilot: Mitte der ergiebigsten Schwade */
  debugBestBlob(): [number, number] | null {
    let best: Blob | null = null, bs = -1;
    for (const b of this.blobs) {
      if (b.amount < 0.2) continue;
      const [bx, by] = this.pos(b.a, b.d);
      const s = (b.amount * b.dens) / (1 + Math.hypot(bx - this.x, by - this.y) / 150);
      if (s > bs) { bs = s; best = b; }
    }
    return best ? this.pos(best.a, best.d) : null;
  }

  pointerDown(id: number, x: number, y: number): void {
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

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    if (this.endT >= 0) {
      this.endT += dt;
      this.vx *= 1 - Math.min(1, dt * 2);
      this.vy *= 1 - Math.min(1, dt * 2);
      if (this.endT > 1.2 && !this.fx.list.some((p) => p.tx != null)) this.done = this.finish();
      return;
    }
    this.time += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.immune = Math.max(0, this.immune - dt);
    // Wirbel dreht: innen schneller
    for (const b of this.blobs) {
      b.a += (this.spinRate / (0.35 + b.d)) * dt;
      b.d += Math.sin(this.time * 0.6 + b.ph) * 0.02 * dt;
    }
    for (const s of this.storms) s.a += (this.spinRate * 0.8 / (0.35 + s.d)) * dt;
    // Steuerung: der Sammler fliegt zum Finger, mit Trägheit
    const maxV = 250;
    let dvx = 0, dvy = 0;
    if (this.target && !this.stun) {
      const dx = this.target[0] - this.x, dy = this.target[1] - this.y;
      const dist = Math.hypot(dx, dy);
      const v = Math.min(maxV, dist * 3.2);
      if (dist > 1) { dvx = (dx / dist) * v; dvy = (dy / dist) * v; }
    }
    const k = Math.min(1, dt * (this.stun ? 0.8 : 4));
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 14, this.w - 14);
    this.y = clamp(this.y + this.vy * dt, TOP + 10, this.h - 14);
    if (Math.hypot(this.vx, this.vy) > 20) {
      const want = Math.atan2(this.vy, this.vx);
      let da = want - this.heading;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.heading += da * Math.min(1, dt * 8);
    }
    // Sammeln
    this.sucking = 0;
    if (!this.stun) {
      for (const b of this.blobs) {
        if (b.amount <= 0) continue;
        const [bx, by] = this.pos(b.a, b.d);
        const rr = this.blobRadius(b);
        const d = Math.hypot(bx - this.x, by - this.y);
        if (d > rr) continue;
        const rate = 0.95 * b.dens * (1 - (d / rr) * 0.55);
        const take = Math.min(b.amount, rate * dt);
        b.amount -= take;
        this.got += take;
        this.sucking += rate;
        // Schleierfäden zum Sammler
        this.wispAcc += take;
        while (this.wispAcc > 0.05) {
          this.wispAcc -= 0.05;
          const a = Math.random() * Math.PI * 2, dd = rr * (0.4 + Math.random() * 0.6);
          this.fx.add({ x: this.x + Math.cos(a) * dd, y: this.y + Math.sin(a) * dd, vx: -Math.sin(a) * 90, vy: Math.cos(a) * 90, color: this.color, size: 1.6 + Math.random(), max: 1.2, tx: this.x, ty: this.y });
        }
      }
    }
    // Ziel der Fäden folgt dem Sammler
    for (const p of this.fx.list) if (p.tx != null) { p.tx = this.x; p.ty = this.y; }
    // Leere Schwaden lösen sich auf und neue ziehen von außen nach
    for (let i = 0; i < this.blobs.length; i++) if (this.blobs[i].amount <= 0.05) this.blobs[i] = this.newBlob(false);
    // Sturmzellen
    if (!this.immune) {
      for (const s of this.storms) {
        const [sx, sy] = this.pos(s.a, s.d);
        if (Math.hypot(sx - this.x, sy - this.y) > s.r * this.S * 0.8) continue;
        this.stun = 1.2;
        this.immune = 2.2;
        this.hits++;
        const loss = Math.min(this.net(), 1.2);
        this.lost += loss;
        this.shake = 0.4;
        this.vx = (this.x - sx) * 3;
        this.vy = (this.y - sy) * 3;
        this.fx.burst(this.x, this.y, '#c9a6ff', 20, 260, 1.6, 'spark', 0.4);
        this.fx.burst(this.x, this.y, this.color, 14, 120, 2, 'dot', 0.8);
        sfx.warn();
        buzz(50);
        break;
      }
    }
    if (this.time >= DURATION) this.endT = 0;
  }

  private finish(): GameResult {
    const [g1, g2, g3] = GOALS[this.level];
    const n = this.net();
    const stars = starsFor(n, g1, g2, g3);
    return {
      success: stars > 0,
      stars,
      score: Math.round((n / g3) * 100),
      headline: stars === 3 ? 'Tank randvoll' : stars > 0 ? 'Gute Ausbeute' : 'Zu wenig gesammelt',
      lines: [
        ['Tank', `${Math.round((n / g3) * 100)} %`],
        [WARES[this.ware]?.name ?? 'Gas', `${Math.round(n * UNITS).toLocaleString('de-DE')} Einheiten`],
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
    r.headline = 'Abgebrochen';
    return r;
  }

  /** Nur für Tests (Node): Autopilot zur besten Schwade */
  autopilot(): void {
    const b = this.debugBestBlob();
    this.target = b;
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
      ctx.strokeStyle = rgba(this.color, 0.05);
      ctx.lineWidth = this.S * 0.16;
      ctx.stroke();
      ctx.strokeStyle = rgba(this.color, 0.07);
      ctx.lineWidth = this.S * 0.03;
      ctx.stroke();
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, this.S * 0.25);
    core.addColorStop(0, rgba(this.color, 0.25));
    core.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, this.S * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Schwaden: mehrere weiche Wolken je Schwade
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blobs) {
      const [bx, by] = this.pos(b.a, b.d);
      const rr = this.blobRadius(b);
      // neue Schwaden blenden ein
      const fade = Math.min(1, (this.time - b.born) / 1.5);
      for (let k = 0; k < 4; k++) {
        const a = b.ph + k * 1.7 + t * 0.4 * (k % 2 ? 1 : -1);
        const ox = Math.cos(a) * rr * 0.35, oy = Math.sin(a) * rr * 0.35;
        const s = rr * (k === 0 ? 2.3 : 1.6);
        ctx.globalAlpha = (0.55 + 0.3 * b.dens) * fade * (k === 0 ? 1 : 0.7);
        ctx.drawImage(this.puff, bx + ox - s / 2, by + oy - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    // Sturmzellen mit Blitzen
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
    this.fx.draw(ctx);
    this.drawShip(ctx, t);
    ctx.restore();
    if (this.target && this.endT < 0) {
      ctx.strokeStyle = 'rgba(110,220,205,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.target[0], this.target[1], 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawShip(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Ansaugtrichter leuchtet beim Sammeln
    if (this.sucking > 0) {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
      gr.addColorStop(0, rgba(this.color, 0.4));
      gr.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(this.heading + Math.PI / 2);
    const stun = this.stun > 0 && Math.sin(t * 30) > 0;
    const col = stun ? '#c9a6ff' : '#ffc45e';
    // Sammler: runder Tank mit Trichter vorn
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
    ctx.fillStyle = rgba(this.color, 0.25 + 0.5 * clamp(this.net() / GOALS[this.level][2], 0, 1));
    ctx.fill();
    ctx.strokeStyle = rgba(this.color, 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 30));
    if (!this.stun) { ctx.fillRect(-8, 18, 4, 4 + Math.random() * 4); ctx.fillRect(4, 18, 4, 4 + Math.random() * 4); }
    ctx.restore();
  }
}
