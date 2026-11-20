// Jägergruppen fliegen im Keil an und brechen auf, sobald sie nah dran sind oder getroffen werden
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

type E = { x: number; y: number; hp: number; max: number; kind: string; grp?: number; form?: number; ang: number };
type G = { enemies: E[]; px: number; py: number; spawnGroup(list: string[], from: number, swarm?: boolean): void; update(dt: number): void; damageEnemy(e: E, d: number, b?: number): void };

function game(): G {
  const g = new ShooterGame({ level: 1, seed: 9, mutator: null, mode: 'normal', loadout: { ...DEFAULT_LOADOUT, wing: {} } }, 'pirate') as unknown as G;
  (g as unknown as { resize(w: number, h: number): void }).resize(390, 780);
  return g;
}

describe('Formationsflug', () => {
  it('Jägergruppe: Führer vorn, die anderen versetzt dahinter im Keil', () => {
    const g = game();
    g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
    g.spawnGroup(['jaeger', 'jaeger', 'jaeger'], 0);
    const grp = g.enemies.filter((e) => e.kind === 'jaeger');
    expect(grp.map((e) => e.form)).toEqual([0, 1, 2]);
    // die Gruppe startet weit weg vom Ziel: die Formation hält, bis sie nah dran ist
    const lead = grp[0];
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const live = grp.filter((e) => g.enemies.includes(e));
    expect(live.every((e) => e.form != null)).toBe(true);
    {
      for (const e of live.slice(1)) {
        const dist = Math.hypot(e.x - lead.x, e.y - lead.y);
        // Platz im ersten Glied: 60 seitlich, 55 dahinter (≈ 81)
        expect(dist).toBeGreaterThan(55);
        expect(dist).toBeLessThan(115);
        // hinter dem Führer (gegen seine Flugrichtung)
        const back = -((e.x - lead.x) * Math.cos(lead.ang) + (e.y - lead.y) * Math.sin(lead.ang));
        expect(back).toBeGreaterThan(20);
      }
      // links und rechts
      const side = (e: E) => -(e.x - lead.x) * Math.sin(lead.ang) + (e.y - lead.y) * Math.cos(lead.ang);
      expect(Math.sign(side(live[1]))).not.toBe(Math.sign(side(live[2])));
    }
  });

  it('ein Treffer in der Gruppe bricht die Formation auf; Schwärme fliegen nicht im Keil', () => {
    const g = game();
    g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
    g.spawnGroup(['jaeger', 'jaeger', 'jaeger'], 0);
    const grp = g.enemies.filter((e) => e.kind === 'jaeger');
    g.update(1 / 60);
    grp[2].hp = grp[2].max * 0.9;
    g.update(1 / 60);
    expect(grp.every((e) => e.form == null)).toBe(true);
    g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
    g.spawnGroup(['jaeger', 'jaeger', 'jaeger', 'jaeger'], 0, true);
    expect(g.enemies.filter((e) => e.kind === 'jaeger').every((e) => e.form == null)).toBe(true);
  });
});
