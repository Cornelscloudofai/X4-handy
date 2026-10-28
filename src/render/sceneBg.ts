// Sektorhintergrund aus mehreren Bildebenen (src/assets/szenen/<sektor>/*.webp, aufbereitet mit scripts/import-scene.mjs)
// plus gezeichneten Effekten: Sterne, Nebel, Sonne mit Korona und Strahlen, Plasmaschleier, Funken, Asteroiden im
// Vordergrund. Jede Ebene hat ihre Tiefe – beim Verschieben der Karte gleiten nahe Ebenen weiter als ferne.
// Die Anordnung richtet sich nach dem Bildschirm (nicht nach einem festen 16:9-Bild): Im Hochformat wird der Nebel
// gedreht, Sonne und Felsen liegen an den Rändern, die Mitte bleibt ruhig für die Karte.

const FILES = import.meta.glob('../assets/szenen/*/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URLS: Record<string, Record<string, string>> = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = path.match(/szenen\/([^/]+)\/([^/]+)\.webp$/);
  if (m) (URLS[m[1]] ??= {})[m[2]] = url;
}

/** Ein Felsen im Vordergrund: Lage in Bildschirmanteilen, Größe relativ zur kürzeren Seite */
interface Rock { img: string; x: number; y: number; size: number; depth: number; rot: number; spin: number; dark: number }

interface Scene {
  /** Sonne: Mittelpunkt (Bildschirmanteile, hoch/quer), Durchmesser relativ zur kürzeren Seite, Lage der Scheibe im Bild */
  sun: { portrait: [number, number]; landscape: [number, number]; size: number; disc: number; color: string };
  /** Plasma: Ursprung im Bild (Anteile) liegt auf der Sonne; Breite relativ zur längeren Seite; Drehung je Format */
  plasma: { origin: [number, number]; width: number; rotPortrait: number; rotLandscape: number };
  rocks: Rock[];
  /** Farbton für Funken, Strahlen und Vignette */
  ember: string;
}

