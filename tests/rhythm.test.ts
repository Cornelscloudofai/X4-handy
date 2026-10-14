import { describe, expect, it } from 'vitest';
import { beatAt, type BeatMap } from '../src/audio/rhythm';
import gasBeats from '../src/assets/music/gas-celestial-drift.beats.json';

// gleichmäßige Karte: 120 BPM, alle Schläge gleich kräftig
const map: BeatMap = {
  duration: 64, bpm: 120, downbeatPhase: 0, beats: Array.from({ length: 128 }, (_, i) => i * 0.5),
  hits: new Array(128).fill(255), rate: 1, bass: [], mid: [], high: [], sections: [[0, 1]],
};

describe('Takt-Effekte', () => {
  it('Eins blitzt am hellsten, Zwei kurz danach, Drei/Vier leise', () => {
    const f = [0, 1, 2, 3].map((k) => beatAt(map, k * 0.5 + 0.01).flash);
    expect(f[0]).toBeGreaterThan(f[1]);
    expect(f[1]).toBeGreaterThan(f[2]);
    expect(f[1]).toBeGreaterThan(f[3]);
    // die Zwei klingt schneller ab als die Eins
    expect(beatAt(map, 0.5 + 0.12).flash / f[1]).toBeLessThan(beatAt(map, 0.12).flash / f[0]);
  });

  it('Phrasenwelle nur zu Beginn jedes vierten Takts', () => {
    expect(beatAt(map, 0.05).phrase).toBeGreaterThan(0.5);
    expect(beatAt(map, 2.05).phrase).toBe(0); // Takt 2
    expect(beatAt(map, 8.05).phrase).toBeGreaterThan(0.5); // Takt 5
    expect(beatAt(map, 8.05).bar).toBe(4);
  });

  it('Blitz folgt der Schlagstärke der Musik', () => {
    const soft = { ...map, hits: map.hits!.map((_, i) => (i === 4 ? 60 : 255)) };
    expect(beatAt(soft, 2.01).flash).toBeLessThan(beatAt(map, 2.01).flash * 0.3);
  });

  it('Gas-Lied: Schlagstärken und Betonung vorhanden, Eins und Zwei betont', () => {
    const m = gasBeats as unknown as BeatMap;
    expect(m.hits).toHaveLength(m.beats.length);
    expect(m.groove![0]).toBe(1);
    expect(m.groove![1]).toBeGreaterThan(m.groove![2]);
  });
});
