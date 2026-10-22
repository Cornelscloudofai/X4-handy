// Einsätze des Kampf-Minispiels: neben dem Geleitschutz (Frachter zum Sprungtor) eigene Aufgaben mit eigenem Ziel,
// eigener Karte und eigener Wertung. Ohne DOM, damit Menü, Rahmen und Tests die Angaben teilen.

/**
 * Geleit (Frachter zum Tor), Station verteidigen, Konvoi (drei Frachter), Überfall (Piratenkonvoi abfangen),
 * Bergung (Container unter Beschuss bergen), Nest (erst Brutöffnungen, dann Kern), Flucht (überleben, bis der
 * Sprungantrieb geladen ist)
 */
export type Mission = 'geleit' | 'station' | 'konvoi' | 'ueberfall' | 'bergung' | 'nest' | 'flucht';

/** Gegnerseite des Kampfs, wie im Menü (Spielkennung) */
export type CombatKind = 'pirates' | 'xenon' | 'khaak';

export interface MissionInfo {
  name: string;
  /** kurzer Satz fürs Menü */
  sub: string;
  /** welche Gegner es in diesem Einsatz gibt */
  sides: CombatKind[];
}

export const MISSIONS: Record<Exclude<Mission, 'geleit'>, MissionInfo> = {
  station: { name: 'Station verteidigen', sub: 'Angriffe aus allen Richtungen – zerstörte Stationstürme mit Fundstücken reparieren', sides: ['pirates', 'xenon', 'khaak'] },
  konvoi: { name: 'Konvoi', sub: 'Drei Frachter, weit auseinander – nicht alle sind zu retten. Wen schützt du?', sides: ['pirates', 'xenon', 'khaak'] },
  flucht: { name: 'Flucht', sub: 'Ein beschädigter Frachter lädt den Sprungantrieb – halte durch, bis er springt', sides: ['pirates', 'xenon', 'khaak'] },
  bergung: { name: 'Bergung unter Beschuss', sub: 'Container mit dem Traktorstrahl aus dem Wrackfeld zum Bergungsschiff schleppen', sides: ['pirates', 'xenon', 'khaak'] },
  ueberfall: { name: 'Überfall', sub: 'Rollentausch: den Piratenkonvoi abfangen, bevor er das Sprungtor erreicht', sides: ['pirates'] },
  nest: { name: 'Nest ausheben', sub: 'Ein Nest spuckt Drohnen aus – erst die Brutöffnungen, dann der Kern', sides: ['xenon', 'khaak'] },
};

export const MISSION_IDS = Object.keys(MISSIONS) as Exclude<Mission, 'geleit'>[];

/** Schlüssel für Rekorde und Abzeichen: eigener Eintrag je Einsatz und Gegnerseite */
export function recordKey(kind: string, mission?: Mission): string {
  return mission && mission !== 'geleit' ? `${kind}@${mission}` : kind;
}
