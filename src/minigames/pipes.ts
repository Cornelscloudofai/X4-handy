// Minispiel „Störung beheben“: Leitungen drehen, bis die Energiekerne alle Module versorgen.
// Ab Stufe 2: Sperrfelder, Brücken, Ventilgruppen (drehen gemeinsam) und Druck – offene Enden lassen ihn sinken.
// Ab Stufe 3 zwei Kerne mit eigener Ware; jedes Modul braucht seine Ware, Leitungen dürfen sich nicht mischen.
// Kettenmodus: Netz um Netz gegen die Uhr, gelöste Netze bringen Zeit.
import { WARES } from '../data/wares';
import { drawWareGlyph } from '../render/glyphs';
import { sfx } from '../ui/sound';
import {
  buzz, clamp, findMutator, Floaters, fmtTime, Particles, pickGoals, rgba, rng, roundRect, Score, setGoal, TOP,
  type GameCfg, type GameResult, type Goal, type GoalDef, type HudItem, type Level, type MiniGame, type Mode, type Mutator,
} from './common';
import { DIRS, bits, consumers, generate, par, power, rotate, type Board, type GenOpts, type PowerInfo } from './pipesLogic';

interface Conf { n: number; opts: GenOpts; limit: number; pressure: number }
const CONF: Record<Level, Conf> = {
  1: { n: 5, opts: {}, limit: 90, pressure: 0 },
  2: { n: 6, opts: { blocked: 2, bridges: true, valves: 1 }, limit: 110, pressure: 0.6 },
  3: { n: 7, opts: { blocked: 3, bridges: true, valves: 2, two: true, fixed: 2 }, limit: 140, pressure: 0.8 },
  4: { n: 7, opts: { blocked: 4, bridges: true, valves: 3, two: true, fixed: 1 }, limit: 130, pressure: 1 },
  5: { n: 8, opts: { blocked: 5, bridges: true, valves: 3, two: true }, limit: 150, pressure: 1.2 },
};
const WARE_POOL = ['energycells', 'refinedmetals', 'graphene', 'hullparts', 'microchips', 'siliconwafers', 'antimattercells', 'water'];
const GROUP_COLORS = ['#b690ff', '#ff84c1', '#7fcf82', '#ffd27a', '#7fd8ff'];
const CHAIN_START = 75;
const CHAIN_BONUS = 25;

export const PIPES_MUTATORS: Mutator[] = [
  { id: 'dark', name: 'Notbeleuchtung', desc: 'Nur versorgte Leitungen und ihre Nachbarn sind zu sehen', mult: 1.4 },
  { id: 'rush', name: 'Eilauftrag', desc: 'Nur die halbe Zeit', mult: 1.5 },
  { id: 'valves', name: 'Ventilchaos', desc: 'Zwei zusätzliche Ventilgruppen', mult: 1.3 },
  { id: 'surge', name: 'Überdruck', desc: 'Offene Enden kosten doppelt so viel Druck', mult: 1.3 },
];

