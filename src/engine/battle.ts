// Kampf auf der Karte (Stufe 4 in docs/design/kampf.md): Eigene Kampfschiffe und eine Gegnerrotte im Gefechtsabstand
// tauschen laufend Schaden aus – abgerechnet nach Kampfwert, leicht gestreut. Die Rotte verliert Schiffe, Piraten fliehen
// bei hohen Verlusten, Xenon und Kha'ak kämpfen fast bis zum Ende. Eigene S- und M-Schiffe werden zerstört (Wrack mit
// Schrott), L und XL nur kampfunfähig. Beschädigte Kampfschiffe reparieren an ihrer Heimatstation mit Hüllenteilen.
import { SECTOR_MAP } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { addWare, freeUnits } from './economy';
import { FOE_NAME, hostileState, type Hostile } from './hostiles';
import { RAID_BOUNTY, incidentById, repelRaid } from './incidents';
import { book } from './ledger';
import type { GameState, Ship } from './types';
import { disableShip } from './tow';
import { newShip } from './state';
import { emit, log, normalSpeed } from './util';

/** Gefechtsabstand (km): so nah müssen eigene Kampfschiffe an der Rotte sein */
export const FIGHT_R = 6;
/** Schaden je Sekunde in Kampfwert-Einheiten: jede Seite verliert Gegner-Kampfwert × K */
export const K = 1 / 40;
/** Rückzug: Piraten fliehen unter 40 % ihrer Stärke, Xenon und Kha'ak erst unter 15 % */
export const FLEE_AT = { pirates: 0.4, xenon: 0.15, khaak: 0.15 } as const;
/** Vorerst aus (zum Ausprobieren der Gefechte): Rotten kämpfen bis zum letzten Schiff, statt zu fliehen */
export const FLEE_ON = false;
/** Eigene Kampfschiffe kehren unter 25 % Hülle zur Reparatur heim */
export const RETREAT_AT = 0.25;
/** Reparatur an der Heimatstation: volle Instandsetzung in fünf Minuten, kostet 30 % der Hüllenteile des Baus */
export const REPAIR_TIME = 5 * 60;
export const REPAIR_SHARE = 0.3;
/** Schrott im Wrack: Anteil der Hüllenteile des Schiffs; Piratenwracks je Schiff */
export const WRECK_SHARE = 0.4;
export const FOE_SCRAP = 30;
/** Wracks bleiben zwei Tage liegen */
export const WRECK_TTL = 48 * 3600;
/** Kopfgeld je zerstörtem Gegnerschiff */
export const KILL_BOUNTY = 1000;
/** Träger: so viele Mambas fasst der Hangar für Gefechte auf der Karte; sie kämpfen mit diesem Anteil ihres Kampfwerts */
export const CARRIER_WING_MAX = 20;
export const WING_CLS = 'mamba';
export const WING_EFF = 0.8;
/**
 * Zerstörer (Rattlesnake): Hauptbatterie feuert schon auf große Entfernung – bis ARTY_R km auf Rotten im selben Sektor,
 * eine Salve alle ARTY_CD s mit ARTY_SHARE des Kampfwerts (die Rotte kann so weit nicht zurückschießen)
 */
export const ARTY_R = 22;
export const ARTY_CD = 2.4;
export const ARTY_SHARE = 0.5;

/** Mambas im Hangar eines Trägers */
export const wingOf = (s: Ship): number => s.wing ?? 0;
/** Kampfwert eines Schiffs samt Staffel (Hülle eingerechnet) */
export function powerOf(s: Ship): number {
  const own = SHIP_MAP[s.cls].combat?.power ?? 0;
  return own * hullOf(s) + wingOf(s) * (SHIP_MAP[WING_CLS].combat?.power ?? 0) * WING_EFF;
}

/** Eine Mamba für den Hangar des Trägers kaufen (zum Preis der Werft) */
export function buyWingFighter(state: GameState, shipId: string): { ok: boolean; msg: string } {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s || s.cls !== 'raptor') return { ok: false, msg: 'Nur Träger haben einen Hangar.' };
  if (wingOf(s) >= CARRIER_WING_MAX) return { ok: false, msg: `Der Hangar ist voll (${CARRIER_WING_MAX} Mambas).` };
  const price = SHIP_MAP[WING_CLS].price;
  if (state.credits < price) return { ok: false, msg: 'Nicht genug Credits.' };
  s.wing = wingOf(s) + 1;
  book(state, -price, 'ships', `Mamba für den Hangar von ${s.name}`);
  return { ok: true, msg: `Mamba an Bord von ${s.name} (${s.wing} im Hangar).` };
}

