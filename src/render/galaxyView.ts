// Sektorenkarte: Sektoren als Glas-Sechsecke mit Sprungtor-Verbindungslinien auf ruhigem Grund
import { SECTORS, SECTOR_MAP, hexCorners } from '../data/sectors';
import { FRONTIER, FRONTIER_MAP, REGIONS, SPLIT_MAP_POS } from '../data/frontier';
import type { GameState } from '../engine/types';
import type { Camera } from './camera';
import { BG_IMAGES } from './bgImages';
import { stationAlerts } from '../engine/analysis';
import { SCOUT_HOP, scouts } from '../engine/explore';

const FONT = '"Chakra Petch", "Barlow", system-ui, sans-serif';
export const GALAXY_HEX = 100;

/** Lage auf der Sektorenkarte (eigene Anordnung: Split-Raum unten, der unbekannte Raum darüber) */
export function sectorCenter(id: string): { x: number; z: number } {
  const p = SPLIT_MAP_POS[id] ?? FRONTIER_MAP[id] ?? SECTOR_MAP[id];
  return { x: GALAXY_HEX * 1.5 * p.q, z: GALAXY_HEX * Math.sqrt(3) * (p.r + p.q / 2) };
}

interface MapNode { id: string; name: string; q: number; r: number; links: string[]; frontier: boolean }

/** Was auf der Karte steht: der Split-Raum und alle schon entdeckten neuen Sektoren (Unentdecktes gar nicht) */
export function mapNodes(state: GameState): MapNode[] {
  const found = new Set(state.frontier?.discovered ?? []);
  const nodes: MapNode[] = SECTORS.map((s) => ({ id: s.id, name: s.name, ...(SPLIT_MAP_POS[s.id] ?? s), links: s.links, frontier: false }));
  for (const f of FRONTIER) if (found.has(f.id)) nodes.push({ id: f.id, name: f.name, q: f.q, r: f.r, links: f.links, frontier: true });
  return nodes;
}

export function nodeName(id: string): string {
  return SECTOR_MAP[id]?.name ?? FRONTIER_MAP[id]?.name ?? id;
}

/** Grenzen der sichtbaren Karte (Weltkoordinaten), für Einpassen und Verschieben */
export function mapBounds(state: GameState): { x0: number; x1: number; z0: number; z1: number } {
  const pts = mapNodes(state).map((n) => sectorCenter(n.id));
  const m = GALAXY_HEX;
  return { x0: Math.min(...pts.map((p) => p.x)) - m, x1: Math.max(...pts.map((p) => p.x)) + m, z0: Math.min(...pts.map((p) => p.z)) - m, z1: Math.max(...pts.map((p) => p.z)) + m };
}

/** Farbschimmer je Sektor (nur eine Ahnung – wie es dort aussieht, zeigt erst der Besuch) */
const TINT: Record<string, string> = { zhin: '63,200,190', tkr: '200,150,90', cascade: '230,170,90', ravine: '110,140,210', rhy: '140,120,210', hoa: '90,130,200', zyarth: '210,110,120' };
export function tintOf(id: string): string {
  if (TINT[id]) return TINT[id];
  if (FRONTIER_MAP[id]) return REGIONS[FRONTIER_MAP[id].region].tint;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ['63,200,190', '200,150,90', '110,140,210', '140,120,210', '210,110,120'][h % 5];
}

function seeded(seed: number): () => number {
  let x = (seed % 2147483646) + 1;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  hexCorners(r).forEach((p, i) => (i ? ctx.lineTo(cx + p.x, cy + p.z) : ctx.moveTo(cx + p.x, cy + p.z)));
  ctx.closePath();
}

