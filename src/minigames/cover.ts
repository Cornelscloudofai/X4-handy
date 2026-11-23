// Umgebung als Mitspieler im Kampf: Wrackfeld (Deckung für alle Seiten) und Gravitationsanomalie (Sog, Schaden im Kern).
// Wracks liegen auf der Spielebene: gestochen scharf, mit einer beleuchteten Seite, einem feinen Lichtsaum zur Lichtquelle
// hin und einem echten Schlagschatten, den sie von der Lichtquelle weg in den Raum werfen. Getroffen wird genau dort, wo
// man das Wrack sieht (Form aus dem Bild, siehe hullMask). Geschosse und Strahlen bleiben hängen, Raketen steuern herum.
import { hullGap, hullMaskOf, type HullMask } from './hullMask';
import { drawBlurred } from '../render/canvasFx';
// Deckungswracks: eigene KI-Bilder; animierte Wracks haben mehrere Bilder derselben Ansicht (Bild 1 dunkel, die weiteren
// mit glimmenden Fenstern, Glut oder Blitzen)
import ringGrau from '../assets/sprites/wrack-ring-grau.webp';
import geruest from '../assets/sprites/wrack-geruest.webp';
import ringRost1 from '../assets/sprites/wrack-ring-rost-1.webp';
import ringRost2 from '../assets/sprites/wrack-ring-rost-2.webp';
import ringRost3 from '../assets/sprites/wrack-ring-rost-3.webp';
import ringRost4 from '../assets/sprites/wrack-ring-rost-4.webp';
import ringRost5 from '../assets/sprites/wrack-ring-rost-5.webp';
import triebwerk1 from '../assets/sprites/wrack-triebwerk-1.webp';
import triebwerk2 from '../assets/sprites/wrack-triebwerk-2.webp';
import triebwerk3 from '../assets/sprites/wrack-triebwerk-3.webp';
import triebwerk4 from '../assets/sprites/wrack-triebwerk-4.webp';
import frachter1 from '../assets/sprites/wrack-frachter-1.webp';
import frachter2 from '../assets/sprites/wrack-frachter-2.webp';
import frachter3 from '../assets/sprites/wrack-frachter-3.webp';
import frachter4 from '../assets/sprites/wrack-frachter-4.webp';
import frachter5 from '../assets/sprites/wrack-frachter-5.webp';

/**
 * Lichtstelle im Bild (x, y, r als Anteil der Bildgröße, gemessen mit scripts/wreck-lights.mjs):
 * glut – glimmt (Fenster, Kabel, Brandherd) und wirft warmes Licht auf die Umgebung; funke – kurzes Sprühen aus einer
 * Bruchstelle; blitz – Entladung im offenen Gerüst: zuckende Lichtbögen, die das Wrack kurz blau erhellen
 */
interface WreckLight { x: number; y: number; r: number; kind: 'glut' | 'funke' | 'blitz'; color: string }
/** Bilder der Deckungswracks (Länge im Spiel je Bild: min … max); frames[0] ist das Grundbild */
interface WreckArt { frames: string[]; min: number; max: number; lights: WreckLight[] }
const WRECK_ART: WreckArt[] = [
  { frames: [ringRost1, ringRost2, ringRost3, ringRost4, ringRost5], min: 440, max: 580, lights: [
    { x: 0.35, y: 0.19, r: 0.04, kind: 'glut', color: '255,170,80' },
    { x: 0.154, y: 0.49, r: 0.05, kind: 'glut', color: '255,170,80' },
    { x: 0.6, y: 0.835, r: 0.04, kind: 'glut', color: '255,170,80' },
    { x: 0.845, y: 0.205, r: 0.035, kind: 'funke', color: '170,200,255' },
  ] },
  { frames: [triebwerk1, triebwerk2, triebwerk3, triebwerk4], min: 340, max: 440, lights: [
    { x: 0.33, y: 0.33, r: 0.06, kind: 'glut', color: '255,120,60' },
    { x: 0.627, y: 0.379, r: 0.04, kind: 'funke', color: '200,220,255' },
  ] },
  { frames: [frachter1, frachter2, frachter3, frachter4, frachter5], min: 480, max: 620, lights: [
    { x: 0.27, y: 0.54, r: 0.2, kind: 'glut', color: '255,80,30' },
    { x: 0.74, y: 0.3, r: 0.17, kind: 'blitz', color: '140,180,255' },
  ] },
  { frames: [ringGrau], min: 400, max: 530, lights: [] },
  { frames: [geruest], min: 380, max: 480, lights: [] },
];

