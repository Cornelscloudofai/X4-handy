// Gegnerwerte des Kampfs und das Jäger-Symbol: eigene Datei, damit Menü und Entwicklungswerkzeug sie nutzen können,
// ohne den Kampf selbst zu laden (der wird erst beim Start nachgeladen).
import type { Level } from './common';
import { enemyTune } from './loadout';

/** cargo: Frachter des Piratenkonvois (Einsatz „Überfall“) */
export type EKind = 'jaeger' | 'kanone' | 'rakete' | 'schild' | 'n' | 'm' | 'xs' | 'boss' | 'turret' | 'ks' | 'kj' | 'ka' | 'kk' | 'cargo';

/** Gegner etwas zäher als die Grundwerte (Hülle), dazu ein eigener Schild je Art (sh) */
export const ENEMY_HULL = 1.1, ENEMY_SHIELD = 0.6;
export const SPEC: Record<EKind, { hp: number; sh: number; speed: number; r: number; color: string; name: string; pts: number; cost: number }> = {
  jaeger: { hp: 30, sh: 22, speed: 165, r: 10, color: '#ff8a5c', name: 'Piratenjäger', pts: 100, cost: 2 },
  kanone: { hp: 95, sh: 60, speed: 70, r: 16, color: '#ffb547', name: 'Kanonenboot', pts: 250, cost: 4 },
  rakete: { hp: 55, sh: 40, speed: 90, r: 13, color: '#ffd27a', name: 'Raketenboot', pts: 200, cost: 3.5 },
  schild: { hp: 70, sh: 80, speed: 85, r: 13, color: '#7fd8ff', name: 'Schildträger', pts: 250, cost: 4 },
  n: { hp: 15, sh: 12, speed: 205, r: 8, color: '#ff3b4a', name: 'Xenon N', pts: 60, cost: 1.5 },
  m: { hp: 75, sh: 55, speed: 95, r: 14, color: '#ff5c6c', name: 'Xenon M', pts: 250, cost: 4 },
  xs: { hp: 70, sh: 70, speed: 85, r: 13, color: '#ff9ab0', name: 'Schirmdrohne', pts: 250, cost: 4 },
  boss: { hp: 450, sh: 300, speed: 45, r: 34, color: '#ffb547', name: 'Boss', pts: 1500, cost: 0 },
  turret: { hp: 90, sh: 30, speed: 0, r: 13, color: '#ffd27a', name: 'Geschützturm', pts: 200, cost: 0 },
  // Kha'ak: schwache Hülle, kräftige Schilde (Kyon-Kristalle)
  // Bildgrößen im Verhältnis zur Mamba (etwa 34 px): Späher ein Drittel, Jäger gut zwei Drittel (siehe shipArt.ts);
  // die Trefferzone ist etwas größer als das Bild, damit man die Kleinen auch auf dem Handy trifft
  ks: { hp: 18, sh: 18, speed: 230, r: 8, color: '#c77dff', name: 'Kha’ak-Späher', pts: 70, cost: 1.5 },
  kj: { hp: 35, sh: 45, speed: 175, r: 10, color: '#a855f7', name: 'Kha’ak-Jäger', pts: 130, cost: 2.5 },
  ka: { hp: 60, sh: 55, speed: 200, r: 13, color: '#d08cff', name: 'Kha’ak-Abfangjäger', pts: 220, cost: 4 },
  kk: { hp: 120, sh: 90, speed: 70, r: 18, color: '#9b5cff', name: 'Kha’ak-Korvette', pts: 300, cost: 5 },
  // Frachter des Piratenkonvois: zäh, langsam, zwei schwache Abwehrtürme
  cargo: { hp: 420, sh: 150, speed: 24, r: 22, color: '#ffb070', name: 'Piratenfrachter', pts: 800, cost: 0 },
};


const HP_MUL: Record<Level, number> = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.45, 5: 1.6 };

/**
 * Hülle und Schild eines Gegners, wie er im Spiel erscheint: Grundwert × Hüllen-/Schildfaktor × Stufe × Faktor aus
 * dem Entwicklungswerkzeug (Minispiele → Kampf → Gegnerstärke); Großziele haben 55 % der Boss-Werte
 */
export function enemyStats(kind: EKind, level: Level, opt: { mini?: boolean; extra?: number; tune?: { hull: number; shield: number } } = {}): { hp: number; sh: number } {
  const t = opt.tune ?? enemyTune(), k = HP_MUL[level] * (opt.mini ? 0.55 : 1) * (opt.extra ?? 1);
  return { hp: SPEC[kind].hp * ENEMY_HULL * k * t.hull, sh: SPEC[kind].sh * ENEMY_SHIELD * k * t.shield };
}

/** Übersicht für das Entwicklungswerkzeug: alle Gegnertypen einer Stufe */
export function enemyStatTable(level: Level, tune?: { hull: number; shield: number }): { name: string; hp: number; sh: number }[] {
  const kinds: [EKind, string, boolean?][] = [['n', 'Xenon N'], ['jaeger', 'Piratenjäger'], ['rakete', 'Raketenboot'], ['schild', 'Schildträger'], ['xs', 'Schirmdrohne'], ['m', 'Xenon M'], ['kanone', 'Kanonenboot'], ['ks', 'Kha’ak-Späher'], ['kj', 'Kha’ak-Jäger'], ['ka', 'Kha’ak-Abfangjäger'], ['kk', 'Kha’ak-Korvette'], ['turret', 'Geschützturm'], ['boss', 'Großziel', true], ['boss', 'Boss']];
  return kinds.map(([kind, name, mini]) => ({ name, ...enemyStats(kind, level, { mini, tune }) }));
}


/** Der eigene Jäger als Neon-Zeichnung (Nase oben, etwa 25 Bildpunkte lang) */
export function drawFighterVector(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.lineTo(5, -4); ctx.lineTo(12, 8); ctx.lineTo(4, 6); ctx.lineTo(0, 11); ctx.lineTo(-4, 6); ctx.lineTo(-12, 8); ctx.lineTo(-5, -4);
  ctx.closePath();
  ctx.fillStyle = '#0a2028';
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,224,197,0.3)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = '#3fe0c5';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

