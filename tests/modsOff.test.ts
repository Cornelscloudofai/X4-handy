import { expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, setModsOff } from '../src/minigames/loadout';
it('Mods aus: der Kampf rechnet ohne Mods', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const cfg = { level: 1, seed: 1, mutator: null, mode: 'normal', fog: false, mods: { dmg: 0.5 }, loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never;
  type M = { m(id: string): number; modsChanged(): void };
  const g = new ShooterGame(cfg, 'pirate') as unknown as M;
  expect(g.m('dmg')).toBe(0.5);
  // mitten im Kampf umgelegt (Pausenmenü): wirkt sofort
  setModsOff(true);
  g.modsChanged();
  expect(g.m('dmg')).toBe(0);
  setModsOff(false);
  expect(g.m('dmg')).toBe(0.5);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
