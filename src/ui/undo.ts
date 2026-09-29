// Rückgängig für Bauliste, Fließdiagramm und Planer. Gespeichert werden nur geplante Positionen,
// Diagramm-Anordnung und Planer-Einstellungen – laufende Bauten und Credits bleiben unberührt.
import type { GameState, QueueItem } from '../engine/types';
import type { PlanSettings } from '../engine/planner';

interface Snap {
  stations: { id: string; queue: QueueItem[]; layout?: Record<string, { x: number; y: number }>; started: number }[];
  plan: string;
  label: string;
}

const MAX = 30;
const stack: Snap[] = [];

const started = (s: GameState, id: string) => {
  const st = s.stations.find((x) => x.id === id);
  return st ? st.modules.length + (st.build ? 1 : 0) : 0;
};

function take(s: GameState, plan: PlanSettings, label: string): Snap {
  return {
    stations: s.stations.map((st) => ({ id: st.id, queue: st.queue.map((q) => ({ ...q })), layout: st.layout ? JSON.parse(JSON.stringify(st.layout)) : undefined, started: started(s, st.id) })),
    plan: JSON.stringify(plan),
    label,
  };
}

const key = (x: Snap) => JSON.stringify([x.stations.map((st) => [st.id, st.queue.map((q) => q.uid), st.layout]), x.plan]);

/** Führt fn aus und merkt sich den Zustand davor, falls sich etwas geändert hat */
export function withUndo<T>(s: GameState, plan: () => PlanSettings, label: string, fn: () => T): T {
  const before = take(s, plan(), label);
  const out = fn();
  if (key(before) !== key(take(s, plan(), label))) {
    stack.push(before);
    if (stack.length > MAX) stack.shift();
  }
  return out;
}

export function canUndo(): boolean {
  return stack.length > 0;
}

export function undoLabel(): string {
  return stack[stack.length - 1]?.label ?? '';
}

/** Stellt den letzten Stand wieder her. Inzwischen gestartete Positionen bleiben gestartet. */
export function undo(s: GameState, setPlan: (p: PlanSettings) => void): string | null {
  const snap = stack.pop();
  if (!snap) return null;
  for (const saved of snap.stations) {
    const st = s.stations.find((x) => x.id === saved.id);
    if (!st) continue;
    const begun = Math.max(0, started(s, st.id) - saved.started);
    st.queue = saved.queue.slice(begun);
    st.layout = saved.layout;
  }
  setPlan(JSON.parse(snap.plan));
  return snap.label;
}
