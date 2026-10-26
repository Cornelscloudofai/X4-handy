// Minispiel „Orbit-Andocken“: Mit dem Frachter eine Station einholen, die einen Planeten umkreist – nach Kepler.
// Physik zum Staunen: Wer eine Station vor sich auf derselben Bahn einholen will, muss BREMSEN. Bremsen senkt die Bahn,
// und eine tiefere Bahn ist kürzer und schneller (Umlaufzeit ~ a^1,5). Schub nach vorn hebt die Bahn – man wird langsamer.
// Höher hinaus kommt man am günstigsten mit zwei Zündungen (Hohmann-Transfer): Schub unten, Ankunft oben im Apozentrum.
// Die Bahnvorhersage rechnet mit derselben Physik wie das Spiel (Schwerkraft, Mond, Atmosphäre) und zeigt die nächste
// Annäherung an die Station. Im Nahbereich gleicht der Andockcomputer die Relativgeschwindigkeit an – das kostet Δv, um so
// mehr, je schlechter das Rendezvous war. Ab Stufe 4 zieht ein Mond die Bahn (Swing-by: Vorbeiflug ändert die Bahnenergie).
// Wer zu tief fliegt, wird von der Atmosphäre gebremst (Aerobremsung) – oder stürzt ab.
import { sfx } from '../ui/sound';
import { sustain } from '../audio/ambience';
import { BG_IMAGES } from '../render/bgImages';
import { fbm, perlin } from '../render/noise';
import { shipSprite, stationCoreSprite, moduleSprite } from '../render/shipArt';
import {
  buzz, clamp, findMutator, Floaters, Particles, pickGoals, rgba, rng, Score, setGoal, TOP,
  type GameCfg, type GameResult, type Goal, type HudItem, type MiniGame, type Mutator, type Rules,
} from './common';
import { ORBIT_GOALS, ORBIT_MUTATORS } from './menuInfo';
export { ORBIT_MUTATORS, ORBIT_GOALS };

/** Gravitationsparameter des Planeten (Planetenradius = 1, Zeit in Spielsekunden = Missionsminuten) */
const MU = 0.8;
/** fester Rechenschritt (Spiel und Vorhersage gleich) */
const STEP = 1 / 60;
/** Haupttriebwerk und Steuerdüsen des Andockcomputers (Radien/s²) */
const ACC = 0.05;
const ACC_RCS = 0.12;
/** Nahbereich (Andockcomputer verfügbar), Fangradius und höchste Relativgeschwindigkeit beim Andocken */
const NEAR = 0.45;
const DOCK_R = 0.02;
const DOCK_V = 0.012;
/** Anzeige: 1 Radius = 1000 km, 1 Spielsekunde = 1 Minute */
const KM = 1000;
const MS = 1e6 / 60;
/** Zeitraffer */
const WARP = 8;
/** Moon: Masse relativ zum Planeten */
const MOON_MU = 0.012 * MU;
const MOON_R = 0.24;



interface Body { x: number; y: number; vx: number; vy: number }
interface Debris extends Body { hit: number }
interface Elements { a: number; e: number; ex: number; ey: number; energy: number }
interface Pred { pts: number[]; minD: number; tMin: number; ship: [number, number]; station: [number, number]; crash: boolean }

/** Bahnelemente aus Lage und Geschwindigkeit (Kepler) */
export function elements(b: Body, mu = MU): Elements {
  const r = Math.hypot(b.x, b.y), v2 = b.vx * b.vx + b.vy * b.vy;
  const energy = v2 / 2 - mu / r;
  const a = -mu / (2 * energy);
  const rv = b.x * b.vx + b.y * b.vy;
  const ex = ((v2 - mu / r) * b.x - rv * b.vx) / mu, ey = ((v2 - mu / r) * b.y - rv * b.vy) / mu;
  return { a, e: Math.hypot(ex, ey), ex, ey, energy };
}

/** Körper auf einer Ellipse (große Halbachse a, Exzentrizität e, Periapsis-Richtung w) an der wahren Anomalie f, gegen den Uhrzeigersinn */
function onOrbit(a: number, e: number, w: number, f: number): Body {
  const p = a * (1 - e * e);
  const r = p / (1 + e * Math.cos(f));
  const th = w + f;
  const h = Math.sqrt(MU * p);
  const vr = (MU / h) * e * Math.sin(f), vt = (MU / h) * (1 + e * Math.cos(f));
  return {
    x: r * Math.cos(th), y: r * Math.sin(th),
    vx: vr * Math.cos(th) - vt * Math.sin(th), vy: vr * Math.sin(th) + vt * Math.cos(th),
  };
}

const period = (a: number) => 2 * Math.PI * Math.sqrt(a ** 3 / MU);
const vCirc = (r: number) => Math.sqrt(MU / r);

let bgImg: HTMLImageElement | null = null;
function background(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!bgImg) {
    bgImg = new Image();
    bgImg.decoding = 'async';
    bgImg.src = BG_IMAGES.find((b) => b.id === 'nebel-rot-tuerkis')?.url ?? '';
  }
  return bgImg.complete && bgImg.naturalWidth ? bgImg : null;
}

/** Planetenarten: Ozean, Land, Wolken, Lichter der Städte */
const PLANETS = [
  { name: 'Ozeanwelt', deep: [12, 40, 92], shallow: [30, 96, 150], low: [52, 110, 60], high: [150, 140, 98], ice: true, sea: 0.53, atmo: '#7fc8ff', lights: true },
  { name: 'Wüstenwelt', deep: [96, 52, 30], shallow: [140, 84, 44], low: [190, 130, 72], high: [226, 190, 140], ice: false, sea: 0.4, atmo: '#ffc890', lights: true },
  { name: 'Giftwelt', deep: [40, 70, 30], shallow: [70, 110, 40], low: [120, 140, 60], high: [170, 170, 110], ice: false, sea: 0.5, atmo: '#c8ff9a', lights: false },
  { name: 'Eiswelt', deep: [60, 90, 130], shallow: [120, 160, 200], low: [190, 210, 230], high: [240, 246, 255], ice: true, sea: 0.45, atmo: '#c8e8ff', lights: true },
] as const;
type PlanetKind = (typeof PLANETS)[number];

/** Sonnenrichtung (Blick von oben auf den Pol; die Sonne steht etwas über der Bahnebene) */
const SUN = (() => { const v = [-0.78, 0.42, 0.46]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / l); })();

interface PlanetArt { surf: HTMLCanvasElement; clouds: HTMLCanvasElement; lights: HTMLCanvasElement | null; shade: HTMLCanvasElement; night: HTMLCanvasElement; tmp: HTMLCanvasElement; size: number }

/**
 * Planetenbild Bildpunkt für Bildpunkt: Oberfläche (fraktales Relief, Meer, Küsten, Polkappe), Wolken, Stadtlichter;
 * dazu eine feste Licht- und eine Nachtmaske (die Sonne dreht nicht mit). Blick von oben auf den Nordpol: die Drehung
 * des Planeten ist eine Drehung des Bildes. Kugelkrümmung über die azimutale Abbildung (zum Rand hin gestaucht).
 */
