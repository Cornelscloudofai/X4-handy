// Erkundung des unbekannten Raums: Späher fliegen über die bekannten Tore zu einem Sektor und suchen dort nach
// Torsignaturen ins Unbekannte. Ob es dort überhaupt etwas gibt, verrät die Suche nicht – „keine Spur“ heißt entweder
// Pech oder wirklich nichts. Gefundene Signaturen erscheinen auf der Sektorenkarte (state.frontier.signatures).
// Die Hürden sind Können und eigene Wirtschaft statt Geld und Warten: Die Peilung entscheidet über den Fund, ein
// erloschenes Tor braucht Waren aus den eigenen Lagern (der Rest lässt sich teuer zukaufen).
import { FRONTIER, FRONTIER_MAP, type RegionId } from '../data/frontier';
import { SECTOR_MAP } from '../data/sectors';
import { WARES } from '../data/wares';
import { addWare, initMarkets } from './economy';
import { syncFrontier } from './frontierSync';
import { syncFounded } from './npcEconomy';
import { book } from './ledger';
import type { GameState } from './types';
import type { Result } from './actions';
import { emit, log, rand } from './util';

export const SCOUT_PRICE = 140_000;
/** Flugzeit je Tor (s Spielzeit) und Dauer einer Suche */
export const SCOUT_HOP = 20 * 60;
export const SEARCH_TIME = 15 * 60;
/** Chance ohne Peilung, eine vorhandene Signatur zu finden – eine volle Peilung findet sie sicher */
export const SEARCH_CHANCE = 0.3;
export const searchChance = (bonus: number): number => Math.min(1, SEARCH_CHANCE + Math.max(0, bonus) * (1 - SEARCH_CHANCE));

export interface Scout {
  id: string;
  name: string;
  /** Sektor, in dem der Späher gerade ist (beim Flug: der letzte erreichte) */
  at: string;
  /** jump: der letzte Schritt führt durch ein instand gesetztes Tor ins Unentdeckte (Erstsichtung) */
  task?: { kind: 'fly' | 'search'; target: string; path: string[]; t: number; dur: number; bonus?: number; jump?: boolean; salvage?: boolean };
}

export interface FrontierState {
  signatures: string[];
  discovered: string[];
  scouts?: Scout[];
  /** Tore in Reparatur (Signatur „von>nach“): need = Waren, have = schon angeliefert; t läuft erst, wenn alles da ist */
  repairs?: GateRepair[];
  open?: string[];
  /** Zeitpunkt der Entdeckung je Sektor (Forschungsakte) */
  found?: Record<string, number>;
  /** Horchposten in Rhy's Ausblick: angelieferte Waren, done = wieder in Betrieb */
  outpost?: { have: Record<string, number>; done?: boolean };
}

export interface GateRepair { sig: string; t: number; dur: number; need?: Record<string, number>; have?: Record<string, number> }

/** Waren für die Instandsetzung eines erloschenen Tors: Hüllenteile für die Ringsegmente, Energiezellen für die
 *  Kopplung, weiter oben auch Elektronik. Je weiter oben, desto mehr. */
export const REPAIR_WARES: Record<RegionId, Record<string, number>> = {
  glut: { hullparts: 250, energycells: 1000 },
  band: { hullparts: 600, energycells: 2500, microchips: 150, sonnenkern: 4 },
  kristall: { hullparts: 1200, energycells: 5000, claytronics: 200, scanningarrays: 100, sonnenkern: 20 },
  abgrund: { hullparts: 2500, energycells: 10000, claytronics: 600, quantumtubes: 400, sonnenkern: 60 },
};
/** Montage, sobald alle Waren am Tor sind */
export const REPAIR_TIME = 30 * 60;
/** Zukauf fehlender Waren über Händler: Aufschlag auf den Durchschnittspreis */
export const REPAIR_BUY_MARKUP = 1.4;
/** Bergung eines Nebensignals aus der Peilung: Credits je Gebiet (Split-Raum: wenig) */
export const SALVAGE: Record<RegionId | 'split', number> = { split: 25_000, glut: 60_000, band: 120_000, kristall: 250_000, abgrund: 500_000 };

export function frontierState(state: GameState): FrontierState {
  if (!state.frontier) state.frontier = { signatures: [], discovered: [] };
  if (!state.frontier.scouts) state.frontier.scouts = [];
  return state.frontier as FrontierState;
}

export function scouts(state: GameState): Scout[] {
  return (state.frontier as FrontierState | undefined)?.scouts ?? [];
}

const ok = (msg: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });

