// Sektorhintergrund aus mehreren Bildebenen (src/assets/szenen/<sektor>/*.webp, aufbereitet mit scripts/import-scene.mjs)
// plus gezeichneten Effekten. Jede Ebene hat ihre Tiefe – beim Verschieben der Karte gleiten nahe Ebenen weiter als ferne.
// Die Anordnung richtet sich nach dem Bildschirm (nicht nach einem festen 16:9-Bild): Jedes Objekt hat eine eigene Lage
// im Hoch- und im Querformat, ganzflächige Ebenen werden im Hochformat auf Wunsch gedreht, die Mitte bleibt für die Karte.
// Ebenen aus demselben 16:9-Rahmen (z. B. Station und ihre Verkehrslichter) bekommen denselben Anker und dieselbe Breite
// und liegen so deckungsgleich.

import { stormNow } from '../engine/phenomena';

const FILES = import.meta.glob('../assets/szenen/*/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URLS: Record<string, Record<string, string>> = {};
/** Gesamtbilder (src/assets/sektoren/<sektor>.jpg): Vorlage für den Himmelston unter allen Ebenen */
const COMPOSITES = import.meta.glob('../assets/sektoren/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const COMPOSITE: Record<string, string> = {};
for (const [path, url] of Object.entries(COMPOSITES)) { const m = path.match(/sektoren\/([^/]+)\.jpg$/); if (m) COMPOSITE[m[1]] = url; }
for (const [path, url] of Object.entries(FILES)) {
  const m = path.match(/szenen\/([^/]+)\/([^/]+)\.webp$/);
  if (m) (URLS[m[1]] ??= {})[m[2]] = url;
}

type Pt = [number, number];
type Blend = 'source-over' | 'lighter' | 'screen';

/** Ganzflächige Ebene (deckt den Bildschirm samt Spielraum für die Parallaxe) */
interface Cover {
  cover: string; depth: number;
  /** im Hochformat um 90° gedreht (Nebel, Staub – nichts mit „oben“ und „unten“) */
  turn?: boolean;
  /** Bildausschnitt im Hochformat ohne Drehung: waagrechte Lage 0…1 des sichtbaren Streifens */
  focus?: number;
  scale?: number; alpha?: number; blend?: Blend;
  /** atmen: Deckkraft schwingt; treiben: Ebene gleitet langsam hin und her */
  breathe?: number; drift?: number;
}
/** Einzelnes Objekt: Anker im Bild (Anteile) liegt an der Bildschirmstelle p (hoch) bzw. l (quer) */
interface Sprite {
  img: string; id?: string; depth: number;
  at?: Pt; p: Pt; l: Pt;
  /** Bildbreite relativ zur kürzeren Bildschirmseite (wl: im Querformat) */
  w: number; wl?: number;
  rot?: number; rotL?: number; spin?: number;
  /** Drehung um ein Objekt (id) statt eigener Lage – für Plasma an der Sonne */
  on?: string;
  alpha?: number; blend?: Blend; dark?: number;
  /** Flackern: Stärke und Tempo; Puls: Größe schwingt leicht */
  flicker?: [number, number]; pulse?: number; bob?: number;
  /** im Dunst versinken: Rand weich auslaufen lassen (Anteil der Bildbreite) und in Farbe rgb einfärben (Anteil a) */
  veil?: { soft: number; rgb: string; a: number };
  /** Ober- und Unterkante weich ausblenden (Anteil der Bildhöhe) – für Bauten, die im Hochformat nicht bis zum Rand reichen */
  fadeY?: number;
}
/** Gezeichnete Effekte */
type Effect =
  | { fx: 'twinkle'; n: number; rgb: string; depth: number }
  | { fx: 'glow'; on: string; r: number; rgb: string; a: number; pulse?: number; rays?: number }
  | { fx: 'sparks'; on: string; n: number; rgb: string; dirP: number; dirL: number; spread: number; speed: number }
  | { fx: 'motes'; n: number; rgb: string; depth: number; vx: number; vy: number; size: number; a: number }
  | { fx: 'haze'; rgb: string; a: number; n: number }
  | { fx: 'traffic'; on: string; n: number; rx: number; ry: number }
  | { fx: 'glimmer'; on: string; r: number; rgb: string; every: number }
  | { fx: 'beat'; on: string; rgb: string; period: number; r: number }
  | { fx: 'vignette'; rgb: string; a: number }
  /** Staubschwaden, die über einem Objekt (vor allem seinem Rand) treiben und seine Kontur verwischen */
  | { fx: 'shroud'; on: string; n: number; rgb: string; a: number; r: number }
  /** Magnetfeldlinien: leuchtende Schlangenlinien, die langsam von der Sonne weg wandern (im Sturm stärker) */
  | { fx: 'flux'; on: string; n: number; rgb: string; dirP: number; dirL: number; spread: number }
  /** Strahlungssturm (nur während er im Spiel tobt): rötlicher, unruhiger Schleier mit Blitzen */
  | { fx: 'storm'; on: string };
type Item = Cover | Sprite | Effect;

const SCENES: Record<string, Item[]> = {
  // Familie Tkr: Werft im Erzgürtel, an der Pier ein halb beplankter Frachter; fern eine kleine orange Sonne
  tkr: [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 90, rgb: '255,220,190', depth: 0.2 },
    { cover: 'staub', depth: 0.3, turn: true, scale: 1.14, breathe: 0.07, drift: 0.015 },
    { img: 'sonne', id: 'sonne', depth: 0.3, p: [0.74, 0.12], l: [0.68, 0.14], w: 0.16, wl: 0.13, pulse: 0.02 },
    { fx: 'glow', on: 'sonne', r: 0.9, rgb: '255,140,70', a: 0.3, pulse: 0.05 },
    { img: 'erz-rechts', depth: 0.55, p: [0.84, 0.5], l: [0.78, 0.4], w: 0.16, wl: 0.14, rot: 0.4, spin: 0.01, dark: 0.3 },
    { img: 'erz-links', depth: 0.5, p: [0.3, 0.58], l: [0.72, 0.66], w: 0.1, wl: 0.1, rot: 2.2, spin: -0.012, dark: 0.4 },
    { img: 'werft', id: 'werft', depth: 0.65, at: [0, 0.5], p: [-0.06, 0.25], l: [0, 0.5], w: 1.35, wl: 1.5, bob: 0.003, fadeY: 0.2 },
    { img: 'lichter', depth: 0.65, at: [0, 0.5], p: [-0.06, 0.25], l: [0, 0.5], w: 1.35, wl: 1.5, bob: 0.003, fadeY: 0.2, blend: 'lighter', flicker: [0.35, 2.4] },
    { fx: 'traffic', on: 'werft', n: 9, rx: 0.26, ry: 0.18 },
    { img: 'erz-links', depth: 1.25, p: [0.02, 0.88], l: [0.02, 0.8], w: 0.62, wl: 0.62, rot: 0.15, spin: 0.003, dark: 0.08 },
    { img: 'erz-rechts', depth: 1.2, p: [1.04, 0.64], l: [0.99, 0.46], w: 0.55, wl: 0.7, rot: -0.3, spin: -0.003, dark: 0.08 },
    { img: 'erz-rechts', depth: 0.9, p: [0.7, 0.96], l: [0.82, 0.92], w: 0.2, wl: 0.22, rot: 1.3, spin: 0.008, dark: 0.25 },
    { fx: 'motes', n: 70, rgb: '200,150,110', depth: 1.15, vx: -0.004, vy: 0.002, size: 1.2, a: 0.3 },
    { fx: 'vignette', rgb: '4,3,4', a: 0.5 },
  ],
  // Tharka's Cascade XV: Gasraffinerie zwischen Wasserstoff, Helium und Methan; die Sonne nur am Rand
  cascade: [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 80, rgb: '210,220,235', depth: 0.2 },
    { img: 'stern', id: 'stern', depth: 0.25, p: [0.02, 0.02], l: [0.04, 0.0], w: 0.55, wl: 0.42, spin: 0.003, pulse: 0.02 },
    { fx: 'glow', on: 'stern', r: 0.6, rgb: '255,160,80', a: 0.3, pulse: 0.05 },
    { cover: 'strahlen', depth: 0.3, focus: 0, scale: 1.08, blend: 'lighter', breathe: 0.12 },
    { cover: 'wasserstoff', depth: 0.35, turn: true, scale: 1.12, breathe: 0.07, drift: 0.02 },
    { cover: 'helium', depth: 0.4, turn: true, scale: 1.14, breathe: 0.06, drift: -0.015 },
    { cover: 'methan', depth: 0.45, turn: true, scale: 1.16, breathe: 0.08, drift: 0.02 },
    { img: 'raffinerie', id: 'raffinerie', depth: 0.65, p: [0.36, 0.2], l: [0.24, 0.5], w: 0.72, wl: 0.82, bob: 0.004 },
    { fx: 'traffic', on: 'raffinerie', n: 7, rx: 0.36, ry: 0.26 },
    { fx: 'motes', n: 60, rgb: '160,180,200', depth: 1.15, vx: -0.006, vy: 0.001, size: 1.1, a: 0.28 },
    { fx: 'vignette', rgb: '2,3,5', a: 0.55 },
  ],
  // Heart of Acrimony II: Komet über dem Eisfeld, rechts der Wohnzylinder der Siedler
  hoa: [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 120, rgb: '200,225,255', depth: 0.2 },
    { cover: 'methan', depth: 0.3, turn: true, scale: 1.14, breathe: 0.08, drift: 0.015 },
    { img: 'schweif', depth: 0.35, at: [0.64, 0.21], p: [0.7, 0.14], l: [0.6, 0.2], w: 1.35, wl: 1.85, blend: 'lighter', flicker: [0.12, 0.7] },
    { img: 'kopf', id: 'kopf', depth: 0.35, p: [0.72, 0.14], l: [0.615, 0.2], w: 0.15, wl: 0.13, pulse: 0.015 },
    { fx: 'glow', on: 'kopf', r: 0.8, rgb: '150,200,255', a: 0.35, pulse: 0.08 },
    { img: 'eis-mittel', depth: 0.6, p: [0.16, 0.4], l: [0.2, 0.5], w: 0.17, wl: 0.2, rot: 0.3, spin: 0.008, dark: 0.2 },
    { img: 'splitter', depth: 0.7, p: [0.08, 0.56], l: [0.34, 0.66], w: 0.12, wl: 0.12, rot: -0.4, spin: -0.015, dark: 0.15 },
    { img: 'zylinder', id: 'zylinder', depth: 0.7, at: [1, 0.62], p: [1.08, 0.76], l: [1.02, 0.72], w: 1.5, wl: 1.6, bob: 0.003, fadeY: 0.15 },
    { img: 'fenster', depth: 0.7, at: [1, 0.62], p: [1.08, 0.76], l: [1.02, 0.72], w: 1.5, wl: 1.6, bob: 0.003, fadeY: 0.15, blend: 'lighter', flicker: [0.25, 1.6] },
    { fx: 'traffic', on: 'zylinder', n: 6, rx: 0.3, ry: 0.15 },
    { img: 'scholle', depth: 1.0, p: [0.5, 0.95], l: [0.52, 0.93], w: 0.36, wl: 0.32, rot: 0.2, spin: 0.004, dark: 0.12 },
    { img: 'eis-gross', depth: 1.25, p: [-0.02, 0.86], l: [0.05, 0.82], w: 0.62, wl: 0.72, rot: 0.1, spin: -0.003, dark: 0.06 },
    { fx: 'motes', n: 90, rgb: '190,220,240', depth: 1.15, vx: 0.005, vy: 0.002, size: 1.1, a: 0.32 },
    { fx: 'vignette', rgb: '2,5,6', a: 0.5 },
  ],
  // Zyarth's Dominion I: Thronstation über der Thronwelt, links die Werft, Eskorten auf Patrouille
  zyarth: [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 120, rgb: '255,225,190', depth: 0.2 },
    { cover: 'dunst', depth: 0.3, turn: true, scale: 1.14, breathe: 0.07, drift: 0.015 },
    { img: 'thronwelt', id: 'welt', depth: 0.35, p: [0.95, 1.02], l: [0.98, 1.15], w: 1.7, wl: 2.5, spin: 0.0004 },
    { fx: 'glow', on: 'welt', r: 0.55, rgb: '255,130,60', a: 0.18, pulse: 0.03 },
    { img: 'arsenal', depth: 0.45, p: [0.5, 0.09], l: [0.29, 0.22], w: 0.26, wl: 0.36, dark: 0.2, bob: 0.003 },
    { cover: 'verkehr', depth: 0.5, focus: 0.45, scale: 1.05, blend: 'lighter', breathe: 0.15 },
    { img: 'werft', id: 'werft', depth: 0.6, p: [0.14, 0.2], l: [0.11, 0.5], w: 0.58, wl: 0.74, bob: 0.003 },
    { fx: 'traffic', on: 'werft', n: 8, rx: 0.3, ry: 0.18 },
    { img: 'thronstation', id: 'thron', depth: 0.7, p: [0.8, 0.36], l: [0.8, 0.5], w: 0.66, wl: 0.86, bob: 0.004 },
    { fx: 'glow', on: 'thron', r: 0.22, rgb: '255,190,90', a: 0.2, pulse: 0.2 },
    { fx: 'traffic', on: 'thron', n: 10, rx: 0.24, ry: 0.3 },
    { img: 'korvette', depth: 0.8, p: [0.6, 0.15], l: [0.6, 0.2], w: 0.14, wl: 0.12, bob: 0.01 },
    { img: 'fregatte', depth: 0.85, p: [0.9, 0.62], l: [0.95, 0.34], w: 0.15, wl: 0.13, bob: 0.012 },
    { img: 'jaeger', depth: 0.9, p: [0.14, 0.62], l: [0.62, 0.84], w: 0.14, wl: 0.12, bob: 0.014 },
    { fx: 'motes', n: 50, rgb: '255,190,130', depth: 1.15, vx: 0.003, vy: -0.001, size: 1, a: 0.25 },
    { fx: 'vignette', rgb: '5,3,2', a: 0.5 },
  ],
  // Familie Zhin: Werft nach dem Xenon-Angriff – zwei Docks ausgebrannt, eines in Betrieb; Wracks treiben, rechts der Mond
  zhin: [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 120, rgb: '200,230,255', depth: 0.2 },
    { cover: 'nebel', depth: 0.3, turn: true, scale: 1.14, breathe: 0.07 },
    { img: 'mond', id: 'mond', depth: 0.3, p: [1.02, 0.6], l: [0.97, 0.32], w: 0.62, wl: 0.62, rot: 0.2, spin: 0.0006 },
    { img: 'container', depth: 0.55, p: [0.62, 0.2], l: [0.66, 0.2], w: 0.11, rot: 0.6, spin: 0.012, dark: 0.15 },
    { img: 'wrack-mitte', depth: 0.6, p: [0.86, 0.3], l: [0.78, 0.26], w: 0.34, wl: 0.3, rot: -0.35, spin: -0.003, dark: 0.1 },
    { img: 'werft', id: 'werft', depth: 0.65, at: [0, 0.5], p: [-0.04, 0.24], l: [0, 0.5], w: 1.3, wl: 1.55, bob: 0.003, fadeY: 0.22 },
    { img: 'lichter', depth: 0.65, at: [0, 0.5], p: [-0.04, 0.24], l: [0, 0.5], w: 1.3, wl: 1.55, bob: 0.003, fadeY: 0.22, blend: 'lighter', flicker: [0.3, 1.9] },
    { fx: 'traffic', on: 'werft', n: 8, rx: 0.32, ry: 0.22 },
    { img: 'wrack-heck', depth: 0.9, p: [0.88, 0.8], l: [0.84, 0.78], w: 0.3, wl: 0.26, rot: 0.5, spin: 0.004, dark: 0.1 },
    { img: 'wrack-bruecke', depth: 1.15, p: [0.1, 0.9], l: [0.62, 0.92], w: 0.24, wl: 0.2, rot: -0.8, spin: -0.006, dark: 0.15 },
    { fx: 'motes', n: 60, rgb: '170,200,220', depth: 1.15, vx: 0.004, vy: 0.002, size: 1.1, a: 0.3 },
    { fx: 'vignette', rgb: '2,8,16', a: 0.45 },
  ],
  // Horchposten der Familie Rhy: still, kalt, verlassen – das tote Tor im Hintergrund glimmt ab und zu
  'f-ausblick': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 110, rgb: '220,225,255', depth: 0.2 },
    { cover: 'nebel', depth: 0.3, focus: 0.3, scale: 1.12, breathe: 0.06 },
    { img: 'tor', id: 'tor', depth: 0.4, p: [0.74, 0.21], l: [0.82, 0.26], w: 0.6, wl: 0.55, rot: -0.35, spin: 0.0015, dark: 0.15 },
    { fx: 'glimmer', on: 'tor', r: 0.28, rgb: '255,110,70', every: 11 },
    { img: 'horchposten', id: 'posten', depth: 0.65, at: [0.54, 0.5], p: [0.14, 0.64], l: [0.64, 0.55], w: 0.42, wl: 0.5, rot: 0.05, bob: 0.008 },
    { fx: 'glow', on: 'posten', r: 0.06, rgb: '255,170,90', a: 0.18, pulse: 0.3 },
    { fx: 'motes', n: 40, rgb: '210,190,180', depth: 1.1, vx: 0.004, vy: -0.002, size: 1.2, a: 0.25 },
    { fx: 'vignette', rgb: '4,2,4', a: 0.6 },
  ],
  // Glutsee I: junger Stern, Plasmaströme, glühender Wasserstoff
  'f-glut1': [
    { cover: 'sterne', depth: 0.12, turn: true, scale: 1.12 },
    { fx: 'twinkle', n: 140, rgb: '255,215,180', depth: 0.25 },
    { cover: 'nebel', depth: 0.3, turn: true, scale: 1.16, alpha: 0.95, breathe: 0.08 },
    { img: 'sonne', id: 'sonne', depth: 0.45, p: [0.9, 0.2], l: [0.92, 0.2], w: 0.72, wl: 0.6, spin: 0.004, pulse: 0.025 },
    { fx: 'glow', on: 'sonne', r: 0.7, rgb: '255,170,80', a: 0.5, pulse: 0.06, rays: 14 },
    { img: 'plasma', on: 'sonne', depth: 0.45, at: [0.99, 0.03], p: [0, 0], l: [0, 0], w: 1.75, wl: 1.45, rot: 0.62, rotL: 0.05, blend: 'lighter', flicker: [0.22, 1.3] },
    { fx: 'sparks', on: 'sonne', n: 60, rgb: '255,150,70', dirP: 2.25, dirL: 2.9, spread: 0.55, speed: 1 },
    { fx: 'flux', on: 'sonne', n: 7, rgb: '255,150,80', dirP: 2.25, dirL: 2.9, spread: 1.1 },
    { fx: 'storm', on: 'sonne' },
    { img: 'fels-b', depth: 1.35, p: [0.0, 0.8], l: [0.04, 0.88], w: 0.46, rot: 0.4, spin: 0.006, dark: 0.12 },
    { img: 'fels-a', depth: 1.2, p: [1.02, 0.72], l: [0.97, 0.8], w: 0.42, rot: -0.3, spin: -0.008, dark: 0.08 },
    { img: 'fels-a', depth: 0.85, p: [0.16, 0.68], l: [0.12, 0.6], w: 0.13, rot: 1.6, spin: 0.012, dark: 0.35 },
    { img: 'fels-b', depth: 1.05, p: [0.86, 0.97], l: [0.8, 0.95], w: 0.2, rot: 2.2, spin: -0.01, dark: 0.25 },
    { img: 'fels-b', depth: 0.7, p: [0.72, 0.62], l: [0.62, 0.72], w: 0.07, rot: 0.9, spin: 0.02, dark: 0.5 },
    { img: 'fels-a', depth: 0.75, p: [0.3, 0.86], l: [0.3, 0.9], w: 0.05, rot: 0.2, spin: 0.03, dark: 0.45 },
    { img: 'fels-a', depth: 0.8, p: [0.93, 0.5], l: [0.7, 0.45], w: 0.045, rot: 2.1, spin: 0.02, dark: 0.45 },
    { fx: 'vignette', rgb: '8,2,2', a: 0.55 },
  ],
  // Die Aschefelder: zerbrochener Mond, Staub, schwaches rotes Sonnenlicht
  'f-asche': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 60, rgb: '230,200,180', depth: 0.2 },
    { img: 'sonne', id: 'sonne', depth: 0.25, p: [0.78, 0.17], l: [0.8, 0.14], w: 0.5, wl: 0.4, pulse: 0.015 },
    { fx: 'glow', on: 'sonne', r: 0.5, rgb: '255,90,60', a: 0.35, pulse: 0.05 },
    { img: 'mond', id: 'mond', depth: 0.35, p: [0.12, 0.2], l: [0.16, 0.22], w: 0.95, wl: 0.75, rot: -0.15, spin: 0.0008, veil: { soft: 0.05, rgb: '120,82,60', a: 0.22 } },
    { fx: 'shroud', on: 'mond', n: 16, rgb: '118,86,66', a: 0.22, r: 0.52 },
    { cover: 'staub', depth: 0.5, turn: true, scale: 1.18, alpha: 0.9, drift: 0.025, breathe: 0.06 },
    { fx: 'haze', rgb: '120,90,70', a: 0.1, n: 6 },
    { cover: 'truemmer', depth: 0.8, turn: true, scale: 1.2, drift: 0.04 },
    { img: 'fels-a', depth: 1.35, p: [0.02, 0.84], l: [0.06, 0.86], w: 0.55, wl: 0.45, rot: 0.2, spin: 0.004, dark: 0.1 },
    { img: 'fels-b', depth: 1.2, p: [1.0, 0.66], l: [0.96, 0.62], w: 0.5, wl: 0.4, rot: -0.5, spin: -0.005, dark: 0.1 },
    { img: 'fels-b', depth: 0.9, p: [0.82, 0.93], l: [0.72, 0.92], w: 0.16, rot: 1.4, spin: 0.012, dark: 0.35 },
    { img: 'fels-a', depth: 0.75, p: [0.22, 0.6], l: [0.3, 0.78], w: 0.08, rot: 2.4, spin: -0.02, dark: 0.45 },
    { fx: 'motes', n: 90, rgb: '190,150,120', depth: 1.2, vx: 0.012, vy: 0.003, size: 1.3, a: 0.35 },
    { fx: 'vignette', rgb: '6,4,3', a: 0.6 },
  ],
  // Familie Rhak: Handelsstation vor dem Gasriesen, Verkehr ringsum
  'f-rhak': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 90, rgb: '255,220,190', depth: 0.2 },
    { img: 'gasriese', id: 'riese', depth: 0.25, at: [0.63, 0.48], p: [0.74, 0.2], l: [0.8, 0.32], w: 1.6, wl: 1.25, rot: -0.08 },
    { cover: 'nebel', depth: 0.4, turn: true, scale: 1.14, breathe: 0.07 },
    { img: 'station', id: 'station', depth: 0.6, at: [0.5, 0.5], p: [0.56, 0.75], l: [0.78, 0.72], w: 1.05, wl: 0.8, bob: 0.004 },
    { img: 'lichter', depth: 0.6, at: [0.5, 0.5], p: [0.56, 0.75], l: [0.78, 0.72], w: 1.05, wl: 0.8, bob: 0.004, blend: 'lighter', flicker: [0.35, 2.1] },
    { fx: 'traffic', on: 'station', n: 14, rx: 0.55, ry: 0.16 },
    { fx: 'motes', n: 30, rgb: '255,190,140', depth: 1.1, vx: -0.003, vy: 0.001, size: 1, a: 0.25 },
    { fx: 'vignette', rgb: '6,3,2', a: 0.55 },
  ],
  // Der Schmiedestern: Pulsar mit kreisenden Strahlen im zerbrochenen Kollektorring
  'f-schmiede': [
    { cover: 'sterne', depth: 0.1, turn: true, scale: 1.1 },
    { fx: 'twinkle', n: 120, rgb: '200,220,255', depth: 0.2 },
    { cover: 'nebel', depth: 0.3, turn: true, scale: 1.14, breathe: 0.07 },
    { img: 'staub', depth: 0.4, at: [0.5, 0.5], p: [0.5, 0.28], l: [0.5, 0.45], w: 2.4, wl: 1.9, rot: 0, spin: 0.05, blend: 'lighter', alpha: 0.8 },
    { img: 'strahlen', depth: 0.4, at: [0.495, 0.48], p: [0.5, 0.28], l: [0.5, 0.45], w: 2.6, wl: 2.0, spin: 0.05, blend: 'lighter', flicker: [0.3, 4.8] },
    { img: 'ring', id: 'ring', depth: 0.45, at: [0.5, 0.5], p: [0.5, 0.28], l: [0.5, 0.45], w: 1.15, wl: 0.95, spin: 0.002 },
    { img: 'kern', id: 'kern', depth: 0.4, p: [0.5, 0.28], l: [0.5, 0.45], w: 0.55, wl: 0.45, blend: 'lighter', pulse: 0.08 },
    { fx: 'beat', on: 'kern', rgb: '150,200,255', period: 1.3, r: 0.4 },
    { fx: 'motes', n: 70, rgb: '255,180,110', depth: 1.15, vx: 0.003, vy: -0.004, size: 1.1, a: 0.35 },
    { fx: 'vignette', rgb: '2,3,8', a: 0.6 },
  ],
};

