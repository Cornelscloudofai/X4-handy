// Sektorhintergrund aus mehreren Bildebenen (src/assets/szenen/<sektor>/*.webp, aufbereitet mit scripts/import-scene.mjs)
// plus gezeichneten Effekten. Jede Ebene hat ihre Tiefe – beim Verschieben der Karte gleiten nahe Ebenen weiter als ferne.
// Die Anordnung richtet sich nach dem Bildschirm (nicht nach einem festen 16:9-Bild): Jedes Objekt hat eine eigene Lage
// im Hoch- und im Querformat, ganzflächige Ebenen werden im Hochformat auf Wunsch gedreht, die Mitte bleibt für die Karte.
// Ebenen aus demselben 16:9-Rahmen (z. B. Station und ihre Verkehrslichter) bekommen denselben Anker und dieselbe Breite
// und liegen so deckungsgleich.

import { stormNow } from '../engine/phenomena';

const FILES = import.meta.glob('../assets/szenen/*/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URLS: Record<string, Record<string, string>> = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = path.match(/szenen\/([^/]+)\/([^/]+)\.webp$/);
  if (m) (URLS[m[1]] ??= {})[m[2]] = url;
}

type Pt = [number, number];
type Blend = 'source-over' | 'lighter' | 'screen';

/** Ganzflächige Ebene (deckt den Bildschirm samt Spielraum für die Parallaxe) */
interface Cover {
  cover: string; depth: number;
  /** im Hochformat um 90° gedreht (Nebel, Staub – nichts mit „oben“ und „unten“) */
  turn?: boolean;
  /** Bildausschnitt im Hochformat ohne Drehung: waagrechte Lage 0…1 des sichtbaren Streifens */
  focus?: number;
  scale?: number; alpha?: number; blend?: Blend;
  /** atmen: Deckkraft schwingt; treiben: Ebene gleitet langsam hin und her */
  breathe?: number; drift?: number;
}
/** Einzelnes Objekt: Anker im Bild (Anteile) liegt an der Bildschirmstelle p (hoch) bzw. l (quer) */
interface Sprite {
  img: string; id?: string; depth: number;
  at?: Pt; p: Pt; l: Pt;
  /** Bildbreite relativ zur kürzeren Bildschirmseite (wl: im Querformat) */
  w: number; wl?: number;
  rot?: number; rotL?: number; spin?: number;
  /** Drehung um ein Objekt (id) statt eigener Lage – für Plasma an der Sonne */
  on?: string;
  alpha?: number; blend?: Blend; dark?: number;
  /** Flackern: Stärke und Tempo; Puls: Größe schwingt leicht */
  flicker?: [number, number]; pulse?: number; bob?: number;
}
/** Gezeichnete Effekte */
type Effect =
  | { fx: 'twinkle'; n: number; rgb: string; depth: number }
  | { fx: 'glow'; on: string; r: number; rgb: string; a: number; pulse?: number; rays?: number }
  | { fx: 'sparks'; on: string; n: number; rgb: string; dirP: number; dirL: number; spread: number; speed: number }
  | { fx: 'motes'; n: number; rgb: string; depth: number; vx: number; vy: number; size: number; a: number }
  | { fx: 'haze'; rgb: string; a: number; n: number }
  | { fx: 'traffic'; on: string; n: number; rx: number; ry: number }
  | { fx: 'glimmer'; on: string; r: number; rgb: string; every: number }
  | { fx: 'beat'; on: string; rgb: string; period: number; r: number }
  | { fx: 'vignette'; rgb: string; a: number }
  /** Strahlungssturm (nur während er im Spiel tobt): rote Schlieren, Blitze, Funkenregen */
  | { fx: 'storm'; on: string };
type Item = Cover | Sprite | Effect;

