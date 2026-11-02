// Abschleppen: Große Schiffe (L) gehen nicht verloren. Ein L-Kampfschiff, das ein Gefecht verliert, und ein großer
// Frachter oder Miner, dessen Überfall niemand abwehrt, bleiben kampfunfähig liegen. Ein Bergungsschlepper (Manticore)
// fliegt von selbst hin, koppelt an und schleppt das Schiff zu seiner Heimatstation. Dort wird es aus Hüllenteilen
// repariert und nimmt danach seine Arbeit wieder auf.
import { SECTOR_MAP } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { moveAlong, planPath, stationById } from './logistics';
import type { GameState, Ship } from './types';
import { log, normalSpeed } from './util';

/** Ankoppeln am liegengebliebenen Schiff (s Spielzeit) */
export const TOW_HOOK = 3 * 60;
/** Mit Last fliegt der Schlepper langsamer */
export const TOW_SPEED = 0.5;
/** So nah muss der Schlepper heran, um anzukoppeln (km) */
const HOOK_R = 3;
/** Abstand des geschleppten Schiffs hinter dem Schlepper (km) */
const TRAIL = 2.2;

export const isTug = (s: Ship): boolean => SHIP_MAP[s.cls].role === 'tug';
/** Bleibt nach einer Niederlage liegen statt verloren zu gehen */
export const tows = (s: Ship): boolean => SHIP_MAP[s.cls].size === 'L';

/** Wer gerade dieses Schiff abholt oder schleppt */
export function tugFor(state: GameState, id: string): Ship | undefined {
  return state.ships.find((x) => x.tow?.ship === id);
}

/** Wohin geschleppt wird: Heimatstation des Schiffs, sonst die des Schleppers, sonst die erste eigene Station */
function destination(state: GameState, target: Ship, tug: Ship) {
  return stationById(state, target.home) ?? stationById(state, tug.home) ?? state.stations[0];
}

/**
 * Schiff bleibt kampfunfähig liegen (L nach verlorenem Gefecht oder unbeantwortetem Überfall). Laufende Flüge und
 * Abholungen enden; eine Ladung bleibt an Bord.
 */
export function disableShip(state: GameState, s: Ship, why: string): void {
  if (s.disabled) return;
  s.disabled = true;
  s.hp = Math.min(s.hp ?? 1, 0.05);
  s.path = [];
  s.engage = undefined;
  s.repair = false;
  // Abholung ohne Ladung: verfällt; mit Ladung geht es nach der Reparatur zum Ziel weiter
  if (s.job && !s.cargo) s.job = null;
  s.phase = 'idle';
  const tug = state.ships.some((x) => isTug(x));
  s.status = tug ? 'Kampfunfähig – wartet auf den Schlepper' : 'Kampfunfähig – kein Bergungsschlepper vorhanden';
  normalSpeed(state);
  log(state, `${s.name} (${SHIP_MAP[s.cls].name}) ${why} und treibt manövrierunfähig in ${SECTOR_MAP[s.sector]?.name ?? s.sector}. ${tug ? 'Ein Bergungsschlepper ist unterwegs.' : 'Ohne Bergungsschlepper (Manticore) kommt es nicht nach Hause.'}`, 'bad', true, { kind: 'ship', id: s.id });
}

/** Liegengebliebenes Schiff: wartet oder hängt am Schlepper (die Lage setzt der Schlepper) */
export function stepDisabled(state: GameState, s: Ship): void {
  s.path = [];
  const tug = tugFor(state, s.id);
  s.status = !tug ? (state.ships.some((x) => isTug(x)) ? 'Kampfunfähig – wartet auf den Schlepper' : 'Kampfunfähig – kein Bergungsschlepper vorhanden')
    : tug.tow!.stage === 'tow' ? `Wird von ${tug.name} nach ${destination(state, s, tug)?.name ?? 'Hause'} geschleppt`
    : tug.tow!.stage === 'hook' ? `${tug.name} koppelt an` : `${tug.name} ist unterwegs`;
}

function flyTo(s: Ship, sector: string, x: number, z: number): void {
  s.path = planPath({ sector: s.sector, x: s.x, z: s.z }, { sector, x, z });
  s.phase = 'toTarget';
}

