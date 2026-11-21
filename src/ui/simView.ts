// Simulator: Übersicht (Heute-Leiste, Reiter Arbeit und Kampf) und eine Spielseite je Spiel bzw. Einsatz mit eigener
// Stufe, Modus, Abzeichen und Start. Einstellungen zur Steuerung stehen in den Einstellungen, Entwicklerwerkzeuge in der
// Wartung der Einsatzzentrale.
import type { Level } from '../minigames/common';
import { MINI_INFO, MINI_KINDS, dailyOpts, goalsOf, mutatorsOf, type MiniKind } from '../minigames/host';
import { SHIPS, loadout, loadoutLabel } from '../minigames/loadout';
import { MISSIONS, MISSION_IDS, recordKey, type Mission } from '../minigames/missions';
import { modState } from '../minigames/mods';
import { musicFx } from '../audio/rhythm';
import { UNLOCK, best, bestPoints, dailyBest, hasBadge, totalStars, unlocked } from '../minigames/records';
import { esc } from './dom';
import { icon } from './icons';
import { artPic, artStyle } from './menuArt';

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

export type SimTab = 'work' | 'combat';
export type SimMission = Mission;
export interface SimHome { type: 'minigames'; tab?: SimTab }
export interface SimGame { type: 'mgGame'; kind: MiniKind; mission?: SimMission; level: Level }

export const COMBAT_KINDS: MiniKind[] = ['pirates', 'xenon', 'khaak'];
export const WORK_KINDS: MiniKind[] = MINI_KINDS.filter((k) => !COMBAT_KINDS.includes(k));
const SIDE_NAME: Record<string, string> = { pirates: 'Piraten', xenon: 'Xenon', khaak: 'Kha’ak' };
const LEVELS = [1, 2, 3, 4, 5] as const;

/** Endlos-Varianten: mit Frachter (Geleitschutz) und ohne (Überleben) */
const ENDLESS: [SimMission, string, string][] = [
  ['ueberleben', 'Endloses Überleben', 'Nur dein Jäger – Welle um Welle aus allen Richtungen, bis du fällst'],
  ['geleit', 'Endloser Geleitschutz', 'Der Frachter fliegt weiter, zwischen den Wellen wird er etwas repariert'],
];

/** Ausrüstungsstufe des Jägers im Simulator (Entwicklerwerkzeug, Wartung) */
let gear: 1 | 2 | 3 = 1;
export const simGear = () => gear;
export const setSimGear = (g: 1 | 2 | 3) => { gear = g; };

