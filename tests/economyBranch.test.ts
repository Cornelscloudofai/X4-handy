import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { setSectorOrder, setShipHome, setTradeRule } from '../src/engine/actions';
import { SECTOR_MAP, NPC_MAP } from '../src/data/sectors';
import { buyMineRight, canMine, mineRightBlock } from '../src/engine/mineRights';
import { npcSource } from '../src/engine/npc';
import { wanted } from '../src/engine/logistics';
import { wareLimit } from '../src/engine/economy';
import { START_KIT } from '../src/engine/state';

describe('Wirtschaftszweige und Schürfrechte', () => {
  it('Bergbaustart mit 5.000 Cr, ohne Nividium im Startsektor; alte Spielstände behalten es', () => {
    const s = newGame(5, 'mining');
    expect(START_KIT.mining.credits).toBe(5_000);
    expect(s.credits).toBe(5_000);
    expect(SECTOR_MAP.zhin.fields.some((f) => f.ware === 'nividium')).toBe(false);
    newGame(5);
    expect(SECTOR_MAP.zhin.fields.some((f) => f.ware === 'nividium')).toBe(true);
    deserialize(serialize(s));
    expect(SECTOR_MAP.zhin.fields.some((f) => f.ware === 'nividium')).toBe(false);
  });

  it('Erz und Silizium gehen an getrennte Fabriken', () => {
    expect(NPC_MAP['zhin-huette'].buys).toContain('ore');
    expect(NPC_MAP['zhin-huette'].buys).not.toContain('silicon');
    expect(NPC_MAP['zhin-huette'].makes).toEqual(['refinedmetals', 'hullparts']);
    expect(NPC_MAP['zhin-silizium'].buys).toContain('silicon');
    expect(NPC_MAP['zhin-silizium'].makes).toEqual(['siliconwafers']);
    expect(NPC_MAP['cascade-elektronik'].makes).toContain('claytronics');
    expect(NPC_MAP['cascade-elektronik'].buys).toContain('siliconwafers');
  });

  it('NPC-Stationen haben in neuen Spielen nur S-Lager', () => {
    const s = newGame(5, 'mining');
    // Hütte: Erz ist die einzige Feststoffware → das ganze Erzlager S (100.000 m³)
    expect(s.markets['zhin-huette'].ore.cap * 10).toBeLessThanOrEqual(100_000);
    const vol = Object.entries(s.markets['zhin-werft']).reduce((a, [id, m]) => a + m.cap * (id === 'energycells' ? 1 : 0), 0);
    expect(vol).toBeLessThan(25_000);
  });

  it('Schürfrechte: Grundrohstoffe nach Ruf und Preis, Nividium erst danach', () => {
    const s = newGame(5, 'mining');
    expect(canMine(s, 'zhin', 'ore')).toBe(true);
    expect(canMine(s, 'tkr', 'ore')).toBe(false);
    expect(canMine(s, 'tkr', 'nividium')).toBe(false);
    const sh = s.ships[0];
    setShipHome(s, sh.id, '');
    expect(setSectorOrder(s, sh.id, { sector: 'tkr', ware: 'nividium' }).ok).toBe(false);
    expect(mineRightBlock(s, 'tkr', 'base')).toMatch(/Ruf 2/);
    s.rep.frf = 2; s.credits = 100_000;
    expect(mineRightBlock(s, 'tkr', 'nividium')).toMatch(/Grundrohstoffe/);
    expect(buyMineRight(s, 'tkr', 'base').ok).toBe(true);
    expect(s.credits).toBe(50_000);
    expect(canMine(s, 'tkr', 'ore')).toBe(true);
    expect(mineRightBlock(s, 'tkr', 'nividium')).toMatch(/Ruf 5/);
    s.rep.frf = 5; s.credits = 600_000;
    expect(buyMineRight(s, 'tkr', 'nividium').ok).toBe(true);
    expect(setSectorOrder(s, sh.id, { sector: 'tkr', ware: 'nividium' }).ok).toBe(true);
    // Alte Spielstände: keine Schürfrechte nötig
    expect(canMine(newGame(5), 'tkr', 'nividium')).toBe(true);
  });

  it('NPC-Händler kaufen direkt beim Hersteller, eine Kauforder holt die Ware zur Station', () => {
    const s = newGame(5, 'mining');
    s.credits = 5_000_000;
    // Hüllenteile: Hütte günstiger als der Handelsposten → sie ist die Quelle
    s.markets['zhin-huette'].hullparts.stock = s.markets['zhin-huette'].hullparts.cap;
    s.markets.zhin.hullparts.stock = 0;
    expect(npcSource(s, 'zhin', 'hullparts')?.key).toBe('zhin-huette');
    const st = s.stations[0];
    setTradeRule(s, st.id, 'hullparts', { buy: true, price: 300 });
    const before = st.inventory.hullparts ?? 0;
    for (let i = 0; i < 6 * 60 && (st.inventory.hullparts ?? 0) <= before; i++) {
      s.markets['zhin-huette'].hullparts.stock = s.markets['zhin-huette'].hullparts.cap;
      step(s, 10);
    }
    expect(st.inventory.hullparts ?? 0).toBeGreaterThan(before);
  }, 60000);
  it('Kauforder mit Füllstand: die Station kauft nur bis zum eingestellten Anteil', () => {
    const s = newGame(5, 'mining');
    const st = s.stations[0];
    const limit = wareLimit(st, 'hullparts');
    setTradeRule(s, st.id, 'hullparts', { buy: true, price: 250, fill: 0.5 });
    expect(wanted(s, st, 'hullparts')).toBeCloseTo(limit * 0.5, 0);
    st.inventory.hullparts = limit * 0.6;
    expect(wanted(s, st, 'hullparts')).toBe(0);
  });
});
