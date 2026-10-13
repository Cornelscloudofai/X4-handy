// Klangdatei übernehmen: dekodieren, Stille am Ende abschneiden, Spitze auf −1 dBFS normalisieren,
// verlustfrei als WAV (16 Bit, Originalrate, Stereo bleibt Stereo) → src/assets/sounds/<name>.wav
// node scripts/import-sound.mjs <eingabe.(ogg|wav|mp3)> <name>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launchOpts } from './browser.mjs';

const [input, name] = process.argv.slice(2);
if (!input || !name) { console.error('Aufruf: node scripts/import-sound.mjs <datei> <name>'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
await page.goto('about:blank');
const r = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const buf = await ctx.decodeAudioData(bin.buffer);
  const chs = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  let peak = 0, last = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (v > 0.001 * peak && v > 1e-4) last = Math.max(last, i); }
  const gain = Math.pow(10, -1 / 20) / (peak || 1);
  const n = Math.min(chs[0].length, last + Math.floor(buf.sampleRate * 0.02));
  const nc = chs.length;
  const pcm = new Int16Array(n * nc);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    // die letzten 20 ms weich ausblenden
    const fade = i > n - buf.sampleRate * 0.02 ? (n - i) / (buf.sampleRate * 0.02) : 1;
    pcm[i * nc + c] = Math.max(-1, Math.min(1, chs[c][i] * gain * fade)) * 32767;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return { pcm: btoa(s), sr: buf.sampleRate, nc, dur: n / buf.sampleRate, gainDb: 20 * Math.log10(gain) };
}, readFileSync(input).toString('base64'));
await browser.close();
const data = Buffer.from(r.pcm, 'base64');
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
h.writeUInt16LE(r.nc, 22); h.writeUInt32LE(r.sr, 24); h.writeUInt32LE(r.sr * r.nc * 2, 28); h.writeUInt16LE(r.nc * 2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
mkdirSync(`${root}src/assets/sounds`, { recursive: true });
writeFileSync(`${root}src/assets/sounds/${name}.wav`, Buffer.concat([h, data]));
console.log(`${name}.wav ${r.dur.toFixed(2)} s · ${r.nc} Kanäle · ${r.sr} Hz · Pegel ${r.gainDb >= 0 ? '+' : ''}${r.gainDb.toFixed(1)} dB · ${Math.round((44 + data.length) / 1024)} KB`);
