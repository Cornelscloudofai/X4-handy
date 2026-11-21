// Kampf-Schauplätze: Hintergrund der Kampf-Minispiele, wenn der Kampf nicht aus einem Sektor mit eigener Szene kommt.
// Nichts davon ist ein großes Bild über dem ganzen Feld (das würde beim Heranzoomen unscharf):
//   – Himmel am Bildschirm: Farbverlauf, gestochen scharfe Sterne (gezeichnet), weiche Nebelbilder (Unschärfe stört dort nicht)
//   – fernes Objekt am Bildschirm (Mond, Tor …), gleitet kaum – links oder mittig, rechts oben liegt die Übersichtskarte
//   – Tiefenebenen hinter der Spielebene: Wracks, Asteroiden, Kristalle, Nebelschwaden, Staub – mit festem Zufallswert in
//     Zellen verteilt (beliebig großes Feld, nichts wird vorab erzeugt), jedes Teil nur so groß gezeichnet wie auf dem Schirm.
// Tiefe: eine Ebene liegt um E hinter der Spielebene; ihr Maßstab ist 1 / (1/zoom + E). Ferne Ebenen gleiten dadurch
// weniger und wachsen beim Zoomen weniger mit – wie bei einer echten Kamera. Alle Teile sind abgedunkelt und entsättigt,
// damit sie nie wie Gegner oder Ziele wirken; die Mitte des Bildes bleibt ruhig.

import wrackBruecke from '../assets/szenen/zhin/wrack-bruecke.webp';
import wrackHeck from '../assets/szenen/zhin/wrack-heck.webp';
import wrackMitte from '../assets/szenen/zhin/wrack-mitte.webp';
import container from '../assets/szenen/zhin/container.webp';
import truemmer from '../assets/szenen/f-asche/truemmer.webp';
import staubAsche from '../assets/szenen/f-asche/staub.webp';
import staubTkr from '../assets/szenen/tkr/staub.webp';
import nebelRhak from '../assets/szenen/f-rhak/nebel.webp';
import nebelRhy from '../assets/szenen/rhy/nebel.webp';
import nebelAusblick from '../assets/szenen/f-ausblick/nebel.webp';
import nebelZhin from '../assets/szenen/zhin/nebel.webp';
import mondAsche from '../assets/szenen/f-asche/mond.webp';
import torRhy from '../assets/szenen/rhy/tor.webp';
import eisGross from '../assets/szenen/hoa/eis-gross.webp';
import eisMittel from '../assets/szenen/hoa/eis-mittel.webp';
import splitter from '../assets/szenen/hoa/splitter.webp';
import scholle from '../assets/szenen/hoa/scholle.webp';
import astErz1 from '../assets/sprites/asteroid-erz-1-ki.webp';
import astErz3 from '../assets/sprites/asteroid-erz-3-ki.webp';
import ast2 from '../assets/sprites/asteroid-2-ki.webp';
import ast3 from '../assets/sprites/asteroid-3-ki.webp';
import ast4 from '../assets/sprites/asteroid-4-ki.webp';
import astEis1 from '../assets/sprites/asteroid-eis-1-ki.webp';
import astEis2 from '../assets/sprites/asteroid-eis-2-ki.webp';
import astSil1 from '../assets/sprites/asteroid-silizium-1-ki.webp';
import gasriese from '../assets/szenen/f-rhak/gasriese.webp';
import handelsstation from '../assets/szenen/f-rhak/station.webp';
import verkehr from '../assets/szenen/zyarth/verkehr.webp';
import sonneGlut from '../assets/szenen/f-glut1/sonne.webp';
import zwerg from '../assets/szenen/f-asche/sonne.webp';
import ringTruemmer from '../assets/szenen/f-schmiede/ring.webp';
import bastion from '../assets/szenen/ravine/bastion.webp';
import helium from '../assets/szenen/cascade/helium.webp';
import methan from '../assets/szenen/cascade/methan.webp';
import wasserstoff from '../assets/szenen/cascade/wasserstoff.webp';
import nebelGlut from '../assets/szenen/f-glut1/nebel.webp';
import { rgba } from './common';
import type { Mission } from './missions';

