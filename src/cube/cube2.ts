import { applyMoves, colorOf, type Move, type State } from './cube';
import { netRotationFix, parseAlg } from './notation';

/**
 * 2x2-Unterstützung: Ein 2x2 verhält sich wie die Ecken eines 3x3. Wir verwenden daher
 * dasselbe Facelet-Modell und betrachten nur die 24 Eck-Sticker.
 */

export const CORNER_FACELETS: number[] = Array.from({ length: 54 }, (_, i) => i).filter((i) => [0, 2, 6, 8].includes(i % 9));
export const U_CORNERS = [0, 2, 6, 8];
export const D_CORNERS = [27, 29, 33, 35];
const D_LAYER_FACELETS = CORNER_FACELETS.filter((i) => {
  const f = Math.floor(i / 9);
  const k = i % 9;
  return f === 3 || (f !== 0 && f !== 3 && k >= 6);
});

/** Alle Ecken exakt an ihrem Platz */
export function cornersHome(s: State): boolean {
  for (const i of CORNER_FACELETS) if (s[i] !== i) return false;
  return true;
}

/** Oben alle Ecken gelb, unten alle weiss */
export const topOriented = (s: State) => U_CORNERS.every((i) => colorOf(s, i) === 0);
export const bottomFace = (s: State) => D_CORNERS.every((i) => colorOf(s, i) === 3);

/** Untere Ebene exakt gelöst (Ecken an ihrem Platz) */
export const bottomLayerHome = (s: State) => D_LAYER_FACELETS.every((i) => s[i] === i);

const WIDE_TO_FACE: Record<string, string> = { r: 'R', l: 'L', u: 'U', d: 'D', f: 'F', b: 'B' };

/**
 * 2x2-Normalisierung: Wide Moves wirken auf die Ecken wie Flächenzüge, Slices gar nicht.
 * Danach wird eine eventuelle Netto-Rotation ausgeglichen.
 */
export function toCornerMoves(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    if ('MES'.includes(m.base)) continue;
    out.push({ base: WIDE_TO_FACE[m.base] ?? m.base, amount: m.amount });
  }
  return [...out, ...netRotationFix(out)];
}

export const normalizeAlg2 = (text: string) => toCornerMoves(parseAlg(text));

/** WCA-artiger 2x2-Scramble mit R, U, F (die Ecke hinten-links-unten bleibt fix). */
export function randomScramble2(length = 11, rng: () => number = Math.random): Move[] {
  const faces = ['R', 'U', 'F'];
  const out: Move[] = [];
  while (out.length < length) {
    const base = faces[Math.floor(rng() * 3)];
    if (out.length && out[out.length - 1].base === base) continue;
    out.push({ base, amount: (1 + Math.floor(rng() * 3)) as 1 | 2 | 3 });
  }
  return out;
}

/** Zustand eines 2x2 nach Zügen (Hilfsfunktion für Tests). */
export const apply2 = (s: State, text: string) => applyMoves(s, normalizeAlg2(text));

const D_ROT: Move[][] = [[], [{ base: 'D', amount: 1 }], [{ base: 'D', amount: 2 }], [{ base: 'D', amount: 3 }]];
const DIAGONAL = [
  [27, 35],
  [29, 33],
];

/**
 * Permutation der unteren Ebene (bei weisser Unterseite), bis auf D-Drehung:
 * gelöst, benachbarter Tausch (→ EG-1) oder diagonaler Tausch (→ EG-2).
 */
export function bottomPermutation(s: State): 'solved' | 'adjacent' | 'diagonal' {
  let best = -1;
  let wrong: number[] = [];
  for (const d of D_ROT) {
    const t = applyMoves(s, d);
    const off = D_CORNERS.filter((i) => t[i] !== i);
    if (4 - off.length > best) {
      best = 4 - off.length;
      wrong = off;
    }
  }
  if (best === 4) return 'solved';
  return DIAGONAL.some(([a, b]) => wrong.includes(a) && wrong.includes(b)) ? 'diagonal' : 'adjacent';
}
