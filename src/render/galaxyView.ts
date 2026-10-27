// Sektorenkarte: Sektoren als Sechsecke mit Sprungtor-Verbindungen
import { FACTIONS, SECTORS, SECTOR_MAP, hexCorners } from '../data/sectors';
import type { GameState } from '../engine/types';
import type { Camera } from './camera';
import { rgba } from './sprites';
import { sectorLayers } from './bgImages';
import { drawWareGlyph } from './glyphs';
import { WARES } from '../data/wares';
import { stationAlerts } from '../engine/analysis';

const FONT = '"Chakra Petch", "Barlow", system-ui, sans-serif';
export const GALAXY_HEX = 100;

export function sectorCenter(id: string): { x: number; z: number } {
  const s = SECTOR_MAP[id];
  return { x: GALAXY_HEX * 1.5 * s.q, z: GALAXY_HEX * Math.sqrt(3) * (s.r + s.q / 2) };
}

/** Rohstoffe eines Sektors (aus seinen Feldern, ohne Altlasten), in fester Reihenfolge */
function sectorWares(id: string): string[] {
  const order = ['ore', 'silicon', 'ice', 'nividium', 'hydrogen', 'helium', 'methane'];
  const set = new Set(SECTOR_MAP[id].fields.filter((f) => !f.legacy).map((f) => f.ware));
  return order.filter((w) => set.has(w)).concat([...set].filter((w) => !order.includes(w)));
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  hexCorners(r).forEach((p, i) => (i ? ctx.lineTo(cx + p.x, cy + p.z) : ctx.moveTo(cx + p.x, cy + p.z)));
  ctx.closePath();
}

/** Kleines Abzeichen (Symbol + Zahl) als Pille; gibt die Breite zurück */
function badge(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, text: string, color: string, draw: boolean): number {
  ctx.font = `700 ${h * 0.62}px ${FONT}`;
  const w = ctx.measureText(text).width + h * 0.9;
  if (!draw) return w;
  ctx.fillStyle = 'rgba(2,8,14,0.72)';
  ctx.strokeStyle = rgba(color, 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + h * 0.45, y + 0.5);
  return w;
}

/**
 * Sektorenkarte: jeder Sektor als Sechseck mit seinem Weltraumbild, Name, Fraktion, Sonne, Rohstoffen, eigenen
 * Stationen/Schiffen und Warnungen. Sprungtore als leuchtende Verbindungen (mit wandernden Lichtern, wo man vertreten
 * ist); Unerforschtes liegt im Nebel.
 */
