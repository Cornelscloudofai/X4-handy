// Trailer 2: was seit dem ersten Trailer dazugekommen ist – unbekannter Raum (19 Sektoren, Szenen, Peilung,
// Erstsichtung), Träger Raptor (Hangar, Katapultstart), Flak, Breitseite, Raketensilos, Vorhalten, Xenon K und sein
// Untergang, Gefechte auf der Sektorkarte. Musik: Anfang von „Galactic Horizons“ (ruhig, steigend), auf einem Schlag
// geschnitten in „Kampf-Invasion“ ab 2:16,5 bis zum Schluss. Bild für Bild aus dem echten Spiel (60 Bilder/s, 1080×1920).
// node scripts/trailer/trailer2.mjs <ausgabeordner> [--preview] [--only=name,…] [--encode]
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, recorder, FPS } from './browser.mjs';
import { intoGame, buildEmpire, calmStations, quitMini, fastForward, ring, zoom, GOD } from './scenes.mjs';
import { OVERLAY, overlay, title, ease } from './overlay.mjs';

const out = process.argv[2] ?? 'trailer2';
const preview = process.argv.includes('--preview');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const encode = process.argv.includes('--encode');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const root = new URL('../../', import.meta.url).pathname;

// ---------- Musik und Zeitplan ----------
const TITLE = `${root}src/assets/music/titel-galactic-horizons.mp3`, FIGHT = `${root}src/assets/music/kampf-invasion.mp3`;
const tb = JSON.parse(readFileSync(`${root}src/assets/music/titel-galactic-horizons.beats.json`, 'utf8')).beats;
const kb = JSON.parse(readFileSync(`${root}src/assets/music/kampf-invasion.beats.json`, 'utf8')).beats;
/** Schnitt vom Titelstück in den Kampf: Schlag im Titel (Video-Zeit) und im Kampfstück */
const CUT = 20.57, K0 = 136.5, KEND = 178.93;
const LEN = CUT + (KEND - K0);
/** Video-Zeiten aller Schläge: erst Titel, dann Kampf */
const beats = [...tb.filter((b) => b < CUT - 0.05), ...kb.filter((b) => b >= K0 - 0.01 && b <= KEND + 0.5).map((b) => CUT + b - K0)];
const snap = (t) => beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
const kv = (k) => snap(CUT + k - K0);
/** Abschnitt [a, b] in Schnitte mit diesen Anteilen, Grenzen auf den Takt */
const split = (a, b, w) => { const sum = w.reduce((p, q) => p + q, 0); let acc = 0; return [a, ...w.slice(0, -1).map((x) => snap(a + ((b - a) * (acc += x)) / sum)), b]; };

const S = {
  map: [0, snap(5.27)],
  scenes: [snap(5.27), snap(12.22)],
  peil: [snap(12.22), snap(16.41)],
  reveal: [snap(16.41), CUT],
  hangar: [CUT, kv(141.28)],
  launch: [kv(141.28), kv(145.6)],
  fight: [kv(145.6), kv(171.27)],
  end: [kv(171.27), LEN],
};

// ---------- Hilfen ----------
/** Ausrüstung direkt in den Speicher (wie im Hangar gewählt) – mit Turmgruppen und Staffel */
async function setLoadout(page, lo) {
  // das Spiel hält die Ausrüstung im Speicher: über „Rückgängig“ im Hangar komplett setzen
  await page.evaluate((lo) => {
    const full = { weapon: 'puls', turret: 'puls', shield: 'schwer', missile: 'lenk', wing: {}, groups: undefined, ...lo };
    localStorage.setItem('x4-sektorbau-ausruestung', JSON.stringify(full));
    const g = window.__game;
    g.ui.modal = { type: 'loadout', undo: full }; g.refresh();
    const b = document.createElement('button'); b.dataset.act = 'lo-undo'; document.getElementById('app').appendChild(b); b.click(); b.remove();
    g.ui.modal = null; g.refresh();
  }, lo);
}
const RAPTOR_GROUPS = (m, l) => Array.from({ length: 11 }, (_, i) => (i >= 8 ? l : typeof m === 'function' ? m(i) : m));

