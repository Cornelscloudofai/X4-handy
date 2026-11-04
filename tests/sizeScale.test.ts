import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, SHIPS, SHIP_IDS, X4_LENGTH, scaledLength, setSizeScale, sizeScale } from '../src/minigames/loadout';
import { ShooterGame } from '../src/minigames/shooter';

/** Länge im Bild: lange Schiffe mit eigenem Seitenverhältnis, sonst die Zeichengröße */
const len = (id: (typeof SHIP_IDS)[number]) => SHIPS[id].size;

describe('Größenverhältnis im Kampf', () => {
  afterAll(() => setSizeScale('bisher', false));

  it('Wie in X4: Längen im Verhältnis der Meterangaben, Mamba bleibt 38', () => {
    setSizeScale('bisher', false);
    const before = Object.fromEntries(SHIP_IDS.map((id) => [id, len(id)]));
    setSizeScale('x4', false);
    expect(sizeScale()).toBe('x4');
    // sichtbare Länge vorher (gemessen): Raptor 1 185, Cobra 80, Mamba 38
    const vis = (id: 'raptor' | 'cobra' | 'mamba', v: number) => (len(id) / before[id]) * v;
    expect(vis('mamba', 38)).toBeCloseTo(38, 0);
    expect(scaledLength(32, 'x4')).toBeCloseTo(38);
    expect(scaledLength(3191, 'x4')).toBeCloseTo(3789.3, 0);
    // Raptor zu Cobra wie in X4 (3 191 m zu 147,7 m)
    const k = vis('raptor', 1185) / vis('cobra', 80), x4 = X4_LENGTH.raptor / X4_LENGTH.cobra;
    expect(Math.abs(k / x4 - 1)).toBeLessThan(0.02);
    expect(len('raptor')).toBeGreaterThan(len('klapperschlange') * 3);
    // Türme und Abwurfpunkte wachsen mit
    expect(Math.max(...SHIPS.raptor.turrets.map(([, y]) => Math.abs(y)))).toBeGreaterThan(1000);
  });

  it('Gestaucht liegt zwischen bisher und X4; Bisher stellt die alten Werte wieder her', () => {
    setSizeScale('bisher', false);
    const old = len('raptor'), oldR = SHIPS.raptor.r, oldT = SHIPS.raptor.turrets[0];
    setSizeScale('gestaucht', false);
    const mid = len('raptor');
    setSizeScale('x4', false);
    expect(mid).toBeLessThan(len('raptor'));
    setSizeScale('bisher', false);
    expect(len('raptor')).toBe(old);
    expect(SHIPS.raptor.r).toBe(oldR);
    expect(SHIPS.raptor.turrets[0]).toEqual(oldT);
  });

  it('Kampfkarte deutlich größer; der Raptor im X4-Maßstab passt auf die Karte', () => {
    setSizeScale('x4', false);
    for (const ship of ['mamba', 'raptor'] as const) {
      const g = new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', mission: 'station', loadout: { ...DEFAULT_LOADOUT, ship } }, 'pirate');
      g.resize(390, 780);
      const G = g as unknown as { WW: number; WH: number };
      expect(G.WW).toBeGreaterThanOrEqual(6500);
      expect(G.WW).toBeGreaterThanOrEqual(SHIPS[ship].size * 2);
    }
  });
});
