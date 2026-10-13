// Atmosphäre und Klangteppich: ruhige, generative Weltraumklänge, die sich nie genau wiederholen.
// Atmosphäre = tiefer Grundton + „Sternenwind“ (gefiltertes Rauschen) + Stationsbrummen beim Heranzoomen.
// Klangteppich = langsam wechselnde Flächenakkorde in D-Dorisch mit vereinzelten Glockentönen; Tonart je Sektor.
import { bell, graph, liveContext, loopSample, noiseBuffer, onAudioChange, renderOffline, settings, tone, voiceOut } from './engine';

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Akkordfolge (Midi-Noten um D): Dm9 – B♭maj7 – Fmaj7/C – C6/9 – Gm9 – Am7
const CHORDS: number[][] = [
  [38, 50, 53, 57, 60, 64],
  [34, 50, 53, 57, 62],
  [36, 48, 53, 57, 60, 64],
  [36, 48, 52, 55, 57, 62],
  [31, 50, 53, 57, 58, 62],
  [33, 48, 52, 55, 60, 64],
];
const MELODY = [62, 64, 65, 67, 69, 72, 74, 76, 77, 81];

/**
 * Stimmungen des melodischen Klangteppichs: je eigene Akkordfolge, Tonleiter, Melodie-Instrument und Dichte.
 * Jede Stimmung dauert einige Minuten, dann folgt weich die nächste – ohne Schlagzeug, ohne festen Takt.
 */
interface Mood { name: string; chords: number[][]; scale: number[]; voice: 'glocke' | 'epiano' | 'floete' | 'streicher'; pad: OscillatorType; bright: number; gap: [number, number]; notes: [number, number]; len: [number, number] }
const MOODS: Mood[] = [
  // Weite: die bisherige, schwebende Stimmung
  { name: 'Weite', chords: CHORDS, scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77], voice: 'glocke', pad: 'sawtooth', bright: 1, gap: [6, 12], notes: [3, 5], len: [1.2, 2.6] },
  // Hoffnung: D-Dur/Lydisch – hell und zuversichtlich, weiches E-Piano
  { name: 'Hoffnung', chords: [[38, 50, 54, 57, 61, 64], [43, 50, 55, 59, 62, 66], [35, 50, 54, 57, 61], [45, 49, 52, 57, 59, 64]], scale: [62, 64, 66, 68, 69, 71, 73, 74, 76, 78], voice: 'epiano', pad: 'triangle', bright: 1.3, gap: [5, 10], notes: [4, 7], len: [0.7, 1.6] },
  // Tiefe: dunkles d-Moll – tiefe Streicherfläche, wenige lange Töne
  { name: 'Tiefe', chords: [[26, 38, 50, 53, 57], [22, 34, 50, 53, 58], [31, 43, 50, 55, 58], [33, 45, 52, 55, 57]], scale: [50, 53, 55, 57, 58, 60, 62, 65], voice: 'streicher', pad: 'sawtooth', bright: 0.7, gap: [8, 16], notes: [2, 4], len: [2, 4] },
  // Glanz: F-Lydisch – schimmernd, flötenartige Melodie mit sanftem Vibrato
  { name: 'Glanz', chords: [[41, 53, 57, 60, 64, 67], [36, 52, 55, 59, 62], [43, 55, 59, 62, 66], [38, 53, 57, 62, 64]], scale: [65, 67, 69, 71, 72, 74, 76, 77, 79, 81], voice: 'floete', pad: 'triangle', bright: 1.15, gap: [5, 11], notes: [4, 6], len: [0.9, 2] },
];
let moodIdx = 0;
let moodEnd = 0;
let nextPhrase = 0;
/** letzte Melodienote (für schrittweise Bewegung) und ein Motiv, das in der Stimmung wiederkehrt */
let lastNote = 0;
let motif: number[] = [];
const melodic = () => settings.style !== 'klassisch';
const mood = () => (melodic() ? MOODS[moodIdx % MOODS.length] : MOODS[0]);

type Scene = 'map' | 'minigame' | 'menu';

