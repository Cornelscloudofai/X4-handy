// Zeichnet einen Sektor: Sechseck, Felder, Tore, Stationen, Schiffe, Routen.
import { MODULE_MAP } from '../data/modules';
import { FACTIONS, SECTOR_MAP, SECTOR_RADIUS, gatesOf, hexCorners } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { endpointPlace, fieldById, stationById } from '../engine/logistics';
import type { GameState, Ship, Station } from '../engine/types';
import { hashStr } from '../engine/util';
import type { Selection, UIState } from '../ui/uistate';
import type { Camera } from './camera';
import { backgroundSprite, fieldSprite, rgba } from './sprites';

const C = {
  teal: '#3fe0c5',
  tealDim: 'rgba(63,224,197,0.35)',
  amber: '#ffb547',
  red: '#ff5c6c',
  text: '#e4f3f0',
  muted: '#8aa5ab',
  miner: '#ffc45e',
  trader: '#5ff0d8',
  npc: '#9fb4c8',
};

export const NPC_COLOR: Record<string, string> = { wharf: '#ffb547', defence: '#ff7a6b', factory: '#6fb6ff', habitat: '#8fe08a' };

const FONT = '"Chakra Petch", "Barlow", system-ui, sans-serif';

const SECTOR_TINT: Record<string, [string, string]> = {
  zhin: ['#1f5f8a', '#0e6f66'],
  tkr: ['#7a4a22', '#3b3f6d'],
  cascade: ['#1d6f9c', '#35a07f'],
  ravine: ['#5b2c6f', '#2b3f66'],
  rhy: ['#8a2f2f', '#4a2d5e'],
  hoa: ['#2a5e7a', '#2f7a5a'],
  zyarth: ['#7a2f4a', '#8a5a22'],
};

interface Float { sector: string; x: number; z: number; text: string; color: string; life: number }
interface QLabel { text: string; x: number; ys: number[]; size: number; color: string; weight: number; prio: number; sub?: { text: string; color: string } }
interface Trail { pts: { x: number; z: number }[]; acc: number; sector: string }

