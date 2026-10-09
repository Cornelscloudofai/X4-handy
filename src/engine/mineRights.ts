// Schürfrechte (neue Spiele): Wer außerhalb seiner Lizenzsektoren abbauen will, braucht das Recht der Fraktion.
// Grundrohstoffe (Erz, Silizium, Eis, Gas) gibt es für wenig Ruf und Geld, Nividium erst mit gutem Ruf.
import { FACTIONS, SECTOR_MAP } from '../data/sectors';
import { WARES } from '../data/wares';
import type { GameState } from './types';
import { log } from './util';
import { book } from './ledger';

export type MineRightKind = 'base' | 'nividium';

/** Grundrohstoffe in einem fremden Sektor */
export const BASE_RIGHT = { rep: 2, cost: 50_000 };
/** Nividium je Sektor (reichere Felder kosten mehr Ruf und Geld) */
export const NIVIDIUM_RIGHT: Record<string, { rep: number; cost: number }> = {
  tkr: { rep: 5, cost: 500_000 },
  ravine: { rep: 10, cost: 1_500_000 },
};
const NIVIDIUM_DEFAULT = { rep: 8, cost: 1_000_000 };

export function rightKind(ware: string): MineRightKind {
  return ware === 'nividium' ? 'nividium' : 'base';
}

export function rightTerms(sectorId: string, kind: MineRightKind): { rep: number; cost: number } {
  return kind === 'nividium' ? NIVIDIUM_RIGHT[sectorId] ?? NIVIDIUM_DEFAULT : BASE_RIGHT;
}

export function hasMineRight(state: GameState, sectorId: string, kind: MineRightKind): boolean {
  if (!state.start) return true;
  // Grundrohstoffe sind in eigenen Lizenzsektoren (auch dem Heimatsektor) frei
  if (kind === 'base' && state.sectors.includes(sectorId)) return true;
  return !!state.mineRights?.includes(`${sectorId}:${kind}`);
}

/** Darf hier diese Ware abgebaut werden? */
export function canMine(state: GameState, sectorId: string, ware: string): boolean {
  return hasMineRight(state, sectorId, rightKind(ware));
}

/** Warum (noch) nicht kaufbar – oder null */
export function mineRightBlock(state: GameState, sectorId: string, kind: MineRightKind): string | null {
  const s = SECTOR_MAP[sectorId];
  if (!s) return 'Sektor unbekannt.';
  if (hasMineRight(state, sectorId, kind)) return 'Schürfrecht bereits vorhanden.';
  if (kind === 'nividium' && !s.fields.some((f) => f.ware === 'nividium')) return 'In diesem Sektor gibt es kein Nividium.';
  if (kind === 'nividium' && !hasMineRight(state, sectorId, 'base')) return 'Erst das Schürfrecht für Grundrohstoffe erwerben.';
  const t = rightTerms(sectorId, kind);
  if ((state.rep[s.faction] ?? 0) < t.rep) return `Benötigt Ruf ${t.rep} bei ${FACTIONS[s.faction].name}.`;
  if (state.credits < t.cost) return `Es fehlen ${Math.round(t.cost - state.credits).toLocaleString('de-DE')} Cr.`;
  return null;
}

export function buyMineRight(state: GameState, sectorId: string, kind: MineRightKind): { ok: boolean; msg: string } {
  const block = mineRightBlock(state, sectorId, kind);
  if (block) return { ok: false, msg: block };
  const s = SECTOR_MAP[sectorId];
  const t = rightTerms(sectorId, kind);
  book(state, -t.cost, 'build', `Schürfrecht ${kind === 'nividium' ? 'Nividium' : 'Grundrohstoffe'}: ${s.name}`, { kind: 'sector', id: sectorId });
  (state.mineRights ??= []).push(`${sectorId}:${kind}`);
  const what = kind === 'nividium' ? WARES.nividium.name : 'Grundrohstoffe';
  log(state, `Schürfrecht für ${what} in ${s.name} erworben.`, 'good', true, { kind: 'sector', id: sectorId });
  return { ok: true, msg: `Deine Miner dürfen jetzt ${what} in ${s.name} abbauen.` };
}
