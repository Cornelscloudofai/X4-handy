// Minispiele im echten Spiel.
//
// Vorfälle: Aus dem Spielgeschehen entsteht etwa einmal je Spielstunde ein Ereignis – ein Frachter wird überfallen,
// ein Produktionsmodul hat eine Störung, ein Miner stößt auf eine reiche Ader. Wer will, übernimmt selbst (Minispiel);
// sonst löst es sich nach Ablauf der Frist mit einem mittleren Ergebnis. Selbst spielen ist nie Pflicht.
//
// Aufgaben an Stationen: In jedem bekannten Sektor bieten zwei Stationen je eine Aufgabe an (alle 3 h neu).
// Lohn: Credits, Modteile (in der Oberfläche) und etwas Ruf – Ruf aber nur bis Stufe 3 und höchstens 0,5 je Fraktion
// und Spieltag. Das hilft beim Einstieg in einen neuen Sektor, ersetzt aber nicht Handel und Aufträge.
import { NPC_STATIONS, SECTOR_MAP } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { MODULE_MAP } from '../data/modules';
import { WARES } from '../data/wares';
import { addWare, freeUnits } from './economy';
import { book } from './ledger';
import type { FactionId, GameState } from './types';
import { log } from './util';

export type IncidentKind = 'raid' | 'fault' | 'vein';
/** Minispiel zu einem Vorfall oder einer Aufgabe (Kennungen wie im Minispiel-Rahmen) */
export type GameKind = 'pipes' | 'ore' | 'gas' | 'cargo' | 'highway' | 'orbit' | 'pirates' | 'xenon' | 'khaak';

export interface Incident {
  id: number;
  kind: IncidentKind;
  sector: string;
  /** Schiff (Überfall, Ader) oder Station (Störung) */
  target: string;
  /** Störung: Modul-uid */
  module?: number;
  /** Ware (Ladung, Modulware, Erz der Ader) */
  ware: string;
  /** Überfall: Ladung zum Zeitpunkt des Angriffs; Ader: volle Laderaummenge */
  amount: number;
  /** Gegner im Kampf */
  foe?: 'pirates' | 'xenon' | 'khaak';
  created: number;
  expires: number;
}

export interface BoardTask {
  id: number;
  /** Marktschlüssel der Station (Handelsposten = Sektor-ID, sonst NPC-Station) */
  key: string;
  game: GameKind;
  level: 1 | 2 | 3;
  credits: number;
  rep: number;
  /** Modteile bei drei Sternen */
  parts: number;
  title: string;
  text: string;
  done?: boolean;
}

export interface IncidentState {
  open: Incident[];
  next: number;
  n: number;
  boards: Record<string, { until: number; tasks: BoardTask[] }>;
  /** Ruf aus Aufgaben je Fraktion: [Spieltag, Summe] */
  repDay: Partial<Record<FactionId, [number, number]>>;
}

/** Erster Vorfall frühestens nach so vielen Sekunden, danach im Abstand von 50–80 min */
export const FIRST_INCIDENT = 40 * 60;
export const INCIDENT_GAP: [number, number] = [50 * 60, 80 * 60];
export const MAX_OPEN = 2;
/** Erst ab diesem Kapitel (Index, 0 = erstes) – die Einführung bleibt ungestört */
export const INCIDENT_CHAPTER = 4;
export const DEADLINE: Record<IncidentKind, number> = { raid: 20 * 60, fault: 90 * 60, vein: 30 * 60 };
/** Überfall: verlorener Anteil der Ladung ohne Eingreifen bzw. je Sterne (0–3) beim Selbstspielen */
export const RAID_AUTO_LOSS = 0.15;
export const RAID_LOSS: [number, number, number, number] = [0.25, 0.1, 0, 0];
export const RAID_BOUNTY = 3000;
/** Störung: Modul läuft mit halber Leistung; ohne Eingreifen Reparatur bei Fristende mit Hüllenteilen */
export const FAULT_SPEED = 0.5;
export const FAULT_REPAIR = 20;
/** Ader: Anteil eines vollen Laderaums ins Stationslager – ohne Eingreifen bzw. je Sterne */
export const VEIN_AUTO = 0.15;
export const VEIN_SHARE: [number, number, number, number] = [0, 0.35, 0.7, 1.05];
/** Aufgaben an Stationen */
export const BOARD_REFRESH = 3 * 3600;
export const BOARD_REP_CAP = 3;
export const BOARD_REP_DAY = 0.5;