export type BattleSide = 'pirate' | 'xenon' | 'khaak';

/** Teil einer Tiefenebene: Bild, Größe in Ebenen-Einheiten, Gewicht bei der Auswahl, Eigendrehung erlaubt */
interface Piece { src: string; size: number; w?: number; spin?: boolean }
/** Tiefenebene hinter der Spielebene */
interface Layer {
  /** Abstand hinter der Spielebene (größer = ferner) */
  E: number;
  /** Zellgröße (Ebenen-Einheiten) und Anteil der Zellen mit einem Teil */
  cell: number; fill: number;
  pieces: Piece[];
  /** Helligkeit (0…1) und Färbung der abgedunkelten Teile */
  light: number; tint: string;
  /** Mischung: Nebel und Staub leuchten (screen), feste Körper decken */
  blend?: GlobalCompositeOperation;
}
interface Theme {
  /** Himmel: Farbverlauf innen/außen, Sternfarbe, Nebel am Bildschirm (Bild, Deckkraft, Drehung) */
  sky: [string, string]; star: string;
  haze: { src: string; a: number; rot: number; x: number; y: number; s: number }[];
  /** fernes Objekt am Bildschirm: Lage (Anteile), Breite relativ zur kürzeren Seite, Helligkeit */
  far?: { src: string; x: number; y: number; w: number; light: number; tint: string; glow?: { rgb: string; r: number; a: number } };
  layers: Layer[];
  /** Staub nah an der Spielebene (gezeichnet): Farbe, Dichte */
  motes: { rgb: string; n: number };
}

