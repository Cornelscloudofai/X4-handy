// Simulator in Testskripten: Spielseite eines Spiels bzw. Einsatzes öffnen und dort starten
export async function playSim(page, kind, { level = 1, mission, gear = 1 } = {}) {
  await page.evaluate(({ kind, level, mission, gear }) => {
    const g = window.__game;
    g.setSimGear(gear);
    g.ui.modal = { type: 'mgGame', kind, level, ...(mission ? { mission } : {}) };
    g.refresh();
  }, { kind, level, mission, gear });
  await page.click('#modal [data-act="mg-play"]');
}

/** Zur Simulator-Übersicht (von einer Spielseite aus) und den Reiter wählen */
export async function simTab(page, tab) {
  if (await page.locator('#modal [data-act="mg-home"]').count()) await page.click('#modal [data-act="mg-home"]');
  await page.click(`#modal [data-act="mg-tab"][data-tab="${tab}"]`);
}