function makePlanet(size: number, seed: number, kind: PlanetKind, moon = false): PlanetArt {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const surf = mk(), clouds = mk(), shade = mk(), night = mk(), tmp = mk();
  const lights = kind.lights && !moon ? mk() : null;
  const n1 = perlin(seed), n2 = perlin(seed + 7), n3 = perlin(seed + 13);
  const S = surf.getContext('2d')!.createImageData(size, size);
  const C = clouds.getContext('2d')!.createImageData(size, size);
  const H = shade.getContext('2d')!.createImageData(size, size);
  const N = night.getContext('2d')!.createImageData(size, size);
  const Lg = lights?.getContext('2d')!.createImageData(size, size);
  const lr = rng(seed ^ 0x3c);
  const mix = (a: readonly number[], b: readonly number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = ((px + 0.5) / size) * 2 - 1, v = ((py + 0.5) / size) * 2 - 1;
      const r2 = u * u + v * v;
      if (r2 >= 1) continue;
      const r = Math.sqrt(r2), z = Math.sqrt(1 - r2);
      // Kantenglättung am Rand
      const edge = clamp((1 - r) * size * 0.5, 0, 1);
      const k = r > 1e-6 ? Math.asin(r) / r : 1;
      const sx = u * k * 1.6, sy = v * k * 1.6;
      const i = (py * size + px) * 4;
      let col: number[];
      if (moon) {
        const h = fbm(n1, sx * 2.2, sy * 2.2, 5);
        const cr = fbm(n2, sx * 5, sy * 5, 3);
        const g = 90 + h * 120 - Math.max(0, 0.55 - cr) * 160;
        col = [g, g * 0.97, g * 0.94];
      } else {
        const h = fbm(n1, sx * 1.3, sy * 1.3, 6);
        const lat = r; // Abstand vom Pol (oben = Nordpol in der Bildmitte)
        if (h < kind.sea) col = mix(kind.deep, kind.shallow, clamp((h - kind.sea + 0.12) / 0.12, 0, 1));
        else col = mix(kind.low, kind.high, clamp((h - kind.sea) / 0.22, 0, 1));
        // Polkappe in der Mitte (wir blicken auf den Pol)
        if (kind.ice) {
          const cap = clamp((0.34 - lat + (fbm(n3, sx * 3, sy * 3, 3) - 0.5) * 0.25) / 0.05, 0, 1);
          col = mix(col, [236, 244, 255], cap);
        }
        // Wolken
        const cl = fbm(n2, sx * 1.7 + 3, sy * 2.4, 5);
        const ca = clamp((cl - 0.5) / 0.16, 0, 1) * 0.85;
        C.data[i] = 245; C.data[i + 1] = 248; C.data[i + 2] = 255; C.data[i + 3] = ca * 255 * edge;
        // Stadtlichter: entlang der Küsten auf dem Land
        if (Lg && h > kind.sea && h < kind.sea + 0.08 && lr() < 0.05 + (fbm(n3, sx * 6, sy * 6, 2) - 0.5) * 0.3) {
          Lg.data[i] = 255; Lg.data[i + 1] = 196; Lg.data[i + 2] = 110; Lg.data[i + 3] = (160 + lr() * 95) * edge;
        }
      }
      // Gesteins-/Bodenkörnung
      const grain = (fbm(n3, sx * 14, sy * 14, 2) - 0.5) * 30;
      S.data[i] = clamp(col[0] + grain, 0, 255); S.data[i + 1] = clamp(col[1] + grain, 0, 255); S.data[i + 2] = clamp(col[2] + grain, 0, 255);
      S.data[i + 3] = 255 * edge;
      // Licht: Lambert mit weichem Terminator; Randabdunklung
      const dot = u * SUN[0] - v * SUN[1] + z * SUN[2];
      const lit = clamp((dot + 0.08) / 0.5, 0, 1);
      const lightness = lit * (0.55 + 0.45 * z) ** 0.6;
      H.data[i] = 0; H.data[i + 1] = 2; H.data[i + 2] = 8; H.data[i + 3] = (1 - lightness * 0.96) * 255 * edge;
      N.data[i + 3] = clamp(1 - lit * 2.2, 0, 1) * 255 * edge;
    }
  }
  surf.getContext('2d')!.putImageData(S, 0, 0);
  clouds.getContext('2d')!.putImageData(C, 0, 0);
  shade.getContext('2d')!.putImageData(H, 0, 0);
  night.getContext('2d')!.putImageData(N, 0, 0);
  if (lights && Lg) lights.getContext('2d')!.putImageData(Lg, 0, 0);
  return { surf, clouds, lights, shade, night, tmp, size };
}

type Scenario = 'up' | 'catch' | 'down' | 'ecc';

export class OrbitGame implements MiniGame {
  readonly eyebrow = 'Orbit-Andocken';
  readonly title: string;
  readonly intro: string;
  readonly controls = [
    'Rechts halten: Schub nach vorn (prograd) – hebt die Bahn auf der anderen Seite des Planeten',
    'Links halten: Bremsen (retrograd) – senkt die Bahn; tiefer ist schneller!',
    'Mitte halten: Zeitraffer ×8',
    'Gestrichelte Linie = Vorhersage; Ringe zeigen die nächste Annäherung an die Station',
    'Im Nahbereich „Andocken“ halten: der Andockcomputer gleicht die Geschwindigkeit an (kostet Δv)',
  ];
  readonly mutator: Mutator | null;
  readonly goals: Goal[];
  /** Wertung zum Nachlesen: Sterne fürs Andocken, übriges Δv und die Zielzeit (unabhängig voneinander) */
  get rules(): Rules {
    return {
      stars: ['An der Station andocken', 'Beim Andocken noch mindestens 40 % Δv übrig', `Andocken innerhalb der Zielzeit (${this.clock(this.tTarget)})`],
      points: [
        'Angedockt: 1.000, dazu bis 800 nach übrigem Δv (voller Tank = 800)',
        'Swing-by am Mond: 300',
        'Zeitbonus: 10 je Sekunde, die du unter dem Anderthalbfachen der Zielzeit bleibst',
        'Der zweite und dritte Stern zählen nur mit Andocken, sind aber unabhängig voneinander',
        ...(this.mutator && this.mutator.mult !== 1 ? [`Besonderheit „${this.mutator.name}“: alle Punkte ×${String(this.mutator.mult).replace('.', ',')}`] : []),
      ],
    };
  }
  readonly scenario: Scenario;
  private r: () => number;
  private score: Score;
  ship: Body;
  station: Body;
  private debris: Debris[] = [];
  /** Mond (ab Stufe 4): Bahnradius, Winkel zu t = 0 */
  private moon: { r: number; a0: number; n: number } | null = null;
  private atmoTop: number;
  private drag: number;
  private acc: number;
  fuel: number;
  fuel0: number;
  t = 0;
  private limit: number;
  private tTarget: number;
  private viewR: number;
  private planet: PlanetKind;
  private planetSeed: number;
  private art: PlanetArt | null = null;
  private moonArt: PlanetArt | null = null;
  private touches = new Map<number, 'pro' | 'retro' | 'warp' | 'dock'>();
  private auto: { pro: boolean; retro: boolean; warp: boolean; dock: boolean } | null = null;
  private input = { pro: false, retro: false, warp: false, dock: false };
  private burns = 0;
  private wasBurning = false;
  private burnDv = 0;
  private dockDv = 0;
  private aeroDv = 0;
  private swing = false;
  private swingE0: number | null = null;
  private faster = false;
  private accum = 0;
  private pred: Pred | null = null;
  private predT = 0;
  private stationOrbit: number[] = [];
  private stationEl: Elements;
  private heading = Math.PI / 2;
  private heat = 0;
  private fx = new Particles();
  private floats = new Floaters();
  private w = 1;
  private h = 1;
  private cx = 0;
  private cy = 0;
  private scale = 1;
  private bgCache: HTMLCanvasElement | null = null;
  private done: GameResult | null = null;
  private endT = -1;
  private outcome: 'docked' | 'crash' | 'lost' | 'time' | null = null;
  private relDock = 0;
  private fastWarn = 0;
  private plan: { dv: number; left: number } | null = null;
  private planT = 0;