/** Kampf starten (Menü wie ein Spieler), danach ohne Besonderheit, Banner und Spielerhinweise */
async function fight(page, kind, lo, { level = 3, gear = 2, mission } = {}) {
  await setLoadout(page, lo);
  await page.evaluate(({ level, gear }) => { const g = window.__game; g.ui.modal = { type: 'minigames', level, gear }; g.refresh(); }, { level, gear });
  await page.clock.runFor(300);
  await page.evaluate(() => { window.__trPin = null; window.__trTick = null; });
  if (mission) {
    await page.click('#modal [data-act="mg-tab"][data-tab="combat"]');
    await page.clock.runFor(200);
    await page.click(`#modal [data-act="mg-mission"][data-mission="${mission}"][data-kind="${kind}"]`);
  } else await page.click(`#modal [data-act="mg-play"][data-kind="${kind}"]`);
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
async function drive(page, t) {
  await page.evaluate(({ god, t }) => {
    eval(god);
    const g = window.__mg?.game;
    if (!g) return;
    g.autopilot?.();
    const p = window.__trPin;
    if (p) { g.px = p.x; g.py = p.y; g.pvx = g.pvy = 0; if (p.a != null) g.aimA = p.a; }
    if (window.__trTick) window.__trTick(g, t);
  }, { god: GOD, t });
}

/** Gegner aufstellen (relativ zum Spieler), unverwüstlich wenn hold */
async function foes(page, list, hold = false) {
  await page.evaluate(({ list, hold }) => {
    const g = window.__mg.game;
    for (const [k, dx, dy] of list) { const e = g.makeEnemy(k, g.px + dx, g.py + dy); e.target = 'p'; e.cd = 0.3 + Math.random(); if (hold) { e.hp = e.max = 1e9; } g.enemies.push(e); }
  }, { list, hold });
}

/** Kamerafahrt auf der Karte (wie Trailer 1) */
async function camPath(page, u, from, to) {
  await page.evaluate(({ u, from, to }) => {
    const g = window.__game, c = g.cam, f = c.fitZoom;
    c.target = null; c.vx = c.vz = 0;
    c.x = from.x + (to.x - from.x) * u; c.z = from.z + (to.z - from.z) * u;
    c.zoom = f * Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * u);
  }, { u, from, to });
}

const T = (k) => (t) => t; // Platzhalter für lesbare Szenenlisten
void T;

