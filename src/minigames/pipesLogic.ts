// Logik des Rohr-Puzzles: zufällige Leitungsbäume über das Raster, Teile verdreht.
// Erweiterungen: gesperrte Felder, Brücken (zwei Leitungen kreuzen sich ohne Verbindung), Ventilgruppen (drehen
// gemeinsam), feste Felder als Hilfe und zwei Energiekerne mit eigener Ware, deren Leitungen sich nicht mischen dürfen.
// Gelöst: jedes Feld versorgt, kein Rohr offen, nichts vermischt, jedes Modul mit seiner Ware.
import { rng } from './common';

/** Richtungsbits: Norden, Osten, Süden, Westen */
export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
];
const OPP_IDX = [2, 3, 0, 1];

export interface Board {
  n: number;
  /** Aktuelle Anschlüsse je Feld (nach Drehung) */
  mask: number[];
  /** Lösung je Feld */
  solution: number[];
  /** Nicht drehbar (Energiekern, Brücke, feste Hilfe) */
  locked: boolean[];
  /** Energiekerne (ein oder zwei) */
  sources: number[];
  /** Zugehöriger Kern je Feld in der Lösung (−1 = gesperrt) */
  owner: number[];
  blocked: boolean[];
  /** Brücke: senkrechter und waagrechter Kanal getrennt */
  bridge: boolean[];
  /** Kern des waagrechten Kanals einer Brücke (senkrecht: owner) */
  bridgeOwnerH: number[];
  /** Ventilgruppe je Feld (−1 = keine) */
  group: number[];
  /** Als Hilfe fest vorgegeben */
  fixed: boolean[];
}

export interface GenOpts { blocked?: number; bridges?: boolean; valves?: number; two?: boolean; fixed?: number }

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

function rotN(m: number, k: number): number {
  for (let j = 0; j < k; j++) m = rotCW(m);
  return m;
}

/** Neues Rätsel: n×n Felder, Energiekern(e) am linken bzw. rechten Rand. Wiederholt, bis jeder Kern Module hat */
export function generate(n: number, seed: number, o: GenOpts = {}): Board {
  let b = generateOnce(n, seed, o);
  for (let k = 1; k < 40; k++) {
    const cons = consumers(b);
    const ok = cons.length >= 2 && b.sources.every((_, i) => cons.some((c) => b.owner[c] === i)) && !power(b).solved;
    if (ok) return b;
    b = generateOnce(n, seed + k * 7919, o);
  }
  return b;
}

