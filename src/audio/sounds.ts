// Klangbibliothek: jeder Klang aus Oszillatoren, FM-Glocken und gefiltertem Rauschen gebaut, mit Hall, Panorama
// und leichter Zufallsvariation, damit sich Wiederholungen nicht abnutzen.
import { bell, duckFor, ensureSamples, gate, graph, noise, norm, sample, shaper, tone, variant, vary, voiceOut, withVariant, type Bus } from './engine';

import { LOOPS } from './ambience';

type G = NonNullable<ReturnType<typeof graph>>;

/** Rahmen für einen Klang: Graph holen, Ausgang anlegen, Startzeit */
function play(bus: Bus, opts: { pan?: number; verb?: number; gain?: number }, fn: (g: G, out: GainNode, t: number) => void): void {
  const g = graph();
  if (!g) return;
  const out = voiceOut(g, bus, opts);
  fn(g, out, g.ctx.currentTime + 0.004);
}

// Tonvorrat: D-Dorisch (passt zur ruhigen Weltraum-Stimmung), als Frequenzen
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const PENTA = [62, 64, 69, 71, 74, 76, 81, 83, 86]; // D E A H D E A H D
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---------- Oberfläche ----------

/** Weicher Klick: kurzes Rauschen im Präsenzbereich plus feiner Ton */
function tap(): void {
  if (!gate('tap', 35)) return;
  play('ui', { gain: 3 }, (g, o, t) => {
    noise(g, o, { t, type: 'bandpass', f: vary(3400, 0.08), q: 1.6, a: 0.001, d: 0.018, gain: 0.32 });
    tone(g, o, { f: vary(1900, 0.03), to: 1500, t, a: 0.002, d: 0.035, gain: 0.07 });
  });
}

/** Öffnen: kurzer Luftzug nach oben und ein heller Zweiklang */
function open(): void {
  if (!gate('open', 80)) return;
  play('ui', { verb: 0.12, gain: 2 }, (g, o, t) => {
    noise(g, o, { t, type: 'bandpass', f: 700, to: 2600, q: 0.9, a: 0.05, d: 0.14, gain: 0.12, glide: 0.18 });
    tone(g, o, { f: hz(74), t: t + 0.02, a: 0.01, d: 0.18, gain: 0.05, type: 'triangle' });
    tone(g, o, { f: hz(81), t: t + 0.06, a: 0.01, d: 0.2, gain: 0.04, type: 'sine' });
  });
}

/** Schließen: Luftzug nach unten */
function close(): void {
  if (!gate('close', 80)) return;
  play('ui', { verb: 0.08, gain: 2.5 }, (g, o, t) => {
    noise(g, o, { t, type: 'bandpass', f: 2400, to: 700, q: 0.9, a: 0.02, d: 0.14, gain: 0.1, glide: 0.15 });
    tone(g, o, { f: hz(81), to: hz(74), t, a: 0.005, d: 0.12, gain: 0.035, type: 'triangle', glide: 0.08 });
  });
}

/** Schalter: Klick mit kleinem Ton nach oben (an) oder unten (aus) */
function toggle(on: boolean): void {
  play('ui', { gain: 2 }, (g, o, t) => {
    noise(g, o, { t, type: 'highpass', f: 2500, a: 0.001, d: 0.012, gain: 0.25 });
    tone(g, o, { f: on ? hz(76) : hz(81), to: on ? hz(81) : hz(76), t, a: 0.004, d: 0.08, gain: 0.05, type: 'triangle', glide: 0.05 });
  });
}

/** Ablehnung: zwei gedämpfte, tiefe Stöße */
function deny(): void {
  if (!gate('deny', 300)) return;
  play('ui', {}, (g, o, t) => {
    const lp = g.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(o);
    tone(g, lp, { f: 196, t, a: 0.004, d: 0.08, gain: 0.12, type: 'square' });
    tone(g, lp, { f: 165, t: t + 0.1, a: 0.004, d: 0.12, gain: 0.12, type: 'square' });
  });
}

/** Feiner Rasterklick (Schieberegler, Umsortieren) */
function tick(): void {
  if (!gate('tick', 25)) return;
  play('ui', { gain: 2 }, (g, o, t) => noise(g, o, { t, type: 'bandpass', f: vary(5200, 0.1), q: 3, a: 0.001, d: 0.008, gain: 0.25 }));
}

// ---------- Wirtschaft und Kampagne ----------

/** Credits: gläserne Glocke aus dem Tonvorrat; größere Beträge klingen voller (zweiter Ton, Glitzern) */
function coin(value = 0): void {
  if (!gate('coin', 140)) return;
  const big = value >= 20000, huge = value >= 200000;
  play('sfx', { verb: 0.28, pan: (Math.random() - 0.5) * 0.4, gain: 2 }, (g, o, t) => {
    const n = pick(PENTA.slice(3));
    bell(g, o, { f: hz(n + 12), t, ratio: 3.51, index: 1.6, dur: 0.5, gain: 0.07 });
    if (big) bell(g, o, { f: hz(n + 19), t: t + 0.06, ratio: 3.51, index: 1.2, dur: 0.6, gain: 0.05 });
    if (huge) {
      bell(g, o, { f: hz(n + 24), t: t + 0.12, ratio: 2.0, index: 1, dur: 0.9, gain: 0.04 });
      noise(g, o, { t: t + 0.05, type: 'highpass', f: 7000, a: 0.02, d: 0.4, gain: 0.05 });
    }
  });
}

