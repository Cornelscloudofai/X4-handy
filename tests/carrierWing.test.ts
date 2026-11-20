// Raptor-Staffel: Hangar auffüllen, automatischer Nachkauf nach Verlusten, Mambas starten und landen lassen
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { buyShip } from '../src/engine/actions';
import { INCIDENT_CHAPTER, pauseIncidents } from '../src/engine/incidents';
import { hostileState } from '../src/engine/hostiles';
import { CARRIER_WING_MAX, WING_CLS, applyWingLosses, autoRestockWing, launchWingFighter, restockWing, setWingAuto, wingOf } from '../src/engine/battle';
import { setCombatOrder, stepFighter } from '../src/engine/combat';
import { SHIP_MAP } from '../src/data/ships';
import type { GameState, Ship } from '../src/engine/types';

function setup(): GameState {
  const s = newGame(51, 'trading');
  s.story.index = INCIDENT_CHAPTER;
  s.credits = 1e9;
  pauseIncidents(s);
  hostileState(s).next = Number.MAX_SAFE_INTEGER;
  return s;
}
function ship(s: GameState, cls: string, dx: number): Ship {
  expect(buyShip(s, cls, s.stations[0].id).ok).toBe(true);
  const f = s.ships[s.ships.length - 1];
  const st = s.stations[0];
  f.x = st.x + dx; f.z = st.z; f.path = [];
  return f;
}
const price = SHIP_MAP[WING_CLS].price;

describe('Raptor-Staffel', () => {
  it('Auffüllen kauft alle fehlenden Mambas – oder so viele, wie das Geld reicht', () => {
    const s = setup();
    const rp = ship(s, 'raptor', 10);
    rp.wing = 5;
    s.credits = price * 4 + 10;
    const r = restockWing(s, rp.id);
    expect(r.ok).toBe(true);
    expect(wingOf(rp)).toBe(9);
    expect(s.credits).toBe(10);
    s.credits = 1e9;
    restockWing(s, rp.id);
    expect(wingOf(rp)).toBe(CARRIER_WING_MAX);
    expect(restockWing(s, rp.id).ok).toBe(false);
  });

  it('Nachkauf automatisch: nach Verlusten außerhalb des Gefechts, mit Protokolleintrag', () => {
    const s = setup();
    const rp = ship(s, 'raptor', 10);
    rp.wing = CARRIER_WING_MAX;
    applyWingLosses(s, rp, { mamba: 3 }, 'pirates');
    expect(wingOf(rp)).toBe(CARRIER_WING_MAX - 3);
    // ausgeschaltet: nichts passiert
    stepFighter(s, rp, 0.1);
    expect(wingOf(rp)).toBe(CARRIER_WING_MAX - 3);
    setWingAuto(s, rp.id, true);
    // im Gefecht wird nicht nachgekauft
    rp.engage = 7;
    const c0 = s.credits;
    autoRestockWing(s, rp);
    expect(s.credits).toBe(c0);
    rp.engage = undefined;
    stepFighter(s, rp, 0.1);
    expect(wingOf(rp)).toBe(CARRIER_WING_MAX);
    expect(s.credits).toBe(c0 - price * 3);
    expect(s.log.some((l) => /3 Mambas nachgekauft/.test(l.text))).toBe(true);
    // gestartete Mambas sind kein Verlust: werden nicht nachgekauft
    expect(launchWingFighter(s, rp.id).ok).toBe(true);
    stepFighter(s, rp, 0.1);
    expect(wingOf(rp)).toBe(CARRIER_WING_MAX - 1);
  });

  it('Mamba starten und wieder landen lassen', () => {
    const s = setup();
    const rp = ship(s, 'raptor', 10);
    rp.wing = 2;
    const n = s.ships.length;
    expect(launchWingFighter(s, rp.id).ok).toBe(true);
    expect(wingOf(rp)).toBe(1);
    expect(s.ships.length).toBe(n + 1);
    const m = s.ships[s.ships.length - 1];
    expect(m.cls).toBe(WING_CLS);
    expect(m.sector).toBe(rp.sector);
    // eigene Mamba weiter weg: fliegt hin und landet
    m.x = rp.x + 30; m.z = rp.z + 10; m.path = [];
    expect(setCombatOrder(s, m.id, { kind: 'dock', carrier: rp.id }).ok).toBe(true);
    for (let i = 0; i < 2000 && s.ships.includes(m); i++) stepFighter(s, m, 0.5);
    expect(s.ships.includes(m)).toBe(false);
    expect(wingOf(rp)).toBe(2);
    // andere Schiffe landen nicht, voller Hangar nimmt keine mehr auf
    const dr = ship(s, 'dragon', 5);
    expect(setCombatOrder(s, dr.id, { kind: 'dock', carrier: rp.id }).ok).toBe(false);
    rp.wing = CARRIER_WING_MAX;
    const m2 = ship(s, WING_CLS, 5);
    expect(setCombatOrder(s, m2.id, { kind: 'dock', carrier: rp.id }).ok).toBe(false);
  });
});
