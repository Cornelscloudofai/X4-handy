// Anordnung der Module einer Station: Module docken an Anschlüssen an – am Kern, aneinander oder über ein
// Verbindungsrohr. Gleiche Module bilden Cluster (direkt aneinander, ohne Lücke); ein neuer Cluster beginnt an einem
// freien Anschluss und merkt sich Platz für weitere Module seiner Art vor. Jedes Modul behält seinen Platz für immer
// (gespeichert am Modul), auch wenn andere dazukommen oder abgerissen werden.
import { MODULE_MAP } from '../data/modules';
import { WARES } from '../data/wares';
import { hashStr } from '../engine/util';
import type { ModuleDef, ModuleInst, ModulePlace, Station } from '../engine/types';

export type LayoutStyle = 'spine' | 'ring' | 'tri' | 'block';
export const LAYOUT_STYLES: LayoutStyle[] = ['spine', 'ring', 'tri', 'block'];

export function stationStyle(id: string): LayoutStyle {
  return LAYOUT_STYLES[hashStr(id + ':form') % LAYOUT_STYLES.length];
}

// ---- Bauart der Produktionsmodule (bestimmt Bild und Cluster) ----

export type ProdKind = 'solar' | 'smelter' | 'chem' | 'fab' | 'arms' | 'bio';
const SMELTER = new Set(['refinedmetals', 'teladianium', 'scrapmetal', 'siliconwafers', 'siliconcarbide', 'metallicmicrolattice', 'computronicsubstrate']);
const CHEM = new Set(['graphene', 'superfluidcoolant', 'antimattercells', 'water', 'bogas', 'spacefuel']);
const ARMS = new Set(['shieldcomponents', 'turretcomponents', 'weaponscomponents', 'missilecomponents', 'fieldcoils', 'claytronics']);

/** Bauart eines Produktionsmoduls nach seiner Ware */
export function productionKind(ware: string | undefined): ProdKind {
  if (!ware) return 'fab';
  if (ware === 'energycells') return 'solar';
  if (SMELTER.has(ware)) return 'smelter';
  if (CHEM.has(ware)) return 'chem';
  if (ARMS.has(ware)) return 'arms';
  const g = WARES[ware]?.group;
  if (g === 'food' || g === 'agri' || g === 'pharma') return 'bio';
  return 'fab';
}

// ---- Form der Module ----

/**
 * Form eines Moduls in Moduleinheiten (Achse u zeigt vom Kern weg): half = Mitte bis unterer/oberer Anschluss,
 * hw = Mitte bis Seitenanschluss. Belegte Fläche ist ein Rechteck (Mitte um c entlang u verschoben, Halbmaße a × b).
 * Piers und Werften haben nur den unteren Anschluss; vor dem Pier bleibt Raum für seine Arme und anlegende Schiffe.
 */
export interface ModuleShape { half: number; hw: number; base: boolean; c: number; a: number; b: number }

/** Halbe Breite bis zur Spitze der Seitenanschlüsse – aus den Modulbildern gemessen */
const SIDE: Record<string, number> = {
  Container: 0.354, Solid: 0.343, Liquid: 0.365,
  smelter: 0.333, chem: 0.403, fab: 0.394, arms: 0.4, solar: 0.521, bio: 0.394, dock: 0.379,
};
/** Anschluss zu Anschluss: 95 % von 1,1 Moduleinheiten */
const HALF = 0.5225;

