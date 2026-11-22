// Zeichenfilter mit Ersatz für Browser ohne `ctx.filter` (Safari bis iOS 17): Weichzeichnen über stufenweises
// Verkleinern und wieder Vergrößern (mit hochwertiger Bildglättung), Abdunkeln und Tönen über eine Zwischenfläche.
// Wo der Filter geht, wird er wie bisher benutzt – das Ergebnis ist dort unverändert.

type Img = CanvasImageSource & { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
type Ctx = CanvasRenderingContext2D;

let ok: boolean | null = null;

/** Kann dieser Browser `ctx.filter`? Einmal mit einem echten Bildpunkt geprüft (die Eigenschaft allein genügt nicht) */
export function filterSupported(): boolean {
  if (ok != null) return ok;
  ok = false;
  // für Tests: Verhalten wie Safari ohne Filter erzwingen
  if ((globalThis as { __x4NoFilter?: boolean }).__x4NoFilter) return ok;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g || !('filter' in g)) return ok;
    const src = document.createElement('canvas');
    src.width = src.height = 9;
    const s = src.getContext('2d')!;
    s.fillStyle = '#fff';
    s.fillRect(4, 4, 1, 1);
    g.filter = 'blur(2px)';
    g.drawImage(src, 0, 0);
    // weichgezeichnet: der Nachbarpunkt bekommt etwas Licht ab
    ok = g.getImageData(2, 4, 1, 1).data[3] > 0;
  } catch { ok = false; }
  return ok;
}

const sizeOf = (img: Img): [number, number] => {
  const w = (img as HTMLImageElement).naturalWidth || Number(img.width) || 1;
  const h = (img as HTMLImageElement).naturalHeight || Number(img.height) || 1;
  return [w, h];
};

/** Zwischenflächen werden wiederverwendet (gleiche Stufe, gleiche Größe) – manche Stellen zeichnen jedes Bild */
const pool = new Map<string, [HTMLCanvasElement, Ctx]>();
function surface(w: number, h: number, slot = 0): [HTMLCanvasElement, Ctx] {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  const key = `${slot}:${W}x${H}`;
  let e = pool.get(key);
  if (!e) {
    if (pool.size > 48) pool.clear();
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    e = [c, c.getContext('2d')!];
    pool.set(key, e);
  }
  const g = e[1];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return e;
}

/** Weichgezeichnet zeichnen (Radius px in Zielbildpunkten) */
export function drawBlurred(g: Ctx, img: Img, dx: number, dy: number, dw: number, dh: number, px: number): void {
  if (filterSupported()) {
    const f = g.filter;
    g.filter = `blur(${px}px)`;
    g.drawImage(img, dx, dy, dw, dh);
    g.filter = f;
    return;
  }
  // kaum sichtbare Weichzeichnung: einfach zeichnen
  if (px <= 1) { g.drawImage(img, dx, dy, dw, dh); return; }
  // stufenweise halbieren bis etwa auf Zielgröße / Radius, dann in einem Schritt hochwertig vergrößern
  const target = Math.max(1.5, px * 0.9);
  let [w, h] = [Math.abs(dw), Math.abs(dh)];
  let cur: CanvasImageSource = img;
  let [cw, ch] = sizeOf(img);
  let slot = 1;
  const [first, fg] = surface(w, h, slot++);
  fg.drawImage(cur, 0, 0, cw, ch, 0, 0, first.width, first.height);
  cur = first; cw = first.width; ch = first.height;
  for (let k = 2; k <= target * 1.01; k *= 2) {
    w /= 2; h /= 2;
    const [c, cg] = surface(w, h, slot++);
    cg.drawImage(cur, 0, 0, cw, ch, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const smooth = g.imageSmoothingEnabled, q = g.imageSmoothingQuality;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, cw, ch, dx, dy, dw, dh);
  g.imageSmoothingEnabled = smooth;
  g.imageSmoothingQuality = q;
}

/**
 * Abgedunkelt (brightness: 1 = unverändert) und optional eingefärbt zeichnen. Mit Filter wie bisher (`extra` hängt z. B.
 * sepia(...) an); ohne Filter dunkelt eine Zwischenfläche nur die Bildpunkte des Bilds ab und tönt sie in `tint`.
 */
export function drawGraded(g: Ctx, img: Img, dx: number, dy: number, dw: number, dh: number, brightness: number, extra = '', tint?: [string, number]): void {
  if (filterSupported()) {
    const f = g.filter;
    g.filter = `brightness(${brightness.toFixed(3)})${extra ? ' ' + extra : ''}`;
    g.drawImage(img, dx, dy, dw, dh);
    g.filter = f;
    return;
  }
  const [w, h] = sizeOf(img);
  const [c, cg] = surface(w, h, 99);
  cg.drawImage(img, 0, 0);
  cg.globalCompositeOperation = 'source-atop';
  if (tint && tint[1] > 0) { cg.globalAlpha = tint[1]; cg.fillStyle = tint[0]; cg.fillRect(0, 0, c.width, c.height); }
  if (brightness < 1) { cg.globalAlpha = Math.min(1, 1 - brightness); cg.fillStyle = '#000'; cg.fillRect(0, 0, c.width, c.height); }
  g.drawImage(c, dx, dy, dw, dh);
}