export function incidentState(state: GameState): IncidentState {
  // erster Vorfall nach der Anlaufzeit; ältere Spielstände frühestens 10 min nach dem Laden
  return (state.incidents ??= { open: [], next: Math.max(FIRST_INCIDENT, state.time + 10 * 60), n: 0, boards: {}, repDay: {} });
}

/** Keine neuen Vorfälle (für Messungen in Tests und Testläufen) */
export function pauseIncidents(state: GameState): void {
  incidentState(state).next = Number.MAX_SAFE_INTEGER;
}

/** Zufall ohne Eingriff in den Spielzufall (der Spielverlauf bleibt bei gleichem Startwert gleich) */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 0x9e3779b9, 1597334677)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const unitsOf = (cls: string, ware: string): number => Math.floor(SHIP_MAP[cls].capacity / Math.max(1, WARES[ware].volume));
const foeIn = (sector: string): Incident['foe'] => (sector === 'ravine' ? 'xenon' : sector.startsWith('f-') ? 'khaak' : 'pirates');

/** Je Simulationsschritt: neue Vorfälle erzeugen, abgelaufene von selbst lösen */
export function stepIncidents(state: GameState): void {
  const s = incidentState(state);
  for (const inc of [...s.open]) if (state.time >= inc.expires) autoResolve(state, inc);
  if (state.time < s.next) return;
  // Die geführte Einführung bleibt ungestört: Vorfälle erst ab Kapitel 5
  if ((state.story?.index ?? 99) < INCIDENT_CHAPTER) { s.next = state.time + 10 * 60; return; }
  s.n++;
  const r = (k: number) => hash(s.n * 7 + k, state.seed ^ 0x51ed);
  s.next = state.time + INCIDENT_GAP[0] + (INCIDENT_GAP[1] - INCIDENT_GAP[0]) * r(1);
  if (s.open.length >= MAX_OPEN) return;
  const order: IncidentKind[] = (['raid', 'fault', 'vein'] as IncidentKind[]).sort((a, b) => r(a.length + 2) - r(b.length + 5));
  for (const kind of order) if (create(state, kind, r)) return;
}