/** Bau beginnt: dumpfer Schlag, metallisches Klirren, Druckluft */
function build(): void {
  if (!gate('build', 250)) return;
  play('sfx', { verb: 0.22, gain: 1.6 }, (g, o, t) => {
    tone(g, o, { f: 130, to: 48, t, a: 0.003, d: 0.18, gain: 0.32, glide: 0.14 });
    bell(g, o, { f: vary(310, 0.04), t: t + 0.01, ratio: 1.414, index: 5, dur: 0.35, gain: 0.07 });
    bell(g, o, { f: vary(470, 0.04), t: t + 0.09, ratio: 1.414, index: 4, dur: 0.25, gain: 0.04 });
    noise(g, o, { t: t + 0.12, type: 'highpass', f: 3000, to: 1200, a: 0.01, d: 0.28, gain: 0.07 });
  });
}

/** Bau fertig: warmer Akkord, der sich öffnet, darüber eine Glocke */
function buildDone(): void {
  if (!gate('buildDone', 600)) return;
  duckFor(1.2, 0.6);
  play('sfx', { verb: 0.4 }, (g, o, t) => {
    const lp = g.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(2800, t + 0.35);
    lp.frequency.exponentialRampToValueAtTime(900, t + 1.4);
    lp.connect(o);
    for (const [i, n] of [50, 57, 62, 64, 69].entries()) {
      tone(g, lp, { f: hz(n), t: t + i * 0.015, type: 'sawtooth', a: 0.04, d: 0.5, sus: 0.4, hold: 0.2, r: 0.8, gain: 0.035, detune: (i % 2 ? 7 : -7) });
    }
    bell(g, o, { f: hz(86), t: t + 0.12, ratio: 3.5, index: 1.4, dur: 1.1, gain: 0.05 });
  });
}

/** Auftrag erledigt: aufsteigendes Glockenarpeggio über einem Flächenklang */
function success(): void {
  if (!gate('success', 800)) return;
  duckFor(1.6, 0.5);
  play('sfx', { verb: 0.45 }, (g, o, t) => {
    [62, 69, 74, 78, 81].forEach((n, i) => bell(g, o, { f: hz(n + 12), t: t + i * 0.085, ratio: 3.5, index: 1.3, dur: 0.9, gain: 0.06 - i * 0.004 }));
    for (const n of [50, 57, 66]) tone(g, o, { f: hz(n), t, type: 'triangle', a: 0.15, d: 0.6, sus: 0.5, hold: 0.3, r: 1, gain: 0.05 });
  });
}

/** Neues Kapitel: tiefer Schlag, anschwellender Akkord, schimmerndes Arpeggio */
function chapter(): void {
  if (!gate('chapter', 2000)) return;
  duckFor(3, 0.35);
  play('sfx', { verb: 0.55 }, (g, o, t) => {
    tone(g, o, { f: 70, to: 36, t, a: 0.004, d: 0.6, gain: 0.35, glide: 0.5 });
    noise(g, o, { t, type: 'lowpass', f: 1800, to: 120, a: 0.004, d: 0.9, gain: 0.12 });
    const lp = g.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(300, t + 0.1);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 1.2);
    lp.connect(o);
    for (const [i, n] of [38, 50, 57, 62, 66, 69].entries()) tone(g, lp, { f: hz(n), t: t + 0.08, type: 'sawtooth', a: 0.7, d: 0.6, sus: 0.6, hold: 0.4, r: 1.4, gain: 0.03, detune: i % 2 ? 9 : -9 });
    [74, 78, 81, 86, 90, 93].forEach((n, i) => bell(g, o, { f: hz(n), t: t + 0.6 + i * 0.09, ratio: 3.5, index: 1, dur: 1, gain: 0.035 }));
  });
}

/** Warnung: weicher Zweiklang abwärts, nicht schrill */
function warn(): void {
  if (!gate('warn', 1200)) return;
  play('sfx', { verb: 0.2 }, (g, o, t) => {
    const lp = g.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    lp.connect(o);
    tone(g, lp, { f: hz(76), t, type: 'triangle', a: 0.01, d: 0.13, sus: 0.3, r: 0.06, gain: 0.11 });
    tone(g, lp, { f: hz(72), t: t + 0.16, type: 'triangle', a: 0.01, d: 0.2, sus: 0.3, r: 0.1, gain: 0.1 });
    tone(g, lp, { f: hz(76) * 2, t, type: 'sine', a: 0.01, d: 0.1, gain: 0.02 });
  });
}

/** Nachricht: Sonar-Ping mit langem Nachhall */
function ping(): void {
  if (!gate('ping', 900)) return;
  play('ui', { verb: 0.5, gain: 2 }, (g, o, t) => {
    tone(g, o, { f: hz(86), t, a: 0.004, d: 0.5, gain: 0.05 });
    tone(g, o, { f: hz(93), t: t + 0.07, a: 0.004, d: 0.4, gain: 0.025 });
  });
}

