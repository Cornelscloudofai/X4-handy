// Triebwerke im Kampf: Strahl in mehreren Schichten (weicher Schein, farbige Fahne, heißer Kern, Schockringe bei
// vollem Schub, gleißende Düsenmündung) und ein dezenter, dunkler Rauch, der hinter den Düsen zurückbleibt, sich
// ausbreitet und verweht. Gezeichnet wird im Schiffsraum: Düse bei (ex, ey), der Strahl zeigt nach +y.

const hex = (c: string): [number, number, number] => {
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((q) => q + q).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Farbe zu Weiß hin aufhellen (k = 0 … 1) */
const lift = (c: string, k: number): [number, number, number] => hex(c).map((v) => Math.round(v + (255 - v) * k)) as [number, number, number];
const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;

/** weicher Schein je Farbe, einmal erzeugt */
const GLOW = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let c = GLOW.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64), col = hex(color);
  gr.addColorStop(0, rgba(col, 0.8));
  gr.addColorStop(0.3, rgba(col, 0.32));
  gr.addColorStop(0.65, rgba(col, 0.08));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  GLOW.set(color, c);
  return c;
}

/** Rauschen aus überlagerten Schwingungen: ruhiges Flackern statt Zufallszittern */
const flick = (t: number, s: number) => 0.5 + 0.22 * Math.sin(t * 31 + s * 7.1) + 0.16 * Math.sin(t * 53 + s * 3.3) + 0.12 * Math.sin(t * 89 + s * 1.7);

/**
 * Ein Triebwerksstrahl. w: halbe Düsenbreite, len: volle Länge bei Schub 1, power: Schub (0 = Glimmen, über 1 =
 * Reiseantrieb), seed: unterscheidet die Düsen
 */
export function drawJet(ctx: CanvasRenderingContext2D, ex: number, ey: number, w: number, len: number, color: string, power: number, t: number, seed = 0): void {
  const p = Math.max(0, power), f = flick(t, seed);
  const L = len * (0.18 + 0.82 * Math.min(1.5, p)) * (0.9 + 0.2 * f);
  if (L < 0.5) return;
  const mid = lift(color, 0.25), hot = lift(color, 0.75), white: [number, number, number] = [255, 255, 255];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // weicher Schein um Düse und Fahne
  const halo = glow(color);
  if (halo) {
    ctx.globalAlpha = Math.min(1, 0.25 + 0.4 * Math.min(1, p)) * (0.85 + 0.15 * f);
    const gw = w * 7, gh = L * 1.25 + w * 4;
    ctx.drawImage(halo, ex - gw / 2, ey - w * 2.5, gw, gh);
    ctx.globalAlpha = 1;
  }
  // Fahne: an der Düse so breit wie sie, weitet sich kurz, läuft spitz aus; leicht gewellt
  const sway = Math.sin(t * 17 + seed * 2.3) * w * 0.25;
  const plume = (wk: number, lk: number, col: [number, number, number], a0: number, a1: number) => {
    const ww = w * wk, ll = L * lk;
    const gr = ctx.createLinearGradient(ex, ey, ex, ey + ll);
    gr.addColorStop(0, rgba(col, a0));
    gr.addColorStop(0.35, rgba(col, a0 * 0.75));
    gr.addColorStop(1, rgba(col, a1));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(ex - ww, ey);
    ctx.bezierCurveTo(ex - ww * 1.25, ey + ll * 0.25, ex - ww * 0.55 + sway * 0.5, ey + ll * 0.7, ex + sway, ey + ll);
    ctx.bezierCurveTo(ex + ww * 0.55 + sway * 0.5, ey + ll * 0.7, ex + ww * 1.25, ey + ll * 0.25, ex + ww, ey);
    ctx.closePath();
    ctx.fill();
  };
  plume(1.35, 1, hex(color), 0.5 + 0.25 * Math.min(1, p), 0);
  plume(0.85, 0.72, mid, 0.55 + 0.3 * Math.min(1, p), 0);
  plume(0.42, 0.42, hot, 0.85, 0);
  // Schockringe (Machscheiben): bei kräftigem Schub helle Knoten entlang der Achse, sie pulsieren
  if (p > 0.45) {
    const k = Math.min(1, (p - 0.45) / 0.55);
    for (let i = 1; i <= 3; i++) {
      const y = ey + L * (0.13 + i * 0.14), a = k * (0.55 - i * 0.12) * (0.75 + 0.25 * Math.sin(t * 40 + i * 1.9 + seed));
      if (a <= 0) continue;
      ctx.fillStyle = rgba(i === 1 ? white : hot, a);
      ctx.beginPath();
      ctx.ellipse(ex + sway * (i / 4), y, w * (0.55 - i * 0.09), w * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // gleißende Düsenmündung
  ctx.fillStyle = rgba(white, 0.55 + 0.35 * Math.min(1, p) * f);
  ctx.beginPath();
  ctx.ellipse(ex, ey + w * 0.15, w * 0.8, w * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Rauch ----------

interface Puff { x: number; y: number; vx: number; vy: number; r: number; t: number; max: number; spin: number; warm: [number, number, number] }

/** dunkle, weiche Rauchflocke (einmal erzeugt): Kern dicht, Rand ausgefranst */
let PUFF: HTMLCanvasElement | null = null;
function puffSprite(): HTMLCanvasElement | null {
  if (PUFF || typeof document === 'undefined') return PUFF;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // mehrere versetzte Wolken (dunkelgrau: auf dem schwarzen Raum gerade noch als Schleier sichtbar) ergeben eine unregelmäßige Flocke
  for (const [x, y, r, a] of [[64, 64, 52, 0.55], [50, 58, 34, 0.35], [80, 70, 30, 0.3], [62, 80, 28, 0.25], [72, 48, 26, 0.25]] as const) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(66,62,70,${a})`);
    gr.addColorStop(0.6, `rgba(52,49,56,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(40,37,44,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  PUFF = c;
  return c;
}

/** Rauch hinter den Triebwerken: wenige, große, sehr durchsichtige Flocken, die sich ausbreiten und verwehen */
export class Smoke {
  private puffs: Puff[] = [];
  /** Flocke ausstoßen: Ort, Geschwindigkeit (Welt), Anfangsgröße, Farbe des Triebwerks (für den warmen Ansatz) */
  emit(x: number, y: number, vx: number, vy: number, r: number, color: string): void {
    this.puffs.push({ x, y, vx, vy, r, t: 0, max: 1.4 + Math.random() * 0.9, spin: (Math.random() - 0.5) * 1.2, warm: hex(color) });
  }
  update(dt: number): void {
    const drag = Math.exp(-dt * 1.6);
    for (const q of this.puffs) {
      q.t += dt;
      q.vx *= drag;
      q.vy *= drag;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.puffs = this.puffs.filter((q) => q.t < q.max);
  }
  get count(): number { return this.puffs.length; }
  draw(ctx: CanvasRenderingContext2D, k = 1): void {
    const sp = puffSprite();
    if (!sp || !this.puffs.length) return;
    ctx.save();
    for (const q of this.puffs) {
      const u = q.t / q.max;
      // blendet weich ein, breitet sich aus, verblasst
      const a = Math.min(1, u * 5) * (1 - u) ** 1.4 * 0.75 * k;
      const r = q.r * (1 + u * 3.2);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.spin * q.t + q.r);
      ctx.drawImage(sp, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.restore();
  }
}
