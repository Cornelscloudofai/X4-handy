// Flugschule: ein Übungsflug je Steuerung, ohne Gegner und ohne Wertung. Fünf Stationen – Ringe durchfliegen,
// Zielbojen abschießen, seitwärts bzw. rückwärts durch ein Tor, Rakete und Spezialfähigkeit, zum Schluss ein Testflug
// auf Zeit. Ein Schatten-Daumen zeigt am Stick, was zu tun ist: zu Beginn jeder Station und wenn eine Weile nichts
// vorangeht; sobald man den Stick selbst bedient, blendet er aus. Am PC zeigt eine Tastenleiste die Belegung.
import type { ControlMode, LenkSetup } from './loadout';

export type SchoolCtrl = ControlMode | 'pc';
export const SCHOOL_CTRLS: SchoolCtrl[] = ['eins', 'zwei', 'lenk', 'pc'];
export const SCHOOL_NAME: Record<SchoolCtrl, string> = { eins: 'Ein Stick', zwei: 'Zwei Sticks', lenk: 'Lenkrad', pc: 'Tastatur und Maus' };
export const SCHOOL_SUB: Record<SchoolCtrl, string> = {
  eins: 'Stick zeigt die Richtung, Feuertaste rechts',
  zwei: 'Links fliegen, rechts zielen und feuern',
  lenk: 'Links fliegen, rechts Lenkachse mit Feuerlinie',
  pc: 'W/A/S/D fliegen, Maus zielt, Klick feuert',
};

// ---------- Bestzeiten ----------

const KEY = 'x4-sektorbau-flugschule';
interface SchoolSave { best: Partial<Record<SchoolCtrl, number>>; done: Partial<Record<SchoolCtrl, boolean>> }
function readSave(): SchoolSave {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<SchoolSave> | null;
    return { best: v?.best ?? {}, done: v?.done ?? {} };
  } catch {
    return { best: {}, done: {} };
  }
}
/** Bestzeit im Testflug (Sekunden) */
export const schoolBest = (c: SchoolCtrl): number | null => readSave().best[c] ?? null;
/** Lektion schon einmal ganz durchflogen? */
export const schoolDone = (c: SchoolCtrl): boolean => !!readSave().done[c];
/** Lektion abgeschlossen: Bestzeit merken; true = neue Bestzeit */
export function saveSchool(c: SchoolCtrl, t: number): boolean {
  const s = readSave(), old = s.best[c];
  const better = old == null || t < old;
  if (better) s.best[c] = Math.round(t * 10) / 10;
  s.done[c] = true;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)); } catch { /* Speicher nicht verfügbar */ }
  return better;
}
/** Zeit als 0:42,3 */
export const fmtTime = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0').replace('.', ',')}`;

// ---------- Anbindung an den Kampf ----------

export interface SchoolStick { ox: number; oy: number; kx: number; ky: number }
/** Was die Flugschule vom Kampf braucht (der Kampf reicht sich selbst mit passenden Gettern herein) */
export interface SchoolHost {
  readonly px: number; readonly py: number; readonly aimA: number; readonly pvx: number; readonly pvy: number;
  /** halbe Schiffslänge (Spielpunkte) */
  readonly shipR: number;
  readonly WW: number; readonly WH: number;
  readonly ctrl: ControlMode; readonly lenk: LenkSetup;
  readonly hasMissiles: boolean; readonly torpedo: boolean; readonly specialName: string;
  /** Zähler: Raketensalven, ausgelöste Spezialfähigkeiten */
  readonly missilesFired: number; readonly specialsUsed: number;
  readonly joy: SchoolStick | null; readonly aim: SchoolStick | null; readonly firing: boolean;
  /** Bildschirm (CSS-Pixel), Querformat, Knöpfe [x, y, r] */
  readonly w: number; readonly h: number; readonly top: number;
  readonly btnFire: [number, number, number]; readonly btnMissile: [number, number, number]; readonly btnDash: [number, number, number];
  readonly joyR: number; readonly aimR: number;
  /** Welt → Bildschirm */
  toScreen(x: number, y: number): [number, number];
  /** Zielboje aufstellen (steht still, schießt nicht); far: zäher, für Raketen */
  spawnBuoy(x: number, y: number, far?: boolean): object;
  alive(b: object): boolean;
  say(x: number, y: number, text: string, color: string): void;
  tick(): void;
  good(): void;
  /** Lektion fertig: Testflugzeit */
  complete(t: number): void;
}

