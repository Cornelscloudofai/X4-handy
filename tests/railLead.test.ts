// Lanzen und Strahlen treffen sofort: kein Vorhalt (sonst schießen sie neben ein bewegtes Ziel), Geschosse mit Vorhalt
import { describe, expect, it } from 'vitest';
import { ShooterGame, leadTime } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type Lock = { x: number; y: number; e: { x: number; y: number } } | null;
type G = { px: number; py: number; aimA: number; enemies: { x: number; y: number; vx: number; vy: number; kind: string }[]; makeEnemy(k: string, x: number, y: number): { x: number; y: number; vx: number; vy: number; kind: string }; update(dt: number): void; lock: Lock };

function lockFor(weapon: string): { dx: number; dy: number } {
  const g = new ShooterGame({ level: 1, seed: 5, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, ship: 'mamba', weapon: weapon as typeof DEFAULT_LOADOUT.weapon, wing: {} } }, 'pirate') as unknown as G;
  (g as unknown as { resize(w: number, h: number): void }).resize(390, 780);
  g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
  // Gegner 400 vor dem Schiff, quer zur Flugrichtung unterwegs
  const e = g.makeEnemy('jaeger', g.px, g.py - 400);
  g.enemies.push(e);
  g.aimA = -Math.PI / 2;
  e.vx = 220; e.vy = 0;
  g.update(1 / 60);
  e.vx = 220; e.vy = 0;
  g.update(1 / 60);
  expect(g.lock?.e).toBe(e);
  return { dx: g.lock!.x - e.x, dy: g.lock!.y - e.y };
}

describe('Vorhalt', () => {
  it('Lanze und Strahl: Vorhaltezeit 0, Geschosse: Entfernung durch Geschwindigkeit', () => {
    expect(leadTime({ rail: true, speed: 14000 }, 800)).toBe(0);
    expect(leadTime({ beam: true, speed: 1 }, 800)).toBe(0);
    expect(leadTime({ speed: 400 }, 800)).toBeCloseTo(2);
  });

  it('Bosonenlanze: Vorhaltepunkt liegt auf dem Ziel, Pulslaser hält vor', () => {
    const rail = lockFor('boson');
    // Rest: das Ziel bewegt sich nach der Berechnung noch ein Bild weiter (220/60 ≈ 3,7)
    expect(Math.abs(rail.dx)).toBeLessThan(5);
    const puls = lockFor('puls');
    expect(puls.dx).toBeGreaterThan(20);
  });
});
