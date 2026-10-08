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
  'xenon-turm-laser-ki': { xs: [], y: 0, color: '#ff3b4a' },
  'xenon-turm-plasma-ki': { xs: [], y: 0, color: '#ff6a3d' },
  'xenon-k-ki': { xs: [-0.217, -0.115, 0, 0.11, 0.218], y: 0.42, color: '#ff3b4a' },
  // Split-Militärschiffe (Kampf: dein Schiff)
  'split-jaguar-ki': { xs: [0], y: 0.35, color: '#ff9a4a' },
  'split-asp-ki': { xs: [-0.078, 0.074], y: 0.35, color: '#ff9a4a' },
  'split-balaur-ki': { xs: [-0.153, 0, 0.145], y: 0.38, color: '#ff9a4a' },
  'split-chimera-ki': { xs: [-0.137, -0.082, 0.081, 0.137], y: 0.34, color: '#ff9a4a' },
  'split-dragon-ki': { xs: [0], y: 0.385, color: '#ff9a4a' },
  'split-cobra-ki': { xs: [-0.08, 0, 0.083], y: 0.384, color: '#ff9a4a' },
  // Miner und Frachter auf der Sektorkarte
  'split-alligator-min-ki': { xs: [-0.059, 0.059], y: 0.37, color: '#ff9a4a' },
  'split-alligator-gas-ki': { xs: [-0.059, 0.059], y: 0.37, color: '#ff9a4a' },
  'split-wyvern-min-ki': { xs: [-0.071, 0, 0.071], y: 0.415, color: '#ff9a4a' },
  'split-wyvern-gas-ki': { xs: [-0.071, 0, 0.071], y: 0.415, color: '#ff9a4a' },
  'split-boa-ki': { xs: [-0.036, 0.036], y: 0.42, color: '#ff9a4a' },
  'split-buffalo-ki': { xs: [-0.071, 0, 0.071], y: 0.415, color: '#ff9a4a' },
  'split-tuatara-ki': { xs: [-0.071, 0, 0.071], y: 0.405, color: '#ff9a4a' },
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