type StationId = 'ringe' | 'bojen' | 'tor' | 'rakete' | 'test';
const STATIONS: { id: StationId; name: string }[] = [
  { id: 'ringe', name: 'Ringe' },
  { id: 'bojen', name: 'Zielbojen' },
  { id: 'tor', name: 'Tor' },
  { id: 'rakete', name: 'Rakete und Spezial' },
  { id: 'test', name: 'Testflug' },
];

interface Ring { x: number; y: number; r: number; done: boolean; n: number }
/** Tor: zwei Pfosten; mode: wie man durch muss (seitwärts, rückwärts, beliebig); side: Seite, auf der man zuletzt war */
interface Gate { x1: number; y1: number; x2: number; y2: number; mode: 'seit' | 'rueck' | 'any'; done: boolean; side: number }
/** Ein Ziel der Strecke: Ring, Tor oder Boje */
type Item = { ring: Ring } | { gate: Gate } | { buoy: object; x: number; y: number };

/** Ghost-Elemente: Stick links/rechts (Weg der Auslenkung über u = 0…1) oder Knopf antippen */
interface Ghost { at: 'L' | 'R' | 'fire' | 'missile' | 'dash'; path?: (u: number) => [number, number]; period?: number }

const RING_R = 70;

export class FlightSchool {
  st = 0;
  part = 0;
  /** Zeit in der Station, Zeit ohne Fortschritt, Pause nach geschaffter Station */
  private stT = 0;
  private idleT = 0;
  private wait = -1;
  private items: Item[] = [];
  private ghostA = 0;
  /** Testflug: Startzeit, Endzeit */
  private testT = -1;
  testTime = 0;
  private specials0 = 0;
  private finished = false;
  /** Hinweis bei falsch durchflogenem Tor (Restzeit) */
  private warnT = 0;
  private warnText = '';
  /** Zeit des Ganzen (für Animationen) */
  private t = 0;

  constructor(private host: SchoolHost, readonly ctrl: SchoolCtrl) {
    this.begin(0);
  }

  get stations(): number { return STATIONS.length; }
  get stationName(): string { return STATIONS[this.st]?.name ?? ''; }
  get done(): boolean { return this.finished; }

  /** Lage aus Sicht des Schiffs (lx quer, ly längs; ly negativ = voraus) → Welt */
  private local(lx: number, ly: number): [number, number] {
    const h = this.host, a = h.aimA + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const m = 260;
    return [Math.min(h.WW - m, Math.max(m, h.px + lx * c - ly * s)), Math.min(h.WH - m, Math.max(m, h.py + lx * s + ly * c))];
  }
  private ring(lx: number, ly: number, n: number): Item {
    const [x, y] = this.local(lx, ly);
    return { ring: { x, y, r: RING_R + this.host.shipR * 0.4, done: false, n } };
  }
  /** Tor quer zur Strecke: Mitte (lx, ly), Pfosten entlang (dx, dy) aus Sicht des Schiffs */
  private gate(lx: number, ly: number, dx: number, dy: number, mode: Gate['mode']): Item {
    const half = 80 + this.host.shipR * 0.4, l = Math.hypot(dx, dy) || 1;
    const [x1, y1] = this.local(lx - (dx / l) * half, ly - (dy / l) * half), [x2, y2] = this.local(lx + (dx / l) * half, ly + (dy / l) * half);
    const g: Gate = { x1, y1, x2, y2, mode, done: false, side: 0 };
    g.side = this.sideOf(g);
    return { gate: g };
  }
  private buoy(lx: number, ly: number, far = false): Item {
    const [x, y] = this.local(lx, ly);
    return { buoy: this.host.spawnBuoy(x, y, far), x, y };
  }
  private sideOf(g: Gate): number {
    const h = this.host;
    return Math.sign((g.x2 - g.x1) * (h.py - g.y1) - (g.y2 - g.y1) * (h.px - g.x1));
  }

