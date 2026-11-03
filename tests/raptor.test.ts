import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, LTURRETS, SHIPS, TURRETS, turretOf } from '../src/minigames/loadout';

describe('Träger Raptor im Kampf-Minispiel', () => {
  const d = SHIPS.raptor;
  it('Türme nach den Sockeln im Bild: 114 M in acht Gruppen, 8 L in drei Gruppen, Cluster spiegelgleich', () => {
    expect(d.cls).toBe('XL');
    expect(d.turrets.length).toBe(122);
    expect(d.groups!.length).toBe(11);
    expect(d.groups!.filter((g) => g.kind === 'L').map((g) => g.name)).toEqual(['L-Türme vorn', 'L-Turm hinten links', 'L-Turm hinten rechts']);
    const count = (g: number) => d.turretGroup!.filter((x) => x === g).length;
    expect(d.groups!.reduce((n, g, i) => n + (g.kind === 'M' ? count(i) : 0), 0)).toBe(114);
    expect(count(8)).toBe(6);
    expect(count(9)).toBe(1);
    expect(count(10)).toBe(1);
    // jeder M-Cluster außer dem Bug-Cluster: zu jedem Turm links einer rechts an gespiegelter Stelle
    for (let g = 1; g <= 7; g++) {
      const pts = d.turrets.filter((_, i) => d.turretGroup![i] === g);
      for (const [x, y] of pts) expect(pts.some(([x2, y2]) => Math.abs(x2 + x) < 1.5 && Math.abs(y2 - y) < 0.2)).toBe(true);
    }
    // Bug vorn (oben, negatives y), die beiden hinteren L-Türme hinter der Mitte
    const lRear = d.turrets.filter((_, i) => d.turretGroup![i] >= 9);
    expect(lRear.every(([, y]) => y > 0)).toBe(true);
    expect(d.turrets.filter((_, i) => d.turretGroup![i] === 0).every(([, y]) => y < -400)).toBe(true);
  });

  it('Turmart je Gruppe: M-Gruppen M-Türme, L-Gruppen schwere Türme; ungültige Werte fallen auf Standard zurück', () => {
    const lo = { ...DEFAULT_LOADOUT, ship: 'raptor' as const, groups: ['boson', 'tau', 'x', 'puls', 'puls', 'puls', 'puls', 'puls', 'neutron', 'boson', 'falsch'] };
    const first = d.turretGroup!.indexOf(0), lf = d.turretGroup!.indexOf(8), lr = d.turretGroup!.indexOf(10);
    expect(turretOf(lo, d, first)).toMatchObject({ id: 'boson', L: false, def: TURRETS.boson });
    expect(turretOf(lo, d, lf)).toMatchObject({ id: 'neutron', L: true, def: LTURRETS.neutron });
    expect(turretOf(lo, d, lr).def).toBe(LTURRETS.plasma);
    expect(turretOf(lo, d, d.turretGroup!.indexOf(2)).def).toBe(TURRETS.puls);
    // andere Schiffe: wie bisher eine Art für alle Türme
    expect(turretOf({ ...DEFAULT_LOADOUT, ship: 'cobra', turret: 'plasma' }, SHIPS.cobra, 0)).toMatchObject({ id: 'plasma', L: false });
  });
});
