// Nur eine Instanz des Spiels darf speichern: Jede geöffnete Seite trägt sich beim Start als „Schreiber“ ein. Öffnet
// man das Spiel ein zweites Mal (zweites Fenster, App neu gestartet, während die alte Seite eingefroren im Hintergrund
// liegt), übernimmt die neue. Die alte merkt das vor dem nächsten Speichern (Eintrag gehört nicht mehr ihr, dazu eine
// Nachricht über BroadcastChannel) und speichert nicht mehr – sonst schriebe sie beim Schließen ihren älteren Stand
// über den neueren.
// Der Eintrag liegt bewusst außerhalb von „x4-sektorbau…“, damit er nicht in Sicherungen landet.

export const WRITER_KEY = 'x4sb-writer';
const CHANNEL = 'x4sb-writer';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export class SaveGuard {
  readonly id: string;
  private lost = false;
  private chan: BroadcastChannel | null = null;
  private onLost: (() => void) | null = null;

  constructor(private storage: KV, id = Math.random().toString(36).slice(2) + Date.now().toString(36)) {
    this.id = id;
  }

  /** Beim Start: diese Seite speichert ab jetzt; andere offene Seiten werden benachrichtigt */
  claim(onLost?: () => void): void {
    this.onLost = onLost ?? null;
    try { this.storage.setItem(WRITER_KEY, this.id); } catch { /* ohne Speicher gibt es nichts zu schützen */ }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.chan = new BroadcastChannel(CHANNEL);
        this.chan.onmessage = (e: MessageEvent) => { if (e.data?.claim && e.data.claim !== this.id) this.lose(); };
        this.chan.postMessage({ claim: this.id });
      }
    } catch { /* kein BroadcastChannel: die Prüfung vor dem Speichern genügt */ }
  }

  /** Darf diese Seite (noch) speichern? Prüft den Eintrag im Speicher – eine eingefrorene Seite sieht so nach dem Aufwachen, dass eine neuere übernommen hat */
  mayWrite(): boolean {
    if (this.lost) return false;
    let owner: string | null = null;
    try { owner = this.storage.getItem(WRITER_KEY); } catch { return true; }
    // Eintrag fehlt (z. B. Speicher gelöscht): wieder übernehmen
    if (owner == null) { try { this.storage.setItem(WRITER_KEY, this.id); } catch { /* egal */ } return true; }
    if (owner !== this.id) { this.lose(); return false; }
    return true;
  }

  get superseded(): boolean { return this.lost; }

  private lose(): void {
    if (this.lost) return;
    this.lost = true;
    this.onLost?.();
  }
}
