// Prüft die zuletzt zugesagten Kampf-Änderungen direkt im Spiel (X4-Maßstab), so wie der Spieler sie sieht
import { afterAll, describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, RANGE_X, SHIPS, setSizeScale, type Loadout } from '../src/minigames/loadout';
import type { Mission } from '../src/minigames/missions';

const DT = 1 / 60;
type E = { kind: string; x: number; y: number; r: number; hp: number; max: number; weapon?: string; parent?: unknown; mini?: boolean; carrier?: boolean; cd: number };
type A = {
  enemies: E[]; px: number; py: number; wave: number; rails: { heavy?: boolean; max?: number; color: string }[];
  reinforce: { t: number; kinds: string[]; from: number; carrier?: boolean }[]; maxBigs: number;
  spawnBoss(mini?: boolean, from?: number, carrier?: boolean): void; spawnWave(): void; enemyShot: (e: E, a: number, v: number, dmg: number, ...r: unknown[]) => void;
  wpn: { range: number }; pTur: { w?: { range: number; rail: boolean }; L?: boolean }[];
};
const mk = (side: 'pirate' | 'xenon' | 'khaak', level: number, mission: Mission = 'station', lo: Partial<Loadout> = {}) => {
  const g = new ShooterGame({ level: level as 1, seed: 3, mutator: null, mode: 'normal', mission, loadout: { ...DEFAULT_LOADOUT, ...lo } }, side);
  g.resize(390, 780);
  for (let i = 0; i < 60; i++) g.update(DT);
  return { g, a: g as unknown as A };
};