const THEMES: Record<BattleSide, Theme> = {
  // Piraten: Ausschlachtfeld – rostiger Staub, Wrackteile und Container, ein ferner Mond
  pirate: {
    sky: ['#1a120d', '#050304'], star: '#ffe2c4',
    haze: [{ src: staubAsche, a: 0.5, rot: -0.35, x: 0.5, y: 0.35, s: 1.5 }, { src: nebelRhak, a: 0.22, rot: 2.6, x: 0.35, y: 0.85, s: 1.4 }],
    far: { src: mondAsche, x: 0.2, y: 0.17, w: 0.62, light: 0.55, tint: '#2a1408' },
    layers: [
      { E: 24, cell: 9000, fill: 0.5, light: 0.32, tint: '#1a0d06', pieces: [{ src: astErz1, size: 3800, spin: true }, { src: ast3, size: 3200, spin: true }, { src: container, size: 4200 }] },
      { E: 10, cell: 5200, fill: 0.55, light: 0.45, tint: '#1a0d06', pieces: [{ src: wrackBruecke, size: 3000 }, { src: wrackHeck, size: 3200 }, { src: wrackMitte, size: 3000 }, { src: ast2, size: 1800, spin: true }, { src: astErz3, size: 1700, spin: true }] },
      { E: 13, cell: 14000, fill: 0.5, light: 0.45, tint: '#2a1206', blend: 'screen', pieces: [{ src: truemmer, size: 14000, w: 1 }, { src: staubTkr, size: 16000, w: 1 }] },
      { E: 3.5, cell: 3200, fill: 0.3, light: 0.42, tint: '#1a0d06', pieces: [{ src: wrackMitte, size: 1150 }, { src: container, size: 1000 }, { src: ast4, size: 700, spin: true }, { src: astErz1, size: 650, spin: true }] },
    ],
    motes: { rgb: '255,170,110', n: 3 },
  },
  // Xenon: Grenzsektor – karminroter Nebel, dunkle Brocken, ein zerfallenes Tor in der Ferne
  xenon: {
    sky: ['#170609', '#040103'], star: '#ffd0d0',
    haze: [{ src: nebelRhy, a: 0.42, rot: 0.2, x: 0.5, y: 0.3, s: 1.5 }, { src: nebelAusblick, a: 0.3, rot: 3.3, x: 0.6, y: 0.85, s: 1.3 }],
    far: { src: torRhy, x: 0.2, y: 0.17, w: 0.7, light: 0.5, tint: '#2a0508' },
    layers: [
      { E: 24, cell: 9000, fill: 0.55, light: 0.28, tint: '#14030a', pieces: [{ src: ast2, size: 4200, spin: true }, { src: ast3, size: 3600, spin: true }, { src: ast4, size: 3000, spin: true }] },
      { E: 13, cell: 15000, fill: 0.45, light: 0.4, tint: '#30040c', blend: 'screen', pieces: [{ src: nebelRhy, size: 18000 }, { src: nebelAusblick, size: 15000 }] },
      { E: 9, cell: 5200, fill: 0.5, light: 0.4, tint: '#16030a', pieces: [{ src: ast3, size: 2200, spin: true }, { src: ast4, size: 2000, spin: true }, { src: astErz3, size: 1800, spin: true }, { src: wrackHeck, size: 3200 }] },
      { E: 3.5, cell: 3400, fill: 0.3, light: 0.42, tint: '#16030a', pieces: [{ src: ast2, size: 700, spin: true }, { src: ast4, size: 650, spin: true }] },
    ],
    motes: { rgb: '255,90,100', n: 2 },
  },
  // Kha'ak: Kristallfeld – violetter und türkiser Schimmer, Eis und Kristallbrocken
  khaak: {
    sky: ['#120a1c', '#030208'], star: '#e6d4ff',
    haze: [{ src: nebelZhin, a: 0.3, rot: 0.5, x: 0.5, y: 0.3, s: 1.5 }, { src: nebelRhy, a: 0.3, rot: 3.6, x: 0.45, y: 0.85, s: 1.4 }],
    far: { src: eisGross, x: 0.22, y: 0.19, w: 0.6, light: 0.55, tint: '#1a0b2a' },
    layers: [
      { E: 24, cell: 9000, fill: 0.55, light: 0.35, tint: '#140a24', pieces: [{ src: scholle, size: 4200, spin: true }, { src: astEis1, size: 3400, spin: true }, { src: astSil1, size: 3000, spin: true }] },
      { E: 13, cell: 15000, fill: 0.45, light: 0.4, tint: '#1c0a34', blend: 'screen', pieces: [{ src: nebelZhin, size: 17000 }, { src: nebelRhy, size: 15000 }] },
      { E: 9, cell: 5000, fill: 0.55, light: 0.5, tint: '#140a24', pieces: [{ src: splitter, size: 2600, spin: true }, { src: eisMittel, size: 2400, spin: true }, { src: astEis2, size: 1800, spin: true }, { src: astSil1, size: 1700, spin: true }] },
      { E: 3.5, cell: 3200, fill: 0.3, light: 0.45, tint: '#140a24', pieces: [{ src: splitter, size: 750, spin: true }, { src: astEis1, size: 650, spin: true }] },
    ],
    motes: { rgb: '190,160,255', n: 3 },
  },
};

/**
 * Einsätze: eigenes Motiv in der Ferne (und wo es passt, mehr vom Passenden) über dem Schauplatz des Gegners.
 * Geleitschutz bleibt beim Grund-Schauplatz.
 */
