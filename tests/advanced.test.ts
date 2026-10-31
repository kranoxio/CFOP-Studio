import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState, type Move } from '../src/cube/cube';
import { SLOTS, crossSolved, edgesOriented, f2lSolved, isSolved, llCornersSolved, ollSolved, slotSolved } from '../src/cube/analysis';
import { invertAlg } from '../src/cube/notation';
import { ADVANCED_CASES } from '../src/algs/advanced';
import { caseState, normalizeAlg, validateAlg } from '../src/algs/registry';

const U = (n: number): Move[] => (n ? [{ base: 'U', amount: n as 1 | 2 | 3 }] : []);
const bySet = (s: string) => ADVANCED_CASES.filter((c) => c.set === s);

describe('Fortgeschrittene Sets', () => {
  it('haben die erwartete Anzahl', () => {
    expect(bySet('COLL').length).toBe(40);
    expect(bySet('WV').length).toBe(27);
    expect(bySet('VLS').length).toBe(162);
    expect(bySet('ZBLL').length).toBe(472);
  });

  it('jeder Alg löst seinen Fall', () => {
    const bad: string[] = [];
    for (const c of ADVANCED_CASES) for (const a of c.algs) if (!validateAlg(c, a).ok) bad.push(`${c.id}: ${a}`);
    expect(bad).toEqual([]);
  });

  it('Fälle erfüllen die Bedingung ihrer Kategorie', () => {
    const bad: string[] = [];
    for (const c of ADVANCED_CASES) {
      const s = caseState(c);
      const anyAuf = (f: (x: typeof s) => boolean) => [0, 1, 2, 3].some((a) => f(applyMoves(s, U(a))));
      let ok = true;
      if (c.set === 'COLL') ok = f2lSolved(s) && edgesOriented(s) && !anyAuf(llCornersSolved);
      if (c.set === 'ZBLL') ok = f2lSolved(s) && edgesOriented(s) && !anyAuf(isSolved);
      if (c.set === 'WV' || c.set === 'VLS') ok = crossSolved(s) && SLOTS.slice(1).every((sl) => slotSolved(s, sl)) && !slotSolved(s, SLOTS[0]) && !ollSolved(s);
      if (!ok) bad.push(c.id);
    }
    expect(bad).toEqual([]);
  });

  it('keine doppelten Fälle', () => {
    for (const set of ['COLL', 'WV', 'VLS', 'ZBLL']) {
      const seen = new Map<string, string>();
      const dup: string[] = [];
      for (const c of bySet(set)) {
        const inv = invertAlg(normalizeAlg(c.algs[0]));
        const keys: string[] = [];
        for (let a = 0; a < 4; a++)
          for (let b = 0; b < 4; b++) keys.push(Array.from(applyMoves(solvedState(), [...U(a), ...inv, ...U(b)])).join(','));
        const k = keys.sort()[0];
        if (seen.has(k)) dup.push(`${c.id}=${seen.get(k)}`);
        seen.set(k, c.id);
      }
      expect(dup, set).toEqual([]);
    }
  });
});
