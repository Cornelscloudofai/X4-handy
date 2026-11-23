// Umgebung als Mitspieler im Kampf: Wrackfeld (Deckung für alle Seiten) und Gravitationsanomalie (Sog, Schaden im Kern).
// Wracks liegen auf der Spielebene: gestochen scharf, mit einer beleuchteten Seite, einem feinen Lichtsaum zur Lichtquelle
// hin und einem echten Schlagschatten, den sie von der Lichtquelle weg in den Raum werfen. Getroffen wird genau dort, wo
// man das Wrack sieht (Form aus dem Bild, siehe hullMask). Geschosse und Strahlen bleiben hängen, Raketen steuern herum.
import { hullGap, hullMaskOf, type HullMask } from './hullMask';
import { drawBlurred } from '../render/canvasFx';
// Platzhalter, bis die eigenen Bilder der Deckungswracks da sind
import wrackBruecke from '../assets/szenen/zhin/wrack-bruecke.webp';
import wrackHeck from '../assets/szenen/zhin/wrack-heck.webp';
import wrackMitte from '../assets/szenen/zhin/wrack-mitte.webp';

/** Bilder der Deckungswracks (Länge im Spiel je Bild: min … max) */
const WRECK_ART: { src: string; min: number; max: number }[] = [
  { src: wrackBruecke, min: 260, max: 380 },
  { src: wrackHeck, min: 240, max: 340 },
  { src: wrackMitte, min: 180, max: 280 },
];

const IMGS = new Map<string, HTMLImageElement>();
function img(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let i = IMGS.get(src);
  if (!i) { i = new Image(); i.decoding = 'async'; i.src = src; IMGS.set(src, i); }
  return i.complete && i.naturalWidth ? i : null;
}
export function preloadCover(): void { for (const a of WRECK_ART) img(a.src); }

export interface Wreck {
  x: number; y: number; rot: number; vr: number;
  /** Größe (längste Seite), Bild */
  size: number; art: number;
  /** Treffer-Aufblitzen am Wrack (Ort und Restzeit) */
  hits: { x: number; y: number; t: number }[];
}

/** Bildgröße eines Wracks in Spielpunkten (Breite, Höhe) */
function dims(w: Wreck): [number, number] {
  const i = img(WRECK_ART[w.art].src);
  if (!i) return [w.size, w.size];
  const k = w.size / Math.max(i.naturalWidth, i.naturalHeight);
  return [i.naturalWidth * k, i.naturalHeight * k];
}
function mask(w: Wreck): HullMask | null {
  const i = img(WRECK_ART[w.art].src);
  return i ? hullMaskOf(i) : null;
}