export class SectorRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private floats: Float[] = [];
  private trails = new Map<string, Trail>();
  private stars: { x: number; y: number; s: number; a: number }[] = [];
  private labels: QLabel[] = [];
  private obstacles: { x: number; y: number; w: number; h: number }[] = [];

  constructor() {
    for (let i = 0; i < 140; i++) this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 1.6 : 1, a: 0.2 + Math.random() * 0.5 });
  }

  addFloat(sector: string, x: number, z: number, text: string, color: string): void {
    if (this.floats.length > 30) this.floats.shift();
    this.floats.push({ sector, x, z, text, color, life: 1 });
  }

  /** Nur Sternenhimmel und Nebel (auch für die Galaxiekarte) */
  drawBackdrop(ctx: CanvasRenderingContext2D, cam: Camera, sectorId: string, now: number): void {
    const W = cam.w, H = cam.h;
    const key = `${sectorId}:${Math.round(W)}x${Math.round(H)}`;
    if (key !== this.bgKey) {
      this.bg = backgroundSprite(Math.round(W), Math.round(H), hashStr(sectorId), SECTOR_TINT[sectorId] ?? ['#1f5f8a', '#0e6f66']);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg!, 0, 0, W, H);
    ctx.fillStyle = '#cfe9ff';
    for (const s of this.stars) {
      const px = (((s.x * W - cam.x * cam.zoom * 0.08) % W) + W) % W;
      const py = (((s.y * H - cam.z * cam.zoom * 0.08) % H) + H) % H;
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(now / 900 + s.x * 40));
      ctx.fillRect(px, py, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, state: GameState, ui: UIState, cam: Camera, now: number, dt: number): void {
    const sec = SECTOR_MAP[ui.sector];
    const W = cam.w, H = cam.h;
    this.drawBackdrop(ctx, cam, ui.sector, now);
    this.labels = [];
    this.obstacles = [];

    this.drawHex(ctx, cam, sec.faction === 'zya' ? '#ff8a5c' : C.amber, state.sectors.includes(ui.sector));

    // Felder
    for (const f of sec.fields) {
      const [sx, sy] = cam.toScreen(f.x, f.z);
      const rad = f.r * cam.zoom;
      if (sx + rad * 1.4 < 0 || sx - rad * 1.4 > W || sy + rad * 1.4 < 0 || sy - rad * 1.4 > H) continue;
      // Felder ohne Umrandung: weich auslaufende Wolken bzw. Gesteinshaufen
      const spr = fieldSprite(f.id, f.ware, hashStr(f.id));
      const size = rad * 2 * 1.3;
      const color = WARES[f.ware].color;
      const sel = ui.selection?.kind === 'field' && ui.selection.id === f.id;
      if (sel) {
        const g = ctx.createRadialGradient(sx, sy, rad * 0.2, sx, sy, rad * 1.25);
        g.addColorStop(0, rgba(color, 0.22));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, rad * 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ui.reducedMotion ? 0 : now / 400000);
      ctx.globalAlpha = sel ? 1 : 0.92;
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
      this.labels.push({ text: WARES[f.ware].name, x: sx, ys: [sy + rad * 0.15, sy - rad * 0.55, sy + rad * 0.7], size: 12, color: rgba(color, 0.95), weight: 600, prio: 2,
        sub: f.richness !== 1 && cam.zoom > 1.4 ? { text: `Ertrag ${Math.round(f.richness * 100)} %`, color: C.muted } : undefined });
    }

    // Tore
    for (const g of gatesOf(sec.id)) {
      const [sx, sy] = cam.toScreen(g.x, g.z);
      const target = SECTOR_MAP[g.to];
      const owned = state.sectors.includes(g.to);
      const sel = ui.selection?.kind === 'gate' && ui.selection.id === g.to;
      ctx.save();
      ctx.translate(sx, sy);
      const pulse = 0.5 + 0.5 * Math.sin(now / 500);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      grad.addColorStop(0, rgba(C.amber, 0.45 + pulse * 0.2));
      grad.addColorStop(1, rgba(C.amber, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const ox = Math.cos(g.angle), oz = Math.sin(g.angle);
      const lx = sx - ox * 26, ly = sy - oz * 22;
      this.labels.push({ text: target.name, x: lx, ys: [ly, ly - 14, ly + 14], size: 11, color: owned ? '#ffd9a0' : C.muted, weight: 600, prio: 1 });
    }

    // Handelsposten
    {
      const ts = sec.tradeStation;
      const [sx, sy] = cam.toScreen(ts.x, ts.z);
      const sel = ui.selection?.kind === 'trade';
      this.drawTradeStation(ctx, sx, sy, cam.zoom, now, FACTIONS[sec.faction].color, sel);
      const off = 24 + Math.min(40, cam.zoom * 2);
      this.labels.push({ text: ts.name, x: sx, ys: [sy + off, sy - off], size: 12, color: '#ffd9a0', weight: 600, prio: 3 });
      this.obstacles.push({ x: sx - 16, y: sy - 16, w: 32, h: 32 });
    }

    // NPC-Käuferstationen
    for (const n of sec.npcStations) {
      const [sx, sy] = cam.toScreen(n.x, n.z);
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
      const col = NPC_COLOR[n.kind];
      const sel = ui.selection?.kind === 'npcst' && ui.selection.id === n.id;
      const r = Math.max(8, Math.min(26, cam.zoom * 1.8));
      ctx.save();
      ctx.translate(sx, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      g.addColorStop(0, rgba(col, 0.28));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(now / 14000);
      ctx.fillStyle = '#0d1822';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (sel) this.selectionRing(ctx, sx, sy, r + 4, now, col);
      this.labels.push({ text: n.name, x: sx, ys: [sy + r + 12, sy - r - 12], size: 11, color: rgba(col, 0.95), weight: 600, prio: 2 });
      this.obstacles.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
    }

    // Versorgungslinien und Flugrouten
    if (ui.routes) this.drawRoutes(ctx, state, ui, cam, now);

    // Stationen
    for (const st of state.stations) {
      if (st.sector !== sec.id) continue;
      this.drawStation(ctx, st, cam, now, ui.selection?.kind === 'station' && ui.selection.id === st.id);
    }

    // NPC-Schiffe
    for (const n of state.npcs) {
      if (n.sector !== sec.id) continue;
      if (n.phase === 'docked') continue;
      const [sx, sy] = cam.toScreen(n.x, n.z);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      this.trail(n.id, sec.id, n.x, n.z, dt);
      this.drawTrail(ctx, cam, n.id, n.kind === 'courier' ? C.teal : '#9fc3ff', 0.35);
      const col = n.kind === 'courier' ? C.teal : n.kind === 'traffic' ? `hsl(${n.hue},25%,70%)` : C.npc;
      this.drawShipGlyph(ctx, sx, sy, n.heading, 3.6, col, false);
    }

    // Eigene Schiffe
    const selShip = ui.selection?.kind === 'ship' ? ui.selection.id : '';
    for (const s of state.ships) {
      if (s.sector !== sec.id) continue;
      const cls = SHIP_MAP[s.cls];
      const docked = s.phase === 'docking' || s.phase === 'unloading' || (s.phase === 'waiting' && !s.path.length);
      const [sx, sy] = cam.toScreen(s.x, s.z);
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
      const color = cls.role === 'miner' ? C.miner : C.trader;
      if (!docked) {
        this.trail(s.id, sec.id, s.x, s.z, dt);
        this.drawTrail(ctx, cam, s.id, color, 0.6);
      }
      if (s.phase === 'mining') this.drawMiningBeam(ctx, s, sx, sy, cam, now);
      const size = cls.size === 'L' ? 6.5 : cls.size === 'M' ? 5 : 4;
      this.drawShipGlyph(ctx, sx, sy, s.heading, size * Math.min(1.8, Math.max(1, cam.zoom / 3)), color, true, docked ? 0.6 : 1);
      if (s.id === selShip) this.selectionRing(ctx, sx, sy, 14, now, color);
      if (s.cargo && !docked && cam.zoom > 1.2) {
        ctx.fillStyle = WARES[s.cargo.ware].color;
        ctx.beginPath();
        ctx.arc(sx + 7, sy - 7, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.flushLabels(ctx);

    // Schwebende Texte (Verkäufe)
    for (const f of this.floats) {
      f.life -= dt / 2.2;
      if (f.sector !== sec.id) continue;
      const [sx, sy] = cam.toScreen(f.x, f.z);
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      this.label(ctx, f.text, sx, sy - 30 - (1 - f.life) * 40, 12, f.color, 700);
      ctx.globalAlpha = 1;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    // Platzierungsvorschau
    if (ui.placing && ui.placing.x !== undefined) {
      const [sx, sy] = cam.toScreen(ui.placing.x, ui.placing.z);
      const col = ui.placing.valid ? C.teal : C.red;
      ctx.strokeStyle = col;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -now / 60;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      this.coreIcon(ctx, sx, sy, 12, col, 0.8);
      ctx.strokeStyle = rgba(col, 0.4);
      ctx.beginPath();
      ctx.moveTo(sx - 34, sy); ctx.lineTo(sx - 26, sy);
      ctx.moveTo(sx + 26, sy); ctx.lineTo(sx + 34, sy);
      ctx.moveTo(sx, sy - 34); ctx.lineTo(sx, sy - 26);
      ctx.moveTo(sx, sy + 26); ctx.lineTo(sx, sy + 34);
      ctx.stroke();
    }
    this.cleanupTrails(state);
  }

  // ---------- Bausteine ----------

  /** Beschriftungen ohne Überlappung setzen: wichtige zuerst, sonst Ausweichposition oder weglassen */
  private flushLabels(ctx: CanvasRenderingContext2D): void {
    const placed = [...this.obstacles];
    const hit = (r: { x: number; y: number; w: number; h: number }) =>
      placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    this.labels.sort((a, b) => b.prio - a.prio);
    for (const l of this.labels) {
      ctx.font = `${l.weight} ${l.size}px ${FONT}`;
      const w = ctx.measureText(l.text).width + 6;
      const h = l.size + 4 + (l.sub ? 13 : 0);
      let chosen: number | null = null;
      for (const y of l.ys) {
        const r = { x: l.x - w / 2, y: y - l.size / 2 - 2, w, h };
        if (!hit(r)) { chosen = y; placed.push(r); break; }
      }
      if (chosen === null) {
        if (l.prio < 3) continue;
        chosen = l.ys[0];
      }
      this.label(ctx, l.text, l.x, chosen, l.size, l.color, l.weight);
      if (l.sub) this.label(ctx, l.sub.text, l.x, chosen + 14, 10, l.sub.color, 500);
    }
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 600, shadow = true): void {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (shadow) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(2,8,16,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private drawHex(ctx: CanvasRenderingContext2D, cam: Camera, color: string, owned: boolean): void {
    const pts = hexCorners(SECTOR_RADIUS).map((p) => cam.toScreen(p.x, p.z));
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(20,60,80,0.10)';
    ctx.fill();
    ctx.clip();
    // Raster
    const step = cam.zoom > 3 ? 10 : 25;
    ctx.strokeStyle = 'rgba(63,224,197,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = -SECTOR_RADIUS; v <= SECTOR_RADIUS; v += step) {
      const [x1, y1] = cam.toScreen(v, -SECTOR_RADIUS);
      const [x2, y2] = cam.toScreen(v, SECTOR_RADIUS);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      const [x3, y3] = cam.toScreen(-SECTOR_RADIUS, v);
      const [x4, y4] = cam.toScreen(SECTOR_RADIUS, v);
      ctx.moveTo(x3, y3); ctx.lineTo(x4, y4);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(63,224,197,0.16)';
    ctx.beginPath();
    const [a1, b1] = cam.toScreen(0, -SECTOR_RADIUS), [a2, b2] = cam.toScreen(0, SECTOR_RADIUS);
    const [a3, b3] = cam.toScreen(-SECTOR_RADIUS, 0), [a4, b4] = cam.toScreen(SECTOR_RADIUS, 0);
    ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.moveTo(a3, b3); ctx.lineTo(a4, b4);
    ctx.stroke();
    ctx.restore();
    // Rand mit Leuchten
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = rgba(color, owned ? 0.9 : 0.45);
    ctx.lineWidth = 1.6;
    if (!owned) ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private coreIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(6,20,30,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    const d = r * 0.5;
    ctx.moveTo(0, -d); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.lineTo(-d, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private selectionRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, color: string): void {
    const p = (now % 1600) / 1600;
    ctx.strokeStyle = rgba(color, 0.9 * (1 - p));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + p * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.9);
    ctx.lineWidth = 1.5;
    const seg = Math.PI / 6;
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + now / 1500;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, a - seg / 2, a + seg / 2);
      ctx.stroke();
    }
  }

  private drawTradeStation(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, now: number, color: string, sel: boolean): void {
    const r = Math.max(13, Math.min(60, zoom * 3.2));
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    glow.addColorStop(0, rgba(color, 0.35));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(now / 9000);
    // Ring
    ctx.strokeStyle = rgba(color, 0.9);
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10,20,30,0.9)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      ctx.lineTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
      ctx.stroke();
    }
    // Speichen
    ctx.strokeStyle = rgba(color, 0.55);
    ctx.lineWidth = Math.max(1, r * 0.07);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.fillStyle = '#1b1208';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = Math.cos(a) * r * 0.42, py = Math.sin(a) * r * 0.42;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Blinklichter
    const blink = Math.sin(now / 300) > 0.6;
    if (blink) {
      ctx.fillStyle = '#fff1c9';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.fillRect(Math.cos(a) * r - 1.5, Math.sin(a) * r - 1.5, 3, 3);
      }
    }
    ctx.restore();
    if (sel) this.selectionRing(ctx, x, y, r + 6, now, color);
  }

  private drawStation(ctx: CanvasRenderingContext2D, st: Station, cam: Camera, now: number, selected: boolean): void {
    const [sx, sy] = cam.toScreen(st.x, st.z);
    if (sx < -80 || sx > cam.w + 80 || sy < -80 || sy > cam.h + 80) return;
    const problem = st.modules.some((m) => m.stall === 'input');
    const color = problem ? C.amber : C.teal;
    const detail = cam.zoom >= 2.6;
    // Leuchten
    const gr = detail ? Math.min(110, stationScale(cam.zoom) * 6) : 34;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
    glow.addColorStop(0, rgba(color, 0.32));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, gr, 0, Math.PI * 2);
    ctx.fill();
    if (detail) this.drawStationStructure(ctx, st, sx, sy, cam.zoom, now);
    else {
      const pulse = 0.5 + 0.5 * Math.sin(now / 700);
      ctx.strokeStyle = rgba(color, 0.25 + pulse * 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 20 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      this.coreIcon(ctx, sx, sy, 13, color);
    }
    // Bau-Fortschritt
    if (st.build) {
      const p = 1 - st.build.remaining / st.build.total;
      const r = detail ? Math.min(90, stationScale(cam.zoom) * 4.6) : 18;
      ctx.strokeStyle = rgba(C.amber, 0.25);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = C.amber;
      ctx.beginPath();
      ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
      // Baudrohnen
      for (let i = 0; i < 3; i++) {
        const a = now / 700 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(sx + Math.cos(a) * (r + 5) - 1, sy + Math.sin(a) * (r + 5) - 1, 2.2, 2.2);
      }
    }
    if (selected) this.selectionRing(ctx, sx, sy, detail ? Math.min(94, stationScale(cam.zoom) * 4.9) : 22, now, color);
    const ly = sy + (detail ? Math.min(106, stationScale(cam.zoom) * 5.6) : 30);
    this.labels.push({ text: st.name, x: sx, ys: [ly, sy - (ly - sy)], size: 14, color: problem ? '#ffd28a' : '#bff7ec', weight: 700, prio: 4 });
    this.obstacles.push({ x: sx - 16, y: sy - 16, w: 32, h: 32 });
    if (problem) {
      this.warnBadge(ctx, sx + (detail ? Math.min(70, stationScale(cam.zoom) * 3.6) : 16), sy - (detail ? Math.min(70, stationScale(cam.zoom) * 3.6) : 16));
    }
  }

  private warnBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x - 7, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a1206';
    ctx.fillRect(x - 0.9, y - 3, 1.8, 4.5);
    ctx.fillRect(x - 0.9, y + 2.4, 1.8, 1.6);
  }

  /** Detaillierte Stationsansicht: Module an vier Armen um den Kern */
  private drawStationStructure(ctx: CanvasRenderingContext2D, st: Station, sx: number, sy: number, zoom: number, now: number): void {
    const rot = ((hashStr(st.id) % 90) * Math.PI) / 180;
    const mods = st.modules.filter((m) => MODULE_MAP[m.def]?.kind !== 'core');
    const unit = stationScale(zoom); // Pixel je Moduleinheit (Stationen etwas überhöht dargestellt)
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    const arms = 4;
    // Verbindungsträger
    ctx.strokeStyle = 'rgba(150,200,210,0.55)';
    ctx.lineWidth = Math.max(1.5, unit * 0.18);
    for (let a = 0; a < arms; a++) {
      const n = Math.ceil((mods.length - a) / arms);
      if (n <= 0) continue;
      const ang = (a * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * unit * (n * 1.25 + 0.2), Math.sin(ang) * unit * (n * 1.25 + 0.2));
      ctx.stroke();
    }
    mods.forEach((m, i) => {
      const d = MODULE_MAP[m.def];
      const arm = i % arms;
      const slot = Math.floor(i / arms) + 1;
      const ang = (arm * Math.PI) / 2;
      const px = Math.cos(ang) * unit * slot * 1.25, py = Math.sin(ang) * unit * slot * 1.25;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      const w = unit * 1.0, h = unit * 0.72;
      if (d.kind === 'storage') {
        const col = d.storage === 'Liquid' ? '#5fb4ff' : d.storage === 'Solid' ? '#d9924a' : '#9fb8c6';
        for (const off of [-0.2, 0.2]) {
          ctx.fillStyle = '#1a2a36';
          ctx.strokeStyle = rgba(col, 0.9);
          ctx.lineWidth = Math.max(1, unit * 0.06);
          ctx.beginPath();
          ctx.arc(off * unit, 0, unit * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (d.kind === 'dock' || d.kind === 'pier') {
        ctx.fillStyle = '#1b2c38';
        ctx.strokeStyle = 'rgba(160,220,230,0.8)';
        ctx.lineWidth = Math.max(1, unit * 0.05);
        const L = d.kind === 'pier' ? 1.3 : 0.9;
        ctx.fillRect(-w * 0.2, -h * L * 0.5, w * 0.4, h * L);
        ctx.strokeRect(-w * 0.2, -h * L * 0.5, w * 0.4, h * L);
        const blink = Math.floor(now / 400 + i) % 3 === 0;
        ctx.fillStyle = blink ? '#9fffe8' : 'rgba(159,255,232,0.3)';
        for (let k = -1; k <= 1; k++) ctx.fillRect(w * 0.22, k * h * L * 0.3 - 1, 2.2, 2.2);
      } else {
        const col = d.ware ? WARES[d.ware].color : C.teal;
        ctx.fillStyle = '#16242f';
        ctx.strokeStyle = 'rgba(170,210,220,0.6)';
        ctx.lineWidth = Math.max(1, unit * 0.05);
        roundRect(ctx, -w / 2, -h / 2, w, h, unit * 0.12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = m.running ? col : rgba(col, 0.35);
        if (m.running) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
        ctx.fillRect(-w * 0.38, -h * 0.14, w * 0.76, h * 0.28);
        ctx.shadowBlur = 0;
        if (d.ware === 'energycells') {
          ctx.fillStyle = 'rgba(40,90,160,0.9)';
          ctx.fillRect(-w * 0.5, -h * 1.1, w, h * 0.5);
          ctx.fillRect(-w * 0.5, h * 0.6, w, h * 0.5);
          ctx.strokeStyle = 'rgba(140,200,255,0.5)';
          ctx.strokeRect(-w * 0.5, -h * 1.1, w, h * 0.5);
          ctx.strokeRect(-w * 0.5, h * 0.6, w, h * 0.5);
        }
      }
      ctx.restore();
    });
    ctx.restore();
    // Kern
    this.coreIcon(ctx, sx, sy, Math.max(8, unit * 0.55), C.teal);
  }

  private drawShipGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number, color: string, own: boolean, alpha = 1): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(heading);
    if (own) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 1.3, 0);
    ctx.lineTo(-size * 0.9, size * 0.8);
    ctx.lineTo(-size * 0.45, 0);
    ctx.lineTo(-size * 0.9, -size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private trail(id: string, sector: string, x: number, z: number, dt: number): void {
    let t = this.trails.get(id);
    if (!t || t.sector !== sector) {
      t = { pts: [], acc: 0, sector };
      this.trails.set(id, t);
    }
    t.acc += dt;
    const last = t.pts[t.pts.length - 1];
    if (!last || (t.acc > 0.08 && Math.hypot(last.x - x, last.z - z) > 0.3)) {
      if (last && Math.hypot(last.x - x, last.z - z) > 60) t.pts = [];
      t.pts.push({ x, z });
      t.acc = 0;
      if (t.pts.length > 16) t.pts.shift();
    }
  }

  private drawTrail(ctx: CanvasRenderingContext2D, cam: Camera, id: string, color: string, alpha: number): void {
    const t = this.trails.get(id);
    if (!t || t.pts.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < t.pts.length; i++) {
      const [x1, y1] = cam.toScreen(t.pts[i - 1].x, t.pts[i - 1].z);
      const [x2, y2] = cam.toScreen(t.pts[i].x, t.pts[i].z);
      ctx.strokeStyle = rgba(color, (i / t.pts.length) * alpha * 0.6);
      ctx.lineWidth = 1 + (i / t.pts.length) * 1.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  private cleanupTrails(state: GameState): void {
    if (this.trails.size < 150) return;
    const alive = new Set([...state.ships.map((s) => s.id), ...state.npcs.map((n) => n.id)]);
    for (const k of this.trails.keys()) if (!alive.has(k)) this.trails.delete(k);
  }

  private drawMiningBeam(ctx: CanvasRenderingContext2D, s: Ship, sx: number, sy: number, cam: Camera, now: number): void {
    const info = fieldById(s.miningField);
    if (!info) return;
    const color = WARES[info.field.ware].color;
    const h = hashStr(s.id);
    const a = ((h % 360) * Math.PI) / 180 + Math.sin(now / 900 + h) * 0.4;
    const len = Math.max(8, cam.zoom * 1.6);
    const tx = sx + Math.cos(a) * len, ty = sy + Math.sin(a) * len;
    const flick = 0.5 + 0.5 * Math.sin(now / 60 + h);
    ctx.strokeStyle = rgba(color, 0.4 + flick * 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.6 + flick * 0.4);
    ctx.beginPath();
    ctx.arc(tx, ty, 1.8 + flick, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRoutes(ctx: CanvasRenderingContext2D, state: GameState, ui: UIState, cam: Camera, now: number): void {
    const selStation = ui.selection?.kind === 'station' ? ui.selection.id : '';
    const selShip = ui.selection?.kind === 'ship' ? ui.selection.id : '';
    // Feste Versorgungslinien: Linie mit fließenden Punkten
    for (const s of state.ships) {
      if (s.mode !== 'route' || !s.route) continue;
      const a = endpointPlace(state, s.route.from), b = endpointPlace(state, s.route.to);
      if (!a || !b || a.sector !== ui.sector || b.sector !== ui.sector) continue;
      const hl = s.id === selShip || s.home === selStation;
      this.flowLine(ctx, cam, a.x, a.z, b.x, b.z, WARES[s.route.ware].color, now, hl ? 0.95 : 0.55, true);
    }
    // Aktuelle Flüge
    for (const s of state.ships) {
      if (s.sector !== ui.sector || !s.path.length) continue;
      const cls = SHIP_MAP[s.cls];
      const hl = s.id === selShip || s.home === selStation;
      if (!hl && !selShip && !selStation && state.ships.length > 12) continue;
      const color = cls.role === 'miner' ? C.miner : C.trader;
      ctx.setLineDash([6, 7]);
      ctx.lineDashOffset = -now / 50;
      ctx.strokeStyle = rgba(color, hl ? 0.85 : 0.3);
      ctx.lineWidth = hl ? 1.8 : 1;
      ctx.beginPath();
      let [px, py] = cam.toScreen(s.x, s.z);
      ctx.moveTo(px, py);
      let endX = px, endY = py;
      for (const p of s.path) {
        if (p.sector !== ui.sector) break;
        [px, py] = cam.toScreen(p.x, p.z);
        ctx.lineTo(px, py);
        endX = px; endY = py;
        if (p.gateTo) break;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (hl) this.arrowHead(ctx, endX, endY, s.path.length > 0 ? Math.atan2(endY - cam.toScreen(s.x, s.z)[1], endX - cam.toScreen(s.x, s.z)[0]) : 0, color);
    }
    // Zuordnung Miner → Feld der ausgewählten Station
    if (selStation) {
      const st = stationById(state, selStation);
      if (st && st.sector === ui.sector) {
        const fields = new Set(state.ships.filter((s) => s.home === st.id && s.miningField).map((s) => s.miningField));
        for (const fid of fields) {
          const info = fieldById(fid);
          if (!info || info.sector.id !== ui.sector) continue;
          this.flowLine(ctx, cam, info.field.x, info.field.z, st.x, st.z, WARES[info.field.ware].color, now, 0.7, false);
        }
      }
    }
  }

  private arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-9, 5);
    ctx.lineTo(-9, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private flowLine(ctx: CanvasRenderingContext2D, cam: Camera, ax: number, az: number, bx: number, bz: number, color: string, now: number, alpha: number, curved: boolean): void {
    const [x1, y1] = cam.toScreen(ax, az);
    const [x2, y2] = cam.toScreen(bx, bz);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
    const bend = curved ? len * 0.12 : 0;
    const cx = mx + nx * bend, cy = my + ny * bend;
    ctx.strokeStyle = rgba(color, alpha * 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    ctx.setLineDash([2, 10]);
    ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- Treffertest ----------

  hitTest(state: GameState, ui: UIState, cam: Camera, sx: number, sy: number): Selection | null {
    const sec = SECTOR_MAP[ui.sector];
    let best: { sel: Selection; d: number } | null = null;
    const consider = (sel: Selection, x: number, z: number, radius: number) => {
      const [px, py] = cam.toScreen(x, z);
      const d = Math.hypot(px - sx, py - sy);
      if (d <= radius && (!best || d < best.d)) best = { sel, d };
    };
    // Fliegende Schiffe zuerst, angedockte Schiffe treten hinter die Station zurück
    const docked = (s: GameState['ships'][number]) => !s.path.length && s.phase !== 'mining';
    for (const s of state.ships) if (s.sector === ui.sector && !docked(s)) consider({ kind: 'ship', id: s.id }, s.x, s.z, 16);
    if (best) return (best as { sel: Selection }).sel;
    for (const st of state.stations) if (st.sector === ui.sector) consider({ kind: 'station', id: st.id }, st.x, st.z, Math.max(28, Math.min(90, stationScale(cam.zoom) * 4.5)));
    if (best) return (best as { sel: Selection }).sel;
    for (const s of state.ships) if (s.sector === ui.sector && docked(s)) consider({ kind: 'ship', id: s.id }, s.x, s.z, 12);
    consider({ kind: 'trade', id: sec.id }, sec.tradeStation.x, sec.tradeStation.z, Math.max(26, Math.min(60, cam.zoom * 3.5)));
    for (const n of sec.npcStations) consider({ kind: 'npcst', id: n.id }, n.x, n.z, 24);
    for (const g of gatesOf(sec.id)) consider({ kind: 'gate', id: g.to }, g.x, g.z, 26);
    if (best) return (best as { sel: Selection }).sel;
    for (const f of sec.fields) consider({ kind: 'field', id: f.id }, f.x, f.z, Math.max(24, f.r * cam.zoom));
    return best ? (best as { sel: Selection }).sel : null;
  }
}

/** Stationen werden überhöht gezeichnet, damit ihre Module schon bei mittlerem Zoom erkennbar sind */
function stationScale(zoom: number): number {
  return Math.min(36, zoom * 2.2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
