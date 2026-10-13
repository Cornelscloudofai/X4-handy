// Bilder für Menüs: jedes Menü und jedes Minispiel bekommt ein Hintergrundbild (Weltraum-Hintergründe) und ein
// passendes Schiffs- oder Stationsbild davor. Die Bilder liegen als eigene Dateien vor und werden erst beim Anzeigen geladen.
import { BG_IMAGES } from '../render/bgImages';
import { spriteUrl } from '../render/shipArt';
import stationDraufsicht from '../assets/menu/station-draufsicht.webp';
import stationSchraeg from '../assets/menu/station-schraeg.webp';
import minispieleDraufsicht from '../assets/menu/minispiele-draufsicht.webp';
import minispieleSchraeg from '../assets/menu/minispiele-schraeg.webp';

/** Eigene Menübilder (freigestellt, volle Auflösung) */
export const MENU_IMG = { stationDraufsicht, stationSchraeg, minispieleDraufsicht, minispieleSchraeg };

export interface MenuArt { bg: string; sprite?: string; /** großes, freigestelltes Menübild statt Schiffsbild */ art?: string }

const ART: Record<string, { bg: string; sprite?: string; art?: string }> = {
  hero: { bg: 'ringplanet' },
  'more-company': { bg: 'planet-tuerkis', art: stationSchraeg },
  'more-games': { bg: 'asteroidenstrom-dunkel', art: minispieleSchraeg },
  'more-help': { bg: 'nebel-blau-mond', sprite: 'split-drohne-ki' },
  'more-settings': { bg: 'asteroidenkette', sprite: 'split-turm-plasma-hell-ki' },
  'more-save': { bg: 'finsternis', sprite: 'split-lager-container-ki' },
  'more-about': { bg: 'nebel-rot-tuerkis-2', sprite: 'sprungtor-ki' },
  pipes: { bg: 'nebel-rot-tuerkis-2', sprite: 'split-modul-produktion-hell-ki' },
  ore: { bg: 'asteroiden-sonne', sprite: 'asteroid-2-ki' },
  gas: { bg: 'wirbel-violett', sprite: 'split-alligator-gas-ki' },
  cargo: { bg: 'asteroiden-gold-tuerkis', sprite: 'split-lager-container-ki' },
  highway: { bg: 'nebelband-tuerkis', sprite: 'split-tuatara-ki' },
  orbit: { bg: 'planet-tuerkis', sprite: 'frachter-m-ki' },
  pirates: { bg: 'nebel-rot-tuerkis', sprite: 'pirat-fregatte-ki' },
  xenon: { bg: 'finsternis', sprite: 'xenon-k-ki' },
};

export function menuArt(key: string): MenuArt | null {
  const a = ART[key];
  if (!a) return null;
  const bg = BG_IMAGES.find((b) => b.id === a.bg)?.url;
  if (!bg) return null;
  return { bg, sprite: a.sprite ? spriteUrl(a.sprite) : undefined, art: a.art };
}

/** Inline-Stil mit dem Hintergrundbild als CSS-Variable */
export function artStyle(key: string): string {
  const a = menuArt(key);
  return a ? `--img:url('${a.bg}')` : '';
}

/** Bild eines Menüs als HTML: Hintergrund und davor das Schiff/Objekt */
export function artPic(key: string, cls = 'art-pic'): string {
  const a = menuArt(key);
  if (!a) return '';
  const pic = a.art ?? a.sprite;
  return `<span class="${cls}${a.art ? ' big' : ''}" style="--img:url('${a.bg}')">${pic ? `<img src="${pic}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
}
