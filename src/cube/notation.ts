import {
  MOVE_DEFS,
  MOVE_NAMES,
  PERMS,
  ROTATION_NAMES,
  applyMoves,
  centerColor,
  composePerm,
  identityPerm,
  invertMove,
  isRotation,
  moveToString,
  movesPerm,
  permEquals,
  solvedState,
  type Move,
  type Perm,
  type State,
} from './cube';

const TOKEN = /([UDRLFBudrlfbMESxyz])(w?)(\d*)(['’`]?)/g;

/** Wandelt einen Alg-String (WCA-/SiGN-Notation) in Züge um. Klammern werden ignoriert. */
export function parseAlg(text: string): Move[] {
  const moves: Move[] = [];
  const cleaned = text.replace(/[()[\]{}]/g, ' ');
  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    TOKEN.lastIndex = 0;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN.exec(part)) && m.index === consumed) {
      consumed += m[0].length;
      let base = m[1];
      if (m[2] === 'w') {
        if (!'UDRLFB'.includes(base)) throw new Error(`Ungültiger Zug: ${m[0]}`);
        base = base.toLowerCase();
      }
      const n = m[3] ? parseInt(m[3], 10) : 1;
      let amount = ((n % 4) + 4) % 4;
      if (m[4]) amount = (4 - amount) % 4;
      if (amount !== 0) moves.push({ base, amount: amount as 1 | 2 | 3 });
    }
    if (consumed !== part.length) throw new Error(`Unbekannte Notation: "${part}"`);
  }
  return moves;
}

export function tryParseAlg(text: string): Move[] | null {
  try {
    return parseAlg(text);
  } catch {
    return null;
  }
}

export function formatAlg(moves: Move[]): string {
  return moves.map(moveToString).join(' ');
}

export function invertAlg(moves: Move[]): Move[] {
  return moves.slice().reverse().map(invertMove);
}

/** Fasst direkt aufeinanderfolgende Züge derselben Basis zusammen (U U' -> nichts, U U -> U2). */
export function simplify(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.base === m.base) {
      const amount = (last.amount + m.amount) % 4;
      out.pop();
      if (amount) out.push({ base: m.base, amount: amount as 1 | 2 | 3 });
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** Halbe Drehungen zählen als 1 (HTM), Slices als 2. */
export function htm(moves: Move[]): number {
  let n = 0;
  for (const m of moves) {
    if (isRotation(m)) continue;
    n += 'MES'.includes(m.base) ? 2 : 1;
  }
  return n;
}

/** Slice-Turn-Metrik: jeder Zug außer Rotationen zählt 1. */
export function stm(moves: Move[]): number {
  return moves.filter((m) => !isRotation(m)).length;
}

const ALL_SINGLE: { move: Move; perm: Perm }[] = [];
for (const base of MOVE_NAMES) {
  for (const amount of [1, 2, 3] as const) ALL_SINGLE.push({ move: { base, amount }, perm: PERMS[base][amount] });
}

/** Findet den Einzelzug, dessen Permutation gleich p ist. */
export function moveForPerm(p: Perm, preferBases?: string[]): Move | null {
  const candidates = preferBases
    ? [...ALL_SINGLE.filter((c) => preferBases.includes(c.move.base)), ...ALL_SINGLE]
    : ALL_SINGLE;
  for (const c of candidates) if (permEquals(c.perm, p)) return c.move;
  return null;
}

/**
 * Konjugation mit einer Rotation: rot · m · rot⁻¹. Liefert den Zug, der "m nach der Rotation"
 * im ursprünglichen Bezugssystem entspricht.
 */
export function conjugateMove(m: Move, rot: Perm): Move {
  const p = composePerm(composePerm(rot, PERMS[m.base][m.amount]), invertRotationPerm(rot));
  const lower = m.base === m.base.toLowerCase() && !ROTATION_NAMES.includes(m.base);
  const prefer = 'MES'.includes(m.base)
    ? ['M', 'E', 'S']
    : ROTATION_NAMES.includes(m.base)
      ? ROTATION_NAMES
      : lower
        ? ['u', 'd', 'r', 'l', 'f', 'b']
        : ['U', 'D', 'R', 'L', 'F', 'B'];
  const found = moveForPerm(p, prefer);
  if (!found) throw new Error('Konjugation fehlgeschlagen');
  return found;
}

function invertRotationPerm(p: Perm): Perm {
  const out = new Uint8Array(54);
  for (let j = 0; j < 54; j++) out[p[j]] = j;
  return out;
}

/** Ein Alg mit einer vorangestellten Rotation, aber ohne die Rotation auszuführen (Umbenennung). */
export function conjugateAlg(moves: Move[], rotation: Move[]): Move[] {
  const rot = movesPerm(rotation);
  return moves.map((m) => conjugateMove(m, rot));
}

/**
 * Entfernt alle Rotationen aus einem Alg, indem nachfolgende Züge umbenannt werden.
 * Ergebnis entspricht dem Original bis auf eine Gesamtrotation am Ende.
 */
export function removeRotations(moves: Move[]): Move[] {
  let acc: Perm = identityPerm();
  const out: Move[] = [];
  for (const m of moves) {
    if (isRotation(m)) {
      acc = composePerm(acc, PERMS[m.base][m.amount]);
    } else {
      out.push(conjugateMove(m, acc));
    }
  }
  return out;
}

/** Alle 24 Orientierungen als kürzeste Rotationsfolgen. */
export const ORIENTATIONS: { moves: Move[]; perm: Perm }[] = (() => {
  const result: { moves: Move[]; perm: Perm }[] = [{ moves: [], perm: identityPerm() }];
  const keyOf = (p: Perm) => Array.from(p.slice(0, 54).filter((_, i) => i % 9 === 4)).join(',');
  const seen = new Set([keyOf(identityPerm())]);
  let frontier = result.slice();
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const o of frontier) {
      for (const base of ['y', 'x', 'z']) {
        for (const amount of [1, 3, 2] as const) {
          const perm = composePerm(o.perm, PERMS[base][amount]);
          const k = keyOf(perm);
          if (seen.has(k)) continue;
          seen.add(k);
          const entry = { moves: [...o.moves, { base, amount }], perm };
          result.push(entry);
          next.push(entry);
        }
      }
    }
    frontier = next;
  }
  return result;
})();

