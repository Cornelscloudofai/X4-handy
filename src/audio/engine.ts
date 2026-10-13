// Audio-Engine: Mischpult mit vier Kanälen (Oberfläche, Effekte, Atmosphäre, Musik), Raumhall, Kompressor und
// Begrenzer. Alle Klänge entstehen synthetisch aus Oszillatoren, Rauschen und Filtern – es wird kein Audiomaterial
// geladen. Der Klangkontext startet erst nach der ersten Berührung (Vorgabe der Browser).

export type Bus = 'ui' | 'sfx' | 'amb' | 'music';
export const BUSES: Bus[] = ['ui', 'sfx', 'amb', 'music'];
export const BUS_LABEL: Record<Bus, string> = { ui: 'Oberfläche', sfx: 'Effekte', amb: 'Atmosphäre', music: 'Musik' };

export interface AudioSettings { on: boolean; master: number; ui: number; sfx: number; amb: number; music: number; /** Klangteppich: melodisch (mehrere Stimmungen) oder klassisch (nur Flächen und Glocken) */ style: 'melodisch' | 'klassisch' }
const DEFAULTS: AudioSettings = { on: true, master: 0.8, ui: 0.6, sfx: 0.85, amb: 0.45, music: 0.4, style: 'melodisch' };
const KEY = 'x4-sektorbau-audio';

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    // alte Einstellung (nur an/aus) übernehmen
    if (localStorage.getItem('x4-sektorbau-sound') === 'off') return { ...DEFAULTS, on: false };
  } catch {
    /* Speicher nicht verfügbar */
  }
  return { ...DEFAULTS };
}

export const settings: AudioSettings = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  bus: Record<Bus, GainNode>;
  /** Eingang des Halls (Anteile je Stimme) */
  verb: GainNode;
  /** Ducking: senkt Atmosphäre und Klangteppich kurz ab, wenn etwas Wichtiges erklingt */
  duck: GainNode;
  meter?: AnalyserNode;
}

let live: Graph | null = null;
/** Graph, in den gerade gespielt wird (live oder beim Vorab-Rendern) */
let cur: Graph | null = null;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

// ---------- Aufnahmen (CC0, src/assets/sounds) ----------

const SAMPLE_URLS = import.meta.glob('../assets/sounds/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const buffers = new Map<string, AudioBuffer>();
let loadingAll: Promise<void> | null = null;

/** Alle Aufnahmen laden und dekodieren (einmal, nach der ersten Berührung; zusammen unter 1 MB) */
export function preloadSamples(ctx?: BaseAudioContext): Promise<void> {
  const c = ctx ?? live?.ctx;
  if (!c) return Promise.resolve();
  loadingAll ??= Promise.all(Object.entries(SAMPLE_URLS).map(async ([path, url]) => {
    const name = path.split('/').pop()!.replace('.wav', '');
    try {
      const data = await (await fetch(url)).arrayBuffer();
      buffers.set(name, await c.decodeAudioData(data));
    } catch {
      /* fehlt die Aufnahme, bleibt der synthetische Anteil */
    }
  })).then(() => undefined);
  return loadingAll;
}

/** Aufnahme als nahtlose Schleife (für Dauerklänge); null, wenn sie (noch) nicht geladen ist */
export function loopSample(g: Graph, dest: AudioNode, name: string): AudioBufferSourceNode | null {
  const b = buffers.get(name);
  if (!b) return null;
  const src = g.ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.connect(dest);
  return src;
}

/** Aufnahme abspielen (Tonhöhe über die Abspielrate); false, wenn sie (noch) nicht geladen ist */
export function sample(g: Graph, dest: AudioNode, name: string, o: { t: number; rate?: number; gain: number; offset?: number; dur?: number }): boolean {
  const b = buffers.get(name);
  if (!b) return false;
  const src = g.ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = o.rate ?? 1;
  const env = g.ctx.createGain();
  env.gain.value = o.gain;
  if (o.dur) {
    env.gain.setValueAtTime(o.gain, o.t + o.dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  }
  src.connect(env).connect(dest);
  src.start(o.t, o.offset ?? 0, o.dur);
  return true;
}

/** Hall-Antwort: zwei Sekunden abklingendes, nach oben weicher werdendes Stereo-Rauschen mit kurzer Vorverzögerung */
function impulse(ctx: BaseAudioContext, sec = 2.4): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const pre = Math.floor(ctx.sampleRate * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      // tiefpassgefiltertes Rauschen; die Filterung nimmt mit der Zeit zu (Höhen klingen schneller ab)
      const k = 0.55 - 0.4 * t;
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, 2.6) * (1 + 0.15 * Math.sin(i * 0.0007 + ch));
    }
  }
  return buf;
}

