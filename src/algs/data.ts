import { CASES_2X2 } from './data2';
import { ADVANCED_CASES } from './advanced';

export type AlgSet = 'F2L' | 'OLL' | 'PLL' | 'COLL' | 'ZBLL' | 'WV' | 'VLS' | '2OLL' | 'PBL' | 'CLL' | 'EG1' | 'EG2';
export type Puzzle = 2 | 3;

export interface AlgCase {
  /** Eindeutige ID, z.B. "OLL-27" */
  id: string;
  set: AlgSet;
  /** Nummer bzw. Name innerhalb des Sets ("27", "Ua") */
  key: string;
  /** Spitzname */
  name?: string;
  group: string;
  /** Erster Alg = Standard. Weitere = Alternativen. */
  algs: string[];
  /** Wahrscheinlichkeit als Bruch-Nenner (1/x) bzw. relative Häufigkeit */
  prob?: string;
  /** 2 = 2x2-Würfel, sonst 3x3 */
  puzzle?: Puzzle;
}

const f2l = (n: number, group: string, algs: string[]): AlgCase => ({
  id: `F2L-${n}`,
  set: 'F2L',
  key: String(n),
  group,
  algs,
});

/** F2L-Fälle für den Slot vorne rechts (Standard-Nummerierung 1–41). */
export const F2L_CASES: AlgCase[] = [
  f2l(1, 'Freie Paare', ["U R U' R'", "R' F R F'"]),
  f2l(2, 'Freie Paare', ["F R' F' R", "y' U' R' U R", "U' F' U F"]),
  f2l(3, 'Freie Paare', ["F' U' F", "y' R' U' R"]),
  f2l(4, 'Freie Paare', ["R U R'", "y' f R f'"]),
  f2l(5, 'Getrennte Paare', ["U' R U R' U2 R U' R'", "F2 L' U' L U F2"]),
  f2l(6, 'Getrennte Paare', ["U' r U' R' U R U r'", "y' U R' U' R U2 R' U R"]),
  f2l(7, 'Getrennte Paare', ["U' R U2 R' U' R U2 R'", "U' R U2 R' U2 R U' R'"]),
  f2l(8, 'Getrennte Paare', ["r' U2 R2 U R2 U r", "y' U R' U2 R U2 R' U R"]),
  f2l(9, 'Getrennte Paare', ["U' R U' R' U F' U' F", "F R U R' U' F' R U' R'"]),
  f2l(10, 'Getrennte Paare', ["U' R U R' U R U R'", "U2 R U' R' U' R U R'"]),
  f2l(11, 'Verbundene Paare', ["U' R U2 R' U F' U' F", "y' R U2 R2 U' R2 U' R'"]),
  f2l(12, 'Verbundene Paare', ["R U' R' U R U' R' U2 R U' R'", "R' U2 R2 U R2 U R"]),
  f2l(13, 'Verbundene Paare', ["y' U R' U R U' R' U' R", "M' U' R U R' U2 R U' r'"]),
  f2l(14, 'Verbundene Paare', ["U' R U' R' U R U R'", "R U2 R' U2 R U R' U2 R U' R'"]),
  f2l(15, 'Verbundene Paare', ["M U r U' r' U' M'", "R U R' U2 R U' R' U R U' R'"]),
  f2l(16, 'Verbundene Paare', ["R U' R' U2 F' U' F", "R U' R' U2 y' R' U' R"]),
  f2l(17, 'Verbundene Paare', ["R U2 R' U' R U R'", "y2 L U2 L' U' L U L'"]),
  f2l(18, 'Verbundene Paare', ["y' R' U2 R U R' U' R", "F' U2 F U F' U' F"]),
  f2l(19, 'Getrennte Paare', ["U R U2 R' U R U' R'", "U R U2 R2 F R F'"]),
  f2l(20, 'Getrennte Paare', ["y' U' R' U2 R U' R' U R", "U' R U' R2 F R F' R U' R'"]),
  f2l(21, 'Getrennte Paare', ["U2 R U R' U R U' R'", "R U' R' U2 R U R'"]),
  f2l(22, 'Getrennte Paare', ["r U' r' U2 r U r'", "F' L' U2 L F"]),
  f2l(23, 'Verbundene Paare', ["U R U' R' U' R U' R' U R U' R'", "R U R' U2 R U R' U' R U R'"]),
  f2l(24, 'Verbundene Paare', ["F U R U' R' F' R U' R'", "U' R U R2 F R F' R U' R'"]),
  f2l(25, 'Ecke im Slot', ["U' R' F R F' R U R'", "U' F' U F U R U' R'"]),
  f2l(26, 'Ecke im Slot', ["U R U' R' F R' F' R", "R S' R' U R S R'"]),
  f2l(27, 'Ecke im Slot', ["R U' R' U R U' R'", "F' U' F U2 R U' R'"]),
  f2l(28, 'Ecke im Slot', ["R U R' U' F R' F' R", "F' U F U' F' U F"]),
  f2l(29, 'Ecke im Slot', ["R' F R F' U R U' R'", "y' R' U' R U R' U' R"]),
  f2l(30, 'Ecke im Slot', ["R U R' U' R U R'", "U' R U2 R' U2 R U R'"]),
  f2l(31, 'Kante im Slot', ["U' R' F R F' R U' R'", "F' U F R U2 R'"]),
  f2l(32, 'Kante im Slot', ["U R U' R' U R U' R' U R U' R'", "R2 U R2 U R2 U2 R2"]),
  f2l(33, 'Kante im Slot', ["U' R U' R' U2 R U' R'", "R U R' U' R U' R' U R U' R'"]),
  f2l(34, 'Kante im Slot', ["U R U R' U2 R U R'", "U' R U2 R' U R U R'"]),
  f2l(35, 'Kante im Slot', ["U' R U R' U F' U' F", "U2 R U R' F R' F' R"]),
  f2l(36, 'Kante im Slot', ["U F' U' F U' R U R'", "U2 R' F R F' U2 R U R'"]),
  f2l(37, 'Beide im Slot', ["R2 U2 F R2 F' U2 R' U R'", "R U2 R' U R U2 R' U F' U' F"]),
  f2l(38, 'Beide im Slot', ["R U' R' U' R U R' U2 R U' R'", "R U R' U' R U2 R' U' R U R'"]),
  f2l(39, 'Beide im Slot', ["R U' R' U R U2 R' U R U' R'", "R U2 R U R' U R U2 R2"]),
  f2l(40, 'Beide im Slot', ["r U' r' U2 r U r' R U R'", "F' L' U2 L F R U R'"]),
  f2l(41, 'Beide im Slot', ["R U' R' r U' r' U2 r U r'", "R U' R' F' L' U2 L F"]),
];

