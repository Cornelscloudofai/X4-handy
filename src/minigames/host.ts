// Rahmen der Minispiele: Vollbild-Ebene über dem Spiel mit eigener Leinwand und Schleife,
// Einführung (Besonderheit der Runde, Nebenziele), Punktezeile mit Kombo, Pause, Auswertung mit Sternen,
// Rekorden und Abzeichen. Das Hauptspiel ruht, solange ein Minispiel offen ist.
import { sfx } from '../ui/sound';
import { esc } from '../ui/dom';
import { daySeed, rng, type GameCfg, type GameResult, type Gear, type GoalDef, type Level, type MiniGame, type Mode, type Mutator } from './common';
import { PIPES_GOALS, PIPES_MUTATORS, PipesGame } from './pipes';
import { ORE_GOALS, ORE_MUTATORS, OreGame } from './ore';
import { GAS_GOALS, GAS_MUTATORS, GasGame } from './gas';
import { SHOOTER_GOALS, SHOOTER_MUTATORS, ShooterGame } from './shooter';
import { best, bestPoints, dailyBest, hasBadge, recordResult, today, type RecordOutcome } from './records';

export type MiniKind = 'pipes' | 'ore' | 'gas' | 'pirates' | 'xenon';

export interface MiniOpts {
  level: Level;
  seed?: number;
  /** Ware des Spiels (Rohr-Puzzle: Ware des Moduls; Abbau: Rohstoff) */
  ware?: string;
  /** Ausrüstung im Kampf */
  gear?: Gear;
  /** Besonderheit: Kennung, null = keine, undefined = zufällig (jede zweite Runde) */
  mutator?: string | null;
  mode?: Mode;
}

export const MINI_INFO: Record<MiniKind, { name: string; sub: string; icon: string; chain?: string; endless?: string }> = {
  pipes: { name: 'Störung beheben', sub: 'Rohr-Puzzle: Leitungen drehen, bis alle Module versorgt sind', icon: 'wrench', chain: 'Leitungskette: Netz um Netz gegen die Uhr' },
  ore: { name: 'Reiche Erzader', sub: 'Bergbau: Mit dem Laser den Adern folgen, ohne zu überhitzen', icon: 'miner' },
  gas: { name: 'Gaswirbel', sub: 'Gas sammeln und am Mutterschiff sichern', icon: 'miner' },
  pirates: { name: 'Piratenangriff', sub: 'Kampf: Den Frachter bis zum Sprungtor beschützen', icon: 'warn', endless: 'Endloser Geleitschutz: Wie viele Wellen hältst du?' },
  xenon: { name: 'Xenon-Schwarm', sub: 'Kampf: Xenon greifen in Schwärmen an', icon: 'target', endless: 'Endlose Xenon-Abwehr: Wie viele Wellen hältst du?' },
};
export const MINI_KINDS = Object.keys(MINI_INFO) as MiniKind[];

export function mutatorsOf(kind: MiniKind): Mutator[] {
  return kind === 'pipes' ? PIPES_MUTATORS : kind === 'ore' ? ORE_MUTATORS : kind === 'gas' ? GAS_MUTATORS : SHOOTER_MUTATORS;
}

export function goalsOf(kind: MiniKind): GoalDef[] {
  return kind === 'pipes' ? PIPES_GOALS : kind === 'ore' ? ORE_GOALS : kind === 'gas' ? GAS_GOALS : SHOOTER_GOALS;
}

/** Tagesaufgabe: fester Startwert und feste Besonderheit für heute, Stufe 3 */
export function dailyOpts(kind: MiniKind, date = today()): MiniOpts {
  const seed = daySeed(date, kind);
  const list = mutatorsOf(kind);
  const r = rng(seed ^ 0x9e37);
  return { level: 3, seed, mutator: list[Math.floor(r() * list.length)].id, mode: 'daily' };
}

