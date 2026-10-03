// Zeichnet einen Sektor: Sechseck, Felder, Tore, Stationen, Schiffe, Routen.
import { MODULE_MAP } from '../data/modules';
import { FACTIONS, SECTOR_MAP, SECTOR_RADIUS, gatesOf, hexCorners } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { endpointPlace, fieldById, stationById } from '../engine/logistics';
import { buildProgress, storageCap, usedVolume } from '../engine/economy';
import type { GameState, ModuleDef, Ship, Station } from '../engine/types';
import { hashStr } from '../engine/util';
import type { Selection, UIState } from '../ui/uistate';
import type { Camera } from './camera';
import { fmtCr } from '../ui/format';
import { Effects } from './effects';
import { drawRockField } from './fields';
import { layoutReach, layoutStation, stationStyle } from './stationLayout';
import { backgroundSprite, fieldSprite, isGas, rgba } from './sprites';

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

interface Float { sector: string; x: number; z: number; value: number; life: number; row: number }
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
  private fx = new Effects();

  constructor() {
    for (let i = 0; i < 140; i++) this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 1.6 : 1, a: 0.2 + Math.random() * 0.5 });
  }

  /**
   * Betrag über einem Ort einblenden. Mehrere Käufe bzw. Verkäufe an derselben Stelle werden zusammengezählt
   * (je eine Zeile für Einnahmen und Ausgaben) – statt einer ganzen Zahlenkolonne.
   */
  addFloat(sector: string, x: number, z: number, value: number): void {
    const same = this.floats.find((f) => f.sector === sector && f.life > 0.35 && Math.sign(f.value) === Math.sign(value) && Math.hypot(f.x - x, f.z - z) < 8);
    if (same) {
      same.value += value;
      same.life = 1;
      return;
    }
    if (this.floats.length > 30) this.floats.shift();
    const other = this.floats.some((f) => f.sector === sector && f.life > 0.35 && Math.hypot(f.x - x, f.z - z) < 8);
    this.floats.push({ sector, x, z, value, life: 1, row: other ? 1 : 0 });
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
    const motion = !ui.reducedMotion;
    this.fx.enabled = motion;
    this.fx.update(dt);
    const s = cam.iconScale();
    const rel = cam.zoom / (cam.fitZoom || 1);
    this.drawBackdrop(ctx, cam, ui.sector, now);
    this.labels = [];
    this.obstacles = [];

    this.drawHex(ctx, cam, sec.faction === 'zya' ? '#ff8a5c' : C.amber, state.sectors.includes(ui.sector), s);

    // Felder: Gas als driftender Schleier, Gestein als Brockenwolke
    for (const f of sec.fields) {
      const [sx, sy] = cam.toScreen(f.x, f.z);
      const rad = f.r * cam.zoom;
      if (sx + rad * 1.4 < 0 || sx - rad * 1.4 > W || sy + rad * 1.4 < 0 || sy - rad * 1.4 > H) continue;
      const size = rad * 2 * 1.3;
      const color = WARES[f.ware].color;
      const sel = ui.selection?.kind === 'field' && ui.selection.id === f.id;
      if (sel) {
        const g = ctx.createRadialGradient(sx, sy, rad * 0.2, sx, sy, rad * 1.25);
        g.addColorStop(0, rgba(color, 0.18));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, rad * 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
      const t = motion ? now : 0;
      // Parallaxe: beim Heranzoomen stärker – die Ebenen gleiten beim Verschieben gegeneinander
      const parallax = Math.min(0.45, 0.15 + 0.08 * rel);
      if (isGas(f.ware)) {
        for (const layer of [0, 1]) {
          const spr = fieldSprite(f.id, f.ware, hashStr(f.id), layer);
          const depth = layer ? 1.1 : 0.9;
          const ox = (sx - W / 2) * (depth - 1) * parallax, oy = (sy - H / 2) * (depth - 1) * parallax;
          const breathe = 1 + (layer ? 0.05 : 0.03) * Math.sin(t / (layer ? 9000 : 13000) + layer * 2);
          ctx.save();
          ctx.translate(sx + ox, sy + oy);
          ctx.rotate((layer ? -1 : 1) * t / (layer ? 160000 : 240000));
          ctx.scale(breathe * depth, depth / breathe);
          ctx.globalAlpha = (sel ? 1 : 0.9) * (layer ? 0.8 : 1);
          ctx.drawImage(spr, -size / 2, -size / 2, size, size);
          ctx.restore();
        }
      } else {
        drawRockField(ctx, cam, f, hashStr(f.id), 0, sel, parallax);
      }
      // Feldnamen erst beim Heranzoomen (Gesamtansicht bleibt ruhig)
      if (rel >= 1.5 || sel) {
        this.labels.push({ text: WARES[f.ware].name, x: sx, ys: [sy + rad * 0.15, sy - rad * 0.55, sy + rad * 0.7], size: 12, color: rgba(color, 0.95), weight: 600, prio: 2,
          sub: f.richness !== 1 && rel > 2 ? { text: `Ertrag ${Math.round(f.richness * 100)} %`, color: C.muted } : undefined });
      }
    }

    // Tore: rotierender Ring
    for (const g of gatesOf(sec.id)) {
      const [sx, sy] = cam.toScreen(g.x, g.z);
      const target = SECTOR_MAP[g.to];
      const owned = state.sectors.includes(g.to);
      const sel = ui.selection?.kind === 'gate' && ui.selection.id === g.to;
      this.drawGate(ctx, sx, sy, s, motion ? now : 0, sel);
      const ox = Math.cos(g.angle), oz = Math.sin(g.angle);
      const lx = sx - ox * 26 * s, ly = sy - oz * 22 * s;
      this.labels.push({ text: target.name, x: lx, ys: [ly, ly - 14, ly + 14], size: rel < 1.5 ? 10 : 11, color: owned ? '#ffd9a0' : C.muted, weight: 600, prio: 1 });
    }

    // Handelsposten
    {
      const ts = sec.tradeStation;
      const [sx, sy] = cam.toScreen(ts.x, ts.z);
      const sel = ui.selection?.kind === 'trade';
      const r = Math.max(13 * s, Math.min(60, cam.zoom * 3.2));
      this.drawTradeStation(ctx, sx, sy, r, motion ? now : 0, FACTIONS[sec.faction].color, sel);
      const off = r + 10;
      this.labels.push({ text: ts.name, x: sx, ys: [sy + off, sy - off], size: rel < 1.5 ? 11 : 12, color: '#ffd9a0', weight: 600, prio: 3 });
      this.obstacles.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
    }

    // NPC-Käuferstationen
    for (const n of sec.npcStations) {
      const [sx, sy] = cam.toScreen(n.x, n.z);
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
      const col = NPC_COLOR[n.kind];
      const sel = ui.selection?.kind === 'npcst' && ui.selection.id === n.id;
      const r = Math.max(8 * s, Math.min(26, cam.zoom * 1.8));
      ctx.save();
      ctx.translate(sx, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      g.addColorStop(0, rgba(col, 0.22));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(motion ? now / 14000 : 0);
      ctx.fillStyle = '#0d1822';
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.2, 1.8 * s);
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
      if (rel >= 1.5 || sel) this.labels.push({ text: n.name, x: sx, ys: [sy + r + 12, sy - r - 12], size: 11, color: rgba(col, 0.95), weight: 600, prio: 2 });
      this.obstacles.push({ x: sx - r, y: sy - r, w: r * 2, h: r * 2 });
    }

    // Versorgungslinien und Flugrouten
    if (ui.routes) this.drawRoutes(ctx, state, ui, cam, now);

    // Stationen
    for (const st of state.stations) {
      if (st.sector !== sec.id) continue;
      this.drawStation(ctx, st, cam, motion ? now : 0, ui.selection?.kind === 'station' && ui.selection.id === st.id, s, dt);
    }

    // NPC-Schiffe
    const shipS = Math.max(0.6, Math.min(1.8, s * 1.1));
    for (const n of state.npcs) {
      if (n.sector !== sec.id) continue;
      if (n.phase === 'docked') continue;
      const [sx, sy] = cam.toScreen(n.x, n.z);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      this.trail(n.id, sec.id, n.x, n.z, dt);
      this.drawTrail(ctx, cam, n.id, n.kind === 'courier' ? C.teal : '#9fc3ff', 0.3, shipS);
      const col = n.kind === 'courier' ? C.teal : n.kind === 'traffic' ? `hsl(${n.hue},25%,70%)` : C.npc;
      this.drawShipGlyph(ctx, sx, sy, n.heading, 3.4 * shipS, col, false);
    }

    // Eigene Schiffe
    const selShip = ui.selection?.kind === 'ship' ? ui.selection.id : '';
    for (const sh of state.ships) {
      if (sh.sector !== sec.id) continue;
      const cls = SHIP_MAP[sh.cls];
      const docked = sh.phase === 'docking' || sh.phase === 'unloading' || sh.phase === 'selling' || (sh.phase === 'waiting' && !sh.path.length);
      const [sx, sy] = cam.toScreen(sh.x, sh.z);
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
      const color = cls.role === 'miner' ? C.miner : C.trader;
      const moving = !docked && sh.phase !== 'mining' && sh.path.length > 0;
      // Angedockte Schiffe liegen im Dock – nicht über dem Stationssymbol zeichnen (ausgewählte bleiben sichtbar)
      if (docked && sh.id !== selShip && state.stations.some((x) => x.sector === sec.id && Math.hypot(x.x - sh.x, x.z - sh.z) < 8)) continue;
      if (!docked) {
        this.trail(sh.id, sec.id, sh.x, sh.z, dt);
        this.drawTrail(ctx, cam, sh.id, color, 0.55, shipS);
      }
      if (sh.phase === 'mining') this.drawMining(ctx, sh, sx, sy, cam, motion ? now : 0, shipS, dt);
      const size = (cls.size === 'L' ? 6.5 : cls.size === 'M' ? 5 : 4) * shipS;
      this.drawShip(ctx, sh.cls, sx, sy, sh.heading, size, color, docked ? 0.55 : 1, moving, motion ? now : 0, hashStr(sh.id));
      if (sh.id === selShip) this.selectionRing(ctx, sx, sy, 10 + size, now, color);
      if (sh.cargo && !docked && rel > 1.3) {
        ctx.fillStyle = WARES[sh.cargo.ware].color;
        ctx.beginPath();
        ctx.arc(sx + size * 1.2, sy - size * 1.2, 1.6 + shipS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Effekte (Funken, Splitter, Gas)
    this.fx.draw(ctx, cam, sec.id, s);

    this.flushLabels(ctx, rel);

    // Schwebende Texte (Verkäufe)
    for (const f of this.floats) {
      f.life -= dt / 2.2;
      if (f.sector !== sec.id) continue;
      const [sx, sy] = cam.toScreen(f.x, f.z);
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      this.label(ctx, (f.value > 0 ? '+' : '') + fmtCr(f.value), sx, sy - 20 * s - 10 - f.row * 15 - (1 - f.life) * 40, rel < 1.5 ? 11 : 12, f.value > 0 ? '#8ff5b0' : '#ffb4a0', 700);
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

  /** Funkenregen an einer Station (Modul fertig, Schiff vom Stapel) */
  burstAt(sector: string, x: number, z: number, color: string, power = 1): void {
    this.fx.burst(sector, x, z, color, power);
  }

  // ---------- Bausteine ----------

  /** Beschriftungen ohne Überlappung setzen: wichtige zuerst, sonst Ausweichposition oder weglassen */
  private flushLabels(ctx: CanvasRenderingContext2D, rel = 2): void {
    const placed = [...this.obstacles];
    const hit = (r: { x: number; y: number; w: number; h: number }) =>
      placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    this.labels.sort((a, b) => b.prio - a.prio);
    const shrink = rel < 1.5 ? 0.88 : 1;
    for (const l of this.labels) {
      l.size = Math.round(l.size * shrink);
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

  private drawHex(ctx: CanvasRenderingContext2D, cam: Camera, color: string, owned: boolean, scale = 1): void {
    const pts = hexCorners(SECTOR_RADIUS).map((p) => cam.toScreen(p.x, p.z));
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(20,60,80,0.10)';
    ctx.fill();
    ctx.clip();
    // Raster
    const step = cam.zoom > 3 ? 10 : cam.zoom > 1.6 ? 25 : 50;
    ctx.strokeStyle = 'rgba(63,224,197,0.045)';
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
    if (!owned) ctx.setLineDash([8, 8]);
    // Leuchten ohne Weichzeichner: breiter blasser Strich unter dem schmalen
    ctx.strokeStyle = rgba(color, owned ? 0.14 : 0.07);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = rgba(color, owned ? 0.75 : 0.4);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.6, 2.6 * scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Sprungtor: leuchtender Ring mit rotierenden Segmenten und pulsierendem Kern */
  private drawGate(ctx: CanvasRenderingContext2D, sx: number, sy: number, s: number, now: number, sel: boolean): void {
    const R = 11 * s + 3;
    ctx.save();
    ctx.translate(sx, sy);
    const pulse = 0.5 + 0.5 * Math.sin(now / 500);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.2);
    grad.addColorStop(0, rgba(C.amber, 0.32 + pulse * 0.15));
    grad.addColorStop(1, rgba(C.amber, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(C.amber, 0.2);
    ctx.lineWidth = (sel ? 2.6 : 1.8) * 3;
    ctx.stroke();
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = sel ? 2.6 : 1.8;
    ctx.stroke();
    // rotierende Segmente
    ctx.rotate(now / 2200);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(C.amber, 0.7);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.15, a, a + 1.1);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.5, R * 0.28 * (0.8 + pulse * 0.3)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  private drawTradeStation(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, color: string, sel: boolean): void {
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    glow.addColorStop(0, rgba(color, 0.28));
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

  private drawStation(ctx: CanvasRenderingContext2D, st: Station, cam: Camera, now: number, selected: boolean, s: number, dt: number): void {
    const [sx, sy] = cam.toScreen(st.x, st.z);
    if (sx < -140 || sx > cam.w + 140 || sy < -140 || sy > cam.h + 140) return;
    const problem = st.modules.some((m) => m.stall === 'input');
    const color = problem ? C.amber : C.teal;
    const rel = cam.zoom / (cam.fitZoom || 1);
    const unit = stationScale(cam.zoom);
    const detail = rel >= 2.4 && unit >= 5;
    const reach = detail ? stationReach(st) * unit : 0;
    // Leuchten (in der Gesamtansicht klein)
    const gr = detail ? reach * 1.2 + 12 : 24 * s;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
    glow.addColorStop(0, rgba(color, detail ? 0.16 : 0.26));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, gr, 0, Math.PI * 2);
    ctx.fill();
    if (detail) this.drawStationStructure(ctx, st, sx, sy, unit, now, cam, dt);
    else {
      const pulse = 0.5 + 0.5 * Math.sin(now / 700);
      ctx.strokeStyle = rgba(color, 0.2 + pulse * 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, (14 + pulse * 2.5) * s + 2, 0, Math.PI * 2);
      ctx.stroke();
      this.hubIcon(ctx, sx, sy, 9 * s + 2, color, now);
      // Bau-Fortschritt als Ring mit Baudrohnen
      if (st.build) {
        const p = buildProgress(st);
        const r = 13 * s + 3;
        ctx.lineWidth = Math.max(1.5, 2.6 * s);
        ctx.strokeStyle = rgba(C.amber, 0.22);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = st.waiting === 'material' ? rgba(C.amber, 0.55 + 0.35 * Math.sin(now / 250)) : C.amber;
        ctx.beginPath();
        ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = now / 700 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = '#ffe0a0';
          ctx.fillRect(sx + Math.cos(a) * (r + 4 * s) - 1, sy + Math.sin(a) * (r + 4 * s) - 1, 2, 2);
        }
      }
    }
    const ring = detail ? reach + 8 : 16 * s + 4;
    if (selected) this.selectionRing(ctx, sx, sy, ring, now, color);
    const ly = sy + (detail ? reach + 16 : 20 * s + 9);
    this.labels.push({ text: st.name, x: sx, ys: [ly, sy - (ly - sy)], size: rel < 1.5 ? 13 : 14, color: problem ? '#ffd28a' : '#bff7ec', weight: 700, prio: 4 });
    const ob = detail ? Math.min(reach, 60) : 12 * s + 4;
    this.obstacles.push({ x: sx - ob, y: sy - ob, w: ob * 2, h: ob * 2 });
    if (problem) {
      const o = detail ? Math.min(reach * 0.75, 70) : 12 * s + 4;
      this.warnBadge(ctx, sx + o, sy - o);
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

  /** Stationskern: Neon-Sechseck mit langsam kreisendem Außenring */
  private hubIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, now: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#071722';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.22);
    ctx.lineWidth = Math.max(1.2, r * 0.16) * 3;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, r * 0.16);
    ctx.stroke();
    ctx.fillStyle = color;
    const d = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, -d); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.lineTo(-d, 0);
    ctx.closePath();
    ctx.fill();
    if (r > 7) {
      ctx.rotate(now / 4000);
      ctx.strokeStyle = rgba(color, 0.45);
      ctx.lineWidth = 1;
      ctx.setLineDash([r * 0.5, r * 0.35]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /**
   * Detaillierte Stationsansicht: Module an vier Armen um den Kern, jede Modulart mit eigener Neon-Form.
   * Das Modul im Bau entsteht als Drahtgitter, das sich mit dem Baufortschritt füllt; geplante Module als Schatten.
   */
  private drawStationStructure(ctx: CanvasRenderingContext2D, st: Station, sx: number, sy: number, unit: number, now: number, cam: Camera, dt: number): void {
    const rot = ((hashStr(st.id) % 90) * Math.PI) / 180;
    const mods = st.modules.filter((m) => MODULE_MAP[m.def]?.kind !== 'core');
    const building = st.build && MODULE_MAP[st.build.def] && MODULE_MAP[st.build.def].kind !== 'core' ? st.build : null;
    const ghosts = st.queue.slice(0, 3);
    const solid = mods.length + (building ? 1 : 0);
    // Plätze nach Bauform und Modulart (Lager innen, Produktion Mitte, Docks/Werft außen)
    const defs = [...mods.map((m) => m.def), ...(building ? [building.def] : []), ...ghosts.map((q) => q.def)];
    const slots = layoutStation(st.id, defs);
    const pos = (i: number) => {
      const p = slots[i];
      return { ang: p.ang, px: p.x * unit, py: p.y * unit };
    };
    const cap = storageCap(st), used = usedVolume(st);
    const fill = (k: 'Container' | 'Solid' | 'Liquid') => (cap[k] > 0 ? Math.min(1, used[k] / cap[k]) : 0);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    // Träger: fest zu gebauten Modulen, gestrichelt zu geplanten
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const truss = (from: number, to: number, solidLine: boolean) => {
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        slots[i].path.forEach(([x, y], k) => (k ? ctx.lineTo(x * unit, y * unit) : ctx.moveTo(x * unit, y * unit)));
      }
      if (solidLine) {
        ctx.strokeStyle = 'rgba(120,210,220,0.42)';
        ctx.lineWidth = Math.max(1.2, unit * 0.13);
      } else {
        ctx.strokeStyle = 'rgba(120,210,220,0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (stationStyle(st.id) === 'ring') {
      // Ringträger nur zwischen benachbarten belegten Plätzen desselben Rings
      const byRing = new Map<number, number[]>();
      for (const p of slots.slice(0, solid)) {
        const r = Math.round(Math.hypot(p.x, p.y) * 100) / 100;
        byRing.set(r, [...(byRing.get(r) ?? []), Math.atan2(p.y, p.x)]);
      }
      ctx.strokeStyle = 'rgba(120,210,220,0.3)';
      ctx.lineWidth = Math.max(1, unit * 0.09);
      for (const [r, angs] of byRing) {
        if (angs.length < 2) continue;
        const step = (Math.PI * 2) / Math.round((Math.PI * 2 * r) / 1.4);
        angs.sort((a, b) => a - b);
        for (let i = 0; i < angs.length; i++) {
          const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2;
          if (b - a > step * 2.2) continue;
          ctx.beginPath();
          ctx.arc(0, 0, r * unit, a, b);
          ctx.stroke();
        }
      }
    }
    truss(0, solid, true);
    if (ghosts.length) truss(solid, slots.length, false);
    mods.forEach((m, i) => {
      const p = pos(i);
      ctx.save();
      ctx.translate(p.px, p.py);
      ctx.rotate(p.ang);
      this.drawModule(ctx, MODULE_MAP[m.def], unit, now, i, { running: m.running, stall: m.stall, fill, yardBusy: !!st.yard?.build });
      ctx.restore();
    });
    // Modul im Bau: Drahtgitter, füllt sich mit dem Fortschritt
    if (building) {
      const d = MODULE_MAP[building.def];
      const p = pos(mods.length);
      const prog = buildProgress(st);
      const waiting = st.waiting === 'material';
      const w = unit * 1.12, h = unit * 0.9;
      ctx.save();
      ctx.translate(p.px, p.py);
      ctx.rotate(p.ang);
      // fertiger Anteil als echtes Modul (von innen nach außen)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2 - 2, -h * 1.4, (w + 4) * prog, h * 2.8);
      ctx.clip();
      ctx.globalAlpha = 0.9;
      this.drawModule(ctx, d, unit, now, mods.length, { running: false, stall: '', fill, yardBusy: false });
      ctx.restore();
      // Gitter darüber
      ctx.strokeStyle = rgba(C.amber, waiting ? 0.45 + 0.3 * Math.sin(now / 250) : 0.85);
      ctx.lineWidth = Math.max(1, unit * 0.05);
      ctx.setLineDash([Math.max(2, unit * 0.12), Math.max(2, unit * 0.1)]);
      ctx.lineDashOffset = -now / 90;
      roundRect(ctx, -w / 2, -h / 2, w, h, unit * 0.1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(C.amber, 0.25);
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, h / 2);
      ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, -h / 2);
      ctx.stroke();
      // Leuchtkante am Baufortschritt
      const ex = -w / 2 + w * prog;
      ctx.beginPath();
      ctx.moveTo(ex, -h / 2); ctx.lineTo(ex, h / 2);
      if (!waiting) {
        ctx.strokeStyle = rgba(C.amber, 0.3);
        ctx.lineWidth = Math.max(1.2, unit * 0.07) * 4;
        ctx.stroke();
      }
      ctx.strokeStyle = waiting ? rgba(C.amber, 0.5) : '#ffe7b0';
      ctx.lineWidth = Math.max(1.2, unit * 0.07);
      ctx.stroke();
      ctx.restore();
      // Schweißfunken an der Baukante (nur wenn gebaut wird)
      if (!waiting && Math.random() < dt * 12) {
        const lx = p.px + Math.cos(p.ang) * ex, ly = p.py + Math.sin(p.ang) * ex;
        const wx = sx + Math.cos(rot) * lx - Math.sin(rot) * ly, wy = sy + Math.sin(rot) * lx + Math.cos(rot) * ly;
        const [wxw, wzw] = cam.toWorld(wx, wy);
        this.fx.weld(st.sector, wxw, wzw, (unit * 0.6) / cam.zoom);
      }
    }
    // Geplante Module als blasse Schatten
    ghosts.forEach((q, k) => {
      const d = MODULE_MAP[q.def];
      if (!d) return;
      const p = pos(solid + k);
      ctx.save();
      ctx.translate(p.px, p.py);
      ctx.rotate(p.ang);
      ctx.globalAlpha = 0.22;
      this.drawModule(ctx, d, unit, now, solid + k, { running: false, stall: '', fill, yardBusy: false });
      ctx.restore();
    });
    // Werft baut ein Schiff: Schweißfunken an der Werft
    if (st.yard?.build && Math.random() < dt * 8) {
      const idx = mods.findIndex((m) => MODULE_MAP[m.def]?.kind === 'shipyard');
      if (idx >= 0) {
        const p = pos(idx);
        const wx = sx + Math.cos(rot) * p.px - Math.sin(rot) * p.py, wy = sy + Math.sin(rot) * p.px + Math.cos(rot) * p.py;
        const [wxw, wzw] = cam.toWorld(wx, wy);
        this.fx.weld(st.sector, wxw, wzw, (unit * 0.8) / cam.zoom);
      }
    }
    ctx.restore();
    this.hubIcon(ctx, sx, sy, Math.max(8, unit * 0.55), C.teal, now);
  }

  /** Ein Modul in lokalen Koordinaten (x zeigt vom Kern weg) */
  private drawModule(ctx: CanvasRenderingContext2D, d: ModuleDef, unit: number, now: number, seed: number,
    o: { running: boolean; stall: string; fill: (k: 'Container' | 'Solid' | 'Liquid') => number; yardBusy: boolean }): void {
    const w = unit * 1.0, h = unit * 0.72;
    const lw = Math.max(1, unit * 0.06);
    const neon = (col: string) => {
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = lw;
    };
    /** Neon-Linie ohne teuren Weichzeichner: breiter, blasser Strich unter einem schmalen, hellen */
    const neonStroke = (col: string, glow = true) => {
      if (glow) {
        ctx.strokeStyle = rgba(col, 0.18);
        ctx.lineWidth = lw * 3.2;
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(col, 0.92);
      ctx.lineWidth = lw;
      ctx.stroke();
    };
    ctx.fillStyle = '#0a1721';
    if (d.kind === 'storage') {
      const col = d.storage === 'Liquid' ? '#5fb4ff' : d.storage === 'Solid' ? '#ffae5c' : '#8fd3ff';
      const n = d.id.endsWith('_l') ? 3 : d.id.endsWith('_m') ? 2 : 1;
      const level = o.fill(d.storage ?? 'Container');
      if (d.storage === 'Container') {
        // gestapelte Container: Füllstand leuchtet
        const b = unit * 0.3, cols = 2, rows = n;
        const total = cols * rows, lit = Math.round(level * total);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = -b + c * b * 1.05 - b * 0.02, y = (r - (rows - 1) / 2) * b * 1.05 - b / 2;
          const k = r * cols + c;
          ctx.fillStyle = k < lit ? rgba(col, 0.35) : '#0a1721';
          ctx.fillRect(x, y, b, b);
          neon(col);
          ctx.strokeRect(x, y, b, b);
        }
      } else {
        const r = unit * (0.2 + n * 0.03);
        const offs = n === 3 ? [-0.38, 0, 0.38] : n === 2 ? [-0.21, 0.21] : [0];
        for (const off of offs) {
          ctx.save();
          ctx.translate(0, off * unit);
          ctx.beginPath();
          if (d.storage === 'Solid') {
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
            ctx.closePath();
          } else ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = '#0a1721';
          ctx.fill();
          // Füllstand von unten
          ctx.save();
          ctx.clip();
          ctx.fillStyle = rgba(col, 0.32);
          ctx.fillRect(-r, r - 2 * r * level, 2 * r, 2 * r * level);
          ctx.restore();
          neonStroke(col);
          if (d.storage === 'Liquid') {
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.max(0.8, lw * 0.7);
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.65, -Math.PI * 0.85, -Math.PI * 0.55);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      return;
    }
    if (d.kind === 'dock' || d.kind === 'pier') {
      const col = '#a0e6f0';
      if (d.kind === 'dock') {
        const r = unit * 0.36;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        neonStroke(col);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const on = Math.floor(now / 350 + seed) % 3 === k;
          const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
          ctx.fillStyle = on ? '#9fffe8' : 'rgba(159,255,232,0.25)';
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r, Math.sin(a) * r, Math.max(1, unit * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillRect(-w * 0.5, -h * 0.12, w * 1.1, h * 0.24);
        ctx.fillRect(w * 0.45, -h * 0.7, w * 0.16, h * 1.4);
        ctx.beginPath();
        ctx.rect(-w * 0.5, -h * 0.12, w * 1.1, h * 0.24);
        ctx.rect(w * 0.45, -h * 0.7, w * 0.16, h * 1.4);
        neonStroke(col);
        for (let k = -1; k <= 1; k++) {
          const on = Math.floor(now / 300 + seed + k) % 3 === 0;
          ctx.fillStyle = on ? '#9fffe8' : 'rgba(159,255,232,0.25)';
          ctx.fillRect(w * 0.53 - 1, k * h * 0.45 - 1, 2.2, 2.2);
        }
      }
      return;
    }
    if (d.kind === 'shipyard') {
      // Bauportal: zwei Schienen mit Querträgern
      const col = C.amber;
      const L = unit * (d.yardSize === 'XL' ? 1.5 : d.yardSize === 'L' ? 1.3 : 1.1), H2 = unit * (d.yardSize === 'M' ? 0.42 : 0.55);
      ctx.fillStyle = 'rgba(255,181,71,0.06)';
      ctx.fillRect(-L / 2, -H2, L, H2 * 2);
      ctx.beginPath();
      ctx.moveTo(-L / 2, -H2); ctx.lineTo(L / 2, -H2);
      ctx.moveTo(-L / 2, H2); ctx.lineTo(L / 2, H2);
      ctx.moveTo(-L / 2, -H2); ctx.lineTo(-L / 2, H2);
      neonStroke(col);
      ctx.strokeStyle = rgba(col, 0.45);
      ctx.lineWidth = Math.max(0.8, lw * 0.7);
      for (let k = 1; k < 4; k++) { const x = -L / 2 + (L * k) / 4; ctx.beginPath(); ctx.moveTo(x, -H2); ctx.lineTo(x, H2); ctx.stroke(); }
      if (o.yardBusy) {
        // Schiff im Portal
        ctx.strokeStyle = rgba(C.trader, 0.55 + 0.25 * Math.sin(now / 300));
        ctx.lineWidth = Math.max(1, lw);
        ctx.beginPath();
        ctx.moveTo(L * 0.35, 0); ctx.lineTo(-L * 0.25, H2 * 0.6); ctx.lineTo(-L * 0.35, 0); ctx.lineTo(-L * 0.25, -H2 * 0.6);
        ctx.closePath();
        ctx.stroke();
      }
      return;
    }
    // Produktion
    const col = d.ware ? WARES[d.ware].color : C.teal;
    if (d.ware === 'energycells') {
      // Solarflügel mit wanderndem Glanz
      for (const sgn of [-1, 1]) {
        const y0 = sgn < 0 ? -h * 1.15 : h * 0.55;
        ctx.fillStyle = '#0a2240';
        ctx.fillRect(-w * 0.55, y0, w * 1.1, h * 0.6);
        ctx.strokeStyle = 'rgba(120,190,255,0.55)';
        ctx.lineWidth = Math.max(0.8, lw * 0.8);
        ctx.strokeRect(-w * 0.55, y0, w * 1.1, h * 0.6);
        ctx.beginPath();
        for (let k = 1; k < 4; k++) { const x = -w * 0.55 + (w * 1.1 * k) / 4; ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h * 0.6); }
        ctx.stroke();
        const gx = ((now / 2600 + seed * 0.3) % 1.6 - 0.3) * w * 1.1 - w * 0.55;
        if (gx > -w * 0.55 && gx < w * 0.55) {
          ctx.fillStyle = 'rgba(200,235,255,0.35)';
          ctx.fillRect(gx, y0, Math.max(1, w * 0.08), h * 0.6);
        }
      }
    }
    roundRect(ctx, -w / 2, -h / 2, w, h, unit * 0.14);
    ctx.fillStyle = '#0a1721';
    ctx.fill();
    neonStroke(col, o.running);
    // Leuchtband: läuft, wenn produziert wird; rot bei fehlenden Eingängen, gelb bei vollem Lager
    const bx = -w * 0.36, bw = w * 0.72, by = -h * 0.11, bh = h * 0.22;
    const stalled = o.stall === 'input' ? C.red : o.stall === 'storage' ? C.amber : '';
    ctx.fillStyle = stalled ? rgba(stalled, 0.35 + 0.35 * (Math.sin(now / 220 + seed) > 0 ? 1 : 0)) : rgba(col, o.running ? 0.28 : 0.15);
    ctx.fillRect(bx, by, bw, bh);
    if (o.running && !stalled) {
      const x = bx + ((now / 900 + seed * 0.37) % 1) * (bw - bw * 0.22);
      ctx.fillStyle = rgba(col, 0.35);
      ctx.fillRect(x - bw * 0.04, by - bh * 0.4, bw * 0.3, bh * 1.8);
      ctx.fillStyle = col;
      ctx.fillRect(x, by, bw * 0.22, bh);
    }
  }

  private drawShipGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number, color: string, own: boolean, alpha = 1): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(size * 1.3, 0);
    ctx.lineTo(-size * 0.9, size * 0.8);
    ctx.lineTo(-size * 0.45, 0);
    ctx.lineTo(-size * 0.9, -size * 0.8);
    ctx.closePath();
    if (own) {
      ctx.strokeStyle = rgba(color, 0.25);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  /** Eigene Schiffe: Umriss je Klasse im Neon-Stil, flackerndes Triebwerk im Flug */
  private drawShip(ctx: CanvasRenderingContext2D, cls: string, x: number, y: number, heading: number, size: number, color: string, alpha: number, moving: boolean, now: number, seed: number): void {
    if (size < 3.2) { this.drawShipGlyph(ctx, x, y, heading, size, color, true, alpha); return; }
    const shape = SHIP_SHAPES[cls] ?? SHIP_SHAPES.boa;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(heading);
    if (moving) {
      const fl = 0.75 + 0.25 * Math.sin(now / 45 + seed);
      const len = size * (1.2 + fl * 0.9);
      const x0 = shape.tail * size;
      const g = ctx.createLinearGradient(x0, 0, x0 - len, 0);
      g.addColorStop(0, rgba('#ffffff', 0.9));
      g.addColorStop(0.25, rgba(color, 0.7));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, -size * 0.28);
      ctx.lineTo(x0 - len, 0);
      ctx.lineTo(x0, size * 0.28);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    shape.hull.forEach(([px, py], i) => (i ? ctx.lineTo(px * size, py * size) : ctx.moveTo(px * size, py * size)));
    ctx.closePath();
    ctx.fillStyle = '#081520';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(color, 0.2);
    ctx.lineWidth = Math.max(1, size * 0.17) * 3.2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.17);
    ctx.stroke();
    // Details: Frachtmodule, Tank, Abbaukrallen
    ctx.lineWidth = Math.max(0.8, size * 0.1);
    ctx.strokeStyle = rgba(color, 0.65);
    if (shape.pods) {
      for (const [px, py, pw, ph] of shape.pods) ctx.strokeRect(px * size, py * size, pw * size, ph * size);
    }
    if (shape.tank) {
      ctx.beginPath();
      ctx.arc(shape.tank[0] * size, 0, shape.tank[1] * size, 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, 0.25);
      ctx.fill();
      ctx.stroke();
    }
    // Cockpit-Licht
    ctx.fillStyle = '#e8fffb';
    ctx.beginPath();
    ctx.arc(shape.nose * size * 0.72, 0, Math.max(0.8, size * 0.12), 0, Math.PI * 2);
    ctx.fill();
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

  private drawTrail(ctx: CanvasRenderingContext2D, cam: Camera, id: string, color: string, alpha: number, scale = 1): void {
    const t = this.trails.get(id);
    if (!t || t.pts.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < t.pts.length; i++) {
      const [x1, y1] = cam.toScreen(t.pts[i - 1].x, t.pts[i - 1].z);
      const [x2, y2] = cam.toScreen(t.pts[i].x, t.pts[i].z);
      ctx.strokeStyle = rgba(color, (i / t.pts.length) * alpha * 0.6);
      ctx.lineWidth = (0.6 + (i / t.pts.length) * 1.4) * Math.min(1.3, scale);
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

  /** Abbau: Mineral-Miner mit pulsierendem Laser und Splittern, Gassammler mit Sog-Kegel und Gasteilchen */
  private drawMining(ctx: CanvasRenderingContext2D, sh: Ship, sx: number, sy: number, cam: Camera, now: number, s: number, dt: number): void {
    const info = fieldById(sh.miningField);
    if (!info) return;
    const color = WARES[info.field.ware].color;
    const h = hashStr(sh.id);
    const a = ((h % 360) * Math.PI) / 180 + Math.sin(now / 900 + h) * 0.4;
    const rel = cam.zoom / (cam.fitZoom || 1);
    // Herausgezoomt kein Abbau-Effekt (Laser, Glanzpunkt, Teilchen) – die Karte bleibt ruhig
    if (rel < 1.6) return;
    const len = Math.max(5, Math.min(40, cam.zoom * 1.6)) * Math.min(1.5, s + 0.2);
    const tx = sx + Math.cos(a) * len, ty = sy + Math.sin(a) * len;
    if (isGas(info.field.ware)) {
      const spread = len * 0.45;
      const nx = -Math.sin(a), ny = Math.cos(a);
      const g = ctx.createLinearGradient(sx, sy, tx, ty);
      g.addColorStop(0, rgba(color, 0.35));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx + nx * spread, ty + ny * spread);
      ctx.lineTo(tx - nx * spread, ty - ny * spread);
      ctx.closePath();
      ctx.fill();
      if (rel >= 1.6 && Math.random() < dt * 16) {
        const k = (Math.random() - 0.5) * 2;
        const [wx, wz] = cam.toWorld(tx + nx * spread * k, ty + ny * spread * k);
        this.fx.suck(sh.sector, wx, wz, sh.x, sh.z, color);
      }
      return;
    }
    const flick = 0.5 + 0.5 * Math.sin(now / 60 + h);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = rgba(color, 0.15 + flick * 0.15);
    ctx.lineWidth = (1 + flick * Math.min(1.5, s)) * 3.5;
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.45 + flick * 0.5);
    ctx.lineWidth = 1 + flick * Math.min(1.5, s);
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.6 + flick * 0.4);
    ctx.beginPath();
    ctx.arc(tx, ty, 1.5 + flick * Math.min(2, s + 0.5), 0, Math.PI * 2);
    ctx.fill();
    if (rel >= 1.6 && Math.random() < dt * 12) {
      const [wx, wz] = cam.toWorld(tx, ty);
      this.fx.debris(sh.sector, wx, wz, color);
    }
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
  return Math.min(30, zoom * 2.7);
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

/** Ausdehnung der Station in Moduleinheiten (belegte Plätze inkl. Bau und geplanter Module) */
function stationReach(st: Station): number {
  const mods = st.modules.filter((m) => MODULE_MAP[m.def]?.kind !== 'core').map((m) => m.def);
  if (st.build && MODULE_MAP[st.build.def]?.kind !== 'core') mods.push(st.build.def);
  mods.push(...st.queue.slice(0, 3).map((q) => q.def));
  return layoutReach(layoutStation(st.id, mods));
}

/** Schiffsumrisse (Bug zeigt nach +x, Einheit = Schiffsgröße) */
interface ShipShape { hull: [number, number][]; nose: number; tail: number; pods?: [number, number, number, number][]; tank?: [number, number] }
const SHIP_SHAPES: Record<string, ShipShape> = {
  tuatara: { hull: [[1.5, 0], [0.2, 0.42], [-0.9, 0.5], [-0.7, 0], [-0.9, -0.5], [0.2, -0.42]], nose: 1.5, tail: -0.75 },
  boa: { hull: [[1.4, 0], [1.0, 0.3], [-1.0, 0.34], [-1.1, 0], [-1.0, -0.34], [1.0, -0.3]], nose: 1.4, tail: -1.05, pods: [[-0.7, 0.36, 1.2, 0.22], [-0.7, -0.58, 1.2, 0.22]] },
  buffalo: { hull: [[1.3, 0], [1.0, 0.45], [-1.1, 0.5], [-1.2, 0], [-1.1, -0.5], [1.0, -0.45]], nose: 1.3, tail: -1.15, pods: [[-0.85, -0.32, 0.5, 0.64], [-0.25, -0.32, 0.5, 0.64], [0.35, -0.32, 0.45, 0.64]] },
  alligator_min: { hull: [[1.35, 0.55], [0.6, 0.28], [0.6, -0.28], [1.35, -0.55], [0.35, -0.62], [-1.0, -0.42], [-1.1, 0], [-1.0, 0.42], [0.35, 0.62]], nose: 0.6, tail: -1.05 },
  wyvern_min: { hull: [[1.35, 0.6], [0.55, 0.3], [0.55, -0.3], [1.35, -0.6], [0.3, -0.7], [-1.1, -0.5], [-1.2, 0], [-1.1, 0.5], [0.3, 0.7]], nose: 0.55, tail: -1.15, pods: [[-0.8, -0.25, 0.9, 0.5]] },
  alligator_gas: { hull: [[1.25, 0], [0.6, 0.45], [-1.0, 0.4], [-1.1, 0], [-1.0, -0.4], [0.6, -0.45]], nose: 1.25, tail: -1.05, tank: [0.05, 0.3] },
  wyvern_gas: { hull: [[1.25, 0], [0.6, 0.55], [-1.1, 0.5], [-1.2, 0], [-1.1, -0.5], [0.6, -0.55]], nose: 1.25, tail: -1.15, tank: [-0.1, 0.38] },
};
