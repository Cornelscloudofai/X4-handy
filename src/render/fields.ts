// Gesteinsfelder (Erz, Silizium, Eis, Nividium) als einzelne Brocken in drei Tiefenebenen.
// Nah gezoomt wird jeder Brocken scharf als Vieleck gezeichnet, in der Gesamtansicht genügt je Ebene ein kleines Bild.
// Parallaxe: Ferne Brocken sind kleiner und dunkler und wandern beim Verschieben weniger als nahe.
import { WARES } from '../data/wares';
import type { Camera } from './camera';
import { rgba, rng } from './sprites';
import { spriteNames, spriteUrl } from './shipArt';

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
export const DEPTH = [0.9, 1, 1.1];
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
  // Brockengröße: rund zwei Drittel des früheren Feldbilds – kleinere Brocken kommen beim Heranzoomen dazu
  const kmPerPx = ((R * 2.6) / 512) * 0.65;
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.ceil(data.ext * 2 * zb * depth * dpr);
    const img = px <= 2048 ? zoomSprite(f.id, f.ware, data, layer, zb, depth, dpr, base, color) : null;
    if (img) {
      const size = data.ext * 2 * z;
      ctx.drawImage(img, lx - size / 2, ly - size / 2, size, size);
    } else {
      // Ganz nah: nur die sichtbaren Brocken direkt zeichnen
      drawLayerBatched(ctx, cam, data.rocks[layer], lx, ly, z, cos, sin, base, color, f.ware);
    }
  }
  ctx.globalAlpha = 1;
}

const zoomCache = new Map<string, { c: HTMLCanvasElement; used: number }>();
const BUDGET = 16e6; // Pixel – Speichergrenze fürs Handy

/**
 * Ebene als scharfes Bild in der Auflösung der aktuellen Zoomstufe. Kleiner Zwischenspeicher mit Pixelgrenze:
 * Gerade benutzte Bilder werden nie verworfen; reicht der Platz nicht, liefert die Funktion null und die Ebene wird
 * direkt gezeichnet – so wird nie jedes Bild neu aufgebaut.
 */
function zoomSprite(id: string, ware: string, data: FieldData, layer: number, zb: number, depth: number, dpr: number, base: string, accent: string): HTMLCanvasElement | null {
  const now = performance.now();
  const key = `${id}:${layer}:${zb.toFixed(4)}:${dpr}:${rockTexturesReady() ? 't' : 'v'}`;
  const hit = zoomCache.get(key);
  if (hit) {
    hit.used = now;
    return hit.c;
  }
  const cssSize = data.ext * 2 * zb * depth;
  const side = Math.max(2, Math.ceil(cssSize * dpr));
  // Platz schaffen: nur Bilder, die länger als eine halbe Sekunde nicht gebraucht wurden
  let px = 0;
  for (const v of zoomCache.values()) px += v.c.width * v.c.height;
  if (px + side * side > BUDGET) {
    const old = [...zoomCache.entries()].filter(([, v]) => now - v.used > 500).sort((x, y) => x[1].used - y[1].used);
    for (const [k, v] of old) {
      if (px + side * side <= BUDGET) break;
      px -= v.c.width * v.c.height;
      zoomCache.delete(k);
    }
    if (px + side * side > BUDGET) return null;
  }
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const fake = { w: cssSize, h: cssSize } as Camera;
  drawLayerBatched(ctx, fake, data.rocks[layer], cssSize / 2, cssSize / 2, zb * depth, 1, 0, base, accent, ware);
  zoomCache.set(key, { c, used: now });
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
  // Große Brocken bekommen die Asteroidentextur (sobald die Bilder geladen sind)
  const texOn = rockTexturesReady();
  const texList: { x: number; y: number; size: number; rock: Rock }[] = [];
  for (const rock of rocks) {
    const rx = rock.dx * cos - rock.dz * sin, rz = rock.dx * sin + rock.dz * cos;
    const x = lx + rx * z, y = ly + rz * z;
    const size = rock.s * z;
    if (x < -size - 4 || y < -size - 4 || x > cam.w + size + 4 || y > cam.h + size + 4) continue;
    const t = Math.min(TONES - 1, Math.floor(rock.tone * TONES));
    if (texOn && !rock.dust && size * 1.9 >= TEX_MIN) { texList.push({ x, y, size, rock }); continue; }
    if (rock.dust || size < 1.1) {
      const d = Math.max(0.6, size * 1.4);
      // feiner Staub nur aus der Ferne – nah übernehmen die Detailstufen (sonst flache Quadrate)
      if (d > 3.5) continue;
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
    drawTexturedRocks(ctx, texList, ware);
    return;
  }
  ctx.fillStyle = shade(base, 0.38);
  ctx.fill(shine);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill(craters);
  ctx.fillStyle = rgba(accent, ware === 'nividium' ? 0.95 : 0.6);
  ctx.fill(sparks);
  drawTexturedRocks(ctx, texList, ware);
}


// ---------- Texturen: echte Asteroidenbilder statt Vielecken, sobald ein Brocken groß genug im Bild ist ----------

/** Alle Asteroidenbilder (src/assets/sprites/asteroid-<n>-ki.*); neue Bilder werden automatisch mitbenutzt */
const ROCK_ART = spriteNames(/^asteroid-\d+-ki$/);
const rockImgs: HTMLImageElement[] = [];
let rockImgsReady = false;
function rockImages(): HTMLImageElement[] | null {
  if (typeof Image === 'undefined' || !ROCK_ART.length) return null;
  if (!rockImgs.length) for (const n of ROCK_ART) { const im = new Image(); im.decoding = 'async'; im.src = spriteUrl(n)!; rockImgs.push(im); }
  rockImgsReady ||= rockImgs.every((im) => im.complete && im.naturalWidth > 0);
  return rockImgsReady ? rockImgs : null;
}

/** Ab dieser Bildgröße (CSS-Pixel) bekommt ein Brocken die Textur */
const TEX_MIN = 14;

/** Färbung je Rohstoff (multipliziert, Stärke) – Erz rostig, Silizium kühl grau, Eis hellblau, Nividium golden */
const TINT: Record<string, [string, number]> = {
  ore: ['#b07a55', 0.55], silicon: ['#9aa8bc', 0.5], ice: ['#cfeaff', 0.35], nividium: ['#d8b060', 0.6],
};
const tintCache = new Map<string, HTMLCanvasElement>();
function tinted(i: number, ware: string): HTMLCanvasElement | HTMLImageElement | null {
  const imgs = rockImages();
  if (!imgs) return null;
  const im = imgs[i % imgs.length];
  const t = TINT[ware];
  if (!t) return im;
  const key = `${i % imgs.length}:${ware}`;
  let c = tintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = t[1];
    g.fillStyle = t[0];
    g.fillRect(0, 0, c.width, c.height);
    // Durchsichtigkeit des Bildes wiederherstellen
    g.globalCompositeOperation = 'destination-in';
    g.globalAlpha = 1;
    g.drawImage(im, 0, 0);
    if (ware === 'ice') {
      // Eis: heller, kühler Glanz
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.18;
      g.fillStyle = '#e8f8ff';
      g.fillRect(0, 0, c.width, c.height);
    }
    tintCache.set(key, c);
  }
  return c;
}