function themeFor(side: BattleSide, mission: Mission | undefined): Theme {
  const t = THEMES[side];
  switch (mission) {
    // Stationsverteidigung: die Station kreist über einem Gasriesen
    case 'station': return { ...t, far: { src: gasriese, x: 0.3, y: 0.2, w: 0.95, light: 0.6, tint: '#140806' } };
    // Konvoi: die Handelsstation, zu der er unterwegs ist, mit Verkehrslichtern davor
    case 'konvoi': return { ...t, far: { src: handelsstation, x: 0.33, y: 0.17, w: 0.85, light: 0.6, tint: '#140806' }, haze: [...t.haze, { src: verkehr, a: 0.45, rot: -0.25, x: 0.35, y: 0.22, s: 1.1 }] };
    // Flucht: vor einer Sonne im Ausbruch, deren Hof den Himmel färbt
    case 'flucht': return { ...t, far: { src: sonneGlut, x: 0.42, y: 0.3, w: 0.42, light: 0.72, tint: '#401000', glow: { rgb: '255,140,60', r: 1.8, a: 0.22 } }, haze: [...t.haze, { src: nebelRhak, a: 0.25, rot: 0.6, x: 0.3, y: 0.2, s: 1.2 }] };
    // Bergung: ein zerbrochener Stationsring, ringsum mehr Wrackteile
    case 'bergung': return { ...t, far: { src: ringTruemmer, x: 0.5, y: 0.18, w: 1.1, light: 0.5, tint: '#120806' }, layers: [...t.layers, { E: 6, cell: 3800, fill: 0.55, light: 0.45, tint: '#1a0d06', pieces: [{ src: wrackBruecke, size: 2200 }, { src: wrackHeck, size: 2400 }, { src: wrackMitte, size: 2200 }, { src: container, size: 1600 }] }] };
    // Überfall: die Bastion der Piraten, deren Frachter hier verkehren
    case 'ueberfall': return { ...t, far: { src: bastion, x: 0.25, y: 0.21, w: 0.7, light: 0.55, tint: '#140806' } };
    // Nest: am Rand eines roten Zwergs, dunkler und dichter
    case 'nest': return { ...t, far: { src: zwerg, x: 0.25, y: 0.16, w: 0.7, light: 0.85, tint: '#300404', glow: { rgb: '255,70,50', r: 1.4, a: 0.2 } }, layers: t.layers.map((l) => ({ ...l, fill: Math.min(0.8, l.fill * 1.25), light: l.light * 0.85 })) };
    default: return t;
  }
}

