// Anordnung der Module einer Station: vier Bauformen mit fester Logik.
// Lager sitzen nah am Kern (kurze Wege), Produktion in der Mitte, Docks, Piers und Werften außen (Schiffe müssen anlegen).
// Jedes Modul behält seinen Platz, wenn neue dazukommen – es nimmt in Bauzreihenfolge den nächsten freien Platz seiner Zone.
import { MODULE_MAP } from '../data/modules';
import { hashStr } from '../engine/util';

export type LayoutStyle = 'spine' | 'ring' | 'tri' | 'block';
export const LAYOUT_STYLES: LayoutStyle[] = ['spine', 'ring', 'tri', 'block'];

/** Zone: 0 = innen, 1 = Mitte, 2 = außen */
export type Band = 0 | 1 | 2;

export interface Slot {
  x: number;
  y: number;
  /** Ausrichtung des Moduls (x zeigt nach außen) */
  ang: number;
  band: Band;
  /** Trägerverlauf vom Kern zum Platz */
  path: [number, number][];
  /** Reserveplatz: erst belegt, wenn die Bauform voll ist */
  reserve?: boolean;
}

/** Größte Entfernung eines Platzes der Bauformen vom Kern (in Moduleinheiten) */
export const MAX_REACH = 4.7;
/** Reservering und Erweiterungsringe (Radius, Plätze) für sehr volle Stationen */
const EXTRA_RINGS: [number, number][] = [[MAX_REACH, 28], [5.7, 34], [6.7, 40]];
/** Mindestabstand zweier Plätze (ein Modul ist 1,0 × 0,72 Einheiten groß) */
const MIN_GAP = 0.95;

const cache = new Map<LayoutStyle, Slot[]>();

function band(d: number, inner: number, mid: number): Band {
  return d <= inner ? 0 : d <= mid ? 1 : 2;
}

/** Rückgrat: langer Träger, Module hängen paarweise an Seitenästen, an den Enden Andockplätze */
function spine(): Slot[] {
  const out: Slot[] = [];
  const step = 1.15;
  // Seitenäste: Ebene 1 (±1), Ebene 2 (±2) und 3 (±3) nur nahe der Mitte
  for (let level = 1; level <= 3; level++) {
    for (const k of [0, 1, -1, 2, -2, 3, -3]) {
      if (level === 3 && Math.abs(k) > 1) continue;
      if (level === 2 && Math.abs(k) > 2) continue;
      const x = k * step;
      for (const side of [1, -1]) {
        const y = side * level * 1.05;
        const path: [number, number][] = [[0, 0], [x, 0]];
        for (let l = 1; l <= level; l++) path.push([x, side * l * 1.05]);
        out.push({ x, y, ang: side > 0 ? Math.PI / 2 : -Math.PI / 2, band: band(Math.hypot(x, y), 1.3, 3), path });
      }
    }
  }
  // Enden des Rückgrats: außen, ideal für Docks
  for (const side of [1, -1]) {
    out.push({ x: side * 4.45, y: 0, ang: side > 0 ? 0 : Math.PI, band: 2, path: [[0, 0], [side * 4.45, 0]] });
    for (const off of [1, -1]) out.push({ x: side * 3.45, y: off * 0.95, ang: off > 0 ? Math.PI / 2 : -Math.PI / 2, band: 2, path: [[0, 0], [side * 3.45, 0], [side * 3.45, off * 0.95]] });
  }
  return out;
}

/** Ringe: konzentrische Ringträger, Module zeigen nach außen */
function ring(): Slot[] {
  const out: Slot[] = [];
  const rings: [number, number, Band][] = [[1.3, 6, 0], [2.45, 12, 1], [3.55, 16, 1], [4.5, 20, 2]];
  let prev = 0;
  rings.forEach(([r, n, b], ri) => {
    const off = ri % 2 ? Math.PI / n : 0;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, ang: a, band: b, path: [[0, 0], [Math.cos(a) * prev, Math.sin(a) * prev], [Math.cos(a) * r, Math.sin(a) * r]] });
    }
    prev = r;
  });
  return out;
}

