// CFOP Studio – NAS-Server ohne externe Abhängigkeiten.
// Liefert die gebaute App aus (dist/) und bietet eine kleine API:
//   - Battle-Räume: gleicher Scramble für alle, Live-Rangliste per Server-Sent Events
//   - Geräte-Sync: Fortschritt, eigene Algs und Zeiten über ein Sync-Profil (Code)
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 80);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? './dist');
const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
const MAX_BODY = 4 * 1024 * 1024;
const ROOM_TTL_MS = 12 * 3600 * 1000;

mkdirSync(join(DATA_DIR, 'profiles'), { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

// ------------------------------------------------------------------ Hilfen

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Anfrage zu gross'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Ungültiges JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const cleanName = (n) => String(n ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 24) || 'Cuber';
const id = (bytes = 9) => randomBytes(bytes).toString('base64url');

// ------------------------------------------------------------------ Scrambles

const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const SUFFIX = ['', '2', "'"];

export function scramble(puzzle = 3) {
  const out = [];
  if (puzzle === 4) {
    const bases = ['U', 'D', 'R', 'L', 'F', 'B', 'Uw', 'Rw', 'Fw'];
    const ax = { U: 0, D: 0, Uw: 0, R: 1, L: 1, Rw: 1, F: 2, B: 2, Fw: 2 };
    const baseOf = (m) => m.replace(/['2]/g, '');
    while (out.length < 40) {
      const b = bases[Math.floor(Math.random() * bases.length)];
      const a = out[out.length - 1] && baseOf(out[out.length - 1]);
      const c = out[out.length - 2] && baseOf(out[out.length - 2]);
      if (a === b) continue;
      if (a && c && ax[a] === ax[b] && ax[c] === ax[b]) continue;
      out.push(b + SUFFIX[Math.floor(Math.random() * 3)]);
    }
    return out.join(' ');
  }
  if (puzzle === 2) {
    while (out.length < 11) {
      const f = ['R', 'U', 'F'][Math.floor(Math.random() * 3)];
      if (out.length && out[out.length - 1][0] === f) continue;
      out.push(f + SUFFIX[Math.floor(Math.random() * 3)]);
    }
    return out.join(' ');
  }
  while (out.length < 21) {
    const f = FACES[Math.floor(Math.random() * 6)];
    const a = out[out.length - 1]?.[0];
    const b = out[out.length - 2]?.[0];
    if (a === f) continue;
    if (a && b && AXIS[a] === AXIS[f] && AXIS[b] === AXIS[f]) continue;
    out.push(f + SUFFIX[Math.floor(Math.random() * 3)]);
  }
  return out.join(' ');
}

// ------------------------------------------------------------------ Battle-Räume

/** @type {Map<string, any>} */
const rooms = new Map();

function roomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    puzzle: room.puzzle,
    round: room.round,
    scramble: room.scrambles[room.round - 1],
    host: room.host,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, online: p.streams.size > 0 })),
    results: room.results,
  };
}

