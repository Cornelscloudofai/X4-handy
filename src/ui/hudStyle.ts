// Aussehen der Bedienleisten auf der Karte: Menü-Knopf oben (Zahnrad oder Schild „Menü“) und Rahmen der Reiterleiste
// unten (schlicht oder ein gemalter Rahmen mit sechs Feldern). Gewählt in den Einstellungen, gemerkt im Browser.
import menueWaben from '../assets/hud/menue-waben.webp';
import menueHaus from '../assets/hud/menue-haus.webp';
import menueStation from '../assets/hud/menue-station.webp';
import leisteWerkstatt from '../assets/hud/leiste-werkstatt.webp';
import leisteGlas from '../assets/hud/leiste-glas.webp';
import leisteChrom from '../assets/hud/leiste-chrom.webp';
import leisteRost from '../assets/hud/leiste-rost.webp';

export interface MenuStyle { id: string; name: string; url?: string; ratio?: number }
/**
 * Leistenrahmen: Bild, Seitenverhältnis und die sechs Felder, gemessen mit scripts/import-ui.mjs – je Feld das Rechteck
 * (links, oben, rechts, unten als Anteile des Bilds) und sein Umriss (SVG-Punkte in Prozent dieses Rechtecks), in dem die
 * Markierung des aktiven Reiters gezeichnet wird
 */
export interface FrameCell { box: [number, number, number, number]; poly: string }
export interface FrameStyle { id: string; name: string; url?: string; ratio?: number; cells?: FrameCell[] }

