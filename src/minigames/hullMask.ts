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
  /** Umrisspunkte in Anteilen des Bilds (0..1, 0..1) */
  edge: [number, number][];
}

/** Abstandskarte aus einer Deckkraft-Maske (true = Hülle), zweistufige Fase 3-4 (nahe am echten Abstand) */
export function maskFromSolid(solid: Uint8Array, w: number, h: number): HullMask {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = solid[i] ? 0 : INF;
  const D1 = 1, D2 = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + D1);
    if (y > 0) {
      v = Math.min(v, d[i - w] + D1);
      if (x > 0) v = Math.min(v, d[i - w - 1] + D2);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + D2);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + D1);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + D1);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + D2);
      if (x > 0) v = Math.min(v, d[i + w - 1] + D2);
    }
    d[i] = v;
  }
  // Umriss: Hüllenzellen mit einem leeren Nachbarn (bzw. am Bildrand), gleichmäßig ausgedünnt auf höchstens 360 Punkte
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i]) continue;
    const open = x === 0 || y === 0 || x === w - 1 || y === h - 1 || d[i - 1] > 0 || d[i + 1] > 0 || d[i - w] > 0 || d[i + w] > 0;
    if (open) edge.push([(x + 0.5) / w, (y + 0.5) / h]);
  }
  const step = Math.max(1, Math.ceil(edge.length / 360));
  return { w, h, dist: d, edge: edge.filter((_, k) => k % step === 0) };
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
 * Abstand eines Punkts (im Bild-Raum, Ursprung Bildmitte, Einheiten wie die Zeichengröße sw × sh) zur Hülle;
 * 0 innerhalb. Außerhalb des Bilds zählt der Abstand zum Bildrand dazu.
 */
export function hullGap(m: HullMask, lx: number, ly: number, sw: number, sh: number): number {
  const cx = sw / m.w, cy = sh / m.h, cell = (cx + cy) / 2;
  const u = (lx + sw / 2) / cx - 0.5, v = (ly + sh / 2) / cy - 0.5;
  const iu = Math.max(0, Math.min(m.w - 1, Math.round(u))), iv = Math.max(0, Math.min(m.h - 1, Math.round(v)));
  // nur außerhalb des Bilds: Abstand bis zum Bildrand
  const du = Math.max(0, -0.5 - u, u - (m.w - 0.5)), dv = Math.max(0, -0.5 - v, v - (m.h - 0.5));
  const out = Math.hypot(du * cx, dv * cy);
  const inGrid = m.dist[iv * m.w + iu] * cell;
  // eine halbe Zelle Spielraum: Hüllenzellen reichen bis an ihren Rand
  return Math.max(0, inGrid + out - cell * 0.5);
}
