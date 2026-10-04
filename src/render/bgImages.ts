// Bild-Hintergründe der Sektoren (Standard). Die erzeugten Himmel (sectorTheme.ts) bleiben als Alternative in den
// Einstellungen erhalten. Jedes Bild wird für die Parallaxe in zwei Ebenen zerlegt: Sterne (kleine helle Punkte auf
// dunklem Grund) und das übrige Bild, in dem an ihrer Stelle die Umgebung steht. In Ruhe ergeben beide genau das
// Originalbild; beim Verschieben gleiten die Sterne schneller als Nebel und Planeten.
import nebelRotTuerkis from '../assets/bg/nebel-rot-tuerkis.jpg';
import asteroidenGoldTuerkis from '../assets/bg/asteroiden-gold-tuerkis.jpg';
import planetBlau from '../assets/bg/planet-blau.jpg';
import asteroidenstromDunkel from '../assets/bg/asteroidenstrom-dunkel.jpg';
import nebelBlauMond from '../assets/bg/nebel-blau-mond.jpg';
import nebelRotTuerkis2 from '../assets/bg/nebel-rot-tuerkis-2.jpg';
import planetTuerkis from '../assets/bg/planet-tuerkis.jpg';
import nebelbandTuerkis from '../assets/bg/nebelband-tuerkis.jpg';
import asteroidenkette from '../assets/bg/asteroidenkette.jpg';
import asteroidenSonne from '../assets/bg/asteroiden-sonne.jpg';
import ringplanet from '../assets/bg/ringplanet.jpg';
import finsternis from '../assets/bg/finsternis.jpg';
import wirbelViolett from '../assets/bg/wirbel-violett.jpg';

export interface BgImage { id: string; name: string; url: string }

/** Alle Bilder in der Reihenfolge der Auswahl */
export const BG_IMAGES: BgImage[] = [
  { id: 'planet-tuerkis', name: 'Türkiser Planet', url: planetTuerkis },
  { id: 'asteroidenkette', name: 'Asteroidenkette', url: asteroidenkette },
  { id: 'nebelband-tuerkis', name: 'Türkises Nebelband', url: nebelbandTuerkis },
  { id: 'asteroidenstrom-dunkel', name: 'Dunkler Asteroidenstrom', url: asteroidenstromDunkel },
  { id: 'nebel-rot-tuerkis-2', name: 'Roter Nebel mit Mond', url: nebelRotTuerkis2 },
  { id: 'nebel-blau-mond', name: 'Blauer Nebel mit Mond', url: nebelBlauMond },
  { id: 'nebel-rot-tuerkis', name: 'Rot-türkiser Nebel', url: nebelRotTuerkis },
  { id: 'asteroiden-gold-tuerkis', name: 'Asteroiden Gold-Türkis', url: asteroidenGoldTuerkis },
  { id: 'planet-blau', name: 'Blauer Planetenrand', url: planetBlau },
  { id: 'asteroiden-sonne', name: 'Asteroiden im Sonnenlicht', url: asteroidenSonne },
  { id: 'ringplanet', name: 'Ringplanet', url: ringplanet },
  { id: 'finsternis', name: 'Finsternis', url: finsternis },
  { id: 'wirbel-violett', name: 'Violetter Wirbel', url: wirbelViolett },
];
const BY_ID = new Map(BG_IMAGES.map((b) => [b.id, b]));

/** Standard: jeder Sektor ein eigenes, eher dunkles Bild passend zu seinem Charakter */
const DEFAULT_BY_SECTOR: Record<string, string> = {
  zhin: 'planet-tuerkis',
  tkr: 'asteroidenkette',
  cascade: 'nebelband-tuerkis',
  ravine: 'asteroidenstrom-dunkel',
  rhy: 'nebel-rot-tuerkis-2',
  hoa: 'nebel-blau-mond',
  zyarth: 'nebel-rot-tuerkis',
};

const PICK_KEY = 'x4-sektorbau-bgpick';
let picks: Record<string, string> = loadPicks();

function loadPicks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PICK_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

/** Gewähltes Bild eines Sektors (eigene Wahl, sonst Standard) */
export function sectorImageId(sectorId: string): string | undefined {
  const id = picks[sectorId] ?? DEFAULT_BY_SECTOR[sectorId];
  return id && BY_ID.has(id) ? id : DEFAULT_BY_SECTOR[sectorId];
}