  private begin(st: number): void {
    this.st = st;
    this.part = 0;
    this.stT = 0;
    this.idleT = 0;
    this.wait = -1;
    this.specials0 = this.host.specialsUsed;
    const id = STATIONS[st].id;
    if (id === 'ringe') this.items = [this.ring(0, -420, 1), this.ring(300, -820, 2), this.ring(-60, -1220, 3)];
    else if (id === 'bojen') this.items = [this.buoy(-170, -300), this.buoy(0, -390), this.buoy(170, -300)];
    else if (id === 'tor') this.items = [this.ctrl === 'eins' ? this.gate(0, 260, 1, 0, 'any') : this.gate(210, 0, 0, 1, 'seit')];
    else if (id === 'rakete') this.items = this.host.hasMissiles ? [this.buoy(0, -1050, true)] : [];
    else {
      // Testflug: Ringe und Bojen im Wechsel, zum Schluss ein Ring
      this.items = [this.ring(0, -450, 1), this.ring(360, -860, 2), this.buoy(140, -1240), this.buoy(420, -1300), this.ring(-120, -1620, 3), this.ring(-480, -1300, 4), this.ring(-420, -820, 5)];
      this.testT = -1;
    }
    if (id === 'rakete' && !this.host.hasMissiles) this.part = 1;
  }

  /** Station geschafft: kurze Pause, dann die nächste */
  private next(): void {
    const h = this.host;
    h.good();
    if (this.st + 1 >= STATIONS.length) {
      this.finished = true;
      h.complete(this.testTime);
      return;
    }
    h.say(h.px, h.py - 50, `${STATIONS[this.st].name}: geschafft`, '#6be38f');
    this.wait = 1.4;
    this.items = [];
  }

  update(dt: number): void {
    if (this.finished) return;
    const h = this.host;
    this.t += dt;
    this.warnT = Math.max(0, this.warnT - dt);
    if (this.wait >= 0) {
      this.wait -= dt;
      if (this.wait < 0) this.begin(this.st + 1);
      return;
    }
    this.stT += dt;
    this.idleT += dt;
    const id = STATIONS[this.st].id;
    // Testflug: Uhr läuft ab der ersten Bewegung
    if (id === 'test') {
      if (this.testT < 0 && Math.hypot(h.pvx, h.pvy) > 25) this.testT = this.t;
      if (this.testT >= 0) this.testTime = this.t - this.testT;
    }
    let progress = false;
    // Ringe der Reihe nach, Bojen in beliebiger Folge – im Testflug muss alles vor dem letzten Ring erledigt sein
    const open = this.items.filter((it) => !this.itemDone(it));
    for (const it of open) {
      if ('ring' in it) {
        const r = it.ring;
        if (open.find((q) => 'ring' in q) !== it) continue;
        if (id === 'test' && open.filter((q) => 'ring' in q).length === 1 && open.length > 1) continue;
        if (Math.hypot(h.px - r.x, h.py - r.y) < r.r) { r.done = true; progress = true; h.tick(); }
      } else if ('gate' in it) {
        const g = it.gate, side = this.sideOf(g);
        if (side && g.side && side !== g.side && this.between(g)) {
          if (this.passOk(g)) { g.done = true; progress = true; h.tick(); }
          else { this.warnT = 2.4; this.warnText = g.mode === 'seit' ? 'Zu viel Vorwärtsfahrt – seitwärts gleiten, Bug nach vorn lassen' : 'Rückwärts durch – nicht wenden, Bug bleibt vorn'; }
        }
        if (side) g.side = side;
      } else if (!h.alive(it.buoy)) progress = true;
    }
    if (progress) this.idleT = 0;
    // eigene Eingaben am gezeigten Stick zählen als „dran“: kein Schatten, solange man es selbst versucht
    if (this.copying()) this.idleT = Math.min(this.idleT, 1);
    const show = !this.copying() && (this.stT < 4.5 || this.idleT > 5);
    this.ghostA += ((show ? 1 : 0) - this.ghostA) * Math.min(1, dt * (show ? 3 : 6));
    // Station fertig?
    if (id === 'tor') {
      if (this.items.every((it) => this.itemDone(it))) {
        if (this.part === 0) {
          this.part = 1;
          this.stT = 0;
          this.items = [this.ctrl === 'eins' ? this.gate(-230, -120, 0.4, 1, 'any') : this.gate(0, 260, 1, 0, 'rueck')];
        } else this.next();
      }
    } else if (id === 'rakete') {
      if (this.part === 0 && this.items.every((it) => this.itemDone(it))) { this.part = 1; this.stT = 0; this.specials0 = h.specialsUsed; h.tick(); }
      else if (this.part === 1 && h.specialsUsed > this.specials0) this.next();
    } else if (this.items.every((it) => this.itemDone(it))) this.next();
  }

