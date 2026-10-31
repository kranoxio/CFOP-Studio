const PREFIX = 'cfop-studio:';
const TIME = 'cfop-studio:__t:';

/** localStorage-Wrapper, der in privaten Fenstern oder ohne Speicher nicht abstürzt. */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.localStorage?.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
      // Änderungszeit für den Geräte-Sync merken
      globalThis.localStorage?.setItem(TIME + key, String(Date.now()));
      globalThis.dispatchEvent?.(new CustomEvent('storage-change', { detail: key }));
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
  /** Letzte Änderung eines Eintrags (0 = nie geändert) */
  time(key: string): number {
    try {
      return Number(globalThis.localStorage?.getItem(TIME + key) ?? 0);
    } catch {
      return 0;
    }
  },
  /** Schreibt einen Wert aus dem Sync, ohne die Änderungszeit neu zu setzen */
  setSynced(key: string, value: unknown, t: number) {
    try {
      globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
      globalThis.localStorage?.setItem(TIME + key, String(t));
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
};