  constructor(cfg: GameCfg) {
    const L = cfg.level;
    this.r = rng(cfg.seed);
    this.mutator = findMutator(ORBIT_MUTATORS, cfg.mutator);
    this.score = new Score(this.mutator?.mult ?? 1, 4);
    this.planet = PLANETS[Math.floor(this.r() * PLANETS.length)];
    this.planetSeed = Math.floor(this.r() * 1e6);
    const mid = this.mutator?.id;
    this.atmoTop = mid === 'atmo' ? 1.42 : 1.16;
    this.drag = mid === 'atmo' ? 0.9 : 0.6;
    this.acc = ACC * (mid === 'weak' ? 0.5 : 1);
    const pool: Scenario[][] = [['up'], ['up', 'catch'], ['catch', 'down'], ['down', 'ecc'], ['ecc', 'catch', 'down']];
    const sc = (this.scenario = pool[L - 1][Math.floor(this.r() * pool[L - 1].length)]);
    const ang0 = this.r() * Math.PI * 2;
    let shipA: number, stA: number, stE = 0, shipE = 0, phase: number;
    // Bahnen nach Szenario; die Station steht in einem nicht ganz idealen Winkel (Warten oder Δv)
    if (sc === 'up') {
      shipA = 1.45 + this.r() * 0.15; stA = 2.4 + this.r() * 0.35 + (L - 1) * 0.06;
      const tH = Math.PI * Math.sqrt(((shipA + stA) / 2) ** 3 / MU);
      phase = Math.PI - (2 * Math.PI / period(stA)) * tH + 0.3 + this.r() * 1.6;
    } else if (sc === 'catch') {
      shipA = stA = 2.0 + this.r() * 0.5;
      phase = (0.45 + this.r() * 0.6) * (L >= 4 && this.r() < 0.5 ? -1 : 1);
    } else if (sc === 'down') {
      shipA = 2.5 + this.r() * 0.35; stA = 1.45 + this.r() * 0.2 + (L >= 3 && mid === 'atmo' ? 0.12 : 0);
      const tH = Math.PI * Math.sqrt(((shipA + stA) / 2) ** 3 / MU);
      phase = Math.PI - (2 * Math.PI / period(stA)) * tH - 0.4 - this.r() * 1.8;
    } else {
      shipA = 1.55 + this.r() * 0.2; shipE = L >= 5 ? 0.08 + this.r() * 0.08 : 0;
      stA = 2.3 + this.r() * 0.3; stE = 0.15 + this.r() * 0.12;
      phase = this.r() * Math.PI * 2;
    }
    if (mid === 'atmo') { shipA = Math.max(shipA, 1.5); stA = Math.max(stA, 1.6); }
    const stW = ang0 + phase + this.r() * 0.6;
    this.ship = onOrbit(shipA, shipE, ang0, 0);
    this.station = sc === 'ecc' ? onOrbit(stA, stE, stW, Math.PI * 0.6 + this.r() * 2) : onOrbit(stA, 0, ang0 + phase, 0);
    this.stationEl = elements(this.station);
    if (L >= 4) {
      const mr = Math.max(stA * (1 + stE), shipA * (1 + shipE)) + 0.9;
      this.moon = { r: mr, a0: this.r() * Math.PI * 2, n: Math.sqrt(MU / mr ** 3) };
    }
    if (mid === 'debris') {
      for (let k = 0; k < 10; k++) {
        const a = 1.5 + this.r() * 1.3, e = 0.1 + this.r() * 0.25;
        this.debris.push({ ...onOrbit(a, e, this.r() * 6.3, this.r() * 6.3), hit: 0 });
      }
    }
    // Δv-Haushalt: Hohmann zwischen den Bahnen (bzw. Phasenbahn), dazu Reserve und Andocken
    const r1 = shipA, r2 = stA;
    const at = (r1 + r2) / 2;
    const dvH = Math.abs(Math.sqrt(MU * (2 / r1 - 1 / at)) - vCirc(r1)) + Math.abs(vCirc(r2) - Math.sqrt(MU * (2 / r2 - 1 / at)));
    let dvP = 0;
    if (sc === 'catch') {
      const ap = r1 * (1 - Math.abs(phase) / (2 * Math.PI)) ** (2 / 3);
      dvP = 2 * Math.abs(vCirc(r1) - Math.sqrt(MU * (2 / r1 - 1 / ap)));
    }
    const dvE = sc === 'ecc' ? stE * vCirc(stA) + shipE * vCirc(shipA) : 0;
    this.fuel0 = this.fuel = ((dvH + dvP + dvE) * [2.6, 2.5, 2.4, 2.3, 2.2][L - 1] + 0.1) * (mid === 'lowfuel' ? 0.7 : 1);
    // Zeiten: Zielzeit aus Synodenperiode und Transferzeit, Grenze in Umläufen der Station
    const Ts = period(stA), T1 = period(shipA);
    const tH = Math.PI * Math.sqrt(at ** 3 / MU);
    const syn = Math.abs(1 / T1 - 1 / Ts) > 1e-3 ? 1 / Math.abs(1 / T1 - 1 / Ts) : Ts;
    this.tTarget = sc === 'catch' ? Ts * 1.6 + 20 : sc === 'ecc' ? Ts * 2.2 + 20 : Math.min(syn, Ts * 2) * 0.7 + tH + 22;
    this.limit = Math.max(this.tTarget * 3, Ts * 6);
    this.viewR = Math.max(this.moon ? this.moon.r + MOON_R * 1.6 : 0, stA * (1 + stE), shipA * (1 + shipE), this.atmoTop) * 1.08;
    // Bahn der Station (keplersch, ohne Mond: die Station hält ihre Bahn)
    const tp = period(this.stationEl.a);
    const st = { ...this.station };
    for (let k = 0, n = Math.ceil(tp / STEP); k <= n; k++) {
      if (k % 4 === 0) this.stationOrbit.push(st.x, st.y);
      this.stepBody(st, k * STEP, false, 0, 0);
    }
    const names = ['Handelsstation Zhin', 'Werft Tkr', 'Raffinerie Zyarth', 'Lager Rhys', 'Habitat Tharka'];
    const name = names[Math.floor(this.r() * names.length)];
    this.title = `Andocken an ${name}`;
    const what = sc === 'up' ? 'Die Station kreist höher als du: Schub nach vorn hebt deine Bahn auf der gegenüberliegenden Seite. Zünde, wenn die Vorhersage dich dort zur Station bringt.'
      : sc === 'catch' ? `Die Station kreist auf deiner Bahn, aber ${phase > 0 ? 'vor' : 'hinter'} dir. ${phase > 0 ? 'Zum Einholen musst du bremsen: Eine tiefere Bahn ist kürzer und schneller. Danach mit Schub wieder hinauf.' : 'Zum Zurückfallen gib Schub: eine höhere Bahn ist langsamer.'}`
      : sc === 'down' ? 'Die Station kreist tiefer als du: Bremsen senkt deine Bahn auf der gegenüberliegenden Seite – tief unten bist du schneller.'
      : 'Die Station fliegt auf einer Ellipse: unten schnell, oben langsam. Suche mit der Vorhersage eine Annäherung.';
    this.intro = `${what} Im Nahbereich (${NEAR * KM} km) übernimmt der Andockcomputer – je besser dein Rendezvous, desto weniger Δv kostet er.`
      + (this.moon ? ' Der Mond zieht deine Bahn mit; ein naher Vorbeiflug (Swing-by) ändert sie kräftig.' : '')
      + (mid === 'atmo' ? ' Die dichte Lufthülle bremst tiefe Bahnen.' : '');
    const goalPool = ORBIT_GOALS.filter((g) => (g.id !== 'swing' || this.moon) && (g.id !== 'aero' || mid === 'atmo'));
    this.goals = pickGoals(goalPool, rng(cfg.seed ^ 0x77));
  }

