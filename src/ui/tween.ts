// Gleitende Zahlen: Elemente mit data-tween="<Wert>" und data-fmt="int|amount|cr|pct" zählen beim Aktualisieren
// in ~0,45 s vom angezeigten zum neuen Wert. Ohne Animationen (Einstellung) springt der Wert sofort.
import { setTweenHook } from './dom';
import { fmtAmount, fmtCr, fmtInt, pct } from './format';

interface Run { from: number; to: number; start: number; fmt: string }

const shown = new WeakMap<Element, number>();
const runs = new Map<HTMLElement, Run>();
let enabled = () => true;
let raf = 0;
const DUR = 450;

function format(v: number, fmt: string): string {
  if (fmt === 'cr') return fmtCr(v);
  if (fmt === 'pct') return pct(v);
  if (fmt === 'amount') return fmtAmount(v);
  return fmtInt(v);
}

function tick(now: number): void {
  raf = 0;
  for (const [el, r] of runs) {
    if (!el.isConnected) { runs.delete(el); continue; }
    const k = Math.min(1, (now - r.start) / DUR);
    const e = 1 - Math.pow(1 - k, 3);
    const v = r.from + (r.to - r.from) * e;
    shown.set(el, v);
    el.textContent = format(v, r.fmt);
    if (k >= 1) runs.delete(el);
  }
  if (runs.size) raf = requestAnimationFrame(tick);
}

export function initTween(isEnabled: () => boolean): void {
  enabled = isEnabled;
  setTweenHook((el, finalText, prev) => {
    const to = Number(el.getAttribute('data-tween'));
    const fmt = el.getAttribute('data-fmt') ?? 'int';
    const from = shown.get(el) ?? (prev != null && Number.isFinite(Number(prev)) ? Number(prev) : undefined);
    const running = runs.get(el);
    if (!Number.isFinite(to)) { el.textContent = finalText; return; }
    if (running && running.to === to) return;
    if (from === undefined || !enabled() || Math.abs(to - from) < 1e-9) {
      runs.delete(el);
      shown.set(el, to);
      if (el.textContent !== finalText) el.textContent = finalText;
      return;
    }
    runs.set(el, { from, to, start: performance.now(), fmt });
    if (!raf) raf = requestAnimationFrame(tick);
  });
}

/** Gleitende Zahl im HTML: <span data-tween> mit fertigem Text als Startwert */
export function tw(v: number, fmt: 'int' | 'amount' | 'cr' | 'pct' = 'int'): string {
  return `<span class="num" data-tween="${v}" data-fmt="${fmt}">${format(v, fmt)}</span>`;
}