const IMGS = new Map<string, HTMLImageElement>();
function img(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let i = IMGS.get(src);
  if (!i) { i = new Image(); i.decoding = 'async'; i.src = src; IMGS.set(src, i); }
  return i.complete && i.naturalWidth ? i : null;
}
export function preloadCover(): void { for (const a of WRECK_ART) for (const f of a.frames) img(f); }

export interface Wreck {
  x: number; y: number; rot: number; vr: number;
  /** Größe (längste Seite), Bild */
  size: number; art: number;
  /** Treffer-Aufblitzen am Wrack (Ort und Restzeit) */
  hits: { x: number; y: number; t: number }[];
  /** Lichtspiel animierter Wracks (Glut, Funken, Blitze) */
  fx?: WreckFx;
}

interface WreckFx {
  /** eigene Uhr, Phase der Glut */
  t: number; seed: number;
  /** laufende Entladung: welche Lichtstelle, Restzeit, Stärke (flackert), Bild mit dem Blitz */
  light: number; left: number; k: number; frame: number; flick: number;
  /** Pause bis zur nächsten Entladung */
  wait: number;
  /** Lichtbögen der aktuellen Entladung (Punkte im Bild, 0…1) */
  bolts: number[][];
}

/** Bildgröße eines Wracks in Spielpunkten (Breite, Höhe) */
function dims(w: Wreck): [number, number] {
  const i = img(WRECK_ART[w.art].frames[0]);
  if (!i) return [w.size, w.size];
  const k = w.size / Math.max(i.naturalWidth, i.naturalHeight);
  return [i.naturalWidth * k, i.naturalHeight * k];
}
function mask(w: Wreck): HullMask | null {
  const i = img(WRECK_ART[w.art].frames[0]);
  return i ? hullMaskOf(i) : null;
}

export function makeWreck(x: number, y: number, r: () => number): Wreck {
  const art = Math.floor(r() * WRECK_ART.length), a = WRECK_ART[art];
  const w: Wreck = { x, y, rot: r() * Math.PI * 2, vr: (r() - 0.5) * 0.03, size: a.min + r() * (a.max - a.min), art, hits: [] };
  if (a.frames.length > 1 || a.lights.length) w.fx = { t: 0, seed: r() * 50, light: -1, left: 0, k: 0, frame: 1, flick: 0, wait: 1 + r() * 3, bolts: [] };
  return w;
}

/** Abstand eines Punkts zur sichtbaren Hülle des Wracks (0 = darauf bzw. darin); ohne Bild: Kreis */
export function wreckGap(w: Wreck, x: number, y: number): number {
  const dx = x - w.x, dy = y - w.y, d = Math.hypot(dx, dy);
  if (d > w.size * 0.75) return d - w.size * 0.5;
  const m = mask(w);
  if (!m) return Math.max(0, d - w.size * 0.32);
  const c = Math.cos(-w.rot), s = Math.sin(-w.rot), [sw, sh] = dims(w);
  return hullGap(m, dx * c - dy * s, dx * s + dy * c, sw, sh);
}

/**
 * Trifft die Strecke (x0, y0) → (x1, y1) ein Wrack? Liefert den Anteil 0…1 bis zum ersten Treffer, sonst null.
 * Erst grob über den Umkreis, dann in kleinen Schritten an der Form entlang.
 */
export function coverHit(wrecks: Wreck[], x0: number, y0: number, x1: number, y1: number, pad = 0): number | null {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 0.01 || !wrecks.length) return null;
  let best: number | null = null;
  for (const w of wrecks) {
    const R = w.size * 0.75 + pad;
    // nächster Punkt der Strecke zum Mittelpunkt: liegt sie überhaupt nah genug?
    const t0 = Math.max(0, Math.min(1, ((w.x - x0) * dx + (w.y - y0) * dy) / (L * L)));
    if (Math.hypot(x0 + dx * t0 - w.x, y0 + dy * t0 - w.y) > R) continue;
    // nur den Abschnitt im Umkreis abtasten (Schritt 5 Spielpunkte)
    const ta = Math.max(0, t0 - R / L), tb = Math.min(1, t0 + R / L), steps = Math.ceil(((tb - ta) * L) / 5);
    for (let k = 0; k <= steps; k++) {
      const t = ta + ((tb - ta) * k) / Math.max(1, steps);
      if (best != null && t >= best) break;
      if (wreckGap(w, x0 + dx * t, y0 + dy * t) <= pad) { best = t; break; }
    }
  }
  return best;
}

