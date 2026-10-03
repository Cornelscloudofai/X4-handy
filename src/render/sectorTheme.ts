// Aussehen eines Sektors: Hintergrund nach Rohstoffen (Gasnebel, Staubbänder oder gemischt) und Sonne nach Sonnenlicht.
import { FACTIONS, SECTOR_MAP } from '../data/sectors';
import { WARES } from '../data/wares';
import { hashStr } from '../engine/util';
import { fbm, perlin, smooth } from './noise';
import { hexToRgb, isGas, rng } from './sprites';

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

/** Farbe für den Nebel: Neonfarben der Waren gedämpft und in Richtung Weltraumblau gezogen */
function nebulaRgb(hex: string, k: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const base = [10, 20, 36];
  const grey = (r + g + b) / 3;
  // etwas entsättigen, dann zum Hintergrund mischen
  const d = (v: number, i: number) => base[i] + (v * 0.7 + grey * 0.3 - base[i]) * k;
  return [d(r, 0), d(g, 1), d(b, 2)];
}

/**
 * Nebelschicht hinter der Karte (größer als der Bildschirm, für Parallaxe), aus verwirbeltem Rauschen:
 * Gas-Sektoren mit großen leuchtenden Wolken und feinen Filamenten in den Farben ihrer Gase, Gesteins-Sektoren
 * mit bräunlichem Staub und dunklen Wolkenbändern, gemischte mit dezenten Schleiern. Dunkelwolken verdecken
 * Sterne; eine feine Körnung verhindert Farbstufen.
 */
export function nebulaLayer(w: number, h: number, t: SectorTheme, res = 1): HTMLCanvasElement {
  const k = 2.5;
  const sw = Math.ceil(w / k), sh = Math.ceil(h / k);
  const [c0, g0] = canvas(sw, sh);
  const img = g0.createImageData(sw, sh);
  const px = img.data;
  const n1 = perlin(t.seed), n2 = perlin(t.seed + 101), n3 = perlin(t.seed + 202);
  const light = Math.max(0.6, Math.min(1.3, 0.55 + t.sun * 0.45));
  const kind = t.kind;
  const cols = t.colors.map((c, i) => nebulaRgb(c, kind === 'rock' ? 0.85 : i === 0 ? 0.95 : 0.8));
  const c0c = cols[0], c1c = cols[1 % cols.length], c2c = cols[2 % cols.length];
  // Bedeckung und Stärke je Charakter
  const cover = kind === 'gas' ? [0.4, 0.78] : kind === 'mixed' ? [0.47, 0.84] : [0.44, 0.82];
  const glow = (kind === 'gas' ? 0.62 : kind === 'mixed' ? 0.46 : 0.42) * light;
  const dusty = kind === 'rock' ? 0.75 : kind === 'gas' ? 0.45 : 0.4;
  const scale = 2.6 / Math.max(sw, sh);
  const dark = [3, 6, 11];
  const grain = rng(t.seed + 3);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const u = x * scale, v = y * scale;
      // Verwirbelung: Rauschen verschiebt die Koordinaten eines zweiten Rauschens
      const q1 = fbm(n1, u, v, 3), q2 = fbm(n2, u + 5.2, v + 1.3, 3);
      const r = fbm(n3, u + 2.6 * q1, v + 2.6 * q2, 5);
      const dens = smooth(cover[0], cover[1], r);
      // Filamente: Kämme des Rauschens, nur innerhalb der Wolken
      const fr = fbm(n1, u * 2.3 + q2 * 1.5, v * 2.3 + q1 * 1.5, 3);
      const fil = Math.pow(1 - Math.abs(fr * 2 - 1), 6) * dens;
      // Dunkelwolken (Absorption)
      const du = smooth(0.52, 0.74, fbm(n2, u * 1.4 + q1 * 1.2 + 9, v * 1.4 - q2 + 4, 4)) * dusty;
      const mixC = smooth(0.35, 0.7, q1);
      let cr = c0c[0] + (c1c[0] - c0c[0]) * mixC, cg = c0c[1] + (c1c[1] - c0c[1]) * mixC, cb = c0c[2] + (c1c[2] - c0c[2]) * mixC;
      // helle Kerne und Filamente in der dritten Farbe, leicht aufgehellt
      const hi = Math.min(1, fil * 1.4 + dens * dens * 0.25);
      cr += (c2c[0] * 1.25 - cr) * hi * 0.5; cg += (c2c[1] * 1.25 - cg) * hi * 0.5; cb += (c2c[2] * 1.25 - cb) * hi * 0.5;
      const ea = Math.min(1, (dens * 0.75 + fil * 0.6) * glow) * (1 - du * 0.85);
      const da = du * (kind === 'rock' ? 0.8 : 0.6);
      const a = ea + da * (1 - ea);
      const i = (y * sw + x) * 4;
      if (a <= 0.002) { px[i + 3] = 0; continue; }
      px[i] = (cr * ea + dark[0] * da * (1 - ea)) / a;
      px[i + 1] = (cg * ea + dark[1] * da * (1 - ea)) / a;
      px[i + 2] = (cb * ea + dark[2] * da * (1 - ea)) / a;
      // feine Körnung gegen Farbstufen
      px[i + 3] = a * 255 + (grain() - 0.5) * 2;
    }
  }
  g0.putImageData(img, 0, 0);
  // Ausgabe in Geräteauflösung (res), leicht weichgezeichnet: glättet die Kanten der vergrößerten Pixel
  const [c, ctx] = canvas(w * res, h * res);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const b = k * res;
  ctx.filter = `blur(${b * 0.6}px)`;
  ctx.drawImage(c0, -b, -b, c.width + 2 * b, c.height + 2 * b);
  ctx.filter = 'none';
  return c;
}

/** Sterndichte und Helligkeit des Grundhimmels je Charakter */
export function starFactor(t: SectorTheme): number {
  return t.kind === 'gas' ? 0.75 : t.kind === 'rock' ? 1.2 : 1;
}

/**
 * Sonne am Rand der Karte, fest in den Hintergrund gemalt (so fern, dass sie sich beim Verschieben nicht bewegt):
 * kleiner heller Kern mit weichem Hof, ohne Strahlen. Größe und Helligkeit folgen dem Sonnenlicht
 * (60 % = matt und klein, 140 % = groß und hell).
 */
export function paintSun(ctx: CanvasRenderingContext2D, W: number, H: number, t: SectorTheme): void {
  if (t.sun <= 0) return;
  const m = Math.max(W, H);
  const x = W / 2 + Math.cos(t.sunAngle) * W * 0.43, y = H / 2 + Math.sin(t.sunAngle) * H * 0.36;
  const s = t.sun;
  const [r, g, b] = hexToRgb(t.sunColor);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Weiter, sehr blasser Lichthof (Streulicht)
  const halo = m * (0.3 + 0.25 * s);
  const hg = ctx.createRadialGradient(x, y, 0, x, y, halo);
  hg.addColorStop(0, `rgba(${r},${g},${b},${0.13 * s})`);
  hg.addColorStop(0.15, `rgba(${r},${g},${b},${0.05 * s})`);
  hg.addColorStop(0.5, `rgba(${r},${g},${b},${0.015 * s})`);
  hg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, H);
  // Kern
  const core = 3 + 4 * s;
  const cg = ctx.createRadialGradient(x, y, 0, x, y, core * 4);
  cg.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.85 * s)})`);
  cg.addColorStop(0.18, `rgba(255,250,235,${Math.min(1, 0.6 * s)})`);
  cg.addColorStop(0.45, `rgba(${r},${g},${b},${0.18 * s})`);
  cg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(x, y, core * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
