// Symbole der Spezialfähigkeiten für die Taste über der Feuertaste (statt eines Buchstabens). Gezeichnet als Vektor
// in Einheiten von -1 bis 1, damit sie auf jeder Bildschirmauflösung scharf bleiben.
import type { SpecialId } from './loadout';

type Ctx = CanvasRenderingContext2D;

/** kleines Jägerdreieck (Spitze nach oben) */
function fighter(g: Ctx, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 0.8, y + s * 0.8);
  g.lineTo(x, y + s * 0.4);
  g.lineTo(x - s * 0.8, y + s * 0.8);
  g.closePath();
  g.fill();
}

/** Rakete (Spitze nach oben, Leitwerk unten) */
function rocket(g: Ctx, x: number, y: number, len: number, w: number): void {
  g.beginPath();
  g.moveTo(x, y - len / 2);
  g.quadraticCurveTo(x + w, y - len / 2 + w * 1.2, x + w * 0.7, y + len / 2 - w);
  g.lineTo(x + w * 1.5, y + len / 2);
  g.lineTo(x - w * 1.5, y + len / 2);
  g.lineTo(x - w * 0.7, y + len / 2 - w);
  g.quadraticCurveTo(x - w, y - len / 2 + w * 1.2, x, y - len / 2);
  g.closePath();
  g.fill();
}

const DRAW: Record<SpecialId, (g: Ctx) => void> = {
  // Ausweichen: Jäger mit Seitwärtsbewegung (Bewegungsstriche links)
  dash: (g) => {
    fighter(g, 0.25, 0, 0.55);
    g.lineWidth = 0.13;
    g.lineCap = 'round';
    for (const [y, l] of [[-0.35, 0.5], [0.05, 0.75], [0.45, 0.5]] as const) {
      g.beginPath();
      g.moveTo(-0.95, y);
      g.lineTo(-0.95 + l, y);
      g.stroke();
    }
  },
  // Nachbrenner: Flamme
  sprint: (g) => {
    g.beginPath();
    g.moveTo(0, -0.95);
    g.bezierCurveTo(0.35, -0.45, 0.75, -0.1, 0.62, 0.38);
    g.bezierCurveTo(0.5, 0.82, 0.18, 0.95, 0, 0.95);
    g.bezierCurveTo(-0.18, 0.95, -0.5, 0.82, -0.62, 0.38);
    g.bezierCurveTo(-0.72, -0.02, -0.42, -0.22, -0.3, -0.5);
    g.bezierCurveTo(-0.18, -0.25, -0.05, -0.2, 0.02, -0.12);
    g.bezierCurveTo(0.08, -0.45, 0.02, -0.7, 0, -0.95);
    g.closePath();
    g.fill();
    // heller Kern
    g.globalAlpha *= 0.45;
    g.fillStyle = '#02070c';
    g.beginPath();
    g.moveTo(0, -0.05);
    g.bezierCurveTo(0.22, 0.2, 0.3, 0.45, 0.22, 0.62);
    g.bezierCurveTo(0.14, 0.78, -0.14, 0.78, -0.22, 0.62);
    g.bezierCurveTo(-0.3, 0.45, -0.18, 0.22, 0, -0.05);
    g.fill();
  },
  // Waffenüberladung: Blitz
  overdrive: (g) => {
    g.beginPath();
    g.moveTo(0.22, -1);
    g.lineTo(-0.55, 0.12);
    g.lineTo(-0.05, 0.12);
    g.lineTo(-0.25, 1);
    g.lineTo(0.58, -0.18);
    g.lineTo(0.08, -0.18);
    g.closePath();
    g.fill();
  },
  // Torpedo: schwerer Flugkörper mit Leitwerk, schräg
  torpedo: (g) => {
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.moveTo(0, -1.05);
    g.quadraticCurveTo(0.24, -0.85, 0.24, -0.55);
    g.lineTo(0.24, 0.55);
    g.lineTo(0.5, 0.92);
    g.lineTo(-0.5, 0.92);
    g.lineTo(-0.24, 0.55);
    g.lineTo(-0.24, -0.55);
    g.quadraticCurveTo(-0.24, -0.85, 0, -1.05);
    g.closePath();
    g.fill();
  },
  // Begleitjäger: zwei Jäger in Formation
  escort: (g) => {
    fighter(g, -0.45, 0.22, 0.62);
    fighter(g, 0.45, -0.22, 0.62);
  },
  // Raketenschwarm: drei Raketen im Fächer
  salvo: (g) => {
    for (const a of [-0.5, 0, 0.5]) {
      g.save();
      g.translate(0, 0.85);
      g.rotate(a);
      rocket(g, 0, -0.85, 1.35, 0.2);
      g.restore();
    }
  },
};

/** Symbol der Fähigkeit mittig bei (x, y), Kantenlänge etwa 2·s */
export function drawSpecialIcon(g: Ctx, id: SpecialId, x: number, y: number, s: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = color;
  g.strokeStyle = color;
  DRAW[id](g);
  g.restore();
}
