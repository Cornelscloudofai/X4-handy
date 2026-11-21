// Einsatzzentrale: ein gemalter Raum, in dem man sich durch Wischen umsieht. Vier Orte sind antippbar – Simulatorkapseln
// (Minispiele), Lagewand (echte Lage im Sektor), Hangartor (Schiffe und Ausrüstung), Wartungsklappe (Entwicklung).
// Pfeile am Rand nennen Orte außerhalb des Bildausschnitts, die Leiste unten führt ohne Suchen zu jedem Ort.
import raum from '../assets/zentrale/raum.jpg';
import { FOE_NAME, hostileState } from '../engine/hostiles';
import { incidentText } from '../engine/incidents';
import { SECTOR_MAP } from '../data/sectors';
import type { GameState } from '../engine/types';
import { MINI_KINDS } from '../minigames/host';
import { modState } from '../minigames/mods';
import { totalStars } from '../minigames/records';
import { SHIPS, loadout } from '../minigames/loadout';
import { esc } from './dom';
import { icon } from './icons';

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

/** Seitenverhältnis des Raumbilds (1912 × 823) */
export const ROOM_RATIO = 1912 / 823;

/** Orte im Raum: Fläche im Bild (Anteile), Ziel, Symbol */
export const SPOTS = [
  { id: 'dev', name: 'Wartung', sub: 'Entwicklerwerkzeuge', act: 'z-dev', icon: 'wrench', box: [0.004, 0.48, 0.076, 0.79] },
  { id: 'sim', name: 'Simulator', sub: '', act: 'z-sim', icon: 'game', box: [0.085, 0.24, 0.39, 0.81] },
  { id: 'lage', name: 'Lagewand', sub: '', act: 'z-lage', icon: 'warn', box: [0.395, 0.29, 0.715, 0.73] },
  { id: 'hangar', name: 'Hangar', sub: '', act: 'z-hangar', icon: 'fighter', box: [0.765, 0.23, 0.995, 0.77] },
] as const;

function subOf(state: GameState, id: string): string {
  if (id === 'sim') return `${MINI_KINDS.length} Spiele · ★ ${MINI_KINDS.reduce((n, k) => n + totalStars(k), 0)}`;
  if (id === 'lage') {
    const inc = state.incidents?.open.length ?? 0, hs = hostileState(state).list.filter((h) => h.phase !== 'leave').length;
    return inc + hs ? `${inc + hs} offen` : 'Ruhig';
  }
  if (id === 'hangar') return `${SHIPS[loadout().ship].name} · ${modState().parts} Modteile`;
  return 'Entwicklerwerkzeuge';
}

export function zentraleHtml(state: GameState): string {
  const spots = SPOTS.map((s) => {
    const [l, t, r, b] = s.box, sub = subOf(state, s.id);
    const alert = s.id === 'lage' && sub !== 'Ruhig';
    return `<button class="z-spot z-${s.id} ${alert ? 'alert' : ''}" ${act(s.act)} data-spot="${s.id}" style="left:${l * 100}%;top:${t * 100}%;width:${(r - l) * 100}%;height:${(b - t) * 100}%" aria-label="${esc(s.name)}: ${esc(sub)}">
      <span class="z-label">${icon(s.icon, 15)}<b>${esc(s.name)}</b><small>${esc(sub)}</small></span></button>`;
  }).join('');
  const bar = SPOTS.map((s) => `<button class="z-quick" ${act(s.act)}>${icon(s.icon, 18)}<span>${esc(s.name)}</span></button>`).join('');
  return `<div class="zentrale" role="dialog" aria-modal="true" aria-label="Einsatzzentrale">
    <div class="z-head"><h1><span class="eyebrow">Familie · Station</span>Einsatzzentrale</h1><button class="icon-btn" ${act('modal-close')} aria-label="Schließen">${icon('close', 22)}</button></div>
    <div class="z-pan"><div class="z-room" style="background-image:url(${raum})">${spots}</div></div>
    <button class="z-edge left" aria-label="Nach links umsehen">${icon('back', 16)}<span></span></button>
    <button class="z-edge right" aria-label="Nach rechts umsehen"><span></span>${icon('chev', 16)}</button>
    <div class="z-bar">${bar}</div>
  </div>`;
}

