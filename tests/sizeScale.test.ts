import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, SHIPS, SHIP_IDS, X4_LENGTH, scaledLength, setSizeScale, sizeScale } from '../src/minigames/loadout';
import { ShooterGame } from '../src/minigames/shooter';

/** Länge im Bild: lange Schiffe mit eigenem Seitenverhältnis, sonst die Zeichengröße */
const len = (id: (typeof SHIP_IDS)[number]) => SHIPS[id].size;

describe('Größenverhältnis im Kampf', () => {
  afterAll(() => setSizeScale('bisher', false));

  it('Wie in X4: Längen im Verhältnis der Meterangaben, Mamba bleibt 38', () => {
    setSizeScale('bisher', false);
    const before = Object.fromEntries(SHIP_IDS.map((id) => [id, len(id)]));
    setSizeScale('x4', false);
    expect(sizeScale()).toBe('x4');
    // sichtbare Länge vorher (gemessen): Raptor 1 185, Cobra 80, Mamba 38
    const vis = (id: 'raptor' | 'cobra' | 'mamba', v: number) => (len(id) / before[id]) * v;
    expect(vis('mamba', 38)).toBeCloseTo(38, 0);
    expect(scaledLength(32, 'x4')).toBeCloseTo(38);
    expect(scaledLength(3191, 'x4')).toBeCloseTo(3789.3, 0);
    // Raptor zu Cobra wie in X4 (3 191 m zu 147,7 m)
    const k = vis('raptor', 1185) / vis('cobra', 80), x4 = X4_LENGTH.raptor / X4_LENGTH.cobra;
    expect(Math.abs(k / x4 - 1)).toBeLessThan(0.02);
    expect(len('raptor')).toBeGreaterThan(len('klapperschlange') * 3);
    // Türme und Abwurfpunkte wachsen mit
    expect(Math.max(...SHIPS.raptor.turrets.map(([, y]) => Math.abs(y)))).toBeGreaterThan(1000);
  });

  it('Gestaucht liegt zwischen bisher und X4; Bisher stellt die alten Werte wieder her', () => {
    setSizeScale('bisher', false);
    const old = len('raptor'), oldR = SHIPS.raptor.r, oldT = SHIPS.raptor.turrets[0];
    setSizeScale('gestaucht', false);
    const mid = len('raptor');
    setSizeScale('x4', false);
    expect(mid).toBeLessThan(len('raptor'));
    setSizeScale('bisher', false);
    expect(len('raptor')).toBe(old);
    expect(SHIPS.raptor.r).toBe(oldR);
    expect(SHIPS.raptor.turrets[0]).toEqual(oldT);
  });

  it('Kampfkarte deutlich größer; der Raptor im X4-Maßstab passt auf die Karte', () => {
    setSizeScale('x4', false);
    for (const ship of ['mamba', 'raptor'] as const) {
      const g = new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', mission: 'station', loadout: { ...DEFAULT_LOADOUT, ship } }, 'pirate');
      g.resize(390, 780);
      const G = g as unknown as { WW: number; WH: number };
      expect(G.WW).toBeGreaterThanOrEqual(6500);
      expect(G.WW).toBeGreaterThanOrEqual(SHIPS[ship].size * 2);
    }
  });

  it('Gegner in X4-Größe: Jäger wie die Mamba, Korvetten und Fregatten groß, der Xenon K ein XL-Schiff', () => {
    setSizeScale('x4', false);
    const mk = (side: 'pirate' | 'xenon' | 'khaak') => new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', mission: 'station', loadout: { ...DEFAULT_LOADOUT } }, side) as unknown as {
      makeEnemy(k: string, x: number, y: number): { r: number }; spawnBoss(mini?: boolean): void; enemies: { kind: string; r: number; ox?: number; parent?: unknown }[];
    };
    // sichtbare Größe = Trefferradius × Bildmaßstab (shipArt.ts)
    const p = mk('pirate'), x = mk('xenon');
    expect(p.makeEnemy('jaeger', 0, 0).r * 3.6).toBeCloseTo(38.2, 0);
    expect(p.makeEnemy('kanone', 0, 0).r * 3.4).toBeCloseTo(145, -1);
    expect(x.makeEnemy('m', 0, 0).r * 5).toBeCloseTo(37.6, 0);
    x.enemies.length = 0;
    x.spawnBoss();
    const boss = x.enemies.find((e) => e.kind === 'boss')!;
    expect(boss.r * 4.7 * 0.977).toBeCloseTo(1670 * 38 / 32, -1);
    // Türme sitzen auf den Sockeln des großen Bilds
    const tur = x.enemies.filter((e) => e.parent === boss);
    expect(Math.max(...tur.map((t) => Math.abs(t.ox!)))).toBeGreaterThan(400);
    setSizeScale('bisher', false);
    expect(mk('xenon').makeEnemy('m', 0, 0).r).toBe(14);
  });
});

