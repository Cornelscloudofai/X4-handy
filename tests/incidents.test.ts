import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { MODULE_MAP } from '../src/data/modules';
import { SHIP_MAP } from '../src/data/ships';
import { freeUnits, stepProduction } from '../src/engine/economy';
import {
  BOARD_REP_CAP, BOARD_REP_DAY, INCIDENT_CHAPTER, DEADLINE, FAULT_REPAIR, FIRST_INCIDENT, RAID_AUTO_LOSS, RAID_BOUNTY, VEIN_AUTO, VEIN_SHARE,
  boardFor, boardRepLeft, finishTask, incidentState, pauseIncidents, forceIncident, incidentGame,
  FREIGHT_BONUS, RUSH_BONUS, DOCK_AUTO_LOSS, resolveIncident, stepIncidents,
} from '../src/engine/incidents';
import type { GameState } from '../src/engine/types';
import { STORM_CYCLE, stormActive, tideFactor } from '../src/engine/phenomena';
import { WARES } from '../src/data/wares';

/** Spielstand mit beladenem Frachter unterwegs */
function withTrader(): GameState {
  const s = newGame(21, 'trading');
  s.story.index = INCIDENT_CHAPTER;
  incidentState(s);
  const sh = s.ships.find((x) => SHIP_MAP[x.cls].role === 'trader')!;
  sh.cargo = { ware: 'energycells', amount: 1000 };
  sh.path = [{ sector: sh.sector, x: sh.x + 50, z: sh.z }];
  // keine Störungen und Adern als Alternative: nur der Überfall ist möglich
  for (const st of s.stations) for (const m of st.modules) m.util = 0;
  return s;
}

describe('Vorfälle', () => {
  it('nicht während der Einführung', () => {
    const s = newGame(25, 'trading');
    incidentState(s);
    s.story.index = 1;
    s.time = FIRST_INCIDENT + 1;
    stepIncidents(s);
    expect(incidentState(s).open.length).toBe(0);
  });

  it('erst nach der Anlaufzeit, dann höchstens etwa einer je Stunde', () => {
    const s = withTrader();
    s.time = FIRST_INCIDENT - 60;
    stepIncidents(s);
    expect(incidentState(s).open.length).toBe(0);
    s.time = FIRST_INCIDENT + 1;
    stepIncidents(s);
    expect(incidentState(s).open.length).toBe(1);
    expect(incidentState(s).next - s.time).toBeGreaterThanOrEqual(50 * 60);
    expect(s.log.some((l) => l.link?.kind === 'incident')).toBe(true);
  });

  it('Überfall ohne Eingreifen: Teil der Ladung weg; selbst verteidigt mit drei Sternen: nichts weg, Kopfgeld', () => {
    const s = withTrader();
    s.time = FIRST_INCIDENT + 1;
    stepIncidents(s);
    const inc = incidentState(s).open[0];
    expect(inc.kind).toBe('raid');
    const sh = s.ships.find((x) => x.id === inc.target)!;
    s.time = inc.expires + 1;
    stepIncidents(s);
    expect(sh.cargo!.amount).toBeCloseTo(1000 * (1 - RAID_AUTO_LOSS), 3);

    const t = withTrader();
    t.time = FIRST_INCIDENT + 1;
    stepIncidents(t);
    const i2 = incidentState(t).open[0];
    const c0 = t.credits;
    expect(resolveIncident(t, i2.id, 3)).toContain('abgewehrt');
    expect(t.ships.find((x) => x.id === i2.target)!.cargo!.amount).toBe(1000);
    expect(t.credits).toBe(c0 + RAID_BOUNTY);
    expect(incidentState(t).open.length).toBe(0);
  });

  it('Störung: Modul halbiert; gelöst läuft es wieder voll, sonst Reparatur mit Hüllenteilen bei Fristende', () => {
    const s = newGame(22, 'mining');
    s.story.index = INCIDENT_CHAPTER;
    incidentState(s);
    for (const sh of s.ships) sh.cargo = null;
    const st = s.stations[0];
    st.modules.push({ ...st.modules[0], uid: 777, def: 'prod_refinedmetals', util: 1, running: false, stall: '', t: 0 });
    st.inventory.hullparts = 100;
    s.time = FIRST_INCIDENT + 1;
    stepIncidents(s);
    const inc = incidentState(s).open[0];
    expect(inc.kind).toBe('fault');
    const m = st.modules.find((x) => x.uid === inc.module)!;
    expect(m.fault).toBe(true);
    expect(MODULE_MAP[m.def].kind).toBe('production');
    // halbe Leistung: ein Zyklus braucht doppelt so lange
    m.running = true; m.t = 1000;
    stepProduction(s, st, 100);
    expect(m.t).toBeCloseTo(950, 3);
    pauseIncidents(s);
    s.time = inc.expires + 1;
    stepIncidents(s);
    expect(m.fault).toBe(false);
    expect(st.inventory.hullparts).toBe(100 - FAULT_REPAIR);
    expect(DEADLINE.fault).toBeGreaterThan(DEADLINE.raid);
  });

  it('Ader: Erz ins Heimatlager – ohne Eingreifen wenig, selbst abgebaut viel', () => {
    const s = newGame(23, 'mining');
    s.story.index = INCIDENT_CHAPTER;
    incidentState(s);
    const st = s.stations[0];
    for (const m of st.modules) m.util = 0;
    const sh = s.ships.find((x) => SHIP_MAP[x.cls].role === 'miner')!;
    sh.home = st.id; sh.miningField = 'zhin-ore'; sh.cargo = { ware: 'ore', amount: 10 };
    s.time = FIRST_INCIDENT + 1;
    stepIncidents(s);
    const inc = incidentState(s).open[0];
    expect(inc.kind).toBe('vein');
    const before = st.inventory.ore ?? 0;
    const free = freeUnits(st, 'ore');
    expect(free).toBeGreaterThan(0);
    resolveIncident(s, inc.id, 2);
    expect((st.inventory.ore ?? 0) - before).toBe(Math.min(Math.round(inc.amount * VEIN_SHARE[2]), Math.floor(free)));
    expect(VEIN_SHARE[2]).toBeGreaterThan(VEIN_AUTO * 3);
  });
});

