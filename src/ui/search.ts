// Suche und alphabetische Sortierung für lange Listen (Module, Baupläne, Produkte)
import { esc } from './dom';
import { icon } from './icons';

const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Trifft die Suche auf einen der Texte zu? Mehrere Wörter müssen alle vorkommen. */
export function matches(q: string, ...texts: (string | undefined)[]): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(texts.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

export const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name, 'de');

export function searchBox(scope: string, q: string, placeholder: string): string {
  return `<div class="searchbox" data-key="sb-${scope}">${icon('search', 17)}<input type="search" data-change="search" data-scope="${scope}" value="${esc(q)}" placeholder="${esc(placeholder)}" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(placeholder)}">${q ? `<button class="icon-btn sm plain" data-act="search-clear" data-scope="${scope}" aria-label="Suche leeren">${icon('close', 15)}</button>` : ''}</div>`;
}