/** Dreistern: drei Arme mit Seitenästen, Andockplätze an den Spitzen */
function tri(): Slot[] {
  const out: Slot[] = [];
  const arms = [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3];
  const step = 1.2;
  for (let t = 1; t <= 3; t++) {
    for (const a of arms) {
      const ax = Math.cos(a) * step * t, ay = Math.sin(a) * step * t;
      for (let level = 1; level <= (t === 1 ? 1 : 2); level++) {
        for (const side of [1, -1]) {
          const na = a + (side * Math.PI) / 2;
          const x = ax + Math.cos(na) * 1.05 * level, y = ay + Math.sin(na) * 1.05 * level;
          out.push({ x, y, ang: na, band: band(Math.hypot(x, y), 1.6, 3.2), path: [[0, 0], [ax, ay], [x, y]] });
        }
      }
    }
  }
  for (const a of arms) {
    const r = step * 3 + 1.05;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, ang: a, band: 2, path: [[0, 0], [Math.cos(a) * r, Math.sin(a) * r]] });
  }
  // Zwischen den Armen nah am Kern
  for (const a of arms) {
    const m = a + Math.PI / 3, r = 1.3;
    out.push({ x: Math.cos(m) * r, y: Math.sin(m) * r, ang: m, band: 0, path: [[0, 0], [Math.cos(m) * r, Math.sin(m) * r]] });
  }
  return out;
}

/** Block: dicht gepackt auf einem Sechseckraster, wächst ringförmig */
function block(): Slot[] {
  const out: Slot[] = [];
  const s = 1.18;
  const dirs = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
  for (let k = 1; k <= 4; k++) {
    // Sechseckring k: von Ecke zu Ecke laufen
    let x = dirs[4][0] * k * s, y = dirs[4][1] * k * s;
    for (let side = 0; side < 6; side++) {
      for (let j = 0; j < k; j++) {
        const d = Math.hypot(x, y);
        if (d <= MAX_REACH) {
          const a = Math.atan2(y, x);
          const snapped = Math.round(a / (Math.PI / 3)) * (Math.PI / 3);
          const pr = (k - 1) * s;
          out.push({ x, y, ang: snapped, band: k === 1 ? 0 : k === 4 ? 2 : 1, path: [[0, 0], [Math.cos(snapped) * pr, Math.sin(snapped) * pr], [x, y]] });
        }
        x += dirs[side][0] * s;
        y += dirs[side][1] * s;
      }
    }
  }
  return out;
}

function slotsOf(style: LayoutStyle): Slot[] {
  const hit = cache.get(style);
  if (hit) return hit;
  const raw = (style === 'spine' ? spine() : style === 'ring' ? ring() : style === 'tri' ? tri() : block()).filter((p) => Math.hypot(p.x, p.y) <= MAX_REACH + 0.01);
  // Plätze, die einem früheren zu nahe kommen, fallen weg – Module überlappen nie
  const list: Slot[] = [];
  for (const p of raw) if (list.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= MIN_GAP)) list.push(p);
  // Reserve: freie Lücken auf einem äußeren Ring, danach Erweiterungsringe – nur für sehr volle Stationen
  // (bis 100 Module); kleinere Stationen bleiben kompakt
  for (const [r, n] of EXTRA_RINGS) {
    const off = (r * 7.3) % 1;
    for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * Math.PI * 2;
      const p: Slot = { x: Math.cos(a) * r, y: Math.sin(a) * r, ang: a, band: 2, path: [[0, 0], [Math.cos(a) * r, Math.sin(a) * r]] };
      if (list.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= MIN_GAP)) list.push({ ...p, reserve: true });
    }
  }
  cache.set(style, list);
  return list;
}

export function stationStyle(id: string): LayoutStyle {
  return LAYOUT_STYLES[hashStr(id + ':form') % LAYOUT_STYLES.length];
}

/** Bevorzugte Zonen je Modulart */
function prefs(def: string): Band[] {
  const k = MODULE_MAP[def]?.kind;
  if (k === 'storage') return [0, 1, 2];
  if (k === 'dock' || k === 'pier' || k === 'shipyard') return [2, 1, 0];
  return [1, 0, 2];
}

/**
 * Plätze für die Module in Reihenfolge (gebaut, im Bau, geplant). Ist eine Bauform voll, kommen weitere Plätze
 * auf einem äußeren Ring dazu – die Ausdehnung bleibt trotzdem begrenzt.
 */
export function layoutStation(id: string, defs: string[]): Slot[] {
  const slots = slotsOf(stationStyle(id));
  const used = new Set<number>();
  return defs.map((def) => {
    for (const reserve of [false, true]) {
      for (const b of prefs(def)) {
        const idx = slots.findIndex((p, j) => p.band === b && !!p.reserve === reserve && !used.has(j));
        if (idx >= 0) {
          used.add(idx);
          return slots[idx];
        }
      }
    }
    // Mehr Module als Plätze (nur theoretisch, Stationen haben höchstens 100): am Kern stapeln
    return { x: 0, y: 0, ang: 0, band: 0, path: [[0, 0]] };
  });
}

/** Ausdehnung der belegten Plätze (für Leuchten, Auswahlring, Beschriftung) */
export function layoutReach(slots: Slot[]): number {
  return Math.max(1.2, ...slots.map((p) => Math.hypot(p.x, p.y))) + 0.65;
}