export const hasScene = (sectorId: string): boolean => !!SCENES[sectorId] && !!URLS[sectorId];

const images = new Map<string, HTMLImageElement>();
/** Fertig entschlüsselte Bilder: Erst die zeichnen wir – sonst entschlüsselt drawImage im ersten Bild und das Spiel ruckt */
const decoded = new WeakSet<HTMLImageElement>();
function image(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    const im = new Image();
    im.src = url;
    images.set(url, im);
    im.decode().then(() => decoded.add(im), () => { if (im.naturalWidth) decoded.add(im); });
    img = im;
  }
  return decoded.has(img) && img.naturalWidth ? img : null;
}

/** Ebenen eines Sektors schon laden, bevor er sichtbar wird (z. B. während des Intros) */
export function preloadScene(sectorId: string): void {
  ready(sectorId);
  if (SCENES[sectorId]) skyOf(sectorId);
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

/** Zufallswerte je Sektor und Effekt (fest, damit nichts springt) */
const rnd = new Map<string, number[]>();
function randoms(key: string, n: number): number[] {
  let r = rnd.get(key);
  if (r && r.length >= n) return r;
  let seed = 11;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  r = Array.from({ length: n }, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
  rnd.set(key, r);
  return r;
}

/** Hat das Bild keine (nennenswert) durchsichtigen Stellen? Dann ist es eine Ebene auf Schwarz */
const opaqueCache = new Map<HTMLImageElement, boolean>();
function opaque(img: HTMLImageElement): boolean {
  let v = opaqueCache.get(img);
  if (v !== undefined) return v;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 240) clear++;
  v = clear < 20;
  opaqueCache.set(img, v);
  return v;
}

/** Himmelston: Gesamtbild verkleinert und stark weichgezeichnet (einmal je Sektor berechnet) */
const skies = new Map<string, HTMLCanvasElement | null>();
function skyOf(sectorId: string): HTMLCanvasElement | null {
  if (skies.has(sectorId)) return skies.get(sectorId)!;
  const url = COMPOSITE[sectorId];
  if (!url) { skies.set(sectorId, null); return null; }
  const img = image(url);
  if (!img) return null;
  const w = 480, h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  // Grundfarbe des Sektors (Mittelwert des Gesamtbilds) als Untergrenze: Auch wo das Gesamtbild fast schwarz ist,
  // bleibt ein Hauch Farbe – der Himmel wird nie ganz schwarz
  g.drawImage(img, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let r = 0, gr = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
  const top = Math.max(r, gr, b, 1), FLOOR = 40;
  g.fillStyle = `rgb(${(r / top) * FLOOR},${(gr / top) * FLOOR},${(b / top) * FLOOR})`;
  g.fillRect(0, 0, w, h);
  // weichgezeichnet und etwas über den Rand hinaus, damit die Kanten nicht nach Schwarz auslaufen
  g.globalCompositeOperation = 'lighten';
  g.filter = 'blur(18px)';
  g.drawImage(img, -40, -40, w + 80, h + 80);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  skies.set(sectorId, c);
  return c;
}

/** Bild mit weich ausgeblendeter Ober- und Unterkante (einmal berechnet, in voller Auflösung) */
const fades = new Map<HTMLImageElement, HTMLCanvasElement>();
function fadedY(img: HTMLImageElement, f: number): HTMLCanvasElement {
  let c = fades.get(img);
  if (c) return c;
  const W = img.naturalWidth, H = img.naturalHeight;
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(f, 'rgba(0,0,0,1)');
  gr.addColorStop(1 - f, 'rgba(0,0,0,1)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  fades.set(img, c);
  return c;
}

/** Bild mit weich auslaufendem Rand und Dunstfarbe (einmal berechnet, in voller Auflösung) */
const veils = new Map<HTMLImageElement, HTMLCanvasElement>();
function veiled(img: HTMLImageElement, v: { soft: number; rgb: string; a: number }): HTMLCanvasElement {
  let c = veils.get(img);
  if (c) return c;
  const W = img.naturalWidth, H = img.naturalHeight;
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  // Dunstfarbe über das Bild legen (nur wo es deckt)
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(${v.rgb},${v.a})`;
  g.fillRect(0, 0, W, H);
  // Kontur auflösen: Deckkraft mit einer stark geglätteten, nach innen geschrumpften Kopie der Form multiplizieren
  const m = document.createElement('canvas');
  m.width = W; m.height = H;
  const mg = m.getContext('2d')!;
  const blur = Math.round(W * v.soft);
  mg.filter = `blur(${blur}px)`;
  const k = 1 - v.soft * 1.2;
  mg.drawImage(img, (W * (1 - k)) / 2, (H * (1 - k)) / 2, W * k, H * k);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(m, 0, 0);
  veils.set(img, c);
  return c;
}

const isCover = (i: Item): i is Cover => 'cover' in i;
const isSprite = (i: Item): i is Sprite => 'img' in i;

/**
 * Szene zeichnen. fx/fz: Kameralage −1…1 (Parallaxe), t: Zeit in Sekunden. Liefert false, solange Ebenen laden.
 */
export function drawScene(ctx: CanvasRenderingContext2D, sectorId: string, W: number, H: number, fx: number, fz: number, t: number): boolean {
  const items = SCENES[sectorId];
  const L = ready(sectorId);
  ctx.fillStyle = '#040305';
  ctx.fillRect(0, 0, W, H);
  if (!items || !L) return false;
  const portrait = H > W;
  const S = Math.max(W, H), s = Math.min(W, H);
  const pan = (depth: number): Pt => [-fx * depth * S * 0.06, -fz * depth * S * 0.06];
  /** Bildschirmlage und Größe der Objekte (für Effekte, die sich auf sie beziehen) */
  const where: Record<string, { x: number; y: number; w: number }> = {};
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Himmelston aus dem Gesamtbild: stark weichgezeichnet als unterste Ebene – so wird der Himmel nie schwarz, auch wo
  // Sterne und Nebel (auf Schwarz geliefert) nichts zeigen
  const sky = skyOf(sectorId);
  if (sky) {
    const [px, py] = pan(0.05);
    const turn = portrait;
    const iw = sky.width, ih = sky.height;
    const k = Math.max(W / (turn ? ih : iw), H / (turn ? iw : ih)) * 1.15;
    ctx.save();
    ctx.translate(W / 2 + px, H / 2 + py);
    if (turn) ctx.rotate(-Math.PI / 2);
    ctx.drawImage(sky, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    ctx.restore();
  }

  items.forEach((it, idx) => {
    const key = `${sectorId}:${idx}`;
    if (isCover(it)) {
      const img = L[it.cover];
      if (!img) return;
      const [px, py] = pan(it.depth);
      const turn = portrait && !!it.turn;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const rw = turn ? ih : iw, rh = turn ? iw : ih;
      const k = Math.max(W / rw, H / rh) * (it.scale ?? 1.1);
      const drift = it.drift ? Math.sin(t * 0.05 + idx) * it.drift * S : 0;
      // ohne Drehung im Hochformat: gewählten Streifen zeigen
      const shift = portrait && !turn && it.focus !== undefined ? (0.5 - it.focus) * iw * k : 0;
      ctx.save();
      ctx.globalAlpha = (it.alpha ?? 1) * (1 - (it.breathe ?? 0) + (it.breathe ?? 0) * Math.sin(t * 0.21 + idx));
      // Ebenen ohne Transparenz (Sterne, Nebel auf Schwarz) hellen nur auf – ihr Schwarz verdeckt den Himmel nicht
      ctx.globalCompositeOperation = it.blend ?? (opaque(img) ? 'screen' : 'source-over');
      ctx.translate(W / 2 + px + drift + shift, H / 2 + py);
      if (turn) ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
      ctx.restore();
      return;
    }
    if (isSprite(it)) {
      const img = L[it.img];
      if (!img) return;
      const [px, py] = pan(it.depth);
      const base = it.on ? where[it.on] : undefined;
      const [ax, ay] = portrait ? it.p : it.l;
      const x = base ? base.x : ax * W + px;
      const y0 = base ? base.y : ay * H + py;
      const bob = it.bob ? Math.sin(t * 0.3 + idx * 1.7) * it.bob * s : 0;
      const y = y0 + bob;
      const pulse = it.pulse ? 1 + it.pulse * (0.6 * Math.sin(t * 0.9 + idx) + 0.4 * Math.sin(t * 2.3)) : 1;
      const w = (portrait ? it.w : it.wl ?? it.w * 0.85) * s * pulse;
      const h = (w * img.naturalHeight) / img.naturalWidth;
      const [cx, cy] = it.at ?? [0.5, 0.5];
      if (it.id) where[it.id] = { x, y, w };
      ctx.save();
      ctx.globalCompositeOperation = it.blend ?? 'source-over';
      let a = it.alpha ?? 1;
      if (it.flicker) a *= 1 - it.flicker[0] * (0.5 + 0.5 * Math.sin(t * it.flicker[1] + idx) * Math.sin(t * it.flicker[1] * 2.7));
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.translate(x, y);
      ctx.rotate((portrait ? it.rot ?? 0 : it.rotL ?? it.rot ?? 0) + t * (it.spin ?? 0));
      if (it.dark) ctx.filter = `brightness(${(1 - it.dark).toFixed(2)})`;
      ctx.drawImage(it.veil ? veiled(img, it.veil) : it.fadeY && portrait ? fadedY(img, it.fadeY) : img, -cx * w, -cy * h, w, h);
      ctx.restore();
      return;
    }
    drawEffect(ctx, it, key, where, W, H, S, s, t, pan, portrait);
  });
  ctx.restore();
  return true;
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, key: string, where: Record<string, { x: number; y: number; w: number }>,
  W: number, H: number, S: number, s: number, t: number, pan: (d: number) => Pt, portrait: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  switch (e.fx) {
    case 'twinkle': {
      const r = randoms(key, e.n * 5);
      const [px, py] = pan(e.depth);
      for (let i = 0; i < e.n; i++) {
        const a = (0.25 + r[i * 5 + 3] * 0.6) * (0.55 + 0.45 * Math.sin(t * (0.4 + r[i * 5 + 4] * 1.6) + i));
        const x = ((r[i * 5] * W + px) % W + W) % W, y = ((r[i * 5 + 1] * H + py) % H + H) % H;
        ctx.fillStyle = `rgba(${e.rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.4 + r[i * 5 + 2] * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'glow': {
      const o = where[e.on];
      if (!o) break;
      const R = e.r * o.w * (1 + (e.pulse ?? 0) * Math.sin(t * 0.9));
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 2.5);
      g.addColorStop(0, `rgba(${e.rgb},${e.a})`);
      g.addColorStop(0.3, `rgba(${e.rgb},${(e.a * 0.4).toFixed(3)})`);
      g.addColorStop(1, `rgba(${e.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(o.x - R * 2.5, o.y - R * 2.5, R * 5, R * 5);
      // Strahlen, die sich langsam drehen
      for (let i = 0; i < (e.rays ?? 0); i++) {
        const n = e.rays!;
        const a = (i / n) * Math.PI * 2 + t * 0.012 + Math.sin(i * 7.3) * 0.2;
        const len = R * (1.3 + 0.8 * Math.abs(Math.sin(i * 3.1 + t * 0.15)));
        const w = R * (0.03 + 0.03 * Math.abs(Math.sin(i * 1.7)));
        const lg = ctx.createLinearGradient(o.x, o.y, o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
        lg.addColorStop(0, `rgba(${e.rgb},0.09)`);
        lg.addColorStop(1, `rgba(${e.rgb},0)`);
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(a + Math.PI / 2) * w, o.y + Math.sin(a + Math.PI / 2) * w);
        ctx.lineTo(o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
        ctx.lineTo(o.x + Math.cos(a - Math.PI / 2) * w, o.y + Math.sin(a - Math.PI / 2) * w);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'sparks': {
      const o = where[e.on];
      if (!o) break;
      for (let i = 0; i < e.n; i++) {
        const life = (t * (0.025 + (i % 7) * 0.004) * e.speed + i * 0.137) % 1;
        const ang = (portrait ? e.dirP : e.dirL) + Math.sin(i * 12.9) * e.spread;
        const dist = (0.1 + life * 1.1) * S * 0.75;
        const x = o.x + Math.cos(ang) * dist + Math.sin(t * 0.5 + i) * 6;
        const y = o.y + Math.sin(ang) * dist + Math.cos(t * 0.4 + i) * 6;
        const a = Math.sin(life * Math.PI) * (0.35 + 0.4 * ((i * 37) % 10) / 10);
        ctx.fillStyle = `rgba(${e.rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + ((i * 53) % 10) / 10 * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'motes': {
      // Staubkörner/Funken, die langsam durchs Bild treiben (wiederholt über den Rand)
      const r = randoms(key, e.n * 4);
      const [px, py] = pan(e.depth);
      for (let i = 0; i < e.n; i++) {
        const x = (((r[i * 4] + t * e.vx * (0.5 + r[i * 4 + 2])) % 1) + 1) % 1 * W + px;
        const y = (((r[i * 4 + 1] + t * e.vy * (0.5 + r[i * 4 + 2])) % 1) + 1) % 1 * H + py;
        const a = e.a * (0.4 + 0.6 * r[i * 4 + 3]) * (0.7 + 0.3 * Math.sin(t + i));
        ctx.fillStyle = `rgba(${e.rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, e.size * (0.5 + r[i * 4 + 2]), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'haze': {
      // Weiche Staubschwaden, die langsam ziehen
      ctx.globalCompositeOperation = 'source-over';
      const r = randoms(key, e.n * 3);
      for (let i = 0; i < e.n; i++) {
        const x = (((r[i * 3] + t * 0.004 * (0.5 + r[i * 3 + 2])) % 1.4) - 0.2) * W;
        const y = (0.15 + r[i * 3 + 1] * 0.7) * H;
        const R = (0.35 + r[i * 3 + 2] * 0.4) * S;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(${e.rgb},${e.a})`);
        g.addColorStop(1, `rgba(${e.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
      }
      break;
    }
    case 'traffic': {
      // Kleine Schiffe auf Bahnen um die Station: Positionslichter, die wandern und blinken
      const o = where[e.on];
      if (!o) break;
      const r = randoms(key, e.n * 3);
      for (let i = 0; i < e.n; i++) {
        const ang = t * (0.03 + r[i * 3] * 0.05) * (i % 2 ? 1 : -1) + r[i * 3 + 1] * Math.PI * 2;
        const rr = 0.6 + r[i * 3 + 2] * 0.5;
        const x = o.x + Math.cos(ang) * e.rx * o.w * rr, y = o.y + Math.sin(ang) * e.ry * o.w * rr;
        const blink = Math.sin(t * 3 + i * 2.1) > 0.6 ? 1 : 0.35;
        const col = i % 3 === 0 ? '255,90,70' : i % 3 === 1 ? '255,200,120' : '190,230,255';
        const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
        g.addColorStop(0, `rgba(${col},${(0.9 * blink).toFixed(2)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
      break;
    }
    case 'glimmer': {
      // Ein totes Tor, das ab und zu kurz aufglimmt
      const o = where[e.on];
      if (!o) break;
      const ph = (t % e.every) / e.every;
      const a = ph < 0.08 ? Math.sin((ph / 0.08) * Math.PI) * (0.6 + 0.4 * Math.sin(t * 40)) : 0;
      if (a <= 0) break;
      const R = e.r * o.w * 1.6;
      const g = ctx.createRadialGradient(o.x, o.y, R * 0.55, o.x, o.y, R);
      g.addColorStop(0, `rgba(${e.rgb},0)`);
      g.addColorStop(0.8, `rgba(${e.rgb},${(0.35 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${e.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(o.x - R, o.y - R, R * 2, R * 2);
      break;
    }
    case 'beat': {
      // Herzschlag des Pulsars: kurzer heller Lichtstoß im Takt
      const o = where[e.on];
      if (!o) break;
      const ph = (t % e.period) / e.period;
      const a = Math.exp(-ph * 9);
      const R = e.r * o.w * (1 + ph * 0.6) * 2;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
      g.addColorStop(0, `rgba(${e.rgb},${(0.5 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${e.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(o.x - R, o.y - R, R * 2, R * 2);
      break;
    }
    case 'storm': {
      if (!stormNow()) break;
      const o = where[e.on];
      if (!o) break;
      // rötlicher Schleier, der unruhig pulsiert, und gelegentliche Blitze
      ctx.globalCompositeOperation = 'source-over';
      const flash = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1) - 0.75) * 4;
      ctx.fillStyle = `rgba(255,70,30,${(0.1 + 0.05 * Math.sin(t * 1.7) + flash * 0.12).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'shroud': {
      // Weiche Schwaden auf einem Ring um die Objektmitte – dort, wo sonst die harte Kontur läge
      ctx.globalCompositeOperation = 'source-over';
      const o = where[e.on];
      if (!o) break;
      const r = randoms(key, e.n * 4);
      for (let i = 0; i < e.n; i++) {
        const ang = r[i * 4] * Math.PI * 2 + t * 0.006 * (i % 2 ? 1 : -1);
        const rad = o.w * e.r * (0.55 + r[i * 4 + 1] * 0.55);
        const x = o.x + Math.cos(ang) * rad + Math.sin(t * 0.05 + i) * o.w * 0.03;
        const y = o.y + Math.sin(ang) * rad + Math.cos(t * 0.04 + i * 1.3) * o.w * 0.03;
        const R = o.w * (0.16 + r[i * 4 + 2] * 0.2);
        const a = e.a * (0.55 + 0.45 * Math.sin(t * 0.12 + i * 2.3)) * (0.6 + 0.4 * r[i * 4 + 3]);
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(${e.rgb},${a.toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${e.rgb},${(a * 0.45).toFixed(3)})`);
        g.addColorStop(1, `rgba(${e.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
      }
      break;
    }
    case 'flux': {
      // Magnetfeldlinien: Bögen, die von der Sonne aus nach außen wachsen, sich langsam schlängeln und verblassen
      const o = where[e.on];
      if (!o) break;
      const storm = stormNow();
      const r = randoms(key, e.n * 4);
      const base = portrait ? e.dirP : e.dirL;
      const n = storm ? e.n * 2 : e.n;
      for (let i = 0; i < n; i++) {
        const j = i % e.n;
        const life = (t * (storm ? 0.03 : 0.018) * (0.7 + r[j * 4] * 0.6) + r[j * 4 + 1] + (i >= e.n ? 0.5 : 0)) % 1;
        const ang = base + (r[j * 4 + 2] - 0.5) * e.spread * 2;
        const len = S * (0.35 + 0.55 * life);
        const amp = S * (0.025 + r[j * 4 + 3] * 0.035);
        const waves = 2.2 + r[j * 4 + 3] * 1.6;
        const ph = t * 0.35 + i * 1.7;
        const fade = Math.sin(life * Math.PI);
        const a = fade * (storm ? 0.38 : 0.18);
        if (a < 0.01) continue;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const steps = 48;
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const d = o.w * 0.12 + u * len;
          // Ausschlag wächst nach außen, die Welle wandert die Linie entlang
          const off = Math.sin(u * waves * Math.PI * 2 - ph) * amp * u + Math.sin(u * 3 + i) * amp * 0.6 * u;
          const x = o.x + cs * d - sn * off, y = o.y + sn * d + cs * off;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        const lg = ctx.createLinearGradient(o.x, o.y, o.x + cs * (o.w * 0.12 + len), o.y + sn * (o.w * 0.12 + len));
        lg.addColorStop(0, `rgba(${e.rgb},0)`);
        lg.addColorStop(0.15, `rgba(${e.rgb},${a.toFixed(3)})`);
        lg.addColorStop(1, `rgba(${e.rgb},0)`);
        ctx.strokeStyle = lg;
        ctx.lineCap = 'round';
        // weicher Schein und heller Kern
        ctx.lineWidth = 7 + r[j * 4] * 6;
        ctx.globalAlpha = 0.25;
        ctx.stroke();
        ctx.lineWidth = 1.2 + r[j * 4 + 1] * 1.2;
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
      break;
    }
    case 'vignette': {
      ctx.globalCompositeOperation = 'source-over';
      const vg = ctx.createRadialGradient(W / 2, H / 2, s * 0.35, W / 2, H / 2, S * 0.75);
      vg.addColorStop(0, `rgba(${e.rgb},0)`);
      vg.addColorStop(1, `rgba(${e.rgb},${e.a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
  ctx.restore();
}
