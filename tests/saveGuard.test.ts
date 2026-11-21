import { describe, expect, it } from 'vitest';
import { SaveGuard, WRITER_KEY } from '../src/ui/saveGuard';

const store = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('Nur eine Instanz speichert', () => {
  it('die zuletzt geöffnete Seite übernimmt, die ältere hört auf', () => {
    const s = store();
    const alt = new SaveGuard(s, 'alt');
    alt.claim();
    expect(alt.mayWrite()).toBe(true);
    let lost = 0;
    const alt2 = new SaveGuard(s, 'alt2');
    alt2.claim(() => lost++);
    const neu = new SaveGuard(s, 'neu');
    neu.claim();
    // die alte Seite wacht auf und will beim Schließen speichern
    expect(alt.mayWrite()).toBe(false);
    expect(alt.superseded).toBe(true);
    expect(alt2.mayWrite()).toBe(false);
    expect(lost).toBe(1);
    expect(neu.mayWrite()).toBe(true);
    expect(s.m.get(WRITER_KEY)).toBe('neu');
  });

  it('fehlt der Eintrag (Speicher gelöscht), speichert die Seite weiter und trägt sich wieder ein', () => {
    const s = store();
    const g = new SaveGuard(s, 'a');
    g.claim();
    s.m.clear();
    expect(g.mayWrite()).toBe(true);
    expect(s.m.get(WRITER_KEY)).toBe('a');
  });

  it('ohne nutzbaren Speicher wird nichts blockiert', () => {
    const g = new SaveGuard({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } }, 'a');
    g.claim();
    expect(g.mayWrite()).toBe(true);
  });
});