/** Hangar auffüllen: so viele Mambas wie fehlen (bis CARRIER_WING_MAX) und bezahlbar sind */
export function restockWing(state: GameState, shipId: string): { ok: boolean; msg: string } {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s || s.cls !== 'raptor') return { ok: false, msg: 'Nur Träger haben einen Hangar.' };
  const miss = CARRIER_WING_MAX - wingOf(s);
  if (miss <= 0) return { ok: false, msg: `Der Hangar ist voll (${CARRIER_WING_MAX} Mambas).` };
  const price = SHIP_MAP[WING_CLS].price;
  const n = Math.min(miss, Math.floor(state.credits / price));
  if (n <= 0) return { ok: false, msg: 'Nicht genug Credits.' };
  s.wing = wingOf(s) + n;
  s.wingLost = Math.max(0, (s.wingLost ?? 0) - n) || undefined;
  book(state, -price * n, 'ships', `${n} Mamba${n === 1 ? '' : 's'} für den Hangar von ${s.name}`);
  return { ok: true, msg: `${n} Mamba${n === 1 ? '' : 's'} an Bord von ${s.name} (${s.wing} im Hangar)${n < miss ? ` – für ${miss - n} weitere reicht das Geld nicht` : ''}.` };
}

/** Nachkauf automatisch: der Träger ersetzt verlorene Mambas, sobald er nicht mehr im Gefecht steht */
export function setWingAuto(state: GameState, shipId: string, on: boolean): { ok: boolean; msg: string } {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s || s.cls !== 'raptor') return { ok: false, msg: 'Nur Träger haben einen Hangar.' };
  s.wingAuto = on || undefined;
  return { ok: true, msg: on ? `${s.name} kauft verlorene Mambas künftig selbst nach.` : `${s.name}: Nachkauf nur noch von Hand.` };
}

/**
 * Im Takt des Trägers (außerhalb von Gefechten): im Gefecht verlorene Mambas nachkaufen, solange das Geld reicht.
 * Gestartete Mambas zählen nicht als Verlust – die kauft er nicht nach.
 */
export function autoRestockWing(state: GameState, s: Ship): void {
  if (!s.wingLost || s.cls !== 'raptor') return;
  if (!s.wingAuto || s.disabled || s.engage != null) return;
  const price = SHIP_MAP[WING_CLS].price;
  const n = Math.min(s.wingLost, CARRIER_WING_MAX - wingOf(s), Math.floor(state.credits / price));
  if (CARRIER_WING_MAX - wingOf(s) <= 0) { s.wingLost = undefined; return; }
  if (n <= 0) return;
  s.wing = wingOf(s) + n;
  s.wingLost = s.wingLost - n || undefined;
  book(state, -price * n, 'ships', `${n} Mamba${n === 1 ? '' : 's'} für den Hangar von ${s.name}`);
  log(state, `${s.name}: ${n === 1 ? 'eine Mamba' : `${n} Mambas`} nachgekauft (${(price * n).toLocaleString('de-DE')} Cr) – ${wingOf(s)} von ${CARRIER_WING_MAX} im Hangar.`, 'info', false, { kind: 'ship', id: s.id });
}

/** Eine Mamba aus dem Hangar als eigenes Schiff starten: fliegt danach selbständig (hält Position beim Träger) */
export function launchWingFighter(state: GameState, shipId: string): { ok: boolean; msg: string } {
  const s = state.ships.find((x) => x.id === shipId);
  if (!s || s.cls !== 'raptor') return { ok: false, msg: 'Nur Träger haben einen Hangar.' };
  if (wingOf(s) <= 0) return { ok: false, msg: 'Keine Mamba im Hangar.' };
  if (s.engage != null) return { ok: false, msg: `${s.name} steht im Gefecht – die Staffel ist schon draußen.` };
  const home = state.stations.find((x) => x.id === s.home) ?? state.stations[0];
  if (!home) return { ok: false, msg: 'Ohne eigene Station kann die Mamba keine Heimat bekommen.' };
  const a = state.nextId * 2.4;
  const m = newShip(state, WING_CLS, home, { sector: s.sector, x: s.x + Math.cos(a) * 2, z: s.z + Math.sin(a) * 2 });
  m.combat = { kind: 'move', sector: s.sector, x: m.x, z: m.z };
  m.status = `Gestartet von ${s.name}`;
  state.ships.push(m);
  s.wing = wingOf(s) - 1;
  log(state, `${m.name} aus dem Hangar von ${s.name} gestartet – noch ${s.wing} an Bord.`, 'info', false, { kind: 'ship', id: m.id });
  return { ok: true, msg: `${m.name} gestartet.` };
}

