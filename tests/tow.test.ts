import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { SHIP_MAP } from '../src/data/ships';
import { buyShip } from '../src/engine/actions';
import { stepShip } from '../src/engine/fleet';
import { INCIDENT_CHAPTER, pauseIncidents, resolveIncident, startRaid, stepIncidents } from '../src/engine/incidents';
import { hostileState, spawnHostile, stepHostiles } from '../src/engine/hostiles';
import { hullOf, stepBattles } from '../src/engine/battle';
import { TOW_HOOK, tugFor } from '../src/engine/tow';
import { yardSizes } from '../src/engine/yard';
import type { GameState, Ship } from '../src/engine/types';

function setup(): GameState {
  const s = newGame(61, 'trading');
  s.story.index = INCIDENT_CHAPTER;
  s.credits = 1e9;
  pauseIncidents(s);
  hostileState(s).next = Number.MAX_SAFE_INTEGER;
  return s;
}

/** Großfrachter (L) mit Ladung, weit draußen im Sektor */
function bigFreighter(s: GameState): Ship {
  const base = s.ships.find((x) => SHIP_MAP[x.cls].role === 'trader')!;
  const st = s.stations[0];
  const b: Ship = { ...base, id: 'big1', name: 'Buffalo ZHN-901', cls: 'buffalo', home: st.id, x: st.x + 80, z: st.z - 60, path: [], phase: 'idle', job: null, cargo: { ware: 'energycells', amount: 5000 }, orders: [] };
  s.ships.push(b);
  return b;
}

function run(s: GameState, seconds: number, dt = 1): void {
  for (let t = 0; t < seconds; t += dt) {
    s.time += dt;
    // nur Schlepper, Kampfschiffe und der Großfrachter – die übrigen Frachter bleiben, wo sie sind
    for (const sh of [...s.ships]) {
      if (s.ships.includes(sh) && (SHIP_MAP[sh.cls].role === 'tug' || SHIP_MAP[sh.cls].combat || sh.id === 'big1')) stepShip(s, sh, dt);
    }
    stepIncidents(s);
    stepHostiles(s, dt);
    stepBattles(s, dt);
  }
}

