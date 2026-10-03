// Aussehen eines Sektors: jeder Sektor hat ein eigenes Himmelsmotiv nach dem Vorbild echter Astrofotos
// (Emissionsnebel mit farbigen Rändern, Ringnebel, leuchtende Wände mit Dunkelwolken, Faserwolken, Galaxien)
// und eine Sonne nach seinem Sonnenlicht.
import { SECTOR_MAP } from '../data/sectors';
import { hashStr } from '../engine/util';
import { fbm, perlin, smooth } from './noise';
import { hexToRgb, rgba, rng } from './sprites';

/**
 * Grundform des Nebels: marble = großflächige Marmorierung über den ganzen Himmel, zwei Farben ineinander
 * verwirbelt, shell = gefüllte Wolke mit leuchtendem Rand (Herz-, Seelennebel), ring = Ring mit leerem
 * Zentrum (Rosette), wall = leuchtende Wand mit scharfer Kante (Pferdekopf), wisps = Fasern über den ganzen
 * Himmel (Flammenstern), cloud = kompakte Wolke in Staub (Orion), none = klarer Himmel (Galaxien).
 */
export type Shape = 'marble' | 'shell' | 'ring' | 'wall' | 'wisps' | 'cloud' | 'none';

export interface Galaxy {
  /** Lage relativ zur Nebelebene (0 … 1) */
  x: number; y: number;
  /** Größe relativ zur längeren Kante */
  size: number;
  angle: number;
  /** Neigung: 1 = von oben, 0,15 = fast von der Kante */
  tilt: number;
  kind: 'spiral' | 'edge';
}

export interface Scene {
  /** Motiv (Vorbild) */
  name: string;
  shape: Shape;
  /** Mittelpunkt (0 … 1), Halbachsen relativ zur längeren Kante, Drehung */
  cx: number; cy: number; rx: number; ry: number; angle: number;
  /** Innenfarbe, Randfarbe, Glanzlichter */
  core: string; rim: string; hi: string;
  /** Diffuser Schleier über den ganzen Himmel */
  haze: string; hazeA: number;
  /** Leuchtkraft, Schwelle (kleiner = mehr Nebel), Randfärbung, Dunkelwolken, Filamente */
  glow: number; cover: number; edge: number; dust: number; fil: number;
  /** Anzahl dunkler Globulen (kleine Dunkelwolken) */
  globules: number;
  /** Helle Sterne im Zentrum (junger Sternhaufen) */
  cluster: number;
  /** Zusätzliche Wolke in eigener Farbe */
  extra?: { x: number; y: number; r: number; color: string };
  galaxies?: Galaxy[];
  /** Sterndichte, Anteil orangefarbener Sterne */
  stars: number; warm: number;
  /** Größe der Muster (Rauschfrequenz, kleiner = großflächiger) und Stärke der Verwirbelung */
  scale?: number; warp?: number;
  /** Gesamtstärke des Nebels (Standard 0,45 = dezent; nur der gasreichste Sektor deutlich heller) */
  intensity?: number;
}