/** Alle Bilder schon einmal anfordern (z. B. beim Öffnen eines Kampfs), damit sie bereitliegen, wenn sie gebraucht werden */
export function preloadSprites(): void {
  if (art === 'vector') return;
  for (const name of URLS.keys()) load(name);
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
 * Bild eines eigenen Schiffs (Name ohne Endung, z. B. „split-chimera“) in der gewählten Darstellung;
 * fehlt es, das Ersatzbild – und fehlt auch das, null (dann per Code zeichnen).
 */
export function shipSprite(base: string, fallback: string): (FighterSprite & { fallback: boolean }) | null {
  if (art === 'vector') return null;
  for (const [name, fb] of [[base + SUFFIX[art], false], [base + '-ki', false], [fallback + SUFFIX[art], true], [fallback + '-ki', true]] as const) {
    const img = load(name);
    if (img) return { img, fallback: fb, engines: ENGINES[name] ?? { xs: [0], y: 0.42, color: '#ffb070' } };
  }
  return null;
}

/**
 * Gegner im Kampf-Minispiel: Gegnerart → Bildname (nur KI-Bilder) und Größe im Verhältnis zum Trefferradius.
 * Arten beider Seiten mit gleichem Namen (Boss, Turm) haben ein Präfix: „pirat:“ bzw. „xenon:“.
 */
const ENEMY_SPRITES: Record<string, { name: string; scale: number; oy?: number }> = {
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
  // Xenon-Türme: der runde Sockel ist der Drehpunkt; beim Plasmaturm liegt er unter der Bildmitte (oy)
  'xenon:turret-laser': { name: 'xenon-turm-laser-ki', scale: 4.8 },
  'xenon:turret-plasma': { name: 'xenon-turm-plasma-ki', scale: 2.8, oy: 0.11 },
};

/** Bild eines Gegners, falls vorhanden und Bilder eingeschaltet (sonst null: Neon-Zeichnung) */
export function enemySprite(kind: string, side: 'pirat' | 'xenon' = 'pirat'): (FighterSprite & { scale: number; oy: number }) | null {
  const def = ENEMY_SPRITES[`${side}:${kind}`] ?? ENEMY_SPRITES[kind];
  if (!def || art === 'vector') return null;
  const img = load(def.name);
  if (!img) return null;
  return { img, scale: def.scale, oy: def.oy ?? 0, engines: ENGINES[def.name] ?? { xs: [0], y: 0.42, color: '#ff7a4a' } };
}

/** Geschoss-Bild (z. B. Piratenrakete), falls vorhanden und Bilder eingeschaltet */
export function projectileSprite(name: string): HTMLImageElement | null {
  return art === 'vector' ? null : load(name);
}

// ---- Split-Türme (KI-Bilder) mit Farbabgleich zum Schiffsrumpf ----

/**
 * Typischer Rumpfton der Schiffsbilder (Mittel der roten Panzerplatten, gemessen) – danach werden die Türme ausgesucht:
 * die Dragon ist knallig rot, Cobra, Balaur und Mamba gedeckter.
 */
const HULL: Record<string, [number, number, number]> = {
  'split-jaguar': [150, 64, 32], 'split-asp': [163, 58, 28], 'split-balaur': [127, 62, 43], 'split-chimera': [185, 64, 40],
  'split-dragon': [193, 51, 39], 'split-cobra': [140, 63, 42], 'split-jaeger-s': [133, 65, 38],
};

/**
 * Turmbilder im Spiel (weitere Varianten liegen in grafik-vorrat/tuerme/ und werden bei Bedarf hierher zurückgeholt).
 * Turmart, gemessener Rotton, Drehpunkt (Mitte des runden Sockels, Anteile des Bilds) und Durchmesser
 * des Sockels (Anteil der Bildbreite). Das Rohr zeigt im Bild nach oben.
 */
const TURRET_ART: { name: string; type: string; rgb: [number, number, number]; px: number; py: number; d: number }[] = [
  { name: 'split-turm-puls-mittel-ki', type: 'puls', rgb: [138, 55, 39], px: 0.5, py: 0.658, d: 0.5 },
  { name: 'split-turm-puls-hell-ki', type: 'puls', rgb: [182, 59, 37], px: 0.5, py: 0.62, d: 0.54 },
  { name: 'split-turm-neutron-mittel2-ki', type: 'neutron', rgb: [141, 61, 44], px: 0.5, py: 0.576, d: 0.66 },
  { name: 'split-turm-neutron-hell-ki', type: 'neutron', rgb: [185, 51, 28], px: 0.5, py: 0.615, d: 0.67 },
  { name: 'split-turm-tau-mittel-ki', type: 'tau', rgb: [152, 56, 40], px: 0.5, py: 0.64, d: 0.54 },
  { name: 'split-turm-tau-hell-ki', type: 'tau', rgb: [196, 52, 28], px: 0.5, py: 0.563, d: 0.72 },
  { name: 'split-turm-plasma-mittel-ki', type: 'plasma', rgb: [145, 58, 41], px: 0.5, py: 0.657, d: 0.54 },
  { name: 'split-turm-plasma-hell-ki', type: 'plasma', rgb: [190, 52, 30], px: 0.5, py: 0.6, d: 0.7 },
  { name: 'split-turm-boson-mittel-ki', type: 'boson', rgb: [142, 63, 48], px: 0.5, py: 0.75, d: 0.35 },
  { name: 'split-turm-boson-hell-ki', type: 'boson', rgb: [194, 44, 26], px: 0.5, py: 0.694, d: 0.51 },
];

/** Name des Turmbilds, dessen Farbe am besten zum Rumpf des Schiffs passt (ohne Laden – auch für Tests) */
export function turretArtName(type: string, shipBase: string): string | null {
  const hull = HULL[shipBase] ?? HULL['split-jaeger-s'];
  let best: string | null = null, bd = Infinity;
  for (const t of TURRET_ART) {
    if (t.type !== type) continue;
    const d = Math.hypot(t.rgb[0] - hull[0], t.rgb[1] - hull[1], t.rgb[2] - hull[2]);
    if (d < bd) { bd = d; best = t.name; }
  }
  return best;
}

/** Turmbild passend zum Schiff (Drehpunkt und Sockeldurchmesser als Anteile), sonst null (dann per Code zeichnen) */
export function turretSprite(type: string, shipBase: string): { img: HTMLImageElement; px: number; py: number; d: number } | null {
  if (art === 'vector') return null;
  const name = turretArtName(type, shipBase);
  const def = TURRET_ART.find((t) => t.name === name);
  const img = name ? load(name) : null;
  return img && def ? { img, px: def.px, py: def.py, d: def.d } : null;
}

// ---- Eigene Schiffe auf der Sektorkarte (Miner, Frachter) ----

/** Schiffsklasse → KI-Bild (Bug oben); fehlt eins, zeichnet die Karte den Umriss */
const MAP_SHIPS: Record<string, string> = {
  alligator_min: 'split-alligator-min-ki',
  alligator_gas: 'split-alligator-gas-ki',
  wyvern_min: 'split-wyvern-min-ki',
  wyvern_gas: 'split-wyvern-gas-ki',
  boa: 'split-boa-ki',
  buffalo: 'split-buffalo-ki',
  tuatara: 'split-tuatara-ki',
};

/** Bild einer Schiffsklasse für die Karte, sonst null */
export function mapShipSprite(cls: string): FighterSprite | null {
  const name = MAP_SHIPS[cls];
  if (!name || art === 'vector') return null;
  const img = load(name);
  return img ? { img, engines: ENGINES[name] ?? { xs: [0], y: 0.42, color: '#ff9a4a' } } : null;
}

// ---- Stationen: Modulbilder ----

/**
 * Stationskerne je Bauform (passend zu den Trägern am Kern): Ring und Block – Stern mit sechs Armen;
 * Dreistern – Y-Kern mit drei Armen; Rückgrat – länglicher Kern mit zwei Enden. Je Bauform mehrere Farbvarianten,
 * Auswahl je Station fest über ihre Kennung. Im Bild zeigt ein Arm nach oben.
 */
const STATION_CORES: Record<string, string[]> = {
  ring: ['split-station-kern-hell-ki', 'split-station-kern-mittel-ki', 'split-station-kern-kasten-ki', 'split-station-kern-kasten-hell-ki'],
  block: ['split-station-kern-hell-ki', 'split-station-kern-mittel-ki', 'split-station-kern-kasten-ki', 'split-station-kern-kasten-hell-ki'],
  tri: ['split-station-kern-tri-ki', 'split-station-kern-tri-hell-ki'],
  spine: ['split-station-kern-rueckgrat-ki'],
};

/** Bild des Stationskerns für Bauform und Station (Zahl aus ihrer Kennung), sonst null (dann Symbol) */
export function stationCoreSprite(style: string, seed: number): HTMLImageElement | null {
  const list = STATION_CORES[style] ?? [];
  if (art === 'vector' || !list.length) return null;
  return load(list[seed % list.length]);
}

/**
 * Modulbilder: länglich, Anschlüsse oben und unten (zum Kern / nach außen) sowie mittig an beiden Längsseiten
 * (Ringträger zu den Nachbarn). Inhalt mittig, von Anschluss zu Anschluss 95 % der Bildhöhe.
 */
const MODULE_ART: Record<string, string[]> = {
  smelter: ['split-modul-raffinerie-ki'],
  chem: ['split-modul-gas-ki'],
  fab: ['split-modul-bauteile-ki'],
  arms: ['split-modul-produktion-ki', 'split-modul-produktion-hell-ki'],
  solar: ['split-modul-solar-ki'],
  dock: ['split-dock-ki'],
  pier: ['split-pier-ki'],
  Container: ['split-lager-container-ki'],
  Solid: ['split-lager-erz-ki'],
  Liquid: ['split-lager-gas-ki'],
};

/** Bild eines Moduls nach Bauart (Produktionsart oder Lagertyp), sonst null (dann Neon-Zeichnung) */
export function moduleSprite(kind: string, seed: number): HTMLImageElement | null {
  const list = MODULE_ART[kind];
  if (art === 'vector' || !list) return null;
  return load(list[seed % list.length]);
}
