// Simulierter Spieler: prüft, ob die Kampagne machbar ist und die Wirtschaft stabil bleibt.
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import * as A from '../src/engine/actions';
import { claimMission, currentMission, missionComplete } from '../src/engine/story';
import { netWorth } from '../src/engine/stats';
import { marketPrice } from '../src/engine/economy';
import { productionUtil } from '../src/engine/analysis';
import { SHIP_MAP } from '../src/data/ships';
import { acceptContract } from '../src/engine/contracts';

const s = newGame(12345);
const st = s.stations[0];
const log = (...a: unknown[]) => console.log(`[${(s.time / 3600).toFixed(1)}h]`, ...a);
const miners = () => s.ships.filter((x) => SHIP_MAP[x.cls].role === 'miner').length;
const traders = () => s.ships.filter((x) => SHIP_MAP[x.cls].role === 'trader').length;
A.queueModule(s, st.id, 'prod_refinedmetals');
let second: string | undefined;
for (let h = 0; h < 72; h++) {
  for (let q = 0; q < 4; q++) {
    step(s, 900);
    while (missionComplete(s)) { const m = currentMission(s)!; claimMission(s); log('Mission erledigt:', m.title, '→', currentMission(s)?.title); }
    for (const c of s.contracts) if (c.status === 'offer' && s.contracts.filter((x) => x.status === 'active').length < 2) acceptContract(s, c.id);
    const m = currentMission(s)?.id;
    if (miners() < 2 && s.credits > 1.2e6) A.buyShip(s, 'alligator_min', st.id);
    if (m === 'miners' || m === 'graphene') {
      if (!st.modules.some((x) => x.def === 'storage_liquid') && !st.queue.length && !st.build) A.queueModule(s, st.id, 'storage_liquid');
      if (miners() < 3 && s.credits > 1.2e6) A.buyShip(s, 'alligator_gas', st.id);
    }
    if ((m === 'trader' || traders() < 1) && s.credits > 1.3e6 && miners() >= 3) A.buyShip(s, 'boa', st.id);
    if (m === 'graphene' && !st.modules.some((x) => x.def === 'prod_graphene') && !st.queue.some((x) => x.def === 'prod_graphene') && st.build?.def !== 'prod_graphene') A.queueModule(s, st.id, 'prod_graphene');
    if (m === 'second' && !second && s.credits > 1.5e6) {
      const r = A.foundStation(s, 'zhin', 70, 60);
      second = r.id; log('Station 2:', r.msg);
      for (const d of ['storage_container', 'dock_m', 'prod_energycells']) A.queueModule(s, second!, d);
    }
    if (m === 'hull' && second) {
      const b = s.stations.find((x) => x.id === second)!;
      if (!s.blueprints.includes('prod_hullparts')) { const r = A.buyBlueprint(s, 'prod_hullparts'); if (r.ok) log(r.msg); }
      if (s.blueprints.includes('prod_hullparts') && !b.modules.concat(b.queue.map((q) => ({ def: q.def }) as never)).some((x) => x.def === 'prod_hullparts') && b.build?.def !== 'prod_hullparts') {
        const r = A.queueModule(s, b.id, 'prod_hullparts'); log('Hüllenteile:', r.msg);
        A.queueModule(s, st.id, 'prod_refinedmetals');
        A.setTradeRule(s, b.id, 'refinedmetals', { buy: true });
        A.setTradeRule(s, b.id, 'graphene', { buy: true });
      }
      if (traders() < 3 && s.credits > 1.5e6) A.buyShip(s, 'boa', st.id);
      if (miners() < 5 && s.credits > 1.5e6) A.buyShip(s, 'alligator_min', st.id);
    }
    if (m === 'license' && s.credits > 4.2e6) log(A.buyLicense(s, 'tkr').msg);
  }
  if (h % 4 === 3) log(`Cr ${(s.credits / 1e6).toFixed(2)} Mio | Wert ${(netWorth(s) / 1e6).toFixed(1)} Mio | Ruf ${s.rep.frf.toFixed(1)} | Miner ${miners()} Händler ${traders()} | RM prod ${Math.round(s.totals.produced.refinedmetals ?? 0)} | Erz ${Math.round(s.totals.mined.ore ?? 0)} | verkauft ${(s.totals.sold / 1e6).toFixed(2)} Mio | RM-Preis ${marketPrice(s, 'zhin', 'refinedmetals').toFixed(0)} | Auslastung ${(productionUtil(st) * 100).toFixed(0)}% | NPC ${s.npcs.length} | Mission ${currentMission(s)?.id}`);
}
console.log('Stationen:', s.stations.map((x) => `${x.name} (${x.modules.length} Module)`).join(', '));
console.log('Kampagne:', currentMission(s)?.title ?? 'abgeschlossen', currentMission(s)?.progress(s));
