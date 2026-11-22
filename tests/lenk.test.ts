// Steuerung „Lenkrad“: Lenkachse waagerecht oder senkrecht, Feuerlinie quer dazu auf der gewählten Seite
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type G = { update(dt: number): void; resize(w: number, h: number): void; pointerDown(id: number, x: number, y: number): void; pointerMove(id: number, x: number, y: number): void; pointerUp(id: number): void; aimA: number; fireId: number | null; enemies: { kind: string }[] };
const DT = 1 / 60, R = 96;
const game = (axis: 'h' | 'v', flip: boolean): G => {
  const g = new ShooterGame({ level: 1, seed: 2, mutator: null, mode: 'normal', fog: false, controls: 'lenk', lenk: { axis, flip }, loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 20; i++) g.update(DT);
  g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
  return g;
};
/** Daumen rechts aufsetzen und um (dx, dy) Bildpunkte schieben, kurz halten; liefert Drehung und ob gefeuert wird */
const push = (g: G, dx: number, dy: number) => {
  const x0 = 265, y0 = 560;
  g.pointerDown(7, x0, y0);
  g.pointerMove(7, x0 + dx, y0 + dy);
  const a0 = g.aimA;
  for (let i = 0; i < 12; i++) g.update(DT);
  const turn = g.aimA - a0, fire = g.fireId !== null;
  g.pointerUp(7);
  return { turn, fire };
};

describe('Lenkachse', () => {
  it('waagerecht: rechts dreht rechts, links dreht links, Mitte (Ruhezone) gar nicht', () => {
    const g = game('h', false);
    expect(push(g, R * 0.8, 0).turn).toBeGreaterThan(0.05);
    expect(push(g, -R * 0.8, 0).turn).toBeLessThan(-0.05);
    expect(Math.abs(push(g, R * 0.05, 0).turn)).toBeLessThan(1e-6);
  });

  it('waagerecht: über die Feuerlinie oberhalb feuert, unterhalb nicht – mit „unter der Achse“ umgekehrt', () => {
    const up = game('h', false);
    expect(push(up, 0, -R * 0.6).fire).toBe(true);
    expect(push(up, 0, R * 0.6).fire).toBe(false);
    expect(push(up, 0, -R * 0.2).fire).toBe(false);
    const down = game('h', true);
    expect(push(down, 0, R * 0.6).fire).toBe(true);
    expect(push(down, 0, -R * 0.6).fire).toBe(false);
  });

  it('lenken und feuern gleichzeitig mit einem Daumen (schräg nach oben rechts)', () => {
    const g = game('h', false);
    const r = push(g, R * 0.6, -R * 0.6);
    expect(r.fire).toBe(true);
    expect(r.turn).toBeGreaterThan(0.03);
  });

  it('senkrecht: oben dreht links, unten rechts; Feuerlinie rechts bzw. links', () => {
    const g = game('v', false);
    expect(push(g, 0, -R * 0.8).turn).toBeLessThan(-0.05);
    expect(push(g, 0, R * 0.8).turn).toBeGreaterThan(0.05);
    expect(push(g, R * 0.6, 0).fire).toBe(true);
    expect(push(g, -R * 0.6, 0).fire).toBe(false);
    const left = game('v', true);
    expect(push(left, -R * 0.6, 0).fire).toBe(true);
    expect(push(left, R * 0.6, 0).fire).toBe(false);
  });
});
