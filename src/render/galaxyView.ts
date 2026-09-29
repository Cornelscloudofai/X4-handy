// Galaxiekarte: Sektoren als Sechsecke mit Sprungtor-Verbindungen
import { FACTIONS, SECTORS, SECTOR_MAP, hexCorners } from '../data/sectors';
import type { GameState } from '../engine/types';
import type { Camera } from './camera';
import { rgba } from './sprites';

const FONT = '"Chakra Petch", "Barlow", system-ui, sans-serif';
export const GALAXY_HEX = 100;

export function sectorCenter(id: string): { x: number; z: number } {
  const s = SECTOR_MAP[id];
  return { x: GALAXY_HEX * 1.5 * s.q, z: GALAXY_HEX * Math.sqrt(3) * (s.r + s.q / 2) };
}

export function drawGalaxy(ctx: CanvasRenderingContext2D, state: GameState, cam: Camera, selected: string | null, current: string, now: number): void {
  const known = new Set<string>(state.sectors);
  for (const id of state.sectors) for (const l of SECTOR_MAP[id].links) known.add(l);
  // Verbindungen
  for (const s of SECTORS) {
    for (const l of s.links) {
      if (l < s.id) continue;
      // Sprungtor-Verbindung über die gemeinsame Sechseckkante
      const a = sectorCenter(s.id), b = sectorCenter(l);
      const [ax, ay] = cam.toScreen(a.x, a.z), [bx, by] = cam.toScreen(b.x, b.z);
      const x1 = ax + (bx - ax) * 0.36, y1 = ay + (by - ay) * 0.36;
      const x2 = ax + (bx - ax) * 0.64, y2 = ay + (by - ay) * 0.64;
      const active = state.sectors.includes(s.id) || state.sectors.includes(l);
      ctx.strokeStyle = active ? 'rgba(255,181,71,0.8)' : 'rgba(140,160,170,0.3)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.fillStyle = active ? '#ffcf85' : 'rgba(160,180,190,0.5)';
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (const s of SECTORS) {
    const c = sectorCenter(s.id);
    const [cx, cy] = cam.toScreen(c.x, c.z);
    const owned = state.sectors.includes(s.id);
    const visible = known.has(s.id);
    const col = FACTIONS[s.faction].color;
    const r = GALAXY_HEX * cam.zoom * 0.94;
    const pts = hexCorners(r);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(cx + p.x, cy + p.z) : ctx.moveTo(cx + p.x, cy + p.z)));
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, owned ? 'rgba(63,224,197,0.22)' : visible ? rgba(col, 0.12) : 'rgba(40,50,60,0.25)');
    g.addColorStop(1, owned ? 'rgba(63,224,197,0.05)' : 'rgba(10,20,30,0.35)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    if (owned) { ctx.shadowColor = '#3fe0c5'; ctx.shadowBlur = 16; }
    ctx.strokeStyle = owned ? '#3fe0c5' : visible ? rgba(col, 0.75) : 'rgba(120,140,150,0.3)';
    ctx.lineWidth = s.id === selected ? 3 : 1.6;
    if (!owned) ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    if (s.id === selected) {
      const p = (now % 1600) / 1600;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      hexCorners(r + p * 12).forEach((q, i) => (i ? ctx.lineTo(cx + q.x, cy + q.z) : ctx.moveTo(cx + q.x, cy + q.z)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = Math.max(11, Math.min(16, r / 5.5));
    const small = Math.max(9.5, Math.min(12, r / 7.5));
    ctx.font = `700 ${big}px ${FONT}`;
    ctx.fillStyle = visible ? '#e4f3f0' : '#6c7f86';
    fitText(ctx, visible ? s.name : 'Unerforscht', cx, cy - big * 0.9, r * 1.5);
    ctx.font = `600 ${small}px ${FONT}`;
    ctx.fillStyle = visible ? rgba(col, 0.95) : '#55666c';
    ctx.fillText(FACTIONS[s.faction].short + (visible ? ` · ${s.sunlight} % Sonne` : ''), cx, cy + small * 0.5);
    const stations = state.stations.filter((x) => x.sector === s.id).length;
    ctx.fillStyle = owned ? '#9ff5e5' : '#8aa5ab';
    ctx.fillText(owned ? `${stations} Station${stations === 1 ? '' : 'en'}` : visible ? 'Lizenz erwerbbar' : '', cx, cy + small * 2);
    if (s.id === current) {
      ctx.fillStyle = '#3fe0c5';
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.5, 4, 0, Math.PI * 2);
      ctx.fill();
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