export function moduleShape(d: ModuleDef | undefined): ModuleShape {
  if (d?.kind === 'pier') return { half: 0.52, hw: 1, base: true, c: 0.69, a: 1.21, b: 1.05 };
  if (d?.kind === 'shipyard') {
    // S/M-Werft als Bild: 1,25 Einheiten Kante, Anschluss bis Spitze 95 %, schlanke Baubucht
    // Vor der offenen Bucht bleibt ein Stück frei, damit fertige Schiffe hinausfliegen können
    if (d.yardSize === 'M') return { half: 0.594, hw: 0.32, base: true, c: 0.3, a: 0.894, b: 0.32 };
    // L-Werft (Brustkorb): 1,79 Einheiten Kante, Rippen bis ±0,64
    if (d.yardSize === 'L') return { half: 0.85, hw: 0.64, base: true, c: 0.3, a: 1.15, b: 0.64 };
    // XL-Werft (großer Brustkorb): 2,42 Einheiten Kante, Rippen bis ±0,96
    if (d.yardSize === 'XL') return { half: 1.15, hw: 0.96, base: true, c: 0.3, a: 1.45, b: 0.96 };
    const half = d.yardSize === 'XL' ? 0.75 : 0.65;
    const hw = 0.55;
    return { half, hw, base: true, c: 0.3, a: half + 0.3, b: hw };
  }
  const hw = d?.kind === 'storage' ? SIDE[d.storage ?? 'Container'] : d?.kind === 'dock' ? SIDE.dock : SIDE[productionKind(d?.ware)];
  return { half: HALF, hw, base: false, c: 0, a: HALF, b: hw };
}

/** Cluster-Zugehörigkeit: gleiche Ware, gleicher Lagertyp, Docks zusammen; Piers und Werften stehen einzeln */
export function moduleGroup(d: ModuleDef | undefined): string {
  if (!d) return '?';
  if (d.kind === 'storage') return 'lager:' + (d.storage ?? 'Container');
  if (d.kind === 'production') return 'prod:' + (d.ware ?? '');
  return d.kind;
}

const outer = (d: ModuleDef | undefined) => d?.kind === 'dock' || d?.kind === 'pier' || d?.kind === 'shipyard';

// ---- Geometrie ----

interface Box { x: number; y: number; ux: number; uy: number; a: number; b: number; r: number }
interface Port { x: number; y: number; ang: number; owner: number }
interface Body { x: number; y: number; ang: number; shape: ModuleShape; group: string; seed: boolean; boxes: Box[]; ports: Port[] }

function box(x: number, y: number, ang: number, c: number, a: number, b: number): Box {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  return { x: x + ux * c, y: y + uy * c, ux, uy, a, b, r: Math.hypot(a, b) };
}

/** Überlappen sich zwei Rechtecke (Trennachsen)? Berühren ist erlaubt. */
function overlap(p: Box, q: Box): boolean {
  const dx = q.x - p.x, dy = q.y - p.y;
  if (Math.hypot(dx, dy) >= p.r + q.r) return false;
  const E = 0.03;
  for (const [ax, ay] of [[p.ux, p.uy], [-p.uy, p.ux], [q.ux, q.uy], [-q.uy, q.ux]]) {
    const proj = (o: Box) => Math.abs(o.ux * ax + o.uy * ay) * o.a + Math.abs(-o.uy * ax + o.ux * ay) * o.b;
    if (Math.abs(dx * ax + dy * ay) >= proj(p) + proj(q) - E) return false;
  }
  return true;
}

function inside(px: number, py: number, q: Box): boolean {
  const dx = px - q.x, dy = py - q.y;
  return Math.abs(dx * q.ux + dy * q.uy) < q.a - 0.02 && Math.abs(-dx * q.uy + dy * q.ux) < q.b - 0.02;
}

function body(x: number, y: number, ang: number, d: ModuleDef | undefined, seed = false): Body {
  const s = moduleShape(d);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const ports: Port[] = [{ x: x - ux * s.half, y: y - uy * s.half, ang: ang + Math.PI, owner: -1 }];
  if (!s.base) {
    ports.push({ x: x + ux * s.half, y: y + uy * s.half, ang, owner: -1 });
    ports.push({ x: x - uy * s.hw, y: y + ux * s.hw, ang: ang + Math.PI / 2, owner: -1 });
    ports.push({ x: x + uy * s.hw, y: y - ux * s.hw, ang: ang - Math.PI / 2, owner: -1 });
  }
  return { x, y, ang, shape: s, group: moduleGroup(d), seed, boxes: [box(x, y, ang, s.c, s.a, s.b)], ports };
}

