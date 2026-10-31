import { FACE_NORMALS, rot90, type Move, type MoveDef, type Perm, type State, type Vec3 } from './cube';

/**
 * 4x4-Modell: 6 × 16 Facelets, Index = Fläche * 16 + Reihe * 4 + Spalte (gleiches Netz wie beim 3x3).
 * Koordinaten in "halben Steinen": −3, −1, +1, +3 (äussere Schicht = ±3, innere = ±1).
 */

export const N4 = 96;

export function geometry4(i: number): { p: Vec3; n: Vec3 } {
  const face = Math.floor(i / 16);
  const r = Math.floor((i % 16) / 4);
  const c = i % 4;
  const a = 2 * c - 3;
  const b = 2 * r - 3;
  let p: Vec3;
  switch (face) {
    case 0: p = [a, 3, b]; break; // U: Reihe 0 hinten
    case 1: p = [3, -b, -a]; break; // R: Spalte 0 vorne
    case 2: p = [a, -b, 3]; break; // F
    case 3: p = [a, -3, -b]; break; // D: Reihe 0 vorne
    case 4: p = [-3, -b, a]; break; // L: Spalte 0 hinten
    default: p = [-a, -b, -3]; break; // B: Spalte 0 rechts
  }
  return { p, n: FACE_NORMALS[face] };
}

const GEO4 = Array.from({ length: N4 }, (_, i) => geometry4(i));
const key = (p: Vec3, n: Vec3) => `${p.join(',')}|${n.join(',')}`;
const INDEX4 = new Map(GEO4.map((g, i) => [key(g.p, g.n), i]));

/** Zug-Definitionen (WCA/SiGN): R = äussere Schicht, 2R = innere, Rw = beide, 3Rw = drei, M/E/S = beide inneren */
export const MOVE_DEFS4: Record<string, MoveDef> = {
  U: { axis: 1, layers: [3], dir: -1 },
  D: { axis: 1, layers: [-3], dir: 1 },
  R: { axis: 0, layers: [3], dir: -1 },
  L: { axis: 0, layers: [-3], dir: 1 },
  F: { axis: 2, layers: [3], dir: -1 },
  B: { axis: 2, layers: [-3], dir: 1 },
  '2U': { axis: 1, layers: [1], dir: -1 },
  '2D': { axis: 1, layers: [-1], dir: 1 },
  '2R': { axis: 0, layers: [1], dir: -1 },
  '2L': { axis: 0, layers: [-1], dir: 1 },
  '2F': { axis: 2, layers: [1], dir: -1 },
  '2B': { axis: 2, layers: [-1], dir: 1 },
  Uw: { axis: 1, layers: [3, 1], dir: -1 },
  Dw: { axis: 1, layers: [-3, -1], dir: 1 },
  Rw: { axis: 0, layers: [3, 1], dir: -1 },
  Lw: { axis: 0, layers: [-3, -1], dir: 1 },
  Fw: { axis: 2, layers: [3, 1], dir: -1 },
  Bw: { axis: 2, layers: [-3, -1], dir: 1 },
  '3Uw': { axis: 1, layers: [3, 1, -1], dir: -1 },
  '3Dw': { axis: 1, layers: [-3, -1, 1], dir: 1 },
  '3Rw': { axis: 0, layers: [3, 1, -1], dir: -1 },
  '3Lw': { axis: 0, layers: [-3, -1, 1], dir: 1 },
  '3Fw': { axis: 2, layers: [3, 1, -1], dir: -1 },
  '3Bw': { axis: 2, layers: [-3, -1, 1], dir: 1 },
  M: { axis: 0, layers: [-1, 1], dir: 1 },
  E: { axis: 1, layers: [-1, 1], dir: 1 },
  S: { axis: 2, layers: [-1, 1], dir: -1 },
  x: { axis: 0, layers: [-3, -1, 1, 3], dir: -1 },
  y: { axis: 1, layers: [-3, -1, 1, 3], dir: -1 },
  z: { axis: 2, layers: [-3, -1, 1, 3], dir: -1 },
};

function quarterPerm4(def: MoveDef): Perm {
  const perm = new Uint8Array(N4);
  for (let i = 0; i < N4; i++) perm[i] = i;
  for (let i = 0; i < N4; i++) {
    const { p, n } = GEO4[i];
    if (!def.layers.includes(p[def.axis])) continue;
    const j = INDEX4.get(key(rot90(p, def.axis, def.dir), rot90(n, def.axis, def.dir)))!;
    perm[j] = i;
  }
  return perm;
}

const compose = (a: Perm, b: Perm) => {
  const out = new Uint8Array(N4);
  for (let j = 0; j < N4; j++) out[j] = a[b[j]];
  return out;
};