const pts = (n: number) => Math.round(n).toLocaleString('de-DE');
const starRow = (n: number) => `<span class="mg-best" aria-label="${Math.max(0, n)} von 3 Sternen">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;

/** Geleitschutz ist der Grundeinsatz (eigene Rekorde je Gegnerseite) und steht als erster in der Liste */
const GELEIT = { name: 'Geleitschutz', sub: 'Den Frachter bis zum Sprungtor bringen – die Gegner greifen in Wellen an', sides: COMBAT_KINDS };
const missionInfo = (id: SimMission) => (id === 'geleit' ? GELEIT : MISSIONS[id]);
const MISSION_LIST: SimMission[] = ['geleit', 'ueberleben', ...MISSION_IDS.filter((m) => m !== 'ueberleben')];
/** Vorschaubild je Einsatz (Motiv aus den vorhandenen Menübildern) */
const MISSION_ART: Record<SimMission, string> = { ueberleben: 'xenon', geleit: 'orbit', station: 'pipes', konvoi: 'cargo', flucht: 'highway', bergung: 'ore', ueberfall: 'pirates', nest: 'khaak' };

/** Sterne eines Einsatzes über alle Gegnerseiten und Stufen */
function missionStars(id: SimMission): number {
  return missionInfo(id).sides.reduce((n, k) => n + LEVELS.reduce((m, l) => m + (best(recordKey(k, id), l)?.stars ?? 0), 0), 0);
}

/** Nächster sinnvoller Schritt: niedrigste freie Stufe ohne drei Sterne, sonst die höchste freie */
export function nextLevel(kind: MiniKind, mission?: SimMission): Level {
  const key = recordKey(kind, mission);
  const open = LEVELS.filter((l) => unlocked(kind, l));
  return open.find((l) => (best(key, l)?.stars ?? 0) < 3) ?? open[open.length - 1] ?? 1;
}

/** Fortschritt über die fünf Stufen als Punktreihe (Sterne je Stufe) */
function levelDots(key: string, kind: MiniKind): string {
  return `<span class="sim-dots">${LEVELS.map((l) => {
    const s = best(key, l)?.stars ?? 0;
    return `<i class="${!unlocked(kind, l) ? 'lock' : s >= 3 ? 'full' : s > 0 ? 'part' : ''}"></i>`;
  }).join('')}</span>`;
}

export function simHomeHtml(m: SimHome): string {
  const tab = m.tab ?? 'work';
  const allStars = MINI_KINDS.reduce((n, k) => n + totalStars(k), 0);
  const hero = `<div class="page-hero sim-hero" style="${artStyle('more-games')}">${artPic('more-games', 'page-hero-art')}<div><b>★ ${allStars} von ${MINI_KINDS.length * 15}</b><span>${modState().parts} Modteile · Training ohne Folgen für den Sektor</span></div></div>`;
  // Heute: je Spiel eine feste Runde (Stufe 3 mit Besonderheit), waagerecht wischbar
  const today = MINI_KINDS.map((k) => {
    const mu = mutatorsOf(k).find((x) => x.id === dailyOpts(k).mutator), db = dailyBest(k);
    return `<button class="sim-day ${db != null ? 'done' : ''}" ${act('mg-daily', { kind: k })} style="${artStyle(k)}">${artPic(k, 'sim-day-art')}
      <span class="sim-day-txt"><b>${esc(MINI_INFO[k].name)}</b><small>${mu ? esc(mu.name) : 'Stufe 3'}</small><em>${db != null ? `${icon('check', 12)} ${pts(db)}` : 'offen'}</em></span></button>`;
  }).join('');
  const done = MINI_KINDS.filter((k) => dailyBest(k) != null).length;
  const heute = `<div class="section"><h3>Heute · ${done} von ${MINI_KINDS.length} gespielt</h3><div class="sim-today">${today}</div></div>`;
  const tabs = `<div class="segment mg-tabs">${([['work', 'Arbeit'], ['combat', 'Kampf']] as const).map(([id, l]) => `<button class="${tab === id ? 'on' : ''}" ${act('mg-tab', { tab: id })}>${l}</button>`).join('')}</div>`;
  const tile = (k: MiniKind, extra = '') => `<button class="sim-tile" ${act('mg-game', { kind: k })}>${artPic(k, 'sim-tile-art')}
    <span class="sim-tile-txt"><b>${esc(MINI_INFO[k].name)}</b><small>★ ${totalStars(k)}/15${extra}</small>${levelDots(k, k)}</span></button>`;
  const work = `<div class="section"><div class="sim-grid">${WORK_KINDS.map((k) => tile(k)).join('')}</div>
    <p class="small muted" style="margin:10px 0 0">Antippen öffnet die Spielseite mit Stufe, Rekorden und Abzeichen. Mit Sternen schaltest du je Spiel Stufe 4 und 5 frei.</p></div>`;
  const ship = SHIPS[loadout().ship];
  const combat = `<div class="section"><h3>Dein Schiff</h3><div class="box rows"><div class="row tap" ${act('loadout-open')}>${icon('fighter', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(ship.name)} – ${esc(ship.role)}</div><div class="sub wrap">${esc(loadoutLabel())}</div></div><span class="small muted">Hangar</span>${icon('chev', 20, 'chev')}</div></div></div>
    <div class="section"><h3>Einsätze</h3><div class="box rows">${MISSION_LIST.map((id) => {
      const mi = missionInfo(id), max = mi.sides.length * 15;
      return `<div class="row tap mg-mission" ${act('mg-game', { kind: mi.sides[0], mission: id })}>${artPic(MISSION_ART[id], 'mg-thumb')}<div class="grow"><div class="title" style="font-weight:500">${esc(mi.name)}</div><div class="sub wrap">${esc(mi.sub)}</div><div class="sub">${mi.sides.map((k) => SIDE_NAME[k]).join(' · ')} · ★ ${missionStars(id)}/${max}</div></div>${icon('chev', 20, 'chev')}</div>`;
    }).join('')}</div></div>
    <div class="section"><h3>Endlos</h3><div class="box rows">${ENDLESS.map(([mission, name, sub]) => `<div class="row sim-endless"><div class="grow"><div class="title" style="font-weight:500">${name}</div><div class="sub wrap">${sub}</div>
      <div class="mg-sides">${COMBAT_KINDS.map((k) => { const bp = bestPoints(recordKey(k, mission), 'endless'); return `<button class="mg-side ${k}" ${act('mg-mode', { kind: k, mode: 'endless', mission })}><b>${SIDE_NAME[k]}</b><small>${bp ? `Rekord ${pts(bp)}` : 'kein Rekord'}</small></button>`; }).join('')}</div></div></div>`).join('')}</div></div>`;
  return hero + heute + tabs + (tab === 'combat' ? combat : work);
}

export function simGameHtml(m: SimGame): { title: string; eyebrow: string; body: string } {
  const { kind, mission } = m, info = MINI_INFO[kind], combat = COMBAT_KINDS.includes(kind);
  const key = recordKey(kind, mission), lvl = m.level, open = unlocked(kind, lvl), b = best(key, lvl);
  const mi = mission ? missionInfo(mission) : null, escort = !mission || mission === 'geleit';
  const title = mi ? mi.name : info.name;
  const hero = `<div class="page-hero sim-page-hero" style="${artStyle(kind)}">${artPic(kind, 'page-hero-art')}<div><b>${esc(title)}</b><span>${esc(mi && mission !== 'geleit' ? mi.sub : info.sub.replace(/^Kampf: /, ''))}</span></div></div>`;
  const sides = mi && mi.sides.length > 1 ? `<div class="section"><h3>Gegner</h3><div class="segment">${mi.sides.map((k) => `<button class="${k === kind ? 'on' : ''}" ${act('mg-side', { kind: k })}>${SIDE_NAME[k]}</button>`).join('')}</div></div>` : '';
  const levels = `<div class="section"><h3>Stufe</h3><div class="sim-levels">${LEVELS.map((l) => {
    const ok = unlocked(kind, l), s = best(key, l)?.stars ?? 0;
    return `<button class="sim-lv ${l === lvl ? 'on' : ''} ${ok ? '' : 'locked'}" ${act('mg-level', { level: l })} aria-pressed="${l === lvl}"><b>${l}</b>${ok ? starRow(s) : icon('lock', 13)}</button>`;
  }).join('')}</div>
    <p class="small muted sim-lv-info">${open ? (b ? `Rekord ${pts(b.points)} Punkte · ${b.stars} von 3 Sternen` : 'Noch nicht gespielt') : `Gesperrt: ab ${UNLOCK[lvl]} Sternen in ${esc(info.name)} – noch ${UNLOCK[lvl] - totalStars(kind)}`}</p></div>`;
  const start = `<button class="btn primary sim-start" ${open ? act('mg-play', { kind, ...(mission && mission !== 'geleit' ? { mission } : {}) }) : 'disabled'}>${icon('play', 18)}${open ? `Starten · Stufe ${lvl}` : 'Stufe gesperrt'}</button>`;
  const ship = combat ? `<div class="section"><div class="box rows"><div class="row tap" ${act('loadout-open')}>${icon('fighter', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(SHIPS[loadout().ship].name)}</div><div class="sub wrap">${esc(loadoutLabel())}</div></div><span class="small muted">Hangar</span>${icon('chev', 20, 'chev')}</div></div></div>` : '';
  // weitere Modi: Leitungskette bzw. Endlos, Tagesaufgabe dieses Spiels
  const survive = mission === 'ueberleben';
  const modeTxt = survive ? 'Endloses Überleben: Welle um Welle, bis du fällst' : escort ? info.chain ?? info.endless : undefined;
  const modeKey = survive ? recordKey(kind, 'ueberleben') : kind;
  const mu = mutatorsOf(kind).find((x) => x.id === dailyOpts(kind).mutator), db = dailyBest(kind);
  const modes = !escort && !survive ? '' : `<div class="section"><h3>Weitere Runden</h3><div class="box rows">
    ${survive ? '' : `<div class="row tap" ${act('mg-daily', { kind })}>${icon('clock', 20)}<div class="grow"><div class="title" style="font-weight:500">Tagesaufgabe</div><div class="sub">Stufe 3${mu ? ` · ${esc(mu.name)}` : ''} · ${db != null ? `heute ${pts(db)} Punkte` : 'heute noch offen'}</div></div>${icon('play', 18, 'chev')}</div>`}
    ${modeTxt ? `<div class="row tap" ${act('mg-mode', { kind, mode: info.chain ? 'chain' : 'endless', ...(survive ? { mission: 'ueberleben' } : {}) })}>${icon(info.chain ? 'routes' : 'target', 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(modeTxt.split(':')[0])}</div><div class="sub wrap">${esc(modeTxt.split(':')[1]?.trim() ?? '')}${bestPoints(modeKey, info.chain ? 'chain' : 'endless') ? ` · Rekord ${pts(bestPoints(modeKey, info.chain ? 'chain' : 'endless'))}` : ''}</div></div>${icon('play', 18, 'chev')}</div>` : ''}
  </div></div>`;
  const goals = !escort ? '' : `<div class="section"><h3>Abzeichen</h3><div class="box rows">${goalsOf(kind).map((g) => `<div class="row sim-goal ${hasBadge(kind, g.id) ? 'got' : ''}">${icon(hasBadge(kind, g.id) ? 'check' : 'star', 18)}<div class="grow"><div class="sub wrap">${esc(g.text)}</div></div></div>`).join('')}</div></div>`;
  const music = kind === 'gas' ? `<div class="section"><h3>Musik-Effekte</h3><div class="segment">${([true, false] as const).map((on) => `<button class="${musicFx() === on ? 'on' : ''}" ${act('mg-musicfx', { on: on ? '1' : '0' })}>${on ? 'An' : 'Aus'}</button>`).join('')}</div>
    <p class="small muted" style="margin:8px 0 0">Gasflocken glitzern auf dem Schlag, der Nebel atmet mit dem Bass, im kräftigen Teil ein Lichtschauer.</p></div>` : '';
  return { title, eyebrow: `Simulator · ${combat ? 'Einsatz' : 'Arbeit'}`, body: hero + sides + levels + start + ship + modes + music + goals };
}
