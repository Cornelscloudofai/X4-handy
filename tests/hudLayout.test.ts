import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, type ShipId } from '../src/minigames/loadout';
import { ShooterGame } from '../src/minigames/shooter';
import { TOP } from '../src/minigames/common';

type L = { orderBtns: [string, number, number, number][]; panTrack: { x: number; y0: number; y1: number }; btnDash: [number, number, number] };

function layout(ship: ShipId, w: number, h: number): L {
  const g = new ShooterGame({ level: 1, seed: 1, mutator: null, mode: 'normal', mission: 'nest', loadout: { ...DEFAULT_LOADOUT, ship, wing: ship === 'raptor' ? { mamba: 4 } : {} } }, 'xenon');
  g.resize(w, h);
  return g as unknown as L;
}

describe('Kampf-Bildschirm: nichts überlappt', () => {
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]] as const) {
    it(`Raptor ${w}×${h}: Befehlsknöpfe unter dem Fortschrittstext, ohne Überlappung; Kameraschieber über der Ausweichtaste`, () => {
      const g = layout('raptor', w, h), b = g.orderBtns;
      expect(b.length).toBe(12);
      for (const [, x, y, r] of b) {
        expect(y - r).toBeGreaterThanOrEqual(TOP + 36);
        expect(y + r).toBeLessThanOrEqual(h - 240);
        expect(x - r).toBeGreaterThanOrEqual(0);
        expect(r).toBeGreaterThanOrEqual(12);
      }
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        expect(Math.hypot(b[i][1] - b[j][1], b[i][2] - b[j][2]), `${b[i][0]}/${b[j][0]}`).toBeGreaterThan(b[i][3] + b[j][3] + 2);
      }
      const t = g.panTrack, [, dy, dr] = g.btnDash;
      expect(t.y1 + 14).toBeLessThan(dy - dr);
    });
  }
});
