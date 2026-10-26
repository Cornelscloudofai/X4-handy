// Hilfen zum Aufsetzen der Trailer-Szenen (laufen im Browser über window.__game bzw. window.__mg)

export async function intoGame(page) {
  await page.click('text=Loslegen');
  await page.clock.runFor(500);
  await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.refresh(); });
}

/** Ausgebauter Spielstand für die Kartenszenen: mehrere Stationen, Händler, Miner, Warenflüsse */
export async function buildEmpire(page) {
  await page.evaluate(() => {
    const g = window.__game, A = g.actions, s = g.state;
    s.credits = 80_000_000;
    const a = s.stations[0];
    for (const m of ['prod_refinedmetals', 'storage_liquid', 'prod_graphene', 'prod_energycells', 'storage_container', 'dock_m', 'prod_energycells']) A.queueModule(s, a.id, m);
    for (const k of ['alligator_min', 'alligator_gas', 'boa', 'boa', 'alligator_min', 'alligator_min']) A.buyShip(s, k, a.id);
    g.step(3 * 3600);
    while (g.claim().ok);
    const r = A.foundStation(s, 'zhin', 60, 55);
    for (const d of ['storage_container', 'dock_m', 'prod_energycells', 'prod_hullparts']) A.queueModule(s, r.id, d);
    A.buyBlueprint(s, 'prod_hullparts', 'v-zhin');
    A.queueModule(s, r.id, 'prod_hullparts');
    A.buyShip(s, 'boa', r.id);
    A.buyShip(s, 'boa', r.id);
    g.step(4 * 3600);
    while (g.claim().ok);
    g.ui.flows = true;
    g.ui.selection = null;
    g.refresh();
  });
}

/** Stationen ohne Warnzeichen: Produktionsmodule laufen durchgehend, keine wartende Bauliste */
export async function calmStations(page) {
  await page.evaluate(() => {
    for (const st of window.__game.state.stations) {
      for (const m of st.modules) { m.running = true; m.t = 1e9; m.stall = ''; }
      st.queue = []; st.build = null; st.waiting = '';
    }
  });
}

/** Minispiel aus dem Menü starten (wie ein Spieler); mission für Einsätze */
export async function startMini(page, kind, { level = 1, gear = 2, mission, loadout } = {}) {
  // Ausrüstung wie im Hangar setzen (die App merkt sich die Wahl im Speicher, nicht erst beim nächsten Laden)
  for (const [key, value] of Object.entries({ ship: 'mamba', weapon: 'puls', missile: 'lenk', ...loadout })) {
    await page.evaluate(({ key, value }) => {
      const b = document.createElement('button');
      b.dataset.act = 'loadout-set'; b.dataset.key = key; b.dataset.value = value; b.id = 'tr-lo';
      b.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;z-index:2147483647;';
      document.getElementById('app').appendChild(b);
    }, { key, value });
    await page.click('#tr-lo', { force: true }).catch(() => {});
    await page.evaluate(() => document.getElementById('tr-lo')?.remove());
  }
  await page.evaluate(({ level, gear }) => {
    const g = window.__game; g.ui.modal = { type: 'minigames', level, gear }; g.refresh();
  }, { level, gear });
  await page.clock.runFor(300);
  await page.evaluate(() => { window.__trPin = null; });
  if (mission) {
    await page.click('#modal [data-act="mg-tab"][data-tab="combat"]');
    await page.clock.runFor(200);
    await page.click(`#modal [data-act="mg-mission"][data-mission="${mission}"][data-kind="${kind}"]`);
  } else await page.click(`#modal [data-act="mg-play"][data-kind="${kind}"]`);
  await page.clock.runFor(300);
  await page.click('#minigame [data-mg="start"]');
  await page.clock.runFor(50);
  // ohne Besonderheit (Glaskanone usw.) und ohne Wellenbanner
  await page.evaluate(() => {
    const g = window.__mg.game;
    if ('mutator' in g) g.mutator = null;
    // Wellenbanner bleibt aus (der Trailer setzt eigene Texte)
    if ('banner' in g) Object.defineProperty(g, 'banner', { get: () => 0, set: () => {}, configurable: true });
    // Hinweise für den Spieler (z. B. „Raketen (kein Werfer)“) stören im Trailer
    if (g.floats?.add) { const add = g.floats.add.bind(g.floats); g.floats.add = (x, y, text, ...r) => (/kein Werfer|leer|Nachladen/.test(String(text)) ? undefined : add(x, y, text, ...r)); }
  });
}

/** Minispiel beenden und zurück zur Karte */
export async function quitMini(page) {
  for (const sel of ['[data-mg="pause"]', '[data-mg="abort"]', '[data-mg="quit"]']) {
    if (!(await page.locator(`#minigame ${sel}`).count())) continue;
    await page.click(`#minigame ${sel}`).catch(() => {});
    await page.clock.runFor(150);
  }
  await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.refresh(); });
  await page.clock.runFor(100);
}

/** Kampf: Spieler, Frachter und Station unverwundbar, keine Karten-Pause, kein Wellenbanner */
export const GOD = `(() => { const g = window.__mg?.game; if (!g || !('hull' in g)) return; g.hull = 100; g.shield = g.shieldMax; for (const w of g.wards ?? []) if (!w.dead) w.hull = w.max; if (g.choosing) g.chooseCard(0); g.banner = 0; g.dashT = 0; })()`;

/** Spiel ohne Zeichnen vorspulen (Autopilot steuert, unverwundbar) */
export async function fastForward(page, sec) {
  await page.evaluate(({ sec, god }) => { const g = window.__mg.game; for (let i = 0; i < 60 * sec && !g.result(); i++) { eval(god); g.autopilot?.(); const p = window.__trPin; if (p) { g.px = p.x; g.py = p.y; g.pvx = g.pvy = 0; } g.update(1 / 60); } }, { sec, god: GOD });
}

/** Gegner im Kreis um den Spieler aufstellen (Kampf) */
export async function ring(page, kinds, r = 340, a0 = -Math.PI / 2, spread = Math.PI * 2) {
  await page.evaluate(({ kinds, r, a0, spread }) => {
    const g = window.__mg.game;
    kinds.forEach((k, i) => {
      const a = a0 + (spread * (i + 0.5)) / kinds.length;
      const e = g.makeEnemy(k, g.px + Math.cos(a) * r, g.py + Math.sin(a) * r);
      e.target = 'p'; e.ang = a + Math.PI; e.cd = 0.3 + Math.random() * 0.8;
      g.enemies.push(e);
    });
  }, { kinds, r, a0, spread });
}

export async function zoom(page, z) {
  await page.evaluate((z) => { const g = window.__mg.game; g.zoom = z; g.zoomGoal = z; }, z);
}