/** Ein Motiv je Sektor – jeder Sektor ist ein eigener Anblick */
export const SCENES: Record<string, Scene> = {
  // Blau-Gold (Schmalband-Farben): großflächig marmoriert, goldene Säume an den Wolkenrändern
  zhin: { name: 'Blau-Gold-Marmor', shape: 'marble', cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4, angle: 0, core: '#3d74c4', rim: '#c8863c', hi: '#cfe6ff', haze: '#2a1c12', hazeA: 0.03, glow: 0.62, cover: 0.42, edge: 0.7, dust: 0.5, fil: 0.55, globules: 6, cluster: 0, stars: 1.1, warm: 0.2, scale: 2.6, warp: 2.6 },
  // Galaxienfeld: klarer, sternreicher Himmel mit einer Spiralgalaxie und einer Kantengalaxie
  tkr: { name: 'Galaxienpaar', shape: 'none', cx: 0.5, cy: 0.5, rx: 0.24, ry: 0.24, angle: 0, core: '#5a4a3a', rim: '#6a5a48', hi: '#d8c8b8', haze: '#3a3024', hazeA: 0.035, glow: 0, cover: 1, edge: 0, dust: 0.3, fil: 0, globules: 0, cluster: 0,
    galaxies: [{ x: 0.66, y: 0.36, size: 0.111, angle: -0.55, tilt: 0.46, kind: 'spiral' }, { x: 0.24, y: 0.58, size: 0.065, angle: 1.05, tilt: 0.17, kind: 'edge' }, { x: 0.82, y: 0.83, size: 0.023, angle: 0.3, tilt: 0.6, kind: 'spiral' }],
    stars: 1.6, warm: 0.5 },
  // Türkis und Grüngold (Farben des Rosettennebels): sehr großflächig, stark verwirbelt – der Gas-Sektor
  cascade: { name: 'Türkis-Marmor', shape: 'marble', cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4, angle: 0, core: '#2e9c94', rim: '#a4a83c', hi: '#a8f0e0', haze: '#0c2c2a', hazeA: 0.035, glow: 0.56, cover: 0.42, edge: 0.6, dust: 0.5, fil: 0.7, globules: 10, cluster: 0, stars: 1, warm: 0.15, scale: 2.1, warp: 3.4, intensity: 0.8 },
  // Pferdekopfnebel: leuchtende rote Wand mit scharfer Kante, darunter Dunkelwolke, Silhouette auf der Kante
  ravine: { name: 'Pferdekopfnebel', shape: 'wall', cx: 0.5, cy: 0.56, rx: 0.3, ry: 0.2, angle: -0.12, core: '#b8405a', rim: '#f490aa', hi: '#ffd6e0', haze: '#3a1420', hazeA: 0.08, glow: 0.95, cover: 0.4, edge: 1.1, dust: 0.55, fil: 0.8, globules: 4, cluster: 0, stars: 0.9, warm: 0.55 },
  // Flammenstern- und Kaulquappennebel: rote Fasern über dem ganzen Himmel, dazu eine blaue Wolke
  rhy: { name: 'Flammenstern', shape: 'wisps', cx: 0.32, cy: 0.38, rx: 0.15, ry: 0.14, angle: 0.4, core: '#b8482a', rim: '#e07c34', hi: '#ffc58a', haze: '#4a1612', hazeA: 0.08, glow: 0.62, cover: 0.48, edge: 0.6, dust: 0.35, fil: 1, globules: 8, cluster: 0,
    extra: { x: 0.72, y: 0.7, r: 0.111, color: '#4a7ad0' }, stars: 1.15, warm: 0.35 },
  // Magenta und Braun (Farben des Orionnebels): weiche, großflächige Schlieren in Staub
  hoa: { name: 'Magenta-Marmor', shape: 'marble', cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4, angle: 0, core: '#b45aa8', rim: '#8e6c46', hi: '#ffd8f0', haze: '#33281a', hazeA: 0.06, glow: 0.7, cover: 0.42, edge: 0.6, dust: 0.6, fil: 0.45, globules: 4, cluster: 0, stars: 1.3, warm: 0.55, scale: 2.4, warp: 2.2 },
  // Stahlblau und Bernstein: feiner marmoriert, mit kräftigen Dunkelwolken
  zyarth: { name: 'Stahl-Bernstein-Marmor', shape: 'marble', cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4, angle: 0, core: '#56789e', rim: '#d4893a', hi: '#dcecff', haze: '#1e140c', hazeA: 0.03, glow: 0.62, cover: 0.44, edge: 0.8, dust: 0.75, fil: 0.6, globules: 8, cluster: 0, stars: 1.05, warm: 0.3, scale: 3.3, warp: 2.8 },
};

