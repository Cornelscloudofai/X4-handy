// Takt der Musik für die Grafik: die Taktkarte (scripts/analyze-beats.mjs) sagt, wann jeder Schlag kommt, welche
// Schläge eine „Eins“ sind und wie laut Bass, Mitten und Höhen gerade sind. beatAt() liefert zu einem Zeitpunkt im
// Stück weiche Werte zwischen 0 und 1, mit denen das Spiel Leuchten, Glitzern und Atmen steuert.

export interface BeatMap {
  duration: number;
  bpm: number;
  /** auf welchem der ersten vier Schläge die „Eins“ liegt */
  downbeatPhase: number;
  /** Zeitpunkte der Schläge (s) */
  beats: number[];
  /** wie kräftig jeder Schlag angeschlagen wird (0–255); fehlt bei älteren Karten */
  hits?: number[];
  /** mittlere Betonung je Taktposition 1–4 (stärkste = 1) */
  groove?: number[];
  /** Werte je Sekunde der Hüllkurven */
  rate: number;
  bass: number[];
  mid: number[];
  high: number[];
  /** Abschnitte: Beginn (s) und Stufe 0 ruhig, 1 mittel, 2 kräftig */
  sections: [number, number][];
}

export interface Beat {
  /** klingt nach jedem Schlag ab (1 → 0) */
  pulse: number;
  /** wie pulse, aber nur auf der „Eins“ */
  down: number;
  /**
   * Blitz: so hell, wie der Schlag in der Musik wirklich angeschlagen wird – die „Eins“ am hellsten und etwas
   * länger, der Nachschlag auf der Zwei kurz und schnell, Drei und Vier nur ein leises Zucken
   */
  flash: number;
  /** Nummer des letzten Schlags (für wechselnde Glitzer-Gruppen) */
  index: number;
  /** Position im Takt (0 = „Eins“ … 3) und Taktnummer */
  inBar: number;
  bar: number;
  /** Beginn einer Viertakt-Phrase: großes, langsamer abklingendes Aufleuchten (sonst 0) */
  phrase: number;
  /** Lautstärke der Bänder 0–1 */
  bass: number;
  mid: number;
  high: number;
  /** Abschnitt 0–2 und Zeit seit seinem Beginn */
  level: number;
  sectionT: number;
}

export const NO_BEAT: Beat = { pulse: 0, down: 0, flash: 0, index: -1, inBar: 0, bar: -1, phrase: 0, bass: 0, mid: 0, high: 0, level: 0, sectionT: 99 };

/** letzter Index i mit a[i] <= t (binäre Suche), -1 wenn keiner */
function lastAtOrBefore(a: number[], t: number, get: (i: number) => number = (i) => a[i]): number {
  let lo = 0, hi = a.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (get(m) <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

function env(v: number[], rate: number, t: number): number {
  const x = t * rate, i = Math.floor(x), f = x - i;
  const a = v[Math.max(0, Math.min(v.length - 1, i))] ?? 0, b = v[Math.max(0, Math.min(v.length - 1, i + 1))] ?? 0;
  return (a + (b - a) * f) / 255;
}

/** Blitz je Taktposition: Eins hell und etwas länger, Zwei kurz nachgesetzt, Drei/Vier leise */
const FLASH_WEIGHT = [1, 0.7, 0.3, 0.35];
const FLASH_DECAY = [8, 16, 14, 14];

/** Taktwerte an Stelle t (s) im Stück; decay: wie schnell der Puls nach einem Schlag abklingt */
export function beatAt(map: BeatMap, t: number, decay = 7): Beat {
  t = ((t % map.duration) + map.duration) % map.duration;
  const i = lastAtOrBefore(map.beats, t);
  const since = i >= 0 ? t - map.beats[i] : 99;
  const pulse = Math.exp(-since * decay);
  const pos = i - map.downbeatPhase, inBar = ((pos % 4) + 4) % 4, bar = Math.floor(pos / 4);
  const down = i >= 0 && inBar === 0 ? pulse : 0;
  // Stärke des Schlags aus der Musik (ohne Messung: mittlere Betonung der Taktposition)
  const strength = i < 0 ? 0 : map.hits ? (map.hits[i] ?? 0) / 255 : (map.groove?.[inBar] ?? 1);
  const flash = i < 0 ? 0 : Math.exp(-since * FLASH_DECAY[inBar]) * FLASH_WEIGHT[inBar] * Math.pow(strength, 1.3);
  const phrase = i >= 0 && inBar === 0 && bar % 4 === 0 ? Math.exp(-since * 2.2) * Math.max(0.4, strength) : 0;
  const s = lastAtOrBefore(map.sections as unknown as number[], t, (k) => map.sections[k][0]);
  return {
    pulse, down, flash, index: i, inBar, bar, phrase,
    bass: env(map.bass, map.rate, t), mid: env(map.mid, map.rate, t), high: env(map.high, map.rate, t),
    level: s >= 0 ? map.sections[s][1] : 0, sectionT: s >= 0 ? t - map.sections[s][0] : 99,
  };
}

// ---- Einstellung: Musik-Effekte an/aus (gemerkt); bei „Bewegung reduzieren“ ohnehin ruhig ----
const KEY = 'x4-sektorbau-musikeffekte';
export function musicFx(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'aus';
  } catch {
    return true;
  }
}
export function setMusicFx(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'an' : 'aus');
  } catch {
    /* Speicher nicht verfügbar */
  }
}
