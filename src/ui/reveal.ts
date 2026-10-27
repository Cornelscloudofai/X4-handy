// Erstsichtung: Ein neuer Sektor wird groß enthüllt – ein Sechseck zeichnet sich in Licht, füllt sich mit dem Schimmer
// des Gebiets (oder dem Bild des Sektors, sobald es eins gibt: src/assets/sektoren/<id>.jpg), dann erscheint der Name.
import { FRONTIER_MAP, REGIONS } from '../data/frontier';
import { esc } from './dom';
import { sfx } from './sound';

const FILES = import.meta.glob('../assets/sektoren/*.{jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const IMAGES: Record<string, string> = {};
for (const [path, url] of Object.entries(FILES)) IMAGES[path.replace(/^.*\//, '').replace(/\.\w+$/, '')] = url;

/** Bild eines neuen Sektors (Dateiname = Sektor-ID, z. B. f-glut1.jpg), falls vorhanden */
export function frontierImage(id: string): string | undefined {
  return IMAGES[id];
}

export function showReveal(id: string, day: string, onAkte: () => void): void {
  const f = FRONTIER_MAP[id];
  if (!f) return;
  document.getElementById('reveal')?.remove();
  const r = REGIONS[f.region];
  const img = frontierImage(id);
  const letters = [...f.name].map((ch, i) => `<i style="--d:${(1.9 + i * 0.06).toFixed(2)}s">${ch === ' ' ? '&nbsp;' : esc(ch)}</i>`).join('');
  const root = document.createElement('div');
  root.id = 'reveal';
  root.className = 'reveal';
  root.style.setProperty('--tint', r.tint);
  root.innerHTML = `
    <div class="rv-stars"></div>
    <div class="rv-hex ${img ? 'img' : ''}" ${img ? `style="--img:url(${img})"` : ''}>
      <svg viewBox="-110 -100 220 200" aria-hidden="true"><polygon class="rv-line" points="100,0 50,86.6 -50,86.6 -100,0 -50,-86.6 50,-86.6"/></svg>
      <div class="rv-fill"></div><div class="rv-flare"></div>
    </div>
    <div class="rv-text">
      <span class="rv-eyebrow">Erstsichtung · ${esc(r.name)}</span>
      <h1>${letters}</h1>
      <p>${esc(f.description)}</p>
      <q>${esc(f.log)}</q>
      <small>${esc(day)}</small>
      <div class="rv-actions"><button class="btn" data-rv="akte">Forschungsakte</button><button class="btn primary" data-rv="ok">Weiter</button></div>
    </div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  setTimeout(() => sfx.chapter(), 900);
  const close = () => { root.classList.add('out'); setTimeout(() => root.remove(), 500); };
  root.querySelector('[data-rv="ok"]')!.addEventListener('click', close);
  root.querySelector('[data-rv="akte"]')!.addEventListener('click', () => { close(); onAkte(); });
}