/** Eigene Mamba landet im Träger: wird Teil der Staffel (das Schiff verschwindet aus der Flottenliste) */
export function dockInCarrier(state: GameState, m: Ship, carrier: Ship): boolean {
  if (m.cls !== WING_CLS || carrier.cls !== 'raptor' || wingOf(carrier) >= CARRIER_WING_MAX) return false;
  const i = state.ships.indexOf(m);
  if (i < 0) return false;
  state.ships.splice(i, 1);
  carrier.wing = wingOf(carrier) + 1;
  log(state, `${m.name} im Hangar von ${carrier.name} gelandet – ${carrier.wing} von ${CARRIER_WING_MAX} an Bord.`, 'good', false, { kind: 'ship', id: carrier.id });
  return true;
}

export interface Wreck {
  id: number;
  sector: string;
  x: number;
  z: number;
  /** Herkunft für die Anzeige („Mamba ZHN-123“, „Piratenwracks“) */
  name: string;
  /** Schrott in Hüllenteilen */
  scrap: number;
  until: number;
}

export const wrecksOf = (state: GameState): Wreck[] => (state.wrecks ??= []);
export const hullOf = (s: Ship): number => s.hp ?? 1;
export const hostileHp = (h: Hostile): number => h.hp ?? h.power;
/** Schiffe der Rotte, die noch fliegen */
export const aliveOf = (h: Hostile): number => Math.max(1, Math.ceil((h.n * hostileHp(h)) / h.power - 1e-9));

/** Eigene Kampfschiffe im Gefecht mit dieser Rotte */
export function fightersAt(state: GameState, h: Hostile): Ship[] {
  return state.ships.filter((s) => SHIP_MAP[s.cls].combat && !s.disabled && hullOf(s) > 0 && s.sector === h.sector && Math.hypot(s.x - h.x, s.z - h.z) <= FIGHT_R);
}

/**
 * Großkampfschiffe, die man im Minispiel selbst fliegen kann (Schiffsklasse im Sektor → Schiff im Kampf-Minispiel)
 */
export const FLAGSHIP_GAME: Record<string, 'raptor' | 'klapperschlange'> = { raptor: 'raptor', rattlesnake: 'klapperschlange' };

/** Eigenes Großkampfschiff in diesem Gefecht (der Träger vor dem Zerstörer, sonst das stärkste), sonst undefined */
export function flagshipIn(state: GameState, h: Hostile): Ship | undefined {
  const caps = fightersAt(state, h).filter((s) => FLAGSHIP_GAME[s.cls]);
  return caps.sort((a, b) => (SHIP_MAP[b.cls].combat?.power ?? 0) * hullOf(b) - (SHIP_MAP[a.cls].combat?.power ?? 0) * hullOf(a))[0];
}