/** Tore in beide Richtungen (Tore aus dem neuen Raum in den Split-Raum stehen nur beim neuen Sektor) */
const INTO_SPLIT: Record<string, string[]> = {};
for (const f of FRONTIER) for (const l of f.links) if (SECTOR_MAP[l] && !FRONTIER_MAP[l]) (INTO_SPLIT[l] ??= []).push(f.id);
/** Alle Tore eines Sektors – bei neuen Sektoren laut Karte (auch zu Unentdecktem), sonst Split-Tore plus Tore ins Neue */
export const linksOf = (id: string): string[] => FRONTIER_MAP[id] ? FRONTIER_MAP[id].links : SECTOR_MAP[id] ? [...SECTOR_MAP[id].links.filter((l) => !FRONTIER_MAP[l]), ...(INTO_SPLIT[id] ?? [])] : [];
export const sectorLabel = (id: string): string => SECTOR_MAP[id]?.name ?? FRONTIER_MAP[id]?.name ?? id;

/** Erreichbare Sektoren: der ganze Split-Raum und alle entdeckten neuen Sektoren */
export function reachable(state: GameState, id: string): boolean {
  return (!!SECTOR_MAP[id] && !FRONTIER_MAP[id]) || (state.frontier?.discovered ?? []).includes(id);
}

/** Kürzester Weg über Tore zwischen erreichbaren Sektoren */
export function scoutPath(state: GameState, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev: Record<string, string> = {};
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of linksOf(cur)) {
      if (seen.has(n) || !reachable(state, n)) continue;
      seen.add(n);
      prev[n] = cur;
      if (n === to) {
        const path = [to];
        let c = to;
        while (prev[c]) { c = prev[c]; path.unshift(c); }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Tore dieses Sektors ins noch Unentdeckte, deren Signatur noch nicht gefunden ist */
export function hiddenLinks(state: GameState, id: string): string[] {
  const f = state.frontier;
  return linksOf(id).filter((l) => FRONTIER_MAP[l] && !(f?.discovered ?? []).includes(l) && !(f?.signatures ?? []).includes(`${id}>${l}`));
}

export function buyScout(state: GameState): Result {
  if (state.credits < SCOUT_PRICE) return fail('Nicht genug Credits für einen Späher.');
  const home = state.stations[0]?.sector ?? 'zhin';
  const fs = frontierState(state);
  const n = fs.scouts!.length + 1;
  const scout: Scout = { id: `sp-${state.nextId++}`, name: `Späher ${['Ilka', 'Varn', 'Teshra', 'Oskel', 'Mirr', 'Daun'][(n - 1) % 6]}${n > 6 ? ' ' + n : ''}`, at: home };
  fs.scouts!.push(scout);
  book(state, -SCOUT_PRICE, 'ships', `${scout.name} gekauft`);
  return ok(`${scout.name} steht in ${sectorLabel(home)} bereit.`);
}

/** Späher zu einem Sektor schicken und dort suchen lassen (bonus: Vorsprung aus dem Peil-Minispiel, 0…1) */
export function sendScout(state: GameState, scoutId: string, target: string, bonus = 0, salvage = false): Result {
  const s = scouts(state).find((x) => x.id === scoutId);
  if (!s) return fail('Späher nicht gefunden.');
  if (s.task) return fail(`${s.name} ist unterwegs.`);
  if (!reachable(state, target)) return fail('Dieser Sektor ist nicht erreichbar.');
  const path = scoutPath(state, s.at, target);
  if (!path) return fail('Kein Weg dorthin bekannt.');
  if (path.length > 1) s.task = { kind: 'fly', target, path, t: 0, dur: (path.length - 1) * SCOUT_HOP, bonus, salvage };
  else s.task = { kind: 'search', target, path, t: 0, dur: SEARCH_TIME, bonus, salvage };
  return ok(path.length > 1 ? `${s.name} fliegt nach ${sectorLabel(target)} (${path.length - 1} Tor${path.length > 2 ? 'e' : ''}) und sucht dort.` : `${s.name} beginnt die Suche in ${sectorLabel(target)}.`);
}

/** Schwierigkeit der Peilung (0…1): steigt mit dem Erkundungsfortschritt */
export const peilDepth = (state: GameState): number => Math.min(1, (state.frontier?.discovered.length ?? 0) / 12);

export const regionOf = (id: string): RegionId | 'split' => FRONTIER_MAP[id]?.region ?? 'split';

/** Waren, die ein Tor braucht (nach dem Gebiet dahinter) */
export function repairWares(sig: string): Record<string, number> {
  return { ...REPAIR_WARES[FRONTIER_MAP[sig.split('>')[1]]?.region ?? 'glut'] };
}

const repairOf = (state: GameState, sig: string) => (state.frontier as FrontierState | undefined)?.repairs?.find((x) => x.sig === sig);

/** Was am Tor noch fehlt (alte Spielstände ohne Warenliste: nichts) */
export function repairMissing(r: { need?: Record<string, number>; have?: Record<string, number> }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(r.need ?? {})) {
    const m = n - (r.have?.[id] ?? 0);
    if (m > 1e-6) out[id] = m;
  }
  return out;
}

/** Was die eigenen Stationen davon gerade hergeben (über der eingestellten Reserve) */
export function gateSupply(state: GameState, sig: string): Record<string, number> {
  const r = repairOf(state, sig);
  return r ? siteSupply(state, r) : {};
}

/** Lieferbares für eine Baustelle (Tor oder Horchposten) aus den eigenen Lagern */
function siteSupply(state: GameState, r: { need?: Record<string, number>; have?: Record<string, number> }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, miss] of Object.entries(repairMissing(r))) {
    let n = 0;
    for (const st of state.stations) n += Math.max(0, (st.inventory[id] ?? 0) - (st.reserve?.[id] ?? 0));
    const take = Math.floor(Math.min(miss, n));
    if (take > 0) out[id] = take;
  }
  return out;
}