let running = false;
let timer = 0;
let chordIdx = 0;
let nextChord = 0;
let nextBell = 0;
let transpose = 0;
let scene: Scene = 'map';
let ambNodes: { stop: () => void; out: GainNode; near: GainNode } | null = null;
let musicOut: GainNode | null = null;

function sceneLevels(): { amb: number; music: number } {
  return scene === 'minigame' ? { amb: 0.35, music: 0.45 } : scene === 'menu' ? { amb: 0.6, music: 1 } : { amb: 1, music: 1 };
}

/** Tonart je Sektor (−3 … +3 Halbtöne), damit jeder Sektor leicht anders klingt */
export function setSectorMood(id: string): void {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  transpose = (Math.abs(h) % 7) - 3;
}

export function setScene(s: Scene): void {
  scene = s;
  const c = liveContext();
  if (!c) return;
  const l = sceneLevels();
  ambNodes?.out.gain.setTargetAtTime(l.amb, c.currentTime, 0.8);
  musicOut?.gain.setTargetAtTime(l.music, c.currentTime, 0.8);
}

/** Nähe zu einer Station (0–1): blendet ein leises Maschinenbrummen ein */
export function setNear(x: number): void {
  const c = liveContext();
  if (!c || !ambNodes) return;
  ambNodes.near.gain.setTargetAtTime(Math.max(0, Math.min(1, x)) * 0.5, c.currentTime, 0.5);
}

function startAmbience(): void {
  const g = graph();
  if (!g || ambNodes) return;
  const c = g.ctx;
  const out = voiceOut(g, 'amb', { verb: 0.3 });
  out.gain.value = 0;
  out.gain.setTargetAtTime(sceneLevels().amb, c.currentTime, 2.5);
  const stops: (() => void)[] = [];
  // Grundton: Sinus und leise Dreieckswelle eine Quinte höher, langsames Schweben
  const root = hz(26 + transpose);
  for (const [f, gain, type] of [[root, 0.09, 'sine'], [root * 1.5, 0.03, 'triangle'], [root * 2.003, 0.02, 'sine']] as const) {
    const o = c.createOscillator();
    o.type = type; o.frequency.value = f;
    const gg = c.createGain(); gg.gain.value = gain;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.05;
    const lg = c.createGain(); lg.gain.value = gain * 0.5;
    lfo.connect(lg).connect(gg.gain);
    o.connect(gg).connect(out);
    o.start(); lfo.start();
    stops.push(() => { o.stop(); lfo.stop(); });
  }
  // Sternenwind: Rauschen durch wandernden Bandpass, im Stereofeld verteilt
  for (const pan of [-0.6, 0.6]) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c); src.loop = true; src.playbackRate.value = 0.5;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2; bp.frequency.value = 600;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.03 + Math.random() * 0.03;
    const lg = c.createGain(); lg.gain.value = 380;
    lfo.connect(lg).connect(bp.frequency);
    const p = c.createStereoPanner(); p.pan.value = pan;
    const gg = c.createGain(); gg.gain.value = 0.05;
    src.connect(bp).connect(gg).connect(p).connect(out);
    src.start(0, Math.random()); lfo.start();
    stops.push(() => { src.stop(); lfo.stop(); });
  }
  // Stationsbrummen (Netzbrummen mit Obertönen + Lüftungsrauschen), anfangs stumm
  const near = c.createGain(); near.gain.value = 0;
  near.connect(out);
  for (const [f, gain] of [[50, 0.12], [100, 0.05], [150, 0.025]] as const) {
    const o = c.createOscillator(); o.frequency.value = f;
    const gg = c.createGain(); gg.gain.value = gain;
    o.connect(gg).connect(near); o.start();
    stops.push(() => o.stop());
  }
  const vent = c.createBufferSource(); vent.buffer = noiseBuffer(c); vent.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450;
  const vg = c.createGain(); vg.gain.value = 0.08;
  vent.connect(lp).connect(vg).connect(near); vent.start();
  stops.push(() => vent.stop());
  ambNodes = { out, near, stop: () => { out.gain.setTargetAtTime(0, c.currentTime, 0.3); setTimeout(() => stops.forEach((f) => f()), 1500); } };
}