/** Zufall ohne Eingriff in den Spielzufall */
function jitter(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function addWreck(state: GameState, sector: string, x: number, z: number, name: string, scrap: number): void {
  if (scrap <= 0) return;
  wrecksOf(state).push({ id: state.nextId++, sector, x, z, name, scrap: Math.round(scrap), until: state.time + WRECK_TTL });
}

/** Eigenes Kampfschiff verloren: S/M zerstört (Wrack), L/XL kampfunfähig */
function shipDown(state: GameState, s: Ship, h: Hostile): void {
  const c = SHIP_MAP[s.cls];
  emit({ type: 'boom', sector: s.sector, x: s.x, z: s.z, big: c.size !== 'S' });
  if (c.size === 'S' || c.size === 'M') {
    state.ships.splice(state.ships.indexOf(s), 1);
    addWreck(state, s.sector, s.x, s.z, s.name, (c.materials.hullparts ?? 0) * WRECK_SHARE);
    // wer es begleitet hat oder von ihm begleitet wurde, verliert den Bezug von selbst (combat.ts)
    log(state, `${s.name} (${c.name}) wurde im Gefecht mit ${FOE_NAME[h.foe]} in ${SECTOR_MAP[s.sector].name} zerstört. Das Wrack lässt sich bergen.`, 'bad', true, { kind: 'sector', id: s.sector });
  } else {
    disableShip(state, s, `hat das Gefecht mit ${FOE_NAME[h.foe]} verloren`);
  }
}

/** Rotte vernichtet: Kopfgeld, Piratenwracks, ein laufender Überfall ist abgewehrt */
function hostileDown(state: GameState, h: Hostile, by: string): void {
  const hs = hostileState(state);
  hs.list.splice(hs.list.indexOf(h), 1);
  emit({ type: 'boom', sector: h.sector, x: h.x, z: h.z, big: true });
  addWreck(state, h.sector, h.x, h.z, `${FOE_NAME[h.foe]} (Wracks)`, FOE_SCRAP * h.n);
  const inc = h.incident != null ? incidentById(state, h.incident) : undefined;
  if (inc) repelRaid(state, inc.id);
  const bounty = KILL_BOUNTY * h.n;
  book(state, bounty, 'other', `Kopfgeld: ${FOE_NAME[h.foe]} vernichtet`, { kind: 'sector', id: h.sector });
  log(state, `${FOE_NAME[h.foe]} in ${SECTOR_MAP[h.sector].name} vernichtet${by ? ` von ${by}` : ''} – ${bounty.toLocaleString('de-DE')} Cr Kopfgeld${inc ? ` und ${RAID_BOUNTY.toLocaleString('de-DE')} Cr für den abgewehrten Überfall` : ''}. Die Wracks lassen sich bergen.`, 'good', true, { kind: 'sector', id: h.sector });
}

/** Zerstörer, die diese Rotte aus der Ferne beschießen (im Sektor, in Reichweite der Hauptbatterie, außerhalb des Nahkampfs) */
export function artilleryAt(state: GameState, h: Hostile): Ship[] {
  return state.ships.filter((s) => s.cls === 'rattlesnake' && !s.disabled && hullOf(s) > 0 && s.sector === h.sector && Math.hypot(s.x - h.x, s.z - h.z) <= ARTY_R && Math.hypot(s.x - h.x, s.z - h.z) > FIGHT_R);
}

/** Salven der Hauptbatterie: true, wenn die Rotte dabei vernichtet wurde */
function artillery(state: GameState, h: Hostile, dt: number): boolean {
  for (const s of artilleryAt(state, h)) {
    s.artyCd = (s.artyCd ?? 0) - dt;
    if (s.artyCd > 0) continue;
    s.artyCd = ARTY_CD;
    h.hp = hostileHp(h) - SHIP_MAP[s.cls].combat!.power * hullOf(s) * ARTY_SHARE * K * ARTY_CD * (0.8 + 0.4 * jitter(state.time, h.id + 7));
    emit({ type: 'arty', sector: h.sector, x: s.x, z: s.z, tx: h.x, tz: h.z });
    if (hostileHp(h) <= 0) { hostileDown(state, h, s.name); return true; }
  }
  return false;
}

/** Je Simulationsschritt: Gefechte abrechnen, Wracks altern lassen */
export function stepBattles(state: GameState, dt: number): void {
  const hs = hostileState(state);
  for (const h of [...hs.list]) {
    if (h.phase === 'leave') { h.fighting = false; continue; }
    const own = fightersAt(state, h);
    // Fernfeuer der Zerstörer: Salven auf große Entfernung, bevor die Rotte herankommt
    if (artillery(state, h, dt)) continue;
    // Gefecht beginnt: Zeit auf normal, damit man zusehen oder eingreifen kann
    if (own.length && !h.fighting) { normalSpeed(state); log(state, `Gefecht in ${SECTOR_MAP[h.sector].name}: ${own.map((x) => x.name).join(', ')} gegen ${FOE_NAME[h.foe]}.`, 'warn', true, { kind: 'sector', id: h.sector }); }
    h.fighting = own.length > 0;
    if (!own.length) continue;
    // Träger kämpfen mit ihrer Staffel
    const ownPower = own.reduce((a, s) => a + powerOf(s), 0);
    const r1 = 0.75 + 0.5 * jitter(state.time, h.id), r2 = 0.75 + 0.5 * jitter(h.id, state.time);
    // Schaden an der Rotte
    h.hp = hostileHp(h) - ownPower * K * dt * r1;
    // Schaden an eigenen Schiffen: trifft eines nach dem anderen, stärkere eher (sie ziehen das Feuer auf sich)
    const dmg = Math.max(0, hostileHp(h)) * K * dt * r2;
    const pick = own[Math.floor(jitter(state.time * 3, h.id) * own.length) % own.length];
    const p = SHIP_MAP[pick.cls].combat!.power;
    // Träger: die ausgeschwärmte Staffel fängt ihren Anteil ab – je eingestecktem Kampfwert einer Mamba ein Verlust
    let toHull = dmg;
    if (wingOf(pick) > 0) {
      const mp = SHIP_MAP[WING_CLS].combat!.power, wp = wingOf(pick) * mp * WING_EFF;
      // viele kleine Ziele ziehen mehr Feuer auf sich als ihr Kampfwert allein (Faktor 4)
      const share = (wp * 4) / (wp * 4 + p * hullOf(pick));
      pick.wingDmg = (pick.wingDmg ?? 0) + dmg * share;
      toHull = dmg * (1 - share);
      while ((pick.wingDmg ?? 0) >= mp && wingOf(pick) > 0) {
        pick.wingDmg! -= mp;
        pick.wing = wingOf(pick) - 1;
        pick.wingLost = (pick.wingLost ?? 0) + 1;
        emit({ type: 'boom', sector: h.sector, x: h.x, z: h.z, big: false });
        log(state, `${pick.name}: eine Mamba im Gefecht mit ${FOE_NAME[h.foe]} verloren – noch ${pick.wing} im Hangar.`, 'bad', false, { kind: 'sector', id: h.sector });
      }
    }
    pick.hp = hullOf(pick) - toHull / p;
    if (pick.hp <= 0) shipDown(state, pick, h);
    if (hostileHp(h) <= 0) { hostileDown(state, h, own.map((s) => s.name).join(', ')); continue; }
    // Rückzug bei hohen Verlusten
    if (FLEE_ON && hostileHp(h) < FLEE_AT[h.foe] * h.power) {
      const inc = h.incident != null ? incidentById(state, h.incident) : undefined;
      if (inc) repelRaid(state, inc.id);
      h.phase = 'leave';
      h.fighting = false;
      h.target = undefined;
      h.path = [{ sector: h.sector, x: h.x * 1.6, z: h.z * 1.6 }];
      log(state, `${FOE_NAME[h.foe]} in ${SECTOR_MAP[h.sector].name} flieht – noch ${aliveOf(h)} von ${h.n} Schiffen.`, 'good', false, { kind: 'sector', id: h.sector });
    }
  }
  const w = wrecksOf(state);
  for (let i = w.length - 1; i >= 0; i--) if (state.time >= w[i].until) w.splice(i, 1);
}

/** Reparatur eines Kampfschiffs an seiner Heimatstation (aus deren Hüllenteilen). true = repariert gerade */
export function repairAtHome(state: GameState, s: Ship, dt: number): boolean {
  if (hullOf(s) >= 1 || s.disabled) return false;
  const home = state.stations.find((x) => x.id === s.home);
  if (!home || home.sector !== s.sector || Math.hypot(home.x - s.x, home.z - s.z) > 20) return false;
  const per = (SHIP_MAP[s.cls].materials.hullparts ?? 0) * REPAIR_SHARE; // Hüllenteile für 0 → 100 %
  // große Schiffe brauchen länger (L: eine halbe Stunde, XL: eine Stunde von 0 auf 100 %)
  const step = Math.min(1 - hullOf(s), dt / (REPAIR_TIME * ({ S: 1, M: 1, L: 6, XL: 12 } as const)[SHIP_MAP[s.cls].size]));
  const need = per * step;
  if ((home.inventory.hullparts ?? 0) < need) { s.status = `Wartet auf Hüllenteile zur Reparatur (${Math.round(hullOf(s) * 100)} %)`; return true; }
  addWare(home, 'hullparts', -need);
  s.hp = Math.min(1, hullOf(s) + step);
  s.status = `Reparatur an ${home.name}: ${Math.round(hullOf(s) * 100)} %`;
  return true;
}

/**
 * Ergebnis, wenn der Spieler ein Gefecht selbst übernimmt (0–3 Sterne): ab einem Stern ist die Rotte vernichtet,
 * die beteiligten Kampfschiffe nehmen je nach Ergebnis noch Schaden (1 Stern 40 %, 2 Sterne 20 %, 3 Sterne keinen)
 */
export function resolveBattle(state: GameState, hostileId: number, stars: number, spare?: Ship): string | null {
  const h = hostileState(state).list.find((x) => x.id === hostileId);
  if (!h) return null;
  const k = Math.max(0, Math.min(3, Math.round(stars)));
  if (!k) return 'Nicht geschafft – das Gefecht läuft weiter.';
  const own = fightersAt(state, h);
  const hit = [0, 0.4, 0.2, 0][k];
  // das selbst geflogene Großkampfschiff hat seinen Schaden schon aus dem Minispiel
  for (const s of own) {
    if (s === spare) continue;
    s.hp = Math.max(0.05, hullOf(s) - hit);
  }
  hostileDown(state, h, 'dir');
  return `${FOE_NAME[h.foe]} vernichtet${hit ? ` – deine Kampfschiffe haben ${Math.round(hit * 100)} % Hülle verloren` : ' – ohne eigenen Schaden'}.`;
}

/**
 * Selbst geflogenes Gefecht: Mambas, die im Minispiel gefallen sind, fehlen danach auch im Hangar des Trägers.
 * Gibt die Zahl der verlorenen Mambas zurück.
 */
export function applyWingLosses(state: GameState, ship: Ship, lost: Partial<Record<string, number>> | undefined, foe: Hostile['foe']): number {
  const n = Math.min(wingOf(ship), Math.max(0, Math.round(lost?.mamba ?? 0)));
  if (!n) return 0;
  ship.wing = wingOf(ship) - n;
  ship.wingLost = (ship.wingLost ?? 0) + n;
  log(state, `${ship.name}: ${n === 1 ? 'eine Mamba' : `${n} Mambas`} im Gefecht mit ${FOE_NAME[foe]} verloren – noch ${ship.wing} im Hangar.`, 'bad', false, { kind: 'ship', id: ship.id });
  return n;
}

/** Schwierigkeit des Minispiels für ein Gefecht (nach Stärke der Rotte) */
export const battleLevel = (h: Hostile): 1 | 2 | 3 => (h.power < 200 ? 1 : h.power < 400 ? 2 : 3);

/**
 * Wrack bergen (Ergebnis des Bergungs-Einsatzes, 0–3 Sterne): Schrott als Hüllenteile in die eigene Station mit dem
 * meisten Platz im Sektor, sonst in die erste Station
 */
export function salvageWreck(state: GameState, wreckId: number, stars: number): string | null {
  const w = wrecksOf(state);
  const i = w.findIndex((x) => x.id === wreckId);
  if (i < 0) return null;
  const k = Math.max(0, Math.min(3, Math.round(stars)));
  if (!k) return 'Nichts geborgen – das Wrack liegt noch da.';
  const wr = w[i];
  const cand = state.stations.filter((st) => st.sector === wr.sector);
  const st = (cand.length ? cand : state.stations).slice().sort((a, b) => freeUnits(b, 'hullparts') - freeUnits(a, 'hullparts'))[0];
  w.splice(i, 1);
  if (!st) return 'Keine Station, die den Schrott annehmen könnte.';
  const n = Math.min(Math.round(wr.scrap * [0, 0.5, 0.8, 1][k]), Math.floor(freeUnits(st, 'hullparts')));
  if (n > 0) addWare(st, 'hullparts', n);
  const msg = n > 0 ? `${wr.name} geborgen: ${n} Hüllenteile nach ${st.name}.` : `${wr.name} geborgen, aber ${st.name} hat keinen Platz für Hüllenteile.`;
  log(state, msg, n > 0 ? 'good' : 'info', false, { kind: 'station', id: st.id });
  return msg;
}
