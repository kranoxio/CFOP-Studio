import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

let base = '';
let close: () => void = () => {};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cfop-'));
  process.env.STATIC_DIR = join(process.cwd(), 'public');
  // @ts-expect-error – reines JS-Modul
  const mod = await import('../server/server.mjs');
  await new Promise<void>((r) => mod.server.listen(0, r));
  base = `http://127.0.0.1:${(mod.server.address() as AddressInfo).port}`;
  close = () => mod.server.close();
});
afterAll(() => close());

const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());

describe('NAS-Server', () => {
  it('liefert statische Dateien mit richtigem Typ', async () => {
    const r = await fetch(base + '/manifest.webmanifest');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('manifest+json');
    const t = await fetch(base + '/../../etc/passwd');
    expect(t.status).not.toBe(500);
  });

  it('Battle: Raum, Beitritt, Ergebnis, nächste Runde, Live-Events', async () => {
    const a = await post('/api/rooms', { name: 'Noé', puzzle: 3 });
    expect(a.code).toMatch(/^[A-Z]{4}$/);
    expect(a.room.scramble.split(' ').length).toBe(21);
    const b = await post(`/api/rooms/${a.code}/join`, { name: 'Kollege <script>' });
    expect(b.room.players.map((p: { name: string }) => p.name)).toEqual(['Noé', 'Kollege script']);

    // Live-Stream öffnen und erstes Ereignis lesen
    const ctrl = new AbortController();
    const es = await fetch(`${base}/api/rooms/${a.code}/events?player=${b.playerId}`, { signal: ctrl.signal });
    const reader = es.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('event: state');

    expect((await post(`/api/rooms/${a.code}/result`, { playerId: b.playerId, round: 1, ms: 11234 })).ok).toBe(true);
    expect((await post(`/api/rooms/${a.code}/result`, { playerId: b.playerId, round: 1, ms: -5 })).error).toBeTruthy();
    expect((await post(`/api/rooms/${a.code}/next`, { playerId: b.playerId })).error).toBeTruthy(); // nur Host
    expect((await post(`/api/rooms/${a.code}/next`, { playerId: a.playerId })).ok).toBe(true);
    const state = await post(`/api/rooms/${a.code}/join`, { name: 'Dritter' });
    expect(state.room.round).toBe(2);
    expect(state.room.results[0][b.playerId].ms).toBe(11234);
    ctrl.abort();
  });

  it('Sync: neuester Stand gewinnt, Zeiten werden vereinigt', async () => {
    const code = 'testprofil01';
    await post(`/api/sync/${code}`, { keys: { progress: { t: 10, value: { a: 1 } }, solves: { t: 10, value: [{ at: 1, ms: 9000 }] } } });
    const m = await post(`/api/sync/${code}`, { keys: { progress: { t: 5, value: { a: 0 } }, solves: { t: 12, value: [{ at: 2, ms: 8000 }] } } });
    expect(m.keys.progress.value).toEqual({ a: 1 });
    expect(m.keys.solves.value.map((s: { at: number }) => s.at)).toEqual([2, 1]);
    expect((await fetch(`${base}/api/sync/x`)).status).toBe(400);
  });
});
