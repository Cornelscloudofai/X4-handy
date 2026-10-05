// Vorab-Rendering „kleines Kampfschiff“ im Split-Stil (siehe docs/design/split-stil.md):
// facettierter Keilrumpf, nach vorn ragende Klauen mit Kanonen, Stachelflügel, schuppenartige
// abstehende Panzerplatten, gezackter Rückengrat, Sehschlitz statt Glaskuppel, orange Glut.
// Draufsicht, Nase oben. Aufruf über scripts/render-sprites.mjs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S = 2048;
const T = 2048;
const px = (x) => ((x + 1.15) / 2.3) * T;
const py = (y) => (1 - (y + 1.15) / 2.3) * T;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Texturen: gehämmertes Metall, abgeplatzte Farbe, Schweißnähte, Clan-Zeichen ----------
function metalTexture(base, seed, markings) {
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, T, T);
  // Hammerschläge: viele weiche Flecken heller/dunkler
  for (let i = 0; i < 2600; i++) {
    const x = r() * T, y = r() * T, rad = 6 + r() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const l = r() < 0.5;
    gr.addColorStop(0, l ? 'rgba(255,200,160,0.07)' : 'rgba(0,0,0,0.09)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Schweißnähte und Bolzenreihen (schräg, kantig)
  g.strokeStyle = 'rgba(30,18,12,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 46; i++) {
    const x = r() * T, y = r() * T, a = Math.floor(r() * 4) * (Math.PI / 4), l = 80 + r() * 260;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    g.fillStyle = 'rgba(25,15,10,0.6)';
    for (let k = 0; k < l; k += 18) g.fillRect(x + Math.cos(a) * k + 5, y + Math.sin(a) * k + 5, 4, 4);
  }
  // Abgeplatzte Farbe: Kupfer und blankes Metall darunter
  for (let i = 0; i < 700; i++) {
    const x = r() * T, y = r() * T;
    g.fillStyle = r() < 0.6 ? 'rgba(217,138,74,0.55)' : 'rgba(150,140,130,0.45)';
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) g.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 14);
    g.closePath();
    g.fill();
  }
  // Kratzer
  g.strokeStyle = 'rgba(240,200,170,0.14)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 260; i++) { const x = r() * T, y = r() * T, a = r() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40); g.stroke(); }
  if (markings) {
    // Kantige Clan-Zeichen in Goldgelb auf den Flügeln, Zählmarken am Rumpf
    for (const s of [1, -1]) {
      g.fillStyle = 'rgba(255,194,74,0.9)';
      const cx = px(s * 0.42), cy = py(-0.36);
      g.beginPath();
      g.moveTo(cx, cy - 34); g.lineTo(cx + 26 * s, cy); g.lineTo(cx, cy + 34); g.lineTo(cx + 9 * s, cy); g.closePath(); g.fill();
      g.fillRect(cx - 22 * s - (s < 0 ? 0 : 8), cy - 4, 8, 8);
      for (let k = 0; k < 4; k++) g.fillRect(px(s * 0.1) + (s > 0 ? k * 9 : -k * 9 - 5), py(-0.28), 5, 22);
    }
  }
  // Ruß hinter Waffen und Triebwerk
  for (const [x, y, rad] of [[0.18, 0.9, 120], [-0.18, 0.9, 120], [0, -0.78, 260]]) {
    const gr = g.createRadialGradient(px(x), py(y), 0, px(x), py(y), rad);
    gr.addColorStop(0, 'rgba(12,8,6,0.65)');
    gr.addColorStop(1, 'rgba(12,8,6,0)');
    g.fillStyle = gr;
    g.fillRect(px(x) - rad, py(y) - rad, rad * 2, rad * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

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

/**
 * Facettierter Körper aus Querschnitten entlang der Längsachse.
 * Abschnitt: { y, x (Mitte), w (halbe Breite), h (Höhe oben), d (Tiefe unten) } – Profil: kantiges Sechseck.
 */
function loft(sections) {
  const prof = (s) => [
    [s.x - s.w, 0], [s.x - s.w * 0.55, s.h * 0.75], [s.x, s.h], [s.x + s.w * 0.55, s.h * 0.75], [s.x + s.w, 0], [s.x + s.w * 0.4, -s.d], [s.x - s.w * 0.4, -s.d],
  ].map(([x, z]) => new THREE.Vector3(x, s.y, z));
  const rings = sections.map(prof);
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % n];
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  // Deckel vorn und hinten
  for (const [ring, flip] of [[rings[0], false], [rings[rings.length - 1], true]]) {
    const cen = ring.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
    for (let k = 0; k < n; k++) flip ? tri(cen, ring[k], ring[(k + 1) % n]) : tri(cen, ring[(k + 1) % n], ring[k]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return planarUV(geo);
}

/** Kantige Platte aus einem Umriss, mit schmaler Fase (facettiert) */
function plate(pts, depth, z = 0, bevel = 0.012) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  geo.translate(0, 0, z);
  geo.computeVertexNormals();
  return planarUV(geo);
}

/** Stachel: vierkantige Pyramide von a nach b */
function spike(a, b, r) {
  const geo = new THREE.ConeGeometry(r, 1, 4);
  const dir = new THREE.Vector3().subVectors(b, a);
  geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo);
  m.scale.set(1, dir.length(), 1);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

// ---------- Szene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(S, S);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
const cam = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 20);
cam.position.set(0, 0, 10);
cam.lookAt(0, 0, 0);

// Hartes Licht von links oben: Plattenkanten werfen kleine Schatten
const key = new THREE.DirectionalLight(0xfff0e0, 2.1);
key.position.set(-2.4, 2.8, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = key.shadow.camera.bottom = -1.4;
key.shadow.camera.right = key.shadow.camera.top = 1.4;
key.shadow.bias = -0.0003;
key.shadow.radius = 2;
scene.add(key);
const fill = new THREE.DirectionalLight(0x9fb8d8, 0.45);
fill.position.set(2.5, -1.2, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xff8a3a, 0.7);
rim.position.set(0.5, -3, 0.8);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffe0c8, 0x1a1210, 0.3));

