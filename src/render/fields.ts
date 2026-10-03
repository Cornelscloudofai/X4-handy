// Gesteinsfelder (Erz, Silizium, Eis, Nividium) als einzelne Brocken in drei Tiefenebenen.
// Nah gezoomt wird jeder Brocken scharf als Vieleck gezeichnet, in der Gesamtansicht genügt je Ebene ein kleines Bild.
// Parallaxe: Ferne Brocken sind kleiner und dunkler und wandern beim Verschieben weniger als nahe.
import { WARES } from '../data/wares';
import type { Camera } from './camera';
import { rgba, rng } from './sprites';

interface Rock {
  /** Versatz zur Feldmitte in km */
  dx: number; dz: number;
  /** Größe in km */
  s: number;
  /** Form: Radien je Ecke (Faktor) */
  pts: number[];
  rot: number;
  /** 0 = fern, 1 = mitte, 2 = nah */
  layer: number;
  tone: number;
  dust: boolean;
}

interface FieldData {
  rocks: Rock[][]; // je Ebene, von fern nach nah
  clusters: { dx: number; dz: number; s: number }[];
  ext: number; // Ausdehnung in km (Radius des Sprites)
}

/** Tiefe je Ebene: Größen-/Abstandsfaktor und Stärke der Parallaxe */
export const DEPTH = [0.86, 1, 1.14];
const SHADE = [-0.3, -0.08, 0.08];

const dataCache = new Map<string, FieldData>();
const spriteCache = new Map<string, HTMLCanvasElement>();

function gauss(r: () => number): number {
  return (r() + r() + r() - 1.5) / 1.5;
}

export function rockField(id: string, ware: string, radius: number, seed: number): FieldData {
  const hit = dataCache.get(id);
  if (hit) return hit;
  const r = rng(seed);
  const R = radius;
  const clusters = Array.from({ length: 3 + Math.floor(r() * 3) }, () => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.6;
    return { dx: Math.cos(a) * d, dz: Math.sin(a) * d, s: R * (0.45 + r() * 0.35) };
  });
  const around = (spread = 1) => {
    const k = clusters[Math.floor(r() * clusters.length)];
    const a = r() * Math.PI * 2, d = Math.abs(gauss(r)) * k.s * spread;
    return { dx: k.dx + Math.cos(a) * d, dz: k.dz + Math.sin(a) * d };
  };
  const rocks: Rock[][] = [[], [], []];
  const kmPerPx = (R * 2.6) / 512; // gleiche Größen wie das frühere Feldbild
  const n = ware === 'nividium' ? 170 : 340;
  for (let i = 0; i < n; i++) {
    const p = around();
    const mid = r() < 0.06;
    const layer = r() < 0.35 ? 0 : r() < 0.6 ? 1 : 2;
    const k = 7 + Math.floor(r() * 4);
    rocks[layer].push({ ...p, s: (mid ? 7 + r() * 5 : 2.2 + r() * 4.2) * kmPerPx, pts: Array.from({ length: k }, () => 0.68 + r() * 0.38), rot: r() * Math.PI * 2, layer, tone: r(), dust: false });
  }
  // feiner Schutt, überwiegend in der fernen Ebene
  for (let i = 0; i < 260; i++) {
    const p = around(1.1);
    const layer = r() < 0.6 ? 0 : 1;
    rocks[layer].push({ ...p, s: (0.8 + r() * 0.9) * kmPerPx, pts: [], rot: 0, layer, tone: r(), dust: true });
  }
  for (const l of rocks) l.sort((a, b) => a.dz - b.dz);
  const data = { rocks, clusters, ext: R * 1.5 };
  dataCache.set(id, data);
  return data;
}

/** Farbe aufhellen (f > 0) oder abdunkeln (f < 0); Ein- und Ausgabe als #rrggbb, damit sich Aufrufe verketten lassen */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return '#' + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function baseColor(ware: string): string {
  return ware === 'silicon' ? '#9aa5b5' : ware === 'nividium' ? '#7a6744' : ware === 'ice' ? (WARES.ice?.color ?? '#bfe6ff') : shade(WARES[ware]?.color ?? '#999999', -0.12);
}

