// Erzeugt mit dem Code einer ALTEN Version einen gespielten Spielstand (läuft im jeweiligen Worktree).
import * as St from '../src/engine/state';
import * as Sim from '../src/engine/sim';
import * as A from '../src/engine/actions';
import * as M from '../src/data/modules';

const out = process.argv[2];
const s: any = (St as any).newGame(777);
s.credits = 30_000_000;
const MAP: any = (M as any).MODULE_MAP;
const q = (st: any, def: string) => { if (!MAP[def]) return; if (!s.blueprints.includes(def)) s.blueprints.push(def); try { (A as any).queueModule(s, st.id, def); } catch (e) { console.error('queue', def, String(e)); } };
const buy = (cls: string, st: any) => { try { (A as any).buyShip(s, cls, st.id); } catch (e) { console.error('buy', cls, String(e)); } };
const a = s.stations[0];
q(a, 'prod_refinedmetals');
q(a, 'prod_graphene');
q(a, MAP.storage_liquid ? 'storage_liquid' : 'storage_liquid_m');
buy('alligator_min', a); buy('alligator_gas', a); buy('boa', a);
const r = (A as any).foundStation(s, 'zhin', 60, 55);
const b = s.stations.find((x: any) => x.id === r.id);
if (b) { for (const d of ['storage_container', 'dock_m', 'prod_energycells', 'prod_hullparts']) q(b, d); buy('boa', b); }
(Sim as any).step(s, 6 * 3600);
// Laufende und geplante Bauten im Spielstand
q(a, 'prod_refinedmetals'); q(a, 'prod_siliconwafers');
if (b) q(b, 'prod_hullparts');
// Werft (wenn es sie in dieser Version gibt)
if (MAP.yard_m) {
  a.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
  a.inventory.hullparts = (a.inventory.hullparts ?? 0) + 200;
  try { const Y = await import('../src/engine/yard'); (Y as any).queueShipBuild(s, a.id, 'boa'); } catch (e) { console.error('yard', String(e)); }
}
(Sim as any).step(s, 600);
if (s.story) {
  s.story.index = Math.max(s.story.index ?? 0, 6);
  try { const Story = await import('../src/engine/story'); (Story as any).startMission?.(s); } catch { /* ältere Versionen */ }
}
const text = (St as any).serialize(s);
const fs = await import('node:fs');
fs.writeFileSync(out, text);
console.log('ok', out, text.length, 'Zeichen · Stationen', s.stations.length, 'Schiffe', s.ships.length, 'Bau', s.stations.map((x: any) => x.build?.def ?? '-').join(','));
