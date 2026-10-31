import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState } from '../src/cube/cube';
import { SLOTS, crossSolved, slotSolved } from '../src/cube/analysis';
import { htm, parseAlg, randomScramble, rotationToHome } from '../src/cube/notation';
import { optimalXCross, slotCosts, solveCFOP } from '../src/solver/cfop';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const startOf = (r: () => number) => applyMoves(applyMoves(solvedState(), parseAlg('z2')), randomScramble(21, r));
const homed = (s: ReturnType<typeof startOf>) => applyMoves(s, rotationToHome(s));

describe('Analyse', () => {
  it('optimales X-Cross löst Kreuz + ein Paar', () => {
    const r = rng(5);
    let total = 0;
    const t0 = performance.now();
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      const s = homed(startOf(r));
      const t = performance.now();
      const x = optimalXCross(s)!;
      worst = Math.max(worst, performance.now() - t);
      const end = applyMoves(s, x.moves);
      expect(crossSolved(end)).toBe(true);
      expect(slotSolved(end, x.slot)).toBe(true);
      total += x.moves.length;
    }
    console.log('X-Cross Ø', (total / 12).toFixed(1), 'Züge, Ø', ((performance.now() - t0) / 12).toFixed(0), 'ms, max', worst.toFixed(0), 'ms');
  }, 120000);

  it('Slot-Kosten: vollständig und nie teurer als der Solver-Schritt', () => {
    const r = rng(11);
    for (let i = 0; i < 20; i++) {
      const s = startOf(r);
      const sol = solveCFOP(s);
      const afterCross = applyMoves(s, sol.steps.filter((st) => st.phase === 'inspection' || st.phase === 'cross').flatMap((st) => st.moves));
      const costs = slotCosts(afterCross);
      expect(costs.length).toBe(SLOTS.filter((sl) => !slotSolved(afterCross, sl)).length);
      const first = sol.steps.find((st) => st.phase === 'f2l')!;
      for (const c of costs) expect(c.cost).toBeLessThan(99);
      const chosen = costs.find((c) => c.slot === first.slot)!;
      expect(chosen.cost).toBeLessThanOrEqual(htm(first.moves));
    }
  }, 60000);
});
