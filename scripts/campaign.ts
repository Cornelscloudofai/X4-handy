// Simulierter Spieler für die komplette Kampagne (15 Kapitel) mit Dauerlauf-Prüfungen.
// npx tsx scripts/campaign.ts [seed] [maxStunden]
import { newGame } from '../src/engine/state';
import { step } from '../src/engine/sim';
import * as A from '../src/engine/actions';
import * as Y from '../src/engine/yard';
import { claimMission, currentMission, missionComplete } from '../src/engine/story';
import { netWorth } from '../src/engine/stats';
import { acceptContract } from '../src/engine/contracts';
import { computePlan } from '../src/engine/planner';
import { storageCap, usedVolume } from '../src/engine/economy';
import { stationById } from '../src/engine/logistics';
import { SHIP_MAP } from '../src/data/ships';
import { MODULE_MAP } from '../src/data/modules';
import { WARES } from '../src/data/wares';
import { VENDORS } from '../src/data/vendors';
import type { Station } from '../src/engine/types';

const seed = Number(process.argv[2] ?? 4242);
const maxHours = Number(process.argv[3] ?? 300);
const s = newGame(seed);
const hrs = () => (s.time / 3600).toFixed(1);
const log = (...a: unknown[]) => console.log(`[${hrs()}h]`, ...a);
const problems: string[] = [];
const problem = (p: string) => { if (problems.length < 40) problems.push(`[${hrs()}h] ${p}`); };

// ---------- Hilfen ----------
const count = (st: Station, def: string) => st.modules.filter((m) => m.def === def).length + st.queue.filter((q) => q.def === def).length + (st.build?.def === def ? 1 : 0);
const ensure = (st: Station, def: string, n = 1) => { while (count(st, def) < n) { const r = A.queueModule(s, st.id, def); if (!r.ok) { problem(`${st.name}: ${def} – ${r.msg}`); return false; } } return true; };
function blueprint(def: string): boolean {
  if (s.blueprints.includes(def)) return true;
  for (const v of VENDORS.filter((x) => x.sells.includes(def))) {
    if (A.vendorOffer(s, v, def) !== 'buyable') continue;
    if (s.credits < MODULE_MAP[def].blueprintCost + 2e6) return false;
    const r = A.buyBlueprint(s, def, v.id);
    if (r.ok) { log('Bauplan:', MODULE_MAP[def].name, 'bei', v.name); return true; }
  }
  return false;
}
function place(x: number, z: number, name: string): Station | null {
  for (let r = 0; r < 80; r += 6) for (let a = 0; a < 6.28; a += 0.5) {
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (A.canPlaceStation(s, 'zhin', px, pz).ok) {
      const res = A.foundStation(s, 'zhin', px, pz);
      if (res.ok) { const st = stationById(s, res.id!)!; A.renameStation(s, st.id, name); log('Station gegründet:', name); return st; }
    }
  }
  problem(`Kein Bauplatz für ${name}`);
  return null;
}
/** Produktionskette per Planer einplanen; fehlende Baupläne werden gekauft */
function chain(st: Station, ware: string, modules: number, buy: string[] = []): boolean {
  const r = computePlan({ targets: [{ ware, modules }], sunlight: 100, workforce: false, buy, extra: {}, auto: true });
  const mods = Object.values(r.nodes).filter((n) => n.kind === 'module' && n.modules > 0).sort((a, b) => a.column - b.column);
  for (const n of mods) if (!blueprint('prod_' + n.ware)) return false;
  for (const n of mods) ensure(st, 'prod_' + n.ware, n.modules);
  return true;
}
/** Miner nach Planer-Bedarf: grob eine Ladung je ~11 min */
function miners(st: Station, ware: string, perHour: number) {
  const cls = WARES[ware].storage === 'Liquid' ? 'alligator_gas' : 'alligator_min';
  const thr = (SHIP_MAP[cls].capacity / WARES[ware].volume) * (3600 / 680);
  const want = Math.max(1, Math.ceil(perHour / thr));
  const have = s.ships.filter((x) => x.home === st.id && x.cls === cls && x.mineWare === ware).length;
  for (let i = have; i < want; i++) {
    if (s.credits < SHIP_MAP[cls].price + 1e6) return;
    A.buyShip(s, cls, st.id);
    const m = s.ships[s.ships.length - 1];
    A.setMinerWare(s, m.id, ware);
  }
}
function traders(st: Station, n: number) {
  const have = s.ships.filter((x) => x.home === st.id && SHIP_MAP[x.cls].role === 'trader').length;
  for (let i = have; i < n; i++) { if (s.credits < 1.5e6) return; A.buyShip(s, 'boa', st.id); }
}
function minedNeeds(st: Station, ware: string, modules: number, buy: string[] = []) {
  const r = computePlan({ targets: [{ ware, modules }], sunlight: 100, workforce: false, buy, extra: {}, auto: true });
  for (const n of Object.values(r.nodes)) if (n.kind === 'mined') miners(st, n.ware, n.use);
}

