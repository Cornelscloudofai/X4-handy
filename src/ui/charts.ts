// Diagramme aus den Verlaufsdaten: kleine Verlaufslinien in Listen (antippbar) und die große Ansicht mit
// Zeitraum 1 h / 6 h / 24 h.
import { series } from '../engine/history';
import type { GameState } from '../engine/types';
import { esc } from './dom';
import { fmtCr } from './format';

/** level = Bestand/Preis zum Zeitpunkt; rate = Mengen je Messung, angezeigt als Summe pro Stunde */
export type ChartKind = 'level' | 'rate';
export type ChartUnit = 'cr' | 'units' | 'pct' | 'price';

export interface ChartSpec { key: string; title: string; color: string; kind: ChartKind; unit: ChartUnit; sub?: string }

const act = (name: string, data: Record<string, string | number> = {}) =>
  `data-act="${name}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ')}`;

/** Punkte für die Anzeige: Lücken überspringen, Raten als gleitende Stundensumme */
function points(state: GameState, spec: ChartSpec, hours: number): { t: number; v: number }[] {
  const pre = spec.kind === 'rate' ? 1 : 0;
  const s = series(state, spec.key, hours + pre);
  if (!s) return [];
  const out: { t: number; v: number }[] = [];
  const from = state.time - hours * 3600;
  for (let i = 0; i < s.values.length; i++) {
    const v = s.values[i];
    if (v == null || s.times[i] < from) continue;
    if (spec.kind === 'rate') {
      // Summe der letzten Stunde (12 Messungen)
      let sum = 0;
      for (let j = Math.max(0, i - 11); j <= i; j++) sum += s.values[j] ?? 0;
      out.push({ t: s.times[i], v: sum });
    } else out.push({ t: s.times[i], v });
  }
  return out;
}

export function fmtValue(v: number, unit: ChartUnit): string {
  if (unit === 'cr') return fmtCr(v);
  if (unit === 'pct') return `${Math.round(v)} %`;
  if (unit === 'price') return `${v.toLocaleString('de-DE', { maximumFractionDigits: v < 100 ? 1 : 0 })} Cr`;
  return Math.round(v).toLocaleString('de-DE');
}

function path(pts: { t: number; v: number }[], x0: number, x1: number, y0: number, y1: number, tMin: number, tMax: number, vMin: number, vMax: number): string {
  const sx = (t: number) => x0 + ((t - tMin) / (tMax - tMin || 1)) * (x1 - x0);
  const sy = (v: number) => y1 - ((v - vMin) / (vMax - vMin || 1)) * (y1 - y0);
  return pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t).toFixed(1)} ${sy(p.v).toFixed(1)}`).join(' ');
}

/** Kleine Verlaufslinie (letzte 6 Stunden), antippbar für die große Ansicht; leer bei zu wenig Daten */
export function sparkline(state: GameState, spec: ChartSpec, w = 64, h = 22): string {
  const pts = points(state, spec, 6);
  if (pts.length < 2) return '';
  let vMin = Math.min(...pts.map((p) => p.v)), vMax = Math.max(...pts.map((p) => p.v));
  if (vMax - vMin < 1e-6) { vMin -= 1; vMax += 1; }
  const d = path(pts, 1, w - 1, 2, h - 2, pts[0].t, pts[pts.length - 1].t, vMin, vMax);
  const last = pts[pts.length - 1];
  const ly = h - 2 - ((last.v - vMin) / (vMax - vMin)) * (h - 4);
  return `<button class="spark" ${act('chart', { key: spec.key, title: spec.title, color: spec.color, kind: spec.kind, unit: spec.unit, sub: spec.sub ?? '' })} aria-label="Verlauf ${esc(spec.title)}" style="--c:${spec.color}">
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d} L${w - 1} ${h} L1 ${h} Z" class="area"/><path d="${d}" class="ln"/><circle cx="${w - 1}" cy="${ly.toFixed(1)}" r="2"/></svg></button>`;
}

