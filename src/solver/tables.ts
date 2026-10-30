import { PERMS, type Move } from '../cube/cube';
import { CROSS_TOKENS, SLOTS } from '../cube/analysis';

/**
 * Suche über "Tokens": Statt des ganzen Würfels verfolgt die Suche nur die Positionen
 * einzelner Sticker (ein Sticker bestimmt Position + Orientierung seines Steins).
 */

export const SEARCH_MOVES: Move[] = [];
for (const base of ['U', 'R', 'F', 'D', 'L', 'B']) {
  for (const amount of [1, 2, 3] as const) SEARCH_MOVES.push({ base, amount });
}
const FACE_INDEX: Record<string, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
export const MOVE_FACE = SEARCH_MOVES.map((m) => FACE_INDEX[m.base]);

/** FWD[m][alt] = neue Position eines Stickers nach Zug m */
export const FWD: Uint8Array[] = SEARCH_MOVES.map((m) => {
  const perm = PERMS[m.base][m.amount];
  const fwd = new Uint8Array(54);
  for (let j = 0; j < 54; j++) fwd[perm[j]] = j;
  return fwd;
});

const EDGE_LIST: number[] = [];
export const CORNER_LIST: number[] = [];
for (let i = 0; i < 54; i++) {
  const k = i % 9;
  if (k === 4) continue;
  if (k % 2 === 1) EDGE_LIST.push(i);
  else CORNER_LIST.push(i);
}
export const EDGE_IDX = new Int8Array(54).fill(-1);
export const CORNER_IDX = new Int8Array(54).fill(-1);
EDGE_LIST.forEach((f, i) => (EDGE_IDX[f] = i));
CORNER_LIST.forEach((f, i) => (CORNER_IDX[f] = i));

function bfs(size: number, goal: number, decode: (idx: number) => number[], encode: (pos: number[]) => number) {
  const table = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  table[goal] = 0;
  queue[tail++] = goal;
  while (head < tail) {
    const idx = queue[head++];
    const pos = decode(idx);
    const d = table[idx];
    for (let m = 0; m < FWD.length; m++) {
      const f = FWD[m];
      const next = encode(pos.map((p) => f[p]));
      if (table[next] === 255) {
        table[next] = d + 1;
        queue[tail++] = next;
      }
    }
  }
  return table;
}

export const crossIndex = (a: number, b: number, c: number, d: number) =>
  ((EDGE_IDX[a] * 24 + EDGE_IDX[b]) * 24 + EDGE_IDX[c]) * 24 + EDGE_IDX[d];

let crossTable: Uint8Array | null = null;
/** Distanz-Tabelle für das weisse Kreuz (exakt, 24^4 Einträge). */
export function getCrossTable(): Uint8Array {
  if (!crossTable) {
    crossTable = bfs(
      24 ** 4,
      crossIndex(CROSS_TOKENS[0], CROSS_TOKENS[1], CROSS_TOKENS[2], CROSS_TOKENS[3]),
      (idx) => [EDGE_LIST[Math.floor(idx / 13824)], EDGE_LIST[Math.floor(idx / 576) % 24], EDGE_LIST[Math.floor(idx / 24) % 24], EDGE_LIST[idx % 24]],
      (p) => crossIndex(p[0], p[1], p[2], p[3]),
    );
  }
  return crossTable;
}

export const pairIndex = (corner: number, edge: number) => CORNER_IDX[corner] * 24 + EDGE_IDX[edge];

const pairTables = new Map<string, Uint8Array>();
/** Distanz-Tabelle für ein F2L-Paar (Ecke + Kante) in seinen Slot, ohne Rücksicht aufs Kreuz. */
export function getPairTable(slotIndex: number): Uint8Array {
  const slot = SLOTS[slotIndex];
  let t = pairTables.get(slot.name);
  if (!t) {
    t = bfs(
      576,
      pairIndex(slot.cornerToken, slot.edgeToken),
      (idx) => [CORNER_LIST[Math.floor(idx / 24)], EDGE_LIST[idx % 24]],
      (p) => pairIndex(p[0], p[1]),
    );
    pairTables.set(slot.name, t);
  }
  return t;
}