describe('Neue Großschiffe: Xenon P, Piratenträger', () => {
  type T = { kind: string; x: number; y: number; r: number; ox?: number; parent?: unknown; weapon?: string; cd: number; ang: number; vx: number; vy: number; hp: number; max: number; salvo?: number; launchT?: number };
  type A = { enemies: T[]; bullets: { from: string }[]; px: number; py: number; wave: number; makeEnemy(k: string, x: number, y: number): T; spawnBoss(mini?: boolean): void };
  const mk = (side: 'pirate' | 'xenon', level = 1) => {
    const g = new ShooterGame({ level: level as 1, seed: 1, mutator: null, mode: 'normal', mission: 'station', loadout: { ...DEFAULT_LOADOUT } }, side);
    g.resize(390, 780);
    return { g, a: g as unknown as A };
  };

  it('Xenon P: Fregattengröße, zwei Repeater-Türme, die in Zweiersalven feuern', () => {
    setSizeScale('x4', false);
    const { g, a } = mk('xenon');
    a.enemies.length = 0; a.wave = 99;
    const p = a.makeEnemy('p', a.px, a.py - 300);
    a.enemies.push(p);
    for (let i = 0; i < 120; i++) { p.hp = p.max; g.update(1 / 60); }
    const tur = a.enemies.filter((e) => e.parent === p);
    expect(tur.length).toBe(2);
    expect(tur.every((t) => t.weapon === 'm')).toBe(true);
    expect(p.r * 4 * 0.988).toBeCloseTo(137.7 * 38 / 32, -1);
    // Salve: zwei Schüsse kurz hintereinander
    for (const t of tur) t.cd = 0;
    // Schüsse der Türme zählen (abgegebene, nicht nur noch fliegende)
    const shots: number[] = [];
    const ga = g as unknown as { enemyShot: (e: T, ...r: unknown[]) => void; time: number };
    const orig = ga.enemyShot.bind(g);
    let frame = 0;
    ga.enemyShot = (e: T, ...r: unknown[]) => { if (tur.includes(e)) shots.push(frame); orig(e, ...r); };
    for (frame = 0; frame < 40; frame++) { p.hp = p.max; g.update(1 / 60); }
    expect(shots.length).toBeGreaterThanOrEqual(2);
    // zwei Schüsse binnen weniger Bilder (Salve), nicht gleichzeitig
    expect(shots.some((f, i) => i > 0 && f - shots[i - 1] > 0 && f - shots[i - 1] <= 8)).toBe(true);
  });

  it('Piratenträger: Startbahn breit genug für Jäger, Flaktürme nach Stufe, startet Jäger', () => {
    setSizeScale('x4', false);
    const one = mk('pirate', 1).a, three = mk('pirate', 3).a;
    for (const a of [one, three]) { a.enemies.length = 0; a.spawnBoss(); }
    const flak = (a: A) => a.enemies.filter((e) => e.weapon === 'flak').length;
    expect(flak(one)).toBe(4);
    expect(flak(three)).toBe(6);
    const boss = one.enemies.find((e) => e.kind === 'boss')!;
    // Startbahn 95 von 1 254 Bildpunkten breit, Jäger (Kukri) 38 Punkte lang
    expect((95 / 1254) * boss.r * 4.7).toBeGreaterThan(38 * 2.5);
    const { g, a } = mk('pirate', 1);
    a.enemies.length = 0; a.wave = 99;
    a.spawnBoss();
    const b = a.enemies.find((e) => e.kind === 'boss')!;
    b.launchT = 0.05;
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    expect(a.enemies.some((e) => e.kind === 'jaeger')).toBe(true);
    setSizeScale('bisher', false);
  });
});

