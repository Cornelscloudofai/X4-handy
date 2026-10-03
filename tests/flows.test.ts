import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { flowRate, recordFlow, sectorFlows, stationEnd } from '../src/engine/flows';
import { gate } from '../src/data/sectors';

describe('Warenfluss', () => {
  it('misst Lieferungen und klingt ab', () => {
    const s = newGame();
    const st = s.stations[0];
    const from = { key: 'm:zhin', sector: 'zhin', x: 0, z: 0 };
    recordFlow(s, from, stationEnd(s, st.id), 'energycells', 1000);
    const flows = sectorFlows(s, st.sector, () => 1).filter((f) => f.ware === 'energycells' && !f.active);
    expect(flows).toHaveLength(1);
    expect(flows[0].rate).toBeCloseTo(500, 0);
    const r0 = flows[0].rate;
    s.time += 7200;
    const later = sectorFlows(s, st.sector, () => 1).find((f) => f.ware === 'energycells');
    expect(later!.rate).toBeLessThan(r0 * 0.4);
  });

  it('zeigt Flüsse in andere Sektoren bis zum Sprungtor', () => {
    const s = newGame();
    recordFlow(s, { key: 'a', sector: 'zhin', x: 10, z: 10 }, { key: 'b', sector: 'tkr', x: 0, z: 0 }, 'ore', 500);
    const seg = sectorFlows(s, 'zhin', () => 1).find((f) => f.fromKey === 'a')!;
    const g = gate('zhin', 'tkr');
    expect(seg.viaGate).toBe(true);
    expect(seg.bx).toBeCloseTo(g.x);
    expect(sectorFlows(s, 'tkr', () => 1).find((f) => f.fromKey === 'a')).toBeTruthy();
  });

  it('erfasst echte Lieferungen im Spiel', () => {
    const s = newGame();
    step(s, 3 * 3600);
    const all = sectorFlows(s, s.stations[0].sector, () => 1).filter((f) => f.rate > 0);
    expect(all.length).toBeGreaterThan(0);
    expect(flowRate).toBeTypeOf('function');
  });
});
