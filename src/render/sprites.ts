// Prozedurale Grafiken: Asteroidenfelder, Gasnebel, Hintergrund
import { WARES } from '../data/wares';
import { fbm, perlin, smooth } from './noise';

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

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

const GAS = new Set(['hydrogen', 'helium', 'methane']);
const cache = new Map<string, HTMLCanvasElement>();

/**
 * Sprite eines Gasfelds (512 px ≙ Felddurchmesser × 1,3) mit zwei Schleier-Schichten (layer 0/1), die gegeneinander
 * driften. Die Form ist unregelmäßig (mehrere Ballungen) und läuft zum Rand weich aus. Gesteinsfelder: siehe fields.ts.
 */
export function fieldSprite(id: string, ware: string, seed: number, layer = 0): HTMLCanvasElement {
  const key = `${id}:${layer}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = gasSprite(ware, seed + layer * 7919, layer);
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

/**
 * Gasnebel aus verwirbeltem Rauschen: weiche Ballungen mit feinen Filamenten und Lücken, in Tönen der Gasfarbe.
 * Gerechnet in Gleitkomma (keine Farbstufen), 176 px, sanft auf 512 px vergrößert und fein gekörnt.
 */
function gasSprite(ware: string, seed: number, layer: number): HTMLCanvasElement {
  const S = 176;
  const color = WARES[ware]?.color ?? '#999999';
  const r = rng(seed);
  const cx = S / 2, R = S / 2 / 1.3;
  const { clusters, around } = clustersOf(r, cx, R);
  const n1 = perlin(seed + 11), n2 = perlin(seed + 23), n3 = perlin(seed + 37);
  const [br, bg, bb] = hexToRgb(color);
  const dark = [br * 0.55, bg * 0.55, bb * 0.6], light = [br + (255 - br) * 0.35, bg + (255 - bg) * 0.35, bb + (255 - bb) * 0.35];
  const [c0, g0] = canvas(S);
  const img = g0.createImageData(S, S);
  const px = img.data;
  const strength = layer ? 0.32 : 0.42;
  const off = layer * 3.7;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Hülle: weiche Ballungen, zum Rand hin auslaufend
      let m = 0;
      for (const k of clusters) {
        const d = Math.hypot(x - k.x, y - k.y) / (k.s * 1.25);
        m = Math.max(m, Math.exp(-d * d * 1.6));
      }
      m *= 1 - smooth(R * 0.95, S / 2, Math.hypot(x - cx, y - cx));
      if (m < 0.01) continue;
      const u = (x / S) * 3.2 + off, v = (y / S) * 3.2 - off;
      const q1 = fbm(n1, u, v, 3), q2 = fbm(n2, u + 4.1, v + 2.7, 3);
      const rr = fbm(n3, u + 2.2 * q1, v + 2.2 * q2, 5);
      const dens = m * smooth(0.32, 0.78, rr * 0.75 + m * 0.35);
      const fr = fbm(n2, u * 2.4 + q1, v * 2.4 + q2, 3);
      const fil = Math.pow(1 - Math.abs(fr * 2 - 1), 7) * m;
      const t = smooth(0.3, 0.75, q2);
      const hi = Math.min(1, fil * 1.2 + dens * dens * 0.6);
      const a = Math.min(1, (dens * 0.8 + fil * 0.35) * strength);
      const i = (y * S + x) * 4;
      px[i] = dark[0] + (br - dark[0]) * t + (light[0] - br) * hi;
      px[i + 1] = dark[1] + (bg - dark[1]) * t + (light[1] - bg) * hi;
      px[i + 2] = dark[2] + (bb - dark[2]) * t + (light[2] - bb) * hi;
      px[i + 3] = a * 255 + (r() - 0.5) * 1.5;
    }
  }
  g0.putImageData(img, 0, 0);
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'blur(1.6px)';
  ctx.drawImage(c0, 0, 0, size, size);
  ctx.filter = 'none';
  if (!layer) {
    const big = size / S;
    for (let i = 0; i < 30; i++) {
      const p = around(1);
      ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.12})`;
      ctx.fillRect(p.x * big, p.y * big, 1.3, 1.3);
    }
  }
  return c;
}

function gauss(r: () => number): number {
  return (r() + r() + r() - 1.5) / 1.5;
}

/** Hintergrund mit Nebel und Sternen, eingefärbt je Sektor */
/** res: Pixel je Bildschirmpunkt; glow: Stärke der eingefärbten Nebelflecken, stars: Sterndichte, warm: Anteil oranger Sterne */
export function backgroundSprite(w: number, h: number, seed: number, tint: [string, string], glow = 1, stars = 1, res = 1, warm = 0.2): HTMLCanvasElement {
  const [c, ctx] = canvas(1);
  // res: Pixel je Bildschirmpunkt – in Geräteauflösung gerechnet, damit beim Anzeigen nichts vergrößert wird
  c.width = Math.round(w * res);
  c.height = Math.round(h * res);
  ctx.scale(res, res);
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
    gg.addColorStop(0, rgba(col, (0.05 + r() * 0.05) * glow));
    gg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, w, h);
  }
  // Sterne mit Farbtemperatur (blauweiß bis orange); helle mit weichem Hof, ohne Strahlen
  const count = Math.round(((w * h) / 1100) * stars);
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h;
    const b = r();
    const size = b > 0.997 ? 2.1 : b > 0.985 ? 1.5 : b > 0.9 ? 1.05 : 0.65;
    const t = r();
    const [cr, cg, cb] = t < warm ? [255, 175 + r() * 50, 120 + r() * 50] : t < warm + 0.3 ? [245, 240, 232] : [190 + r() * 30, 212 + r() * 25, 255];
    const a = 0.3 + r() * 0.6;
    if (b > 0.985) {
      const halo = size * 4.5;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, halo);
      gg.addColorStop(0, `rgba(${cr},${cg},${cb},${0.45 * a})`);
      gg.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.1 * a})`);
      gg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = gg;
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
    }
    ctx.fillStyle = `rgba(${Math.min(255, cr + 30)},${Math.min(255, cg + 30)},${Math.min(255, cb + 30)},${a})`;
    if (size < 1) ctx.fillRect(x, y, size, size);
    else {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

export function clearSpriteCache(): void {
  cache.clear();
}
