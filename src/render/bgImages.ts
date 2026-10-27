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
/**
 * Ebenen eines Sektorbilds: das Bild selbst unverändert (eine Ebene – nichts liegt doppelt übereinander) und davor
 * eine eigene Ebene feiner Sterne, die beim Verschieben weiter wandert und so Tiefe gibt.
 */
function splitStars(id: string, img: HTMLImageElement): BgLayers {
  const w = img.naturalWidth, h = img.naturalHeight;
  const [baseC, baseCtx] = canvas(w, h);
  baseCtx.drawImage(img, 0, 0);
  const [starC, g] = canvas(w, h);
  let seed = 7;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const count = Math.round((w * h) / 9000);
  for (let i = 0; i < count; i++) {
    const x = R() * w, y = R() * h;
    const big = R() < 0.06;
    const r = big ? 1.2 + R() * 1.1 : 0.5 + R() * 0.7;
    const a = big ? 0.55 + R() * 0.35 : 0.2 + R() * 0.4;
    const tint = R();
    const col = tint < 0.6 ? '225,235,255' : tint < 0.85 ? '190,220,255' : '255,230,200';
    if (big) {
      const glow = g.createRadialGradient(x, y, 0, x, y, r * 4);
      glow.addColorStop(0, `rgba(${col},${(a * 0.5).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = glow;
      g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    g.fillStyle = `rgba(${col},${a.toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return { id, w, h, base: baseC, stars: starC };
}