function generateOnce(n: number, seed: number, o: GenOpts): Board {
  const r = rng(seed);
  const total = n * n;
  const sources = o.two ? [Math.floor(n / 3) * n, Math.floor((2 * n) / 3) * n + n - 1] : [Math.floor(n / 2) * n];
  const blocked = new Array(total).fill(false);
  // Sperrfelder: nicht am Kern und nicht direkt daneben
  const near = (c: number) => sources.some((s) => Math.abs((s % n) - (c % n)) + Math.abs(Math.floor(s / n) - Math.floor(c / n)) <= 1);
  for (let k = 0, tries = 0; k < (o.blocked ?? 0) && tries < 200; tries++) {
    const c = Math.floor(r() * total);
    if (blocked[c] || near(c)) continue;
    blocked[c] = true;
    k++;
  }
  const sol = new Array(total).fill(0);
  const owner = new Array(total).fill(-1);
  const inTree = new Array(total).fill(false);
  const bridge = new Array(total).fill(false);
  const bridgeOwnerH = new Array(total).fill(-1);
  const frontier: [number, number, number][] = [];
  const pushEdges = (c: number, own: number) => {
    const x = c % n, y = Math.floor(c / n);
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || blocked[ny * n + nx]) continue;
      frontier.push([c, d, own]);
    }
  };
  for (const [i, s] of sources.entries()) { inTree[s] = true; owner[s] = i; pushEdges(s, i); }
  while (frontier.length) {
    const pick = r() < 0.6 ? frontier.length - 1 - Math.floor(r() * Math.min(4, frontier.length)) : Math.floor(r() * frontier.length);
    const [c, d, own] = frontier.splice(pick, 1)[0];
    // Brückenfelder werden nicht weiter verzweigt
    if (bridge[c]) continue;
    const x = c % n, y = Math.floor(c / n);
    const t = (y + DIRS[d].dy) * n + (x + DIRS[d].dx);
    if (inTree[t]) {
      // Brücke: quer durch ein gerades Stück hindurch auf ein freies Feld dahinter
      const straightPerp = (d % 2 === 1 ? sol[t] === (N | S) : sol[t] === (E | W));
      const tx = t % n + DIRS[d].dx, ty = Math.floor(t / n) + DIRS[d].dy;
      const t2 = ty * n + tx;
      if (o.bridges && straightPerp && !bridge[t] && !sources.includes(t) && tx >= 0 && ty >= 0 && tx < n && ty < n && !blocked[t2] && !inTree[t2] && r() < 0.5) {
        sol[c] |= DIRS[d].bit;
        sol[t] = 15;
        bridge[t] = true;
        // Kanal-Besitzer: der bestehende Kanal behält owner[t], der neue gehört `own`
        if (d % 2 === 1) bridgeOwnerH[t] = own;
        else { bridgeOwnerH[t] = owner[t]; owner[t] = own; }
        sol[t2] |= DIRS[d].opp;
        inTree[t2] = true;
        owner[t2] = own;
        pushEdges(t2, own);
      }
      continue;
    }
    if (bits(sol[c]) >= 3 && r() < 0.8 && frontier.some(([fc]) => bits(sol[fc]) < 3)) {
      frontier.unshift([c, d, own]);
      continue;
    }
    sol[c] |= DIRS[d].bit;
    sol[t] |= DIRS[d].opp;
    inTree[t] = true;
    owner[t] = own;
    pushEdges(t, own);
  }
  // Unerreichte Felder (durch Sperren abgeschnitten) ebenfalls sperren
  for (let i = 0; i < total; i++) if (!inTree[i]) blocked[i] = true;
  const locked = sol.map((_, i) => sources.includes(i) || bridge[i] || blocked[i]);
  const fixed = new Array(total).fill(false);
  const free = () => sol.map((m, i) => (!locked[i] && bits(m) < 4 ? i : -1)).filter((i) => i >= 0);
  // Feste Hilfsfelder
  for (let k = 0; k < (o.fixed ?? 0); k++) {
    const f = free();
    if (!f.length) break;
    const c = f[Math.floor(r() * f.length)];
    locked[c] = fixed[c] = true;
  }
  // Ventilgruppen: 2–3 Felder, die sich gemeinsam drehen
  const group = new Array(total).fill(-1);
  for (let g = 0; g < (o.valves ?? 0); g++) {
    const f = free().filter((i) => group[i] < 0 && bits(sol[i]) !== 1);
    if (f.length < 3) break;
    const size = 2 + Math.floor(r() * 2);
    for (let k = 0; k < size; k++) group[f.splice(Math.floor(r() * f.length), 1)[0]] = g;
  }
  // Verdrehen: Gruppen gemeinsam, sonst jedes Feld zufällig; mindestens zwei Drittel falsch
  const mask = sol.slice();
  const groupTurn: number[] = [];
  for (let i = 0; i < total; i++) {
    if (locked[i]) continue;
    let k: number;
    if (group[i] >= 0) k = groupTurn[group[i]] ??= 1 + Math.floor(r() * 3);
    else k = Math.floor(r() * 4);
    mask[i] = rotN(mask[i], k);
  }
  const movable = sol.map((_, i) => !locked[i] && group[i] < 0);
  let wrong = mask.filter((m, i) => movable[i] && m !== sol[i]).length;
  const cnt = movable.filter(Boolean).length;
  for (let i = 0; i < total && wrong < (cnt * 2) / 3; i++) {
    if (!movable[i] || mask[i] !== sol[i]) continue;
    const once = rotCW(mask[i]);
    if (once !== sol[i]) { mask[i] = once; wrong++; }
  }
  return { n, mask, solution: sol, locked, sources, owner, blocked, bridge, bridgeOwnerH, group, fixed };
}

