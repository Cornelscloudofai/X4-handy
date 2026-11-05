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

  it('Gegner in X4-Größe: Jäger wie die Mamba, Korvetten und Fregatten groß, der Xenon K ein XL-Schiff', () => {
    setSizeScale('x4', false);
    const mk = (side: 'pirate' | 'xenon' | 'khaak') => new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', mission: 'station', loadout: { ...DEFAULT_LOADOUT } }, side) as unknown as {
      makeEnemy(k: string, x: number, y: number): { r: number }; spawnBoss(mini?: boolean): void; enemies: { kind: string; r: number; ox?: number; parent?: unknown }[];
    };
    // sichtbare Größe = Trefferradius × Bildmaßstab (shipArt.ts)
    const p = mk('pirate'), x = mk('xenon');
    expect(p.makeEnemy('jaeger', 0, 0).r * 3.6).toBeCloseTo(38.2, 0);
    expect(p.makeEnemy('kanone', 0, 0).r * 3.4).toBeCloseTo(145, -1);
    expect(x.makeEnemy('m', 0, 0).r * 5).toBeCloseTo(37.6, 0);
    x.enemies.length = 0;
    x.spawnBoss();
    const boss = x.enemies.find((e) => e.kind === 'boss')!;
    expect(boss.r * 4.7).toBeCloseTo(1670 * 38 / 32, -1);
    // Türme sitzen auf den Sockeln des großen Bilds
    const tur = x.enemies.filter((e) => e.parent === boss);
    expect(Math.max(...tur.map((t) => Math.abs(t.ox!)))).toBeGreaterThan(61 * 10);
    setSizeScale('bisher', false);
    expect(mk('xenon').makeEnemy('m', 0, 0).r).toBe(14);
  });
});