export interface SectorTheme {
  scene: Scene;
  /** Sonnenlicht relativ (1 = 100 %) */
  sun: number;
  sunColor: string;
  /** Richtung der Sonne (Bildschirmwinkel) */
  sunAngle: number;
  seed: number;
}

const themes = new Map<string, SectorTheme>();
/** Sonnenpositionen seitlich bzw. schräg unten – nicht hinter der Kopfleiste */
const SUN_SPOTS = [-2.5, -0.64, 0.45, 2.7, 0.0, Math.PI];

export function sectorTheme(id: string): SectorTheme {
  const hit = themes.get(id);
  if (hit) return hit;
  const sec = SECTOR_MAP[id];
  const seed = hashStr(id + ':theme');
  const r = rng(seed);
  const warm = sec?.faction === 'zya' ? r() < 0.75 : r() < 0.45;
  const theme: SectorTheme = {
    scene: SCENES[id] ?? SCENES.zhin,
    sun: (sec?.sunlight ?? 0) / 100,
    sunColor: warm ? '#ffd9a0' : '#d6ecff',
    sunAngle: SUN_SPOTS[Math.floor(r() * SUN_SPOTS.length)] + (r() - 0.5) * 0.35,
    seed,
  };
  themes.set(id, theme);
  return theme;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

/** Farben für den Nebel leicht gedämpft (Fotos wirken satt, aber nicht grell) */
function neb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const grey = (r + g + b) / 3;
  return [r * 0.85 + grey * 0.15, g * 0.85 + grey * 0.15, b * 0.85 + grey * 0.15];
}

interface Globule { x: number; y: number; rx: number; ry: number; a: number; k: number }

/**
 * Nebelschicht hinter der Karte (größer als der Bildschirm, für Parallaxe). Verwirbeltes Rauschen wird durch die
 * Grundform des Motivs geformt; an den Wolkenrändern wechselt die Farbe zur Randfarbe (wie in Schmalband-Fotos),
 * Filamente leuchten auf, Dunkelwolken und Globulen verdecken Licht und Sterne. Danach kommen Sternhaufen und
 * Galaxien scharf in Geräteauflösung dazu.
 */