describe('Großkampfschiffe: ruhig, begrenzt, ohne Überlappen', () => {
  type T = { kind: string; x: number; y: number; r: number; ang: number; vx: number; vy: number; hp: number; max: number; parent?: unknown; cd: number };
  type A = { enemies: T[]; px: number; py: number; wave: number; reinforce: { t: number; kinds: string[]; from: number }[]; waveT: number; makeEnemy(k: string, x: number, y: number): T; spawnBoss(mini?: boolean): void };
  const mk = (level = 1, mission: 'station' | 'nest' = 'station') => {
    const g = new ShooterGame({ level: level as 1, seed: 2, mutator: null, mode: 'normal', mission, loadout: { ...DEFAULT_LOADOUT } }, 'xenon');
    g.resize(390, 780);
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    return { g, a: g as unknown as A };
  };

  it('Xenon K dreht sich nicht im Kreis: in Stellung hält er seinen Kurs, Drehung höchstens gut 4° je Sekunde', () => {
    setSizeScale('x4', false);
    const { g, a } = mk();
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    a.spawnBoss(true);
    const k = a.enemies.find((e) => e.kind === 'boss')!;
    k.x = a.px; k.y = a.py - 900;
    let turned = 0, last = k.ang, maxRate = 0;
    for (let i = 0; i < 60 * 30; i++) {
      for (const e of a.enemies) { e.hp = e.max; }
      g.update(1 / 60);
      let d = k.ang - last; d = Math.atan2(Math.sin(d), Math.cos(d));
      turned += Math.abs(d); maxRate = Math.max(maxRate, Math.abs(d) * 60); last = k.ang;
    }
    expect(maxRate).toBeLessThan(0.08);
    // in 30 s höchstens eine halbe Drehung (vorher drehte er sich mehrmals ganz herum)
    expect(turned).toBeLessThan(Math.PI);
    setSizeScale('bisher', false);
  });

  it('höchstens ein Xenon K zugleich (Stufe 4 und 5: zwei), weitere warten', () => {
    setSizeScale('x4', false);
    for (const [level, max] of [[1, 1], [4, 2]] as const) {
      const { g, a } = mk(level);
      a.enemies.length = 0; a.wave = 99;
      a.reinforce.length = 0;
      for (let b = 0; b < 5; b++) a.reinforce.push({ t: 0, kinds: ['boss'], from: b });
      let most = 0;
      for (let i = 0; i < 60 * 20; i++) {
        for (const e of a.enemies) e.hp = e.max;
        g.update(1 / 60);
        most = Math.max(most, a.enemies.filter((e) => e.kind === 'boss').length);
      }
      expect(most).toBe(max);
      expect(a.reinforce.filter((r) => r.kinds[0] === 'boss').length).toBe(5 - max);
    }
    setSizeScale('bisher', false);
  });

  it('Gegner, die übereinander auftauchen, schieben sich auseinander', () => {
    setSizeScale('x4', false);
    const { g, a } = mk();
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    a.spawnBoss(true);
    const k = a.enemies.find((e) => e.kind === 'boss')!;
    k.x = a.px + 1500; k.y = a.py - 1500;
    const small = ['kanone', 'p', 'm'].map((kind) => { const e = a.makeEnemy(kind === 'kanone' ? 'xs' : kind, k.x + 5, k.y + 5); a.enemies.push(e); return e; });
    for (let i = 0; i < 60 * 4; i++) { for (const e of a.enemies) e.hp = e.max; g.update(1 / 60); }
    for (const e of small.filter((q) => q.kind !== 'm')) expect(Math.hypot(e.x - k.x, e.y - k.y)).toBeGreaterThan(k.r * 1.5);
    setSizeScale('bisher', false);
  });

  it('Xenon K feuert: L-Türme reichen mindestens eine Schiffslänge, gemessen bis zur gegnerischen Hülle', () => {
    setSizeScale('x4', false);
    const { g, a } = mk(1);
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    a.spawnBoss(true);
    const k = a.enemies.find((e) => e.kind === 'boss')!;
    const len = k.r * 4.6;
    // in Stellung, dein Schiff gut eine halbe Schiffslänge entfernt
    k.x = a.px; k.y = a.py - len * 0.7; k.vx = k.vy = 0;
    const tur = a.enemies.filter((e) => e.parent === k);
    const ga = g as unknown as { enemyShot: (e: T, ...r: unknown[]) => void; turretRange(e: T): number };
    expect(Math.min(...tur.filter((t) => (t as unknown as { weapon: string }).weapon === 'plasma').map((t) => ga.turretRange(t)))).toBeGreaterThanOrEqual(len);
    const orig = ga.enemyShot.bind(g);
    const shooters = new Set<T>();
    ga.enemyShot = (e: T, ...r: unknown[]) => { if (tur.includes(e)) shooters.add(e); orig(e, ...r); };
    for (let i = 0; i < 60 * 8; i++) { for (const e of a.enemies) e.hp = e.max; g.update(1 / 60); }
    // alle L-Türme kommen zum Schuss (M-Türme nur, wenn das Ziel ihnen nah genug ist)
    const L = tur.filter((t) => (t as unknown as { weapon: string }).weapon === 'plasma');
    expect(L.length).toBeGreaterThan(0);
    expect(L.every((t) => shooters.has(t))).toBe(true);
    setSizeScale('bisher', false);
  });
});