// ---------- Dauerlauf-Prüfungen ----------
const lastMove = new Map<string, { x: number; z: number; t: number; status: string; trips: number; earned: number }>();
function checkInvariants() {
  if (!Number.isFinite(s.credits)) problem('Credits ungültig: ' + s.credits);
  for (const st of s.stations) {
    for (const [id, n] of Object.entries(st.inventory)) if (!Number.isFinite(n) || n < -0.01) problem(`${st.name}: ${id} = ${n}`);
    const cap = storageCap(st), used = usedVolume(st);
    for (const k of ['Container', 'Solid', 'Liquid'] as const) if (used[k] > cap[k] * 1.01 + 1) problem(`${st.name}: ${k}-Lager überfüllt ${Math.round(used[k])}/${cap[k]}`);
  }
  for (const sh of s.ships) {
    if (!Number.isFinite(sh.x) || !Number.isFinite(sh.z)) problem(`${sh.name}: Position ungültig`);
    if (sh.cargo && (!Number.isFinite(sh.cargo.amount) || sh.cargo.amount < 0)) problem(`${sh.name}: Ladung ungültig`);
    const prev = lastMove.get(sh.id);
    const moved = !prev || Math.hypot(prev.x - sh.x, prev.z - sh.z) > 1 || prev.status !== sh.status || prev.trips !== sh.trips || Math.abs(prev.earned - sh.earned) > 1;
    if (moved) lastMove.set(sh.id, { x: sh.x, z: sh.z, t: s.time, status: sh.status, trips: sh.trips, earned: sh.earned });
    else if (s.time - prev!.t > 4 * 3600 && (sh.cargo || sh.job)) problem(`${sh.name} hängt seit 4 h fest: ${sh.status} · Phase ${sh.phase} · Timer ${Math.round(sh.timer)} · Ladung ${JSON.stringify(sh.cargo)} · Markt ${sh.sellKey} · Pfad ${sh.path.length} · Pos ${Math.round(sh.x)},${Math.round(sh.z)} ${sh.sector}`);
  }
}

