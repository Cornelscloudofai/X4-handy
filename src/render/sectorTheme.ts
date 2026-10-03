// Aussehen eines Sektors: Hintergrund nach Rohstoffen (Gasnebel, Staubbänder oder gemischt) und Sonne nach Sonnenlicht.
import { FACTIONS, SECTOR_MAP } from '../data/sectors';
import { WARES } from '../data/wares';
import { hashStr } from '../engine/util';
import { hexToRgb, isGas, rgba, rng } from './sprites';

export type ThemeKind = 'gas' | 'rock' | 'mixed';

export interface SectorTheme {
  kind: ThemeKind;
  /** Nebelfarben (Gase des Sektors bzw. Fraktionstönung) */
  colors: string[];
  /** Sonnenlicht relativ (1 = 100 %) */
  sun: number;
  sunColor: string;
  /** Richtung der Sonne (Bildschirmwinkel) */
  sunAngle: number;
  seed: number;
}

const TINT: Record<string, [string, string]> = {
  zhin: ['#1f5f8a', '#0e6f66'],
  tkr: ['#7a4a22', '#3b3f6d'],
  cascade: ['#1d6f9c', '#35a07f'],
  ravine: ['#5b2c6f', '#2b3f66'],
  rhy: ['#8a2f2f', '#4a2d5e'],
  hoa: ['#2a5e7a', '#2f7a5a'],
  zyarth: ['#7a2f4a', '#8a5a22'],
};

const themes = new Map<string, SectorTheme>();
/** Sonnenpositionen seitlich bzw. schräg unten – nicht hinter der Kopfleiste */
const SUN_SPOTS = [-2.5, -0.64, 0.45, 2.7, 0.0, Math.PI];

export function sectorTheme(id: string): SectorTheme {
  const hit = themes.get(id);
  if (hit) return hit;
  const sec = SECTOR_MAP[id];
  const seed = hashStr(id + ':theme');
  const tint = TINT[id] ?? ['#1f5f8a', '#0e6f66'];
  let theme: SectorTheme;
  if (!sec) theme = { kind: 'mixed', colors: tint, sun: 0, sunColor: '#ffe2a8', sunAngle: 0, seed };
  else {
    // Anteil der Gasfelder an der Feldfläche bestimmt den Charakter
    let gas = 0, all = 0;
    for (const f of sec.fields) {
      const a = f.r * f.r * f.richness;
      all += a;
      if (isGas(f.ware)) gas += a;
    }
    const share = all ? gas / all : 0;
    const kind: ThemeKind = share > 0.6 ? 'gas' : share < 0.25 ? 'rock' : 'mixed';
    const gasColors = [...new Set(sec.fields.filter((f) => isGas(f.ware)).map((f) => WARES[f.ware].color))];
    const colors = kind === 'gas' ? [...gasColors, tint[0]] : kind === 'rock' ? ['#6b5a48', '#3d4658', tint[0]] : [tint[0], tint[1], ...gasColors.slice(0, 1)];
    const r = rng(seed);
    const warm = sec.faction === 'zya' ? r() < 0.75 : r() < 0.45;
    theme = { kind, colors, sun: sec.sunlight / 100, sunColor: warm ? '#ffd9a0' : '#d6ecff', sunAngle: SUN_SPOTS[Math.floor(r() * SUN_SPOTS.length)] + (r() - 0.5) * 0.35, seed };
    if (sec.faction === 'zya' && kind !== 'gas') theme.colors.push(FACTIONS.zya.color);
  }
  themes.set(id, theme);
  return theme;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, rot: number, squash: number, color: string, a: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.55, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Nebelschicht hinter der Karte (größer als der Bildschirm, für Parallaxe). Klein gezeichnet und weich
 * hochskaliert. Gas-Sektoren: großflächige farbige Gasschleier. Gesteins-Sektoren: dunkle Staubbänder mit
 * fernen Brocken. Gemischt: dezente Fraktionstönung.
 */
export function nebulaLayer(w: number, h: number, t: SectorTheme): HTMLCanvasElement {
  const k = 4;
  const sw = Math.ceil(w / k), sh = Math.ceil(h / k);
  const [c0, g] = canvas(sw, sh);
  const r = rng(t.seed);
  const light = Math.max(0.55, Math.min(1.35, 0.5 + t.sun * 0.5));
  g.globalCompositeOperation = 'lighter';
  if (t.kind === 'gas') {
    // Große Gasbänder quer über den Himmel, mehrere Farben übereinander
    const bands = 3 + Math.floor(r() * 2);
    for (let b = 0; b < bands; b++) {
      const col = t.colors[b % t.colors.length];
      const ang = r() * Math.PI;
      const cx = sw * (0.15 + r() * 0.7), cy = sh * (0.15 + r() * 0.7);
      for (let i = 0; i < 26; i++) {
        const d = (r() - 0.5) * Math.max(sw, sh) * 1.1;
        const x = cx + Math.cos(ang) * d + (r() - 0.5) * sw * 0.18, y = cy + Math.sin(ang) * d + (r() - 0.5) * sh * 0.12;
        blob(g, x, y, Math.max(sw, sh) * (0.08 + r() * 0.16), ang + (r() - 0.5) * 0.6, 0.3 + r() * 0.4, col, (0.05 + r() * 0.05) * light);
      }
    }
  } else if (t.kind === 'rock') {
    // Matter Staub, im Sonnenlicht schwach rötlich-grau
    for (let i = 0; i < 18; i++) blob(g, r() * sw, r() * sh, Math.max(sw, sh) * (0.12 + r() * 0.2), r() * Math.PI, 0.25 + r() * 0.35, t.colors[i % t.colors.length], (0.035 + r() * 0.035) * light);
  } else {
    for (let i = 0; i < 16; i++) blob(g, r() * sw, r() * sh, Math.max(sw, sh) * (0.1 + r() * 0.2), r() * Math.PI, 0.4 + r() * 0.5, t.colors[i % t.colors.length], (0.04 + r() * 0.04) * light);
  }
  g.globalCompositeOperation = 'source-over';
  if (t.kind === 'rock') {
    // Dunkle Staubbänder verdecken Sterne und Nebel
    g.globalCompositeOperation = 'destination-out';
    const ang = r() * Math.PI;
    for (let i = 0; i < 14; i++) {
      const d = (r() - 0.5) * Math.max(sw, sh);
      blob(g, sw / 2 + Math.cos(ang) * d, sh / 2 + Math.sin(ang) * d, Math.max(sw, sh) * (0.1 + r() * 0.12), ang, 0.25, '#000000', 0.5);
    }
    g.globalCompositeOperation = 'source-over';
  } else {
    // Lücken: der Nebel bekommt Struktur
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) blob(g, r() * sw, r() * sh, Math.max(sw, sh) * (0.04 + r() * 0.08), r() * Math.PI, 0.4 + r() * 0.4, '#000000', 0.35);
    g.globalCompositeOperation = 'source-over';
  }
  const [c, ctx] = canvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c0, 0, 0, w, h);
  if (t.kind === 'rock') {
    // Ferne Brocken als Silhouetten mit Lichtkante zur Sonne
    const sx = Math.cos(t.sunAngle), sy = Math.sin(t.sunAngle);
    const n = Math.round((w * h) / 9000);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rad = 0.6 + Math.pow(r(), 3) * 3.2;
      ctx.fillStyle = 'rgba(8,10,14,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (rad > 1.4) {
        ctx.strokeStyle = rgba(t.sunColor, 0.25 * light);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const a = Math.atan2(sy, sx);
        ctx.arc(x, y, rad, a - 1, a + 1);
        ctx.stroke();
      }
    }
  }
  return c;
}

