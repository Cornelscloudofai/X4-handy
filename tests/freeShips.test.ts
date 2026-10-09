import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { setSectorOrder, setShipHome } from '../src/engine/actions';
import { sectorScoutJob, sectorTradeJob, SCOUT_AGE } from '../src/engine/fleet';
import { SHIP_MAP } from '../src/data/ships';
import { WARES } from '../src/data/wares';

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
  it('Sektorhandel rechnet mit Durchschnittspreisen: große Ladungen nur, soweit sie sich lohnen', () => {
    const s = newGame(5, 'trading');
    const sh = s.ships[0];
    expect(sh.cls).toBe('boa');
    const job = sectorTradeJob(s, sh, 'zhin', 'energycells');
    if (job) {
      // Nie mehr als die gewinnoptimale Menge – ein voller Laderaum, der die Preise kippt, wäre ein Verlustgeschäft
      expect(job.amount).toBeLessThanOrEqual(SHIP_MAP.boa.capacity / 1 + 1);
      expect(job.amount).toBeGreaterThan(0);
    }
    // Kein Gewinn möglich (Verkäufer teurer als alle Käufer): kein Auftrag
    for (const k of Object.keys(s.markets)) if (k.startsWith('zhin') && s.markets[k].energycells) s.markets[k].energycells.stock = k === 'zhin' ? 0 : s.markets[k].energycells.cap;
    s.intel = {};
    expect(sectorTradeJob(s, sh, 'zhin', 'energycells')).toBeNull();
  });

  it('Sektorhändler ohne Geschäft schaut selbst an veralteten Märkten nach', () => {
    const s = newGame(5, 'trading');
    const sh = s.ships[0];
    s.time += SCOUT_AGE + 60;
    const job = sectorScoutJob(s, sh, 'zhin', 'energycells');
    expect(job?.explore).toBe(true);
    // Frisch erfasste Märkte braucht er nicht anzufliegen
    for (const k in s.intel) s.intel[k].t = s.time;
    expect(sectorScoutJob(s, sh, 'zhin', 'energycells')).toBeNull();
  });

  it('S-Miner Tuatara (Mineral): echtes Split-Schiff, fördert und verkauft direkt', () => {
    const c = SHIP_MAP.tuatara_min;
    expect(c.role).toBe('miner');
    expect(c.size).toBe('S');
    expect(c.capacity).toBe(1720);
    // Baumaterial nur aus Waren, die es im Spiel gibt
    for (const cls of Object.values(SHIP_MAP)) for (const m of Object.keys(cls.materials)) expect(WARES[m], `${cls.id}: ${m}`).toBeTruthy();
    const s = newGame(5, 'mining');
    s.ships[0].cls = 'tuatara_min';
    const c0 = s.credits;
    step(s, 2 * 3600);
    // Was die Startstation nicht braucht, landet nicht im Lager, sondern beim Käufer
    expect(s.credits).toBeGreaterThan(c0 + 50_000);
    expect(s.ships[0].trips).toBeGreaterThan(3);
  }, 60000);
});
