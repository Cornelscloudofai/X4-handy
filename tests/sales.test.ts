import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { buyShip, sellOrder } from '../src/engine/actions';
import { saleAdvice, saleContext, saleOffers, sortOffers } from '../src/engine/sales';
import { SHIP_MAP } from '../src/data/ships';

describe('Verkaufsentscheidung', () => {
  it('rechnet Abnahme, Ladung, Flugzeit und Ertrag passend zum Schiff', () => {
    const s = newGame(21);
    const st = s.stations[0];
    st.inventory.hullparts = 5000;
    const boa = SHIP_MAP.boa;
    const offers = saleOffers(s, st.id, 'hullparts', boa, 5000);
    expect(offers.length).toBeGreaterThan(3);
    const shipUnits = boa.capacity / 12; // Hüllenteile: 12 m³
    for (const o of offers) {
      expect(o.accept).toBeLessThanOrEqual(shipUnits + 1e-6);
      expect(o.accept).toBeLessThanOrEqual(o.room + 1e-6);
      expect(o.cycle).toBeCloseTo(2 * (o.km / boa.speed) + 2 * 40);
      expect(o.perHour).toBeCloseTo(o.value / (o.cycle / 3600));
    }
    // Die Werft nimmt nur einen Teil – das muss als Käufer-Grenze erkennbar sein
    const wharf = offers.find((o) => o.name === 'Zhin-Werft')!;
    s.markets['zhin-werft'].hullparts.stock = s.markets['zhin-werft'].hullparts.cap - 100;
    const limited = saleOffers(s, st.id, 'hullparts', boa, 5000).find((o) => o.id === wharf.id)!;
    expect(limited.accept).toBeCloseTo(100, 0);
    expect(limited.limit).toBe('buyer');
  });

  it('sortiert je nach Priorität unterschiedlich und gibt einen Rat', () => {
    const s = newGame(22);
    s.sectors.push('tkr', 'cascade');
    const st = s.stations[0];
    st.inventory.refinedmetals = 20000;
    const offers = saleOffers(s, st.id, 'refinedmetals', SHIP_MAP.boa, 20000);
    const byPrice = sortOffers(offers, 'price')[0];
    const byHour = sortOffers(offers, 'perHour')[0];
    expect(byPrice.unitPrice).toBeGreaterThanOrEqual(byHour.unitPrice);
    expect(byHour.perHour).toBeGreaterThanOrEqual(byPrice.perHour);
    const ctx = saleContext(s, st.id, 'refinedmetals', SHIP_MAP.boa);
    expect(saleAdvice(ctx, offers).text.length).toBeGreaterThan(0);
  });

  it('führt einen Verkaufsauftrag mit dem gewählten Schiff aus', () => {
    const s = newGame(23);
    const st = s.stations[0];
    st.inventory.energycells = 30000;
    buyShip(s, 'boa', st.id);
    const ship = s.ships.find((x) => x.cls === 'boa')!;
    const offer = saleOffers(s, st.id, 'energycells', SHIP_MAP.boa, 7500).find((o) => o.name === 'Zhin-Werft')!;
    const credits = s.credits;
    expect(sellOrder(s, ship.id, st.id, 'energycells', offer.accept, offer.endpoint).ok).toBe(true);
    step(s, 3600);
    expect(ship.trips).toBeGreaterThan(0);
    expect(s.credits).toBeGreaterThan(credits);
  });
});
