import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { SHIP_MAP } from '../src/data/ships';
import { buyShip } from '../src/engine/actions';
import { setCombatOrder } from '../src/engine/combat';
import { stepShip } from '../src/engine/fleet';
import { INCIDENT_CHAPTER, pauseIncidents, stepIncidents } from '../src/engine/incidents';
import { hostileState, hostilesIn, spawnHostile, stepHostiles } from '../src/engine/hostiles';
import { KILL_BOUNTY, REPAIR_SHARE, RETREAT_AT, WRECK_SHARE, resolveBattle, salvageWreck, stepBattles, wrecksOf } from '../src/engine/battle';
import type { GameState, Ship } from '../src/engine/types';

function setup(): GameState {
  const s = newGame(51, 'trading');
  s.story.index = INCIDENT_CHAPTER;
  s.credits = 1e8;
  pauseIncidents(s);
  hostileState(s).next = Number.MAX_SAFE_INTEGER;
  // keine Ziele mit Ladung: Rotten streifen nur herum und laufen den Kampfschiffen in die Arme
  for (const sh of s.ships) sh.cargo = null;
  return s;
}

function fighter(s: GameState, cls: string): Ship {
  expect(buyShip(s, cls, s.stations[0].id).ok).toBe(true);
  const f = s.ships[s.ships.length - 1];
  // gleich an der Station
  const st = s.stations[0];
  f.x = st.x + 10; f.z = st.z; f.path = [];
  return f;
}

function run(s: GameState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.5) {
    s.time += 0.5;
    for (const sh of [...s.ships]) if (SHIP_MAP[sh.cls].combat && s.ships.includes(sh)) stepShip(s, sh, 0.5);
    stepIncidents(s);
    stepHostiles(s, 0.5);
    stepBattles(s, 0.5);
  }
}

/** Rotte direkt bei der Station (im Wachbereich) */
function foeAtStation(s: GameState, foe: 'pirates' | 'xenon', power: number, n = 3) {
  const st = s.stations[0];
  const h = spawnHostile(s, st.sector, foe, 0);
  h.x = st.x + 20; h.z = st.z + 5; h.n = n; h.power = power; h.hp = power; h.path = [];
  return h;
}

describe('Kampf auf der Karte', () => {
  it('Dragon gegen Xenon-Streife: Gefecht, die Rotte verliert, Kopfgeld und Wracks; die Dragon ist beschädigt', () => {
    const s = setup();
    const d = fighter(s, 'dragon');
    const h = foeAtStation(s, 'xenon', 250);
    const c0 = s.credits;
    run(s, 120);
    expect(hostilesIn(s, h.sector).filter((x) => x.phase !== 'leave').length).toBe(0);
    expect(s.ships.includes(d)).toBe(true);
    expect(d.hp ?? 1).toBeLessThan(1);
    const killed = s.log.some((l) => /vernichtet/.test(l.text));
    expect(killed || s.log.some((l) => /flieht/.test(l.text))).toBe(true);
    if (killed) {
      expect(s.credits - c0).toBeGreaterThanOrEqual(KILL_BOUNTY * 3);
      expect(wrecksOf(s).length).toBe(1);
    }
  });

  it('Mamba allein gegen eine starke Streife: zerstört, das Wrack enthält Schrott', () => {
    const s = setup();
    const m = fighter(s, 'mamba');
    foeAtStation(s, 'xenon', 400);
    run(s, 120);
    expect(s.ships.includes(m)).toBe(false);
    const w = wrecksOf(s).find((x) => x.name === m.name)!;
    expect(w).toBeDefined();
    expect(w.scrap).toBe(Math.round(SHIP_MAP.mamba.materials.hullparts * WRECK_SHARE));
    expect(s.log.some((l) => l.kind === 'bad' && l.text.includes(m.name))).toBe(true);
  });

  it('Piraten fliehen bei hohen Verlusten, statt bis zum Ende zu kämpfen', () => {
    const s = setup();
    fighter(s, 'dragon');
    // stärker als 386/1,5: sie drehen nicht schon vorher ab, sondern kämpfen
    const h = foeAtStation(s, 'pirates', 300);
    run(s, 60);
    expect(h.phase).toBe('leave');
    expect(s.log.some((l) => /flieht/.test(l.text))).toBe(true);
  });

  it('schwer beschädigt: zurück zur Heimat, dort Reparatur aus Hüllenteilen', () => {
    const s = setup();
    const st = s.stations[0];
    const f = fighter(s, 'asp');
    setCombatOrder(s, f.id, { kind: 'patrol', sector: st.sector, x: st.x + 60, z: st.z + 40, r: 20 });
    f.x = st.x + 60; f.z = st.z + 40;
    f.hp = RETREAT_AT - 0.05;
    st.inventory.hullparts = 500;
    run(s, 40);
    expect(f.repair).toBe(true);
    run(s, 400);
    expect(f.hp).toBeGreaterThanOrEqual(0.95);
    expect(f.repair).toBe(false);
    const used = 500 - st.inventory.hullparts;
    expect(used).toBeCloseTo(SHIP_MAP.asp.materials.hullparts * REPAIR_SHARE * (0.95 - (RETREAT_AT - 0.05)), -1);
  });

  it('selbst übernommen: ab einem Stern ist die Rotte vernichtet, Schaden je nach Ergebnis', () => {
    const s = setup();
    const d = fighter(s, 'dragon');
    const h = foeAtStation(s, 'xenon', 900);
    run(s, 3);
    expect(h.fighting).toBe(true);
    const hp0 = d.hp ?? 1;
    expect(resolveBattle(s, h.id, 0)).toMatch(/läuft weiter/);
    expect(resolveBattle(s, h.id, 2)).toMatch(/vernichtet/);
    expect(hostileState(s).list.includes(h)).toBe(false);
    expect(d.hp).toBeCloseTo(hp0 - 0.2, 5);
  });

  it('Wrack bergen: Schrott als Hüllenteile in die eigene Station', () => {
    const s = setup();
    const st = s.stations[0];
    wrecksOf(s).push({ id: 4242, sector: st.sector, x: 0, z: 0, name: 'Testwrack', scrap: 100, until: s.time + 999 });
    const before = st.inventory.hullparts ?? 0;
    expect(salvageWreck(s, 4242, 2)).toMatch(/80 Hüllenteile/);
    expect((st.inventory.hullparts ?? 0) - before).toBe(80);
    expect(wrecksOf(s).length).toBe(0);
  });
});
