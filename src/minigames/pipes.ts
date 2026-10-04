// Minispiel „Störung beheben“: Leitungen drehen, bis der Energiekern alle Module versorgt.
import { WARES } from '../data/wares';
import { drawWareGlyph } from '../render/glyphs';
import { sfx } from '../ui/sound';
import { buzz, Particles, clamp, fmtTime, rgba, rng, roundRect, type GameResult, type HudItem, type Level, type MiniGame } from './common';
import { E, N, S, W, bits, consumers, generate, par, power, rotate, type Board, type PowerInfo } from './pipesLogic';

const SIZE: Record<Level, number> = { 1: 5, 2: 6, 3: 7 };
const LIMIT: Record<Level, number> = { 1: 90, 2: 120, 3: 150 };
const WARE_POOL = ['energycells', 'refinedmetals', 'graphene', 'hullparts', 'microchips', 'siliconwafers', 'antimattercells', 'water'];
const TOP = 92;
const DIR_VEC: [number, number, number][] = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];

export class PipesGame implements MiniGame {
  readonly eyebrow = 'Störung beheben';
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Rohrstück antippen: um 90° drehen', 'Der Energiekern links speist das Netz', 'Leuchtet alles und tropft nichts, läuft das Modul wieder'];
  private b: Board;
  private p: PowerInfo;
  private cons: number[];
  private ware: string;
  private color: string;
  private parMoves: number;
  private moves = 0;
  private time = 0;
  private limit: number;
  private ang: number[];
  private fx = new Particles();
  private w = 1;
  private h = 1;
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private won = -1;
  private done: GameResult | null = null;
  private down: { id: number; x: number; y: number } | null = null;

  constructor(level: Level, seed: number, ware?: string) {
    const r = rng(seed ^ 0x51ab);
    const pool = WARE_POOL.filter((w) => WARES[w]);
    this.ware = ware && WARES[ware] ? ware : pool[Math.floor(r() * pool.length)];
    this.color = WARES[this.ware]?.color ?? '#3fe0c5';
    this.title = WARES[this.ware]?.name ?? 'Leitungsnetz';
    this.intro = `Im Modul für ${WARES[this.ware]?.name ?? 'Waren'} ist die Versorgung unterbrochen. Drehe die Rohrstücke so, dass alle Verbraucher Energie bekommen und kein Rohr offen endet.`;
    this.b = generate(SIZE[level], seed);
    this.p = power(this.b);
    this.cons = consumers(this.b);
    this.parMoves = par(this.b);
    this.limit = LIMIT[level];
    this.ang = this.b.mask.map(() => 0);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const n = this.b.n;
    const avail = Math.min(w - 24, h - TOP - 90);
    this.cell = Math.floor(avail / n);
    this.ox = Math.round((w - this.cell * n) / 2);
    this.oy = Math.round(TOP + (h - TOP - 70 - this.cell * n) / 2);
  }

  hud(): HudItem[] {
    const lit = this.cons.filter((i) => this.p.dist[i] >= 0).length;
    const left = this.limit - this.time;
    return [
      { label: 'Zeit', value: fmtTime(left), warn: left < 15 },
      { label: 'Module', value: `${lit}/${this.cons.length}` },
      { label: 'Züge', value: `${this.moves}` },
    ];
  }

  /** Für automatische Tests: Rätsel bis auf ein Feld lösen */
  debugSolve(leave = 1): void {
    let left = leave;
    for (let i = 0; i < this.b.mask.length; i++) {
      if (this.b.mask[i] === this.b.solution[i] || this.b.locked[i]) continue;
      if (left > 0) { left--; continue; }
      this.b.mask[i] = this.b.solution[i];
    }
    this.p = power(this.b);
  }

  /** Bildschirmposition eines Felds (Mitte) */
  cellCenter(i: number): [number, number] {
    const n = this.b.n;
    return [this.ox + ((i % n) + 0.5) * this.cell, this.oy + (Math.floor(i / n) + 0.5) * this.cell];
  }

  /** Für Tests: ein noch falsches Feld */
  debugWrongCell(): number {
    return this.b.mask.findIndex((m, i) => m !== this.b.solution[i] && !this.b.locked[i] && bits(m) !== 4);
  }

  pointerDown(id: number, x: number, y: number): void {
    this.down = { id, x, y };
  }

