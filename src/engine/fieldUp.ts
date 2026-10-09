// Feldausbau: Ein Rohstofffeld lässt sich in drei Stufen erschließen – statt nur zum nächsten Feld weiterzuziehen.
// 1 Vermessung (Miner kartiert eine Stunde) · 2 Tiefenabbau · 3 Traktor-Leitstelle (Material aus einer eigenen Station im Sektor)
import { SECTOR_MAP } from '../data/sectors';
import { WARES } from '../data/wares';
import type { FieldDef, GameState } from './types';
import { log } from './util';
import { setFieldReserve } from './logistics';

export interface FieldStep {
  level: 1 | 2 | 3;
  name: string;
  cost: number;
  /** Material aus dem Lager einer eigenen Station im selben Sektor */
  materials: Record<string, number>;
  /** Bauzeit nach dem Bezahlen (Stufe 1: Kartierung durch einen Miner) */
  time: number;
  effect: string;
}

export const FIELD_STEPS: FieldStep[] = [
  { level: 1, name: 'Vermessung', cost: 50_000, materials: {}, time: 3600, effect: 'Verborgene Adern: Vorrat +50 %' },
  { level: 2, name: 'Tiefenabbau', cost: 250_000, materials: { hullparts: 300, claytronics: 40, energycells: 2000 }, time: 2 * 3600, effect: 'Nachwuchs doppelt so schnell' },
  { level: 3, name: 'Traktor-Leitstelle', cost: 1_000_000, materials: { hullparts: 800, claytronics: 120, energycells: 5000 }, time: 4 * 3600, effect: 'Vorrat ×2, erschöpftes Feld fördert noch mit 50 % Tempo' },
];

export function fieldUp(state: GameState, fieldId: string): { level: number; work?: { level: number; until: number } } {
  return state.fieldUp?.[fieldId] ?? { level: 0 };
}

/** Vorrat-Faktor: Vermessung ×1,5, Traktor-Leitstelle zusätzlich ×2 */
export function fieldCapFactor(state: GameState, fieldId: string): number {
  const l = fieldUp(state, fieldId).level;
  return (l >= 1 ? 1.5 : 1) * (l >= 3 ? 2 : 1);
}
export function fieldRegenFactor(state: GameState, fieldId: string): number {
  return fieldUp(state, fieldId).level >= 2 ? 2 : 1;
}
/** Abbautempo auf einem erschöpften Feld */
export function fieldFloor(state: GameState, fieldId: string): number {
  return fieldUp(state, fieldId).level >= 3 ? 0.5 : 0.25;
}

/** Sektor eines Felds */
export function fieldSector(fieldId: string): string | null {
  for (const s of Object.values(SECTOR_MAP)) if (s.fields.some((f) => f.id === fieldId)) return s.id;
  return null;
}

/** Eigene Station im Sektor, die das Material für die nächste Stufe hat (oder die am meisten davon hat) */
export function materialStation(state: GameState, fieldId: string, step: FieldStep) {
  const sec = fieldSector(fieldId);
  const sts = state.stations.filter((st) => st.sector === sec);
  const missing = (st: (typeof sts)[number]) => Object.entries(step.materials).reduce((n, [id, need]) => n + Math.max(0, need - (st.inventory[id] ?? 0)) * WARES[id].price.avg, 0);
  return sts.sort((a, b) => missing(a) - missing(b))[0] ?? null;
}

/** Was für die nächste Stufe noch fehlt */
export function nextStepCheck(state: GameState, f: FieldDef): { step: FieldStep | null; ok: boolean; why: string; missing: Record<string, number>; station: string | null } {
  const up = fieldUp(state, f.id);
  const step = FIELD_STEPS[up.level] ?? null;
  if (!step) return { step: null, ok: false, why: 'Voll ausgebaut', missing: {}, station: null };
  if (up.work) return { step, ok: false, why: 'Ausbau läuft', missing: {}, station: null };
  if (state.credits < step.cost) return { step, ok: false, why: `Es fehlen ${(step.cost - state.credits).toLocaleString('de-DE')} Cr`, missing: {}, station: null };
  if (step.level === 1) {
    const miners = state.ships.filter((s) => s.survey === f.id);
    return { step, ok: !miners.length, why: miners.length ? 'Vermessung läuft' : '', missing: {}, station: null };
  }
  const st = materialStation(state, f.id, step);
  if (!st) return { step, ok: false, why: 'Braucht eine eigene Station im Sektor', missing: {}, station: null };
  const missing: Record<string, number> = {};
  for (const [id, need] of Object.entries(step.materials)) if ((st.inventory[id] ?? 0) < need) missing[id] = Math.ceil(need - (st.inventory[id] ?? 0));
  return { step, ok: !Object.keys(missing).length, why: Object.keys(missing).length ? `Material fehlt im Lager von ${st.name}` : '', missing, station: st.id };
}

