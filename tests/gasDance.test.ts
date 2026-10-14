import { describe, expect, it } from 'vitest';
import { DANCE_BEATS, danceFrame } from '../src/minigames/gasDance';
import { beatPos, downbeatFrom, type BeatMap } from '../src/audio/rhythm';
import gasBeats from '../src/assets/music/gas-celestial-drift.beats.json';

const W = 390, H = 700;

describe('Tanz der Gassammeldrohnen', () => {
  it('beginnt auf der „Eins“ bei etwa 1:57 und dauert 16 Takte', () => {
    const m = gasBeats as unknown as BeatMap;
    const i = downbeatFrom(m, 117);
    expect(m.beats[i]).toBeGreaterThan(117);
    expect(m.beats[i]).toBeLessThan(118);
    expect(beatPos(m, m.beats[i])).toBeCloseTo(i, 5);
    expect(m.beats[i + DANCE_BEATS] - m.beats[i]).toBeGreaterThan(30);
  });

  it('Figuren in fester Reihenfolge, nur während des Tanzes', () => {
    expect(danceFrame(-0.1, W, H)).toBeNull();
    expect(danceFrame(DANCE_BEATS + 0.1, W, H)).toBeNull();
    const seen: string[] = [];
    for (let d = 0; d <= DANCE_BEATS; d += 0.25) {
      const f = danceFrame(d, W, H)!.figure;
      if (seen[seen.length - 1] !== f) seen.push(f);
    }
    expect(seen).toEqual(['anflug', 'kreisen', 'paartanz', 'acht', 'wackeln', 'abflug']);
  });

  it('kommen von außen, bleiben im Tanz nah am Sammler und fliegen nach oben hinaus', () => {
    const start = danceFrame(0, W, H)!, end = danceFrame(DANCE_BEATS, W, H)!;
    expect(Math.hypot(...start.a)).toBeGreaterThan(H * 0.4);
    expect(end.a[1]).toBeLessThan(-H * 0.4);
    expect(end.b[1]).toBeLessThan(-H * 0.4);
    expect(end.alpha).toBeLessThan(0.05);
    for (let d = 8; d < 56; d += 0.5) {
      const f = danceFrame(d, W, H, 1)!;
      for (const p of [f.a, f.b]) expect(Math.hypot(...p)).toBeLessThan(260);
      // die beiden Drohnen stoßen nicht zusammen
      expect(Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1])).toBeGreaterThan(40);
    }
  });

  it('keine Sprünge zwischen den Figuren (höchstens kurze Wege, die die Federung weich macht)', () => {
    let prev = danceFrame(0, W, H)!;
    for (let d = 0.05; d <= DANCE_BEATS; d += 0.05) {
      const f = danceFrame(d, W, H)!;
      expect(Math.hypot(f.a[0] - prev.a[0], f.a[1] - prev.a[1])).toBeLessThan(110);
      prev = f;
    }
  });
});
