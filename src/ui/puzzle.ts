import type { Move, State } from '../cube/cube';
import { applyMoves, solvedState } from '../cube/cube';
import { parseAlg, randomScramble } from '../cube/notation';
import { randomScramble2 } from '../cube/cube2';
import { applyMoves4, randomScramble4, solved4 } from '../cube/cube4';
import { engineFor, type PuzzleSize } from '../cube/engine';
import { settings, saveSettings } from '../settings';

export type { PuzzleSize };

export const puzzle = (): PuzzleSize => settings.puzzle;
export const puzzleName = (p: PuzzleSize = settings.puzzle) => `${p}×${p}`;

export function setPuzzle(p: PuzzleSize) {
  if (settings.puzzle === p) return;
  settings.puzzle = p;
  saveSettings();
  document.body.dataset.puzzle = String(p);
  document.dispatchEvent(new CustomEvent('puzzle-change', { detail: p }));
}

/** Zufalls-Scramble für das aktive Puzzle (2x2: R U F, 3x3: alle Flächen, 4x4: mit Wide-Zügen) */
export function scrambleFor(p: PuzzleSize = settings.puzzle): Move[] {
  return p === 2 ? randomScramble2() : p === 4 ? randomScramble4() : randomScramble();
}

/** Notation des Puzzles lesen (4x4 kennt Rw, 2R, 3Rw …) */
export function parseFor(text: string, p: PuzzleSize = settings.puzzle): Move[] {
  return engineFor(p).parse(text);
}

export function tryParseFor(text: string, p: PuzzleSize = settings.puzzle): Move[] | null {
  try {
    return parseFor(text, p);
  } catch {
    return null;
  }
}

/** Gelöster Würfel in Wettkampf-Haltung (Weiss oben, Grün vorne) */
export function wcaStart(p: PuzzleSize = settings.puzzle): State {
  return p === 4 ? applyMoves4(solved4(), parseFor('z2', 4)) : applyMoves(solvedState(), parseAlg('z2'));
}