// ---------- Szenen ----------
function scenes(page) {
  const list = [];
  const add = (name, t0, t1, setup, tick, text) => list.push({ name, t0, t1, setup, tick, text });
  const sec = (id) => page.evaluate((id) => { const g = window.__game; g.ui.modal = null; g.ui.panel = null; g.gotoSector(id); g.ui.selection = null; g.refresh(); }, id);

  // ===== Akt 1: Der unbekannte Raum =====
  // 1) Sektorenkarte: alle Sektoren aufgedeckt, langsamer Zug auf den Glutsee
  add('map', ...S.map, async () => {
    await page.evaluate(() => {
      const g = window.__game, s = g.state;
      s.frontier = { ...(s.frontier ?? {}), signatures: s.frontier?.signatures ?? [], discovered: [] };
      g.ui.modal = null; g.ui.panel = null; g.ui.view = 'galaxy'; g.ui.galaxySel = null; g.refresh();
      const b = document.createElement('button'); b.dataset.act = 'dev-reveal'; document.getElementById('app').appendChild(b); b.click(); b.remove();
    });
    await page.clock.runFor(600);
  }, async (t, u) => {
    await page.evaluate((u) => { const c = window.__game.galaxyCam ?? window.__game.cam; void c; }, u);
  }, (t) => ({ clean: true, y: 13, ...title(t, 0.6, S.map[1] - 0.2, 0.4), eyebrow: 'UNBEKANNTER RAUM', big: '19 NEUE SEKTOREN', small: 'hinter erloschenen Toren', black: Math.max(0, 1 - t / 0.8) }));

  // 2) Sektorszenen mit Tiefenwirkung: Glutsee im Strahlungssturm, Heart of Acrimony, Zyarth's Dominion
  const sc = split(...S.scenes, [1, 1, 1]);
  const shots = [
    ['f-glut1', 'Glutsee I', 'Strahlungssturm · 3000 % Sonne'],
    ['hoa', 'Heart of Acrimony II', 'mehrschichtige Sektorszenen'],
    ['zyarth', "Zyarth's Dominion I", 'jeder Sektor mit eigener Eigenheit'],
  ];
  shots.forEach(([id, big, small], i) => {
    add(`scene-${i}`, sc[i], sc[i + 1], async () => {
      await page.evaluate(() => { const g = window.__game; g.ui.view = 'sector'; g.refresh(); });
      // neue Sektoren richtig entdecken (wie im Spiel); die Enthüllung gehört in eine eigene Szene
      await page.evaluate((id) => { const g = window.__game; if (id.startsWith('f-') && !(g.state.frontier?.discovered ?? []).includes(id)) g.discover(id); document.getElementById('reveal')?.remove(); }, id);
      await page.clock.runFor(100);
      await page.evaluate(() => document.getElementById('reveal')?.remove());
      await sec(id);
      await page.evaluate(() => { const g = window.__game; g.ui.bgMode = 'image'; g.refresh(); });
      await page.clock.runFor(400);
    }, async (t, u) => {
      await page.evaluate((u) => { const c = window.__game.cam; c.target = null; c.vx = c.vz = 0; c.x = -30 + 60 * u; c.z = 10 - 20 * u; c.zoom = c.fitZoom * (1.05 + 0.25 * u); }, ease(u));
    }, (t) => ({ clean: true, y: 78, ...title(t, 0.15, sc[i + 1] - sc[i] - 0.1, 0.25), big, small, flash: i ? Math.max(0, 0.3 - t * 2) : 0 }));
  });

  // 3) Peilung: Richtung und Frequenz rasten ein
  add('peil', ...S.peil, async () => {
    await page.evaluate(() => {
      const g = window.__game, s = g.state;
      s.credits = Math.max(s.credits, 5e6);
      // Rhy's Ausblick noch unentdeckt: dort liegt die Signatur, die gepeilt wird
      s.frontier = { ...s.frontier, signatures: [], discovered: (s.frontier?.discovered ?? []).filter((x) => x !== 'f-ausblick') };
      g.gotoSector('rhy'); g.ui.view = 'galaxy'; g.ui.galaxySel = 'rhy'; g.refresh();
    });
    await page.clock.runFor(400);
    // Oberfläche wieder sichtbar (vorige Szene zeigte nur das Bild), Entwickleransicht der Kartenszene aus
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
    // erst suchend, dann auf Richtung und Frequenz einschwenken und halten
    await page.evaluate((u) => {
      const p = window.__peil; if (!p) return;
      const k = Math.min(1, u * 1.8);
      const d = (1 - k) * 1.4 * Math.sin(u * 9);
      p.set(p.target + d);
      p.setFreq(p.tf + (1 - k) * 0.3 * Math.cos(u * 7));
    }, u);
  }, (t) => ({ clean: true, y: 13, ...title(t, 0.2, S.peil[1] - S.peil[0] - 0.15, 0.25), big: 'PEILEN', small: 'Kanal 9 meldet eine Torsignatur' }));

  // 4) Erstsichtung eines neuen Sektors
  add('reveal', ...S.reveal, async () => {
    await page.evaluate(() => document.getElementById('peilung')?.remove());
    await page.evaluate(() => { const g = window.__game, s = g.state; s.frontier.discovered = (s.frontier.discovered ?? []).filter((x) => x !== 'f-ausblick'); g.ui.view = 'galaxy'; g.ui.modal = null; g.refresh(); g.discover('f-ausblick'); });
    await page.clock.runFor(150);
  }, async () => {}, () => ({ clean: true }));

  // ===== Akt 2: Aufrüsten =====
  // 5) Hangar: der Raptor auf der Plattform, Turmgruppen mit Silos
  add('hangar', ...S.hangar, async () => {
    await page.evaluate(() => { document.getElementById('reveal')?.remove(); const g = window.__game; g.ui.view = 'sector'; g.gotoSector('zhin'); });
    await setLoadout(page, { ship: 'raptor', groups: RAPTOR_GROUPS((i) => (i % 3 === 1 ? 'rakete' : 'puls'), 'silo'), wing: { mamba: 12 } });
    await page.evaluate(() => { const g = window.__game; g.ui.modal = { type: 'minigames', level: 3, gear: 2 }; g.refresh(); });
    await page.clock.runFor(300);
    await page.click('#modal [data-act="mg-tab"][data-tab="combat"]');
    await page.clock.runFor(200);
    await page.click('#modal [data-act="loadout-open"]');
    await page.clock.runFor(700);
  }, async () => {}, (t) => ({ clean: true, y: 13, ...title(t, 0.1, S.hangar[1] - S.hangar[0] - 0.1, 0.18), eyebrow: 'NEU IN DER FLOTTE', big: 'TRÄGER RAPTOR', small: '122 Türme · Hangar für die Staffel', flash: Math.max(0, 0.9 - t * 3) }));

  // 6) Katapultstart der Mambas vom Flugdeck
  add('launch', ...S.launch, async () => {
    await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.refresh(); });
    await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'boson'), wing: { mamba: 14 } }, { level: 2 });
    await zoom(page, 0.46);
    await page.evaluate(() => { const g = window.__mg.game; g.camPan = -0.12; g.launchCd = 0; window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.radioT = -99; });
    await fastForward(page, 0.95);
  }, async (t) => drive(page, t), (t) => ({ y: 80, ...title(t, 0.1, S.launch[1] - S.launch[0] - 0.1, 0.15), big: 'KATAPULTSTART', small: 'Mambas vom Flugdeck' }));

  // ===== Akt 3: Gefecht =====
  const fc = split(...S.fight, [3, 3.3, 4, 2.9, 2.4, 2.9, 4.3, 2.9]);
  const F = [
    ['flak', 'FLAK', 'Piratenträger gegen Jägerschwärme', 22, async () => {
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
    ['broad', 'BREITSEITE', 'Puls-Türme und L-Bosonenlanzen', 76, async () => {
      await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'boson'), wing: {} });
      await zoom(page, 0.27);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -0.15; });
      await foes(page, [['kanone', -760, -500], ['kanone', 780, -300], ['rakete', -820, 100], ['kanone', 800, 300], ['jaeger', -700, -150], ['jaeger', 720, -700], ['rakete', 760, 600], ['kanone', -760, 520]], true);
      await fastForward(page, 1.2);
    }],
    ['silo', 'RAKETENSILOS', '8 Schächte · alle 0,3 Sekunden', 76, async () => {
      await fight(page, 'pirates', { ship: 'raptor', groups: RAPTOR_GROUPS('puls', 'silo'), wing: {} });
      await zoom(page, 0.55);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -0.2; for (const t of g.pTur) { if (t.type === 'silo') { t.cd = 0.15 + Math.random() * 0.5; t.salvo = 0; } else t.cd = 1e9; } });
      await foes(page, [['kanone', -700, -700], ['kanone', 650, -850], ['rakete', 0, -1150], ['kanone', -800, -1000], ['jaeger', 750, -550]], true);
    }],
    ['lead', 'VORHALTEN', 'alle Rohre auf einen Punkt', 74, async () => {
      await fight(page, 'pirates', { ship: 'klapperschlange', lturret: 'boson', weapon: 'puls', wing: {} });
      await zoom(page, 0.32);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -1; });
      await foes(page, [['jaeger', -80, -820], ['jaeger', 170, -900], ['jaeger', -260, -980], ['kanone', 60, -1120], ['jaeger', 320, -800]], true);
      await page.evaluate(() => { window.__trTick = (g) => { g.fireId = 1; for (const e of g.enemies) if (e.kind !== 'cargo') { e.vx *= 0.9; } }; });
      await fastForward(page, 0.4);
    }],
    ['booms', '', '', 0, async () => {
      await fight(page, 'pirates', { ship: 'dragon', wing: {} });
      await zoom(page, 0.72);
      await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 }; g.camPan = -0.3; });
      await foes(page, [['kanone', -150, -330], ['jaeger', 110, -260], ['rakete', 200, -420], ['jaeger', -220, -230], ['kanone', 30, -480], ['jaeger', 230, -200]], true);
      // Abschüsse nacheinander auf die Schläge
      await page.evaluate(() => { const at = [0.15, 0.6, 1.0, 1.35, 1.7, 2.05]; window.__trTick = (g, t) => { const i = at.findIndex((x) => Math.abs(t - x) < 0.009); if (i < 0) return; const e = g.enemies.filter((q) => q.kind !== 'cargo')[0]; if (e) { e.hp = 1; e.sh = 0; g.damageEnemy(e, 1e9, 1); } }; });
    }],
    ['kfire', 'XENON K', '8 L- und 14 M-Türme', 76, async () => {
      await fight(page, 'xenon', { ship: 'dragon', wing: {} });
      await zoom(page, 0.36);
      await page.evaluate(() => {
        const g = window.__mg.game;
        g.enemies = []; g.spawnBoss(false);
        const b = g.enemies.find((e) => e.kind === 'boss' && !e.parent);
        const dx = g.px - b.x, dy = g.py - 1050 - b.y;
        for (const e of g.enemies) if (e === b || e.parent === b) { e.x += dx; e.y += dy; e.cd = Math.random() * 0.4; }
        window.__trPin = { x: g.px, y: g.py, a: -Math.PI / 2 };
      });
      await fastForward(page, 0.5);
    }],
    ['kdie', '', '', 0, async () => {
      await page.evaluate(() => {
        const g = window.__mg.game, b = g.enemies.find((e) => e.kind === 'boss' && !e.parent);
        window.__trTick = (g2, t) => { if (b && Math.abs(t - 0.2) < 0.009) { b.shielded = false; b.hp = 1; b.sh = 0; g2.damageEnemy(b, 1e9, 1); } };
      });
    }],
    ['map', 'IM SEKTOR', 'Staffel und Fernfeuer der Klapperschlange', 14, async () => {
      await quitMini(page);
      await page.evaluate(() => {
        const g = window.__game, s = g.state, st = s.stations[0];
        g.gotoSector(st.sector);
        for (const cls of ['raptor', 'rattlesnake']) if (!s.ships.some((x) => x.cls === cls)) g.actions.buyShip(s, cls, st.id);
        const rp = s.ships.find((x) => x.cls === 'raptor'), rs = s.ships.find((x) => x.cls === 'rattlesnake');
        rp.wing = 12;
        const b = document.createElement('button'); b.dataset.act = 'test-attack'; b.dataset.id = st.sector; document.getElementById('app').appendChild(b); b.click(); b.remove();
        const h = s.hostiles.list[s.hostiles.list.length - 1];
        h.foe = 'xenon'; h.n = 6; h.power = 9000; h.hp = 9000;
        const hx = st.x + 30, hz = st.z + 30;
        window.__trMap = { rp, rs, h, hx, hz };
        g.ui.selection = null; g.ui.paused = false; g.refresh();
      });
    }],
  ];
  F.forEach(([name, big, small, y, setup], i) => {
    add(`fight-${name}`, fc[i], fc[i + 1], async () => { await page.mouse.up(); if (name !== 'kdie' && name !== 'map') await quitMini(page); await setup(); }, async (t, u) => {
      if (name === 'map') {
        await page.evaluate(() => { const m = window.__trMap; if (!m) return; const { rp, rs, h, hx, hz } = m; h.hp = Math.max(h.hp, 4000); h.phase = 'hunt'; h.until = 1e12; h.x = hx; h.z = hz; h.path = []; rp.x = hx - 3; rp.z = hz + 2; rp.path = []; rs.x = hx - 16; rs.z = hz - 4; rs.path = []; });
        await camPath(page, ease(u), { x: (await page.evaluate(() => window.__trMap?.hx ?? 0)) - 9, z: await page.evaluate(() => window.__trMap?.hz ?? 0), zoom: 8 }, { x: (await page.evaluate(() => window.__trMap?.hx ?? 0)) - 5, z: await page.evaluate(() => window.__trMap?.hz ?? 0), zoom: 11 });
        return;
      }
      await drive(page, t);
    }, (t) => {
      const d = fc[i + 1] - fc[i];
      if (!big) return { flash: name === 'kdie' ? Math.max(0, Math.min(1, (t - 0.25) * 6) * (1 - (t - 0.25) * 1.6)) * (t > 0.25 ? 1 : 0) : Math.max(0, 0.35 - t * 2.5) };
      return { y, ...title(t, 0.05, d - 0.05, 0.12), big, small, clean: name === 'map', flash: i === 0 ? Math.max(0, 0.8 - t * 3) : Math.max(0, 0.35 - t * 2.5) };
    });
  });

  // ===== Schluss =====
  add('end', ...S.end, async () => {
    await page.evaluate(() => { const g = window.__game; g.ui.view = 'sector'; g.ui.panel = null; g.ui.modal = null; g.refresh(); });
  }, async (t, u) => {
    const st = await page.evaluate(() => ({ x: window.__game.state.stations[0].x, z: window.__game.state.stations[0].z }));
    await calmStations(page);
    await camPath(page, u, { x: st.x - 3, z: st.z, zoom: 14 }, { x: st.x + 2, z: st.z, zoom: 9 });
  }, (t) => {
    const D = S.end[1] - S.end[0];
    const a = title(t, 0.15, D - 0.5, 0.5, 0.6);
    return { clean: true, y: 44, ...a, s: 1.04 - 0.04 * ease(t / 2), logo: true, eyebrow: 'FAMILIE ZHIN', big: 'X4 SEKTORBAU', small: t > 1.6 ? 'Jetzt spielen – im Browser und auf dem Handy' : '', band: 0, black: 0.55 + 0.45 * ease((t - (D - 0.9)) / 0.9), flash: Math.max(0, 0.6 - t * 2) };
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
  const at = preview ? [Math.floor(n * 0.2), Math.floor(n * 0.75)] : null;
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

// ---------- Schnitt: Titelstück bis CUT, weich (0,35 s) in den Kampf ab K0 ----------
const mp4 = `${out}/x4-sektorbau-trailer-2.mp4`;
const XF = 0.35;
execFileSync(FFMPEG, ['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', `${frames}/%05d.jpg`,
  '-ss', '0', '-t', String(CUT + XF / 2), '-i', TITLE,
  '-ss', String(K0 - XF / 2), '-t', String(KEND - K0 + XF / 2 + 1), '-i', FIGHT,
  '-filter_complex', `[1:a]afade=t=in:d=0.4[a1];[a1][2:a]acrossfade=d=${XF}:c1=tri:c2=tri[ax];[ax]afade=t=out:st=${(LEN - 2.5).toFixed(2)}:d=2.5[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '256k', '-t', LEN.toFixed(3), mp4], { stdio: 'inherit' });
console.log('fertig:', mp4, existsSync(mp4));