/** Ein Akkord des Klangteppichs: langsam einblendende, verstimmte Sägezähne hinter weichem Tiefpass */
function playChord(t: number, notes: number[], len: number): void {
  const g = graph();
  if (!g || !musicOut) return;
  const c = g.ctx;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.7;
  const m = mood();
  lp.frequency.setValueAtTime(380 * m.bright, t);
  lp.frequency.linearRampToValueAtTime((900 + Math.random() * 500) * m.bright, t + len * 0.45);
  lp.frequency.linearRampToValueAtTime(420, t + len + 4);
  lp.connect(musicOut);
  notes.forEach((n, i) => {
    const f = hz(n + transpose);
    for (const det of [-6, 6]) tone(g, lp, { f, t: t + i * 0.12, type: i === 0 ? 'triangle' : m.pad, a: 3, d: 1, sus: 0.8, hold: len - 4, r: 5, gain: (i === 0 ? 0.05 : m.pad === 'triangle' ? 0.026 : 0.016) * (m.name === 'Tiefe' ? 1.3 : 1), detune: det + (Math.random() - 0.5) * 4 });
  });
}

function playBell(t: number): void {
  const g = graph();
  if (!g || !musicOut) return;
  const n = MELODY[Math.floor(Math.random() * MELODY.length)] + transpose;
  bell(g, musicOut, { f: hz(n + (Math.random() < 0.3 ? 12 : 0)), t, ratio: 3.5, index: 0.9, dur: 2.5, gain: 0.03, a: 0.02 });
}

/** Eine Melodienote im Instrument der Stimmung */
function melodyNote(t: number, midi: number, dur: number, vel: number): void {
  const g = graph();
  if (!g || !musicOut) return;
  const f = hz(midi + transpose);
  const v = mood().voice;
  if (v === 'glocke') bell(g, musicOut, { f, t, ratio: 3.5, index: 0.9, dur: dur + 1.5, gain: 0.032 * vel, a: 0.02 });
  else if (v === 'epiano') {
    // E-Piano: FM mit Verhältnis 1 und kurzem Anschlag, weich ausklingend
    bell(g, musicOut, { f, t, ratio: 1, index: 1.4, dur: dur + 1.8, gain: 0.04 * vel, a: 0.006 });
    bell(g, musicOut, { f: f * 2, t, ratio: 1, index: 0.4, dur: dur * 0.6 + 0.4, gain: 0.008 * vel, a: 0.006 });
  } else if (v === 'floete') {
    // Flöte: Sinus mit langsamem Anstieg, leichtem Vibrato und Hauch
    const c = g.ctx;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const vib = c.createOscillator(); vib.frequency.value = 4.8;
    const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.6);
    vib.connect(vg).connect(o.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.045 * vel, t + 0.25);
    env.gain.setValueAtTime(0.045 * vel, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    o.connect(env).connect(musicOut);
    tone(g, musicOut, { f: f * 2, t, type: 'sine', a: 0.3, d: dur, sus: 0.3, r: 0.6, gain: 0.006 * vel });
    o.start(t); vib.start(t); o.stop(t + dur + 1); vib.stop(t + dur + 1);
  } else {
    // Streicher: zwei verstimmte Sägezähne hinter Tiefpass, langsamer Bogen
    const lp = g.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.5;
    lp.connect(musicOut);
    for (const det of [-5, 5]) tone(g, lp, { f, t, type: 'sawtooth', a: Math.min(1.2, dur * 0.4), d: dur, sus: 0.7, hold: 0, r: 1.4, gain: 0.024 * vel, detune: det });
  }
}