/** Kern je Bauform: belegte Fläche (Nabe und Arme) und Anschlüsse an den Armenden – passend zu den Kernbildern */
function coreBody(style: LayoutStyle): Body {
  const boxes: Box[] = [];
  const ports: Port[] = [];
  const arm = (ang: number, len: number, w: number) => {
    boxes.push(box(0, 0, ang, len / 2, len / 2, w));
    ports.push({ x: Math.cos(ang) * len, y: Math.sin(ang) * len, ang, owner: -1 });
  };
  if (style === 'spine') {
    boxes.push(box(0, 0, 0, 0, 1.21, 0.3));
    ports.push({ x: 1.21, y: 0, ang: 0, owner: -1 }, { x: -1.21, y: 0, ang: Math.PI, owner: -1 });
    for (const sx of [0.575, -0.575]) for (const sy of [1, -1]) {
      boxes.push(box(sx, 0, (sy * Math.PI) / 2, 0.47, 0.17, 0.1));
      ports.push({ x: sx, y: sy * 0.64, ang: (sy * Math.PI) / 2, owner: -1 });
    }
  } else if (style === 'tri') {
    boxes.push(box(0, 0, 0, 0, 0.42, 0.42));
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
      arm(a, 1.0, 0.14);
      arm(a + Math.PI / 3, 0.42, 0.1);
    }
  } else {
    boxes.push(box(0, 0, 0, 0, 0.55, 0.55));
    for (let k = 0; k < 6; k++) arm((k * Math.PI) / 3, 1.0, 0.17);
  }
  return { x: 0, y: 0, ang: 0, shape: { half: 0, hw: 0, base: false, c: 0, a: 0, b: 0 }, group: 'core', seed: false, boxes, ports };
}

/** Kontrollpunkte des Verbindungsrohrs von link bis zum unteren Anschluss des Moduls (kubische Bézierkurve) */
export function tubeCurve(p: ModulePlace, d: ModuleDef | undefined): [number, number][] | null {
  if (!p.link) return null;
  const [sx, sy, sa] = p.link;
  const s = moduleShape(d);
  const ex = p.x - Math.cos(p.ang) * s.half, ey = p.y - Math.sin(p.ang) * s.half;
  const len = Math.hypot(ex - sx, ey - sy);
  if (len < 0.02) return null;
  const k = len * 0.45;
  return [[sx, sy], [sx + Math.cos(sa) * k, sy + Math.sin(sa) * k], [ex - Math.cos(p.ang) * k, ey - Math.sin(p.ang) * k], [ex, ey]];
}

function bez(c: [number, number][], t: number): [number, number] {
  const m = 1 - t;
  const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
  return [w.reduce((s, v, i) => s + v * c[i][0], 0), w.reduce((s, v, i) => s + v * c[i][1], 0)];
}

// ---- Platzsuche ----

/** Vorgemerkter Raum eines Clusters vor seinem ersten Modul */
const RESERVE_R = 1.35;
/** Rohrlängen für neue Cluster (Kernanschlüsse zuerst ohne Rohr) */
const GAPS = [0, 0.5, 1.0, 1.6, 2.4];

interface World { style: LayoutStyle; bodies: Body[]; links: [number, number][] }

function world(style: LayoutStyle): World {
  return { style, bodies: [coreBody(style)], links: [] };
}

function add(w: World, p: ModulePlace, d: ModuleDef | undefined): void {
  w.bodies.push(body(p.x, p.y, p.ang, d, !!p.seed));
  if (p.link) w.links.push([p.link[0], p.link[1]]);
}

function portFree(w: World, port: Port, owner: Body): boolean {
  if (w.links.some(([x, y]) => Math.hypot(x - port.x, y - port.y) < 0.05)) return false;
  const tx = port.x + Math.cos(port.ang) * 0.12, ty = port.y + Math.sin(port.ang) * 0.12;
  return w.bodies.every((b) => b === owner || b.boxes.every((q) => !inside(tx, ty, q)));
}