describe('Abschleppen', () => {
  it('Rattlesnake (L) und Manticore haben die X4-Werte', () => {
    const r = SHIP_MAP.rattlesnake, m = SHIP_MAP.manticore;
    expect(r.size).toBe('L');
    expect(r.role).toBe('fighter');
    expect(r.price).toBeGreaterThan(20e6);
    expect(r.materials.hullparts).toBeGreaterThanOrEqual(17375);
    expect(r.combat!.power).toBeGreaterThan(SHIP_MAP.cobra.combat!.power * 5);
    expect(m.role).toBe('tug');
    expect(m.size).toBe('M');
    expect(m.price).toBeGreaterThan(400_000);
    expect(m.parts.some((p) => /Traktor/.test(p.name))).toBe(true);
    // Träger Raptor (XL): 590 000 Hülle, 101 Türme, stärker als der Zerstörer, gebaut in der XL-Werft
    const x = SHIP_MAP.raptor;
    expect(x.size).toBe('XL');
    expect(x.combat!.hull).toBe(590000);
    expect(x.combat!.turrets).toBe(101);
    expect(x.combat!.power).toBeGreaterThan(r.combat!.power);
    expect(x.price).toBeGreaterThan(30e6);
    expect(x.materials.hullparts).toBeGreaterThanOrEqual(30775);
  });

  it('XL-Werft baut den Raptor, nach einer Niederlage bleibt er liegen und wird abgeschleppt', () => {
    const s = setup();
    const st = s.stations[0];
    expect(yardSizes({ ...st, modules: [...st.modules, { uid: 'yx', def: 'yard_xl' } as never] }).has('XL')).toBe(true);
    expect(buyShip(s, 'raptor', st.id).ok).toBe(true);
    const r = s.ships[s.ships.length - 1];
    r.x = st.x + 10; r.z = st.z; r.path = [];
    const h = spawnHostile(s, st.sector, 'xenon', 0);
    const p = SHIP_MAP.raptor.combat!.power * 4;
    h.x = st.x + 20; h.z = st.z + 5; h.n = 20; h.power = p; h.hp = p; h.path = []; h.phase = 'hunt';
    run(s, 600);
    expect(s.ships.includes(r)).toBe(true);
    expect(r.disabled).toBe(true);
  });

  it('unbeantworteter Überfall: der Großfrachter bleibt liegen, wird nicht noch einmal überfallen', () => {
    const s = setup();
    const b = bigFreighter(s);
    const inc = startRaid(s, b, 'pirates')!;
    s.time = inc.expires + 1;
    stepIncidents(s);
    expect(b.disabled).toBe(true);
    expect(b.status).toMatch(/kein Bergungsschlepper/);
    expect(s.log.some((l) => l.kind === 'bad' && l.text.includes(b.name) && /zusammengeschossen/.test(l.text))).toBe(true);
    // liegt still
    const x0 = b.x;
    run(s, 60);
    expect(b.x).toBe(x0);
    // keine neue Rotte nimmt ihn ins Visier
    const h = spawnHostile(s, b.sector, 'pirates', 0, 0);
    run(s, 5);
    expect(h.target).not.toBe(b.id);
  });

  it('kleiner Frachter verliert beim selben Überfall nur Ladung; im Minispiel abgewehrt bleibt auch der große heil', () => {
    const s = setup();
    const small = s.ships.find((x) => SHIP_MAP[x.cls].role === 'trader' && SHIP_MAP[x.cls].size !== 'L')!;
    small.cargo = { ware: 'energycells', amount: 100 };
    const inc = startRaid(s, small, 'pirates')!;
    s.time = inc.expires + 1;
    stepIncidents(s);
    expect(small.disabled).toBeFalsy();
    const b = bigFreighter(s);
    const inc2 = startRaid(s, b, 'pirates')!;
    resolveIncident(s, inc2.id, 2);
    expect(b.disabled).toBeFalsy();
    const inc3 = startRaid(s, b, 'pirates')!;
    expect(resolveIncident(s, inc3.id, 0)).toMatch(/Antrieb ist zerschossen/);
    expect(b.disabled).toBe(true);
  });

  it('Manticore holt den Frachter, koppelt an, schleppt ihn heim; dort Reparatur, danach arbeitet er weiter', () => {
    const s = setup();
    const st = s.stations[0];
    st.inventory.hullparts = 5000;
    const b = bigFreighter(s);
    const inc = startRaid(s, b, 'pirates')!;
    s.time = inc.expires + 1;
    stepIncidents(s);
    expect(b.disabled).toBe(true);
    expect(buyShip(s, 'manticore', st.id).ok).toBe(true);
    const tug = s.ships[s.ships.length - 1];
    run(s, 2);
    expect(tug.tow?.ship).toBe(b.id);
    expect(tugFor(s, b.id)).toBe(tug);
    // hinfliegen und ankoppeln
    let guard = 0;
    while (tug.tow?.stage !== 'tow' && guard++ < 3000) run(s, 1);
    expect(tug.tow?.stage).toBe('tow');
    expect(guard).toBeGreaterThan(TOW_HOOK - 5);
    // heimschleppen: der Frachter hängt hinter dem Schlepper
    run(s, 5);
    expect(b.status).toMatch(/geschleppt/);
    expect(Math.hypot(b.x - tug.x, b.z - tug.z)).toBeLessThan(3);
    guard = 0;
    while (b.disabled && guard++ < 5000) run(s, 1);
    expect(b.disabled).toBe(false);
    expect(Math.hypot(b.x - st.x, b.z - st.z)).toBeLessThan(15);
    expect(tug.tow).toBeUndefined();
    // Reparatur aus Hüllenteilen der Heimat (L: eine halbe Stunde von 0 auf 100 %)
    const parts0 = st.inventory.hullparts;
    run(s, 40 * 60, 2);
    expect(hullOf(b)).toBeGreaterThanOrEqual(0.95);
    expect(st.inventory.hullparts).toBeLessThan(parts0);
    expect(b.status).not.toMatch(/Kampfunfähig|Reparatur/);
  });

  it('Rattlesnake verliert gegen eine übermächtige Streife: kampfunfähig statt zerstört', () => {
    const s = setup();
    const st = s.stations[0];
    expect(buyShip(s, 'rattlesnake', st.id).ok).toBe(true);
    const r = s.ships[s.ships.length - 1];
    r.x = st.x + 10; r.z = st.z; r.path = [];
    const h = spawnHostile(s, st.sector, 'xenon', 0);
    const p = SHIP_MAP.rattlesnake.combat!.power * 4;
    h.x = st.x + 20; h.z = st.z + 5; h.n = 12; h.power = p; h.hp = p; h.path = []; h.phase = 'hunt';
    run(s, 400);
    expect(s.ships.includes(r)).toBe(true);
    expect(r.disabled).toBe(true);
    expect(s.log.some((l) => l.text.includes(r.name) && /Gefecht/.test(l.text) && /manövrierunfähig/.test(l.text))).toBe(true);
  });
});