function resolve(kind: MiniKind, o: MiniOpts): GameCfg {
  const seed = o.seed ?? Math.floor(Math.random() * 1e9);
  let mutator = o.mutator;
  if (mutator === undefined) {
    const list = mutatorsOf(kind);
    mutator = Math.random() < 0.5 ? list[Math.floor(Math.random() * list.length)].id : null;
  }
  return { level: o.level, seed, ware: o.ware, gear: o.gear, mutator, mode: o.mode ?? 'normal' };
}

function create(kind: MiniKind, c: GameCfg): MiniGame {
  switch (kind) {
    case 'pipes': return new PipesGame(c);
    case 'ore': return new OreGame(c);
    case 'gas': return new GasGame(c);
    case 'pirates': return new ShooterGame(c, 'pirate');
    case 'xenon': return new ShooterGame(c, 'xenon');
  }
}

type Phase = 'intro' | 'play' | 'pause' | 'end';

interface Session {
  kind: MiniKind;
  opts: MiniOpts;
  cfg: GameCfg;
  game: MiniGame;
  phase: Phase;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;
  w: number;
  h: number;
  last: number;
  raf: number;
  hudKey: string;
  subKey: string;
  result: GameResult | null;
  outcome: RecordOutcome | null;
  onDone?: (r: GameResult | null) => void;
  /** Wiederholen erlaubt (Vorschau) */
  replay: boolean;
}

let cur: Session | null = null;

export function minigameOpen(): boolean {
  return !!cur;
}

/** Zurück-Taste: im Spiel pausieren, sonst schließen. true = behandelt */
export function minigameBack(): boolean {
  if (!cur) return false;
  if (cur.phase === 'play') setPhase('pause');
  else if (cur.phase === 'pause') setPhase('play');
  else close(cur.phase === 'end' ? cur.result : null);
  return true;
}