/** Darf ein Modul (Gruppe g) hier stehen? strict: auch fremde vorgemerkte Clusterräume und Pier-Vorfelder meiden */
function fits(w: World, nb: Body, strict: boolean, tube: [number, number][] | null, owner: Body | null): boolean {
  for (const b of w.bodies) {
    for (const q of b.boxes) for (const p of nb.boxes) if (overlap(p, q)) return false;
    if (strict && b.seed && b.group !== nb.group) {
      const cx = b.x + Math.cos(b.ang) * 1.0, cy = b.y + Math.sin(b.ang) * 1.0;
      if (Math.hypot(nb.x - cx, nb.y - cy) < RESERVE_R) return false;
    }
  }
  if (tube) {
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const [x, y] = bez(tube, t);
      for (const b of w.bodies) if (b !== owner && b.boxes.some((q) => inside(x, y, q))) return false;
      if (nb.boxes.some((q) => inside(x, y, q))) return false;
    }
  }
  return true;
}

/** Platz für ein neues Modul neben den schon platzierten */
function placeNext(w: World, d: ModuleDef | undefined): ModulePlace {
  const s = moduleShape(d);
  const g = moduleGroup(d);
  const joinable = !s.base;
  for (const strict of [true, false]) {
    // 1. Direkt an ein Modul derselben Art: oben, seitlich (parallel) oder unten
    if (joinable) {
      let best: ModulePlace | null = null, bestScore = Infinity;
      for (const b of w.bodies) {
        if (b.group !== g) continue;
        const ux = Math.cos(b.ang), uy = Math.sin(b.ang);
        for (const port of b.ports) {
          if (!portFree(w, port, b)) continue;
          const side = Math.abs(Math.sin(port.ang - b.ang)) > 0.5;
          const dist = side ? b.shape.hw + s.hw : b.shape.half + s.half;
          const px = port.x - b.x, py = port.y - b.y, pl = Math.hypot(px, py);
          const x = b.x + (px / pl) * dist, y = b.y + (py / pl) * dist;
          const nb = body(x, y, b.ang, d);
          if (!fits(w, nb, strict, null, null)) continue;
          // kompakt und eher nach außen: Ketten nach innen nur, wenn es nicht anders geht
          const inward = !side && ux * px + uy * py < 0;
          const score = Math.hypot(x, y) + (inward ? 1.5 : 0);
          if (score < bestScore) { bestScore = score; best = { x, y, ang: b.ang }; }
        }
      }
      if (best) return best;
    }
    // 2. Neuer Cluster an einem freien Anschluss (am Kern direkt, sonst über ein Rohr)
    const reach = Math.max(2, ...w.bodies.slice(1).map((b) => Math.hypot(b.x, b.y)));
    let best: ModulePlace | null = null, bestScore = Infinity;
    for (const b of w.bodies) {
      for (const port of b.ports) {
        if (!portFree(w, port, b)) continue;
        const atCore = b.group === 'core';
        const radial = Math.atan2(port.y, port.x);
        const angs = [port.ang];
        if (Math.cos(radial - port.ang) < 0.9 && Math.hypot(port.x, port.y) > 0.5) angs.push(radial);
        for (const gap of GAPS) {
          if (gap === 0 && !atCore) continue;
          for (const ang of angs) {
            if (ang !== port.ang && gap < 0.9) continue;
            const ex = port.x + Math.cos(port.ang) * gap, ey = port.y + Math.sin(port.ang) * gap;
            const x = ex + Math.cos(ang) * s.half, y = ey + Math.sin(ang) * s.half;
            const link: [number, number, number] | undefined = gap > 0 ? [port.x, port.y, port.ang] : undefined;
            const place: ModulePlace = { x, y, ang, link, seed: joinable || undefined };
            const nb = body(x, y, ang, d, joinable);
            if (!fits(w, nb, strict, link ? tubeCurve(place, d) : null, b)) continue;
            const r = Math.hypot(x, y);
            // Docks, Piers und Werften an den aktuellen Rand der Station (nicht immer weiter hinaus), sonst nah am Kern
            let score = (outer(d) ? Math.max(0, reach - r) + Math.max(0, r - reach) * 0.6 : r) + gap * 0.9 + (ang !== port.ang ? 0.25 : 0);
            // Bauform: Ring breitet sich über Seitenanschlüsse aus, Block und Rückgrat wachsen gerade nach außen
            if (w.style === 'ring' && !atCore && Math.abs(Math.sin(port.ang - b.ang)) > 0.5) score -= 0.3;
            if (w.style !== 'ring' && !atCore && Math.abs(Math.sin(port.ang - b.ang)) < 0.5) score -= 0.2;
            if (score < bestScore) { bestScore = score; best = place; }
          }
        }
      }
    }
    if (best) return best;
  }
  // 3. Notlösung (sehr volle Station): auf einem äußeren Kreis frei stehend, mit Rohr vom nächsten Anschluss
  for (let r = 5; r < 40; r += 1.2) {
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2 + r;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      const nb = body(x, y, ang, d);
      if (!fits(w, nb, false, null, null)) continue;
      let link: [number, number, number] | undefined, bd = Infinity;
      for (const b of w.bodies) for (const port of b.ports) {
        const dd = Math.hypot(port.x - x, port.y - y);
        if (dd < bd && portFree(w, port, b)) { bd = dd; link = [port.x, port.y, port.ang]; }
      }
      return { x, y, ang, link };
    }
  }
  return { x: 0, y: 0, ang: 0 };
}

