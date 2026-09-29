import { SECTORS, gatesOf } from '../src/data/sectors';
for (const s of SECTORS) {
  const pts: { n: string; x: number; z: number; r: number }[] = [
    ...s.fields.map((f) => ({ n: f.ware, x: f.x, z: f.z, r: f.r })),
    ...gatesOf(s.id).map((g) => ({ n: 'gate>' + g.to, x: Math.round(g.x), z: Math.round(g.z), r: 12 })),
    { n: 'trade', x: s.tradeStation.x, z: s.tradeStation.z, r: 14 },
  ];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < a.r + b.r + 18) console.log(s.id, a.n, `(${a.x},${a.z})`, b.n, `(${b.x},${b.z})`, 'd=' + Math.round(d));
  }
}
for (const s of SECTORS) for (const n of s.npcStations) {
  const others = [...s.fields.map((f) => ({ n: f.ware, x: f.x, z: f.z, r: f.r })), ...gatesOf(s.id).map((g) => ({ n: 'gate', x: g.x, z: g.z, r: 12 })), { n: 'trade', x: s.tradeStation.x, z: s.tradeStation.z, r: 14 }, ...s.npcStations.filter((m) => m !== n).map((m) => ({ n: m.id, x: m.x, z: m.z, r: 12 }))];
  for (const o of others) { const d = Math.hypot(o.x - n.x, o.z - n.z); if (d < o.r + 12 + 18) console.log('NPC', n.id, 'nah an', o.n, Math.round(d)); }
}
