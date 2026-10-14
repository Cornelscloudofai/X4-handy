// Klangbibliothek: jeder Klang aus Oszillatoren, FM-Glocken und gefiltertem Rauschen gebaut, mit Hall, Panorama
// und leichter Zufallsvariation, damit sich Wiederholungen nicht abnutzen.
import { bell, duckFor, gate, graph, noise, sample, shaper, tone, vary, voiceOut, type Bus } from './engine';

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

/** Dezenter Bassschlag unter einem Schuss: gibt Gewicht, ohne die Aufnahme zu verfälschen */
function weight(g: G, o: AudioNode, t: number, gain: number, f = 90, len = 0.14): void {
  if (gain <= 0) return;
  const lp = filt(g, o, 'lowpass', 260);
  tone(g, lp, { f: vary(f * 1.4, 0.04), to: f * 0.6, t, a: 0.002, d: len, gain, glide: len * 0.7 });
}

/** Waffen: Aufnahme, Tonhöhe leicht variiert, Rate < 1 = tiefer; Bassschlag (Stärke, Grundton, Länge) */
const GUNS: Record<string, { s: string; rate: number; gain: number; w: number; f: number; len: number; dur?: number }> = {
  puls: { s: 'es-puls', rate: 0.95, gain: 0.55, w: 0.18, f: 100, len: 0.12 },
  bolzen: { s: 'es-bolzen', rate: 0.88, gain: 0.95, w: 0.22, f: 90, len: 0.12 },
  schrot: { s: 'es-splitter', rate: 1, gain: 0.6, w: 0.14, f: 85, len: 0.14 },
  plasma: { s: 'es-plasma', rate: 1, gain: 0.55, w: 0.1, f: 70, len: 0.2, dur: 0.9 },
  neutron: { s: 'es-neutron', rate: 1, gain: 0.5, w: 0.12, f: 110, len: 0.1 },
  tau: { s: 'es-tau', rate: 1, gain: 0.55, w: 0.12, f: 75, len: 0.2, dur: 1.1 },
  thermal: { s: 'es-thermal', rate: 0.96, gain: 0.55, w: 0.12, f: 80, len: 0.16 },
  boson: { s: 'es-boson', rate: 0.95, gain: 0.6, w: 0.1, f: 60, len: 0.25, dur: 1.3 },
  // schwere Plasmawaffen der L-Hauptbatterie: tiefer als die normale Plasmakanone
  schnellplasma: { s: 'es-plasma', rate: 0.8, gain: 0.6, w: 0.16, f: 60, len: 0.22, dur: 0.9 },
  plasmasalve: { s: 'es-plasma', rate: 0.74, gain: 0.62, w: 0.18, f: 55, len: 0.24, dur: 0.8 },
};

/**
 * Schuss je Waffenart: echte Aufnahme (Endless Sky, gemeinfrei), leicht in der Tonhöhe variiert, mit dezentem
 * Bassschlag und wenig Hall. Panorama nach Bildschirmseite.
 */
function shot(kind: Gun = 'puls', pan = 0): void {
  if (!gate('shot', 55)) return;
  const d = GUNS[kind] ?? GUNS.puls;
  play('sfx', { pan: pan * 0.6, verb: 0.03, gain: 0.7 }, (g, o, t) => {
    if (sample(g, o, d.s, { t, rate: vary(d.rate, 0.035), gain: d.gain, dur: d.dur })) weight(g, o, t, d.w, d.f, d.len);
    else tone(g, o, { f: vary(600), to: 150, t, type: 'triangle', a: 0.001, d: 0.08, gain: 0.1 });
  });
}

/** Turmschuss: eigener Klang und eigener Mindestabstand (sonst verschluckt ihn der Bordkanonenschuss), leiser */
function turretShot(kind: Gun = 'puls', pan = 0): void {
  if (!gate('turret', 70)) return;
  const d = GUNS[kind] ?? GUNS.puls;
  play('sfx', { pan: pan * 0.6, verb: 0.04, gain: 0.5 }, (g, o, t) => {
    if (!sample(g, o, d.s, { t, rate: vary(d.rate * 1.08, 0.04), gain: d.gain * 0.75, dur: d.dur ? Math.min(0.6, d.dur) : undefined })) tone(g, o, { f: vary(800), to: 200, t, type: 'triangle', a: 0.001, d: 0.06, gain: 0.08 });
  });
}