const NORMAL_GOALS: GoalDef[] = [
  { id: 'moves', text: 'Mit höchstens Bestwert + 30 % Zügen lösen' },
  { id: 'fast', text: 'In der ersten Hälfte der Zeit lösen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'pressure', text: 'Druck nie unter 60 %' },
  { id: 'valve', text: 'Kein Ventil öfter als dreimal drehen' },
];
const CHAIN_GOALS: GoalDef[] = [
  { id: 'chain5', text: 'Fünf Netze schaffen' },
  { id: 'chain8', text: 'Acht Netze schaffen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
];
export const PIPES_GOALS: GoalDef[] = [...NORMAL_GOALS, ...CHAIN_GOALS.filter((g) => g.id !== 'combo3')];

export class PipesGame implements MiniGame {
  readonly eyebrow = 'Störung beheben';
  readonly title: string;
  readonly intro: string;
  readonly controls = ['Rohrstück antippen: um 90° drehen', 'Farbige Ringe: Ventile – alle Teile der Gruppe drehen mit', 'Gekreuzte Brücken leiten nur geradeaus', 'Offene Enden lassen den Druck sinken'];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  private level: Level;
  private mode: Mode;
  private seed: number;
  private score: Score;
  private wares: string[];
  private colors: string[];
  private b!: Board;
  private p!: PowerInfo;
  private cons: number[] = [];
  private conf!: Conf;
  private parMoves = 0;
  /** Züge insgesamt (für Tests) und im aktuellen Netz */
  moves = 0;
  private boardMoves = 0;
  private boardTime = 0;
  private valveTurns: number[] = [];
  private time = 0;
  private limit: number;
  private pressure = 100;
  private minPressure = 100;
  private pressureRate = 0;
  private boards = 0;
  private ang: number[] = [];
  private fx = new Particles();
  private floats = new Floaters();
  private w = 1;
  private h = 1;
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private won = -1;
  private failed = '';
  private done: GameResult | null = null;
  private down: { id: number; x: number; y: number } | null = null;

  constructor(cfg: GameCfg) {
    this.level = cfg.level;
    this.mode = cfg.mode === 'chain' ? 'chain' : cfg.mode ?? 'normal';
    this.seed = cfg.seed;
    this.mutator = findMutator(PIPES_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 5);
    const r = rng(cfg.seed ^ 0x51ab);
    const pool = WARE_POOL.filter((w) => WARES[w]);
    const first = cfg.ware && WARES[cfg.ware] ? cfg.ware : pool.splice(Math.floor(r() * pool.length), 1)[0];
    const second = pool.filter((w) => w !== first)[Math.floor(r() * (pool.length - 1))];
    this.wares = [first, second];
    this.colors = this.wares.map((w) => WARES[w]?.color ?? '#3fe0c5');
    // Zwei gleich wirkende Farben vermeiden
    if (this.colors[0] === this.colors[1]) this.colors[1] = '#b690ff';
    this.title = this.mode === 'chain' ? 'Leitungskette' : WARES[first]?.name ?? 'Leitungsnetz';
    this.loadBoard(this.mode === 'chain' ? 1 : this.level);
    this.limit = this.mode === 'chain' ? CHAIN_START : this.conf.limit * (this.mutator?.id === 'rush' ? 0.5 : 1);
    this.intro = this.mode === 'chain'
      ? 'Netz um Netz gegen die Uhr – jedes gelöste Netz bringt Zeit, die Netze werden schwieriger. Wie weit kommst du?'
      : `Im Modul für ${WARES[first]?.name ?? 'Waren'} ist die Versorgung unterbrochen. Drehe die Rohrstücke, bis alle Module versorgt sind und kein Rohr offen endet.${this.b.sources.length > 1 ? ` Zwei Kerne: jedes Modul braucht seine Ware (${WARES[first]?.name} oder ${WARES[second]?.name}) – nichts vermischen.` : ''}`;
    const goalPool = this.mode === 'chain' ? CHAIN_GOALS : NORMAL_GOALS.filter((g) => (g.id !== 'pressure' || this.pressureRate > 0) && (g.id !== 'valve' || this.b.group.some((x) => x >= 0)));
    this.goals = pickGoals(goalPool, rng(cfg.seed ^ 0x77));
  }

  private loadBoard(level: Level): void {
    const conf = CONF[level];
    const opts = { ...conf.opts };
    if (this.mutator?.id === 'valves') opts.valves = (opts.valves ?? 0) + 2;
    const n = this.mode === 'chain' ? Math.min(7, conf.n) : conf.n;
    this.conf = conf;
    this.b = generate(n, this.seed + this.boards * 977, opts);
    this.p = power(this.b);
    this.cons = consumers(this.b);
    this.parMoves = par(this.b);
    this.ang = this.b.mask.map(() => 0);
    this.boardMoves = 0;
    this.boardTime = 0;
    this.valveTurns = [];
    this.pressure = 100;
    this.pressureRate = (conf.pressure || (this.mutator?.id === 'surge' ? 0.5 : 0)) * (this.mutator?.id === 'surge' ? 2 : 1);
    this.won = -1;
    if (this.w > 1) this.resize(this.w, this.h);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const n = this.b.n;
    const avail = Math.min(w - 24, h - TOP - 120);
    this.cell = Math.floor(avail / n);
    this.ox = Math.round((w - this.cell * n) / 2);
    this.oy = Math.round(TOP + 24 + Math.max(0, h - TOP - 100 - this.cell * n) * 0.3);
  }

  hud(): HudItem[] {
    const left = this.limit - this.time;
    return [
      { label: 'Zeit', value: fmtTime(left), warn: left < 15 },
      this.mode === 'chain' ? { label: 'Netze', value: `${this.boards}` } : { label: 'Module', value: `${this.p.okConsumers}/${this.cons.length}` },
      { label: 'Züge', value: `${this.boardMoves}` },
    ];
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  /** Für automatische Tests: Rätsel bis auf `leave` Felder bzw. Ventilgruppen lösen */
  debugSolve(leave = 1): void {
    let left = leave;
    const skipGroups = new Set<number>();
    for (let i = 0; i < this.b.mask.length; i++) {
      if (this.b.locked[i] || this.b.mask[i] === this.b.solution[i]) continue;
      const g = this.b.group[i];
      if (g >= 0 && skipGroups.has(g)) continue;
      if (left > 0) { left--; if (g >= 0) skipGroups.add(g); continue; }
      if (g >= 0) { for (let k = 0; k < this.b.mask.length; k++) if (this.b.group[k] === g) this.b.mask[k] = this.b.solution[k]; }
      else this.b.mask[i] = this.b.solution[i];
    }
    this.p = power(this.b);
  }

  cellCenter(i: number): [number, number] {
    const n = this.b.n;
    return [this.ox + ((i % n) + 0.5) * this.cell, this.oy + (Math.floor(i / n) + 0.5) * this.cell];
  }

  /** Für Tests: ein noch falsches, drehbares Feld */
  debugWrongCell(): number {
    return this.b.mask.findIndex((m, i) => m !== this.b.solution[i] && !this.b.locked[i] && !this.b.blocked[i] && bits(m) !== 4);
  }

  pointerDown(id: number, x: number, y: number): void {
    this.down = { id, x, y };
  }

  pointerMove(): void {}

  pointerUp(id: number, x: number, y: number): void {
    const d = this.down;
    this.down = null;
    if (!d || d.id !== id || Math.hypot(x - d.x, y - d.y) > 24 || this.won >= 0 || this.failed) return;
    const n = this.b.n;
    const cx = Math.floor((d.x - this.ox) / this.cell), cy = Math.floor((d.y - this.oy) / this.cell);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
    this.tap(cy * n + cx);
  }

  private poweredCount(p: PowerInfo): number {
    let k = 0;
    for (let i = 0; i < p.color.length; i++) if (p.color[i] >= 0) k++;
    return k;
  }

  /** Feld antippen (auch für Tests) */
  tap(i: number): void {
    const cells = rotate(this.b, i);
    if (!cells.length) { sfx.warn(); return; }
    this.moves++;
    this.boardMoves++;
    if (this.b.group[i] >= 0) this.valveTurns[this.b.group[i]] = (this.valveTurns[this.b.group[i]] ?? 0) + 1;
    for (const c of cells) this.ang[c] -= Math.PI / 2;
    const before = this.poweredCount(this.p) - this.p.mixed.length * 2;
    this.p = power(this.b);
    const after = this.poweredCount(this.p) - this.p.mixed.length * 2;
    const [px, py] = this.cellCenter(i);
    if (after > before) {
      this.score.bump(0.5, 3);
      const pts = this.score.add((after - before) * 15);
      this.floats.add(px, py - 10, `+${pts}`, '#ffd27a', 12);
      sfx.coin();
    } else {
      if (after < before) this.score.reset();
      sfx.tap();
    }
    if (this.p.mixed.length) this.floats.add(px, py - 10, 'Vermischt!', '#ff9aa4', 13);
    buzz(8);
    if (this.p.solved) this.solveBoard();
  }

  private solveBoard(): void {
    this.won = 0;
    this.boards++;
    const left = this.limit - this.time;
    const okMoves = this.boardMoves <= Math.ceil(this.parMoves * 1.3) + 2;
    const pts = this.score.add(1000 + Math.max(0, Math.round(this.mode === 'chain' ? 0 : left * 10)) + Math.max(0, Math.ceil(this.parMoves * 1.3) + 2 - this.boardMoves) * 30);
    this.floats.add(this.w / 2, this.oy - 6, `Netz steht! +${pts}`, '#ffd27a', 18);
    for (const c of this.cons) { const [px, py] = this.cellCenter(c); this.fx.burst(px, py, this.colors[this.b.owner[c]] ?? this.colors[0], 14, 160, 2.2); }
    if (this.mode !== 'chain') {
      setGoal(this.goals, 'moves', okMoves);
      setGoal(this.goals, 'fast', this.time <= this.limit / 2);
      setGoal(this.goals, 'pressure', this.minPressure >= 60);
      setGoal(this.goals, 'valve', this.valveTurns.every((v) => (v ?? 0) <= 3));
    } else {
      this.limit += CHAIN_BONUS;
      this.floats.add(this.w / 2, this.oy + 18, `+${CHAIN_BONUS} s`, '#6be38f', 15);
      setGoal(this.goals, 'chain5', this.boards >= 5);
      setGoal(this.goals, 'chain8', this.boards >= 8);
    }
    sfx.build();
  }

  update(dt: number): void {
    if (this.done) return;
    for (let i = 0; i < this.ang.length; i++) if (this.ang[i]) { this.ang[i] *= Math.exp(-dt * 18); if (Math.abs(this.ang[i]) < 0.01) this.ang[i] = 0; }
    this.fx.update(dt);
    this.floats.update(dt);
    this.score.update(dt);
    setGoal(this.goals, 'combo3', this.score.maxCombo >= 3);
    if (this.failed) {
      this.won += dt;
      if (this.won > 1.2) this.done = this.finish(false);
      return;
    }
    if (this.won >= 0) {
      this.won += dt;
      if (this.won > 1.4) {
        if (this.mode === 'chain') this.loadBoard(Math.min(5, 1 + this.boards) as Level);
        else this.done = this.finish(true);
      }
      return;
    }
    this.time += dt;
    this.boardTime += dt;
    // Druck: offene Enden lassen ihn sinken, dichtes Netz baut ihn wieder auf
    if (this.pressureRate > 0 && this.boardTime > 4) {
      const leaks = Math.min(4, this.p.leaks.length);
      this.pressure = clamp(this.pressure + (leaks ? -leaks * this.pressureRate : 3) * dt, 0, 100);
      this.minPressure = Math.min(this.minPressure, this.pressure);
      if (this.pressure <= 0) { this.failed = 'Druck verloren'; this.won = 0; sfx.warn(); return; }
    }
    if (this.mode !== 'chain') setGoal(this.goals, 'pressure', this.minPressure >= 60);
    for (const [c, d] of this.p.leaks) {
      if (Math.random() > dt * 16) continue;
      const [px, py] = this.cellCenter(c);
      const { dx, dy } = DIRS[d];
      const ex = px + dx * this.cell * 0.5, ey = py + dy * this.cell * 0.5;
      const sp = 50 + Math.random() * 60;
      const col = this.p.color[c] >= 0 ? this.colors[this.p.color[c]] : this.colors[0];
      this.fx.add({ x: ex, y: ey, vx: dx * sp + (Math.random() - 0.5) * 50, vy: dy * sp + (Math.random() - 0.5) * 50, color: col, size: 1.4, max: 0.5, drag: 2 });
    }
    if (this.time >= this.limit) { this.failed = 'Zeit abgelaufen'; this.won = 0; }
  }

  private finish(ok: boolean): GameResult {
    let stars = 0;
    let success = ok;
    if (this.mode === 'chain') {
      success = this.boards >= 1;
      stars = this.boards >= 6 ? 3 : this.boards >= 4 ? 2 : this.boards >= 2 ? 1 : 0;
    } else if (ok) {
      stars = 3;
      if (this.boardMoves > this.parMoves * 1.6 + 3) stars--;
      if (this.time > this.limit * 0.5) stars--;
    }
    if (!success) for (const g of this.goals) if (g.id !== 'combo3') g.done = false;
    return {
      success,
      stars: stars as 0 | 1 | 2 | 3,
      score: ok ? 100 : Math.round((this.p.okConsumers / Math.max(1, this.cons.length)) * 100),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: this.mode === 'chain' ? `${this.boards} ${this.boards === 1 ? 'Netz' : 'Netze'} geschafft` : ok ? 'Versorgung steht' : this.failed || 'Nicht geschafft',
      lines: this.mode === 'chain'
        ? [['Netze', `${this.boards}`], ['Züge', `${this.moves}`], ['Beste Kombo', `×${String(this.score.maxCombo).replace('.', ',')}`]]
        : [
          ['Zeit', fmtTime(this.time)],
          ['Züge', `${this.boardMoves} (Bestwert ${this.parMoves})`],
          ['Module versorgt', `${this.p.okConsumers} von ${this.cons.length}`],
          ['Beste Kombo', `×${String(this.score.maxCombo).replace('.', ',')}`],
        ],
    };
  }

  result(): GameResult | null {
    return this.done;
  }

  abort(): GameResult {
    const r = this.finish(false);
    for (const g of r.goals) g.done = false;
    r.headline = 'Abgebrochen';
    return r;
  }

  // ---------- Darstellung ----------

  private visible(i: number): boolean {
    if (this.mutator?.id !== 'dark') return true;
    if (this.p.dist[i] >= 0) return true;
    const n = this.b.n, x = i % n, y = Math.floor(i / n);
    for (const { dx, dy } of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < n && ny < n && this.p.dist[ny * n + nx] >= 0) return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const { w, h, cell, ox, oy } = this;
    const n = this.b.n;
    const t = now / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#06111b');
    g.addColorStop(1, '#03080e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(110,220,205,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 24) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y < h; y += 24) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110,220,205,0.25)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, ox - 8, oy - 8, cell * n + 16, cell * n + 16, 14);
    ctx.stroke();
    const winGlow = this.won >= 0 && !this.failed ? Math.min(1, this.won * 2) : 0;
    for (let i = 0; i < n * n; i++) {
      const [cx, cy] = this.cellCenter(i);
      if (this.b.blocked[i]) { this.drawBlocked(ctx, cx, cy); continue; }
      const col = this.p.color[i];
      const vis = this.visible(i);
      ctx.fillStyle = col >= 0 ? rgba(this.colors[col], 0.05 + winGlow * 0.08) : 'rgba(14,30,44,0.75)';
      roundRect(ctx, cx - cell / 2 + 2, cy - cell / 2 + 2, cell - 4, cell - 4, Math.min(8, cell * 0.15));
      ctx.fill();
      const grp = this.b.group[i];
      ctx.strokeStyle = grp >= 0 && vis ? rgba(GROUP_COLORS[grp % GROUP_COLORS.length], 0.7) : 'rgba(110,220,205,0.10)';
      ctx.lineWidth = grp >= 0 && vis ? 2 : 1;
      ctx.stroke();
      if (!vis) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.ang[i]);
      if (this.b.bridge[i]) this.drawBridge(ctx, i, t);
      else this.drawTile(ctx, i, t, winGlow);
      ctx.restore();
      if (grp >= 0) {
        ctx.fillStyle = GROUP_COLORS[grp % GROUP_COLORS.length];
        ctx.beginPath();
        ctx.arc(cx - cell / 2 + 9, cy - cell / 2 + 9, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.b.fixed[i]) {
        ctx.strokeStyle = 'rgba(63,224,197,0.5)';
        ctx.lineWidth = 1.5;
        const e = cell / 2 - 5, l = cell * 0.14;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + sx * e, cy + sy * (e - l)); ctx.lineTo(cx + sx * e, cy + sy * e); ctx.lineTo(cx + sx * (e - l), cy + sy * e); }
        ctx.stroke();
      }
    }
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    this.drawFooter(ctx, t);
  }

  private drawFooter(ctx: CanvasRenderingContext2D, t: number): void {
    const { w, h, cell, oy } = this;
    const n = this.b.n;
    const y0 = Math.min(h - 50, oy + cell * n + 28);
    if (this.pressureRate > 0) {
      const bw = Math.min(220, w - 60), bx = (w - bw) / 2;
      const f = this.pressure / 100;
      ctx.fillStyle = 'rgba(14,30,44,0.85)';
      ctx.fillRect(bx, y0, bw, 6);
      ctx.fillStyle = f < 0.3 ? (Math.sin(t * 10) > 0 ? '#ff5c6c' : '#a03040') : f < 0.6 ? '#ffb547' : '#3fe0c5';
      ctx.fillRect(bx, y0, bw * f, 6);
      ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(169,195,198,0.85)';
      ctx.fillText(`DRUCK ${Math.round(this.pressure)} %`, bx, y0 - 5);
    }
    ctx.fillStyle = 'rgba(169,195,198,0.75)';
    ctx.font = '500 13px Barlow, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const missing = this.cons.length - this.p.okConsumers;
    const msg = this.failed ? this.failed
      : this.won >= 0 ? 'Alle Module versorgt'
        : this.p.mixed.length ? 'Waren vermischt – Leitungen trennen'
          : this.p.leaks.length ? `${this.p.leaks.length} offene ${this.p.leaks.length === 1 ? 'Leitung' : 'Leitungen'} – Rohre drehen`
            : `${missing} ${missing === 1 ? 'Modul' : 'Module'} ohne Versorgung`;
    ctx.fillText(msg, w / 2, y0 + 26);
  }

  private drawBlocked(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const c = this.cell;
    ctx.fillStyle = 'rgba(30,18,18,0.6)';
    roundRect(ctx, cx - c / 2 + 2, cy - c / 2 + 2, c - 4, c - 4, Math.min(8, c * 0.15));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,92,108,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - c / 2 + 4, cy - c / 2 + 4, c - 8, c - 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,92,108,0.12)';
    ctx.lineWidth = 3;
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cx - c / 2 + k * c * 0.25, cy + c / 2); ctx.lineTo(cx + c / 2 + k * c * 0.25, cy - c / 2); ctx.stroke(); }
    ctx.restore();
  }

  private pipeColor(col: number): string {
    return col >= 0 ? this.colors[col] : col === -2 ? '#ffffff' : '#3d5a68';
  }

  private stroke(ctx: CanvasRenderingContext2D, arms: [number, number][], col: number, t: number, dist: number, winGlow: number): void {
    const c = this.cell;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#16303f';
    ctx.lineWidth = c * 0.3;
    ctx.beginPath();
    for (const [dx, dy] of arms) { ctx.moveTo(0, 0); ctx.lineTo(dx * c * 0.5, dy * c * 0.5); }
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of arms) { ctx.moveTo(0, 0); ctx.lineTo(dx * c * 0.5, dy * c * 0.5); }
    if (col >= 0) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 5 - dist * 0.9);
      ctx.strokeStyle = rgba(this.colors[col], 0.16 + 0.12 * winGlow);
      ctx.lineWidth = c * 0.24;
      ctx.stroke();
      ctx.strokeStyle = rgba(this.colors[col], clamp(pulse + winGlow, 0, 1));
      ctx.lineWidth = c * 0.09;
      ctx.stroke();
    } else if (col === -2) {
      ctx.strokeStyle = Math.sin(t * 14) > 0 ? '#ffffff' : '#ff5c6c';
      ctx.lineWidth = c * 0.1;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#3d5a68';
      ctx.lineWidth = c * 0.08;
      ctx.stroke();
    }
  }

  private drawBridge(ctx: CanvasRenderingContext2D, i: number, t: number): void {
    const c = this.cell;
    const dist = Math.max(0, this.p.dist[i]);
    this.stroke(ctx, [[0, -1], [0, 1]], this.p.color[i], t, dist, 0);
    // waagrechter Kanal liegt darüber, mit dunklem Spalt
    ctx.strokeStyle = '#06111b';
    ctx.lineWidth = c * 0.42;
    ctx.beginPath();
    ctx.moveTo(-c * 0.22, 0); ctx.lineTo(c * 0.22, 0);
    ctx.stroke();
    this.stroke(ctx, [[-1, 0], [1, 0]], this.p.colorH[i], t, dist, 0);
    ctx.strokeStyle = 'rgba(120,180,200,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-c * 0.2, -c * 0.17, c * 0.4, c * 0.34);
  }

  private drawTile(ctx: CanvasRenderingContext2D, i: number, t: number, winGlow: number): void {
    const m = this.b.mask[i];
    const c = this.cell;
    const srcIdx = this.b.sources.indexOf(i);
    const isCons = srcIdx < 0 && bits(this.b.solution[i]) === 1;
    const col = this.p.color[i];
    const arms: [number, number][] = [];
    for (const d of DIRS) if (m & d.bit) arms.push([d.dx, d.dy]);
    this.stroke(ctx, arms, col, t, Math.max(0, this.p.dist[i]), winGlow);
    ctx.strokeStyle = 'rgba(120,180,200,0.22)';
    ctx.lineWidth = 1;
    for (const [dx, dy] of arms) {
      const ex = dx * c * 0.44, ey = dy * c * 0.44;
      ctx.beginPath();
      ctx.moveTo(ex - dy * c * 0.17, ey - dx * c * 0.17);
      ctx.lineTo(ex + dy * c * 0.17, ey + dx * c * 0.17);
      ctx.stroke();
    }
    if (srcIdx >= 0) {
      const sc = this.colors[srcIdx];
      const r = c * 0.3;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = '#0a2020';
      ctx.fill();
      ctx.strokeStyle = rgba(sc, 0.25);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = sc;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.rotate(-this.ang[i]);
      drawWareGlyph(ctx, this.wares[srcIdx], r * 1.1, '#ffffff', 0.6 + 0.4 * Math.sin(t * 4));
      ctx.restore();
      return;
    }
    if (isCons) {
      const need = this.b.owner[i];
      const ok = col === need;
      const wrong = col >= 0 && !ok;
      const s = c * 0.56;
      ctx.save();
      ctx.rotate(-this.ang[i]);
      ctx.fillStyle = ok ? rgba(this.colors[need], 0.22 + 0.15 * winGlow) : '#0c1c28';
      roundRect(ctx, -s / 2, -s / 2, s, s, 6);
      ctx.fill();
      ctx.strokeStyle = ok ? this.colors[need] : wrong ? '#ff5c6c' : rgba(this.colors[need], 0.45);
      ctx.lineWidth = ok ? 2 : 1.5;
      ctx.stroke();
      drawWareGlyph(ctx, this.wares[need] ?? this.wares[0], s * 0.62, ok ? '#ffffff' : this.colors[need], ok ? 0.95 : 0.55);
      ctx.restore();
      return;
    }
    ctx.fillStyle = col >= 0 ? rgba(this.pipeColor(col), 0.9) : '#2a4352';
    ctx.beginPath();
    ctx.arc(0, 0, c * (arms.length >= 3 ? 0.12 : 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}