/** Sterndichte und Helligkeit des Grundhimmels je Charakter */
export function starFactor(t: SectorTheme): number {
  return t.kind === 'gas' ? 0.6 : t.kind === 'rock' ? 1.2 : 1;
}

/**
 * Sonne am Rand der Karte: Kern, Hof und feine Strahlen, fest in den Hintergrund gemalt (die Sonne ist so fern,
 * dass sie sich beim Verschieben nicht bewegt). Helligkeit folgt dem Sonnenlicht (60 % = matt und klein,
 * 140 % = groß und gleißend).
 */
export function paintSun(ctx: CanvasRenderingContext2D, W: number, H: number, t: SectorTheme): void {
  if (t.sun <= 0) return;
  const m = Math.max(W, H);
  const x = W / 2 + Math.cos(t.sunAngle) * W * 0.43, y = H / 2 + Math.sin(t.sunAngle) * H * 0.36;
  const s = t.sun;
  const [r, g, b] = hexToRgb(t.sunColor);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = m * (0.35 + 0.35 * s);
  const hg = ctx.createRadialGradient(x, y, 0, x, y, halo);
  hg.addColorStop(0, `rgba(${r},${g},${b},${0.2 * s})`);
  hg.addColorStop(0.25, `rgba(${r},${g},${b},${0.07 * s})`);
  hg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, H);
  // Strahlen: wenige lange, sehr blasse Keile
  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3 + t.seed % 7;
    const len = halo * (0.8 + 0.5 * Math.abs(Math.sin(i * 3.1)));
    const wdt = 0.025 + 0.02 * Math.abs(Math.cos(i * 1.7));
    const rg = ctx.createRadialGradient(x, y, 0, x, y, len);
    rg.addColorStop(0, `rgba(${r},${g},${b},${0.045 * s})`);
    rg.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, len, a - wdt, a + wdt);
    ctx.closePath();
    ctx.fill();
  }
  const core = 6 + 10 * s;
  const cg = ctx.createRadialGradient(x, y, 0, x, y, core * 2.2);
  cg.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.7 * s)})`);
  cg.addColorStop(0.35, `rgba(${r},${g},${b},${0.5 * s})`);
  cg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(x, y, core * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