/** Schiff gekauft / startet: Triebwerk läuft hoch und zieht davon */
function launch(): void {
  if (!gate('launch', 600)) return;
  play('sfx', { verb: 0.1 }, (g, o, t) => {
    if (sample(g, o, 'es-start', { t, gain: 0.42, dur: 2.2 })) return;
    const ws = shaper(g, 2);
    ws.connect(o);
    tone(g, ws, { f: 55, to: 140, t, type: 'sawtooth', a: 0.3, d: 0.6, sus: 0.3, r: 0.4, gain: 0.08, glide: 0.9 });
    noise(g, o, { t, type: 'bandpass', f: 250, to: 2200, q: 0.8, a: 0.4, d: 0.5, r: 0.5, gain: 0.16, glide: 1 });
  });
}

/** Andocken: zwei Klammern rasten ein */
function dock(): void {
  if (!gate('dock', 400)) return;
  play('sfx', { verb: 0.08 }, (g, o, t) => {
    if (sample(g, o, 'es-landung', { t, gain: 0.4, dur: 1.6 })) return;
    for (const dt of [0, 0.13]) {
      tone(g, o, { f: 160, to: 70, t: t + dt, a: 0.002, d: 0.08, gain: 0.2 });
      bell(g, o, { f: vary(620), t: t + dt, ratio: 1.73, index: 3, dur: 0.12, gain: 0.05 });
    }
    noise(g, o, { t: t + 0.2, type: 'highpass', f: 4000, a: 0.005, d: 0.25, gain: 0.04 });
  });
}

/** Auftrag angenommen: Stempel – kurzer Schlag mit Papier-Rascheln */
function accept(): void {
  play('ui', { verb: 0.1, gain: 2 }, (g, o, t) => {
    tone(g, o, { f: 220, to: 110, t, a: 0.002, d: 0.06, gain: 0.18 });
    noise(g, o, { t, type: 'bandpass', f: 1800, q: 0.7, a: 0.002, d: 0.05, gain: 0.12 });
    bell(g, o, { f: hz(81), t: t + 0.05, ratio: 3.5, index: 1, dur: 0.3, gain: 0.04 });
  });
}

// ---------- Minispiele: Kampf ----------

type Gun = 'puls' | 'bolzen' | 'schrot' | 'plasma' | 'neutron' | 'tau' | 'thermal' | 'boson' | 'strahl' | string;

/** Filter vor einem Ausgang (für Aufnahmen und Synthese gemeinsam) */
function filt(g: G, dest: AudioNode, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = g.ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  b.connect(dest);
  return b;
}

/** Bassschlag unter einem Schuss: gibt Wucht und Tiefe (Sinus, der nach unten gleitet, unter 260 Hz) */
function weight(g: G, o: AudioNode, t: number, gain: number, f = 90, len = 0.14): void {
  if (gain <= 0) return;
  const lp = filt(g, o, 'lowpass', 260);
  tone(g, lp, { f: vary(f * 1.4, 0.06), to: f * 0.55, t, a: 0.002, d: len, gain, glide: len * 0.7 });
}

/**
 * Klangfarbe für Waffen: Bässe angehoben, die schrillen Höhen (ab ~5 kHz) gedämpft – gegen blechern und quietschig.
 * far (0 … 1): weiter weg = dumpfer
 */
function weaponEq(g: G, dest: AudioNode, bass = 5, far = 0): AudioNode {
  const hs = g.ctx.createBiquadFilter();
  hs.type = 'highshelf'; hs.frequency.value = 5200 - 2400 * far; hs.gain.value = -5 - 7 * far;
  const ls = g.ctx.createBiquadFilter();
  ls.type = 'lowshelf'; ls.frequency.value = 140; ls.gain.value = bass;
  ls.connect(hs).connect(dest);
  return ls;
}

/**
 * Waffen: Varianten (zufällig, nie zweimal dieselbe), Abspielrate < 1 = tiefer (je Schuss ±6 % gestreut), Pegel, Bassschlag
 * (Stärke, Grundton, Länge), Länge des Ausklangs (s)
 */
