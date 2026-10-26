// Feedback von Testern: Fehler, Ideen und Gedanken direkt aus dem Spiel. Gesendet wird an Netlify Forms (Formular
// „feedback“, siehe public/__forms.html) – mit Bildschirmfoto, auf Wunsch dem Spielstand und Angaben zu Version,
// Gerät und Ort im Spiel. Eigene Ebene über allem (auch über einem laufenden Minispiel).
import { esc } from './dom';
import { icon } from './icons';

declare const __APP_VERSION__: string;

/** Adresse der App-Version (dort nimmt Netlify das Formular an) */
export const FEEDBACK_SITE = 'https://x4-sektorbau.netlify.app';

type Kind = 'Fehler' | 'Idee' | 'Gedanke';

export interface FeedbackOpts {
  /** wo im Spiel (z. B. „Sektorkarte“ oder „Kampf · Xenon · Welle 3“) */
  context: string;
  /** Leinwand fürs Bildschirmfoto (wird beim Öffnen festgehalten) */
  canvas?: HTMLCanvasElement | null;
  /** Kurzbeschreibung des Spielstands (Tag, Credits, Kapitel) */
  summary?: string;
  /** vollständige Sicherung als Text (nur angehängt, wenn der Tester es möchte) */
  save?: () => string;
}

/** Senden geht dort, wo das Formular wohnt (App-Version) – lokal für die Tests ebenso */
function canSend(): boolean {
  let top = false;
  try { top = window.top === window; } catch { top = false; }
  const h = location.hostname;
  return top && /^https?:$/.test(location.protocol) && (h.endsWith('.netlify.app') || h === 'localhost' || h === '127.0.0.1');
}

function version(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unbekannt';
}

function device(): string {
  return `${navigator.userAgent} · ${innerWidth}×${innerHeight} @${(devicePixelRatio || 1).toFixed(2)}`;
}

const DRAFT = 'x4-sektorbau-feedback-entwurf';