export const PERMS4: Record<string, Perm[]> = {};
for (const [name, def] of Object.entries(MOVE_DEFS4)) {
  const q = quarterPerm4(def);
  const q2 = compose(q, q);
  const id = Uint8Array.from({ length: N4 }, (_, i) => i);
  PERMS4[name] = [id, q, q2, compose(q2, q)];
}

export const solved4 = (): State => Uint8Array.from({ length: N4 }, (_, i) => i);

export function applyMove4(s: State, m: Move): State {
  const perm = PERMS4[m.base][m.amount];
  const out = new Uint8Array(N4);
  for (let j = 0; j < N4; j++) out[j] = s[perm[j]];
  return out;
}

export const applyMoves4 = (s: State, moves: Move[]) => moves.reduce(applyMove4, s);
export const color4 = (s: State, i: number) => Math.floor(s[i] / 16);

/**
 * Notation für 4x4: R, R', R2, Rw, 2R (innere Schicht), 3Rw, r (= Rw, SiGN), M/E/S, x/y/z.
 * Klammern werden ignoriert.
 */
export function parseAlg4(text: string): Move[] {
  const out: Move[] = [];
  const re = /^(\d?)([URFDLBMESxyz]|[urfdlb])(w?)(\d*)(['’]?)$/;
  for (const raw of text.replace(/[()[\]]/g, ' ').split(/\s+/).filter(Boolean)) {
    const m = raw.match(re);
    if (!m) throw new Error(`Unbekannte 4x4-Notation: "${raw}"`);
    const [, layers, letter, w, num, prime] = m;
    let base: string;
    if (/[urfdlb]/.test(letter)) base = letter.toUpperCase() + 'w';
    else if ('MESxyz'.includes(letter)) base = letter;
    else if (w) base = `${layers === '3' ? '3' : ''}${letter}w`;
    else base = layers === '2' ? `2${letter}` : letter;
    if (!MOVE_DEFS4[base]) throw new Error(`Unbekannter 4x4-Zug: "${raw}"`);
    let amount = (num ? parseInt(num, 10) : 1) % 4;
    if (prime) amount = (4 - amount) % 4;
    if (amount) out.push({ base, amount: amount as 1 | 2 | 3 });
  }
  return out;
}

/** Mittelsteine eines Zustands in Grundposition drehen (die 2x2-Zentren bestimmen die Orientierung). */
const CENTER4 = [5, 6, 9, 10];
const ROTATIONS: Move[][] = (() => {
  // Alle 24 Orientierungen aus y- und x/z-Drehungen
  const list: Move[][] = [];
  const firsts: Move[][] = [[], [{ base: 'x', amount: 1 }], [{ base: 'x', amount: 2 }], [{ base: 'x', amount: 3 }], [{ base: 'z', amount: 1 }], [{ base: 'z', amount: 3 }]];
  for (const f of firsts) for (let k = 0; k < 4; k++) list.push(k ? [...f, { base: 'y', amount: k as 1 | 2 | 3 }] : f);
  return list;
})();

export function rotationToHome4(s: State): Move[] {
  for (const r of ROTATIONS) {
    const t = applyMoves4(s, r);
    let ok = true;
    for (let f = 0; f < 6 && ok; f++) for (const c of CENTER4) if (color4(t, f * 16 + c) !== f) ok = false;
    if (ok) return r;
  }
  return [];
}

/** 4x4-Alg normalisieren: eine eventuelle Netto-Rotation am Ende ausgleichen */
export function normalizeAlg4(text: string): Move[] {
  const moves = parseAlg4(text);
  return [...moves, ...rotationToHome4(applyMoves4(solved4(), moves))];
}

/** Alle Flächen einfarbig (Orientierung egal) */
export function isSolved4(s: State): boolean {
  for (let f = 0; f < 6; f++) {
    const c = color4(s, f * 16);
    for (let k = 1; k < 16; k++) if (color4(s, f * 16 + k) !== c) return false;
  }
  return true;
}

/** Zufalls-Scramble für den 4x4 (äussere und Wide-Züge, wie im Wettkampf ~40 Züge) */
export function randomScramble4(length = 40, rng: () => number = Math.random): Move[] {
  const bases = ['U', 'D', 'R', 'L', 'F', 'B', 'Uw', 'Rw', 'Fw'];
  const axis: Record<string, number> = { U: 1, D: 1, Uw: 1, R: 0, L: 0, Rw: 0, F: 2, B: 2, Fw: 2 };
  const out: Move[] = [];
  while (out.length < length) {
    const base = bases[Math.floor(rng() * bases.length)];
    const last = out[out.length - 1];
    if (last && last.base === base) continue;
    // nicht mehr als zwei Züge hintereinander auf derselben Achse
    if (out.length >= 2 && axis[out[out.length - 1].base] === axis[base] && axis[out[out.length - 2].base] === axis[base]) continue;
    out.push({ base, amount: (1 + Math.floor(rng() * 3)) as 1 | 2 | 3 });
  }
  return out;
}