/** Lagewand: offene Vorfälle und Gegnerrotten im Sektor – jeweils direkt übernehmen bzw. auf der Karte zeigen */
export function lageBody(state: GameState): string {
  const incs = [...(state.incidents?.open ?? [])].sort((a, b) => a.expires - b.expires);
  const hs = hostileState(state).list.filter((h) => h.phase !== 'leave');
  const left = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`);
  const incRows = incs.map((i) => {
    const t = incidentText(state, i);
    return `<div class="row">${icon(['vein', 'tide', 'freight', 'rush'].includes(i.kind) ? 'miner' : 'warn', 20, ['vein', 'tide', 'freight', 'rush'].includes(i.kind) ? 'pos' : 'warn-text')}<div class="grow"><div class="title">${esc(t.title)}</div><div class="sub wrap">${esc(t.text)} · noch ${left(Math.max(0, i.expires - state.time))}</div></div>
      <button class="btn small primary" ${act('incident-play', { id: i.id })}>Übernehmen</button></div>`;
  }).join('');
  const hRows = hs.map((h) => `<div class="row">${icon('target', 20, 'neg')}<div class="grow"><div class="title">${esc(FOE_NAME[h.foe])}</div><div class="sub">${esc(SECTOR_MAP[h.sector]?.name ?? h.sector)} · Stärke ${Math.round(h.power)}${h.fighting ? ' · im Gefecht' : ''}</div></div>
      <button class="btn small" ${act('focus', { kind: 'hostile', id: h.id })}>Auf Karte</button></div>`).join('');
  return `<p class="lead">Was im Sektor gerade los ist. Echte Einsätze haben Folgen: Credits, Schäden, verlorene Schiffe.</p>
    <div class="section"><h3>Vorfälle</h3><div class="box rows">${incRows || '<div class="row"><div class="grow"><div class="sub">Keine offenen Vorfälle.</div></div></div>'}</div></div>
    <div class="section"><h3>Gegnerrotten</h3><div class="box rows">${hRows || '<div class="row"><div class="grow"><div class="sub">Keine Gegner in deinen Sektoren.</div></div></div>'}</div></div>`;
}

/**
 * Umsehen: Raum beim ersten Öffnen auf die Lagewand ausrichten, beim Wischen die Randpfeile nachführen (Orte außerhalb
 * des Ausschnitts); Pfeil antippen schwenkt sanft zum nächsten Ort in dieser Richtung
 */
const ready = new WeakSet<HTMLElement>();

export function layoutZentrale(root: HTMLElement): void {
  const pan = root.querySelector<HTMLElement>('.z-pan'), room = root.querySelector<HTMLElement>('.z-room');
  const L = root.querySelector<HTMLElement>('.z-edge.left'), R = root.querySelector<HTMLElement>('.z-edge.right');
  if (!pan || !room || !L || !R) return;
  const mid = (s: (typeof SPOTS)[number]) => (s.box[0] + s.box[2]) / 2;
  const centerOn = (fx: number, smooth: boolean) => pan.scrollTo({ left: fx * room.offsetWidth - pan.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
  // Randpfeile: nächster Ort links bzw. rechts außerhalb des Ausschnitts (nach jedem Neuzeichnen und beim Wischen)
  const update = () => {
    const a = pan.scrollLeft / room.offsetWidth, b = (pan.scrollLeft + pan.clientWidth) / room.offsetWidth;
    const leftOf = SPOTS.filter((s) => mid(s) < a).pop(), rightOf = SPOTS.find((s) => mid(s) > b);
    L.hidden = !leftOf; R.hidden = !rightOf;
    if (leftOf) { L.querySelector('span')!.textContent = leftOf.name; L.dataset.fx = String(mid(leftOf)); }
    if (rightOf) { R.querySelector('span')!.textContent = rightOf.name; R.dataset.fx = String(mid(rightOf)); }
  };
  if (!ready.has(pan)) {
    ready.add(pan);
    centerOn(mid(SPOTS[2]), false);
    pan.addEventListener('scroll', update, { passive: true });
    for (const el of [L, R]) el.addEventListener('click', (e) => { e.stopPropagation(); centerOn(Number(el.dataset.fx), true); });
  }
  update();
}
