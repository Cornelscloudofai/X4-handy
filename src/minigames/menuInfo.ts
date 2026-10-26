// Angaben der Minispiele fürs Menü (Besonderheiten und Nebenziele): eigene Datei, damit Menü und Rahmen sie kennen,
// ohne den Code der Spiele zu laden – die Spiele selbst werden erst beim Start nachgeladen.
import type { GoalDef, Mutator } from './common';
import type { Mission } from './missions';

// ---------- pipes ----------
export const PIPES_NORMAL_GOALS: GoalDef[] = [
  { id: 'moves', text: 'Mit höchstens Bestwert + 30 % Zügen lösen' },
  { id: 'fast', text: 'In der ersten Hälfte der Zeit lösen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'pressure', text: 'Druck nie unter 60 %' },
  { id: 'valve', text: 'Kein Ventil öfter als dreimal drehen' },
];
export const PIPES_CHAIN_GOALS: GoalDef[] = [
  { id: 'chain5', text: 'Fünf Netze schaffen' },
  { id: 'chain8', text: 'Acht Netze schaffen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
];
export const PIPES_MUTATORS: Mutator[] = [
  { id: 'dark', name: 'Notbeleuchtung', desc: 'Nur versorgte Leitungen und ihre Nachbarn sind zu sehen', mult: 1.4 },
  { id: 'rush', name: 'Eilauftrag', desc: 'Nur die halbe Zeit', mult: 1.5 },
  { id: 'valves', name: 'Ventilchaos', desc: 'Zwei zusätzliche Ventilgruppen', mult: 1.3 },
  { id: 'surge', name: 'Überdruck', desc: 'Offene Enden kosten doppelt so viel Druck', mult: 1.3 },
];
export const PIPES_GOALS: GoalDef[] = [...PIPES_NORMAL_GOALS, ...PIPES_CHAIN_GOALS.filter((g) => g.id !== 'combo3')];

// ---------- ore ----------
export const ORE_MUTATORS: Mutator[] = [
  { id: 'rich', name: 'Reiche Adern', desc: 'Mehr Adern, aber ein Viertel weniger Zeit', mult: 1.3 },
  { id: 'hot', name: 'Hitzewelle', desc: 'Der Laser kühlt nur halb so schnell ab', mult: 1.4 },
  { id: 'spin', name: 'Taumelnder Asteroid', desc: 'Der Asteroid dreht sich schnell', mult: 1.4 },
  { id: 'crystal', name: 'Kristallfeld', desc: 'Doppelt so viele Kristallnester', mult: 1.2 },
  { id: 'brittle', name: 'Brüchiges Gestein', desc: 'Risse wachsen doppelt so schnell', mult: 1.35 },
];
export const ORE_GOALS: GoalDef[] = [
  { id: 'cool', text: 'Nie überhitzen' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'crystal2', text: 'Zwei Kristallnester bergen' },
  { id: 'break', text: 'Einen Asteroiden ganz zerlegen' },
  { id: 'nopocket', text: 'Keine Gastasche treffen' },
  { id: 'noflush', text: 'Ohne Kühlspülung auskommen' },
  { id: 'core', text: 'Eine Kernader ausbeuten' },
  { id: 'vent', text: 'Eine Gastasche gefahrlos ablassen' },
  { id: 'stable', text: 'Kein Einsturz' },
];

// ---------- gas ----------
export const GAS_MUTATORS: Mutator[] = [
  { id: 'storm', name: 'Gewittersturm', desc: 'Mehr Sturmzellen und Funken', mult: 1.5 },
  { id: 'gold', name: 'Goldrausch', desc: 'Goldene Ströme viel häufiger', mult: 1.2 },
  { id: 'leak', name: 'Leckender Tank', desc: 'Ungesicherte Ladung entweicht langsam', mult: 1.4 },
  { id: 'fast', name: 'Starke Strömung', desc: 'Die Ströme ziehen viel schneller', mult: 1.4 },
  { id: 'smog', name: 'Verschmutzter Nebel', desc: 'Doppelt so viel Fremdgas', mult: 1.3 },
];
export const GAS_GOALS: GoalDef[] = [
  { id: 'nohit', text: 'Kein Überschlag, kein Blitz' },
  { id: 'gold3', text: 'Aus goldenen Strömen 30 Flocken fangen' },
  { id: 'full4', text: 'Viermal mit vollem Tank entladen' },
  { id: 'combo', text: 'Kombo ×2,5 (volle, reine Tanks in Folge)' },
  { id: 'nowaste', text: 'Am Ende nichts mehr ungesichert im Tank' },
  { id: 'pure3', text: 'Drei reine Ladungen sichern' },
  { id: 'nospark', text: 'Keinen einzigen Funken fangen' },
];

// ---------- cargo ----------
export const CARGO_MUTATORS: Mutator[] = [
  { id: 'heavy', name: 'Schwerlast', desc: 'Alle Container 60 % schwerer', mult: 1.3 },
  { id: 'bouncy', name: 'Prallwände', desc: 'Die Wände federn voll zurück', mult: 1.2 },
  { id: 'drift', name: 'Relativdrift', desc: 'Station und Schiff treiben gegeneinander', mult: 1.4 },
  { id: 'dark', name: 'Notbeleuchtung', desc: 'Bahnvorhersage nur ganz kurz', mult: 1.5 },
  { id: 'weak', name: 'Schwache Magnete', desc: 'Das Magnetfeld bremst nur halb so stark', mult: 1.4 },
];
export const CARGO_GOALS: GoalDef[] = [
  { id: 'order', text: 'Keine Umräumung beim Entladen' },
  { id: 'balance', text: 'Schwerpunkt höchstens 5 % neben der Achse' },
  { id: 'nolost', text: 'Kein Container treibt ins All' },
  { id: 'clean', text: 'Fünf Volltreffer (mit dem ersten Schuss eingefangen)' },
  { id: 'notractor', text: 'Ohne Traktorstrahl auskommen' },
  { id: 'fast', text: 'Alles in der Zielzeit für drei Sterne' },
];

// ---------- highway ----------
export const HIGHWAY_MUTATORS: Mutator[] = [
  { id: 'dense', name: 'Stoßzeit', desc: 'Doppelt so viel Verkehr', mult: 1.4 },
  { id: 'lowfuel', name: 'Knapper Treibstoff', desc: 'Nur halb so viel Δv', mult: 1.4 },
  { id: 'ion', name: 'Ionensturm', desc: 'Seitliche Feldböen schieben das Schiff', mult: 1.5 },
  { id: 'heavy', name: 'Schwer beladen', desc: 'Doppelte Masse: halber Seitenschub', mult: 1.3 },
];
export const HIGHWAY_GOALS: GoalDef[] = [
  { id: 'nocrash', text: 'Keine Kollision' },
  { id: 'fuel', text: 'Mit mehr als der Hälfte Δv ankommen' },
  { id: 'exit', text: 'Die Ausfahrt treffen' },
  { id: 'noretro', text: 'Ohne Gegenschub nach vorn' },
  { id: 'fast', text: 'Zielzeit für drei Sterne' },
  { id: 'gates', text: 'Vier Feldverstärker treffen' },
];

// ---------- orbit ----------
export const ORBIT_MUTATORS: Mutator[] = [
  { id: 'lowfuel', name: 'Knappes Δv', desc: 'Nur 70 % Treibstoff', mult: 1.4 },
  { id: 'weak', name: 'Schwaches Triebwerk', desc: 'Halber Schub: lange Zündungen', mult: 1.3 },
  { id: 'atmo', name: 'Dichte Atmosphäre', desc: 'Die Lufthülle reicht weit hinaus – sie bremst (und lässt sich zum Bremsen nutzen)', mult: 1.2 },
  { id: 'debris', name: 'Trümmerwolke', desc: 'Trümmer kreisen auf kreuzenden Bahnen', mult: 1.4 },
];
export const ORBIT_GOALS: GoalDef[] = [
  { id: 'fuel', text: 'Mit mehr als der Hälfte Δv andocken' },
  { id: 'fast', text: 'Zielzeit für drei Sterne' },
  { id: 'precise', text: 'Präzises Rendezvous: Andockcomputer unter 1.000 m/s' },
  { id: 'burns', text: 'Höchstens drei Zündungen' },
  { id: 'swing', text: 'Swing-by am Mond nutzen' },
  { id: 'aero', text: 'Mit der Atmosphäre bremsen' },
];

// ---------- shooter ----------
export const SHOOTER_MUTATORS: Mutator[] = [
  { id: 'swarm', name: 'Schwarm', desc: 'Deutlich mehr Gegner pro Welle', mult: 1.5 },
  { id: 'glass', name: 'Glaskanone', desc: 'Doppelter Schaden, aber nur halber Schild', mult: 1.4 },
  { id: 'ion', name: 'Ionensturm', desc: 'Schilde laden sich nicht von selbst auf', mult: 1.5 },
  { id: 'mines', name: 'Minengürtel', desc: 'Minen auf der ganzen Strecke', mult: 1.3 },
  { id: 'bounty', name: 'Kopfgeld', desc: 'Mehr Fundstücke, Abschüsse zählen mehr', mult: 1.2 },
];
export const SHOOTER_NORMAL_GOALS: GoalDef[] = [
  { id: 'hull80', text: 'Frachter mit über 80 % Hülle ans Tor' },
  { id: 'boss30', text: 'Den Boss in unter 30 s zerstören' },
  { id: 'combo3', text: 'Kombo ×3 erreichen' },
  { id: 'nomissile', text: 'Ohne Raketensalve gewinnen' },
  { id: 'tough', text: 'Jäger-Hülle nie unter 50 %' },
  { id: 'loot3', text: 'Drei Fundstücke einsammeln' },
];
export const SHOOTER_ENDLESS_GOALS: GoalDef[] = [
  { id: 'wave6', text: 'Welle 6 erreichen' },
  { id: 'wave10', text: 'Welle 10 erreichen' },
  { id: 'combo4', text: 'Kombo ×4 erreichen' },
  { id: 'boss2', text: 'Zwei Bosse besiegen' },
];
export const G_COMBO3: GoalDef = { id: 'combo3', text: 'Kombo ×3 erreichen' };
export const G_TOUGH: GoalDef = { id: 'tough', text: 'Jäger-Hülle nie unter 50 %' };
export const G_LOOT3: GoalDef = { id: 'loot3', text: 'Drei Fundstücke einsammeln' };
export const G_NOMISSILE: GoalDef = { id: 'nomissile', text: 'Ohne Raketensalve gewinnen' };
/** Nebenziele der Einsätze (je Runde drei davon) */
export const MISSION_GOALS: Record<Exclude<Mission, 'geleit'> | 'nestKhaak', GoalDef[]> = {
  station: [{ id: 'turrets', text: 'Am Ende stehen alle sechs Stationstürme' }, { id: 'st80', text: 'Station mit über 80 % Hülle halten' }, G_COMBO3, G_LOOT3, G_TOUGH],
  konvoi: [{ id: 'all3', text: 'Alle drei Frachter ans Tor bringen' }, { id: 'kv60', text: 'Jeder gerettete Frachter mit über 60 % Hülle' }, G_COMBO3, G_NOMISSILE, G_TOUGH],
  flucht: [{ id: 'fl50', text: 'Mit über 50 % Frachter-Hülle springen' }, G_COMBO3, G_TOUGH, G_LOOT3],
  bergung: [{ id: 'crate8', text: 'Alle acht Container bergen' }, { id: 'nolost', text: 'Keinen Container verlieren' }, G_COMBO3, G_TOUGH],
  ueberfall: [{ id: 'cargo3', text: 'Alle drei Piratenfrachter zerstören' }, { id: 'cargo45', text: 'Den ersten Frachter in unter 45 s zerstören' }, G_COMBO3, G_NOMISSILE],
  nest: [{ id: 'nest150', text: 'Das Nest in unter 2:30 ausheben' }, { id: 'combo4', text: 'Kombo ×4 erreichen' }, G_TOUGH, G_NOMISSILE],
  // nur beim Kha'ak-Nest (dort gibt es Nebennester und Turmplattformen)
  nestKhaak: [{ id: 'hives', text: 'Auch beide Nebennester zerstören' }, { id: 'plats', text: 'Alle vier Turmplattformen zerstören' }, { id: 'nest150', text: 'Das Nest in unter 2:30 ausheben' }, G_TOUGH, G_NOMISSILE],
};
export const SHOOTER_GOALS: GoalDef[] = [...SHOOTER_NORMAL_GOALS, ...SHOOTER_ENDLESS_GOALS, ...Object.values(MISSION_GOALS).flat()].filter((g, i, a) => a.findIndex((q) => q.id === g.id) === i);
