// Vorab-Rendering „kleines Kampfschiff“ (Draufsicht, Nase oben): 3D-Modell aus Grundformen mit
// gemalter Rumpftextur, Metall-Material, Licht von links oben, weichen Schatten und Leuchtstreifen.
// Wird von scripts/render-sprites.mjs im Browser geöffnet; Ergebnis landet in src/assets/sprites/.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const S = 2048; // Renderauflösung (wird danach verkleinert)
const TEAL = 0x3fe0c5;

// ---------- Rumpftextur (planar: Bildkoordinate = Modellkoordinate) ----------
const T = 2048;
const px = (x) => ((x + 1.15) / 2.3) * T;
const py = (y) => (1 - (y + 1.15) / 2.3) * T;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function hullTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d');
  const r = rng(7);
  g.fillStyle = '#4a525c';
  g.fillRect(0, 0, T, T);
  // Plattenfelder in leicht wechselnden Tönen
  for (let i = 0; i < 260; i++) {
    const x = r() * T, y = r() * T, w = 40 + r() * 160, h = 30 + r() * 120;
    const v = 58 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${v - 6},${v + 2},${v + 12},0.5)`;
    g.fillRect(x, y, w, h);
  }
  // Plattenfugen: Raster entlang der Längsachse, verschoben
  g.strokeStyle = 'rgba(20,24,30,0.55)';
  g.lineWidth = 3;
  for (let y = -1.1; y < 1.1; y += 0.11) { g.beginPath(); g.moveTo(0, py(y)); g.lineTo(T, py(y)); g.stroke(); }
  for (let x = -1.1; x < 1.1; x += 0.13) { g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), T); g.stroke(); }
  // Mittelnaht und Rückenlinien
  g.strokeStyle = 'rgba(15,18,24,0.7)';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(px(0), py(0.95)); g.lineTo(px(0), py(-0.85)); g.stroke();
  // Nieten
  g.fillStyle = 'rgba(30,34,40,0.6)';
  for (let y = -1.1; y < 1.1; y += 0.11) for (let x = -1.1; x < 1.1; x += 0.026) g.fillRect(px(x) - 2, py(y) + 4, 4, 4);
  // dunkle Wartungsklappen
  g.fillStyle = 'rgba(40,46,56,0.75)';
  for (const [x, y, w, h] of [[0.05, 0.05, 0.07, 0.18], [-0.12, 0.05, 0.07, 0.18], [0.3, -0.18, 0.12, 0.06], [-0.42, -0.18, 0.12, 0.06], [0.04, -0.55, 0.06, 0.14], [-0.1, -0.55, 0.06, 0.14]]) g.fillRect(px(x), py(y), (w / 2.3) * T, (h / 2.3) * T);
  // Staffelmarkierung: Winkel auf den Flügeln (türkis und bernstein), Warnstreifen
  for (const s of [1, -1]) {
    g.fillStyle = 'rgba(40,190,165,0.9)';
    g.beginPath();
    g.moveTo(px(s * 0.5), py(-0.2)); g.lineTo(px(s * 0.64), py(-0.29)); g.lineTo(px(s * 0.64), py(-0.33)); g.lineTo(px(s * 0.5), py(-0.24));
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(230,150,40,0.9)';
    g.beginPath();
    g.moveTo(px(s * 0.54), py(-0.27)); g.lineTo(px(s * 0.68), py(-0.36)); g.lineTo(px(s * 0.68), py(-0.39)); g.lineTo(px(s * 0.54), py(-0.3));
    g.closePath(); g.fill();
    // Gelb-schwarze Warnstreifen an der Flügelwurzel
    for (let k = 0; k < 6; k++) {
      g.fillStyle = k % 2 ? '#1a1a1a' : '#d9a83a';
      g.fillRect(px(s * 0.2) + (s > 0 ? k : -k - 1) * 10, py(-0.38), 10, 26);
    }
  }
  // Nase dunkler (Sensorkuppel)
  const ng = g.createRadialGradient(px(0), py(0.95), 0, px(0), py(0.95), 140);
  ng.addColorStop(0, 'rgba(20,26,34,0.9)');
  ng.addColorStop(1, 'rgba(20,26,34,0)');
  g.fillStyle = ng;
  g.fillRect(0, 0, T, T);
  // Abnutzung: Schmutz und Kratzer
  for (let i = 0; i < 9000; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`;
    g.fillRect(r() * T, r() * T, 1 + r() * 3, 1 + r() * 3);
  }
  g.strokeStyle = 'rgba(220,226,232,0.12)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) { const x = r() * T, y = r() * T, a = r() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.stroke(); }
  // Triebwerksruß hinten
  const sg = g.createLinearGradient(0, py(-0.5), 0, py(-0.95));
  sg.addColorStop(0, 'rgba(10,10,12,0)');
  sg.addColorStop(1, 'rgba(10,10,12,0.55)');
  g.fillStyle = sg;
  g.fillRect(px(-0.3), py(-0.5), (0.6 / 2.3) * T, (0.45 / 2.3) * T);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Planare UV: Modell (x,y) → Textur
