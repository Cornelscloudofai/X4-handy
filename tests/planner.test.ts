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

describe('Stationsplanung', () => {
  it('zeigt Unterversorgung und empfiehlt zusätzliche Module', () => {
    const p = computePlan({ ...defaultPlan(), auto: false, targets: [{ ware: 'hullparts', modules: 1 }, { ware: 'energycells', modules: 1 }] });
    const rm = p.nodes.refinedmetals;
    expect(rm.modules).toBe(0);
    expect(rm.use).toBeCloseTo(1120);
    expect(rm.recommend).toBe(1);
    expect(p.nodes.hullparts.eff).toBe(0);
    expect(p.nodes.hullparts.limiting).toBe('graphene'); // erstes fehlendes Vorprodukt mit 0 Versorgung
    const p2 = computePlan({ ...defaultPlan(), auto: false, targets: [{ ware: 'hullparts', modules: 2 }, { ware: 'refinedmetals', modules: 1 }, { ware: 'graphene', modules: 1 }, { ware: 'energycells', modules: 1 }] });
    expect(p2.nodes.refinedmetals.recommend).toBe(1); // 2240 Bedarf, 2112 je Modul
    expect(p2.nodes.hullparts.eff).toBeCloseTo(2112 / 2240);
    expect(p2.nodes.hullparts.endProduct).toBe(true);
  });

  it('liest gebaute, laufende und geplante Module einer Station', async () => {
    const { newGame } = await import('../src/engine/state');
    const { queueModule } = await import('../src/engine/actions');
    const { stationModuleCounts, stationPlan } = await import('../src/engine/planner');
    const s = newGame(31);
    const st = s.stations[0];
    queueModule(s, st.id, 'prod_refinedmetals');
    queueModule(s, st.id, 'prod_refinedmetals');
    const c = stationModuleCounts(st);
    expect(c.energycells.built).toBe(1);
    expect(c.refinedmetals.planned).toBe(2);
    const plan = stationPlan(st, 100);
    expect(plan.auto).toBe(false);
    expect(computePlan(plan).nodes.energycells.net).toBeCloseTo(10500 - 2 * 2160);
  });
});
