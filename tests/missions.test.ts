import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { MISSIONS, MISSION_IDS, recordKey, type Mission } from '../src/minigames/missions';
import { best, recordResult, resetRecords } from '../src/minigames/records';
import type { GameResult, Level } from '../src/minigames/common';

const DT = 1 / 60;
type Side = 'pirate' | 'xenon' | 'khaak';
const sideOf = { pirates: 'pirate', xenon: 'xenon', khaak: 'khaak' } as const;

function game(mission: Mission, side: Side, seed = 1, level: Level = 1): ShooterGame {
  const g = new ShooterGame({ level, seed, mutator: null, mode: 'normal', mission }, side);
  g.resize(390, 780);
  return g;
}
function play(g: ShooterGame, max = 900): GameResult {
  let t = 0;
  while (!g.result() && t < max) { g.autopilot(); g.update(DT); t += DT; }
  const r = g.result();
  expect(r).not.toBeNull();
  return r!;
}
/** Zugriff auf Innereien für gezielte Prüfungen */
type G = {
  wards: { kind: string; hull: number; max: number; dead: boolean; tur: { hp: number; max: number }[] }[];
  enemies: { kind: string; x: number; y: number; hp: number; nest?: boolean; parent?: unknown; weapon?: string; shielded: boolean; hive?: unknown; plat?: unknown; cl?: number }[];
  crates: { x: number; y: number; tow: boolean; done: boolean; hp: number }[];
  pickups: { x: number; y: number; kind: string; life: number }[];
  px: number; py: number; pvx: number; pvy: number;
  wx(w: unknown): number; wy(w: unknown): number;
  hitWard(w: unknown, dmg: number, x: number, y: number): void;
  spawnWave(): void; wave: number; gateCy: number;
};