function planarUV(geo) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + 1.15) / 2.3;
    uv[i * 2 + 1] = (pos.getY(i) + 1.15) / 2.3;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function shape(pts, smooth) {
  const s = new THREE.Shape();
  if (smooth) {
    // Rumpf: weich gerundeter Umriss (Spline), spitze Nase bleibt
    s.moveTo(pts[0][0], pts[0][1]);
    s.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  } else pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function mirrored(pts) {
  return [...pts, ...pts.slice().reverse().map(([x, y]) => [-x, y])];
}

function extrude(pts, depth, bevel, z = 0, segs = 5, smooth = false) {
  let geo = new THREE.ExtrudeGeometry(shape(pts, smooth), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: segs, curveSegments: 48 });
  geo.translate(0, 0, z);
  // weiche Schattierung über die Fasen: Ecken zusammenführen, Normalen neu
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  return planarUV(geo);
}

// ---------- Szene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(S, S);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const cam = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 20);
cam.position.set(0, 0, 10);
cam.lookAt(0, 0, 0);

const key = new THREE.DirectionalLight(0xfff4e6, 1.9);
key.position.set(-2.2, 2.6, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = key.shadow.camera.bottom = -1.4;
key.shadow.camera.right = key.shadow.camera.top = 1.4;
key.shadow.bias = -0.0004;
key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0x8fc8ff, 0.55);
fill.position.set(2.5, -1.5, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x5ff0d8, 0.6);
rim.position.set(0, -3, 0.6);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x202830, 0.35));

const hullTex = hullTexture();
const hull = new THREE.MeshStandardMaterial({ map: hullTex, metalness: 0.5, roughness: 0.55 });
const hullDark = new THREE.MeshStandardMaterial({ map: hullTex, color: 0x9aa4b0, metalness: 0.6, roughness: 0.4 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2b3139, metalness: 0.85, roughness: 0.35 });
const darker = new THREE.MeshStandardMaterial({ color: 0x15191e, metalness: 0.6, roughness: 0.5 });
const gun = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.95, roughness: 0.25 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x050c12, metalness: 0.2, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0x0d3434, emissiveIntensity: 0.35 });
const neon = new THREE.MeshStandardMaterial({ color: 0x0a2a26, emissive: TEAL, emissiveIntensity: 1.1 });
const engineGlow = new THREE.MeshStandardMaterial({ color: 0x08202a, emissive: 0x7fd8ff, emissiveIntensity: 1.4 });
const navRed = new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff4a4a, emissiveIntensity: 3 });
const navGreen = new THREE.MeshStandardMaterial({ color: 0x083008, emissive: 0x5aff9a, emissiveIntensity: 3 });
const emissiveMats = new Set([neon, engineGlow, navRed, navGreen, glass]);

const ship = new THREE.Group();
scene.add(ship);
const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; ship.add(m); return m; };

