import { describe, expect, it } from 'vitest';
import { computePlan, defaultPlan, moduleRate } from '../src/engine/planner';

describe('Stationsplaner', () => {
  it('berechnet die Hüllenteile-Kette mit X4-Werten', () => {
    const p = computePlan({ ...defaultPlan(), targets: [{ ware: 'hullparts', modules: 2 }] });
    expect(p.nodes.hullparts.modules).toBe(2);
    expect(p.nodes.hullparts.prod).toBeCloseTo(2352); // 294 je 900 s
    expect(p.nodes.refinedmetals.use).toBeCloseTo(2240); // 280 je 900 s × 2
    expect(p.nodes.refinedmetals.modules).toBe(2); // 2240 / 2112 → aufrunden
    expect(p.nodes.graphene.modules).toBe(1);
    expect(p.nodes.energycells.use).toBeCloseTo(640 + 4320 + 1200);
    expect(p.nodes.energycells.modules).toBe(1);
    expect(p.nodes.ore.kind).toBe('mined');
    expect(p.nodes.ore.use).toBeCloseTo(11520);
    expect(p.mining.ore).toBeCloseTo(115200);
    expect(p.nodes.ore.column).toBe(0);
    expect(p.nodes.hullparts.column).toBe(2);
  });

  it('berücksichtigt Sonnenlicht und Belegschaft', () => {
    expect(moduleRate('energycells', { sunlight: 140, workforce: false })).toBeCloseTo(14700);
    expect(moduleRate('refinedmetals', { sunlight: 100, workforce: true })).toBeCloseTo(2112 * 1.43);
  });

  it('kauft Waren zu statt sie zu produzieren', () => {
    const p = computePlan({ ...defaultPlan(), buy: ['energycells', 'graphene'] });
    expect(p.nodes.energycells.kind).toBe('bought');
    expect(p.nodes.graphene.kind).toBe('bought');
    expect(p.nodes.methane).toBeUndefined();
    expect(p.purchase).toBeGreaterThan(0);
  });

  it('nutzt vorgegebene Zwischenprodukt-Module mit', () => {
    const p = computePlan({ ...defaultPlan(), targets: [{ ware: 'hullparts', modules: 2 }, { ware: 'refinedmetals', modules: 3 }] });
    expect(p.nodes.refinedmetals.modules).toBe(3);
    expect(p.nodes.refinedmetals.net).toBeCloseTo(3 * 2112 - 2240);
  });
});
