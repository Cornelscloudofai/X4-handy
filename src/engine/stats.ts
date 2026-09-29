import { SHIP_MAP } from '../data/ships';
import { stationValue } from './economy';
import type { GameState } from './types';

export function netWorth(state: GameState): number {
  let v = state.credits;
  for (const st of state.stations) v += stationValue(st);
  for (const s of state.ships) v += SHIP_MAP[s.cls].price * 0.8;
  return v;
}
