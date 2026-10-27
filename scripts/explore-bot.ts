// Spielt die Erkundungskapitel wie ein Spieler mit guter Peilung: Späher kaufen, in Rhy's Defiance peilen,
// Tor instand setzen (eigene Lager, Rest zukaufen), hindurchschicken. Für die Kampagnen- und Balance-Bots.
import * as E from '../src/engine/explore';
import type { GameState } from '../src/engine/types';

export function exploreBot(s: GameState, mission: string | undefined): void {
  if (!mission?.startsWith('x-')) return;
  if (!E.scouts(s).length && s.credits > E.SCOUT_PRICE * 2) E.buyScout(s);
  const sp = E.scouts(s)[0];
  if (!sp) return;
  const f = E.frontierState(s);
  const sig = 'rhy>f-ausblick';
  if (!f.signatures.includes(sig) && !f.discovered.length) {
    if (!sp.task) E.sendScout(s, sp.id, 'rhy', 1);
    return;
  }
  const g = E.gateState(s, sig);
  if (g.kind === 'sig') E.repairGate(s, sig);
  if (g.kind === 'site') {
    E.deliverGate(s, sig);
    if (s.credits > E.gateBuyCost(s, sig) * 3) E.buyGateRest(s, sig);
  }
  if (g.kind === 'open' && !sp.task) E.sendThrough(s, sp.id, sig);
}
