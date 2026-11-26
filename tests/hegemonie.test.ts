// Neue Fraktion (Arbeitsname Hegemonie), Testgegner: Zerstörer mit zehn Zwillingsgeschützen (Splittergranate)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, SHIPS, scaledLength, sizeScale, type ShipId } from '../src/minigames/loadout';

const DT = 1 / 60;
type E = { kind: string; x: number; y: number; r: number; hp: number; sh: number; max: number; parent?: E; weapon?: string; model?: string; ang: number; cd: number; salvo?: number; vx: number; vy: number };
type B = { from: string; split?: number; shard?: boolean; dmg: number; x: number; y: number; vx: number; vy: number };
type G = {
  update(dt: number): void; resize(w: number, h: number): void; enemies: E[]; bullets: B[]; reinforce: unknown[];
  px: number; py: number; pvx: number; pvy: number; hull: number; shield: number; wave: number; clusters: Map<unknown, unknown>;
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map([['x4-sektorbau-hegemonie-test', '1']]);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

const game = (ship: ShipId = 'dragon'): { g: G; b: E } => {
  const g = new ShooterGame({ level: 3, seed: 4, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {}, ship } } as never, 'pirate') as unknown as G;
  g.resize(390, 780);
  for (let i = 0; i < 60 * 20 && !g.enemies.some((e) => e.model === 'heg'); i++) g.update(DT);
  const b = g.enemies.find((e) => e.model === 'heg')!;
  // nur der Zerstörer bleibt
  g.enemies = g.enemies.filter((e) => e === b || e.parent === b); g.reinforce.length = 0; g.clusters.clear();
  return { g, b };
};
/** eigenes Schiff in Abstand d vor den Bug stellen und festhalten */
const hold = (g: G, b: E, d: number) => { g.px = b.x + Math.cos(b.ang) * d; g.py = b.y + Math.sin(b.ang) * d; g.pvx = g.pvy = 0; };

