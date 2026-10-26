// Trailer aus dem echten Spiel: Szenen nach Drehbuch, Bild für Bild (60 Bilder/s, 1080×1920), Schnitte auf den Takt
// von „kampf-invasion“, Texteinblendungen im Spielstil; ffmpeg setzt Bilder und Musik zur MP4 zusammen.
// node scripts/trailer/trailer.mjs <ausgabeordner> [--preview] [--only=name]
// Schriften: @fontsource/barlow und @fontsource/chakra-petch (Ordner über TRAILER_FONTS), ffmpeg über FFMPEG.
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, recorder, FPS } from './browser.mjs';
import { intoGame, buildEmpire, calmStations, startMini, quitMini, fastForward, ring, zoom, GOD } from './scenes.mjs';

const out = process.argv[2] ?? 'trailer';
const preview = process.argv.includes('--preview');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const encode = process.argv.includes('--encode');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const root = new URL('../../', import.meta.url).pathname;

// Musik: Ausschnitt ab dem ruhigen Teil vor dem Einsatz; T0 = erster Schlag
const SONG = `${root}src/assets/music/kampf-invasion.mp3`;
const beatsRaw = JSON.parse(readFileSync(`${root}src/assets/music/kampf-invasion.beats.json`, 'utf8')).beats;
const T0 = 79.018, LEN = 54;
const beats = beatsRaw.map((b) => b - T0).filter((b) => b > -1 && b < LEN + 2);
const snap = (t) => beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
/** Abschnitt [a, b] in n gleich lange Schnitte, Grenzen auf den Takt gelegt */
const cuts = (a, b, n) => Array.from({ length: n + 1 }, (_, k) => (k === 0 ? a : k === n ? b : snap(a + ((b - a) * k) / n)));

const S = {
  intro: [0, snap(83.905 - T0)],
  econ: [snap(83.905 - T0), snap(92.369 - T0)],
  mini: [snap(92.369 - T0), snap(100.02 - T0)],
  fight: [snap(100.02 - T0), snap(108.182 - T0)],
  missions: [snap(108.182 - T0), snap(116.181 - T0)],
  pause: [snap(116.181 - T0), snap(118.944 - T0)],
  climax: [snap(118.944 - T0), snap(127.582 - T0)],
  end: [snap(127.582 - T0), LEN],
};

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Text-Ebene über dem Spiel (eigene Elemente, jedes Bild aus Node gesetzt) */
const OVERLAY = `(() => {
  if (document.getElementById('tr')) return;
  const st = document.createElement('style');
  st.textContent = \`
    body.tr-clean #hud, body.tr-clean #bottom, body.tr-clean #toasts, body.tr-clean #banner, body.tr-clean #objective, body.tr-clean #card { visibility: hidden !important; }
    #tr { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
    #tr .black { position: absolute; inset: 0; background: #02060c; opacity: 0; }
    #tr .flash { position: absolute; inset: 0; background: #e8fffb; opacity: 0; mix-blend-mode: screen; }
    #tr .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(2,6,12,.55) 100%); opacity: 0; }
    #tr .band { position: absolute; left: 0; right: 0; height: 190px; transform: translateY(-50%); background: linear-gradient(transparent, rgba(2,6,12,.72) 30%, rgba(2,6,12,.72) 70%, transparent); opacity: 0; }
    #tr .txt { position: absolute; left: 16px; right: 16px; transform: translateY(-50%); text-align: center; opacity: 0; }
    #tr .big { font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 40px; line-height: 1.05; letter-spacing: .07em; color: #effffb;
      text-shadow: 0 0 22px rgba(63,224,197,.9), 0 0 6px rgba(63,224,197,.7), 0 2px 10px rgba(0,0,0,.95); }
    #tr .small { font-family: 'Barlow', sans-serif; font-weight: 600; font-size: 18px; letter-spacing: .05em; color: #bff7ec; margin-top: 10px;
      text-shadow: 0 1px 8px rgba(0,0,0,.95), 0 0 2px #000; }
    #tr .logo { font-size: 50px; letter-spacing: .1em; }
    #tr .eyebrow { font-family: 'Chakra Petch', sans-serif; font-weight: 600; font-size: 15px; letter-spacing: .32em; color: #3fe0c5; margin-bottom: 10px; text-shadow: 0 1px 6px #000; }
  \`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.id = 'tr';
  d.innerHTML = '<div class="vig"></div><div class="black"></div><div class="band"></div><div class="txt"><div class="eyebrow"></div><div class="big"></div><div class="small"></div></div><div class="flash"></div>';
  document.body.appendChild(d);
})()`;

