import { describe, expect, it } from 'vitest';
import { applyMove, applyMoves, colorOf, movesPerm } from '../src/cube/cube';
import { isSolved } from '../src/cube/analysis';
import { conjugateMove, randomScramble } from '../src/cube/notation';
import { solveCFOP } from '../src/solver/cfop';
import { WCA_START, sameColors, stateFromColors, stateFromFacelets } from '../src/smartcube/smartcube';
import { SplitTracker, reconstructionSteps } from '../src/smartcube/splits';

describe('Smartcube', () => {
  it('rekonstruiert Zustände aus Farben eindeutig', () => {
    for (let i = 0; i < 20; i++) {
      const s = applyMoves(WCA_START, randomScramble());
      const colors = Array.from({ length: 54 }, (_, k) => colorOf(s, k));
      const back = stateFromColors(colors)!;
      expect(back).not.toBeNull();
      expect(sameColors(back, s)).toBe(true);
      expect(Array.from(back)).toEqual(Array.from(s));
    }
  });

  it('gelöster GAN-Facelet-String entspricht Weiss oben, Grün vorne', () => {
    const s = stateFromFacelets('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')!;
    expect(Array.from(s)).toEqual(Array.from(WCA_START));
  });

  it('erkennt Splits eines Solves und die Rekonstruktion löst den Würfel', () => {
    let tested = 0;
    for (let n = 0; n < 80 && tested < 8; n++) {
      const scrambled = applyMoves(WCA_START, randomScramble());
      const sol = solveCFOP(scrambled);
      // Lösungszüge in den WCA-Rahmen zurückrechnen, so wie sie der Smartcube melden würde
      const rot = sol.steps.find((s) => s.phase === 'inspection')!.moves;
      const rotPerm = movesPerm(rot);
      const physical = sol.steps.filter((s) => s.phase !== 'inspection').flatMap((s) => s.moves).map((m) => conjugateMove(m, rotPerm));
      // Ein Smartcube meldet nur Flächenzüge – Lösungen mit Slices/Rotationen hier überspringen
      if (physical.some((m) => !'UDRLFB'.includes(m.base))) continue;
      tested++;
      const tracker = new SplitTracker();
      let st = scrambled;
      physical.forEach((m, i) => {
        st = applyMove(st, m);
        tracker.update(st, i, i * 100);
      });
      expect(tracker.done).toBe(true);
      const ids = tracker.milestones.map((m) => m.id);
      expect(ids.slice(0, 1)).toEqual(['cross']);
      expect(ids).toContain('f2l4');
      expect(ids.slice(-2)).toEqual(['oll', 'pll']);
      const steps = reconstructionSteps(scrambled, physical, tracker.milestones);
      expect(isSolved(applyMoves(scrambled, steps.flatMap((s) => s.moves)))).toBe(true);
    }
    expect(tested).toBeGreaterThanOrEqual(3);
  });
});
