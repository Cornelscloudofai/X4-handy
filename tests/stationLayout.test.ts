import { describe, expect, it } from 'vitest';
import { MODULE_MAP } from '../src/data/modules';
import type { ModuleInst, Station } from '../src/engine/types';
import { ensurePlaced, moduleGroup, moduleShape, placesOverlap, plannedPlaces, stationStyle } from '../src/render/stationLayout';

const mod = (uid: number, def: string): ModuleInst => ({ uid, def, t: 0, running: true, stall: '', util: 1 });
const station = (id: string, defs: string[]): Station => ({ id, modules: [mod(0, 'core'), ...defs.map((d, i) => mod(i + 1, d))], queue: [] } as unknown as Station);
const MIX = ['prod_energycells', 'storage_container', 'storage_solid', 'dock_m', 'prod_refinedmetals', 'prod_refinedmetals', 'storage_solid_m', 'prod_graphene',
  'prod_hullparts', 'prod_refinedmetals', 'pier_l', 'prod_graphene', 'storage_liquid', 'prod_energycells', 'prod_hullparts', 'prod_claytronics', 'prod_energycells',
  'storage_container_m', 'prod_microchips', 'prod_microchips', 'prod_siliconwafers', 'prod_hullparts', 'prod_refinedmetals', 'storage_liquid_m', 'pier_l',
  ...Array.from({ length: 35 }, (_, i) => ['prod_engineparts', 'prod_refinedmetals', 'prod_graphene', 'storage_solid_l', 'prod_energycells'][i % 5])];
const IDS = ['st0', 'st1', 'st2', 'st3'];

describe('Stationsanordnung', () => {
  it('jede Bauform kommt vor', () => {
    expect(new Set(IDS.map(stationStyle)).size).toBe(4);
  });

  it('Module überlappen nie, auch nicht bei 60 Modulen', () => {
    for (const id of IDS) {
      const st = station(id, MIX);
      ensurePlaced(st);
      const mods = st.modules.slice(1);
      for (let i = 0; i < mods.length; i++) {
        expect(mods[i].at, `${id}: Modul ${i} ohne Platz`).toBeTruthy();
        for (let j = 0; j < i; j++) expect(placesOverlap(mods[i].at!, mods[i].def, mods[j].at!, mods[j].def), `${id}: ${i} überlappt ${j}`).toBe(false);
      }
    }
  });

  it('Plätze bleiben fest: neue Module und Abriss verschieben nichts', () => {
    for (const id of IDS) {
      const st = station(id, MIX.slice(0, 20));
      ensurePlaced(st);
      const before = st.modules.map((m) => JSON.stringify(m.at));
      // geplanter Platz = späterer fester Platz
      const plan = plannedPlaces(st, ['prod_graphene'])[0];
      st.modules.splice(5, 1);
      before.splice(5, 1);
      st.modules.push(mod(99, 'prod_graphene'));
      ensurePlaced(st);
      expect(st.modules.slice(0, -1).map((m) => JSON.stringify(m.at))).toEqual(before);
      // nach dem Abriss darf der Platz neu belegt werden – ohne Überlappung
      for (const m of st.modules.slice(1, -1)) expect(placesOverlap(m.at!, m.def, st.modules.at(-1)!.at!, 'prod_graphene')).toBe(false);
      expect(plan).toBeTruthy();
    }
  });

  it('gleiche Module hängen direkt aneinander (Cluster)', () => {
    for (const id of IDS) {
      const st = station(id, MIX);
      ensurePlaced(st);
      const mods = st.modules.slice(1);
      let joined = 0, total = 0;
      mods.forEach((m, i) => {
        if (m.at!.seed || moduleShape(MODULE_MAP[m.def]).base) return;
        total++;
        const s = moduleShape(MODULE_MAP[m.def]);
        // Nachbar derselben Gruppe genau im Anschlussabstand (Längs- oder Seitenanschluss)
        const touch = mods.some((o, j) => {
          if (j === i || moduleGroup(MODULE_MAP[o.def]) !== moduleGroup(MODULE_MAP[m.def])) return false;
          const so = moduleShape(MODULE_MAP[o.def]);
          const d = Math.hypot(o.at!.x - m.at!.x, o.at!.y - m.at!.y);
          return Math.abs(d - (s.half + so.half)) < 0.01 || Math.abs(d - (s.hw + so.hw)) < 0.01;
        });
        if (touch) joined++;
      });
      expect(joined, id).toBe(total);
    }
  });

  it('vor einem Pier bleibt der Raum frei', () => {
    for (const id of IDS) {
      const st = station(id, MIX);
      ensurePlaced(st);
      for (const pier of st.modules.filter((m) => m.def === 'pier_l')) {
        const p = pier.at!;
        const fx = p.x + Math.cos(p.ang) * 1.3, fy = p.y + Math.sin(p.ang) * 1.3;
        for (const m of st.modules.slice(1)) {
          if (m === pier) continue;
          expect(Math.hypot(m.at!.x - fx, m.at!.y - fy), `${id}: Modul vor dem Pier`).toBeGreaterThan(0.9);
        }
      }
    }
  });
});
