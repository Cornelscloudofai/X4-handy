// Kampf auf der Karte (Stufe 4 in docs/design/kampf.md): Eigene Kampfschiffe und eine Gegnerrotte im Gefechtsabstand
// tauschen laufend Schaden aus – abgerechnet nach Kampfwert, leicht gestreut. Die Rotte verliert Schiffe, Piraten fliehen
// bei hohen Verlusten, Xenon und Kha'ak kämpfen fast bis zum Ende. Eigene S- und M-Schiffe werden zerstört (Wrack mit
// Schrott), L und XL nur kampfunfähig. Beschädigte Kampfschiffe reparieren an ihrer Heimatstation mit Hüllenteilen.
import { SECTOR_MAP } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { addWare, freeUnits } from './economy';
import { FOE_NAME, hostileState, type Hostile } from './hostiles';
import { RAID_BOUNTY, incidentById, repelRaid } from './incidents';
import { book } from './ledger';
import type { GameState, Ship } from './types';
import { emit, log, normalSpeed } from './util';

/** Gefechtsabstand (km): so nah müssen eigene Kampfschiffe an der Rotte sein */
export const FIGHT_R = 6;
/** Schaden je Sekunde in Kampfwert-Einheiten: jede Seite verliert Gegner-Kampfwert × K */
export const K = 1 / 40;
/** Rückzug: Piraten fliehen unter 40 % ihrer Stärke, Xenon und Kha'ak erst unter 15 % */
export const FLEE_AT = { pirates: 0.4, xenon: 0.15, khaak: 0.15 } as const;
/** Vorerst aus (zum Ausprobieren der Gefechte): Rotten kämpfen bis zum letzten Schiff, statt zu fliehen */
export const FLEE_ON = false;
/** Eigene Kampfschiffe kehren unter 25 % Hülle zur Reparatur heim */
export const RETREAT_AT = 0.25;
/** Reparatur an der Heimatstation: volle Instandsetzung in fünf Minuten, kostet 30 % der Hüllenteile des Baus */
export const REPAIR_TIME = 5 * 60;
export const REPAIR_SHARE = 0.3;
/** Schrott im Wrack: Anteil der Hüllenteile des Schiffs; Piratenwracks je Schiff */
export const WRECK_SHARE = 0.4;
export const FOE_SCRAP = 30;
/** Wracks bleiben zwei Tage liegen */
export const WRECK_TTL = 48 * 3600;
/** Kopfgeld je zerstörtem Gegnerschiff */
export const KILL_BOUNTY = 1000;

export interface Wreck {
  id: number;
  sector: string;
  x: number;
  z: number;
  /** Herkunft für die Anzeige („Mamba ZHN-123“, „Piratenwracks“) */
  name: string;
  /** Schrott in Hüllenteilen */
  scrap: number;
  until: number;
}

export const wrecksOf = (state: GameState): Wreck[] => (state.wrecks ??= []);
export const hullOf = (s: Ship): number => s.hp ?? 1;
export const hostileHp = (h: Hostile): number => h.hp ?? h.power;
/** Schiffe der Rotte, die noch fliegen */
export const aliveOf = (h: Hostile): number => Math.max(1, Math.ceil((h.n * hostileHp(h)) / h.power - 1e-9));

/** Eigene Kampfschiffe im Gefecht mit dieser Rotte */
export function fightersAt(state: GameState, h: Hostile): Ship[] {
  return state.ships.filter((s) => SHIP_MAP[s.cls].combat && !s.disabled && hullOf(s) > 0 && s.sector === h.sector && Math.hypot(s.x - h.x, s.z - h.z) <= FIGHT_R);
}