const oll = (n: number, group: string, algs: string[], name?: string, prob = '1/54'): AlgCase => ({
  id: `OLL-${n}`,
  set: 'OLL',
  key: String(n),
  group,
  algs,
  name,
  prob,
});

export const OLL_CASES: AlgCase[] = [
  oll(1, 'Punkt', ["R U2 R2 F R F' U2 R' F R F'"], 'Runway', '1/108'),
  oll(2, 'Punkt', ["r U r' U2 r U2 R' U2 R U' r'", "F R U R' U' F' f R U R' U' f'"], 'Zamboni'),
  oll(3, 'Punkt', ["r' R2 U R' U r U2 r' U M'", "f R U R' U' f' U' F R U R' U' F'"], 'Anti-Mouse'),
  oll(4, 'Punkt', ["M U' r U2 r' U' R U' R' M'", "f R U R' U' f' U F R U R' U' F'"], 'Mouse'),
  oll(5, 'Quadrat', ["l' U2 L U L' U l", "r' U2 R U R' U r"], 'Kanzel links'),
  oll(6, 'Quadrat', ["r U2 R' U' R U' r'"], 'Kanzel rechts'),
  oll(7, 'Kleiner Blitz', ["r U R' U R U2 r'"], 'Lightning'),
  oll(8, 'Kleiner Blitz', ["l' U' L U' L' U2 l", "R U2 R' U2 R' F R F'"], 'Reverse Lightning'),
  oll(9, 'Fisch', ["R U R' U' R' F R2 U R' U' F'"], 'Kite'),
  oll(10, 'Fisch', ["R U R' U R' F R F' R U2 R'"], 'Anti-Kite'),
  oll(11, 'Kleiner Blitz', ["r U R' U R' F R F' R U2 r'"], 'Downstairs'),
  oll(12, 'Kleiner Blitz', ["M' R' U' R U' R' U2 R U' R r'"], 'Upstairs'),
  oll(13, 'Springer', ["F U R U' R2 F' R U R U' R'"], 'Gun'),
  oll(14, 'Springer', ["R' F R U R' F' R F U' F'"], 'Anti-Gun'),
  oll(15, 'Springer', ["l' U' l L' U' L U l' U l"], 'Squeegee'),
  oll(16, 'Springer', ["r U r' R U R' U' r U' r'"], 'Anti-Squeegee'),
  oll(17, 'Punkt', ["F R' F' R2 r' U R U' R' U' M'", "R U R' U R' F R F' U2 R' F R F'"], 'Slash'),
  oll(18, 'Punkt', ["r U R' U R U2 r2 U' R U' R' U2 r"], 'Crown'),
  oll(19, 'Punkt', ["r' R U R U R' U' M' R' F R F'"], 'Bunny'),
  oll(20, 'Punkt', ["r U R' U' M2 U R U' R' U' M'"], 'Checkers', '1/216'),
  oll(21, 'Kreuz', ["R U2 R' U' R U R' U' R U' R'", "R U R' U R U' R' U R U2 R'"], 'H / Double Sune', '1/108'),
  oll(22, 'Kreuz', ["R U2 R2 U' R2 U' R2 U2 R"], 'Pi'),
  oll(23, 'Kreuz', ["R2 D' R U2 R' D R U2 R", "R2 D R' U2 R D' R' U2 R'"], 'Headlights'),
  oll(24, 'Kreuz', ["r U R' U' r' F R F'"], 'Chameleon'),
  oll(25, 'Kreuz', ["F' r U R' U' r' F R"], 'Bowtie'),
  oll(26, 'Kreuz', ["R U2 R' U' R U' R'", "R' U' R U' R' U2 R"], 'Anti-Sune'),
  oll(27, 'Kreuz', ["R U R' U R U2 R'"], 'Sune'),
  oll(28, 'Ecken orientiert', ["r U R' U' r' R U R U' R'", "M' U M U2 M' U M"], 'Stealth'),
  oll(29, 'Ungewöhnlich', ["R U R' U' R U' R' F' U' F R U R'"], 'Spotted Chameleon'),
  oll(30, 'Ungewöhnlich', ["F R' F R2 U' R' U' R U R' F2", "F U R U2 R' U' R U2 R' U' F'"], 'Anti-Spotted Chameleon'),
  oll(31, 'P-Form', ["R' U' F U R U' R' F' R"], 'Couch'),
  oll(32, 'P-Form', ["L U F' U' L' U L F L'", "S R U R' U' R' F R f'"], 'Anti-Couch'),
  oll(33, 'T-Form', ["R U R' U' R' F R F'"], 'Key'),
  oll(34, 'C-Form', ["R U R2 U' R' F R U R U' F'"], 'City'),
  oll(35, 'Fisch', ["R U2 R2 F R F' R U2 R'"], 'Fish Salad'),
  oll(36, 'W-Form', ["L' U' L U' L' U L U L F' L' F"], 'Wario'),
  oll(37, 'Fisch', ["F R' F' R U R U' R'", "F R U' R' U' R U R' F'"], 'Mounted Fish'),
  oll(38, 'W-Form', ["R U R' U R U' R' U' R' F R F'"], 'Mario'),
  oll(39, 'Grosser Blitz', ["L F' L' U' L U F U' L'"], 'Big Lightning'),
  oll(40, 'Grosser Blitz', ["R' F R U R' U' F' U R"], 'Anti-Big Lightning'),
  oll(41, 'Ungewöhnlich', ["R U R' U R U2 R' F R U R' U' F'"], 'Dalmatian'),
  oll(42, 'Ungewöhnlich', ["R' U' R U' R' U2 R F R U R' U' F'"], 'Anti-Dalmatian'),
  oll(43, 'P-Form', ["F' U' L' U L F", "R' U' F R' F' R U R"], 'Anti-P'),
  oll(44, 'P-Form', ["F U R U' R' F'", "f R U R' U' f'"], 'P'),
  oll(45, 'T-Form', ["F R U R' U' F'"], 'T'),
  oll(46, 'C-Form', ["R' U' R' F R F' U R"], 'Seein’ Headlights'),
  oll(47, 'Kleines L', ["R' U' R' F R F' R' F R F' U R", "F' L' U' L U L' U' L U F"], 'Anti-Breakneck'),
  oll(48, 'Kleines L', ["F R U R' U' R U R' U' F'"], 'Breakneck'),
  oll(49, 'Kleines L', ["r U' r2 U r2 U r2 U' r"], 'Right Back Squeezy'),
  oll(50, 'Kleines L', ["r' U r2 U' r2 U' r2 U r'"], 'Right Front Squeezy'),
  oll(51, 'I-Form', ["F U R U' R' U R U' R' F'", "f R U R' U' R U R' U' f'"], 'Bottlecap'),
  oll(52, 'I-Form', ["R U R' U R U' B U' B' R'", "R' F' U' F U' R U R' U R"], 'Rice Cooker'),
  oll(53, 'Kleines L', ["l' U2 L U L' U' L U L' U l", "r' U2 R U R' U' R U R' U r"], 'Frying Pan'),
  oll(54, 'Kleines L', ["r U2 R' U' R U R' U' R U' r'"], 'Anti-Frying Pan'),
  oll(55, 'I-Form', ["R' F R U R U' R2 F' R2 U' R' U R U R'", "R U2 R2 U' R U' R' U2 F R F'"], 'Highway', '1/108'),
  oll(56, 'I-Form', ["r' U' r U' R' U R U' R' U R r' U r", "r U r' U R U' R' U R U' R' r U' r'"], 'Streetlights', '1/108'),
  oll(57, 'Ecken orientiert', ["R U R' U' M' U R U' r'"], 'Mummy / H', '1/108'),
];

