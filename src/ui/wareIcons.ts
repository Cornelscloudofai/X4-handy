// Warensymbole im Neon-Stil (24er Raster). Jede Form gibt es in zwei Stilen: „Linie“ (nur Umrisse in Warenfarbe)
// und „Leuchtend“ (Flächen gefüllt, mit Glühen). Flächen, die im Stil „Leuchtend“ gefüllt werden, tragen class="f".
import { WARES } from '../data/wares';

export type WareIconStyle = 'line' | 'glow';

const G: Record<string, string> = {
  // ---------- Rohstoffe ----------
  ore: '<path class="f" d="M5 15.5 7 8l6-3.5 6 4 1 7.5-6 4.5-7-1.5z"/><path d="M7 8l5 4 7-3.5M12 12l2 8.5M12 12l-7 3.5"/>',
  silicon: '<path class="f" d="M12 3 17 6v9l-5 6-5-6V6z"/><path d="M7 6l5 3 5-3M12 9v12"/>',
  ice: '<path class="f" d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9z"/><path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9"/><path d="M9 6l2 1M14.5 14.5l1.5-.8"/>',
  nividium: '<path class="f" d="M12 3 20 9.5 12 21 4 9.5z"/><path d="M4 9.5h16M8 9.5 12 3l4 6.5M8 9.5l4 11.5 4-11.5"/>',
  rawscrap: '<path class="f" d="M4 14l4-6 4 2 3-4 5 5-3 3 2 4-7 2-4-3z"/><path d="M8 8l1 5 3-3M15 6l-1 6 3 1"/>',
  hydrogen: '<path class="f" d="M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0c0-2.5 2-5.5 6-10.5z"/><path d="M10 12v5M14 12v5M10 14.5h4"/>',
  helium: '<path class="f" d="M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0c0-2.5 2-5.5 6-10.5z"/><circle cx="12" cy="14.5" r="2.4"/><circle cx="12" cy="14.5" r=".6"/>',
  methane: '<path class="f" d="M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0c0-2.5 2-5.5 6-10.5z"/><path d="M12 14.5l-2.6-1.6M12 14.5l2.6-1.6M12 14.5v3"/><circle cx="12" cy="14.5" r="1"/>',
  // ---------- Energie ----------
  energycells: '<rect class="f" x="6.5" y="5" width="11" height="15.5" rx="2"/><path d="M10 3.5h4"/><path d="M12.8 8 9.8 13h4l-2.8 5"/>',
  // ---------- Veredelt ----------
  refinedmetals: '<path class="f" d="M3.5 16 7 9h10l3.5 7z"/><path d="M7 9l2 7M17 9l-2 7M3.5 16h17v2.5h-17z"/>',
  teladianium: '<path class="f" d="M5 15l3-6h8l3 6z"/><path d="M5 15h14v3H5zM9 9l1 6M15 9l-1 6"/><path d="M12 5v2M10.5 6h3"/>',
  scrapmetal: '<path class="f" d="M3.5 16 7 9h10l3.5 7z"/><path d="M3.5 16h17v2.5h-17zM11 9l-1.5 3.5 2.5 1-1 2.5"/>',
  graphene: '<path class="f" d="M8 4.5h4l2 3.5-2 3.5H8L6 8z"/><path d="M14 8h4l2 3.5-2 3.5h-4l-2-3.5M8 11.5l-2 3.5 2 3.5h4l2-3.5"/>',
  siliconwafers: '<circle class="f" cx="12" cy="12" r="8"/><path d="M7 9h10M6 12h12M7 15h10M9 6.5v11M12 4v16M15 6.5v11"/>',
  antimattercells: '<rect class="f" x="7" y="3.5" width="10" height="17" rx="5"/><circle cx="12" cy="12" r="2.6"/><path d="M8.5 7.5h7M8.5 16.5h7"/>',
  superfluidcoolant: '<path class="f" d="M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0c0-2.5 2-5.5 6-10.5z"/><path d="M12 11v7M9 12.8l6 3.4M15 12.8l-6 3.4"/>',
  water: '<path class="f" d="M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0c0-2.5 2-5.5 6-10.5z"/><path d="M8.5 14.5c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0"/>',
  computronicsubstrate: '<rect class="f" x="4" y="7" width="16" height="10" rx="1.5"/><path d="M4 12h3l2-2.5h6l2 2.5h3M9 9.5v-2.5M15 9.5v-2.5M12 12v5"/>',
  metallicmicrolattice: '<path class="f" d="M4 6h16v12H4z"/><path d="M4 6l16 12M20 6 4 18M12 6v12M4 12h16"/>',
  siliconcarbide: '<path class="f" d="M6 9l6-4.5L18 9v7l-6 4.5L6 16z"/><path d="M6 9l6 3.5L18 9M12 12.5v8M9 7l6 3.5"/>',
  proteinpaste: '<path class="f" d="M6 6.5h12l-1.5 13h-9z"/><path d="M5 6.5h14M9 4h6v2.5M8.5 11h7"/>',
  stimulants: '<path class="f" d="M6.5 14.5 14.5 6.5a3.5 3.5 0 0 1 5 5l-8 8a3.5 3.5 0 0 1-5-5z"/><path d="M10.5 10.5l3 3"/>',
  bogas: '<rect class="f" x="7" y="7" width="10" height="13.5" rx="2.5"/><path d="M9.5 4h5M10 4v3M14 4v3"/><circle cx="12" cy="13.5" r="2"/>',
  // ---------- Hightech ----------
  advancedcomposites: '<path class="f" d="M4 9l8-4 8 4-8 4z"/><path d="M4 12.5l8 4 8-4M4 16l8 4 8-4"/>',
  engineparts: '<path class="f" d="M8 4.5h8v4l3 9H5l3-9z"/><path d="M8 8.5h8M7 13h10M5 17.5h14M9 20.5h6"/>',
  hullparts: '<path class="f" d="M4 6.5h16v11H4z"/><path d="M4 12h16M12 6.5v11"/><circle cx="7" cy="9.2" r=".8"/><circle cx="17" cy="9.2" r=".8"/><circle cx="7" cy="14.8" r=".8"/><circle cx="17" cy="14.8" r=".8"/>',
  microchips: '<rect class="f" x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9.5 4v3M12 4v3M14.5 4v3M9.5 17v3M12 17v3M14.5 17v3M4 9.5h3M4 12h3M4 14.5h3M17 9.5h3M17 12h3M17 14.5h3"/><rect x="10" y="10" width="4" height="4"/>',
  smartchips: '<rect class="f" x="8" y="8" width="8" height="8" rx="1.2"/><path d="M10 5.5v2.5M14 5.5v2.5M10 16v2.5M14 16v2.5M5.5 10H8M5.5 14H8M16 10h2.5M16 14h2.5"/><circle cx="12" cy="12" r="1.3"/>',
  plasmaconductors: '<rect class="f" x="8.5" y="3.5" width="7" height="17" rx="3.5"/><path d="M8.5 7.5h7M8.5 16.5h7M12.8 9.5 10.8 12.2h2.4l-2 2.8"/>',
  quantumtubes: '<rect class="f" x="9" y="3.5" width="6" height="17" rx="3"/><ellipse cx="12" cy="9" rx="5" ry="1.6"/><ellipse cx="12" cy="15" rx="5" ry="1.6"/>',
  scanningarrays: '<path class="f" d="M5 6a10 10 0 0 0 13 13z"/><path d="M11.5 12.5 18 6M17 4.5l2.5 2.5M8.5 20.5h7"/><circle cx="11.5" cy="12.5" r="1"/>',
  // ---------- Schiffstechnik ----------
  advancedelectronics: '<rect class="f" x="4" y="5" width="16" height="14" rx="2"/><path d="M7 9h4v6h3M17 9h-3v-2M9 15H7M11 12h6"/><circle cx="17" cy="12" r=".9"/><circle cx="7" cy="9" r=".9"/>',
  antimatterconverters: '<circle class="f" cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 4.5v5M12 14.6v4.9M4.5 12h5M14.6 12h4.9"/>',
  claytronics: '<path class="f" d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9z"/><path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9M8.2 5.5l7.5 4M8.2 9.5v9M15.8 9.5v9"/>',
  dronecomponents: '<circle class="f" cx="12" cy="12" r="3"/><path d="M9.8 9.8 7 7M14.2 9.8 17 7M9.8 14.2 7 17M14.2 14.2 17 17"/><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  fieldcoils: '<rect class="f" x="7" y="4" width="10" height="16" rx="2"/><path d="M7 7.5h10M7 10.5h10M7 13.5h10M7 16.5h10M12 2.5V4M12 20v1.5"/>',
  shieldcomponents: '<path class="f" d="M12 3.5 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M12 7.5v10M8.5 11.5h7"/>',
  turretcomponents: '<path class="f" d="M5 19.5v-5a7 7 0 0 1 14 0v5z"/><path d="M12 12.5 18.5 5M17 4l3 3M3.5 19.5h17"/>',
  weaponscomponents: '<circle class="f" cx="12" cy="12" r="6.5"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="12" r="1.3"/>',
  missilecomponents: '<path class="f" d="M12 3c2.5 2 3 5 3 8v6H9v-6c0-3 .5-6 3-8z"/><path d="M9 13l-3 4.5V19l3-2M15 13l3 4.5V19l-3-2M10.5 17v3.5M13.5 17v3.5"/>',
  // ---------- Agrar ----------
  wheat: '<path d="M12 21V6"/><path class="f" d="M12 7c-2.5-1-3-3-3-4.5 2 .5 3 2 3 4.5zM12 11c-2.5-1-3.5-3-3.5-4.5 2 .5 3.5 2 3.5 4.5zM12 15c-2.5-1-3.5-3-3.5-4.5 2 .5 3.5 2 3.5 4.5zM12 11c2.5-1 3.5-3 3.5-4.5-2 .5-3.5 2-3.5 4.5zM12 15c2.5-1 3.5-3 3.5-4.5-2 .5-3.5 2-3.5 4.5z"/>',
  meat: '<path class="f" d="M6 13c-2-4 1-8.5 6-8.5 4.5 0 7.5 3 7 7-.5 4-4 6.5-8 6.5-2 0-4-2-5-5z"/><path d="M8 17.5 5 20.5M5 20.5l-1-2M5 20.5l2 1"/><circle cx="13" cy="10.5" r="2"/>',
  cheltmeat: '<path class="f" d="M5 12c0-4 3-7 7-7s7 3 7 7-3 7.5-7 7.5S5 16 5 12z"/><path d="M7.5 9.5c2 1 3 3 2.5 5.5M12 6.5c1 2 1 4-.5 6M15.5 8.5c-.5 2.5.5 5 2.5 6"/>',
  majasnails: '<path class="f" d="M4 17.5h14c1.5 0 2.5-1 2.5-2.5"/><path class="f" d="M7 17.5a5.5 5.5 0 1 1 11 0"/><path d="M12.5 17.5a2.8 2.8 0 1 1 2.8-2.8M18 12.5l1.5-3M19.5 13.5 21 11"/>',
  plankton: '<circle class="f" cx="8" cy="9" r="3"/><circle class="f" cx="15.5" cy="7.5" r="2.2"/><circle class="f" cx="14" cy="15.5" r="3.5"/><circle class="f" cx="7" cy="16.5" r="1.8"/>',
  scruffinfruit: '<path class="f" d="M12 7.5c4.5 0 6.5 3 6.5 6.5S16 20.5 12 20.5 5.5 17.5 5.5 14s2-6.5 6.5-6.5z"/><path d="M12 7.5c0-2 1-3.5 3-4M12 7.5C10.5 5.5 8.5 5 7 5.5"/>',
  sojabeans: '<path class="f" d="M7 5c3 0 4.5 2 4.5 4.5S9.5 14 7 14 3.5 11.5 3.5 9.5 4 5 7 5zM16 10c3 0 4.5 2 4.5 4.5S18.5 19 16 19s-3.5-2.5-3.5-4.5S13 10 16 10z"/><path d="M6 8.5c.8.5 1.5 1.3 1.5 2.5M15 13.5c.8.5 1.5 1.3 1.5 2.5"/>',
  sojahusk: '<path class="f" d="M5 18c0-7 5-12.5 14-13-1 8.5-6 13-14 13z"/><path d="M5 18c4-4 7-7 10-9.5M9 14.5c-.5-1.5-.5-3 0-4.5M12 11.5c1.5.3 3 .2 4.5-.5"/>',
  spices: '<path class="f" d="M8 8h8l1 12.5H7z"/><path d="M8 8l1-3.5h6L16 8M9.5 12h5M10 15.5h4"/><circle cx="10" cy="6.2" r=".5"/><circle cx="14" cy="6.2" r=".5"/>',
  sunriseflowers: '<circle class="f" cx="12" cy="9" r="2.4"/><path class="f" d="M12 6.6c-1-2-.5-3.6 0-4 .5.4 1 2 0 4zM14.3 8.2c1.8-1.2 3.4-1 3.8-.6-.3.6-1.9 1.4-3.8.6zM14 10.7c2 .8 2.6 2.3 2.4 2.9-.6.1-2.1-.7-2.4-2.9zM10 10.7c-.3 2.2-1.8 3-2.4 2.9-.2-.6.4-2.1 2.4-2.9zM9.7 8.2c-1.9.8-3.5 0-3.8-.6.4-.4 2-.6 3.8.6z"/><path d="M12 11.5V21M12 17c-1.5-.5-2.5-1.5-3-3M12 18.5c1.5-.5 2.5-1.5 3-3"/>',
  swampplant: '<path d="M12 21v-9M7 21c0-4 1-7 5-9M17 21c0-4-1-7-5-9"/><path class="f" d="M12 12c-2-2-2.5-5-1.5-8.5 2 2.5 3 5.5 1.5 8.5zM9 15c-3-.5-5-2.5-5.5-5.5 3 .5 5 2.5 5.5 5.5zM15 15c3-.5 5-2.5 5.5-5.5-3 .5-5 2.5-5.5 5.5z"/>',
  // ---------- Nahrung ----------
  foodrations: '<rect class="f" x="4" y="6.5" width="16" height="12" rx="2"/><path d="M4 10.5h16M10 6.5v4M14 6.5v4M8 14.5h8"/>',
  bofu: '<path class="f" d="M4.5 10h15l-1.5 8.5H6z"/><path d="M3.5 10h17M8 7.5c0-1.5 1-2 1-3.5M12 7.5c0-1.5 1-2 1-3.5M16 7.5c0-1.5 1-2 1-3.5"/>',
  nostropoil: '<path class="f" d="M9 8h6v2.5c2 1 3 3 3 5v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3c0-2 1-4 3-5z"/><path d="M10 4h4v4h-4zM8.5 15h7"/>',
  terranmre: '<path class="f" d="M5 7.5h14v11.5H5z"/><path d="M5 7.5 7 4.5h10l2 3M9 12h6M9 15h4"/><path d="M15 10.5l1.5 1.5L19 9.5"/>',
  // ---------- Pharma ----------
  medicalsupplies: '<rect class="f" x="4" y="6.5" width="16" height="13" rx="2"/><path d="M9.5 6.5V4.5h5v2M12 9.5v7M8.5 13h7"/>',
  spacefuel: '<path class="f" d="M9.5 9h5l1 3.5V19a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 19v-6.5z"/><path d="M10.5 4h3v5h-3zM8.8 14.5h6.4"/>',
  spaceweed: '<path class="f" d="M12 20c-1-4-1-9 0-15 1 6 1 11 0 15zM12 16c-3-1-6-4-7-8 3 1 6 4 7 8zM12 16c3-1 6-4 7-8-3 1-6 4-7 8zM12 18c-2.5 0-5-1.5-6.5-3.5 2.5 0 5 1.5 6.5 3.5zM12 18c2.5 0 5-1.5 6.5-3.5-2.5 0-5 1.5-6.5 3.5z"/><path d="M12 20v1.5"/>',
  majadust: '<path class="f" d="M5 19.5c1-4 4-6.5 7-6.5s6 2.5 7 6.5z"/><circle cx="9" cy="8" r=".9"/><circle cx="13" cy="5.5" r=".9"/><circle cx="15.5" cy="9.5" r=".9"/><circle cx="11" cy="10.5" r=".7"/><circle cx="7" cy="11.5" r=".6"/>',
};