export const MENU_STYLES: MenuStyle[] = [
  { id: 'zahnrad', name: 'Zahnrad' },
  { id: 'waben', name: 'Waben', url: menueWaben, ratio: 3.311 },
  { id: 'haus', name: 'Haus', url: menueHaus, ratio: 3.508 },
  { id: 'station', name: 'Station', url: menueStation, ratio: 3.268 },
];
export const FRAME_STYLES: FrameStyle[] = [
  { id: 'schlicht', name: 'Schlicht' },
  { id: 'werkstatt', name: 'Werkstatt', url: leisteWerkstatt, ratio: 5.314, cells: [
      { box: [0.0446, 0.163, 0.1901, 0.8444], poly: '0.0,12.7 10.5,0.0 89.1,0.4 99.7,13.0 99.7,86.2 98.4,89.5 89.8,99.6 10.5,99.6 0.0,86.6' },
      { box: [0.204, 0.163, 0.3443, 0.8444], poly: '0.0,14.1 1.0,10.5 9.9,0.7 13.2,0.0 89.7,1.1 98.7,10.9 99.7,14.5 99.3,88.8 90.4,98.6 86.8,99.6 9.6,98.9 0.3,89.1' },
      { box: [0.3573, 0.163, 0.4954, 0.8444], poly: '0.0,14.5 5.1,6.2 12.8,0.0 87.5,0.0 90.6,1.4 99.3,11.2 99.7,88.4 87.9,99.6 9.4,98.6 0.0,88.8' },
      { box: [0.5084, 0.163, 0.6473, 0.8444], poly: '0.0,14.5 3.0,8.7 9.7,1.1 12.7,0.0 87.0,0.0 90.0,1.4 98.7,11.2 99.3,14.9 99.3,88.8 87.3,99.6 9.4,98.6 0.0,88.8' },
      { box: [0.6603, 0.163, 0.803, 0.8444], poly: '0.0,13.4 10.1,0.4 89.3,0.7 98.4,10.5 99.3,13.8 98.7,89.1 89.6,98.9 86.3,99.6 9.8,99.3 0.7,89.5 0.0,85.9' },
      { box: [0.8155, 0.163, 0.9535, 0.8444], poly: '0.0,22.1 1.0,11.2 12.8,0.0 87.5,0.0 99.3,11.2 99.7,88.4 87.9,99.6 12.5,99.6 9.8,98.2 0.3,88.8' },
    ] },
  { id: 'glas', name: 'Glas', url: leisteGlas, ratio: 7.483, cells: [
      { box: [0.005, 0.035, 0.1813, 0.962], poly: '35.1,0.0 27.3,1.3 19.9,5.0 13.2,10.9 7.7,18.8 3.5,28.3 0.9,38.9 0.0,50.0 0.9,61.1 3.5,71.7 7.7,81.2 13.2,89.1 19.9,95.0 27.3,98.7 35.1,100.0 100.0,100.0 100.0,0.0' },
      { box: [0.1827, 0.035, 0.3407, 0.962], poly: '0.0,0.0 100.0,0.0 100.0,100.0 0.0,100.0' },
      { box: [0.3421, 0.035, 0.4995, 0.962], poly: '0.0,0.0 100.0,0.0 100.0,100.0 0.0,100.0' },
      { box: [0.5005, 0.035, 0.6579, 0.962], poly: '0.0,0.0 100.0,0.0 100.0,100.0 0.0,100.0' },
      { box: [0.6598, 0.035, 0.8178, 0.962], poly: '0.0,0.0 100.0,0.0 100.0,100.0 0.0,100.0' },
      { box: [0.8192, 0.035, 0.995, 0.962], poly: '64.8,0.0 72.6,1.3 80.1,5.0 86.7,10.9 92.3,18.8 96.5,28.3 99.1,38.9 100.0,50.0 99.1,61.1 96.5,71.7 92.3,81.2 86.7,89.1 80.1,95.0 72.6,98.7 64.8,100.0 0.0,100.0 0.0,0.0' },
    ] },
  { id: 'chrom', name: 'Chrom', url: leisteChrom, ratio: 5.713, cells: [
      { box: [0.035, 0.183, 0.1786, 0.903], poly: '10.0,0.0 96.0,0.0 100.0,4.0 100.0,96.0 96.0,100.0 10.0,100.0 0.0,62.0 0.0,38.0' },
      { box: [0.1941, 0.183, 0.3436, 0.903], poly: '96.0,0.0 97.5,0.5 98.8,1.8 99.7,3.7 100.0,6.0 100.0,94.0 99.7,96.3 98.8,98.2 97.5,99.5 96.0,100.0 4.0,100.0 2.5,99.5 1.2,98.2 0.3,96.3 0.0,94.0 0.0,6.0 0.3,3.7 1.2,1.8 2.5,0.5 4.0,0.0' },
      { box: [0.3482, 0.183, 0.4981, 0.903], poly: '96.0,0.0 97.5,0.5 98.8,1.8 99.7,3.7 100.0,6.0 100.0,94.0 99.7,96.3 98.8,98.2 97.5,99.5 96.0,100.0 4.0,100.0 2.5,99.5 1.2,98.2 0.3,96.3 0.0,94.0 0.0,6.0 0.3,3.7 1.2,1.8 2.5,0.5 4.0,0.0' },
      { box: [0.5023, 0.183, 0.6518, 0.903], poly: '96.0,0.0 97.5,0.5 98.8,1.8 99.7,3.7 100.0,6.0 100.0,94.0 99.7,96.3 98.8,98.2 97.5,99.5 96.0,100.0 4.0,100.0 2.5,99.5 1.2,98.2 0.3,96.3 0.0,94.0 0.0,6.0 0.3,3.7 1.2,1.8 2.5,0.5 4.0,0.0' },
      { box: [0.6564, 0.183, 0.8059, 0.903], poly: '96.0,0.0 97.5,0.5 98.8,1.8 99.7,3.7 100.0,6.0 100.0,94.0 99.7,96.3 98.8,98.2 97.5,99.5 96.0,100.0 4.0,100.0 2.5,99.5 1.2,98.2 0.3,96.3 0.0,94.0 0.0,6.0 0.3,3.7 1.2,1.8 2.5,0.5 4.0,0.0' },
      { box: [0.8214, 0.183, 0.965, 0.903], poly: '90.0,0.0 4.0,0.0 0.0,4.0 0.0,96.0 4.0,100.0 90.0,100.0 100.0,62.0 100.0,38.0' },
    ] },
  { id: 'rost', name: 'Rost', url: leisteRost, ratio: 5.628, cells: [
      { box: [0.0437, 0.1545, 0.2019, 0.8613], poly: '0.0,11.1 8.8,0.0 93.5,1.9 99.1,10.4 99.7,14.1 99.4,83.3 90.6,97.4 19.4,99.6 9.7,97.0 1.5,85.9' },
      { box: [0.2074, 0.1649, 0.3512, 0.856], poly: '0.0,10.6 8.4,0.0 91.3,0.0 99.7,10.6 99.0,81.8 89.3,99.6 10.4,99.6 2.9,88.3 0.6,81.8' },
      { box: [0.3553, 0.1623, 0.4991, 0.856], poly: '0.0,10.9 8.1,0.0 91.3,0.4 99.7,10.9 98.1,85.3 88.3,98.5 85.4,99.6 11.0,98.9 2.9,88.3 0.6,81.9' },
      { box: [0.5028, 0.1623, 0.6465, 0.8586], poly: '0.0,10.9 8.4,0.4 91.6,0.0 99.7,10.9 98.7,85.3 89.3,99.6 10.4,99.2 0.6,81.6' },
      { box: [0.6516, 0.1623, 0.7953, 0.8586], poly: '0.0,10.9 8.1,0.0 91.3,0.4 99.7,10.9 98.7,81.2 96.4,88.0 88.3,98.1 10.4,99.6 0.3,82.0' },
      { box: [0.8, 0.1571, 0.9558, 0.8613], poly: '0.0,14.1 0.3,10.0 6.3,1.9 91.6,0.0 97.3,13.0 99.7,85.9 84.5,99.3 9.3,97.0 0.0,83.3' },
    ] },
];

const KEY = 'x4-sektorbau-hud-stil';
let cur = read();
function read(): { menu: string; frame: string } {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as { menu?: string; frame?: string } | null;
    return { menu: MENU_STYLES.some((m) => m.id === v?.menu) ? v!.menu! : 'waben', frame: FRAME_STYLES.some((f) => f.id === v?.frame) ? v!.frame! : 'werkstatt' };
  } catch {
    return { menu: 'waben', frame: 'werkstatt' };
  }
}
function save(): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cur)); } catch { /* Speicher nicht verfügbar */ }
}
export function menuStyle(): MenuStyle { return MENU_STYLES.find((m) => m.id === cur.menu)!; }
export function frameStyle(): FrameStyle { return FRAME_STYLES.find((f) => f.id === cur.frame)!; }
export function setMenuStyle(id: string): void { if (MENU_STYLES.some((m) => m.id === id)) { cur.menu = id; save(); } }
export function setFrameStyle(id: string): void { if (FRAME_STYLES.some((f) => f.id === id)) { cur.frame = id; save(); } }
