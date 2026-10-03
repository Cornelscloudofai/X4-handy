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

/**
 * Sprite eines Rohstofffelds (512 px ≙ Felddurchmesser × 1,3). Die Form ist unregelmäßig (mehrere Ballungen)
 * und läuft zum Rand weich aus. Gasfelder haben zwei Schleier-Schichten (layer 0/1), die gegeneinander driften.
 */
export function fieldSprite(id: string, ware: string, seed: number, layer = 0): HTMLCanvasElement {
  const key = `${id}:${layer}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = GAS.has(ware) ? gasSprite(ware, seed + layer * 7919, layer) : rockSprite(ware, seed);
  cache.set(key, c);
  return c;
}

export function isGas(ware: string): boolean {
  return GAS.has(ware);
}

function clustersOf(r: () => number, cx: number, R: number) {
  const clusters = Array.from({ length: 3 + Math.floor(r() * 3) }, () => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.6;
    return { x: cx + Math.cos(a) * d, y: cx + Math.sin(a) * d, s: R * (0.45 + r() * 0.35) };
  });
  const around = (spread = 1) => {
    const k = clusters[Math.floor(r() * clusters.length)];
    const a = r() * Math.PI * 2, d = Math.abs(gauss(r)) * k.s * spread;
    return { x: k.x + Math.cos(a) * d, y: k.y + Math.sin(a) * d };
  };
  return { clusters, around };
}

/** Weicher Rand: nach außen ausblenden */
function softEdge(ctx: CanvasRenderingContext2D, size: number, inner: number): void {
  const cx = size / 2;
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(cx, cx, inner, cx, cx, size / 2);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Gasnebel: viele große, sehr blasse Wolken und lang gezogene Schlieren, klein gezeichnet und weich hochskaliert –
 * so entsteht ein Schleier ohne harte Kanten.
 */
function gasSprite(ware: string, seed: number, layer: number): HTMLCanvasElement {
  const small = 128;
  const [c0, g0] = canvas(small);
  const color = WARES[ware]?.color ?? '#999999';
  const r = rng(seed);
  const cx = small / 2, R = small / 2 / 1.3;
  const { around } = clustersOf(r, cx, R);
  // Viele große, sehr blasse Wolken und Schlieren, weit gestreut
  const n = layer ? 90 : 120;
  for (let i = 0; i < n; i++) {
    const p = around(1.5);
    const rad = R * (0.3 + r() * 0.65);
    const tone = r() < 0.3 ? shade(color, 0.3) : r() < 0.45 ? shade(color, -0.3) : color;
    g0.save();
    g0.translate(p.x, p.y);
    g0.rotate(r() * Math.PI);
    g0.scale(1, 0.25 + r() * 0.6);
    const g = g0.createRadialGradient(0, 0, 0, 0, 0, rad);
    const a = (layer ? 0.012 : 0.018) + r() * 0.02;
    g.addColorStop(0, rgbaFrom(tone, a));
    g.addColorStop(0.5, rgbaFrom(tone, a * 0.5));
    g.addColorStop(1, rgbaFrom(tone, 0));
    g0.fillStyle = g;
    g0.beginPath();
    g0.arc(0, 0, rad, 0, Math.PI * 2);
    g0.fill();
    g0.restore();
  }
  // Lücken ausstanzen: der Schleier bekommt Struktur statt eines hellen Kerns
  g0.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const p = around(1.2);
    const rad = R * (0.12 + r() * 0.3);
    g0.save();
    g0.translate(p.x, p.y);
    g0.rotate(r() * Math.PI);
    g0.scale(1, 0.3 + r() * 0.5);
    const g = g0.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    g0.fillStyle = g;
    g0.beginPath();
    g0.arc(0, 0, rad, 0, Math.PI * 2);
    g0.fill();
    g0.restore();
  }
  g0.globalCompositeOperation = 'source-over';
  softEdge(g0, small, R * 0.25);
  // Weich hochskalieren (wirkt wie Weichzeichner) und wenige feine Glitzerpunkte
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c0, 0, 0, size, size);
  if (!layer) {
    const big = size / small;
    for (let i = 0; i < 30; i++) {
      const p = around(1);
      ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.12})`;
      ctx.fillRect(p.x * big, p.y * big, 1.3, 1.3);
    }
  }
  return c;
}

/** Gesteinsfeld: viele kleine Brocken in Ballungen über einem feinen Staubschleier */
function rockSprite(ware: string, seed: number): HTMLCanvasElement {
  const size = 512;
  const [c, ctx] = canvas(size);
  const color = WARES[ware]?.color ?? '#999999';
  const r = rng(seed);
  const cx = size / 2, R = size / 2 / 1.3;
  const { clusters, around } = clustersOf(r, cx, R);
  // Feiner Staubschleier je Ballung
  for (const k of clusters) {
    const g = ctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, k.s * 1.5);
    g.addColorStop(0, rgba(color, 0.11));
    g.addColorStop(0.5, rgba(color, 0.04));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Feinster Schutt
  for (let i = 0; i < 520; i++) {
    const p = around(1.1);
    ctx.fillStyle = rgba(color, 0.18 + r() * 0.35);
    const d = 1 + r() * 1.2;
    ctx.fillRect(p.x, p.y, d, d);
  }
  // Viele kleine Brocken, nur wenige mittlere – keine großen
  const rocks: { x: number; y: number; s: number }[] = [];
  const n = ware === 'nividium' ? 160 : 330;
  for (let i = 0; i < n; i++) {
    const p = around();
    const mid = r() < 0.06;
    rocks.push({ x: p.x, y: p.y, s: mid ? 7 + r() * 5 : 2.2 + r() * 4.2 });
  }
  rocks.sort((a, b) => a.y - b.y);
  for (const k of rocks) {
    if (ware === 'ice') drawCrystal(ctx, k.x, k.y, k.s * 1.1, color, r);
    else drawRock(ctx, k.x, k.y, k.s, ware === 'silicon' ? '#8f99a8' : ware === 'nividium' ? '#6b5a3a' : shade(color, -0.35), color, r, ware === 'nividium');
  }
  softEdge(ctx, size, R * 0.55);
  return c;
}

function gauss(r: () => number): number {
  return (r() + r() + r() - 1.5) / 1.5;
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
