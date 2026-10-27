// Intro beim App-Start: Startschirm („Antippen zum Starten“ – erst die Berührung erlaubt dem Browser Ton), danach der
// Trailer im Vollbild. Beim allerersten Start läuft er ganz, später höchstens einmal am Tag beim echten Neustart und
// lässt sich überspringen; in den Einstellungen abschaltbar. Nur in der App-Version (eigene Adresse, nicht eingebettet):
// im Artifact und in der Einzeldatei gibt es kein Intro.
import { liveContext, settings } from '../audio/engine';
import { holdTitle, releaseTitle } from '../audio/music';

const KEY = 'x4-sektorbau-intro';
const OFF_KEY = 'x4-sektorbau-intro-aus';
/** Trailer liegt in public/intro (wird nicht ins Programm eingebettet; neue Fassung = neuer Name) */
export const TRAILER_URL = './intro/trailer-1.mp4';

interface Seen { n: number; day: string }

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function seen(): Seen {
  try { return { n: 0, day: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { n: 0, day: '' }; }
}

export function introEnabled(): boolean {
  try { return localStorage.getItem(OFF_KEY) !== '1'; } catch { return true; }
}

export function setIntroEnabled(on: boolean): void {
  try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* egal */ }
}

/** Läuft das Spiel als App-Version (eigene Adresse, nicht eingebettet)? Automatisierte Tests nur mit ?intro=1 */
export function introAvailable(): boolean {
  let top = false;
  try { top = window.top === window; } catch { top = false; }
  if (!top || !/^https?:$/.test(location.protocol)) return false;
  if (navigator.webdriver && !/[?&]intro=1/.test(location.search)) return false;
  return true;
}

/** Soll das Intro bei diesem Start laufen? Erster Start immer, danach einmal am Tag (wenn nicht abgeschaltet) */
export function introDue(): boolean {
  if (!introAvailable()) return false;
  const s = seen();
  if (s.n === 0) return true;
  return introEnabled() && s.day !== today();
}

/**
 * Startschirm und Trailer zeigen; done() wird aufgerufen, sobald das Intro vorbei ist (zu Ende, übersprungen oder
 * nicht ladbar). force: von Hand aus den Einstellungen (immer überspringbar, zählt nicht als Tagesintro).
 */
export function runIntro(done: () => void, force = false): void {
  const s = seen();
  const first = s.n === 0 && !force;
  const root = document.createElement('div');
  root.id = 'intro';
  root.className = 'intro';
  root.innerHTML = `
    <div class="intro-stars"></div>
    <div class="intro-start">
      <div class="intro-logo"><small>Familie Zhin</small><b>X4 <em>Sektorbau</em></b></div>
      <div class="intro-tap">Antippen zum Starten</div>
      <div class="intro-load"><i></i></div>
    </div>
    <video class="intro-video" playsinline preload="auto"></video>
    <button class="intro-skip" hidden>Überspringen ›</button>
    <div class="intro-fade"></div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  const video = root.querySelector<HTMLVideoElement>('video')!;
  const skip = root.querySelector<HTMLButtonElement>('.intro-skip')!;
  const bar = root.querySelector<HTMLElement>('.intro-load i')!;
  let finished = false;
  let src: string | null = null;

  holdTitle();
  const finish = () => {
    if (finished) return;
    finished = true;
    // Klangwelt wieder an, Titelmusik setzt ein
    void liveContext()?.resume();
    releaseTitle();
    if (!force) try { localStorage.setItem(KEY, JSON.stringify({ n: s.n + 1, day: today() })); } catch { /* egal */ }
    root.classList.add('out');
    video.pause();
    setTimeout(() => { root.remove(); if (src) URL.revokeObjectURL(src); }, 900);
    done();
  };

  // Trailer vollständig laden (einmal übers Netz, danach aus dem Zwischenspeicher der App – auch offline)
  const loaded: Promise<string | null> = (async () => {
    try {
      const res = await fetch(TRAILER_URL);
      if (!res.ok || !res.body) return null;
      const total = Number(res.headers.get('content-length')) || 24e6;
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        parts.push(value);
        got += value.length;
        bar.style.width = `${Math.min(100, (got / total) * 100)}%`;
      }
      root.classList.add('ready');
      src = URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'video/mp4' }));
      return src;
    } catch {
      return null;
    }
  })();

  let started = false;
  root.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).closest('.intro-skip')) { finish(); return; }
    if (started) return;
    started = true;
    root.classList.add('waiting');
    // Klangteppich und Geräusche schweigen, solange der Trailer läuft (er hat eigene Musik)
    setTimeout(() => void liveContext()?.suspend(), 0);
    // dauert das Laden lange, lässt sich auch beim ersten Mal überspringen
    setTimeout(() => { if (!root.classList.contains('playing')) skip.hidden = false; }, 6000);
    const url = await loaded;
    if (!url || finished) { finish(); return; }
    video.src = url;
    video.volume = settings.on ? Math.min(1, settings.master * 1.1) : 0;
    video.muted = !settings.on;
    try {
      await video.play();
    } catch {
      finish();
      return;
    }
    root.classList.remove('waiting');
    root.classList.add('playing');
    // ab dem zweiten Start (oder von Hand) überspringbar
    if (!first) setTimeout(() => { skip.hidden = false; }, 1200);
  });
  video.addEventListener('ended', finish);
  video.addEventListener('error', finish);
}
