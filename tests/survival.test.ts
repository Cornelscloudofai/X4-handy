import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { MISSIONS, recordKey } from '../src/minigames/missions';

const DT = 1 / 60;
const make = (mode: 'normal' | 'endless', side: 'pirate' | 'xenon' | 'khaak' = 'xenon', seed = 3) => {
  const g = new ShooterGame({ level: 1, seed, mutator: null, mode, mission: 'ueberleben' }, side);
  g.resize(390, 780);
  return g;
};
const run = (g: ShooterGame, sec: number) => { for (let t = 0; t < sec && !g.result(); t += DT) { g.autopilot(); g.update(DT); } };

describe('Einsatz Überleben', () => {
  it('steht im Menü mit allen drei Gegnerseiten', () => {
    expect(MISSIONS.ueberleben.sides).toEqual(['pirates', 'xenon', 'khaak']);
    expect(recordKey('xenon', 'ueberleben')).toBe('xenon@ueberleben');
  });

  it('ohne Schutzziel: Gegner kommen und gehen auf den eigenen Jäger', () => {
    const g = make('normal');
    run(g, 20);
    expect(g.state.mission).toBe('ueberleben');
    expect(g.state.wards).toBe(0);
    expect(g.state.wave).toBeGreaterThanOrEqual(0);
    const G = g as unknown as { enemies: { target?: unknown; parent?: unknown }[] };
    const flying = G.enemies.filter((e) => !e.parent);
    expect(flying.length).toBeGreaterThan(0);
    expect(flying.every((e) => e.target === 'p')).toBe(true);
  });

  it('normal: Runde endet mit Ergebnis und Hülle statt Frachter', () => {
    const g = make('normal', 'pirate');
    run(g, 900);
    const r = g.result();
    expect(r).not.toBeNull();
    expect(r!.lines.some(([k]) => k === 'Frachter-Hülle')).toBe(false);
    if (r!.success) expect(r!.headline).toBe('Alle Wellen überstanden');
  });

  it('endlos bleibt Überleben (kein Frachter) und zählt Wellen', () => {
    const g = make('endless', 'khaak');
    expect(g.state.mission).toBe('ueberleben');
    run(g, 240);
    expect(g.state.wards).toBe(0);
    const r = g.result() ?? g.abort();
    expect(r.starRules?.[0]?.text).toBe('4 Wellen überstehen');
    expect(r.lines.some(([k]) => k === 'Wellen')).toBe(true);
  });
});
