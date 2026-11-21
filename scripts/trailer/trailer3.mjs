// Trailer 3: ein Stück („Ethereal Journey“, 2:42, 129 BPM) von Anfang bis Ende, lange Kamerafahrten, schnelle Schnitte
// nur im Höhepunkt. Ablauf nach dem Aufbau des Stücks: Intro (Galaxiekarte) – Beat setzt ein (Glutsee) – Hauptthema
// (Zyarth, Peilung, nach der Pause bei 48 s die Erstsichtung) – volle Energie (Hangar mit Kamerafahrt Mamba → Raptor,
// Katapultstart, Breitseite) – Breakdown (Sektorkarte, der Xenon K zieht heran) – Aufbau (K eröffnet das Feuer) –
// Höhepunkt (Flak, Silos, Breitseite, Vorhalten, Abschüsse) – K zerbricht – Logo.
// Bild für Bild aus dem echten Spiel (60 Bilder/s, 1080×1920); CSS-Animationen laufen dabei nach der Spieluhr.
// node scripts/trailer/trailer3.mjs <ausgabeordner> [--preview] [--only=name,…] [--encode]
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, recorder, FPS } from './browser.mjs';
import { intoGame, buildEmpire, calmStations, quitMini, fastForward, zoom, GOD } from './scenes.mjs';
import { OVERLAY, overlay, title, ease } from './overlay.mjs';
import { playSim, simTab } from '../simNav.mjs';

const out = process.argv[2] ?? 'trailer3';
const preview = process.argv.includes('--preview');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const encode = process.argv.includes('--encode');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const here = new URL('./', import.meta.url).pathname;

// ---------- Musik und Zeitplan ----------
const MUSIC = `${here}musik/ethereal-journey.mp3`;
const beats = JSON.parse(readFileSync(`${here}musik/ethereal-journey.beats.json`, 'utf8')).beats;
const LEN = 161.87;
const snap = (t) => beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
/** Abschnitt [a, b] in Schnitte mit diesen Anteilen, Grenzen auf den Takt */
const split = (a, b, w) => { const sum = w.reduce((p, q) => p + q, 0); let acc = 0; return [a, ...w.slice(0, -1).map((x) => snap(a + ((b - a) * (acc += x)) / sum)), b]; };
/** Einsatz nach der Pause im Hauptthema (Stille 46,3–48,0 s) */
const HIT = 48.1;

const S = {
  intro: [0, snap(16.33)],
  glut: [snap(16.33), snap(31.33)],
  zyarth: [snap(31.33), snap(40)],
  peil: [snap(40), HIT],
  reveal: [HIT, snap(55.3)],
  ausblick: [snap(55.3), snap(67.93)],
  hangar: [snap(67.93), snap(81.8)],
  launch: [snap(81.8), snap(89.2)],
  broad: [snap(89.2), snap(104.07)],
  sector: [snap(104.07), snap(116)],
  kcome: [snap(116), snap(127.67)],
  kfire: [snap(127.67), snap(136.4)],
  climax: [snap(136.4), snap(150.2)],
  kdie: [snap(150.2), snap(156.07)],
  end: [snap(156.07), LEN],
};

// ---------- Hilfen ----------
const KEY = 'x4-sektorbau-ausruestung';
/** Ausrüstung komplett setzen (über „Rückgängig“ im Hangar – das Spiel hält sie im Speicher) */
async function setLoadout(page, lo, keepModal = false) {
  await page.evaluate(({ lo, KEY, keepModal }) => {
    const full = { weapon: 'puls', turret: 'puls', shield: 'schwer', missile: 'lenk', wing: {}, groups: undefined, ...lo };
    localStorage.setItem(KEY, JSON.stringify(full));
    const g = window.__game, before = g.ui.modal;
    g.ui.modal = { ...(keepModal && before?.type === 'loadout' ? before : { type: 'loadout' }), undo: full }; g.refresh();
    const b = document.createElement('button'); b.dataset.act = 'lo-undo'; document.getElementById('app').appendChild(b); b.click(); b.remove();
    if (!keepModal) { g.ui.modal = null; g.refresh(); }
  }, { lo, KEY, keepModal });
}
const RAPTOR_GROUPS = (m, l) => Array.from({ length: 11 }, (_, i) => (i >= 8 ? l : typeof m === 'function' ? m(i) : m));

