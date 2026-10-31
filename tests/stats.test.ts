import { describe, expect, it } from 'vitest';
import { applyMove, applyMoves, movesPerm } from '../src/cube/cube';
import { conjugateMove, formatAlg, randomScramble } from '../src/cube/notation';
import { solveCFOP } from '../src/solver/cfop';
import { WCA_START } from '../src/smartcube/smartcube';
import { SplitTracker } from '../src/smartcube/splits';
import { analyzeSolves, type SolveRecord } from '../src/stats/analysis';

/** Simuliert Smartcube-Solves aus Solver-Lösungen (nur reine Flächenzug-Lösungen). */
function fakeSolves(n: number): SolveRecord[] {
  const out: SolveRecord[] = [];
  while (out.length < n) {
    const scramble = randomScramble();
    const scrambled = applyMoves(WCA_START, scramble);
    const sol = solveCFOP(scrambled);
    const rot = movesPerm(sol.steps.find((s) => s.phase === 'inspection')!.moves);
    const phys = sol.steps.filter((s) => s.phase !== 'inspection').flatMap((s) => s.moves).map((m) => conjugateMove(m, rot));
    if (phys.some((m) => !'UDRLFB'.includes(m.base))) continue;
    const tracker = new SplitTracker();
    const times: number[] = [];
    let st = scrambled;
    let t = 0;
    phys.forEach((m, i) => {
      // vor jeder Phase eine Pause von 400 ms, sonst 150 ms pro Zug
      t += i > 0 && tracker.milestones.some((x) => x.moveIndex === i - 1) ? 400 : 150;
      times.push(t);
      st = applyMove(st, m);
      tracker.update(st, i, t);
    });
    out.push({ ms: t, scramble: formatAlg(scramble), at: Date.now(), moves: formatAlg(phys), splits: tracker.milestones, times });
  }
  return out;
}

describe('Statistik', () => {
  it('wertet Phasen, Pausen und Fälle aus', () => {
    const a = analyzeSolves(fakeSolves(6))!;
    expect(a.count).toBe(6);
    expect(a.phases.map((p) => p.id)).toEqual(['cross', 'f2l1', 'f2l2', 'f2l3', 'f2l4', 'oll', 'pll']);
    // Phasen nach dem Kreuz beginnen mit der simulierten 400-ms-Pause (ausser bei Skips)
    expect(a.phases[1].pause).toBeCloseTo(0.4, 1);
    expect(a.phases.every((p) => p.avg > 0)).toBe(true);
    expect(a.oll.length + a.pll.length).toBeGreaterThan(0);
    // Ausführungs-TPS: 150 ms pro Zug ≈ 6.7 TPS
    expect(a.phases[2].tps!).toBeGreaterThan(5);
  }, 60000);

  it('liefert null ohne Smartcube-Solves', () => {
    expect(analyzeSolves([{ ms: 10000, scramble: 'R U', at: 0 }])).toBeNull();
  });
});
