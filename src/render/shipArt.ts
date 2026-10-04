// Bild-Grafiken (Sprites): alle Dateien aus src/assets/sprites/ werden beim Bauen eingebunden und über ihren
// Namen gefunden, z. B. „jaeger-s“ → jaeger-s.webp. Varianten: „…-ki“ = Bild aus einem KI-Bildgenerator,
// „…-v1“ = erster gerenderter Entwurf (glatt, türkis), ohne Zusatz = Split-Stil.
// Fehlt eine Datei, zeichnet das Spiel wie bisher per Code.
const files = import.meta.glob('../assets/sprites/*.{webp,png,jpg}', { eager: true, import: 'default' }) as Record<string, string>;
const URLS = new Map<string, string>();
for (const [path, url] of Object.entries(files)) URLS.set(path.split('/').pop()!.replace(/\.(webp|png|jpg)$/, ''), url);

/** Darstellung der Schiffe: per Code gezeichnet, vorab gerendert (3D, Split-Stil oder erster Entwurf) oder KI-Bild */
export type ShipArt = 'vector' | 'render' | 'render1' | 'ai';

const SUFFIX: Record<ShipArt, string> = { vector: '', render: '', render1: '-v1', ai: '-ki' };
const KEY = 'x4-sektorbau-shipart';

export function spriteUrl(id: string): string | undefined {
  return URLS.get(id);
}

/** Welche Varianten für ein Bild vorhanden sind */
export function artAvailable(id: string, art: ShipArt): boolean {
  return art === 'vector' || !!URLS.get(id + SUFFIX[art]);
}

let current: ShipArt = load();

function load(): ShipArt {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'vector' || v === 'render' || v === 'render1' || v === 'ai') return v;
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 'render';
}

export function shipArt(): ShipArt {
  return current;
}

export function setShipArt(a: ShipArt): void {
  current = a;
  try {
    globalThis.localStorage?.setItem(KEY, a);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

const images = new Map<string, HTMLImageElement>();

/** Geladenes Bild für die aktuelle Einstellung, sonst null (dann per Code zeichnen) */
export function shipSprite(id: string, art: ShipArt = current): HTMLImageElement | null {
  if (art === 'vector' || typeof Image === 'undefined') return null;
  const name = id + SUFFIX[art];
  const url = URLS.get(name);
  if (!url) return null;
  let img = images.get(name);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    images.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