/** Preis für den Zukauf aller noch fehlenden Waren */
export function gateBuyCost(state: GameState, sig: string): number {
  const r = repairOf(state, sig);
  return r ? siteBuyCost(r) : 0;
}
function siteBuyCost(r: { need?: Record<string, number>; have?: Record<string, number> }): number {
  return Math.round(Object.entries(repairMissing(r)).reduce((sum, [id, n]) => sum + Math.ceil(n) * WARES[id].price.avg * REPAIR_BUY_MARKUP, 0));
}

/** Zustand eines gefundenen Tors: Signatur, Baustelle (Waren fehlen), Montage (0…1) oder offen */
export type GateView =
  | { kind: 'sig' }
  | { kind: 'site'; need: Record<string, number>; have: Record<string, number>; missing: Record<string, number> }
  | { kind: 'repair'; p: number; left: number }
  | { kind: 'open' };
export function gateState(state: GameState, sig: string): GateView {
  const f = state.frontier as FrontierState | undefined;
  if (f?.open?.includes(sig)) return { kind: 'open' };
  const r = f?.repairs?.find((x) => x.sig === sig);
  if (!r) return { kind: 'sig' };
  const missing = repairMissing(r);
  if (Object.keys(missing).length) return { kind: 'site', need: r.need ?? {}, have: r.have ?? {}, missing };
  return { kind: 'repair', p: r.t / r.dur, left: r.dur - r.t };
}

/** Baustelle am Tor einrichten – danach werden die Waren angeliefert */
export function repairGate(state: GameState, sig: string): Result {
  const fs = frontierState(state);
  if (!fs.signatures.includes(sig)) return fail('Keine Torsignatur bekannt.');
  if (gateState(state, sig).kind !== 'sig') return fail('Am Tor wird schon gearbeitet.');
  (fs.repairs ??= []).push({ sig, t: 0, dur: REPAIR_TIME, need: repairWares(sig), have: {} });
  const list = Object.entries(repairWares(sig)).map(([id, n]) => `${n.toLocaleString('de-DE')} ${WARES[id].name}`).join(', ');
  return ok(`Baustelle am Tor in ${sectorLabel(sig.split('>')[0])} eingerichtet. Gebraucht: ${list}.`);
}

function addHave(r: { have?: Record<string, number> }, id: string, n: number): void {
  (r.have ??= {})[id] = (r.have[id] ?? 0) + n;
}

/** Waren aus den eigenen Stationslagern ans Tor liefern (über der Reserve; größte Bestände zuerst) */
export function deliverGate(state: GameState, sig: string): Result {
  const r = repairOf(state, sig);
  if (!r) return fail('Keine Baustelle an diesem Tor.');
  const res = deliverSite(state, r);
  if (res.ok && !Object.keys(repairMissing(r)).length) res.msg += ' Alles da – die Montage beginnt.';
  return res;
}