  pointerMove(): void {}

  pointerUp(id: number, x: number, y: number): void {
    const d = this.down;
    this.down = null;
    if (!d || d.id !== id || Math.hypot(x - d.x, y - d.y) > 24 || this.won >= 0) return;
    const n = this.b.n;
    const cx = Math.floor((d.x - this.ox) / this.cell), cy = Math.floor((d.y - this.oy) / this.cell);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
    const i = cy * n + cx;
    if (!rotate(this.b, i)) { sfx.warn(); return; }
    this.moves++;
    this.ang[i] -= Math.PI / 2;
    const before = this.cons.filter((c) => this.p.dist[c] >= 0).length;
    this.p = power(this.b);
    const after = this.cons.filter((c) => this.p.dist[c] >= 0).length;
    if (after > before) sfx.coin(); else sfx.tap();
    buzz(8);
    if (this.p.solved) {
      this.won = 0;
      for (const c of this.cons) { const [px, py] = this.cellCenter(c); this.fx.burst(px, py, this.color, 14, 160, 2.2); }
      sfx.build();
    }
  }

  update(dt: number): void {
    if (this.done) return;
    for (let i = 0; i < this.ang.length; i++) if (this.ang[i]) { this.ang[i] *= Math.exp(-dt * 18); if (Math.abs(this.ang[i]) < 0.01) this.ang[i] = 0; }
    this.fx.update(dt);
    if (this.won >= 0) {
      this.won += dt;
      if (this.won > 1.5) this.done = this.finish(true);
      return;
    }
    this.time += dt;
    // Lecks: offene Enden versorgter Rohre sprühen
    for (const [c, d] of this.p.leaks) {
      if (Math.random() > dt * 16) continue;
      const [px, py] = this.cellCenter(c);
      const [, vx, vy] = DIR_VEC[d];
      const ex = px + vx * this.cell * 0.5, ey = py + vy * this.cell * 0.5;
      const sp = 50 + Math.random() * 60;
      this.fx.add({ x: ex, y: ey, vx: vx * sp + (Math.random() - 0.5) * 50, vy: vy * sp + (Math.random() - 0.5) * 50, color: this.color, size: 1.4, max: 0.5, drag: 2 });
    }
    if (this.time >= this.limit) this.done = this.finish(false);
  }

  private finish(ok: boolean): GameResult {
    const lit = this.cons.filter((i) => this.p.dist[i] >= 0).length;
    let stars: 0 | 1 | 2 | 3 = 0;
    if (ok) {
      stars = 3;
      if (this.moves > this.parMoves * 1.6 + 3) stars--;
      if (this.time > this.limit * 0.5) stars--;
    }
    return {
      success: ok,
      stars: stars as 0 | 1 | 2 | 3,
      score: ok ? 100 : Math.round((lit / this.cons.length) * 100),
      headline: ok ? 'Versorgung steht' : 'Zeit abgelaufen',
      lines: [
        ['Zeit', fmtTime(this.time)],
        ['Züge', `${this.moves} (Bestwert ${this.parMoves})`],
        ['Module versorgt', `${lit} von ${this.cons.length}`],
      ],
    };
  }

  result(): GameResult | null {
    return this.done;
  }

  abort(): GameResult {
    const r = this.finish(false);
    r.headline = 'Abgebrochen';
    return r;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const { w, h, cell, ox, oy } = this;
    const n = this.b.n;
    const t = now / 1000;
    // Hintergrund: dunkles Technikblech mit feinem Raster
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#06111b');
    g.addColorStop(1, '#03080e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(110,220,205,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 24) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y < h; y += 24) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    // Rahmen der Schalttafel
    ctx.strokeStyle = 'rgba(110,220,205,0.25)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, ox - 8, oy - 8, cell * n + 16, cell * n + 16, 14);
    ctx.stroke();
    const winGlow = this.won >= 0 ? Math.min(1, this.won * 2) : 0;
    for (let i = 0; i < n * n; i++) {
      const [cx, cy] = this.cellCenter(i);
      const powered = this.p.dist[i] >= 0;
      // Feld
      ctx.fillStyle = powered ? rgba(this.color, 0.05 + winGlow * 0.08) : 'rgba(14,30,44,0.75)';
      roundRect(ctx, cx - cell / 2 + 2, cy - cell / 2 + 2, cell - 4, cell - 4, Math.min(8, cell * 0.15));
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,220,205,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.ang[i]);
      this.drawTile(ctx, i, powered, t, winGlow);
      ctx.restore();
    }
    this.fx.draw(ctx);
    // Fußzeile: Hinweis
    ctx.fillStyle = 'rgba(169,195,198,0.7)';
    ctx.font = '500 13px Barlow, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const lit = this.cons.filter((i) => this.p.dist[i] >= 0).length;
    const msg = this.won >= 0 ? 'Alle Module versorgt' : this.p.leaks.length ? `${this.p.leaks.length} offene ${this.p.leaks.length === 1 ? 'Leitung' : 'Leitungen'} – Rohre drehen` : `${this.cons.length - lit} Module ohne Versorgung`;
    ctx.fillText(msg, w / 2, Math.min(h - 24, oy + cell * n + 40));
  }

