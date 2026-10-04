// Minispiel „Reiche Erzader“: Mit dem Bohrlaser den leuchtenden Adern eines Asteroiden folgen.
// Taubes Gestein heizt den Laser stark auf; bei Überhitzung muss er abkühlen. Instabile Taschen explodieren.
import { WARES } from '../data/wares';
import { sfx } from '../ui/sound';
import { buzz, Particles, clamp, fmtTime, rgba, rng, starsFor, Starfield, type GameResult, type HudItem, type Level, type MiniGame } from './common';

const TOP = 92;
const DURATION = 45;
/** Fingerversatz: der Laser trifft etwas oberhalb des Fingers, damit man den Treffpunkt sieht */
const AIM_OFFSET = 56;
/** Einheiten Rohstoff je Aderpunkt (für die Anzeige) */
const UNITS_PER_POINT = 40;

interface VeinPt { x: number; y: number; a: number }
interface Pocket { x: number; y: number; alive: boolean }

export class OreGame implements MiniGame {
  readonly eyebrow = 'Bergbau';
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Finger halten und ziehen: Laser führen (trifft knapp über dem Finger)', 'Auf den Adern abbauen – Gestein heizt stark auf', 'Loslassen kühlt den Laser'];
  private ware: string;
  private color: string;
  /** Umriss: Radius je Winkel (normiert) */
  private shape: number[] = [];
  private veins: VeinPt[][] = [];
  private pockets: Pocket[] = [];
  private craters: { x: number; y: number; r: number }[] = [];
  private burns: { x: number; y: number; t: number }[] = [];
  private total = 0;
  private mined = 0;
  private lost = 0;
  private time = 0;
  private heat = 0;
  private overheated = false;
  private rot = 0;
  private spin: number;
  private firing = false;
  private aim: [number, number] = [0, 0];
  private hit: 'vein' | 'rock' | 'space' = 'space';
  private pid = -1;
  private chunkAcc = 0;
  private shake = 0;
  private fx = new Particles();
  private stars = new Starfield(120, 11);
  private w = 1;
  private h = 1;
  private cx = 0;
  private cy = 0;
  private R = 100;
  private sprite: HTMLCanvasElement | null = null;
  private spriteR = 0;
  private done: GameResult | null = null;
  private endT = -1;