/** Einen Brocken zeichnen: Grundform, Lichtkante oben links, Schattenkante unten rechts */
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rock: Rock, base: string, accent: string, ware: string): void {
  if (rock.dust || size < 1.1) {
    ctx.fillStyle = rgba(accent, 0.25 + rock.tone * 0.35);
    const d = Math.max(0.6, size * 1.4);
    ctx.fillRect(x - d / 2, y - d / 2, d, d);
    return;
  }
  const k = rock.pts.length;
  const poly = (scale: number, ox: number, oy: number) => {
    ctx.beginPath();
    for (let i = 0; i < k; i++) {
      const a = rock.rot + (i / k) * Math.PI * 2;
      const rr = size * rock.pts[i] * scale;
      const px = x + ox + Math.cos(a) * rr, py = y + oy + Math.sin(a) * rr * 0.82;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  if (ware === 'ice') {
    // Kristall: spitze Splitter mit heller Kante
    ctx.fillStyle = shade(base, -0.25 + rock.tone * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.4);
    ctx.lineTo(x + size * 0.55, y + size * 0.5);
    ctx.lineTo(x - size * 0.5, y + size * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,250,255,0.75)';
    ctx.lineWidth = Math.max(0.6, size * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - size * 0.5, y + size * 0.45);
    ctx.lineTo(x, y - size * 1.4);
    ctx.stroke();
    return;
  }
  poly(1, 0, 0);
  ctx.fillStyle = shade(base, -0.28 + rock.tone * 0.14);
  ctx.fill();
  if (size >= 2.2) {
    poly(0.74, -size * 0.13, -size * 0.13);
    ctx.fillStyle = shade(base, 0.08 + rock.tone * 0.14);
    ctx.fill();
    if (size >= 3) {
      poly(0.4, -size * 0.3, -size * 0.3);
      ctx.fillStyle = shade(base, 0.38);
      ctx.fill();
    }
    if (size >= 4) {
      // Krater und Glanz
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(x + size * 0.18, y + size * 0.1, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x - size * 0.42, y - size * 0.4, Math.max(1, size * 0.14), Math.max(1, size * 0.1));
    }
  }
  if (ware === 'nividium' || (rock.tone > 0.8 && size >= 3)) {
    ctx.fillStyle = rgba(accent, ware === 'nividium' ? 0.95 : 0.6);
    const d = Math.max(1, size * 0.2);
    ctx.fillRect(x - size * 0.1, y + size * 0.05, d, d);
  }
}

/** Kleines Bild einer Ebene für die Gesamtansicht (Brocken werden verkleinert – bleibt scharf) */
function layerSprite(id: string, ware: string, data: FieldData, layer: number): HTMLCanvasElement {
  const key = `${id}:${layer}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const size = 320;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const px = size / (data.ext * 2);
  const base = shade(baseColor(ware), SHADE[layer]);
  const accent = WARES[ware]?.color ?? '#999999';
  for (const rock of data.rocks[layer]) {
    drawRock(ctx, size / 2 + rock.dx * px, size / 2 + rock.dz * px, rock.s * px * 1.2, rock, base, accent, ware);
  }
  spriteCache.set(key, c);
  return c;
}

/**
 * Gesteinsfeld zeichnen. Parallaxe: Jede Ebene wird um ihren Tiefenfaktor vom Bildschirmmittelpunkt weg (nah)
 * oder zu ihm hin (fern) verschoben – beim Verschieben der Karte gleiten die Ebenen gegeneinander.
 */
export function drawRockField(ctx: CanvasRenderingContext2D, cam: Camera, f: { id: string; ware: string; x: number; z: number; r: number }, seed: number, rotation: number, sel: boolean, parallax: number): void {
  const data = rockField(f.id, f.ware, f.r, seed);
  const [cx, cy] = cam.toScreen(f.x, f.z);
  const color = WARES[f.ware]?.color ?? '#999999';
  const radPx = f.r * cam.zoom;
  // Staubschleier je Ballung
  for (const k of data.clusters) {
    const x = cx + k.dx * cam.zoom, y = cy + k.dz * cam.zoom, rr = k.s * cam.zoom * 1.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rgba(color, sel ? 0.16 : 0.1));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  const vector = radPx > 70;
  const base0 = baseColor(f.ware);
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  for (let layer = 0; layer < 3; layer++) {
    const depth = DEPTH[layer];
    // Parallaxe: Ebene relativ zum Bildschirmmittelpunkt verschieben
    const ox = (cx - cam.w / 2) * (depth - 1) * parallax;
    const oy = (cy - cam.h / 2) * (depth - 1) * parallax;
    const lx = cx + ox, ly = cy + oy;
    ctx.globalAlpha = layer === 0 ? 0.75 : 1;
    if (!vector) {
      const spr = layerSprite(f.id, f.ware, data, layer);
      const size = data.ext * 2 * cam.zoom * depth;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rotation);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
      continue;
    }
    const base = shade(base0, SHADE[layer]);
    const z = cam.zoom * depth;
    // Scharfes Ebenenbild passend zur Zoomstufe (wird nur bei merklicher Zoomänderung neu gezeichnet)
    const zb = Math.pow(1.15, Math.round(Math.log(cam.zoom) / Math.log(1.15)));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.ceil(data.ext * 2 * zb * depth * dpr);
    if (px <= 2048) {
      const img = zoomSprite(f.id, f.ware, data, layer, zb, depth, dpr, base, color);
      const size = data.ext * 2 * z;
      ctx.drawImage(img, lx - size / 2, ly - size / 2, size, size);
    } else {
      // Ganz nah: nur die sichtbaren Brocken direkt zeichnen
      drawLayerBatched(ctx, cam, data.rocks[layer], lx, ly, z, cos, sin, base, color, f.ware);
    }
  }
  ctx.globalAlpha = 1;
}

const zoomCache = new Map<string, HTMLCanvasElement>();

/** Ebene als scharfes Bild in der Auflösung der aktuellen Zoomstufe (kleiner Zwischenspeicher, älteste fliegen raus) */
function zoomSprite(id: string, ware: string, data: FieldData, layer: number, zb: number, depth: number, dpr: number, base: string, accent: string): HTMLCanvasElement {
  const key = `${id}:${layer}:${zb.toFixed(4)}:${dpr}`;
  const hit = zoomCache.get(key);
  if (hit) {
    zoomCache.delete(key);
    zoomCache.set(key, hit);
    return hit;
  }
  const cssSize = data.ext * 2 * zb * depth;
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(2, Math.ceil(cssSize * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const fake = { w: cssSize, h: cssSize } as Camera;
  drawLayerBatched(ctx, fake, data.rocks[layer], cssSize / 2, cssSize / 2, zb * depth, 1, 0, base, accent, ware);
  zoomCache.set(key, c);
  // Speichergrenze fürs Handy: höchstens etwa 12 Megapixel an Ebenenbildern, älteste zuerst verwerfen
  let px = 0;
  for (const v of zoomCache.values()) px += v.width * v.height;
  for (const [k, v] of zoomCache) {
    if (px <= 12e6 || zoomCache.size <= 3) break;
    px -= v.width * v.height;
    zoomCache.delete(k);
  }
  return c;
}

/** Brockenform als Teilpfad anhängen */
function addPoly(path: Path2D, rock: Rock, x: number, y: number, size: number, scale: number, ox: number, oy: number): void {
  const k = rock.pts.length;
  for (let i = 0; i < k; i++) {
    const a = rock.rot + (i / k) * Math.PI * 2;
    const rr = size * rock.pts[i] * scale;
    const px = x + ox + Math.cos(a) * rr, py = y + oy + Math.sin(a) * rr * 0.82;
    i ? path.lineTo(px, py) : path.moveTo(px, py);
  }
  path.closePath();
}

/**
 * Eine Tiefenebene gebündelt zeichnen: Alle Brocken einer Helligkeitsstufe landen in einem Pfad und werden mit einem
 * einzigen Aufruf gefüllt – statt Hunderter Einzelfüllungen (wichtig für die Bildrate auf dem Handy).
 */
function drawLayerBatched(ctx: CanvasRenderingContext2D, cam: Camera, rocks: Rock[], lx: number, ly: number, z: number, cos: number, sin: number, base: string, accent: string, ware: string): void {
  const TONES = 3;
  const body = Array.from({ length: TONES }, () => new Path2D());
  const light = Array.from({ length: TONES }, () => new Path2D());
  const shine = new Path2D();
  const craters = new Path2D();
  const sparks = new Path2D();
  const iceEdge = new Path2D();
  const dust = [new Path2D(), new Path2D()];
  let iceEdgeW = 0.6;
  for (const rock of rocks) {
    const rx = rock.dx * cos - rock.dz * sin, rz = rock.dx * sin + rock.dz * cos;
    const x = lx + rx * z, y = ly + rz * z;
    const size = rock.s * z;
    if (x < -size - 4 || y < -size - 4 || x > cam.w + size + 4 || y > cam.h + size + 4) continue;
    const t = Math.min(TONES - 1, Math.floor(rock.tone * TONES));
    if (rock.dust || size < 1.1) {
      const d = Math.max(0.6, size * 1.4);
      dust[rock.tone > 0.5 ? 1 : 0].rect(x - d / 2, y - d / 2, d, d);
      continue;
    }
    if (ware === 'ice') {
      body[t].moveTo(x, y - size * 1.4);
      body[t].lineTo(x + size * 0.55, y + size * 0.5);
      body[t].lineTo(x - size * 0.5, y + size * 0.45);
      body[t].closePath();
      iceEdge.moveTo(x - size * 0.5, y + size * 0.45);
      iceEdge.lineTo(x, y - size * 1.4);
      iceEdgeW = Math.max(iceEdgeW, Math.min(2, size * 0.12));
      continue;
    }
    addPoly(body[t], rock, x, y, size, 1, 0, 0);
    if (size >= 2.2) addPoly(light[t], rock, x, y, size, 0.74, -size * 0.13, -size * 0.13);
    if (size >= 3) addPoly(shine, rock, x, y, size, 0.4, -size * 0.3, -size * 0.3);
    if (size >= 4) {
      craters.moveTo(x + size * 0.34, y + size * 0.1);
      craters.arc(x + size * 0.18, y + size * 0.1, size * 0.16, 0, Math.PI * 2);
    }
    if (ware === 'nividium' || (rock.tone > 0.8 && size >= 3)) {
      const d = Math.max(1, size * 0.2);
      sparks.rect(x - size * 0.1, y + size * 0.05, d, d);
    }
  }
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = rgba(accent, i ? 0.5 : 0.3);
    ctx.fill(dust[i]);
  }
  for (let t = 0; t < TONES; t++) {
    ctx.fillStyle = ware === 'ice' ? shade(base, -0.25 + (t / TONES) * 0.2) : shade(base, -0.28 + (t / TONES) * 0.14);
    ctx.fill(body[t]);
    if (ware !== 'ice') {
      ctx.fillStyle = shade(base, 0.08 + (t / TONES) * 0.14);
      ctx.fill(light[t]);
    }
  }
  if (ware === 'ice') {
    ctx.strokeStyle = 'rgba(235,250,255,0.75)';
    ctx.lineWidth = iceEdgeW;
    ctx.stroke(iceEdge);
    return;
  }
  ctx.fillStyle = shade(base, 0.38);
  ctx.fill(shine);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill(craters);
  ctx.fillStyle = rgba(accent, ware === 'nividium' ? 0.95 : 0.6);
  ctx.fill(sparks);
}