function create(state: GameState, kind: IncidentKind, r: (k: number) => number): boolean {
  const s = incidentState(state);
  const busy = new Set(s.open.map((i) => i.target));
  const pick = <T>(list: T[]): T | undefined => list[Math.floor(r(11) * list.length) % Math.max(1, list.length)];
  const base = { id: state.nextId++, created: state.time, expires: state.time + DEADLINE[kind] };
  if (kind === 'raid') {
    const sh = pick(state.ships.filter((x) => SHIP_MAP[x.cls].role === 'trader' && x.cargo && x.cargo.amount > 0 && x.path.length > 0 && !busy.has(x.id)));
    if (!sh || !sh.cargo) return false;
    const inc: Incident = { ...base, kind, sector: sh.sector, target: sh.id, ware: sh.cargo.ware, amount: sh.cargo.amount, foe: foeIn(sh.sector) };
    s.open.push(inc);
    log(state, `Überfall auf ${sh.name}: ${inc.foe === 'xenon' ? 'Xenon-Jäger' : inc.foe === 'khaak' ? 'Kha’ak-Späher' : 'Piraten'} greifen den Frachter mit ${Math.round(inc.amount)} ${WARES[inc.ware].name} an.`, 'warn', true, { kind: 'incident', id: inc.id });
    return true;
  }
  if (kind === 'fault') {
    const cand = state.stations.flatMap((st) => st.modules.filter((m) => MODULE_MAP[m.def]?.kind === 'production' && MODULE_MAP[m.def]?.ware && !m.fault && m.util > 0.3).map((m) => ({ st, m }))).filter((x) => !busy.has(x.st.id));
    const c = pick(cand);
    if (!c) return false;
    c.m.fault = true;
    const ware = MODULE_MAP[c.m.def].ware!;
    const inc: Incident = { ...base, kind, sector: c.st.sector, target: c.st.id, module: c.m.uid, ware, amount: 0 };
    s.open.push(inc);
    log(state, `Störung in ${c.st.name}: Ein Modul für ${WARES[ware].name} läuft nur noch mit halber Leistung.`, 'warn', true, { kind: 'incident', id: inc.id });
    return true;
  }
  const sh = pick(state.ships.filter((x) => SHIP_MAP[x.cls].role === 'miner' && x.home && x.miningField && x.cargo && !busy.has(x.id)));
  if (!sh || !sh.cargo) return false;
  const inc: Incident = { ...base, kind, sector: sh.sector, target: sh.id, ware: sh.cargo.ware, amount: unitsOf(sh.cls, sh.cargo.ware) };
  s.open.push(inc);
  log(state, `${sh.name} ist auf eine reiche ${WARES[inc.ware].name}ader gestoßen.`, 'good', true, { kind: 'incident', id: inc.id });
  return true;
}

export const incidentById = (state: GameState, id: number): Incident | undefined => state.incidents?.open.find((i) => i.id === id);

/** Minispiel und Stufe zu einem Vorfall */
export function incidentGame(inc: Incident): { game: GameKind; level: 1 | 2 | 3 } {
  if (inc.kind === 'raid') return { game: inc.foe ?? 'pirates', level: 2 };
  if (inc.kind === 'fault') return { game: 'pipes', level: 2 };
  return { game: WARES[inc.ware].storage === 'Liquid' ? 'gas' : 'ore', level: 2 };
}

/** Überschrift und Satz zu einem Vorfall (für Hinweisleiste und Nachrichten) */
export function incidentText(state: GameState, inc: Incident): { title: string; text: string } {
  const ship = state.ships.find((x) => x.id === inc.target);
  const st = state.stations.find((x) => x.id === inc.target);
  if (inc.kind === 'raid') return { title: `Überfall auf ${ship?.name ?? 'Frachter'}`, text: `Ohne dich gehen etwa ${Math.round(RAID_AUTO_LOSS * 100)} % der Ladung verloren.` };
  if (inc.kind === 'fault') return { title: `Störung in ${st?.name ?? 'Station'}`, text: `Modul für ${WARES[inc.ware].name} läuft mit halber Leistung. Ohne dich: Reparatur bei Fristende, ${FAULT_REPAIR} Hüllenteile.` };
  return { title: `Reiche Ader für ${ship?.name ?? 'Miner'}`, text: `Selbst abbauen bringt bis zu ${Math.round(inc.amount * VEIN_SHARE[3])} ${WARES[inc.ware].name}, sonst ${Math.round(inc.amount * VEIN_AUTO)}.` };
}

function remove(state: GameState, inc: Incident): void {
  const s = incidentState(state);
  s.open = s.open.filter((x) => x.id !== inc.id);
}

/** Ladungsverlust bei einem Überfall: aus der Ladung, sonst (schon abgeliefert) als Geldwert */
function loseCargo(state: GameState, inc: Incident, share: number): string {
  if (share <= 0) return '';
  const n = inc.amount * share;
  const ship = state.ships.find((x) => x.id === inc.target);
  if (ship?.cargo && ship.cargo.ware === inc.ware) {
    const k = Math.min(ship.cargo.amount, n);
    ship.cargo.amount -= k;
    if (ship.cargo.amount <= 1e-6) ship.cargo = null;
    return `${Math.round(k)} ${WARES[inc.ware].name} verloren`;
  }
  const value = n * WARES[inc.ware].price.avg;
  book(state, -value, 'other', `Überfall: Ladung ${WARES[inc.ware].name} verloren`, { kind: 'ship', id: inc.target });
  return `Ladung im Wert von ${Math.round(value).toLocaleString('de-DE')} Cr verloren`;
}