/** Ersatzform für unbekannte Waren: Kiste */
const FALLBACK = '<path class="f" d="M4.5 8 12 4l7.5 4v8.5L12 20.5l-7.5-4z"/><path d="M4.5 8 12 12l7.5-4M12 12v8.5"/>';

export function hasWareIcon(id: string): boolean {
  return id in G;
}

let current: WareIconStyle = 'glow';
/** Stil für alle Warensymbole (aus den Einstellungen) */
export function setWareIconStyle(s: WareIconStyle): void {
  current = s;
}

/** Warensymbol als SVG in der Warenfarbe (Stil: aus den Einstellungen, falls nicht angegeben) */
export function wareIcon(id: string, size = 22, style: WareIconStyle = current): string {
  const color = WARES[id]?.color ?? '#8fb7c4';
  return `<svg class="wi wi-${style}" style="--c:${color}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${G[id] ?? FALLBACK}</svg>`;
}

/** Kleines Warensymbol in Listen und Zutatenzeilen (ersetzt den farbigen Punkt) */
export function wareMark(id: string, dot = 10): string {
  return `<span class="wm">${wareIcon(id, Math.round(dot * 1.6 + 2))}</span>`;
}

/** Rohe SVG-Elemente eines Warensymbols (für das Zeichnen auf der Karte) */
export function wareGlyph(id: string): string {
  return G[id] ?? FALLBACK;
}
