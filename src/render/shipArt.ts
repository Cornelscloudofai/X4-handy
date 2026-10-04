// Bild-Grafiken (Sprites): alle Dateien aus src/assets/sprites/ werden beim Bauen eingebunden und über ihren
// Namen gefunden. Schema: <fraktion>-<schiff>[-ki], z. B. „split-jaeger-s“ (vorab gerendertes 3D-Modell) und
// „split-jaeger-s-ki“ (Bild aus einem KI-Bildgenerator). Fehlt eine Datei, zeichnet das Spiel wie bisher per Code.
const files = import.meta.glob('../assets/sprites/*.{webp,png,jpg}', { eager: true, import: 'default' }) as Record<string, string>;
const URLS = new Map<string, string>();
for (const [path, url] of Object.entries(files)) URLS.set(path.split('/').pop()!.replace(/\.(webp|png|jpg)$/, ''), url);

/** Darstellung: KI-Bild, vorab gerendertes 3D-Modell oder per Code gezeichnet */
export type ShipArt = 'ai' | 'render' | 'vector';
/** Bauart des eigenen Jägers */
export type FighterKind = 'split' | 'argon';

export const FIGHTER_NAME: Record<FighterKind, string> = { split: 'Split-Jäger', argon: 'Argon-Jäger' };

const SUFFIX: Record<ShipArt, string> = { ai: '-ki', render: '', vector: '' };

/**
 * Triebwerksdüsen je Bild (Anteile der Bildbreite, Mitte = 0; y nach unten) und Farbe der Flamme –
 * die Flammen zeichnet das Spiel selbst, damit sie mit dem Schub flackern.
 */
const ENGINES: Record<string, { xs: number[]; y: number; color: string }> = {
  'split-jaeger-s': { xs: [-0.041, 0.041], y: 0.435, color: '#ffb070' },
  'split-jaeger-s-ki': { xs: [-0.056, 0.056], y: 0.41, color: '#ff9a4a' },
  'argon-jaeger-s': { xs: [-0.091, 0.091], y: 0.39, color: '#9fe6ff' },
  'argon-jaeger-s-ki': { xs: [-0.093, 0.093], y: 0.425, color: '#7fe8ff' },
  // Pirat: zwei ungleiche Triebwerke
  'pirat-jaeger-s-ki': { xs: [-0.13, 0.095], y: 0.4, color: '#ff7a4a' },
};

export function spriteUrl(id: string): string | undefined {
  return URLS.get(id);
}

export function spriteName(kind: FighterKind, art: ShipArt): string {
  return `${kind}-jaeger-s${SUFFIX[art]}`;
}

function read<T extends string>(key: string, ok: readonly T[], def: T): T {
  try {
    const v = globalThis.localStorage?.getItem(key);
    if (v && (ok as readonly string[]).includes(v)) return v as T;
  } catch {
    /* Speicher nicht verfügbar */
  }
  return def;
}

function write(key: string, v: string): void {
  try {
    globalThis.localStorage?.setItem(key, v);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

let art: ShipArt = read('x4-sektorbau-shipart2', ['ai', 'render', 'vector'] as const, 'ai');
let kind: FighterKind = read('x4-sektorbau-fighter', ['split', 'argon'] as const, 'split');

export function shipArt(): ShipArt {
  return art;
}

export function fighterKind(): FighterKind {
  return kind;
}

export function setShipArt(a: ShipArt, k: FighterKind = kind): void {
  art = a;
  kind = k;
  write('x4-sektorbau-shipart2', a);
  write('x4-sektorbau-fighter', k);
}

const images = new Map<string, HTMLImageElement>();

function load(name: string): HTMLImageElement | null {
  const url = URLS.get(name);
  if (!url || typeof Image === 'undefined') return null;
  let img = images.get(name);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    images.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

export interface FighterSprite { img: HTMLImageElement; engines: { xs: number[]; y: number; color: string } }

/** Bild des eigenen Jägers für die aktuelle Einstellung, sonst null (dann per Code zeichnen) */
export function fighterSprite(): FighterSprite | null {
  if (art === 'vector') return null;
  const name = spriteName(kind, art);
  const img = load(name);
  if (!img) return null;
  return { img, engines: ENGINES[name] ?? { xs: [0], y: 0.42, color: '#ffb070' } };
}

/** Gegner im Kampf-Minispiel: Gegnerart → Bildname (nur KI-Bilder) und Größe im Verhältnis zum Trefferradius */
const ENEMY_SPRITES: Record<string, { name: string; scale: number }> = {
  jaeger: { name: 'pirat-jaeger-s-ki', scale: 3.6 },
};

/** Bild eines Gegners, falls vorhanden und Bilder eingeschaltet (sonst null: Neon-Zeichnung) */
export function enemySprite(kind: string): (FighterSprite & { scale: number }) | null {
  const def = ENEMY_SPRITES[kind];
  if (!def || art === 'vector') return null;
  const img = load(def.name);
  if (!img) return null;
  return { img, scale: def.scale, engines: ENGINES[def.name] ?? { xs: [0], y: 0.42, color: '#ff7a4a' } };
}
