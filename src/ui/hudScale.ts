// HUD-Größe: ein Faktor für die ganze Bedienoberfläche (Leisten, Fenster, Knöpfe, Minispiel-Anzeigen).
// Die Oberfläche wird per CSS-Zoom vergrößert oder verkleinert (Variable --hud), die Karte bleibt unberührt.
// Minispiele zeichnen ihr Spielfeld in „HUD-Pixeln“: kleiner gestellt sieht man dort mehr vom Feld.

const KEY = 'x4-sektorbau-hud';
export const HUD_MIN = 0.7, HUD_MAX = 1.6;

let k = read();

function read(): number {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = Number(raw);
    if (raw !== null && raw !== undefined && Number.isFinite(v) && v > 0) return Math.max(HUD_MIN, Math.min(HUD_MAX, v));
  } catch {
    /* Speicher nicht verfügbar */
  }
  return 1;
}

/** eingestellter Faktor (1 = Standard) */
export function hudSetting(): number {
  return k;
}

/**
 * wirksamer Faktor: vergrößern nur, solange die Oberfläche noch mindestens 340 × 360 Pixel groß bleibt –
 * auf schmalen Handys (auch quer) würden Leisten, Fenster und Spielfeld sonst nicht mehr passen (verkleinern geht immer)
 */
export function hudScale(): number {
  if (k <= 1 || typeof window === 'undefined' || !window.innerWidth) return k;
  return Math.max(1, Math.min(k, window.innerWidth / 340, window.innerHeight / 360));
}

/** Faktor auf die Seite anwenden (CSS-Variable); bei jeder Größenänderung neu, wegen der Begrenzung */
export function applyHudScale(): void {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--hud', String(hudScale()));
}
if (typeof window !== 'undefined') window.addEventListener('resize', applyHudScale);

/** neuen Faktor setzen, merken und anwenden; meldet Größenänderung, damit Karte und Minispiel neu messen */
export function setHudScale(v: number): void {
  k = Math.max(HUD_MIN, Math.min(HUD_MAX, Math.round(v * 100) / 100));
  try {
    globalThis.localStorage?.setItem(KEY, String(k));
  } catch {
    /* Speicher nicht verfügbar */
  }
  applyHudScale();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
}