const GUNS: Record<string, { s: string[]; rate: number; gain: number; w: number; f: number; len: number; dur: number }> = {
  puls: { s: ['sn-puls-a', 'sn-puls-b', 'sn-puls-c'], rate: 0.9, gain: 0.42, w: 0.2, f: 75, len: 0.16, dur: 0.8 },
  bolzen: { s: ['sn-bolzen-a', 'sn-bolzen-b', 'sn-bolzen-c'], rate: 0.88, gain: 0.45, w: 0.22, f: 65, len: 0.15, dur: 0.7 },
  schrot: { s: ['sn-schrot-a', 'sn-schrot-b'], rate: 0.88, gain: 0.5, w: 0.26, f: 55, len: 0.2, dur: 1 },
  plasma: { s: ['sn-plasma-a', 'sn-plasma-b'], rate: 0.86, gain: 0.5, w: 0.22, f: 50, len: 0.26, dur: 1.2 },
  neutron: { s: ['sn-neutron-a', 'sn-neutron-b'], rate: 0.92, gain: 0.4, w: 0.16, f: 70, len: 0.12, dur: 0.6 },
  tau: { s: ['sn-tau-a', 'sn-tau-b'], rate: 0.9, gain: 0.48, w: 0.2, f: 55, len: 0.24, dur: 1.3 },
  thermal: { s: ['sn-thermal-a', 'sn-thermal-b'], rate: 0.9, gain: 0.45, w: 0.2, f: 60, len: 0.2, dur: 1 },
  boson: { s: ['sn-boson-a', 'sn-boson-b'], rate: 0.86, gain: 0.8, w: 0.28, f: 45, len: 0.3, dur: 1.8 },
  // schwere Plasmawaffen der L-Hauptbatterie: noch tiefer
  schnellplasma: { s: ['sn-schwer-a', 'sn-schwer-b'], rate: 0.82, gain: 0.55, w: 0.26, f: 45, len: 0.28, dur: 1.2 },
  plasmasalve: { s: ['sn-schwer-b', 'sn-schwer-a'], rate: 0.76, gain: 0.58, w: 0.28, f: 42, len: 0.3, dur: 1.1 },
};

/** Ein Schuss: Aufnahme (Variante, Rate gestreut) durch die Waffen-Klangfarbe, darunter der Bassschlag */
function fire(g: G, o: AudioNode, t: number, d: (typeof GUNS)[string], k: { rate: number; gain: number; w: number; far: number; dur: number }): boolean {
  const name = variant(d.s[0], d.s);
  const eq = weaponEq(g, o, 5 - 3 * k.far, k.far);
  if (!sample(g, eq, name, { t, rate: vary(d.rate * k.rate, 0.06), gain: d.gain * k.gain * norm(name), dur: d.dur * k.dur })) return false;
  weight(g, o, t, d.w * k.w, d.f, d.len);
  return true;
}

/**
 * Eigener Schuss: Aufnahme aus den Sonniss-Paketen in zwei, drei Varianten, tiefer gestimmt, Höhen gedämpft, mit Bassschlag
 * und deutlich Raum (Hall). Panorama nach Bildschirmseite.
 */
function shot(kind: Gun = 'puls', pan = 0): void {
  if (!gate('shot', 55)) return;
  const d = GUNS[kind] ?? GUNS.puls;
  play('sfx', { pan: pan * 0.6, verb: 0.13, gain: 0.7 }, (g, o, t) => {
    if (!fire(g, o, t, d, { rate: 1, gain: 1, w: 1, far: 0, dur: 1 })) tone(g, o, { f: vary(300), to: 80, t, type: 'triangle', a: 0.001, d: 0.08, gain: 0.1 });
  });
}

/** Turmschuss: eigener Mindestabstand (sonst verschluckt ihn der Bordkanonenschuss), etwas entfernter und leiser */
function turretShot(kind: Gun = 'puls', pan = 0): void {
  if (!gate('turret', 70)) return;
  const d = GUNS[kind] ?? GUNS.puls;
  play('sfx', { pan: pan * 0.6, verb: 0.18, gain: 0.5 }, (g, o, t) => {
    if (!fire(g, o, t, d, { rate: 1.04, gain: 0.75, w: 0.6, far: 0.35, dur: 0.7 })) tone(g, o, { f: vary(400), to: 100, t, type: 'triangle', a: 0.001, d: 0.06, gain: 0.08 });
  });
}

/** Schwerer L-Turm (Zerstörer, Träger): deutlich tiefer und wuchtiger, langer Ausklang; eigener Mindestabstand */
function heavyShot(kind: Gun = 'plasma', pan = 0): void {
  if (!gate('heavy', 90)) return;
  const d = GUNS[kind] ?? GUNS.plasma;
  play('sfx', { pan: pan * 0.6, verb: 0.2, gain: 0.65 }, (g, o, t) => {
    if (!fire(g, o, t, d, { rate: 0.78, gain: 1, w: 1.7, far: 0.1, dur: 1.4 })) tone(g, o, { f: vary(200), to: 50, t, type: 'triangle', a: 0.001, d: 0.12, gain: 0.12 });
  });
}

/** Gegnerischer Schuss: drei Varianten, dumpfer und mit mehr Raum (weiter weg), damit die eigenen im Vordergrund bleiben */
function enemyShot(pan = 0): void {
  if (!gate('enemyShot', 110)) return;
  play('sfx', { pan: pan * 0.7, verb: 0.2, gain: 1 }, (g, o, t) => {
    const name = variant('gegner', VARIANTS.gegner);
    if (!sample(g, weaponEq(g, o, 3, 0.6), name, { t, rate: vary(0.85, 0.08), gain: 0.1 * norm(name), dur: 0.9 })) sample(g, filt(g, o, 'lowpass', 2400), 'es-gegner', { t, rate: vary(0.8, 0.08), gain: 0.22 });
  });
}

