// Prozedurale Grafiken: Asteroidenfelder, Gasnebel, Hintergrund
import { WARES } from '../data/wares';

export function rng(seed: number): () => number {
  let t = seed >>> 0 || 1;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

const GAS = new Set(['hydrogen', 'helium', 'methane']);
const cache = new Map<string, HTMLCanvasElement>();

/** Sprite eines Rohstofffelds, Größe 512 px entspricht dem Felddurchmesser × 1,3 */
export function fieldSprite(id: string, ware: string, seed: number): HTMLCanvasElement {
  const key = id;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 512;
  const [c, ctx] = canvas(size);
  const color = WARES[ware]?.color ?? '#999999';
  const r = rng(seed);
  const cx = size / 2, R = size / 2 / 1.3;
  if (GAS.has(ware)) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7) * R * 0.95;
      const x = cx + Math.cos(a) * d, y = cx + Math.sin(a) * d;
      const rad = R * (0.18 + r() * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const tone = r() < 0.3 ? shade(color, 0.45) : color;
      g.addColorStop(0, rgbaFrom(tone, 0.13 + r() * 0.08));
      g.addColorStop(1, rgbaFrom(tone, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`;
      ctx.fillRect(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1.4, 1.4);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // Staubschleier
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, R);
    g.addColorStop(0, rgba(color, 0.2));
    g.addColorStop(0.7, rgba(color, 0.06));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const rocks: { x: number; y: number; s: number }[] = [];
    const n = ware === 'nividium' ? 30 : 46;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.65) * R * 0.92;
      const big = r() < 0.12;
      rocks.push({ x: cx + Math.cos(a) * d, y: cx + Math.sin(a) * d, s: big ? 20 + r() * 22 : 5 + r() * 12 });
    }
    rocks.sort((a, b) => a.y - b.y);
    for (const k of rocks) {
      if (ware === 'ice') drawCrystal(ctx, k.x, k.y, k.s * 1.1, color, r);
      else drawRock(ctx, k.x, k.y, k.s, ware === 'silicon' ? '#8f99a8' : ware === 'nividium' ? '#6b5a3a' : shade(color, -0.35), color, r, ware === 'nividium');
    }
  }
  cache.set(key, c);
  return c;
}

function rgbaFrom(css: string, a: number): string {
  if (css.startsWith('#')) return rgba(css, a);
  return css.replace('rgb(', 'rgba(').replace(')', `,${a})`);
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, base: string, accent: string, r: () => number, veins: boolean): void {
  const pts: [number, number][] = [];
  const k = 8 + Math.floor(r() * 5);
  const rot = r() * Math.PI;
  for (let i = 0; i < k; i++) {
    const a = rot + (i / k) * Math.PI * 2;
    const rr = s * (0.7 + r() * 0.35);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * (0.75 + r() * 0.2)]);
  }
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
  g.addColorStop(0, shade(base, 0.45));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.7));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Krater und Glanzpunkte
  for (let i = 0; i < Math.floor(s / 6); i++) {
    const cx = x + (r() - 0.5) * s, cy = y + (r() - 0.5) * s * 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1 + r() * s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(accent, veins ? 0.9 : 0.35);
  for (let i = 0; i < (veins ? 5 : 2); i++) {
    const cx = x + (r() - 0.6) * s * 0.8, cy = y + (r() - 0.6) * s * 0.6;
    ctx.fillRect(cx, cy, veins ? 2.4 : 1.6, veins ? 2.4 : 1.6);
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, r: () => number): void {
  const shards = 2 + Math.floor(r() * 3);
  for (let i = 0; i < shards; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const len = s * (0.8 + r() * 0.9), wid = s * (0.25 + r() * 0.2);
    const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len;
    const nx = Math.cos(a + Math.PI / 2) * wid, ny = Math.sin(a + Math.PI / 2) * wid;
    ctx.beginPath();
    ctx.moveTo(x + nx, y + ny);
    ctx.lineTo(tx, ty);
    ctx.lineTo(x - nx, y - ny);
    ctx.closePath();
    const g = ctx.createLinearGradient(x + nx, y + ny, x - nx, y - ny);
    g.addColorStop(0, shade(color, 0.6));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.5));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

/** Hintergrund mit Nebel und Sternen, eingefärbt je Sektor */
export function backgroundSprite(w: number, h: number, seed: number, tint: [string, string]): HTMLCanvasElement {
  const [c, ctx] = canvas(1);
  c.width = w;
  c.height = h;
  const r = rng(seed);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#040a14');
  g.addColorStop(0.5, '#061220');
  g.addColorStop(1, '#030810');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = r() * h, rad = Math.max(w, h) * (0.12 + r() * 0.3);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() < 0.5 ? tint[0] : tint[1];
    gg.addColorStop(0, rgba(col, 0.05 + r() * 0.05));
    gg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, w, h);
  }
  const count = Math.round((w * h) / 1400);
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h;
    const b = r();
    const s = b > 0.985 ? 1.8 : b > 0.9 ? 1.2 : 0.7;
    ctx.fillStyle = `rgba(${200 + r() * 55},${220 + r() * 35},255,${0.25 + r() * 0.6})`;
    ctx.fillRect(x, y, s, s);
    if (b > 0.993) {
      const gg = ctx.createRadialGradient(x, y, 0, x, y, 6);
      gg.addColorStop(0, 'rgba(200,235,255,0.35)');
      gg.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x - 6, y - 6, 12, 12);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

export function clearSpriteCache(): void {
  cache.clear();
}
