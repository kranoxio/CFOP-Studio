import { applyMoves, solvedState, type Move, type State } from '../cube/cube';
import { f2lSolved, ollSolved, isSolved, SLOTS, slotSolved, crossSolved, llCornersSolved } from '../cube/analysis';
import { formatAlg, invertAlg, netRotationFix, parseAlg, removeRotations, tryParseAlg } from '../cube/notation';
import { ALL_CASES, CASE_BY_ID, type AlgCase } from './data';
import { bottomFace, cornersHome, normalizeAlg2, toCornerMoves, topOriented } from '../cube/cube2';
import { applyMoves4, color4, geometry4, isSolved4, normalizeAlg4, parseAlg4, rotationToHome4, solved4 } from '../cube/cube4';

const tryParse4 = (t: string) => {
  try {
    return parseAlg4(t);
  } catch {
    return null;
  }
};
import { OH_ALGS } from './oh';
import { storage } from '../util/storage';

/**
 * Ein Alg ist "sauber", wenn der Würfel danach wieder gleich orientiert ist.
 * Fehlt eine Schlussrotation (z.B. bei x-Algs), wird sie automatisch ergänzt.
 */
export function normalizeAlg(text: string): Move[] {
  const moves = parseAlg(text);
  return [...moves, ...netRotationFix(moves)];
}

/** Alg ohne Rotationen (für Solver und Konjugationen). */
export function rotationFree(text: string): Move[] {
  return removeRotations(normalizeAlg(text));
}

const CUSTOM_KEY = 'customAlgs';
/** Eigene Algs: Schlüssel = Fall-ID (2H) bzw. Fall-ID + "@oh" (einhändig) */
let custom: Record<string, string> = storage.get(CUSTOM_KEY, {});

export type AlgStyle = '2h' | 'oh';
let style: AlgStyle = storage.get<{ algStyle?: AlgStyle }>('settings', {}).algStyle ?? '2h';

export function setAlgStyle(s: AlgStyle) {
  style = s;
  cacheVersion++;
}
export const algStyle = () => style;

const customKey = (id: string) => (style === 'oh' ? `${id}@oh` : id);

/** Für den Solver-Worker (kein localStorage dort): eigene Algs und Stil übernehmen. */
export function setCustomAlgs(map: Record<string, string>, s: AlgStyle = style) {
  custom = { ...map };
  style = s;
  cacheVersion++;
}

/** Standard-Algs des Falls im aktuellen Stil (OH fällt auf 2H zurück, z.B. bei F2L). */
export function styleAlgs(c: AlgCase): string[] {
  return style === 'oh' && OH_ALGS[c.id] ? OH_ALGS[c.id] : c.algs;
}

export function getCustomAlgs(): Record<string, string> {
  return { ...custom };
}

export function getCustomAlg(id: string): string | undefined {
  return custom[customKey(id)];
}

export function setCustomAlg(id: string, alg: string | null) {
  if (alg) custom[customKey(id)] = alg;
  else delete custom[customKey(id)];
  storage.set(CUSTOM_KEY, custom);
  cacheVersion++;
}

let cacheVersion = 0;
export const algsVersion = () => cacheVersion;

/** Der Alg, den der Nutzer für diesen Fall verwendet (eigener Alg oder Standard). */
export function preferredAlg(c: AlgCase): string {
  return custom[customKey(c.id)] ?? styleAlgs(c)[0];
}

export function getCase(id: string): AlgCase {
  const c = CASE_BY_ID.get(id);
  if (!c) throw new Error(`Unbekannter Fall ${id}`);
  return c;
}

/** Züge eines Algs für diesen Fall (2x2: nur Eckenwirkung, ohne Slices). */
export function algMoves(c: AlgCase, text: string): Move[] {
  return c.puzzle === 2 ? normalizeAlg2(text) : c.puzzle === 4 ? normalizeAlg4(text) : normalizeAlg(text);
}

/** Zustand, den ein Fall vor Ausführung des Algs darstellt. */
export function caseState(c: AlgCase, alg = preferredAlg(c)): State {
  if (c.puzzle === 4) return applyMoves4(solved4(), invertAlg(algMoves(c, alg)));
  return applyMoves(solvedState(), invertAlg(algMoves(c, alg)));
}

