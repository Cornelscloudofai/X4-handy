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

  it('keine Torlinie schneidet durch einen fremden Sektor (Split-Raum und neuer Raum zusammen)', () => {
    const P = (id: string) => { const p = SPLIT_MAP_POS[id] ?? FRONTIER_MAP[id]; return { x: 1.5 * p.q, y: Math.sqrt(3) * (p.r + p.q / 2) }; };
    const ids = [...SECTORS.map((s) => s.id), ...FRONTIER.map((f) => f.id)];
    const links = new Set<string>();
    for (const s of SECTORS) for (const l of s.links) links.add([s.id, l].sort().join('|'));
    for (const f of FRONTIER) for (const l of f.links) links.add([f.id, l].sort().join('|'));
    for (const pair of links) {
      const [a, b] = pair.split('|');
      const A = P(a), B = P(b);
      for (const c of ids) {
        if (c === a || c === b) continue;
        const C = P(c);
        const t = Math.max(0, Math.min(1, ((C.x - A.x) * (B.x - A.x) + (C.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2)));
        const d = Math.hypot(A.x + (B.x - A.x) * t - C.x, A.y + (B.y - A.y) * t - C.y);
        expect(d, `${a}–${b} schneidet ${c}`).toBeGreaterThan(0.9);
      }
    }
  });
});