const pll = (key: string, group: string, algs: string[], name: string, prob: string): AlgCase => ({
  id: `PLL-${key}`,
  set: 'PLL',
  key,
  group,
  algs,
  name,
  prob,
});

export const PLL_CASES: AlgCase[] = [
  pll('Ua', 'Nur Kanten', ["M2 U M U2 M' U M2", "R U' R U R U R U' R' U' R2"], 'Ua-Perm', '1/18'),
  pll('Ub', 'Nur Kanten', ["M2 U' M U2 M' U' M2", "R2 U R U R' U' R' U' R' U R'"], 'Ub-Perm', '1/18'),
  pll('H', 'Nur Kanten', ["M2 U M2 U2 M2 U M2"], 'H-Perm', '1/72'),
  pll('Z', 'Nur Kanten', ["M' U M2 U M2 U M' U2 M2", "M2 U' M2 U' M' U2 M2 U2 M'"], 'Z-Perm', '1/36'),
  pll('Aa', 'Nur Ecken', ["x L2 D2 L' U' L D2 L' U L'", "x R' U R' D2 R U' R' D2 R2"], 'Aa-Perm', '1/18'),
  pll('Ab', 'Nur Ecken', ["x' L2 D2 L U L' D2 L U' L", "x R2 D2 R U R' D2 R U' R"], 'Ab-Perm', '1/18'),
  pll('E', 'Nur Ecken', ["x' L' U L D' L' U' L D L' U' L D' L' U L D", "x' R U' R' D R U R' D' R U R' D R U' R' D'"], 'E-Perm', '1/36'),
  pll('T', 'Benachbarter Tausch', ["R U R' U' R' F R2 U' R' U' R U R' F'"], 'T-Perm', '1/18'),
  pll('F', 'Benachbarter Tausch', ["R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"], 'F-Perm', '1/18'),
  pll('Ja', 'Benachbarter Tausch', ["x R2 F R F' R U2 r' U r U2", "L' U' L F L' U' L U L F' L2 U L"], 'Ja-Perm', '1/18'),
  pll('Jb', 'Benachbarter Tausch', ["R U R' F' R U R' U' R' F R2 U' R'"], 'Jb-Perm', '1/18'),
  pll('Ra', 'Benachbarter Tausch', ["R U' R' U' R U R D R' U' R D' R' U2 R'", "R U R' F' R U2 R' U2 R' F R U R U2 R'"], 'Ra-Perm', '1/18'),
  pll('Rb', 'Benachbarter Tausch', ["R2 F R U R U' R' F' R U2 R' U2 R", "R' U2 R' D' R U' R' D R U R U' R' U' R"], 'Rb-Perm', '1/18'),
  pll('V', 'Diagonaler Tausch', ["R' U R' d' R' F' R2 U' R' U R' F R F", "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2"], 'V-Perm', '1/18'),
  pll('Y', 'Diagonaler Tausch', ["F R U' R' U' R U R' F' R U R' U' R' F R F'"], 'Y-Perm', '1/18'),
  pll('Na', 'Diagonaler Tausch', ["R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"], 'Na-Perm', '1/72'),
  pll('Nb', 'Diagonaler Tausch', ["R' U R U' R' F' U' F R U R' F R' F' R U' R"], 'Nb-Perm', '1/72'),
  pll('Ga', 'G-Perms', ["R2 U R' U R' U' R U' R2 U' D R' U R D'"], 'Ga-Perm', '1/18'),
  pll('Gb', 'G-Perms', ["R' U' R U D' R2 U R' U R U' R U' R2 D"], 'Gb-Perm', '1/18'),
  pll('Gc', 'G-Perms', ["R2 U' R U' R U R' U R2 U D' R U' R' D"], 'Gc-Perm', '1/18'),
  pll('Gd', 'G-Perms', ["R U R' U' D R2 U' R U' R' U R' U R2 D'"], 'Gd-Perm', '1/18'),
];

export const ALL_CASES: AlgCase[] = [...F2L_CASES, ...OLL_CASES, ...PLL_CASES, ...ADVANCED_CASES, ...CASES_2X2];

export const SETS_BY_PUZZLE: Record<Puzzle, AlgSet[]> = {
  3: ['F2L', 'OLL', 'PLL', 'COLL', 'WV', 'VLS', 'ZBLL'],
  2: ['2OLL', 'PBL', 'CLL', 'EG1', 'EG2'],
};

export const SET_LABEL: Record<AlgSet, string> = {
  F2L: 'F2L',
  OLL: 'OLL',
  PLL: 'PLL',
  COLL: 'COLL',
  ZBLL: 'ZBLL',
  WV: 'WV',
  VLS: 'VLS',
  '2OLL': 'OLL',
  PBL: 'PBL',
  CLL: 'CLL',
  EG1: 'EG-1',
  EG2: 'EG-2',
};

export const puzzleOfSet = (set: AlgSet): Puzzle => (SETS_BY_PUZZLE[2].includes(set) ? 2 : 3);
export const caseTitle = (c: AlgCase) => `${SET_LABEL[c.set]} ${c.key}`;
export const CASE_BY_ID = new Map(ALL_CASES.map((c) => [c.id, c]));
