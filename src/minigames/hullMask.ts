// Trefferform eines Schiffs aus seinem Bild: Die sichtbaren Bildpunkte (Deckkraft) bilden die Außenhülle. Daraus wird
// einmal je Bild eine Abstandskarte berechnet (Abstand jeder Zelle zur nächsten Hüllenzelle), dazu Punkte auf dem
// Umriss für Strahlen. So trifft ein Schuss genau dort, wo man die Hülle sieht – bei jedem Schiff, auch bei sehr
// langen oder breiten (Klapperschlange, Dragon, Cobra).

export interface HullMask {
  /** Zellen quer (Bildbreite) und längs (Bildhöhe) */
  w: number;
  h: number;
  /** Abstand jeder Zelle zur Hülle in Zellen (0 = Hülle) */
  dist: Float32Array;
  /** je Zelle die nächste Hüllenzelle (Index y·w + x; -1 = keine Hülle im Bild) – für den genauen Abstand auch außerhalb */
  near: Int32Array;
  /** Umrisspunkte in Anteilen des Bilds (0..1, 0..1) */
  edge: [number, number][];
}

/**
 * Abstandskarte aus einer Deckkraft-Maske (true = Hülle): je Zelle wird die nächste Hüllenzelle weitergereicht
 * (vorwärts und rückwärts über die acht Nachbarn, zwei Runden) und der echte, euklidische Abstand zu ihr gemessen.
 * Eine einfache Fasen-Näherung (1 / √2 je Schritt) gäbe achteckige Abstände – im Nebel sah man das als Kreuz.
 */
export function maskFromSolid(solid: Uint8Array, w: number, h: number): HullMask {
  const n = w * h, near = new Int32Array(n).fill(-1), d2 = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) if (solid[i]) { near[i] = i; d2[i] = 0; }
  const relax = (x: number, y: number, nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const c = near[ny * w + nx];
    if (c < 0) return;
    const cx = c % w, cy = (c - cx) / w, q = (cx - x) ** 2 + (cy - y) ** 2, i = y * w + x;
    if (q < d2[i]) { d2[i] = q; near[i] = c; }
  };
  for (let round = 0; round < 2; round++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!d2[y * w + x]) continue;
      relax(x, y, x - 1, y); relax(x, y, x - 1, y - 1); relax(x, y, x, y - 1); relax(x, y, x + 1, y - 1);
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      if (!d2[y * w + x]) continue;
      relax(x, y, x + 1, y); relax(x, y, x + 1, y + 1); relax(x, y, x, y + 1); relax(x, y, x - 1, y + 1);
    }
  }
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = Number.isFinite(d2[i]) ? Math.sqrt(d2[i]) : 1e9;
  // Umriss: Hüllenzellen mit einem leeren Nachbarn (bzw. am Bildrand), gleichmäßig ausgedünnt auf höchstens 360 Punkte
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i]) continue;
    const open = x === 0 || y === 0 || x === w - 1 || y === h - 1 || d[i - 1] > 0 || d[i + 1] > 0 || d[i - w] > 0 || d[i + w] > 0;
    if (open) edge.push([(x + 0.5) / w, (y + 0.5) / h]);
  }
  const step = Math.max(1, Math.ceil(edge.length / 360));
  return { w, h, dist: d, near, edge: edge.filter((_, k) => k % step === 0) };
}

const cache = new WeakMap<object, HullMask | null>();

/**
 * Maske eines geladenen Bilds (null, solange es nicht geladen ist oder nicht gelesen werden kann). Längste Seite
 * 160 Zellen; Hülle = Deckkraft über 45 % (weiche Ränder und Leuchten zählen nicht).
 */
export function hullMaskOf(img: CanvasImageSource & { width: number; height: number }): HullMask | null {
  if (cache.has(img)) return cache.get(img)!;
  const iw = (img as HTMLImageElement).naturalWidth || img.width, ih = (img as HTMLImageElement).naturalHeight || img.height;
  if (!iw || !ih || typeof document === 'undefined') return null;
  let m: HullMask | null = null;
  try {
    const k = 160 / Math.max(iw, ih), w = Math.max(8, Math.round(iw * k)), h = Math.max(8, Math.round(ih * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) solid[i] = px[i * 4 + 3] > 115 ? 1 : 0;
    m = maskFromSolid(solid, w, h);
  } catch { m = null; }
  cache.set(img, m);
  return m;
}

/**
 * Abstand eines Punkts (im Bild-Raum, Ursprung Bildmitte, Einheiten wie die Zeichengröße sw × sh) zur Hülle; 0 auf
 * der Hülle. Gemessen wird der echte Abstand zur nächsten Hüllenzelle der Zelle unter dem Punkt (außerhalb des Bilds:
 * der Randzelle) – so ist der Abstand in alle Richtungen gleich, ohne Fasen- oder Randfehler.
 */
export function hullGap(m: HullMask, lx: number, ly: number, sw: number, sh: number): number {
  const cx = sw / m.w, cy = sh / m.h;
  const u = (lx + sw / 2) / cx - 0.5, v = (ly + sh / 2) / cy - 0.5;
  const iu = Math.max(0, Math.min(m.w - 1, Math.round(u))), iv = Math.max(0, Math.min(m.h - 1, Math.round(v)));
  const c = m.near[iv * m.w + iu];
  if (c < 0) return 1e9;
  const nx = c % m.w, ny = (c - nx) / m.w;
  // Abstand bis zum Rand der Hüllenzelle (0, wenn der Punkt in ihr liegt)
  const dx = Math.max(0, Math.abs(u - nx) - 0.5) * cx, dy = Math.max(0, Math.abs(v - ny) - 0.5) * cy;
  return Math.hypot(dx, dy);
}