  private itemDone(it: Item): boolean {
    return 'ring' in it ? it.ring.done : 'gate' in it ? it.gate.done : !this.host.alive(it.buoy);
  }

  /** liegt der Jäger zwischen den Pfosten (mit etwas Spiel)? */
  private between(g: Gate): boolean {
    const h = this.host, dx = g.x2 - g.x1, dy = g.y2 - g.y1, l2 = dx * dx + dy * dy;
    const u = ((h.px - g.x1) * dx + (h.py - g.y1) * dy) / l2;
    return u > -0.05 && u < 1.05;
  }

  /** richtig durchflogen? seitwärts: Querfahrt größer als Vorwärtsfahrt; rückwärts: deutlich nach hinten */
  private passOk(g: Gate): boolean {
    if (g.mode === 'any') return true;
    const h = this.host, fx = Math.cos(h.aimA), fy = Math.sin(h.aimA);
    const along = h.pvx * fx + h.pvy * fy, across = Math.abs(-h.pvx * fy + h.pvy * fx), v = Math.hypot(h.pvx, h.pvy);
    if (g.mode === 'seit') return across > Math.abs(along) * 1.1;
    return along < -0.55 * v;
  }

  /** bedient der Spieler gerade den Stick bzw. Knopf, den der Schatten zeigt? */
  private copying(): boolean {
    const h = this.host;
    if (this.ctrl === 'pc') return false;
    const g = this.ghosts();
    if (!g.length) return true;
    return g.every((q) => (q.at === 'L' ? !!h.joy : q.at === 'R' ? !!h.aim : q.at === 'fire' ? h.firing : false));
  }

  /** Was der Schatten-Daumen gerade zeigt */
  private ghosts(): Ghost[] {
    const id = STATIONS[this.st]?.id, c = this.ctrl, { axis, flip } = this.host.lenk;
    const sw = (u: number) => Math.sin(u * Math.PI * 2);
    // Lenkachse: entlang der Achse lenken, quer dazu zur Feuerseite
    const steer = (u: number): [number, number] => (axis === 'h' ? [sw(u) * 0.6, 0] : [0, sw(u) * 0.6]);
    const fire = (u: number): [number, number] => axis === 'h' ? [sw(u) * 0.3, flip ? 0.75 : -0.75] : [flip ? -0.75 : 0.75, sw(u) * 0.3];
    if (c === 'pc') return [];
    switch (id) {
      case 'ringe':
        if (c === 'eins') return [{ at: 'L', path: (u) => [0.75 * sw(u * 0.5 + 0.25) * 0.6, -0.85], period: 3 }];
        return [{ at: 'L', path: () => [0, -0.85] }, c === 'zwei' ? { at: 'R', path: (u) => [sw(u) * 0.55, -0.55], period: 3 } : { at: 'R', path: steer, period: 3 }];
      case 'bojen':
        if (c === 'eins') return [{ at: 'L', path: (u) => [sw(u) * 0.3, -0.25], period: 3 }, { at: 'fire' }];
        return [c === 'zwei' ? { at: 'R', path: (u) => [sw(u) * 0.25, -1], period: 2.5 } : { at: 'R', path: fire, period: 2.5 }];
      case 'tor':
        if (c === 'eins') return [{ at: 'L', path: (u) => (u < 0.5 ? [0, 0.28] : [0, 0.85]), period: 2.4 }];
        return [{ at: 'L', path: () => (this.part === 0 ? [0.9, 0] : [0, 0.9]) }];
      case 'rakete':
        return [{ at: this.part === 0 ? 'missile' : 'dash' }];
      default:
        return this.stT < 3 ? [{ at: 'L', path: () => [0, -0.9] }] : [];
    }
  }

