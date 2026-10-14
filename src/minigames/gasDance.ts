// Tanz der Gassammeldrohnen zum Höhepunkt von „Celestial Drift“ (ab der „Eins“ bei etwa 1:57): zwei Drohnen fliegen
// heran, umkreisen den Sammler, tänzeln miteinander, ziehen Achten um ihn, wackeln im Doppelschlag neben ihm und
// verabschieden sich in einer Spirale. Die Choreografie zählt in Schlägen (fortlaufende Schlagposition aus der
// Taktkarte), damit jede Figur auf dem Takt liegt – auch wenn das Tempo leicht schwankt. Reine Zierde, ohne Einfluss
// auf die Wertung. Hier nur die Zielpunkte relativ zum Sammler; das Spiel lässt die Drohnen ihnen weich folgen.

/** Länge des Tanzes in Schlägen (16 Takte) */
export const DANCE_BEATS = 64;

export interface DanceFrame {
  /** Zielpunkte der beiden Drohnen relativ zum Sammler (px) */
  a: [number, number];
  b: [number, number];
  /** Deckkraft (Ein- und Ausflug) */
  alpha: number;
  /** Name der Figur (für Tests und Fehlersuche) */
  figure: 'anflug' | 'kreisen' | 'paartanz' | 'acht' | 'wackeln' | 'abflug';
  /** wie stark die Drohnen ihrem Ziel folgen (höher = enger) */
  grip: number;
}

const TAU = Math.PI * 2;
const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const pol = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];

/**
 * Zielpunkte bei Tanzschlag d (0 … DANCE_BEATS); w/h: Spielfeldgröße für An- und Abflug von außerhalb;
 * kick: Blitz des aktuellen Schlags (0–1) für kleine Hüpfer im Takt. null außerhalb des Tanzes.
 */
export function danceFrame(d: number, w: number, h: number, kick = 0): DanceFrame | null {
  if (d < 0 || d > DANCE_BEATS) return null;
  const far = Math.hypot(w, h) * 0.6;
  // 0–8: Anflug von links oben und rechts oben in Schlangenlinien, kommen auf dem 8. Schlag neben dem Sammler an
  if (d < 8) {
    const k = ease(d / 8), sway = Math.sin(d * Math.PI * 0.5) * 40 * (1 - k);
    const from = (sx: number): [number, number] => [sx * (far * (1 - k) + 70 * k) + sway, -far * 0.8 * (1 - k)];
    return { a: from(-1), b: from(1), alpha: Math.min(1, d / 2), figure: 'anflug', grip: 5 };
  }
  // 8–24: umkreisen den Sammler auf gegenüberliegenden Seiten, eine Runde je zwei Takte; auf jedem Schlag ein Hüpfer nach außen
  if (d < 24) {
    const ang = ((d - 8) / 8) * TAU, r = 70 + 14 * kick;
    return { a: pol(r, ang + Math.PI), b: pol(r, ang), alpha: 1, figure: 'kreisen', grip: 7 };
  }
  // 24–36: entfernen sich etwas nach vorn und tanzen umeinander (eine Drehung je Takt), die Mitte pendelt im Zwei-Schlag-Takt
  if (d < 36) {
    const k = ease((d - 24) / 3) * (1 - ease((d - 34) / 2));
    const cx = Math.sin(((d - 24) / 2) * Math.PI) * 45 * k, cy = -150 * k;
    const ang = ((d - 24) / 4) * TAU, r = 30 + 40 * (1 - k) + 6 * kick;
    const [ox, oy] = pol(r, ang);
    return { a: [cx - ox, cy - oy], b: [cx + ox, cy + oy], alpha: 1, figure: 'paartanz', grip: 6 };
  }
  // 36–44: Achten um den Sammler (er sitzt im Kreuzungspunkt), um einen Viertelumlauf versetzt – so kreuzen sie sich nie
  if (d < 44) {
    const p = ((d - 36) / 8) * TAU;
    const eight = (ph: number): [number, number] => [Math.sin(ph) * 95, Math.sin(ph * 2) * 45];
    return { a: eight(p - Math.PI / 2), b: eight(p), alpha: 1, figure: 'acht', grip: 7 };
  }
  // 44–52: neben dem Sammler im Doppelschlag wackeln – auf der Eins eng heran, auf der Zwei wieder hinaus
  if (d < 52) {
    const inBar = (d - 44) % 4, r = inBar < 1 ? 48 + 32 * inBar : inBar < 3 ? 80 : 80 - 32 * (inBar - 3), bob = Math.sin((d - 44) * Math.PI) * 10;
    return { a: [-r, bob], b: [r, -bob], alpha: 1, figure: 'wackeln', grip: 9 };
  }
  // 52–56: Abschied – eine letzte, enge Runde um den Sammler
  if (d < 56) {
    const ang = ((d - 52) / 4) * TAU, r = 70 + 10 * kick;
    return { a: pol(r, ang + Math.PI), b: pol(r, ang), alpha: 1, figure: 'abflug', grip: 7 };
  }
  // 56–64: in Schlangenlinien nach links oben und rechts oben hinaus, dabei ausblenden
  const k = ease((d - 56) / 8), wave = Math.sin((d - 56) * Math.PI * 0.5) * 35 * (1 - k * 0.5);
  const to = (sx: number): [number, number] => [sx * (70 + k * far * 0.7) + wave, -k * far * 0.9];
  return { a: to(-1), b: to(1), alpha: Math.min(1, (64 - d) / 3), figure: 'abflug', grip: 5 };
}
