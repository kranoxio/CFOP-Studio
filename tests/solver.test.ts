import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState } from '../src/cube/cube';
import { isSolved } from '../src/cube/analysis';
import { parseAlg, randomScramble } from '../src/cube/notation';
import { solveCFOP } from '../src/solver/cfop';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('CFOP-Solver', () => {
  for (const mode of ['alg', 'optimal'] as const) {
    it(`löst zufällige Scrambles (${mode})`, () => {
      const r = rng(mode === 'alg' ? 42 : 7);
      const n = mode === 'alg' ? 150 : 30;
      let total = 0;
      let searchSteps = 0;
      const t0 = performance.now();
      let worst = 0;
      for (let i = 0; i < n; i++) {
        const scramble = randomScramble(21, r);
        const start = applyMoves(applyMoves(solvedState(), parseAlg('z2')), scramble);
        const t = performance.now();
        const sol = solveCFOP(start, { f2lMode: mode });
        worst = Math.max(worst, performance.now() - t);
        const end = applyMoves(start, sol.steps.flatMap((s) => s.moves));
        expect(isSolved(end)).toBe(true);
        total += sol.moveCount;
        searchSteps += sol.steps.filter((s) => s.phase === 'f2l' && s.method === 'search').length;
      }
      console.log(mode, 'Ø Züge', (total / n).toFixed(1), 'Ø ms', ((performance.now() - t0) / n).toFixed(1), 'max ms', worst.toFixed(0), 'Such-Schritte', searchSteps);
    }, 120000);
  }
});

describe('CFOP-Solver mit OH-Algs', () => {
  it('löst zufällige Scrambles mit dem OH-Set', async () => {
    const { setAlgStyle } = await import('../src/algs/registry');
    setAlgStyle('oh');
    const r = rng(99);
    for (let i = 0; i < 40; i++) {
      const start = applyMoves(applyMoves(solvedState(), parseAlg('z2')), randomScramble(21, r));
      const sol = solveCFOP(start, { f2lMode: 'alg' });
      expect(isSolved(applyMoves(start, sol.steps.flatMap((s) => s.moves)))).toBe(true);
    }
    setAlgStyle('2h');
  });
});
