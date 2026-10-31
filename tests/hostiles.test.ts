import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { SHIP_MAP } from '../src/data/ships';
import { buyShip } from '../src/engine/actions';
import { setCombatOrder } from '../src/engine/combat';
import { stepShip } from '../src/engine/fleet';
import { INCIDENT_CHAPTER, RAID_BOUNTY, incidentState, pauseIncidents, stepIncidents } from '../src/engine/incidents';
import { DETER, HOSTILE_CHECK, defenseNear, hostileState, hostilesIn, sectorSecurity, sendDefense, spawnHostile, stepHostiles } from '../src/engine/hostiles';
import { XENON_CYCLE, xenonClock } from '../src/engine/phenomena';
import type { GameState, Ship } from '../src/engine/types';

/** Spiel mit beladenem Frachter, der still steht (leichtes Ziel) */
function setup(): { s: GameState; trader: Ship } {
  const s = newGame(41, 'trading');
  s.story.index = INCIDENT_CHAPTER;
  pauseIncidents(s);
  const trader = s.ships.find((x) => SHIP_MAP[x.cls].role === 'trader')!;
  trader.cargo = { ware: 'energycells', amount: 1000 };
  trader.x = 20; trader.z = 10; trader.path = [];
  hostileState(s).next = Number.MAX_SAFE_INTEGER; // keine zufälligen Rotten
  return { s, trader };
}

/** Nur Rotten (und ggf. Kampfschiffe) bewegen – der Frachter bleibt, wo er ist */
function run(s: GameState, seconds: number, ships: Ship[] = []): void {
  for (let t = 0; t < seconds; t += 0.5) {
    s.time += 0.5;
    for (const f of ships) stepShip(s, f, 0.5);
    stepIncidents(s);
    stepHostiles(s, 0.5);
  }
}

describe('Gegner in der Welt', () => {
  it('Piratenrotte fliegt ein, sucht den beladenen Frachter und löst den Überfall aus', () => {
    const { s, trader } = setup();
    const h = spawnHostile(s, trader.sector, 'pirates', 0);
    expect(h.n).toBeGreaterThanOrEqual(2);
    expect(Math.hypot(h.x, h.z)).toBeGreaterThan(150); // vom Rand
    run(s, 2);
    expect(h.target).toBe(trader.id);
    expect(s.log.some((l) => /halten auf/.test(l.text))).toBe(true);
    run(s, 200);
    expect(h.phase).toBe('attack');
    const inc = incidentState(s).open.find((i) => i.target === trader.id)!;
    expect(inc.kind).toBe('raid');
    expect(inc.foe).toBe('pirates');
    // Frist abgelaufen ohne Eingreifen: Rotte zieht ab und verschwindet am Rand
    s.time = inc.expires + 1;
    run(s, 300);
    expect(hostilesIn(s, trader.sector).length).toBe(0);
  });

  it('genug eigene Kampfkraft in der Nähe: die Rotte dreht ab, ein laufender Überfall ist abgewehrt', () => {
    const { s, trader } = setup();
    s.credits = 1e8;
    const h = spawnHostile(s, trader.sector, 'pirates', 0);
    run(s, 200);
    expect(h.phase).toBe('attack');
    const c0 = s.credits;
    // Cobra (Kampfwert über 500) als Geleit dazu
    expect(buyShip(s, 'cobra', s.stations[0].id).ok).toBe(true);
    const cobra = s.ships[s.ships.length - 1];
    expect(SHIP_MAP.cobra.combat!.power).toBeGreaterThanOrEqual(DETER * h.power);
    setCombatOrder(s, cobra.id, { kind: 'escort', ship: trader.id });
    run(s, 300, [cobra]);
    expect(h.phase === 'leave' || !hostilesIn(s, trader.sector).includes(h)).toBe(true);
    expect(incidentState(s).open.length).toBe(0);
    expect(trader.cargo!.amount).toBe(1000);
    expect(s.credits - c0).toBeGreaterThanOrEqual(RAID_BOUNTY - SHIP_MAP.cobra.price);
    expect(s.log.some((l) => /dreht ab/.test(l.text))).toBe(true);
  });

  it('„Kampfschiffe schicken“ setzt die nächsten Kampfschiffe als Geleit, bis der Kampfwert reicht', () => {
    const { s, trader } = setup();
    s.credits = 1e8;
    for (let i = 0; i < 4; i++) buyShip(s, 'mamba', s.stations[0].id);
    const h = spawnHostile(s, trader.sector, 'pirates', 0);
    run(s, 2);
    const r = sendDefense(s, h.id);
    expect(r.ok).toBe(true);
    const escorts = s.ships.filter((x) => x.combat?.kind === 'escort');
    expect(escorts.length).toBeGreaterThan(0);
    expect(escorts.reduce((a, x) => a + SHIP_MAP[x.cls].combat!.power, 0)).toBeGreaterThanOrEqual(Math.min(DETER * h.power, 4 * SHIP_MAP.mamba.combat!.power));
  });

  it('Sicherheit: Grundwert der Fraktion, mehr mit Wachen, weniger mit viel Verkehr', () => {
    const { s } = setup();
    s.credits = 1e8;
    const base = sectorSecurity(s, 'zhin');
    expect(base.base).toBe(65);
    expect(sectorSecurity(s, 'zyarth').value).toBeGreaterThan(sectorSecurity(s, 'ravine').value);
    buyShip(s, 'cobra', s.stations[0].id);
    expect(sectorSecurity(s, 'zhin').value).toBeGreaterThan(base.value);
    const cobra = s.ships[s.ships.length - 1];
    expect(defenseNear(s, 'zhin', cobra.x + 5, cobra.z, 25)).toBe(SHIP_MAP.cobra.combat!.power);
  });

  it('zufällige Rotten nur in Sektoren mit eigenem Verkehr, höchstens alle zehn Minuten geprüft', () => {
    const { s } = setup();
    const hs = hostileState(s);
    hs.next = s.time;
    let spawned = 0;
    for (let i = 0; i < 400; i++) {
      s.time += HOSTILE_CHECK;
      hs.next = Math.min(hs.next, s.time);
      const before = hs.list.length;
      stepHostiles(s, 0.5);
      if (hs.list.length > before) spawned++;
      hs.list.length = 0;
    }
    // Zhin (Sicherheit um 60): etwa 3 % je Prüfung
    expect(spawned).toBeGreaterThan(2);
    expect(spawned).toBeLessThan(40);
  });

  it('Xenon-Streife kommt mit dem Ereignis in die Schlucht und geht wieder', () => {
    const { s } = setup();
    s.sectors.push('ravine');
    // Beginn der nächsten Streife
    let t = s.time;
    while (!xenonClock(t).active) t += 60;
    s.time = t;
    stepHostiles(s, 0.5);
    const x = hostilesIn(s, 'ravine');
    expect(x.length).toBe(1);
    expect(x[0].foe).toBe('xenon');
    expect(x[0].x).toBeGreaterThan(0); // Nordosten
    expect(x[0].z).toBeLessThan(0);
    s.time += XENON_CYCLE / 2;
    run(s, 300);
    expect(hostilesIn(s, 'ravine').length).toBe(0);
  });
});
