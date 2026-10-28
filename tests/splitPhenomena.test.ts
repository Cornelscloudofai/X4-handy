import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { marketPrice, priceAt } from '../src/engine/economy';
import { fieldRegenFactor } from '../src/engine/fieldUp';
import {
  COMET_REGEN, RHY_SPEED, THRONE_BONUS, TKR_BONUS, TIDE, XENON_SPEED, ZHIN_REBUILD,
  fieldMining, launchClock, phenomenonText, resetPhenomena, sectorSpeed, stepPhenomena, tideFactor, xenonClock,
} from '../src/engine/phenomena';

const priceRaw = (s: ReturnType<typeof newGame>, key: string, w: string) => priceAt(w, s.markets[key][w].stock / s.markets[key][w].cap);

describe('Eigenheiten des Split-Raums', () => {
  it('Familie Zhin: die Zhin-Werft zahlt für Hüllenteile und Claytronik mehr, andere Waren normal', () => {
    resetPhenomena();
    const s = newGame(3, 'mining');
    stepPhenomena(s);
    expect(marketPrice(s, 'zhin-werft', 'hullparts')).toBeCloseTo(priceRaw(s, 'zhin-werft', 'hullparts') * ZHIN_REBUILD, 3);
    expect(marketPrice(s, 'zhin-werft', 'energycells')).toBeCloseTo(priceRaw(s, 'zhin-werft', 'energycells'), 3);
  });

  it('Familie Tkr: Stapellauf alle 4 h für eine Stunde, nicht beim Spielstart; dann zahlt die Werft 30 % mehr', () => {
    resetPhenomena();
    const s = newGame(4, 'mining');
    expect(launchClock(0).active).toBe(false);
    let on = 0;
    for (let t = 0; t < 4 * 3600; t += 60) if (launchClock(t).active) on += 60;
    expect(on).toBe(3600);
    stepPhenomena(s);
    expect(marketPrice(s, 'tkr', 'hullparts')).toBeCloseTo(priceRaw(s, 'tkr', 'hullparts'), 3);
    s.time = 2 * 3600 + 60;
    stepPhenomena(s);
    expect(launchClock(s.time).active).toBe(true);
    expect(marketPrice(s, 'tkr', 'hullparts')).toBeCloseTo(priceRaw(s, 'tkr', 'hullparts') * TKR_BONUS, 3);
    expect(s.log.some((l) => l.text.includes('Stapellauf in der Tkr-Werft'))).toBe(true);
  });

  it("Tharka's Cascade: Gasfelder schwanken zwischen 70 und 150 %, Eis nicht", () => {
    resetPhenomena();
    const s = newGame(5, 'mining');
    let lo = 9, hi = 0;
    for (let t = 0; t < 3 * 3600; t += 120) { const f = tideFactor(t); lo = Math.min(lo, f); hi = Math.max(hi, f); }
    expect(lo).toBeCloseTo(TIDE[0], 1);
    expect(hi).toBeCloseTo(TIDE[1], 1);
    s.time = 3 * 3600 / 4; // Hochwasser
    stepPhenomena(s);
    expect(fieldMining('cascade-helium')).toBeCloseTo(TIDE[1], 2);
    expect(fieldMining('cascade-ice')).toBe(1);
  });

  it("Tharka's Ravine: Xenon-Streife – Miner ruhen, Schiffe langsamer, Meldung bei Beginn und Ende", () => {
    resetPhenomena();
    const s = newGame(6, 'mining');
    stepPhenomena(s);
    expect(xenonClock(s.time).active).toBe(false);
    expect(fieldMining('ravine-nividium')).toBe(1);
    s.time = 3 * 3600 + 60; // erste Streife nach 3 h
    stepPhenomena(s);
    expect(xenonClock(s.time).active).toBe(true);
    expect(fieldMining('ravine-nividium')).toBe(0);
    expect(sectorSpeed('ravine')).toBe(XENON_SPEED);
    s.time += 30 * 60;
    stepPhenomena(s);
    expect(fieldMining('ravine-nividium')).toBe(1);
    expect(s.log.filter((l) => l.text.includes('Xenon-Streife')).length).toBeGreaterThanOrEqual(1);
  });

  it("Rhy's Defiance, Heart of Acrimony, Zyarth's Dominion: Tempo, Nachwuchs, Thronmarkt", () => {
    resetPhenomena();
    const s = newGame(7, 'mining');
    stepPhenomena(s);
    expect(sectorSpeed('rhy')).toBe(RHY_SPEED);
    expect(fieldRegenFactor(s, 'hoa-ice')).toBe(COMET_REGEN);
    expect(fieldRegenFactor(s, 'hoa-silicon')).toBe(1);
    expect(marketPrice(s, 'zyarth', 'claytronics')).toBeCloseTo(priceRaw(s, 'zyarth', 'claytronics') * THRONE_BONUS, 3);
    for (const id of ['zhin', 'tkr', 'cascade', 'ravine', 'rhy', 'hoa', 'zyarth']) expect(phenomenonText(id, s.time)).not.toBe('');
  });
});
