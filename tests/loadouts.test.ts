// Loadouts: Ausrüstung je Schiff gemerkt, gespeicherte Zusammenstellungen aus Schiff und kompletter Ausrüstung
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOADOUT_SLOTS, applyLoadout, deleteLoadout, editLoadout, loadout, loadoutChanged, loadoutFor, resetLoadoutCache, savedLoadouts, setLoadout, storeLoadout,
  suggestLoadoutName, suggestLoadoutTag,
} from '../src/minigames/loadout';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  resetLoadoutCache();
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; resetLoadoutCache(); });

describe('Ausrüstung je Schiff', () => {
  it('jedes Schiff behält seine zuletzt eingebaute Ausrüstung', () => {
    setLoadout({ ship: 'mamba', weapon: 'blitz', missile: 'schwarm' });
    setLoadout({ ship: 'cobra' });
    setLoadout({ turret: 'flak', weapon: 'boson' });
    setLoadout({ ship: 'mamba' });
    expect(loadout().weapon).toBe('blitz');
    expect(loadout().missile).toBe('schwarm');
    setLoadout({ ship: 'cobra' });
    expect(loadout().turret).toBe('flak');
    expect(loadout().weapon).toBe('boson');
    // auch nach einem Neustart (aus dem Speicher gelesen) und für Einsätze mit diesem Schiff
    resetLoadoutCache();
    expect(loadoutFor('mamba').weapon).toBe('blitz');
  });

  it('ein Schiff ohne gemerkte Ausrüstung übernimmt, was passt', () => {
    setLoadout({ ship: 'mamba', weapon: 'schrot' });
    setLoadout({ ship: 'jaguar' });
    expect(loadout().ship).toBe('jaguar');
    expect(loadout().weapon).toBe('schrot');
  });
});

describe('Loadouts', () => {
  it('speichern, abweichen, zurücksetzen – auch mit Schiffswechsel', () => {
    setLoadout({ ship: 'mamba', weapon: 'blitz', missile: 'schwarm' });
    const i = storeLoadout();
    expect(i).toBe(0);
    const q = savedLoadouts().list[0]!;
    expect(q.name).toContain('Mamba');
    expect(q.name).toContain('Kettenblitz');
    expect(q.tag).toBe('schwarm');
    expect(loadoutChanged()).toBe(false);
    setLoadout({ weapon: 'puls' });
    expect(loadoutChanged()).toBe(true);
    setLoadout({ ship: 'cobra' });
    applyLoadout(0);
    expect(loadout().ship).toBe('mamba');
    expect(loadout().weapon).toBe('blitz');
    expect(loadoutChanged()).toBe(false);
  });

  it(`höchstens ${LOADOUT_SLOTS} Plätze; Überschreiben, Umbenennen, Kennzeichen, Löschen; bleibt gespeichert`, () => {
    for (let k = 0; k < LOADOUT_SLOTS; k++) expect(storeLoadout()).toBe(k);
    expect(storeLoadout()).toBe(-1);
    editLoadout(2, { name: '  Gegen Schwärme  ', tag: 'geleit' });
    setLoadout({ weapon: 'massdriver' });
    storeLoadout(2);
    deleteLoadout(4);
    resetLoadoutCache();
    const sv = savedLoadouts();
    expect(sv.list[2]!.name).toBe('Gegen Schwärme');
    expect(sv.list[2]!.tag).toBe('geleit');
    expect(sv.list[2]!.lo.weapon).toBe('massdriver');
    expect(sv.list[4]).toBeNull();
    expect(sv.active).toBe(2);
    expect(storeLoadout()).toBe(4);
  });

  it('Name und Kennzeichen werden aus der Ausrüstung vorgeschlagen', () => {
    expect(suggestLoadoutTag({ ship: 'mamba', weapon: 'boson', turret: 'puls', shield: 'leicht', missile: 'schwer' })).toBe('gross');
    expect(suggestLoadoutTag({ ship: 'mamba', weapon: 'puls', turret: 'puls', shield: 'leicht', missile: 'lenk' })).toBe('allround');
    expect(suggestLoadoutName({ ship: 'mamba', weapon: 'tau', turret: 'puls', shield: 'leicht', missile: 'lenk' })).toBe('Mamba · Tau-Beschleuniger · Lenkrakete');
  });
});
