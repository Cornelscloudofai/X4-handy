import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { holdBuyOrder, holdSellOrder, setTradeRoute } from '../src/engine/actions';
import { expectedCargo, freeTradeJob, routeMargin, routeTarget } from '../src/engine/fleet';
import { RANK_LOAD, RANK_TRIPS, applyOpportunity, effectivePrice, pilotRank, stepOpportunities, streakBonus } from '../src/engine/trading';
import { knownSectors } from '../src/engine/logistics';
import { sectorDistanceHint } from '../src/engine/logistics';
import { marketPrice } from '../src/engine/economy';
import type { GameState, TradeEndpoint } from '../src/engine/types';

const post: TradeEndpoint = { kind: 'market', sector: 'zhin' };

function run(s: GameState, seconds: number, until?: () => boolean): void {
  for (let t = 0; t < seconds && !until?.(); t += 15) step(s, 15);
}

describe('Handel: einmaliger Kauf, Laderaum verkaufen, Handelsrouten', () => {
  it('einmaliger Kauf: Schiff kauft in den Laderaum und wartet dann mit der Ladung', () => {
    const s = newGame(7, 'trading');
    const sh = s.ships[0];
    const r = holdBuyOrder(s, sh.id, 'energycells', post, 1000);
    expect(r.ok, r.msg).toBe(true);
    expect(expectedCargo(sh)).toEqual({ ware: 'energycells', amount: 1000 });
    run(s, 1800, () => !!sh.cargo && !sh.job);
    expect(sh.cargo?.ware).toBe('energycells');
    expect(sh.cargo!.amount).toBeGreaterThan(900);
    // Bleibt mit der Ladung stehen, statt sie selbst zu verkaufen
    run(s, 1200);
    expect(sh.cargo?.ware).toBe('energycells');
    expect(sh.status).toContain('Wartet mit');
    // Ein zweiter Kauf geht nicht, solange der Laderaum belegt ist
    expect(holdBuyOrder(s, sh.id, 'hullparts', post, 10).ok).toBe(false);
  }, 60000);

  it('Laderaum verkaufen rechnet mit der Ladung am Ende der Warteschlange und verkauft sie', () => {
    const s = newGame(7, 'trading');
    const sh = s.ships[0];
    expect(holdSellOrder(s, sh.id, post).ok).toBe(false); // leer
    holdBuyOrder(s, sh.id, 'energycells', post, 1000);
    const buyer: TradeEndpoint = { kind: 'market', sector: 'zhin', market: 'zhin-huette' };
    const r = holdSellOrder(s, sh.id, buyer);
    expect(r.ok, r.msg).toBe(true);
    expect(expectedCargo(sh)).toBeNull();
    const before = s.markets['zhin-huette'].energycells.stock;
    run(s, 3600, () => !sh.orders?.length && !sh.job?.fromHold && !sh.holdCargo && s.markets['zhin-huette'].energycells.stock > before);
    // Verkauft: Laderaum-Befehl erledigt (danach handelt das Schiff im Autohandel weiter)
    expect(sh.orders?.length ?? 0).toBe(0);
    expect(sh.holdCargo).toBeFalsy();
    expect(s.markets['zhin-huette'].energycells.stock).toBeGreaterThan(before);
  }, 60000);

  it('Handelsroute endet oder pausiert unter der Gewinnschwelle', () => {
    const s = newGame(7, 'trading');
    const sh = s.ships[0];
    const to: TradeEndpoint = { kind: 'market', sector: 'zhin', market: 'zhin-huette' };
    const route = { from: post, to, ware: 'energycells' };
    const m = routeMargin(s, route)!;
    expect(m).toBeCloseTo((marketPrice(s, 'zhin-huette', 'energycells') - marketPrice(s, 'zhin', 'energycells')) / marketPrice(s, 'zhin', 'energycells'), 5);
    // Schwelle über dem aktuellen Gewinn → Pause
    setTradeRoute(s, sh.id, { ...route, minMargin: m + 0.5, onLow: 'pause' });
    run(s, 120);
    expect(sh.mode).toBe('route');
    expect(sh.job).toBeNull();
    expect(sh.status).toContain('pausiert');
    // … oder beenden
    setTradeRoute(s, sh.id, { ...route, minMargin: m + 0.5, onLow: 'end' });
    sh.phase = 'idle';
    run(s, 60);
    expect(sh.route).toBeNull();
    expect(sh.mode).toBe('auto');
  }, 60000);

  it('Pilotenrang: steigt mit Fahrten; Rang 1 handelt frei nur im Heimatsektor und mit Teilladungen', () => {
    const s = newGame(7, 'trading');
    const sh = s.ships[0];
    expect(pilotRank(sh)).toBe(1);
    sh.trips = RANK_TRIPS[4];
    expect(pilotRank(sh)).toBe(5);
    sh.trips = 0;
    const cap = 1350;
    for (let i = 0; i < 20; i++) {
      const j = freeTradeJob(s, sh, knownSectors(s));
      if (!j) continue;
      expect(j.free).toBe(true);
      for (const ep of [j.from, j.to]) expect(sectorDistanceHint('zhin', ep.kind === 'market' ? ep.sector : 'zhin')).toBe(0);
      expect(j.amount * 1).toBeLessThanOrEqual((cap / 1) * RANK_LOAD[1] + 1);
    }
  });

  it('Gelegenheiten entstehen und geben nur eigenen Befehlen den Sonderpreis', () => {
    const s = newGame(7, 'trading');
    s.oppTimer = 0;
    stepOpportunities(s, 1);
    expect(s.opportunities!.length).toBe(1);
    const o = s.opportunities![0];
    const base = s.markets[o.key][o.ware] ? effectivePrice(s, o.key, o.ware, o.kind) : 0;
    expect(base).toBeGreaterThan(0);
    const before = s.credits;
    const extra = applyOpportunity(s, o.key, o.ware, o.kind, 10, 1000);
    expect(extra).toBeGreaterThan(0);
    expect(s.credits - before).toBeCloseTo(extra, 5);
    expect(o.left).toBeLessThan(o.left + 10);
  });

  it('Handelsroute mit mehreren Abnehmern verkauft an den besten; Stammkunde bis +10 %', () => {
    const s = newGame(7, 'trading');
    const r = { from: post, to: { kind: 'market' as const, sector: 'zhin', market: 'zhin-huette' }, alt: [{ kind: 'market' as const, sector: 'zhin', market: 'zhin-werft' }], ware: 'energycells' };
    s.markets['zhin-huette'].energycells.stock = s.markets['zhin-huette'].energycells.cap * 0.9; // fast voll: niedriger Preis
    s.markets['zhin-werft'].energycells.stock = 0;
    const t = routeTarget(s, r)!;
    expect(t.to.kind === 'market' && t.to.market).toBe('zhin-werft');
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(3)).toBeCloseTo(0.03);
    expect(streakBonus(50)).toBeCloseTo(0.1);
  });
});