export function drawGalaxy(ctx: CanvasRenderingContext2D, state: GameState, cam: Camera, selected: string | null, current: string, now: number): void {
  const known = new Set<string>(state.sectors);
  for (const id of state.sectors) for (const l of SECTOR_MAP[id].links) known.add(l);
  for (const st of state.stations) known.add(st.sector);
  const r = GALAXY_HEX * cam.zoom * 0.94;
  // Verbindungen (Sprungtore)
  for (const s of SECTORS) {
    for (const l of s.links) {
      if (l < s.id) continue;
      const a = sectorCenter(s.id), b = sectorCenter(l);
      const [ax, ay] = cam.toScreen(a.x, a.z), [bx, by] = cam.toScreen(b.x, b.z);
      const x1 = ax + (bx - ax) * 0.3, y1 = ay + (by - ay) * 0.3;
      const x2 = ax + (bx - ax) * 0.7, y2 = ay + (by - ay) * 0.7;
      const active = state.sectors.includes(s.id) || state.sectors.includes(l);
      const seen = known.has(s.id) && known.has(l);
      ctx.save();
      ctx.lineCap = 'round';
      if (active) { ctx.shadowColor = '#ffb547'; ctx.shadowBlur = 10; }
      ctx.strokeStyle = active ? 'rgba(255,181,71,0.85)' : seen ? 'rgba(160,190,200,0.4)' : 'rgba(120,140,150,0.18)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
      // Tore an beiden Enden
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        ctx.fillStyle = active ? '#ffe2b0' : 'rgba(170,190,200,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, active ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (active) { ctx.strokeStyle = 'rgba(255,181,71,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(now / 400) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
      }
      // wandernde Lichter (Verkehr durchs Tor)
      if (active) {
        for (let k = 0; k < 2; k++) {
          const t = ((now / 2600 + k * 0.5 + (s.q + s.r) * 0.13) % 1);
          const dir = k ? 1 - t : t;
          ctx.fillStyle = `rgba(255,236,200,${Math.sin(t * Math.PI).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x1 + (x2 - x1) * dir, y1 + (y2 - y1) * dir, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  for (const s of SECTORS) {
    const c = sectorCenter(s.id);
    const [cx, cy] = cam.toScreen(c.x, c.z);
    const owned = state.sectors.includes(s.id);
    const visible = known.has(s.id);
    const col = FACTIONS[s.faction].color;
    // Füllung: Weltraumbild des Sektors (bekannt) oder Nebel (unerforscht)
    ctx.save();
    hexPath(ctx, cx, cy, r);
    ctx.clip();
    const bg = visible ? sectorLayers(s.id) : undefined;
    if (bg) {
      const k = Math.max((r * 2) / bg.w, (r * 2) / bg.h) * 1.05;
      const drift = Math.sin(now / 9000 + s.q * 1.7 + s.r) * r * 0.04;
      ctx.globalAlpha = owned ? 1 : 0.8;
      ctx.drawImage(bg.base, cx - (bg.w * k) / 2 + drift, cy - (bg.h * k) / 2, bg.w * k, bg.h * k);
      ctx.drawImage(bg.stars, cx - (bg.w * k) / 2 + drift * 1.6, cy - (bg.h * k) / 2, bg.w * k, bg.h * k);
      ctx.globalAlpha = 1;
    } else {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, visible ? rgba(col, 0.16) : 'rgba(60,72,84,0.35)');
      g.addColorStop(1, 'rgba(6,12,18,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    if (!visible) {
      // Nebelschwaden
      for (let i = 0; i < 4; i++) {
        const a = now / (7000 + i * 1300) + i * 1.9 + s.q;
        const fx = cx + Math.cos(a) * r * 0.35, fy = cy + Math.sin(a * 1.3) * r * 0.3;
        const f = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 0.7);
        f.addColorStop(0, 'rgba(120,140,160,0.16)');
        f.addColorStop(1, 'rgba(120,140,160,0)');
        ctx.fillStyle = f;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    // Abdunkeln zum Rand und hinter der Schrift
    const v = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    v.addColorStop(0, owned ? 'rgba(2,8,14,0.12)' : 'rgba(2,8,14,0.25)');
    v.addColorStop(1, owned ? 'rgba(2,8,14,0.55)' : 'rgba(2,8,14,0.7)');
    ctx.fillStyle = v;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    // Rahmen
    hexPath(ctx, cx, cy, r);
    ctx.save();
    if (owned) { ctx.shadowColor = '#3fe0c5'; ctx.shadowBlur = 18; }
    ctx.strokeStyle = owned ? '#3fe0c5' : visible ? rgba(col, 0.8) : 'rgba(120,140,150,0.3)';
    ctx.lineWidth = s.id === selected ? 3.2 : owned ? 2.2 : 1.5;
    if (!owned) ctx.setLineDash(visible ? [8, 6] : [4, 7]);
    ctx.stroke();
    ctx.restore();
    if (s.id === selected) {
      const p = (now % 1600) / 1600;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - p)})`;
      ctx.lineWidth = 2;
      hexPath(ctx, cx, cy, r + p * 14);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = Math.max(12, Math.min(19, r / 8));
    const small = Math.max(10, Math.min(13.5, r / 11));
    if (!visible) {
      ctx.font = `700 ${big * 2.2}px ${FONT}`;
      ctx.fillStyle = `rgba(170,190,200,${0.35 + Math.sin(now / 900 + s.q) * 0.1})`;
      ctx.fillText('?', cx, cy - big * 0.6);
      ctx.font = `600 ${small}px ${FONT}`;
      ctx.fillStyle = '#7d9198';
      ctx.fillText('Unerforscht', cx, cy + big * 0.9);
      continue;
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 6;
    ctx.font = `700 ${big}px ${FONT}`;
    ctx.fillStyle = '#f0fbf8';
    fitText(ctx, s.name, cx, cy - r * 0.34, r * 1.45);
    ctx.font = `600 ${small}px ${FONT}`;
    ctx.fillStyle = rgba(col, 1);
    ctx.fillText(`${FACTIONS[s.faction].short} · ☀ ${s.sunlight} %`, cx, cy - r * 0.34 + big * 1.05);
    ctx.restore();
    // Rohstoffe als Symbole
    const wares = sectorWares(s.id);
    const gs = Math.max(13, Math.min(22, r * 0.13));
    const gap = gs * 1.25;
    wares.forEach((w, i) => {
      ctx.save();
      ctx.translate(cx + (i - (wares.length - 1) / 2) * gap, cy + r * 0.08);
      drawWareGlyph(ctx, w, gs, WARES[w]?.color ?? '#9fd', 0.95);
      ctx.restore();
    });
    // Eigene Stationen, Schiffe, Warnungen
    const sts = state.stations.filter((x) => x.sector === s.id);
    const ships = state.ships.filter((x) => x.sector === s.id).length;
    const warns = sts.reduce((n, st) => n + stationAlerts(state, st).length, 0);
    const bh = Math.max(16, Math.min(22, r * 0.14));
    const items: [string, string][] = [];
    if (sts.length) items.push([`◆ ${sts.length}`, '#3fe0c5']);
    if (ships) items.push([`▲ ${ships}`, '#bff7ec']);
    if (warns) items.push([`⚠ ${warns}`, '#ff9a6b']);
    if (!items.length && !owned) items.push([s.licenseCost ? 'Lizenz erwerbbar' : 'frei', '#9fb4ba']);
    const by = cy + r * 0.38;
    const total = items.reduce((t, [txt, c2]) => t + badge(ctx, 0, 0, bh, txt, c2, false) + 6, -6);
    let bx = cx - total / 2;
    for (const [txt, c2] of items) bx += badge(ctx, bx, by, bh, txt, c2, true) + 6;
    ctx.textAlign = 'center';
    // „Du bist hier“
    if (s.id === current) {
      const py = cy - r * 0.56 + Math.sin(now / 500) * 2;
      ctx.save();
      ctx.shadowColor = '#3fe0c5';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#3fe0c5';
      ctx.beginPath();
      ctx.moveTo(cx, py + 7);
      ctx.lineTo(cx - 6, py - 2);
      ctx.lineTo(cx + 6, py - 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = `700 ${small * 0.85}px ${FONT}`;
      ctx.fillStyle = '#9ff5e5';
      ctx.fillText('DU BIST HIER', cx, py - small);
    }
  }
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

export function galaxyHit(cam: Camera, sx: number, sy: number): string | null {
  const [wx, wz] = cam.toWorld(sx, sy);
  let best: string | null = null;
  let bd = Infinity;
  for (const s of SECTORS) {
    const c = sectorCenter(s.id);
    const d = Math.hypot(c.x - wx, c.z - wz);
    if (d < GALAXY_HEX * 0.9 && d < bd) { bd = d; best = s.id; }
  }
  return best;
}
