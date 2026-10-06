// Militärschiffe einer Rasse aus den X4-Spieldaten (Version 9.0) auslesen: Hülle, Triebwerke, Schilde, Waffenplätze,
// eigene Raketenwerfer-Plätze, Türme, Raketenlager, Tempo (Kampftriebwerk Mk1), Drehwiderstand.
// Quelle: github.com/Mistralys/x4-core (data/*.json, Spielversion 9.0)
// Aufruf: git clone --depth 1 https://github.com/Mistralys/x4-core /tmp/x4core && node scripts/extract-military.mjs spl
import fs from 'node:fs';

const dir = (process.env.X4CORE ?? '/tmp/x4core') + '/data';
const race = process.argv[2] ?? 'spl';
const read = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
const ships = read('ships.json'), engines = read('engines.json'), shields = read('shields.json');
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const eng = (size) => engines.find((e) => e.wareID === `engine_${race}_${size}_combat_01_mk1`) ?? engines.find((e) => e.wareID === `engine_${race}_${size}_allround_01_mk1`);
const shd = (size) => shields.find((s) => s.wareID === `shield_${race}_${size}_standard_01_mk1`);
const MIL = ['scout', 'fighter', 'heavyfighter', 'interceptor', 'bomber', 'corvette', 'frigate', 'gunboat', 'destroyer', 'carrier', 'battleship'];
for (const s of ships) {
  if (!s.wareID.startsWith(`ship_${race}_`) || !MIL.includes(s.classID)) continue;
  const e = s.equipment;
  const w = arr(e.weapons);
  const guns = w.filter((x) => !x.tags.includes('missile')).reduce((n, x) => n + x.count, 0);
  const launchers = w.filter((x) => x.tags.includes('missile')).map((x) => `${x.count}×${x.size}`).join(' ') || '–';
  const en = arr(e.engines)[0];
  const sh = arr(e.shields);
  const cap = sh.reduce((n, x) => n + x.count * (shd(x.size)?.rechargeMax ?? 0), 0);
  const v = en ? Math.round(((eng(en.size)?.thrustForward ?? 0) * en.count) / s.dragForward) : null;
  console.log(JSON.stringify({
    id: s.wareID, name: s.label, cls: s.size.toUpperCase(), type: s.classID, hull: s.hull,
    engines: en ? `${en.count}×${en.size}` : '–', shields: sh.map((x) => `${x.count}×${x.size}`).join(' '), shieldCap: cap,
    guns: `${guns}×${w.find((x) => !x.tags.includes('missile'))?.size ?? '-'}`, launchers,
    turrets: arr(e.turrets).map((x) => `${x.count}×${x.size}`).join(' ') || '–', missiles: s.storageMissile,
    v, dragYaw: s.dragYaw, inertiaYaw: s.inertiaYaw, docks: e.docks ?? null, people: s.people,
  }));
}
