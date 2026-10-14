// Musikstück analysieren und eine Taktkarte schreiben: Tempo (BPM), Zeitpunkt jedes Schlags, welche Schläge eine
// „Eins“ sind (4/4), wie kräftig jeder Schlag ist, Lautstärkeverlauf getrennt nach Bass, Mitten und Höhen (15 Werte je Sekunde, 0–255) und
// Abschnitte nach Energie (ruhig, mittel, kräftig). Dekodiert wird im Browser (Web Audio), ohne weitere Werkzeuge.
// node scripts/analyze-beats.mjs <stück.mp3> <ausgabe.json>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('Aufruf: node scripts/analyze-beats.mjs <stück> <ausgabe.json>'); process.exit(1); }
const b64 = (await readFile(input)).toString('base64');
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const res = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await ctx.decodeAudioData(bin.buffer);
  const sr = buf.sampleRate, n = buf.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  // drei Bänder mit einfachen Filtern: Bass < ~150 Hz, Höhen > ~5 kHz, Mitten dazwischen
  const lp = (x, fc) => { const a = 1 - Math.exp((-2 * Math.PI * fc) / sr); const y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); y[i] = s; } return y; };
  const bass = lp(mono, 150), low5k = lp(mono, 5000);
  const hop = 512, frames = Math.floor(n / hop), fps = sr / hop;
  const eB = new Float32Array(frames), eM = new Float32Array(frames), eH = new Float32Array(frames), eA = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let b = 0, m = 0, h = 0, a = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) { const vb = bass[i], vm = low5k[i] - bass[i], vh = mono[i] - low5k[i]; b += vb * vb; m += vm * vm; h += vh * vh; a += mono[i] * mono[i]; }
    eB[f] = Math.sqrt(b / hop); eM[f] = Math.sqrt(m / hop); eH[f] = Math.sqrt(h / hop); eA[f] = Math.sqrt(a / hop);
  }
  // Anschlagsstärke: positiver Anstieg der logarithmischen Energie (Bass zählt doppelt)
  const onset = new Float32Array(frames);
  const lg = (v) => Math.log(1e-4 + v);
  for (let f = 1; f < frames; f++) onset[f] = 2 * Math.max(0, lg(eB[f]) - lg(eB[f - 1])) + Math.max(0, lg(eM[f]) - lg(eM[f - 1])) + 0.5 * Math.max(0, lg(eH[f]) - lg(eH[f - 1]));
  // glätten und Mittel abziehen
  const sm = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const j = f + k; if (j >= 0 && j < frames) { s += onset[j]; c++; } } sm[f] = s / c; }
  const mean = sm.reduce((a, b) => a + b, 0) / frames;
  const on = sm.map((v) => Math.max(0, v - mean));
  // Tempo: Autokorrelation zwischen 60 und 180 BPM, mit leichter Vorliebe für 90–130
  let bestLag = 0, bestScore = -1;
  const scores = [];
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let f = Math.ceil(lag); f < frames; f++) { const j = f - lag, j0 = Math.floor(j), w = j - j0; s += on[f] * (on[j0] * (1 - w) + on[j0 + 1] * w); }
    s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.9, 2));
    scores.push([bpm, s]);
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  const bpm = 60 * fps / bestLag;
  // Schläge per dynamischer Programmierung (Ellis 2007): passt sich kleinen Tempo-Schwankungen an
  const P = bestLag, alpha = 100;
  const score = new Float32Array(frames), prev = new Int32Array(frames).fill(-1);
  for (let f = 0; f < frames; f++) {
    let best = 0, bi = -1;
    for (let j = Math.max(0, Math.round(f - 2 * P)); j <= f - Math.round(P / 2); j++) {
      const v = score[j] - alpha * Math.pow(Math.log((f - j) / P), 2);
      if (v > best || bi < 0) { best = v; bi = j; }
    }
    score[f] = on[f] + (bi >= 0 ? best : 0);
    prev[f] = bi;
  }
  let f = 0; for (let k = Math.max(0, frames - Math.round(2 * P)); k < frames; k++) if (score[k] > score[f]) f = k;
  const beats = [];
  while (f >= 0) { beats.push(f / fps); f = prev[f]; }
  beats.reverse();
  // „Eins“: die Phase (0–3), auf der die Bass-Anschläge im Mittel am stärksten sind
  const bassOn = (t) => { const fr = Math.round(t * fps); let s = 0; for (let k = -2; k <= 2; k++) { const j = fr + k; if (j > 0 && j < frames) s += Math.max(0, lg(eB[j]) - lg(eB[j - 1])); } return s; };
  const phaseScore = [0, 1, 2, 3].map((p) => beats.reduce((a, t, i) => a + (i % 4 === p ? bassOn(t) : 0), 0));
  const phase = phaseScore.indexOf(Math.max(...phaseScore));
  // Stärke jedes Schlags (0–255, auf das 95. Perzentil normiert): wie kräftig dort wirklich angeschlagen wird –
  // daraus blinkt die Grafik unterschiedlich hell (Doppelschläge, Betonungen, leise Takte)
  const hitAt = (t) => { const fr = Math.round(t * fps); let s = 0; for (let k = -2; k <= 2; k++) { const j = fr + k; if (j >= 0 && j < frames) s = Math.max(s, on[j]); } return s; };
  const rawHits = beats.map(hitAt);
  const hs = [...rawHits].sort((x, y) => x - y), h95 = hs[Math.floor(hs.length * 0.95)] || 1;
  const hits = rawHits.map((v) => Math.min(255, Math.round((v / h95) * 230)));
  // Betonung je Taktposition (Mittel über alle Takte, stärkste = 1)
  const groove = [0, 1, 2, 3].map((p) => { let s = 0, c = 0; for (let i = 0; i < beats.length; i++) if ((((i - phase) % 4) + 4) % 4 === p) { s += rawHits[i]; c++; } return s / Math.max(1, c); });
  const gMax = Math.max(...groove) || 1;
  // Lautstärkeverlauf mit 15 Werten je Sekunde, je Band auf das 95. Perzentil normiert
  const rate = 15, step = fps / rate, len = Math.floor(frames / step);
  const env = (e) => {
    const v = []; for (let i = 0; i < len; i++) { let s = 0; const a = Math.floor(i * step), b = Math.floor((i + 1) * step); for (let j = a; j < b; j++) s += e[j]; v.push(s / Math.max(1, b - a)); }
    const sorted = [...v].sort((x, y) => x - y), p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
    return v.map((x) => Math.min(255, Math.round((x / p95) * 230)));
  };
  // Abschnitte: Gesamtenergie über 8 s geglättet, in drei Stufen (Perzentile 35 / 75), mindestens 6 s lang
  const all = env(eA), win = rate * 4;
  const smooth = all.map((_, i) => { let s = 0, c = 0; for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < all.length) { s += all[j]; c++; } } return s / c; });
  const so = [...smooth].sort((x, y) => x - y), q1 = so[Math.floor(so.length * 0.35)], q2 = so[Math.floor(so.length * 0.75)];
  const sections = [];
  for (let i = 0; i < smooth.length; i++) {
    const lvl = smooth[i] < q1 ? 0 : smooth[i] < q2 ? 1 : 2;
    const last = sections[sections.length - 1];
    if (!last || last[1] !== lvl) sections.push([+(i / rate).toFixed(2), lvl]);
  }
  const merged = [];
  for (const s of sections) { const last = merged[merged.length - 1]; if (last && s[0] - last[0] < 6) { last[1] = Math.max(last[1], s[1]); continue; } merged.push(s); }
  return {
    duration: +buf.duration.toFixed(3), bpm: +bpm.toFixed(2), downbeatPhase: phase,
    beats: beats.map((t) => +t.toFixed(3)), hits, groove: groove.map((v) => +(v / gMax).toFixed(2)), rate,
    bass: env(eB), mid: env(eM), high: env(eH), sections: merged,
    top: scores.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b]) => b),
  };
}, b64);
await browser.close();
const { top, ...out } = res;
await writeFile(output, JSON.stringify(out));
console.log(`${input}: ${out.duration} s, ${out.bpm} BPM (Kandidaten ${top.join(', ')}), ${out.beats.length} Schläge, Eins auf Phase ${out.downbeatPhase}, Betonung ${out.groove.join('/')}, Abschnitte ${JSON.stringify(out.sections)}`);
