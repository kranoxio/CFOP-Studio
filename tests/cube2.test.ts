import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState } from '../src/cube/cube';
import { invertAlg } from '../src/cube/notation';
import { CORNER_FACELETS, bottomFace, bottomLayerHome, bottomPermutation, cornersHome, normalizeAlg2, topOriented } from '../src/cube/cube2';
import { CASES_2X2 } from '../src/algs/data2';
import { UD_ADJ, caseState, validateAlg } from '../src/algs/registry';

const bySet = (set: string) => CASES_2X2.filter((c) => c.set === set);

describe('2x2-Algorithmen', () => {
  it('haben die erwartete Anzahl je Kategorie', () => {
    expect(bySet('2OLL').length).toBe(7);
    expect(bySet('PBL').length).toBe(8);
    expect(bySet('CLL').length).toBe(42);
    expect(bySet('EG1').length).toBe(40);
    expect(bySet('EG2').length).toBe(40);
  });

  it('jeder Alg (inkl. Alternativen) löst seinen Fall', () => {
    const bad: string[] = [];
    for (const c of CASES_2X2) for (const a of c.algs) if (!validateAlg(c, a).ok) bad.push(`${c.id}: ${a}`);
    expect(bad).toEqual([]);
  });

  it('Fälle erfüllen die Bedingung ihrer Kategorie', () => {
    const bad: string[] = [];
    for (const c of CASES_2X2) {
      const s = caseState(c);
      const solvedAfterAdj = UD_ADJ.some((a) => cornersHome(applyMoves(s, a)));
      if (solvedAfterAdj) bad.push(`${c.id}: schon gelöst`);
      const ok =
        c.set === '2OLL'
          ? bottomFace(s) && !topOriented(s)
          : c.set === 'PBL'
            ? bottomFace(s) && topOriented(s)
            : c.set === 'CLL'
              ? bottomFace(s) && UD_ADJ.some((a) => bottomLayerHome(applyMoves(s, a))) && (c.group === 'Orientiert') === topOriented(s)
              : bottomFace(s) && bottomPermutation(s) === (c.set === 'EG1' ? 'adjacent' : 'diagonal');
      if (!ok) bad.push(`${c.id}: Kategorie-Bedingung verletzt`);
    }
    expect(bad).toEqual([]);
  });

  it('alle Fälle einer Kategorie sind verschieden', () => {
    for (const set of ['2OLL', 'PBL', 'CLL', 'EG1', 'EG2']) {
      const keys = new Map<string, string>();
      const dup: string[] = [];
      for (const c of bySet(set)) {
        const inv = invertAlg(normalizeAlg2(c.algs[0]));
        const variants: string[] = [];
        for (const pre of UD_ADJ)
          for (const post of set === '2OLL' ? [[]] : UD_ADJ) {
            const st = applyMoves(solvedState(), [...pre, ...inv, ...post]);
            variants.push(CORNER_FACELETS.map((i) => (set === '2OLL' ? (Math.floor(st[i] / 9) === 0 ? 1 : 0) : st[i])).join(','));
          }
        const k = variants.sort()[0];
        if (keys.has(k)) dup.push(`${c.id} = ${keys.get(k)}`);
        keys.set(k, c.id);
      }
      expect(dup, set).toEqual([]);
    }
  });
});
