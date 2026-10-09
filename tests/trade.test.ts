import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { holdBuyOrder, holdSellOrder, setTradeRoute } from '../src/engine/actions';
import { expectedCargo, routeMargin } from '../src/engine/fleet';
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
    run(s, 3600, () => !sh.cargo && !sh.job && !sh.orders?.length && s.markets['zhin-huette'].energycells.stock > before);
    expect(sh.cargo).toBeNull();
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
});
