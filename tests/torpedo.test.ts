// Dragon-Torpedo: Lenkflugkörper mit Zielerfassung per Halten der Spezialtaste
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type E = { kind: string; x: number; y: number; vx: number; vy: number; r: number; hp: number; max: number; sh: number };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; pointerDown(id: number, x: number, y: number): void; pointerMove(id: number, x: number, y: number): void; pointerUp(id: number): void;
  enemies: E[]; missiles: { target: E | null; def: { name: string } }[]; px: number; py: number; aimA: number; zoom: number; camX: number; camY: number;
  dashCd: number; makeEnemy(k: string, x: number, y: number): E; btnDash: [number, number, number];
  torpAim: { on: boolean; pick: E | null } | null;
};
const DT = 1 / 60;
const game = (): G => {
  const g = new ShooterGame({ level: 1, seed: 7, mutator: null, mode: 'normal', fog: false, loadout: { ...DEFAULT_LOADOUT, ship: 'dragon', wing: {} } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 30; i++) g.update(DT);
  g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
  return g;
};

describe('Dragon-Torpedo', () => {
  it('lenkt in ein seitlich stehendes Ziel und trifft mit hohem Schaden', () => {
    const g = game();
    g.aimA = -Math.PI / 2;
    const e = g.makeEnemy('kanone', g.px + 500, g.py - 200);
    e.vx = e.vy = 0;
    g.enemies.push(e);
    const hp0 = e.hp + e.sh;
    (g as unknown as { fireTorpedo(t: E | null): void }).fireTorpedo(e);
    expect(g.missiles.some((m) => m.def.name === 'Torpedo' && m.target === e)).toBe(true);
    for (let i = 0; i < 60 * 5 && g.missiles.length; i++) { e.x = g.px + 500; e.y = g.py - 200; e.vx = e.vy = 0; g.update(DT); }
    expect(g.enemies.includes(e) ? hp0 - (e.hp + e.sh) : hp0).toBeGreaterThan(hp0 * 0.5);
  });

  it('Taste halten: Zielkreis wird gesteuert, Loslassen erfasst das Ziel darunter', () => {
    const g = game();
    g.aimA = -Math.PI / 2;
    const e = g.makeEnemy('jaeger', g.px - 350, g.py - 150);
    e.vx = e.vy = 0;
    g.enemies.push(e);
    const [bx, by] = g.btnDash;
    g.pointerDown(5, bx, by);
    // der Kreis beginnt voraus: nach links unten ziehen und halten, bis er über dem Ziel liegt
    g.pointerMove(5, bx - 30, by + 32);
    for (let i = 0; i < 60 * 3 && g.torpAim?.pick !== e; i++) { e.x = g.px - 350; e.y = g.py - 150; e.vx = e.vy = 0; g.update(DT); }
    expect(g.torpAim?.on).toBe(true);
    expect(g.torpAim?.pick).toBe(e);
    g.pointerUp(5);
    expect(g.torpAim).toBeNull();
    expect(g.missiles.some((m) => m.def.name === 'Torpedo' && m.target === e)).toBe(true);
    expect(g.dashCd).toBeGreaterThan(0);
  });

  it('kurz tippen feuert sofort (aufs erfasste Ziel oder geradeaus)', () => {
    const g = game();
    const [bx, by] = g.btnDash;
    g.pointerDown(6, bx, by);
    g.pointerUp(6);
    expect(g.missiles.some((m) => m.def.name === 'Torpedo')).toBe(true);
  });
});