describe('Zerstörer der Hegemonie (Test)', () => {
  it('erscheint mit dem Test-Schalter: etwa 950 m lang, zehn Zwillingsgeschütze auf dem Rumpf, Rumpf geschützt', () => {
    const { b, g } = game();
    expect(b).toBeTruthy();
    const tur = g.enemies.filter((e) => e.parent === b);
    expect(tur.length).toBe(10);
    expect(tur.every((t) => t.weapon === 'splitter')).toBe(true);
    // Bildgröße 4,7 × Trefferradius; der Rumpf füllt 1 976 von 1 983 Bildpunkten
    expect(b.r * 4.7 * (1976 / 1983)).toBeCloseTo(scaledLength(950, sizeScale()), 0);
    // alle Geschütze liegen auf dem Rumpf (innerhalb der halben Länge)
    for (const t of tur) expect(Math.hypot(t.x - b.x, t.y - b.y)).toBeLessThan(b.r * 4.7 * 0.5);
    expect(g.enemies.find((e) => e === b) && (b as unknown as { shielded: boolean }).shielded).toBe(true);
  });

  it('Zwillingsgeschütz so groß wie sein M-Sockel und wie die M-Türme der Dragon, nicht wie ein L-Turm', () => {
    const { g, b } = game();
    const t = g.enemies.find((e) => e.parent === b)!;
    // Drehsockel im Bild: 2 × Trefferradius; Sockelring im Rumpfbild: 36 von 1 976 px Rumpflänge
    const disc = 2 * t.r, ring = (36 / 1976) * b.r * 4.7 * (1976 / 1983);
    expect(disc / ring).toBeGreaterThan(0.85);
    expect(disc / ring).toBeLessThan(1.15);
    const d = SHIPS.dragon, dragonDisc = d.size * (d.turretD ?? 0.1);
    expect(disc / dragonDisc).toBeLessThan(1.4);
  });

  it('ohne Test-Schalter kein Zerstörer', () => {
    store.delete('x4-sektorbau-hegemonie-test');
    const g = new ShooterGame({ level: 3, seed: 4, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, loadout: { ...DEFAULT_LOADOUT, wing: {} } } as never, 'pirate') as unknown as G;
    g.resize(390, 780);
    for (let i = 0; i < 60 * 6; i++) g.update(DT);
    expect(g.enemies.some((e) => e.model === 'heg')).toBe(false);
  });

  it('Feuerrhythmus: zwei kurze Stöße (je zwei Schuss), dann eine deutliche Pause', () => {
    const { g, b } = game();
    const t = g.enemies.find((e) => e.parent === b)!;
    for (const q of g.enemies) if (q.parent === b && q !== t) q.cd = 1e9;
    t.cd = 0;
    const times: number[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      hold(g, b, 1100);
      const n0 = g.bullets.filter((x) => x.split != null).length;
      g.update(DT); g.hull = g.shield = 100;
      const n1 = g.bullets.filter((x) => x.split != null).length;
      if (n1 > n0) for (let k = 0; k < n1 - n0; k++) times.push(i * DT);
    }
    expect(times.length).toBeGreaterThanOrEqual(4);
    const gaps = times.slice(1).map((x, i) => x - times[i]);
    // erster Zyklus: kurz, länger (zweiter Stoß), kurz – dann Pause von über zwei Sekunden
    expect(gaps[0]).toBeLessThan(0.12);
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
    expect(gaps[1]).toBeLessThan(0.4);
    expect(gaps[2]).toBeLessThan(0.12);
    // Pause: Grundwert 2,5 s geteilt durch das Turmtempo der Stufe (Stufe 3 rund 1,4)
    expect(gaps.length).toBeGreaterThan(3);
    expect(gaps[3]).toBeGreaterThan(1.5);
  });

  it('Splittergranate: zerlegt sich vor dem Ziel in acht Splitter, die im Kegel weiterfliegen', () => {
    const { g, b } = game();
    for (const q of g.enemies) if (q.parent === b) q.cd = 1e9;
    const t = g.enemies.find((e) => e.parent === b)!;
    t.cd = 0;
    let shell: B | undefined, shards: B[] = [];
    for (let i = 0; i < 60 * 3 && !shards.length; i++) {
      hold(g, b, 1100);
      g.update(DT); g.hull = g.shield = 100;
      shell ??= g.bullets.find((x) => x.split != null);
      shards = g.bullets.filter((x) => x.shard);
    }
    expect(shell).toBeTruthy();
    expect(shards.length).toBeGreaterThanOrEqual(8);
    // Splitter nach vorn gerichtet, in einem schmalen Kegel
    const a = shards.slice(0, 8).map((s) => Math.atan2(s.vy, s.vx)), mid = Math.atan2(shell!.vy, shell!.vx);
    for (const x of a) expect(Math.abs(Math.atan2(Math.sin(x - mid), Math.cos(x - mid)))).toBeLessThan(0.25);
    // zerlegt, bevor sie das Ziel erreicht
    const s0 = shards[0];
    expect(Math.hypot(s0.x - g.px, s0.y - g.py)).toBeGreaterThan(20);
  });

  it('Splitter treffen Jäger voll, Korvetten nur zu einem Drittel', () => {
    const hit = (ship: ShipId) => {
      const { g, b } = game(ship);
      for (const q of g.enemies) if (q.parent === b) q.cd = 1e9;
      // gemessen wird der Schaden, der beim eigenen Schiff ankommt (vor Schild und Hülle)
      let got = 0;
      const G = g as unknown as { damagePlayer(d: number, ...r: unknown[]): void };
      G.damagePlayer = (d: number) => { got += d; };
      g.bullets.push({ x: g.px, y: g.py - 2, vx: 0, vy: 60, dmg: 6, from: 'e', life: 1, color: '#fff', w: 1, pierce: 0, shard: true } as unknown as B);
      g.update(DT);
      return got;
    };
    const s = hit('mamba'), m = hit('dragon');
    expect(SHIPS.mamba.cls).toBe('S');
    expect(s).toBeGreaterThan(0);
    expect(m / s).toBeCloseTo(1 / 3, 2);
  });
});