/** Zustand der Text-Ebene für ein Bild */
async function overlay(page, o) {
  await page.evaluate((o) => {
    const r = document.getElementById('tr');
    const q = (c) => r.querySelector(c);
    const txt = q('.txt'), band = q('.band');
    q('.big').textContent = o.big ?? '';
    q('.big').classList.toggle('logo', !!o.logo);
    q('.small').textContent = o.small ?? '';
    q('.eyebrow').textContent = o.eyebrow ?? '';
    q('.eyebrow').style.display = o.eyebrow ? '' : 'none';
    q('.small').style.display = o.small ? '' : 'none';
    txt.style.top = band.style.top = `${o.y ?? 30}%`;
    txt.style.opacity = String(o.a ?? 0);
    txt.style.transform = `translateY(-50%) scale(${o.s ?? 1})`;
    txt.style.letterSpacing = '';
    band.style.opacity = String((o.a ?? 0) * (o.band ?? 1));
    q('.flash').style.opacity = String(o.flash ?? 0);
    q('.black').style.opacity = String(o.black ?? 0);
    q('.vig').style.opacity = String(o.vig ?? 0.8);
    document.body.classList.toggle('tr-clean', !!o.clean);
  }, o);
}

/** Einblendung: kurz größer, dann ruhig; am Ende weich weg */
function title(t, a, b, fin = 0.22, fout = 0.2) {
  if (t < a || t > b) return { a: 0 };
  const i = ease((t - a) / fin), o = ease((b - t) / fout);
  return { a: Math.min(i, o), s: 1.1 - 0.1 * ease((t - a) / (fin * 1.6)) };
}

// ---------- Szenen ----------
// Jede Szene: setup (nicht aufgenommen) und tick je Bild (lokale Zeit t in s, Anteil u), dazu Text

const drive = {
  ore: async (page, f) => { const p = await page.evaluate(() => window.__mg.game.debugVeinTouch()); if (p) { await page.mouse.move(p[0], p[1]); if (f === 0) await page.mouse.down(); } },
  pipes: async (page, f) => { if (f % 10 === 0) { const p = await page.evaluate(() => { const g = window.__mg.game; const i = g.debugWrongCell(); return i >= 0 ? g.cellCenter(i) : null; }); if (p) await page.mouse.click(p[0], p[1]); } },
  // Autopilot steuert; mit window.__trPin bleibt der Spieler an einer Stelle (Bildaufbau), dreht und feuert aber
  auto: async (page) => { await page.evaluate((god) => { eval(god); const g = window.__mg?.game; g?.autopilot?.(); const p = window.__trPin; if (g && p) { g.px = p.x; g.py = p.y; g.pvx = g.pvy = 0; } }, GOD); },
};

/** Kamerafahrt auf der Karte: von (x0, z0, zoom0) nach (x1, z1, zoom1), Zoom exponentiell */
async function camPath(page, u, from, to) {
  await page.evaluate(({ u, from, to }) => {
    const g = window.__game, c = g.cam, f = c.fitZoom;
    c.target = null; c.vx = c.vz = 0;
    c.x = from.x + (to.x - from.x) * u; c.z = from.z + (to.z - from.z) * u;
    c.zoom = f * Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * u);
  }, { u, from, to });
}