/** Schwerer L-Turm (Zerstörer): tiefer und wuchtiger als der M-Turm, mit Bassschlag; eigener Mindestabstand */
function heavyShot(kind: Gun = 'plasma', pan = 0): void {
  if (!gate('heavy', 90)) return;
  const d = GUNS[kind] ?? GUNS.plasma;
  play('sfx', { pan: pan * 0.6, verb: 0.06, gain: 0.65 }, (g, o, t) => {
    if (sample(g, o, d.s, { t, rate: vary(d.rate * 0.72, 0.03), gain: d.gain, dur: d.dur })) weight(g, o, t, d.w * 1.6, d.f * 0.7, d.len * 1.4);
    else tone(g, o, { f: vary(300), to: 70, t, type: 'triangle', a: 0.001, d: 0.12, gain: 0.12 });
  });
}

/** Gegnerischer Schuss: leiser und dumpfer als die eigenen, damit die eigenen im Vordergrund bleiben */
function enemyShot(pan = 0): void {
  if (!gate('enemyShot', 110)) return;
  play('sfx', { pan: pan * 0.7, verb: 0.05, gain: 1 }, (g, o, t) => {
    sample(g, filt(g, o, 'lowpass', 2400), 'es-gegner', { t, rate: vary(0.8, 0.08), gain: 0.22 });
  });
}

/** Rakete startet */
function missile(): void {
  if (!gate('missile', 120)) return;
  play('sfx', { verb: 0.06, gain: 1 }, (g, o, t) => {
    sample(g, o, 'es-rakete', { t, rate: vary(1, 0.05), gain: 0.45 });
  });
}

/** Treffer am Gegner: kurzer, dumpfer Einschlag */
function hit(pan = 0): void {
  if (!gate('hit', 50)) return;
  play('sfx', { pan: pan * 0.6, gain: 1 }, (g, o, t) => {
    if (!sample(g, filt(g, o, 'lowpass', 3000), 'es-treffer', { t, rate: vary(1.1, 0.08), gain: 0.14, dur: 0.22 })) tone(g, o, { f: vary(140, 0.06), to: 60, t, a: 0.001, d: 0.06, gain: 0.14 });
  });
}

/** Explosion nach Größe: fünf Aufnahmen von klein bis groß, Boss mit langem Nachgrollen */
function explosion(size = 1, pan = 0): void {
  const s = Math.max(0.3, Math.min(4, size));
  if (!gate(s >= 2 ? 'boom-big' : 'boom', s >= 2 ? 150 : 70)) return;
  const name = s >= 3.5 ? 'es-explosion-boss' : s >= 2.4 ? 'es-explosion-5' : s >= 1.6 ? 'es-explosion-4' : s >= 1 ? 'es-explosion-3' : s >= 0.6 ? 'es-explosion-2' : 'es-explosion-1';
  play('sfx', { pan: pan * 0.7, verb: 0.05 + 0.03 * Math.min(2, s), gain: 1 }, (g, o, t) => {
    if (!sample(g, o, name, { t, rate: vary(1, 0.06), gain: Math.min(0.75, 0.42 + 0.1 * s) })) noise(g, o, { t, type: 'lowpass', f: 3000, to: 150, a: 0.002, d: 0.5 + 0.3 * s, gain: 0.3 });
    weight(g, o, t, Math.min(0.35, 0.12 + 0.06 * s), 60, 0.25 + 0.1 * s);
  });
}

/** Schild fängt Treffer: elektrisches Knistern */
function shield(): void {
  if (!gate('shield', 120)) return;
  play('sfx', { verb: 0.08, gain: 1 }, (g, o, t) => {
    if (!sample(g, o, 'es-schild', { t, rate: vary(1.15, 0.06), gain: 0.32, dur: 0.45 })) noise(g, o, { t, type: 'bandpass', f: 3200, to: 1200, q: 2.5, a: 0.003, d: 0.14, gain: 0.5 });
  });
}

