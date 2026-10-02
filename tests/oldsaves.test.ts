// Ladetest: echte Spielstände älterer Spielversionen (erzeugt mit dem damaligen Code, siehe tests/fixtures/saves/README.md)
// werden mit dem aktuellen Code geladen und weitergespielt.
import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/engine/state';
import { step } from '../src/engine/sim';
import { buildMissing, buildProgress, storageCap, usedVolume } from '../src/engine/economy';
import { currentMission, STORY } from '../src/engine/story';
import { netWorth } from '../src/engine/stats';
import { MODULE_MAP } from '../src/data/modules';
import { SHIP_MAP } from '../src/data/ships';
import type { GameState } from '../src/engine/types';

// Rohtext der Spielstände (wie beim Laden aus einer Datei)
const saves = import.meta.glob('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const files = Object.keys(saves).sort();

function check(s: GameState, label: string) {
  expect(Number.isFinite(s.credits), `${label}: Credits`).toBe(true);
  expect(Number.isFinite(netWorth(s)), `${label}: Unternehmenswert`).toBe(true);
  for (const st of s.stations) {
    for (const m of st.modules) expect(MODULE_MAP[m.def], `${label}: Modul ${m.def}`).toBeTruthy();
    for (const [id, n] of [...Object.entries(st.inventory), ...Object.entries(st.buildStore ?? {})]) {
      expect(Number.isFinite(n) && n >= -0.01, `${label}: ${st.name} ${id} = ${n}`).toBe(true);
    }
    const cap = storageCap(st), used = usedVolume(st);
    for (const k of ['Container', 'Solid', 'Liquid'] as const) expect(used[k] <= cap[k] * 1.01 + 1, `${label}: ${st.name} ${k}-Lager überfüllt`).toBe(true);
    if (st.build) expect(Number.isFinite(buildProgress(st)), `${label}: Baufortschritt`).toBe(true);
  }
  for (const sh of s.ships) {
    expect(SHIP_MAP[sh.cls], `${label}: Schiff ${sh.cls}`).toBeTruthy();
    expect(Number.isFinite(sh.x) && Number.isFinite(sh.z), `${label}: ${sh.name} Position`).toBe(true);
  }
}

describe('Alte Spielstände laden', () => {
  it('es gibt Spielstände aus mehreren Versionen', () => expect(files.length).toBeGreaterThanOrEqual(8));

  for (const f of files) {
    it(`${f.split('/').pop()}: lädt, spielt 12 h weiter und bleibt gültig`, () => {
      const raw = JSON.parse(saves[f]);
      const s = deserialize(saves[f]);
      expect(s.stations.length).toBe(raw.stations.length);
      expect(s.ships.length).toBe(raw.ships.length);
      expect(s.credits).toBe(raw.credits);
      // Kampagne zeigt auf ein gültiges Kapitel mit Kennung
      const m = currentMission(s);
      if (m) expect(s.story.id).toBe(m.id);
      else expect(s.story.index).toBeGreaterThanOrEqual(STORY.length);
      check(s, f + ' geladen');
      // Kein festhängender Bau: Ist alles Material da, muss es in einer Stunde weitergehen
      const before = s.stations.map((st) => ({ def: st.build?.def, p: buildProgress(st), queue: st.queue.length, mods: st.modules.length }));
      step(s, 3600);
      s.stations.forEach((st, i) => {
        const b = before[i];
        if (b.def && !Object.keys(buildMissing(st)).length) {
          const moved = st.modules.length > b.mods || st.build?.def !== b.def || buildProgress(st) > b.p || st.queue.length < b.queue;
          expect(moved, `${f}: ${st.name} hängt bei ${b.def}`).toBe(true);
        }
      });
      step(s, 11 * 3600);
      check(s, f + ' nach 12 h');
      // Mehr gebaut als vorher und der Bau ist nicht für immer stehen geblieben
      const built = s.stations.reduce((n, st) => n + st.modules.length, 0);
      expect(built).toBeGreaterThan(before.reduce((n, b) => n + b.mods, 0));
      // Speichern und Laden bleibt stabil
      const again = deserialize(serialize(s));
      expect(again.stations.map((x) => x.modules.length)).toEqual(s.stations.map((x) => x.modules.length));
      expect(again.time).toBe(s.time);
    });
  }
});
