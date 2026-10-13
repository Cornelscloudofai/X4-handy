// Bilder für Menüs: jedes Menü und jedes Minispiel bekommt ein Hintergrundbild (Weltraum-Hintergründe) und ein
// passendes Schiffs- oder Stationsbild davor. Die Bilder liegen als eigene Dateien vor und werden erst beim Anzeigen geladen.
import { BG_IMAGES } from '../render/bgImages';
import { spriteUrl } from '../render/shipArt';
import leitstandBanner from '../assets/menu/leitstand-banner.jpg';
import unternehmenStation from '../assets/menu/unternehmen-station.jpg';
import minispieleSzene from '../assets/menu/minispiele-szene.jpg';
import hilfeDrohne from '../assets/menu/hilfe-drohne.jpg';
import einstellungenWerkhalle from '../assets/menu/einstellungen-werkhalle.jpg';
import spielstandTresor from '../assets/menu/spielstand-tresor.jpg';
import ueberSprungtor from '../assets/menu/ueber-sprungtor.jpg';
import karriereHangar from '../assets/menu/karriere-hangar.jpg';
import karriereBergbau from '../assets/menu/karriere-bergbau.jpg';
import karriereHandel from '../assets/menu/karriere-handel.jpg';

/** Bilder der Startwahl (Karriere): Hangar mit beiden Schiffen als Kopf, je Laufbahn ein eigenes Bild */
export const CAREER = { hero: karriereHangar, mining: karriereBergbau, trading: karriereHandel };


export interface MenuArt { bg: string; sprite?: string; /** großes, freigestelltes Menübild statt Schiffsbild */ art?: string }

/** Eigene Szenen (KI-Bilder für Menüs): ersetzen Hintergrund und Schiffsbild */
const SCENE: Record<string, string> = {
  hero: leitstandBanner,
  'more-company': unternehmenStation,
  'more-games': minispieleSzene,
  'more-help': hilfeDrohne,
  'more-settings': einstellungenWerkhalle,
  'more-save': spielstandTresor,
  'more-about': ueberSprungtor,
};

const ART: Record<string, { bg: string; sprite?: string; art?: string }> = {
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
  if (SCENE[key]) return { bg: SCENE[key] };
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