// ---------- Spielverlauf ----------
const alpha = s.stations[0];
let beta: Station | null = null, chips: Station | null = null, engine: Station | null = null, clay: Station | null = null;
const chapterAt: Record<string, number> = {};
A.queueModule(s, alpha.id, 'prod_refinedmetals');
const t0 = performance.now();
for (let h = 0; h < maxHours; h++) {
  for (let q = 0; q < 4; q++) {
    step(s, 900);
    while (missionComplete(s)) { const m = currentMission(s)!; claimMission(s); chapterAt[m.id] = s.time / 3600; log(`Kapitel erledigt: ${m.title}`, '→', currentMission(s)?.title ?? 'Kampagne abgeschlossen'); }
    for (const c of s.contracts) if (c.status === 'offer' && s.contracts.filter((x) => x.status === 'active' && !x.story).length < 2) acceptContract(s, c.id);
    // Schiffsbestellungen annehmen, wenn eine Werft da ist
    const yard = Y.yardStations(s)[0];
    if (yard) for (const o of s.shipOrders ?? []) if (o.status === 'offer' && Y.yardSizes(yard).has(SHIP_MAP[o.cls].size) && (yard.yard?.queue.length ?? 0) < 3) Y.acceptShipOrder(s, o.id, yard.id);
    const m = currentMission(s)?.id;
    // Grundausbau
    if (s.ships.filter((x) => SHIP_MAP[x.cls].role === 'miner' && x.home === alpha.id).length < 2 && s.credits > 1.2e6) A.buyShip(s, 'alligator_min', alpha.id);
    if (['miners', 'graphene'].includes(m ?? '')) {
      ensure(alpha, 'storage_liquid');
      if (s.ships.filter((x) => x.cls === 'alligator_gas' && x.home === alpha.id).length < 1 && s.credits > 1.2e6) A.buyShip(s, 'alligator_gas', alpha.id);
    }
    if (m === 'trader' || (s.time > 3600 && s.ships.filter((x) => x.home === alpha.id && SHIP_MAP[x.cls].role === 'trader').length < 1)) traders(alpha, 1);
    if (m === 'graphene') ensure(alpha, 'prod_graphene');
    if (m === 'second' && !beta && s.credits > 1.5e6) { beta = place(70, 60, 'Station Beta'); if (beta) for (const d of ['storage_container', 'dock_m', 'prod_energycells']) ensure(beta, d); }
    if (beta && (m === 'hull' || chapterAt.hull)) {
      if (blueprint('prod_hullparts')) {
        ensure(beta, 'prod_hullparts');
        ensure(alpha, 'prod_refinedmetals', 2);
        A.setTradeRule(s, beta.id, 'refinedmetals', { buy: true });
        A.setTradeRule(s, beta.id, 'graphene', { buy: true });
      }
      traders(beta, 1);
      traders(alpha, 2);
    }
    if (m === 'license' && s.credits > 4.5e6) log(A.buyLicense(s, 'tkr').msg);
    // Speicher M, sobald bezahlbar
    if (chapterAt.license && s.credits > 6e6) for (const t of ['container', 'solid', 'liquid']) blueprint(`storage_${t}_m`);
    // Kapitel 9: Mikrochips
    if ((m === 'chips' || chapterAt.chips) && !chips && s.credits > 3e6) {
      chips = place(-30, -85, 'Chipwerk');
      if (chips) for (const d of ['dock_m', s.blueprints.includes('storage_container_m') ? 'storage_container_m' : 'storage_container', 'storage_solid']) ensure(chips, d);
    }
    if (chips) { if (chain(chips, 'microchips', 1)) minedNeeds(chips, 'microchips', 1); traders(chips, 1); }
    // Kapitel 10: Antriebsteile nach Rhy
    if ((m === 'engines' || chapterAt.engines) && !engine && s.credits > 3e6) {
      engine = place(100, 20, 'Antriebswerk');
      if (engine) for (const d of ['dock_m', s.blueprints.includes('storage_container_m') ? 'storage_container_m' : 'storage_container', 'storage_solid', 'storage_liquid']) ensure(engine, d);
    }
    if (engine) { if (chain(engine, 'engineparts', 1)) minedNeeds(engine, 'engineparts', 1); traders(engine, 2); }
    // Kapitel 11: Claytronik – Mikrochips kommen vom Chipwerk (Lieferreihenfolge)
    if ((m === 'claytronics' || chapterAt.claytronics) && !clay && s.credits > 4e6 && chips) {
      clay = place(10, 85, 'Claytronik-Werk');
      if (clay) {
        for (const d of ['dock_m', s.blueprints.includes('storage_container_m') ? 'storage_container_m' : 'storage_container', 'storage_liquid']) ensure(clay, d);
        A.setDeliveryPrio(s, chips.id, [clay.id]);
        chips.prioBeforeNpc = true;
      }
    }
    if (clay && chips) { if (chain(clay, 'claytronics', 1, ['microchips'])) minedNeeds(clay, 'claytronics', 1, ['microchips']); ensure(chips, 'prod_microchips', 2); traders(clay, 2); }
    // Kapitel 12–14: eigene Werft bei Station Alpha
    if (chapterAt.claytronics && blueprint('yard_m')) {
      ensure(alpha, 'yard_m');
      if (s.blueprints.includes('storage_container_m')) ensure(alpha, 'storage_container_m');
      traders(alpha, 3);
      if (beta) A.setDeliveryPrio(s, beta.id, [alpha.id]);
    }
    if ((m === 'firstship') && Y.yardStations(s).length && !(alpha.yard?.queue.length || alpha.yard?.build)) Y.queueShipBuild(s, alpha.id, 'boa');
  }
  if (h % 2 === 1) checkInvariants();
  if (h % 12 === 11) log(`Cr ${(s.credits / 1e6).toFixed(1)} Mio · Wert ${(netWorth(s) / 1e6).toFixed(0)} Mio · Ruf FRF ${s.rep.frf.toFixed(1)} ZYA ${s.rep.zya.toFixed(1)} · ${s.stations.length} Stationen · ${s.ships.length} Schiffe · Kapitel ${currentMission(s)?.id ?? 'fertig'}`);
  if (!currentMission(s) && !process.argv.includes("--weiter")) break;
}
const ms = performance.now() - t0;
console.log('\n=== Ergebnis ===');
console.log('Kapitel (Stunde):', Object.entries(chapterAt).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · '));
console.log('Offen:', currentMission(s)?.title ?? '–', currentMission(s)?.progress(s));
console.log(`Stationen ${s.stations.length}, Schiffe ${s.ships.length}, gebaute Schiffe ${s.totals.shipsBuilt ?? 0}, verkaufte ${s.totals.shipsSold ?? 0}`);
console.log(`Rechenzeit: ${(ms / 1000).toFixed(1)} s für ${hrs()} h Spielzeit (${(ms / (s.time / 3600)).toFixed(0)} ms je Spielstunde)`);
const t1 = performance.now(); step(s, 3600); console.log(`Großer Spielstand: 1 h Spielzeit in ${(performance.now() - t1).toFixed(0)} ms`);
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Keine Probleme bei den Dauerlauf-Prüfungen.');