/** Hüllentreffer: harter Einschlag */
function hull(): void {
  if (!gate('hull', 110)) return;
  play('sfx', { verb: 0.06, gain: 1 }, (g, o, t) => {
    sample(g, o, 'es-huelle', { t, rate: vary(1.05, 0.06), gain: 0.5, dur: 0.7 });
    weight(g, o, t, 0.2, 70, 0.18);
  });
}

/** Neue Welle: tiefes Signalhorn */
function alarm(): void {
  if (!gate('alarm', 1500)) return;
  play('sfx', { verb: 0.1 }, (g, o, t) => {
    if (sample(g, o, 'es-alarm', { t, gain: 0.32, dur: 1.7 })) return;
    const lp = g.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.3); lp.frequency.exponentialRampToValueAtTime(400, t + 0.9);
    lp.connect(o);
    for (const f of [hz(45), hz(52)]) tone(g, lp, { f, t, type: 'sawtooth', a: 0.15, d: 0.4, sus: 0.6, hold: 0.15, r: 0.4, gain: 0.08 });
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
function crack(): void {
  if (!gate('crack', 70)) return;
  play('sfx', { verb: 0.15, gain: 1 }, (g, o, t) => {
    if (!sample(g, o, vary(1) > 1 ? 'es-gestein' : 'es-kristall-bruch', { t, rate: vary(0.95, 0.1), gain: 0.45, dur: 0.9 })) noise(g, o, { t, type: 'bandpass', f: vary(1800, 0.15), q: 1.5, a: 0.001, d: 0.06, gain: 0.35 });
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
  shot, turretShot, heavyShot, enemyShot, missile, hit, explosion, shield, hull, alarm, boss, pickup, fail,
  crack, crystal, valve, flow, boost, chime, thrust, place,
};

/** Hörprobe einer Schleife: zwei Sekunden mit Ein- und Ausblenden */
function demoLoop(name: string): () => void {
  return () => play('sfx', { gain: 1 }, (g, o, t) => { sample(g, o, name, { t, gain: 0.5, dur: 2 }); });
}

/** Hörprobe in den Einstellungen: Name → Klang */
export const SOUND_DEMO: [string, () => void][] = [
  ['Titelmusik', () => { void import('./music').then((m) => m.playTitle()); }], ['Tippen', tap], ['Öffnen', open], ['Schließen', close], ['Ablehnen', deny],
  ['Credits', () => coin(500)], ['Credits groß', () => coin(300000)], ['Bau beginnt', build], ['Bau fertig', buildDone],
  ['Auftrag erledigt', success], ['Neues Kapitel', chapter], ['Warnung', warn], ['Nachricht', ping],
  ['Schiff startet', launch], ['Andocken', dock], ['Auftrag angenommen', accept],
  ['Puls-Laser', () => shot('puls')], ['Bolzen', () => shot('bolzen')], ['Splitter', () => shot('schrot')], ['Plasma', () => shot('plasma')],
  ['Neutron', () => shot('neutron')], ['Tau', () => shot('tau')], ['Thermal', () => shot('thermal')], ['Boson', () => shot('boson')], ['Gegnerschuss', () => enemyShot()], ['Rakete', missile],
  ['Treffer', () => hit()], ['Explosion klein', () => explosion(0.6)], ['Explosion groß', () => explosion(3)], ['Schild', shield], ['Hülle', hull],
  ['Neue Welle', alarm], ['Boss', boss], ['Aufsammeln', pickup], ['Niederlage', fail],
  ['Strahlwaffe', demoLoop('es-strahl-schleife')], ['Bergbaulaser', demoLoop('es-bergbaulaser-schleife')], ['Triebwerk', demoLoop('es-triebwerk-schleife')], ['Traktorstrahl', demoLoop('es-traktorstrahl')],
  ['Gestein bricht', crack], ['Kristall', crystal], ['Ventil', valve], ['Fluss', flow], ['Schub', boost], ['Tor', chime], ['Steuerdüse', () => thrust()], ['Container', place],
];
