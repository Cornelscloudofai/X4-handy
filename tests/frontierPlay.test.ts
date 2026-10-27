import { describe, expect, it } from 'vitest';
import { deserialize, newGame, serialize } from '../src/engine/state';
import { SECTORS, SECTOR_MAP, gatesOf, sectorPath } from '../src/data/sectors';
import { FRONTIER_SECTORS } from '../src/data/frontierSectors';
import { discover, hiddenLinks } from '../src/engine/explore';
import { buyLicense } from '../src/engine/actions';
import { step } from '../src/engine/sim';

describe('Neue Sektoren werden spielbar', () => {
  it('erst nach der Entdeckung: Sektordaten, Tore in beide Richtungen, Markt', () => {
    const s = newGame(4, 'mining');
    expect(SECTOR_MAP['f-ausblick']).toBeUndefined();
    expect(SECTOR_MAP.rhy.links).not.toContain('f-ausblick');
    discover(s, 'f-ausblick');
    expect(SECTOR_MAP['f-ausblick'].name).toBe("Rhy's Ausblick");
    expect(SECTOR_MAP.rhy.links).toContain('f-ausblick');
    expect(SECTOR_MAP['f-ausblick'].links).toEqual(['rhy']);
    expect(s.markets['f-ausblick']).toBeDefined();
    expect(sectorPath('zhin', 'f-ausblick')).toEqual(['zhin', 'rhy', 'f-ausblick']);
    expect(gatesOf('f-ausblick')).toHaveLength(1);
    // Weitersuchen geht weiter: das Tor nach Glutsee I ist noch unentdeckt
    expect(hiddenLinks(s, 'f-ausblick')).toEqual(['f-glut1']);
    discover(s, 'f-glut1');
    expect(SECTOR_MAP['f-ausblick'].links).toEqual(['rhy', 'f-glut1']);
    expect(gatesOf('f-glut1').map((g) => g.to)).toEqual(['f-ausblick']);
  });

  it('neues Spiel entfernt sie wieder, Laden stellt sie her (mit Schiff dort)', () => {
    const s = newGame(5, 'mining');
    for (const id of Object.keys(FRONTIER_SECTORS)) discover(s, id);
    expect(SECTORS.filter((x) => FRONTIER_SECTORS[x.id])).toHaveLength(5);
    expect(SECTOR_MAP['f-rhak'].links.sort()).toEqual(['f-asche', 'ravine']);
    s.ships[0].sector = 'f-asche';
    const text = serialize(s);
    newGame(6, 'mining');
    expect(SECTOR_MAP['f-asche']).toBeUndefined();
    expect(SECTOR_MAP.ravine.links).not.toContain('f-rhak');
    const t = deserialize(text);
    expect(t.ships[0].sector).toBe('f-asche');
    expect(SECTOR_MAP['f-asche'].fields.some((f) => f.ware === 'nividium')).toBe(true);
    expect(SECTOR_MAP.ravine.links).toContain('f-rhak');
    expect(t.rep.rhk).toBe(0);
    // läuft ohne Fehler weiter
    step(t, 3 * 3600);
  });

  it('Baulizenz ohne Nachbarlizenz, aber mit Ruf bei der Familie Rhak', () => {
    const s = newGame(7, 'mining');
    s.credits = 50e6;
    discover(s, 'f-ausblick');
    discover(s, 'f-glut1');
    s.rep.zya = 3;
    expect(buyLicense(s, 'f-ausblick').ok).toBe(true);
    expect(buyLicense(s, 'f-glut1').ok).toBe(false);
    s.rep.rhk = 2;
    expect(buyLicense(s, 'f-glut1').ok).toBe(true);
  });
});
