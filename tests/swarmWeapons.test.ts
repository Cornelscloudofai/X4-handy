// Waffen gegen Schwärme: Kettenblitz (Bordwaffe), Flakturm, Karten für Schrotwaffen und den Kettenblitz
import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, type Loadout } from '../src/minigames/loadout';

type E = { kind: string; x: number; y: number; hp: number; max: number; sh: number; parent?: unknown };
type G = {
  update(dt: number): void; resize(w: number, h: number): void;
  px: number; py: number; aimA: number; enemies: E[]; clusters: Map<unknown, unknown>; bullets: { pflak?: boolean; x: number; y: number }[]; pTur: { a: number }[];
  makeEnemy(k: string, x: number, y: number): E; fireChain(x: number, y: number, a: number): void; spawnBoss(mini?: boolean): void;
  cardFits(c: { id: string; name: string; desc: string; max: number; need?: string[] }): boolean; zaps: unknown[];
};
const DT = 1 / 60;
const game = (lo: Partial<Loadout>, level = 3): G => {
  const g = new ShooterGame({ level, seed: 4, mutator: null, mode: 'normal', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {}, ...lo } } as never, 'khaak') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 3000 && !g.enemies.length; i++) g.update(DT);
  g.enemies.length = 0;
  g.clusters.clear();
  return g;
};

describe('Kettenblitz', () => {
  it('springt durch eine Reihe Späher und zerstört jeden mit einem Treffer', () => {
    const g = game({ weapon: 'blitz' });
    g.aimA = -Math.PI / 2;
    for (let k = 0; k < 6; k++) g.enemies.push(g.makeEnemy('ks', g.px + (k % 2 ? 40 : -40), g.py - 150 - k * 110));
    g.fireChain(g.px, g.py - 20, -Math.PI / 2);
    expect(g.enemies.filter((e) => e.kind === 'ks').length).toBe(0);
    expect(g.zaps.length).toBe(1);
  });

  it('gegen Großkampfschiffe und Türme fast wirkungslos', () => {
    const g = game({ weapon: 'blitz' });
    g.spawnBoss(false);
    const t = g.enemies.find((e) => e.parent)!;
    const before = t.hp + t.sh;
    g.fireChain(t.x, t.y + 60, -Math.PI / 2);
    const lost = before - (t.hp + t.sh);
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThan(before * 0.15);
  });

  it('Karte „Kettenreaktion“ nur mit Kettenblitz, Schrot-Karten nur mit mehreren Geschossen je Schuss', () => {
    const zap = { id: 'zap', name: '', desc: '', max: 2, need: ['zap'] }, multi = { id: 'pellets', name: '', desc: '', max: 2, need: ['multi'] }, guns = { id: 'spread', name: '', desc: '', max: 2, need: ['guns'] };
    const b = game({ weapon: 'blitz' }), s = game({ weapon: 'schrot' }), p = game({ weapon: 'puls' });
    expect(b.cardFits(zap)).toBe(true);
    expect(b.cardFits(guns)).toBe(false);
    expect(s.cardFits(multi)).toBe(true);
    expect(p.cardFits(multi)).toBe(false);
    expect(p.cardFits(zap)).toBe(false);
  });
});

describe('Flakturm', () => {
  it('Granaten zerplatzen in einem Schwarm und dünnen ihn aus', () => {
    const g = game({ ship: 'cobra', turret: 'flak' });
    const swarm: E[] = [];
    for (let k = 0; k < 12; k++) swarm.push(g.makeEnemy('ks', g.px + 180 + (k % 4) * 18, g.py - 160 + Math.floor(k / 4) * 18));
    g.enemies.push(...swarm);
    let flak = false;
    for (let i = 0; i < 60 * 4; i++) {
      g.update(DT);
      flak ||= g.bullets.some((b) => b.pflak);
    }
    expect(flak).toBe(true);
    // ohne Zutun der Bordwaffen: die vier Flaktürme holen in vier Sekunden mindestens die Hälfte herunter
    expect(swarm.filter((e) => g.enemies.includes(e)).length).toBeLessThanOrEqual(6);
  });

  it('jede Granate kommt aus dem nächsten der vier Rohre, vor dem Turm', () => {
    const g = game({ ship: 'cobra', turret: 'flak' });
    const e = g.makeEnemy('jaeger', g.px, g.py - 500);
    g.enemies.push(e);
    const starts: { x: number; y: number }[] = [];
    const seen = new Set<object>();
    for (let i = 0; i < 60 * 8 && starts.length < 8; i++) {
      e.x = g.px; e.y = g.py - 500; e.hp = e.max;
      g.update(DT);
      for (const b of g.bullets) if (b.pflak && !seen.has(b)) { seen.add(b); starts.push({ x: b.x - g.px, y: b.y - g.py }); }
    }
    expect(starts.length).toBeGreaterThanOrEqual(8);
    // aus der Turmmitte gefeuert, startete jede zweite Granate eines Turms an derselben Stelle – aus den Rohren nie
    const pts = new Set(starts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(pts.size).toBe(starts.length);
  });
});
