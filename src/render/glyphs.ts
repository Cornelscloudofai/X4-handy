// Warensymbole (SVG-Elemente aus ui/wareIcons.ts) als Canvas-Pfade – für die Module in der Nahansicht.
import { wareGlyph } from '../ui/wareIcons';

interface Part { path: Path2D; fill: boolean }
const cache = new Map<string, Part[]>();

const num = (el: string, name: string, def = 0) => {
  const m = el.match(new RegExp(`\\b${name}="([-\\d.]+)"`));
  return m ? Number(m[1]) : def;
};

/** SVG-Elemente (path, rect, circle, ellipse) in Path2D umwandeln; class="f" = Fläche */
function parse(svg: string): Part[] {
  const out: Part[] = [];
  for (const m of svg.matchAll(/<(path|rect|circle|ellipse)\b([^>]*)\/?>/g)) {
    const [, tag, attrs] = m;
    const fill = /class="f"/.test(attrs);
    let p: Path2D;
    if (tag === 'path') {
      const d = attrs.match(/\bd="([^"]+)"/)?.[1];
      if (!d) continue;
      p = new Path2D(d);
    } else if (tag === 'rect') {
      const x = num(attrs, 'x'), y = num(attrs, 'y'), w = num(attrs, 'width'), h = num(attrs, 'height'), r = Math.min(num(attrs, 'rx'), w / 2, h / 2);
      p = new Path2D();
      p.moveTo(x + r, y);
      p.arcTo(x + w, y, x + w, y + h, r);
      p.arcTo(x + w, y + h, x, y + h, r);
      p.arcTo(x, y + h, x, y, r);
      p.arcTo(x, y, x + w, y, r);
      p.closePath();
    } else if (tag === 'circle') {
      p = new Path2D();
      p.arc(num(attrs, 'cx'), num(attrs, 'cy'), num(attrs, 'r'), 0, Math.PI * 2);
    } else {
      p = new Path2D();
      p.ellipse(num(attrs, 'cx'), num(attrs, 'cy'), num(attrs, 'rx'), num(attrs, 'ry'), 0, 0, Math.PI * 2);
    }
    out.push({ path: p, fill });
  }
  return out;
}

/** Warensymbol zentriert bei (0,0) in der Größe `size` zeichnen (aufrecht, Neon-Stil) */
export function drawWareGlyph(ctx: CanvasRenderingContext2D, id: string, size: number, color: string, alpha = 1): void {
  let parts = cache.get(id);
  if (!parts) cache.set(id, (parts = parse(wareGlyph(id))));
  const k = size / 24;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-12, -12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha *= alpha;
  for (const p of parts) if (p.fill) { ctx.fillStyle = color; ctx.globalAlpha *= 0.35; ctx.fill(p.path); ctx.globalAlpha /= 0.35; }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (const p of parts) ctx.stroke(p.path);
  ctx.restore();
}
