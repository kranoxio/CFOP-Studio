import { storage } from '../util/storage';
import { progress } from '../progress';
import { setCustomAlgs } from '../algs/registry';
import { apiPost, serverAvailable } from './api';

/** Diese Daten werden zwischen Geräten abgeglichen */
const SYNC_KEYS = ['progress', 'customAlgs', 'solves', 'solves2', 'crossStats', 'lookaheadStats', 'recogSets', 'drillSets'];
const CODE_KEY = 'cfop-studio:syncCode';

interface Entry {
  t: number;
  value: unknown;
}

export type SyncStatus = { state: 'off' | 'idle' | 'syncing' | 'error' | 'unavailable'; last?: number; message?: string };

let status: SyncStatus = { state: 'off' };
const listeners = new Set<(s: SyncStatus) => void>();
const setStatus = (s: SyncStatus) => {
  status = s;
  listeners.forEach((l) => l(s));
};

export const syncStatus = () => status;
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function syncCode(): string | null {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

export function setSyncCode(code: string | null) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignorieren */
  }
  setStatus({ state: code ? 'idle' : 'off' });
  if (code) void syncNow();
}

/** Neuer, gut abtippbarer Code (keine verwechselbaren Zeichen) */
export function newSyncCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(rnd, (b) => chars[b % chars.length]).join('');
}

let running: Promise<void> | null = null;

/** Lokale Daten hochladen, mit dem Server zusammenführen und Neueres übernehmen. */
export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  const code = syncCode();
  if (!code) return setStatus({ state: 'off' });
  if (!(await serverAvailable())) return setStatus({ state: 'unavailable', message: 'NAS-Server nicht erreichbar' });
  setStatus({ state: 'syncing', last: status.last });
  try {
    const keys: Record<string, Entry> = {};
    for (const k of SYNC_KEYS) {
      const t = storage.time(k);
      if (t) keys[k] = { t, value: storage.get(k, null) };
    }
    const merged = await apiPost<{ keys: Record<string, Entry> }>(`/sync/${code}`, { keys });
    const changed: string[] = [];
    for (const [k, e] of Object.entries(merged.keys ?? {})) {
      if (!SYNC_KEYS.includes(k)) continue;
      const local = storage.get(k, null);
      if (JSON.stringify(local) !== JSON.stringify(e.value)) {
        storage.setSynced(k, e.value, e.t);
        changed.push(k);
      }
    }
    // Module mit Daten im Speicher neu laden
    if (changed.includes('progress')) progress.load(storage.get('progress', {}));
    if (changed.includes('customAlgs')) setCustomAlgs(storage.get('customAlgs', {}));
    if (changed.length) document.dispatchEvent(new CustomEvent('synced', { detail: changed }));
    setStatus({ state: 'idle', last: Date.now() });
  } catch (err) {
    setStatus({ state: 'error', message: (err as Error).message, last: status.last });
  }
}

/** Automatischer Abgleich: beim Start, kurz nach Änderungen, jede Minute und beim Zurückkehren. */
export function startAutoSync() {
  if (!syncCode()) return;
  void syncNow();
  let timer = 0;
  window.addEventListener('storage-change', (e) => {
    if (!SYNC_KEYS.includes((e as CustomEvent<string>).detail)) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => void syncNow(), 3000);
  });
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow());
}
