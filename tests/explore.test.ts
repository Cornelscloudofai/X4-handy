import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { REPAIR_COST, REPAIR_TIME, SCOUT_HOP, SCOUT_PRICE, SEARCH_TIME, buyScout, gateState, hiddenLinks, repairGate, scoutPath, scouts, sendScout, sendThrough, stepScouts } from '../src/engine/explore';
import { onGameEvent } from '../src/engine/util';

const run = (s: ReturnType<typeof newGame>, sec: number) => { for (let t = 0; t < sec; t += 10) stepScouts(s, 10); };

describe('Erkundung: Späher und Suche', () => {
  it('Späher kaufen kostet Credits und steht an der ersten Station bereit', () => {
    const s = newGame(1, 'mining');
    s.credits = 1e6;
    expect(buyScout(s).ok).toBe(true);
    expect(s.credits).toBe(1e6 - SCOUT_PRICE);
    expect(scouts(s)[0].at).toBe(s.stations[0].sector);
    s.credits = 0;
    expect(buyScout(s).ok).toBe(false);
  });

  it('Weg nur über bekannte Tore; Unentdecktes ist nicht erreichbar', () => {
    const s = newGame(1, 'mining');
    expect(scoutPath(s, 'zhin', 'rhy')).toEqual(['zhin', 'rhy']);
    expect(scoutPath(s, 'zhin', 'f-ausblick')).toBeNull();
    s.frontier = { signatures: [], discovered: ['f-ausblick'] };
    expect(scoutPath(s, 'zhin', 'f-ausblick')).toEqual(['zhin', 'rhy', 'f-ausblick']);
  });

  it('fliegt Tor für Tor, sucht und findet (mit Glück) die Signatur ins Unbekannte', () => {
    let found = 0, none = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed, 'mining');
      s.credits = 1e6;
      buyScout(s);
      const sp = scouts(s)[0];
      expect(sendScout(s, sp.id, 'rhy').ok).toBe(true);
      run(s, SCOUT_HOP + 20);
      expect(sp.at).toBe('rhy');
      expect(sp.task?.kind).toBe('search');
      run(s, SEARCH_TIME + 20);
      expect(sp.task).toBeUndefined();
      if (s.frontier!.signatures.includes('rhy>f-ausblick')) found++; else none++;
    }
    expect(found).toBeGreaterThan(8);
    expect(none).toBeGreaterThan(4);
  });

  it('wo nichts ist, wird nichts gefunden; eine gefundene Signatur zählt nicht mehr als versteckt', () => {
    const s = newGame(3, 'mining');
    expect(hiddenLinks(s, 'cascade')).toEqual([]);
    expect(hiddenLinks(s, 'rhy')).toEqual(['f-ausblick']);
    s.frontier = { signatures: ['rhy>f-ausblick'], discovered: [] };
    expect(hiddenLinks(s, 'rhy')).toEqual([]);
  });

  it('Peil-Vorsprung erhöht die Chance deutlich', () => {
    let found = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame(seed, 'mining');
      s.credits = 1e6;
      s.stations[0].sector = 'rhy';
      buyScout(s);
      sendScout(s, scouts(s)[0].id, 'rhy', 1);
      run(s, SEARCH_TIME + 20);
      if (s.frontier!.signatures.length) found++;
    }
    expect(found).toBeGreaterThan(24);
  });

  it('Durchbruch: Tor instand setzen, Späher fliegt hindurch, Erstsichtung', () => {
    const s = newGame(5, 'mining');
    s.credits = 5e6;
    buyScout(s);
    s.frontier!.signatures.push('rhy>f-ausblick');
    const sp = scouts(s)[0];
    expect(sendThrough(s, sp.id, 'rhy>f-ausblick').ok).toBe(false);
    const c0 = s.credits;
    expect(repairGate(s, 'rhy>f-ausblick').ok).toBe(true);
    expect(c0 - s.credits).toBe(REPAIR_COST.glut);
    expect(repairGate(s, 'rhy>f-ausblick').ok).toBe(false);
    run(s, REPAIR_TIME + 20);
    expect(gateState(s, 'rhy>f-ausblick').kind).toBe('open');
    const seen: string[] = [];
    onGameEvent((e) => { if (e.type === 'discovery') seen.push(e.id); });
    expect(sendThrough(s, sp.id, 'rhy>f-ausblick').ok).toBe(true);
    run(s, SCOUT_HOP * 2 + 20);
    expect(s.frontier!.discovered).toContain('f-ausblick');
    expect(s.frontier!.signatures).not.toContain('rhy>f-ausblick');
    expect(s.frontier!.found!['f-ausblick']).toBeDefined();
    expect(seen).toContain('f-ausblick');
    expect(sp.at).toBe('f-ausblick');
    // von dort geht es weiter: Glutsee I ist jetzt suchbar
    expect(hiddenLinks(s, 'f-ausblick')).toEqual(['f-glut1']);
  });
});