  /** Aufgabe der Station (Text oben) und Fortschritt */
  private task(): { title: string; text: string; count?: string } {
    const id = STATIONS[this.st].id, c = this.ctrl, h = this.host;
    const ringN = this.items.filter((it) => 'ring' in it).length, ringDone = this.items.filter((it) => 'ring' in it && it.ring.done).length;
    const buoyN = this.items.filter((it) => 'buoy' in it).length, buoyDone = this.items.filter((it) => 'buoy' in it && !h.alive(it.buoy)).length;
    const fireHow = c === 'eins' ? 'Feuertaste rechts halten' : c === 'zwei' ? 'rechten Stick über den Ring hinaus schieben' : c === 'lenk' ? 'rechts quer über die gestrichelte Feuerlinie schieben' : 'linke Maustaste halten';
    switch (id) {
      case 'ringe':
        return { title: 'Ringe', count: `${ringDone}/${ringN}`, text: c === 'eins' ? 'Durch die drei Ringe fliegen. Stick in die Richtung halten, in die du willst – weit ausgelenkt gibt Schub' : c === 'pc' ? 'Durch die drei Ringe fliegen. W gibt Schub, die Maus dreht den Jäger' : c === 'lenk' ? 'Durch die drei Ringe fliegen. Links nach oben: Schub. Rechts auf der Achse schieben: drehen' : 'Durch die drei Ringe fliegen. Links nach oben: Schub. Rechts in die Richtung zeigen, in die der Bug soll' };
      case 'bojen':
        return { title: 'Zielbojen', count: `${buoyDone}/${buoyN}`, text: `Die drei Bojen abschießen: ${fireHow}. Liegt das Ziel fast genau vorn, schwenken die Kanonen ein Stück mit` };
      case 'tor':
        if (c === 'eins') return { title: 'Wenden', count: `${this.part + 1}/2`, text: this.part === 0 ? 'Das Tor liegt hinter dir. Stick nur leicht nach unten ziehen (innerer Ring): der Jäger wendet auf der Stelle, dann durch' : 'Noch ein Tor, links von dir: eng drehen und durch' };
        return { title: this.part === 0 ? 'Seitwärts' : 'Rückwärts', count: `${this.part + 1}/2`, text: this.part === 0 ? `Seitwärts durchs Tor rechts von dir – ${c === 'pc' ? 'D halten' : 'linken Stick nach rechts'}, der Bug bleibt nach vorn. Seitwärts gibt es ein Viertel des Tempos` : `Rückwärts durchs Tor hinter dir – ${c === 'pc' ? 'S halten' : 'linken Stick nach unten'}, ohne zu wenden. Rückwärts gibt es ein Drittel des Tempos` };
      case 'rakete':
        if (this.part === 0) return { title: 'Rakete', count: `${buoyDone}/1`, text: `Die ferne Boje mit einer Rakete treffen: ${c === 'pc' ? 'R oder rechte Maustaste' : 'Knopf R'}. Die Rakete sucht ihr Ziel selbst – grob in die Richtung drehen genügt` };
        return { title: 'Spezialfähigkeit', text: `${h.specialName} auslösen: ${c === 'pc' ? 'Leertaste' : 'Knopf über R'}${h.torpedo ? ' – kurz tippen feuert aufs erfasste Ziel, halten und ziehen lenkt den Zielkreis' : ''}. Danach lädt sie eine Weile nach` };
      default:
        return { title: 'Testflug', count: this.testT < 0 ? undefined : fmtTime(this.testTime), text: `Alle Ringe der Reihe nach, unterwegs zwei Bojen abschießen – erst dann zählt der letzte Ring. Die Uhr läuft ab der ersten Bewegung${schoolBest(c) != null ? ` · Bestzeit ${fmtTime(schoolBest(c)!)}` : ''}` };
    }
  }

