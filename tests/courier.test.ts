import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { COURIER_BONUS, generateCourier } from '../src/engine/contracts';
import { buyOrder, courierOrder } from '../src/engine/actions';
import { marketPrice } from '../src/engine/economy';
import { SHIP_MAP } from '../src/data/ships';
import { WARES } from '../src/data/wares';
import { NPC_MAP } from '../src/data/sectors';

describe('Kurieraufträge', () => {
  it('passen in eine Ladung des eigenen Transporters und zahlen 30–50 % über dem Verkaufswert', () => {
    const s = newGame(7, 'trading');
    const cls = SHIP_MAP[s.ships[0].cls];
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const c = generateCourier(s);
      if (!c) continue;
      n++;
      expect(c.source && c.market).toBeTruthy();
      expect(c.source).not.toBe(c.market);
      expect(WARES[c.ware].storage).toBe(cls.storage);
      expect(c.amount).toBeLessThanOrEqual(cls.capacity / WARES[c.ware].volume + 0.01);
      expect(c.size).toBe(cls.size);
      expect(NPC_MAP[c.market!].buys).toContain(c.ware);
      const value = c.amount * marketPrice(s, c.market!, c.ware);
      expect(c.reward / value).toBeGreaterThanOrEqual(1 + COURIER_BONUS[0] - 0.01);
      expect(c.reward / value).toBeLessThanOrEqual(1 + COURIER_BONUS[1] + 0.01);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('Schiff schicken: holt die Ware, liefert sie ab und kassiert den Lohn', () => {
    const s = newGame(7, 'trading');
    const c = generateCourier(s)!;
    s.contracts.push(c);
    const r = courierOrder(s, s.ships[0].id, c.id);
    expect(r.ok, r.msg).toBe(true);
    expect(c.status).toBe('active');
    const before = s.credits;
    for (let t = 0; t < 3 * 3600 && c.status === 'active'; t += 60) step(s, 60);
    expect(c.status).toBe('done');
    // Einkauf bezahlt, Lohn erhalten: unterm Strich Gewinn
    expect(s.credits).toBeGreaterThan(before);
  }, 60000);

  it('neue Spiele bekommen vor allem Kurieraufträge', () => {
    const s = newGame(3, 'mining');
    step(s, 6 * 3600);
    const couriers = s.contracts.filter((c) => c.source);
    expect(couriers.length).toBeGreaterThan(0);
  }, 60000);

  it('einmaliger Einkauf: Transporter kauft beim Handelsposten und bringt die Ware zur Station', () => {
    const s = newGame(7, 'trading');
    const st = s.stations[0];
    const r = buyOrder(s, s.ships[0].id, st.id, 'energycells', 500, { kind: 'market', sector: 'zhin' });
    expect(r.ok, r.msg).toBe(true);
    const before = s.credits;
    for (let t = 0; t < 3600 && (st.inventory.energycells ?? 0) < 1; t += 30) step(s, 30);
    expect(st.inventory.energycells ?? 0).toBeGreaterThan(400);
    expect(s.credits).toBeLessThan(before + 1);
  }, 60000);
});
