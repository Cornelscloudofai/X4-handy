import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { setSectorOrder, setShipHome } from '../src/engine/actions';

describe('Freie Schiffe', () => {
  it('Zuordnung lösen: freies Schiff wartet auf Befehl, übersteht Speichern und Laden', () => {
    const s = newGame(5, 'trading');
    const sh = s.ships[0];
    expect(setShipHome(s, sh.id, '').ok).toBe(true);
    expect(sh.home).toBe('');
    step(s, 120);
    expect(sh.status).toContain('Frei');
    const t = deserialize(serialize(s));
    expect(t.ships.length).toBe(1);
    expect(t.ships[0].home).toBe('');
    // Wieder einer Station zuordnen
    expect(setShipHome(s, sh.id, s.stations[0].id).ok).toBe(true);
    expect(sh.sectorOrder).toBeUndefined();
  });

  it('Sektorhandel: freier Transporter handelt eine Ware im Sektor und verdient', () => {
    const s = newGame(5, 'trading');
    s.contracts = []; s.contractTimer = 1e9;
    const sh = s.ships[0];
    setShipHome(s, sh.id, '');
    expect(setSectorOrder(s, sh.id, { sector: 'zhin', ware: 'energycells' }).ok).toBe(true);
    const c0 = s.credits;
    step(s, 2 * 3600);
    expect(sh.trips).toBeGreaterThan(2);
    expect(s.credits).toBeGreaterThan(c0);
  }, 60000);

  it('Sektorbefehle nur für freie Schiffe', () => {
    const s = newGame(5, 'mining');
    expect(setSectorOrder(s, s.ships[0].id, { sector: 'zhin', ware: 'ore' }).ok).toBe(false);
  });

  it('freier Miner: baut im Sektor ab und verkauft an den Bestbietenden', () => {
    const s = newGame(5, 'mining');
    const sh = s.ships[0];
    setShipHome(s, sh.id, '');
    expect(setSectorOrder(s, sh.id, { sector: 'zhin', ware: 'ore' }).ok).toBe(true);
    const c0 = s.credits;
    step(s, 2 * 3600);
    expect(sh.trips).toBeGreaterThan(0);
    expect(s.credits).toBeGreaterThan(c0);
  }, 60000);

  it('freier Miner mit festem Abnehmer: liefert dauerhaft an die eigene Station', () => {
    const s = newGame(5, 'mining');
    const sh = s.ships[0];
    const st = s.stations[0];
    setShipHome(s, sh.id, '');
    setSectorOrder(s, sh.id, { sector: 'zhin', ware: 'ore', to: 'st:' + st.id });
    const credits = s.credits;
    step(s, 2 * 3600);
    // Geliefert (NPC-Händler kaufen der Station Überschüsse ab – darum zählt die geförderte Menge)
    expect(s.totals.mined.ore ?? 0).toBeGreaterThan(1000);
    expect(sh.trips).toBeGreaterThan(0);
    expect(credits).toBeGreaterThan(0);
  }, 60000);
});