function deliverSite(state: GameState, r: { need?: Record<string, number>; have?: Record<string, number> }): Result {
  const supply = siteSupply(state, r);
  if (!Object.keys(supply).length) return fail('Deine Lager haben gerade nichts davon übrig.');
  const parts: string[] = [];
  for (const [id, want] of Object.entries(supply)) {
    let left = want;
    const sts = [...state.stations].sort((a, b) => (b.inventory[id] ?? 0) - (a.inventory[id] ?? 0));
    for (const st of sts) {
      if (left <= 0) break;
      const n = Math.min(left, Math.max(0, (st.inventory[id] ?? 0) - (st.reserve?.[id] ?? 0)));
      if (n <= 0) continue;
      addWare(st, id, -n);
      left -= n;
    }
    addHave(r, id, want - left);
    parts.push(`${Math.round(want - left).toLocaleString('de-DE')} ${WARES[id].name}`);
  }
  return ok(`Geliefert: ${parts.join(', ')}.`);
}

/** Fehlende Waren bei Händlern zukaufen (mit Aufschlag) */
export function buyGateRest(state: GameState, sig: string): Result {
  const r = repairOf(state, sig);
  if (!r) return fail('Keine Baustelle an diesem Tor.');
  const cost = gateBuyCost(state, sig);
  if (cost <= 0) return fail('Es fehlt nichts mehr.');
  if (state.credits < cost) return fail('Nicht genug Credits für den Zukauf.');
  for (const [id, n] of Object.entries(repairMissing(r))) addHave(r, id, n);
  book(state, -cost, 'build', `Torwaren zugekauft: ${sectorLabel(sig.split('>')[0])}`);
  return ok('Händler liefern den Rest ans Tor. Die Montage beginnt.');
}

/** Späher durch ein offenes Tor ins Unbekannte schicken */
export function sendThrough(state: GameState, scoutId: string, sig: string): Result {
  const s = scouts(state).find((x) => x.id === scoutId);
  if (!s) return fail('Späher nicht gefunden.');
  if (s.task) return fail(`${s.name} ist unterwegs.`);
  if (gateState(state, sig).kind !== 'open') return fail('Das Tor ist noch nicht offen.');
  const [from, to] = sig.split('>');
  const path = scoutPath(state, s.at, from);
  if (!path) return fail('Kein Weg zum Tor bekannt.');
  const full = [...path, to];
  s.task = { kind: 'fly', target: to, path: full, t: 0, dur: (full.length - 1) * SCOUT_HOP, jump: true };
  return ok(`${s.name} fliegt zum Tor in ${sectorLabel(from)} – und hindurch.`);
}

/** Erstsichtung: der Sektor ist entdeckt */
export function discover(state: GameState, id: string): void {
  const fs = frontierState(state);
  if (fs.discovered.includes(id)) return;
  fs.discovered.push(id);
  (fs.found ??= {})[id] = state.time;
  fs.signatures = fs.signatures.filter((x) => x.split('>')[1] !== id);
  fs.open = (fs.open ?? []).filter((x) => x.split('>')[1] !== id);
  // Schon ausgebaute Sektoren werden spielbar: Märkte, Tore, NPC-Stationen
  syncFrontier(state);
  initMarkets(state);
  syncFounded(state);
  log(state, `Erstsichtung: ${sectorLabel(id)}!`, 'good', true, { kind: 'sector', id });
  emit({ type: 'discovery', id });
}

/** Abschluss einer Suche: mit Glück eine Signatur ins Unbekannte */
function finishSearch(state: GameState, s: Scout, sector: string, bonus: number, salvage: boolean): void {
  const hidden = hiddenLinks(state, sector);
  if (salvage) {
    const cr = SALVAGE[regionOf(sector)];
    book(state, cr, 'reward', `Bergung: ${sectorLabel(sector)}`, { kind: 'sector', id: sector });
    log(state, `${s.name} hat das Nebensignal in ${sectorLabel(sector)} angeflogen: ein Wrack. Die Bergung bringt ${cr.toLocaleString('de-DE')} Cr.`, 'good', true, { kind: 'sector', id: sector });
  }
  // Der Horchposten hört mit: In der Glutsee findet auch eine schwache Peilung leichter etwas
  const ear = state.frontier?.outpost?.done && regionOf(sector) === 'glut' ? OUTPOST_SEARCH : 0;
  if (hidden.length && rand(state) < Math.min(1, searchChance(bonus) + ear)) {
    const to = hidden[Math.floor(rand(state) * hidden.length) % hidden.length];
    frontierState(state).signatures.push(`${sector}>${to}`);
    log(state, `${s.name}: Torsignatur in ${sectorLabel(sector)} entdeckt! Sie führt ins Unbekannte.`, 'good', true, { kind: 'sector', id: sector });
  } else {
    log(state, `${s.name}: Keine Spur in ${sectorLabel(sector)}. Vielleicht woanders – oder ein zweiter Versuch.`, 'info', true, { kind: 'sector', id: sector });
  }
}