function build(ctx: BaseAudioContext, withMeter: boolean): Graph {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  master.connect(comp).connect(lim).connect(ctx.destination);
  let meter: AnalyserNode | undefined;
  if (withMeter) {
    meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    lim.connect(meter);
  }
  const verb = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  const ret = ctx.createGain();
  ret.gain.value = 0.9;
  verb.connect(conv).connect(ret).connect(master);
  const duck = ctx.createGain();
  duck.connect(master);
  const bus = {} as Record<Bus, GainNode>;
  for (const b of BUSES) {
    bus[b] = ctx.createGain();
    bus[b].connect(b === 'amb' || b === 'music' ? duck : master);
  }
  const g: Graph = { ctx, master, bus, verb, duck, meter };
  applyLevels(g);
  return g;
}

function applyLevels(g: Graph): void {
  const t = g.ctx.currentTime;
  g.master.gain.setTargetAtTime(settings.on ? settings.master : 0, t, 0.05);
  for (const b of BUSES) g.bus[b].gain.setTargetAtTime(settings[b] * settings[b], t, 0.05);
}

/** Lautstärke eines Kanals oder des Gesamtpegels setzen (0–1) */
export function setLevel(k: 'master' | Bus, v: number): void {
  settings[k] = Math.max(0, Math.min(1, v));
  save();
  if (live) applyLevels(live);
}

export function setMusicStyle(v: AudioSettings['style']): void {
  settings.style = v;
  save();
  onChange.forEach((f) => f());
}

export function setOn(on: boolean): void {
  settings.on = on;
  save();
  if (live) applyLevels(live);
  onChange.forEach((f) => f());
  if (on) ensure();
}

const onChange: (() => void)[] = [];
export function onAudioChange(f: () => void): void {
  onChange.push(f);
}

/** Klangkontext anlegen bzw. wecken (nach einer Berührung aufrufen) */
export function ensure(): Graph | null {
  if (!settings.on) return null;
  try {
    if (!live) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      live = build(ctx, true);
      void preloadSamples();
      onChange.forEach((f) => f());
    }
    const c = live.ctx as AudioContext;
    if (c.state === 'suspended' && !document.hidden) void c.resume();
    return live;
  } catch {
    return null;
  }
}

/** Graph für den nächsten Klang; null, wenn stumm oder noch kein Kontext */
export function graph(): Graph | null {
  if (cur) return cur;
  if (!settings.on) return null;
  return live ?? ensure();
}

export function liveContext(): AudioContext | null {
  return (live?.ctx as AudioContext) ?? null;
}

/** Im Hintergrund pausieren (spart Akku), beim Zurückkehren weiter */
export function initLifecycle(): void {
  const unlock = () => ensure();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    const c = live?.ctx as AudioContext | undefined;
    if (!c) return;
    if (document.hidden) void c.suspend();
    else if (settings.on) void c.resume();
  });
}

// ---------- Bausteine ----------

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    const n = ctx.sampleRate * 2;
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Ausgang einer Stimme: Panorama, Kanal, Hall-Anteil. Gibt den Knoten zurück, in den die Stimme spielt. */
export function voiceOut(g: Graph, bus: Bus, opts: { pan?: number; verb?: number; gain?: number } = {}): GainNode {
  const v = g.ctx.createGain();
  v.gain.value = opts.gain ?? 1;
  let tail: AudioNode = v;
  if (opts.pan) {
    const p = g.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, opts.pan));
    v.connect(p);
    tail = p;
  }
  tail.connect(g.bus[bus]);
  if (opts.verb) {
    const s = g.ctx.createGain();
    s.gain.value = opts.verb;
    tail.connect(s).connect(g.verb);
  }
  return v;
}

/** Hüllkurve: Anstieg, Abfall auf Haltepegel, Ausklang (exponentiell, klickfrei) */
export function adsr(p: AudioParam, t: number, peak: number, a: number, d: number, sus: number, hold: number, r: number): number {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + a);
  p.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
  p.setValueAtTime(Math.max(0.0001, peak * sus), t + a + d + hold);
  p.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
  return t + a + d + hold + r;
}