export function nebulaLayer(w: number, h: number, t: SectorTheme, res = 1): HTMLCanvasElement {
  const sc = t.scene;
  const k = 2.5;
  const sw = Math.ceil(w / k), sh = Math.ceil(h / k);
  const M = Math.max(sw, sh);
  const [c0, g0] = canvas(sw, sh);
  const img = g0.createImageData(sw, sh);
  const px = img.data;
  const n1 = perlin(t.seed), n2 = perlin(t.seed + 101), n3 = perlin(t.seed + 202);
  const light = Math.max(0.7, Math.min(1.25, 0.6 + t.sun * 0.4));
  const core = neb(sc.core), rim = neb(sc.rim), hi = neb(sc.hi), haze = neb(sc.haze);
  const extra = sc.extra ? { ...sc.extra, rgb: neb(sc.extra.color) } : null;
  const cos = Math.cos(-sc.angle), sin = Math.sin(-sc.angle);
  const scale = (sc.scale ?? 4.2) / M;
  const warp = sc.warp ?? 2.6;
  const strength = sc.intensity ?? 0.45;
  const dark = [3, 5, 9];
  const grain = rng(t.seed + 3);
  // Globulen: kleine, längliche Dunkelwolken – meist am Rand der Wolke, wo das Licht sie umspült
  const gr = rng(t.seed + 77);
  const globs: Globule[] = [];
  for (let i = 0; i < sc.globules; i++) {
    const a = gr() * Math.PI * 2, d = sc.shape === 'ring' ? 0.55 + gr() * 0.5 : 0.7 + gr() * 0.35;
    let gx = Math.cos(a) * d * sc.rx, gy = Math.sin(a) * d * sc.ry;
    if (sc.shape === 'wall') { gx = (gr() - 0.5) * 0.8; gy = -0.01 - gr() * 0.03; }
    if (sc.shape === 'wisps' || sc.shape === 'none' || sc.shape === 'marble') { gx = (gr() - 0.5) * 0.9; gy = (gr() - 0.5) * 0.9; }
    const size = sc.shape === 'wall' && i === 0 ? 0.03 : 0.003 + Math.pow(gr(), 3) * 0.012;
    globs.push({ x: sc.cx * sw + (gx * Math.cos(sc.angle) - gy * Math.sin(sc.angle)) * M, y: sc.cy * sh + (gx * Math.sin(sc.angle) + gy * Math.cos(sc.angle)) * M, rx: size * M, ry: size * M * (0.3 + gr() * 0.7), a: gr() * Math.PI, k: 0.45 + gr() * 0.4 });
  }
  // Pferdekopf: Silhouette aus Kopf und Hals auf der Kante
  if (sc.shape === 'wall' && globs.length) {
    const h0 = globs[0];
    h0.k = 1;
    h0.y -= h0.ry * 1.6;
    h0.ry = h0.rx * 1.3;
    globs.push({ x: h0.x + h0.rx * 0.5, y: h0.y + h0.ry * 1.4, rx: h0.rx * 0.55, ry: h0.ry * 0.9, a: 0.3, k: 1 });
  }
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const u = x * scale, v = y * scale;
      const q1 = fbm(n1, u, v, 3), q2 = fbm(n2, u + 5.2, v + 1.3, 3);
      const rr = fbm(n3, u + warp * q1, v + warp * q2, 5);
      // Lage im Motiv (gedreht, auf die Halbachsen normiert), vom Rauschen leicht verbogen
      const dx = (x - sc.cx * sw) / M, dy = (y - sc.cy * sh) / M;
      const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
      const ex = lx / sc.rx, ey = ly / sc.ry;
      const dd = Math.hypot(ex, ey) + (q1 - 0.5) * 0.9 + (rr - 0.5) * 0.55;
      let m: number;
      let wallDark = 0;
      switch (sc.shape) {
        // Marmor: fast überall Nebel, großräumige Lücken aus langsamem Rauschen
        case 'marble': m = 0.45 + 0.55 * smooth(0.3, 0.68, q2); break;
        case 'shell': m = 1 - smooth(0.7, 1.15, dd); break;
        case 'ring': m = Math.exp(-(((dd - 0.78) / 0.3) ** 2)); break;
        case 'cloud': m = Math.exp(-dd * dd * 1.5); break;
        case 'wisps': m = 0.3 + 0.7 * Math.exp(-dd * dd * 1.2); break;
        case 'wall': {
          // Kante: oberhalb leuchtet es nach oben hin ab, unterhalb wird es schlagartig dunkel
          const s = ey + (q2 - 0.5) * 0.6 + (q1 - 0.5) * 0.35 + 0.06 * Math.sin(lx * 30 + q1 * 4);
          m = s < 0 ? Math.exp(s * 1.1) * (1 - smooth(0.5, 1.1, Math.abs(ex))) : Math.exp(-s * 30);
          wallDark = s > 0 ? smooth(0, 0.15, s) * smooth(0.3, 0.65, rr + 0.15) * (1 - smooth(0.5, 1.4, Math.abs(ex) + (q2 - 0.5))) : 0;
          break;
        }
        default: m = 0;
      }
      let xm = 0;
      if (extra) {
        const ddx = ((x / sw - extra.x) * sw) / M, ddy = ((y / sh - extra.y) * sh) / M;
        xm = Math.exp(-((Math.hypot(ddx, ddy) / extra.r + (q2 - 0.5) * 0.5) ** 2) * 1.6);
      }
      const mm = Math.max(m, xm);
      const val = rr * 0.9 + mm * 0.36;
      const dens = sc.shape === 'none' ? 0 : smooth(sc.cover, sc.cover + 0.3, val) * Math.min(1, mm * 1.6);
      // Rand der Wolke: schmales Band an der Schwelle und der äußere Saum der Grundform
      const band = smooth(sc.cover - 0.05, sc.cover + 0.08, val) * (1 - smooth(sc.cover + 0.1, sc.cover + 0.3, val));
      const edgeF = Math.min(1, (band * 1.1 + mm * (1 - mm) * 2.2) * sc.edge);
      // Filamente
      const fr = fbm(n1, u * 2.3 + q2 * 1.5, v * 2.3 + q1 * 1.5, 3);
      const fil = Math.pow(1 - Math.abs(fr * 2 - 1), 4) * 0.8 * sc.fil * (sc.shape === 'wisps' ? Math.max(dens, 0.35 * mm) : dens);
      // Farbe: innen Kernfarbe (bzw. Zusatzwolke), am Rand Randfarbe, Glanzlichter in Kernen und Fasern
      const wx = extra ? xm / (m + xm + 1e-6) : 0;
      let cr = core[0], cg = core[1], cb = core[2];
      if (extra) { cr += (extra.rgb[0] - cr) * wx; cg += (extra.rgb[1] - cg) * wx; cb += (extra.rgb[2] - cb) * wx; }
      // Marmor: beide Farben großflächig ineinander verwirbelt
      if (sc.shape === 'marble') {
        const mixC = smooth(0.35, 0.7, q1);
        cr += (rim[0] - cr) * mixC; cg += (rim[1] - cg) * mixC; cb += (rim[2] - cb) * mixC;
      }
      cr += (rim[0] - cr) * edgeF; cg += (rim[1] - cg) * edgeF; cb += (rim[2] - cb) * edgeF;
      const hl = Math.min(1, fil * 1.1 + dens * dens * 0.35);
      cr += (hi[0] - cr) * hl * 0.4; cg += (hi[1] - cg) * hl * 0.4; cb += (hi[2] - cb) * hl * 0.4;
      // Helligkeit schwankt großräumig: helle Kerne und dunklere Bereiche statt gleichmäßiger Fläche
      const lum = 0.4 + 0.95 * smooth(0.28, 0.78, q2 * 0.6 + rr * 0.4);
      let ea = Math.pow(Math.min(1, (dens * 0.75 + fil * 0.5 + edgeF * dens * 0.45) * sc.glow * light * lum), 1.15) * strength;
      // Schleier über den ganzen Himmel
      const ha = sc.hazeA * (0.35 + 0.9 * q2) * light * strength;
      // Dunkelwolken und Globulen
      let du = smooth(0.53, 0.75, fbm(n2, u * 1.5 + q1 * 1.2 + 9, v * 1.5 - q2 + 4, 4)) * sc.dust * (0.4 + 0.6 * mm);
      du = Math.max(du, wallDark * 0.85);
      for (const g of globs) {
        const gx = x - g.x, gy = y - g.y;
        if (Math.abs(gx) > g.rx * 3 || Math.abs(gy) > g.rx * 3) continue;
        const ca = Math.cos(g.a), sa = Math.sin(g.a);
        const qx = (gx * ca + gy * sa) / g.rx, qy = (-gx * sa + gy * ca) / g.ry;
        du = Math.max(du, Math.exp(-(qx * qx + qy * qy) * 1.4) * g.k);
      }
      ea *= 1 - du * 0.9;
      // Zusammensetzen: Schleier, darüber Leuchten, darüber Dunkelwolke
      let r0 = haze[0], g1 = haze[1], b0 = haze[2], a0 = ha;
      const ao = ea + a0 * (1 - ea);
      if (ao > 0) { r0 = (cr * ea + r0 * a0 * (1 - ea)) / ao; g1 = (cg * ea + g1 * a0 * (1 - ea)) / ao; b0 = (cb * ea + b0 * a0 * (1 - ea)) / ao; }
      a0 = ao;
      const da = du * 0.8;
      const a = da + a0 * (1 - da);
      const i = (y * sw + x) * 4;
      if (a <= 0.002) { px[i + 3] = 0; continue; }
      px[i] = (dark[0] * da + r0 * a0 * (1 - da)) / a;
      px[i + 1] = (dark[1] * da + g1 * a0 * (1 - da)) / a;
      px[i + 2] = (dark[2] * da + b0 * a0 * (1 - da)) / a;
      px[i + 3] = a * 255 + (grain() - 0.5) * 2;
    }
  }
  g0.putImageData(img, 0, 0);
  // Weichzeichnen auf einer kleinen Zwischenstufe (doppelte Rechenauflösung) – glättet die Pixelkanten günstig;
  // danach ohne Filter auf Geräteauflösung (res) vergrößern
  const [cm, gm] = canvas(sw * 2, sh * 2);
  gm.imageSmoothingEnabled = true;
  gm.filter = 'blur(1.3px)';
  gm.drawImage(c0, -1, -1, cm.width + 2, cm.height + 2);
  gm.filter = 'none';
  const [c, ctx] = canvas(w * res, h * res);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cm, 0, 0, c.width, c.height);
  // Scharfe Zutaten: Galaxien und junger Sternhaufen
  const W = c.width, H = c.height, MM = Math.max(W, H);
  const r = rng(t.seed + 9);
  for (const g of sc.galaxies ?? []) drawGalaxy(ctx, g.x * W, g.y * H, g.size * MM, g.angle, g.tilt, g.kind, r, res);
  if (sc.cluster) {
    const ccx = sc.cx * W, ccy = sc.cy * H;
    for (let i = 0; i < sc.cluster; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 1.5) * MM * 0.045;
      starDot(ctx, ccx + Math.cos(a) * d, ccy + Math.sin(a) * d * 0.8, (0.9 + r() * 1.4) * res, r() < 0.2 ? '#ffe9c8' : '#dcebff', 0.75 + r() * 0.25, res);
    }
  }
  return c;
}