/** Wrack, in dem der Punkt liegt (mit Spielraum pad) */
export function wreckAt(wrecks: Wreck[], x: number, y: number, pad = 0): Wreck | undefined {
  return wrecks.find((w) => Math.hypot(x - w.x, y - w.y) < w.size * 0.75 + pad && wreckGap(w, x, y) <= pad);
}

/**
 * Schiff aus dem Wrack schieben: liegt es mit seinem Radius r in der Hülle, wird es entlang der Richtung vom Wrack weg
 * (Abstandsgefälle) hinausgeschoben, die Fahrt in die Wand hinein geht verloren. Gibt die neue Lage zurück oder null.
 */
export function pushOut(wrecks: Wreck[], x: number, y: number, vx: number, vy: number, r: number): { x: number; y: number; vx: number; vy: number } | null {
  for (const w of wrecks) {
    if (Math.hypot(x - w.x, y - w.y) > w.size * 0.75 + r) continue;
    const g = wreckGap(w, x, y);
    if (g >= r) continue;
    // Richtung nach außen aus dem Abstandsgefälle (nahe der Mitte: vom Mittelpunkt weg)
    const e = 4, gx = wreckGap(w, x + e, y) - wreckGap(w, x - e, y), gy = wreckGap(w, x, y + e) - wreckGap(w, x, y - e);
    let nx = gx, ny = gy, l = Math.hypot(nx, ny);
    if (l < 1e-3) { nx = x - w.x; ny = y - w.y; l = Math.hypot(nx, ny) || 1; }
    nx /= l; ny /= l;
    const push = r - g + 0.5, into = vx * nx + vy * ny;
    return { x: x + nx * push, y: y + ny * push, vx: into < 0 ? vx - nx * into * 1.3 : vx, vy: into < 0 ? vy - ny * into * 1.3 : vy };
  }
  return null;
}

/** Ausweichrichtung vor einem Wrack: liegt eins in `look` Punkten voraus, seitlich weg (Winkeländerung, rad), sonst 0 */
export function steerAround(wrecks: Wreck[], x: number, y: number, a: number, look: number): number {
  const ex = x + Math.cos(a) * look, ey = y + Math.sin(a) * look;
  const t = coverHit(wrecks, x, y, ex, ey, 18);
  if (t == null) return 0;
  // zur Seite, auf der das Wrack weniger im Weg ist (Mittelpunkt links oder rechts der Flugrichtung)
  const w = wrecks.reduce((b, q) => (Math.hypot(q.x - ex, q.y - ey) < Math.hypot(b.x - ex, b.y - ey) ? q : b));
  const side = Math.sign(Math.cos(a) * (w.y - y) - Math.sin(a) * (w.x - x)) || 1;
  return -side * (1.2 - t) * 1.1;
}

// ---------- Zeichnen mit Licht und Schatten ----------

/** Schattenriss eines Bilds (schwarz, weich), einmal erzeugt; Lichtsaum (warm getönt), einmal erzeugt */
const SIL = new Map<string, HTMLCanvasElement>();
function silhouette(src: string, color: string, blurPx: number): HTMLCanvasElement | null {
  const key = `${src}|${color}|${blurPx}`;
  if (SIL.has(key)) return SIL.get(key)!;
  const i = img(src);
  if (!i || typeof document === 'undefined') return null;
  const S = 512, k = S / Math.max(i.naturalWidth, i.naturalHeight), w = Math.round(i.naturalWidth * k), h = Math.round(i.naturalHeight * k);
  const pad = blurPx * 3;
  const flat = document.createElement('canvas');
  flat.width = w + pad * 2; flat.height = h + pad * 2;
  const f = flat.getContext('2d')!;
  f.drawImage(i, pad, pad, w, h);
  f.globalCompositeOperation = 'source-in';
  f.fillStyle = color;
  f.fillRect(0, 0, flat.width, flat.height);
  let out = flat;
  if (blurPx > 0) {
    out = document.createElement('canvas');
    out.width = flat.width; out.height = flat.height;
    drawBlurred(out.getContext('2d')!, flat, 0, 0, flat.width, flat.height, blurPx);
  }
  SIL.set(key, out);
  return out;
}

