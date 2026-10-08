import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { COURIER_BONUS, contractDeliver, generateCourier, isDelivery, wareSellers } from '../src/engine/contracts';
import { buyOrder, courierOrder } from '../src/engine/actions';
import { marketPrice } from '../src/engine/economy';
import { SHIP_MAP } from '../src/data/ships';
import { WARES } from '../src/data/wares';

describe('Lieferaufträge nach Bedarf', () => {
  it('entstehen, wo eine Station dringend Ware braucht und viel zahlt – und anderswo ist sie günstiger zu haben', () => {
    const s = newGame(7, 'trading');
    const cls = SHIP_MAP[s.ships[0].cls];
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const c = generateCourier(s);
      if (!c) continue;
      n++;
      expect(isDelivery(c)).toBe(true);
      expect(c.source).toBeUndefined();
      const w = WARES[c.ware];
      expect(w.storage).toBe(cls.storage);
      expect(c.amount).toBeLessThanOrEqual(cls.capacity / w.volume + 0.01);
      expect(c.size).toBe(cls.size);
      // Ziel: knapp und teuer
      const m = s.markets[c.market!][c.ware];
      expect(m.stock / m.cap).toBeLessThanOrEqual(0.5);
      const price = marketPrice(s, c.market!, c.ware);
      expect(price).toBeGreaterThanOrEqual(w.price.avg);
      expect(c.reward / (c.amount * price)).toBeGreaterThanOrEqual(1 + COURIER_BONUS[0] - 0.01);
      expect(c.reward / (c.amount * price)).toBeLessThanOrEqual(1 + COURIER_BONUS[1] + 0.01);
      // Es gibt einen Verkäufer, bei dem sich der Einkauf lohnt
      const cheap = wareSellers(s, c.ware, c.market)[0];
      expect(cheap.price).toBeLessThan(price * 0.86);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('Schiff schicken: kauft beim gewählten Verkäufer, liefert ab, Lohn zählt als Ertrag des Schiffs', () => {
    const s = newGame(7, 'trading');
    const c = generateCourier(s)!;
    s.contracts.push(c);
    const ship = s.ships[0];
    const r = courierOrder(s, ship.id, c.id);
    expect(r.ok, r.msg).toBe(true);
    expect(c.status).toBe('active');
    const before = s.credits;
    for (let t = 0; t < 3 * 3600 && c.status === 'active'; t += 30) step(s, 30);
    expect(c.status).toBe('done');
    expect(c.paid).toBeCloseTo(c.reward, 0);
    // Gewinn beim Spieler und in der Schiffsbilanz
    expect(s.credits).toBeGreaterThan(before);
    expect(ship.earned).toBeGreaterThan(0);
  }, 60000);

  it('Lohn wird anteilig mit jeder Lieferung gezahlt', () => {
    const s = newGame(7, 'trading');
    const c = generateCourier(s)!;
    c.status = 'active';
    s.contracts.push(c);
    const before = s.credits;
    const half = Math.floor(c.amount / 2);
    const r = contractDeliver(s, c.id, c.ware, half);
    expect(r.used).toBe(half);
    expect(r.pay).toBeCloseTo((c.reward * half) / c.amount, 3);
    expect(s.credits - before).toBeCloseTo(r.pay, 3);
    const r2 = contractDeliver(s, c.id, c.ware, c.amount);
    expect(c.status).toBe('done');
    expect(s.credits - before).toBeCloseTo(c.reward, 3);
    expect(r.pay + r2.pay).toBeCloseTo(c.reward, 3);
  });

  it('neue Spiele bekommen Lieferaufträge', () => {
    const s = newGame(3, 'mining');
    step(s, 6 * 3600);
    expect(s.contracts.filter((c) => isDelivery(c)).length).toBeGreaterThan(0);
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