describe('Zusagen im Spiel nachgeprüft', () => {
  setSizeScale('x4', false);
  afterAll(() => setSizeScale('bisher', false));

  it('Xenon K (auch als Großziel, z. B. im Nest): Stufe 1 4 L + 4 M, Stufe 2 6 + 7, ab Stufe 3 alle 8 + 14', () => {
    for (const [level, L, M] of [[1, 4, 4], [2, 6, 7], [3, 8, 14], [4, 8, 14], [5, 8, 14]] as const) for (const mini of [false, true]) {
      const { a } = mk('xenon', level, 'nest');
      a.enemies.length = 0;
      a.spawnBoss(mini);
      const k = a.enemies.find((e) => e.kind === 'boss')!;
      const tur = a.enemies.filter((e) => e.parent === k);
      expect([tur.filter((t) => t.weapon === 'plasma').length, tur.filter((t) => t.weapon === 'm').length], `Stufe ${level}${mini ? ' Großziel' : ''}`).toEqual([L, M]);
    }
  });

  it('Großkampfschiffe zugleich: Stufe 1–3 eines, Stufe 4 und 5 zwei', () => {
    for (const [level, n] of [[1, 1], [3, 1], [4, 2], [5, 2]] as const) expect(mk('xenon', level, 'nest').a.maxBigs).toBe(n);
  });

  it('Raptor: L-Bosonenlanze orange, dick und 1,8 s Nachglühen; M-Lanze kurz und blaulila', () => {
    const groups = SHIPS.raptor.groups!.map((gr) => (gr.kind === 'L' ? 'boson' : 'boson'));
    const { g, a } = mk('xenon', 1, 'station', { ship: 'raptor', groups });
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    // zähes Ziel in Reichweite vor dem Bug
    a.spawnBoss(true);
    const k = a.enemies.find((e) => e.kind === 'boss')!;
    k.x = a.px; k.y = a.py - 1500;
    let heavy: A['rails'][number] | undefined, light: A['rails'][number] | undefined;
    for (let i = 0; i < 60 * 20 && !(heavy && light); i++) {
      for (const e of a.enemies) e.hp = e.max;
      g.update(DT);
      heavy ??= a.rails.find((r) => r.heavy);
      light ??= a.rails.find((r) => !r.heavy && r.color !== '#b45cff');
    }
    expect(heavy, 'L-Lanze feuert schwer').toBeDefined();
    expect(heavy!.max).toBeCloseTo(1.8);
    expect(heavy!.color).toBe('#ff8a2a');
    expect(light, 'M-Lanze feuert').toBeDefined();
    expect(light!.max).toBeLessThan(0.3);
    expect(light!.color).not.toBe(heavy!.color);
  });

  it('Reichweiten verdoppelt: Pulslaser der Mamba 832, Träger-Türme doppelt', () => {
    expect(RANGE_X).toBe(2);
    expect(mk('pirate', 1, 'station', { ship: 'mamba', weapon: 'puls' }).a.wpn.range).toBeCloseTo(416 * 2, -1);
  });

  it('Plasma des K: ab Stufe 3 90 Schaden je Kugel (zwei Treffer zerstören eine Mamba)', () => {
    const { g, a } = mk('xenon', 3, 'nest');
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    a.spawnBoss(true);
    const k = a.enemies.find((e) => e.kind === 'boss')!;
    k.x = a.px; k.y = a.py - 1200;
    const dmg: number[] = [];
    const ga = g as unknown as { enemyShot: A['enemyShot']; enemyDmg: number };
    const orig = ga.enemyShot.bind(g);
    ga.enemyShot = (e, ang, v, d, ...r) => { if (e.weapon === 'plasma') dmg.push(d * ga.enemyDmg); orig(e, ang, v, d, ...r); };
    for (let i = 0; i < 60 * 8 && !dmg.length; i++) { for (const e of a.enemies) e.hp = e.max; g.update(DT); }
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg[0]).toBeCloseTo(90);
  });

  it('Piratenträger kommt in Einsätzen als Großziel (Stufe 3: etwa jedes zweite Mal)', () => {
    let carriers = 0, bigs = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = new ShooterGame({ level: 3, seed, mutator: null, mode: 'normal', mission: 'station', loadout: { ...DEFAULT_LOADOUT } }, 'pirate');
      g.resize(390, 780);
      const a = g as unknown as A;
      for (let i = 0; i < 60 * 3; i++) g.update(DT);
      for (let w = 0; w < 3; w++) { for (const r of a.reinforce) if (r.kinds[0] === 'boss') { bigs++; if (r.carrier) carriers++; } a.reinforce.length = 0; a.spawnWave(); }
    }
    expect(bigs).toBeGreaterThan(0);
    expect(carriers).toBeGreaterThan(0);
  });

  it('Abschuss großer Schiffe: Explosionsfolge über den Rumpf, Feuerbälle in Schiffsgröße, dann Schlussexplosion', () => {
    const { g, a } = mk('xenon', 3, 'station');
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    a.spawnBoss(true);
    const k = a.enemies.find((e) => e.kind === 'boss')!;
    k.x = a.px; k.y = a.py - 1500;
    const G = g as unknown as { killEnemy(e: E, by: boolean): void; dying: { t: number; max: number; vis: number }[]; fx: { list: { kind: string; size: number }[] }; visualR(e: E): number };
    const vis = G.visualR(k);
    // (ohne geladenes Bild, wie hier im Test, mit Ersatzmaßstab)
    expect(vis).toBeGreaterThan(500);
    G.killEnemy(k, true);
    expect(G.dying.length).toBe(1);
    const max = G.dying[0].max;
    expect(max).toBeGreaterThan(2.5);
    let biggestFire = 0, booms = 0;
    for (let t = 0; t < max + 0.2; t += DT) {
      const n = G.fx.list.filter((p) => p.kind === 'fire').length;
      g.update(DT);
      booms += Math.max(0, G.fx.list.filter((p) => p.kind === 'fire').length - n);
      for (const p of G.fx.list) if (p.kind === 'fire') biggestFire = Math.max(biggestFire, p.size);
    }
    expect(G.dying.length, 'Folge ist durch').toBe(0);
    // viele Explosionen während des Zerbrechens, der Schlussfeuerball etwa so groß wie das Schiff
    expect(booms).toBeGreaterThan(20);
    expect(biggestFire).toBeGreaterThan(vis);
    // kleine Jäger: sofortige Explosion mit Feuerball in ihrer Größe, keine Folge
    const n = (g as unknown as { makeEnemy(k: string, x: number, y: number): E }).makeEnemy('n', a.px, a.py - 300);
    a.enemies.push(n);
    G.killEnemy(n, true);
    expect(G.dying.length).toBe(0);
  });

  it('L-Lanze erlischt sanft: Glut wird stetig schwächer und ist am Ende (fast) unsichtbar', () => {
    // Hüllkurve wie in drawShots: env = k^1.6
    const env = (k: number) => Math.pow(k, 1.6);
    expect(env(0.05)).toBeLessThan(0.01);
    for (let k = 0.05; k < 1; k += 0.05) expect(env(k + 0.05)).toBeGreaterThan(env(k));
  });

  it('Verbesserungskarten passen zum Schiff: keine Raketenkarten ohne Werfer, keine Bordwaffenkarten ohne Bordwaffen', () => {
    const offered = (lo: Partial<Loadout>) => {
      const { a } = mk('pirate', 1, 'station', lo);
      const g = a as unknown as { offerCards(): void; choosing: { id: string }[] | null; cards: Record<string, number> };
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) { g.offerCards(); for (const c of g.choosing ?? []) seen.add(c.id); }
      g.choosing = null;
      return seen;
    };
    // Jaguar: Puls, keine Werfer, keine Türme, keine Begleiter
    const jag = offered({ ship: 'jaguar', weapon: 'puls', wing: {} });
    for (const id of ['missiles', 'mreload', 'mdmg', 'tdmg', 'trate', 'wdmg', 'whull', 'hangar', 'focus', 'chain', 'overload']) expect(jag.has(id), id).toBe(false);
    for (const id of ['spread', 'pierce', 'splash', 'heavy']) expect(jag.has(id), id).toBe(true);
    // Strahler: Strahlkarten, kein Streuschuss; Lanze: Überladung
    const beam = offered({ ship: 'mamba', weapon: 'strahl', wing: {} });
    expect(beam.has('focus') && beam.has('chain') && beam.has('pierce') && beam.has('missiles')).toBe(true);
    expect(beam.has('spread') || beam.has('splash') || beam.has('overload')).toBe(false);
    const lance = offered({ ship: 'mamba', weapon: 'boson', wing: {} });
    expect(lance.has('overload') && lance.has('pierce')).toBe(true);
    expect(lance.has('spread')).toBe(false);
    // Raptor: keine Bordwaffen, aber Türme und Staffel im Hangar
    const rap = offered({ ship: 'raptor', wing: { mamba: 4 } });
    for (const id of ['spread', 'pierce', 'rapid', 'focus', 'overload', 'missiles']) expect(rap.has(id), id).toBe(false);
    for (const id of ['tdmg', 'tturn', 'wdmg', 'whull', 'hangar']) expect(rap.has(id), id).toBe(true);
  });

  it('Durchschlag gilt auch für Strahl und Bosonenlanze', () => {
    for (const weapon of ['strahl', 'boson'] as const) {
      const { g, a } = mk('xenon', 1, 'station', { ship: 'mamba', weapon, wing: {} });
      const G = g as unknown as { cards: Record<string, number>; aimA: number; fireId: number | null; makeEnemy(k: string, x: number, y: number): E };
      a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
      G.aimA = -Math.PI / 2;
      const e1 = G.makeEnemy('m', a.px, a.py - 140), e2 = G.makeEnemy('m', a.px, a.py - 230);
      for (const e of [e1, e2]) { e.hp = e.max = 1e6; (e as unknown as { sh: number; shMax: number }).sh = 0; (e as unknown as { shMax: number }).shMax = 0; (e as unknown as { vx: number; vy: number }).vx = 0; e.cd = 1e9; }
      a.enemies.push(e1, e2);
      const fire = (n: number) => { for (let i = 0; i < n; i++) { G.fireId = 1; G.aimA = -Math.PI / 2; for (const e of [e1, e2]) { e.x = a.px; } e1.y = a.py - 140; e2.y = a.py - 230; g.update(DT); } };
      // Schaden am hinteren Ziel ohne und mit Durchschlag (ein Rohr kann knapp vorbei ein wenig treffen)
      fire(90);
      const without = e2.max - e2.hp, front = e1.max - e1.hp;
      G.cards.pierce = 1;
      e1.hp = e1.max; e2.hp = e2.max;
      fire(90);
      const withP = e2.max - e2.hp, front2 = e1.max - e1.hp;
      expect(front).toBeGreaterThan(0);
      // das hintere Ziel bekommt jetzt einen guten Teil dessen ab, was das vordere trifft (Strahl 60 %, Lanze 70 %)
      expect(withP, `${weapon}: Durchschlag trifft das hintere Ziel (${without.toFixed(1)} → ${withP.toFixed(1)}, vorn ${front2.toFixed(1)})`).toBeGreaterThan(Math.max(without * 1.8, front2 * 0.4));
    }
  });

  it('Werkstatt-Mods wirken nur auf ihrem Schiff (Turm-Mods auf der Cobra)', async () => {
    const { resetMods, earnParts, craft } = await import('../src/minigames/mods');
    resetMods();
    earnParts(100);
    craft('cobra', 'turmladung', 3, 0);
    const { modStats } = await import('../src/minigames/mods');
    expect(modStats('cobra').tdmg).toBeGreaterThan(0.4);
    expect(modStats('mamba').tdmg).toBeUndefined();
    resetMods();
  });
});