/**
 * Zwischenflächen je Wrack: belichtetes Bild (im Bildraum des Wracks) und Schattenkeil (in Weltrichtung). Beide werden nur
 * neu berechnet, wenn sich das Wrack merklich gedreht hat oder die Auflösung eine Stufe wechselt – nicht jedes Bild.
 */
interface WreckCache { lit: HTMLCanvasElement; litRot: number; litPx: number; shade: HTMLCanvasElement | null; shadeRot: number; shadeK: number }
const CACHE = new WeakMap<Wreck, WreckCache>();
/** Schattenkeil: Länge (Anteil der Größe), Öffnung des Trichters */
const SHADE_LEN = 2.2, SHADE_OPEN = 0.45;

/**
 * Wrack zeichnen (im Weltmaßstab). light: Richtung, aus der das Licht kommt (rad, Welt); z: Zoom (für die Auflösung der
 * Belichtung).
 */
export function drawWreck(ctx: CanvasRenderingContext2D, w: Wreck, light: number, z: number): void {
  const src = WRECK_ART[w.art].frames[0], i = img(src);
  const rot = w.rot;
  const lx = Math.cos(light), ly = Math.sin(light);
  if (!i) return;
  const [sw, sh] = dims(w);
  const S = Math.max(sw, sh);
  let c = CACHE.get(w);
  if (!c) { c = { lit: document.createElement('canvas'), litRot: NaN, litPx: 0, shade: null, shadeRot: NaN, shadeK: 0 }; CACHE.set(w, c); }
  // 1. Schattenkeil im Raum: das Wrack verdeckt das Licht, dahinter läuft ein dunkler Streifen vom Licht weg, leicht
  //    auseinander (Trichter), nach hinten weicher und schwächer – in derselben Ebene wie das Wrack, nicht darunter
  const sil = silhouette(src, '#000', 6);
  if (sil) {
    const K = 128 / S; // Schatten ist weich: geringe Auflösung genügt
    if (!c.shade || Math.abs(c.shadeRot - rot) > 0.03 || c.shadeK !== K) {
      const span = S * (SHADE_LEN + 1 + SHADE_OPEN) * 1.1, n = Math.ceil(span * 2 * K);
      const cv = c.shade ?? document.createElement('canvas');
      cv.width = cv.height = n;
      const g = cv.getContext('2d')!;
      g.clearRect(0, 0, n, n);
      const q = (S / 512) * K, N = 28;
      for (let k = N; k >= 1; k--) {
        const u = k / N, sc = 1 + u * SHADE_OPEN;
        g.save();
        g.translate(n / 2 - lx * S * SHADE_LEN * u * K, n / 2 - ly * S * SHADE_LEN * u * K);
        g.rotate(rot);
        g.scale(sc, sc);
        g.globalAlpha = 0.13 * Math.pow(1 - u, 1.2) + 0.015;
        g.drawImage(sil, (-sil.width * q) / 2, (-sil.height * q) / 2, sil.width * q, sil.height * q);
        g.restore();
      }
      c.shade = cv; c.shadeRot = rot; c.shadeK = K;
    }
    const m = c.shade.width / K;
    ctx.drawImage(c.shade, w.x - m / 2, w.y - m / 2, m, m);
  }
  // 2. das Wrack selbst, belichtet: Lichtseite etwas wärmer, abgewandte Seite dunkel; insgesamt in den Ton des Raums
  //    gedämpft, damit es zwischen Staub und Nebel liegt und nicht aufgeklebt wirkt
  const want = Math.min(1400, Math.max(64, Math.ceil(S * z * 2)));
  const px = Math.pow(2, Math.ceil(Math.log2(want) * 2) / 2) | 0; // Stufen (Faktor √2), damit Zoomen nicht ständig neu rechnet
  if (c.litPx !== px || Math.abs(c.litRot - rot) > 0.01) {
    const cv = c.lit;
    cv.width = px; cv.height = px;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const k = px / S;
    g.translate(px / 2, px / 2);
    g.drawImage(i, (-sw / 2) * k, (-sh / 2) * k, sw * k, sh * k);
    const la = light - rot, gx = Math.cos(la) * px * 0.5, gy = Math.sin(la) * px * 0.5;
    const gr = g.createLinearGradient(gx, gy, -gx, -gy);
    gr.addColorStop(0, 'rgba(255,232,205,0.1)');
    gr.addColorStop(0.45, 'rgba(255,232,205,0)');
    gr.addColorStop(0.55, 'rgba(4,6,16,0.05)');
    gr.addColorStop(1, 'rgba(4,6,16,0.55)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = gr;
    g.fillRect(-px / 2, -px / 2, px, px);
    // Dämpfung: etwas dunkler und kühler, wie aus der Entfernung im Restlicht
    g.fillStyle = 'rgba(14,18,34,0.3)';
    g.fillRect(-px / 2, -px / 2, px, px);
    c.litPx = px; c.litRot = rot;
  }
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(rot);
  // Lichtsaum (vor dem Wrack gezeichnet, ragt nur auf der Lichtseite als feine Kante hervor)
  const rim = silhouette(src, '#ffe2bc', 1.5);
  if (rim) {
    const off = Math.max(1, 1.2 / z), q = S / 512, la = light - rot;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(rim, Math.cos(la) * off - (rim.width * q) / 2, Math.sin(la) * off - (rim.height * q) / 2, rim.width * q, rim.height * q);
    ctx.restore();
  }
  // gedreht wird das zwischengespeicherte Bild um den kleinen Rest seit dem letzten Belichten
  ctx.save();
  ctx.rotate(c.litRot - rot);
  ctx.drawImage(c.lit, -S / 2, -S / 2, S, S);
  ctx.restore();
  const s = S;
  if (w.fx) drawWreckLights(ctx, w, s);
  ctx.restore();
  // Einschläge: kurzes Glühen und Funken an der Stelle
  if (w.hits.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const h of w.hits) {
      const a = h.t / 0.25;
      const rg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 12);
      rg.addColorStop(0, `rgba(255,220,170,${0.8 * a})`);
      rg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(h.x, h.y, 12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

/** Einschlag am Wrack merken (Glühen) */
export function markHit(w: Wreck, x: number, y: number): void {
  if (w.hits.length < 24) w.hits.push({ x, y, t: 0.25 });
}
export function updateWrecks(wrecks: Wreck[], dt: number): void {
  emitBudget = 1;
  for (const w of wrecks) {
    if (w.fx) animateWreck(w, w.fx, dt);
    // langsame Eigendrehung (die Trefferform dreht mit)
    w.rot += w.vr * dt;
    for (const h of w.hits) h.t -= dt;
    w.hits = w.hits.filter((h) => h.t > 0);
  }
}

// ---------- Lichtspiel: Glut, Funken, Blitze ----------

/**
 * Leuchten eines Bilds gegenüber dem dunklen Grundbild (nur was dort heller ist, leichte Unterschiede der Bilder
 * herausgefiltert). part 'glut': alles außer den Funken- und Blitzstellen; 'blitz': nur dort.
 */
const EMIT = new Map<string, HTMLCanvasElement | null>();
let emitBudget = 1;
function emission(art: WreckArt, j: number, part: 'glut' | 'blitz'): HTMLCanvasElement | null {
  const key = `${art.frames[j]}|${part}`;
  if (EMIT.has(key)) return EMIT.get(key)!;
  const a = img(art.frames[j]), b = img(art.frames[0]);
  if (!a || !b || typeof document === 'undefined' || emitBudget <= 0) return null;
  emitBudget--; // höchstens eine Berechnung je Bild, damit das Spiel nicht ruckelt
  const W = a.naturalWidth, H = a.naturalHeight;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const ca = mk(), cb = mk(), ga = ca.getContext('2d', { willReadFrequently: true })!, gb = cb.getContext('2d', { willReadFrequently: true })!;
  ga.drawImage(a, 0, 0); gb.drawImage(b, 0, 0);
  const da = ga.getImageData(0, 0, W, H), db = gb.getImageData(0, 0, W, H).data, p = da.data;
  const spots = art.lights.filter((l) => l.kind !== 'glut');
  let any = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const inSpot = spots.some((l) => Math.hypot(x / W - l.x, y / H - l.y) < l.r * 1.5);
    const dr = p[o] - db[o], dg = p[o + 1] - db[o + 1], dbl = p[o + 2] - db[o + 2], d = Math.max(dr, dg, dbl);
    const k = (part === 'blitz') === inSpot ? Math.max(0, Math.min(1, (d - 22) / 50)) : 0;
    if (k > 0) any = true;
    p[o] = Math.max(0, dr) * 1.5 * k; p[o + 1] = Math.max(0, dg) * 1.5 * k; p[o + 2] = Math.max(0, dbl) * 1.5 * k; p[o + 3] = 255 * k;
  }
  if (!any) { EMIT.set(key, null); return null; }
  ga.putImageData(da, 0, 0);
  EMIT.set(key, ca);
  return ca;
}

/** Lichtbogen: gezackte Linie zwischen zwei Punkten, mit kleinen Abzweigen */
function bolt(x0: number, y0: number, x1: number, y1: number, jag: number): number[] {
  const out = [x0, y0], n = 9;
  for (let i = 1; i < n; i++) {
    const t = i / n, nx = -(y1 - y0), ny = x1 - x0, off = (Math.random() - 0.5) * jag;
    out.push(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off);
  }
  out.push(x1, y1);
  return out;
}

function animateWreck(w: Wreck, f: WreckFx, dt: number): void {
  f.t += dt;
  const art = WRECK_ART[w.art];
  if (f.left > 0) {
    f.left -= dt;
    f.flick -= dt;
    if (f.flick <= 0) {
      // neues Aufzucken: Stärke, Blitzbild und Bögen wechseln
      f.flick = 0.03 + Math.random() * 0.06;
      f.k = Math.random() < 0.25 ? 0.15 : 0.55 + Math.random() * 0.45;
      f.frame = 1 + Math.floor(Math.random() * (art.frames.length - 1));
      const l = art.lights[f.light];
      f.bolts = [];
      if (l?.kind === 'blitz') {
        for (let i = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++) {
          const a0 = Math.random() * Math.PI * 2, a1 = a0 + Math.PI * (0.6 + Math.random() * 0.8), r0 = l.r * (0.5 + Math.random() * 0.5);
          f.bolts.push(bolt(l.x + Math.cos(a0) * r0, l.y + Math.sin(a0) * r0, l.x + Math.cos(a1) * l.r * 0.8, l.y + Math.sin(a1) * l.r * 0.8, 0.22));
        }
      } else if (l) {
        // Funke: kurze Strahlen aus der Bruchstelle
        for (let i = 0, n = 4 + Math.floor(Math.random() * 4); i < n; i++) {
          const a = Math.random() * Math.PI * 2, len = l.r * (0.6 + Math.random() * 1.4);
          f.bolts.push([l.x, l.y, l.x + Math.cos(a) * len, l.y + Math.sin(a) * len]);
        }
      }
    }
    if (f.left <= 0) { f.k = 0; f.bolts = []; f.light = -1; }
  } else if (art.lights.some((l) => l.kind !== 'glut')) {
    f.wait -= dt;
    if (f.wait <= 0) {
      const cand = art.lights.map((l, i) => (l.kind !== 'glut' ? i : -1)).filter((i) => i >= 0);
      f.light = cand[Math.floor(Math.random() * cand.length)];
      const blitz = art.lights[f.light].kind === 'blitz';
      f.left = blitz ? 0.25 + Math.random() * 0.55 : 0.12 + Math.random() * 0.2;
      f.flick = 0;
      // Blitze kommen gern in Folgen, Funken unregelmäßig
      f.wait = blitz ? (Math.random() < 0.35 ? 0.3 + Math.random() * 0.5 : 2 + Math.random() * 4) : 1.2 + Math.random() * 3.5;
    }
  }
}

/** Glut (zwischen den Bildern überblendet, flackernd), Lichtschein auf die Umgebung, Funken und Blitze; im Bildraum, S = Bildgröße */
function drawWreckLights(ctx: CanvasRenderingContext2D, w: Wreck, S: number): void {
  const f = w.fx!, art = WRECK_ART[w.art], t = f.t + f.seed;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingQuality = 'high';
  // Glut: jedes leuchtende Bild schwillt in eigenem Takt an und ab, mit leichtem Flackern
  let glow = 0;
  for (let j = 1; j < art.frames.length; j++) {
    const e = Math.pow(Math.max(0, Math.sin(t * (0.45 + 0.23 * j) + j * 2.1)), 2) * (0.82 + 0.18 * Math.sin(t * (11 + j * 3.7)));
    glow = Math.max(glow, e);
    if (e < 0.02) continue;
    const em = emission(art, j, 'glut');
    if (!em) continue;
    ctx.globalAlpha = Math.min(1, e * 0.9);
    ctx.drawImage(em, -S / 2, -S / 2, S, S);
  }
  // warmer Schein der Glutstellen auf Rumpf und Raum
  for (const l of art.lights) {
    if (l.kind !== 'glut') continue;
    const x = (l.x - 0.5) * S, y = (l.y - 0.5) * S, R = l.r * S * 2.6, k = 0.1 + glow * 0.22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(${l.color},${k})`);
    g.addColorStop(1, `rgba(${l.color},0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  }
  // Entladung
  const l = art.lights[f.light];
  if (l && f.k > 0) {
    const em = emission(art, f.frame, 'blitz');
    if (em) { ctx.globalAlpha = f.k; ctx.drawImage(em, -S / 2, -S / 2, S, S); }
    const x = (l.x - 0.5) * S, y = (l.y - 0.5) * S, blitz = l.kind === 'blitz', R = l.r * S * (blitz ? 3.2 : 2.2);
    // Licht der Entladung erhellt das Wrack ringsum
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(${l.color},${(blitz ? 0.42 : 0.5) * f.k})`);
    g.addColorStop(0.35, `rgba(${l.color},${0.14 * f.k})`);
    g.addColorStop(1, `rgba(${l.color},0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    // Bögen bzw. Funkenstrahlen: breiter Schein, heller Kern
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [wd, col] of [[blitz ? S * 0.014 : S * 0.006, `rgba(${l.color},${0.35 * f.k})`], [blitz ? S * 0.0035 : S * 0.002, `rgba(235,245,255,${0.95 * f.k})`]] as const) {
      ctx.lineWidth = wd;
      ctx.strokeStyle = col;
      for (const b of f.bolts) {
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 2) { const px = (b[i] - 0.5) * S, py = (b[i + 1] - 0.5) * S; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Einmaliges Aufleuchten des Umrisses beim Erscheinen (zeigt: das gehört zur Spielebene) – weicher Lichtschein, kein Strich */
export function drawWreckIntro(ctx: CanvasRenderingContext2D, w: Wreck, k: number): void {
  if (k <= 0.01) return;
  const src = WRECK_ART[w.art].frames[0], glow = silhouette(src, '#ffd9a8', 8);
  if (!glow) return;
  const [sw, sh] = dims(w), q = Math.max(sw, sh) / 512;
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(w.rot);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.12 * k;
  ctx.drawImage(glow, -glow.width * q / 2, -glow.height * q / 2, glow.width * q, glow.height * q);
  ctx.restore();
}

// ---------- Gravitationsanomalie ----------

export interface Anomaly { x: number; y: number; R: number; core: number; seed: number }
/** Sog: Beschleunigung (Spielpunkte/s²) am Rand des Kerns, nach außen bis R auf 0 */
export const ANOMALY_PULL = 400;

/** Beschleunigung zum Kern hin für einen Punkt (Faktor k: Schiffe 1, Raketen mehr, Geschosse weniger) */
export function anomalyPull(a: Anomaly, x: number, y: number, k = 1): [number, number] {
  const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy);
  if (d >= a.R || d < 1) return [0, 0];
  // im Kern klingt der Zug ab (kein Hin- und Herreißen in der Mitte – dort wirkt die Schleuder)
  const f = ANOMALY_PULL * k * Math.pow(1 - d / a.R, 1.4) * Math.min(1.8, a.core * 3 / d + 0.45) * Math.min(1, d / a.core);
  return [(dx / d) * f, (dy / d) * f];
}

/**
 * Anomalie zeichnen (Weltmaßstab): dunkler Kern, der das Licht schluckt; leuchtender Ring aus wirbelndem Staub;
 * Lichtbrechung als heller, dünner Ring; Staubfäden, die spiralförmig hineinfließen
 */
export function drawAnomaly(ctx: CanvasRenderingContext2D, a: Anomaly, t: number): void {
  const { x, y, core } = a;
  ctx.save();
  // weiter Sog-Hof: Raum wird zum Kern hin dunkler
  const halo = ctx.createRadialGradient(x, y, core * 0.5, x, y, a.R * 0.55);
  halo.addColorStop(0, 'rgba(0,0,0,0.55)');
  halo.addColorStop(0.5, 'rgba(10,4,20,0.22)');
  halo.addColorStop(1, 'rgba(10,4,20,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, a.R * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  // Staubschleier: weiche, breite Spiralarme, die sich langsam hineindrehen (keine Linien – nur Dunst)
  for (let k = 0; k < 7; k++) {
    const a0 = (k / 7) * Math.PI * 2 + t * 0.3 + a.seed, rMax = a.R * 0.5;
    for (let s = 0; s < 28; s++) {
      const u = s / 28, r = core * 1.3 + (rMax - core * 1.3) * (1 - u), ang = a0 + u * 4.2;
      const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r, rr = 18 + r * 0.16;
      const al = 0.11 * Math.sin(u * Math.PI) * (k % 2 ? 1 : 0.8);
      const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, `rgba(${k % 2 ? '255,150,90' : '170,130,255'},${al})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Akkretionsring: durchgehender Wirbel aus Staub knapp außerhalb des Kerns, ungleichmäßig hell, dreht sich (innen schneller)
  ctx.lineCap = 'butt';
  for (let k = 0; k < 3; k++) {
    const rr = core * (1.3 + k * 0.26), rot = t * (1.1 - k * 0.3) + k * 1.7 + a.seed;
    const rgb = k === 0 ? '255,190,120' : k === 1 ? '240,140,110' : '170,120,255', base = 0.26 - k * 0.07;
    ctx.lineWidth = core * (0.24 - k * 0.05);
    // kreisförmiger Verlauf in einem Zug (keine Nähte); ohne Unterstützung ein gleichmäßiger Ring
    const conic = (ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient;
    if (conic) {
      const gr = conic.call(ctx, rot, x, y);
      for (let j = 0; j <= 36; j++) {
        const a0 = (j / 36) * Math.PI * 2, b = 0.35 + 0.65 * Math.sin(a0 * 3) * Math.sin(a0 * 5 + 1.3);
        gr.addColorStop(j / 36, `rgba(${rgb},${(base * Math.max(0.05, b)).toFixed(3)})`);
      }
      ctx.strokeStyle = gr;
    } else ctx.strokeStyle = `rgba(${rgb},${base * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
  }
  // Gravitationswellen: helle Ringe laufen langsam nach innen und verlöschen am Kern
  for (let j = 0; j < 3; j++) {
    const u = 1 - (((t * 0.22 + j / 3) % 1)), rr = core * 1.4 + (a.R * 0.45 - core * 1.4) * u;
    ctx.strokeStyle = `rgba(200,170,255,${(0.1 * Math.sin(u * Math.PI)).toFixed(3)})`;
    ctx.lineWidth = 3 + u * 14;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
  }
  // Lichtbrechung: dünner, heller Ring um den Kern
  ctx.strokeStyle = 'rgba(255,240,220,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(x, y, core * 1.08, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,180,255,0.18)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(x, y, core * 1.2, 0, Math.PI * 2); ctx.stroke();
  // Kern: schluckt alles Licht
  ctx.globalCompositeOperation = 'source-over';
  const cg = ctx.createRadialGradient(x, y, 0, x, y, core * 1.05);
  cg.addColorStop(0, '#000');
  cg.addColorStop(0.85, '#000');
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(x, y, core * 1.05, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------- Asteroiden-Bilder ----------

/** Anteil der deckenden Fläche eines Bilds (0…1), einmal gemessen – damit ein Brocken so groß gezeichnet wird, wie er trifft */
const FILL = new WeakMap<HTMLImageElement, number>();
export function spriteFill(i: HTMLImageElement): number {
  let v = FILL.get(i);
  if (v != null) return v;
  if (typeof document === 'undefined') return 0.5;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(i, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  let n = 0;
  for (let p = 3; p < d.length; p += 4) n += d[p] / 255;
  v = Math.max(0.1, n / (N * N));
  FILL.set(i, v);
  return v;
}

/** Leuchten der lila Kristalle (nur die Kristallpunkte, weich), einmal erzeugt – pulsiert über dem Bild */
const CRYST = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
export function crystalGlow(i: HTMLImageElement): HTMLCanvasElement | null {
  const got = CRYST.get(i);
  if (got) return got;
  if (typeof document === 'undefined') return null;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(i, 0, 0, N, N);
  const im = g.getImageData(0, 0, N, N), d = im.data;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], gr = d[p + 1], b = d[p + 2];
    // lila: Blau und Rot deutlich über Grün
    const k = Math.max(0, Math.min(1, (Math.min(r, b) - gr - 18) / 50)) * (d[p + 3] / 255);
    d[p] = r * k; d[p + 1] = gr * k * 0.6; d[p + 2] = b * k; d[p + 3] = 255 * k;
  }
  g.putImageData(im, 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = N;
  const og = out.getContext('2d')!;
  drawBlurred(og, c, 0, 0, N, N, 3);
  og.globalCompositeOperation = 'lighter';
  og.drawImage(c, 0, 0);
  CRYST.set(i, out);
  return out;
}
