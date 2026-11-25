// Kampftasten anordnen: verschieben, Größe je Taste, Rand, hochkant/quer getrennt, gemerkt; das Spiel steht still
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame, resetLayoutCache } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT } from '../src/minigames/loadout';

const DT = 1 / 60;
type Item = { id: string; a: [number, number]; b: [number, number, number, number] };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; pointerDown(id: number, x: number, y: number): void;
  pointerMove(id: number, x: number, y: number): void; pointerUp(id: number): void; layoutEdit(on: boolean, done?: () => void): void;
  btnMissile: [number, number, number]; btnDash: [number, number, number]; layoutItems: Item[]; laySel: string | null; layPanel: { x: number; y: number; w: number; h: number };
  px: number; py: number; time: number; missileAmmo: number; fireMissiles(): void;
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  resetLayoutCache();
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; resetLayoutCache(); });

const game = (w = 390, h = 780): G => {
  const g = new ShooterGame({ level: 1, seed: 4, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, controls: 'zwei', loadout: { ...DEFAULT_LOADOUT, wing: {}, ship: 'dragon' } } as never, 'pirate') as unknown as G;
  g.resize(w, h);
  g.update(DT);
  return g;
};
const drag = (g: G, from: [number, number], to: [number, number]) => {
  g.pointerDown(7, from[0], from[1]);
  for (let i = 1; i <= 8; i++) g.pointerMove(7, from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8);
  g.pointerUp(7);
};
const panelSlider = (g: G, f: number) => {
  const p = g.layPanel, y = p.y + 57, x = p.x + 70 + f * (p.w - 140);
  g.pointerDown(8, x, y); g.pointerUp(8);
};

describe('Kampftasten anordnen', () => {
  it('Taste ziehen verschiebt sie; die gezogene ist gewählt', () => {
    const g = game();
    g.layoutEdit(true);
    const [x, y] = g.btnMissile;
    drag(g, [x, y], [x - 120, y - 200]);
    expect(g.laySel).toBe('missile');
    expect(g.btnMissile[0]).toBeCloseTo(x - 120, 0);
    expect(g.btnMissile[1]).toBeCloseTo(y - 200, 0);
  });

  it('Größenregler gilt nur für die gewählte Taste', () => {
    const g = game();
    g.layoutEdit(true);
    const [x, y, r] = g.btnMissile, rd = g.btnDash[2];
    g.pointerDown(7, x, y); g.pointerUp(7);
    panelSlider(g, 1);
    expect(g.btnMissile[2]).toBeCloseTo(r * 1.6, 1);
    expect(g.btnDash[2]).toBe(rd);
  });

  it('bleibt im Bild und klebt nicht am Rand: zurückziehen wirkt sofort', () => {
    const g = game();
    g.layoutEdit(true);
    const [x, y] = g.btnMissile;
    g.pointerDown(7, x, y);
    for (let i = 1; i <= 20; i++) g.pointerMove(7, x + 60 * i, y);
    const [ex, , er] = g.btnMissile;
    expect(ex).toBeLessThanOrEqual(390 - er);
    // ein Stück zurück: die Taste folgt gleich (kein aufgelaufener Überschuss)
    g.pointerMove(7, 390 - 120, y);
    expect(g.btnMissile[0]).toBeCloseTo(390 - 120 - (x - x), 0);
    g.pointerUp(7);
  });

  it('nie unter die Kopfzeile, auch nicht mit Beschriftung', () => {
    const g = game();
    g.layoutEdit(true);
    const [x, y] = g.btnMissile;
    drag(g, [x, y], [x, -400]);
    const it = g.layoutItems.find((i) => i.id === 'missile')!;
    expect(it.b[1]).toBeGreaterThan(0);
  });

  it('hochkant und quer getrennt gemerkt, und nach dem Neustart wieder da', () => {
    const g = game();
    g.layoutEdit(true);
    const [x, y] = g.btnMissile;
    drag(g, [x, y], [x - 100, y - 100]);
    const moved = g.btnMissile;
    // quer: unberührt
    const q = game(844, 390);
    const qBase = game(844, 390).btnMissile;
    expect(q.btnMissile).toEqual(qBase);
    // neu geladen (gemerkt im Speicher)
    resetLayoutCache();
    const g2 = game();
    expect(g2.btnMissile).toEqual(moved);
  });

  it('der Raketenknopf reagiert an seiner neuen Stelle, nicht mehr an der alten', () => {
    const g = game();
    g.layoutEdit(true);
    const [x, y] = g.btnMissile;
    drag(g, [x, y], [x - 150, y - 250]);
    g.layoutEdit(false);
    let fired = 0;
    g.fireMissiles = () => { fired++; };
    g.pointerDown(1, x, y); g.pointerUp(1);
    expect(fired).toBe(0);
    const [nx, ny] = g.btnMissile;
    g.pointerDown(2, nx, ny); g.pointerUp(2);
    expect(fired).toBe(1);
  });

  it('„Alle zurück“ und „Zurücksetzen“', () => {
    const g = game();
    const base = g.btnMissile, dBase = g.btnDash;
    g.layoutEdit(true);
    drag(g, [base[0], base[1]], [base[0] - 100, base[1] - 300]);
    drag(g, [dBase[0], dBase[1]], [dBase[0] - 100, dBase[1] - 100]);
    // gewählt ist jetzt die Spezialfähigkeit: Zurücksetzen betrifft nur sie
    const p = g.layPanel, by = p.y + p.h - 20, bw = (p.w - 32) / 3;
    g.pointerDown(9, p.x + 12 + bw / 2, by); g.pointerUp(9);
    expect(g.btnDash).toEqual(dBase);
    expect(g.btnMissile).not.toEqual(base);
    g.pointerDown(9, p.x + 12 + bw * 1.5 + 4, by); g.pointerUp(9);
    expect(g.btnMissile).toEqual(base);
  });

  it('beim Anordnen steht das Spiel still; „Fertig“ beendet und meldet zurück', () => {
    const g = game();
    let done = 0;
    g.layoutEdit(true, () => done++);
    const t0 = g.time, p0 = [g.px, g.py];
    for (let i = 0; i < 60; i++) g.update(DT);
    expect(g.time).toBe(t0);
    expect([g.px, g.py]).toEqual(p0);
    const p = g.layPanel, by = p.y + p.h - 20, bw = (p.w - 32) / 3;
    g.pointerDown(9, p.x + 12 + bw * 2.5 + 8, by); g.pointerUp(9);
    expect(done).toBe(1);
    g.update(DT);
    expect(g.time).toBeGreaterThan(t0);
  });

  it('das Bedienfeld verdeckt die gewählte Taste nicht', () => {
    for (const [w, h] of [[390, 780], [844, 390]]) {
      const g = game(w, h);
      g.layoutEdit(true);
      for (const it of g.layoutItems) {
        g.pointerDown(7, it.a[0], it.a[1]); g.pointerUp(7);
        if (g.laySel !== it.id) continue;
        const p = g.layPanel, [x0, y0, x1, y1] = it.b;
        const overlap = Math.min(p.x + p.w, x1) > Math.max(p.x, x0) && Math.min(p.y + p.h, y1) > Math.max(p.y, y0);
        expect(overlap, `${it.id} ${w}x${h}`).toBe(false);
      }
    }
  });
});
