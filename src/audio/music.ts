// Musikstücke als Dateien (src/assets/music): werden erst bei Bedarf geladen und laufen über den Musik-Kanal.
// Die Titelmusik erklingt einmal zu Beginn jeder Sitzung und geht danach weich in den generativen Klangteppich über.
import { graph, liveContext, settings, voiceOut } from './engine';
import { currentScene, onSoundscapeStart, setTrackActive } from './ambience';
import titelUrl from '../assets/music/titel-galactic-horizons.mp3';

const cache = new Map<string, Promise<AudioBuffer | null>>();
function load(url: string): Promise<AudioBuffer | null> {
  let p = cache.get(url);
  if (!p) {
    const c = liveContext();
    p = c ? fetch(url).then((r) => r.arrayBuffer()).then((d) => c.decodeAudioData(d)).catch(() => null) : Promise.resolve(null);
    cache.set(url, p);
  }
  return p;
}

let playing: { src: AudioBufferSourceNode; out: GainNode } | null = null;

/** Laufendes Stück ausblenden */
export function stopTrack(fade = 1.5): void {
  const c = liveContext();
  if (!playing || !c) return;
  const { src, out } = playing;
  playing = null;
  out.gain.cancelScheduledValues(c.currentTime);
  out.gain.setTargetAtTime(0, c.currentTime, fade / 3);
  src.stop(c.currentTime + fade + 0.2);
  setTrackActive(false);
}

/** Titelmusik abspielen (einmal, weiches Ein- und Ausblenden) */
export async function playTitle(): Promise<void> {
  if (!settings.on) return;
  const g = graph();
  if (!g) return;
  stopTrack(0.8);
  setTrackActive(true);
  const buf = await load(titelUrl);
  if (!buf || !liveContext()) { setTrackActive(false); return; }
  const c = g.ctx;
  const out = voiceOut(g, 'music', {});
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(out);
  const t = c.currentTime + 0.05;
  // etwas leiser als Effekte: die Musik bleibt im Hintergrund
  const level = 0.85;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(level, t + 2.5);
  out.gain.setValueAtTime(level, t + Math.max(3, buf.duration - 6));
  out.gain.linearRampToValueAtTime(0.0001, t + buf.duration);
  src.start(t);
  const me = { src, out };
  playing = me;
  src.onended = () => { if (playing === me) { playing = null; setTrackActive(false); } };
}

// Beim Start der Klangwelt einmal pro Sitzung die Titelmusik (nicht mitten im Minispiel)
let titlePlayed = false;
onSoundscapeStart(() => {
  if (titlePlayed || currentScene() === 'minigame') return;
  titlePlayed = true;
  void playTitle();
});

/** Im Minispiel tritt die Titelmusik zurück; außerhalb endet die Minispielmusik */
export function sceneChanged(scene: string): void {
  if (scene === 'minigame') stopTrack(2);
  else gameTrack?.stop(2);
}

/** Musik eines Minispiels: läuft in Schleife, lässt sich anhalten und fortsetzen und kennt ihre Position im Stück */
export interface GameTrack {
  /** Position im Stück (s) – null, solange es noch lädt oder der Ton aus ist */
  time(): number | null;
  pause(): void;
  resume(): void;
  stop(fade?: number): void;
}

let gameTrack: GameTrack | null = null;

export function playGameTrack(url: string, level = 0.8): GameTrack {
  gameTrack?.stop(0.5);
  let src: AudioBufferSourceNode | null = null, out: GainNode | null = null, buf: AudioBuffer | null = null;
  let t0 = 0, offset = 0, paused = false, stopped = false;
  const c = liveContext();
  const begin = (from: number) => {
    const g = graph();
    if (!g || !buf || stopped) return;
    out = voiceOut(g, 'music', {});
    src = g.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(out);
    const t = g.ctx.currentTime + 0.05;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(level, t + 1.2);
    src.start(t, from % buf.duration);
    t0 = t - (from % buf.duration);
  };
  const halt = (fade: number) => {
    const g = liveContext();
    if (!src || !out || !g) return;
    out.gain.cancelScheduledValues(g.currentTime);
    out.gain.setTargetAtTime(0, g.currentTime, fade / 3);
    src.stop(g.currentTime + fade + 0.2);
    src = null;
    out = null;
  };
  const track: GameTrack = {
    time: () => (src && c && buf ? (c.currentTime - t0) % buf.duration : paused ? offset : null),
    pause: () => { if (!src || !c || !buf) { paused = true; return; } offset = (c.currentTime - t0) % buf.duration; paused = true; halt(0.3); },
    resume: () => { if (!paused) return; paused = false; begin(offset); },
    stop: (fade = 1.5) => { stopped = true; halt(fade); if (gameTrack === track) { gameTrack = null; setTrackActive(false); } },
  };
  gameTrack = track;
  if (settings.on && c) {
    setTrackActive(true);
    void load(url).then((b) => { buf = b; if (b && !paused) begin(0); });
  }
  return track;
}

/** Mehrere Lieder für ein Minispiel: jede Runde eines davon, möglichst nicht dasselbe wie in der Runde davor */
const lastPick = new Map<string, string>();
export function playOneOf(key: string, urls: string[], level = 0.8): GameTrack {
  const prev = lastPick.get(key);
  const pool = urls.length > 1 ? urls.filter((u) => u !== prev) : urls;
  const url = pool[Math.floor(Math.random() * pool.length)];
  lastPick.set(key, url);
  return playGameTrack(url, level);
}
