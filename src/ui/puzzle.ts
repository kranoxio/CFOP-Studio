import type { Move } from '../cube/cube';
import { randomScramble } from '../cube/notation';
import { randomScramble2 } from '../cube/cube2';
import { settings, saveSettings } from '../settings';

export type PuzzleSize = 2 | 3;

export const puzzle = (): PuzzleSize => settings.puzzle;
export const puzzleName = (p: PuzzleSize = settings.puzzle) => (p === 2 ? '2×2' : '3×3');

export function setPuzzle(p: PuzzleSize) {
  if (settings.puzzle === p) return;
  settings.puzzle = p;
  saveSettings();
  document.body.dataset.puzzle = String(p);
  document.dispatchEvent(new CustomEvent('puzzle-change', { detail: p }));
}

/** Zufalls-Scramble für das aktive Puzzle (2x2: R U F, 3x3: alle Flächen) */
export function scrambleFor(p: PuzzleSize = settings.puzzle): Move[] {
  return p === 2 ? randomScramble2() : randomScramble();
}
