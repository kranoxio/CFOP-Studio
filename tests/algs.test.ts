import { describe, expect, it } from 'vitest';
import { applyMoves, centerColor, colorOf, solvedState, type Move, type State } from '../src/cube/cube';
import { SLOTS, crossSolved, f2lSolved, isSolved, ollSolved, slotSolved } from '../src/cube/analysis';
import { invertAlg } from '../src/cube/notation';
import { F2L_CASES, OLL_CASES, PLL_CASES } from '../src/algs/data';
import { normalizeAlg, validateAlg } from '../src/algs/registry';

const U = (n: number): Move[] => (n ? [{ base: 'U', amount: n as 1 | 2 | 3 }] : []);
const caseOf = (alg: string): State => applyMoves(solvedState(), invertAlg(normalizeAlg(alg)));

function centersHome(s: State) {
  for (let f = 0; f < 6; f++) if (centerColor(s, f) !== f) return false;
  return true;
}

describe('F2L', () => {
  it('hat 41 Fälle', () => expect(F2L_CASES.length).toBe(41));
  for (const c of F2L_CASES) {
    it(`F2L ${c.key}: Algs erhalten Kreuz & andere Slots und lösen denselben Fall`, () => {
      const start = caseOf(c.algs[0]);
      expect(centersHome(start)).toBe(true);
      expect(crossSolved(start)).toBe(true);
      expect(slotSolved(start, SLOTS[0])).toBe(false);
      for (const s of SLOTS.slice(1)) expect(slotSolved(start, s)).toBe(true);
      for (const alg of c.algs) expect(validateAlg(c, alg).ok, `${alg}`).toBe(true);
    });
  }
  it('alle Fälle sind verschieden', () => {
    const keys = new Set<string>();
    for (const c of F2L_CASES) {
      const s = caseOf(c.algs[0]);
      const pieceKeys: string[] = [];
      for (let a = 0; a < 4; a++) {
        const t = applyMoves(s, U(a));
        const corner = t.indexOf(SLOTS[0].cornerToken);
        const edge = t.indexOf(SLOTS[0].edgeToken);
        pieceKeys.push(`${corner}-${edge}`);
      }
      keys.add(pieceKeys.sort()[0]);
    }
    expect(keys.size).toBe(41);
  });
});

describe('OLL', () => {
  it('hat 57 Fälle', () => expect(OLL_CASES.length).toBe(57));
  const keys = new Map<string, string>();
  for (const c of OLL_CASES) {
    it(`OLL ${c.key}`, () => {
      const start = caseOf(c.algs[0]);
      expect(centersHome(start)).toBe(true);
      expect(f2lSolved(start)).toBe(true);
      expect(ollSolved(start)).toBe(false);
      for (const alg of c.algs) expect(validateAlg(c, alg).ok, `${alg}`).toBe(true);
      // Orientierungsmuster: welche LL-Sticker sind gelb
      const patterns: string[] = [];
      for (let a = 0; a < 4; a++) {
        const t = applyMoves(start, U(a));
        patterns.push(
          Array.from({ length: 54 }, (_, i) => i)
            .filter((i) => i < 9 || [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47].includes(i))
            .map((i) => (colorOf(t, i) === 0 ? '1' : '0'))
            .join(''),
        );
      }
      const k = patterns.sort()[0];
      expect(keys.has(k), `doppelt mit ${keys.get(k)}`).toBe(false);
      keys.set(k, c.key);
    });
  }
});

describe('PLL', () => {
  it('hat 21 Fälle', () => expect(PLL_CASES.length).toBe(21));
  const keys = new Map<string, string>();
  for (const c of PLL_CASES) {
    it(`PLL ${c.key}`, () => {
      const start = caseOf(c.algs[0]);
      expect(centersHome(start)).toBe(true);
      expect(ollSolved(start)).toBe(true);
      expect(isSolved(start)).toBe(false);
      for (const alg of c.algs) expect(validateAlg(c, alg).ok, `${alg}`).toBe(true);
      // Fall-Schlüssel: kleinster Zustand über U-Drehungen vor und nach dem Setup
      const ks: string[] = [];
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++) {
          const st = applyMoves(solvedState(), [...U(a), ...invertAlg(normalizeAlg(c.algs[0])), ...U(b)]);
          ks.push(Array.from(st).join(','));
        }
      const k = ks.sort()[0];
      expect(keys.has(k), `doppelt mit ${keys.get(k)}`).toBe(false);
      keys.set(k, c.key);
    });
  }
});
