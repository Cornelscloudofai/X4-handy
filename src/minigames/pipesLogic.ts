// Logik des Rohr-Puzzles: ein zufälliger Leitungsbaum über das ganze Raster, Teile verdreht.
// Gelöst ist das Rätsel, wenn vom Energiekern aus jedes Feld erreicht wird und kein Rohr ins Leere führt.
import { rng } from './common';

/** Richtungsbits: Norden, Osten, Süden, Westen */
export const N = 1, E = 2, S = 4, W = 8;
const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
];

export interface Board {
  n: number;
  /** Aktuelle Anschlüsse je Feld (nach Drehung) */
  mask: number[];
  /** Lösung je Feld */
  solution: number[];
  /** Feste Felder (Energiekern) */
  locked: boolean[];
  /** Feld des Energiekerns */
  source: number;
}

/** Eine Vierteldrehung im Uhrzeigersinn */
export function rotCW(m: number): number {
  return ((m << 1) | (m >> 3)) & 15;
}

export function bits(m: number): number {
  return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
}

/** Wenigste Drehungen, bis das Feld zur Lösung passt */
export function turnsTo(m: number, sol: number): number {
  let x = m;
  for (let k = 0; k < 4; k++) {
    if (x === sol) return k;
    x = rotCW(x);
  }
  return 0;
}

/** Neues Rätsel: n×n Felder, Energiekern am linken Rand */
export function generate(n: number, seed: number): Board {
  const r = rng(seed);
  const total = n * n;
  const source = Math.floor(n / 2) * n;
  const sol = new Array(total).fill(0);
  const inTree = new Array(total).fill(false);
  inTree[source] = true;
  // Wachsender Baum (Prim mit Zufall), bevorzugt Kanten an jüngeren Feldern → längere, verzweigte Leitungen
  const frontier: [number, number][] = [];
  const pushEdges = (c: number) => {
    const x = c % n, y = Math.floor(c / n);
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      frontier.push([c, d]);
    }
  };
  pushEdges(source);
  while (frontier.length) {
    const pick = r() < 0.6 ? frontier.length - 1 - Math.floor(r() * Math.min(4, frontier.length)) : Math.floor(r() * frontier.length);
    const [c, d] = frontier.splice(pick, 1)[0];
    const x = c % n, y = Math.floor(c / n);
    const t = (y + DIRS[d].dy) * n + (x + DIRS[d].dx);
    if (inTree[t]) continue;
    // Kreuzungen sparsam: Felder mit schon drei Anschlüssen nur selten erweitern
    if (bits(sol[c]) >= 3 && r() < 0.8 && frontier.some(([fc]) => bits(sol[fc]) < 3)) {
      frontier.unshift([c, d]);
      continue;
    }
    sol[c] |= DIRS[d].bit;
    sol[t] |= DIRS[d].opp;
    inTree[t] = true;
    pushEdges(t);
  }
  // Verdrehen: jedes Feld zufällig, mindestens zwei Drittel falsch
  const mask = sol.slice();
  const locked = sol.map((_, i) => i === source);
  for (let i = 0; i < total; i++) {
    if (locked[i]) continue;
    const k = Math.floor(r() * 4);
    for (let j = 0; j < k; j++) mask[i] = rotCW(mask[i]);
  }
  let wrong = mask.filter((m, i) => m !== sol[i]).length;
  for (let i = 0; i < total && wrong < (total * 2) / 3; i++) {
    if (locked[i] || mask[i] !== sol[i]) continue;
    const once = rotCW(mask[i]);
    if (once !== sol[i]) { mask[i] = once; wrong++; }
  }
  return { n, mask, solution: sol, locked, source };
}

/** Mindestzahl Antipper für die Lösung */
export function par(b: Board): number {
  return b.mask.reduce((s, m, i) => s + (b.locked[i] ? 0 : turnsTo(m, b.solution[i])), 0);
}

export interface PowerInfo {
  /** Abstand vom Energiekern je Feld (−1 = nicht versorgt) */
  dist: number[];
  /** Offene Enden versorgter Felder: Feld und Richtung (Leck) */
  leaks: [number, number][];
  /** Alle Felder versorgt und dicht */
  solved: boolean;
}

/** Versorgung vom Energiekern aus: nur beidseitig passende Anschlüsse leiten */
export function power(b: Board): PowerInfo {
  const { n, mask } = b;
  const dist = new Array(n * n).fill(-1);
  const leaks: [number, number][] = [];
  dist[b.source] = 0;
  const queue = [b.source];
  while (queue.length) {
    const c = queue.shift()!;
    const x = c % n, y = Math.floor(c / n);
    for (let d = 0; d < 4; d++) {
      if (!(mask[c] & DIRS[d].bit)) continue;
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      const t = ny * n + nx;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || !(mask[t] & DIRS[d].opp)) { leaks.push([c, d]); continue; }
      if (dist[t] < 0) { dist[t] = dist[c] + 1; queue.push(t); }
    }
  }
  return { dist, leaks, solved: !leaks.length && dist.every((v) => v >= 0) };
}

/** Feld drehen (feste Felder nicht) */
export function rotate(b: Board, i: number): boolean {
  if (b.locked[i]) return false;
  b.mask[i] = rotCW(b.mask[i]);
  return true;
}

/** Felder mit genau einem Anschluss: Verbraucher (Module), außer dem Energiekern */
export function consumers(b: Board): number[] {
  return b.solution.map((m, i) => (i !== b.source && bits(m) === 1 ? i : -1)).filter((i) => i >= 0);
}