/** Rotationsfolge, welche die Mittelsteine eines Zustands in Grundposition bringt. */
export function rotationToHome(s: State): Move[] {
  for (const o of ORIENTATIONS) {
    const t = applyMoves(s, o.moves);
    let ok = true;
    for (let f = 0; f < 6; f++) if (centerColor(t, f) !== f) ok = false;
    if (ok) return o.moves;
  }
  throw new Error('Keine Orientierung gefunden');
}

/** Netto-Rotation eines Algs (leer, wenn Mittelsteine am Ende wieder an ihrem Platz sind). */
export function netRotationFix(moves: Move[]): Move[] {
  return rotationToHome(applyMoves(solvedState(), moves));
}

/** Spiegelt einen Alg an der M-Ebene (Links <-> Rechts). */
export function mirrorAlg(moves: Move[]): Move[] {
  // Spiegelung x -> -x: Drehungen um die x-Achse behalten ihren Winkel (R -> L', M -> M, x -> x),
  // Drehungen um y- und z-Achse kehren ihre Richtung um (U -> U', F -> F').
  const map: Record<string, string> = { R: 'L', L: 'R', r: 'l', l: 'r' };
  return moves.map((m) => {
    if (m.base === 'M' || m.base === 'x') return { ...m };
    return { base: map[m.base] ?? m.base, amount: (4 - m.amount) as 1 | 2 | 3 };
  });
}

/** Sinnvoll gültige Zufalls-Scramble (WCA-artig, nur Flächenzüge). */
export function randomScramble(length = 21, rng: () => number = Math.random): Move[] {
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
  const axisOf: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  const out: Move[] = [];
  while (out.length < length) {
    const base = faces[Math.floor(rng() * 6)];
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && last.base === base) continue;
    if (last && prev && axisOf[last.base] === axisOf[base] && axisOf[prev.base] === axisOf[base]) continue;
    const amount = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3;
    out.push({ base, amount });
  }
  return out;
}

export { MOVE_DEFS };
