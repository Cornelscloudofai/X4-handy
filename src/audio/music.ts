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

/** Im Minispiel tritt die Titelmusik zurück */
export function sceneChanged(scene: string): void {
  if (scene === 'minigame') stopTrack(2);
}