const redTex = metalTexture('#6a2814', 3, true);
const orangeTex = metalTexture('#a4481c', 11, false);
const hull = new THREE.MeshStandardMaterial({ map: redTex, metalness: 0.45, roughness: 0.62, flatShading: true });
const armor = new THREE.MeshStandardMaterial({ map: orangeTex, metalness: 0.5, roughness: 0.55, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: 0x23201f, metalness: 0.7, roughness: 0.45, flatShading: true });
// Stacheln: dunkles Metall mit kupfernem Glanz, damit sie sich vom Weltraum abheben
const spikeMat = new THREE.MeshStandardMaterial({ color: 0x5a3a28, metalness: 0.85, roughness: 0.32, flatShading: true });
const gunMetal = new THREE.MeshStandardMaterial({ color: 0x302a26, metalness: 0.9, roughness: 0.3, flatShading: true });
const glow = new THREE.MeshStandardMaterial({ color: 0x2a1006, emissive: 0xff8a3a, emissiveIntensity: 1.3 });
const engineGlow = new THREE.MeshStandardMaterial({ color: 0x2a1006, emissive: 0xff7a2a, emissiveIntensity: 1.8 });
const slit = new THREE.MeshStandardMaterial({ color: 0x120806, emissive: 0xff6a2a, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.15 });
const emissiveMats = new Set([glow, engineGlow, slit]);

const ship = new THREE.Group();
scene.add(ship);
const add = (obj, mat, cast = true) => {
  const m = obj.isMesh ? obj : new THREE.Mesh(obj, mat);
  m.material = mat;
  m.castShadow = cast;
  m.receiveShadow = true;
  ship.add(m);
  return m;
};

// Rumpf: facettierter Keil
add(loft([
  { y: 0.98, x: 0, w: 0.012, h: 0.02, d: 0.01 },
  { y: 0.78, x: 0, w: 0.06, h: 0.07, d: 0.03 },
  { y: 0.5, x: 0, w: 0.115, h: 0.12, d: 0.05 },
  { y: 0.2, x: 0, w: 0.16, h: 0.16, d: 0.06 },
  { y: -0.15, x: 0, w: 0.19, h: 0.17, d: 0.07 },
  { y: -0.5, x: 0, w: 0.2, h: 0.15, d: 0.07 },
  { y: -0.72, x: 0, w: 0.16, h: 0.11, d: 0.06 },
]), hull);

