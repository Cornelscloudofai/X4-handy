// Neue Fraktion (Arbeitsname Hegemonie), Testgegner: Zerstörer mit zehn Zwillingsgeschützen (Splittergranate)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { LG_GAP } from '../src/minigames/shooter';
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
  it('erscheint mit dem Test-Schalter: etwa 950 m lang, zehn Zwillingsgeschütze (dazu drei XL-Türme) auf dem Rumpf, Rumpf geschützt', () => {
    const { b, g } = game();
    expect(b).toBeTruthy();
    const tur = g.enemies.filter((e) => e.parent === b && e.weapon === 'splitter');
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

describe('XL-Drillingsturm', () => {
  type X = E & { aimA?: number; xlCharge?: number; xlFired?: number; xlLock?: number; xlT?: number };
  const xl = (g: G, b: E) => g.enemies.filter((e) => e.parent === b && e.weapon === 'xl') as X[];
  it('drei Drillingstürme auf den XL-Sockeln, ein Viertel größer als ihr Sockel', () => {
    const { g, b } = game();
    const t = xl(g, b);
    expect(t.length).toBe(3);
    const ring = (196 / 1976) * b.r * 4.7 * (1976 / 1983);
    for (const q of t) { expect((2 * q.r) / ring).toBeGreaterThan(1.1); expect((2 * q.r) / ring).toBeLessThan(1.4); }
  });
  it('schießt nicht auf Jäger (S)', () => {
    const { g, b } = game('mamba');
    for (const q of g.enemies) if (q.parent === b && q.weapon === 'splitter') q.cd = 1e9;
    for (const q of xl(g, b)) q.xlCharge = 1;
    let shots = 0;
    for (let i = 0; i < 60 * 8; i++) { hold(g, b, 900); g.update(DT); g.hull = g.shield = 100; shots += g.bullets.filter((x) => (x as unknown as { xl?: boolean }).xl).length; }
    expect(shots).toBe(0);
  });
  it('gegen ein L-Schiff: ausrichten mit Ziellinie (1 s), dann Rohr 1 – 2 – 3 im Abstand 0,4 s, danach lange Ladepause', () => {
    const { g, b } = game('klapperschlange');
    (b as unknown as { hold: boolean }).hold = true;
    for (const q of g.enemies) if (q.parent === b && q.weapon === 'splitter') q.cd = 1e9;
    const ts = xl(g, b), t = ts[0];
    for (const q of ts) if (q !== t) q.xlCharge = -1e9;
    t.xlCharge = 1;
    let lockAt = -1;
    const shots: number[] = [];
    const seen = new Set<unknown>();
    for (let i = 0; i < 60 * 20; i++) {
      hold(g, b, 900);
      g.update(DT); g.hull = g.shield = 100;
      if (t.xlLock != null && lockAt < 0) lockAt = i * DT;
      for (const x of g.bullets) if ((x as unknown as { xl?: boolean }).xl && !seen.has(x)) { seen.add(x); shots.push(i * DT); }
      if (shots.length >= 3 && i * DT > shots[2] + 3) break;
    }
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(shots.length).toBe(3);
    expect(shots[0] - lockAt).toBeCloseTo(1, 1);
    expect(shots[1] - shots[0]).toBeCloseTo(0.4, 1);
    expect(shots[2] - shots[1]).toBeCloseTo(0.4, 1);
    // danach lädt der Turm wieder (von vorn)
    expect(t.xlCharge!).toBeLessThan(0.5);
  });
});


describe('L-Zwillingskanone', () => {
  const lg = (g: G, b: E) => g.enemies.filter((e) => e.parent === b && e.weapon === 'lgun');
  const quiet = (g: G, b: E, keep?: E) => { for (const q of g.enemies) if (q.parent === b && q !== keep) { q.cd = 1e9; (q as unknown as { xlCharge: number }).xlCharge = -1e9; } };
  it('sechs Kanonen auf den L-Sockeln, ein Viertel größer als ihr Sockel', () => {
    const { g, b } = game();
    const t = lg(g, b);
    expect(t.length).toBe(6);
    const ring = (70 / 1976) * b.r * 4.7 * (1976 / 1983);
    for (const q of t) { expect((2 * q.r) / ring).toBeGreaterThan(1.15); expect((2 * q.r) / ring).toBeLessThan(1.35); }
  });
  it('Zielvorrang: Klasse M vor L vor Jägern; auf Jäger nur ohne anderes Ziel', () => {
    const { g, b } = game('mamba');
    const t = lg(g, b)[0];
    const G = g as unknown as { lgTarget(e: E, r: number): { cls: string; foe?: E } | null; hegTargets(e: E, r: number): { cls: string }[] };
    hold(g, b, 700);
    // allein mit einem Jäger: der wird beschossen
    expect(G.lgTarget(t, 5000)?.cls).toBe('S');
    // Frachter/Station (L) geht vor
    const list = (cls: string[]) => { G.hegTargets = () => cls.map((c, i) => ({ x: 0, y: 0, vx: 0, vy: 0, r: 5, cls: c, d: 100 - i * 10 })); return G.lgTarget(t, 5000)?.cls; };
    expect(list(['S', 'L'])).toBe('L');
    expect(list(['L', 'S', 'M'])).toBe('M');
    expect(list(['XL', 'S'])).toBe('XL');
  });
  it('gegen ein M-Schiff: abwechselnd links und rechts im festen Takt, ohne Salvenpause, aus den Mündungen', () => {
    const { g, b } = game('dragon');
    (b as unknown as { hold: boolean }).hold = true;
    const t = lg(g, b)[0] as E & { aimA?: number };
    quiet(g, b, t);
    // lange ohne Schuss (Wartezeit aufgelaufen): der Takt beginnt trotzdem sauber neu
    t.cd = -5;
    const shots: { t: number; lat: number }[] = [];
    const seen = new Set<unknown>();
    for (let i = 0; i < 60 * 12; i++) {
      hold(g, b, 700);
      g.update(DT); g.hull = g.shield = 100;
      for (const x of g.bullets) if ((x as unknown as { ap?: boolean }).ap && !seen.has(x)) {
        seen.add(x);
        // seitlicher Versatz zur Rohrrichtung: links negativ, rechts positiv
        const a = t.aimA!, dx = x.x - t.x, dy = x.y - t.y;
        shots.push({ t: i * DT, lat: -Math.sin(a) * dx + Math.cos(a) * dy });
      }
    }
    expect(shots.length).toBeGreaterThanOrEqual(6);
    const gaps = shots.slice(1).map((s, i) => s.t - shots[i].t);
    for (const x of gaps.slice(2)) expect(x).toBeCloseTo(LG_GAP, 1);
    // Rohre wechseln sich ab
    for (let i = 1; i < shots.length; i++) expect(Math.sign(shots[i].lat)).toBe(-Math.sign(shots[i - 1].lat));
    // aus der Mündung: weit vor dem Drehpunkt
    expect(shots.every((s) => Math.abs(s.lat) > t.r * 0.05)).toBe(true);
  });
});

describe('Splittergranate: Annäherungszünder', () => {
  const burstGap = (dist: number, vx = 0) => {
    const { g, b } = game('mamba');
    for (const q of g.enemies) if (q.parent === b) { q.cd = 1e9; (q as unknown as { xlCharge: number }).xlCharge = -1e9; }
    const t = g.enemies.find((e) => e.parent === b && e.weapon === 'splitter')!;
    t.cd = 0;
    let gap = -1;
    const G = g as unknown as { splitShell(b: B): void; gapOr(x: number, y: number, r: number): number; ship: { r: number } };
    const orig = G.splitShell.bind(g);
    G.splitShell = (s: B) => { if (gap < 0) gap = G.gapOr(s.x, s.y, G.ship.r); orig(s); };
    for (let i = 0; i < 60 * 4 && gap < 0; i++) { hold(g, b, dist); g.pvx = vx; g.update(DT); g.hull = g.shield = 100; }
    return gap;
  };
  it('zerlegt sich kurz vor der Hülle – unabhängig von der Entfernung beim Abschuss', () => {
    for (const d of [800, 1000, 1200]) {
      const gap = burstGap(d);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(80);
    }
  });
});

describe('Fraktionen gegeneinander (Test)', () => {
  it('ohne Schalter treffen Hegemonie-Geschosse keine anderen Gegner', () => {
    const { g, b } = game();
    const other = { ...b, model: undefined, parent: undefined, kind: 'm', x: b.x + 3000, y: b.y, r: 20, hp: 50, max: 50, sh: 0 } as unknown as E;
    g.enemies.push(other);
    g.bullets.push({ x: other.x - 30, y: other.y, vx: 900, vy: 0, dmg: 10, from: 'e', life: 1, color: '#fff', w: 1, pierce: 0, fac: 'heg' } as unknown as B);
    g.update(DT);
    expect(other.hp).toBe(50);
  });
  it('mit Schalter: Hegemonie-Geschosse treffen andere Gegner, deren Geschosse die Türme der Hegemonie', () => {
    store.set('x4-sektorbau-fraktionen-feinde', '1');
    const { g, b } = game();
    for (const q of g.enemies) if (q.parent === b) { q.cd = 1e9; (q as unknown as { xlCharge: number }).xlCharge = -1e9; }
    const other = { ...b, model: undefined, parent: undefined, kind: 'm', x: b.x + 3000, y: b.y, r: 20, hp: 50, max: 50, sh: 0, shMax: 0, vx: 0, vy: 0 } as unknown as E;
    g.enemies.push(other);
    g.bullets.push({ x: other.x - 30, y: other.y, vx: 900, vy: 0, dmg: 10, from: 'e', life: 1, color: '#fff', w: 1, pierce: 0, fac: 'heg' } as unknown as B);
    g.update(DT);
    expect(other.hp).toBeLessThan(50);
    const t = g.enemies.find((e) => e.parent === b && e.weapon === 'lgun')!;
    const hp0 = t.hp + t.sh;
    g.bullets.push({ x: t.x - 30, y: t.y, vx: 900, vy: 0, dmg: 10, from: 'e', life: 1, color: '#fff', w: 1, pierce: 0 } as unknown as B);
    g.update(DT);
    expect(t.hp + t.sh).toBeLessThan(hp0);
  });
  it('mit Schalter: Hegemonie-Türme nehmen andere Gegner ins Ziel', () => {
    store.set('x4-sektorbau-fraktionen-feinde', '1');
    const { g, b } = game('dragon');
    const t = g.enemies.find((e) => e.parent === b && e.weapon === 'lgun')!;
    g.px = b.x + 20000; g.py = b.y;
    const other = { ...b, model: undefined, parent: undefined, kind: 'm', x: t.x + 400, y: t.y, r: 20, hp: 50, max: 50, sh: 0, shMax: 0, vx: 0, vy: 0 } as unknown as E;
    g.enemies.push(other);
    g.update(DT);
    const G = g as unknown as { lgTarget(e: E, r: number): { foe?: E } | null };
    expect(G.lgTarget(t, 5000)?.foe).toBe(other);
  });
});