const SCENES: Record<string, Item[]> = {
  // Horchposten der Familie Rhy: still, kalt, verlassen – das tote Tor im Hintergrund glimmt ab und zu
  'f-ausblick': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 110, rgb: '220,225,255', depth: 0.2 },
    { cover: 'nebel', depth: 0.3, focus: 0.3, scale: 1.12, breathe: 0.06 },
    { img: 'tor', id: 'tor', depth: 0.4, p: [0.74, 0.21], l: [0.82, 0.26], w: 0.6, wl: 0.55, rot: -0.35, spin: 0.0015, dark: 0.15 },
    { fx: 'glimmer', on: 'tor', r: 0.28, rgb: '255,110,70', every: 11 },
    { img: 'horchposten', id: 'posten', depth: 0.65, at: [0.54, 0.5], p: [0.14, 0.64], l: [0.64, 0.55], w: 0.42, wl: 0.5, rot: 0.05, bob: 0.008 },
    { fx: 'glow', on: 'posten', r: 0.06, rgb: '255,170,90', a: 0.18, pulse: 0.3 },
    { fx: 'motes', n: 40, rgb: '210,190,180', depth: 1.1, vx: 0.004, vy: -0.002, size: 1.2, a: 0.25 },
    { fx: 'vignette', rgb: '4,2,4', a: 0.6 },
  ],
  // Glutsee I: junger Stern, Plasmaströme, glühender Wasserstoff
  'f-glut1': [
    { cover: 'sterne', depth: 0.12, turn: true, scale: 1.12 },
    { fx: 'twinkle', n: 140, rgb: '255,215,180', depth: 0.25 },
    { cover: 'nebel', depth: 0.3, turn: true, scale: 1.16, alpha: 0.95, breathe: 0.08 },
    { img: 'sonne', id: 'sonne', depth: 0.45, p: [0.9, 0.2], l: [0.92, 0.2], w: 0.72, wl: 0.6, spin: 0.004, pulse: 0.025 },
    { fx: 'glow', on: 'sonne', r: 0.7, rgb: '255,170,80', a: 0.5, pulse: 0.06, rays: 14 },
    { img: 'plasma', on: 'sonne', depth: 0.45, at: [0.99, 0.03], p: [0, 0], l: [0, 0], w: 1.75, wl: 1.45, rot: 0.62, rotL: 0.05, blend: 'lighter', flicker: [0.22, 1.3] },
    { fx: 'sparks', on: 'sonne', n: 60, rgb: '255,150,70', dirP: 2.25, dirL: 2.9, spread: 0.55, speed: 1 },
    { fx: 'storm', on: 'sonne' },
    { img: 'fels-b', depth: 1.35, p: [0.0, 0.8], l: [0.04, 0.88], w: 0.46, rot: 0.4, spin: 0.006, dark: 0.12 },
    { img: 'fels-a', depth: 1.2, p: [1.02, 0.72], l: [0.97, 0.8], w: 0.42, rot: -0.3, spin: -0.008, dark: 0.08 },
    { img: 'fels-a', depth: 0.85, p: [0.16, 0.68], l: [0.12, 0.6], w: 0.13, rot: 1.6, spin: 0.012, dark: 0.35 },
    { img: 'fels-b', depth: 1.05, p: [0.86, 0.97], l: [0.8, 0.95], w: 0.2, rot: 2.2, spin: -0.01, dark: 0.25 },
    { img: 'fels-b', depth: 0.7, p: [0.72, 0.62], l: [0.62, 0.72], w: 0.07, rot: 0.9, spin: 0.02, dark: 0.5 },
    { img: 'fels-a', depth: 0.75, p: [0.3, 0.86], l: [0.3, 0.9], w: 0.05, rot: 0.2, spin: 0.03, dark: 0.45 },
    { img: 'fels-a', depth: 0.8, p: [0.93, 0.5], l: [0.7, 0.45], w: 0.045, rot: 2.1, spin: 0.02, dark: 0.45 },
    { fx: 'vignette', rgb: '8,2,2', a: 0.55 },
  ],
  // Die Aschefelder: zerbrochener Mond, Staub, schwaches rotes Sonnenlicht
  'f-asche': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 60, rgb: '230,200,180', depth: 0.2 },
    { img: 'sonne', id: 'sonne', depth: 0.25, p: [0.78, 0.17], l: [0.8, 0.14], w: 0.5, wl: 0.4, pulse: 0.015 },
    { fx: 'glow', on: 'sonne', r: 0.5, rgb: '255,90,60', a: 0.35, pulse: 0.05 },
    { img: 'mond', depth: 0.35, p: [0.12, 0.2], l: [0.16, 0.22], w: 0.95, wl: 0.75, rot: -0.15, spin: 0.0008 },
    { cover: 'staub', depth: 0.5, turn: true, scale: 1.18, alpha: 0.9, drift: 0.025, breathe: 0.06 },
    { fx: 'haze', rgb: '120,90,70', a: 0.1, n: 6 },
    { cover: 'truemmer', depth: 0.8, turn: true, scale: 1.2, drift: 0.04 },
    { img: 'fels-a', depth: 1.35, p: [0.02, 0.84], l: [0.06, 0.86], w: 0.55, wl: 0.45, rot: 0.2, spin: 0.004, dark: 0.1 },
    { img: 'fels-b', depth: 1.2, p: [1.0, 0.66], l: [0.96, 0.62], w: 0.5, wl: 0.4, rot: -0.5, spin: -0.005, dark: 0.1 },
    { img: 'fels-b', depth: 0.9, p: [0.82, 0.93], l: [0.72, 0.92], w: 0.16, rot: 1.4, spin: 0.012, dark: 0.35 },
    { img: 'fels-a', depth: 0.75, p: [0.22, 0.6], l: [0.3, 0.78], w: 0.08, rot: 2.4, spin: -0.02, dark: 0.45 },
    { fx: 'motes', n: 90, rgb: '190,150,120', depth: 1.2, vx: 0.012, vy: 0.003, size: 1.3, a: 0.35 },
    { fx: 'vignette', rgb: '6,4,3', a: 0.6 },
  ],
  // Familie Rhak: Handelsstation vor dem Gasriesen, Verkehr ringsum
  'f-rhak': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 90, rgb: '255,220,190', depth: 0.2 },
    { img: 'gasriese', id: 'riese', depth: 0.25, at: [0.63, 0.48], p: [0.74, 0.2], l: [0.8, 0.32], w: 1.6, wl: 1.25, rot: -0.08 },
    { cover: 'nebel', depth: 0.4, turn: true, scale: 1.14, breathe: 0.07 },
    { img: 'station', id: 'station', depth: 0.6, at: [0.5, 0.5], p: [0.56, 0.75], l: [0.78, 0.72], w: 1.05, wl: 0.8, bob: 0.004 },
    { img: 'lichter', depth: 0.6, at: [0.5, 0.5], p: [0.56, 0.75], l: [0.78, 0.72], w: 1.05, wl: 0.8, bob: 0.004, blend: 'lighter', flicker: [0.35, 2.1] },
    { fx: 'traffic', on: 'station', n: 14, rx: 0.55, ry: 0.16 },
    { fx: 'motes', n: 30, rgb: '255,190,140', depth: 1.1, vx: -0.003, vy: 0.001, size: 1, a: 0.25 },
    { fx: 'vignette', rgb: '6,3,2', a: 0.55 },
  ],
  // Der Schmiedestern: Pulsar mit kreisenden Strahlen im zerbrochenen Kollektorring
  'f-schmiede': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 120, rgb: '200,220,255', depth: 0.2 },
    { cover: 'nebel', depth: 0.3, turn: true, scale: 1.14, breathe: 0.07 },
    { img: 'staub', depth: 0.4, at: [0.5, 0.5], p: [0.5, 0.28], l: [0.5, 0.45], w: 2.4, wl: 1.9, rot: 0, spin: 0.05, blend: 'lighter', alpha: 0.8 },
    { img: 'strahlen', depth: 0.4, at: [0.495, 0.48], p: [0.5, 0.28], l: [0.5, 0.45], w: 2.6, wl: 2.0, spin: 0.05, blend: 'lighter', flicker: [0.3, 4.8] },
    { img: 'ring', id: 'ring', depth: 0.45, at: [0.5, 0.5], p: [0.5, 0.28], l: [0.5, 0.45], w: 1.15, wl: 0.95, spin: 0.002 },
    { img: 'kern', id: 'kern', depth: 0.4, p: [0.5, 0.28], l: [0.5, 0.45], w: 0.55, wl: 0.45, blend: 'lighter', pulse: 0.08 },
    { fx: 'beat', on: 'kern', rgb: '150,200,255', period: 1.3, r: 0.4 },
    { fx: 'motes', n: 70, rgb: '255,180,110', depth: 1.15, vx: 0.003, vy: -0.004, size: 1.1, a: 0.35 },
    { fx: 'vignette', rgb: '2,3,8', a: 0.6 },
  ],
};

