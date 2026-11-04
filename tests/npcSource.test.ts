import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { queueModule } from '../src/engine/actions';
import { npcSource } from '../src/engine/npc';
import { buyableStock, marketPrice } from '../src/engine/economy';

/**
 * Fehler aus dem Tutorial (Handelsstart, Kapitel „Raffinerie“): Die Hütte war etwas billiger als der Handelsposten, hatte
 * aber nach ihrer Produktionsreserve kaum Hüllenteile frei. NPC-Händler wählten immer sie, fanden dort weniger als eine
 * Mindestladung und kamen nie – das Modul wartete stundenlang, obwohl der Handelsposten Tausende hatte.
 */
describe('NPC-Händler: Anbieter mit genug Ware', () => {
  /** Hütte billiger, aber fast leer; Handelsposten teurer, aber voll */
  function scene() {
    const s = newGame(7, 'trading');
    const hut = s.markets['zhin-huette'].hullparts, post = s.markets.zhin.hullparts;
    // Werte aus dem Fehlerfall: Handelsposten 3 565 Hüllenteile, Hütte 82 – im Verhältnis zu ihrem kleinen Lager etwas
    // voller und damit gut einen Credit billiger, aber unter einer Mindestladung (83)
    post.stock = 3565;
    hut.stock = 82;
    return s;
  }

  it('Szene wie im Fehlerfall: Hütte billiger, aber unter der Mindestladung', () => {
    const s = scene();
    expect(marketPrice(s, 'zhin-huette', 'hullparts')).toBeLessThan(marketPrice(s, 'zhin', 'hullparts'));
    expect(buyableStock(s, 'zhin-huette', 'hullparts')).toBeLessThan(83);
    expect(buyableStock(s, 'zhin', 'hullparts')).toBeGreaterThan(1000);
  });

  it('ohne Mindestmenge der billigste, mit Mindestmenge der, der genug hat', () => {
    const s = scene();
    expect(npcSource(s, 'zhin', 'hullparts')!.key).toBe('zhin-huette');
    expect(npcSource(s, 'zhin', 'hullparts', 83)!.key).toBe('zhin');
    // hat keiner genug: wie bisher der billigste
    expect(npcSource(s, 'zhin', 'hullparts', 1e9)!.key).toBe('zhin-huette');
  });

  // Plausibilität: auch mit knapper Hütte wird das Modul fertig (hier hilft zusätzlich der eigene Transporter)
  it('das Modul wird gebaut, obwohl die Hütte knapp bleibt', () => {
    const s = scene();
    s.credits = 20e6;
    const st = s.stations[0];
    expect(queueModule(s, st.id, 'prod_refinedmetals').ok).toBe(true);
    let t = 0;
    for (; t < 6 * 3600; t += 300) {
      // Hütte bleibt knapp (wie im Fehlerfall): jedes Mal wieder fast leer
      const hut = s.markets['zhin-huette'].hullparts;
      hut.stock = Math.min(hut.stock, 82);
      s.credits = Math.max(s.credits, 20e6);
      step(s, 300);
      if (st.modules.some((m) => m.def === 'prod_refinedmetals')) break;
    }
    expect(st.modules.some((m) => m.def === 'prod_refinedmetals')).toBe(true);
  });
});