function repairFault(state: GameState, inc: Incident): void {
  const st = state.stations.find((x) => x.id === inc.target);
  const m = st?.modules.find((x) => x.uid === inc.module);
  if (m) m.fault = false;
}

/** Frist abgelaufen: mittleres Ergebnis ohne Eingreifen */
function autoResolve(state: GameState, inc: Incident): void {
  remove(state, inc);
  if (inc.kind === 'raid') {
    const lost = loseCargo(state, inc, RAID_AUTO_LOSS);
    log(state, `Überfall vorbei: Die Begleitung der Familie hat die Angreifer vertrieben${lost ? ` – ${lost}` : ''}.`, 'info', false, { kind: 'ship', id: inc.target });
  } else if (inc.kind === 'fault') {
    const st = state.stations.find((x) => x.id === inc.target);
    if (st) addWare(st, 'hullparts', -Math.min(FAULT_REPAIR, st.inventory.hullparts ?? 0));
    repairFault(state, inc);
    log(state, `Störung in ${st?.name ?? 'der Station'} behoben – die Wartung hat ${FAULT_REPAIR} Hüllenteile verbraucht.`, 'info', false, st ? { kind: 'station', id: st.id } : undefined);
  } else {
    const got = giveVein(state, inc, VEIN_AUTO);
    log(state, `Die Ader ist abgebaut: ${got}.`, 'info', false, { kind: 'ship', id: inc.target });
  }
}

function giveVein(state: GameState, inc: Incident, share: number): string {
  const ship = state.ships.find((x) => x.id === inc.target);
  const st = state.stations.find((x) => x.id === ship?.home);
  // nur so viel, wie ins Lager passt
  const n = Math.min(Math.round(inc.amount * share), st ? Math.floor(freeUnits(st, inc.ware)) : 0);
  if (!st || n <= 0) return st ? 'Lager voll, kein Ertrag' : 'kein Ertrag';
  addWare(st, inc.ware, n);
  return `${n} ${WARES[inc.ware].name} ins Lager von ${st.name}`;
}

/** Ergebnis des Minispiels zu einem Vorfall (0–3 Sterne). Liefert eine Zeile für die Auswertung. */
export function resolveIncident(state: GameState, id: number, stars: number): string | null {
  const inc = incidentById(state, id);
  if (!inc) return null;
  const k = Math.max(0, Math.min(3, Math.round(stars))) as 0 | 1 | 2 | 3;
  remove(state, inc);
  let msg: string;
  if (inc.kind === 'raid') {
    const lost = loseCargo(state, inc, RAID_LOSS[k]);
    if (k === 3) book(state, RAID_BOUNTY, 'other', 'Kopfgeld: Angreifer vertrieben', { kind: 'ship', id: inc.target });
    msg = k ? `Angriff abgewehrt${lost ? ` – ${lost}` : ' – die Ladung ist vollständig'}${k === 3 ? `, ${RAID_BOUNTY.toLocaleString('de-DE')} Cr Kopfgeld` : ''}.` : `Der Frachter kam durch – ${lost || 'ohne Verlust'}.`;
  } else if (inc.kind === 'fault') {
    if (k >= 1) { repairFault(state, inc); msg = 'Störung behoben, das Modul läuft wieder voll.'; }
    else { reopenFault(state, inc); msg = 'Nicht geschafft – die Wartung kümmert sich bis zum Fristende.'; }
  } else {
    msg = `Abgebaut: ${giveVein(state, inc, VEIN_SHARE[k])}.`;
  }
  log(state, msg, k ? 'good' : 'info', false, inc.kind === 'fault' ? { kind: 'station', id: inc.target } : { kind: 'ship', id: inc.target });
  return msg;
}

