// Vertreter, bei denen es Baupläne gibt – nur vor Ort, je Volk und Station.
// Split-Handelsvertreter sitzen an den Handelsposten, Werftvertreter mit waffennahen Bauplänen an den Werften,
// Gesandte fremder Völker (Argon, Teladi, Paranid, Terraner, Boronen) an einzelnen Handelsposten.
import { MODULES } from './modules';
import { NPC_MAP, SECTORS, SECTOR_MAP } from './sectors';
import type { FactionId, ModuleDef } from '../engine/types';

export type Race = 'split' | 'argon' | 'teladi' | 'paranid' | 'terran' | 'boron';

export const RACE_LABEL: Record<Race, string> = {
  split: 'Split', argon: 'Argonen', teladi: 'Teladi', paranid: 'Paraniden', terran: 'Terraner', boron: 'Boronen',
};

export interface Vendor {
  id: string;
  /** Name und Rolle des Vertreters */
  name: string;
  role: string;
  race: Race;
  /** Ort: Handelsposten eines Sektors oder NPC-Station */
  sector: string;
  npc?: string;
  /** Ruf dieser Fraktion entscheidet über den Kauf */
  faction: FactionId;
  sells: string[];
}

/** Waffennahe Baupläne und Schiffsfertigung gibt es nur bei Werftvertretern */
export const WEAPON_WARES = new Set(['weaponscomponents', 'turretcomponents', 'missilecomponents', 'dronecomponents', 'shieldcomponents', 'fieldcoils']);

const METHOD_RACE: Record<string, Race> = { Split: 'split', Universal: 'split', Argon: 'argon', Teladi: 'teladi', Paranid: 'paranid', Terran: 'terran', Boron: 'boron' };

export function raceOf(d: ModuleDef): Race {
  return METHOD_RACE[d.method] ?? 'split';
}

export function isWeaponBlueprint(d: ModuleDef): boolean {
  return d.kind === 'shipyard' || (!!d.ware && WEAPON_WARES.has(d.ware));
}

const PURCHASABLE = MODULES.filter((d) => !d.starter);

/** Gesandte fremder Völker: Handelsposten, an dem sie sitzen */
const ENVOYS: { race: Race; sector: string; name: string }[] = [
  { race: 'argon', sector: 'zhin', name: 'Botschafterin Lena Corran' },
  { race: 'boron', sector: 'tkr', name: 'Gesandte Ol Tannos' },
  { race: 'teladi', sector: 'cascade', name: 'Handelsagentin Nisstrala' },
  { race: 'terran', sector: 'ravine', name: 'Attaché Jonas Whitfield' },
  { race: 'paranid', sector: 'hoa', name: 'Priesterherzog Xa’Dil' },
];

const SPLIT_NAMES = ['Tar Zhin', 'Rha Tkr', 'Dal Kaskade', 'Kro Schlucht', 'Zyr Rhy', 'Vex Acrimony', 'Thar Zyarth'];
const WHARF_NAMES = ['Werftmeisterin Sae Zhin', 'Werftmeister Tuk', 'Werftmeister Gra Rhy', 'Werftmeisterin Zor'];

function buildVendors(): Vendor[] {
  const list: Vendor[] = [];
  const splitCatalog = PURCHASABLE.filter((d) => raceOf(d) === 'split' && !isWeaponBlueprint(d)).map((d) => d.id);
  const weaponCatalog = PURCHASABLE.filter((d) => raceOf(d) === 'split' && isWeaponBlueprint(d)).map((d) => d.id);
  SECTORS.forEach((s, i) => {
    list.push({ id: 'v-' + s.id, name: SPLIT_NAMES[i % SPLIT_NAMES.length], role: 'Handelsvertreter', race: 'split', sector: s.id, faction: s.faction, sells: splitCatalog });
  });
  let w = 0;
  for (const s of SECTORS) for (const n of s.npcStations.filter((x) => x.kind === 'wharf')) {
    list.push({ id: 'v-' + n.id, name: WHARF_NAMES[w++ % WHARF_NAMES.length], role: 'Werftvertreter', race: 'split', sector: s.id, npc: n.id, faction: s.faction, sells: weaponCatalog });
  }
  for (const e of ENVOYS) {
    if (!SECTOR_MAP[e.sector]) continue;
    const sells = PURCHASABLE.filter((d) => raceOf(d) === e.race).map((d) => d.id);
    if (sells.length) list.push({ id: 'v-' + e.race, name: e.name, role: `Gesandtschaft der ${RACE_LABEL[e.race]}`, race: e.race, sector: e.sector, faction: SECTOR_MAP[e.sector].faction, sells });
  }
  return list;
}

export const VENDORS: Vendor[] = buildVendors();
export const VENDOR_MAP: Record<string, Vendor> = Object.fromEntries(VENDORS.map((v) => [v.id, v]));

/** Name des Ortes, an dem der Vertreter sitzt */
export function vendorPlace(v: Vendor): string {
  return v.npc ? NPC_MAP[v.npc].name : SECTOR_MAP[v.sector].tradeStation.name;
}

export function vendorsAt(sector: string, npc?: string): Vendor[] {
  return VENDORS.filter((v) => v.sector === sector && (v.npc ?? '') === (npc ?? ''));
}

export function vendorsFor(defId: string): Vendor[] {
  return VENDORS.filter((v) => v.sells.includes(defId));
}