// Rumpf: breiter Unterbau, darauf schmaler Rücken
add(extrude(mirrored([[0, 1.0], [0.05, 0.86], [0.09, 0.66], [0.13, 0.42], [0.155, 0.15], [0.17, -0.2], [0.175, -0.55], [0.15, -0.74], [0.11, -0.82], [0, -0.84]]), 0.1, 0.06, 0, 8, true), hull);
add(extrude(mirrored([[0, 0.72], [0.045, 0.6], [0.07, 0.3], [0.08, -0.1], [0.085, -0.55], [0.06, -0.7], [0, -0.72]]), 0.06, 0.05, 0.14, 8, true), hullDark);
// Flügel (gepfeilt) und Entenflügel
const wingPts = [[0.13, 0.16], [0.36, -0.04], [0.78, -0.36], [0.8, -0.5], [0.62, -0.52], [0.15, -0.46]];
const canardPts = [[0.08, 0.6], [0.24, 0.46], [0.25, 0.4], [0.09, 0.42]];
for (const s of [1, -1]) {
  const w = add(extrude(wingPts, 0.025, 0.018, 0.04, 3), hull); w.scale.x = s;
  const c = add(extrude(canardPts, 0.018, 0.012, 0.09, 3), hull); c.scale.x = s;
  // Leuchtstreifen an der Flügelvorderkante
  const a = new THREE.Vector2(0.17 * s, 0.11), b = new THREE.Vector2(0.75 * s, -0.33);
  const len = a.distanceTo(b);
  const strip = add(new THREE.BoxGeometry(len, 0.014, 0.012), neon, false);
  strip.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0.095);
  strip.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
  // Kanonen an den Flügelspitzen
  const pod = add(new THREE.CylinderGeometry(0.04, 0.046, 0.46, 24), gun);
  pod.position.set(0.79 * s, -0.31, 0.08);
  const housing = add(extrude([[0.74, -0.18], [0.84, -0.18], [0.85, -0.5], [0.73, -0.5]], 0.03, 0.02, 0.06, 4), dark);
  housing.scale.x = s;
  const barrel = add(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 16), dark);
  barrel.position.set(0.79 * s, 0.03, 0.08);
  const muzzle = add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 14), darker);
  muzzle.position.set(0.79 * s, 0.16, 0.08);
  // Positionslichter
  const nav = add(new THREE.SphereGeometry(0.018, 14, 10), s < 0 ? navRed : navGreen, false);
  nav.position.set(0.8 * s, -0.53, 0.08);
  // Lufteinlässe neben dem Cockpit
  const intake = add(new THREE.BoxGeometry(0.045, 0.16, 0.05), darker);
  intake.position.set(0.125 * s, 0.17, 0.15);
  // Seitenleitwerke
  const fin = add(new THREE.BoxGeometry(0.014, 0.26, 0.18), hull);
  fin.position.set(0.13 * s, -0.6, 0.22);
  fin.rotation.y = -0.18 * s;
  // Triebwerke
  const eng = add(new THREE.CylinderGeometry(0.075, 0.07, 0.34, 28), dark);
  eng.position.set(0.1 * s, -0.7, 0.1);
  const nozzle = add(new THREE.CylinderGeometry(0.085, 0.064, 0.09, 28, 1, true), gun);
  nozzle.position.set(0.1 * s, -0.9, 0.1);
  nozzle.material.side = THREE.DoubleSide;
  const core = add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 24), engineGlow, false);
  core.position.set(0.1 * s, -0.93, 0.1);
  const ring = add(new THREE.TorusGeometry(0.075, 0.008, 8, 32), neon, false);
  ring.position.set(0.1 * s, -0.62, 0.1);
  ring.rotation.x = Math.PI / 2;
}
// Cockpit-Haube
const canopy = add(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass);
// Halbkugel zeigt nach +Y; gedreht wölbt sie sich zur Kamera (Höhe 0,08, Länge 0,2)
canopy.rotation.x = Math.PI / 2;
canopy.scale.set(0.072, 0.08, 0.2);
canopy.position.set(0, 0.4, 0.2);
// Rahmen der Haube
const frame = add(new THREE.TorusGeometry(1, 0.06, 8, 48), dark);
frame.scale.set(0.072, 0.2, 0.072);
frame.position.set(0, 0.4, 0.2);
// Sensorspitze
const tip = add(new THREE.ConeGeometry(0.018, 0.12, 16), gun);
tip.position.set(0, 1.03, 0.08);
// Rückenleuchte
const spine = add(new THREE.BoxGeometry(0.012, 0.5, 0.01), neon, false);
spine.position.set(0, -0.25, 0.265);

// leicht nach hinten gekippt: Triebwerksdüsen werden sichtbar, bleibt eine Draufsicht
ship.rotation.x = -0.12;

// ---------- Rendern: Bild + Leuchtebene ----------
function render() {
  renderer.render(scene, cam);
  const beauty = document.createElement('canvas');
  beauty.width = beauty.height = S;
  beauty.getContext('2d').drawImage(renderer.domElement, 0, 0);
  // Leuchtebene: alles schwarz außer leuchtenden Teilen
  const saved = new Map();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  ship.traverse((o) => {
    if (!o.isMesh) return;
    saved.set(o, o.material);
    o.material = emissiveMats.has(o.material) ? new THREE.MeshBasicMaterial({ color: o.material.emissive }) : black;
  });
  const env = scene.environment;
  scene.environment = null;
  renderer.render(scene, cam);
  const glow = document.createElement('canvas');
  glow.width = glow.height = S;
  glow.getContext('2d').drawImage(renderer.domElement, 0, 0);
  ship.traverse((o) => { if (saved.has(o)) o.material = saved.get(o); });
  scene.environment = env;
  // Zusammensetzen: weiches Leuchten unter und über dem Bild
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const g = out.getContext('2d');
  g.filter = 'blur(28px)';
  g.globalAlpha = 0.9;
  g.drawImage(glow, 0, 0);
  g.filter = 'none';
  g.globalAlpha = 1;
  g.drawImage(beauty, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.filter = 'blur(7px)';
  g.globalAlpha = 0.8;
  g.drawImage(glow, 0, 0);
  g.filter = 'none';
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return out;
}

function scaled(src, size, type) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // schrittweise verkleinern für saubere Kanten
  let cur = src;
  while (cur.width / 2 >= size) {
    const h = document.createElement('canvas');
    h.width = h.height = cur.width / 2;
    const hg = h.getContext('2d');
    hg.imageSmoothingQuality = 'high';
    hg.drawImage(cur, 0, 0, h.width, h.height);
    cur = h;
  }
  g.drawImage(cur, 0, 0, size, size);
  return c.toDataURL(type, 0.95);
}

const img = render();
const dark2 = document.createElement('canvas');
dark2.width = dark2.height = S;
const dg = dark2.getContext('2d');
dg.fillStyle = '#050b14';
dg.fillRect(0, 0, S, S);
dg.drawImage(img, 0, 0);
window.__result = {
  preview: scaled(dark2, 1024, 'image/png'),
  sprite: scaled(img, 1024, 'image/webp'),
};
window.__done = true;
