// Minispiel „Piratenangriff“ / „Xenon-Schwarm“: Den Frachter bis zum Sprungtor beschützen.
// Steuerung mit schwebendem Joystick, der Jäger feuert selbst auf das nächste Ziel; Raketensalve per Taste.
import { sfx } from '../ui/sound';
import { buzz, Particles, clamp, rgba, rng, Starfield, type GameResult, type HudItem, type Level, type MiniGame } from './common';

export interface Gear { weapon: Level; shield: Level; engine: Level }

const TOP = 92;
type EKind = 'jaeger' | 'kanone' | 'n' | 'm';

interface Enemy {
  kind: EKind; x: number; y: number; vx: number; vy: number;
  hp: number; max: number; cd: number; r: number;
  target: 'f' | 'p'; orbit: number; flash: number; dir: number;
}
interface Bullet { x: number; y: number; vx: number; vy: number; dmg: number; from: 'p' | 'e'; life: number; color: string; w: number }
interface Missile { x: number; y: number; vx: number; vy: number; target: Enemy | null; life: number }

const SPEC: Record<EKind, { hp: number; speed: number; r: number; color: string; name: string }> = {
  jaeger: { hp: 30, speed: 165, r: 10, color: '#ff8a5c', name: 'Piratenjäger' },
  kanone: { hp: 95, speed: 70, r: 16, color: '#ffb547', name: 'Kanonenboot' },
  n: { hp: 15, speed: 205, r: 8, color: '#ff3b4a', name: 'Xenon N' },
  m: { hp: 75, speed: 95, r: 14, color: '#ff5c6c', name: 'Xenon M' },
};