/** Kurze Phrase: meist schrittweise, Ruhepunkt auf einem Akkordton; gelegentlich kehrt das Motiv der Stimmung wieder */
function playPhrase(t: number): void {
  const m = mood();
  const scale = m.scale;
  const chord = m.chords[(chordIdx + m.chords.length - 1) % m.chords.length];
  const chordTones = new Set(chord.map((n) => ((n % 12) + 12) % 12));
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  let notes: number[];
  if (motif.length && Math.random() < 0.4) {
    // Motiv wiederholen, leicht versetzt
    const shift = [0, 0, 2, -2, 5][Math.floor(Math.random() * 5)];
    notes = motif.map((n) => scale.reduce((best, s) => (Math.abs(s - (n + shift)) < Math.abs(best - (n + shift)) ? s : best), scale[0]));
  } else {
    const k = Math.round(rnd(m.notes[0], m.notes[1]));
    let i = lastNote ? scale.indexOf(scale.reduce((b, s) => (Math.abs(s - lastNote) < Math.abs(b - lastNote) ? s : b), scale[0])) : Math.floor(scale.length / 2);
    notes = [];
    for (let j = 0; j < k; j++) {
      const r = Math.random();
      i += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
      i = Math.max(0, Math.min(scale.length - 1, i));
      notes.push(scale[i]);
    }
    // Ende auf einem Akkordton
    const lastI = notes.length - 1;
    for (let d = 0; d < 3 && !chordTones.has(((notes[lastI] % 12) + 12) % 12); d++) notes[lastI] = scale[Math.max(0, Math.min(scale.length - 1, scale.indexOf(notes[lastI]) + (d % 2 ? -1 : 1)))];
    if (!motif.length || Math.random() < 0.2) motif = notes.slice(0, Math.min(4, notes.length));
  }
  let tt = t;
  notes.forEach((n, j) => {
    const last = j === notes.length - 1;
    const dur = rnd(m.len[0], m.len[1]) * (last ? 1.8 : 1);
    melodyNote(tt, n, dur, last ? 0.85 : 0.7 + Math.random() * 0.3);
    tt += dur * (0.8 + Math.random() * 0.4);
  });
  lastNote = notes[notes.length - 1];
  nextPhrase = tt + rnd(m.gap[0], m.gap[1]);
}

function schedule(): void {
  const c = liveContext();
  if (!c || !running) return;
  const now = c.currentTime;
  if (c.state === 'running' && !trackActive) {
    // Stimmungswechsel nach einigen Minuten (nur melodisch); die nächste Fläche trägt schon die neue Stimmung
    if (melodic() && now >= moodEnd) {
      if (moodEnd) { moodIdx = (moodIdx + 1 + (Math.random() < 0.3 ? 1 : 0)) % MOODS.length; motif = []; chordIdx = 0; }
      moodEnd = now + 150 + Math.random() * 120;
    }
    if (now + 0.5 >= nextChord) {
      const len = 10 + Math.random() * 6;
      const cs = mood().chords;
      playChord(Math.max(now, nextChord), cs[chordIdx % cs.length], len);
      chordIdx += Math.random() < 0.7 ? 1 : 2;
      nextChord = Math.max(now, nextChord) + len;
    }
    if (melodic() && now >= nextPhrase) playPhrase(now + 0.1);
    if (now >= nextBell && (!melodic() || mood().voice === 'glocke' || Math.random() < 0.35)) {
      playBell(now + 0.05);
      // manchmal ein zweiter Ton kurz danach – wie eine kleine Phrase
      if (Math.random() < 0.35) playBell(now + 0.4 + Math.random() * 0.5);
      nextBell = now + (melodic() ? 9 : 4) + Math.random() * 9;
    }
  }
  timer = window.setTimeout(schedule, 400);
}

/** Läuft gerade ein Musikstück (Datei)? Dann pausiert der generative Klangteppich */
let trackActive = false;
export function setTrackActive(on: boolean): void {
  trackActive = on;
  const c = liveContext();
  if (!on && c) { nextChord = c.currentTime + 2; nextBell = c.currentTime + 8; }
}
export function currentScene(): Scene { return scene; }