  /** Beschleunigung durch Planet, Mond und Atmosphäre */
  private accel(b: Body, t: number, withMoon: boolean, out: number[]): void {
    const r2 = b.x * b.x + b.y * b.y, r = Math.sqrt(r2);
    let ax = (-MU * b.x) / (r2 * r), ay = (-MU * b.y) / (r2 * r);
    if (withMoon && this.moon) {
      const [mx, my] = this.moonPos(t);
      const dx = b.x - mx, dy = b.y - my, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      ax -= (MOON_MU * dx) / (d2 * d);
      ay -= (MOON_MU * dy) / (d2 * d);
    }
    if (withMoon && r < this.atmoTop) {
      const rho = ((this.atmoTop - r) / (this.atmoTop - 1)) ** 2;
      ax -= rho * this.drag * b.vx;
      ay -= rho * this.drag * b.vy;
    }
    out[0] = ax; out[1] = ay;
  }

  moonPos(t: number): [number, number] {
    if (!this.moon) return [0, 0];
    const a = this.moon.a0 + this.moon.n * t;
    return [Math.cos(a) * this.moon.r, Math.sin(a) * this.moon.r];
  }

  private tmpA = [0, 0];
  /** ein Schritt (symplektischer Euler): Spiel und Vorhersage rechnen identisch */
  private stepBody(b: Body, t: number, ship: boolean, tx: number, ty: number, h = STEP): void {
    this.accel(b, t, ship, this.tmpA);
    b.vx += (this.tmpA[0] + tx) * h;
    b.vy += (this.tmpA[1] + ty) * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
  }

  /** Vorhersage ohne Schub: Bahnpunkte und nächste Annäherung an die Station */
  predict(horizon: number, h = STEP, ship: Body = this.ship, keep = true): Pred {
    const s = { ...ship }, st = { ...this.station };
    const pts: number[] = [];
    let minD = Infinity, tMin = 0, at: [number, number] = [s.x, s.y], ats: [number, number] = [st.x, st.y], crash = false;
    const n = Math.ceil(horizon / h), every = Math.max(1, Math.round(0.1 / h));
    for (let k = 0; k <= n; k++) {
      const t = this.t + k * h;
      if (keep && k % every === 0) pts.push(s.x, s.y);
      const d = Math.hypot(s.x - st.x, s.y - st.y);
      if (d < minD) { minD = d; tMin = k * h; at = [s.x, s.y]; ats = [st.x, st.y]; }
      if (s.x * s.x + s.y * s.y < 1) { crash = true; break; }
      this.stepBody(s, t, true, 0, 0, h);
      this.stepBody(st, t, false, 0, 0, h);
    }
    return { pts, minD, tMin, ship: at, station: ats, crash };
  }

  private horizon(): number {
    const el = elements(this.ship);
    const T = el.energy < 0 ? period(el.a) : 40;
    return clamp(Math.max(T, period(this.stationEl.a)) * 1.1, 20, 80);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.bgCache = null;
    const bottom = 128;
    this.cx = w / 2;
    this.cy = TOP + (h - TOP - bottom) / 2;
    this.scale = Math.min(w * 0.48, (h - TOP - bottom) / 2) / this.viewR;
    this.art = null;
    this.moonArt = null;
  }

  private px(x: number): number { return this.cx + x * this.scale; }
  private py(y: number): number { return this.cy - y * this.scale; }

  get dist(): number { return Math.hypot(this.ship.x - this.station.x, this.ship.y - this.station.y); }
  get relV(): number { return Math.hypot(this.ship.vx - this.station.vx, this.ship.vy - this.station.vy); }

  hud(): HudItem[] {
    const d = this.dist;
    return [
      { label: 'Zeit', value: this.clock(this.t) },
      { label: 'Abstand', value: d < 10 ? `${Math.round(d * KM).toLocaleString('de-DE')} km` : '–' },
      { label: 'Δv', value: `${Math.round(this.fuel * MS).toLocaleString('de-DE')} m/s`, warn: this.fuel < this.fuel0 * 0.2 },
    ];
  }

  private clock(t: number): string {
    const m = Math.floor(t);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
  }

  points(): number { return this.score.points; }
  combo(): number { return this.score.combo; }

  private buttons(): { id: 'pro' | 'retro' | 'warp' | 'dock'; x: number; y: number; r: number }[] {
    const y = this.h - 62;
    const list: { id: 'pro' | 'retro' | 'warp' | 'dock'; x: number; y: number; r: number }[] = [
      { id: 'retro', x: 52, y, r: 34 },
      { id: 'pro', x: this.w - 52, y, r: 34 },
    ];
    // im Nahbereich wird aus dem Zeitraffer die Andocktaste
    list.push(this.dist < NEAR ? { id: 'dock', x: this.w / 2, y, r: 32 } : { id: 'warp', x: this.w / 2, y: y + 8, r: 26 });
    return list;
  }

