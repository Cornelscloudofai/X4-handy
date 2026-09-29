// Misst die Simulationsgeschwindigkeit (Offline-Nachberechnung) für einen mittleren Spielstand: npx tsx scripts/perf.ts
import { newGame } from '../src/engine/state';
import { step, catchUp } from '../src/engine/sim';
import * as A from '../src/engine/actions';

const s = newGame(99);
s.credits = 80e6;
const st = s.stations[0];
for (const d of ['prod_refinedmetals', 'prod_refinedmetals', 'storage_liquid', 'prod_graphene', 'storage_container']) A.queueModule(s, st.id, d);
for (const c of ['alligator_min', 'alligator_min', 'alligator_gas', 'boa', 'boa', 'boa']) A.buyShip(s, c, st.id);
for (let i = 0; i < 3; i++) {
  const r = A.foundStation(s, 'zhin', 40 + i * 25, 60 - i * 40);
  if (r.id) for (const d of ['storage_container', 'dock_m', 'prod_energycells', 'prod_refinedmetals']) A.queueModule(s, r.id, d);
  if (r.id) { A.buyShip(s, 'boa', r.id); A.buyShip(s, 'alligator_min', r.id); }
}
step(s, 3600);
let t = performance.now();
step(s, 3600);
const perHour = performance.now() - t;
t = performance.now();
catchUp(s, 8 * 3600);
const offline = performance.now() - t;
console.log(`Stationen ${s.stations.length}, Schiffe ${s.ships.length}, NPC ${s.npcs.length}`);
console.log(`1 h Spielzeit (2-s-Schritte): ${perHour.toFixed(0)} ms · 8 h offline (5-s-Schritte): ${offline.toFixed(0)} ms`);