function scenes(page) {
  const list = [];
  const add = (name, t0, t1, setup, tick, text) => list.push({ name, t0, t1, setup, tick, text });
  let st = null;
  const station = async () => (st ??= await page.evaluate(() => window.__game.state.stations.map((s) => ({ x: s.x, z: s.z }))));

  // 1) Intro: ruhige Fahrt über den Sektor bis an die eigene Station
  add('intro', ...S.intro, async () => { await station(); }, async (t, u) => {
    await calmStations(page);
    await camPath(page, ease(u * 0.95), { x: 0, z: -40, zoom: 0.95 }, { x: st[0].x, z: st[0].z, zoom: 6 });
  }, (t) => {
    const T = S.intro[1] - S.intro[0];
    const a = title(t, 0.5, 2.5), b = title(t, 2.7, T - 0.15);
    return { clean: true, y: 22, ...(t < 2.6 ? { ...a, big: 'EIN SEKTOR.', small: 'Leer, rau, voller Möglichkeiten.' } : { ...b, big: 'DEINE FAMILIE.', small: 'Dein Weg zum Handelsimperium.' }), black: Math.max(0, 1 - t / 0.6) };
  });

  // 2) Wirtschaft: vier Schnitte
  const ec = cuts(...S.econ, 4);
  add('baue', ec[0], ec[1], async () => { await station(); }, async (t, u) => {
    await calmStations(page);
    await camPath(page, u, { x: st[0].x - 2, z: st[0].z + 1, zoom: 18 }, { x: st[0].x + 1.5, z: st[0].z - 0.5, zoom: 26 });
  }, (t) => ({ clean: true, y: 20, ...title(t, 0.05, ec[1] - ec[0] - 0.05, 0.12), big: 'BAUE', small: 'Module, Lager, Werften', flash: Math.max(0, 0.9 - t * 3) }));
  add('handle', ec[1], ec[2], async () => { await station(); }, async (t, u) => {
    await calmStations(page);
    await camPath(page, u, { x: st[0].x + 25, z: st[0].z - 30, zoom: 2.4 }, { x: st[0].x + 10, z: st[0].z - 5, zoom: 3.1 });
  }, (t) => ({ clean: true, y: 20, ...title(t, 0.05, ec[2] - ec[1] - 0.05, 0.12), big: 'HANDLE', small: 'Warenflüsse, Händler, Miner' }));
  add('plane', ec[2], ec[3], async () => {
    await page.evaluate(() => { const g = window.__game; g.openPanel('station', g.state.stations[0].id, 'modules'); g.refresh(); });
    await page.clock.runFor(500);
  }, async () => { await calmStations(page); }, (t) => ({ clean: false, y: 82, ...title(t, 0.05, ec[3] - ec[2] - 0.05, 0.12), big: 'PLANE', small: 'Produktionsketten bis zur eigenen Werft' }));
  add('wachse', ec[3], ec[4], async () => {
    await page.evaluate(() => { const g = window.__game; g.ui.panel = null; g.refresh(); });
    await page.clock.runFor(200);
    await page.click('[data-act="galaxy"]', { timeout: 3000 }).catch(() => {});
    await page.clock.runFor(600);
  }, async () => {}, (t) => ({ clean: true, y: 20, ...title(t, 0.05, ec[4] - ec[3] - 0.05, 0.12), big: 'WACHSE', small: 'Sektor um Sektor' }));

  // 3) Minispiele
  const mc = cuts(...S.mini, 4);
  const mini = [
    ['ore', 'Erz mit dem Laser schürfen', async () => { await startMini(page, 'ore', { level: 3 }); await page.clock.runFor(1200); }, drive.ore],
    ['orbit', 'Andocken nach Kepler', async () => { await startMini(page, 'orbit', { level: 3 }); await page.clock.runFor(500); }, async () => {}],
    ['gas', 'Gas sammeln im Nebel', async () => { await startMini(page, 'gas', { level: 3 }); await fastForward(page, 4); }, drive.auto],
    ['pipes', 'Störungen beheben', async () => { await startMini(page, 'pipes', { level: 3 }); await page.clock.runFor(300); }, drive.pipes],
  ];
  mini.forEach(([kind, small, setup, tick], i) => {
    add(`mini-${kind}`, mc[i], mc[i + 1], async () => { await page.mouse.up(); await quitMini(page); await setup(); }, async (t, u, f) => tick(page, f), (t) => ({ y: 26, ...title(t, 0.05, mc[i + 1] - mc[i] - 0.05, 0.15), eyebrow: i === 0 ? 'SELBST AM STEUER' : 'SELBST AM STEUER', big: '', small, flash: i === 0 ? Math.max(0, 0.7 - t * 3) : 0 }));
  });

  // 4) Kampf
  const fc = cuts(...S.fight, 3);
  const fight = [
    ['VERTEIDIGE', 'deine Frachter gegen Piraten', async () => {
      await startMini(page, 'pirates', { level: 3, gear: 2, loadout: { ship: 'klapperschlange', lturret: 'boson', weapon: 'puls' } });
      await fastForward(page, 1);
      await ring(page, ['jaeger', 'kanone', 'jaeger', 'rakete', 'jaeger', 'kanone', 'jaeger', 'jaeger'], 270);
      await zoom(page, 1.0);
      await fastForward(page, 0.6);
    }],
    ['XENON', 'K-Segmente mit Laser- und Plasmatürmen', async () => {
      await startMini(page, 'xenon', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await fastForward(page, 1);
      await page.evaluate(() => { const g = window.__mg.game; g.spawnBoss(); const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent); b.x = g.px + 40; b.y = g.py - 300; for (const e of g.enemies) if (e.parent === b) { e.x = b.x; e.y = b.y; } window.__trPin = { x: g.px, y: g.py }; });
      await ring(page, ['n', 'n', 'n', 'n', 'n', 'n'], 260, 0, Math.PI);
      await zoom(page, 1.05);
      await fastForward(page, 1.4);
    }],
    ['KHA’AK', 'Späher-Cluster und Kyon-Strahlen', async () => {
      await startMini(page, 'khaak', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await fastForward(page, 0.5);
      await page.evaluate(() => { const g = window.__mg.game; g.spawnCluster(9, g.px + 260, g.py - 300, 'ks'); g.spawnCluster(9, g.px - 280, g.py - 240, 'kj'); g.spawnCluster(4, g.px + 40, g.py + 330, 'ks'); for (const [dx, dy, k0] of [[-40, -300, 'kk'], [200, 60, 'ka'], [-220, 80, 'ka']]) { const k = g.makeEnemy(k0, g.px + dx, g.py + dy); k.target = 'p'; g.enemies.push(k); } window.__trPin = { x: g.px, y: g.py }; });
      await zoom(page, 1.1);
      await fastForward(page, 0.8);
    }],
  ];
  fight.forEach(([big, small, setup], i) => {
    add(`fight-${i}`, fc[i], fc[i + 1], async () => { await quitMini(page); await setup(); }, async () => drive.auto(page), (t) => ({ y: i === 1 ? 76 : 24, ...title(t, 0.05, fc[i + 1] - fc[i] - 0.05, 0.12), big, small, eyebrow: i === 0 ? 'KAMPF' : '', flash: i === 0 ? Math.max(0, 0.8 - t * 3) : 0 }));
  });

  // 5) Einsätze und Elite-Gegner
  const nc = cuts(...S.missions, 3);
  const miss = [
    ['7 EINSÄTZE', 'Nest ausheben · Station halten · Konvoi · Bergung', async () => {
      await startMini(page, 'xenon', { level: 3, gear: 1, mission: 'nest', loadout: { ship: 'dragon' } });
      // das Nest erscheint mit der ersten Welle mitten auf der Karte (fX, fY)
      await page.evaluate(() => { const g = window.__mg.game; g.px = g.fX - 30; g.py = g.fY + 300; window.__trPin = { x: g.px, y: g.py }; });
      await fastForward(page, 2.5);
      await zoom(page, 0.85);
      await fastForward(page, 1.2);
    }],
    ['STATION HALTEN', 'Angriffe aus allen Richtungen', async () => {
      await startMini(page, 'khaak', { level: 3, gear: 2, mission: 'station', loadout: { ship: 'dragon' } });
      await fastForward(page, 6);
      await page.evaluate(() => { const g = window.__mg.game; const w = g.wards[0]; g.px = g.wx(w) + 40; g.py = g.wy(w) + 230; window.__trPin = { x: g.px, y: g.py }; for (const e of g.enemies.filter((q) => !q.parent).slice(0, 14)) { const a = Math.random() * Math.PI * 2; e.x = g.wx(w) + Math.cos(a) * 330; e.y = g.wy(w) + Math.sin(a) * 330; } });
      await zoom(page, 0.85);
      await fastForward(page, 0.8);
    }],
    ['ELITE-GEGNER', 'Gepanzert · Flink · Splitter · Kommandant · Rächer', async () => {
      await startMini(page, 'pirates', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await fastForward(page, 0.5);
      await page.evaluate(() => {
        const g = window.__mg.game;
        g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
        const k = ['kanone', 'jaeger', 'rakete', 'kanone', 'jaeger'], types = ['gepanzert', 'flink', 'splitter', 'kommandant', 'raecher'];
        types.forEach((t, i) => { const a = -Math.PI / 2 + (i - 2) * 0.62; const e = g.makeEnemy(k[i], g.px + Math.cos(a) * 200, g.py + Math.sin(a) * 200); g.makeElite(e, t); e.grp = 77; e.target = 'p'; e.cd = 1 + i * 0.3; g.enemies.push(e); });
        for (let q = 0; q < 2; q++) { const e = g.makeEnemy('jaeger', g.px + 120 + q * 50, g.py - 260); e.grp = 77; e.target = 'p'; g.enemies.push(e); }
      });
      await zoom(page, 1.2);
    }],
  ];
  miss.forEach(([big, small, setup], i) => {
    add(`mission-${i}`, nc[i], nc[i + 1], async () => { await quitMini(page); await setup(); }, async (t) => {
      // Rächer: nach gut einer Sekunde abschießen – der Warnkreis zieht sich zusammen, dann die Explosion
      if (i === 2 && Math.abs(t - 1.0) < 0.009) await page.evaluate(() => { const g = window.__mg.game; const r = g.enemies.find((e) => e.elite === 'raecher'); if (r) g.damageEnemy(r, 1e6, 1); });
      await drive.auto(page);
    }, (t) => ({ y: i === 2 ? 20 : 76, ...title(t, 0.05, nc[i + 1] - nc[i] - 0.05, 0.12), big, small }));
  });

  // 6) Pause in der Musik: Schwarz, eine Frage
  add('pause', ...S.pause, async () => { await station(); await quitMini(page); await page.evaluate(() => { const g = window.__game; g.ui.view = 'sector'; g.refresh(); }); }, async (t, u) => {
    await calmStations(page);
    await camPath(page, u, { x: st[0].x, z: st[0].z, zoom: 9 }, { x: st[0].x, z: st[0].z, zoom: 11 });
  }, (t) => ({ clean: true, y: 46, ...title(t, 0.35, S.pause[1] - S.pause[0] - 0.1, 0.35, 0.15), big: 'BEREIT?', small: 'Familie Zhin zählt auf dich.', band: 0, black: 0.86 }));

  // 7) Höhepunkt: schnelle Schnitte auf jeden zweiten Schlag
  const kc = cuts(...S.climax, 9);
  const climax = [
    async () => { // Brutschiff-Kern feuert den Kyon-Ring
      await startMini(page, 'khaak', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await page.evaluate(() => { const g = window.__mg.game; g.spawnBoss(); const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent); b.x = g.px + 20; b.y = g.py - 250; g.enemies = g.enemies.filter((e) => e.parent !== b); b.cd = 0.15; window.__trPin = { x: g.px, y: g.py }; });
      await zoom(page, 1.0);
    },
    async () => { // Klapperschlange: Breitseite
      await startMini(page, 'pirates', { level: 3, gear: 2, loadout: { ship: 'klapperschlange', lturret: 'plasma' } });
      await ring(page, ['kanone', 'kanone', 'rakete', 'kanone', 'jaeger', 'jaeger'], 300);
      await zoom(page, 0.95);
      await fastForward(page, 0.9);
    },
    async () => { // K-Segment: Laser laden und feuern
      await startMini(page, 'xenon', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await page.evaluate(() => { const g = window.__mg.game; g.spawnBoss(); const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent); b.x = g.px - 20; b.y = g.py - 165; window.__trPin = { x: g.px, y: g.py }; });
      await zoom(page, 1.05);
      await fastForward(page, 2.2);
    },
    async () => { // Rächer explodiert aus der Nähe
      await startMini(page, 'xenon', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = []; g.px += 520; g.py += 160; for (let i = 0; i < 6; i++) { const a = i * 1.2; const e = g.makeEnemy(i ? 'n' : 'm', g.px + 20 + Math.cos(a) * 70, g.py - 180 + Math.sin(a) * 70); if (!i) g.makeElite(e, 'raecher'); g.enemies.push(e); } const r = g.enemies[0]; g.damageEnemy(r, 1e6, 1); window.__trPin = { x: g.px, y: g.py }; });
      await zoom(page, 1.3);
      await fastForward(page, 0.4);
    },
    async () => { // großer Späher-Cluster bricht auf
      await startMini(page, 'khaak', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await page.evaluate(() => { const g = window.__mg.game; g.spawnCluster(25, g.px, g.py - 520, 'ks'); });
      await zoom(page, 1.05);
      await fastForward(page, 0.55);
    },
    async () => { // Wolf: Raketenschwarm
      await startMini(page, 'pirates', { level: 3, gear: 2, loadout: { ship: 'wolf', missile: 'schwarm' } });
      await ring(page, ['jaeger', 'jaeger', 'jaeger', 'jaeger', 'jaeger', 'jaeger', 'jaeger', 'jaeger'], 300, -Math.PI * 0.95, Math.PI * 0.9);
      await page.evaluate(() => { const g = window.__mg.game; g.aimA = -Math.PI / 2; g.fireMissiles(true); });
      await zoom(page, 1.25);
      await page.clock.runFor(120);
    },
    async () => { // Piratenfregatte explodiert
      await startMini(page, 'pirates', { level: 3, gear: 2, loadout: { ship: 'dragon' } });
      await page.evaluate(() => { const g = window.__mg.game; g.spawnBoss(); const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent); b.x = g.px; b.y = g.py - 230; for (const e of g.enemies) if (e.parent === b) { e.x = b.x; e.y = b.y; } window.__trBoss = b; window.__trPin = { x: g.px, y: g.py }; });
      await zoom(page, 1.05);
      await fastForward(page, 0.3);
    },
    async () => { // Kha'ak-Nest mit Blitzen
      await startMini(page, 'khaak', { level: 3, gear: 1, mission: 'nest', loadout: { ship: 'dragon' } });
      await page.evaluate(() => { const g = window.__mg.game; g.px = g.fX + 30; g.py = g.fY + 290; window.__trPin = { x: g.px, y: g.py }; });
      await zoom(page, 0.85);
      await fastForward(page, 2.5);
    },
    async () => { // Erzader: Kernader frei
      await startMini(page, 'ore', { level: 3 });
      await page.clock.runFor(600);
    },
  ];
  climax.forEach((setup, i) => {
    add(`climax-${i}`, kc[i], kc[i + 1], async () => { await page.mouse.up(); await quitMini(page); await setup(); }, async (t, u, f) => {
      if (i === 6 && f === 22) await page.evaluate(() => { const g = window.__mg.game, b = window.__trBoss; if (b) { g.enemies = g.enemies.filter((e) => e.parent !== b); g.killEnemy(b, true); } });
      if (i === 8) await drive.ore(page, f); else await drive.auto(page);
    }, (t) => ({ flash: Math.max(0, 0.45 - t * 2.5) }));
  });

  // 8) Schluss: Logo über der eigenen Station
  add('end', ...S.end, async () => {
    await station();
    await page.mouse.up();
    await quitMini(page);
    await page.evaluate(() => { const g = window.__game; g.ui.view = 'sector'; g.ui.panel = null; g.refresh(); });
  }, async (t, u) => {
    await calmStations(page);
    await camPath(page, u, { x: st[0].x - 3, z: st[0].z, zoom: 14 }, { x: st[0].x + 2, z: st[0].z, zoom: 9 });
  }, (t) => {
    const T = S.end[1] - S.end[0];
    const a = title(t, 0.15, T - 0.5, 0.5, 0.6);
    return { clean: true, y: 44, ...a, s: 1.04 - 0.04 * ease(t / 2), logo: true, eyebrow: 'FAMILIE ZHIN', big: 'X4 SEKTORBAU', small: t > 1.6 ? 'Jetzt spielen – im Browser und auf dem Handy' : '', band: 0, black: 0.55 + 0.45 * ease((t - (T - 0.9)) / 0.9), flash: Math.max(0, 0.6 - t * 2) };
  });
  return list;
}

// ---------- Aufnahme ----------
const frames = `${out}/frames`;
if (!preview && !only) rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const { browser, page } = await open();
await intoGame(page);
await buildEmpire(page);
await page.evaluate(OVERLAY);
await page.clock.runFor(1500);
const rec = recorder(page, frames);
const t0 = Date.now();
for (const s of scenes(page)) {
  if (only && !only.includes(s.name)) continue;
  await s.setup?.();
  // Bilder werden erst bei Bedarf geladen: kurz zeichnen und echte Zeit zum Laden lassen
  await page.clock.runFor(1000 / FPS);
  await page.waitForTimeout(350);
  const n0 = Math.round(s.t0 * FPS), n1 = Math.round(s.t1 * FPS);
  const n = n1 - n0;
  const at = preview ? [Math.floor(n * 0.15), Math.floor(n * 0.6)] : null;
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    await s.tick?.(t, f / n, f);
    await overlay(page, { vig: 0.8, ...(s.text?.(t) ?? {}) });
    if (!preview) { await rec.frameAt(n0 + f); continue; }
    await page.clock.runFor(1000 / FPS);
    if (at.includes(f)) await page.screenshot({ path: `${out}/p-${String(n0).padStart(5, '0')}-${s.name}-${f}.jpg`, type: 'jpeg', quality: 80 });
  }
  console.log(`${s.name}: ${s.t0.toFixed(2)}–${s.t1.toFixed(2)} s (${n} Bilder) · ${Math.round((Date.now() - t0) / 1000)} s`);
}
await browser.close();
if (preview || (only && !encode)) process.exit(0);

// ---------- Schnitt ----------
const mp4 = `${out}/x4-sektorbau-trailer.mp4`;
execFileSync(FFMPEG, ['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`,
  '-ss', String(T0), '-t', String(LEN), '-i', SONG,
  '-filter_complex', `[1:a]afade=t=in:d=0.25,afade=t=out:st=${LEN - 3}:d=3[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '256k', '-shortest', mp4], { stdio: 'inherit' });
console.log('fertig:', mp4, existsSync(mp4));
