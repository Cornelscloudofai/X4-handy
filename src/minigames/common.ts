// Gemeinsame Bausteine der Minispiele: Zufall mit Startwert, Partikel, Sternenhimmel, Neon-Striche.
// Ohne DOM-Zugriff beim Laden, damit die Spiellogik in Tests (Node) läuft.

export type Level = 1 | 2 | 3;

export interface GameResult {
  /** Erfolgreich abgeschlossen (sonst gescheitert oder Zeit abgelaufen) */
  success: boolean;
  /** 0–3 Sterne */
  stars: 0 | 1 | 2 | 3;
  /** Kennzahl des Spiels (z. B. Ausbeute in Prozent) */
  score: number;
  /** Überschrift der Auswertung */
  headline: string;
  /** Zeilen der Auswertung: Bezeichnung und Wert */
  lines: [string, string][];
}

export interface HudItem { label: string; value: string; warn?: boolean }

/** Schnittstelle eines Minispiels; der Rahmen (host.ts) kümmert sich um Leinwand, Schleife, Pause und Auswertung */
export interface MiniGame {
  readonly eyebrow: string;
  readonly title: string;
  /** Kurze Erklärung vor dem Start */
  readonly intro: string;
  /** Steuerung in Stichworten */
  readonly controls: string[];
  hud(): HudItem[];
  resize(w: number, h: number): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, now: number): void;
  pointerDown(id: number, x: number, y: number): void;
  pointerMove(id: number, x: number, y: number): void;
  pointerUp(id: number, x: number, y: number): void;
  /** Ergebnis, sobald das Spiel vorbei ist */
  result(): GameResult | null;
  /** Ergebnis bei vorzeitigem Abbruch */
  abort(): GameResult;
}

/** Zufallszahlen mit Startwert (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function starsFor(v: number, t1: number, t2: number, t3: number): 0 | 1 | 2 | 3 {
  return v >= t3 ? 3 : v >= t2 ? 2 : v >= t1 ? 1 : 0;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Neon-Strich ohne Weichzeichner: breiter, blasser Strich unter einem schmalen, hellen */
export function neonStroke(ctx: CanvasRenderingContext2D, color: string, lw: number, glow = 0.18): void {
  ctx.strokeStyle = rgba(color, glow);
  ctx.lineWidth = lw * 3.2;
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.95);
  ctx.lineWidth = lw;
  ctx.stroke();
}

// ---------- Partikel ----------

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  kind: 'dot' | 'chunk' | 'spark' | 'ring';
  rot: number; vr: number;
  /** Ziel, zu dem der Partikel gezogen wird (z. B. Sammler) */
  tx?: number; ty?: number;
  /** Wird beim Erreichen des Ziels aufgerufen */
  onArrive?: () => void;
  drag: number;
}

export class Particles {
  list: Particle[] = [];
  max = 500;

  add(p: Partial<Particle> & { x: number; y: number }): Particle {
    const q: Particle = { vx: 0, vy: 0, life: 0, max: 0.6, size: 2, color: '#ffffff', kind: 'dot', rot: 0, vr: 0, drag: 1.5, ...p };
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(q);
    return q;
  }

  burst(x: number, y: number, color: string, n: number, speed: number, size = 2, kind: Particle['kind'] = 'dot', life = 0.6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, size: size * (0.5 + Math.random() * 0.8), kind, max: life * (0.6 + Math.random() * 0.6), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    }
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.tx != null && p.ty != null) {
        // zum Ziel ziehen, immer stärker
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < 10 || p.life > p.max) { p.onArrive?.(); continue; }
        const pull = 900 * Math.min(1, p.life * 1.6);
        p.vx += (dx / d) * pull * dt;
        p.vy += (dy / d) * pull * dt;
        p.vx *= 1 - Math.min(1, 2.5 * dt);
        p.vy *= 1 - Math.min(1, 2.5 * dt);
      } else {
        if (p.life >= p.max) continue;
        p.vx *= 1 - Math.min(1, p.drag * dt);
        p.vy *= 1 - Math.min(1, p.drag * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      out.push(p);
    }
    this.list = out;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const f = p.tx != null ? 1 : 1 - p.life / p.max;
      if (p.kind === 'ring') {
        ctx.strokeStyle = rgba(p.color, 0.6 * f);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (p.life / p.max) * 3), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'spark') {
        ctx.strokeStyle = rgba(p.color, 0.9 * f);
        ctx.lineWidth = Math.max(0.8, p.size * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'chunk') {
        // unförmiges Bröckchen
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.color, 0.85 * f);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(s, 0); ctx.lineTo(s * 0.2, s * 0.8); ctx.lineTo(-s * 0.9, s * 0.3); ctx.lineTo(-s * 0.5, -s * 0.7); ctx.lineTo(s * 0.4, -s * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = rgba(p.color, 0.9 * f);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * f), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- Sternenhimmel ----------

export class Starfield {
  private stars: { x: number; y: number; z: number; b: number }[] = [];
  private w = 1;
  private h = 1;

  constructor(count = 140, seed = 7) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) this.stars.push({ x: r(), y: r(), z: 0.2 + r() * 0.8, b: 0.3 + r() * 0.7 });
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  /** scroll: zurückgelegte Strecke in Pixeln (für Flug nach oben) */
  draw(ctx: CanvasRenderingContext2D, scroll = 0, tint = '#9fd8ff'): void {
    const g = ctx.createRadialGradient(this.w / 2, this.h * 0.4, 0, this.w / 2, this.h * 0.4, Math.max(this.w, this.h) * 0.8);
    g.addColorStop(0, '#0a1a2a');
    g.addColorStop(1, '#03070d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    for (const s of this.stars) {
      const y = (((s.y * this.h + scroll * s.z) % this.h) + this.h) % this.h;
      ctx.fillStyle = rgba(tint, s.b * (0.35 + s.z * 0.5));
      const r = 0.5 + s.z * 0.9;
      ctx.fillRect(s.x * this.w - r / 2, y - r / 2, r, r);
    }
  }
}

/** Abstand eines Punkts zu einer Strecke */
export function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Kurzes Vibrieren, wo verfügbar */
export function buzz(ms: number): void {
  globalThis.navigator?.vibrate?.(ms);
}