/** Nächstes/vorheriges Bild für einen Sektor wählen (dir = 1 oder −1), wird gespeichert */
export function stepSectorImage(sectorId: string, dir: number): void {
  const cur = BG_IMAGES.findIndex((b) => b.id === sectorImageId(sectorId));
  const next = BG_IMAGES[(cur + dir + BG_IMAGES.length) % BG_IMAGES.length];
  picks = { ...picks, [sectorId]: next.id };
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(picks));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function bgImageInfo(id: string | undefined): { name: string; index: number } | null {
  const i = BG_IMAGES.findIndex((b) => b.id === id);
  return i < 0 ? null : { name: BG_IMAGES[i].name, index: i };
}

export interface BgLayers { id: string; w: number; h: number; base: HTMLCanvasElement; stars: HTMLCanvasElement }

const images = new Map<string, HTMLImageElement>();
const layers = new Map<string, BgLayers>();

/**
 * Ebenen des Sektorbilds: null während es lädt, undefined wenn der Sektor kein Bild hat.
 * Das Zerlegen geschieht einmal je Bild.
 */
export function sectorLayers(sectorId: string): BgLayers | null | undefined {
  const id = sectorImageId(sectorId);
  const def = id ? BY_ID.get(id) : undefined;
  if (!def) return undefined;
  const hit = layers.get(def.id);
  if (hit) return hit;
  let img = images.get(def.id);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = def.url;
    images.set(def.id, img);
  }
  if (!img.complete || !img.naturalWidth) return null;
  const l = splitStars(def.id, img);
  layers.set(def.id, l);
  return l;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/**
 * Sterne herauslösen: Ein Punkt gilt als Stern, wenn er deutlich heller ist als seine nähere Umgebung, die Umgebung
 * dunkel ist und kaum weitere helle Punkte enthält (so bleiben Planetenränder, Sonnen und helle Nebel im Grundbild).
 * Grundbild = Original, an Sternen durch die weichgezeichnete Umgebung ersetzt; Sternebene = der Überschuss.
 */
function splitStars(id: string, img: HTMLImageElement): BgLayers {
  const w = img.naturalWidth, h = img.naturalHeight;
  const [oc, o] = canvas(w, h);
  o.drawImage(img, 0, 0);
  const orig = o.getImageData(0, 0, w, h);
  // Umgebung: weichgezeichnet (Sterne verschwinden darin)
  const [bc, bctx] = canvas(w, h);
  bctx.filter = 'blur(3px)';
  bctx.drawImage(img, 0, 0);
  const blur = bctx.getImageData(0, 0, w, h);
  const od = orig.data, bd = blur.data;
  const n = w * h;
  const lum = (d: Uint8ClampedArray, i: number) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  // 1. Kandidaten: heller als die Umgebung
  const [mc, mctx] = canvas(w, h);
  const mask = mctx.createImageData(w, h);
  const md = mask.data;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const d = lum(od, i) - lum(bd, i);
    if (d > 18) { md[i] = md[i + 1] = md[i + 2] = 255; md[i + 3] = 255; }
  }
  mctx.putImageData(mask, 0, 0);
  // 2. Dichte heller Punkte in der Nachbarschaft (vereinzelt = Stern, gehäuft = Kante oder Struktur)
  const [dc, dctx] = canvas(w, h);
  dctx.filter = 'blur(6px)';
  dctx.drawImage(mc, 0, 0);
  const dens = dctx.getImageData(0, 0, w, h).data;
  const base = o.createImageData(w, h), sd = o.createImageData(w, h);
  const ba = base.data, sa = sd.data;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const d = lum(od, i) - lum(bd, i);
    const around = lum(bd, i);
    const crowd = dens[i + 3] / 255;
    let s = d > 18 ? Math.min(1, (d - 18) / 30) : 0;
    s *= 1 - Math.min(1, Math.max(0, (around - 70) / 50));
    s *= 1 - Math.min(1, Math.max(0, (crowd - 0.18) / 0.15));
    for (let c = 0; c < 3; c++) {
      const v = od[i + c], bv = bd[i + c];
      ba[i + c] = v + (bv - v) * s;
      sa[i + c] = Math.max(0, v - bv) * s;
    }
    ba[i + 3] = 255;
    sa[i + 3] = s > 0 ? 255 : 0;
  }
  const [baseC, baseCtx] = canvas(w, h);
  baseCtx.putImageData(base, 0, 0);
  const [starC, starCtx] = canvas(w, h);
  starCtx.putImageData(sd, 0, 0);
  // nicht mehr gebraucht
  oc.width = bc.width = mc.width = dc.width = 1;
  return { id, w, h, base: baseC, stars: starC };
}
