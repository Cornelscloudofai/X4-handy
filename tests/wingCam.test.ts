import { describe, expect, it } from 'vitest';
import { ShooterGame } from '../src/minigames/shooter';
import { setSizeScale, type ShipId } from '../src/minigames/loadout';
import { TOP } from '../src/minigames/common';

setSizeScale('bisher', false);
const W = 390, H = 780, DT = 1 / 60;
type E = { kind: string; x: number; y: number; vx: number; vy: number; hp: number; max: number; r: number; sh: number; shMax: number; cd: number };
type Wg = { id: number; ship: string; state: string; x: number; y: number; vx: number; vy: number; a: number; tgt: unknown; phase: string; def: { cls: string }; w: { range: number } };
type G = {
  px: number; py: number; wings: Wg[]; enemies: E[]; time: number; wave: number; tac: boolean; wingFocus: unknown;
  camMode: string; camX: number; camY: number; camFollow: unknown; zoom: number; WW: number; WH: number;
  makeEnemy(k: string, x: number, y: number): E; radarRect: [number, number, number, number]; btnCam: [number, number, number];
  tacLayout: { x0: number; y0: number; sc: number; btns: [string, string, number, number, number, number][] };
};

function game(wing: Partial<Record<ShipId, number>>, ship: ShipId = 'cobra'): { g: ShooterGame; a: G } {
  const g = new ShooterGame({ level: 1, seed: 4, mutator: null, mode: 'normal', loadout: { ship, weapon: 'puls', turret: 'puls', shield: 'leicht', wing } }, 'pirate');
  g.resize(W, H);
  g.setWingOrder('angriff');
  for (let i = 0; i < 30; i++) g.update(DT);
  return { g, a: g as unknown as G };
}

/** ein feststehendes, zähes Ziel weit vor dem Schiff; andere Gegner und Wellen weg */
function dummy(a: G): E {
  a.enemies.length = 0;
  a.wave = 99;
  const e = a.makeEnemy('kanone', a.px, a.py - 900);
  e.hp = e.max = 1e9; e.sh = e.shMax = 0; e.vx = e.vy = 0; e.cd = 1e9;
  a.enemies.push(e);
  return e;
}

function hold(a: G, e: E): void { e.vx = e.vy = 0; e.hp = e.max; e.cd = 1e9; if (!a.enemies.includes(e)) a.enemies.push(e); a.enemies.length = 1; }

describe('Staffel: glaubwürdige Angriffe', () => {
  it('Jäger fliegen Anflüge: vorbeiziehen, weit ausholen, neu anfliegen – kein enges Kreisen', () => {
    const { g, a } = game({ mamba: 2 });
    const e = dummy(a);
    const w = a.wings[0];
    const phases = new Set<string>();
    let far = 0, near = 0, maxD = 0;
    for (let i = 0; i < 60 * 25; i++) {
      hold(a, e);
      g.update(DT);
      const d = Math.hypot(w.x - e.x, w.y - e.y);
      if (w.tgt === e) phases.add(w.phase);
      if (i > 60 * 8) { if (d > 350) far++; if (d < 180) near++; maxD = Math.max(maxD, d); }
    }
    expect([...phases].sort()).toEqual(['extend', 'pass', 'run']);
    // ein guter Teil der Zeit weit weg (Ausholen), aber immer wieder nah dran (Anflug)
    expect(far).toBeGreaterThan(60 * 3);
    expect(near).toBeGreaterThan(10);
    expect(maxD).toBeGreaterThan(420);
  });

  it('Rotte: der Flügelmann greift das Ziel seines Führers an', () => {
    const { g, a } = game({ mamba: 2 });
    const e = dummy(a);
    for (let i = 0; i < 120; i++) { hold(a, e); g.update(DT); }
    expect(a.wings[0].tgt).toBe(e);
    expect(a.wings[1].tgt).toBe(e);
  });

  it('Korvette (Dragon) hält Abstand und richtet den Bug aufs Ziel', () => {
    const { g, a } = game({ dragon: 1 });
    const e = dummy(a);
    const w = a.wings[0];
    let sum = 0, n = 0, facing = 0;
    for (let i = 0; i < 60 * 15; i++) {
      hold(a, e);
      g.update(DT);
      if (i > 60 * 8) {
        sum += Math.hypot(w.x - e.x, w.y - e.y); n++;
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - w.y, e.x - w.x) - w.a), Math.cos(Math.atan2(e.y - w.y, e.x - w.x) - w.a)));
        if (off < 0.35) facing++;
      }
    }
    const avg = sum / n;
    expect(avg).toBeGreaterThan(e.r + 120);
    expect(avg).toBeLessThan(w.w.range * 0.95);
    expect(facing / n).toBeGreaterThan(0.7);
  });
});

