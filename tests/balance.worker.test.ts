// Messlauf für scripts/balance.mjs (nicht Teil der normalen Testreihe: ohne BALANCE wird er übersprungen).
// Spielt im Überlebensmodus (kein Frachter) feste Testlagen mit einem Loadout und einer Liste von Zufallsstarts und schreibt die Messwerte als JSON.
import { it } from 'vitest';
// @ts-expect-error – Node-Typen sind im Projekt nicht eingebunden (läuft nur unter vitest/Node)
import { writeFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
import { ShooterGame, interceptTime } from '../src/minigames/shooter';
import { DEFAULT_LOADOUT, SHIPS, setBroodTest } from '../src/minigames/loadout';

type En = { x: number; y: number; kind: string; hp: number; sh: number; max: number; shMax: number; parent?: unknown; vx: number; vy: number };
type G = {
  update(d: number): void; resize(w: number, h: number): void; px: number; py: number; enemies: En[]; clusters: Map<unknown, unknown>;
  hull: number; shield: number; fireChain(x: number, y: number, a: number): void; 
  tempo: number; spawnBoss(m?: boolean): void; makeEnemy(k: string, x: number, y: number): En; state: { choosing: boolean }; chooseCard(i: number): void;
  chainGun: boolean; aimA: number; fireId: number | null; pTur: { L?: boolean; cd: number }[]; wpn: { interval: number; range: number; speed: number };
};
const env = process.env;
const DT = 1 / 60;

it.skipIf(!env.BALANCE)('Messlauf', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const o = JSON.parse(env.BALANCE!) as { lagen: string[]; seeds: number[]; ship: string; turret: string; groups?: string[]; weapon: string; gear: 1 | 2 | 3; level: 1 | 2 | 3 | 4 | 5; secs: number; out: string; guns?: boolean; noTurrets?: boolean; onlyL?: boolean; lturret?: string; flank?: boolean };
  const lo = { ...DEFAULT_LOADOUT, wing: {}, ship: o.ship, turret: o.turret, weapon: o.weapon, ...(o.lturret ? { lturret: o.lturret } : {}), ...(o.groups ? { groups: o.groups } : {}) };
  const make = (seed: number, side: string): G => {
    const g = new ShooterGame({ level: o.level, seed, mutator: null, mode: 'normal', mission: 'ueberleben', fog: false, mods: {}, gear: { weapon: o.gear, shield: o.gear, engine: o.gear }, loadout: lo } as never, side as never) as unknown as G;
    g.resize(390, 780);
    // nur die Bordwaffen messen: Türme abbauen
    if (o.noTurrets) g.pTur.length = 0;
    // nur die schweren L-Türme messen (Zerstörer: Schulterrohre; Träger: L-Sockel)
    // (die übrigen schweigen, statt entfernt zu werden – die Türme sind über ihre Lage in der Liste den Sockeln zugeordnet)
    if (o.onlyL) for (const t of g.pTur) if (!t.L) t.cd = 1e12;
    return g;
  };
  // Bordwaffe: Blitzwaffen feuern im Takt auf den nächsten Gegner in Reichweite (andere Bordwaffen schweigen)
  const fire = (g: G, i: number, every: number, pick: (e: En) => boolean) => {
    if (o.guns) {
      // Bordkanonen wie ein Spieler: Bug mit Vorhalt auf den nächsten Gegner, Feuer halten, solange er in Reichweite ist
      const n = g.enemies.filter(pick).sort((p, q) => Math.hypot(p.x - g.px, p.y - g.py) - Math.hypot(q.x - g.px, q.y - g.py))[0];
      if (!n) { g.fireId = null; return; }
      const dx = n.x - g.px, dy = n.y - g.py, sp = g.wpn.speed;
      const t = sp > 0 && sp < 1e5 ? interceptTime(dx, dy, n.vx, n.vy, sp) : 0;
      const tt = Number.isFinite(t) && t > 0 ? t : 0;
      g.aimA = Math.atan2(dy + n.vy * tt, dx + n.vx * tt);
      g.fireId = Math.hypot(dx, dy) < g.wpn.range * 1.05 ? 1 : null;
      return;
    }
    if (!g.chainGun || i % every) return;
    const n = g.enemies.filter(pick).sort((p, q) => Math.hypot(p.x - g.px, p.y - g.py) - Math.hypot(q.x - g.px, q.y - g.py))[0];
    if (n && Math.hypot(n.x - g.px, n.y - g.py) < g.wpn.range) g.fireChain(g.px, g.py, Math.atan2(n.y - g.py, n.x - g.px));
  };
  // Abstand der Testlagen vom eigenen Schiff: große Schiffe (Zerstörer, Träger) reichen weit über ihre Mitte hinaus
  const sd = SHIPS[o.ship as keyof typeof SHIPS], pad = (sd?.size ?? 0) * 0.5;
  // Flanke (--flanke): Gegner entlang des Rumpfs statt rund um die Mitte – für lange Schiffe (Träger), deren Türme
  // über die ganze Länge verteilt sind; Bug zeigt nach oben
  const halfL = pad, halfW = pad * (sd?.aspect ?? 1);
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
          if (o.flank) { boss.x = g.px + halfW + 350 - ox; boss.y = g.py - oy; } else { boss.x = g.px - ox; boss.y = g.py - 350 - pad - oy; } boss.vx = boss.vy = 0;
          for (const e of g.enemies) if (e !== boss && !e.parent) e.x = -9999;
          // zwischen den Wellen wartet das Spiel auf eine Verbesserungskarte (sonst steht die Zeit still)
          if (g.state.choosing) g.chooseCard(0);
          fire(g, i, every, (e) => e === boss || e.parent === boss);
          g.update(DT); g.hull = 100; g.shield = 100; // Messung im Überlebensmodus (ohne Frachter): das eigene Schiff hält
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
          wave.forEach((kind, k) => {
            if (o.flank) {
              // abwechselnd links und rechts, vom Bug bis zum Heck verteilt, 300 neben der Bordwand
              const side = k % 2 ? 1 : -1, along = -halfL + (2 * halfL * k) / Math.max(1, wave.length - 1);
              g.enemies.push(g.makeEnemy(kind, g.px + side * (halfW + 300), g.py + along));
            } else { const a = (k / wave.length) * Math.PI * 2; g.enemies.push(g.makeEnemy(kind, g.px + Math.cos(a) * (500 + pad), g.py + Math.sin(a) * (500 + pad))); }
          });
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
          taken += Math.max(0, h0 - (g.hull + g.shield)); g.hull = 100; g.shield = 100; // Messung im Überlebensmodus (ohne Frachter): das eigene Schiff hält
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