// ---- Stationen ----

const isCore = (def: string) => MODULE_MAP[def]?.kind === 'core';

/**
 * Vergibt allen Modulen ohne festen Platz einen (in Bauzreihenfolge) und speichert ihn am Modul.
 * Alte Spielstände werden so beim ersten Zeichnen einmal neu angeordnet.
 */
export function ensurePlaced(st: Station): void {
  const mods = st.modules.filter((m) => !isCore(m.def));
  if (mods.every((m) => m.at)) return;
  const style = stationStyle(st.id);
  const w = world(style);
  for (const m of mods) if (m.at) add(w, m.at, MODULE_MAP[m.def]);
  for (const m of mods) {
    if (m.at) continue;
    m.at = placeNext(w, MODULE_MAP[m.def]);
    add(w, m.at, MODULE_MAP[m.def]);
  }
  plannedCache.delete(st.id);
}

const plannedCache = new Map<string, { key: string; places: ModulePlace[] }>();

/** Voraussichtliche Plätze für Module im Bau und in der Bauliste (nicht gespeichert, nur zum Zeichnen) */
export function plannedPlaces(st: Station, defs: string[]): ModulePlace[] {
  const mods = st.modules.filter((m) => !isCore(m.def));
  const key = mods.map((m) => m.uid).join(',') + '|' + defs.join(',');
  const hit = plannedCache.get(st.id);
  if (hit && hit.key === key) return hit.places;
  const w = world(stationStyle(st.id));
  for (const m of mods) if (m.at) add(w, m.at, MODULE_MAP[m.def]);
  const places = defs.map((def) => {
    const p = placeNext(w, MODULE_MAP[def]);
    add(w, p, MODULE_MAP[def]);
    return p;
  });
  plannedCache.set(st.id, { key, places });
  return places;
}

/** Ausdehnung der Station (Moduleinheiten) für Leuchten, Auswahlring und Beschriftung */
export function layoutReach(places: { p: ModulePlace; def: string }[]): number {
  let r = 1.3;
  for (const { p, def } of places) {
    const s = moduleShape(MODULE_MAP[def]);
    r = Math.max(r, Math.hypot(p.x, p.y) + Math.max(s.a + Math.abs(s.c), s.b));
  }
  return r + 0.3;
}

/** Fertige Module mit Platz (für Tests und Auswertungen) */
export function placedModules(st: Station): { m: ModuleInst; p: ModulePlace }[] {
  ensurePlaced(st);
  return st.modules.filter((m) => !isCore(m.def) && m.at).map((m) => ({ m, p: m.at! }));
}

/** Für Tests: Überlappen sich zwei platzierte Module? */
export function placesOverlap(a: ModulePlace, da: string, b: ModulePlace, db: string): boolean {
  const ba = body(a.x, a.y, a.ang, MODULE_MAP[da]), bb = body(b.x, b.y, b.ang, MODULE_MAP[db]);
  return ba.boxes.some((p) => bb.boxes.some((q) => overlap(p, q)));
}