  pointerDown(id: number, x: number, y: number): void {
    if (y < TOP) return;
    let best: 'pro' | 'retro' | 'warp' | 'dock' | null = null, bd = Infinity;
    for (const b of this.buttons()) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r + 26 && d < bd) { bd = d; best = b.id; }
    }
    // breite Daumenflächen unten links/rechts
    if (!best && y > this.h - 160) best = x < this.w * 0.33 ? 'retro' : x > this.w * 0.67 ? 'pro' : this.dist < NEAR ? 'dock' : 'warp';
    if (best) this.touches.set(id, best);
  }

  pointerMove(): void { /* nur halten */ }

  pointerUp(id: number): void {
    this.touches.delete(id);
  }

  /** Nur für Tests: Autopilot. Sucht eine Zündung (prograd/retrograd), nach der die Vorhersage nahe an die Station führt;
   * dazwischen Zeitraffer; im Nahbereich der Andockcomputer. */
  autopilot(): void {
    const a = { pro: false, retro: false, warp: false, dock: false };
    if (this.dist < 0.3) { a.dock = true; this.plan = null; this.auto = a; return; }
    if (this.plan) {
      if (this.plan.left > 0 && this.fuel > 0) { a.pro = this.plan.dv > 0; a.retro = this.plan.dv < 0; this.auto = a; return; }
      this.plan = null;
      this.planT = 0;
    }
    if (this.t >= this.planT) {
      this.planT = this.t + 1.5;
      const H = this.horizon();
      const cur = this.predict(H, 1 / 20, this.ship, false);
      if (!(cur.minD < 0.1 && !cur.crash)) {
        const v = Math.hypot(this.ship.vx, this.ship.vy);
        const test = (dv: number) => {
          if (Math.abs(dv) > this.fuel * 0.75) return Infinity;
          const s = { ...this.ship, vx: this.ship.vx + (this.ship.vx / v) * dv, vy: this.ship.vy + (this.ship.vy / v) * dv };
          const p = this.predict(H, 1 / 20, s, false);
          return p.crash ? Infinity : p.minD + Math.abs(dv) * 0.8 + p.tMin * 0.0015;
        };
        let best = 0, bs = Infinity;
        const grid = [-0.16, -0.12, -0.09, -0.07, -0.05, -0.035, -0.02, -0.01, 0.01, 0.02, 0.035, 0.05, 0.07, 0.09, 0.12, 0.16];
        for (const dv of grid) { const sc = test(dv); if (sc < bs) { bs = sc; best = dv; } }
        // verfeinern: Schrittweite halbieren
        for (let st = 0.008; st > 0.0005 && bs < Infinity; st /= 2) {
          for (const dv of [best - st, best + st]) { const sc = test(dv); if (sc < bs) { bs = sc; best = dv; } }
        }
        const v2 = { ...this.ship, vx: this.ship.vx + (this.ship.vx / v) * best, vy: this.ship.vy + (this.ship.vy / v) * best };
        if (bs < Infinity && this.predict(H, 1 / 20, v2, false).minD < 0.1) {
          this.plan = { dv: best, left: Math.abs(best) }; a.pro = best > 0; a.retro = best < 0; this.auto = a; return;
        }
      }
    }
    a.warp = true;
    this.auto = a;
  }

  update(dt: number): void {
    if (this.done) return;
    this.fx.update(dt);
    this.floats.update(dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 2.2) this.done = this.finish();
      return;
    }
    if (this.auto) this.input = this.auto;
    else {
      const v = [...this.touches.values()];
      this.input = { pro: v.includes('pro'), retro: v.includes('retro'), warp: v.includes('warp'), dock: v.includes('dock') && this.dist < NEAR };
    }
    const inp = this.input;
    const burning = (inp.pro !== inp.retro) && this.fuel > 0;
    if (burning && !this.wasBurning) { this.burns++; sfx.thrust(); }
    if (burning && this.endT < 0) sustain('orbit-burn', 'engine', 0.75);
    this.wasBurning = burning;
    const warp = inp.warp && !burning && !inp.dock ? WARP : 1;
    this.accum += Math.min(dt, 0.05) * warp;
    let thrusted = false;
    while (this.accum >= STEP && this.endT < 0) {
      this.accum -= STEP;
      thrusted = this.step(inp) || thrusted;
    }
    // Vorhersage: beim Schub laufend, sonst alle 0,15 s
    this.predT -= dt;
    if (thrusted || this.predT <= 0 || !this.pred) { this.pred = this.predict(this.horizon()); this.predT = 0.15; }
    // Lage des Schiffs: zeigt in Schubrichtung (beim Bremsen dreht es sich um)
    const vAng = Math.atan2(this.ship.vy, this.ship.vx);
    const want = inp.retro && !inp.pro ? vAng + Math.PI : vAng;
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, dt * 6);
    this.heat = Math.max(0, this.heat - dt * 0.8);
    setGoal(this.goals, 'fuel', this.fuel > this.fuel0 / 2);
    setGoal(this.goals, 'burns', this.burns <= 3);
    setGoal(this.goals, 'swing', this.swing);
    setGoal(this.goals, 'aero', this.aeroDv > 0.02);
  }

  /** ein fester Schritt mit Steuerung; true, wenn geschubt wurde */
  private step(inp: { pro: boolean; retro: boolean; dock: boolean }): boolean {
    const s = this.ship;
    let tx = 0, ty = 0;
    const v = Math.hypot(s.vx, s.vy);
    if (this.fuel > 0) {
      if (inp.dock && this.dist < NEAR) {
        // Andockcomputer: Sollgeschwindigkeit zur Station hin, Schwerkraftunterschied ausgleichen
        const rx = s.x - this.station.x, ry = s.y - this.station.y, d = Math.hypot(rx, ry);
        const sp = clamp(d * 0.35, 0.006, 0.05);
        const wx = this.station.vx - (rx / d) * sp, wy = this.station.vy - (ry / d) * sp;
        const g1 = [0, 0], g2 = [0, 0];
        this.accel(s, this.t, true, g1);
        this.accel(this.station, this.t, false, g2);
        let ax = (wx - s.vx) * 2.5 - (g1[0] - g2[0]), ay = (wy - s.vy) * 2.5 - (g1[1] - g2[1]);
        const am = Math.hypot(ax, ay), lim = ACC_RCS * (this.mutator?.id === 'weak' ? 0.6 : 1);
        if (am > lim) { ax *= lim / am; ay *= lim / am; }
        tx = ax; ty = ay;
        this.dockDv += Math.hypot(ax, ay) * STEP;
      } else if (inp.pro !== inp.retro && v > 0) {
        const sg = inp.pro ? 1 : -1;
        tx = (s.vx / v) * this.acc * sg;
        ty = (s.vy / v) * this.acc * sg;
        this.burnDv += this.acc * STEP;
        if (this.plan) this.plan.left -= this.acc * STEP;
      }
      const used = Math.hypot(tx, ty) * STEP;
      this.fuel = Math.max(0, this.fuel - used);
    }
    const r0 = Math.hypot(s.x, s.y);
    const vBefore = v;
    this.stepBody(s, this.t, true, tx, ty);
    this.stepBody(this.station, this.t, false, 0, 0);
    for (const d of this.debris) { this.stepBody(d, this.t, false, 0, 0); d.hit = Math.max(0, d.hit - STEP); }
    this.t += STEP;
    // Aerobremsung: Geschwindigkeitsverlust durch die Lufthülle
    if (r0 < this.atmoTop) {
      const rho = ((this.atmoTop - r0) / (this.atmoTop - 1)) ** 2;
      const lost = rho * this.drag * vBefore * STEP;
      this.aeroDv += lost;
      this.heat = Math.min(1, this.heat + rho * STEP * 6);
      if (Math.random() < rho * 2) this.fx.add({ x: this.px(s.x), y: this.py(s.y), vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, color: '#ffb070', size: 2 + Math.random() * 2, max: 0.4 });
    }
    // Swing-by: Bahnenergie vor und nach dem Vorbeiflug am Mond vergleichen
    if (this.moon) {
      const [mx, my] = this.moonPos(this.t);
      const dm = Math.hypot(s.x - mx, s.y - my);
      const soi = this.moon.r * (MOON_MU / MU) ** 0.4;
      if (dm < soi && this.swingE0 == null) this.swingE0 = elements(s).energy;
      if (dm > soi * 1.05 && this.swingE0 != null) {
        const dE = elements(s).energy - this.swingE0;
        if (Math.abs(dE) > 0.012) {
          this.swing = true;
          const dv = Math.round(Math.abs(dE) / Math.max(0.2, v) * MS);
          this.floats.add(this.px(s.x), this.py(s.y) - 20, `Swing-by: ${dE > 0 ? '+' : '−'}${dv} m/s ohne Treibstoff`, '#c8b8ff', 14);
          const p = this.score.add(300, 'Swing-by');
          this.floats.add(this.px(s.x), this.py(s.y) - 2, `+${p}`, '#c8b8ff', 13);
          sfx.chime();
        }
        this.swingE0 = null;
      }
      if (dm < MOON_R) return this.end('crash');
    }
    // Trümmer
    for (const d of this.debris) {
      if (d.hit > 0) continue;
      if (Math.hypot(s.x - d.x, s.y - d.y) < 0.05) {
        d.hit = 3;
        this.fuel = Math.max(0, this.fuel - this.fuel0 * 0.1);
        this.floats.add(this.px(s.x), this.py(s.y) - 16, 'Trümmertreffer: −10 % Δv', '#ff9aa4', 14);
        this.fx.burst(this.px(s.x), this.py(s.y), '#ffd0a0', 16, 160, 1.5, 'spark', 0.4);
        this.score.reset();
        sfx.hull();
        buzz(40);
      }
    }
    // tiefer = schneller: einmal erklären, wenn das Schiff durch Bremsen die Station einholt
    if (!this.faster && this.burnDv > 0.01) {
      const el = elements(s);
      if (el.energy < 0 && el.a < this.stationEl.a * 0.97 && Math.hypot(s.x, s.y) < Math.hypot(this.station.x, this.station.y) && this.scenario !== 'up') {
        this.faster = true;
        this.floats.add(this.w / 2, TOP + 40, 'Tiefere Bahn – du holst auf!', '#9fe8ff', 15);
      }
    }
    const r = Math.hypot(s.x, s.y);
    if (r < 1) return this.end('crash');
    const el = elements(s);
    if (el.energy > 0 && r > this.viewR * 1.3) return this.end('lost');
    if (this.t > this.limit) return this.end('time');
    // Andocken
    const d = this.dist;
    if (d < DOCK_R) {
      if (this.relV < DOCK_V) { this.relDock = this.relV; return this.end('docked'); }
      if (this.t > this.fastWarn) this.fastWarn = this.t + 3, this.floats.add(this.px(s.x), this.py(s.y) - 24, 'Zu schnell für den Andockstrahl!', '#ffb547', 13);
    }
    return tx !== 0 || ty !== 0;
  }

  private end(o: 'docked' | 'crash' | 'lost' | 'time'): boolean {
    this.outcome = o;
    this.endT = 0;
    const x = this.px(this.ship.x), y = this.py(this.ship.y);
    if (o === 'docked') {
      this.ship.x = this.station.x; this.ship.y = this.station.y;
      setGoal(this.goals, 'precise', this.dockDv * MS < 1000);
      setGoal(this.goals, 'fast', this.t <= this.tTarget);
      const p = this.score.add(1000, 'Angedockt') + this.score.add(Math.round((this.fuel / this.fuel0) * 800), 'Übriges Δv');
      this.floats.add(x, y - 30, `Angedockt! +${p}`, '#6be38f', 18);
      this.fx.add({ x, y, color: '#6be38f', size: 30, kind: 'ring', max: 0.7 });
      this.fx.burst(x, y, '#c8ffd8', 20, 120, 1.4, 'spark', 0.6);
      sfx.dock();
      buzz(30);
    } else {
      if (o === 'crash') { this.fx.burst(x, y, '#ffb070', 40, 220, 2, 'spark', 0.8); this.fx.add({ x, y, color: '#ff8a5a', size: 26, kind: 'ring', max: 0.6 }); buzz(120); }
      this.floats.add(this.w / 2, this.h * 0.35, o === 'crash' ? 'Abgestürzt!' : o === 'lost' ? 'In den Raum entkommen' : 'Andockfenster verpasst', '#ff9aa4', 18);
      if (o === 'crash') sfx.explosion(1.6); else sfx.warn();
    }
    return false;
  }

  private finish(): GameResult {
    const ok = this.outcome === 'docked';
    const left = this.fuel / this.fuel0;
    const stars = (ok ? 1 + (left >= 0.4 ? 1 : 0) + (this.t <= this.tTarget ? 1 : 0) : 0) as 0 | 1 | 2 | 3;
    if (ok) this.score.bonus((this.tTarget * 1.5 - this.t) * 10, 'Zeitbonus');
    return {
      success: ok,
      stars,
      starRules: [
        { text: this.rules.stars[0], ok, got: ok ? undefined : this.outcome === 'crash' ? 'Abgestürzt' : this.outcome === 'lost' ? 'Fluchtbahn' : 'Andockfenster verpasst' },
        { text: this.rules.stars[1], ok: ok && left >= 0.4, got: `${Math.round(left * 100)} % übrig` },
        { text: this.rules.stars[2], ok: ok && this.t <= this.tTarget, got: `Missionszeit ${this.clock(this.t)}` },
      ],
      breakdown: this.score.breakdown(),
      score: Math.round(this.t),
      points: this.score.points,
      goals: this.goals.map((g) => ({ ...g })),
      headline: !ok ? (this.outcome === 'crash' ? 'Abgestürzt' : this.outcome === 'lost' ? 'Fluchtbahn' : 'Andockfenster verpasst') : stars === 3 ? 'Perfektes Rendezvous' : 'Angedockt',
      lines: [
        ['Missionszeit', `${this.clock(this.t)} (Ziel ${this.clock(this.tTarget)})`],
        ['Δv übrig', `${Math.round(left * 100)} % (★ ab 40 %)`],
        ['Zündungen', `${this.burns} · ${Math.round(this.burnDv * MS).toLocaleString('de-DE')} m/s`],
        ['Andockcomputer', `${Math.round(this.dockDv * MS).toLocaleString('de-DE')} m/s`],
        ...(ok ? [['Andockgeschwindigkeit', `${Math.round(this.relDock * MS)} m/s`] as [string, string]] : []),
        ...(this.aeroDv > 0.005 ? [['Aerobremsung', `${Math.round(this.aeroDv * MS).toLocaleString('de-DE')} m/s`] as [string, string]] : []),
      ],
    };
  }

  result(): GameResult | null { return this.done; }

  abort(): GameResult {
    const r = this.finish();
    r.success = false;
    r.stars = 0;
    for (const g of r.goals) g.done = false;
    r.headline = 'Abgebrochen';
    return r;
  }

  // ---------- Darstellung ----------

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const img = background();
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
    if (img && (!this.bgCache || this.bgCache.width !== W || this.bgCache.height !== H)) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (this.w - img.naturalWidth * s) / 2, (this.h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      g.fillStyle = 'rgba(2,4,10,0.5)';
      g.fillRect(0, 0, this.w, this.h);
      this.bgCache = c;
    }
    if (this.bgCache) ctx.drawImage(this.bgCache, 0, 0, this.w, this.h);
    else { ctx.fillStyle = '#03070d'; ctx.fillRect(0, 0, this.w, this.h); }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now / 1000;
    this.drawBackground(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, this.w, this.h - TOP);
    ctx.clip();
    this.drawSunlight(ctx);
    this.drawAtmoZone(ctx);
    this.drawPlanet(ctx);
    if (this.moon) this.drawMoon(ctx);
    this.drawStationOrbit(ctx);
    this.drawDebris(ctx, t);
    this.drawPrediction(ctx, t);
    this.drawApsides(ctx);
    this.drawStation(ctx, t, this.px(this.station.x), this.py(this.station.y), 26);
    if (this.outcome !== 'docked' || this.endT < 0.5) this.drawShip(ctx, t);
    ctx.restore();
    this.fx.draw(ctx);
    this.floats.draw(ctx);
    if (this.dist < NEAR * 1.4 && this.endT < 0) this.drawRadar(ctx, t);
    this.drawControls(ctx, t);
  }

  /** schwacher Lichtschein von der Sonnenseite */
  private drawSunlight(ctx: CanvasRenderingContext2D): void {
    const R = this.scale;
    const sx = this.cx + SUN[0] * R * 6, sy = this.cy - SUN[1] * R * 6;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 8);
    g.addColorStop(0, 'rgba(255,236,200,0.10)');
    g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, TOP, this.w, this.h - TOP);
  }

  /** Grenze der Atmosphäre (Bremszone) */
  private drawAtmoZone(ctx: CanvasRenderingContext2D): void {
    const R = this.scale;
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = rgba(this.planet.atmo, this.mutator?.id === 'atmo' ? 0.35 : 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.atmoTop * R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawPlanet(ctx: CanvasRenderingContext2D): void {
    const R = this.scale;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const size = clamp(Math.ceil(R * 2 * dpr), 128, 900);
    if (!this.art || this.art.size !== size) this.art = makePlanet(size, this.planetSeed, this.planet);
    const a = this.art;
    const rot = -this.t * 0.05;
    // Atmosphärenschein (hinter dem Planeten)
    const glow = ctx.createRadialGradient(this.cx, this.cy, R * 0.95, this.cx, this.cy, R * 1.22);
    glow.addColorStop(0, rgba(this.planet.atmo, 0.42));
    glow.addColorStop(1, rgba(this.planet.atmo, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R * 1.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(this.cx, this.cy);
    ctx.save();
    ctx.rotate(rot);
    ctx.drawImage(a.surf, -R, -R, R * 2, R * 2);
    ctx.rotate(-this.t * 0.025);
    ctx.drawImage(a.clouds, -R, -R, R * 2, R * 2);
    ctx.restore();
    ctx.drawImage(a.shade, -R, -R, R * 2, R * 2);
    // Stadtlichter nur auf der Nachtseite
    if (a.lights) {
      const g = a.tmp.getContext('2d')!;
      g.globalCompositeOperation = 'copy';
      g.save();
      g.translate(a.size / 2, a.size / 2);
      g.rotate(rot);
      g.drawImage(a.lights, -a.size / 2, -a.size / 2);
      g.restore();
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(a.night, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(a.tmp, -R, -R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Lichtsaum der Atmosphäre auf der Tagseite
    const rim = ctx.createRadialGradient(0, 0, R * 0.86, 0, 0, R * 1.02);
    rim.addColorStop(0, rgba(this.planet.atmo, 0));
    rim.addColorStop(1, rgba(this.planet.atmo, 0.5));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMoon(ctx: CanvasRenderingContext2D): void {
    const [mx, my] = this.moonPos(this.t);
    const x = this.px(mx), y = this.py(my), R = MOON_R * this.scale;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const size = clamp(Math.ceil(R * 2 * dpr), 48, 400);
    if (!this.moonArt || this.moonArt.size !== size) this.moonArt = makePlanet(size, this.planetSeed + 99, PLANETS[0], true);
    // Bahn und Einflussbereich
    ctx.save();
    ctx.strokeStyle = 'rgba(200,190,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.moon!.r * this.scale, 0, Math.PI * 2);
    ctx.stroke();
    const soi = this.moon!.r * (MOON_MU / MU) ** 0.4 * this.scale;
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = 'rgba(200,184,255,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, soi, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.moonArt.surf, x - R, y - R, R * 2, R * 2);
    ctx.drawImage(this.moonArt.shade, x - R, y - R, R * 2, R * 2);
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,184,255,0.7)';
    ctx.fillText('MOND', x, y + R + 12);
    ctx.restore();
  }

  /** Bahn der Station (Ellipse) */
  private drawStationOrbit(ctx: CanvasRenderingContext2D): void {
    const o = this.stationOrbit;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,196,94,0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < o.length; k += 2) {
      const x = this.px(o[k]), y = this.py(o[k + 1]);
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawDebris(ctx: CanvasRenderingContext2D, t: number): void {
    for (const d of this.debris) {
      const x = this.px(d.x), y = this.py(d.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 2 + d.x * 5);
      ctx.fillStyle = d.hit > 0 ? 'rgba(255,154,122,0.5)' : '#a8a0a0';
      ctx.beginPath();
      ctx.moveTo(-4, -2); ctx.lineTo(1, -4); ctx.lineTo(4, 0); ctx.lineTo(2, 3); ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,120,110,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 0.05 * this.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Vorhersage (verblassende Linie) und nächste Annäherung: Geisterbilder von Schiff und Station */
  private drawPrediction(ctx: CanvasRenderingContext2D, t: number): void {
    const p = this.pred;
    if (!p || this.endT >= 0) return;
    const pts = p.pts, n = pts.length / 2;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const seg = 12;
    for (let s = 0; s < n - 1; s += seg) {
      const a = 0.85 * (1 - s / n) + 0.1;
      ctx.strokeStyle = rgba(p.crash && s > n * 0.6 ? '#ff8a6a' : '#7fe8ff', a);
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath();
      for (let k = s; k <= Math.min(n - 1, s + seg); k++) {
        const x = this.px(pts[k * 2]), y = this.py(pts[k * 2 + 1]);
        if (k === s) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (p.crash) {
      const x = this.px(pts[pts.length - 2]), y = this.py(pts[pts.length - 1]);
      ctx.fillStyle = '#ff8a6a';
      ctx.font = '700 11px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ABSTURZ', x, y - 8);
    }
    // nächste Annäherung
    if (p.tMin > 0.5 && this.dist > DOCK_R * 3) {
      const good = p.minD < NEAR * 0.5;
      const sx = this.px(p.ship[0]), sy = this.py(p.ship[1]);
      const tx = this.px(p.station[0]), ty = this.py(p.station[1]);
      ctx.strokeStyle = good ? 'rgba(107,227,143,0.9)' : 'rgba(255,210,122,0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(127,232,255,0.9)';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,196,94,0.9)';
      ctx.beginPath();
      ctx.arc(tx, ty, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (good) {
        ctx.strokeStyle = rgba('#6be38f', 0.5 + 0.4 * Math.sin(t * 6));
        ctx.beginPath();
        ctx.arc(tx, ty, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = '700 11px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = good ? '#6be38f' : '#ffd27a';
      const lx = (sx + tx) / 2, ly = Math.min(sy, ty) - 14;
      ctx.fillText(`${Math.round(p.minD * KM).toLocaleString('de-DE')} km · in ${Math.round(p.tMin)} min`, lx, ly);
    }
    ctx.restore();
  }

  /** Apozentrum und Perizentrum der eigenen Bahn (aus den Bahnelementen) */
  private drawApsides(ctx: CanvasRenderingContext2D): void {
    if (this.endT >= 0) return;
    const el = elements(this.ship);
    if (el.e < 0.02) return;
    const ux = el.ex / el.e, uy = el.ey / el.e;
    const marks: [string, number, number][] = [['Pe', el.a * (1 - el.e), 1]];
    if (el.energy < 0) marks.push(['Ap', el.a * (1 + el.e), -1]);
    ctx.save();
    ctx.font = '700 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    for (const [lab, r, sg] of marks) {
      const x = this.px(ux * r * sg), y = this.py(uy * r * sg);
      const low = lab === 'Pe' && r < this.atmoTop;
      ctx.fillStyle = low ? '#ff9a7a' : '#bfefff';
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
      const alt = Math.round((r - 1) * KM);
      ctx.fillText(`${lab} ${alt.toLocaleString('de-DE')} km`, x, y - 9);
    }
    ctx.restore();
  }

  private stationImg(): HTMLImageElement | null {
    return stationCoreSprite('ring', this.planetSeed);
  }

  /** Station: Kern mit Andockmodul, Positionslichter, Andockstrahl-Ring */
  private drawStation(ctx: CanvasRenderingContext2D, t: number, x: number, y: number, size: number, radar = false): void {
    const img = this.stationImg();
    const dock = moduleSprite('dock', 0);
    const ang = Math.atan2(this.station.vy, this.station.vx);
    ctx.save();
    ctx.translate(x, y);
    // Lichthof
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.2);
    g.addColorStop(0, 'rgba(255,210,140,0.25)');
    g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-size * 1.2, -size * 1.2, size * 2.4, size * 2.4);
    ctx.rotate(-ang + t * 0.1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (dock) ctx.drawImage(dock, -size * 0.2, -size * 1.05, size * 0.4, size * 0.6);
    if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size);
    else {
      ctx.strokeStyle = '#ffc45e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Positionslicht
    if (Math.sin(t * 4) > 0.3) {
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.55, radar ? 2.5 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!radar && this.endT < 0) {
      ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,210,122,0.85)';
      ctx.fillText('STATION', x, y + size * 0.75 + 8);
    }
  }

  private drawShip(ctx: CanvasRenderingContext2D, t: number): void {
    const x = this.px(this.ship.x), y = this.py(this.ship.y);
    const sp = shipSprite('frachter-m', 'frachter-m');
    const size = 26;
    const burning = this.endT < 0 && this.fuel > 0 && (this.input.pro !== this.input.retro || this.input.dock);
    ctx.save();
    ctx.translate(x, y);
    // Bildschirm: y nach unten → Winkel spiegeln; Bild zeigt nach oben
    ctx.rotate(-this.heading + Math.PI / 2);
    // Triebwerksflamme hinten (Rückstoß nach hinten, Schub nach vorn)
    if (burning && !this.input.dock) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fl = 14 + Math.random() * 6;
      const g = ctx.createLinearGradient(0, size * 0.35, 0, size * 0.35 + fl);
      g.addColorStop(0, 'rgba(255,240,210,0.95)');
      g.addColorStop(0.4, 'rgba(255,170,80,0.7)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-4, size * 0.35);
      ctx.quadraticCurveTo(0, size * 0.35 + fl * 1.3, 4, size * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (this.heat > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createRadialGradient(0, -size * 0.3, 0, 0, -size * 0.3, size * 0.8);
      hg.addColorStop(0, rgba('#ffb070', 0.6 * this.heat));
      hg.addColorStop(1, rgba('#ff6030', 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, -size * 0.3, size * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (sp) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#1a3a4a';
      ctx.strokeStyle = '#7fe8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(6, 8); ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    // Andockdüsen: kleine Stöße
    if (burning && this.input.dock && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, color: '#dff4ff', size: 2, max: 0.25, solid: true, alpha: 0.6 });
    }
    // Markierung des eigenen Schiffs
    ctx.strokeStyle = rgba('#7fe8ff', 0.55);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -t * 12;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Nahbereichsradar: Station in der Mitte, Abstand logarithmisch, Relativgeschwindigkeit als Pfeil */
  private drawRadar(ctx: CanvasRenderingContext2D, t: number): void {
    const R = 74, x0 = this.w - R - 10, y0 = TOP + R + 8;
    const d = this.dist;
    ctx.save();
    ctx.fillStyle = 'rgba(4,12,20,0.82)';
    ctx.beginPath();
    ctx.arc(x0, y0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,232,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const map = (q: number) => (R - 10) * (Math.log(1 + q / 0.01) / Math.log(1 + (NEAR * 1.4) / 0.01));
    ctx.font = '600 9px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'left';
    for (const q of [DOCK_R, 0.1, NEAR]) {
      ctx.strokeStyle = q === DOCK_R ? 'rgba(107,227,143,0.7)' : 'rgba(127,232,255,0.18)';
      ctx.setLineDash(q === DOCK_R ? [] : [2, 4]);
      ctx.beginPath();
      ctx.arc(x0, y0, map(q), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(169,195,198,0.6)';
      if (q !== DOCK_R) ctx.fillText(`${Math.round(q * KM)} km`, x0 + map(q) * 0.72 + 2, y0 - map(q) * 0.72);
    }
    ctx.setLineDash([]);
    this.drawStation(ctx, t, x0, y0, 22, true);
    // Schiff relativ zur Station
    const rx = this.ship.x - this.station.x, ry = this.ship.y - this.station.y;
    const ux = rx / (d || 1), uy = ry / (d || 1);
    const sx = x0 + ux * map(d), sy = y0 - uy * map(d);
    const rvx = this.ship.vx - this.station.vx, rvy = this.ship.vy - this.station.vy;
    const rv = Math.hypot(rvx, rvy);
    const closing = -(rx * rvx + ry * rvy) / (d || 1);
    ctx.fillStyle = '#7fe8ff';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    if (rv > 1e-4) {
      const L = clamp(rv / 0.05, 0.15, 1) * 34;
      const ex = sx + (rvx / rv) * L, ey = sy - (rvy / rv) * L;
      const ok = rv < DOCK_V;
      ctx.strokeStyle = ok ? '#6be38f' : rv < DOCK_V * 3 ? '#ffd27a' : '#ff9aa4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      const a = Math.atan2(ey - sy, ex - sx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a - 0.5) * 6, ey - Math.sin(a - 0.5) * 6);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a + 0.5) * 6, ey - Math.sin(a + 0.5) * 6);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.font = '700 10px "Chakra Petch", Barlow, sans-serif';
    ctx.fillStyle = rv < DOCK_V ? '#6be38f' : '#e8f6ff';
    ctx.fillText(`${Math.round(d * KM).toLocaleString('de-DE')} km`, x0, y0 + R - 22);
    ctx.fillText(`rel. ${Math.round(rv * MS).toLocaleString('de-DE')} m/s ${closing > 0 ? '↘' : '↗'}`, x0, y0 + R - 10);
    ctx.fillStyle = 'rgba(169,195,198,0.75)';
    ctx.fillText('NAHBEREICH', x0, y0 - R + 14);
    ctx.restore();
  }

  /** Daumentasten: Bremsen, Schub, Zeitraffer, Andocken; Zündungsanzeige */
  private drawControls(ctx: CanvasRenderingContext2D, t: number): void {
    const inp = this.input;
    for (const b of this.buttons()) {
      const on = inp[b.id];
      const col = b.id === 'dock' ? '#6be38f' : b.id === 'warp' ? '#c8b8ff' : b.id === 'pro' ? '#ffb070' : '#7fd8ff';
      ctx.fillStyle = on ? rgba(col, 0.28) : 'rgba(8,18,28,0.72)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = on ? col : rgba(col, b.id === 'dock' ? 0.5 + 0.4 * Math.sin(t * 5) : 0.45);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = on ? '#ffffff' : rgba(col, 0.9);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${b.id === 'warp' ? 14 : 18}px "Chakra Petch", Barlow, sans-serif`;
      ctx.fillText(b.id === 'pro' ? '▲' : b.id === 'retro' ? '▼' : b.id === 'warp' ? '⏩' : '◎', b.x, b.y - (b.id === 'warp' ? 2 : 5));
      ctx.font = '700 9px "Chakra Petch", Barlow, sans-serif';
      ctx.fillText(b.id === 'pro' ? 'SCHUB' : b.id === 'retro' ? 'BREMSEN' : b.id === 'warp' ? `×${WARP}` : 'ANDOCKEN', b.x, b.y + (b.id === 'warp' ? 13 : 13));
      ctx.textBaseline = 'alphabetic';
    }
    // Mitte: Bahndaten
    const el = elements(this.ship);
    const y = this.h - 118;
    ctx.font = '600 10px "Chakra Petch", Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(169,195,198,0.85)';
    const v = Math.hypot(this.ship.vx, this.ship.vy) * MS / 1000;
    const T = el.energy < 0 ? `${Math.round(period(el.a))} min` : '∞';
    if (this.dist >= NEAR) {
      ctx.fillText(`v ${v.toFixed(2).replace('.', ',')} km/s · Umlauf ${T} (Station ${Math.round(period(this.stationEl.a))} min)`, this.w / 2, y);
    }
    const left = this.fuel / this.fuel0;
    const W = 130;
    ctx.fillStyle = 'rgba(8,18,28,0.75)';
    ctx.fillRect(this.w / 2 - W / 2, y + 8, W, 5);
    ctx.fillStyle = left < 0.2 ? '#ff9aa4' : left >= 0.4 ? '#6be38f' : '#ffd27a';
    ctx.fillRect(this.w / 2 - W / 2, y + 8, W * left, 5);
    ctx.fillStyle = '#e8f6ff';
    ctx.fillRect(this.w / 2 - W / 2 + W * 0.4 - 0.5, y + 5, 1, 11);
    if (this.fuel <= 0 && Math.sin(t * 6) > 0) { ctx.fillStyle = '#ff9aa4'; ctx.fillText('KEIN Δv MEHR', this.w / 2, y - 14); }
    if (inp.warp && !(inp.pro !== inp.retro)) {
      ctx.fillStyle = 'rgba(200,184,255,0.9)';
      ctx.font = '700 12px "Chakra Petch", Barlow, sans-serif';
      ctx.fillText(`ZEITRAFFER ×${WARP}`, this.w / 2, TOP + 22);
    }
  }
}
