// Entwicklungswerkzeug Gegnerstärke: Schieberegler für Hülle und Schild aller Gegner und eine Tabelle mit den Werten,
// die im Spiel herauskommen. Steht im Minispiel-Menü (Reiter Kampf) und im Pausenmenü eines laufenden Kampfs.
import { esc } from '../ui/dom';
import type { Level } from './common';
import { broodTest, envTest, modsOff, paleBackdrop, enemyTune, fogTest, tuneToSlider, type EnemyTune } from './loadout';
export { tuneFromSlider, tuneToSlider } from './loadout';
import { enemyStatTable } from './shooterData';

const fmt = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Zeilen der Tabelle (werden beim Schieben einzeln ausgetauscht, damit der Regler nicht neu gebaut wird) */
export function tuneRows(level: Level, t: EnemyTune = enemyTune()): string {
  return enemyStatTable(level, t).map((r) => `<tr><td>${esc(r.name)}</td><td>${Math.round(r.hp)}</td><td>${Math.round(r.sh)}</td><td>${Math.round(r.hp + r.sh)}</td></tr>`).join('');
}

export function tuneValue(v: number): string {
  return `×${v >= 10 ? v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : fmt(v)}`;
}

/**
 * Ganzer Abschnitt; levelPicker: Knöpfe zur Wahl der Stufe (Menü) oder leer (Pause: Stufe der laufenden Runde);
 * reset: Attribut für den Zurücksetzen-Knopf; note: Hinweis unter der Tabelle
 */
export function tunePanel(level: Level, o: { levelPicker?: string; reset: string; fog: string; brood?: string; env?: (v: string) => string; pale?: string; mods?: string; note: string }): string {
  const t = enemyTune();
  const slider = (key: 'hull' | 'shield', label: string) => `<div class="tune-row"><span class="tune-label">${label}</span>
    <input type="range" min="0" max="1000" step="1" value="${tuneToSlider(t[key])}" data-change="enemy-tune" data-key="${key}" aria-label="${label}-Faktor">
    <b class="tune-val" data-key="${key}">${tuneValue(t[key])}</b></div>`;
  return `<div class="section tune-panel"><h3>Entwicklung: Gegnerstärke</h3>
    ${slider('hull', 'Hülle')}${slider('shield', 'Schild')}
    ${o.levelPicker ?? `<div class="small muted" style="margin:10px 0 0">Werte im Spiel auf Stufe ${level}</div>`}
    <table class="tune-table"><thead><tr><th>Gegner</th><th>Hülle</th><th>Schild</th><th>Zusammen</th></tr></thead><tbody class="tune-body">${tuneRows(level, t)}</tbody></table>
    <p class="small muted" style="margin:8px 0 0">${o.note}</p>
    <button class="btn" style="margin-top:8px" ${o.reset} ${t.hull === 1 && t.shield === 1 ? 'hidden' : ''} data-tune-reset>Auf ×1 zurücksetzen</button>
    <div class="row" style="margin-top:12px;gap:10px;align-items:center"><div class="grow"><div class="title" style="font-weight:500">Test: Nebel in jeder Welle</div>
      <div class="sub wrap">Sonst kommt ein Nebelfeld nur zufällig ab der dritten Welle.</div></div>
      <div class="toggle"><button class="plain ${fogTest() ? 'on' : ''}" ${o.fog} data-fog-test>${fogTest() ? 'An' : 'Aus'}</button></div></div>
    ${o.brood ? `<div class="row" style="margin-top:12px;gap:10px;align-items:center"><div class="grow"><div class="title" style="font-weight:500">Test: Brutschiff ab Welle 1</div>
      <div class="sub wrap">Kha'ak-Runden: ein Brutschiff liegt von Anfang an am Kartenrand und brütet sofort. Gilt ab dem nächsten Start.</div></div>
      <div class="toggle"><button class="plain ${broodTest() ? 'on' : ''}" ${o.brood}>${broodTest() ? 'An' : 'Aus'}</button></div></div>` : ''}
    ${o.env ? `<div class="title" style="font-weight:500;margin-top:12px">Test: Umgebung in jeder Welle ab Welle 1</div>
      <div class="segment" style="margin-top:6px">${([['', 'Zufall'], ['wracks', 'Wracks'], ['anomalie', 'Anomalie'], ['rocks', 'Felsen'], ['mines', 'Minen']] as const).map(([v, l]) => `<button class="${envTest() === v ? 'on' : ''}" ${o.env!(v)}>${l}</button>`).join('')}</div>` : ''}
    ${o.pale ? `<div class="row" style="margin-top:12px;gap:10px;align-items:center"><div class="grow"><div class="title" style="font-weight:500">Test: Kulisse blasser</div>
      <div class="sub wrap">Hintergrund-Objekte im Kampf dunkler, weicher und dunstiger – zum Vergleich, ob sich die Spielebene besser abhebt.</div></div>
      <div class="toggle"><button class="plain ${paleBackdrop() ? 'on' : ''}" ${o.pale}>${paleBackdrop() ? 'An' : 'Aus'}</button></div></div>` : ''}
    ${o.mods ? `<div class="row" style="margin-top:12px;gap:10px;align-items:center"><div class="grow"><div class="title" style="font-weight:500">Test: Mods aus</div>
      <div class="sub wrap">Eingebaute Mods wirken im Kampf nicht (bleiben eingebaut) – Waffen und Türme mit ihren Grundwerten vergleichen. Gilt ab dem nächsten Kampf.</div></div>
      <div class="toggle"><button class="plain ${modsOff() ? 'on' : ''}" ${o.mods}>${modsOff() ? 'An' : 'Aus'}</button></div></div>` : ''}</div>`;
}

/** Regler bewegt: Faktorangabe, Tabelle und Zurücksetzen-Knopf im selben Abschnitt nachführen */
export function refreshTunePanel(root: ParentNode, level: Level): void {
  const t = enemyTune();
  for (const el of root.querySelectorAll<HTMLElement>('.tune-val')) el.textContent = tuneValue(el.dataset.key === 'shield' ? t.shield : t.hull);
  const body = root.querySelector('.tune-body');
  if (body) body.innerHTML = tuneRows(level, t);
  const reset = root.querySelector<HTMLElement>('[data-tune-reset]');
  if (reset) reset.hidden = t.hull === 1 && t.shield === 1;
}