/** Große Ansicht mit Achsen, Kennzahlen und Zeitraumwahl */
export function bigChart(state: GameState, spec: ChartSpec, hours: number): string {
  const pts = points(state, spec, hours);
  const W = 340, Hh = 200, L = 46, R = 8, T = 10, B = 24;
  const range = `<div class="segment chart-range">${[1, 6, 24].map((hh) => `<button class="${hh === hours ? 'on' : ''}" ${act('chart-range', { hours: hh })}>${hh} h</button>`).join('')}</div>`;
  if (pts.length < 2) return `${range}<div class="empty">Noch zu wenig Daten – alle 5 Spielminuten kommt ein Messpunkt dazu.</div>`;
  const vals = pts.map((p) => p.v);
  let vMin = Math.min(...vals), vMax = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  // Bestände und Raten ab 0 zeigen, Preise eng um den Verlauf
  if (spec.unit !== 'price' && vMin > 0 && vMin < vMax * 0.6) vMin = 0;
  if (vMax - vMin < 1e-6) { vMin -= 1; vMax += 1; }
  const pad = (vMax - vMin) * 0.08;
  vMax += pad;
  if (spec.unit === 'price' || vMin < 0) vMin -= pad;
  const tMax = state.time, tMin = tMax - hours * 3600;
  const d = path(pts, L, W - R, T, Hh - B, tMin, tMax, vMin, vMax);
  const sy = (v: number) => Hh - B - ((v - vMin) / (vMax - vMin)) * (Hh - B - T);
  const grid = [0, 0.5, 1].map((f) => {
    const v = vMin + (vMax - vMin) * f, y = sy(v);
    return `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${esc(fmtValue(v, spec.unit))}</text>`;
  }).join('');
  const xl = [0, 0.5, 1].map((f) => {
    const x = L + (W - R - L) * f;
    const hAgo = hours * (1 - f);
    return `<text x="${x.toFixed(1)}" y="${Hh - 6}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${f === 1 ? 'jetzt' : `−${hAgo % 1 ? hAgo.toFixed(1).replace('.', ',') : hAgo} h`}</text>`;
  }).join('');
  const first = pts[0].t;
  const last = pts[pts.length - 1];
  const lx = L + ((last.t - tMin) / (tMax - tMin)) * (W - R - L);
  const area = `${d} L${lx.toFixed(1)} ${Hh - B} L${(L + ((first - tMin) / (tMax - tMin)) * (W - R - L)).toFixed(1)} ${Hh - B} Z`;
  const change = vals[vals.length - 1] - vals[0];
  const stat = (label: string, v: string) => `<div><small>${label}</small><b class="num">${v}</b></div>`;
  return `${range}
    <div class="chart-now" style="--c:${spec.color}"><b class="num">${esc(fmtValue(last.v, spec.unit))}</b>${spec.kind === 'rate' ? '<span>pro Stunde</span>' : ''}
      <span class="${change > 0 ? 'pos' : change < 0 ? 'neg' : 'muted'}">${change > 0 ? '▲' : change < 0 ? '▼' : '■'} ${esc(fmtValue(Math.abs(change), spec.unit))} in ${hours} h</span></div>
    <svg class="bigchart" viewBox="0 0 ${W} ${Hh}" style="--c:${spec.color}" role="img" aria-label="Verlauf ${esc(spec.title)}">${grid}${xl}<path d="${area}" class="area"/><path d="${d}" class="ln"/><circle cx="${lx.toFixed(1)}" cy="${sy(last.v).toFixed(1)}" r="3.5"/></svg>
    <div class="chart-stats">${stat('Tief', fmtValue(Math.min(...vals), spec.unit))}${stat('Schnitt', fmtValue(avg, spec.unit))}${stat('Hoch', fmtValue(Math.max(...vals), spec.unit))}</div>`;
}