// ---- Hintergrund: ruhig und dunkel. Eigene Bilder in src/assets/karte/hintergrund-*.jpg wechseln sich langsam ab
// (fließende Überblendung); ohne eigene Bilder ein Weltraumbild, stark weichgezeichnet und abgedunkelt. Jedes Bild wird
// einmal je Bildschirmgröße in voller Auflösung vorberechnet (Abdunkeln zum Rand, feine Sterne). ----
const OWN_BG = Object.entries(import.meta.glob('../assets/karte/hintergrund*.{jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
  .sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url);
/** Standzeit je Bild und Dauer der Überblendung (ms) */
const BG_HOLD = 30000, BG_FADE = 8000;
const bgImgs: HTMLImageElement[] = [];
const bgCache = new Map<number, { key: string; canvas: HTMLCanvasElement }>();

function bgSources(): string[] {
  return OWN_BG.length ? OWN_BG : [BG_IMAGES.find((b) => b.id === 'wirbel-violett')?.url ?? ''];
}

function backdrop(i: number, w: number, h: number): HTMLCanvasElement | null {
  const own = OWN_BG.length > 0;
  let img = bgImgs[i];
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = bgSources()[i];
    bgImgs[i] = img;
  }
  const ready = img.complete && img.naturalWidth > 0;
  if (own && !ready) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const key = `${w}x${h}@${dpr}:${ready ? 1 : 0}`;
  const hit = bgCache.get(i);
  if (hit?.key === key) return hit.canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#01040a';
  g.fillRect(0, 0, w, h);
  if (ready) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (own ? 1 : 1.3);
    g.save();
    if (!own) { g.filter = 'blur(18px)'; g.globalAlpha = 0.24; }
    g.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    g.restore();
  }
  const v = g.createRadialGradient(w * 0.45, h * 0.5, 40, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, own ? 'rgba(1,4,10,0)' : 'rgba(14,34,48,0.35)');
  v.addColorStop(1, own ? 'rgba(1,4,10,0.55)' : 'rgba(1,4,10,0.92)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  if (!own) {
    const R = seeded(11);
    for (let n = 0; n < (w * h) / 600; n++) {
      g.fillStyle = `rgba(220,235,255,${(0.12 + R() * 0.4).toFixed(3)})`;
      g.beginPath();
      g.arc(R() * w, R() * h, R() ** 3 * 1.4 + 0.25, 0, Math.PI * 2);
      g.fill();
    }
  }
  bgCache.set(i, { key, canvas: c });
  return c;
}

/** Ruhiger Hintergrund der Sektorenkarte; mehrere eigene Bilder blenden langsam ineinander über */
export function drawGalaxyBackdrop(ctx: CanvasRenderingContext2D, cam: Camera, now: number): void {
  const n = bgSources().length;
  const period = BG_HOLD + BG_FADE;
  const cur = Math.floor(now / period) % n;
  const t = (now % period) - BG_HOLD;
  const a = backdrop(cur, cam.w, cam.h);
  ctx.fillStyle = '#01040a';
  ctx.fillRect(0, 0, cam.w, cam.h);
  if (a) ctx.drawImage(a, 0, 0, cam.w, cam.h);
  if (n > 1 && t > 0) {
    const b = backdrop((cur + 1) % n, cam.w, cam.h);
    if (b) {
      const f = t / BG_FADE;
      ctx.globalAlpha = f * f * (3 - 2 * f);
      ctx.drawImage(b, 0, 0, cam.w, cam.h);
      ctx.globalAlpha = 1;
    }
  }
  // nächstes Bild schon laden
  if (n > 1) backdrop((cur + 1) % n, cam.w, cam.h);
}

/**
 * Sektorenkarte: Sektoren als Glas-Sechsecke mit eigenem Farbschimmer und Sternenstaub (kein Bild – die Überraschung
 * bleibt für den Besuch), nur der Name. Eigene Sektoren mit leuchtendem Rand (orange bei Problemen). Sprungtore als
 * Verbindungslinien von Rand zu Rand: eigene türkis mit Verkehr, fremde zart, ins Unerforschte gestrichelt.
 */
