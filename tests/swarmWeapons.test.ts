// Waffen gegen Schwärme: Kettenblitz (Bordwaffe), Flakturm, Karten für Schrotwaffen und den Kettenblitz
import { describe, expect, it } from 'vitest';
import { ShooterGame, interceptTime } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, FLAK_SCOUT_HP, TURRETS, turretDps, type Loadout } from '../src/minigames/loadout';
import { enemyStats } from '../src/minigames/shooterData';

type E = { kind: string; x: number; y: number; hp: number; max: number; sh: number; shMax: number; parent?: unknown; stun?: number; vx: number; vy: number };
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
  it('springt durch eine Reihe Späher (4 Sprünge, 5 Ziele) und zerstört auf Stufe 1 jeden mit einem Treffer', () => {
    const g = game({ weapon: 'blitz' }, 1);
    g.aimA = -Math.PI / 2;
    for (let k = 0; k < 6; k++) g.enemies.push(g.makeEnemy('ks', g.px + (k % 2 ? 40 : -40), g.py - 150 - k * 110));
    g.fireChain(g.px, g.py - 20, -Math.PI / 2);
    expect(g.enemies.filter((e) => e.kind === 'ks').length).toBe(1);
    expect(g.zaps.length).toBe(1);
  });

  it('fester Schaden wie alle Waffen: auf Stufe 3 reicht ein Treffer nicht mehr', () => {
    const g = game({ weapon: 'blitz' }, 3);
    const e = g.makeEnemy('ks', g.px, g.py - 150);
    g.enemies.push(e);
    g.fireChain(g.px, g.py - 20, -Math.PI / 2);
    expect(g.enemies.includes(e)).toBe(true);
    expect(e.hp + e.sh).toBeLessThan(e.max * 0.6);
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

describe('Störblitz', () => {
  it('legt eine Reihe Späher lahm, ohne Schaden: weggestoßen, gelähmt, Ionenwolke; danach geht es weiter', () => {
    const g = game({ weapon: 'stoerblitz' });
    const row: E[] = [];
    for (let k = 0; k < 6; k++) row.push(g.makeEnemy('ks', g.px + (k % 2 ? 40 : -40), g.py - 150 - k * 110));
    g.enemies.push(...row);
    for (const e of row) { e.vx = 0; e.vy = 120; }
    g.fireChain(g.px, g.py - 20, -Math.PI / 2);
    expect(row.every((e) => (e.stun ?? 0) > 1.4)).toBe(true);
    expect(row.every((e) => e.hp === e.max && e.sh === e.shMax)).toBe(true);
    const e0 = row[0], d0 = Math.hypot(e0.x - g.px, e0.y - g.py);
    for (let i = 0; i < 60; i++) g.update(DT);
    // vom Schiff weggestoßen (gut 100 Punkte), steht dann fast still, schießt nicht
    expect(Math.hypot(e0.x - g.px, e0.y - g.py)).toBeGreaterThan(d0 + 100);
    expect(Math.hypot(e0.vx, e0.vy)).toBeLessThan(40);
    expect(g.bullets.filter((b) => (b as { from?: string }).from === 'e').length).toBe(0);
    // ein frischer Späher, der in die Ionenwolke fliegt, wird ebenfalls gelähmt
    const late = g.makeEnemy('ks', g.px - 40, g.py - 150);
    g.enemies.push(late);
    g.update(DT);
    expect(late.stun ?? 0).toBeGreaterThan(0);
    // Wolken und Lähmung klingen ab
    for (let i = 0; i < 60 * 5; i++) g.update(DT);
    expect(e0.stun ?? 0).toBeLessThanOrEqual(0);
  });

  it('Überladung: ein gelähmter Späher der Stufe 1 fällt nach vier weiteren Treffern, nicht nach drei', () => {
    const g = game({ weapon: 'stoerblitz' }, 1);
    const e = g.makeEnemy('ks', g.px, g.py - 300);
    g.enemies.push(e);
    const zap = () => { e.x = g.px; e.y = g.py - 300; g.fireChain(g.px, g.py - 20, -Math.PI / 2); };
    zap();
    expect(e.hp + e.sh).toBe(e.max + e.shMax);
    for (let k = 0; k < 3; k++) zap();
    expect(g.enemies.includes(e)).toBe(true);
    zap();
    expect(g.enemies.includes(e)).toBe(false);
  });

  it('senkt den Schild von Großkampfschiffen und Türmen, ohne sie lahmzulegen', () => {
    const g = game({ weapon: 'stoerblitz' });
    g.spawnBoss(false);
    const t = g.enemies.find((e) => e.parent)!;
    t.sh = t.shMax;
    const hp = t.hp;
    g.fireChain(t.x, t.y + 60, -Math.PI / 2);
    expect(t.sh).toBeLessThan(t.shMax);
    expect(t.hp).toBe(hp);
    expect(t.stun ?? 0).toBe(0);
    // ionisiert: nimmt eine Weile mehr Schaden
    expect((t as { ion?: number }).ion ?? 0).toBeGreaterThan(1);
  });
});

describe('Flakturm', () => {
  it('Vorhalt: Abfangzeit exakt – auch gegen anfliegende Ziele bei langsamem Geschoss', () => {
    // frontal anfliegend: Granate 339/s, Ziel 300/s auf den Turm zu, 600 entfernt → Treffen nach 600 / 639 s
    expect(interceptTime(0, -600, 0, 300, 339)).toBeCloseTo(600 / 639, 4);
    // wegfliegend: 600 / (339 − 300)
    expect(interceptTime(0, -600, 0, -300, 339)).toBeCloseTo(600 / 39, 3);
    // quer: Ziel 600 voraus, 200/s seitwärts → |(200t, −600)| = 339t
    const t = interceptTime(0, -600, 200, 0, 339);
    expect(Math.hypot(200 * t, 600)).toBeCloseTo(339 * t, 3);
  });

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

describe('Anzeige im Ausstattungsmenü', () => {
  it('Flakturm: Schaden der Sprengwolke je Ziel (Späher Stufe 1), nicht der Granate', () => {
    const s = enemyStats('ks', 1, {});
    expect(FLAK_SCOUT_HP).toBeCloseTo(s.hp + s.sh, 1);
    // gegen ein einzelnes S-Ziel etwa so stark wie der Gatling-Turm im Mittel, deutlich über dem Pulsturm (Wolke statt Einzeltreffer)
    expect(turretDps(TURRETS.flak)).toBeGreaterThan(turretDps(TURRETS.puls) * 1.5);
  });
});

describe('Gatling-Turm', () => {
  it('lädt in einer Feuerpause nach, statt mit halbem Magazin in den nächsten Kampf zu gehen', () => {
    const g = game({ ship: 'cobra', turret: 'neutron' });
    const t = (g as unknown as { pTur: { mag: number; cd: number }[] }).pTur[0];
    t.mag = 5; t.cd = 0;
    for (let i = 0; i < 60 * 4; i++) g.update(DT);
    expect(t.mag).toBe(5);
    for (let i = 0; i < 60 * 2; i++) g.update(DT);
    expect(t.mag).toBe(80);
  });
});
