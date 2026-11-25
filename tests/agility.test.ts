// Trägheit beim Steuern: Drehung und Schub fahren hoch statt zu springen – je größer das Schiff, desto träger
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, SHIPS, type ShipId } from '../src/minigames/loadout';

const DT = 1 / 60;
type G = { update(dt: number): void; resize(w: number, h: number): void; aimA: number; yawV: number; turnRate: number; steerTo(a: number, k?: number): void; enemies: unknown[]; clusters: Map<unknown, unknown> };
const game = (ship: ShipId): G => {
  const g = new ShooterGame({ level: 1, seed: 3, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {}, ship } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  g.update(DT);
  g.enemies.length = 0; g.clusters.clear();
  return g;
};
/** t Sekunden lang auf eine Richtung weit rechts vom Bug lenken; liefert die Drehgeschwindigkeit als Anteil der Drehrate */
const spin = (g: G, t: number, side = 1): number => {
  for (let i = 0; i < Math.round(t / DT); i++) { g.steerTo(g.aimA + side * 2.5); g.update(DT); }
  return g.yawV / g.turnRate;
};

describe('Trägheit beim Steuern', () => {
  it('je größer, desto träger: Mamba nach 0,15 s fast voll, Klapperschlange und Raptor erst ein Bruchteil', () => {
    expect(spin(game('mamba'), 0.15)).toBeGreaterThan(0.9);
    expect(spin(game('dragon'), 0.15)).toBeLessThan(0.6);
    expect(spin(game('klapperschlange'), 0.15)).toBeLessThan(0.25);
    expect(spin(game('raptor'), 0.15)).toBeLessThan(0.15);
    // und alle erreichen ihre volle Drehrate
    expect(spin(game('klapperschlange'), 1.2)).toBeGreaterThan(0.95);
  });

  it('gleiche Klasse, kleine Unterschiede: die Drache spricht schneller an als die Cobra', () => {
    expect(SHIPS.dragon.agility!.yaw).toBeLessThan(SHIPS.cobra.agility!.yaw);
    expect(spin(game('dragon'), 0.2)).toBeGreaterThan(spin(game('cobra'), 0.2));
  });

  it('Richtungswechsel braucht Zeit: erst abbremsen, dann zurück – kein Springen', () => {
    const g = game('klapperschlange');
    spin(g, 1.5);
    const v0 = g.yawV;
    expect(v0).toBeGreaterThan(0);
    spin(g, 0.2, -1);
    // nach 0,2 s dreht sie noch in die alte Richtung
    expect(g.yawV).toBeGreaterThan(0);
    expect(g.yawV).toBeLessThan(v0);
  });

  it('kommt am Ziel zur Ruhe, ohne zu überschwingen', () => {
    const g = game('cobra');
    const target = g.aimA + 1.2;
    let over = 0;
    for (let i = 0; i < 180; i++) { g.steerTo(target); g.update(DT); over = Math.max(over, g.aimA - target); }
    expect(Math.abs(g.aimA - target)).toBeLessThan(0.01);
    expect(over).toBeLessThan(0.02);
  });
});