/** Texturierten Brocken zeichnen; Licht kommt im Bild von oben links – daher nur leicht gedreht, dafür gespiegelt */
function drawTextured(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, d: number, rot: number, flip: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  // Bildinhalt füllt rund 80 % des Bildes
  const s = d * 1.25;
  ctx.drawImage(img, -s / 2, -s / 2, s, s);
  ctx.restore();
}

/** Texturen bereit? (für Bildzwischenspeicher: erst ohne, dann mit Texturen) */
export function rockTexturesReady(): boolean {
  return !!rockImages();
}

/** Große Brocken einer Ebene texturiert zeichnen (vom gebündelten Zeichnen übersprungen) */
export function drawTexturedRocks(ctx: CanvasRenderingContext2D, list: { x: number; y: number; size: number; rock: Rock }[], ware: string): void {
  for (const { x, y, size, rock } of list) {
    const img = tinted(Math.floor(rock.tone * 997), ware);
    if (img) drawTextured(ctx, img, x, y, size * 1.9, ((rock.rot % 0.7) - 0.35), rock.tone > 0.5);
  }
}

// ---------- Detailstufen: kleinere Brocken erscheinen erst beim Heranzoomen ----------

/**
 * Stufen kleinerer Brocken (Durchmesser in km). Sie werden für den sichtbaren Ausschnitt aus einem festen
 * Zufallsmuster erzeugt (gleiche Stelle = gleiche Brocken) und folgen der Dichte der Feldballungen.
 * Zum Vergleich: Das S-Schiff ist rund 0,14 km lang.
 */
const TIERS = [
  { dmin: 0.12, dmax: 0.4, cell: 1.6, n: 2.2 },
  { dmin: 0.03, dmax: 0.12, cell: 0.45, n: 2.6 },
  { dmin: 0.008, dmax: 0.03, cell: 0.12, n: 3 },
];

function hash4(a: number, b: number, c: number, d: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  for (const v of [b, c, d]) { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; }
  return h >>> 0;
}