  constructor(level: Level, seed: number, ware?: string) {
    const r = rng(seed);
    this.ware = ware && WARES[ware] ? ware : 'ore';
    this.color = WARES[this.ware]?.color ?? '#e0913d';
    const name = WARES[this.ware]?.name ?? 'Erz';
    this.title = name;
    this.intro = `Ein Asteroid mit reichen ${name}-Adern. Fahre mit dem Laser die leuchtenden Adern ab, bevor die Zeit abläuft. Triffst du taubes Gestein, wird der Laser schnell heiß.${level >= 2 ? ' Achtung: rot pulsierende Gastaschen explodieren bei Beschuss.' : ''}`;
    this.spin = level === 1 ? 0 : level === 2 ? 0.1 : 0.17;
    // Umriss aus überlagerten Wellen
    const ph = [r() * 6, r() * 6, r() * 6];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      this.shape.push(1 + 0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.025 * Math.sin(11 * a + ph[2]));
    }
    // Adern: Zufallspfade im Inneren
    const veinCount = level === 3 ? 4 : 5;
    for (let v = 0; v < veinCount; v++) {
      const pts: VeinPt[] = [];
      let a = r() * Math.PI * 2, d = 0.15 + r() * 0.45;
      let x = Math.cos(a) * d, y = Math.sin(a) * d;
      let dir = r() * Math.PI * 2;
      const len = 12 + Math.floor(r() * 8);
      for (let i = 0; i < len; i++) {
        if (Math.hypot(x, y) > 0.8 * this.radiusAt(Math.atan2(y, x))) break;
        pts.push({ x, y, a: 1 });
        dir += (r() - 0.5) * 0.9;
        x += Math.cos(dir) * 0.055;
        y += Math.sin(dir) * 0.055;
      }
      if (pts.length >= 5) this.veins.push(pts);
    }
    this.total = this.veins.reduce((s, v) => s + v.length, 0);
    // Gastaschen neben Adern
    const pocketCount = level === 1 ? 0 : level === 2 ? 2 : 4;
    for (let k = 0; k < pocketCount && this.veins.length; k++) {
      const v = this.veins[k % this.veins.length];
      const p = v[Math.floor(r() * v.length)];
      const a2 = r() * Math.PI * 2;
      this.pockets.push({ x: p.x + Math.cos(a2) * 0.11, y: p.y + Math.sin(a2) * 0.11, alive: true });
    }
    for (let k = 0; k < 14; k++) {
      const a2 = r() * Math.PI * 2, d2 = Math.sqrt(r()) * 0.8;
      this.craters.push({ x: Math.cos(a2) * d2, y: Math.sin(a2) * d2, r: 0.04 + r() * 0.1 });
    }
  }

  private radiusAt(a: number): number {
    const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * 64;
    const i = Math.floor(f), t = f - i;
    return this.shape[i % 64] * (1 - t) + this.shape[(i + 1) % 64] * t;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.R = Math.min(w * 0.42, (h - TOP - 190) * 0.5);
    this.cx = w / 2;
    this.cy = TOP + 20 + this.R * 1.08;
  }

  private get ship(): [number, number] {
    return [this.w / 2, this.h - 66];
  }

  hud(): HudItem[] {
    const left = DURATION - this.time;
    return [
      { label: 'Zeit', value: fmtTime(left), warn: left < 10 },
      { label: 'Ausbeute', value: `${Math.round(this.fraction() * 100)} %` },
      { label: 'Ladung', value: Math.round(Math.max(0, this.mined - this.lost) * UNITS_PER_POINT).toLocaleString('de-DE') },
    ];
  }

  private fraction(): number {
    return this.total ? Math.max(0, this.mined - this.lost) / this.total : 0;
  }

  /** Weltpunkt → lokale, normierte Asteroidenkoordinaten */
  private toLocal(x: number, y: number): [number, number] {
    const dx = (x - this.cx) / this.R, dy = (y - this.cy) / this.R;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    return [dx * c - dy * s, dx * s + dy * c];
  }

  private toWorld(x: number, y: number): [number, number] {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.cx + (x * c - y * s) * this.R, this.cy + (x * s + y * c) * this.R];
  }

  /** Für Tests: Ziel auf den ersten noch vollen Aderpunkt (Bildschirmkoordinaten des Fingers) */
  debugVeinTouch(): [number, number] | null {
    for (const v of this.veins) for (const p of v) if (p.a > 0.5) { const [x, y] = this.toWorld(p.x, p.y); return [x, y + AIM_OFFSET]; }
    return null;
  }

  pointerDown(id: number, x: number, y: number): void {
    if (this.pid >= 0) return;
    this.pid = id;
    this.firing = true;
    this.aim = [x, y - AIM_OFFSET];
  }

  pointerMove(id: number, x: number, y: number): void {
    if (id === this.pid) this.aim = [x, y - AIM_OFFSET];
  }

  pointerUp(id: number): void {
    if (id !== this.pid) return;
    this.pid = -1;
    this.firing = false;
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 1.2 && !this.fx.list.some((p) => p.tx != null)) this.done = this.finish();
      return;
    }
    this.time += dt;
    this.rot += this.spin * dt;
    for (const b of this.burns) b.t += dt;
    const active = this.firing && !this.overheated;
    this.hit = 'space';
    if (active) {
      const [lx, ly] = this.toLocal(...this.aim);
      const d0 = Math.hypot(lx, ly);
      const inside = d0 <= this.radiusAt(Math.atan2(ly, lx));
      if (inside) {
        this.hit = 'rock';
        const rr = 0.075;
        let took = 0;
        for (const v of this.veins) for (const p of v) {
          if (p.a <= 0) continue;
          const d = Math.hypot(p.x - lx, p.y - ly);
          if (d >= rr) continue;
          const take = Math.min(p.a, 3.2 * dt * (1 - d / rr));
          p.a -= take;
          took += take;
        }
        if (took > 0.002) this.hit = 'vein';
        this.mined += took;
        this.chunkAcc += took;
        const [hx, hy] = this.aim;
        if (this.hit === 'vein') {
          // Erzbröckchen fliegen zum Sammler
          while (this.chunkAcc >= 0.12) {
            this.chunkAcc -= 0.12;
            const [sx, sy] = this.ship;
            const a = Math.random() * Math.PI * 2;
            this.fx.add({ x: hx, y: hy, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, color: this.color, size: 2.2 + Math.random() * 1.6, kind: 'chunk', max: 3, vr: (Math.random() - 0.5) * 12, tx: sx, ty: sy - 10 });
          }
          if (Math.random() < dt * 30) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, color: '#fff2c8', size: 1.6, kind: 'spark', max: 0.25 });
        } else {
          // Gestein: graue Splitter, Brandspuren
          if (Math.random() < dt * 22) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, color: '#8a8580', size: 1.6 + Math.random(), kind: 'chunk', max: 0.6, vr: (Math.random() - 0.5) * 10 });
          if (Math.random() < dt * 30) this.fx.add({ x: hx, y: hy, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, color: '#ffb070', size: 1.4, kind: 'spark', max: 0.2 });
          const last = this.burns[this.burns.length - 1];
          if (!last || Math.hypot(last.x - lx, last.y - ly) > 0.02) {
            this.burns.push({ x: lx, y: ly, t: 0 });
            if (this.burns.length > 260) this.burns.shift();
          }
        }
        // Gastaschen
        for (const p of this.pockets) {
          if (!p.alive || Math.hypot(p.x - lx, p.y - ly) > 0.075) continue;
          p.alive = false;
          const [px, py] = this.toWorld(p.x, p.y);
          this.fx.burst(px, py, '#ff6a4a', 26, 300, 2.6, 'chunk', 0.9);
          this.fx.burst(px, py, '#ffd0a0', 18, 380, 1.6, 'spark', 0.4);
          this.fx.add({ x: px, y: py, color: '#ff8a5c', size: 10, kind: 'ring', max: 0.5 });
          this.heat = Math.min(100, this.heat + 55);
          const loss = Math.min(this.mined - this.lost, this.total * 0.06);
          this.lost += loss;
          this.shake = 0.45;
          sfx.warn();
          buzz(60);
        }
      }
      this.heat += (this.hit === 'vein' ? 10 : this.hit === 'rock' ? 34 : 8) * dt;
      if (this.heat >= 100) {
        this.heat = 100;
        this.overheated = true;
        sfx.warn();
        buzz(30);
      }
    } else {
      this.heat = Math.max(0, this.heat - (this.overheated ? 38 : 30) * dt);
      if (this.overheated && this.heat <= 30) this.overheated = false;
    }
    const allGone = this.veins.every((v) => v.every((p) => p.a <= 0.02));
    if (this.time >= DURATION || allGone) {
      this.endT = 0;
      this.firing = false;
    }
  }

  private finish(): GameResult {
    const f = this.fraction();
    const stars = starsFor(f, 0.3, 0.5, 0.7);
    return {
      success: stars > 0,
      stars,
      score: Math.round(f * 100),
      headline: stars === 3 ? 'Ader ausgebeutet' : stars > 0 ? 'Gute Ausbeute' : 'Zu wenig abgebaut',
      lines: [
        ['Ausbeute', `${Math.round(f * 100)} %`],
        [WARES[this.ware]?.name ?? 'Erz', `${Math.round(Math.max(0, this.mined - this.lost) * UNITS_PER_POINT).toLocaleString('de-DE')} Einheiten`],
        ...(this.pockets.length ? [['Gastaschen getroffen', `${this.pockets.filter((p) => !p.alive).length}`] as [string, string]] : []),
      ],
    };
  }

  result(): GameResult | null {
    return this.done;
  }

  abort(): GameResult {
    const r = this.finish();
    r.success = false;
    r.stars = 0;
    r.headline = 'Abgebrochen';
    return r;
  }

  // ---------- Darstellung ----------

  private makeSprite(): void {
    const dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
    const R = this.R;
    const size = Math.ceil(R * 2.3 * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.translate(R * 1.15, R * 1.15);
    const path = new Path2D();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2, r = this.shape[k % 64] * R;
      k ? path.lineTo(Math.cos(a) * r, Math.sin(a) * r) : path.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const grad = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
    grad.addColorStop(0, '#5a5048');
    grad.addColorStop(0.55, '#2e2924');
    grad.addColorStop(1, '#141210');
    g.fillStyle = grad;
    g.fill(path);
    g.save();
    g.clip(path);
    // Körnung
    const r = rng(99);
    for (let k = 0; k < 900; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,220,0.06)';
      g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1 + r() * 2, 1 + r() * 2);
    }
    // Krater: dunkle Mulde, heller Rand zum Licht
    for (const k of this.craters) {
      const x = k.x * R, y = k.y * R, rr = k.r * R;
      const cg = g.createRadialGradient(x + rr * 0.2, y + rr * 0.25, 0, x, y, rr);
      cg.addColorStop(0, 'rgba(0,0,0,0.45)');
      cg.addColorStop(0.8, 'rgba(0,0,0,0.25)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,235,210,0.12)';
      g.lineWidth = Math.max(1, rr * 0.12);
      g.beginPath();
      g.arc(x, y, rr * 0.92, Math.PI * 0.75, Math.PI * 1.6);
      g.stroke();
    }
    // Schatten zur Lichtabgewandten Seite
    const sh = g.createLinearGradient(-R, -R, R, R);
    sh.addColorStop(0.45, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = sh;
    g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    g.restore();
    g.strokeStyle = 'rgba(255,230,200,0.18)';
    g.lineWidth = 1.2;
    g.stroke(path);
    this.sprite = c;
    this.spriteR = R;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.stars.draw(ctx, 0, '#ffe6c8');
    if (!this.sprite || this.spriteR !== this.R) this.makeSprite();
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    const R = this.R;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.drawImage(this.sprite!, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
    // Brandspuren
    for (const b of this.burns) {
      const hot = Math.max(0, 1 - b.t / 1.2);
      ctx.fillStyle = hot > 0 ? rgba('#ff8a4a', 0.5 * hot) : 'rgba(10,8,6,0.35)';
      ctx.beginPath();
      ctx.arc(b.x * R, b.y * R, R * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
    // Adern
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const v of this.veins) {
      for (let i = 1; i < v.length; i++) {
        const a = Math.min(v[i - 1].a, v[i].a);
        if (a <= 0.02) continue;
        ctx.beginPath();
        ctx.moveTo(v[i - 1].x * R, v[i - 1].y * R);
        ctx.lineTo(v[i].x * R, v[i].y * R);
        ctx.strokeStyle = rgba(this.color, 0.22 * a);
        ctx.lineWidth = R * 0.07 * (0.5 + a * 0.5);
        ctx.stroke();
        ctx.strokeStyle = rgba(this.color, 0.85 * a);
        ctx.lineWidth = R * 0.022 * (0.4 + a * 0.6);
        ctx.stroke();
      }
      // Funkeln
      for (let i = 0; i < v.length; i++) {
        const p = v[i];
        if (p.a < 0.4) continue;
        const tw = Math.sin(t * 3 + i * 2.3 + p.x * 20);
        if (tw < 0.85) continue;
        ctx.fillStyle = rgba('#fff4d8', (tw - 0.85) * 6 * p.a);
        ctx.beginPath();
        ctx.arc(p.x * R, p.y * R, R * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Gastaschen
    for (const p of this.pockets) {
      if (!p.alive) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + p.x * 9);
      const gr = ctx.createRadialGradient(p.x * R, p.y * R, 0, p.x * R, p.y * R, R * 0.09);
      gr.addColorStop(0, rgba('#ff5c4a', 0.75));
      gr.addColorStop(0.5, rgba('#ff3a2a', 0.25 + 0.2 * pulse));
      gr.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(p.x * R, p.y * R, R * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba('#ff8a7a', 0.4 + 0.4 * pulse);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x * R, p.y * R, R * (0.05 + 0.015 * pulse), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    this.drawShipAndLaser(ctx, t);
    this.fx.draw(ctx);
    ctx.restore();
    this.drawHeat(ctx, t);
  }

  private drawShipAndLaser(ctx: CanvasRenderingContext2D, t: number): void {
    const [sx, sy] = this.ship;
    const [ax, ay] = this.aim;
    const active = this.firing && !this.overheated && this.endT < 0;
    const ang = active ? Math.atan2(ay - sy, ax - sx) + Math.PI / 2 : 0;
    if (active) {
      const nx = sx + Math.sin(ang) * 22, ny = sy - Math.cos(ang) * 22;
      const flick = 0.8 + 0.2 * Math.sin(t * 60);
      const col = this.hit === 'vein' ? this.color : '#ff7a4a';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = rgba(col, 0.18 * flick);
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.6 * flick);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = rgba('#fff6e0', 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (this.hit !== 'space') {
        const gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, 22);
        gr.addColorStop(0, rgba('#fff4d8', 0.9));
        gr.addColorStop(0.3, rgba(col, 0.5));
        gr.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(ax, ay, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (this.firing && this.overheated) {
      // Fadenkreuz ausgegraut
      ctx.strokeStyle = 'rgba(255,92,108,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ax, ay, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Bergbauschiff
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -24); ctx.lineTo(12, -10); ctx.lineTo(16, 14); ctx.lineTo(6, 20); ctx.lineTo(-6, 20); ctx.lineTo(-16, 14); ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fillStyle = '#0d1e2a';
    ctx.fill();
    ctx.strokeStyle = rgba('#ffc45e', 0.25);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#ffc45e';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Laderaum leuchtet beim Füllen
    ctx.fillStyle = rgba(this.color, 0.3 + 0.5 * clamp(this.fx.list.filter((p) => p.tx != null).length / 20, 0, 1));
    ctx.fillRect(-7, -4, 14, 14);
    // Triebwerke
    ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 30));
    ctx.fillRect(-9, 20, 5, 4 + Math.random() * 3);
    ctx.fillRect(4, 20, 5, 4 + Math.random() * 3);
    ctx.restore();
  }

  private drawHeat(ctx: CanvasRenderingContext2D, t: number): void {
    const [sx, sy] = this.ship;
    const W = 150, H = 6, x = sx - W / 2 - 100, y = sy - 3;
    const bx = Math.max(16, x);
    const f = this.heat / 100;
    ctx.fillStyle = 'rgba(14,30,44,0.85)';
    ctx.fillRect(bx, y, W * 0.6, H);
    const col = this.overheated ? '#ff5c6c' : f > 0.7 ? '#ffb547' : '#3fe0c5';
    ctx.fillStyle = this.overheated && Math.sin(t * 12) > 0 ? 'rgba(255,92,108,0.5)' : col;
    ctx.fillRect(bx, y, W * 0.6 * f, H);
    ctx.strokeStyle = 'rgba(110,220,205,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, y + 0.5, W * 0.6 - 1, H - 1);
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.overheated ? '#ff9aa4' : 'rgba(169,195,198,0.85)';
    ctx.fillText(this.overheated ? 'ÜBERHITZT – LOSLASSEN' : 'LASERHITZE', bx, y - 6);
  }
}