export function makeWreck(x: number, y: number, r: () => number): Wreck {
  const art = Math.floor(r() * WRECK_ART.length), a = WRECK_ART[art];
  return { x, y, rot: r() * Math.PI * 2, vr: (r() - 0.5) * 0.03, size: a.min + r() * (a.max - a.min), art, hits: [] };
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

/** Zwischenfläche je Wrack für die Beleuchtung (wird jedes Bild neu belichtet) */
const LIT = new WeakMap<Wreck, HTMLCanvasElement>();

/**
 * Wrack zeichnen (im Weltmaßstab). light: Richtung, aus der das Licht kommt (rad, Welt); shadowK: Länge des Schattens als
 * Anteil der Größe; z: Zoom (für die Auflösung der Belichtung).
 */
export function drawWreck(ctx: CanvasRenderingContext2D, w: Wreck, light: number, z: number): void {
  const src = WRECK_ART[w.art].src, i = img(src);
  const rot = w.rot;
  const lx = Math.cos(light), ly = Math.sin(light);
  if (!i) return;
  const [sw, sh] = dims(w);
  // 1. Schlagschatten: Riss vom Licht weg versetzt, weich, deckt den Hintergrund ab
  const sh1 = silhouette(src, '#000', 10);
  if (sh1) {
    const off = w.size * 0.16, q = Math.max(sw, sh) / 512;
    ctx.save();
    ctx.translate(w.x - lx * off, w.y - ly * off);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.62;
    ctx.drawImage(sh1, -sh1.width * q / 2, -sh1.height * q / 2, sh1.width * q, sh1.height * q);
    ctx.restore();
  }
  // 2. Lichtsaum: warm getönter Riss, ein Stück zum Licht hin versetzt – zeigt sich nur als feine Kante auf der Lichtseite
  const rim = silhouette(src, '#ffe2bc', 1.5);
  if (rim) {
    const off = Math.max(1.2, 1.6 / z), q = Math.max(sw, sh) / 512;
    ctx.save();
    ctx.translate(w.x + lx * off, w.y + ly * off);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(rim, -rim.width * q / 2, -rim.height * q / 2, rim.width * q, rim.height * q);
    ctx.restore();
  }
  // 3. das Wrack selbst, belichtet: Lichtseite heller und wärmer, abgewandte Seite dunkel
  const px = Math.min(1400, Math.max(64, Math.ceil(Math.max(sw, sh) * z * 2)));
  let c = LIT.get(w);
  if (!c) { c = document.createElement('canvas'); LIT.set(w, c); }
  if (c.width !== px) { c.width = px; c.height = px; }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, px, px);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const k = px / Math.max(sw, sh);
  g.translate(px / 2, px / 2);
  g.drawImage(i, (-sw / 2) * k, (-sh / 2) * k, sw * k, sh * k);
  // Licht im Bildraum des Wracks (gegen seine Drehung)
  const la = light - rot, gx = Math.cos(la) * px * 0.5, gy = Math.sin(la) * px * 0.5;
  const gr = g.createLinearGradient(gx, gy, -gx, -gy);
  gr.addColorStop(0, 'rgba(255,236,210,0.26)');
  gr.addColorStop(0.45, 'rgba(255,236,210,0)');
  gr.addColorStop(0.6, 'rgba(0,0,12,0)');
  gr.addColorStop(1, 'rgba(0,0,12,0.5)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = gr;
  g.fillRect(-px / 2, -px / 2, px, px);
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(rot);
  const s = Math.max(sw, sh);
  ctx.drawImage(c, -s / 2, -s / 2, s, s);
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
  for (const w of wrecks) {
    // langsame Eigendrehung (die Trefferform dreht mit)
    w.rot += w.vr * dt;
    for (const h of w.hits) h.t -= dt;
    w.hits = w.hits.filter((h) => h.t > 0);
  }
}

/** Einmaliges Aufleuchten des Umrisses beim Erscheinen (zeigt: das gehört zur Spielebene) – weicher Lichtschein, kein Strich */
export function drawWreckIntro(ctx: CanvasRenderingContext2D, w: Wreck, k: number): void {
  if (k <= 0.01) return;
  const src = WRECK_ART[w.art].src, glow = silhouette(src, '#ffd9a8', 8);
  if (!glow) return;
  const [sw, sh] = dims(w), q = Math.max(sw, sh) / 512;
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(w.rot);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * k;
  ctx.drawImage(glow, -glow.width * q / 2, -glow.height * q / 2, glow.width * q, glow.height * q);
  ctx.restore();
}

// ---------- Gravitationsanomalie ----------

export interface Anomaly { x: number; y: number; R: number; core: number; seed: number }
/** Sog: Beschleunigung (Spielpunkte/s²) am Rand des Kerns, nach außen bis R auf 0 */
export const ANOMALY_PULL = 260;

/** Beschleunigung zum Kern hin für einen Punkt (Faktor k: Schiffe 1, Raketen mehr, Geschosse weniger) */
export function anomalyPull(a: Anomaly, x: number, y: number, k = 1): [number, number] {
  const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy);
  if (d >= a.R || d < 1) return [0, 0];
  const f = ANOMALY_PULL * k * Math.pow(1 - d / a.R, 1.6) * Math.min(1.6, a.core * 3 / d + 0.4);
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
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI * 2 + t * 0.25 + a.seed, rMax = a.R * 0.42;
    for (let s = 0; s < 28; s++) {
      const u = s / 28, r = core * 1.3 + (rMax - core * 1.3) * (1 - u), ang = a0 + u * 4.2;
      const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r, rr = 18 + r * 0.16;
      const al = 0.075 * Math.sin(u * Math.PI) * (k % 2 ? 1 : 0.8);
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