export function openFeedback(o: FeedbackOpts): void {
  document.getElementById('feedback')?.remove();
  // Bildschirmfoto sofort festhalten (bevor die Ebene es verdeckt) – in voller Auflösung
  let shot: Promise<Blob | null> = Promise.resolve(null);
  try {
    if (o.canvas) shot = new Promise((ok) => o.canvas!.toBlob((b) => ok(b), 'image/jpeg', 0.92));
  } catch {
    shot = Promise.resolve(null);
  }
  let kind: Kind = 'Fehler';
  let draft = '';
  try { draft = localStorage.getItem(DRAFT) ?? ''; } catch { /* egal */ }
  const send = canSend();
  const root = document.createElement('div');
  root.id = 'feedback';
  root.className = 'fb-layer';
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Feedback">
    <div class="sheet-head"><h1><span class="eyebrow">Test</span>Feedback geben</h1><button class="icon-btn" data-fb="close" aria-label="Schließen">${icon('close', 22)}</button></div>
    <div class="sheet-body">
      <p class="lead">Ein Fehler, eine Idee oder einfach ein Gedanke – alles hilft, das Spiel besser zu machen.</p>
      <div class="segment fb-kind">${(['Fehler', 'Idee', 'Gedanke'] as Kind[]).map((k) => `<button data-fb-kind="${k}" class="${k === kind ? 'on' : ''}">${k}</button>`).join('')}</div>
      <textarea class="fb-text" id="fbText" placeholder="Was ist passiert? Was hast du dir gewünscht? Je genauer, desto besser.">${esc(draft)}</textarea>
      <input class="input fb-name" id="fbName" placeholder="Dein Name oder Kürzel (freiwillig)" maxlength="60">
      <label class="fb-check"><input type="checkbox" id="fbShot" ${o.canvas ? 'checked' : 'disabled'}><span>Bildschirmfoto anhängen</span></label>
      <label class="fb-check"><input type="checkbox" id="fbSave"><span>Spielstand anhängen <small>(hilft, Fehler nachzustellen)</small></span></label>
      <p class="small muted fb-meta">Mitgeschickt werden außerdem: Spielversion ${esc(version())}, Gerät und Bildschirm, Ort im Spiel (${esc(o.context)})${o.summary ? `, ${esc(o.summary)}` : ''}.</p>
      ${send ? '' : `<p class="small fb-warn">${icon('info', 16)} Senden geht nur in der App-Version (<b>${esc(FEEDBACK_SITE.replace('https://', ''))}</b>). Hier kannst du den Text kopieren und selbst weitergeben.</p>`}
      <p class="small fb-status" id="fbStatus" aria-live="polite"></p>
    </div>
    <div class="modal-foot"><button class="btn" data-fb="close">Abbrechen</button><button class="btn primary" data-fb="${send ? 'send' : 'copy'}">${send ? 'Senden' : 'Text kopieren'}</button></div>
  </div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const status = (t: string, cls = '') => { const s = $('fbStatus'); s.textContent = t; s.className = `small fb-status ${cls}`; };
  const text = $<HTMLTextAreaElement>('fbText');
  text.addEventListener('input', () => { try { localStorage.setItem(DRAFT, text.value); } catch { /* egal */ } });
  const report = (): string => [`Art: ${kind}`, `Text: ${text.value.trim()}`, `Name: ${$<HTMLInputElement>('fbName').value.trim() || '–'}`, `Version: ${version()}`, `Ort: ${o.context}`, o.summary ? `Spielstand: ${o.summary}` : '', `Gerät: ${device()}`].filter(Boolean).join('\n');
  const close = () => root.remove();
  root.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    if (el === root) { close(); return; }
    const k = el.closest<HTMLElement>('[data-fb-kind]');
    if (k) {
      kind = k.dataset.fbKind as Kind;
      for (const b of root.querySelectorAll('[data-fb-kind]')) b.classList.toggle('on', b === k);
      // Bildschirmfoto bei Fehlern sinnvoll, bei Ideen meist nicht nötig
      const cb = $<HTMLInputElement>('fbShot');
      if (!cb.disabled) cb.checked = kind === 'Fehler';
      return;
    }
    const b = el.closest<HTMLElement>('[data-fb]');
    if (!b) return;
    const what = b.dataset.fb;
    if (what === 'close') { close(); return; }
    if (text.value.trim().length < 3) { status('Bitte schreib kurz, worum es geht.', 'neg'); text.focus(); return; }
    if (what === 'copy') {
      const t = report();
      try { await navigator.clipboard.writeText(t); status('In die Zwischenablage kopiert.', 'good'); } catch { text.value = t; text.select(); status('Text markiert – jetzt kopieren.'); }
      return;
    }
    // Senden (Netlify Forms nimmt multipart an; ohne eigenen Content-Type, damit die Grenze stimmt)
    b.setAttribute('disabled', '');
    status('Wird gesendet …');
    const fd = new FormData();
    fd.append('form-name', 'feedback');
    fd.append('art', kind);
    fd.append('text', text.value.trim());
    fd.append('name', $<HTMLInputElement>('fbName').value.trim());
    fd.append('version', version());
    fd.append('ort', o.context);
    fd.append('spielstand', o.summary ?? '');
    fd.append('geraet', device());
    if ($<HTMLInputElement>('fbShot').checked) { const img = await shot; if (img) fd.append('bild', img, `bildschirm-${Date.now()}.jpg`); }
    if ($<HTMLInputElement>('fbSave').checked && o.save) fd.append('sicherung', new Blob([o.save()], { type: 'application/json' }), `x4-sektorbau-sicherung-${Date.now()}.json`);
    try {
      const res = await fetch('/', { method: 'POST', body: fd });
      if (!res.ok && res.status !== 303 && res.status !== 302) throw new Error(String(res.status));
      try { localStorage.removeItem(DRAFT); } catch { /* egal */ }
      status('Danke! Dein Feedback ist angekommen.', 'good');
      root.querySelector('.modal-foot')!.innerHTML = '<button class="btn primary" data-fb="close">Schließen</button>';
    } catch {
      b.removeAttribute('disabled');
      status('Senden hat nicht geklappt – keine Verbindung? Dein Text bleibt erhalten, versuch es gleich noch einmal.', 'neg');
    }
  });
  setTimeout(() => text.focus(), 60);
}
