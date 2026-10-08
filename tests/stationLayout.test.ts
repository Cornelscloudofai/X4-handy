import { describe, expect, it } from 'vitest';
import { layoutStation } from '../src/render/stationLayout';

describe('Stationsanordnung', () => {
  it('Piers halten den Raum vor sich frei und kein Träger läuft durch sie hindurch', () => {
    const defs = ['prod_graphene', 'pier_l', ...Array.from({ length: 30 }, (_, i) => (i % 3 ? 'prod_hullparts' : 'storage_solid')), 'pier_l', 'dock_m', 'prod_microchips'];
    for (const id of ['st0', 'st1', 'st2', 'st3']) {
      const slots = layoutStation(id, defs);
      defs.forEach((d, i) => {
        if (d !== 'pier_l') return;
        const p = slots[i];
        const cx = p.x + Math.cos(p.ang) * 0.3, cy = p.y + Math.sin(p.ang) * 0.3;
        slots.forEach((q, j) => {
          if (j === i) return;
          expect(Math.hypot(q.x - cx, q.y - cy), `${id}: Modul ${j} vor Pier ${i}`).toBeGreaterThanOrEqual(1.25);
          expect(q.path.slice(0, -1).some(([x, y]) => Math.hypot(x - p.x, y - p.y) < 0.05), `${id}: Träger durch Pier`).toBe(false);
        });
      });
      // Plätze bleiben eindeutig
      expect(new Set(slots.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBe(defs.length);
    }
  });
});
