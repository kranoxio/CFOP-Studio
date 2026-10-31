/**
 * Zugriff auf den NAS-Server (server/server.mjs). Läuft die App ohne Server
 * (z.B. Entwicklungsmodus oder reiner Static-Host), sind Battle und Sync nicht verfügbar.
 */
const BASE = './api';

let healthy: Promise<boolean> | null = null;

/** Ist der NAS-Server erreichbar? (einmal pro Sitzung geprüft) */
export function serverAvailable(): Promise<boolean> {
  healthy ??= fetch(`${BASE}/health`, { cache: 'no-store' })
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
    .catch(() => false);
  return healthy;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Serverfehler ${r.status}`);
  return data as T;
}

export const eventsUrl = (code: string, player: string) => `${BASE}/rooms/${code}/events?player=${encodeURIComponent(player)}`;