  private drawTile(ctx: CanvasRenderingContext2D, i: number, powered: boolean, t: number, winGlow: number): void {
    const m = this.b.mask[i];
    const c = this.cell;
    const isSource = i === this.b.source;
    const isCons = !isSource && bits(this.b.solution[i]) === 1;
    const dist = this.p.dist[i];
    // Puls läuft vom Kern nach außen
    const pulse = powered ? 0.65 + 0.35 * Math.sin(t * 5 - dist * 0.9) : 0;
    ctx.lineCap = 'round';
    const arms: [number, number][] = [];
    for (const [bit, dx, dy] of DIR_VEC) if (m & bit) arms.push([dx, dy]);
    // Rohrmantel
    ctx.strokeStyle = '#16303f';
    ctx.lineWidth = c * 0.3;
    ctx.beginPath();
    for (const [dx, dy] of arms) { ctx.moveTo(0, 0); ctx.lineTo(dx * c * 0.5, dy * c * 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,180,200,0.22)';
    ctx.lineWidth = 1;
    for (const [dx, dy] of arms) {
      // Flansch am Rand
      const ex = dx * c * 0.44, ey = dy * c * 0.44;
      ctx.beginPath();
      ctx.moveTo(ex - dy * c * 0.17, ey - dx * c * 0.17);
      ctx.lineTo(ex + dy * c * 0.17, ey + dx * c * 0.17);
      ctx.stroke();
    }
    // Leitung innen
    ctx.beginPath();
    for (const [dx, dy] of arms) { ctx.moveTo(0, 0); ctx.lineTo(dx * c * 0.5, dy * c * 0.5); }
    if (powered) {
      ctx.strokeStyle = rgba(this.color, 0.16 + 0.12 * winGlow);
      ctx.lineWidth = c * 0.24;
      ctx.stroke();
      ctx.strokeStyle = rgba(this.color, clamp(pulse + winGlow, 0, 1));
      ctx.lineWidth = c * 0.09;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#3d5a68';
      ctx.lineWidth = c * 0.08;
      ctx.stroke();
    }
    if (isSource) {
      // Energiekern: pulsierendes Sechseck
      const r = c * 0.3;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = '#0a2a2a';
      ctx.fill();
      ctx.strokeStyle = rgba('#3fe0c5', 0.25);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#3fe0c5';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = rgba('#9ffff0', 0.6 + 0.4 * Math.sin(t * 4));
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (isCons) {
      // Verbraucher: Modul mit Warensymbol (wird gegen die Drehung aufrecht gezeichnet)
      const s = c * 0.56;
      ctx.save();
      ctx.rotate(-this.ang[i]);
      ctx.fillStyle = powered ? rgba(this.color, 0.22 + 0.15 * winGlow) : '#0c1c28';
      roundRect(ctx, -s / 2, -s / 2, s, s, 6);
      ctx.fill();
      ctx.strokeStyle = powered ? this.color : '#4a6a78';
      ctx.lineWidth = powered ? 2 : 1.5;
      ctx.stroke();
      drawWareGlyph(ctx, this.ware, s * 0.62, powered ? '#ffffff' : '#6d8a96', powered ? 0.95 : 0.7);
      ctx.restore();
      return;
    }
    // Gelenk
    ctx.fillStyle = powered ? rgba(this.color, 0.9) : '#2a4352';
    ctx.beginPath();
    ctx.arc(0, 0, c * (arms.length >= 3 ? 0.12 : 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}