/** Fehlversuch bei einer Störung: Vorfall bleibt bis zum Fristende offen */
function reopenFault(state: GameState, inc: Incident): void {
  incidentState(state).open.push(inc);
}

// ---------- Aufgaben an Stationen ----------

const KIND_TASKS: Record<string, { game: GameKind; title: string; text: string }[]> = {
  wharf: [
    { game: 'pipes', title: 'Leitungen im Trockendock', text: 'Die Kühlleitungen im Dock 3 sind nach dem letzten Stapellauf verdreht. Die Schicht schafft es nicht allein.' },
    { game: 'cargo', title: 'Rumpfteile verladen', text: 'Ein Frachter mit Rumpfsegmenten muss in einer Stunde ablegen. Schwere Teile nach unten, sonst kippt der Schwerpunkt.' },
  ],
  factory: [
    { game: 'pipes', title: 'Druckabfall im Leitungsnetz', text: 'Seit der Schichtübergabe fällt der Druck in Strang B. Die Leitstelle sucht jemanden, der das Netz neu verlegt.' },
  ],
  defence: [
    { game: 'pirates', title: 'Geleit für den Versorger', text: 'Der Versorger der Wache fliegt ohne Begleitjäger. Auf der Strecke wurden gestern zwei Piratenschiffe gemeldet.' },
    { game: 'xenon', title: 'Streife abfangen', text: 'Eine kleine Xenon-Streife nähert sich dem Posten. Die Wache bittet um Unterstützung, bis die eigenen Jäger zurück sind.' },
  ],
  habitat: [
    { game: 'cargo', title: 'Lebensmittel umladen', text: 'Die Lieferung für das Habitat steht ungeordnet im Hangar. Bis zur nächsten Ausgabe muss alles auf den Versorger.' },
    { game: 'orbit', title: 'Fähre zum Habitat', text: 'Die Pendelfähre ist ausgefallen. Wer eine Ladung Medizin zum Habitat andockt, wird bezahlt.' },
  ],
  trade: [
    { game: 'highway', title: 'Eilsendung', text: 'Ein Päckchen Ersatzteile muss in den Nachbarsektor, bevor dort die Schicht wechselt.' },
    { game: 'cargo', title: 'Frachtraum ordnen', text: 'Ein Händler hat seinen Frachtraum chaotisch beladen und zahlt, wenn ihn jemand vor dem Abflug ordnet.' },
    { game: 'orbit', title: 'Andockhilfe', text: 'Ein beschädigter Frachter kann nicht selbst andocken. Die Hafenmeisterei sucht einen Lotsen.' },
  ],
  mine: [
    { game: 'ore', title: 'Probebohrung', text: 'Die Familie will wissen, wie ergiebig ein neues Feld ist. Eine Probebohrung mit dem Laser reicht.' },
    { game: 'gas', title: 'Gasprobe', text: 'Für die Raffinerie wird eine reine Gasprobe gebraucht – ohne Fremdgas, sonst ist sie wertlos.' },
  ],
};

/** Bekannte Sektoren mit Aufgaben (Split-Raum und entdeckte neue Sektoren, sofern spielbar) */
function boardSectors(state: GameState): string[] {
  return Object.keys(SECTOR_MAP).filter((id) => state.sectors.includes(id) || SECTOR_MAP[id].links.some((l) => state.sectors.includes(l)) || (state.frontier?.discovered ?? []).includes(id));
}

