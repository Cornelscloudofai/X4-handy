import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { stepNpcs } from '../src/engine/npc';
import { FOUND_MAX, MAX_MODULES, NPC_FACTORIES, SELF_SHARE, factoryInputs, inputRate, npcFactories, stepNpcEconomy } from '../src/engine/npcEconomy';
import { ESSENTIAL_WARES, npcMade, postShare } from '../src/engine/economy';
import { NPC_MAP, SECTOR_MAP } from '../src/data/sectors';
import { WARES } from '../src/data/wares';
import type { GameState } from '../src/engine/types';

const huette = NPC_FACTORIES.find((n) => n.id === 'zhin-huette')!;

/** Nur NPC-Wirtschaft und NPC-Schiffe laufen lassen (ohne Spieler) */
function run(s: GameState, seconds: number, each?: () => void, dt = 2): void {
  for (let t = 0; t < seconds; t += dt) {
    each?.();
    stepNpcEconomy(s, dt);
    stepNpcs(s, dt);
    s.time += dt;
  }
}

describe('NPC-Wirtschaft', () => {
  it('jede NPC-Fabrik hat Produktion und verkauft ihre Produkte am eigenen Markt', () => {
    const s = newGame();
    expect(NPC_FACTORIES.length).toBe(5);
    for (const n of NPC_FACTORIES) {
      const eco = s.npcEco![n.id];
      expect(Object.keys(eco.prod).sort()).toEqual([...n.makes!].sort());
      for (const w of n.makes!) expect(s.markets[n.id][w], `${n.id} ${w}`).toBeTruthy();
      // alles, was sie verbraucht, kauft sie auch an
      for (const i of factoryInputs(eco)) expect(n.buys.includes(i) || n.makes!.includes(i), `${n.id} braucht ${i}`).toBe(true);
    }
  });

  it('produziert nach Rezept: verbraucht Vorprodukte, erzeugt Waren', () => {
    const s = newGame();
    const m = s.markets[huette.id];
    const eco = s.npcEco![huette.id];
    for (const id of Object.keys(m)) m[id].stock = eco.prod[id] ? 0 : m[id].cap;
    const ore0 = m.ore.stock;
    run(s, 3600);
    expect(m.hullparts.stock).toBeGreaterThan(0);
    expect(m.ore.stock).toBeLessThan(ore0);
    expect(s.npcEco![huette.id].util.refinedmetals).toBeGreaterThan(0.3);
  });

  it('ohne Lieferungen deckt die Fabrik ihren Bedarf nur zu einem kleinen Teil selbst', () => {
    const s = newGame();
    const m = s.markets[huette.id];
    const eco = s.npcEco![huette.id];
    for (const id of Object.keys(m)) m[id].stock = 0;
    // Handelsposten hat reichlich Erz – trotzdem holt die Fraktion nur ihren Anteil
    const post = s.markets[huette.sector];
    let delivered = 0;
    const before = () => m.ore.stock;
    let last = 0;
    run(s, 24 * 3600, () => {
      post.ore.stock = post.ore.cap;
      const now = before();
      if (now > last) delivered += now - last;
      last = m.ore.stock;
    });
    const need = inputRate(eco, 'ore') * 24 * 3600;
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(need * (SELF_SHARE + 0.1));
  }, 30000);

  it('wächst langsam: nur bei guter Auslastung, höchstens ein Modul pro Fraktion und Tag, nie über die Obergrenze', () => {
    const s = newGame();
    const m = s.markets[huette.id];
    const eco = s.npcEco![huette.id];
    const start = Object.values(eco.prod).reduce((a, b) => a + b, 0);
    // Vorprodukte immer voll, Produkte werden abgeholt: volle Auslastung
    const ins = factoryInputs(eco).filter((id) => !eco.prod[id]);
    run(s, 3 * 24 * 3600, () => {
      for (const id of ins) m[id].stock = m[id].cap;
      for (const id in eco.prod) m[id].stock = Math.min(m[id].stock, m[id].cap * 0.2);
    }, 10);
    const after = Object.values(eco.prod).reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(start);
    expect(after - start).toBeLessThanOrEqual(3);
    expect(after).toBeLessThanOrEqual(MAX_MODULES);
  }, 30000);

  it('ohne Vorprodukte baut keine Fabrik aus', () => {
    const s = newGame();
    for (const n of NPC_FACTORIES) for (const id of Object.keys(s.markets[n.id])) s.markets[n.id][id].stock = 0;
    const posts = Object.keys(s.markets).filter((k) => !s.npcEco![k]).map((k) => Object.values(s.markets[k]));
    const before = JSON.stringify(Object.fromEntries(NPC_FACTORIES.map((n) => [n.id, s.npcEco![n.id].prod])));
    run(s, 2 * 24 * 3600, () => { for (const p of posts) for (const w of p) w.stock = 0; }, 10);
    expect(JSON.stringify(Object.fromEntries(NPC_FACTORIES.map((n) => [n.id, s.npcEco![n.id].prod])))).toBe(before);
  }, 30000);

  it('alte Spielstände bekommen die Fabrikdaten beim Laden', () => {
    const s = newGame();
    delete s.npcEco;
    delete s.npcGrow;
    const t = deserialize(serialize(s));
    expect(Object.keys(t.npcEco ?? {}).length).toBe(5);
    step(t, 60);
    expect(Object.values(t.markets[huette.id]).every((w) => Number.isFinite(w.stock))).toBe(true);
    expect(WARES.hullparts).toBeTruthy();
  });

  it('Grundwaren (Energie, Hüllenteile, Claytronik) gibt es ab Spielbeginn in Reichweite des Starts', () => {
    const s = newGame();
    const near = new Set([s.sectors[0], ...SECTOR_MAP[s.sectors[0]].links]);
    for (const w of ESSENTIAL_WARES) {
      const byNpc = npcFactories().some((n) => near.has(n.sector) && n.makes!.includes(w));
      const surplus = [...near].some((sec) => SECTOR_MAP[sec].surplus.includes(w));
      expect(byNpc || surplus, w).toBe(true);
      // Handelsposten halten Grundwaren fast voll vorrätig
      expect(postShare(w, npcMade(s))).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('Handelsposten werden knapper, sperren aber nichts', () => {
    const s = newGame();
    step(s, 16 * 3600);
    const post = s.markets.zhin;
    // Fabrikware ohne NPC-Herstellung: knapp, aber vorhanden
    expect(post.fieldcoils.stock).toBeGreaterThan(0);
    expect(post.fieldcoils.stock / post.fieldcoils.cap).toBeLessThan(post.fieldcoils.eq * 0.6);
    // Grundwaren reichlich
    expect(post.hullparts.stock / post.hullparts.cap).toBeGreaterThan(post.hullparts.eq * 0.6);
  }, 30000);

  it('Fraktionen gründen langsam neue Fabriken – mit Abstand zueinander und höchstens drei je Fraktion', () => {
    const s = newGame();
    const start = npcFactories().length;
    run(s, 23 * 3600, undefined, 30);
    expect(npcFactories().length).toBe(start);
    run(s, 12 * 24 * 3600, undefined, 30);
    const founded = s.npcFounded ?? [];
    expect(founded.length).toBeGreaterThanOrEqual(2);
    for (const f of ['frf', 'zya']) expect(founded.filter((n) => SECTOR_MAP[n.sector].faction === f).length).toBeLessThanOrEqual(FOUND_MAX);
    for (const n of founded) {
      expect(s.npcEco![n.id]).toBeTruthy();
      expect(s.markets[n.id][n.makes![0]]).toBeTruthy();
      for (const o of SECTOR_MAP[n.sector].npcStations) if (o !== n) expect(Math.hypot(o.x - n.x, o.z - n.z), `${n.id} zu nah an ${o.id}`).toBeGreaterThan(45);
    }
    // Spielstand speichern und laden: gegründete Fabriken sind wieder da, ein neues Spiel hat keine
    const t = deserialize(serialize(s));
    expect(NPC_MAP[founded[0].id]).toBeTruthy();
    expect(t.npcFounded?.length).toBe(founded.length);
    newGame();
    expect(NPC_MAP[founded[0].id]).toBeUndefined();
  }, 60000);
});