/** 4x4: alles ausser der oberen Schicht gelöst und oben gelb (OLL) bzw. alles gelöst (PLL) */
function validate4(c: AlgCase, moves: Move[]): ValidationResult {
  const start = caseState(c, c.algs[0]);
  const fixed = [...moves, ...rotationToHome4(applyMoves4(solved4(), moves))];
  const U4: Move[][] = [[], [{ base: 'U', amount: 1 }], [{ base: 'U', amount: 2 }], [{ base: 'U', amount: 3 }]];
  for (const pre of U4) {
    const mid = applyMoves4(start, [...pre, ...fixed]);
    for (const post of U4) {
      const end = applyMoves4(mid, post);
      const ok = c.set === '4OLL' ? topOriented4(end) : isSolved4(end);
      if (ok) return { ok: true, message: `Alg löst den Fall${pre.length ? ` (mit ${formatAlg(pre)} davor)` : ''}` };
    }
  }
  return { ok: false, message: 'Alg löst diesen Fall nicht' };
}

/** Oben alles gelb und darunter alles gelöst (relativ zu den Zentren) */
export function topOriented4(s: State): boolean {
  for (let i = 0; i < 96; i++) {
    const face = Math.floor(i / 16);
    // Seiten-Sticker der oberen Schicht sind bei OLL egal
    if (geometry4(i).p[1] === 3 && face !== 0) continue;
    if (color4(s, i) !== face) return false;
  }
  return true;
}

const U_ADJ: Move[][] = [[], [{ base: 'U', amount: 1 }], [{ base: 'U', amount: 2 }], [{ base: 'U', amount: 3 }]];
const D_ADJ: Move[][] = [[], [{ base: 'D', amount: 1 }], [{ base: 'D', amount: 2 }], [{ base: 'D', amount: 3 }]];
/** Alle Kombinationen aus U- und D-Ausrichtung (für 2x2) */
export const UD_ADJ: Move[][] = U_ADJ.flatMap((u) => D_ADJ.map((d) => [...u, ...d]));

function validate2(c: AlgCase, moves: Move[]): ValidationResult {
  const start = caseState(c, c.algs[0]);
  const fixed = toCornerMoves(moves);
  for (const pre of UD_ADJ) {
    const mid = applyMoves(start, [...pre, ...fixed]);
    for (const post of UD_ADJ) {
      const end = applyMoves(mid, post);
      const good = c.set === '2OLL' ? topOriented(end) && bottomFace(end) : cornersHome(end);
      if (good) return { ok: true, message: `Alg löst den Fall${pre.length ? ` (mit ${formatAlg(pre)} davor)` : ''}` };
      if (c.set === '2OLL') break; // Für OLL spielt die Ausrichtung danach keine Rolle
    }
  }
  return { ok: false, message: 'Alg löst diesen Fall nicht' };
}

export interface ValidationResult {
  ok: boolean;
  message: string;
}

/** Prüft, ob ein (eigener) Alg den Fall wirklich löst. */
export function validateAlg(c: AlgCase, text: string): ValidationResult {
  if (c.puzzle === 4) {
    const m4 = tryParse4(text);
    return m4?.length ? validate4(c, m4) : { ok: false, message: 'Notation nicht lesbar' };
  }
  const moves = tryParseAlg(text);
  if (!moves || moves.length === 0) return { ok: false, message: 'Notation nicht lesbar' };
  if (c.puzzle === 2) return validate2(c, moves);

  const start = caseState(c, c.algs[0]);
  const fixed = [...moves, ...netRotationFix(moves)];
  const aufs: Move[][] = [[], [{ base: 'U', amount: 1 }], [{ base: 'U', amount: 2 }], [{ base: 'U', amount: 3 }]];
  for (const pre of aufs) {
    for (const post of aufs) {
      const end = applyMoves(start, [...pre, ...fixed, ...post]);
      const good =
        c.set === 'F2L'
          ? crossSolved(end) && SLOTS.every((s) => slotSolved(end, s))
          : c.set === 'OLL' || c.set === 'WV' || c.set === 'VLS'
            ? ollSolved(end)
            : c.set === 'COLL'
              ? ollSolved(end) && llCornersSolved(end)
              : isSolved(end);
      if (good) {
        const aufText = pre.length ? ` (mit ${formatAlg(pre)} davor)` : '';
        return { ok: true, message: `Alg löst den Fall${aufText}` };
      }
    }
  }
  if (!['F2L', 'WV', 'VLS'].includes(c.set) && !f2lSolved(applyMoves(start, fixed))) return { ok: false, message: 'Alg zerstört F2L' };
  return { ok: false, message: 'Alg löst diesen Fall nicht' };
}

export { ALL_CASES };
