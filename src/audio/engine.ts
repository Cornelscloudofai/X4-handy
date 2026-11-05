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

// WAV (alte Aufnahmen) und Ogg mit FLAC (Sonniss: verlustfrei gepackt, gleiche Qualität bei etwa halber Größe)
const SAMPLE_URLS = import.meta.glob('../assets/sounds/*.{wav,ogg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URL_OF = new Map(Object.entries(SAMPLE_URLS).map(([path, url]) => [path.split('/').pop()!.replace(/\.(wav|ogg)$/, ''), url]));
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<void>>();

/** Eine Aufnahme laden und dekodieren (einmal je Kontext-Sitzung) */
function loadSample(c: BaseAudioContext, name: string): Promise<void> {
  let p = loading.get(name);
  if (!p) {
    const url = URL_OF.get(name);
    p = url ? fetch(url).then((r) => r.arrayBuffer()).then((d) => c.decodeAudioData(d)).then((b) => { buffers.set(name, b); }).catch(() => { /* fehlt die Aufnahme, bleibt der synthetische Anteil */ }) : Promise.resolve();
    loading.set(name, p);
  }
  return p;
}

/**
 * Aufnahmen laden: ohne Filter alle auf einmal (Tests); mit Präfix gestaffelt im Hintergrund – höchstens drei Dateien
 * zugleich, Schüsse vor Explosionen vor dem Rest. Beim Start nur die kleinen alten (`es-*`, zusammen unter 1 MB), die großen
 * Kampf- und Werkzeugklänge (`sn-*`, Sonniss) erst, wenn ein Minispiel geöffnet wird. Was gerade gebraucht wird, lädt
 * sample() ohnehin sofort selbst nach.
 */
export function preloadSamples(ctx?: BaseAudioContext, prefix?: string): Promise<void> {
  const c = ctx ?? live?.ctx;
  if (!c) return Promise.resolve();
  const names = [...URL_OF.keys()].filter((n) => !prefix || n.startsWith(prefix));
  if (!prefix) return Promise.all(names.map((n) => loadSample(c, n))).then(() => undefined);
  const rank = (n: string) => (/schleife|alarm|boss/.test(n) ? 3 : /expl|huelle|treffer|schild/.test(n) ? 1 : /gestein|kristall|phase|kyon|funke/.test(n) ? 2 : 0);
  const queue = names.filter((n) => !loading.has(n)).sort((x, y) => rank(x) - rank(y));
  const worker = async () => { for (let n = queue.shift(); n; n = queue.shift()) await loadSample(c, n); };
  return Promise.all([worker(), worker(), worker()]).then(() => undefined);
}

/** fn ausführen, sobald diese Aufnahmen geladen sind – sind sie es schon, sofort (auch beim Offline-Rendern) */
export function whenLoaded(names: string[], fn: () => void): void {
  if (names.every((n) => buffers.has(n))) { fn(); return; }
  void ensureSamples(names).then(fn);
}

/** Bestimmte Aufnahmen laden (z. B. für die Hörprobe) – fertig, sobald genau diese bereit sind */
export function ensureSamples(names: string[]): Promise<void> {
  const g = graph();
  if (!g) return Promise.resolve();
  return Promise.all(names.map((n) => loadSample(g.ctx, n))).then(() => undefined);
}

/**
 * Lautheit je Aufnahme (dB RMS, beim Import gemessen: Einzelklänge die ersten 0,3 s, Schleifen die ganze Länge) – damit
 * alle Varianten gleich laut einsetzen. Aufnahmen `sn-*`: Sonniss GDC Game Audio Bundles, siehe assets/sounds/QUELLEN.md
 */
const RMS: Record<string, number> = {
  'sn-puls-a': -8.5, 'sn-puls-b': -11.5, 'sn-puls-c': -7.7, 'sn-bolzen-a': -13.7, 'sn-bolzen-b': -10.3, 'sn-bolzen-c': -19.8,
  'sn-schrot-a': -11.2, 'sn-schrot-b': -9.1, 'sn-plasma-a': -9.5, 'sn-plasma-b': -13.3, 'sn-neutron-a': -8.7, 'sn-neutron-b': -6.1,
  'sn-tau-a': -10.8, 'sn-tau-b': -11.1, 'sn-thermal-a': -9, 'sn-thermal-b': -11.5, 'sn-boson-a': -7.8, 'sn-boson-b': -8.8,
  'sn-schwer-a': -10.5, 'sn-schwer-b': -14.3, 'sn-gegner-a': -15, 'sn-gegner-b': -14.1, 'sn-gegner-c': -13.6,
  'sn-expl-s-a': -5.6, 'sn-expl-s-b': -6.5, 'sn-expl-s-c': -7.2, 'sn-expl-m-a': -9.9, 'sn-expl-m-b': -4.6, 'sn-expl-m-c': -5.1,
  'sn-expl-l-a': -7.6, 'sn-expl-l-b': -9, 'sn-expl-l-c': -6.5, 'sn-expl-boss-a': -7.2, 'sn-expl-boss-b': -9.7,
  'sn-huelle-a': -17.5, 'sn-huelle-b': -9.8, 'sn-huelle-c': -6.7,
  'sn-rakete-a': -7.5, 'sn-rakete-b': -18.5, 'sn-rakete-c': -10.2, 'sn-rakete-d': -13.8, 'sn-treffer-a': -14.5, 'sn-treffer-b': -10.5,
  'sn-treffer-c': -12.8, 'sn-treffer-d': -17.4, 'sn-schild-a': -13.4, 'sn-schild-b': -16.7, 'sn-schild-c': -17.9, 'sn-funke-a': -10.7,
  'sn-funke-b': -19.4, 'sn-kyon-a': -14.2, 'sn-phase-a': -15.1, 'sn-phase-b': -20.9, 'sn-phase-c': -15.7, 'sn-phase-d': -20.9,
  'sn-gestein-a': -20.1, 'sn-gestein-b': -17.5, 'sn-gestein-c': -19.2, 'sn-gestein-d': -12.5, 'sn-kristall-a': -30.4, 'sn-kristall-b': -21.2,
  'sn-kristall-c': -10.1, 'sn-alarm-a': -8, 'sn-alarm-b': -15.6, 'sn-alarm-c': -25.3,
  'sn-bergbau-a-schleife': -12.7, 'sn-bergbau-b-schleife': -15.2, 'sn-bergbau-c-schleife': -13.6, 'sn-strahl-a-schleife': -14.1,
  'sn-strahl-b-schleife': -13.2, 'sn-traktor-a-schleife': -23.6, 'sn-traktor-b-schleife': -25, 'sn-traktor-c-schleife': -32.5,
  'sn-triebwerk-a-schleife': -14.1, 'sn-triebwerk-b-schleife': -14.4,
  // Kandidaten zum Probehören (`kd-*`, nur in der Hörprobe)
  'kd-ablehnen-1': -21.3, 'kd-ablehnen-2': -15.4, 'kd-ablehnen-3': -18.3, 'kd-ablehnen-4': -15.4,
  'kd-andocken-1': -15.6, 'kd-andocken-2': -22.0, 'kd-andocken-3': -10.6, 'kd-angenommen-1': -15.3,
  'kd-angenommen-2': -15.9, 'kd-aufsammeln-1': -11.0, 'kd-aufsammeln-2': -17.3, 'kd-aufsammeln-3': -8.5,
  'kd-baubeginn-1': -13.6, 'kd-baubeginn-2': -10.2, 'kd-baubeginn-3': -17.1, 'kd-baubeginn-4': -21.1,
  'kd-baufertig-1': -15.5, 'kd-baufertig-2': -13.4, 'kd-baufertig-3': -8.2, 'kd-boss-1': -28.2, 'kd-boss-2': -15.0,
  'kd-boss-3': -9.9, 'kd-boss-4': -10.7, 'kd-container-1': -10.1, 'kd-container-2': -18.1, 'kd-container-3': -10.0,
  'kd-credits-1': -17.6, 'kd-credits-2': -8.5, 'kd-credits-3': -23.4, 'kd-erledigt-1': -18.1, 'kd-erledigt-2': -12.3,
  'kd-erledigt-3': -3.3, 'kd-explosion-1': -9.2, 'kd-explosion-10': -15.3, 'kd-explosion-11': -26.8,
  'kd-explosion-12': -7.5, 'kd-explosion-13': -11.8, 'kd-explosion-2': -12.0, 'kd-explosion-3': -7.8,
  'kd-explosion-4': -14.1, 'kd-explosion-5': -7.7, 'kd-explosion-6': -8.6, 'kd-explosion-7': -11.2,
  'kd-explosion-8': -10.4, 'kd-explosion-9': -4.8, 'kd-fluss-1': -9.3, 'kd-fluss-2': -37.1, 'kd-fluss-3': -32.7,
  'kd-kapitel-1': -20.1, 'kd-kapitel-2': -19.9, 'kd-kapitel-3': -31.5, 'kd-kristall-1': -29.5, 'kd-kristall-2': -22.7,
  'kd-kristall-3': -27.6, 'kd-nachricht-1': -14.7, 'kd-nachricht-2': -9.9, 'kd-nachricht-3': -27.6,
  'kd-niederlage-1': -12.1, 'kd-niederlage-2': -15.5, 'kd-oeffnen-1': -11.4, 'kd-oeffnen-2': -15.1,
  'kd-oeffnen-3': -21.8, 'kd-oeffnen-4': -25.9, 'kd-schliessen-1': -22.7, 'kd-schliessen-2': -12.9,
  'kd-schub-1': -27.4, 'kd-schub-2': -9.2, 'kd-schub-3': -27.2, 'kd-schuss-1': -8.8, 'kd-schuss-10': -8.8,
  'kd-schuss-11': -9.3, 'kd-schuss-12': -12.0, 'kd-schuss-13': -9.0, 'kd-schuss-14': -19.7, 'kd-schuss-15': -14.0,
  'kd-schuss-16': -14.5, 'kd-schuss-17': -8.8, 'kd-schuss-18': -14.1, 'kd-schuss-19': -23.1, 'kd-schuss-2': -10.6,
  'kd-schuss-20': -13.5, 'kd-schuss-21': -7.4, 'kd-schuss-22': -14.2, 'kd-schuss-23': -9.1, 'kd-schuss-3': -9.9,
  'kd-schuss-4': -14.4, 'kd-schuss-5': -14.5, 'kd-schuss-6': -14.6, 'kd-schuss-7': -10.5, 'kd-schuss-8': -6.7,
  'kd-schuss-9': -8.9, 'kd-start-1': -23.2, 'kd-start-2': -30.9, 'kd-start-3': -21.5, 'kd-start-4': -20.6,
  'kd-steuerduese-1': -14.2, 'kd-steuerduese-2': -9.0, 'kd-steuerduese-3': -10.1, 'kd-tippen-1': -23.2,
  'kd-tippen-2': -17.8, 'kd-tippen-3': -17.3, 'kd-tippen-4': -15.1, 'kd-tor-1': -13.9, 'kd-tor-2': -27.2,
  'kd-tor-3': -34.8, 'kd-ventil-1': -20.3, 'kd-ventil-2': -11.6, 'kd-ventil-3': -21.0, 'kd-warnung-1': -11.1,
  'kd-warnung-2': -10.7, 'kd-warnung-3': -10.5,
};
/** Pegel, der eine Aufnahme auf −10 dB RMS bringt (höchstens +12 dB) */
export const norm = (name: string) => Math.min(4, Math.pow(10, (-10 - (RMS[name] ?? -10)) / 20));

const lastPick = new Map<string, string>();
/** Für die Hörprobe: diese Aufnahme statt einer zufälligen Variante */
let forced: string | null = null;
/** Variante wählen – nie zweimal hintereinander dieselbe (Hörprobe: die gewünschte) */
export function variant(key: string, list: string[]): string {
  // Hörprobe: die gewünschte Aufnahme – auch ein Kandidat, der (noch) nicht in der Liste steht
  if (forced) return forced;
  const prev = lastPick.get(key);
  const pool = list.length > 1 ? list.filter((x) => x !== prev) : list;
  const v = pool[Math.floor(Math.random() * pool.length)];
  lastPick.set(key, v);
  return v;
}
/** Hörprobe einer bestimmten Variante: fn spielt den Klang, dabei wird name gewählt */
export function withVariant(name: string, fn: () => void): void {
  forced = name;
  try { fn(); } finally { forced = null; }
}

/** Aufnahme als nahtlose Schleife (für Dauerklänge); null, wenn sie (noch) nicht geladen ist */
export function loopSample(g: Graph, dest: AudioNode, name: string): AudioBufferSourceNode | null {
  const b = buffers.get(name);
  if (!b) { void loadSample(g.ctx, name); return null; }
  const src = g.ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.connect(dest);
  return src;
}

/** Aufnahme abspielen (Tonhöhe über die Abspielrate); false, wenn sie (noch) nicht geladen ist */
export function sample(g: Graph, dest: AudioNode, name: string, o: { t: number; rate?: number; gain: number; offset?: number; dur?: number }): boolean {
  const b = buffers.get(name);
  // noch nicht geladen: jetzt nachladen (dieses Mal klingt der Ersatz)
  if (!b) { if (!(g.ctx instanceof OfflineAudioContext)) void loadSample(g.ctx, name); return false; }
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
      void preloadSamples(undefined, 'es-');
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
