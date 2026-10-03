// Rauschen für Nebel und Gaswolken: Perlin-Gradientenrauschen und fraktale Summe (ohne Vorzugsachsen).
import { rng } from './sprites';

export interface Noise { (x: number, y: number): number }

/** 2D-Gradientenrauschen (Perlin), Werte etwa −0,7 … 0,7 */
export function perlin(seed: number): Noise {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  // 16 gleichmäßig verteilte Richtungen – keine Vorzugsachsen
  const gx = new Float32Array(16), gy = new Float32Array(16);
  for (let i = 0; i < 16; i++) { gx[i] = Math.cos((i / 16) * Math.PI * 2 + 0.2); gy[i] = Math.sin((i / 16) * Math.PI * 2 + 0.2); }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const aa = perm[perm[X] + Y] & 15, ab = perm[perm[X] + Y + 1] & 15, ba = perm[perm[X + 1] + Y] & 15, bb = perm[perm[X + 1] + Y + 1] & 15;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const n00 = gx[aa] * xf + gy[aa] * yf, n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
    const n01 = gx[ab] * xf + gy[ab] * (yf - 1), n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
    const x1 = n00 + u * (n10 - n00), x2 = n01 + u * (n11 - n01);
    return x1 + v * (x2 - x1);
  };
}

/** Fraktales Rauschen 0 … 1; jede Oktave gedreht, damit kein Raster sichtbar wird */
export function fbm(n: Noise, x: number, y: number, oct: number): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    const c = ROT_C[i], s = ROT_S[i];
    sum += amp * n((x * c - y * s) * f + i * 17.3, (x * s + y * c) * f - i * 9.1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return 0.5 + (sum / norm) * 0.85;
}
const ROT_C = Array.from({ length: 8 }, (_, i) => Math.cos(i * 0.73));
const ROT_S = Array.from({ length: 8 }, (_, i) => Math.sin(i * 0.73));

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