/** Rakete startet */
/** Varianten der übrigen Kampf- und Werkzeugklänge (Sonniss GDC, siehe QUELLEN.md) */
export const VARIANTS = {
  rakete: ['sn-rakete-a', 'sn-rakete-b', 'sn-rakete-c', 'sn-rakete-d'],
  treffer: ['sn-treffer-a', 'sn-treffer-b', 'sn-treffer-c', 'sn-treffer-d'],
  schild: ['sn-schild-a', 'sn-schild-b', 'sn-schild-c'],
  funke: ['sn-funke-a', 'sn-funke-b'],
  kyon: ['sn-kyon-a', 'sn-funke-b', 'sn-funke-a'],
  phase: ['sn-phase-a', 'sn-phase-b', 'sn-phase-c', 'sn-phase-d'],
  alarm: ['sn-alarm-a', 'sn-alarm-b', 'sn-alarm-c'],
  gestein: ['sn-gestein-a', 'sn-gestein-b', 'sn-gestein-c', 'sn-gestein-d'],
  kristall: ['sn-kristall-a', 'sn-kristall-b', 'sn-kristall-c'],
  gegner: ['sn-gegner-a', 'sn-gegner-b', 'sn-gegner-c'],
  huelle: ['sn-huelle-a', 'sn-huelle-b', 'sn-huelle-c'],
};

/** Aufnahme (Variante) mit Waffen-Klangfarbe; false, wenn noch nicht geladen */
function rec(g: G, o: AudioNode, t: number, key: keyof typeof VARIANTS, k: { rate: number; gain: number; dur?: number; bass?: number; far?: number; spread?: number }): boolean {
  const name = variant(key, VARIANTS[key]);
  return sample(g, weaponEq(g, o, k.bass ?? 4, k.far ?? 0), name, { t, rate: vary(k.rate, k.spread ?? 0.06), gain: k.gain * norm(name), dur: k.dur });
}

/** Rakete startet: Abschuss mit Zischen, vier Varianten */
function missile(): void {
  if (!gate('missile', 120)) return;
  play('sfx', { verb: 0.14, gain: 1 }, (g, o, t) => {
    if (rec(g, o, t, 'rakete', { rate: 0.95, gain: 0.42, dur: 1.6 })) weight(g, o, t, 0.12, 55, 0.2);
    else sample(g, o, 'es-rakete', { t, rate: vary(1, 0.05), gain: 0.45 });
  });
}

/** Treffer am Gegner: kurzer, dumpfer Einschlag (häufig – darum leise und kurz) */
function hit(pan = 0): void {
  if (!gate('hit', 50)) return;
  play('sfx', { pan: pan * 0.6, verb: 0.08, gain: 1 }, (g, o, t) => {
    if (!rec(g, o, t, 'treffer', { rate: 0.95, gain: 0.16, dur: 0.45, far: 0.3 })) sample(g, filt(g, o, 'lowpass', 3000), 'es-treffer', { t, rate: vary(1.1, 0.08), gain: 0.14, dur: 0.22 });
  });
}

/**
 * Funke eingefangen (Gasströme): kurzes elektrisches Knistern; level (0–1, Ladung des Sammlers) hebt den Ton etwas an,
 * damit man das Aufladen hört
 */
function zap(level = 0, pan = 0): void {
  if (!gate('zap', 70)) return;
  play('sfx', { pan: pan * 0.5, verb: 0.12, gain: 0.8 }, (g, o, t) => {
    if (rec(g, o, t, 'funke', { rate: 0.9 + 0.3 * Math.min(1, level), gain: 0.2, dur: 0.35, bass: 0 })) return;
    const out = filt(g, o, 'lowpass', 7000);
    const f = vary(880 + 440 * Math.min(1, level), 0.04);
    tone(g, out, { type: 'triangle', f, to: f * 0.92, t, a: 0.003, d: 0.07, gain: 0.2 });
  });
}

/** Kha'ak-Kyon-Strahl: heller, gläserner Strahl, der rasch abfällt */
function kyon(pan = 0): void {
  if (!gate('kyon', 90)) return;
  play('sfx', { pan: pan * 0.7, verb: 0.18, gain: 0.8 }, (g, o, t) => {
    if (rec(g, o, t, 'kyon', { rate: 1, gain: 0.26, dur: 0.6, bass: 2, far: 0.2 })) return;
    const f = vary(1650, 0.06);
    tone(g, filt(g, o, 'lowpass', 8000), { type: 'triangle', f, to: f * 0.55, t, a: 0.002, d: 0.16, gain: 0.16, glide: 0.14 });
  });
}

/** Kha'ak-Phasensprung: kurzes Wischen durch den Raum */
function phase(pan = 0): void {
  if (!gate('phase', 120)) return;
  play('sfx', { pan: pan * 0.6, verb: 0.25, gain: 0.8 }, (g, o, t) => {
    if (rec(g, o, t, 'phase', { rate: 1, gain: 0.3, dur: 1.1, bass: 2 })) return;
    tone(g, o, { type: 'sine', f: vary(300, 0.05), to: 1400, t, a: 0.004, d: 0.14, gain: 0.14, glide: 0.12 });
  });
}

