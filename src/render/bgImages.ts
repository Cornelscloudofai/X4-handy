// Bild-Hintergründe der Sektoren (Standard). Die erzeugten Himmel (sectorTheme.ts) bleiben als Alternative in den
// Einstellungen erhalten.
import nebel from '../assets/bg/nebel-rot-tuerkis.jpg';
import asteroiden from '../assets/bg/asteroiden-gold-tuerkis.jpg';
import planet from '../assets/bg/planet-blau.jpg';

/** Welches Bild in welchem Sektor: Gas- und Zyarth-Sektoren im Nebel, Gesteins-Sektoren im Asteroidenfeld */
const BY_SECTOR: Record<string, string> = {
  zhin: planet,
  tkr: asteroiden,
  cascade: nebel,
  ravine: asteroiden,
  rhy: nebel,
  hoa: planet,
  zyarth: nebel,
};

const cache = new Map<string, HTMLImageElement>();

/** Geladenes Bild des Sektors, null während es lädt, undefined wenn der Sektor kein Bild hat */
export function sectorImage(sectorId: string): HTMLImageElement | null | undefined {
  const url = BY_SECTOR[sectorId];
  if (!url) return undefined;
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    cache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
