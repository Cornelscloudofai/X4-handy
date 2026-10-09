// Hauptschleife der Simulation
import { stepConstruction, stepMarkets, stepProduction, marketEvent } from './economy';
import { stepContracts, setNetWorthCache } from './contracts';
import { stepShip } from './fleet';
import { stepNpcs } from './npc';
import { stepNpcEconomy } from './npcEconomy';
import { stepOpportunities } from './trading';
import { stepIntel } from './intel';
import { stepFields } from './fleet';
import { netWorth } from './stats';
import { stepStory } from './story';
import { stepHistory } from './history';
import { stepShipOrders, stepYard } from './yard';
import type { GameState } from './types';
import { log, muteEvents, rand } from './util';

const MAX_STEP = 2; // Sekunden Spielzeit je Teilschritt

let slowTimer = 0;
let eventTimer = 3600;

function substep(state: GameState, dt: number): void {
  state.time += dt;
  for (const st of state.stations) {
    stepConstruction(state, st, dt);
    stepProduction(state, st, dt);
    stepYard(state, st, dt);
  }
  for (const s of state.ships) stepShip(state, s, dt);
  stepNpcs(state, dt);
  stepNpcEconomy(state, dt);
  stepMarkets(state, dt);
  stepContracts(state, dt);
  stepOpportunities(state, dt);
  stepIntel(state, dt);
  stepFields(state, dt);
  stepShipOrders(state, dt);
  stepHistory(state, dt);
  slowTimer -= dt;
  if (slowTimer <= 0) {
    slowTimer = 5;
    setNetWorthCache(netWorth(state));
    stepStory(state);
  }
  eventTimer -= dt;
  if (eventTimer <= 0) {
    eventTimer = (1.5 + rand(state) * 2) * 3600;
    const ev = marketEvent(state);
    if (ev) log(state, ev.text, 'info', true, { kind: 'market', key: ev.sector });
  }
}

/** Simuliert dt Sekunden Spielzeit */
export function step(state: GameState, dt: number): void {
  let left = dt;
  while (left > 1e-9) {
    const d = Math.min(MAX_STEP, left);
    substep(state, d);
    left -= d;
  }
}

export interface OfflineReport { seconds: number; credits: number; produced: Record<string, number>; modules: number }

/** Holt verpasste Zeit nach (in gröberen Schritten, ohne Einblendungen) */
export function catchUp(state: GameState, seconds: number): OfflineReport {
  const credits0 = state.credits;
  const produced0 = { ...state.totals.produced };
  const modules0 = state.stations.reduce((n, s) => n + s.modules.length, 0);
  muteEvents(() => {
    let left = seconds;
    while (left > 0) {
      const d = Math.min(5, left);
      substep(state, d);
      left -= d;
    }
  });
  const produced: Record<string, number> = {};
  for (const [id, n] of Object.entries(state.totals.produced)) {
    const diff = n - (produced0[id] ?? 0);
    if (diff > 0.5) produced[id] = diff;
  }
  return {
    seconds,
    credits: state.credits - credits0,
    produced,
    modules: state.stations.reduce((n, s) => n + s.modules.length, 0) - modules0,
  };
}