/** Explosion nach Größe: je Stufe zwei, drei Aufnahmen (klein, mittel, groß, Großkampfschiff), tiefer Nachschlag, viel Raum */
const BOOMS = {
  s: ['sn-expl-s-a', 'sn-expl-s-b', 'sn-expl-s-c'], m: ['sn-expl-m-a', 'sn-expl-m-b', 'sn-expl-m-c'],
  l: ['sn-expl-l-a', 'sn-expl-l-b', 'sn-expl-l-c'], boss: ['sn-expl-boss-a', 'sn-expl-boss-b'],
};
function explosion(size = 1, pan = 0): void {
  const s = Math.max(0.3, Math.min(4, size));
  if (!gate(s >= 2 ? 'boom-big' : 'boom', s >= 2 ? 150 : 70)) return;
  const tier = s >= 3.5 ? 'boss' : s >= 1.8 ? 'l' : s >= 0.9 ? 'm' : 's';
  // kleine Explosionen kürzer und etwas höher, große in voller Länge
  const dur = tier === 'boss' ? undefined : tier === 'l' ? 3.2 : tier === 'm' ? 2 : 1.2;
  play('sfx', { pan: pan * 0.7, verb: 0.12 + 0.05 * Math.min(2, s), gain: 1 }, (g, o, t) => {
    const name = variant('boom-' + tier, BOOMS[tier]);
    const ok = sample(g, weaponEq(g, o, 4, tier === 's' ? 0.15 : 0), name, { t, rate: vary(tier === 's' ? 0.95 : 0.88, 0.07), gain: Math.min(1.2, 0.7 + 0.13 * s) * norm(name), dur });
    if (!ok) {
      const old = s >= 3.5 ? 'es-explosion-boss' : s >= 2.4 ? 'es-explosion-5' : s >= 1.6 ? 'es-explosion-4' : s >= 1 ? 'es-explosion-3' : s >= 0.6 ? 'es-explosion-2' : 'es-explosion-1';
      if (!sample(g, o, old, { t, rate: vary(1, 0.06), gain: Math.min(0.75, 0.42 + 0.1 * s) })) noise(g, o, { t, type: 'lowpass', f: 3000, to: 150, a: 0.002, d: 0.5 + 0.3 * s, gain: 0.3 });
    }
    weight(g, o, t, Math.min(0.4, 0.14 + 0.07 * s), 50, 0.3 + 0.12 * s);
  });
}

/** Schild fängt Treffer: elektrisches Knistern, drei Varianten */
function shield(): void {
  if (!gate('shield', 120)) return;
  play('sfx', { verb: 0.12, gain: 1 }, (g, o, t) => {
    if (rec(g, o, t, 'schild', { rate: 1.05, gain: 0.3, dur: 0.6, bass: 2 })) return;
    if (!sample(g, o, 'es-schild', { t, rate: vary(1.15, 0.06), gain: 0.32, dur: 0.45 })) noise(g, o, { t, type: 'bandpass', f: 3200, to: 1200, q: 2.5, a: 0.003, d: 0.14, gain: 0.5 });
  });
}

/** Hüllentreffer: harter, metallischer Einschlag (drei Varianten) mit Bassschlag */
function hull(): void {
  if (!gate('hull', 110)) return;
  play('sfx', { verb: 0.12, gain: 1 }, (g, o, t) => {
    const name = variant('huelle', VARIANTS.huelle);
    if (!sample(g, weaponEq(g, o, 4, 0.1), name, { t, rate: vary(0.95, 0.07), gain: 1.5 * norm(name), dur: 0.9 })) sample(g, o, 'es-huelle', { t, rate: vary(1.05, 0.06), gain: 0.5, dur: 0.7 });
    weight(g, o, t, 0.24, 60, 0.2);
  });
}

/** Neue Welle: tiefes Signalhorn */
function alarm(): void {
  if (!gate('alarm', 1500)) return;
  play('sfx', { verb: 0.14 }, (g, o, t) => {
    if (rec(g, o, t, 'alarm', { rate: 1, gain: 0.3, dur: 2.2, bass: 2, spread: 0 })) return;
    if (sample(g, o, 'es-alarm', { t, gain: 0.32, dur: 1.7 })) return;
    for (const f of [hz(45), hz(52)]) tone(g, o, { f, t, type: 'sawtooth', a: 0.15, d: 0.4, sus: 0.6, hold: 0.15, r: 0.4, gain: 0.08 });
  });
}

/** Boss erscheint: sehr tiefes, unheilvolles Dröhnen */
function boss(): void {
  if (!gate('boss', 3000)) return;
  duckFor(2.5, 0.4);
  play('sfx', { verb: 0.5 }, (g, o, t) => {
    const ws = shaper(g, 2.2);
    ws.connect(o);
    for (const [i, f] of [hz(33), hz(34), hz(40)].entries()) tone(g, ws, { f, t: t + i * 0.05, type: 'sawtooth', a: 0.6, d: 0.8, sus: 0.6, hold: 0.4, r: 1.2, gain: 0.06 });
    noise(g, o, { t, type: 'lowpass', f: 300, to: 90, a: 0.5, d: 1.5, gain: 0.12 });
  });
}