for (const s of [1, -1]) {
  // Klauen: zwei nach vorn ragende Zacken neben der Nase, leicht nach innen gebogen
  const claw = add(loft([
    { y: 0.0, x: 0.25, w: 0.06, h: 0.07, d: 0.03 },
    { y: 0.35, x: 0.24, w: 0.05, h: 0.065, d: 0.03 },
    { y: 0.65, x: 0.21, w: 0.035, h: 0.05, d: 0.025 },
    { y: 0.86, x: 0.18, w: 0.018, h: 0.03, d: 0.015 },
  ]), armor);
  claw.scale.x = s;
  // Kanone in der Klauenspitze
  const barrel = add(new THREE.CylinderGeometry(0.014, 0.017, 0.24, 6), gunMetal);
  barrel.position.set(0.185 * s, 0.9, 0.03);
  const muzzle = add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), dark);
  muzzle.position.set(0.18 * s, 1.02, 0.03);
  // Leuchtnaht an der Klaueninnenseite
  const cl = add(new THREE.BoxGeometry(0.01, 0.42, 0.01), glow, false);
  cl.position.set(0.205 * s, 0.42, 0.06);
  cl.rotation.z = 0.08 * s;

  // Stachelflügel: kurz, nach hinten gepfeilt, mit Dornen an der Hinterkante
  const wing = add(plate([[0.15, 0.06], [0.4, -0.12], [0.62, -0.42], [0.72, -0.66], [0.56, -0.52], [0.5, -0.6], [0.42, -0.5], [0.34, -0.56], [0.27, -0.48], [0.16, -0.5]], 0.03, 0.02, 0.014), hull);
  wing.scale.x = s;
  // Abstehende Panzerplatten auf dem Flügel (leicht gekippt → Kanten werfen Schatten)
  const wp1 = add(plate([[0.2, -0.02], [0.4, -0.16], [0.46, -0.28], [0.22, -0.2]], 0.018, 0.06, 0.008), armor);
  wp1.scale.x = s; wp1.rotation.y = 0.12 * s;
  const wp2 = add(plate([[0.42, -0.26], [0.56, -0.44], [0.6, -0.56], [0.46, -0.44]], 0.016, 0.055, 0.008), armor);
  wp2.scale.x = s; wp2.rotation.y = 0.15 * s;
  // Schulterpanzer am Rumpf
  const sh = add(plate([[0.1, 0.24], [0.21, 0.12], [0.23, -0.12], [0.12, -0.04]], 0.03, 0.13, 0.01), armor);
  sh.scale.x = s; sh.rotation.y = 0.2 * s;
  // Flügelstacheln
  add(spike(new THREE.Vector3(0.66 * s, -0.56, 0.04), new THREE.Vector3(0.8 * s, -0.86, 0.04), 0.038), spikeMat);
  add(spike(new THREE.Vector3(0.5 * s, -0.54, 0.04), new THREE.Vector3(0.55 * s, -0.76, 0.04), 0.03), spikeMat);
  add(spike(new THREE.Vector3(0.33 * s, -0.5, 0.04), new THREE.Vector3(0.35 * s, -0.7, 0.04), 0.028), spikeMat);
  add(spike(new THREE.Vector3(0.18 * s, -0.66, 0.08), new THREE.Vector3(0.27 * s, -0.96, 0.05), 0.034), spikeMat);
  // Leuchtfuge zwischen Schulterpanzer und Flügel
  const gl = add(new THREE.BoxGeometry(0.3, 0.008, 0.01), glow, false);
  gl.position.set(0.3 * s, -0.08, 0.075);
  gl.rotation.z = -0.62 * s;
}

