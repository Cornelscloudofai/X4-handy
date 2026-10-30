// Kampfschiffe auf der Karte (Stufe 2 in docs/design/kampf.md): nur Befehle, keine Einzelsteuerung.
// Wache an einer Station, Patrouille in einem Gebiet, Geleit für ein eigenes Schiff, Flug zu einem Punkt.
// Gekämpft wird erst ab Stufe 3/4 – bis dahin fliegen die Schiffe ihre Befehle ab und zeigen Präsenz.
import { SECTOR_MAP, SECTOR_RADIUS, insideHex } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { moveAlong, planPath, stationById } from './logistics';
import type { CombatOrder, GameState, Ship } from './types';
import { rand } from './util';

/** Abstand, in dem ein Wachschiff seine Station umkreist (km) */
export const GUARD_R = 14;
/** Patrouille: Standardradius und Grenzen (km) */
export const PATROL_R = 45;
export const PATROL_R_MIN = 15;
/** Patrouille: Halt an jedem Wegpunkt (s) */
const PATROL_PAUSE = 20;
/** Geleit: Abstand hinter dem Schützling (km) und Neuplanung, wenn er sich so weit bewegt hat */
const ESCORT_GAP = 5;
const ESCORT_REPLAN = 8;

type Result = { ok: boolean; msg: string };
const ok = (msg: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });

/** Zufälliger Punkt im Kreis um (x, z), innerhalb des Sektors */
function pointNear(state: GameState, x: number, z: number, r: number): { x: number; z: number } {
  for (let i = 0; i < 12; i++) {
    const a = rand(state) * Math.PI * 2, d = r * Math.sqrt(rand(state));
    const p = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
    if (insideHex(p.x, p.z, SECTOR_RADIUS * 0.92)) return p;
  }
  return { x, z };
}

function flyTo(s: Ship, sector: string, x: number, z: number): void {
  s.path = planPath({ sector: s.sector, x: s.x, z: s.z }, { sector, x, z });
  s.phase = 'toTarget';
}

/** Ein Kampfschiff einen Takt weiterführen */
export function stepFighter(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  const o = s.combat ?? (s.combat = s.home ? { kind: 'guard', station: s.home } : { kind: 'move', sector: s.sector, x: s.x, z: s.z });
  s.timer = Math.max(0, s.timer - dt);
  if (o.kind === 'escort') {
    const t = state.ships.find((x) => x.id === o.ship);
    if (!t) {
      // Schützling verkauft oder verloren: zurück zur Wache an der Heimat, sonst Position halten
      s.combat = s.home ? { kind: 'guard', station: s.home } : { kind: 'move', sector: s.sector, x: s.x, z: s.z };
      return;
    }
    // Ziel: knapp hinter dem Schützling (gegen seine Flugrichtung)
    const gx = t.x - Math.cos(t.heading) * ESCORT_GAP, gz = t.z - Math.sin(t.heading) * ESCORT_GAP;
    const last = s.path[s.path.length - 1];
    const stale = !last || last.sector !== t.sector || Math.hypot(last.x - gx, last.z - gz) > ESCORT_REPLAN;
    if (stale && (s.timer <= 0 || !s.path.length)) { flyTo(s, t.sector, gx, gz); s.timer = 2; }
    if (s.path.length) moveAlong(s, cls.speed * 1.15, dt);
    else s.heading = t.heading;
    s.status = `Geleit für ${t.name}`;
    return;
  }
  if (s.path.length) {
    moveAlong(s, cls.speed, dt);
    if (!s.path.length) { s.phase = 'idle'; s.timer = o.kind === 'patrol' ? PATROL_PAUSE : o.kind === 'guard' ? 8 : 0; }
    return;
  }
  if (o.kind === 'move') { s.status = `Hält Position in ${SECTOR_MAP[s.sector]?.name ?? s.sector}`; return; }
  if (s.timer > 0) return;
  if (o.kind === 'guard') {
    const st = stationById(state, o.station);
    if (!st) { s.combat = { kind: 'move', sector: s.sector, x: s.x, z: s.z }; return; }
    // langsam um die Station kreisen: nächster Punkt ein Stück weiter auf dem Kreis
    const a = Math.atan2(s.z - st.z, s.x - st.x) + 0.9;
    s.status = `Wache bei ${st.name}`;
    flyTo(s, st.sector, st.x + Math.cos(a) * GUARD_R, st.z + Math.sin(a) * GUARD_R);
    return;
  }
  const p = pointNear(state, o.x, o.z, o.r);
  s.status = `Patrouille in ${SECTOR_MAP[o.sector]?.name ?? o.sector}`;
  flyTo(s, o.sector, p.x, p.z);
}

/** Befehl für ein Kampfschiff setzen (geprüft) */
export function setCombatOrder(state: GameState, shipId: string, order: CombatOrder): Result {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s) return fail('Schiff nicht gefunden.');
  if (SHIP_MAP[s.cls].role !== 'fighter') return fail('Nur Kampfschiffe nehmen Kampfbefehle an.');
  if (order.kind === 'guard') {
    const st = stationById(state, order.station);
    if (!st) return fail('Station nicht gefunden.');
    s.combat = order;
    s.path = []; s.timer = 0;
    return ok(`${s.name} bewacht ${st.name}.`);
  }
  if (order.kind === 'escort') {
    const t = state.ships.find((x) => x.id === order.ship);
    if (!t || t.id === s.id) return fail('Schützling nicht gefunden.');
    if (SHIP_MAP[t.cls].role === 'fighter') return fail('Geleit gibt es für Frachter und Miner.');
    s.combat = order;
    s.path = []; s.timer = 0;
    return ok(`${s.name} begleitet ${t.name}.`);
  }
  if (!SECTOR_MAP[order.sector] || !state.sectors.includes(order.sector)) return fail('Dieser Sektor ist noch nicht erkundet.');
  if (!insideHex(order.x, order.z, SECTOR_RADIUS * 0.95)) return fail('Der Punkt liegt außerhalb des Sektors.');
  if (order.kind === 'patrol') {
    const r = Math.max(PATROL_R_MIN, Math.min(SECTOR_RADIUS, order.r));
    s.combat = { ...order, r };
    s.path = []; s.timer = 0;
    return ok(`${s.name} patrouilliert in ${SECTOR_MAP[order.sector].name}.`);
  }
  s.combat = order;
  s.timer = 0;
  flyTo(s, order.sector, order.x, order.z);
  s.status = `Fliegt nach ${SECTOR_MAP[order.sector].name}`;
  return ok(`${s.name} fliegt zum Zielpunkt.`);
}

/** Befehl in Worten (für Listen und Karten) */
export function combatOrderText(state: GameState, o: CombatOrder | undefined): string {
  if (!o) return 'Kein Befehl';
  if (o.kind === 'guard') return `Wache bei ${stationById(state, o.station)?.name ?? 'Station'}`;
  if (o.kind === 'escort') return `Geleit für ${state.ships.find((x) => x.id === o.ship)?.name ?? 'Schiff'}`;
  if (o.kind === 'patrol') return `Patrouille in ${SECTOR_MAP[o.sector]?.name ?? o.sector} (${Math.round(o.r)} km)`;
  return `Flug nach ${SECTOR_MAP[o.sector]?.name ?? o.sector}`;
}
