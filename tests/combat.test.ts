import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { SHIP_CLASSES, SHIP_MAP } from '../src/data/ships';
import { buyShip, setSectorOrder } from '../src/engine/actions';
import { GUARD_R, combatOrderText, setCombatOrder } from '../src/engine/combat';
import { stepShip } from '../src/engine/fleet';
import { yardStockWares } from '../src/engine/economy';
import { missingFor, queueShipBuild, stepYard } from '../src/engine/yard';
import type { GameState, Ship } from '../src/engine/types';

const FIGHTERS = SHIP_CLASSES.filter((c) => c.role === 'fighter');

function fly(s: GameState, sh: Ship, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.5) { s.time += 0.5; stepShip(s, sh, 0.5); }
}

function withFighter(cls = 'mamba'): { s: GameState; f: Ship } {
  const s = newGame(31, 'trading');
  s.credits = 1e8;
  const st = s.stations[0];
  expect(buyShip(s, cls, st.id).ok).toBe(true);
  return { s, f: s.ships[s.ships.length - 1] };
}

describe('Kampfschiffe: Daten aus X4', () => {
  it('sieben Split-Schiffe S und M mit Preis, Material und Kampfwert', () => {
    expect(FIGHTERS.map((c) => c.id).sort()).toEqual(['asp', 'balaur', 'chimera', 'cobra', 'dragon', 'jaguar', 'mamba']);
    for (const c of FIGHTERS) {
      expect(['S', 'M']).toContain(c.size);
      expect(c.combat!.power).toBeGreaterThan(0);
      expect(c.materials.hullparts).toBeGreaterThan(100);
      expect(c.materials.energycells).toBeGreaterThan(0);
      expect(c.capacity).toBe(0);
    }
    // Werte aus den X4-Daten: Hülle und Rumpfmaterial der Mamba, Fregatte teurer und stärker als Jäger
    const mamba = SHIP_MAP.mamba, cobra = SHIP_MAP.cobra;
    expect(mamba.combat!.hull).toBe(3600);
    expect(mamba.combat!.shield).toBe(2 * 740);
    expect(cobra.combat!.turrets).toBe(4);
    expect(mamba.price).toBeGreaterThan(200_000);
    expect(mamba.price).toBeLessThan(300_000);
    expect(cobra.price).toBeGreaterThan(2_000_000);
    expect(cobra.combat!.power).toBeGreaterThan(mamba.combat!.power * 4);
    expect(cobra.materials.turretcomponents).toBeGreaterThan(0);
  });
});

describe('Kampfschiffe: Befehle', () => {
  it('neues Kampfschiff bewacht seine Heimatstation und bleibt in ihrer Nähe', () => {
    const { s, f } = withFighter();
    const st = s.stations[0];
    expect(f.combat).toEqual({ kind: 'guard', station: st.id });
    fly(s, f, 600);
    expect(f.sector).toBe(st.sector);
    expect(Math.hypot(f.x - st.x, f.z - st.z)).toBeLessThan(GUARD_R + 4);
    expect(f.status).toMatch(/Wache/);
    expect(f.cargo).toBeNull();
  });

  it('Patrouille bleibt im Gebiet, Flieg-zu hält am Zielpunkt', () => {
    const { s, f } = withFighter('jaguar');
    expect(setCombatOrder(s, f.id, { kind: 'patrol', sector: f.sector, x: 60, z: -40, r: 30 }).ok).toBe(true);
    fly(s, f, 400);
    for (let i = 0; i < 20; i++) { fly(s, f, 30); expect(Math.hypot(f.x - 60, f.z + 40)).toBeLessThan(31); }
    expect(combatOrderText(s, f.combat)).toMatch(/Patrouille/);
    expect(setCombatOrder(s, f.id, { kind: 'move', sector: f.sector, x: -80, z: 50 }).ok).toBe(true);
    fly(s, f, 400);
    expect(Math.hypot(f.x + 80, f.z - 50)).toBeLessThan(0.5);
    expect(f.status).toMatch(/Hält Position/);
  });

  it('Geleit folgt dem Frachter', () => {
    const { s, f } = withFighter();
    const trader = s.ships.find((x) => SHIP_MAP[x.cls].role === 'trader')!;
    expect(setCombatOrder(s, f.id, { kind: 'escort', ship: trader.id }).ok).toBe(true);
    trader.path = [{ sector: trader.sector, x: trader.x + 80, z: trader.z + 30 }];
    for (let i = 0; i < 120; i++) {
      s.time += 0.5;
      trader.x += 0.3; // Schützling bewegt sich
      stepShip(s, f, 0.5);
    }
    expect(Math.hypot(f.x - trader.x, f.z - trader.z)).toBeLessThan(12);
    expect(f.status).toContain(trader.name);
  });

  it('ungültige Befehle werden abgelehnt', () => {
    const { s, f } = withFighter();
    expect(setCombatOrder(s, f.id, { kind: 'move', sector: 'zyarth', x: 0, z: 0 }).ok).toBe(false); // nicht erkundet
    expect(setCombatOrder(s, f.id, { kind: 'move', sector: f.sector, x: 900, z: 0 }).ok).toBe(false); // außerhalb
    expect(setCombatOrder(s, f.id, { kind: 'escort', ship: f.id }).ok).toBe(false);
    const trader = s.ships.find((x) => SHIP_MAP[x.cls].role === 'trader')!;
    expect(setCombatOrder(s, trader.id, { kind: 'guard', station: s.stations[0].id }).ok).toBe(false);
    f.home = '';
    expect(setSectorOrder(s, f.id, { sector: 'zhin', ware: 'energycells' }).ok).toBe(false);
  });
});

describe('Kampfschiffe: Werft', () => {
  it('baut eine Mamba aus eigenem Material', () => {
    const s = newGame(62);
    const st = s.stations[0];
    st.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
    expect(queueShipBuild(s, st.id, 'mamba').ok).toBe(true);
    // alles Material der Kampfschiffe lagert die Werft ohnehin (Frachter und Miner brauchen dieselben Waren)
    for (const id of Object.keys(SHIP_MAP.mamba.materials)) expect(yardStockWares(st)).toContain(id);
    for (const [id, n] of Object.entries(missingFor(st, 'mamba'))) st.inventory[id] = (st.inventory[id] ?? 0) + n;
    const n0 = s.ships.length;
    for (let t = 0; t < 7 * 60; t += 1) stepYard(s, st, 1);
    expect(s.ships.length).toBe(n0 + 1);
    const f = s.ships[s.ships.length - 1];
    expect(f.cls).toBe('mamba');
    expect(f.combat?.kind).toBe('guard');
  });
});
