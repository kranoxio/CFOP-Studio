const PREFIX = 'cfop-studio:';

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
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
};
