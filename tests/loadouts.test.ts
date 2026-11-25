// Loadouts: Ausrüstung je Schiff gemerkt, gespeicherte Zusammenstellungen aus Schiff und kompletter Ausrüstung
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOADOUT_SLOTS, applyLoadout, deleteLoadout, editLoadout, loadout, loadoutChanged, loadoutFor, resetLoadoutCache, savedLoadouts, setLoadout, storeLoadout,
  suggestLoadoutName, suggestLoadoutTag, takeTurretNote, SHIPS,
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
    setLoadout({ ship: 'mamba', weapon: 'schrot', missile: 'schwarm' });
    setLoadout({ ship: 'cobra' });
    setLoadout({ turret: 'flak', weapon: 'boson' });
    setLoadout({ ship: 'mamba' });
    expect(loadout().weapon).toBe('schrot');
    expect(loadout().missile).toBe('schwarm');
    setLoadout({ ship: 'cobra' });
    expect(loadout().turret).toBe('flak');
    expect(loadout().weapon).toBe('boson');
    // auch nach einem Neustart (aus dem Speicher gelesen) und für Einsätze mit diesem Schiff
    resetLoadoutCache();
    expect(loadoutFor('mamba').weapon).toBe('schrot');
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
    setLoadout({ ship: 'mamba', weapon: 'schrot', missile: 'schwarm' });
    const i = storeLoadout();
    expect(i).toBe(0);
    const q = savedLoadouts().list[0]!;
    expect(q.name).toContain('Mamba');
    expect(q.name).toContain('Schrotbatterie');
    expect(q.tag).toBe('schwarm');
    expect(loadoutChanged()).toBe(false);
    setLoadout({ weapon: 'puls' });
    expect(loadoutChanged()).toBe(true);
    setLoadout({ ship: 'cobra' });
    applyLoadout(0);
    expect(loadout().ship).toBe('mamba');
    expect(loadout().weapon).toBe('schrot');
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

describe('Turmgruppen auf M-Schiffen', () => {
  it('Cobra: Bug- und Hecktürme mit eigener Turmart; alte Loadouts übernehmen ihre Turmart für beide Gruppen', async () => {
    const { ShooterGame } = await import('../src/minigames/shooter');
    setLoadout({ ship: 'cobra', turret: 'flak' });
    expect(loadout().groups).toEqual(['flak', 'flak']);
    setLoadout({ groups: ['flak', 'neutron'] });
    const g = new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', fog: false } as never, 'pirate') as unknown as { pTur: { type?: string; g?: number }[]; orderBtns: [string, number, number, number][] };
    expect(g.pTur.map((t) => t.type)).toEqual(['flak', 'flak', 'neutron', 'neutron']);
    expect(g.orderBtns.map(([k]) => k)).toEqual(expect.arrayContaining(['g0', 'g1']));
    // nach einem Neustart aus dem Speicher
    resetLoadoutCache();
    expect(loadoutFor('cobra').groups).toEqual(['flak', 'neutron']);
  });
});

describe('Raketen-Vierlinge nur auf L und XL, gezählt nach Gruppen', () => {
  it('Cobra und Drache: keine Vierlinge – alte Stände werden Tau-Türme, mit Hinweis', () => {
    takeTurretNote();
    store.set('x4-sektorbau-ausruestung', JSON.stringify({ ship: 'cobra', weapon: 'puls', turret: 'rakete', shield: 'leicht', groups: ['rakete', 'flak'] }));
    resetLoadoutCache();
    expect(loadout().groups).toEqual(['tau', 'flak']);
    expect(loadout().turret).toBe('tau');
    expect(takeTurretNote()).toContain('nur noch auf L- und XL-Schiffen');
    expect(takeTurretNote()).toBeNull();
    setLoadout({ ship: 'dragon', groups: ['rakete', 'rakete'] });
    expect(loadout().groups).toEqual(['tau', 'tau']);
  });

  it('Klapperschlange: höchstens eine Gruppe, vom Bug an gezählt', () => {
    setLoadout({ ship: 'klapperschlange', groups: ['puls', 'rakete', 'rakete'] });
    expect(loadout().groups).toEqual(['puls', 'rakete', 'tau']);
    expect(takeTurretNote()).toContain('höchstens einer Gruppe');
  });

  it('Raptor: höchstens vier M-Cluster, Silos auf den L-Sockeln frei', () => {
    const gs = SHIPS.raptor.groups!;
    setLoadout({ ship: 'raptor', groups: gs.map((g) => (g.kind === 'L' ? 'silo' : 'rakete')) });
    const got = loadout().groups!;
    expect(got.filter((v, i) => gs[i].kind === 'M' && v === 'rakete').length).toBe(4);
    expect(got.filter((v, i) => gs[i].kind === 'M' && v === 'tau').length).toBe(gs.filter((g) => g.kind === 'M').length - 4);
    expect(got.filter((_, i) => gs[i].kind === 'L').every((v) => v === 'silo')).toBe(true);
  });
});