const WAVES: Record<'pirate' | 'xenon', Record<Level, EKind[][]>> = {
  pirate: {
    1: [['jaeger', 'jaeger', 'jaeger'], ['jaeger', 'jaeger', 'jaeger', 'jaeger'], ['jaeger', 'jaeger', 'kanone']],
    2: [['jaeger', 'jaeger', 'jaeger', 'jaeger'], ['jaeger', 'jaeger', 'jaeger', 'kanone'], ['jaeger', 'jaeger', 'jaeger', 'jaeger', 'kanone']],
    3: [['jaeger', 'jaeger', 'jaeger', 'jaeger', 'kanone'], ['jaeger', 'jaeger', 'jaeger', 'jaeger', 'jaeger', 'kanone'], ['jaeger', 'jaeger', 'jaeger', 'jaeger', 'jaeger', 'kanone', 'kanone']],
  },
  xenon: {
    1: [['n', 'n', 'n', 'n', 'n'], ['n', 'n', 'n', 'n', 'n', 'n'], ['n', 'n', 'n', 'n', 'n', 'm']],
    2: [['n', 'n', 'n', 'n', 'n', 'n'], ['n', 'n', 'n', 'n', 'n', 'n', 'm'], ['n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'm']],
    3: [['n', 'n', 'n', 'n', 'n', 'n', 'n', 'm'], ['n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'm'], ['n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'm', 'm']],
  },
};

const MISSILE_CD = 9;
/** Flugzeit bis zum Sprungtor (Sekunden) */
const JOURNEY: Record<Level, number> = { 1: 55, 2: 65, 3: 75 };

export class ShooterGame implements MiniGame {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Irgendwo hinhalten und ziehen: Joystick zum Fliegen', 'Dein Jäger feuert von selbst auf das nächste Ziel', 'Taste rechts unten: Raketensalve'];
  private r: () => number;
  private gear: Gear;
  private hpMul: number;
  // Spieler
  private px = 0;
  private py = 0;
  private pvx = 0;
  private pvy = 0;
  private hull = 100;
  private shield: number;
  private shieldMax: number;
  private shieldWait = 0;
  private shieldHit = 0;
  private fireCd = 0;
  private aimA = -Math.PI / 2;
  private missileCd = 2;
  // Frachter
  private fx0 = 0;
  private fy0 = 0;
  private fHull: number;
  private fMax: number;
  private fFlash = 0;
  // Welt
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private missiles: Missile[] = [];
  private wave = -1;
  private waveT = 0;
  private banner = 0;
  private kills = 0;
  private time = 0;
  private gateT = -1;
  private endT = -1;
  private outcome: 'win' | 'freighter' | 'player' | null = null;
  private shake = 0;
  private fx = new Particles();
  private stars = new Starfield(160, 31);
  private scroll = 0;
  private w = 1;
  private h = 1;
  // Eingabe
  private joy: { id: number; ox: number; oy: number; kx: number; ky: number } | null = null;
  private done: GameResult | null = null;

  constructor(private level: Level, seed: number, private side: 'pirate' | 'xenon', gear?: Gear) {
    this.r = rng(seed);
    this.gear = gear ?? { weapon: 1, shield: 1, engine: 1 };
    this.hpMul = level === 1 ? 1 : level === 2 ? 1.15 : 1.3;
    this.shieldMax = [40, 70, 100][this.gear.shield - 1];
    this.shield = this.shieldMax;
    this.fMax = 400;
    this.fHull = this.fMax;
    this.eyebrow = side === 'pirate' ? 'Piraten' : 'Xenon';
    this.title = side === 'pirate' ? 'Geleitschutz' : 'Abwehr';
    this.intro = side === 'pirate'
      ? 'Piraten haben es auf deinen Frachter abgesehen. Beschütze ihn mit deinem Jäger, bis er das Sprungtor erreicht – drei Angriffswellen.'
      : 'Ein Xenon-Schwarm hält auf deinen Frachter zu. Die kleinen N-Jäger kommen in Massen, die M-Korvetten halten viel aus. Halte drei Wellen stand.';
  }

  resize(w: number, h: number): void {
    const first = this.w === 1;
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    this.fx0 = w / 2;
    this.fy0 = TOP + (h - TOP) * 0.55;
    if (first) { this.px = w / 2; this.py = this.fy0 + 110; }
  }

  private get fx1(): number { return this.fx0 + Math.sin(this.time * 0.5) * 18; }
  private get fy1(): number { return this.fy0 + Math.sin(this.time * 0.8) * 6 - (this.gateT >= 0 ? this.gateT * this.gateT * 120 : 0); }

  private get speed(): number { return [190, 225, 265][this.gear.engine - 1]; }
  private get fireRate(): number { return [0.26, 0.21, 0.17][this.gear.weapon - 1]; }
  private get damage(): number { return [6, 8, 11][this.gear.weapon - 1]; }
  private get btn(): [number, number, number] { return [this.w - 52, this.h - 64, 32]; }

  hud(): HudItem[] {
    return [
      { label: 'Frachter', value: `${Math.ceil((this.fHull / this.fMax) * 100)} %`, warn: this.fHull / this.fMax < 0.35 },
      { label: 'Jäger', value: `${Math.ceil(this.hull)} %`, warn: this.hull < 35 },
    ];
  }

  pointerDown(id: number, x: number, y: number): void {
    const [bx, by, br] = this.btn;
    if (Math.hypot(x - bx, y - by) < br + 10) { this.fireMissiles(); return; }
    if (!this.joy) this.joy = { id, ox: x, oy: y, kx: 0, ky: 0 };
  }

  pointerMove(id: number, x: number, y: number): void {
    const j = this.joy;
    if (!j || j.id !== id) return;
    let dx = x - j.ox, dy = y - j.oy;
    const d = Math.hypot(dx, dy), max = 52;
    if (d > max) {
      // Basis wandert mit, damit man nie „am Anschlag hängt“
      j.ox += (dx / d) * (d - max);
      j.oy += (dy / d) * (d - max);
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    j.kx = dx / max;
    j.ky = dy / max;
  }

  pointerUp(id: number): void {
    if (this.joy?.id === id) this.joy = null;
  }

  private fireMissiles(): void {
    if (this.missileCd > 0 || this.outcome) return;
    this.missileCd = MISSILE_CD;
    const targets = [...this.enemies].sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py));
    for (let k = 0; k < 4; k++) {
      const a = this.aimA + (k - 1.5) * 0.5;
      this.missiles.push({ x: this.px, y: this.py, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, target: targets[k % Math.max(1, targets.length)] ?? null, life: 3 });
    }
    sfx.open();
  }

  /** Nur für Tests: einfacher Autopilot */
  autopilot(): void {
    let best: Enemy | null = null, bd = 1e9;
    for (const e of this.enemies) { const d = Math.hypot(e.x - this.fx1, e.y - this.fy1); if (d < bd) { bd = d; best = e; } }
    const tx = best ? best.x + (this.fx1 - best.x) * 0.3 : this.fx1, ty = best ? best.y + (this.fy1 - best.y) * 0.3 : this.fy1 + 90;
    const dx = tx - this.px, dy = ty - this.py, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 60);
    this.joy = { id: 99, ox: 0, oy: 0, kx: (dx / d) * k, ky: (dy / d) * k };
    if (this.enemies.length >= 3) this.fireMissiles();
  }

  private spawnWave(): void {
    this.wave++;
    this.banner = 2.2;
    this.spawnGroup(WAVES[this.side][this.level][this.wave]);
    if (this.wave > 0) sfx.warn();
  }

  private spawnGroup(list: EKind[]): void {
    this.waveT = 0;
    const side = Math.floor(this.r() * 3);
    for (const [i, kind] of list.entries()) {
      const s = SPEC[kind];
      // aus einer Richtung, leicht gestreut
      const spread = (i - list.length / 2) * 40;
      let x: number, y: number;
      if (side === 0) { x = this.w / 2 + spread * 1.5; y = TOP - 60 - this.r() * 80; }
      else if (side === 1) { x = -40 - this.r() * 80; y = TOP + 80 + Math.abs(spread) * 2; }
      else { x = this.w + 40 + this.r() * 80; y = TOP + 80 + Math.abs(spread) * 2; }
      const hp = s.hp * this.hpMul;
      this.enemies.push({ kind, x, y, vx: 0, vy: 0, hp, max: hp, cd: 1 + this.r() * 1.5, r: s.r, target: kind === 'kanone' || this.r() < 0.65 ? 'f' : 'p', orbit: this.r() * Math.PI * 2, flash: 0, dir: this.r() < 0.5 ? 1 : -1 });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    this.time += dt;
    this.scroll += dt * (this.gateT >= 0 ? 160 : 45);
    this.banner = Math.max(0, this.banner - dt);
    this.fFlash = Math.max(0, this.fFlash - dt);
    this.shieldHit = Math.max(0, this.shieldHit - dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.gateT >= 0) this.gateT += dt;
      if (this.endT > 2) this.done = this.finish();
      return;
    }
    const waves = WAVES[this.side][this.level];
    const J = JOURNEY[this.level];
    if (this.wave < 0 && this.time > 0.8) this.spawnWave();
    this.waveT += dt;
    // Wellen nach Fahrplan über die Strecke verteilt; ist eine früher besiegt, folgt die nächste nach kurzer Pause
    const due = 1 + ((this.wave + 1) * (J - 18)) / (waves.length - 1);
    if (this.wave >= 0 && this.wave < waves.length - 1 && ((this.enemies.length === 0 && this.waveT > 3) || this.time > due)) this.spawnWave();
    // Alle Wellen besiegt, Tor aber noch fern: Nachzügler
    const small: EKind = this.side === 'pirate' ? 'jaeger' : 'n';
    if (this.wave === waves.length - 1 && this.enemies.length === 0 && this.time < J - 4 && this.waveT > 4) this.spawnGroup(this.side === 'pirate' ? [small, small] : [small, small, small]);
    if (this.wave === waves.length - 1 && this.enemies.length === 0 && this.time >= J && this.gateT < 0) {
      // Sprungtor erreicht
      this.gateT = 0;
      this.outcome = 'win';
      this.endT = 0;
      sfx.success();
    }
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    if (this.fHull <= 0 && !this.outcome) {
      this.outcome = 'freighter';
      this.endT = 0;
      this.explode(this.fx1, this.fy1, '#5ff0d8', 2.2);
    }
    if (this.hull <= 0 && !this.outcome) {
      this.outcome = 'player';
      this.endT = 0;
      this.explode(this.px, this.py, '#3fe0c5', 1.4);
    }
  }

  private updatePlayer(dt: number): void {
    const j = this.joy;
    const tvx = j ? j.kx * this.speed : 0, tvy = j ? j.ky * this.speed : 0;
    const k = Math.min(1, dt * 6);
    this.pvx += (tvx - this.pvx) * k;
    this.pvy += (tvy - this.pvy) * k;
    this.px = clamp(this.px + this.pvx * dt, 14, this.w - 14);
    this.py = clamp(this.py + this.pvy * dt, TOP + 14, this.h - 14);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.shieldWait = Math.max(0, this.shieldWait - dt);
    if (!this.shieldWait) this.shield = Math.min(this.shieldMax, this.shield + 12 * dt);
    // Autofeuer auf das nächste Ziel in Reichweite (mit Vorhalt)
    this.fireCd -= dt;
    let tgt: Enemy | null = null, bd = 260;
    for (const e of this.enemies) { const d = Math.hypot(e.x - this.px, e.y - this.py); if (d < bd) { bd = d; tgt = e; } }
    if (tgt) {
      const t = bd / 620;
      this.aimA = Math.atan2(tgt.y + tgt.vy * t - this.py, tgt.x + tgt.vx * t - this.px);
      if (this.fireCd <= 0) {
        this.fireCd = this.fireRate;
        this.bullets.push({ x: this.px + Math.cos(this.aimA) * 12, y: this.py + Math.sin(this.aimA) * 12, vx: Math.cos(this.aimA) * 620, vy: Math.sin(this.aimA) * 620, dmg: this.damage, from: 'p', life: 0.55, color: '#7ffff0', w: 2 });
      }
    } else if (Math.hypot(this.pvx, this.pvy) > 30) this.aimA = Math.atan2(this.pvy, this.pvx);
  }

  private updateEnemies(dt: number): void {
    const fx = this.fx1, fy = this.fy1;
    for (const e of this.enemies) {
      const s = SPEC[e.kind];
      e.flash = Math.max(0, e.flash - dt);
      const tx = e.target === 'f' ? fx : this.px, ty = e.target === 'f' ? fy : this.py;
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
      let wx: number, wy: number;
      if (e.kind === 'n') {
        // Xenon N: direkt drauf, kurz vorher abdrehen
        const side = d < 70 ? 1.4 : 0.25;
        wx = (dx / d) * (1 - side) + (-dy / d) * side * e.dir;
        wy = (dy / d) * (1 - side) + (dx / d) * side * e.dir;
      } else {
        // Kreisbahn in Schussweite
        const want = e.kind === 'kanone' ? 170 : e.kind === 'm' ? 150 : 120;
        const radial = clamp((d - want) / 60, -1, 1);
        wx = (dx / d) * radial + (-dy / d) * e.dir * 0.8;
        wy = (dy / d) * radial + (dx / d) * e.dir * 0.8;
      }
      const wl = Math.hypot(wx, wy) || 1;
      const k = Math.min(1, dt * 2.5);
      e.vx += ((wx / wl) * s.speed - e.vx) * k;
      e.vy += ((wy / wl) * s.speed - e.vy) * k;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Spieler zieht Aufmerksamkeit auf sich, wenn er nah ist
      if (e.kind !== 'kanone' && Math.hypot(this.px - e.x, this.py - e.y) < 90 && this.r() < dt) e.target = 'p';
      e.cd -= dt;
      const range = e.kind === 'n' ? 150 : 260;
      if (e.cd <= 0 && d < range) {
        const a = Math.atan2(dy, dx) + (this.r() - 0.5) * 0.12;
        if (e.kind === 'jaeger') { e.cd = 1.3; this.enemyShot(e, a, 270, 6, '#ffb070'); }
        else if (e.kind === 'kanone') { e.cd = 2.6; for (let q = 0; q < 3; q++) this.enemyShot(e, a + (q - 1) * 0.08, 230, 8, '#ffd27a'); }
        else if (e.kind === 'n') { e.cd = 0.9; this.enemyShot(e, a, 320, 4, '#ff5c6c'); }
        else { e.cd = 2; this.enemyShot(e, a, 430, 11, '#ff3b4a', 3); }
      }
    }
  }

  private enemyShot(e: Enemy, a: number, v: number, dmg: number, color: string, w = 2): void {
    this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: dmg * (this.level === 3 ? 1.15 : 1), from: 'e', life: 1.6, color, w });
  }

  private updateShots(dt: number): void {
    const fx = this.fx1, fy = this.fy1;
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (b.from === 'p') {
        const e = this.enemies.find((q) => Math.hypot(q.x - b.x, q.y - b.y) < q.r + 3);
        if (e) { this.damageEnemy(e, b.dmg); this.fx.burst(b.x, b.y, '#bffff6', 3, 120, 1.2, 'spark', 0.2); continue; }
      } else {
        if (Math.hypot(this.px - b.x, this.py - b.y) < 12) { this.damagePlayer(b.dmg); this.fx.burst(b.x, b.y, b.color, 4, 120, 1.2, 'spark', 0.2); continue; }
        // Frachter: länglicher Rumpf
        if (Math.abs(b.x - fx) < 20 && Math.abs(b.y - fy) < 46) {
          this.fHull = Math.max(0, this.fHull - b.dmg);
          this.fFlash = 0.12;
          this.fx.burst(b.x, b.y, b.color, 4, 120, 1.2, 'spark', 0.25);
          continue;
        }
      }
      keep.push(b);
    }
    this.bullets = keep;
    const km: Missile[] = [];
    for (const m of this.missiles) {
      m.life -= dt;
      if (m.target && !this.enemies.includes(m.target)) m.target = this.enemies[0] ?? null;
      if (m.target) {
        const dx = m.target.x - m.x, dy = m.target.y - m.y, d = Math.hypot(dx, dy) || 1;
        m.vx += (dx / d) * 900 * dt;
        m.vy += (dy / d) * 900 * dt;
        const v = Math.hypot(m.vx, m.vy);
        if (v > 380) { m.vx *= 380 / v; m.vy *= 380 / v; }
        if (d < m.target.r + 4) { this.damageEnemy(m.target, 34); this.fx.burst(m.x, m.y, '#ffd27a', 12, 180, 1.8, 'spark', 0.35); continue; }
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (Math.random() < 0.8) this.fx.add({ x: m.x, y: m.y, color: '#ffb070', size: 1.3, max: 0.3 });
      if (m.life > 0) km.push(m);
    }
    this.missiles = km;
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    e.hp -= dmg;
    e.flash = 0.08;
    if (e.hp > 0) return;
    this.enemies = this.enemies.filter((q) => q !== e);
    this.kills++;
    this.explode(e.x, e.y, SPEC[e.kind].color, e.r / 10);
  }

  private damagePlayer(dmg: number): void {
    this.shieldWait = 2.5;
    if (this.shield > 0) {
      const s = Math.min(this.shield, dmg);
      this.shield -= s;
      dmg -= s;
      this.shieldHit = 0.25;
    }
    if (dmg > 0) {
      this.hull = Math.max(0, this.hull - dmg);
      this.shake = Math.max(this.shake, 0.2);
      buzz(20);
    }
  }

  private explode(x: number, y: number, color: string, size: number): void {
    this.fx.burst(x, y, color, Math.round(14 * size), 220 * size, 2.4, 'chunk', 0.8);
    this.fx.burst(x, y, '#fff2c8', Math.round(12 * size), 300 * size, 1.4, 'spark', 0.35);
    this.fx.add({ x, y, color, size: 6 * size, kind: 'ring', max: 0.45 });
    this.shake = Math.max(this.shake, 0.15 * size);
    sfx.tap();
  }

  private finish(): GameResult {
    const f = this.fHull / this.fMax;
    const ok = this.outcome === 'win';
    const stars: 0 | 1 | 2 | 3 = !ok ? 0 : f >= 0.8 ? 3 : f >= 0.5 ? 2 : 1;
    return {
      success: ok,
      stars,
      score: Math.round(f * 100),
      headline: ok ? 'Frachter in Sicherheit' : this.outcome === 'player' ? 'Jäger zerstört' : 'Frachter verloren',
      lines: [
        ['Frachter-Hülle', `${Math.round(f * 100)} %`],
        ['Abschüsse', `${this.kills}`],
        ['Eigene Hülle', `${Math.round(this.hull)} %`],
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
    r.headline = 'Rückzug';
    return r;
  }

  /** Für Tests */
  get state(): { wave: number; enemies: number; fHull: number; hull: number; outcome: string | null } {
    return { wave: this.wave, enemies: this.enemies.length, fHull: this.fHull, hull: this.hull, outcome: this.outcome };
  }

  // ---------- Darstellung ----------

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.stars.draw(ctx, this.scroll, this.side === 'xenon' ? '#ffd0d0' : '#cfe4ff');
    ctx.save();
    if (this.shake > 0 && !document.documentElement.classList.contains('calm')) ctx.translate((Math.random() - 0.5) * 12 * this.shake, (Math.random() - 0.5) * 12 * this.shake);
    if (this.gateT >= 0) this.drawGate(ctx, t);
    if (!(this.outcome === 'freighter')) this.drawFreighter(ctx, t);
    for (const e of this.enemies) this.drawEnemy(ctx, e, t);
    // Geschosse
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      const v = Math.hypot(b.vx, b.vy) || 1, L = b.from === 'p' ? 12 : 8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / v) * L, b.y - (b.vy / v) * L);
      ctx.strokeStyle = rgba(b.color, 0.3);
      ctx.lineWidth = b.w * 3;
      ctx.stroke();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.w;
      ctx.stroke();
    }
    for (const m of this.missiles) {
      ctx.fillStyle = '#fff2c8';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (this.outcome !== 'player') this.drawPlayer(ctx, t);
    this.fx.draw(ctx);
    this.drawIndicators(ctx);
    ctx.restore();
    this.drawControls(ctx, t);
    // Strecke bis zum Sprungtor
    const prog = Math.min(1, this.time / JOURNEY[this.level]);
    const bx = 16, bw = this.w - 32, by = TOP - 6;
    ctx.fillStyle = 'rgba(14,30,44,0.8)';
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = '#5ff0d8';
    ctx.fillRect(bx, by, bw * prog, 3);
    ctx.strokeStyle = '#9fe6ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(bx + bw, by + 1.5, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    const waves = WAVES[this.side][this.level].length;
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(169,195,198,0.85)';
    ctx.fillText(`WELLE ${Math.max(1, Math.min(waves, this.wave + 1))}/${waves}`, bx, by + 16);
    ctx.textAlign = 'right';
    ctx.fillText('SPRUNGTOR', bx + bw, by + 16);
    if (this.banner > 0) {
      const waves = WAVES[this.side][this.level].length;
      const a = Math.min(1, this.banner * 2) * Math.min(1, (2.2 - this.banner) * 4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '700 26px "Chakra Petch", Barlow, sans-serif';
      ctx.fillStyle = this.side === 'xenon' ? '#ff8a96' : '#ffc77a';
      ctx.fillText(`WELLE ${this.wave + 1} VON ${waves}`, this.w / 2, TOP + 70);
      ctx.font = '500 14px Barlow, sans-serif';
      ctx.fillStyle = 'rgba(228,243,240,0.8)';
      const kinds = [...new Set(WAVES[this.side][this.level][this.wave].map((k) => SPEC[k].name))].join(' · ');
      ctx.fillText(kinds, this.w / 2, TOP + 94);
      ctx.restore();
    }
  }

  private drawGate(ctx: CanvasRenderingContext2D, t: number): void {
    const gx = this.fx0, gy = TOP + 70 - 160 + Math.min(1, this.gateT * 0.8) * 160;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, 0.45);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
    g.addColorStop(0, 'rgba(160,230,255,0.75)');
    g.addColorStop(0.6, 'rgba(60,140,255,0.25)');
    g.addColorStop(1, 'rgba(60,140,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9fe6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(t);
    ctx.strokeStyle = 'rgba(200,245,255,0.5)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawFreighter(ctx: CanvasRenderingContext2D, t: number): void {
    const x = this.fx1, y = this.fy1;
    const shrink = this.gateT >= 0 ? Math.max(0, 1 - Math.max(0, this.gateT - 1.1) * 1.4) : 1;
    if (shrink <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(shrink, shrink);
    const col = this.fFlash > 0 ? '#ffffff' : '#5ff0d8';
    // Rumpf
    ctx.beginPath();
    ctx.moveTo(0, -48); ctx.lineTo(12, -36); ctx.lineTo(14, 34); ctx.lineTo(8, 46); ctx.lineTo(-8, 46); ctx.lineTo(-14, 34); ctx.lineTo(-12, -36);
    ctx.closePath();
    ctx.fillStyle = '#0c1d29';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.22);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Container seitlich
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#10283a';
        ctx.fillRect(s * 15 - (s < 0 ? 10 : 0), -24 + k * 13, 10, 11);
        ctx.strokeStyle = rgba('#8fd3ff', 0.7);
        ctx.lineWidth = 1;
        ctx.strokeRect(s * 15 - (s < 0 ? 10 : 0) + 0.5, -24 + k * 13 + 0.5, 9, 10);
      }
    }
    // Triebwerke
    ctx.fillStyle = rgba('#7fd8ff', 0.6 + 0.3 * Math.sin(t * 25));
    ctx.fillRect(-7, 46, 5, 6 + Math.random() * 4);
    ctx.fillRect(2, 46, 5, 6 + Math.random() * 4);
    ctx.restore();
    // Hüllenbalken
    const f = this.fHull / this.fMax;
    ctx.fillStyle = 'rgba(14,30,44,0.85)';
    ctx.fillRect(x - 30, y + 58, 60, 4);
    ctx.fillStyle = f > 0.5 ? '#3fe0c5' : f > 0.25 ? '#ffb547' : '#ff5c6c';
    ctx.fillRect(x - 30, y + 58, 60 * f, 4);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
    const s = SPEC[e.kind];
    const col = e.flash > 0 ? '#ffffff' : s.color;
    const a = Math.atan2(e.vy, e.vx) + Math.PI / 2;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(a);
    const r = e.r;
    ctx.beginPath();
    if (e.kind === 'jaeger') {
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, r * 0.7); ctx.lineTo(0, r * 0.3); ctx.lineTo(-r * 0.9, r * 0.7);
    } else if (e.kind === 'kanone') {
      for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2; ctx.lineTo(Math.cos(q) * r, Math.sin(q) * r * 1.15); }
    } else if (e.kind === 'n') {
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, r * 0.8); ctx.lineTo(-r * 0.8, r * 0.8);
    } else {
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.5, -r * 0.2); ctx.lineTo(r, r); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, -r * 0.2);
    }
    ctx.closePath();
    ctx.fillStyle = '#1a0c10';
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (e.kind === 'n' || e.kind === 'm') {
      // Xenon-Kern glüht
      ctx.fillStyle = rgba('#ff3b4a', 0.6 + 0.4 * Math.sin(t * 8 + e.orbit));
      ctx.beginPath();
      ctx.arc(0, r * 0.15, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (e.max > 40 && e.hp < e.max) {
      ctx.fillStyle = 'rgba(14,30,44,0.85)';
      ctx.fillRect(e.x - 16, e.y - e.r - 9, 32, 3);
      ctx.fillStyle = s.color;
      ctx.fillRect(e.x - 16, e.y - e.r - 9, 32 * (e.hp / e.max), 3);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.translate(this.px, this.py);
    if (this.shieldHit > 0 || this.shield < this.shieldMax) {
      const sa = this.shieldHit > 0 ? 0.6 : 0.12 * (this.shield / this.shieldMax);
      ctx.strokeStyle = rgba('#7fd8ff', sa);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    const heading = Math.hypot(this.pvx, this.pvy) > 20 ? Math.atan2(this.pvy, this.pvx) : this.aimA;
    ctx.rotate(heading + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(5, -4); ctx.lineTo(12, 8); ctx.lineTo(4, 6); ctx.lineTo(0, 11); ctx.lineTo(-4, 6); ctx.lineTo(-12, 8); ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fillStyle = '#0a2028';
    ctx.fill();
    ctx.strokeStyle = 'rgba(63,224,197,0.3)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#3fe0c5';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const thrust = Math.hypot(this.pvx, this.pvy) / this.speed;
    ctx.fillStyle = rgba('#9ffff0', 0.4 + 0.5 * thrust);
    ctx.beginPath();
    ctx.moveTo(-3, 10); ctx.lineTo(3, 10); ctx.lineTo(0, 12 + thrust * 10 + Math.random() * 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Schild- und Hüllenring
    ctx.strokeStyle = 'rgba(127,216,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.px, this.py, 23, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.shield) / this.shieldMax);
    ctx.stroke();
    void t;
  }

  /** Pfeile am Rand für Gegner außerhalb des Bildes */
  private drawIndicators(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      if (e.x > 0 && e.x < this.w && e.y > TOP && e.y < this.h) continue;
      const x = clamp(e.x, 12, this.w - 12), y = clamp(e.y, TOP + 12, this.h - 12);
      const a = Math.atan2(e.y - y, e.x - x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = rgba(SPEC[e.kind].color, 0.8);
      ctx.beginPath();
      ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawControls(ctx: CanvasRenderingContext2D, t: number): void {
    const j = this.joy;
    if (j && j.id !== 99) {
      ctx.strokeStyle = 'rgba(110,220,205,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(63,224,197,0.35)';
      ctx.beginPath();
      ctx.arc(j.ox + j.kx * 52, j.oy + j.ky * 52, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    // Raketentaste mit Ladeanzeige
    const [bx, by, br] = this.btn;
    const ready = this.missileCd <= 0;
    ctx.fillStyle = ready ? 'rgba(50,32,8,0.85)' : 'rgba(14,30,44,0.8)';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ready ? rgba('#ffb547', 0.6 + 0.3 * Math.sin(t * 5)) : 'rgba(110,220,205,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!ready) {
      ctx.strokeStyle = '#ffb547';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, br - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.missileCd / MISSILE_CD));
      ctx.stroke();
    }
    // Raketensymbol
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = ready ? '#ffd28a' : 'rgba(169,195,198,0.6)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(4, -6); ctx.lineTo(4, 8); ctx.lineTo(-4, 8); ctx.lineTo(-4, -6);
    ctx.closePath();
    ctx.moveTo(4, 4); ctx.lineTo(8, 10); ctx.moveTo(-4, 4); ctx.lineTo(-8, 10);
    ctx.stroke();
    ctx.restore();
  }
}
