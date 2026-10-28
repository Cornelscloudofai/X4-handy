// Eigenheiten der neuen Sektoren. Alles hängt nur an der Spielzeit (nichts davon steht im Spielstand):
//   Glutsee I        – 1000 % Sonne; Strahlungssturm alle 3 h für 35 min: Sonne 3000 %, Schiffe 60 %, Sonnenöfen
//                      dreimal so schnell. Je 6 Produktionsmodule ein Kühlmantel, je Modul 40 Kühlmittel pro Sturm –
//                      sonst überhitzt die Station: Produktion steht, danach Reparatur mit Hüllenteilen
//   Die Aschefelder  – Staub: Schiffe immer mit 80 %, Miner fördern 30 % mehr
//   Der Schmiedestern – Pulsar: das Sonnenlicht schwankt im Zwei-Stunden-Takt zwischen 60 % und 300 %
import { SECTOR_MAP } from '../data/sectors';
import { MODULE_MAP } from '../data/modules';
import { addWare } from './economy';
import type { Station } from './types';
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
export const GLUT_SUN = 1000;
export const STORM_SUN = 3000;
/** Ein Kühlmantel schützt so viele Produktionsmodule */
export const MANTLE_COVERS = 6;
/** Kühlmittel je geschütztem Produktionsmodul und Sturm */
export const COOLANT_PER_MODULE = 40;
/** Hüllenteile je Produktionsmodul, um nach einer Überhitzung wieder anzulaufen */
export const HEAT_REPAIR = 25;

/** Sonnenlicht laut Sektordaten (ohne Sturm und Pulsar) – für Baubedingungen */
export function baseSun(sectorId: string): number {
  return sectorId === 'f-glut1' ? GLUT_SUN : sectorId === 'f-schmiede' ? PULSAR_SUN[1] : SECTOR_MAP[sectorId]?.sunlight ?? 100;
}

/** Sturmschutz einer Station: Kühlmäntel, nötige Kühlmäntel, Kühlmittel je Sturm */
export function coolingNeed(st: Station): { mantles: number; prod: number; needMantles: number; coolant: number; covered: boolean } {
  const mantles = st.modules.filter((m) => MODULE_MAP[m.def]?.kind === 'cooling').length;
  const prod = st.modules.filter((m) => MODULE_MAP[m.def]?.kind === 'production').length;
  const needMantles = Math.ceil(prod / MANTLE_COVERS);
  return { mantles, prod, needMantles, coolant: prod * COOLANT_PER_MODULE, covered: mantles >= needMantles };
}

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
  lastHeatT = -1;
}

/** Je Simulationsschritt: aktuelle Werte setzen und Wechsel melden */
export function stepPhenomena(state: GameState): void {
  const t = state.time;
  if (SECTOR_MAP['f-schmiede']) SECTOR_MAP['f-schmiede'].sunlight = pulsarSun(t);
  speed['f-asche'] = DUST_SPEED;
  const storm = stormActive(t);
  speed['f-glut1'] = storm ? STORM_SPEED : 1;
  if (SECTOR_MAP['f-glut1']) SECTOR_MAP['f-glut1'].sunlight = storm ? STORM_SUN : GLUT_SUN;
  stepHeat(state, storm);
  if (SECTOR_MAP['f-glut1'] && lastStorm !== null && storm !== lastStorm) {
    if (storm) log(state, 'Strahlungssturm in Glutsee I: Schiffe dort fliegen eine halbe Stunde lang langsamer.', 'warn', true, { kind: 'sector', id: 'f-glut1' });
    else log(state, 'Der Sturm in Glutsee I ist vorbei.', 'info', false, { kind: 'sector', id: 'f-glut1' });
  }
  lastStorm = storm;
}

/**
 * Stationen in Glutsee I im Sturm: Mit Kühlmantel verbraucht der Sturm laufend Kühlmittel aus dem Lager – solange es
 * reicht, läuft die Produktion mit 3000 % Sonne. Ohne Mantel oder sobald das Kühlmittel ausgeht, überhitzt die Station:
 * alles steht, und nach dem Sturm braucht jedes Produktionsmodul Hüllenteile (aus dem eigenen Lager oder zugekauft).
 */
let lastHeatT = -1;
function stepHeat(state: GameState, storm: boolean): void {
  const dt = lastHeatT < 0 ? 0 : Math.max(0, state.time - lastHeatT);
  lastHeatT = state.time;
  for (const st of state.stations) {
    if (st.sector !== 'f-glut1') continue;
    const c = coolingNeed(st);
    const prod = c.prod;
    if (storm && !st.heat && prod) {
      // genug Kühlmäntel für alle Produktionsmodule und Kühlmittel im Lager?
      const need = (c.coolant / STORM_TIME) * dt;
      if (c.covered && (st.inventory.superfluidcoolant ?? 0) >= need) addWare(st, 'superfluidcoolant', -need);
      else if (dt > 0) {
        st.heat = prod * HEAT_REPAIR;
        log(state, `${st.name} ist im Sturm überhitzt. Die Produktion steht – zum Wiederanlauf braucht sie ${st.heat} Hüllenteile.`, 'bad', true, { kind: 'station', id: st.id });
      }
    }
    // Reparatur nach dem Sturm mit Hüllenteilen aus dem Stationslager
    if (!storm && st.heat) {
      const n = Math.min(st.heat, st.inventory.hullparts ?? 0);
      if (n > 0) { addWare(st, 'hullparts', -n); st.heat -= n; }
      if (st.heat <= 1e-6) { st.heat = 0; log(state, `${st.name} ist repariert und produziert wieder.`, 'good', true, { kind: 'station', id: st.id }); }
    }
  }
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
    return c.active ? `Strahlungssturm · Sonne 3000 % · Schiffe 60 % · noch ${m} min` : `Sonne 1000 % · nächster Sturm in ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`}`;
  }
  if (sectorId === 'f-asche') return 'Staub · Abbau +30 % · Schiffe 80 %';
  if (sectorId === 'f-schmiede') return `Pulsar · Sonne jetzt ${pulsarSun(time)} % (60–300 %)`;
  return '';
}