/** Atmosphäre und Klangteppich starten (nach der ersten Berührung) bzw. bei Stummschaltung anhalten */
export function startSoundscape(): void {
  if (!settings.on) return stopSoundscape();
  const g = graph();
  if (!g || running) return;
  running = true;
  startAmbience();
  musicOut = voiceOut(g, 'music', { verb: 0.55 });
  musicOut.gain.value = sceneLevels().music;
  nextChord = g.ctx.currentTime + 1.5;
  nextBell = g.ctx.currentTime + 6;
  nextPhrase = g.ctx.currentTime + 8;
  moodIdx = Math.floor(Math.random() * MOODS.length);
  moodEnd = g.ctx.currentTime + 150 + Math.random() * 120;
  schedule();
  onStart.forEach((f) => f());
}

const onStart: (() => void)[] = [];
/** Wird aufgerufen, sobald die Klangwelt startet (für die Titelmusik) */
export function onSoundscapeStart(f: () => void): void {
  onStart.push(f);
}

export function stopSoundscape(): void {
  running = false;
  clearTimeout(timer);
  ambNodes?.stop();
  ambNodes = null;
  musicOut = null;
}

onAudioChange(() => (settings.on ? startSoundscape() : stopSoundscape()));

// ---------- Dauerklänge (Bohrer, Saugen, Strahlwaffe, Triebwerk) ----------

export interface LoopHandle { level: (v: number) => void; stop: () => void }
const DUMMY: LoopHandle = { level: () => {}, stop: () => {} };

/** Dauerklang starten; level(0–1) regelt Lautstärke und Charakter, stop() blendet aus */
export function loop(kind: 'drill' | 'suction' | 'beam' | 'engine'): LoopHandle {
  const g = graph();
  if (!g) return DUMMY;
  const c = g.ctx;
  const out = voiceOut(g, 'sfx', { verb: 0.1 });
  out.gain.value = 0;
  const nodes: AudioScheduledSourceNode[] = [];
  // Echte Aufnahme als Schleife, wenn vorhanden (Strahlwaffe, Bergbaulaser, Triebwerk); Tonhöhe folgt der Stärke
  const recName = kind === 'beam' ? 'es-strahl-schleife' : kind === 'drill' ? 'es-bergbaulaser-schleife' : kind === 'engine' ? 'es-triebwerk-schleife' : '';
  const rec = recName ? loopSample(g, out, recName) : null;
  if (rec) {
    const t0 = c.currentTime;
    rec.start(t0, Math.random() * 2);
    const base = kind === 'engine' ? 0.8 : 1;
    return {
      level: (v) => {
        const t = c.currentTime;
        const k = Math.max(0, Math.min(1, v));
        out.gain.setTargetAtTime((kind === 'engine' ? 0.25 + 0.55 * k : 0.6) * (k > 0 ? 1 : 0), t, 0.05);
        rec.playbackRate.setTargetAtTime(base * (0.9 + 0.25 * k), t, 0.1);
      },
      stop: () => { const t = c.currentTime; out.gain.setTargetAtTime(0, t, 0.06); rec.stop(t + 0.4); },
    };
  }
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
  const flt = c.createBiquadFilter();
  const ng = c.createGain();
  src.connect(flt).connect(ng).connect(out);
  nodes.push(src);
  let osc: OscillatorNode | null = null;
  let set: (v: number, t: number) => void;
  if (kind === 'drill') {
    // Bohrkopf: raues Mahlen + tiefe, schnell schwankende Säge
    flt.type = 'bandpass'; flt.Q.value = 1.4; flt.frequency.value = 900; ng.gain.value = 0.35;
    osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 52;
    const am = c.createOscillator(); am.frequency.value = 23;
    const amg = c.createGain(); amg.gain.value = 0.04;
    const og = c.createGain(); og.gain.value = 0.06;
    am.connect(amg).connect(og.gain);
    osc.connect(og).connect(out);
    nodes.push(osc, am);
    set = (v, t) => { flt.frequency.setTargetAtTime(600 + 900 * v, t, 0.05); osc!.frequency.setTargetAtTime(46 + 18 * v, t, 0.05); };
  } else if (kind === 'suction') {
    // Gassauger: hohles Rauschen, Tonhöhe steigt mit der Saugleistung
    flt.type = 'bandpass'; flt.Q.value = 3; flt.frequency.value = 500; ng.gain.value = 0.5;
    set = (v, t) => flt.frequency.setTargetAtTime(380 + 900 * v, t, 0.08);
  } else if (kind === 'beam') {
    // Strahlwaffe: summende Sägezähne mit Zischen
    flt.type = 'highpass'; flt.frequency.value = 3500; ng.gain.value = 0.12;
    osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 180;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 181.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const og = c.createGain(); og.gain.value = 0.05;
    osc.connect(lp); o2.connect(lp); lp.connect(og).connect(out);
    nodes.push(osc, o2);
    set = (v, t) => lp.frequency.setTargetAtTime(900 + 1400 * v, t, 0.05);
  } else {
    // Triebwerk: tiefes Rumpeln, wird mit Schub heller
    flt.type = 'lowpass'; flt.Q.value = 0.8; flt.frequency.value = 300; ng.gain.value = 0.5;
    set = (v, t) => flt.frequency.setTargetAtTime(220 + 1800 * v, t, 0.1);
  }
  const t0 = c.currentTime;
  for (const n of nodes) n.start(t0);
  set(0.5, t0);
  return {
    level: (v) => {
      const t = c.currentTime;
      out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.7, t, 0.04);
      set(v, t);
    },
    stop: () => {
      const t = c.currentTime;
      out.gain.setTargetAtTime(0, t, 0.06);
      for (const n of nodes) n.stop(t + 0.4);
    },
  };
}

