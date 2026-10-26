// Als App installieren: Service Worker (offline spielbar) und Installations-Angebot des Browsers – nur, wenn das Spiel
// unter eigener Adresse läuft (https oder lokal, nicht eingebettet wie im Claude-Artifact und nicht als Einzeldatei).

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let promptEvt: InstallPrompt | null = null;
let active = false;

function ownPage(): boolean {
  let top = false;
  try { top = window.top === window; } catch { top = false; }
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return top && secure && 'serviceWorker' in navigator && import.meta.env.MODE !== 'einzeldatei';
}

export function initInstall(onChange: () => void): void {
  if (!ownPage()) return;
  active = true;
  void navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptEvt = e as InstallPrompt; onChange(); });
  window.addEventListener('appinstalled', () => { promptEvt = null; onChange(); });
}

/** Läuft schon als installierte App (eigenes Fenster ohne Browserleiste) */
export function isInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Was die Mehr-Seite anbieten kann: Installieren per Knopf (der Browser hat es angeboten), Anleitung fürs iPhone bzw.
 * für andere Browser (Chrome bietet es erst nach einer Weile an, Samsung Internet und Firefox nie per Knopf),
 * bereits installiert, nichts (eingebettet oder Einzeldatei)
 */
export function installState(): 'prompt' | 'ios' | 'samsung' | 'firefox' | 'manual' | 'installed' | 'none' {
  if (!active) return 'none';
  if (isInstalled()) return 'installed';
  if (promptEvt) return 'prompt';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox/.test(ua)) return 'firefox';
  return 'manual';
}

export async function installApp(): Promise<boolean> {
  const e = promptEvt;
  if (!e) return false;
  await e.prompt();
  const r = await e.userChoice;
  promptEvt = null;
  return r.outcome === 'accepted';
}
