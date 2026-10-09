// Kontobuch: jede Änderung des Guthabens mit Grund und Verweis (Station, Schiff, Markt, Auftrag …).
// Gleichartige Buchungen kurz hintereinander werden zusammengefasst, damit das Buch lesbar bleibt.
import type { GameState, LedgerCat, LogLink } from './types';

/** So viele Einträge bleiben erhalten (zusammengefasste zählen einmal) */
export const LEDGER_MAX = 400;
/** Gleiche Buchungen innerhalb dieser Spielzeit (s) landen in einem Eintrag */
const MERGE_SECONDS = 600;

export const LEDGER_LABEL: Record<LedgerCat, string> = {
  trade: 'Handel eigener Schiffe',
  station: 'Handel an der Station',
  contract: 'Aufträge',
  build: 'Bau, Lizenzen, Baupläne',
  ships: 'Schiffe',
  reward: 'Belohnungen',
  intel: 'Aufklärung',
  other: 'Sonstiges',
};

function linkKey(l?: LogLink): string {
  return l ? JSON.stringify(l) : '';
}

/** Bucht einen Betrag (positiv = Eingang, negativ = Ausgang) aufs Konto und ins Kontobuch */
export function book(state: GameState, amount: number, cat: LedgerCat, text: string, link?: LogLink, units?: number): void {
  if (!amount) return;
  state.credits += amount;
  const list = (state.ledger ??= []);
  const last = list[list.length - 1];
  if (last && last.cat === cat && last.text === text && linkKey(last.link) === linkKey(link) && Math.sign(last.amount) === Math.sign(amount) && state.time - last.t < MERGE_SECONDS) {
    last.amount += amount;
    last.n = (last.n ?? 1) + 1;
    if (units) last.units = (last.units ?? 0) + units;
    last.t = state.time;
    return;
  }
  list.push({ t: state.time, amount, cat, text, ...(link ? { link } : {}), ...(units ? { units } : {}) });
  if (list.length > LEDGER_MAX) list.splice(0, list.length - LEDGER_MAX);
}
