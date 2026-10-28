// Eigenheiten der neuen Sektoren. Alles hängt nur an der Spielzeit (nichts davon steht im Spielstand):
//   Glutsee I        – Strahlungssturm: alle 3 h für 35 min, Schiffe im Sektor fliegen dann mit 60 %
//   Die Aschefelder  – Staub: Schiffe immer mit 80 %, Miner fördern 30 % mehr
//   Der Schmiedestern – Pulsar: das Sonnenlicht schwankt im Zwei-Stunden-Takt zwischen 60 % und 300 %
import { SECTOR_MAP } from '../data/sectors';
import type { GameState } from './types';
import { log } from './util';

export const STORM_CYCLE = 3 * 3600;
export const STORM_TIME = 35 * 60;
/** Versatz, damit der erste Sturm nicht gleich bei Spielbeginn kommt */
const STORM_OFFSET = 70 * 60;
export const STORM_SPEED = 0.6;
export const DUST_SPEED = 0.8;
export const DUST_MINING = 1.3;
export const PULSAR_PERIOD = 2 * 3600;
export const PULSAR_SUN: [number, number] = [60, 300];

export const stormActive = (time: number): boolean => ((time + STORM_OFFSET) % STORM_CYCLE) < STORM_TIME;
/** Wie lange der laufende Sturm noch dauert bzw. bis der nächste kommt (s) */
export function stormClock(time: number): { active: boolean; left: number } {
  const ph = (time + STORM_OFFSET) % STORM_CYCLE;
  return ph < STORM_TIME ? { active: true, left: STORM_TIME - ph } : { active: false, left: STORM_CYCLE - ph };
}
export function pulsarSun(time: number): number {
  const [lo, hi] = PULSAR_SUN;
  return Math.round((lo + hi) / 2 + ((hi - lo) / 2) * Math.sin((time / PULSAR_PERIOD) * Math.PI * 2));
}

/** Tempo der Schiffe je Sektor (1 = normal) – gilt für eigene und fremde Schiffe */
const speed: Record<string, number> = {};
export const sectorSpeed = (sectorId: string): number => speed[sectorId] ?? 1;
/** Abbau-Faktor je Rohstofffeld (über die Feld-ID; die Felder der Aschefelder beginnen mit „asche-“) */
export const fieldMining = (fieldId: string): number => (fieldId.startsWith('asche-') ? DUST_MINING : 1);

let lastStorm: boolean | null = null;
/** Für die Darstellung: tobt gerade der Sturm in Glutsee I? */
export const stormNow = (): boolean => !!lastStorm;

export function resetPhenomena(): void {
  for (const k of Object.keys(speed)) delete speed[k];
  lastStorm = null;
}

/** Je Simulationsschritt: aktuelle Werte setzen und Wechsel melden */
export function stepPhenomena(state: GameState): void {
  const t = state.time;
  if (SECTOR_MAP['f-schmiede']) SECTOR_MAP['f-schmiede'].sunlight = pulsarSun(t);
  speed['f-asche'] = DUST_SPEED;
  const storm = stormActive(t);
  speed['f-glut1'] = storm ? STORM_SPEED : 1;
  if (SECTOR_MAP['f-glut1'] && lastStorm !== null && storm !== lastStorm) {
    if (storm) log(state, 'Strahlungssturm in Glutsee I: Schiffe dort fliegen eine halbe Stunde lang langsamer.', 'warn', true, { kind: 'sector', id: 'f-glut1' });
    else log(state, 'Der Sturm in Glutsee I ist vorbei.', 'info', false, { kind: 'sector', id: 'f-glut1' });
  }
  lastStorm = storm;
}

/** Ganz kurz für die Kopfzeile der Sektoransicht (oder leer) */
export function phenomenonShort(sectorId: string, time: number): string {
  if (sectorId === 'f-glut1') { const c = stormClock(time); return c.active ? `Sturm · ${Math.ceil(c.left / 60)} min` : ''; }
  if (sectorId === 'f-asche') return 'Staub';
  if (sectorId === 'f-schmiede') return `Sonne ${pulsarSun(time)} %`;
  return '';
}

/** Text für die Kartenkarte (oder leer) */
export function phenomenonText(sectorId: string, time: number): string {
  if (sectorId === 'f-glut1') {
    const c = stormClock(time);
    const m = Math.ceil(c.left / 60);
    return c.active ? `Strahlungssturm · Schiffe 60 % · noch ${m} min` : `Nächster Sturm in ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`}`;
  }
  if (sectorId === 'f-asche') return 'Staub · Abbau +30 % · Schiffe 80 %';
  if (sectorId === 'f-schmiede') return `Pulsar · Sonne jetzt ${pulsarSun(time)} % (60–300 %)`;
  return '';
}
