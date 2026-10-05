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
  'pirat-raketenboot-s-ki': { xs: [-0.09, 0.096], y: 0.42, color: '#ff7a4a' },
  'pirat-kanonenboot-s-ki': { xs: [-0.207, 0, 0.198], y: 0.43, color: '#ff7a4a' },
  'pirat-schildtraeger-s-ki': { xs: [-0.275, 0.276], y: 0.43, color: '#ff7a4a' },
  'pirat-fregatte-ki': { xs: [-0.163, -0.056, 0.052, 0.164], y: 0.452, color: '#ff7a4a' },
  // Geschützturm: keine Triebwerke
  'pirat-turm-ki': { xs: [], y: 0, color: '#ff7a4a' },
  'xenon-n-ki': { xs: [0], y: 0.37, color: '#ff3b4a' },
  'xenon-m-ki': { xs: [0], y: 0.47, color: '#ff3b4a' },
  'xenon-schirmdrohne-ki': { xs: [0], y: 0.33, color: '#ff3b4a' },
  'xenon-k-ki': { xs: [-0.217, -0.115, 0, 0.11, 0.218], y: 0.42, color: '#ff3b4a' },
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

/**
 * Gegner im Kampf-Minispiel: Gegnerart → Bildname (nur KI-Bilder) und Größe im Verhältnis zum Trefferradius.
 * Arten beider Seiten mit gleichem Namen (Boss, Turm) haben ein Präfix: „pirat:“ bzw. „xenon:“.
 */
const ENEMY_SPRITES: Record<string, { name: string; scale: number }> = {
  jaeger: { name: 'pirat-jaeger-s-ki', scale: 3.6 },
  rakete: { name: 'pirat-raketenboot-s-ki', scale: 3.4 },
  kanone: { name: 'pirat-kanonenboot-s-ki', scale: 3.4 },
  schild: { name: 'pirat-schildtraeger-s-ki', scale: 3.4 },
  // Piratenfregatte: 130 px bei Trefferradius 34; die Türme sitzen auf den Sockeln im Bild (siehe shooter.ts)
  'pirat:boss': { name: 'pirat-fregatte-ki', scale: 3.82 },
  'pirat:turret': { name: 'pirat-turm-ki', scale: 2.4 },
  n: { name: 'xenon-n-ki', scale: 4.5 },
  m: { name: 'xenon-m-ki', scale: 5 },
  xs: { name: 'xenon-schirmdrohne-ki', scale: 4.2 },
  // Xenon-K-Segment: 160 px bei Trefferradius 34; Laser- und Plasmatürme sitzen auf den vier Sockeln (siehe shooter.ts)
  'xenon:boss': { name: 'xenon-k-ki', scale: 4.7 },
};

/** Bild eines Gegners, falls vorhanden und Bilder eingeschaltet (sonst null: Neon-Zeichnung) */
export function enemySprite(kind: string, side: 'pirat' | 'xenon' = 'pirat'): (FighterSprite & { scale: number }) | null {
  const def = ENEMY_SPRITES[`${side}:${kind}`] ?? ENEMY_SPRITES[kind];
  if (!def || art === 'vector') return null;
  const img = load(def.name);
  if (!img) return null;
  return { img, scale: def.scale, engines: ENGINES[def.name] ?? { xs: [0], y: 0.42, color: '#ff7a4a' } };
}

/** Geschoss-Bild (z. B. Piratenrakete), falls vorhanden und Bilder eingeschaltet */
export function projectileSprite(name: string): HTMLImageElement | null {
  return art === 'vector' ? null : load(name);
}
