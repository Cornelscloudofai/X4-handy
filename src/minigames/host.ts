// Rahmen der Minispiele: Vollbild-Ebene über dem Spiel mit eigener Leinwand und Schleife,
// Einführung, Pause, Auswertung mit Sternen. Das Hauptspiel ruht, solange ein Minispiel offen ist.
import { sfx } from '../ui/sound';
import { esc } from '../ui/dom';
import type { GameResult, Level, MiniGame } from './common';
import { PipesGame } from './pipes';
import { OreGame } from './ore';
import { GasGame } from './gas';
import { ShooterGame, type Gear } from './shooter';

export type MiniKind = 'pipes' | 'ore' | 'gas' | 'pirates' | 'xenon';

export interface MiniOpts {
  level: Level;
  seed?: number;
  /** Ware des Spiels (Rohr-Puzzle: Ware des Moduls; Abbau: Rohstoff) */
  ware?: string;
  /** Ausrüstung im Kampf */
  gear?: Gear;
}

export const MINI_INFO: Record<MiniKind, { name: string; sub: string; icon: string }> = {
  pipes: { name: 'Störung beheben', sub: 'Rohr-Puzzle: Leitungen drehen, bis alle Module versorgt sind', icon: 'wrench' },
  ore: { name: 'Reiche Erzader', sub: 'Bergbau: Mit dem Laser den Adern folgen, ohne zu überhitzen', icon: 'miner' },
  gas: { name: 'Gaswirbel', sub: 'Gas sammeln: Den Sammler durch dichte Schwaden steuern', icon: 'miner' },
  pirates: { name: 'Piratenangriff', sub: 'Kampf: Den Frachter bis zum Sprungtor beschützen', icon: 'warn' },
  xenon: { name: 'Xenon-Schwarm', sub: 'Kampf: Xenon greifen in Schwärmen an', icon: 'target' },
};
export const MINI_KINDS = Object.keys(MINI_INFO) as MiniKind[];

// Bestwerte (Sterne je Spiel und Stufe) – vorerst nur auf diesem Gerät, später im Spielstand
const BEST_KEY = 'x4-sektorbau-mgbest';

function loadBest(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function bestStars(kind: MiniKind, level: Level): number {
  return loadBest()[`${kind}:${level}`] ?? -1;
}

export function recordBest(kind: MiniKind, level: Level, stars: number): void {
  const b = loadBest();
  const k = `${kind}:${level}`;
  if ((b[k] ?? -1) >= stars) return;
  b[k] = stars;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function create(kind: MiniKind, o: MiniOpts): MiniGame {
  const seed = o.seed ?? Math.floor(Math.random() * 1e9);
  switch (kind) {
    case 'pipes': return new PipesGame(o.level, seed, o.ware);
    case 'ore': return new OreGame(o.level, seed, o.ware);
    case 'gas': return new GasGame(o.level, seed, o.ware);
    case 'pirates': return new ShooterGame(o.level, seed, 'pirate', o.gear);
    case 'xenon': return new ShooterGame(o.level, seed, 'xenon', o.gear);
  }
}

type Phase = 'intro' | 'play' | 'pause' | 'end';

interface Session {
  kind: MiniKind;
  opts: MiniOpts;
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
  result: GameResult | null;
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
    <div class="mg-layer" hidden></div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  const canvas = root.querySelector('canvas')!;
  const game = create(kind, opts);
  cur = { kind, opts, game, phase: 'intro', root, canvas, ctx: canvas.getContext('2d')!, dpr: 1, w: 1, h: 1, last: 0, raf: 0, hudKey: '', result: null, onDone, replay };
  (root.querySelector('.mg-title') as HTMLElement).innerHTML = `<small>${esc(game.eyebrow)}</small><b>${esc(game.title)}</b>`;
  resize();
  bindInput(cur);
  setPhase('intro');
  cur.raf = requestAnimationFrame(loop);
  sfx.open();
  (window as unknown as { __mg: unknown }).__mg = { get game() { return cur?.game; }, get phase() { return cur?.phase; }, start: () => setPhase('play') };
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
  // Platz für die obere Leiste freihalten: die Spiele zeichnen in der vollen Fläche, wissen aber um den Rand
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
      case 'abort': s.result = s.game.abort(); setPhase('end'); break;
      case 'again': {
        const { kind, opts, onDone, replay } = s;
        onDone?.(s.result);
        s.onDone = undefined;
        close(null);
        openMinigame(kind, { ...opts, seed: undefined }, onDone, replay);
        setPhase('play');
        break;
      }
    }
  });
}

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';

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
  if (p === 'intro') {
    layer.innerHTML = `<div class="mg-card"><small class="eyebrow">${esc(g.eyebrow)}</small><h2>${esc(g.title)}</h2><p>${esc(g.intro)}</p>
      <ul class="mg-controls">${g.controls.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="mg-actions"><button class="btn ghost" data-mg="quit">Zurück</button><button class="btn primary" data-mg="start">Start</button></div></div>`;
  } else if (p === 'pause') {
    layer.innerHTML = `<div class="mg-card"><small class="eyebrow">Pause</small><h2>${esc(g.title)}</h2>
      <div class="mg-actions col"><button class="btn primary" data-mg="resume">Weiter</button><button class="btn ghost" data-mg="abort">Aufgeben</button></div></div>`;
  } else {
    const r = s.result!;
    layer.innerHTML = `<div class="mg-card end ${r.success ? 'win' : 'lose'}"><small class="eyebrow">${r.success ? 'Geschafft' : 'Nicht geschafft'}</small><h2>${esc(r.headline)}</h2>
      <div class="mg-stars">${[1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}" style="--d:${i * 0.18}s">${STAR}</span>`).join('')}</div>
      <div class="mg-lines">${r.lines.map(([k, v]) => `<div><small>${esc(k)}</small><b class="num">${esc(v)}</b></div>`).join('')}</div>
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
    if (r) { s.result = r; setPhase('end'); }
  }
  const ctx = s.ctx;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  s.game.draw(ctx, now);
  // Statusleiste nur bei Änderung neu schreiben
  const items = s.game.hud();
  const key = items.map((i) => i.label + i.value + (i.warn ? '!' : '')).join('|');
  if (key !== s.hudKey) {
    s.hudKey = key;
    (s.root.querySelector('.mg-hud') as HTMLElement).innerHTML = items.map((i) => `<div class="${i.warn ? 'warn' : ''}"><small>${esc(i.label)}</small><b class="num">${esc(i.value)}</b></div>`).join('');
  }
  s.raf = requestAnimationFrame(loop);
}
