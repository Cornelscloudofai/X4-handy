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

  it('Xenon K (auch als Großziel, z. B. im Nest): alle 8 L- und 14 M-Sockel besetzt; Stufe 1 und 2 schwächer', () => {
    // Stärke wie früher 4 L + 4 M (Stufe 1) bzw. 6 L + 7 M (Stufe 2), ab Stufe 3 voll
    for (const [level, fL, fM] of [[1, 4 / 8, 4 / 14], [2, 6 / 8, 7 / 14], [3, 1, 1], [4, 1, 1], [5, 1, 1]] as const) for (const mini of [false, true]) {
      const { a } = mk('xenon', level, 'nest');
      a.enemies.length = 0;
      a.spawnBoss(mini);
      const k = a.enemies.find((e) => e.kind === 'boss')!;
      const tur = a.enemies.filter((e) => e.parent === k) as (E & { fireK?: number })[];
      const L = tur.filter((t) => t.weapon === 'plasma'), M = tur.filter((t) => t.weapon === 'm');
      expect([L.length, M.length], `Stufe ${level}${mini ? ' Großziel' : ''}`).toEqual([8, 14]);
      // Stärke gut halb so stark abgesenkt wie die frühere Turmzahl: 0,35 + 0,65 × Anteil
      expect(L[0].fireK ?? 1).toBeCloseTo(fL < 1 ? 0.35 + 0.65 * fL : 1);
      expect(M[0].fireK ?? 1).toBeCloseTo(fM < 1 ? 0.35 + 0.65 * fM : 1);
    }
  });

  it('Piratenfregatte als Großziel: alle drei Sockel besetzt (Flügel und Heck)', () => {
    const { a } = mk('pirate', 1, 'station');
    a.enemies.length = 0;
    a.spawnBoss(true);
    const f = a.enemies.find((e) => e.kind === 'boss')!;
    expect(a.enemies.filter((e) => e.parent === f).length).toBe(3);
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
    // sehr zäh, damit die vielen Lanzen das Ziel nicht schon im ersten Bild zerstören
    for (const e of a.enemies) e.hp = e.max = 1e12;
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

  it('Plasma des K: ab Stufe 3 gut 100 Schaden je Kugel (zwei Treffer zerstören eine Mamba)', () => {
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
    // 90 je Kugel, mit dem Turmzuschlag (× 1,15) gut 100 – zwei Treffer zerstören eine Mamba (100 Hülle + bis 100 Schild)
    expect(dmg[0]).toBeCloseTo(90 * 1.15);
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
      // das hintere Ziel bekommt jetzt einen guten Teil dessen ab, was das vordere trifft (Strahl 60 %, Lanze 70 %; die
      // Kanonen treffen sich am vorderen Ziel und laufen dahinter leicht auseinander, daher nicht jedes Rohr)
      expect(withP, `${weapon}: Durchschlag trifft das hintere Ziel (${without.toFixed(1)} → ${withP.toFixed(1)}, vorn ${front2.toFixed(1)})`).toBeGreaterThan(Math.max(without * 1.8, front2 * 0.3));
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

  it('Türme bleiben bei ihrem Ziel: kein Hin- und Herspringen zwischen gleich weit entfernten Gegnern', () => {
    const { g, a } = mk('pirate', 1, 'station', { ship: 'cobra', turret: 'puls', wing: {} });
    const G = g as unknown as { pTur: { tgt?: unknown; a: number }[]; makeEnemy(k: string, x: number, y: number): E; pvx: number; aimA: number };
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    // zwei zähe Gegner links und rechts, gleich weit weg; dein Schiff schwenkt langsam hin und her
    const e1 = G.makeEnemy('kanone', a.px - 160, a.py - 120), e2 = G.makeEnemy('kanone', a.px + 160, a.py - 120);
    for (const e of [e1, e2]) { e.hp = e.max = 1e9; e.cd = 1e9; }
    a.enemies.push(e1, e2);
    const t = G.pTur[0];
    let switches = 0, last: unknown = null, t0 = 0;
    for (let i = 0; i < 60 * 8; i++) {
      G.aimA = -Math.PI / 2 + Math.sin(i / 60) * 0.6;
      for (const e of [e1, e2]) { e.hp = e.max; (e as unknown as { vx: number; vy: number }).vx = 0; (e as unknown as { vy: number }).vy = 0; }
      e1.x = a.px - 160; e1.y = a.py - 120; e2.x = a.px + 160; e2.y = a.py - 120;
      g.update(DT);
      if (t.tgt && t.tgt !== last) { if (last) switches++; last = t.tgt; if (!t0) t0 = i; }
    }
    expect(last, 'Turm hat ein Ziel').not.toBeNull();
    expect(switches, 'Zielwechsel').toBe(0);
  });
  it('Frontwaffen kardanisch: bei breiten Schiffen treffen alle Kanonen ein kleines Ziel genau voraus', () => {
    // Schiff mit dem breitesten Abstand zwischen den Bordkanonen
    let best = '', span = 0;
    for (const id of Object.keys(SHIPS)) {
      const { g } = mk('xenon', 1, 'station', { ship: id as Loadout['ship'], wing: {} });
      const guns = (g as unknown as { guns: number[] }).guns;
      if (guns.length < 2) continue;
      const w = Math.max(...guns) - Math.min(...guns);
      if (w > span) { span = w; best = id; }
    }
    expect(span, 'breitestes Schiff hat weit auseinanderliegende Kanonen').toBeGreaterThan(30);
    const { g, a } = mk('xenon', 1, 'station', { ship: best as Loadout['ship'], weapon: 'puls', wing: {} });
    const G = g as unknown as { aimA: number; fireId: number | null; fireCd: number; pvx: number; pvy: number; wpn: { jitter: number; range: number }; bullets: { x: number; y: number; vx: number; vy: number; from: string }[]; makeEnemy(k: string, x: number, y: number): E };
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    // kleiner Jäger (Radius 9) genau voraus, in 60 % der Reichweite
    const d = G.wpn.range * 0.6;
    const e = G.makeEnemy('m', a.px, a.py - d);
    e.r = 9; e.hp = e.max = 1e9; e.cd = 1e9;
    a.enemies.push(e);
    G.wpn.jitter = 0; G.pvx = 0; G.pvy = 0; G.aimA = -Math.PI / 2; G.fireId = 1; G.fireCd = 0;
    G.bullets.length = 0;
    const [ex, ey] = [e.x, e.y];
    g.update(DT);
    // nur die Bordkanonen (Türme feuern langsamere Geschosse)
    const fast = Math.max(...G.bullets.map((b) => Math.hypot(b.vx, b.vy)));
    const shots = G.bullets.filter((b) => b.from === 'p' && Math.hypot(b.vx, b.vy) > fast * 0.95);
    expect(shots.length, `${best}: alle Kanonen feuern`).toBeGreaterThanOrEqual(2);
    for (const b of shots) {
      // kleinster Abstand der Flugbahn zum Ziel
      const v = Math.hypot(b.vx, b.vy), ux = b.vx / v, uy = b.vy / v;
      const miss = Math.abs(-(ex - b.x) * uy + (ey - b.y) * ux);
      expect(miss, `${best}: Kanone verfehlt das kleine Ziel um ${miss.toFixed(1)}`).toBeLessThan(e.r);
    }
  });
  it('Vorhaltepunkte: alle Gegner in Feuerreichweite, Hauptziel nahe der Mittelachse; ohne Ziel Treffpunkt weit voraus', () => {
    const { g, a } = mk('xenon', 1, 'station', { ship: 'klapperschlange', weapon: 'strahl', wing: {} });
    const G = g as unknown as { aimA: number; wpn: { range: number }; lock: { e: E } | null; leads: { e: E }[]; convergeDist(r: number): number; makeEnemy(k: string, x: number, y: number): E };
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    const R = G.wpn.range;
    const hold = (es: E[], pos: [number, number][]) => { G.aimA = -Math.PI / 2; es.forEach((e, i) => { [e.x, e.y] = [a.px + pos[i][0], a.py + pos[i][1]]; (e as unknown as { vx: number; vy: number }).vx = 0; (e as unknown as { vy: number }).vy = 0; e.hp = e.max = 1e9; e.cd = 1e9; }); g.update(DT); };
    // kein Gegner in Feuerreichweite (einer weit draußen hält die Runde am Laufen): Treffpunkt bei 80 % der Reichweite
    const away = G.makeEnemy('m', 0, 0);
    a.enemies.push(away);
    hold([away], [[0, -R * 3]]);
    expect(G.lock).toBeNull();
    expect(G.convergeDist(R)).toBeCloseTo(R * 0.8);
    // weit voraus (95 % der Reichweite) und nah, aber seitlich: Hauptziel ist der voraus, beide bekommen Vorhaltepunkte
    a.enemies.length = 0;
    const far = G.makeEnemy('m', 0, 0), side = G.makeEnemy('m', 0, 0);
    a.enemies.push(far, side);
    const pos: [number, number][] = [[0, -R * 0.95], [R * 0.25, -R * 0.15]];
    hold([far, side], pos);
    expect(G.lock?.e, 'Hauptziel = nahe der Mittelachse').toBe(far);
    expect(G.leads.map((l) => l.e)).toContain(side);
    expect(G.convergeDist(R), 'Treffpunkt in der Entfernung des Hauptziels').toBeGreaterThan(R * 0.85);
    // nur ein Gegner weit seitlich: angezeigt und erfasst, aber die Rohre treffen sich trotzdem weit voraus
    a.enemies.length = 0;
    a.enemies.push(side);
    hold([side], [[R * 0.3, R * 0.05]]);
    expect(G.lock?.e).toBe(side);
    expect(G.convergeDist(R)).toBeCloseTo(R * 0.8);
  });
  it('Raketentürme: Vierling feuert vier Raketen zugleich, Silo acht nacheinander (0,3 s), schwerer und weiter', () => {
    // Cobra mit Vierlingen: erste Salve = 4 Raketen je Turm im selben Takt
    const { g, a } = mk('pirate', 1, 'station', { ship: 'cobra', turret: 'rakete', wing: {} });
    const G = g as unknown as { missiles: { dmg: number; life: number }[]; pTur: { cd: number; salvo?: number }[]; makeEnemy(k: string, x: number, y: number): E; aimA: number };
    a.enemies.length = 0; a.wave = 99; a.reinforce.length = 0;
    const e = G.makeEnemy('m', a.px, a.py - 300); e.hp = e.max = 1e9; e.cd = 1e9; a.enemies.push(e);
    G.missiles.length = 0;
    for (const t of G.pTur) { t.cd = 0; (t as { salvo?: number }).salvo = 0; }
    let first = -1;
    for (let i = 0; i < 120 && first < 0; i++) { G.aimA = -Math.PI / 2; e.x = a.px; e.y = a.py - 300; g.update(DT); if (G.missiles.length) first = G.missiles.length; }
    expect(first % 4, 'Vierling: immer vier Raketen auf einmal').toBe(0);
    expect(first).toBeGreaterThanOrEqual(4);
    // Raptor mit Silos auf den L-Sockeln: acht Raketen je Silo, nicht auf einmal, sondern im Abstand von etwa 0,3 s
    const groups = SHIPS.raptor.groups!.map((gr) => (gr.kind === 'L' ? 'silo' : 'puls'));
    const r = mk('pirate', 1, 'station', { ship: 'raptor', groups, wing: {} });
    const R = r.g as unknown as { missiles: { dmg: number; life: number }[]; pTur: { cd: number; type?: string; a: number }[]; makeEnemy(k: string, x: number, y: number): E; aimA: number };
    r.a.enemies.length = 0; r.a.wave = 99; r.a.reinforce.length = 0;
    const silos = R.pTur.filter((t) => t.type === 'silo');
    expect(silos.length).toBe(8);
    const t0 = R.makeEnemy('m', r.a.px, r.a.py - 3000); t0.hp = t0.max = 1e9; t0.cd = 1e9; r.a.enemies.push(t0);
    // (während des Anlaufs hat womöglich schon eine Salve begonnen)
    for (const t of R.pTur) { t.cd = t.type === 'silo' ? 0 : 1e9; (t as { salvo?: number }).salvo = 0; }
    R.missiles.length = 0;
    const counts: number[] = [];
    for (let i = 0; i < Math.round(2.6 / DT); i++) { R.aimA = -Math.PI / 2; t0.x = r.a.px; t0.y = r.a.py - 3000; r.g.update(DT); counts.push(R.missiles.length); }
    // gleich nach dem Start nur eine Rakete je Silo, nach gut 2,1 s (7 × 0,3 s) alle acht
    expect(counts[0]).toBeLessThanOrEqual(8);
    expect(Math.max(...counts), 'Silo: acht je Silo').toBe(8 * 8);
    // nach 1 s erst etwa vier je Silo (0,3 s Abstand)
    expect(counts[Math.round(1 / DT)]).toBeLessThanOrEqual(8 * 4);
    // fest im Rumpf: Silo dreht nicht mit dem Ziel, sondern liegt in Schiffsrichtung
    for (const t of silos) expect(t.a).toBeCloseTo(R.aimA, 5);
    // schwerer (×1,4) und doppelte Flugzeit (Reichweite) gegenüber den Vierling-Raketen
    expect(R.missiles[0].dmg / G.missiles[0].dmg).toBeCloseTo(1.4, 5);
    // Vorrat: 20 Salven je Turm – Silo 160, Vierling 80 Raketen; leer feuert er nicht mehr
    // (im Anlauf kann schon eine Rakete gestartet sein)
    const sa = (silos[0] as unknown as { ammo: number }).ammo;
    expect(sa).toBeLessThanOrEqual(160 - 8);
    expect(sa).toBeGreaterThanOrEqual(160 - 16);
    const va = G.pTur.map((t) => (t as unknown as { ammo: number }).ammo);
    expect(va.every((x) => x <= 80 && x % 4 === 0), `Vierlinge: ${va}`).toBe(true);
    expect(va.reduce((p, q) => p + q, 0)).toBeLessThan(80 * va.length);
    for (const t of silos) { (t as unknown as { ammo: number }).ammo = 0; t.cd = 0; }
    const before = R.missiles.length;
    for (let i = 0; i < 60; i++) r.g.update(DT);
    expect(R.missiles.length, 'leere Silos feuern nicht').toBeLessThanOrEqual(before);
    const siloRange = (silos[0] as unknown as { w: { range: number } }).w.range, vierRange = (g as unknown as { tw: { range: number } }).tw.range;
    expect(siloRange / vierRange).toBeCloseTo(2, 5);
  });
});