describe('Kampf: Einsätze', () => {
  it('jeder Einsatz läuft mit jeder erlaubten Gegnerseite bis zum Ende', () => {
    for (const id of MISSION_IDS) for (const k of MISSIONS[id].sides) {
      const r = play(game(id, sideOf[k], 2));
      expect(r.points, `${id}/${k}`).toBeGreaterThan(0);
      expect(r.starRules?.length).toBe(3);
      expect(r.breakdown?.reduce((a, [, v]) => a + v, 0)).toBe(r.points);
    }
  }, 300000);

  it('mit dem Autopiloten auf Stufe 1 meist zu schaffen', () => {
    let wins = 0, n = 0;
    for (const id of MISSION_IDS) for (const seed of [1, 2]) {
      const side = sideOf[MISSIONS[id].sides[0]];
      if (play(game(id, side, seed)).success) wins++;
      n++;
    }
    expect(wins).toBeGreaterThanOrEqual(Math.ceil(n * 0.75));
  }, 300000);

  it('Konvoi: drei Frachter weit auseinander; ein verlorener Frachter kostet Sterne, nicht die Runde', () => {
    const g = game('konvoi', 'pirate');
    const G = g as unknown as G;
    expect(G.wards.length).toBe(3);
    const xs = G.wards.map((w) => G.wx(w));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(800);
    G.hitWard(G.wards[0], 9999, G.wx(G.wards[0]), G.wy(G.wards[0]));
    expect(G.wards[0].dead).toBe(true);
    const r = play(g);
    expect(r.success).toBe(true);
    expect(r.stars).toBeLessThanOrEqual(2);
  }, 120000);

  it('Station: zerstörte Türme lassen sich mit einem Reparatur-Fundstück wieder instand setzen', () => {
    const g = game('station', 'pirate');
    const G = g as unknown as G;
    const st = G.wards[0];
    expect(st.kind).toBe('station');
    expect(st.tur.length).toBe(6);
    st.tur[2].hp = 0;
    g.update(DT);
    G.pickups.push({ x: G.px, y: G.py, kind: 'repair', life: 5 });
    g.update(DT);
    expect(st.tur[2].hp).toBe(st.tur[2].max);
  });

  it('Bergung: Container koppelt an, wird geschleppt und am Bergungsschiff abgeliefert', () => {
    const g = game('bergung', 'pirate');
    const G = g as unknown as G;
    expect(G.crates.length).toBe(8);
    for (let i = 0; i < 60; i++) g.update(DT);
    const c = G.crates[0];
    c.x = G.px + 20; c.y = G.py;
    g.update(DT);
    expect(c.tow).toBe(true);
    // zum Schiff fliegen: Jäger direkt daneben setzen, das Seil zieht den Container nach
    const w = G.wards[0];
    for (let i = 0; i < 60 && !c.done; i++) { G.px = G.wx(w); G.py = G.wy(w) - 40; g.update(DT); }
    expect(c.done).toBe(true);
    expect(g.state.crates).toBe(1);
  });

  it('Überfall: entkommene Frachter zählen nicht; alle entkommen = nicht geschafft', () => {
    const g = game('ueberfall', 'pirate');
    const G = g as unknown as G;
    for (let i = 0; i < 90; i++) g.update(DT);
    const cargo = G.enemies.filter((e) => e.kind === 'cargo');
    expect(cargo.length).toBe(3);
    // alle Frachter direkt ans Tor setzen
    for (const e of cargo) { e.x = (g as unknown as { gateX: number }).gateX; e.y = G.gateCy + 10; }
    for (let i = 0; i < 400 && !g.result(); i++) g.update(DT);
    const r = g.result()!;
    expect(r.success).toBe(false);
    expect(r.headline).toContain('entkommen');
  });

  it('Nest: Kern geschützt, solange Brutöffnungen stehen; Öffnungen spucken Drohnen', () => {
    const g = game('nest', 'xenon');
    const G = g as unknown as G;
    for (let i = 0; i < 60 * 12; i++) g.update(DT);
    const core = G.enemies.find((e) => e.nest)!;
    expect(core).toBeTruthy();
    expect(core.shielded).toBe(true);
    expect(G.enemies.filter((e) => e.parent === core && e.weapon === 'brut').length).toBe(5);
    expect(G.enemies.some((e) => e.kind === 'n')).toBe(true);
  });

  it('Kha’ak-Nest: zwei Nebennester brüten Späher, vier Turmplattformen feuern Kyon-Strahlen; alles freiwillig', () => {
    const g = game('nest', 'khaak');
    const G = g as unknown as G & { hull: number };
    for (let i = 0; i < 60; i++) g.update(DT);
    expect(G.enemies.filter((e) => e.hive).length).toBe(2);
    expect(G.enemies.filter((e) => e.plat).length).toBe(4);
    // Jäger vor eine Plattform setzen: sie dreht sich zu ihm, lädt und trifft
    const p = G.enemies.find((e) => e.plat) as unknown as { x: number; y: number };
    const S = g as unknown as { shield: number; rails: { color: string }[] };
    let shots = 0;
    for (let i = 0; i < 60 * 12; i++) {
      G.px = p.x + 150; G.py = p.y + 40; G.hull = Math.max(G.hull, 50);
      const sh0 = S.shield;
      g.update(DT);
      if (S.shield < sh0 && S.rails.some((r) => r.color === '#b45cff')) shots++;
    }
    expect(shots).toBeGreaterThan(0);
    // Nebennester brüten Cluster (solange nicht schon viele Späher unterwegs sind)
    const all = G.enemies as unknown as { kind: string; hive?: unknown; broodT?: number; cl?: number }[];
    G.enemies = all.filter((e) => e.kind !== 'ks') as never;
    for (const e of all) if (e.hive) e.broodT = 0;
    g.update(DT);
    expect((G.enemies as unknown as { cl?: number }[]).some((e) => e.cl != null)).toBe(true);
    // Sieg ohne Nebennester und Plattformen: nur der Kern zählt
    const r = play(g);
    expect(r.points).toBeGreaterThan(0);
  }, 120000);

  it('Xenon-Nest: Nebennester schicken N-Drohnen, Plattformtürme feuern Feuerstöße und Laser', () => {
    const g = game('nest', 'xenon');
    const G = g as unknown as G & { hull: number; bullets: { from: string }[] };
    for (let i = 0; i < 60; i++) g.update(DT);
    expect(G.enemies.filter((e) => e.hive).length).toBe(2);
    expect(G.enemies.filter((e) => e.plat).length).toBe(4);
    const p = G.enemies.find((e) => e.plat) as unknown as { x: number; y: number };
    let shots = 0;
    for (let i = 0; i < 60 * 8; i++) {
      G.px = p.x + 160; G.py = p.y + 60; G.hull = 100;
      g.update(DT);
      shots = Math.max(shots, G.bullets.filter((b) => b.from === 'e').length);
    }
    expect(shots).toBeGreaterThan(3);
    const all = G.enemies as unknown as { kind: string; hive?: unknown; broodT?: number }[];
    G.enemies = all.filter((e) => e.kind !== 'n') as never;
    for (const e of all) if (e.hive) e.broodT = 0;
    // ohne Drohnen gilt die Welle als besiegt: erst die Verbesserungskarte wählen (solange steht das Spiel)
    for (let i = 0; i < 3; i++) { g.update(DT); if (g.state.choosing) g.chooseCard(0); }
    expect((G.enemies as unknown as { kind: string }[]).filter((e) => e.kind === 'n').length).toBeGreaterThanOrEqual(3);
  }, 120000);

  it('Flucht: der Sprungantrieb lädt mit der Zeit, voll = gewonnen', () => {
    const g = game('flucht', 'pirate');
    for (let i = 0; i < 60 * 30; i++) { g.autopilot(); g.update(DT); }
    expect(g.state.charge).toBeGreaterThan(0.15);
    const r = play(g);
    if (r.success) expect(g.state.charge).toBe(1);
  }, 120000);

  it('Rekorde je Einsatz getrennt vom Geleitschutz', () => {
    resetRecords();
    const r = play(game('station', 'pirate'));
    recordResult(recordKey('pirates', 'station'), 1, 'normal', r);
    expect(best('pirates@station', 1)?.points).toBe(r.points);
    expect(best('pirates', 1)).toBeNull();
    expect(recordKey('pirates', 'geleit')).toBe('pirates');
  }, 120000);
});