/** Bilder einmal laden und je Färbung abgedunkelt vorbereiten (volle Auflösung) */
const IMGS = new Map<string, HTMLImageElement>();
const TINTED = new Map<string, HTMLCanvasElement | null>();
function img(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let i = IMGS.get(src);
  if (!i) { i = new Image(); i.decoding = 'async'; i.src = src; IMGS.set(src, i); }
  return i.complete && i.naturalWidth ? i : null;
}
/** abgedunkelt und zur Färbung hin gezogen (Anteil 1 − light), Transparenz bleibt */
function tinted(src: string, light: number, tint: string): HTMLCanvasElement | null {
  const key = `${src}|${light}|${tint}`;
  if (TINTED.has(key)) return TINTED.get(key)!;
  const i = img(src);
  if (!i || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = i.naturalWidth; c.height = i.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(i, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rgba(tint, 1 - light);
  g.fillRect(0, 0, c.width, c.height);
  TINTED.set(key, c);
  return c;
}

/** Nebel und Staub: zum Rand hin weich ausgeblendet (sonst zeigen sich die geraden Bildkanten), nicht eingefärbt */
const SOFT = new Map<string, HTMLCanvasElement | null>();
function soft(src: string): HTMLCanvasElement | null {
  if (SOFT.has(src)) return SOFT.get(src)!;
  const i = img(src);
  if (!i || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = i.naturalWidth; c.height = i.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(i, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  // elliptische Maske: innen voll, ab 45 % des Halbmessers weich auslaufend
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.scale(c.width / 2, c.height / 2);
  const m = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(0.45, 'rgba(0,0,0,0.9)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(-1, -1, 2, 2);
  g.restore();
  SOFT.set(src, c);
  return c;
}

/**
 * Nebelschwaden für Nebelfelder im Kampf: die Gasnebel- und Staubbilder der Schauplätze, in den Nebelton umgefärbt (die
 * Helligkeit bleibt, Hintergrund schwarz), zum Rand ins Schwarze auslaufend – gedacht für die Bildschirm-Mischung. Einmal je Bild und Gegner berechnet, in voller Bildauflösung.
 */
const FOG_SRC: Record<BattleSide, string[]> = {
  pirate: [nebelRhak, staubAsche, helium, methan, staubTkr, nebelGlut],
  xenon: [nebelRhy, nebelAusblick, wasserstoff, staubAsche, helium, nebelRhak],
  khaak: [nebelZhin, nebelRhy, methan, wasserstoff, helium, nebelAusblick],
};
const VEILS = new Map<string, HTMLCanvasElement | null>();
export const FOG_VEILS = 6;
export function fogVeil(side: BattleSide, i: number, rgb: [number, number, number]): HTMLCanvasElement | null {
  const src = FOG_SRC[side][i % FOG_SRC[side].length], key = `${src}|${side}`;
  if (VEILS.has(key)) return VEILS.get(key)!;
  const im = img(src);
  if (!im || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const w = (c.width = im.naturalWidth), h = (c.height = im.naturalHeight);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  // Helligkeit auf ein Raster (¼ Auflösung) mitteln und dort in Gleitkomma weichzeichnen – ohne 8-Bit-Stufen, die beim
  // Vergrößern als Höhenlinien sichtbar würden
  g.drawImage(im, 0, 0);
  const sp = g.getImageData(0, 0, w, h).data;
  const S = 4, gw = Math.ceil(w / S), gh = Math.ceil(h / S);
  const base = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    base[Math.floor(y / S) * gw + Math.floor(x / S)] += Math.max(sp[k], sp[k + 1], sp[k + 2]) / 255 / (S * S);
  }
  /** dreifacher Kastenfilter (≈ Gauß) mit Radius r (Rasterpunkte) */
  const blur = (a: Float32Array, r: number): Float32Array => {
    let cur = a.slice();
    const tmp = new Float32Array(cur.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < gh; y++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += cur[y * gw + Math.min(gw - 1, Math.max(0, x))];
        for (let x = 0; x < gw; x++) {
          tmp[y * gw + x] = acc / (2 * r + 1);
          acc += cur[y * gw + Math.min(gw - 1, x + r + 1)] - cur[y * gw + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < gw; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[Math.min(gh - 1, Math.max(0, y)) * gw + x];
        for (let y = 0; y < gh; y++) {
          cur[y * gw + x] = acc / (2 * r + 1);
          acc += tmp[Math.min(gh - 1, y + r + 1) * gw + x] - tmp[Math.max(0, y - r) * gw + x];
        }
      }
    }
    return cur;
  };
  // Körper der Schwade (sehr weich, bestimmt Form und verwaschenen Rand) und Zeichnung im Inneren (leicht weich)
  const soft = blur(base, Math.max(4, Math.round(gw / 26))), fine = blur(base, 2);
  const at = (a: Float32Array, fx: number, fy: number): number => {
    const x0 = Math.min(gw - 2, Math.max(0, Math.floor(fx))), y0 = Math.min(gh - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const i = y0 * gw + x0;
    return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + gw] * (1 - tx) + a[i + gw + 1] * tx) * ty;
  };
  const d = g.createImageData(w, h), px = d.data;
  for (let y = 0; y < h; y++) {
    const ny = (y / h) * 2 - 1, fy = y / S - 0.5;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, nx = (x / w) * 2 - 1, fx = x / S - 0.5;
      // zum Bildrand hin elliptisch ins Schwarze (bei der Bildschirm-Mischung neutral)
      const e0 = Math.min(1, Math.max(0, (1 - Math.hypot(nx, ny)) / 0.6)), e = e0 * e0 * (3 - 2 * e0);
      const body = Math.min(1, at(soft, fx, fy) * 2.2);
      // Zeichnung nur, wo der Körper dicht ist – am Rand verschwindet sie, der Rand bleibt verwaschen
      const v = (body * 0.6 + Math.min(1, at(fine, fx, fy) * 1.5) * body * body * 0.45) * e;
      // Dithering: ±1 Stufe Rauschen, damit beim Vergrößern keine Linien entstehen
      const n = Math.random() - 0.5;
      px[k] = Math.round(rgb[0] * v + n); px[k + 1] = Math.round(rgb[1] * v + n); px[k + 2] = Math.round(rgb[2] * v + n);
      px[k + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
  VEILS.set(key, c);
  return c;
}

/** fester Zufallswert je Zelle (0…1), unabhängig von der Reihenfolge */
export function cellHash(a: number, b: number, c: number, k: number): number { return hash(a, b, c, k); }
function hash(a: number, b: number, c: number, k: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class BattleBackdrop {
  private theme: Theme;
  private stars: { x: number; y: number; z: number; b: number }[] = [];

  constructor(side: BattleSide, private seed: number, mission?: Mission) {
    this.theme = themeFor(side, mission);
    const r = (k: number) => hash(seed, k, 7, 1);
    for (let i = 0; i < 260; i++) this.stars.push({ x: r(i * 4), y: r(i * 4 + 1), z: 0.15 + r(i * 4 + 2) * 0.85, b: 0.3 + r(i * 4 + 3) * 0.7 });
    // Bilder schon jetzt anfordern
    for (const h of this.theme.haze) img(h.src);
    if (this.theme.far) img(this.theme.far.src);
    for (const l of this.theme.layers) for (const p of l.pieces) img(p.src);
  }

  /**
   * Zeichnen: Bildschirm w×h, Kameramitte (cx, cy) in Spieleinheiten, Spielzoom, Zeit t (s). Noch nicht geladene Bilder
   * fehlen einfach, bis sie da sind.
   */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, zoom: number, t: number): void {
    const th = this.theme, m = Math.min(w, h);
    // Himmel
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.85);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // weiche Nebel am Bildschirm, gleiten kaum
    const px = cx * 0.002, py = cy * 0.002;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const hz of th.haze) {
      const i = soft(hz.src); if (!i) continue;
      const iw = Math.max(w, h) * hz.s, ih = (iw * i.height) / i.width;
      ctx.save();
      ctx.globalAlpha = hz.a;
      ctx.translate(w * hz.x - px, h * hz.y - py);
      ctx.rotate(hz.rot);
      ctx.drawImage(i, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    }
    ctx.restore();
    // Sterne: gezeichnet, also in jeder Größe scharf; ferne gleiten weniger
    for (const s of this.stars) {
      const x = (((s.x * w - cx * zoom * 0.02 * s.z) % w) + w) % w;
      const y = (((s.y * h - cy * zoom * 0.02 * s.z) % h) + h) % h;
      const r = 0.5 + s.z * 1.1;
      ctx.fillStyle = rgba(th.star, s.b * (0.3 + s.z * 0.55));
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
    // fernes Objekt am Bildschirm
    if (th.far) {
      const f = th.far, c = tinted(f.src, f.light, f.tint);
      if (c) {
        const fw = m * f.w * (1 + (zoom - 0.3) * 0.04), fh = (fw * c.height) / c.width;
        const fx = w * f.x - cx * 0.004, fy = h * f.y - cy * 0.004;
        // Lichthof (Sonne): färbt den Himmel ringsum
        if (f.glow) {
          const R = fw * f.glow.r, gr = ctx.createRadialGradient(fx, fy, fw * 0.2, fx, fy, R);
          gr.addColorStop(0, `rgba(${f.glow.rgb},${f.glow.a})`);
          gr.addColorStop(1, `rgba(${f.glow.rgb},0)`);
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = gr;
          ctx.fillRect(fx - R, fy - R, R * 2, R * 2);
          ctx.restore();
        }
        ctx.drawImage(c, fx - fw / 2, fy - fh / 2, fw, fh);
      }
    }
    // Tiefenebenen, von fern nach nah
    for (const [li, L] of [...th.layers.entries()].sort((a, b) => b[1].E - a[1].E)) this.drawLayer(ctx, L, li, w, h, cx, cy, zoom, t);
    this.drawMotes(ctx, w, h, cx, cy, zoom, t);
  }

  private drawLayer(ctx: CanvasRenderingContext2D, L: Layer, li: number, w: number, h: number, cx: number, cy: number, zoom: number, t: number): void {
    const s = 1 / (1 / Math.max(0.02, zoom) + L.E);
    // Ebenen-Koordinaten: die Kamera steht in jeder Ebene über demselben Punkt (cx, cy)
    const maxSize = Math.max(...L.pieces.map((p) => p.size)) * 1.4;
    const x0 = cx - w / 2 / s - maxSize / 2, x1 = cx + w / 2 / s + maxSize / 2;
    const y0 = cy - h / 2 / s - maxSize / 2, y1 = cy + h / 2 / s + maxSize / 2;
    const i0 = Math.floor(x0 / L.cell), i1 = Math.floor(x1 / L.cell), j0 = Math.floor(y0 / L.cell), j1 = Math.floor(y1 / L.cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 900) return;
    ctx.save();
    if (L.blend) ctx.globalCompositeOperation = L.blend;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.seed * 31 + li;
      if (hash(i, j, k, 0) > L.fill) continue;
      const piece = L.pieces[Math.floor(hash(i, j, k, 1) * L.pieces.length)];
      const c = L.blend ? soft(piece.src) : tinted(piece.src, L.light, L.tint);
      if (!c) continue;
      const wx = (i + 0.1 + hash(i, j, k, 2) * 0.8) * L.cell, wy = (j + 0.1 + hash(i, j, k, 3) * 0.8) * L.cell;
      const size = piece.size * (0.7 + hash(i, j, k, 4) * 0.6) * s;
      const sx = (wx - cx) * s + w / 2, sy = (wy - cy) * s + h / 2;
      if (sx < -size || sx > w + size || sy < -size || sy > h + size) continue;
      const rot = hash(i, j, k, 5) * Math.PI * 2 + (piece.spin ? (hash(i, j, k, 6) - 0.5) * 0.04 * t : 0);
      const ih = (size * c.height) / c.width;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      // Nebel und Staub leuchten nur schwach hinein, feste Körper decken
      ctx.globalAlpha = L.blend ? L.light : 1;
      ctx.drawImage(c, -size / 2, -ih / 2, size, ih);
      ctx.restore();
    }
    ctx.restore();
  }

  /** feiner Staub nah an der Spielebene: zieht beim Flug sichtbar vorbei (Gefühl für Tempo) */
  private drawMotes(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, zoom: number, t: number): void {
    const E = 1.2, s = 1 / (1 / Math.max(0.02, zoom) + E), cell = 900;
    const x0 = cx - w / 2 / s, x1 = cx + w / 2 / s, y0 = cy - h / 2 / s, y1 = cy + h / 2 / s;
    const i0 = Math.floor(x0 / cell), i1 = Math.floor(x1 / cell), j0 = Math.floor(y0 / cell), j1 = Math.floor(y1 / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 2500) return;
    const { rgb, n } = this.theme.motes;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let q = 0; q < n; q++) {
      const k = this.seed * 17 + q;
      const wx = (i + hash(i, j, k, 7)) * cell, wy = (j + hash(i, j, k, 8)) * cell;
      const sx = (wx - cx) * s + w / 2, sy = (wy - cy) * s + h / 2;
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
      const b = hash(i, j, k, 9), tw = 0.6 + 0.4 * Math.sin(t * (1 + b * 2) + b * 20);
      const r = 0.6 + b * 1.4;
      ctx.fillStyle = `rgba(${rgb},${(0.12 + b * 0.3) * tw})`;
      ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
    }
  }
}
