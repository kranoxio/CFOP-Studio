import { applyMoves, solvedState, type Move, type State } from '../cube/cube';
import { f2lSolved, ollSolved, isSolved, SLOTS, slotSolved, crossSolved } from '../cube/analysis';
import { formatAlg, invertAlg, netRotationFix, parseAlg, removeRotations, tryParseAlg } from '../cube/notation';
import { ALL_CASES, CASE_BY_ID, type AlgCase } from './data';
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
let custom: Record<string, string> = storage.get(CUSTOM_KEY, {});

/** Für den Solver-Worker (kein localStorage dort): eigene Algs übernehmen. */
export function setCustomAlgs(map: Record<string, string>) {
  custom = { ...map };
  cacheVersion++;
}

export function getCustomAlgs(): Record<string, string> {
  return { ...custom };
}

export function getCustomAlg(id: string): string | undefined {
  return custom[id];
}

export function setCustomAlg(id: string, alg: string | null) {
  if (alg) custom[id] = alg;
  else delete custom[id];
  storage.set(CUSTOM_KEY, custom);
  cacheVersion++;
}

let cacheVersion = 0;
export const algsVersion = () => cacheVersion;

/** Der Alg, den der Nutzer für diesen Fall verwendet (eigener Alg oder Standard). */
export function preferredAlg(c: AlgCase): string {
  return custom[c.id] ?? c.algs[0];
}

export function getCase(id: string): AlgCase {
  const c = CASE_BY_ID.get(id);
  if (!c) throw new Error(`Unbekannter Fall ${id}`);
  return c;
}

/** Zustand, den ein Fall vor Ausführung des Algs darstellt. */
export function caseState(c: AlgCase, alg = preferredAlg(c)): State {
  return applyMoves(solvedState(), invertAlg(normalizeAlg(alg)));
}

export interface ValidationResult {
  ok: boolean;
  message: string;
}

/** Prüft, ob ein (eigener) Alg den Fall wirklich löst. */
export function validateAlg(c: AlgCase, text: string): ValidationResult {
  const moves = tryParseAlg(text);
  if (!moves || moves.length === 0) return { ok: false, message: 'Notation nicht lesbar' };
  const start = caseState(c, c.algs[0]);
  const fixed = [...moves, ...netRotationFix(moves)];
  const aufs: Move[][] = [[], [{ base: 'U', amount: 1 }], [{ base: 'U', amount: 2 }], [{ base: 'U', amount: 3 }]];
  for (const pre of aufs) {
    for (const post of aufs) {
      const end = applyMoves(start, [...pre, ...fixed, ...post]);
      const good =
        c.set === 'F2L'
          ? crossSolved(end) && SLOTS.every((s) => slotSolved(end, s))
          : c.set === 'OLL'
            ? ollSolved(end)
            : isSolved(end);
      if (good) {
        const aufText = pre.length ? ` (mit ${formatAlg(pre)} davor)` : '';
        return { ok: true, message: `Alg löst den Fall${aufText}` };
      }
    }
  }
  if (c.set !== 'F2L' && !f2lSolved(applyMoves(start, fixed))) return { ok: false, message: 'Alg zerstört F2L' };
  return { ok: false, message: 'Alg löst diesen Fall nicht' };
}

export { ALL_CASES };