/** Kampf starten (Menü wie ein Spieler), danach ohne Besonderheit, Banner und Spielerhinweise */
async function fight(page, kind, lo, { level = 3, gear = 2 } = {}) {
  await quitMini(page);
  await setLoadout(page, lo);
  await page.evaluate(({ level, gear }) => { const g = window.__game; g.ui.modal = { type: 'minigames' }; g.refresh(); }, { level, gear });
  await page.clock.runFor(300);
  await page.evaluate(() => { window.__trPin = null; window.__trTick = null; });
  await playSim(page, kind, { level, gear });
  await page.clock.runFor(300);
  await page.click('#minigame [data-mg="start"]');
  await page.clock.runFor(50);
  await page.evaluate(() => {
    const g = window.__mg.game;
    if ('mutator' in g) g.mutator = null;
    if ('banner' in g) Object.defineProperty(g, 'banner', { get: () => 0, set: () => {}, configurable: true });
    if (g.floats?.add) { const add = g.floats.add.bind(g.floats); g.floats.add = (x, y, text, ...r) => (/kein Werfer|leer|Nachladen|im Anflug|Welle/.test(String(text)) ? undefined : add(x, y, text, ...r)); }
  });
}

/** Je Bild: Autopilot, unverwundbar, Spieler an fester Stelle (window.__trPin), eigene Szenenhandlung (window.__trTick) */
async function drive(page, t, u) {
  await page.evaluate(({ god, t, u }) => {
    eval(god);
    const g = window.__mg?.game;
    if (!g) return;
    g.autopilot?.();
    const p = window.__trPin;
    if (p) { g.px = p.x; g.py = p.y; g.pvx = g.pvy = 0; if (p.a != null) g.aimA = p.a; }
    if (window.__trTick) window.__trTick(g, t, u);
  }, { god: GOD, t, u });
}

/** Gegner aufstellen (relativ zum Spieler), unverwüstlich wenn hold */
async function foes(page, list, hold = false) {
  await page.evaluate(({ list, hold }) => {
    const g = window.__mg.game;
    for (const [k, dx, dy] of list) { const e = g.makeEnemy(k, g.px + dx, g.py + dy); e.target = 'p'; e.cd = 0.3 + Math.random(); if (hold) { e.hp = e.max = 1e9; } g.enemies.push(e); }
  }, { list, hold });
}

/** Kamera der Sektorkarte (Zoom relativ zur Einpassung) */
async function camPath(page, u, from, to, cam = 'cam') {
  await page.evaluate(({ u, from, to, cam }) => {
    const c = window.__game[cam], f = c.fitZoom;
    c.target = null; c.vx = c.vz = 0;
    c.x = from.x + (to.x - from.x) * u; c.z = from.z + (to.z - from.z) * u;
    c.zoom = f * Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * u);
  }, { u, from, to, cam });
}

/** Xenon K vor den Spieler stellen (Abstand dy nach vorn) – Türme ruhig, bis cd gesetzt wird */
const PLACE_K = (dy, quiet) => `(() => {
  const g = window.__mg.game;
  g.enemies = []; g.spawnBoss(false);
  // keine weiteren Wellen: nach dem K kommt nichts mehr nach
  g.spawnWave = () => {}; g.reinforce = [];
  const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent);
  const dx = g.px - b.x, d = g.py - ${dy} - b.y;
  for (const e of g.enemies) if (e === b || e.parent === b) { e.x += dx; e.y += d; e.cd = ${quiet ? '1e9' : 'Math.random() * 0.4'}; }
  window.__trK = b;
  window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 };
})()`;

/** CSS-Animationen nach der Spieluhr (sonst liefen sie bei der Bild-für-Bild-Aufnahme in Echtzeit davon) */
const SYNC_ANIMS = () => {
  const now = performance.now();
  for (const a of document.getAnimations()) {
    if (a.__t0 == null) { a.__t0 = now - (Number(a.currentTime) || 0); a.pause(); }
    a.currentTime = now - a.__t0;
  }
};

