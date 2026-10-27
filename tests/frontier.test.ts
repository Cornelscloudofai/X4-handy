import { describe, expect, it } from 'vitest';
import { FRONTIER, FRONTIER_MAP, REGIONS, SPLIT_MAP_POS } from '../src/data/frontier';
import { SECTORS, SECTOR_MAP } from '../src/data/sectors';

describe('Unbekannter Raum (Sektorenkarte)', () => {
  it('19 neue Sektoren in vier Gebieten, eindeutige IDs', () => {
    expect(FRONTIER.length).toBe(19);
    expect(new Set(FRONTIER.map((f) => f.id)).size).toBe(19);
    for (const r of Object.keys(REGIONS)) expect(FRONTIER.some((f) => f.region === r)).toBe(true);
  });

  it('jedes Tor führt zu einem bekannten Ziel und ist in beide Richtungen eingetragen (innerhalb des neuen Raums)', () => {
    for (const f of FRONTIER) for (const l of f.links) {
      expect(FRONTIER_MAP[l] || SECTOR_MAP[l], `${f.id} → ${l}`).toBeTruthy();
      if (FRONTIER_MAP[l]) expect(FRONTIER_MAP[l].links, `${l} → ${f.id}`).toContain(f.id);
    }
  });

  it('alles ist vom Split-Raum aus erreichbar', () => {
    const seen = new Set<string>(SECTORS.map((s) => s.id));
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of FRONTIER) if (!seen.has(f.id) && f.links.some((l) => seen.has(l))) { seen.add(f.id); grew = true; }
    }
    expect(FRONTIER.filter((f) => !seen.has(f.id)).map((f) => f.id)).toEqual([]);
  });

  it('keine zwei Sektoren an derselben Kartenstelle; der neue Raum liegt über dem Split-Raum', () => {
    const pos = [...SECTORS.map((s) => SPLIT_MAP_POS[s.id]), ...FRONTIER].map((p) => `${p.q},${p.r}`);
    expect(new Set(pos).size).toBe(pos.length);
    const y = (p: { q: number; r: number }) => p.r + p.q / 2;
    const splitTop = Math.min(...Object.values(SPLIT_MAP_POS).map(y));
    for (const f of FRONTIER) expect(y(f), f.id).toBeLessThanOrEqual(splitTop + 0.01);
  });
});
