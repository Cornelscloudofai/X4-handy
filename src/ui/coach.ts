// Geführte erste Schritte: Ein pulsierender Rahmen und eine Sprechblase zeigen, was als Nächstes anzutippen ist.
// Die Schritte ergeben sich aus dem Spielstand – wer anders vorgeht, bekommt trotzdem den passenden Hinweis.
import { WARES } from '../data/wares';
import { buildDemand, buildMoveLimits } from '../engine/economy';
import { currentMission, missionComplete } from '../engine/story';
import type { GameState } from '../engine/types';
import { esc } from './dom';
import type { UIState } from './uistate';

export interface CoachStep {
  id: string;
  /** CSS-Selektor des Ziels; null = Blase mittig ohne Ziel */
  sel: string | null;
  text: string;
  /** Mit „Weiter“-Knopf: Schritt gilt nach dem Antippen als gesehen */
  next?: boolean;
  /** Aktion, die den Schritt erledigt (z. B. Tempo geändert) */
  doneOn?: string;
}

const act = (a: string, data: Record<string, string> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

export function coachSeen(state: GameState, id: string): boolean {
  return !!state.help?.seen?.includes(id);
}

export function markCoachSeen(state: GameState, id: string): void {
  state.help ??= {};
  state.help.seen = [...new Set([...(state.help.seen ?? []), id])];
}

/** Erledigt Schritte, die auf eine bestimmte Aktion warten */
export function coachNotify(state: GameState, ui: UIState, action: string): void {
  const s = coachStep(state, ui);
  if (s?.doneOn === action) markCoachSeen(state, s.id);
}

/** Schiff kaufen: Weg über Flotte → Kaufdialog → passendes Schiff */
function buyShipStep(ui: UIState, id: string, cls: string, intro: string, buy: string): CoachStep {
  if (ui.modal?.type === 'buyShip') return { id: id + '-buy', sel: `#modal [data-act="buyship"][data-cls="${cls}"]`, text: buy };
  if (ui.modal) return { id: id + '-wait', sel: null, text: '' };
  if (ui.panel?.type === 'station' && ui.panel.tab === 'ships') return { id: id + '-open', sel: '#panel [data-act="buyship-modal"]', text: 'Hier kaufst du Schiffe für diese Station.' };
  if (ui.panel?.type === 'fleet') return { id: id + '-open', sel: '#panel [data-act="buyship-modal"]', text: 'Tippe auf „Schiff kaufen“.' };
  return { id: id + '-nav', sel: '#nav [data-tab="fleet"]', text: intro };
}

export function coachStep(state: GameState, ui: UIState): CoachStep | null {
  const st0 = state.stations[0];
  if (state.help?.coachOff || !st0 || ui.view === 'galaxy' || ui.placing || ui.modal?.type === 'help') return null;
  const m = currentMission(state);
  if (!m) return null;
  // Belohnung abholen hat Vorrang – in den ersten Kapiteln mit Hinweis
  if (state.story.index <= 4 && missionComplete(state)) {
    if (ui.panel?.type === 'missions') return { id: 'claim', sel: '#panel [data-act="claim"]', text: 'Ziel erreicht! Hol dir die Belohnung ab – danach beginnt das nächste Kapitel.' };
    if (ui.modal) return { id: 'claim-close', sel: '#modal .modal-foot [data-act="modal-close"]', text: 'Ziel erreicht! Schließe den Dialog – dann holst du die Belohnung ab.' };
    if (!ui.panel) return { id: 'claim-open', sel: '#objective .objective', text: 'Kapitel geschafft. Tippe hier, um die Belohnung abzuholen.' };
    return { id: 'claim-nav', sel: '#nav [data-tab="missions"]', text: 'Kapitel geschafft! Unter „Aufträge“ holst du die Belohnung ab.' };
  }
  if (m.id === 'refinery') {
    const queued = st0.queue.some((q) => q.def === 'prod_refinedmetals') || st0.build?.def === 'prod_refinedmetals';
    if (!queued) {
      if (ui.modal?.type === 'modules') return { id: 'ref-pick', sel: '#modal [data-act="queue"][data-def="prod_refinedmetals"]', text: 'Die Fabrik für Veredelte Metalle macht aus Erz und Energiezellen Metall. Tippe auf „Einplanen“.' };
      if (ui.modal) return null;
      if (ui.panel?.type === 'station' && ui.panel.id === st0.id) {
        if (ui.panel.tab === 'modules') return { id: 'ref-add', sel: '#panel [data-act="modal-modules"]', text: 'Hier planst du neue Module ein. Tippe auf „Modul einplanen“.' };
        return { id: 'ref-tab', sel: '#panel .tabs [data-tab="modules"]', text: 'Bauen geht im Reiter „Module“.' };
      }
      if (ui.panel?.type === 'stations') return { id: 'ref-station', sel: `#panel [data-act="open-station"][data-id="${st0.id}"]`, text: 'Das ist deine erste Station. Öffne sie.' };
      return { id: 'ref-nav', sel: '#nav [data-tab="stations"]', text: 'Willkommen, Kommandant! Erste Aufgabe: eine Fabrik bauen. Tippe auf „Stationen“.' };
    }
    if (ui.modal?.type === 'modules') return { id: 'ref-done', sel: '#modal .modal-foot [data-act="modal-close"]', text: 'Eingeplant! Schließe die Auswahl mit „Fertig“.' };
    if (!coachSeen(state, 'buildstore') && ui.panel?.type === 'station' && ui.panel.tab === 'modules' && !ui.modal) {
      return { id: 'buildstore', sel: '#panel .buildstore', text: 'Das Baulager: NPC-Händler liefern hier das Baumaterial an – du siehst „x von y vorhanden“. Mit jeder Lieferung wächst das Modul ein Stück.', next: true };
    }
    // Eigene Ware fürs Baulager: einmal das Umladen zeigen
    const movable = Object.keys(buildDemand(st0)).find((id) => buildMoveLimits(st0, id).toBuild >= 1);
    if (!coachSeen(state, 'umladen')) {
      if (ui.modal?.type === 'buildMove') return { id: 'umladen', sel: '#modal [data-act="build-move"]', text: 'Den Regler kannst du verschieben. Tippe auf „Ins Baulager laden“.', doneOn: 'build-move' };
      if (movable && !ui.modal && ui.panel?.type === 'station' && ui.panel.tab === 'modules') {
        return { id: 'umladen', sel: `#panel [data-act="build-move-open"][data-ware="${movable}"]`, text: `${WARES[movable].name} hat die Station schon selbst. Lade sie per „Umladen“ ins Baulager – ohne Schiff und Einkauf.` };
      }
    }
    if (ui.modal?.type === 'buildMove') return { id: 'umladen-close', sel: '#modal .modal-foot [data-act="modal-close"]', text: 'Erledigt. Schließe den Dialog mit „Fertig“.' };
    if (!coachSeen(state, 'speed') && !ui.modal) {
      return { id: 'speed', sel: '#hud [data-act="speed"]', text: 'Bau und Lieferungen brauchen Zeit. Hier beschleunigst du das Spiel (bis ×60).', next: true, doneOn: 'speed' };
    }
    return null;
  }
  if (m.id === 'miners') {
    return buyShipStep(ui, 'miner', 'alligator_min', 'Mehr Miner bringen mehr Erz. Öffne die Flotte.', 'Der Alligator fördert Erz und Silizium. Kaufen – er fliegt dann selbst zu den Feldern.');
  }
  if (m.id === 'trader') {
    return buyShipStep(ui, 'trader', 'boa', 'Jetzt ein Transporter: Er verkauft Überschüsse und kauft ein, was fehlt. Öffne die Flotte.', 'Die Boa ist ein Transporter. Kaufen – sie handelt automatisch für ihre Heimatstation.');
  }
  if (m.id === 'graphene' && !coachSeen(state, 'finish') && !ui.modal) {
    return { id: 'finish', sel: null, text: 'Die Grundlagen sitzen: bauen, fördern, handeln. Die Kampagne unten führt dich weiter. Erklärungen zu allem findest du im Menü unter „Hilfe“ und an den kleinen „?“-Knöpfen.', next: true };
  }
  return null;
}

let lastStep = '';

/** Rahmen und Sprechblase zeichnen (nach jedem Neuaufbau der Oberfläche) */
export function renderCoach(state: GameState, ui: UIState): void {
  let host = document.getElementById('coach');
  if (!host) {
    host = document.createElement('div');
    host.id = 'coach';
    document.getElementById('app')?.appendChild(host);
  }
  const step = coachStep(state, ui);
  const target = step?.sel ? (document.querySelector(step.sel) as HTMLElement | null) : null;
  const rect = target?.getBoundingClientRect();
  const visible = !!rect && rect.width > 0 && rect.height > 0;
  if (!step || !step.text || (step.sel && !visible)) {
    host.hidden = true;
    lastStep = step?.id ?? '';
    return;
  }
  // Neues Ziel außerhalb des sichtbaren Bereichs: einmal hinscrollen
  if (target && step.id !== lastStep && (rect!.top < 60 || rect!.bottom > window.innerHeight - 80)) {
    target.scrollIntoView({ block: 'center' });
  }
  lastStep = step.id;
  const r = target?.getBoundingClientRect();
  const pad = 6;
  const ring = r ? `<div class="coach-ring" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '';
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(320, vw - 32);
  let style: string;
  let arrow = '';
  if (r) {
    const left = Math.max(16, Math.min(vw - w - 16, r.left + r.width / 2 - w / 2));
    const ax = Math.max(18, Math.min(w - 18, r.left + r.width / 2 - left));
    const below = r.bottom + 170 < vh || r.top < 190;
    style = below ? `left:${left}px;top:${r.bottom + pad + 12}px;width:${w}px` : `left:${left}px;bottom:${vh - r.top + pad + 12}px;width:${w}px`;
    arrow = `<i class="coach-arrow ${below ? 'up' : 'down'}" style="left:${ax}px"></i>`;
  } else {
    style = `left:${(vw - w) / 2}px;top:${Math.max(80, vh / 2 - 110)}px;width:${w}px`;
  }
  const buttons = `<div class="coach-actions"><button class="linkish" ${act('coach-off')}>Hilfe ausblenden</button>${step.next ? `<button class="btn small primary" ${act('coach-next', { id: step.id })}>Weiter</button>` : ''}</div>`;
  const html = `${ring}<div class="coach-bubble" role="note" style="${style}">${arrow}<p>${esc(step.text)}</p>${buttons}</div>`;
  if (host.innerHTML !== html) host.innerHTML = html;
  host.hidden = false;
}
