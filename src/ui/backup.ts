// Sicherungen des ganzen Fortschritts: Spielstand, Minispiel-Rekorde, Modteile, Ausrüstung und Einstellungen
// (alle Einträge „x4-sektorbau…“ im Speicher des Browsers). Automatisch beim Spielen in IndexedDB abgelegt (mehr Platz
// als localStorage, übersteht einen kaputten oder versehentlich gelöschten Spielstand), dazu als Datei/Text zum Mitnehmen.

export const PREFIX = 'x4-sektorbau';
const FORMAT = 'x4-sektorbau-sicherung';

export interface BackupData {
  format: typeof FORMAT;
  version: 1;
  /** Zeitpunkt (ms seit 1970) */
  created: number;
  /** kurze Beschreibung für die Liste, z. B. „Tag 12 · 1,2 Mio Cr · Kapitel 5“ */
  label: string;
  /** alle gesicherten Einträge (Schlüssel → Text) */
  keys: Record<string, string>;
}

export interface BackupMeta { id: number; created: number; label: string; size: number }

type KV = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** Alle Einträge des Spiels einsammeln */
export function collect(storage: KV, label: string, now = Date.now()): BackupData {
  const keys: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    const v = storage.getItem(k);
    if (v != null) keys[k] = v;
  }
  return { format: FORMAT, version: 1, created: now, label, keys };
}

/** Text einer Sicherung lesen; null, wenn es keine ist (z. B. ein alter Spielstand allein) */
export function parseBackup(text: string): BackupData | null {
  try {
    const b = JSON.parse(text) as Partial<BackupData>;
    if (b?.format !== FORMAT || typeof b.keys !== 'object' || !b.keys) return null;
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.keys)) if (k.startsWith(PREFIX) && typeof v === 'string') keys[k] = v;
    return { format: FORMAT, version: 1, created: Number(b.created) || Date.now(), label: String(b.label ?? ''), keys };
  } catch {
    return null;
  }
}

/** Sicherung zurückschreiben: ersetzt alle Einträge des Spiels (danach Seite neu laden) */
export function applyBackup(storage: KV, b: BackupData): void {
  const old: string[] = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(PREFIX)) old.push(k); }
  for (const k of old) storage.removeItem(k);
  for (const [k, v] of Object.entries(b.keys)) storage.setItem(k, v);
}

/** Welche Sicherungen wegfallen: die zehn neuesten bleiben, dazu je Tag die letzte der vergangenen zwei Wochen */
export function pruneIds(list: { id: number; created: number }[], now = Date.now(), keepRecent = 10, days = 14): number[] {
  const sorted = [...list].sort((a, b) => b.created - a.created);
  const keep = new Set(sorted.slice(0, keepRecent).map((b) => b.id));
  const seenDay = new Set<string>();
  for (const b of sorted) {
    if (now - b.created > days * 86400e3) continue;
    const d = new Date(b.created);
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (seenDay.has(day)) continue;
    seenDay.add(day);
    keep.add(b.id);
  }
  return sorted.filter((b) => !keep.has(b.id)).map((b) => b.id);
}

// ---------- Ablage in IndexedDB ----------

const DB = 'x4-sektorbau-sicherungen', STORE = 'stand';
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') { ok(null); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  const d = await db();
  return d ? d.transaction(STORE, mode).objectStore(STORE) : null;
}

/** Sind automatische Sicherungen auf diesem Gerät möglich? */
export async function backupsAvailable(): Promise<boolean> {
  return (await db()) != null;
}

export async function listBackups(): Promise<BackupMeta[]> {
  try {
    const s = await store('readonly');
    if (!s) return [];
    const all = await req(s.getAll() as IDBRequest<(BackupData & { id: number })[]>);
    return all.map((b) => ({ id: b.id, created: b.created, label: b.label, size: Object.values(b.keys).reduce((a, v) => a + v.length, 0) })).sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}

export async function getBackup(id: number): Promise<BackupData | null> {
  try {
    const s = await store('readonly');
    return s ? ((await req(s.get(id))) as BackupData | undefined) ?? null : null;
  } catch {
    return null;
  }
}

/** Sicherung ablegen und alte aufräumen */
export async function saveBackup(b: BackupData): Promise<boolean> {
  try {
    const s = await store('readwrite');
    if (!s) return false;
    await req(s.add(b));
    const drop = pruneIds(await listBackups());
    if (drop.length) { const w = await store('readwrite'); for (const id of drop) w?.delete(id); }
    return true;
  } catch {
    return false;
  }
}

let lastAuto = 0;

/**
 * Automatische Sicherung, höchstens alle gapMs (die letzte abgelegte zählt, auch über Neustarts hinweg).
 * Läuft im Hintergrund; ohne Spielstand oder ohne IndexedDB passiert nichts.
 */
export async function autoBackup(storage: KV, label: string, gapMs: number, now = Date.now()): Promise<boolean> {
  if (now - lastAuto < gapMs) return false;
  const snap = collect(storage, label, now);
  if (!Object.keys(snap.keys).some((k) => k.includes('save'))) return false;
  lastAuto = now;
  const latest = (await listBackups())[0];
  if (latest && now - latest.created < gapMs) { lastAuto = latest.created; return false; }
  const ok = await saveBackup(snap);
  // einmalig um dauerhaften Speicher bitten (der Browser räumt ihn dann nicht von selbst auf)
  if (ok) void navigator.storage?.persisted?.().then((p) => (p ? true : navigator.storage.persist?.())).catch(() => {});
  return ok;
}
