import { describe, expect, it } from 'vitest';
import { applyMoves4, color4, geometry4, isSolved4, normalizeAlg4, parseAlg4, solved4 } from '../src/cube/cube4';

const OLL_PARITY = "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'";
const PLL_PARITY = '2R2 U2 2R2 Uw2 2R2 Uw2';

/** Alles ausser der oberen Schicht (y = 3) ist gelöst */
const belowTopSolved = (s: Uint8Array) => {
  for (let i = 0; i < 96; i++) if (geometry4(i).p[1] !== 3 && color4(s, i) !== Math.floor(i / 16)) return false;
  return true;
};

describe('4x4-Engine', () => {
  it('Viertelzüge haben Ordnung 4, Sexy Move Ordnung 6', () => {
    for (const m of ['R', '2R', 'Rw', 'U', 'Uw', 'x', 'M', '3Rw']) expect(isSolved4(applyMoves4(solved4(), parseAlg4(`${m} ${m} ${m} ${m}`)))).toBe(true);
    const sexy = parseAlg4("R U R' U'");
    let s = solved4();
    for (let i = 0; i < 6; i++) s = applyMoves4(s, sexy);
    expect(Array.from(s)).toEqual(Array.from(solved4()));
  });

  it('Rw = R + 2R und x = Rw + 2L′ + L′', () => {
    expect(Array.from(applyMoves4(solved4(), parseAlg4('Rw')))).toEqual(Array.from(applyMoves4(solved4(), parseAlg4('R 2R'))));
    expect(Array.from(applyMoves4(solved4(), parseAlg4('x')))).toEqual(Array.from(applyMoves4(solved4(), parseAlg4("Rw 2L' L'"))));
  });

  it('OLL-Parität kippt genau ein Kantenpaar und lässt den Rest unten intakt', () => {
    const s = applyMoves4(solved4(), normalizeAlg4(OLL_PARITY));
    expect(belowTopSolved(s)).toBe(true);
    // genau zwei Kanten-Sticker der U-Fläche sind nicht gelb (ein geflipptes Kantenpaar)
    const notYellow = [1, 2, 4, 8, 7, 11, 13, 14].filter((i) => color4(s, i) !== 0).length;
    expect(notYellow).toBe(2);
  });

  it('PLL-Parität tauscht zwei Kantenpaare und lässt alles orientiert', () => {
    const s = applyMoves4(solved4(), normalizeAlg4(PLL_PARITY));
    expect(belowTopSolved(s)).toBe(true);
    for (let i = 0; i < 16; i++) expect(color4(s, i)).toBe(0);
    expect(isSolved4(s)).toBe(false);
  });
});

describe('4x4-Paritätsfälle', () => {
  it('jeder Alg löst seinen Fall, Fälle sind verschieden', async () => {
    const { CASES_4X4 } = await import('../src/algs/data4');
    const { validateAlg, caseState } = await import('../src/algs/registry');
    expect(CASES_4X4.filter((c) => c.set === '4OLL').length).toBe(27);
    expect(CASES_4X4.filter((c) => c.set === '4PLL').length).toBe(22);
    const bad: string[] = [];
    for (const c of CASES_4X4) for (const a of c.algs) if (!validateAlg(c, a).ok) bad.push(`${c.id}: ${a}`);
    expect(bad).toEqual([]);
    // Fälle paarweise verschieden (bis auf U-Drehung davor/danach)
    const U = (n: number) => (n ? [{ base: 'U', amount: n as 1 | 2 | 3 }] : []);
    for (const set of ['4OLL', '4PLL']) {
      const seen = new Map<string, string>();
      for (const c of CASES_4X4.filter((x) => x.set === set)) {
        const s0 = caseState(c);
        const keys: string[] = [];
        for (let b = 0; b < 4; b++) {
          const t = applyMoves4(s0, U(b));
          keys.push(Array.from(t).map((h, i) => (set === '4OLL' ? (geometry4(i).p[1] === 3 && Math.floor(h / 16) === 0 ? 1 : 0) : Math.floor(h / 16))).join(''));
        }
        const k = keys.sort()[0];
        expect(seen.get(k), `${c.id} doppelt mit ${seen.get(k)}`).toBeUndefined();
        seen.set(k, c.id);
      }
    }
  });
});
