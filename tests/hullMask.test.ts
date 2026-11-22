import { describe, expect, it } from 'vitest';
import { hullGap, maskFromSolid } from '../src/minigames/hullMask';

/** Rumpf als schmales langes Rechteck in einem 20 × 40-Bild (Zellen 4–15 quer, 2–37 längs) */
function longHull() {
  const w = 20, h = 40, solid = new Uint8Array(w * h);
  for (let y = 2; y < 38; y++) for (let x = 8; x < 12; x++) solid[y * w + x] = 1;
  return maskFromSolid(solid, w, h);
}

describe('Trefferform aus dem Schiffsbild', () => {
  it('Bug und Heck eines langen Schiffs zählen als Hülle, nicht nur die Mitte', () => {
    const m = longHull();
    // Bild 100 × 200 Einheiten: Bug bei y ≈ -90, Mitte 0
    expect(hullGap(m, 0, -85, 100, 200)).toBe(0);
    expect(hullGap(m, 0, 85, 100, 200)).toBe(0);
    expect(hullGap(m, 0, 0, 100, 200)).toBe(0);
  });

  it('neben dem Rumpf ist kein Treffer – der Abstand wächst mit der Entfernung', () => {
    const m = longHull();
    const a = hullGap(m, 30, 0, 100, 200), b = hullGap(m, 45, 0, 100, 200);
    expect(a).toBeGreaterThan(15);
    expect(a).toBeLessThan(25);
    expect(b).toBeGreaterThan(a);
  });

  it('außerhalb des Bilds zählt der Abstand zum Bildrand dazu', () => {
    const m = longHull();
    expect(hullGap(m, 0, -150, 100, 200)).toBeGreaterThan(55);
  });

  it('Umrisspunkte liegen auf dem Rand des Rumpfs', () => {
    const m = longHull();
    expect(m.edge.length).toBeGreaterThan(20);
    for (const [u] of m.edge) expect(u).toBeGreaterThanOrEqual(0.4);
  });
});