  // ---------- Zeichnen ----------

  /** Ringe, Tore und Leitlinie in der Welt (im Weltmaßstab, nach der Kamera) */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    const h = this.host, t = this.t;
    ctx.save();
    ctx.lineCap = 'round';
    const open = this.items.filter((it) => !this.itemDone(it));
    const nextRing = open.find((q) => 'ring' in q);
    for (const it of this.items) {
      if ('ring' in it) {
        const r = it.ring, cur = it === nextRing;
        if (r.done) continue;
        const col = cur ? '#3fe0c5' : '#7fd8ff';
        // weicher Schein, Ring aus Segmenten, die sich langsam drehen
        ctx.strokeStyle = `rgba(63,224,197,${cur ? 0.14 : 0.06})`;
        ctx.lineWidth = 18;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = col;
        ctx.globalAlpha = cur ? 0.95 : 0.4;
        ctx.lineWidth = cur ? 3.5 : 2;
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2 + t * (cur ? 0.6 : 0.2);
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r, a0, a0 + Math.PI / 5.5); ctx.stroke();
        }
        ctx.globalAlpha = cur ? 0.9 : 0.45;
        ctx.fillStyle = col;
        ctx.font = '700 22px "Chakra Petch", Barlow, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(r.n), r.x, r.y);
        ctx.globalAlpha = 1;
      } else if ('gate' in it) {
        const g = it.gate;
        if (g.done) continue;
        const pulse = 0.6 + 0.4 * Math.sin(t * 5);
        // Energievorhang zwischen den Pfosten, Pfeile zeigen die Durchflugrichtung
        ctx.strokeStyle = `rgba(255,181,71,${0.35 * pulse})`;
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([8, 7]);
        ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
        ctx.setLineDash([]);
        for (const [x, y] of [[g.x1, g.y1], [g.x2, g.y2]]) {
          ctx.fillStyle = '#1b2a33';
          ctx.strokeStyle = '#ffb547';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = `rgba(255,210,122,${pulse})`;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // Leitlinie vom Jäger zum nächsten Ziel (gestrichelt, wandert)
    const tgt = this.nextTarget();
    if (tgt) {
      const [tx, ty] = tgt, d = Math.hypot(tx - h.px, ty - h.py);
      if (d > 90) {
        const ux = (tx - h.px) / d, uy = (ty - h.py) / d, s0 = h.shipR + 26;
        ctx.strokeStyle = 'rgba(63,224,197,0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); ctx.moveTo(h.px + ux * s0, h.py + uy * s0); ctx.lineTo(tx - ux * 60, ty - uy * 60); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /** nächstes Ziel (für Leitlinie und Randpfeil) */
  private nextTarget(): [number, number] | null {
    const open = this.items.filter((it) => !this.itemDone(it));
    const id = STATIONS[this.st]?.id;
    // im Testflug erst die Bojen, wenn nur noch der letzte Ring offen ist
    const rings = open.filter((q) => 'ring' in q), buoys = open.filter((q) => 'buoy' in q);
    const it = id === 'test' && rings.length === 1 && buoys.length ? buoys[0] : open[0];
    if (!it) return null;
    if ('ring' in it) return [it.ring.x, it.ring.y];
    if ('gate' in it) return [(it.gate.x1 + it.gate.x2) / 2, (it.gate.y1 + it.gate.y2) / 2];
    return [it.x, it.y];
  }

  /** Aufgabe oben, Randpfeil zum Ziel, Schatten-Daumen bzw. Tastenleiste (Bildschirm) */
  drawHud(ctx: CanvasRenderingContext2D): void {
    if (this.finished) return;
    const h = this.host;
    ctx.save();
    // Aufgabe: links oben neben dem Radar
    const x = 10, y = h.top + 6, w = Math.min(h.w - 124, 460);
    const tk = this.task();
    ctx.font = '500 13px Barlow, sans-serif';
    const lines = wrap(ctx, this.wait >= 0 ? 'Gleich geht es weiter …' : tk.text, w - 20);
    const bh = 34 + lines.length * 17;
    ctx.fillStyle = 'rgba(6,16,22,0.78)';
    ctx.strokeStyle = 'rgba(63,224,197,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, bh, 10); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = '600 11px "Chakra Petch", Barlow, sans-serif';
    ctx.fillStyle = '#ffb547';
    ctx.fillText(`STATION ${this.st + 1}/${STATIONS.length} · ${(this.wait >= 0 ? STATIONS[this.st].name : tk.title).toUpperCase()}`, x + 10, y + 18);
    if (tk.count && this.wait < 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#3fe0c5';
      ctx.fillText(tk.count, x + w - 10, y + 18);
      ctx.textAlign = 'left';
    }
    // Stationspunkte
    for (let k = 0; k < STATIONS.length; k++) {
      ctx.fillStyle = k < this.st || (k === this.st && this.wait >= 0) ? '#6be38f' : k === this.st ? '#ffb547' : 'rgba(169,195,198,0.35)';
      ctx.beginPath(); ctx.arc(x + w - 70 - (STATIONS.length - 1 - k) * 11, y + 14, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = '500 13px Barlow, sans-serif';
    ctx.fillStyle = 'rgba(228,243,240,0.92)';
    lines.forEach((l, i) => ctx.fillText(l, x + 10, y + 38 + i * 17));
    // falsch durchs Tor
    if (this.warnT > 0) {
      ctx.globalAlpha = Math.min(1, this.warnT * 2);
      ctx.font = '600 14px Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff9aa4';
      ctx.fillText(this.warnText, h.w / 2, y + bh + 26);
      ctx.globalAlpha = 1;
    }
    // Randpfeil, wenn das Ziel außerhalb des Bilds liegt
    const tgt = this.nextTarget();
    if (tgt && this.wait < 0) {
      const [sx, sy] = h.toScreen(tgt[0], tgt[1]), m = 34;
      if (sx < m || sy < y + bh + 10 || sx > h.w - m || sy > h.h - m) {
        const cx = h.w / 2, cy = h.h / 2, a = Math.atan2(sy - cy, sx - cx);
        const k = Math.min(Math.abs((h.w / 2 - m) / (Math.cos(a) || 1e-6)), Math.abs((h.h / 2 - m - 30) / (Math.sin(a) || 1e-6)));
        const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(63,224,197,0.85)';
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    if (this.ctrl === 'pc') this.drawKeys(ctx);
    else if (this.ghostA > 0.01 && this.wait < 0) this.drawGhosts(ctx);
  }

  /** Schatten-Daumen: halbdurchsichtiger Daumen, der die Bewegung am Stick bzw. das Antippen eines Knopfs vormacht */
  private drawGhosts(ctx: CanvasRenderingContext2D): void {
    const h = this.host, A = this.ghostA;
    for (const g of this.ghosts()) {
      const per = g.period ?? 2;
      const u = (this.t % per) / per;
      ctx.save();
      ctx.globalAlpha = A;
      if (g.at === 'L' || g.at === 'R') {
        const right = g.at === 'R', R = right ? h.aimR : h.joyR;
        const st = right ? h.aim : h.joy;
        const ox = st?.ox ?? (right ? Math.min(h.w - h.aimR - 8, h.w * 0.74) : Math.max(h.joyR + 18, h.w * 0.24));
        const oy = st?.oy ?? h.h - (right ? 130 : 170);
        // Stickfeld
        ctx.strokeStyle = 'rgba(228,243,240,0.32)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 6]);
        if (right && this.ctrl === 'lenk') {
          const ax = h.lenk.axis === 'h';
          ctx.beginPath(); ctx.moveTo(ox - (ax ? R : 0), oy - (ax ? 0 : R)); ctx.lineTo(ox + (ax ? R : 0), oy + (ax ? 0 : R)); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
        // ein Stück Spur hinter dem Daumen
        const [kx, ky] = g.path!(u);
        for (let q = 4; q >= 1; q--) {
          const [qx, qy] = g.path!((u - q * 0.035 + 1) % 1);
          ctx.fillStyle = `rgba(228,243,240,${0.05 * (5 - q)})`;
          ctx.beginPath(); ctx.arc(ox + qx * R, oy + qy * R, 16, 0, Math.PI * 2); ctx.fill();
        }
        thumb(ctx, ox + kx * R, oy + ky * R, 1);
      } else {
        const [bx, by] = g.at === 'fire' ? h.btnFire : g.at === 'missile' ? h.btnMissile : h.btnDash;
        // Tippen: Daumen senkt sich, Ring breitet sich aus
        const press = u < 0.35 ? u / 0.35 : u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.3);
        if (u > 0.3 && u < 0.8) {
          const k = (u - 0.3) / 0.5;
          ctx.strokeStyle = `rgba(255,210,122,${0.8 * (1 - k)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(bx, by, 24 + k * 26, 0, Math.PI * 2); ctx.stroke();
        }
        thumb(ctx, bx + 10 - press * 8, by + 26 - press * 20, 0.85 + press * 0.15);
      }
      ctx.restore();
    }
  }

  /** PC: Tastenleiste unten in der Mitte – die gerade gebrauchten Tasten leuchten */
  private drawKeys(ctx: CanvasRenderingContext2D): void {
    const h = this.host, id = STATIONS[this.st]?.id;
    const on = new Set<string>(
      id === 'ringe' ? ['W', 'Maus'] : id === 'bojen' ? ['Klick'] : id === 'tor' ? [this.part === 0 ? 'D' : 'S'] : id === 'rakete' ? [this.part === 0 ? 'R' : 'Leer'] : ['W', 'A', 'S', 'D', 'Maus', 'Klick'],
    );
    const keys: [string, number, number, number][] = [['W', 1, 0, 1], ['A', 0, 1, 1], ['S', 1, 1, 1], ['D', 2, 1, 1], ['R', 4, 0, 1], ['Leer', 3.5, 1, 2], ['Maus', 6.2, 0, 1.6], ['Klick', 6.2, 1, 1.6]];
    const u = 34, g = 5, totalW = 8 * (u + g), x0 = h.w / 2 - totalW / 2, y0 = h.h - 2 * (u + g) - 22;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [k, cx, cy, wk] of keys) {
      const x = x0 + cx * (u + g), y = y0 + cy * (u + g), w = wk * u + (wk - 1) * g, lit = on.has(k);
      const pulse = lit ? 0.7 + 0.3 * Math.sin(this.t * 5) : 0;
      ctx.fillStyle = lit ? `rgba(255,181,71,${0.25 + 0.25 * pulse})` : 'rgba(6,16,22,0.7)';
      ctx.strokeStyle = lit ? '#ffb547' : 'rgba(169,195,198,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(x, y, w, u, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = lit ? '#fff3dc' : 'rgba(228,243,240,0.6)';
      ctx.font = `600 ${k.length > 2 ? 11 : 14}px "Chakra Petch", Barlow, sans-serif`;
      ctx.fillText(k === 'Maus' ? 'Maus' : k === 'Klick' ? 'Klick' : k, x + w / 2, y + u / 2 + 0.5);
    }
    ctx.restore();
  }
}

/** Daumen von oben: weiche, ovale Kuppe mit Nagel (halbdurchsichtig, wie ein Schatten) */
function thumb(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.scale(s, s);
  const g = ctx.createRadialGradient(0, -2, 2, 0, 4, 26);
  g.addColorStop(0, 'rgba(240,248,246,0.55)');
  g.addColorStop(0.7, 'rgba(200,220,220,0.32)');
  g.addColorStop(1, 'rgba(200,220,220,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 6, 19, 27, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(240,248,246,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(0, 6, 15, 22, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  // Nagel
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.ellipse(0, -7, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Text auf Breite umbrechen */
function wrap(ctx: CanvasRenderingContext2D, text: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