/** Nächstes liegengebliebenes Schiff ohne Schlepper (kürzester Weg über Tore) */
function nextJob(state: GameState, tug: Ship): Ship | undefined {
  const free = state.ships.filter((x) => x.disabled && !tugFor(state, x.id));
  let best: Ship | undefined, bd = Infinity;
  for (const x of free) {
    const hops = planPath({ sector: tug.sector, x: tug.x, z: tug.z }, { sector: x.sector, x: x.x, z: x.z }).filter((p) => p.gateTo).length;
    const d = hops * 1000 + (x.sector === tug.sector ? Math.hypot(x.x - tug.x, x.z - tug.z) : 0);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

/** Bergungsschlepper einen Takt weiterführen */
export function stepTug(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  if (s.tow && !state.ships.some((x) => x.id === s.tow!.ship && x.disabled)) s.tow = undefined; // verkauft oder schon frei
  if (!s.tow) {
    const t = nextJob(state, s);
    if (t) {
      s.tow = { ship: t.id, stage: 'fly', t: 0 };
      log(state, `${s.name} fliegt los, um ${t.name} in ${SECTOR_MAP[t.sector]?.name ?? t.sector} abzuschleppen.`, 'info', false, { kind: 'ship', id: s.id });
    }
  }
  const job = s.tow;
  if (!job) {
    const home = stationById(state, s.home);
    if (home && (home.sector !== s.sector || Math.hypot(home.x - s.x, home.z - s.z) > 8)) {
      const last = s.path[s.path.length - 1];
      if (!last || last.sector !== home.sector) flyTo(s, home.sector, home.x + 5, home.z - 4);
      moveAlong(s, cls.speed, dt);
      s.status = `Bereit – fliegt zurück nach ${home.name}`;
    } else {
      s.path = [];
      s.status = home ? `Bereit an ${home.name} – kein Schiff zu bergen` : 'Bereit – kein Schiff zu bergen';
    }
    return;
  }
  const t = state.ships.find((x) => x.id === job.ship)!;
  if (job.stage === 'fly') {
    const near = t.sector === s.sector && Math.hypot(t.x - s.x, t.z - s.z) <= HOOK_R;
    if (near) { job.stage = 'hook'; job.t = 0; s.path = []; }
    else {
      const last = s.path[s.path.length - 1];
      if (!last || last.sector !== t.sector || Math.hypot(last.x - t.x, last.z - t.z) > 1) flyTo(s, t.sector, t.x, t.z);
      moveAlong(s, cls.speed, dt);
      s.status = `Fliegt zu ${t.name} (${SECTOR_MAP[t.sector]?.name ?? t.sector})`;
      return;
    }
  }
  if (job.stage === 'hook') {
    job.t += dt;
    s.status = `Koppelt an ${t.name} an · ${Math.min(100, Math.round((job.t / TOW_HOOK) * 100))} %`;
    if (job.t < TOW_HOOK) return;
    job.stage = 'tow';
    s.path = [];
    log(state, `${s.name} hat ${t.name} angekoppelt und schleppt es nach Hause.`, 'info', false, { kind: 'ship', id: t.id });
  }
  // Schleppen: zur Heimatstation des Schiffs, das Schiff hängt hinten dran
  const dest = destination(state, t, s);
  if (!dest) { s.status = 'Keine eigene Station zum Abliefern'; return; }
  const arrived = s.sector === dest.sector && Math.hypot(dest.x - s.x, dest.z - s.z) <= 8;
  if (!arrived) {
    const last = s.path[s.path.length - 1];
    if (!last || last.sector !== dest.sector) flyTo(s, dest.sector, dest.x + 6, dest.z + 3);
    moveAlong(s, cls.speed * TOW_SPEED, dt);
    s.status = `Schleppt ${t.name} nach ${dest.name}`;
  }
  // Last hinter dem Schlepper (gegen die Flugrichtung)
  t.sector = s.sector;
  t.x = s.x - Math.cos(s.heading) * TRAIL;
  t.z = s.z - Math.sin(s.heading) * TRAIL;
  t.heading = s.heading;
  if (!arrived && s.path.length) return;
  // abgeliefert: Schiff wieder frei, Reparatur an der Station (repairShip)
  t.disabled = false;
  t.home = t.home || dest.id;
  t.phase = 'idle';
  t.path = [];
  s.tow = undefined;
  s.path = [];
  log(state, `${t.name} ist in ${dest.name} angekommen. Die Reparatur aus Hüllenteilen beginnt.`, 'good', true, { kind: 'ship', id: t.id });
}