export const hasScene = (sectorId: string): boolean => !!SCENES[sectorId] && !!URLS[sectorId];

const images = new Map<string, HTMLImageElement>();
function image(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Alle Ebenen geladen? (sonst dunkler Grund, damit nichts halb erscheint) */
function ready(sectorId: string): Record<string, HTMLImageElement> | null {
  const out: Record<string, HTMLImageElement> = {};
  let ok = true;
  for (const [k, url] of Object.entries(URLS[sectorId] ?? {})) {
    const img = image(url);
    if (img) out[k] = img; else ok = false;
  }
  return ok ? out : null;
}

/** Zufallswerte je Sektor und Effekt (fest, damit nichts springt) */
const rnd = new Map<string, number[]>();
function randoms(key: string, n: number): number[] {
  let r = rnd.get(key);
  if (r && r.length >= n) return r;
  let seed = 11;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  r = Array.from({ length: n }, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
  rnd.set(key, r);
  return r;
}

const isCover = (i: Item): i is Cover => 'cover' in i;
const isSprite = (i: Item): i is Sprite => 'img' in i;

/**
 * Szene zeichnen. fx/fz: Kameralage −1…1 (Parallaxe), t: Zeit in Sekunden. Liefert false, solange Ebenen laden.
 */
export function drawScene(ctx: CanvasRenderingContext2D, sectorId: string, W: number, H: number, fx: number, fz: number, t: number): boolean {
  const items = SCENES[sectorId];
  const L = ready(sectorId);
  ctx.fillStyle = '#040305';
  ctx.fillRect(0, 0, W, H);
  if (!items || !L) return false;
  const portrait = H > W;
  const S = Math.max(W, H), s = Math.min(W, H);
  const pan = (depth: number): Pt => [-fx * depth * S * 0.06, -fz * depth * S * 0.06];
  /** Bildschirmlage und Größe der Objekte (für Effekte, die sich auf sie beziehen) */
  const where: Record<string, { x: number; y: number; w: number }> = {};
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  items.forEach((it, idx) => {
    const key = `${sectorId}:${idx}`;
    if (isCover(it)) {
      const img = L[it.cover];
      if (!img) return;
      const [px, py] = pan(it.depth);
      const turn = portrait && !!it.turn;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const rw = turn ? ih : iw, rh = turn ? iw : ih;
      const k = Math.max(W / rw, H / rh) * (it.scale ?? 1.1);
      const drift = it.drift ? Math.sin(t * 0.05 + idx) * it.drift * S : 0;
      // ohne Drehung im Hochformat: gewählten Streifen zeigen
      const shift = portrait && !turn && it.focus !== undefined ? (0.5 - it.focus) * iw * k : 0;
      ctx.save();
      ctx.globalAlpha = (it.alpha ?? 1) * (1 - (it.breathe ?? 0) + (it.breathe ?? 0) * Math.sin(t * 0.21 + idx));
      ctx.globalCompositeOperation = it.blend ?? 'source-over';
      ctx.translate(W / 2 + px + drift + shift, H / 2 + py);
      if (turn) ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
      ctx.restore();
      return;
    }
    if (isSprite(it)) {
      const img = L[it.img];
      if (!img) return;
      const [px, py] = pan(it.depth);
      const base = it.on ? where[it.on] : undefined;
      const [ax, ay] = portrait ? it.p : it.l;
      const x = base ? base.x : ax * W + px;
      const y0 = base ? base.y : ay * H + py;
      const bob = it.bob ? Math.sin(t * 0.3 + idx * 1.7) * it.bob * s : 0;
      const y = y0 + bob;
      const pulse = it.pulse ? 1 + it.pulse * (0.6 * Math.sin(t * 0.9 + idx) + 0.4 * Math.sin(t * 2.3)) : 1;
      const w = (portrait ? it.w : it.wl ?? it.w * 0.85) * s * pulse;
      const h = (w * img.naturalHeight) / img.naturalWidth;
      const [cx, cy] = it.at ?? [0.5, 0.5];
      if (it.id) where[it.id] = { x, y, w };
      ctx.save();
      ctx.globalCompositeOperation = it.blend ?? 'source-over';
      let a = it.alpha ?? 1;
      if (it.flicker) a *= 1 - it.flicker[0] * (0.5 + 0.5 * Math.sin(t * it.flicker[1] + idx) * Math.sin(t * it.flicker[1] * 2.7));
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.translate(x, y);
      ctx.rotate((portrait ? it.rot ?? 0 : it.rotL ?? it.rot ?? 0) + t * (it.spin ?? 0));
      if (it.dark) ctx.filter = `brightness(${(1 - it.dark).toFixed(2)})`;
      ctx.drawImage(img, -cx * w, -cy * h, w, h);
      ctx.restore();
      return;
    }
    drawEffect(ctx, it, key, where, W, H, S, s, t, pan, portrait);
  });
  ctx.restore();
  return true;
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, key: string, where: Record<string, { x: number; y: number; w: number }>,
  W: number, H: number, S: number, s: number, t: number, pan: (d: number) => Pt, portrait: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  switch (e.fx) {
    case 'twinkle': {
      const r = randoms(key, e.n * 5);
      const [px, py] = pan(e.depth);
      for (let i = 0; i < e.n; i++) {
        const a = (0.25 + r[i * 5 + 3] * 0.6) * (0.55 + 0.45 * Math.sin(t * (0.4 + r[i * 5 + 4] * 1.6) + i));
        const x = ((r[i * 5] * W + px) % W + W) % W, y = ((r[i * 5 + 1] * H + py) % H + H) % H;
        ctx.fillStyle = `rgba(${e.rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.4 + r[i * 5 + 2] * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'glow': {
      const o = where[e.on];
      if (!o) break;
      const R = e.r * o.w * (1 + (e.pulse ?? 0) * Math.sin(t * 0.9));
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 2.5);
      g.addColorStop(0, `rgba(${e.rgb},${e.a})`);
      g.addColorStop(0.3, `rgba(${e.rgb},${(e.a * 0.4).toFixed(3)})`);
      g.addColorStop(1, `rgba(${e.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(o.x - R * 2.5, o.y - R * 2.5, R * 5, R * 5);
      // Strahlen, die sich langsam drehen
      for (let i = 0; i < (e.rays ?? 0); i++) {
        const n = e.rays!;
        const a = (i / n) * Math.PI * 2 + t * 0.012 + Math.sin(i * 7.3) * 0.2;
        const len = R * (1.3 + 0.8 * Math.abs(Math.sin(i * 3.1 + t * 0.15)));
        const w = R * (0.03 + 0.03 * Math.abs(Math.sin(i * 1.7)));
        const lg = ctx.createLinearGradient(o.x, o.y, o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
        lg.addColorStop(0, `rgba(${e.rgb},0.09)`);
        lg.addColorStop(1, `rgba(${e.rgb},0)`);
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(a + Math.PI / 2) * w, o.y + Math.sin(a + Math.PI / 2) * w);
        ctx.lineTo(o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
        ctx.lineTo(o.x + Math.cos(a - Math.PI / 2) * w, o.y + Math.sin(a - Math.PI / 2) * w);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'sparks': {
      const o = where[e.on];
      if (!o) break;
      for (let i = 0; i < e.n; i++) {
        const life = (t * (0.025 + (i % 7) * 0.004) * e.speed + i * 0.137) % 1;
        const ang = (portrait ? e.dirP : e.dirL) + Math.sin(i * 12.9) * e.spread;
        const dist = (0.1 + life * 1.1) * S * 0.75;
        const x = o.x + Math.cos(ang) * dist + Math.sin(t * 0.5 + i) * 6;
        const y = o.y + Math.sin(ang) * dist + Math.cos(t * 0.4 + i) * 6;
        const a = Math.sin(life * Math.PI) * (0.35 + 0.4 * ((i * 37) % 10) / 10);
        ctx.fillStyle = `rgba(${e.rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + ((i * 53) % 10) / 10 * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'motes': {
      // Staubkörner/Funken, die langsam durchs Bild treiben (wiederholt über den Rand)
      const r = randoms(key, e.n * 4);
      const [px, py] = pan(e.depth);
      for (let i = 0; i < e.n; i++) {
        const x = (((r[i * 4] + t * e.vx * (0.5 + r[i * 4 + 2])) % 1) + 1) % 1 * W + px;
        const y = (((r[i * 4 + 1] + t * e.vy * (0.5 + r[i * 4 + 2])) % 1) + 1) % 1 * H + py;
        const a = e.a * (0.4 + 0.6 * r[i * 4 + 3]) * (0.7 + 0.3 * Math.sin(t + i));
        ctx.fillStyle = `rgba(${e.rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, e.size * (0.5 + r[i * 4 + 2]), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'haze': {
      // Weiche Staubschwaden, die langsam ziehen
      ctx.globalCompositeOperation = 'source-over';
      const r = randoms(key, e.n * 3);
      for (let i = 0; i < e.n; i++) {
        const x = (((r[i * 3] + t * 0.004 * (0.5 + r[i * 3 + 2])) % 1.4) - 0.2) * W;
        const y = (0.15 + r[i * 3 + 1] * 0.7) * H;
        const R = (0.35 + r[i * 3 + 2] * 0.4) * S;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(${e.rgb},${e.a})`);
        g.addColorStop(1, `rgba(${e.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
      }
      break;
    }
    case 'traffic': {
      // Kleine Schiffe auf Bahnen um die Station: Positionslichter, die wandern und blinken
      const o = where[e.on];
      if (!o) break;
      const r = randoms(key, e.n * 3);
      for (let i = 0; i < e.n; i++) {
        const ang = t * (0.03 + r[i * 3] * 0.05) * (i % 2 ? 1 : -1) + r[i * 3 + 1] * Math.PI * 2;
        const rr = 0.6 + r[i * 3 + 2] * 0.5;
        const x = o.x + Math.cos(ang) * e.rx * o.w * rr, y = o.y + Math.sin(ang) * e.ry * o.w * rr;
        const blink = Math.sin(t * 3 + i * 2.1) > 0.6 ? 1 : 0.35;
        const col = i % 3 === 0 ? '255,90,70' : i % 3 === 1 ? '255,200,120' : '190,230,255';
        const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
        g.addColorStop(0, `rgba(${col},${(0.9 * blink).toFixed(2)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
      break;
    }
    case 'glimmer': {
      // Ein totes Tor, das ab und zu kurz aufglimmt
      const o = where[e.on];
      if (!o) break;
      const ph = (t % e.every) / e.every;
      const a = ph < 0.08 ? Math.sin((ph / 0.08) * Math.PI) * (0.6 + 0.4 * Math.sin(t * 40)) : 0;
      if (a <= 0) break;
      const R = e.r * o.w * 1.6;
      const g = ctx.createRadialGradient(o.x, o.y, R * 0.55, o.x, o.y, R);
      g.addColorStop(0, `rgba(${e.rgb},0)`);
      g.addColorStop(0.8, `rgba(${e.rgb},${(0.35 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${e.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(o.x - R, o.y - R, R * 2, R * 2);
      break;
    }
    case 'beat': {
      // Herzschlag des Pulsars: kurzer heller Lichtstoß im Takt
      const o = where[e.on];
      if (!o) break;
      const ph = (t % e.period) / e.period;
      const a = Math.exp(-ph * 9);
      const R = e.r * o.w * (1 + ph * 0.6) * 2;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
      g.addColorStop(0, `rgba(${e.rgb},${(0.5 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${e.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(o.x - R, o.y - R, R * 2, R * 2);
      break;
    }
    case 'storm': {
      if (!stormNow()) break;
      const o = where[e.on];
      if (!o) break;
      // Funkenregen von der Sonne weg, schnell und dicht
      const r = randoms(key, 360);
      for (let i = 0; i < 120; i++) {
        const life = (t * (0.18 + r[i * 3] * 0.2) + r[i * 3 + 1]) % 1;
        const ang = (portrait ? 2.2 : 2.85) + (r[i * 3 + 2] - 0.5) * 1.1;
        const d0 = life * S * 1.1, d1 = d0 + S * 0.05;
        const a = Math.sin(life * Math.PI) * 0.5;
        ctx.strokeStyle = `rgba(255,${120 + Math.round(r[i * 3] * 80)},70,${a.toFixed(3)})`;
        ctx.lineWidth = 1 + r[i * 3 + 1];
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(ang) * d0, o.y + Math.sin(ang) * d0);
        ctx.lineTo(o.x + Math.cos(ang) * d1, o.y + Math.sin(ang) * d1);
        ctx.stroke();
      }
      // rötlicher Schleier, der unruhig pulsiert, und gelegentliche Blitze
      ctx.globalCompositeOperation = 'source-over';
      const flash = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1) - 0.75) * 4;
      ctx.fillStyle = `rgba(255,70,30,${(0.1 + 0.05 * Math.sin(t * 1.7) + flash * 0.12).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'vignette': {
      ctx.globalCompositeOperation = 'source-over';
      const vg = ctx.createRadialGradient(W / 2, H / 2, s * 0.35, W / 2, H / 2, S * 0.75);
      vg.addColorStop(0, `rgba(${e.rgb},0)`);
      vg.addColorStop(1, `rgba(${e.rgb},${e.a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
  ctx.restore();
}
