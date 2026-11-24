// Messlauf für scripts/balance.mjs (nicht Teil der normalen Testreihe: ohne BALANCE wird er übersprungen).
// Spielt feste Testlagen mit einem Loadout und einer Liste von Zufallsstarts und schreibt die Messwerte als JSON.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ShooterGame } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, setBroodTest } from '../src/minigames/loadout';

type En = { x: number; y: number; kind: string; hp: number; sh: number; max: number; shMax: number; parent?: unknown; vx: number; vy: number };
type G = {
  update(d: number): void; resize(w: number, h: number): void; px: number; py: number; enemies: En[]; clusters: Map<unknown, unknown>;
  hull: number; shield: number; fireChain(x: number, y: number, a: number): void; wpn: { interval: number; range: number; chain?: boolean };
  tempo: number; spawnBoss(m?: boolean): void; makeEnemy(k: string, x: number, y: number): En; state: { choosing: boolean }; chooseCard(i: number): void;
  chainGun: boolean;
};
const env = process.env;
const DT = 1 / 60;

it.skipIf(!env.BALANCE)('Messlauf', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const o = JSON.parse(env.BALANCE!) as { lagen: string[]; seeds: number[]; ship: string; turret: string; groups?: string[]; weapon: string; gear: 1 | 2 | 3; level: 1 | 2 | 3 | 4 | 5; secs: number; out: string };
  const lo = { ...DEFAULT_LOADOUT, wing: {}, ship: o.ship, turret: o.turret, weapon: o.weapon, ...(o.groups ? { groups: o.groups } : {}) };
  const make = (seed: number, side: string): G => {
    const g = new ShooterGame({ level: o.level, seed, mutator: null, mode: 'normal', fog: false, mods: {}, gear: { weapon: o.gear, shield: o.gear, engine: o.gear }, loadout: lo } as never, side) as unknown as G;
    g.resize(390, 780);
    return g;
  };
  // Bordwaffe: Blitzwaffen feuern im Takt auf den nächsten Gegner in Reichweite (andere Bordwaffen schweigen)
  const fire = (g: G, i: number, every: number, pick: (e: En) => boolean) => {
    if (!g.chainGun || i % every) return;
    const n = g.enemies.filter(pick).sort((p, q) => Math.hypot(p.x - g.px, p.y - g.py) - Math.hypot(q.x - g.px, q.y - g.py))[0];
    if (n && Math.hypot(n.x - g.px, n.y - g.py) < g.wpn.range) g.fireChain(g.px, g.py, Math.atan2(n.y - g.py, n.x - g.px));
  };
  const res: Record<string, Record<string, number>[]> = {};
  for (const lage of o.lagen) {
    res[lage] = [];
    for (const seed of o.seeds) {
      const BOSS: Record<string, string> = { zerstoerer: 'khaak', fregatte: 'pirate', xenonk: 'xenon' };
      if (BOSS[lage]) {
        // Großkampfschiff samt Türmen in Turmreichweite (Kha'ak-Zerstörer, Piratenfregatte, Xenon K): Zeit bis zur Zerstörung
        const g = make(seed, BOSS[lage]);
        for (let i = 0; i < 3000 && !g.enemies.length; i++) g.update(DT);
        g.enemies.length = 0; g.clusters.clear();
        g.spawnBoss(false);
        const boss = g.enemies.find((e) => e.kind === 'boss')!;
        const every = Math.max(1, Math.round(g.wpn.interval * g.tempo * 60));
        let i = 0;
        for (; i < 60 * 180 && g.enemies.includes(boss); i++) {
          // wie im Spiel am Schiff entlang: das nächste noch lebende Teil liegt 350 vor dir (alle Teile kommen in Reichweite)
          const alive = g.enemies.filter((e) => e === boss || e.parent === boss);
          const near = alive.filter((e) => e !== boss).sort((p, q) => Math.hypot(p.x - g.px, p.y - g.py) - Math.hypot(q.x - g.px, q.y - g.py))[0] ?? boss;
          const ox = near.x - boss.x, oy = near.y - boss.y;
          boss.x = g.px - ox; boss.y = g.py - 350 - oy; boss.vx = boss.vy = 0;
          for (const e of g.enemies) if (e !== boss && !e.parent) e.x = -9999;
          fire(g, i, every, (e) => e === boss || e.parent === boss);
          g.update(DT); g.hull = 100; g.shield = 100;
        }
        res[lage].push({ sekunden: i / 60 });
      } else {
        // brut: Brutschiff ab Welle 1; spaeher: 16 Späher; jaeger: 8 Piraten-Jäger; piraten: gemischte Piratenwelle
        // (6 Jäger, 2 Kanonenboote, 1 Raketenboot); xenon: Xenon-Welle (10 N, 3 M) – jeweils von allen Seiten
        const WAVE: Record<string, string[]> = {
          spaeher: Array(16).fill('ks'), jaeger: Array(8).fill('jaeger'),
          piraten: [...Array(6).fill('jaeger'), 'kanone', 'kanone', 'rakete'], xenon: [...Array(10).fill('n'), 'm', 'm', 'm'],
        };
        const side = lage === 'jaeger' || lage === 'piraten' ? 'pirate' : lage === 'xenon' ? 'xenon' : 'khaak';
        setBroodTest(lage === 'brut');
        const g = make(seed, side);
        if (lage !== 'brut') {
          for (let i = 0; i < 3000 && !g.enemies.length; i++) g.update(DT);
          g.enemies.length = 0; g.clusters.clear();
          const wave = WAVE[lage];
          wave.forEach((kind, k) => { const a = (k / wave.length) * Math.PI * 2; g.enemies.push(g.makeEnemy(kind, g.px + Math.cos(a) * 500, g.py + Math.sin(a) * 500)); });
        }
        const every = Math.max(1, Math.round(g.wpn.interval * g.tempo * 60));
        // gezählt werden die Schiffe der Welle (beim Brutschiff die Späher)
        const kinds = new Set(lage === 'brut' ? ['ks'] : WAVE[lage]);
        const small = (e: En) => kinds.has(e.kind);
        let kills = 0, taken = 0, prev = new Set<En>();
        for (let i = 0; i < 60 * o.secs; i++) {
          if (g.state.choosing) g.chooseCard(0);
          fire(g, i, every, small);
          const h0 = g.hull + g.shield;
          g.update(DT);
          taken += Math.max(0, h0 - (g.hull + g.shield)); g.hull = 100; g.shield = 100;
          const now = new Set(g.enemies.filter(small));
          for (const e of prev) if (!now.has(e)) kills++;
          prev = now;
        }
        setBroodTest(false);
        res[lage].push({ abschuesse: (kills * 60) / o.secs, erlitten: (taken * 60) / o.secs });
      }
    }
  }
  writeFileSync(o.out, JSON.stringify(res));
}, 3_600_000);