export function stepScouts(state: GameState, dt: number): void {
  const fs = state.frontier as FrontierState | undefined;
  for (const r of fs?.repairs ?? []) {
    if (Object.keys(repairMissing(r)).length) continue;
    r.t += dt;
    if (r.t >= r.dur) {
      (fs!.open ??= []).push(r.sig);
      log(state, `Das Tor in ${sectorLabel(r.sig.split('>')[0])} ist wieder offen – ein Späher kann hindurch.`, 'good', true, { kind: 'sector', id: r.sig.split('>')[0] });
    }
  }
  if (fs?.repairs?.length) fs.repairs = fs.repairs.filter((r) => r.t < r.dur);
  for (const s of scouts(state)) {
    const task = s.task;
    if (!task) continue;
    task.t += dt;
    if (task.kind === 'fly') {
      // Fortschritt über die Tore: der zuletzt erreichte Sektor gilt als Standort
      const hop = Math.min(task.path.length - 1, Math.floor(task.t / SCOUT_HOP));
      s.at = task.path[hop];
      if (task.t >= task.dur) {
        s.at = task.target;
        if (task.jump) { s.task = undefined; discover(state, task.target); }
        else s.task = { kind: 'search', target: task.target, path: [task.target], t: 0, dur: SEARCH_TIME, bonus: task.bonus, salvage: task.salvage };
      }
    } else if (task.t >= task.dur) {
      s.task = undefined;
      finishSearch(state, s, task.target, task.bonus ?? 0, !!task.salvage);
    }
  }
}

// ---------- Horchposten in Rhy's Ausblick ----------

/** Waren, um den Horchposten wieder in Betrieb zu nehmen */
export const OUTPOST_WARES: Record<string, number> = { hullparts: 150, energycells: 600, refinedmetals: 300 };
/** Zusätzliche Fundchance bei Suchen in der Glutsee, sobald der Horchposten läuft */
export const OUTPOST_SEARCH = 0.25;

/** Zustand des Horchpostens: null = noch nicht entdeckt */
export function outpostState(state: GameState): { done: boolean; need: Record<string, number>; have: Record<string, number>; missing: Record<string, number> } | null {
  const f = state.frontier as FrontierState | undefined;
  if (!f?.discovered.includes('f-ausblick')) return null;
  const o = f.outpost ?? { have: {} };
  const site = { need: OUTPOST_WARES, have: o.have };
  return { done: !!o.done, need: OUTPOST_WARES, have: o.have, missing: o.done ? {} : repairMissing(site) };
}

function outpostSite(state: GameState): { need: Record<string, number>; have: Record<string, number> } | null {
  const fs = frontierState(state);
  if (!fs.discovered.includes('f-ausblick') || fs.outpost?.done) return null;
  fs.outpost ??= { have: {} };
  return { need: OUTPOST_WARES, have: fs.outpost.have };
}

export const outpostSupply = (state: GameState): Record<string, number> => { const s = outpostSite(state); return s ? siteSupply(state, s) : {}; };
export const outpostBuyCost = (state: GameState): number => { const s = outpostSite(state); return s ? siteBuyCost(s) : 0; };

function outpostCheck(state: GameState, res: Result): Result {
  const fs = frontierState(state);
  if (res.ok && fs.outpost && !Object.keys(repairMissing({ need: OUTPOST_WARES, have: fs.outpost.have })).length) {
    fs.outpost.done = true;
    log(state, "Der Horchposten in Rhy's Ausblick läuft wieder. Auf Kanal 9 ist das Knacken jetzt klar: Es kommt aus Richtung des Bandtors, hinter der Familie Rhak.", 'good', true, { kind: 'sector', id: 'f-ausblick' });
    res.msg += ' Der Horchposten ist wieder in Betrieb.';
  }
  return res;
}

export function deliverOutpost(state: GameState): Result {
  const s = outpostSite(state);
  if (!s) return fail('Der Horchposten braucht nichts mehr.');
  return outpostCheck(state, deliverSite(state, s));
}

export function buyOutpostRest(state: GameState): Result {
  const s = outpostSite(state);
  if (!s) return fail('Der Horchposten braucht nichts mehr.');
  const cost = siteBuyCost(s);
  if (state.credits < cost) return fail('Nicht genug Credits für den Zukauf.');
  for (const [id, n] of Object.entries(repairMissing(s))) addHave(s, id, n);
  book(state, -cost, 'build', 'Horchposten: Waren zugekauft', { kind: 'sector', id: 'f-ausblick' });
  return outpostCheck(state, ok('Händler liefern den Rest zum Horchposten.'));
}
