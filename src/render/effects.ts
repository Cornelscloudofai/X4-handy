// Partikel-Effekte auf der Karte: Funken bei fertigen Modulen und neuen Schiffen, Schweißfunken an Baustellen,
// Gesteinssplitter und Gas-Sog beim Abbau. Alle Teilchen leben in Weltkoordinaten und bleiben so an ihrem Ort.
import type { Camera } from './camera';
import { rgba } from './sprites';

interface Particle {
  sector: string;
  x: number; z: number;
  vx: number; vz: number;
  life: number; max: number;
  color: string;
  size: number;
  /** Funke (mit Schweif), Punkt oder Ring (wächst) */
  kind: 'spark' | 'dot' | 'ring' | 'flash';
  drag: number;
  /** Ziel, auf das das Teilchen zufliegt (Gas-Sog) */
  tx?: number; tz?: number;
}

const MAX = 450;

export class Effects {
  private ps: Particle[] = [];
  enabled = true;
  /** Aktueller Zoom (Pixel je km): Geschwindigkeiten werden in Bildschirmpixeln angegeben */
  zoom = 1;
  /** Symbolmaßstab der Karte: herausgezoomt sind Teilchen kleiner, langsamer, weniger und blasser */
  scale = 1;

  private push(p: Particle): void {
    if (!this.enabled) return;
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push(p);
  }

  /** Funkenregen mit Lichtring – Modul fertig, Schiff vom Stapel */
  burst(sector: string, x: number, z: number, color: string, power = 1): void {
    this.push({ sector, x, z, vx: 0, vz: 0, life: 0.9, max: 0.9, color, size: 6 * power, kind: 'ring', drag: 0 });
    this.push({ sector, x, z, vx: 0, vz: 0, life: 0.6, max: 0.6, color: '#ffffff', size: 3 * power, kind: 'ring', drag: 0 });
    const k = this.scale;
    const n = Math.round(34 * power * Math.min(1, k * k));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = ((40 + Math.random() * 110) * power * k) / this.zoom;
      const life = 0.7 + Math.random() * 0.9;
      this.push({ sector, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life, max: life, color: Math.random() < 0.3 ? '#ffffff' : color, size: 1 + Math.random() * 1.6, kind: 'spark', drag: 2.2 });
    }
  }

  /** Sprungblitz an einem Tor: heller Lichtpunkt, der schnell verglüht, mit kleinem Ring */
  flash(sector: string, x: number, z: number, color: string): void {
    this.push({ sector, x, z, vx: 0, vz: 0, life: 0.55, max: 0.55, color, size: 16, kind: 'flash', drag: 0 });
    this.push({ sector, x, z, vx: 0, vz: 0, life: 0.5, max: 0.5, color, size: 4, kind: 'ring', drag: 0 });
  }

  /** Einzelne Schweißfunken an einer Baustelle */
  weld(sector: string, x: number, z: number, spread: number): void {
    const a = Math.random() * Math.PI * 2;
    const sp = ((20 + Math.random() * 45) * this.scale) / this.zoom;
    const life = 0.25 + Math.random() * 0.35;
    this.push({ sector, x: x + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life, max: life, color: Math.random() < 0.5 ? '#fff4c2' : '#ffb547', size: 1 + Math.random(), kind: 'spark', drag: 3 });
  }

  /** Gesteinssplitter am Abbaupunkt */
  debris(sector: string, x: number, z: number, color: string): void {
    const a = Math.random() * Math.PI * 2;
    const sp = ((8 + Math.random() * 22) * this.scale) / this.zoom;
    const life = 0.5 + Math.random() * 0.6;
    this.push({ sector, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life, max: life, color, size: 1 + Math.random() * 1.2, kind: 'dot', drag: 1.5 });
  }

  /** Gasteilchen, die zum Sammler gesogen werden */
  suck(sector: string, fromX: number, fromZ: number, toX: number, toZ: number, color: string): void {
    const life = 0.8 + Math.random() * 0.5;
    this.push({ sector, x: fromX, z: fromZ, vx: 0, vz: 0, life, max: life, color, size: 1.2 + Math.random() * 1.4, kind: 'dot', drag: 0, tx: toX, tz: toZ });
  }

  update(dt: number): void {
    for (const p of this.ps) {
      p.life -= dt;
      if (p.tx !== undefined && p.tz !== undefined) {
        // Gas-Sog: beschleunigt auf das Ziel zu
        const k = 1 - p.life / p.max;
        p.x += (p.tx - p.x) * Math.min(1, dt * (1.5 + k * 6));
        p.z += (p.tz - p.z) * Math.min(1, dt * (1.5 + k * 6));
      } else {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vz *= d;
      }
    }
    if (this.ps.length && this.ps[0].life <= 0) this.ps = this.ps.filter((p) => p.life > 0);
    else if (this.ps.some((p) => p.life <= 0)) this.ps = this.ps.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, sector: string, scale: number): void {
    this.zoom = cam.zoom;
    this.scale = scale;
    if (!this.ps.length) return;
    // Herausgezoomt dezent: kleiner und blasser
    const dim = Math.max(0.45, Math.min(1, scale));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      if (p.sector !== sector || p.life <= 0) continue;
      const [sx, sy] = cam.toScreen(p.x, p.z);
      if (sx < -40 || sy < -40 || sx > cam.w + 40 || sy > cam.h + 40) continue;
      const t = p.life / p.max;
      if (p.kind === 'flash') {
        const r = p.size * (0.5 + 0.5 * t) * Math.max(0.6, scale);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, rgba('#ffffff', t * 0.95 * dim));
        g.addColorStop(0.3, rgba(p.color, t * 0.6 * dim));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        const r = (p.size + (1 - t) * p.size * 5) * scale;
        ctx.strokeStyle = rgba(p.color, t * 0.8 * dim);
        ctx.lineWidth = (0.6 + t * 2) * Math.min(1, scale);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        // Schweif entgegen der Flugrichtung
        const tail = 0.06;
        const [ex, ey] = cam.toScreen(p.x - p.vx * tail, p.z - p.vz * tail);
        ctx.strokeStyle = rgba(p.color, Math.min(1, t * 1.4) * dim);
        ctx.lineWidth = Math.max(0.6, p.size * scale);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(p.color, Math.min(1, t * 1.6) * 0.85 * dim);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, p.size * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