/** Nächste Stufe beginnen (Stufe 1: einen Miner zur Vermessung schicken) */
export function startFieldStep(state: GameState, f: FieldDef, shipId?: string): { ok: boolean; msg: string } {
  if (!state.start) return { ok: false, msg: 'Feldausbau gibt es in neuen Spielen.' };
  const c = nextStepCheck(state, f);
  if (!c.step || !c.ok) return { ok: false, msg: c.why || 'Nicht möglich.' };
  const step = c.step;
  if (step.level === 1) {
    const ship = state.ships.find((s) => s.id === shipId);
    if (!ship || ship.survey) return { ok: false, msg: 'Wähle einen Miner für die Vermessung.' };
    state.credits -= step.cost;
    ship.survey = f.id;
    log(state, `${ship.name} vermisst das Feld ${WARES[f.ware].name} (1 Stunde vor Ort).`, 'info');
    return { ok: true, msg: `${ship.name} fliegt zur Vermessung – danach ist der Vorrat um die Hälfte größer.` };
  }
  const st = state.stations.find((x) => x.id === c.station)!;
  state.credits -= step.cost;
  for (const [id, need] of Object.entries(step.materials)) st.inventory[id] = (st.inventory[id] ?? 0) - need;
  (state.fieldUp ??= {})[f.id] = { ...fieldUp(state, f.id), work: { level: step.level, until: state.time + step.time } };
  log(state, `${step.name} am Feld ${WARES[f.ware].name} begonnen (${Math.round(step.time / 3600)} h).`, 'info');
  return { ok: true, msg: `${step.name} begonnen – fertig in ${Math.round(step.time / 3600)} Stunden.` };
}

/** Vermessung abgeschlossen (vom Miner gemeldet) */
export function finishSurvey(state: GameState, fieldId: string): void {
  const up = fieldUp(state, fieldId);
  if (up.level >= 1) return;
  (state.fieldUp ??= {})[fieldId] = { ...up, level: 1 };
  log(state, 'Vermessung abgeschlossen: verborgene Adern gefunden – Vorrat +50 %.', 'good', true);
}

/** Laufende Ausbauten abschließen; Material für die nächste Stufe im Stationslager zurückhalten */
export function stepFieldUp(state: GameState): void {
  if (state.start) {
    const needs = new Map<string, Record<string, number>>();
    for (const s of Object.values(SECTOR_MAP)) for (const f of s.fields) {
      const up = fieldUp(state, f.id);
      // Material für die übernächste Stufe ab, sobald die laufende fertig ist; erst nach der Vermessung
      const step = FIELD_STEPS[up.work ? up.work.level : up.level];
      if (!step || up.level < 1 || !Object.keys(step.materials).length) continue;
      const st = materialStation(state, f.id, step);
      if (!st) continue;
      const cur = needs.get(st.id) ?? {};
      for (const [id, n] of Object.entries(step.materials)) cur[id] = Math.max(cur[id] ?? 0, n);
      needs.set(st.id, cur);
    }
    for (const st of state.stations) setFieldReserve(st.id, needs.get(st.id) ?? null);
  }
  for (const [id, up] of Object.entries(state.fieldUp ?? {})) {
    if (up.work && state.time >= up.work.until) {
      const step = FIELD_STEPS[up.work.level - 1];
      state.fieldUp![id] = { level: up.work.level };
      log(state, `${step.name} fertig: ${step.effect}.`, 'good', true);
    }
  }
}
