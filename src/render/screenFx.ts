// Effekte in Bildschirmkoordinaten über Karte und Galaxie: Credits fliegen zur Anzeige, Funkenregen beim Kapitelbanner.
import { rgba } from './sprites';

interface Coin { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; t: number; dur: number; delay: number; size: number; burst: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }

const GOLD = '#ffd36b';

export class ScreenFx {
  private coins: Coin[] = [];
  private sparks: Spark[] = [];
  private nextBurst = 1;
  private arrived = new Set<number>();
  enabled = true;
  /** Erster Credit einer Gruppe ist angekommen (für ein kurzes Aufleuchten der Anzeige) */
  onArrive: (() => void) | null = null;

  /** Credits fliegen in einem Bogen von (x, y) zur Anzeige (tx, ty); count nach Betrag */
  coinsTo(x: number, y: number, tx: number, ty: number, count: number): void {
    if (!this.enabled) return;
    const burst = this.nextBurst++;
    const n = Math.max(3, Math.min(18, count));
    for (let i = 0; i < n; i++) {
      // Erst etwas auseinander, dann im Bogen zur Anzeige
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 26;
      const sx = x + Math.cos(a) * r * 0.4, sy = y + Math.sin(a) * r * 0.4;
      const cx = (sx + tx) / 2 + Math.cos(a) * r * 2.2, cy = Math.min(sy, ty) + (sy - ty) * 0.35 + Math.sin(a) * r;
      this.coins.push({ x0: sx, y0: sy, cx, cy, x1: tx, y1: ty, t: 0, dur: 0.75 + Math.random() * 0.35, delay: i * 0.035, size: 1.6 + Math.random() * 1.4, burst });
    }
    if (this.coins.length > 120) this.coins.splice(0, this.coins.length - 120);
  }

  /** Funkenregen um einen Punkt (Kapitelbanner) */
  burst(x: number, y: number, color: string, n = 60): void {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 260;
      const life = 0.8 + Math.random() * 1.1;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 40, life, max: life, color: Math.random() < 0.3 ? '#ffffff' : color, size: 1 + Math.random() * 1.8 });
    }
    if (this.sparks.length > 300) this.sparks.splice(0, this.sparks.length - 300);
  }

  get busy(): boolean {
    return this.coins.length > 0 || this.sparks.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    if (!this.busy) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const c of this.coins) {
      c.t += dt;
      const k = (c.t - c.delay) / c.dur;
      if (k < 0) continue;
      if (k >= 1) {
        if (!this.arrived.has(c.burst)) { this.arrived.add(c.burst); this.onArrive?.(); }
        continue;
      }
      // Beschleunigt zum Ziel
      const e = k * k * (3 - 2 * k);
      const pos = (q: number) => {
        const u = 1 - q;
        return [u * u * c.x0 + 2 * u * q * c.cx + q * q * c.x1, u * u * c.y0 + 2 * u * q * c.cy + q * q * c.y1];
      };
      const [px, py] = pos(e);
      const [qx, qy] = pos(Math.max(0, e - 0.06));
      const a = Math.min(1, k * 4) * (1 - Math.max(0, k - 0.85) / 0.15);
      ctx.strokeStyle = rgba(GOLD, 0.35 * a);
      ctx.lineWidth = c.size * 2.2;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.fillStyle = rgba('#fff4cf', 0.95 * a);
      ctx.beginPath();
      ctx.arc(px, py, c.size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.coins = this.coins.filter((c) => c.t < c.delay + c.dur);
    if (!this.coins.length) this.arrived.clear();
    for (const p of this.sparks) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 140 * dt;
      const d = Math.exp(-1.6 * dt);
      p.vx *= d;
      p.vy *= d;
      const t = Math.max(0, p.life / p.max);
      ctx.strokeStyle = rgba(p.color, Math.min(1, t * 1.5));
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    ctx.restore();
  }
}