// ---------- Szenen ----------
function scenes(page) {
  const list = [];
  const add = (name, [t0, t1], setup, tick, text) => list.push({ name, t0, t1, setup, tick, text });
  const D = (k) => S[k][1] - S[k][0];
  const sec = (id) => page.evaluate((id) => { const g = window.__game; g.ui.modal = null; g.ui.panel = null; g.gotoSector(id); g.ui.selection = null; g.refresh(); }, id);
  /** Sektor mit Szenenbild, langsame Fahrt */
  const sectorShot = (name, id, from, to, text) => add(name, S[name], async () => {
    await page.evaluate(() => { const g = window.__game; g.ui.view = 'sector'; g.refresh(); });
    await page.evaluate((id) => { const g = window.__game; if (id.startsWith('f-') && !(g.state.frontier?.discovered ?? []).includes(id)) g.discover(id); document.getElementById('reveal')?.remove(); }, id);
    await page.clock.runFor(100);
    await page.evaluate(() => document.getElementById('reveal')?.remove());
    await sec(id);
    await page.evaluate(() => { const g = window.__game; g.ui.bgMode = 'image'; g.refresh(); });
    await page.clock.runFor(400);
  }, async (t, u) => {
    await calmStations(page);
    await camPath(page, ease(u), from, to);
  }, text);

  // ===== Intro (0–16 s): aus der Schwärze über die Galaxiekarte, alle Sektoren aufgedeckt =====
  add('intro', S.intro, async () => {
    await page.evaluate(() => {
      const g = window.__game, s = g.state;
      s.frontier = { ...(s.frontier ?? {}), signatures: s.frontier?.signatures ?? [], discovered: [] };
      g.ui.modal = null; g.ui.panel = null; g.ui.view = 'galaxy'; g.ui.galaxySel = null; g.refresh();
      const b = document.createElement('button'); b.dataset.act = 'dev-reveal'; document.getElementById('app').appendChild(b); b.click(); b.remove();
    });
    await page.clock.runFor(600);
    await page.evaluate(() => { const c = window.__game.galaxyCam; window.__trG = { x: c.x, z: c.z }; });
  }, async (t, u) => {
    // langsamer Zug von oben hinein und leicht abwärts
    await page.evaluate((u) => { const c = window.__game.galaxyCam, o = window.__trG; c.target = null; c.vx = c.vz = 0; c.x = o.x; c.z = o.z - 1.6 + 2.4 * u; c.zoom = c.fitZoom * (0.82 + 0.5 * u); }, ease(u));
  }, (t) => ({ clean: true, y: 15, ...title(t, 3.5, D('intro') - 0.6, 0.8, 0.6), eyebrow: 'X4 SEKTORBAU', big: 'UNBEKANNTER RAUM', small: '19 Sektoren hinter erloschenen Toren', band: 0.6, black: Math.max(0, 1 - t / 2.2) }));

  // ===== Beat setzt ein (16–31 s): Glutsee im Strahlungssturm, eine Phrase lang =====
  sectorShot('glut', 'f-glut1', { x: -90, z: 40, zoom: 0.9 }, { x: 70, z: -30, zoom: 1.9 },
    (t) => ({ clean: true, y: 82, ...title(t, 1.2, 5.6, 0.4, 0.5), big: 'GLUTSEE I', small: 'Strahlungssturm, Sonne bei 3000 %', flash: Math.max(0, 0.35 - t * 1.5) }));

  // ===== Hauptthema (31–48 s): Zyarth's Dominion, dann Peilung bis in die Pause =====
  sectorShot('zyarth', 'zyarth', { x: 30, z: -10, zoom: 1.4 }, { x: -20, z: 12, zoom: 1.0 },
    (t) => ({ clean: true, y: 82, ...title(t, 0.8, 4.8, 0.4, 0.5), big: "ZYARTH'S DOMINION I" }));

  add('peil', S.peil, async () => {
    await page.evaluate(() => {
      const g = window.__game, s = g.state;
      s.credits = Math.max(s.credits, 5e6);
      s.frontier = { ...s.frontier, signatures: [], discovered: (s.frontier?.discovered ?? []).filter((x) => x !== 'f-ausblick') };
      g.gotoSector('rhy'); g.ui.view = 'galaxy'; g.ui.galaxySel = 'rhy'; g.refresh();
    });
    await page.clock.runFor(400);
    await page.evaluate(() => { document.body.classList.remove('tr-clean'); const on = document.querySelector('.dev-reveal.on'); if (on) on.click(); });
    await page.clock.runFor(300);
    await page.click('.gx-card [data-act="sector-tab"][data-tab="explore"]').catch(() => {});
    await page.clock.runFor(200);
    if (await page.locator('.gx-card [data-act="scout-buy"]').count()) { await page.click('.gx-card [data-act="scout-buy"]'); await page.clock.runFor(300); }
    await page.click('.gx-card [data-act="scout-peil"]');
    await page.clock.runFor(800);
    await page.click('#peilung [data-peil="start"]').catch(() => {});
    await page.clock.runFor(600);
  }, async (t, u) => {
    // suchen, einschwenken, halten
    await page.evaluate((u) => {
      const p = window.__peil; if (!p) return;
      const k = Math.min(1, u * 1.5);
      p.set(p.target + (1 - k) * 1.4 * Math.sin(u * 8));
      p.setFreq(p.tf + (1 - k) * 0.3 * Math.cos(u * 6));
    }, u);
  }, (t) => ({ clean: true, y: 13, ...title(t, 0.4, 4.6, 0.3, 0.4), big: 'PEILEN', small: 'Kanal 9 meldet eine Torsignatur', black: Math.max(0, Math.min(1, (t - (D('peil') - 1.6)) / 1.6)) }));

  // Einsatz nach der Pause: Erstsichtung mit Lichtblitz
  add('reveal', S.reveal, async () => {
    await page.evaluate(() => document.getElementById('peilung')?.remove());
    await page.evaluate(() => { const g = window.__game, s = g.state; s.frontier.discovered = (s.frontier.discovered ?? []).filter((x) => x !== 'f-ausblick'); g.ui.view = 'galaxy'; g.ui.modal = null; g.refresh(); g.discover('f-ausblick'); });
    await page.clock.runFor(60);
  }, async () => {}, (t) => ({ clean: true, flash: Math.max(0, 0.9 - t * 2.2) }));

  sectorShot('ausblick', 'f-ausblick', { x: -10, z: 25, zoom: 0.9 }, { x: 15, z: -5, zoom: 1.55 },
    (t) => ({ clean: true, y: 82, ...title(t, 1.5, 6, 0.5, 0.6), big: "RHY'S AUSBLICK", small: 'seit 31 Jahren unbesetzt' }));

  // ===== Volle Energie (68–104 s) =====
  // Hangar: Kamerafahrt durch die Größen – Mamba, Cobra, Klapperschlange, Raptor im Großdock
  let hstep = 0;
  const HSEQ = [['mamba', 0], ['cobra', 3.2], ['klapperschlange', 6.6], ['raptor', 9.8]];
  add('hangar', S.hangar, async () => {
    await page.evaluate(() => { document.getElementById('reveal')?.remove(); const g = window.__game; g.ui.view = 'sector'; g.gotoSector('zhin'); });
    await setLoadout(page, { ship: 'mamba', groups: RAPTOR_GROUPS((i) => (i % 3 === 1 ? 'rakete' : 'puls'), 'silo'), wing: { mamba: 12 } });
    await page.evaluate(() => { const g = window.__game; g.ui.modal = { type: 'minigames' }; g.refresh(); });
    await page.clock.runFor(300);
    await simTab(page, 'combat');
    await page.clock.runFor(200);
    await page.click('#modal [data-act="loadout-open"]');
    await page.clock.runFor(900);
    hstep = 0;
  }, async (t) => {
    const i = HSEQ.findLastIndex(([, at]) => t >= at);
    if (i > hstep) {
      hstep = i;
      const cur = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) ?? '{}');
      await setLoadout(page, { ...cur, ship: HSEQ[i][0] }, true);
    }
  }, (t) => ({ clean: true, y: 13, ...title(t, 10.6, D('hangar') - 0.2, 0.3, 0.3), eyebrow: 'NEU IN DER FLOTTE', big: 'TRÄGER RAPTOR', small: '3,2 km · 122 Türme · Hangar für 20 Mambas' }));

  // Katapultstart der Staffel
  add('launch', S.launch, async () => {
    await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.refresh(); });
    await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'boson'), wing: { mamba: 16 } }, { level: 2 });
    await zoom(page, 0.42);
    await page.evaluate(() => { const g = window.__mg.game; g.camPan = -0.05; g.launchCd = 0; window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.radioT = -99; });
    await fastForward(page, 0.95);
  }, async (t, u) => {
    await drive(page, t, u);
    // Kamera wandert langsam mit den Jägern nach vorn
    await page.evaluate((u) => { window.__mg.game.camPan = -0.05 - 0.55 * u; }, ease(u));
  }, () => ({}));

  // Breitseite: lange Fahrt am Raptor entlang vom Heck zum Bug, Puls-Türme und L-Bosonenlanzen
  add('broad', S.broad, async () => {
    await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'boson'), wing: {} });
    await zoom(page, 0.34);
    await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = 0.85; });
    await foes(page, [['kanone', -760, 900], ['kanone', 780, 700], ['rakete', -820, 300], ['kanone', 800, -100], ['jaeger', -700, -500], ['jaeger', 720, -900], ['rakete', 760, -1300], ['kanone', -760, -1100], ['kanone', -700, -1700], ['jaeger', 760, -1900]], true);
    await fastForward(page, 1.2);
  }, async (t, u) => {
    await drive(page, t, u);
    await page.evaluate((u) => { const g = window.__mg.game; g.camPan = 0.85 - 1.75 * u; }, ease(u));
  }, () => ({}));

  // ===== Breakdown (104–128 s) =====
  // Sektorkarte: Raptor mit Staffel, die Klapperschlange feuert aus der Ferne
  add('sector', S.sector, async () => {
    await quitMini(page);
    await page.evaluate(() => {
      const g = window.__game, s = g.state, st = s.stations[0];
      g.gotoSector(st.sector); g.ui.view = 'sector';
      for (const cls of ['raptor', 'rattlesnake']) if (!s.ships.some((x) => x.cls === cls)) g.actions.buyShip(s, cls, st.id);
      const rp = s.ships.find((x) => x.cls === 'raptor'), rs = s.ships.find((x) => x.cls === 'rattlesnake');
      rp.wing = 12;
      const b = document.createElement('button'); b.dataset.act = 'test-attack'; b.dataset.id = st.sector; document.getElementById('app').appendChild(b); b.click(); b.remove();
      const h = s.hostiles.list[s.hostiles.list.length - 1];
      h.foe = 'xenon'; h.n = 6; h.power = 9000; h.hp = 9000;
      window.__trMap = { rp, rs, h, hx: st.x + 5, hz: st.z + 4 }; // nah an der Station, mitten im Szenenbild
      g.ui.bgMode = 'image';
      g.ui.selection = null; g.ui.paused = false; g.refresh();
    });
  }, async (t, u) => {
    const m = await page.evaluate(() => { const m = window.__trMap; const { rp, rs, h, hx, hz } = m; h.hp = Math.max(h.hp, 4000); h.phase = 'hunt'; h.until = 1e12; h.x = hx; h.z = hz; h.path = []; rp.x = hx - 3; rp.z = hz + 2; rp.path = []; rs.x = hx - 16; rs.z = hz - 4; rs.path = []; return { hx, hz }; });
    await camPath(page, ease(u), { x: m.hx - 7, z: m.hz + 2, zoom: 8 }, { x: m.hx - 4, z: m.hz, zoom: 12 });
  }, (t) => ({ clean: true, y: 14, ...title(t, 1.2, 6.5, 0.5, 0.6), big: 'IM SEKTOR', small: 'Staffel und Fernfeuer der Klapperschlange' }));

  // Der Xenon K zieht heran und füllt langsam das Bild (noch ohne Feuer)
  add('kcome', S.kcome, async () => {
    await fight(page, 'xenon', { ship: 'dragon', wing: {} });
    await page.evaluate(PLACE_K(2600, true));
    await zoom(page, 0.22);
    await fastForward(page, 0.3);
    await page.evaluate(() => { window.__trKy = window.__trK.y; });
  }, async (t, u) => {
    await page.evaluate((u) => {
      const g = window.__mg.game, b = window.__trK; if (!b) return;
      // Ziel: 1050 vor dem Spieler; alle Teile gemeinsam verschieben
      const want = g.py - 2600 + 1550 * u, d = want - b.y;
      for (const e of g.enemies) if (e === b || e.parent === b) { e.y += d; e.vy = 0; e.cd = 1e9; }
      g.zoom = g.zoomGoal = 0.22 + 0.14 * u;
    }, ease(u));
    await drive(page, t, u);
  }, (t) => ({ y: 82, ...title(t, D('kcome') - 4.2, D('kcome') - 0.2, 0.5, 0.3), big: 'XENON K', small: 'acht L- und vierzehn M-Türme' }));

  // ===== Aufbau (128–136 s): der K eröffnet das Feuer =====
  add('kfire', S.kfire, async () => {
    await page.evaluate(() => { const g = window.__mg.game, b = window.__trK; for (const e of g.enemies) if (e === b || e.parent === b) e.cd = Math.random() * 0.6; });
  }, async (t, u) => drive(page, t, u), () => ({}));

  // ===== Höhepunkt (136–150 s): schnelle Schnitte =====
  const cc = split(...S.climax, [1, 1, 1, 1, 1]);
  const C = [
    ['flak', async () => {
      await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'boson'), wing: { mamba: 16 } });
      await zoom(page, 0.36);
      await page.evaluate(() => { const g = window.__mg.game; window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; });
      await fastForward(page, 6);
      await page.evaluate(() => {
        const g = window.__mg.game;
        g.enemies = g.enemies.filter((e) => e.kind === 'cargo');
        g.spawnBoss(false, 0, true);
        const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent);
        const dx = g.px + 120 - b.x, dy = g.py - 1100 - b.y;
        for (const e of g.enemies) if (e === b || e.parent === b) { e.x += dx; e.y += dy; }
        b.hp = b.max = 1e9;
        g.camPan = -0.9;
        for (const w of g.wings) if (w.state === 'fly') { w.x = b.x + (Math.random() - 0.5) * 500; w.y = b.y + 260 + Math.random() * 300; w.tgt = b; }
      });
      await fastForward(page, 0.6);
    }],
    ['silo', async () => {
      await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'silo'), wing: {} });
      await zoom(page, 0.55);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -0.2; for (const t of g.pTur) { if (t.type === 'silo') { t.cd = 0.1 + Math.random() * 0.3; t.salvo = 0; } else t.cd = 1e9; } });
      await foes(page, [['kanone', -700, -700], ['kanone', 650, -850], ['rakete', 0, -1150], ['kanone', -800, -1000], ['jaeger', 750, -550]], true);
    }],
    ['broad2', async () => {
      await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'boson'), wing: {} });
      await zoom(page, 0.27);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -0.15; });
      await foes(page, [['kanone', -760, -500], ['kanone', 780, -300], ['rakete', -820, 100], ['kanone', 800, 300], ['jaeger', -700, -150], ['jaeger', 720, -700], ['rakete', 760, 600], ['kanone', -760, 520]], true);
      await fastForward(page, 1.2);
    }],
    ['lead', async () => {
      await fight(page, 'pirates', { ship: 'klapperschlange', lturret: 'boson', weapon: 'puls', wing: {} });
      await zoom(page, 0.32);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -1; });
      await foes(page, [['jaeger', -80, -820], ['jaeger', 170, -900], ['jaeger', -260, -980], ['kanone', 60, -1120], ['jaeger', 320, -800]], true);
      await page.evaluate(() => { window.__trTick = (g) => { g.fireId = 1; for (const e of g.enemies) if (e.kind !== 'cargo') e.vx *= 0.9; }; });
      await fastForward(page, 0.4);
    }],
    ['booms', async () => {
      await fight(page, 'pirates', { ship: 'dragon', wing: {} });
      await zoom(page, 0.72);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -0.3; });
      await foes(page, [['kanone', -150, -330], ['jaeger', 110, -260], ['rakete', 200, -420], ['jaeger', -220, -230], ['kanone', 30, -480], ['jaeger', 230, -200]], true);
      // Abschüsse nacheinander auf die Schläge
      await page.evaluate(() => { const at = [0.15, 0.6, 1.05, 1.5, 1.95, 2.4]; window.__trTick = (g, t) => { const i = at.findIndex((x) => Math.abs(t - x) < 0.009); if (i < 0) return; const e = g.enemies.filter((q) => q.kind !== 'cargo')[0]; if (e) { e.hp = 1; e.sh = 0; g.damageEnemy(e, 1e9, 1); } }; });
    }],
  ];
  C.forEach(([name, setup], i) => add(`c-${name}`, [cc[i], cc[i + 1]], async () => { await page.mouse.up(); await quitMini(page); await setup(); }, async (t, u) => drive(page, t, u), (t) => ({ flash: Math.max(0, 0.35 - t * 2.5) })));

  // K zerbricht: lange Einstellung bis zum Ausklang (Treffer bei KILL Sekunden)
  const KILL = 1.6;
  add('kdie', S.kdie, async () => {
    await quitMini(page);
    await fight(page, 'xenon', { ship: 'dragon', wing: {} });
    await page.evaluate(PLACE_K(1050, false));
    await zoom(page, 0.34);
    await fastForward(page, 0.5);
    await page.evaluate((KILL) => {
      const b = window.__trK;
      // erst noch feuern lassen, dann zerbricht er; kein neuer K danach
      window.__trTick = (g, t) => { g.bigCd = 1e9; if (b && Math.abs(t - KILL) < 0.009) { b.shielded = false; b.hp = 1; b.sh = 0; g.damageEnemy(b, 1e9, 1); } };
    }, KILL);
  }, async (t, u) => drive(page, t, u), (t) => ({ flash: t > KILL + 0.05 ? Math.max(0, Math.min(1, (t - KILL - 0.05) * 6) * (1 - (t - KILL - 0.05) * 1.4)) : 0 }));

  // ===== Ausklang: Logo über der Heimatstation =====
  add('end', S.end, async () => {
    await quitMini(page);
    await page.evaluate(() => { const g = window.__game; g.ui.view = 'sector'; g.ui.panel = null; g.ui.modal = null; g.ui.bgMode = 'image'; g.gotoSector(g.state.stations[0].sector); g.refresh(); });
  }, async (t, u) => {
    const st = await page.evaluate(() => ({ x: window.__game.state.stations[0].x, z: window.__game.state.stations[0].z }));
    await calmStations(page);
    await camPath(page, u, { x: st.x - 3, z: st.z, zoom: 14 }, { x: st.x + 2, z: st.z, zoom: 9 });
  }, (t) => {
    const d = D('end');
    return { clean: true, y: 44, ...title(t, 0.3, d - 0.4, 0.6, 0.6), s: 1.04 - 0.04 * ease(t / 2), logo: true, eyebrow: 'FAMILIE ZHIN', big: 'X4 SEKTORBAU', small: t > 1.6 ? 'Jetzt spielen – im Browser und auf dem Handy' : '', band: 0, black: 0.5 + 0.5 * ease((t - (d - 1.4)) / 1.4) };
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
  await page.clock.runFor(1000 / FPS);
  await page.waitForTimeout(400);
  const n0 = Math.round(s.t0 * FPS), n1 = Math.round(s.t1 * FPS);
  const n = n1 - n0;
  const at = preview ? [Math.floor(n * 0.15), Math.floor(n * 0.5), Math.floor(n * 0.85)] : null;
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    await s.tick?.(t, f / n, f);
    await overlay(page, { vig: 0.8, ...(s.text?.(t) ?? {}) });
    await page.evaluate(SYNC_ANIMS);
    if (!preview) { await rec.frameAt(n0 + f); continue; }
    await page.clock.runFor(1000 / FPS);
    if (at.includes(f)) await page.screenshot({ path: `${out}/p-${String(n0).padStart(5, '0')}-${s.name}-${f}.jpg`, type: 'jpeg', quality: 80 });
  }
  console.log(`${s.name}: ${s.t0.toFixed(2)}–${s.t1.toFixed(2)} s (${n} Bilder) · ${Math.round((Date.now() - t0) / 1000)} s`);
}
await browser.close();
if (preview || (only && !encode)) process.exit(0);

// ---------- Ton: das ganze Stück, am Ende sein eigener Ausklang ----------
const mp4 = `${out}/x4-sektorbau-trailer-3.mp4`;
execFileSync(FFMPEG, ['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`,
  '-i', MUSIC,
  '-filter_complex', `[1:a]afade=t=in:d=0.3[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '256k', '-t', LEN.toFixed(3), mp4], { stdio: 'inherit' });
console.log('fertig:', mp4, existsSync(mp4));