/** Dichte (0–1) an einem Punkt relativ zur Feldmitte: Ballungen dicht, Rand dünn */
function density(data: FieldData, dx: number, dz: number, R: number): number {
  let d = 0;
  for (const k of data.clusters) {
    const q = ((dx - k.dx) ** 2 + (dz - k.dz) ** 2) / (k.s * k.s);
    d = Math.max(d, Math.exp(-q * 1.3));
  }
  const edge = Math.hypot(dx, dz) / (R * 1.25);
  return d * Math.max(0, 1 - edge * edge);
}

export function drawRockDetail(ctx: CanvasRenderingContext2D, cam: Camera, f: { id: string; ware: string; x: number; z: number; r: number }, seed: number): void {
  const z = cam.zoom;
  if (TIERS[0].dmax * z < 3) return;
  const data = rockField(f.id, f.ware, f.r, seed);
  const [x0, z0] = cam.toWorld(0, 0), [x1, z1] = cam.toWorld(cam.w, cam.h);
  const ext = f.r * 1.3;
  const minX = Math.max(Math.min(x0, x1), f.x - ext), maxX = Math.min(Math.max(x0, x1), f.x + ext);
  const minZ = Math.max(Math.min(z0, z1), f.z - ext), maxZ = Math.min(Math.max(z0, z1), f.z + ext);
  if (minX >= maxX || minZ >= maxZ) return;
  const base = baseColor(f.ware), accent = WARES[f.ware]?.color ?? '#999999';
  const fid = hashStrSimple(f.id);
  TIERS.forEach((T, ti) => {
    const big = T.dmax * z;
    if (big < 3) return;
    // weich einblenden, wenn die Stufe gerade sichtbar groß wird
    const alpha = Math.max(0, Math.min(1, (big - 3) / 9));
    const ix0 = Math.floor((minX - f.x) / T.cell), ix1 = Math.floor((maxX - f.x) / T.cell);
    const iz0 = Math.floor((minZ - f.z) / T.cell), iz1 = Math.floor((maxZ - f.z) / T.cell);
    if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > 900) return; // Sicherheitsgrenze
    const small = [new Path2D(), new Path2D()];
    const tex: [number, number, number, number, boolean, number][] = [];
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const cx = (ix + 0.5) * T.cell, cz = (iz + 0.5) * T.cell;
      const dens = density(data, cx, cz, f.r);
      if (dens < 0.04) continue;
      const r = rng(hash4(fid, ti, ix, iz));
      const count = Math.floor(T.n * dens + r());
      for (let k = 0; k < count; k++) {
        const wx = f.x + (ix + r()) * T.cell, wz = f.z + (iz + r()) * T.cell;
        // logarithmisch verteilt: viele kleine, wenige große
        const d = T.dmin * Math.pow(T.dmax / T.dmin, r() * r());
        const [sx, sy] = cam.toScreen(wx, wz);
        const px = d * z;
        const tone = r(), rot = r();
        if (px < 1 || sx < -px || sy < -px || sx > cam.w + px || sy > cam.h + px) continue;
        if (px >= 7) { tex.push([sx, sy, px, rot, tone > 0.5, tone]); continue; }
        // klein: unregelmäßiges Vieleck in zwei Helligkeiten
        const p = small[tone > 0.5 ? 1 : 0];
        const nPts = 7;
        for (let j = 0; j < nPts; j++) {
          const a = rot * 6.28 + (j / nPts) * Math.PI * 2;
          const rr = (px / 2) * (0.72 + 0.28 * Math.abs(Math.sin(j * 2.3 + tone * 9)));
          const qx = sx + Math.cos(a) * rr, qy = sy + Math.sin(a) * rr * 0.85;
          j ? p.lineTo(qx, qy) : p.moveTo(qx, qy);
        }
        p.closePath();
      }
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = shade(base, -0.62);
    ctx.fill(small[0]);
    ctx.fillStyle = shade(base, -0.48);
    ctx.fill(small[1]);
    for (const [sx, sy, px, rot, flip, tone] of tex) {
      const img = tinted(Math.floor(tone * 997), f.ware);
      if (img) drawTextured(ctx, img, sx, sy, px, rot * 0.7 - 0.35, flip);
      else { ctx.fillStyle = shade(base, -0.2); ctx.beginPath(); ctx.arc(sx, sy, px / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    void accent;
  });
  ctx.globalAlpha = 1;
}

function hashStrSimple(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Brocken, an dem ein Miner gerade arbeitet (nah herangezoomt): texturiert, mit glühender Abbaustelle */
export function drawMiningRock(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, ware: string, seed: number): void {
  const img = tinted(seed % 997, ware);
  if (img) drawTextured(ctx, img, x, y, d, ((seed % 70) / 100) - 0.35, seed % 2 === 0);
  else {
    ctx.fillStyle = shade(baseColor(ware), -0.3);
    ctx.beginPath();
    ctx.arc(x, y, d / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
