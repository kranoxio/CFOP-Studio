/**
 * Facelet-basiertes Würfelmodell.
 *
 * Index-Schema: Fläche * 9 + Reihe * 3 + Spalte, Flächen in der Reihenfolge U R F D L B.
 * Ein Zustand ist ein Array der Länge 54: state[position] = Heimat-Index des Stickers,
 * der gerade an dieser Position liegt. Farbe eines Stickers = Math.floor(heimat / 9).
 *
 * Alle Züge (Flächen, Wide Moves, Slices, Rotationen) werden geometrisch aus
 * Achse + Schichten + Drehrichtung erzeugt – dadurch sind 3D-Animation und Logik
 * garantiert konsistent.
 */

export type Vec3 = [number, number, number];
export type State = Uint8Array;

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type FaceName = (typeof FACES)[number];

export const FACE_NORMALS: Vec3[] = [
  [0, 1, 0], // U
  [1, 0, 0], // R
  [0, 0, 1], // F
  [0, -1, 0], // D
  [-1, 0, 0], // L
  [0, 0, -1], // B
];

/** Position (Cubie-Koordinate) und Normale eines Facelets. */
export function faceletGeometry(index: number): { p: Vec3; n: Vec3 } {
  const face = Math.floor(index / 9);
  const row = Math.floor((index % 9) / 3);
  const col = index % 3;
  let p: Vec3;
  switch (face) {
    case 0: p = [col - 1, 1, row - 1]; break; // U: Reihe 0 hinten
    case 1: p = [1, 1 - row, 1 - col]; break; // R: Spalte 0 vorne
    case 2: p = [col - 1, 1 - row, 1]; break; // F
    case 3: p = [col - 1, -1, 1 - row]; break; // D: Reihe 0 vorne
    case 4: p = [-1, 1 - row, col - 1]; break; // L: Spalte 0 hinten
    default: p = [1 - col, 1 - row, -1]; break; // B: Spalte 0 rechts
  }
  return { p, n: FACE_NORMALS[face] };
}

const GEO = Array.from({ length: 54 }, (_, i) => faceletGeometry(i));
const keyOf = (p: Vec3, n: Vec3) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
const INDEX_BY_KEY = new Map<string, number>(GEO.map((g, i) => [keyOf(g.p, g.n), i]));

export function faceletAt(p: Vec3, n: Vec3): number {
  const i = INDEX_BY_KEY.get(keyOf(p, n));
  if (i === undefined) throw new Error(`Kein Facelet bei ${keyOf(p, n)}`);
  return i;
}

/** Rotation eines ganzzahligen Vektors um +90° (sign=1) oder -90° (sign=-1) um eine Achse (Rechtsschraube). */
export function rot90(v: Vec3, axis: number, sign: number): Vec3 {
  const [x, y, z] = v;
  if (axis === 0) return sign > 0 ? [x, -z, y] : [x, z, -y];
  if (axis === 1) return sign > 0 ? [z, y, -x] : [-z, y, x];
  return sign > 0 ? [-y, x, z] : [y, -x, z];
}

export interface MoveDef {
  axis: 0 | 1 | 2;
  layers: number[];
  /** Vorzeichen des Drehwinkels (Vielfache von 90°) für eine Vierteldrehung im Uhrzeigersinn. */
  dir: 1 | -1;
}

export const MOVE_DEFS: Record<string, MoveDef> = {
  U: { axis: 1, layers: [1], dir: -1 },
  D: { axis: 1, layers: [-1], dir: 1 },
  R: { axis: 0, layers: [1], dir: -1 },
  L: { axis: 0, layers: [-1], dir: 1 },
  F: { axis: 2, layers: [1], dir: -1 },
  B: { axis: 2, layers: [-1], dir: 1 },
  u: { axis: 1, layers: [1, 0], dir: -1 },
  d: { axis: 1, layers: [-1, 0], dir: 1 },
  r: { axis: 0, layers: [1, 0], dir: -1 },
  l: { axis: 0, layers: [-1, 0], dir: 1 },
  f: { axis: 2, layers: [1, 0], dir: -1 },
  b: { axis: 2, layers: [-1, 0], dir: 1 },
  M: { axis: 0, layers: [0], dir: 1 },
  E: { axis: 1, layers: [0], dir: 1 },
  S: { axis: 2, layers: [0], dir: -1 },
  x: { axis: 0, layers: [-1, 0, 1], dir: -1 },
  y: { axis: 1, layers: [-1, 0, 1], dir: -1 },
  z: { axis: 2, layers: [-1, 0, 1], dir: -1 },
};