const SCENES: Record<string, Scene> = {
  'f-glut1': {
    sun: { portrait: [0.9, 0.2], landscape: [0.93, 0.18], size: 0.7, disc: 0.64, color: '255,170,80' },
    plasma: { origin: [0.985, 0.03], width: 1.05, rotPortrait: 0.62, rotLandscape: 0.05 },
    rocks: [
      { img: 'fels-b', x: 0.0, y: 0.8, size: 0.46, depth: 1.35, rot: 0.4, spin: 0.006, dark: 0.15 },
      { img: 'fels-a', x: 1.02, y: 0.72, size: 0.4, depth: 1.2, rot: -0.3, spin: -0.008, dark: 0.1 },
      { img: 'fels-a', x: 0.3, y: 0.86, size: 0.05, depth: 0.75, rot: 0.2, spin: 0.03, dark: 0.45 },
      { img: 'fels-b', x: 0.58, y: 0.9, size: 0.035, depth: 0.7, rot: 1.2, spin: -0.025, dark: 0.55 },
      { img: 'fels-a', x: 0.93, y: 0.5, size: 0.045, depth: 0.8, rot: 2.1, spin: 0.02, dark: 0.45 },
      { img: 'fels-a', x: 0.16, y: 0.68, size: 0.13, depth: 0.85, rot: 1.6, spin: 0.012, dark: 0.35 },
      { img: 'fels-b', x: 0.86, y: 0.97, size: 0.2, depth: 1.05, rot: 2.2, spin: -0.01, dark: 0.25 },
      { img: 'fels-b', x: 0.72, y: 0.62, size: 0.07, depth: 0.7, rot: 0.9, spin: 0.02, dark: 0.5 },
      { img: 'fels-a', x: 0.06, y: 0.46, size: 0.06, depth: 0.65, rot: 2.8, spin: -0.02, dark: 0.55 },
    ],
    ember: '255,150,70',
  },
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

// Feine Funkelsterne und Funken: einmal je Sektor ausgewürfelt
interface Spark { x: number; y: number; r: number; a: number; tw: number; ph: number }
const starsCache = new Map<string, Spark[]>();
function sparks(sectorId: string): Spark[] {
  let s = starsCache.get(sectorId);
  if (s) return s;
  let seed = 11;
  for (const ch of sectorId) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  s = Array.from({ length: 140 }, () => ({ x: R(), y: R(), r: 0.4 + R() * 1.1, a: 0.25 + R() * 0.6, tw: 0.4 + R() * 1.6, ph: R() * 6.28 }));
  starsCache.set(sectorId, s);
  return s;
}

/**
 * Szene zeichnen. fx/fz: Kameralage −1…1 (Parallaxe), t: Zeit in Sekunden. Liefert false, solange Ebenen laden.
 */
export function drawScene(ctx: CanvasRenderingContext2D, sectorId: string, W: number, H: number, fx: number, fz: number, t: number): boolean {
  const sc = SCENES[sectorId];
  const L = ready(sectorId);
  ctx.fillStyle = '#050204';
  ctx.fillRect(0, 0, W, H);
  if (!sc || !L) return false;
  const portrait = H > W;
  const S = Math.max(W, H), s = Math.min(W, H);
  const pan = (depth: number): [number, number] => [-fx * depth * S * 0.06, -fz * depth * S * 0.06];
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Ganzflächige Ebenen (im Hochformat gedreht): Bild bedeckt den Bildschirm samt Spielraum für die Parallaxe
  const cover = (img: HTMLImageElement, depth: number, extra: number, alpha = 1, op: GlobalCompositeOperation = 'source-over') => {
    const [px, py] = pan(depth);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const rw = portrait ? ih : iw, rh = portrait ? iw : ih;
    const k = Math.max(W / rw, H / rh) * extra;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = op;
    ctx.translate(W / 2 + px, H / 2 + py);
    if (portrait) ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    ctx.restore();
  };
  if (L.sterne) cover(L.sterne, 0.12, 1.12);
  // Funkelnde Sterne
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const [spx, spy] = pan(0.25);
  for (const st of sparks(sectorId)) {
    const a = st.a * (0.55 + 0.45 * Math.sin(t * st.tw + st.ph));
    const x = ((st.x * W + spx) % W + W) % W, y = ((st.y * H + spy) % H + H) % H;
    ctx.fillStyle = `rgba(255,${200 + Math.round(st.r * 30)},${170 + Math.round(st.r * 40)},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Nebel: atmet langsam
  if (L.nebel) cover(L.nebel, 0.3, 1.16, 0.88 + 0.08 * Math.sin(t * 0.21));

  // Sonne
  const [sx0, sy0] = portrait ? sc.sun.portrait : sc.sun.landscape;
  const [spx2, spy2] = pan(0.45);
  const sx = sx0 * W + spx2, sy = sy0 * H + spy2;
  const size = sc.sun.size * s * (portrait ? 1 : 0.85);
  const discR = (size * sc.sun.disc) / 2;
  const pulse = 1 + 0.03 * Math.sin(t * 0.9) + 0.015 * Math.sin(t * 2.3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // weites Glühen
  const halo = ctx.createRadialGradient(sx, sy, discR * 0.6, sx, sy, discR * 5.5 * pulse);
  halo.addColorStop(0, `rgba(${sc.sun.color},0.55)`);
  halo.addColorStop(0.25, `rgba(${sc.sun.color},0.22)`);
  halo.addColorStop(1, `rgba(${sc.sun.color},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(sx - discR * 6, sy - discR * 6, discR * 12, discR * 12);
  // Strahlen, die sich langsam drehen
  ctx.translate(sx, sy);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + t * 0.012 + Math.sin(i * 7.3) * 0.2;
    const len = discR * (2.6 + 1.6 * Math.abs(Math.sin(i * 3.1 + t * 0.15)));
    const w = discR * (0.05 + 0.05 * Math.abs(Math.sin(i * 1.7)));
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, `rgba(${sc.sun.color},0.09)`);
    g.addColorStop(1, `rgba(${sc.sun.color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Plasmaschleier aus der Sonne (flackernd)
  if (L.plasma) {
    const img = L.plasma;
    const pw = sc.plasma.width * S * (portrait ? 0.72 : 0.75);
    const ph = (pw * img.naturalHeight) / img.naturalWidth;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 + 0.15 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.7);
    ctx.translate(sx, sy);
    ctx.rotate((portrait ? sc.plasma.rotPortrait : sc.plasma.rotLandscape) + 0.02 * Math.sin(t * 0.4));
    ctx.drawImage(img, -sc.plasma.origin[0] * pw, -sc.plasma.origin[1] * ph, pw, ph);
    ctx.restore();
  }
  // Sonnenscheibe, dreht sich sehr langsam
  if (L.sonne) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.004);
    const k = pulse * 0.995;
    ctx.drawImage(L.sonne, (-size * k) / 2, (-size * k) / 2, size * k, size * k);
    ctx.restore();
    // heller Kern darüber
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, discR * 1.15);
    core.addColorStop(0, 'rgba(255,240,210,0.35)');
    core.addColorStop(0.7, 'rgba(255,200,120,0.1)');
    core.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = core;
    ctx.fillRect(sx - discR * 1.2, sy - discR * 1.2, discR * 2.4, discR * 2.4);
    ctx.restore();
  }
  // Funken, die von der Sonne fortgetragen werden
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const [epx, epy] = pan(0.9);
  for (let i = 0; i < 60; i++) {
    const life = ((t * (0.025 + (i % 7) * 0.004) + i * 0.137) % 1);
    const ang = (portrait ? 2.25 : 2.9) + Math.sin(i * 12.9) * 0.55;
    const dist = (0.1 + life * 1.1) * S * 0.75;
    const x = sx + Math.cos(ang) * dist + Math.sin(t * 0.5 + i) * 6 + epx;
    const y = sy + Math.sin(ang) * dist + Math.cos(t * 0.4 + i) * 6 + epy;
    const a = Math.sin(life * Math.PI) * (0.35 + 0.4 * ((i * 37) % 10) / 10);
    const r = 0.6 + ((i * 53) % 10) / 10 * 1.4;
    ctx.fillStyle = `rgba(${sc.ember},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Felsen im Vordergrund: von der Sonne her beleuchtet, entfernte dunkler
  for (const r of sc.rocks) {
    const img = L[r.img];
    if (!img) continue;
    const [px, py] = pan(r.depth);
    const size2 = r.size * s * (portrait ? 1 : 0.8);
    const bob = Math.sin(t * 0.3 + r.x * 9) * size2 * 0.015;
    ctx.save();
    ctx.translate(r.x * W + px, r.y * H + py + bob);
    ctx.rotate(r.rot + t * r.spin);
    if (r.dark > 0) ctx.filter = `brightness(${(1 - r.dark).toFixed(2)})`;
    ctx.drawImage(img, -size2 / 2, -size2 / 2, size2, size2);
    ctx.restore();
  }
  // Vignette und warmer Schleier am Rand: lenkt den Blick in die Mitte
  const vg = ctx.createRadialGradient(W / 2, H / 2, s * 0.35, W / 2, H / 2, S * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,2,2,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  return true;
}