// ---------- Halten: Dauerklang, solange das Spiel ihn jeden Frame meldet ----------

const held = new Map<string, { h: LoopHandle; t: number; v: number; set: number }>();

/** Jeden Frame aufrufen, solange der Klang laufen soll; ohne Meldung blendet er nach kurzer Zeit aus */
export function sustain(key: string, kind: 'drill' | 'suction' | 'beam' | 'engine', v: number): void {
  if (typeof window === 'undefined') return;
  watch ||= window.setInterval(reap, 80);
  const now = performance.now();
  let e = held.get(key);
  if (!e) { e = { h: loop(kind), t: now, v: -1, set: 0 }; held.set(key, e); }
  e.t = now;
  if (Math.abs(v - e.v) > 0.03 || now - e.set > 250) { e.h.level(v); e.v = v; e.set = now; }
}

let watch = 0;
function reap(): void {
  const now = performance.now();
  for (const [k, e] of held) if (now - e.t > 160) { e.h.stop(); held.delete(k); }
}

/** Name der aktuellen Stimmung (für die Anzeige in den Einstellungen) */
export function moodName(): string {
  return melodic() ? mood().name : 'Klassisch';
}

/** Nächste Stimmung sofort (Hörprobe) */
export function nextMood(): string {
  const c = liveContext();
  if (!c) return moodName();
  moodIdx = (moodIdx + 1) % MOODS.length;
  motif = [];
  chordIdx = 0;
  nextChord = c.currentTime + 0.3;
  nextPhrase = c.currentTime + 1.5;
  moodEnd = c.currentTime + 150 + Math.random() * 120;
  return moodName();
}

/** Hörprobe einer Stimmung als Datei (Prüfskript): plant Flächen und Melodie im Voraus in einen Offline-Kontext */
export function renderMood(i: number, sec: number): Promise<AudioBuffer> {
  return renderOffline(() => {
    const g = graph();
    if (!g) return;
    const keep = { moodIdx, musicOut, chordIdx, motif, lastNote, nextPhrase, transpose };
    moodIdx = i; chordIdx = 0; motif = []; lastNote = 0; transpose = 0;
    musicOut = voiceOut(g, 'music', { verb: 0.55 });
    let tc = 0.2;
    while (tc < sec) { const len = 10 + Math.random() * 6; const cs = mood().chords; playChord(tc, cs[chordIdx % cs.length], len); chordIdx++; tc += len; }
    nextPhrase = 3;
    while (nextPhrase < sec - 4) playPhrase(nextPhrase);
    ({ moodIdx, musicOut, chordIdx, motif, lastNote, nextPhrase, transpose } = keep);
  }, sec);
}
