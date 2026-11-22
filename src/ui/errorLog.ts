// Fehlerprotokoll für Rückmeldungen: Die letzten Laufzeitfehler (Meldung, Datei:Zeile, Zeitpunkt seit dem Start) werden
// im Speicher gesammelt und nur dann mitgeschickt, wenn jemand selbst eine Rückmeldung sendet. Nichts wird von allein
// übertragen.

const MAX = 15;
const list: string[] = [];
const t0 = Date.now();

function add(msg: string): void {
  const s = Math.round((Date.now() - t0) / 1000);
  const line = `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}] ${msg}`.slice(0, 400);
  // gleiche Meldung direkt hintereinander nur einmal (z. B. Fehler in jedem Bild)
  const last = list[list.length - 1];
  if (last && last.slice(last.indexOf(']') + 2) === line.slice(line.indexOf(']') + 2)) return;
  list.push(line);
  if (list.length > MAX) list.shift();
}

export function installErrorLog(): void {
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : '';
    add(`${e.message || 'Fehler'}${where}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    add(`Promise: ${typeof r === 'string' ? r : r?.message ?? String(r)}`);
  });
}

/** Für Tests und eigene Meldungen (z. B. gescheitertes Speichern) */
export function logError(msg: string): void { add(msg); }

/** Gesammelte Fehler als Text (leer, wenn keine) */
export function errorReport(): string { return list.join('\n'); }
