import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState } from '../src/cube/cube';
import { cornersHome, randomScramble2 } from '../src/cube/cube2';
import { parseAlg } from '../src/cube/notation';
import { solve2x2, type Method2 } from '../src/solver/cube2';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('2x2-Solver', () => {
  for (const method of ['ortega', 'cll', 'eg'] as Method2[]) {
    it(`löst zufällige 2x2-Scrambles (${method})`, () => {
      const r = rng(method.length * 31);
      const start0 = applyMoves(solvedState(), parseAlg('z2'));
      let total = 0;
      const t0 = performance.now();
      const phases = new Map<string, number>();
      for (let i = 0; i < 120; i++) {
        const start = applyMoves(start0, randomScramble2(11, r));
        const sol = solve2x2(start, method);
        const end = applyMoves(start, sol.steps.flatMap((s) => s.moves));
        expect(cornersHome(end)).toBe(true);
        total += sol.moveCount;
        for (const st of sol.steps) if (st.caseId) phases.set(st.caseId.split('-')[0], (phases.get(st.caseId.split('-')[0]) ?? 0) + 1);
      }
      console.log(method, 'Ø Züge', (total / 120).toFixed(1), 'Ø ms', ((performance.now() - t0) / 120).toFixed(1), [...phases].map(([k, v]) => `${k}:${v}`).join(' '));
    }, 120000);
  }
});
