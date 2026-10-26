import { describe, expect, it } from 'vitest';
import { applyBackup, collect, parseBackup, pruneIds } from '../src/ui/backup';

/** Speicher wie localStorage, nur im Arbeitsspeicher */
function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    all: () => Object.fromEntries(m),
  };
}

describe('Sicherungen', () => {
  it('sammelt alle Einträge des Spiels (Spielstand, Rekorde, Ausrüstung), aber nichts Fremdes', () => {
    const s = mem({ 'x4-sektorbau-save-v1': '{"a":1}', 'x4-sektorbau-mg2': '{"r":2}', 'x4-sektorbau-ausruestung': '{"ship":"cobra"}', 'anderes-spiel': 'x' });
    const b = collect(s, 'Tag 3', 1000);
    expect(Object.keys(b.keys).sort()).toEqual(['x4-sektorbau-ausruestung', 'x4-sektorbau-mg2', 'x4-sektorbau-save-v1']);
    expect(b.label).toBe('Tag 3');
    expect(b.created).toBe(1000);
  });

  it('Text hin und zurück; ein alter Spielstand allein ist keine Sicherung', () => {
    const b = collect(mem({ 'x4-sektorbau-save-v1': '{"a":1}' }), 'L');
    expect(parseBackup(JSON.stringify(b))?.keys['x4-sektorbau-save-v1']).toBe('{"a":1}');
    expect(parseBackup('{"version":1,"credits":5}')).toBeNull();
    expect(parseBackup('kein json')).toBeNull();
    // fremde Schlüssel in einer manipulierten Datei werden nicht übernommen
    const bad = JSON.stringify({ ...b, keys: { ...b.keys, 'fremd': 'x' } });
    expect(Object.keys(parseBackup(bad)!.keys)).toEqual(['x4-sektorbau-save-v1']);
  });

  it('Zurückschreiben ersetzt alle Spieleinträge und lässt Fremdes stehen', () => {
    const s = mem({ 'x4-sektorbau-save-v1': 'neu', 'x4-sektorbau-mods': 'neu', 'anderes-spiel': 'bleibt' });
    applyBackup(s, collect(mem({ 'x4-sektorbau-save-v1': 'alt' }), ''));
    expect(s.all()).toEqual({ 'x4-sektorbau-save-v1': 'alt', 'anderes-spiel': 'bleibt' });
  });

  it('Aufräumen: die zehn neuesten bleiben, dazu je Tag eine der letzten zwei Wochen', () => {
    const day = 86400e3, now = Date.UTC(2026, 9, 26, 12);
    // 30 Tage lang je drei Sicherungen am Tag
    const list = Array.from({ length: 90 }, (_, i) => ({ id: i, created: now - Math.floor(i / 3) * day - (i % 3) * 3600e3 }));
    const drop = new Set(pruneIds(list, now));
    const kept = list.filter((b) => !drop.has(b.id));
    for (const b of list.slice(0, 10)) expect(kept).toContainEqual(b);
    // ältere Tage: höchstens eine je Tag, und nichts älter als zwei Wochen außer den zehn neuesten
    const days = new Set(kept.map((b) => new Date(b.created).toDateString()));
    expect(kept.length).toBeLessThanOrEqual(10 + 15);
    expect(days.size).toBeGreaterThanOrEqual(14);
    expect(kept.every((b) => now - b.created <= 14 * day || list.slice(0, 10).includes(b))).toBe(true);
  });
});