/** Aufgaben eines Sektors (werden alle 3 h neu ausgeschrieben) */
export function boardFor(state: GameState, sector: string): BoardTask[] {
  const sec = SECTOR_MAP[sector];
  if (!sec || !boardSectors(state).includes(sector)) return [];
  const s = incidentState(state);
  const b = s.boards[sector];
  if (b && state.time < b.until) return b.tasks;
  const round = Math.floor(state.time / BOARD_REFRESH);
  const r = (k: number) => hash(round * 131 + k, sector.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const places: { key: string; kind: string }[] = [
    { key: sector, kind: 'trade' },
    ...NPC_STATIONS.filter((n) => n.sector === sector).map((n) => ({ key: n.id, kind: n.kind })),
  ];
  if (sec.fields.length) places.push({ key: sector, kind: 'mine' });
  // zwei verschiedene Stellen, je eine Aufgabe; Lohn nach Lizenzpreis des Sektors (teure Sektoren zahlen mehr)
  const tier = Math.min(3, 1 + Math.floor(sec.licenseCost / 4_000_000)) as 1 | 2 | 3;
  const tasks: BoardTask[] = [];
  const used = new Set<number>();
  for (let i = 0; i < Math.min(2, places.length); i++) {
    let p = Math.floor(r(i * 3 + 1) * places.length);
    while (used.has(p)) p = (p + 1) % places.length;
    used.add(p);
    const pl = places[p];
    const list = KIND_TASKS[pl.kind] ?? KIND_TASKS.trade;
    const t = list[Math.floor(r(i * 3 + 2) * list.length)];
    const game: GameKind = t.game === 'gas' && !sec.fields.some((f) => WARES[f.ware].storage === 'Liquid') ? 'ore' : t.game === 'ore' && !sec.fields.some((f) => WARES[f.ware].storage === 'Solid') ? 'gas' : t.game;
    const level = (Math.min(3, tier + (r(i * 3 + 3) > 0.7 ? 1 : 0))) as 1 | 2 | 3;
    tasks.push({ id: round * 100 + i + 1, key: pl.key, game, level, credits: 8000 * level * tier, rep: 0.25, parts: 2 + level, title: t.title, text: t.text });
  }
  s.boards[sector] = { until: (round + 1) * BOARD_REFRESH, tasks };
  return tasks;
}

/** Wie viel Ruf eine Aufgabe für diese Fraktion jetzt noch bringen kann (Deckel: Stufe 3, 0,5 je Spieltag) */
export function boardRepLeft(state: GameState, f: FactionId): number {
  const s = incidentState(state);
  const day = Math.floor(state.time / 86400);
  const d = s.repDay[f];
  const today = d && d[0] === day ? d[1] : 0;
  return Math.max(0, Math.min(BOARD_REP_DAY - today, BOARD_REP_CAP - (state.rep[f] ?? 0)));
}

/** Aufgabe erledigt: Lohn nach Sternen (ab einem Stern). Modteile vergibt die Oberfläche. */
export function finishTask(state: GameState, sector: string, taskId: number, stars: number): { credits: number; rep: number; parts: number } | null {
  const t = incidentState(state).boards[sector]?.tasks.find((x) => x.id === taskId);
  if (!t || t.done || stars < 1) return null;
  t.done = true;
  const k = Math.min(3, stars) / 3;
  const credits = Math.round((t.credits * k) / 100) * 100;
  const f = SECTOR_MAP[sector].faction;
  const rep = Math.min(t.rep * k, boardRepLeft(state, f));
  if (credits) book(state, credits, 'other', `Aufgabe: ${t.title}`, { kind: 'sector', id: sector });
  if (rep > 0) {
    state.rep[f] = (state.rep[f] ?? 0) + rep;
    const s = incidentState(state);
    const day = Math.floor(state.time / 86400);
    const d = s.repDay[f];
    s.repDay[f] = [day, (d && d[0] === day ? d[1] : 0) + rep];
  }
  const parts = Math.round(t.parts * k);
  log(state, `Aufgabe erledigt: ${t.title} – ${credits.toLocaleString('de-DE')} Cr${rep > 0 ? `, Ruf +${rep.toFixed(2).replace('.', ',')}` : ''}.`, 'good', false, { kind: 'sector', id: sector });
  return { credits, rep, parts };
}