function broadcast(room) {
  room.touched = Date.now();
  const payload = `event: state\ndata: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const p of room.players.values()) for (const s of p.streams) s.write(payload);
}

function newRoom(puzzle) {
  const room = { code: roomCode(), puzzle: [2, 3, 4].includes(puzzle) ? puzzle : 3, round: 1, scrambles: [scramble(puzzle)], players: new Map(), results: [{}], host: null, touched: Date.now() };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, name) {
  const p = { id: id(), name: cleanName(name), streams: new Set() };
  room.players.set(p.id, p);
  if (!room.host) room.host = p.id;
  return p;
}

// Alte Räume aufräumen
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.touched > ROOM_TTL_MS) rooms.delete(code);
}, 600_000).unref();

// ------------------------------------------------------------------ Sync

const profilePath = (code) => join(DATA_DIR, 'profiles', `${code}.json`);
const validCode = (c) => /^[A-Za-z0-9_-]{6,40}$/.test(c);

function loadProfile(code) {
  try {
    return JSON.parse(readFileSync(profilePath(code), 'utf8'));
  } catch {
    return { keys: {} };
  }
}

function saveProfile(code, profile) {
  const tmp = profilePath(code) + '.tmp';
  writeFileSync(tmp, JSON.stringify(profile));
  renameSync(tmp, profilePath(code));
}

/** Zeiten-Listen werden vereinigt (über den Zeitstempel), alles andere: neuester Stand gewinnt. */
const UNION_KEYS = new Set(['solves', 'solves2', 'solves4']);

export function mergeProfile(server, client) {
  const keys = { ...server.keys };
  for (const [k, entry] of Object.entries(client.keys ?? {})) {
    if (!entry || typeof entry.t !== 'number') continue;
    const cur = keys[k];
    if (UNION_KEYS.has(k) && Array.isArray(entry.value) && Array.isArray(cur?.value)) {
      const byAt = new Map(cur.value.map((s) => [s.at, s]));
      for (const s of entry.value) if (entry.t >= cur.t || !byAt.has(s.at)) byAt.set(s.at, s);
      keys[k] = { t: Math.max(cur.t, entry.t), value: [...byAt.values()].sort((a, b) => b.at - a.at).slice(0, 2000) };
    } else if (!cur || entry.t > cur.t) {
      keys[k] = entry;
    }
  }
  return { keys };
}

// ------------------------------------------------------------------ API

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // ohne "api"
  const method = req.method;

  if (parts[0] === 'health') return send(res, 200, { ok: true, rooms: rooms.size });

  // --- Sync
  if (parts[0] === 'sync' && parts[1]) {
    const code = parts[1];
    if (!validCode(code)) return send(res, 400, { error: 'Ungültiger Sync-Code' });
    if (method === 'GET') return send(res, 200, loadProfile(code));
    if (method === 'POST') {
      const body = await readJson(req);
      const merged = mergeProfile(loadProfile(code), body);
      saveProfile(code, merged);
      return send(res, 200, merged);
    }
  }

  // --- Battle
  if (parts[0] === 'rooms') {
    if (method === 'POST' && parts.length === 1) {
      const body = await readJson(req);
      const room = newRoom(Number(body.puzzle));
      const p = addPlayer(room, body.name);
      return send(res, 200, { code: room.code, playerId: p.id, room: publicRoom(room) });
    }
    const room = rooms.get(String(parts[1] ?? '').toUpperCase());
    if (!room) return send(res, 404, { error: 'Raum nicht gefunden' });

    if (method === 'POST' && parts[2] === 'join') {
      const body = await readJson(req);
      const p = addPlayer(room, body.name);
      broadcast(room);
      return send(res, 200, { code: room.code, playerId: p.id, room: publicRoom(room) });
    }
    if (method === 'GET' && parts[2] === 'events') {
      const player = room.players.get(url.searchParams.get('player') ?? '');
      if (!player) return send(res, 403, { error: 'Unbekannter Spieler' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: state\ndata: ${JSON.stringify(publicRoom(room))}\n\n`);
      player.streams.add(res);
      broadcast(room);
      const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(ping);
        player.streams.delete(res);
        broadcast(room);
      });
      return;
    }
    if (method === 'POST' && parts[2] === 'result') {
      const body = await readJson(req);
      if (!room.players.has(body.playerId)) return send(res, 403, { error: 'Unbekannter Spieler' });
      const round = Number(body.round);
      if (!Number.isInteger(round) || round < 1 || round > room.round) return send(res, 400, { error: 'Ungültige Runde' });
      const ms = Number(body.ms);
      if (!Number.isFinite(ms) || ms <= 0 || ms > 3_600_000) return send(res, 400, { error: 'Ungültige Zeit' });
      room.results[round - 1][body.playerId] = { ms: Math.round(ms), penalty: ['+2', 'DNF'].includes(body.penalty) ? body.penalty : undefined };
      broadcast(room);
      return send(res, 200, { ok: true });
    }
    if (method === 'POST' && parts[2] === 'next') {
      const body = await readJson(req);
      if (body.playerId !== room.host) return send(res, 403, { error: 'Nur der Gastgeber startet die nächste Runde' });
      room.round++;
      room.scrambles.push(scramble(room.puzzle));
      room.results.push({});
      broadcast(room);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'Unbekannter Endpunkt' });
}

// ------------------------------------------------------------------ Statische Dateien

function serveStatic(req, res, url) {
  let path = decodeURIComponent(url.pathname);
  const file = normalize(join(STATIC_DIR, path));
  if (!file.startsWith(STATIC_DIR)) return send(res, 403, 'Verboten');
  let target = file;
  if (!existsSync(target) || statSync(target).isDirectory()) {
    target = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(STATIC_DIR, 'index.html');
  }
  if (!existsSync(target)) return send(res, 404, 'Nicht gefunden');
  const ext = extname(target);
  const immutable = path.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(target).pipe(res);
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else send(res, 405, 'Methode nicht erlaubt');
  } catch (err) {
    if (!res.headersSent) send(res, err.status ?? 500, { error: err.message ?? 'Serverfehler' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`CFOP Studio läuft auf Port ${PORT} (Daten: ${DATA_DIR})`));
}