describe('Kamera: freie Sicht, Beobachter, taktische Karte', () => {
  it('Augentaste: frei – ziehen verschiebt, Objekt antippen folgt, eigenes Schiff antippen zurück', () => {
    const { g, a } = game({ mamba: 2 });
    const [cx, cy] = a.btnCam;
    g.pointerDown(1, cx, cy); g.pointerUp(1);
    expect(a.camMode).toBe('frei');
    const x0 = a.camX;
    g.pointerDown(2, 200, 500); g.pointerMove(2, 100, 500); g.pointerUp(2);
    g.update(DT);
    expect(a.camX - x0).toBeCloseTo(100 / a.zoom, 0);
    // Begleiter antippen: Kamera folgt ihm
    const w = a.wings[0];
    g.update(DT);
    const sx = (w.x - a.camX) * a.zoom, sy = (w.y - a.camY) * a.zoom;
    g.pointerDown(3, sx, sy); g.pointerUp(3);
    expect(a.camFollow).toBe(w);
    for (let i = 0; i < 60; i++) g.update(DT);
    expect(Math.abs(a.camX + W / 2 / a.zoom - w.x)).toBeLessThan(60);
    // zwei Finger: zoomen
    const z0 = a.zoom;
    g.pointerDown(4, 150, 400); g.pointerDown(5, 250, 400);
    g.pointerMove(5, 350, 400);
    expect(a.zoom).toBeGreaterThan(z0);
    g.pointerUp(5); g.pointerUp(4);
    // eigenes Schiff antippen: zurück
    a.camFollow = null;
    g.update(DT);
    g.pointerDown(6, (a.px - a.camX) * a.zoom, (a.py - a.camY) * a.zoom); g.pointerUp(6);
    expect(a.camMode).toBe('schiff');
  });

  it('Beobachter fährt zum Gefecht; das eigene Schiff bremst ab', () => {
    const { g, a } = game({});
    a.enemies.length = 0; a.wave = 99;
    for (let i = 0; i < 8; i++) { const e = a.makeEnemy('jaeger', a.px + 1600 + i * 30, a.py - 200); e.cd = 1e9; a.enemies.push(e); }
    const [cx, cy] = a.btnCam;
    g.pointerDown(1, cx, cy); g.pointerUp(1);
    g.pointerDown(1, cx, cy); g.pointerUp(1);
    expect(a.camMode).toBe('auto');
    for (let i = 0; i < 60 * 4; i++) { for (const e of a.enemies) { e.vx = e.vy = 0; } g.update(DT); }
    const mid = a.camX + W / 2 / a.zoom;
    expect(mid).toBeGreaterThan(a.px + 1000);
  });

  it('Radar antippen: taktische Karte in Zeitlupe; Gegner antippen – die Staffel greift ihn an; Taste schließt', () => {
    const { g, a } = game({ mamba: 3 });
    const e = dummy(a);
    const [rx, ry, rw, rh] = a.radarRect;
    g.pointerDown(1, rx + rw / 2, ry + rh / 2); g.pointerUp(1);
    expect(a.tac).toBe(true);
    const t0 = a.time;
    g.update(DT);
    expect(a.time - t0).toBeCloseTo(DT / 4, 5);
    const L = a.tacLayout;
    expect(L.y0).toBeGreaterThan(TOP);
    g.pointerDown(2, L.x0 + e.x * L.sc, L.y0 + e.y * L.sc); g.pointerUp(2);
    expect(a.wingFocus).toBe(e);
    for (let i = 0; i < 30; i++) { hold(a, e); g.update(DT); }
    expect(a.wings.filter((w) => w.state === 'fly').every((w) => w.tgt === e)).toBe(true);
    const zu = L.btns.find(([k]) => k === 'zu')!;
    g.pointerDown(3, zu[2] + 10, zu[3] + 10); g.pointerUp(3);
    expect(a.tac).toBe(false);
  });
});

describe('Linker Stick nach Kamerawechsel und Karte', () => {
  for (const ship of ['mamba', 'raptor'] as const) for (const ctrl of ['eins', 'zwei'] as const) for (const path of ['Kamera durchschalten', 'eigenes Schiff antippen', 'taktische Karte'] as const) {
    it(`${ship}, ${ctrl === 'eins' ? 'ein Stick' : 'zwei Sticks'}: ${path} – danach steuert der linke Stick wieder`, () => {
      const g = new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', controls: ctrl, loadout: { ship, weapon: 'puls', turret: 'puls', shield: 'leicht' } }, 'pirate');
      g.resize(W, H);
      const a = g as unknown as G & { joy: { id: number; ky: number } | null; aimA: number };
      for (let i = 0; i < 30; i++) g.update(DT);
      const tap = (id: number, x: number, y: number) => { g.pointerDown(id, x, y); g.pointerUp(id); };
      // Stick halten (Träger: Kurs), dann Kamera wechseln bzw. Karte öffnen
      g.pointerDown(1, 80, 600); g.pointerMove(1, 80, 540);
      const [cx, cy] = a.btnCam;
      if (path === 'Kamera durchschalten') { tap(2, cx, cy); g.update(DT); tap(2, cx, cy); g.update(DT); tap(2, cx, cy); }
      if (path === 'eigenes Schiff antippen') { tap(2, cx, cy); for (let i = 0; i < 30; i++) g.update(DT); tap(3, (a.px - a.camX) * a.zoom, (a.py - a.camY) * a.zoom); }
      if (path === 'taktische Karte') {
        const [rx, ry] = a.radarRect;
        tap(2, rx + 20, ry + 20);
        expect(a.tac).toBe(true);
        const zu = a.tacLayout.btns.find(([k]) => k === 'zu')!;
        tap(3, zu[2] + 5, zu[3] + 5);
        expect(a.tac).toBe(false);
      }
      expect(a.camMode).toBe('schiff');
      g.pointerUp(1);
      g.update(DT);
      // neuer Finger links: der Stick nimmt ihn an und lenkt
      g.pointerDown(4, 80, 600); g.pointerMove(4, 80, 540);
      expect(a.joy?.id).toBe(4);
      expect(a.joy!.ky).toBeLessThan(-0.5);
      g.pointerUp(4);
      expect(a.joy).toBeNull();
    });
  }
});