export const MOVE_NAMES = Object.keys(MOVE_DEFS);
export const FACE_MOVE_NAMES = ['U', 'D', 'R', 'L', 'F', 'B'];
export const ROTATION_NAMES = ['x', 'y', 'z'];

/** Permutation: neu[j] = alt[perm[j]] */
export type Perm = Uint8Array;

function quarterPerm(def: MoveDef): Perm {
  const perm = new Uint8Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  for (let i = 0; i < 54; i++) {
    const { p, n } = GEO[i];
    if (!def.layers.includes(p[def.axis])) continue;
    const j = faceletAt(rot90(p, def.axis, def.dir), rot90(n, def.axis, def.dir));
    perm[j] = i;
  }
  return perm;
}

/** Hintereinanderausführung: zuerst a, dann b. */
export function composePerm(a: Perm, b: Perm): Perm {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[j] = a[b[j]];
  return out;
}

export function identityPerm(): Perm {
  const p = new Uint8Array(54);
  for (let i = 0; i < 54; i++) p[i] = i;
  return p;
}

export function invertPerm(p: Perm): Perm {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[p[j]] = j;
  return out;
}

export function permEquals(a: Perm, b: Perm): boolean {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** PERMS[name][amount] für amount 1..3 */
export const PERMS: Record<string, Perm[]> = {};
for (const name of MOVE_NAMES) {
  const q = quarterPerm(MOVE_DEFS[name]);
  const q2 = composePerm(q, q);
  const q3 = composePerm(q2, q);
  PERMS[name] = [identityPerm(), q, q2, q3];
}

export interface Move {
  /** Basisname: U, R, r, M, x, ... */
  base: string;
  /** 1 = im Uhrzeigersinn, 2 = Doppelzug, 3 = gegen den Uhrzeigersinn */
  amount: 1 | 2 | 3;
}

export function moveToString(m: Move): string {
  return m.base + (m.amount === 1 ? '' : m.amount === 2 ? '2' : "'");
}

export function isRotation(m: Move): boolean {
  return ROTATION_NAMES.includes(m.base);
}

export function isFaceMove(m: Move): boolean {
  return FACE_MOVE_NAMES.includes(m.base);
}

export function invertMove(m: Move): Move {
  return { base: m.base, amount: (4 - m.amount) as 1 | 2 | 3 };
}

export function solvedState(): State {
  const s = new Uint8Array(54);
  for (let i = 0; i < 54; i++) s[i] = i;
  return s;
}

export function applyPerm(s: State, perm: Perm): State {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[j] = s[perm[j]];
  return out;
}

export function applyMove(s: State, m: Move): State {
  return applyPerm(s, PERMS[m.base][m.amount]);
}

export function applyMoves(s: State, moves: Move[]): State {
  let cur = s;
  for (const m of moves) cur = applyMove(cur, m);
  return cur;
}

export function movesPerm(moves: Move[]): Perm {
  let p = identityPerm();
  for (const m of moves) p = composePerm(p, PERMS[m.base][m.amount]);
  return p;
}

export const colorOf = (s: State, i: number) => Math.floor(s[i] / 9);
export const centerColor = (s: State, face: number) => Math.floor(s[face * 9 + 4] / 9);

export function stateEquals(a: State, b: State): boolean {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Facelet-Indizes eines Cubies an einer Position. */
export function faceletsOfCubie(p: Vec3): number[] {
  const out: number[] = [];
  for (let i = 0; i < 54; i++) {
    const g = GEO[i].p;
    if (g[0] === p[0] && g[1] === p[1] && g[2] === p[2]) out.push(i);
  }
  return out;
}

export function geometry(i: number) {
  return GEO[i];
}
