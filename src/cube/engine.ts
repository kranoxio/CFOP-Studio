import { MOVE_DEFS, applyMove, geometry, solvedState, type Move, type MoveDef, type State, type Vec3 } from './cube';
import { parseAlg } from './notation';
import { MOVE_DEFS4, N4, applyMove4, geometry4, parseAlg4, solved4 } from './cube4';

export type PuzzleSize = 2 | 3 | 4;

/**
 * Gemeinsame Schnittstelle der Puzzles für Darstellung, Wiedergabe und Gesten.
 * 2x2 nutzt das 3x3-Modell (nur Ecken sichtbar), 4x4 ein eigenes mit 96 Stickern.
 */
export interface Engine {
  size: PuzzleSize;
  /** Anzahl Facelets im Zustand */
  count: number;
  geometry(i: number): { p: Vec3; n: Vec3 };
  def(base: string): MoveDef | undefined;
  apply(s: State, m: Move): State;
  solved(): State;
  /** Farbe/Fläche eines Heimat-Index */
  faceOf(home: number): number;
  /** Koordinaten aller Cubies (in Engine-Einheiten) */
  cubies: Vec3[];
  /** Sichtbare Facelets */
  facelets: number[];
  /** Weltabstand pro Engine-Einheit */
  spacing: number;
  /** Skalierung des ganzen Würfels */
  scale: number;
  /** Koordinate der äusseren Schicht */
  outer: number;
  parse(text: string): Move[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function cubiesFor(coords: number[], onlyCorners = false): Vec3[] {
  const out: Vec3[] = [];
  const outer = Math.max(...coords);
  for (const x of coords)
    for (const y of coords)
      for (const z of coords) {
        const surface = [x, y, z].some((v) => Math.abs(v) === outer);
        if (!surface) continue;
        if (onlyCorners && ![x, y, z].every((v) => Math.abs(v) === outer)) continue;
        out.push([x, y, z]);
      }
  return out;
}

const ENGINE3: Engine = {
  size: 3,
  count: 54,
  geometry,
  def: (b) => MOVE_DEFS[b],
  apply: applyMove,
  solved: solvedState,
  faceOf: (h) => Math.floor(h / 9),
  cubies: cubiesFor([-1, 0, 1]),
  facelets: range(54),
  spacing: 1,
  scale: 1,
  outer: 1,
  parse: parseAlg,
};

const ENGINE2: Engine = {
  ...ENGINE3,
  size: 2,
  cubies: cubiesFor([-1, 1], true),
  facelets: range(54).filter((i) => [0, 2, 6, 8].includes(i % 9)),
  spacing: 0.5,
  scale: 1.3,
};

const ENGINE4: Engine = {
  size: 4,
  count: N4,
  geometry: geometry4,
  def: (b) => MOVE_DEFS4[b],
  apply: applyMove4,
  solved: solved4,
  faceOf: (h) => Math.floor(h / 16),
  cubies: cubiesFor([-3, -1, 1, 3]),
  facelets: range(N4),
  spacing: 0.5,
  scale: 0.72,
  outer: 3,
  parse: parseAlg4,
};

export const ENGINES: Record<PuzzleSize, Engine> = { 2: ENGINE2, 3: ENGINE3, 4: ENGINE4 };
export const engineFor = (size: PuzzleSize = 3) => ENGINES[size];