describe('Gehaltener Stick über den Kamerawechsel', () => {
  it('Finger bleibt liegen: zurück am Schiff lenkt er sofort wieder, ohne neu aufzusetzen', () => {
    const g = new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', controls: 'zwei', loadout: { ship: 'mamba', weapon: 'puls', turret: 'puls', shield: 'leicht' } }, 'pirate');
    g.resize(W, H);
    const a = g as unknown as G & { joy: { id: number; ky: number } | null };
    for (let i = 0; i < 30; i++) g.update(DT);
    const tap = (id: number, x: number, y: number) => { g.pointerDown(id, x, y); g.pointerUp(id); };
    g.pointerDown(1, 80, 600); g.pointerMove(1, 80, 560);
    const [cx, cy] = a.btnCam;
    tap(2, cx, cy); g.update(DT);
    expect(a.joy).toBeNull();
    tap(2, cx, cy); tap(2, cx, cy);
    expect(a.camMode).toBe('schiff');
    // derselbe Finger bewegt sich weiter: Stick ist wieder da und lenkt
    g.pointerMove(1, 80, 570);
    g.pointerMove(1, 80, 520);
    expect(a.joy?.id).toBe(1);
    expect(a.joy!.ky).toBeLessThan(-0.5);
  });
});

describe('Ausrüstung der Begleitschiffe', () => {
  type B = { from: string; color: string };
  type M = { def: { name: string } };
  function setup(wing: Partial<Record<ShipId, number>>, wingGear: Record<string, Record<string, string>>) {
    const g = new ShooterGame({ level: 1, seed: 4, mutator: null, mode: 'normal', loadout: { ship: 'cobra', weapon: 'puls', turret: 'puls', shield: 'leicht', wing, wingGear: wingGear as never } }, 'pirate');
    g.resize(W, H);
    g.setWingOrder('angriff');
    for (let i = 0; i < 30; i++) g.update(DT);
    const a = g as unknown as Omit<G, 'wings'> & { bullets: B[]; missiles: M[]; wings: (Wg & { wType: string; tType: string; tur: unknown[]; mDef: { name: string } | null; ammo: number })[] };
    return { g, a };
  }

  it('Waffe je Schiffstyp aus dem Hangar; ungültige Angaben fallen auf den Pulslaser zurück', () => {
    const { a } = setup({ mamba: 1, asp: 1 }, { mamba: { weapon: 'schrot' }, asp: { weapon: 'schnellplasma' } });
    expect(a.wings.find((w) => w.ship === 'mamba')!.wType).toBe('schrot');
    // schwere Waffe passt nicht auf ein S-Schiff
    expect(a.wings.find((w) => w.ship === 'asp')!.wType).toBe('puls');
  });

  it('Dragon (M) mit Plasmatürmen: die Türme schießen; Wolf (Bomber) feuert Schwarmraketen aus seinem Lager', () => {
    const { g, a } = setup({ dragon: 1, wolf: 1 }, { dragon: { turret: 'plasma', weapon: 'tau' }, wolf: { missile: 'schwarm' } });
    const dragon = a.wings.find((w) => w.ship === 'dragon')!, wolf = a.wings.find((w) => w.ship === 'wolf')!;
    expect(dragon.tur.length).toBeGreaterThan(0);
    expect(dragon.tType).toBe('plasma');
    expect(wolf.mDef?.name).toBe('Schwarmrakete');
    const ammo0 = wolf.ammo;
    const e = dummy(a);
    e.cd = 1e9;
    let plasma = 0, swarm = 0;
    for (let i = 0; i < 60 * 20; i++) {
      hold(a, e);
      g.update(DT);
      plasma += a.bullets.filter((b) => b.from === 'p' && b.color === '#a6ff6b').length;
      swarm += a.missiles.filter((m) => m.def.name === 'Schwarmrakete').length;
    }
    expect(plasma).toBeGreaterThan(0);
    expect(swarm).toBeGreaterThan(0);
    expect(wolf.ammo).toBeLessThan(ammo0);
  });
});