/** Oszillator mit Hüllkurve und optionaler Tonhöhenkurve */
export function tone(g: Graph, dest: AudioNode, o: { type?: OscillatorType; f: number; to?: number; t: number; a?: number; d?: number; sus?: number; hold?: number; r?: number; gain: number; detune?: number; glide?: number }): void {
  const c = g.ctx;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, o.t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.t + (o.glide ?? (o.a ?? 0.005) + (o.d ?? 0.1)));
  if (o.detune) osc.detune.value = o.detune;
  const env = c.createGain();
  const end = adsr(env.gain, o.t, o.gain, o.a ?? 0.005, o.d ?? 0.1, o.sus ?? 0.0001, o.hold ?? 0, o.r ?? 0.05);
  osc.connect(env).connect(dest);
  osc.start(o.t);
  osc.stop(end + 0.02);
}

/** FM-Glocke: Träger mit modulierender Teilfrequenz (Verhältnis ratio) – metallisch bis gläsern */
export function bell(g: Graph, dest: AudioNode, o: { f: number; t: number; ratio?: number; index?: number; dur?: number; gain: number; a?: number }): void {
  const c = g.ctx;
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const mg = c.createGain();
  const env = c.createGain();
  const dur = o.dur ?? 0.8;
  car.frequency.value = o.f;
  mod.frequency.value = o.f * (o.ratio ?? 3.5);
  const idx = (o.index ?? 2) * o.f;
  mg.gain.setValueAtTime(idx, o.t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.05), o.t + dur * 0.7);
  mod.connect(mg).connect(car.frequency);
  adsr(env.gain, o.t, o.gain, o.a ?? 0.003, dur, 0.0001, 0, 0.02);
  car.connect(env).connect(dest);
  car.start(o.t); mod.start(o.t);
  car.stop(o.t + dur + 0.1); mod.stop(o.t + dur + 0.1);
}

/** Gefiltertes Rauschen mit Hüllkurve und optionaler Filterfahrt (Zischen, Wusch, Explosion, Klick) */
export function noise(g: Graph, dest: AudioNode, o: { t: number; type?: BiquadFilterType; f: number; to?: number; q?: number; a?: number; d?: number; sus?: number; hold?: number; r?: number; gain: number; glide?: number; rate?: number }): void {
  const c = g.ctx;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  src.playbackRate.value = o.rate ?? 1;
  const flt = c.createBiquadFilter();
  flt.type = o.type ?? 'bandpass';
  flt.Q.value = o.q ?? 1;
  flt.frequency.setValueAtTime(o.f, o.t);
  const a = o.a ?? 0.004, d = o.d ?? 0.1;
  if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, o.t + (o.glide ?? a + d));
  const env = c.createGain();
  const end = adsr(env.gain, o.t, o.gain, a, d, o.sus ?? 0.0001, o.hold ?? 0, o.r ?? 0.05);
  src.connect(flt).connect(env).connect(dest);
  src.start(o.t, Math.random() * 1.5);
  src.stop(end + 0.02);
}

/** Weiche Sättigung (für Druck bei Explosionen und Triebwerken) */
export function shaper(g: Graph, drive = 2.5): WaveShaperNode {
  const ws = g.ctx.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/** Atmosphäre und Klangteppich kurz absenken (z. B. bei Kapitel-Fanfare) */
export function duckFor(sec: number, depth = 0.45): void {
  const g = graph();
  if (!g) return;
  const t = g.ctx.currentTime;
  g.duck.gain.cancelScheduledValues(t);
  g.duck.gain.setTargetAtTime(depth, t, 0.06);
  g.duck.gain.setTargetAtTime(1, t + sec, 0.6);
}

// ---------- Mengenbegrenzung ----------

const last = new Map<string, number>();
/** true, wenn der Klang gespielt werden darf (Mindestabstand je Name, verhindert Klangbrei bei Serien) */
export function gate(name: string, ms: number): boolean {
  if (cur && cur !== live) return true;
  const now = performance.now();
  if (now - (last.get(name) ?? -1e9) < ms) return false;
  last.set(name, now);
  return true;
}

export const vary = (x: number, p = 0.04) => x * (1 + (Math.random() * 2 - 1) * p);

// ---------- Vorab-Rendern (Prüfung und Hörproben) ----------

/** Spielt fn in einen Offline-Kontext und gibt die Stereo-Samples zurück */
export async function renderOffline(fn: () => void, sec: number, rate = 44100): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, Math.ceil(sec * rate), rate);
  const g = build(off, false);
  const prev = cur;
  cur = g;
  try { fn(); } finally { cur = prev; }
  return off.startRendering();
}

/** Spitzenpegel am Ausgang (0–1) der letzten ~45 ms – für Tests */
export function meterPeak(): number {
  const m = live?.meter;
  if (!m) return 0;
  const d = new Float32Array(m.fftSize);
  m.getFloatTimeDomainData(d);
  let p = 0;
  for (const x of d) p = Math.max(p, Math.abs(x));
  return p;
}