/** Zufall ohne Eingriff in den Spielzufall */
function jitter(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function addWreck(state: GameState, sector: string, x: number, z: number, name: string, scrap: number): void {
  if (scrap <= 0) return;
  wrecksOf(state).push({ id: state.nextId++, sector, x, z, name, scrap: Math.round(scrap), until: state.time + WRECK_TTL });
}

/** Eigenes Kampfschiff verloren: S/M zerstört (Wrack), L/XL kampfunfähig */
function shipDown(state: GameState, s: Ship, h: Hostile): void {
  const c = SHIP_MAP[s.cls];
  emit({ type: 'boom', sector: s.sector, x: s.x, z: s.z, big: c.size !== 'S' });
  if (c.size === 'S' || c.size === 'M') {
    state.ships.splice(state.ships.indexOf(s), 1);
    addWreck(state, s.sector, s.x, s.z, s.name, (c.materials.hullparts ?? 0) * WRECK_SHARE);
    // wer es begleitet hat oder von ihm begleitet wurde, verliert den Bezug von selbst (combat.ts)
    log(state, `${s.name} (${c.name}) wurde im Gefecht mit ${FOE_NAME[h.foe]} in ${SECTOR_MAP[s.sector].name} zerstört. Das Wrack lässt sich bergen.`, 'bad', true, { kind: 'sector', id: s.sector });
  } else {
    s.disabled = true;
    s.hp = 0.05;
    s.path = [];
    s.status = 'Kampfunfähig – muss abgeschleppt werden';
    log(state, `${s.name} ist kampfunfähig und treibt in ${SECTOR_MAP[s.sector].name}. Es muss abgeschleppt werden.`, 'bad', true, { kind: 'ship', id: s.id });
  }
}

/** Rotte vernichtet: Kopfgeld, Piratenwracks, ein laufender Überfall ist abgewehrt */
function hostileDown(state: GameState, h: Hostile, by: string): void {
  const hs = hostileState(state);
  hs.list.splice(hs.list.indexOf(h), 1);
  emit({ type: 'boom', sector: h.sector, x: h.x, z: h.z, big: true });
  addWreck(state, h.sector, h.x, h.z, `${FOE_NAME[h.foe]} (Wracks)`, FOE_SCRAP * h.n);
  const inc = h.incident != null ? incidentById(state, h.incident) : undefined;
  if (inc) repelRaid(state, inc.id);
  const bounty = KILL_BOUNTY * h.n;
  book(state, bounty, 'other', `Kopfgeld: ${FOE_NAME[h.foe]} vernichtet`, { kind: 'sector', id: h.sector });
  log(state, `${FOE_NAME[h.foe]} in ${SECTOR_MAP[h.sector].name} vernichtet${by ? ` von ${by}` : ''} – ${bounty.toLocaleString('de-DE')} Cr Kopfgeld${inc ? ` und ${RAID_BOUNTY.toLocaleString('de-DE')} Cr für den abgewehrten Überfall` : ''}. Die Wracks lassen sich bergen.`, 'good', true, { kind: 'sector', id: h.sector });
}

/** Je Simulationsschritt: Gefechte abrechnen, Wracks altern lassen */
export function stepBattles(state: GameState, dt: number): void {
  const hs = hostileState(state);
  for (const h of [...hs.list]) {
    if (h.phase === 'leave') { h.fighting = false; continue; }
    const own = fightersAt(state, h);
    // Gefecht beginnt: Zeit auf normal, damit man zusehen oder eingreifen kann
    if (own.length && !h.fighting) { normalSpeed(state); log(state, `Gefecht in ${SECTOR_MAP[h.sector].name}: ${own.map((x) => x.name).join(', ')} gegen ${FOE_NAME[h.foe]}.`, 'warn', true, { kind: 'sector', id: h.sector }); }
    h.fighting = own.length > 0;
    if (!own.length) continue;
    const ownPower = own.reduce((a, s) => a + SHIP_MAP[s.cls].combat!.power * hullOf(s), 0);
    const r1 = 0.75 + 0.5 * jitter(state.time, h.id), r2 = 0.75 + 0.5 * jitter(h.id, state.time);
    // Schaden an der Rotte
    h.hp = hostileHp(h) - ownPower * K * dt * r1;
    // Schaden an eigenen Schiffen: trifft eines nach dem anderen, stärkere eher (sie ziehen das Feuer auf sich)
    const dmg = Math.max(0, hostileHp(h)) * K * dt * r2;
    const pick = own[Math.floor(jitter(state.time * 3, h.id) * own.length) % own.length];
    const p = SHIP_MAP[pick.cls].combat!.power;
    pick.hp = hullOf(pick) - dmg / p;
    if (pick.hp <= 0) shipDown(state, pick, h);
    if (hostileHp(h) <= 0) { hostileDown(state, h, own.map((s) => s.name).join(', ')); continue; }
    // Rückzug bei hohen Verlusten
    if (FLEE_ON && hostileHp(h) < FLEE_AT[h.foe] * h.power) {
      const inc = h.incident != null ? incidentById(state, h.incident) : undefined;
      if (inc) repelRaid(state, inc.id);
      h.phase = 'leave';
      h.fighting = false;
      h.target = undefined;
      h.path = [{ sector: h.sector, x: h.x * 1.6, z: h.z * 1.6 }];
      log(state, `${FOE_NAME[h.foe]} in ${SECTOR_MAP[h.sector].name} flieht – noch ${aliveOf(h)} von ${h.n} Schiffen.`, 'good', false, { kind: 'sector', id: h.sector });
    }
  }
  const w = wrecksOf(state);
  for (let i = w.length - 1; i >= 0; i--) if (state.time >= w[i].until) w.splice(i, 1);
}

/** Reparatur eines Kampfschiffs an seiner Heimatstation (aus deren Hüllenteilen). true = repariert gerade */
export function repairAtHome(state: GameState, s: Ship, dt: number): boolean {
  if (hullOf(s) >= 1 || s.disabled) return false;
  const home = state.stations.find((x) => x.id === s.home);
  if (!home || home.sector !== s.sector || Math.hypot(home.x - s.x, home.z - s.z) > 20) return false;
  const per = (SHIP_MAP[s.cls].materials.hullparts ?? 0) * REPAIR_SHARE; // Hüllenteile für 0 → 100 %
  const step = Math.min(1 - hullOf(s), dt / REPAIR_TIME);
  const need = per * step;
  if ((home.inventory.hullparts ?? 0) < need) { s.status = `Wartet auf Hüllenteile zur Reparatur (${Math.round(hullOf(s) * 100)} %)`; return true; }
  addWare(home, 'hullparts', -need);
  s.hp = Math.min(1, hullOf(s) + step);
  s.status = `Reparatur an ${home.name}: ${Math.round(hullOf(s) * 100)} %`;
  return true;
}

/**
 * Ergebnis, wenn der Spieler ein Gefecht selbst übernimmt (0–3 Sterne): ab einem Stern ist die Rotte vernichtet,
 * die beteiligten Kampfschiffe nehmen je nach Ergebnis noch Schaden (1 Stern 40 %, 2 Sterne 20 %, 3 Sterne keinen)
 */
export function resolveBattle(state: GameState, hostileId: number, stars: number): string | null {
  const h = hostileState(state).list.find((x) => x.id === hostileId);
  if (!h) return null;
  const k = Math.max(0, Math.min(3, Math.round(stars)));
  if (!k) return 'Nicht geschafft – das Gefecht läuft weiter.';
  const own = fightersAt(state, h);
  const hit = [0, 0.4, 0.2, 0][k];
  for (const s of own) {
    s.hp = Math.max(0.05, hullOf(s) - hit);
  }
  hostileDown(state, h, 'dir');
  return `${FOE_NAME[h.foe]} vernichtet${hit ? ` – deine Kampfschiffe haben ${Math.round(hit * 100)} % Hülle verloren` : ' – ohne eigenen Schaden'}.`;
}

/** Schwierigkeit des Minispiels für ein Gefecht (nach Stärke der Rotte) */
export const battleLevel = (h: Hostile): 1 | 2 | 3 => (h.power < 200 ? 1 : h.power < 400 ? 2 : 3);

/**
 * Wrack bergen (Ergebnis des Bergungs-Einsatzes, 0–3 Sterne): Schrott als Hüllenteile in die eigene Station mit dem
 * meisten Platz im Sektor, sonst in die erste Station
 */
export function salvageWreck(state: GameState, wreckId: number, stars: number): string | null {
  const w = wrecksOf(state);
  const i = w.findIndex((x) => x.id === wreckId);
  if (i < 0) return null;
  const k = Math.max(0, Math.min(3, Math.round(stars)));
  if (!k) return 'Nichts geborgen – das Wrack liegt noch da.';
  const wr = w[i];
  const cand = state.stations.filter((st) => st.sector === wr.sector);
  const st = (cand.length ? cand : state.stations).slice().sort((a, b) => freeUnits(b, 'hullparts') - freeUnits(a, 'hullparts'))[0];
  w.splice(i, 1);
  if (!st) return 'Keine Station, die den Schrott annehmen könnte.';
  const n = Math.min(Math.round(wr.scrap * [0, 0.5, 0.8, 1][k]), Math.floor(freeUnits(st, 'hullparts')));
  if (n > 0) addWare(st, 'hullparts', n);
  const msg = n > 0 ? `${wr.name} geborgen: ${n} Hüllenteile nach ${st.name}.` : `${wr.name} geborgen, aber ${st.name} hat keinen Platz für Hüllenteile.`;
  log(state, msg, n > 0 ? 'good' : 'info', false, { kind: 'station', id: st.id });
  return msg;
}