/** Stern mit weichem Hof (ohne Strahlen) */
export function starDot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number, res = 1): void {
  const halo = size * 4 + 2 * res;
  const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
  g.addColorStop(0, rgba(color, alpha * 0.5));
  g.addColorStop(0.25, rgba(color, alpha * 0.12));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
  ctx.fillStyle = rgba('#ffffff', alpha);
  ctx.beginPath();
  ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Ferne Galaxie: Spiralgalaxie mit hellem Kern, zwei Armen aus vielen feinen, bläulichen Sternwolken, rosa
 * Sternentstehungsgebieten und Staubbändern – oder eine Kantengalaxie mit dunklem Staubband. Wird auf einer
 * eigenen kleinen Fläche gezeichnet, leicht weichgezeichnet und dann aufaddiert.
 */
function drawGalaxy(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, tilt: number, kind: 'spiral' | 'edge', r: () => number, res: number): void {
  const sz = Math.ceil(size * 2.3);
  const [oc, o] = canvas(sz, sz);
  o.translate(sz / 2, sz / 2);
  o.rotate(angle);
  o.scale(1, tilt);
  o.globalCompositeOperation = 'lighter';
  // Lichthof der ganzen Scheibe
  const halo = o.createRadialGradient(0, 0, 0, 0, 0, size);
  halo.addColorStop(0, 'rgba(255,226,214,0.3)');
  halo.addColorStop(0.18, 'rgba(240,210,215,0.12)');
  halo.addColorStop(0.55, 'rgba(190,190,230,0.035)');
  halo.addColorStop(1, 'rgba(190,190,230,0)');
  o.fillStyle = halo;
  o.beginPath();
  o.arc(0, 0, size, 0, Math.PI * 2);
  o.fill();
  if (kind === 'spiral') {
    // Arme: logarithmische Spiralen aus vielen feinen, gestreuten Sternwolken
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 900; i++) {
        const th = (i / 900) * Math.PI * 3.2;
        const rad = size * 0.1 * Math.exp(0.22 * th);
        if (rad > size * 0.95) break;
        const a = th + arm * Math.PI + (r() - 0.5) * 0.35;
        const jr = rad * (1 + (r() - 0.5) * 0.22);
        const pink = r() < 0.025;
        const fade = 1 - rad / size;
        o.fillStyle = pink ? `rgba(255,140,190,${0.35 * fade + 0.1})` : `rgba(175,192,255,${(0.05 + r() * 0.08) * (0.4 + fade)})`;
        o.beginPath();
        o.arc(Math.cos(a) * jr, Math.sin(a) * jr, size * (pink ? 0.012 : 0.006 + r() * 0.012), 0, Math.PI * 2);
        o.fill();
      }
    }
    // Staubbänder an der Innenseite der Arme
    o.globalCompositeOperation = 'destination-out';
    o.strokeStyle = 'rgba(0,0,0,0.35)';
    o.lineWidth = Math.max(0.6, size * 0.018);
    for (let arm = 0; arm < 2; arm++) {
      o.beginPath();
      for (let i = 0; i <= 80; i++) {
        const th = (i / 80) * Math.PI * 2.8;
        const rad = size * 0.09 * Math.exp(0.22 * th);
        const a = th + arm * Math.PI - 0.2;
        if (i) o.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else o.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      o.stroke();
    }
    o.globalCompositeOperation = 'lighter';
  } else {
    // Kantengalaxie: lang gestreckte Scheibe mit dunklem Staubband
    const disc = o.createRadialGradient(0, 0, 0, 0, 0, size * 0.75);
    disc.addColorStop(0, 'rgba(255,236,226,0.5)');
    disc.addColorStop(0.5, 'rgba(220,200,220,0.16)');
    disc.addColorStop(1, 'rgba(200,190,230,0)');
    o.fillStyle = disc;
    o.beginPath();
    o.ellipse(0, 0, size * 0.75, size * 0.45, 0, 0, Math.PI * 2);
    o.fill();
    o.globalCompositeOperation = 'destination-out';
    o.fillStyle = 'rgba(0,0,0,0.6)';
    o.beginPath();
    o.ellipse(size * 0.05, size * 0.04, size * 0.45, size * 0.06, 0.05, 0, Math.PI * 2);
    o.fill();
    o.globalCompositeOperation = 'lighter';
  }
  // Heller Kern
  const coreR = Math.max(1.2 * res, size * 0.09);
  const cg = o.createRadialGradient(0, 0, 0, 0, 0, coreR);
  cg.addColorStop(0, 'rgba(255,248,236,0.95)');
  cg.addColorStop(0.4, 'rgba(255,220,200,0.45)');
  cg.addColorStop(1, 'rgba(255,210,200,0)');
  o.fillStyle = cg;
  o.beginPath();
  o.arc(0, 0, coreR, 0, Math.PI * 2);
  o.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${Math.max(0.4, size * 0.006)}px)`;
  ctx.drawImage(oc, x - sz / 2, y - sz / 2);
  ctx.restore();
}

/** Sterndichte und Anteil orangefarbener Sterne des Motivs */
export function starParams(t: SectorTheme): { stars: number; warm: number } {
  return { stars: t.scene.stars, warm: t.scene.warm };
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
  const halo = m * (0.3 + 0.25 * s);
  const hg = ctx.createRadialGradient(x, y, 0, x, y, halo);
  hg.addColorStop(0, `rgba(${r},${g},${b},${0.13 * s})`);
  hg.addColorStop(0.15, `rgba(${r},${g},${b},${0.05 * s})`);
  hg.addColorStop(0.5, `rgba(${r},${g},${b},${0.015 * s})`);
  hg.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, H);
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