// Schuppenpanzer auf dem Rücken: Winkelplatten, die nach vorn zeigen und sich überlappen
for (let i = 0; i < 6; i++) {
  const y = 0.5 - i * 0.18;
  const w = 0.1 + i * 0.012;
  const p = add(plate([[0, y + 0.08], [w, y - 0.04], [w * 0.8, y - 0.1], [0, y - 0.02], [-w * 0.8, y - 0.1], [-w, y - 0.04]], 0.02, 0.15 + 0.005 * Math.sin(i), 0.008), i % 2 ? armor : hull);
  p.rotation.x = -0.06;
  // Leuchtfuge unter jeder Platte
  if (i > 0 && i < 5) {
    for (const s of [1, -1]) {
      const g = add(new THREE.BoxGeometry(w * 1.05, 0.006, 0.006), glow, false);
      g.position.set((w / 2) * s, y - 0.065, 0.16);
      g.rotation.z = 0.48 * s;
    }
  }
}
// Gezackter Rückengrat
for (let i = 0; i < 7; i++) {
  const y = 0.32 - i * 0.14;
  add(spike(new THREE.Vector3(0, y, 0.19), new THREE.Vector3(0, y - 0.12, 0.3), 0.024), spikeMat);
}
// Sehschlitz statt Glaskuppel
const slitM = add(new THREE.BoxGeometry(0.075, 0.11, 0.02), slit);
slitM.position.set(0, 0.6, 0.12);
const brow = add(plate([[-0.07, 0.68], [0.07, 0.68], [0.05, 0.64], [-0.05, 0.64]], 0.02, 0.12, 0.006), armor);
brow.rotation.x = 0.2;
// Triebwerksblock mit zwei sechseckigen Düsen
add(loft([
  { y: -0.62, x: 0, w: 0.17, h: 0.13, d: 0.07 },
  { y: -0.86, x: 0, w: 0.2, h: 0.12, d: 0.07 },
  { y: -0.92, x: 0, w: 0.19, h: 0.1, d: 0.06 },
]), dark);
for (const s of [1, -1]) {
  const noz = add(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 6, 1, true), gunMetal);
  noz.position.set(0.09 * s, -0.95, 0.05);
  noz.material = gunMetal.clone();
  noz.material.side = THREE.DoubleSide;
  const core = add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 6), engineGlow, false);
  core.position.set(0.09 * s, -0.985, 0.05);
  // Kühlrippen
  for (let k = 0; k < 3; k++) {
    const fin = add(new THREE.BoxGeometry(0.01, 0.08, 0.05), dark);
    fin.position.set((0.19 + k * 0.025) * s, -0.76 - k * 0.03, 0.08);
  }
}
const engLight = add(new THREE.BoxGeometry(0.22, 0.01, 0.01), glow, false);
engLight.position.set(0, -0.85, 0.135);

// leicht nach hinten gekippt: Düsen und Plattenkanten werden sichtbar
ship.rotation.x = -0.14;

// ---------- Rendern (wie fighter.js): Bild + Leuchtebene ----------
function render() {
  renderer.render(scene, cam);
  const beauty = document.createElement('canvas');
  beauty.width = beauty.height = S;
  beauty.getContext('2d').drawImage(renderer.domElement, 0, 0);
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
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = S;
  glowC.getContext('2d').drawImage(renderer.domElement, 0, 0);
  ship.traverse((o) => { if (saved.has(o)) o.material = saved.get(o); });
  scene.environment = env;
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const g = out.getContext('2d');
  g.filter = 'blur(26px)';
  g.globalAlpha = 0.85;
  g.drawImage(glowC, 0, 0);
  g.filter = 'none';
  g.globalAlpha = 1;
  g.drawImage(beauty, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.filter = 'blur(6px)';
  g.globalAlpha = 0.75;
  g.drawImage(glowC, 0, 0);
  g.filter = 'none';
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return out;
}

function scaled(src, size, type) {
  let cur = src;
  while (cur.width / 2 >= size) {
    const h = document.createElement('canvas');
    h.width = h.height = cur.width / 2;
    const hg = h.getContext('2d');
    hg.imageSmoothingQuality = 'high';
    hg.drawImage(cur, 0, 0, h.width, h.height);
    cur = h;
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, size, size);
  return c.toDataURL(type, 0.95);
}

const img = render();
const bg = document.createElement('canvas');
bg.width = bg.height = S;
const bgc = bg.getContext('2d');
bgc.fillStyle = '#050b14';
bgc.fillRect(0, 0, S, S);
bgc.drawImage(img, 0, 0);
window.__result = { preview: scaled(bg, 1024, 'image/png'), sprite: scaled(img, 1024, 'image/webp') };
window.__done = true;
