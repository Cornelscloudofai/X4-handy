import { expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, setModsOff } from '../src/minigames/loadout';
it('Mods aus: der Kampf rechnet ohne Mods', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const cfg = { level: 1, seed: 1, mutator: null, mode: 'normal', fog: false, mods: { dmg: 0.5 }, loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never;
  expect((new ShooterGame(cfg, 'pirate') as unknown as { mods: { dmg?: number } }).mods.dmg).toBe(0.5);
  setModsOff(true);
  expect((new ShooterGame(cfg, 'pirate') as unknown as { mods: { dmg?: number } }).mods.dmg).toBeUndefined();
  setModsOff(false);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
