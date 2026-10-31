import type { AlgCase, AlgSet } from './data';

const c4 = (set: AlgSet, key: string, group: string, algs: string[]): AlgCase => ({
  id: `${set}-${key}`,
  set,
  key,
  group,
  algs,
  puzzle: 4,
});

/** Paritäts-Algorithmen für den 4x4 */
export const OLL_PARITY = "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'";
export const PLL_PARITY = '2R2 U2 2R2 Uw2 2R2 Uw2';

/**
 * 4x4 letzte Ebene mit Parität:
 * - OLL (27): Fälle mit OLL-Parität (ein Kantenpaar gekippt) – Parität + passender OLL-Trick
 * - PLL (22): Fälle mit PLL-Parität (zwei Kantenpaare getauscht) – Parität + passender PLL
 */
export const CASES_4X4: AlgCase[] = [
  c4("4OLL", "Solved", "4 Ecken", ["R U2 R' U' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' F R' F' R","y' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U' F U R U' R' F'"]),
  c4("4OLL", "U (F)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'"]),
  c4("4OLL", "U (R)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U' R U R' U R U2 R'"]),
  c4("4OLL", "U (L)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R U2 R' U' R U' R'"]),
  c4("4OLL", "U (B)", "2 Ecken", ["M Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' M'"]),
  c4("4OLL", "T (F)", "2 Ecken", ["R U R' U' R Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R' U R U' R'"]),
  c4("4OLL", "T (R)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R U R' U' R' F R F'","y2 F' L' U L U L' U' L F Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'"]),
  c4("4OLL", "T (L)", "2 Ecken", ["F R U' R' U' R U R' F' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'","R2 B2 R2 Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R2 B2 R2"]),
  c4("4OLL", "T (B)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U R U2 R2 U' R2 U' R2 U2 R"]),
  c4("4OLL", "L (FR)", "2 Ecken", ["R' U' R Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R' U R"]),
  c4("4OLL", "L (FL)", "2 Ecken", ["L U L' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' L U' L'"]),
  c4("4OLL", "L (BR)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U R' U2 R U R' U R"]),
  c4("4OLL", "L (BL)", "2 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R' U' R U' R' U2 R"]),
  c4("4OLL", "Sune (FR)", "1 Ecke", ["M' U R U' 3Rw' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U R U2 R'","y2 Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U2 F R U R' U' F'"]),
  c4("4OLL", "Sune (FL)", "1 Ecke", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R U R' U R U2 R'"]),
  c4("4OLL", "Sune (BR)", "1 Ecke", ["L F' L' F Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' L' U L"]),
  c4("4OLL", "Sune (BL)", "1 Ecke", ["F' L' U' L U F Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'"]),
  c4("4OLL", "Antisune (FR)", "1 Ecke", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U' R U2 R' U' R U' R'"]),
  c4("4OLL", "Antisune (FL)", "1 Ecke", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R U2 R2 U' R2 U' R2 U2 R","y2 Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' F R U R' U' F'"]),
  c4("4OLL", "Antisune (BR)", "1 Ecke", ["F R U R' U' F' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'"]),
  c4("4OLL", "Antisune (BL)", "1 Ecke", ["R' F R F' Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R U' R'"]),
  c4("4OLL", "H (FB)", "0 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R2 D' R U2 R' D R U2 R","y2 Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U R' U' R' F R F' U R"]),
  c4("4OLL", "H (LR)", "0 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R U R' U R U' R' U R U2 R'"]),
  c4("4OLL", "Pi (F)", "0 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U' R U2 R2 U' R2 U' R2 U2 R"]),
  c4("4OLL", "Pi (R)", "0 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U R' U' R U' R' U2 R"]),
  c4("4OLL", "Pi (L)", "0 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' R' U2 R U R' U R"]),
  c4("4OLL", "Pi (B)", "0 Ecken", ["Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw' U' 3Rw U R' U' 3Rw' F R F'"]),
  c4("4PLL", "Pure-E", "Nur Kanten", ["2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Adj-E", "Nur Kanten", ["R U R' U' 2R2 U2 2R2 Uw2 2R2 Uw2 U' R U' R'"]),
  c4("4PLL", "O+", "Nur Kanten", ["M' U' M2 U' M2 U' M' U2 M2 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "O-", "Nur Kanten", ["M' U' M2 U' M2 U' M' U2 M2 U' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "W", "Nur Kanten", ["R U' R U R U R U' R' U' R2 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Ba", "Benachbarter Tausch", ["2R2 U2 2R2 Uw2 2R2 Uw2 U R U R' F' R U R' U' R' F R2 U' R'"]),
  c4("4PLL", "Bb", "Benachbarter Tausch", ["R U R' U' R' F R2 U' R' 2R2 U2 2R2 Uw2 2R2 Uw2 U R U R' F'"]),
  c4("4PLL", "Ca", "Benachbarter Tausch", ["2R2 U2 2R2 Uw2 2R2 Uw2 U R' U2 R U2 R' F R U R' U' R' F' R2"]),
  c4("4PLL", "Cb", "Benachbarter Tausch", ["2R2 U2 2R2 Uw2 2R2 Uw2 R U R' F' R U2 R' U2 R' F R U R U2 R'"]),
  c4("4PLL", "Da", "Benachbarter Tausch", ["R' U L' U2 R U' R' U2 R L U' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Db", "Benachbarter Tausch", ["R U R' F' R U R' U' R' F R2 U' R' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Pa", "Benachbarter Tausch", ["R U R' F' R U R' U' R' F R2 U' R' U' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Pb", "Benachbarter Tausch", ["2R2 U2 2R2 Uw2 2R2 Uw2 R U R' F' R U R' U' R' F R2 U' R'"]),
  c4("4PLL", "Ka", "Benachbarter Tausch", ["2R2 U2 2R2 Uw2 2R2 Uw2 x R2 D2 R U R' D2 R U' R"]),
  c4("4PLL", "Kb", "Benachbarter Tausch", ["2R2 U2 2R2 Uw2 2R2 Uw2 U x R' U R' D2 R U' R' D2 R2"]),
  c4("4PLL", "Q", "Diagonaler Tausch", ["x' R U' R' D R U R' D' R U R' D R U' R' D' x U 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Sa", "Diagonaler Tausch", ["F R U' R' U' R U R' F' R U R' U' R' F R F' U' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Sb", "Diagonaler Tausch", ["F R U' R' U' R U R' F' R U R' U' R' F R F' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "X", "Diagonaler Tausch", ["x' R U' R' D R U R' D' R U R' D R U' R' D' x 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "M", "Benachbarter Tausch", ["R U R' U' R' F R2 U' R' U' R U R' F' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Adj-C", "Benachbarter Tausch", ["R U R' U' R' F R2 U' R' U' R U R' F' U' 2R2 U2 2R2 Uw2 2R2 Uw2"]),
  c4("4PLL", "Diag-C", "Diagonaler Tausch", ["F R U' R' U' R U R' F' U' 2R2 U2 2R2 Uw2 2R2 Uw2 U' R U R' U' R' F R F'"]),
];