export function openMinigame(kind: MiniKind, opts: MiniOpts, onDone?: (r: GameResult | null) => void, replay = false): void {
  if (cur) close(null);
  const root = document.createElement('div');
  root.id = 'minigame';
  root.className = 'mg';
  root.innerHTML = `<canvas class="mg-canvas"></canvas>
    <div class="mg-top"><div class="mg-title"></div><div class="mg-hud"></div>
      <button class="mg-pause" data-mg="pause" aria-label="Pause"><svg width="20" height="20" viewBox="0 0 20 20"><rect x="5" y="4" width="3.2" height="12" rx="1"/><rect x="11.8" y="4" width="3.2" height="12" rx="1"/></svg></button></div>
    <div class="mg-sub"></div>
    <div class="mg-layer" hidden></div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  const canvas = root.querySelector('canvas')!;
  const cfg = resolve(kind, opts);
  const game = create(kind, cfg);
  cur = { kind, opts, cfg, game, phase: 'intro', root, canvas, ctx: canvas.getContext('2d')!, dpr: 1, w: 1, h: 1, last: 0, raf: 0, hudKey: '', subKey: '', result: null, outcome: null, onDone, replay };
  (root.querySelector('.mg-title') as HTMLElement).innerHTML = `<small>${esc(game.eyebrow)}</small><b>${esc(game.title)}</b>`;
  resize();
  bindInput(cur);
  setPhase('intro');
  cur.raf = requestAnimationFrame(loop);
  sfx.open();
  (window as unknown as { __mg: unknown }).__mg = { get game() { return cur?.game; }, get phase() { return cur?.phase; }, get cfg() { return cur?.cfg; }, start: () => setPhase('play') };
}

function close(r: GameResult | null): void {
  const s = cur;
  if (!s) return;
  cancelAnimationFrame(s.raf);
  s.root.remove();
  cur = null;
  s.onDone?.(r);
}

function resize(): void {
  const s = cur;
  if (!s) return;
  const r = s.root.getBoundingClientRect();
  s.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  s.w = Math.max(1, r.width);
  s.h = Math.max(1, r.height);
  s.canvas.width = Math.round(s.w * s.dpr);
  s.canvas.height = Math.round(s.h * s.dpr);
  s.game.resize(s.w, s.h);
}

window.addEventListener('resize', () => resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && cur?.phase === 'play') setPhase('pause'); });

function bindInput(s: Session): void {
  const pos = (e: PointerEvent): [number, number] => {
    const r = s.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  s.canvas.addEventListener('pointerdown', (e) => {
    if (s.phase !== 'play') return;
    s.canvas.setPointerCapture?.(e.pointerId);
    s.game.pointerDown(e.pointerId, ...pos(e));
    e.preventDefault();
  });
  s.canvas.addEventListener('pointermove', (e) => { if (s.phase === 'play') s.game.pointerMove(e.pointerId, ...pos(e)); });
  const up = (e: PointerEvent) => s.game.pointerUp(e.pointerId, ...pos(e));
  s.canvas.addEventListener('pointerup', up);
  s.canvas.addEventListener('pointercancel', up);
  s.root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mg]');
    if (!b || cur !== s) return;
    sfx.tap();
    switch (b.dataset.mg) {
      case 'start': case 'resume': setPhase('play'); break;
      case 'pause': if (s.phase === 'play') setPhase('pause'); break;
      case 'quit': close(s.phase === 'end' ? s.result : null); break;
      case 'abort': finish(s, s.game.abort()); break;
      case 'again': {
        const { kind, opts, onDone, replay } = s;
        onDone?.(s.result);
        s.onDone = undefined;
        close(null);
        // Tagesaufgabe bleibt gleich, sonst neue Runde mit neuer Besonderheit
        openMinigame(kind, opts.mode === 'daily' ? opts : { ...opts, seed: undefined, mutator: undefined }, onDone, replay);
        break;
      }
    }
  });
}

function finish(s: Session, r: GameResult): void {
  s.result = r;
  s.outcome = recordResult(s.kind, s.cfg.level, s.cfg.mode ?? 'normal', r);
  setPhase('end');
}

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
const fmtPts = (n: number) => Math.round(n).toLocaleString('de-DE');
const MODE_LABEL: Record<Mode, string> = { normal: '', daily: 'Tagesaufgabe', chain: 'Kette', endless: 'Endlos' };

function mutatorBox(m: Mutator | null): string {
  return m ? `<div class="mg-mut-box"><div><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></div><em class="num">×${String(m.mult).replace('.', ',')}</em></div>` : '';
}

function setPhase(p: Phase): void {
  const s = cur;
  if (!s) return;
  s.phase = p;
  const layer = s.root.querySelector<HTMLElement>('.mg-layer')!;
  s.root.classList.toggle('playing', p === 'play');
  if (p === 'play') {
    layer.hidden = true;
    layer.innerHTML = '';
    s.last = 0;
    return;
  }
  layer.hidden = false;
  const g = s.game;
  const mode = s.cfg.mode ?? 'normal';
  if (p === 'intro') {
    const rec = mode === 'daily' ? dailyBest(s.kind) : mode === 'normal' ? best(s.kind, s.cfg.level)?.points ?? null : bestPoints(s.kind, mode);
    layer.innerHTML = `<div class="mg-card"><small class="eyebrow">${esc(g.eyebrow)}${MODE_LABEL[mode] ? ' · ' + MODE_LABEL[mode] : ''} · Stufe ${s.cfg.level}</small><h2>${esc(g.title)}</h2><p>${esc(g.intro)}</p>
      ${mutatorBox(g.mutator)}
      <ul class="mg-controls">${g.controls.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      ${g.goals.length ? `<div class="mg-goals"><small>Nebenziele</small>${g.goals.map((q) => `<div class="${hasBadge(s.kind, q.id) ? 'has' : ''}"><i></i>${esc(q.text)}${hasBadge(s.kind, q.id) ? '<em>Abzeichen</em>' : ''}</div>`).join('')}</div>` : ''}
      ${rec ? `<p class="mg-rec">Rekord: <b class="num">${fmtPts(rec)}</b> Punkte</p>` : ''}
      <div class="mg-actions"><button class="btn ghost" data-mg="quit">Zurück</button><button class="btn primary" data-mg="start">Start</button></div></div>`;
  } else if (p === 'pause') {
    layer.innerHTML = `<div class="mg-card"><small class="eyebrow">Pause</small><h2>${esc(g.title)}</h2>
      ${g.goals.length ? `<div class="mg-goals">${g.goals.map((q) => `<div class="${q.done ? 'done' : ''}"><i></i>${esc(q.text)}</div>`).join('')}</div>` : ''}
      <div class="mg-actions col"><button class="btn primary" data-mg="resume">Weiter</button><button class="btn ghost" data-mg="abort">Aufgeben</button></div></div>`;
  } else {
    const r = s.result!;
    const o = s.outcome;
    layer.innerHTML = `<div class="mg-card end ${r.success ? 'win' : 'lose'}"><small class="eyebrow">${r.success ? 'Geschafft' : 'Nicht geschafft'}</small><h2>${esc(r.headline)}</h2>
      <div class="mg-stars">${[1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}" style="--d:${i * 0.18}s">${STAR}</span>`).join('')}</div>
      <div class="mg-points"><b class="num">${fmtPts(r.points)}</b><span>Punkte</span>${o?.newRecord ? '<em>Neuer Rekord!</em>' : o?.previous ? `<small>Rekord ${fmtPts(o.previous)}</small>` : ''}</div>
      <div class="mg-lines">${r.lines.map(([k, v]) => `<div><small>${esc(k)}</small><b class="num">${esc(v)}</b></div>`).join('')}</div>
      ${r.goals.length ? `<div class="mg-goals">${r.goals.map((q) => `<div class="${q.done ? 'done' : ''}"><i></i>${esc(q.text)}${o?.newBadges.includes(q.id) ? '<em>Neues Abzeichen</em>' : ''}</div>`).join('')}</div>` : ''}
      <div class="mg-actions">${s.replay ? '<button class="btn ghost" data-mg="again">Nochmal</button>' : ''}<button class="btn primary" data-mg="quit">Fertig</button></div></div>`;
    if (r.success) sfx.success(); else sfx.warn();
  }
}

function loop(now: number): void {
  const s = cur;
  if (!s) return;
  const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0;
  s.last = now;
  if (s.phase === 'play') {
    s.game.update(dt);
    const r = s.game.result();
    if (r) finish(s, r);
  }
  const ctx = s.ctx;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  s.game.draw(ctx, now);
  // Statusleiste und Punktezeile nur bei Änderung neu schreiben
  const items = s.game.hud();
  const key = items.map((i) => i.label + i.value + (i.warn ? '!' : '')).join('|');
  if (key !== s.hudKey) {
    s.hudKey = key;
    (s.root.querySelector('.mg-hud') as HTMLElement).innerHTML = items.map((i) => `<div class="${i.warn ? 'warn' : ''}"><small>${esc(i.label)}</small><b class="num">${esc(i.value)}</b></div>`).join('');
  }
  const g = s.game, combo = g.combo(), done = g.goals.filter((q) => q.done).length;
  const sub = `${Math.round(g.points())}|${combo}|${done}`;
  if (sub !== s.subKey) {
    s.subKey = sub;
    (s.root.querySelector('.mg-sub') as HTMLElement).innerHTML = `<span class="mg-pts"><b class="num">${fmtPts(g.points())}</b> Punkte</span>
      ${combo > 1 ? `<span class="mg-combo num" style="--k:${Math.min(1, (combo - 1) / 3)}">×${String(combo).replace('.', ',')}</span>` : ''}
      <span class="grow"></span>${g.goals.length ? `<span class="mg-goalcount">${g.goals.map((q) => `<i class="${q.done ? 'on' : ''}"></i>`).join('')}</span>` : ''}
      ${g.mutator ? `<span class="mg-mut">${esc(g.mutator.name)}</span>` : ''}`;
  }
  s.raf = requestAnimationFrame(loop);
}