/** Aufsammeln: kurzes, aufsteigendes Funkeln */
function pickup(): void {
  if (!gate('pickup', 90)) return;
  play('sfx', { verb: 0.25, gain: 1.6 }, (g, o, t) => {
    [74, 81, 86].forEach((n, i) => bell(g, o, { f: hz(n + 12), t: t + i * 0.045, ratio: 2, index: 0.8, dur: 0.25, gain: 0.045 }));
  });
}

/** Niederlage: absteigende, gedämpfte Töne */
function fail(): void {
  if (!gate('fail', 1500)) return;
  play('sfx', { verb: 0.4 }, (g, o, t) => {
    [69, 65, 62, 57].forEach((n, i) => tone(g, o, { f: hz(n), t: t + i * 0.16, type: 'triangle', a: 0.01, d: 0.4, gain: 0.07 }));
    tone(g, o, { f: hz(38), t, type: 'sine', a: 0.2, d: 1.2, gain: 0.12 });
  });
}

// ---------- Minispiele: Werkzeuge ----------

/** Gestein bricht: Aufnahme (Bruch) mit tiefem Rumpeln */
function crack(kind?: 'gestein' | 'kristall'): void {
  if (!gate('crack', 70)) return;
  play('sfx', { verb: 0.15, gain: 1 }, (g, o, t) => {
    // meist Gestein, ab und zu splittert Kristall mit
    if (!rec(g, o, t, kind ?? (Math.random() < 0.7 ? 'gestein' : 'kristall'), { rate: 0.95, gain: 0.42, dur: 0.9 })) {
      if (!sample(g, o, vary(1) > 1 ? 'es-gestein' : 'es-kristall-bruch', { t, rate: vary(0.95, 0.1), gain: 0.45, dur: 0.9 })) noise(g, o, { t, type: 'bandpass', f: vary(1800, 0.15), q: 1.5, a: 0.001, d: 0.06, gain: 0.35 });
    }
    tone(g, o, { f: 90, to: 45, t, a: 0.002, d: 0.15, gain: 0.15 });
  });
}

/** Kristall: helles, gläsernes Klingen */
function crystal(): void {
  if (!gate('crystal', 80)) return;
  play('sfx', { verb: 0.35, gain: 1.5 }, (g, o, t) => {
    const n = pick(PENTA);
    bell(g, o, { f: hz(n + 24), t, ratio: 2.76, index: 1.5, dur: 0.7, gain: 0.05 });
    bell(g, o, { f: hz(n + 31), t: t + 0.03, ratio: 2.76, index: 1, dur: 0.5, gain: 0.03 });
  });
}

/** Ventil: kurzes Metallklacken mit Druckluft */
function valve(): void {
  if (!gate('valve', 60)) return;
  play('sfx', { verb: 0.1, gain: 2 }, (g, o, t) => {
    bell(g, o, { f: vary(520, 0.06), t, ratio: 1.6, index: 3, dur: 0.1, gain: 0.07 });
    noise(g, o, { t: t + 0.02, type: 'highpass', f: 2500, a: 0.004, d: 0.1, gain: 0.06 });
  });
}

/** Ware fließt: gurgelnder Strom (Rohr verbunden) */
function flow(): void {
  if (!gate('flow', 300)) return;
  play('sfx', { verb: 0.25 }, (g, o, t) => {
    const lfo = g.ctx.createOscillator();
    const lg = g.ctx.createGain();
    lfo.frequency.value = 9; lg.gain.value = 300;
    const bp = g.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 4;
    lfo.connect(lg).connect(bp.frequency);
    bp.connect(o);
    noise(g, bp, { t, type: 'lowpass', f: 2000, a: 0.08, d: 0.4, sus: 0.5, r: 0.3, gain: 0.5 });
    lfo.start(t); lfo.stop(t + 1);
  });
}

/** Schub (Boost): Luftzug, der anschwillt, und ein steigender Ton */
function boost(): void {
  if (!gate('boost', 250)) return;
  play('sfx', { verb: 0.08 }, (g, o, t) => {
    if (sample(g, o, 'es-nachbrenner', { t, gain: 0.42, dur: 1 })) return;
    noise(g, o, { t, type: 'bandpass', f: 400, to: 3500, q: 0.8, a: 0.15, d: 0.5, r: 0.3, gain: 0.18, glide: 0.6 });
    tone(g, o, { f: 110, to: 330, t, type: 'sawtooth', a: 0.1, d: 0.5, gain: 0.04, glide: 0.5 });
  });
}

/** Tor durchflogen / Ziel getroffen: heller Zweiklang */
function chime(): void {
  if (!gate('chime', 90)) return;
  play('sfx', { verb: 0.3, gain: 1.6 }, (g, o, t) => {
    const n = pick([74, 76, 81]);
    bell(g, o, { f: hz(n + 12), t, ratio: 3.5, index: 1.2, dur: 0.4, gain: 0.05 });
    bell(g, o, { f: hz(n + 19), t: t + 0.07, ratio: 3.5, index: 1, dur: 0.5, gain: 0.04 });
  });
}

