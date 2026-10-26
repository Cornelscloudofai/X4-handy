// Entwicklungswerkzeug Gegnerstärke: Schieberegler für Hülle und Schild aller Gegner und eine Tabelle mit den Werten,
// die im Spiel herauskommen. Steht im Minispiel-Menü (Reiter Kampf) und im Pausenmenü eines laufenden Kampfs.
import { esc } from '../ui/dom';
import type { Level } from './common';
import { enemyTune, tuneToSlider, type EnemyTune } from './loadout';
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
export function tunePanel(level: Level, o: { levelPicker?: string; reset: string; note: string }): string {
  const t = enemyTune();
  const slider = (key: 'hull' | 'shield', label: string) => `<div class="tune-row"><span class="tune-label">${label}</span>
    <input type="range" min="0" max="1000" step="1" value="${tuneToSlider(t[key])}" data-change="enemy-tune" data-key="${key}" aria-label="${label}-Faktor">
    <b class="tune-val" data-key="${key}">${tuneValue(t[key])}</b></div>`;
  return `<div class="section tune-panel"><h3>Entwicklung: Gegnerstärke</h3>
    ${slider('hull', 'Hülle')}${slider('shield', 'Schild')}
    ${o.levelPicker ?? `<div class="small muted" style="margin:10px 0 0">Werte im Spiel auf Stufe ${level}</div>`}
    <table class="tune-table"><thead><tr><th>Gegner</th><th>Hülle</th><th>Schild</th><th>Zusammen</th></tr></thead><tbody class="tune-body">${tuneRows(level, t)}</tbody></table>
    <p class="small muted" style="margin:8px 0 0">${o.note}</p>
    <button class="btn" style="margin-top:8px" ${o.reset} ${t.hull === 1 && t.shield === 1 ? 'hidden' : ''} data-tune-reset>Auf ×1 zurücksetzen</button></div>`;
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