describe('Vorfälle, Schritt 2', () => {
  it('Sonderfracht (Frachtraum): Aufschlag auf den Auftragslohn nach Sternen, ohne Eingreifen keiner', () => {
    const s = withTrader();
    const sh = s.ships.find((x) => x.cargo)!;
    s.contracts.push({ id: 991, sector: 'zhin', ware: 'energycells', amount: 2000, delivered: 0, reward: 40000, rep: 0.2, deadline: s.time + 7200, duration: 7200, status: 'active', title: 'Testauftrag' });
    expect(forceIncident(s, 'freight')).toBe(true);
    const inc = incidentState(s).open[0];
    expect(incidentGame(inc).game).toBe('cargo');
    expect(inc.target).toBe(sh.id);
    const c0 = s.credits;
    resolveIncident(s, inc.id, 3);
    expect(s.credits).toBe(c0 + 40000 * FREIGHT_BONUS[3]);
  });

  it('Eilzuschlag (Superhighway): Anteil am Ladungswert', () => {
    const s = withTrader();
    const sh = s.ships.find((x) => x.cargo)!;
    sh.path = [{ sector: 'zhin', x: 0, z: 0 }, { sector: 'tkr', x: 0, z: 0 }];
    expect(forceIncident(s, 'rush')).toBe(true);
    const inc = incidentState(s).open[0];
    expect(incidentGame(inc).game).toBe('highway');
    const c0 = s.credits;
    resolveIncident(s, inc.id, 2);
    expect(s.credits - c0).toBe(Math.round(1000 * WARES.energycells.price.avg * RUSH_BONUS[2]));
  });

  it('Andocken im Sturm (Orbit): nur im Sturm von Glutsee I; ohne Eingreifen beschädigte Ladung', () => {
    const s = withTrader();
    const sh = s.ships.find((x) => x.cargo)!;
    sh.sector = 'f-glut1';
    while (stormActive(s.time)) s.time += 600;
    expect(forceIncident(s, 'dock')).toBe(false);
    while (!stormActive(s.time)) s.time += 60;
    expect(forceIncident(s, 'dock')).toBe(true);
    const inc = incidentState(s).open[0];
    expect(incidentGame(inc).game).toBe('orbit');
    pauseIncidents(s);
    s.time = inc.expires + 1;
    stepIncidents(s);
    expect(sh.cargo!.amount).toBeCloseTo(1000 * (1 - DOCK_AUTO_LOSS), 3);
    expect(STORM_CYCLE).toBeGreaterThan(0);
  });

  it('Gasschwade (Gassammeln): nur bei Flut in der Cascade', () => {
    const s = newGame(26, 'mining');
    s.story.index = INCIDENT_CHAPTER;
    const st = s.stations[0];
    const sh = s.ships.find((x) => SHIP_MAP[x.cls].role === 'miner')!;
    sh.home = st.id; sh.miningField = 'cascade-helium'; sh.sector = 'cascade'; sh.cargo = { ware: 'helium', amount: 5 };
    while (tideFactor(s.time) >= 1.25) s.time += 300;
    expect(forceIncident(s, 'tide')).toBe(false);
    while (tideFactor(s.time) < 1.3) s.time += 300;
    expect(forceIncident(s, 'tide')).toBe(true);
    expect(incidentGame(incidentState(s).open[0]).game).toBe('gas');
  });
});

describe('Aufgaben an Stationen', () => {
  it('zwei Aufgaben je bekanntem Sektor, Lohn nach Sternen, Ruf mit Deckel', () => {
    const s = newGame(24, 'mining');
    const tasks = boardFor(s, 'zhin');
    expect(tasks.length).toBe(2);
    expect(boardFor(s, 'zyarth')).toEqual([]); // noch unbekannt
    expect(finishTask(s, 'zhin', tasks[0].id, 0)).toBeNull();
    const c0 = s.credits;
    const r0 = s.rep.frf;
    const res = finishTask(s, 'zhin', tasks[0].id, 3)!;
    expect(res.credits).toBe(tasks[0].credits);
    expect(s.credits).toBe(c0 + res.credits);
    expect(s.rep.frf - r0).toBeCloseTo(res.rep, 5);
    expect(res.rep).toBeLessThanOrEqual(BOARD_REP_DAY);
    expect(finishTask(s, 'zhin', tasks[0].id, 3)).toBeNull(); // nur einmal
    // Tagesgrenze und Obergrenze
    s.rep.frf = BOARD_REP_CAP;
    expect(boardRepLeft(s, 'frf')).toBe(0);
    s.rep.frf = 0;
    incidentState(s).repDay.frf = [Math.floor(s.time / 86400), BOARD_REP_DAY];
    expect(boardRepLeft(s, 'frf')).toBe(0);
    // nach 3 h neue Aufgaben
    s.time += 3 * 3600 + 1;
    expect(boardFor(s, 'zhin')[0].id).not.toBe(tasks[0].id);
  });
});