/** Steuerdüse: kurzer Luftstoß */
function thrust(pan = 0): void {
  if (!gate('thrust', 70)) return;
  play('sfx', { pan: pan * 0.5, gain: 1.5 }, (g, o, t) => {
    noise(g, o, { t, type: 'lowpass', f: 2600, to: 600, a: 0.005, d: 0.18, gain: 0.16 });
    tone(g, o, { f: 70, t, a: 0.005, d: 0.12, gain: 0.08 });
  });
}

/** Container setzt auf: Metallschlag */
function place(): void {
  if (!gate('place', 60)) return;
  play('sfx', { verb: 0.12, gain: 1.6 }, (g, o, t) => {
    tone(g, o, { f: 150, to: 60, t, a: 0.002, d: 0.1, gain: 0.25 });
    bell(g, o, { f: vary(380, 0.05), t, ratio: 1.42, index: 4, dur: 0.18, gain: 0.05 });
  });
}

export const sfx = {
  tap, open, close, toggle, deny, tick,
  coin, build, buildDone, success, chapter, warn, ping, launch, dock, accept,
  shot, turretShot, heavyShot, enemyShot, missile, hit, zap, kyon, phase, explosion, shield, hull, alarm, boss, pickup, fail,
  crack, crystal, valve, flow, boost, chime, thrust, place,
};

/** Hörprobe einer Schleife: zwei Sekunden, Lautheit wie im Spiel */
function demoLoop(name: string): () => void {
  return () => { void ensureSamples([name]).then(() => play('sfx', { gain: 1 }, (g, o, t) => { sample(g, o, name, { t, gain: 0.5 * norm(name), dur: 2 }); })); };
}

/** Jede Variante einzeln: „Splitter 1“, „Splitter 2“ … (so lässt sich genau sagen, welche bleiben soll) */
function each(label: string, names: string[], fn: () => void): [string, () => void][] {
  // nur diese eine Aufnahme laden (nicht alle), dann sofort spielen
  return names.map((n, i) => [`${label} ${i + 1}`, () => { void ensureSamples([n]).then(() => withVariant(n, fn)); }]);
}
const loopDemo = (label: string, names: string[]): [string, () => void][] => names.map((n, i) => [`${label} ${i + 1}`, demoLoop(n)]);
const GUN_DEMO: [string, string][] = [['Puls-Laser', 'puls'], ['Bolzen', 'bolzen'], ['Splitter', 'schrot'], ['Plasma', 'plasma'], ['Neutron', 'neutron'], ['Tau', 'tau'], ['Thermal', 'thermal'], ['Boson', 'boson']];

/** Hörprobe in den Einstellungen: Name → Klang */
export const SOUND_DEMO: [string, () => void][] = [
  ['Titelmusik', () => { void import('./music').then((m) => m.playTitle()); }], ['Tippen', tap], ['Öffnen', open], ['Schließen', close], ['Ablehnen', deny],
  ['Credits', () => coin(500)], ['Credits groß', () => coin(300000)], ['Bau beginnt', build], ['Bau fertig', buildDone],
  ['Auftrag erledigt', success], ['Neues Kapitel', chapter], ['Warnung', warn], ['Nachricht', ping],
  ['Schiff startet', launch], ['Andocken', dock], ['Auftrag angenommen', accept],
  ...GUN_DEMO.flatMap(([label, kind]) => each(label, GUNS[kind].s, () => shot(kind))),
  ...each('L-Plasma', GUNS.schnellplasma.s, () => heavyShot('schnellplasma')),
  ...each('Gegnerschuss', VARIANTS.gegner, () => enemyShot()),
  ...each('Rakete', VARIANTS.rakete, missile),
  ...each('Treffer', VARIANTS.treffer, () => hit()),
  ...each('Schild', VARIANTS.schild, shield),
  ...each('Hülle', VARIANTS.huelle, hull),
  ...each('Explosion klein', BOOMS.s, () => explosion(0.6)),
  ...each('Explosion mittel', BOOMS.m, () => explosion(1.2)),
  ...each('Explosion groß', BOOMS.l, () => explosion(2.5)),
  ...each('Explosion Großkampfschiff', BOOMS.boss, () => explosion(4)),
  ...each('Funke', VARIANTS.funke, () => zap(0.5)),
  ...each('Kyon-Strahl', VARIANTS.kyon, () => kyon()),
  ...each('Phasensprung', VARIANTS.phase, () => phase()),
  ...each('Neue Welle', VARIANTS.alarm, alarm),
  ['Boss', boss], ['Aufsammeln', pickup], ['Niederlage', fail],
  ...loopDemo('Strahlwaffe', LOOPS.beam), ...loopDemo('Bergbaulaser', LOOPS.drill), ...loopDemo('Triebwerk', LOOPS.engine), ...loopDemo('Traktorstrahl', LOOPS.tractor),
  ...each('Gestein bricht', VARIANTS.gestein, () => crack('gestein')),
  ...each('Kristall bricht', VARIANTS.kristall, () => crack('kristall')),
  ['Kristall', crystal], ['Ventil', valve], ['Fluss', flow], ['Schub', boost], ['Tor', chime], ['Steuerdüse', () => thrust()], ['Container', place],
];