export function drawGalaxy(ctx: CanvasRenderingContext2D, state: GameState, cam: Camera, selected: string | null, current: string, now: number): void {
  const known = new Set<string>(state.sectors);
  for (const id of state.sectors) for (const l of SECTOR_MAP[id].links) known.add(l);
  for (const st of state.stations) known.add(st.sector);
  const rr = GALAXY_HEX * cam.zoom * 0.8;
  const warnAt = new Set(state.stations.filter((st) => stationAlerts(state, st).length).map((st) => st.sector));
  const nodes = mapNodes(state);
  const onMap = new Set(nodes.map((n) => n.id));
  for (const n of nodes) if (n.frontier) known.add(n.id);
  // Verbindungen (nur zwischen Sektoren, die auf der Karte stehen); entfernte Tore als Bogen
  const drawn = new Set<string>();
  for (const s of nodes) {
    for (const l of s.links) {
      const pair = s.id < l ? `${s.id}|${l}` : `${l}|${s.id}`;
      if (!onMap.has(l) || drawn.has(pair)) continue;
      drawn.add(pair);
      const a = sectorCenter(s.id), b = sectorCenter(l);
      const [ax, ay] = cam.toScreen(a.x, a.z), [bx, by] = cam.toScreen(b.x, b.z);
      const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
      const off = rr * 0.87;
      const x1 = ax + ux * off, y1 = ay + uy * off, x2 = bx - ux * off, y2 = by - uy * off;
      const far = Math.hypot(b.x - a.x, b.z - a.z) > GALAXY_HEX * 2.1;
      const bend = far ? d * 0.08 * (s.id < l ? 1 : -1) : 0;
      const mx = (x1 + x2) / 2 - uy * bend, my = (y1 + y2) / 2 + ux * bend;
      const along = (t: number): [number, number] => [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2];
      const mine = state.sectors.includes(s.id) || state.sectors.includes(l);
      const hidden = !known.has(s.id) || !known.has(l);
      ctx.save();
      ctx.lineCap = 'round';
      if (mine && !hidden) { ctx.shadowColor = 'rgba(63,224,197,0.9)'; ctx.shadowBlur = 8; ctx.strokeStyle = 'rgba(120,240,220,0.9)'; ctx.lineWidth = 2; }
      else if (hidden) { ctx.strokeStyle = 'rgba(170,190,210,0.35)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 4]); }
      else { ctx.strokeStyle = 'rgba(255,215,160,0.55)'; ctx.lineWidth = 1.4; }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
      ctx.restore();
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        ctx.strokeStyle = mine && !hidden ? 'rgba(160,250,235,0.9)' : hidden ? 'rgba(170,190,210,0.35)' : 'rgba(255,220,170,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Verkehr auf eigenen Verbindungen: ein Licht pendelt durchs Tor
      if (mine && !hidden) {
        const t = 0.5 + 0.42 * Math.sin(now / 1400 + (s.q + s.r) * 1.7);
        const [x, y] = along(t);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
        g.addColorStop(0, 'rgba(235,255,250,1)');
        g.addColorStop(1, 'rgba(63,224,197,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Gefundene Torsignaturen: gestrichelte Linie ins Unbekannte, am Ende ein pulsierendes Signal (kein Sechseck)
  for (const sig of state.frontier?.signatures ?? []) {
    const [from, to] = sig.split('>');
    if (!onMap.has(from) || onMap.has(to) || !FRONTIER_MAP[to]) continue;
    const a = sectorCenter(from), b = sectorCenter(to);
    const [ax, ay] = cam.toScreen(a.x, a.z), [bx, by] = cam.toScreen(b.x, b.z);
    const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
    const x1 = ax + ux * rr * 0.87, y1 = ay + uy * rr * 0.87, x2 = bx - ux * rr * 0.5, y2 = by - uy * rr * 0.5;
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, 'rgba(160,210,255,0.6)');
    g.addColorStop(1, 'rgba(160,210,255,0.05)');
    ctx.save();
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -now / 60;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
    const p = (now % 2400) / 2400;
    ctx.strokeStyle = `rgba(170,215,255,${(0.6 * (1 - p)).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x2, y2, 3 + p * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,230,255,0.85)';
    ctx.beginPath();
    ctx.arc(x2, y2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sechsecke
  for (const s of nodes) {
    const c = sectorCenter(s.id);
    const [cx, cy] = cam.toScreen(c.x, c.z);
    const owned = state.sectors.includes(s.id);
    const visible = known.has(s.id);
    const tint = tintOf(s.id);
    ctx.save();
    hexPath(ctx, cx, cy, rr);
    ctx.clip();
    if (!visible) {
      ctx.fillStyle = 'rgba(8,14,22,0.35)';
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    } else {
      ctx.fillStyle = 'rgba(6,14,22,0.82)';
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      // Farbschimmer aus einer (je Sektor festen) Richtung, langsam atmend
      const ox = cx + Math.cos(s.q * 2.1 + s.r) * rr * 0.45, oy = cy + Math.sin(s.q * 1.3 - s.r) * rr * 0.4;
      const breath = 0.85 + 0.15 * Math.sin(now / 3000 + s.q * 2 + s.r);
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr * 1.1);
      g.addColorStop(0, `rgba(${tint},${((owned ? 0.42 : 0.28) * breath).toFixed(3)})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      // Sternenstaub
      const rd = seeded(s.q * 31 + s.r * 7 + 999);
      for (let i = 0; i < 40; i++) {
        const tw = 0.6 + 0.4 * Math.sin(now / 700 + i * 1.7);
        ctx.fillStyle = `rgba(230,240,255,${((0.15 + rd() * 0.35) * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx + (rd() - 0.5) * rr * 2, cy + (rd() - 0.5) * rr * 2, rd() * 0.8 + 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Glas: Lichtkante oben, dunkler unten
      const gl = ctx.createLinearGradient(0, cy - rr, 0, cy + rr);
      gl.addColorStop(0, 'rgba(255,255,255,0.07)');
      gl.addColorStop(0.4, 'rgba(255,255,255,0)');
      gl.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = gl;
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    ctx.restore();
    // Rahmen
    hexPath(ctx, cx, cy, rr);
    ctx.save();
    if (owned) {
      const col = warnAt.has(s.id) ? '255,154,90' : '63,224,197';
      ctx.shadowColor = `rgba(${col},0.9)`;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = `rgba(${col},0.95)`;
      ctx.lineWidth = 1.4;
    } else {
      const g = ctx.createLinearGradient(0, cy - rr, 0, cy + rr);
      g.addColorStop(0, visible ? 'rgba(230,240,250,0.5)' : 'rgba(170,190,210,0.26)');
      g.addColorStop(1, visible ? 'rgba(230,240,250,0.12)' : 'rgba(170,190,210,0.06)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.restore();
    if (s.id === selected) {
      const p = (now % 1800) / 1800;
      ctx.strokeStyle = `rgba(230,255,250,${(0.5 * (1 - p)).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      hexPath(ctx, cx, cy, rr + p * 10);
      ctx.stroke();
    }
    if (!visible) continue;
    // Name, klein und gesperrt
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(8, Math.min(12, rr / 7));
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.letterSpacing = `${(fs * 0.16).toFixed(1)}px`;
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = owned ? 'rgba(225,255,248,0.98)' : 'rgba(225,232,240,0.78)';
    fitText(ctx, s.name.toUpperCase(), cx, cy + rr * 0.12, rr * 1.5);
    ctx.restore();
    // Hier bist du: kleiner Winkel
    if (s.id === current) {
      const ty = cy - rr * 0.42 + Math.sin(now / 600) * 1.5;
      ctx.strokeStyle = 'rgba(225,255,248,0.95)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - 5, ty - 3);
      ctx.lineTo(cx, ty + 2);
      ctx.lineTo(cx + 5, ty - 3);
      ctx.stroke();
    }
  }
}

/** Späher auf der Karte: kleines Leuchtdreieck; im Flug entlang der Tore, bei der Suche mit kreisendem Radar */
export function drawScouts(ctx: CanvasRenderingContext2D, state: GameState, cam: Camera, now: number): void {
  const rr = GALAXY_HEX * cam.zoom * 0.8;
  scouts(state).forEach((sp, i) => {
    let x: number, y: number, ang = -Math.PI / 2;
    const t = sp.task;
    if (t?.kind === 'fly' && t.path.length > 1) {
      const f = Math.min(t.path.length - 1 - 1e-6, t.t / SCOUT_HOP);
      const k = Math.floor(f), u = f - k;
      const a = sectorCenter(t.path[k]), b = sectorCenter(t.path[k + 1]);
      const [ax, ay] = cam.toScreen(a.x, a.z), [bx, by] = cam.toScreen(b.x, b.z);
      x = ax + (bx - ax) * u;
      y = ay + (by - ay) * u;
      ang = Math.atan2(by - ay, bx - ax);
    } else {
      const c = sectorCenter(t?.target ?? sp.at);
      [x, y] = cam.toScreen(c.x, c.z);
      x += rr * (0.42 - i * 0.18);
      y += rr * 0.42;
      if (t?.kind === 'search') {
        // Radar: kreisender Strahl über dem Sektor
        const [cx, cy] = cam.toScreen(c.x, c.z);
        const a0 = (now / 900) % (Math.PI * 2);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 0.75);
        g.addColorStop(0, 'rgba(63,224,197,0.22)');
        g.addColorStop(1, 'rgba(63,224,197,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rr * 0.75, a0, a0 + 0.9);
        ctx.closePath();
        ctx.fill();
        const p = (now % 2000) / 2000;
        ctx.strokeStyle = `rgba(63,224,197,${(0.5 * (1 - p)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rr * 0.2 + p * rr * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.shadowColor = 'rgba(63,224,197,0.95)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#bff7ec';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number): void {
  const w = ctx.measureText(text).width;
  if (w <= maxW) { ctx.fillText(text, x, y); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(maxW / w, maxW / w);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function galaxyHit(state: GameState, cam: Camera, sx: number, sy: number): string | null {
  const [wx, wz] = cam.toWorld(sx, sy);
  let best: string | null = null;
  let bd = Infinity;
  for (const s of mapNodes(state)) {
    const c = sectorCenter(s.id);
    const d = Math.hypot(c.x - wx, c.z - wz);
    if (d < GALAXY_HEX * 0.9 && d < bd) { bd = d; best = s.id; }
  }
  return best;
}
