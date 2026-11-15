// Eigenes Großkampfschiff im Gefecht: Raptor bzw. Klapperschlange aus dem Sektor fliegen im Minispiel selbst mit
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { buyShip } from '../src/engine/actions';
import { INCIDENT_CHAPTER, pauseIncidents } from '../src/engine/incidents';
import { hostileState, spawnHostile } from '../src/engine/hostiles';
import { FIGHT_R, FLAGSHIP_GAME, flagshipIn } from '../src/engine/battle';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, loadoutFor } from '../src/minigames/loadout';
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

describe('Großkampfschiff im Gefecht', () => {
  it('Raptor und Klapperschlange im Gefecht werden als eigenes Schiff gewählt (Träger zuerst), sonst keins', () => {
    const s = setup();
    const st = s.stations[0];
    const h = spawnHostile(s, st.sector, 'pirates', 0);
    h.x = st.x + 20; h.z = st.z;
    ship(s, 'dragon', 20);
    expect(flagshipIn(s, h)).toBeUndefined();
    const rs = ship(s, 'rattlesnake', 20 + FIGHT_R * 0.5);
    expect(flagshipIn(s, h)).toBe(rs);
    const rp = ship(s, 'raptor', 20 - FIGHT_R * 0.5);
    expect(flagshipIn(s, h)).toBe(rp);
    // zu weit weg: nicht im Gefecht
    rp.x = st.x + 20 + FIGHT_R * 3; rs.x = rp.x;
    expect(flagshipIn(s, h)).toBeUndefined();
    expect(FLAGSHIP_GAME.rattlesnake).toBe('klapperschlange');
  });

  it('Minispiel: dieses Schiff mit seiner Hülle; am Ende kommt die Resthülle zurück', () => {
    expect(loadoutFor('raptor').ship).toBe('raptor');
    expect(loadoutFor('klapperschlange').ship).toBe('klapperschlange');
    const g = new ShooterGame({ level: 1, seed: 3, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, ship: 'klapperschlange', wing: {} }, startHull: 0.4 }, 'pirate');
    g.resize(390, 780);
    expect(g.state.hull).toBeCloseTo(40);
    expect(g.abort().hullLeft).toBeCloseTo(0.4, 2);
  });
});

describe('Träger und Zerstörer im Sektor', () => {
  it('Raptor: Mambas für den Hangar kaufen, sie kämpfen mit und fangen Feuer ab – Verluste kosten Mambas', async () => {
    const { buyWingFighter, wingOf, powerOf, stepBattles, CARRIER_WING_MAX } = await import('../src/engine/battle');
    const s = setup();
    const rp = ship(s, 'raptor', 20);
    const p0 = powerOf(rp);
    for (let i = 0; i < 6; i++) expect(buyWingFighter(s, rp.id).ok).toBe(true);
    expect(wingOf(rp)).toBe(6);
    expect(powerOf(rp)).toBeGreaterThan(p0);
    rp.wing = CARRIER_WING_MAX;
    expect(buyWingFighter(s, rp.id).ok).toBe(false);
    rp.wing = 6;
    // starke Xenon-Rotte direkt am Raptor: die Staffel verliert Schiffe, der Raptor nimmt weniger Schaden
    const st = s.stations[0];
    const h = spawnHostile(s, st.sector, 'xenon', 0);
    h.x = rp.x; h.z = rp.z; h.n = 8; h.power = 8000; h.hp = 8000; h.path = [];
    for (let t = 0; t < 60; t += 0.5) { s.time += 0.5; stepBattles(s, 0.5); }
    expect(wingOf(rp)).toBeLessThan(6);
    expect(s.log.some((l) => /Mamba im Gefecht/.test(l.text))).toBe(true);
  });

  it('Klapperschlange: Fernfeuer aus 15 km trifft die Rotte, ohne dass sie zurückschießt', async () => {
    const { stepBattles, artilleryAt, hostileHp, ARTY_R } = await import('../src/engine/battle');
    const s = setup();
    const st = s.stations[0];
    const rs = ship(s, 'rattlesnake', 0);
    const h = spawnHostile(s, st.sector, 'pirates', 0);
    h.x = rs.x + 15; h.z = rs.z; h.n = 3; h.power = 400; h.hp = 400; h.path = [];
    expect(15).toBeLessThan(ARTY_R);
    expect(artilleryAt(s, h)).toEqual([rs]);
    for (let t = 0; t < 10; t += 0.5) { s.time += 0.5; stepBattles(s, 0.5); }
    expect(hostileHp(h)).toBeLessThan(400);
    expect(rs.hp ?? 1).toBe(1);
    // ganz weit weg: kein Fernfeuer
    h.x = rs.x + ARTY_R + 5;
    expect(artilleryAt(s, h)).toEqual([]);
  });
});