/** Mindestzahl Antipper für die Lösung (Ventilgruppen zählen gemeinsam) */
export function par(b: Board): number {
  let p = 0;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < b.mask.length; i++) {
    if (b.locked[i]) continue;
    if (b.group[i] >= 0) { groups.set(b.group[i], [...(groups.get(b.group[i]) ?? []), i]); continue; }
    p += turnsTo(b.mask[i], b.solution[i]);
  }
  for (const cells of groups.values()) {
    for (let k = 0; k < 4; k++) if (cells.every((i) => rotN(b.mask[i], k) === b.solution[i])) { p += k; break; }
  }
  return p;
}

export interface PowerInfo {
  /** Abstand vom Kern je Feld (−1 = nicht versorgt) */
  dist: number[];
  /** Ware (Kern-Index) je Feld; −2 = vermischt; bei Brücken der senkrechte Kanal */
  color: number[];
  /** Ware des waagrechten Brückenkanals */
  colorH: number[];
  /** Offene Enden versorgter Felder: Feld und Richtung (Leck) */
  leaks: [number, number][];
  /** Vermischte Felder */
  mixed: number[];
  /** Verbraucher mit der richtigen Ware */
  okConsumers: number;
  /** Alle Felder versorgt, dicht, nichts vermischt */
  solved: boolean;
}

/** Versorgung von den Kernen aus: nur beidseitig passende Anschlüsse leiten, Brücken nur geradeaus */
export function power(b: Board): PowerInfo {
  const { n, mask } = b;
  const total = n * n;
  const dist = new Array(total).fill(-1);
  const color = new Array(total).fill(-1);
  const colorH = new Array(total).fill(-1);
  const leaks: [number, number][] = [];
  const mixedSet = new Set<number>();
  // Warteschlange: Feld, Eintrittsseite (Richtungsindex, −1 = Kern), Ware, Abstand
  const queue: [number, number, number, number][] = b.sources.map((s, i) => [s, -1, i, 0]);
  const leakSeen = new Set<string>();
  while (queue.length) {
    const [c, from, col, dd] = queue.shift()!;
    const isBridge = b.bridge[c];
    const horiz = from === 1 || from === 3;
    const slot = isBridge && horiz ? colorH : color;
    if (slot[c] === col) continue;
    if (slot[c] >= 0 || slot[c] === -2) { slot[c] = -2; mixedSet.add(c); continue; }
    slot[c] = col;
    if (dist[c] < 0 || dd < dist[c]) dist[c] = dd;
    const x = c % n, y = Math.floor(c / n);
    const outs = isBridge ? [OPP_IDX[from]] : [0, 1, 2, 3].filter((d) => mask[c] & DIRS[d].bit);
    for (const d of outs) {
      if (!isBridge && d === from) continue;
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      const t = ny * n + nx;
      const ok = nx >= 0 && ny >= 0 && nx < n && ny < n && !b.blocked[t] && (b.bridge[t] || (mask[t] & DIRS[d].opp));
      if (!ok) { const k = `${c}:${d}`; if (!leakSeen.has(k)) { leakSeen.add(k); leaks.push([c, d]); } continue; }
      queue.push([t, OPP_IDX[d], col, dd + 1]);
    }
  }
  const cons = consumers(b);
  const okConsumers = cons.filter((c) => color[c] === b.owner[c]).length;
  let solved = !leaks.length && !mixedSet.size && okConsumers === cons.length;
  if (solved) for (let i = 0; i < total; i++) {
    if (b.blocked[i]) continue;
    if (color[i] < 0 || (b.bridge[i] && colorH[i] < 0)) { solved = false; break; }
  }
  return { dist, color, colorH, leaks, mixed: [...mixedSet], okConsumers, solved };
}

/** Feld drehen (feste nicht; Ventile drehen die ganze Gruppe). Gibt die gedrehten Felder zurück */
export function rotate(b: Board, i: number): number[] {
  if (b.locked[i] || b.blocked[i]) return [];
  const cells = b.group[i] >= 0 ? b.group.map((g, k) => (g === b.group[i] ? k : -1)).filter((k) => k >= 0) : [i];
  for (const c of cells) b.mask[c] = rotCW(b.mask[c]);
  return cells;
}

/** Felder mit genau einem Anschluss: Verbraucher (Module), außer den Kernen */
export function consumers(b: Board): number[] {
  return b.solution.map((m, i) => (!b.sources.includes(i) && !b.blocked[i] && !b.bridge[i] && bits(m) === 1 ? i : -1)).filter((i) => i >= 0);
}
