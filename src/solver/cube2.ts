import { applyMoves, type Move, type State } from '../cube/cube';
import { D_CORNERS, U_CORNERS, bottomFace, bottomPermutation, cornersHome, topOriented } from '../cube/cube2';
import { formatAlg, htm, rotationToHome, simplify } from '../cube/notation';
import { CASES_2X2 } from '../algs/data2';
import { SET_LABEL, type AlgCase, type AlgSet } from '../algs/data';
import { UD_ADJ, algMoves, preferredAlg, styleAlgs } from '../algs/registry';
import { CORNER_IDX, CORNER_LIST, FWD, SEARCH_MOVES } from './tables';
import type { Solution, SolveStep } from './cfop';

/** Methoden für den 2x2 */
export type Method2 = 'ortega' | 'cll' | 'eg';

export const METHOD2_LABEL: Record<Method2, string> = {
  ortega: 'Ortega (OLL + PBL)',
  cll: 'CLL (Ebene + CLL)',
  eg: 'EG (Seite + CLL/EG-1/EG-2)',
};

/** Welche Alg-Kategorien eine Methode verwendet */
export const METHOD2_SETS: Record<Method2, AlgSet[]> = {
  ortega: ['2OLL', 'PBL'],
  cll: ['CLL'],
  eg: ['CLL', 'EG1', 'EG2', 'PBL'],
};

// ---------------------------------------------------------------- erste Seite / Ebene (optimal)

/** Heimat-Indizes der weissen Eck-Sticker */
const WHITE_TOKENS = D_CORNERS;
const idx4 = (a: number, b: number, c: number, d: number) => ((CORNER_IDX[a] * 24 + CORNER_IDX[b]) * 24 + CORNER_IDX[c]) * 24 + CORNER_IDX[d];

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** BFS von mehreren Zielzuständen aus: exakte Distanz für die 4 weissen Ecken */
function buildTable(goals: number[][]): Uint8Array {
  const size = 24 ** 4;
  const table = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (const g of goals) {
    const k = idx4(g[0], g[1], g[2], g[3]);
    if (table[k] === 255) {
      table[k] = 0;
      queue[tail++] = k;
    }
  }
  const pos = [0, 0, 0, 0];
  while (head < tail) {
    const k = queue[head++];
    pos[0] = CORNER_LIST[Math.floor(k / 13824)];
    pos[1] = CORNER_LIST[Math.floor(k / 576) % 24];
    pos[2] = CORNER_LIST[Math.floor(k / 24) % 24];
    pos[3] = CORNER_LIST[k % 24];
    const d = table[k];
    for (const f of FWD) {
      const n = idx4(f[pos[0]], f[pos[1]], f[pos[2]], f[pos[3]]);
      if (table[n] === 255) {
        table[n] = d + 1;
        queue[tail++] = n;
      }
    }
  }
  return table;
}

let faceTable: Uint8Array | null = null;
let layerTable: Uint8Array | null = null;

/** Ziel "erste Seite": die vier weissen Sticker unten, Reihenfolge egal */
function getFaceTable() {
  return (faceTable ??= buildTable(permutations(D_CORNERS)));
}

/** Ziel "erste Ebene": untere Ebene gelöst (bis auf eine D-Drehung) */
function getLayerTable() {
  if (!layerTable) {
    const goals = [0, 1, 2, 3].map((k) => {
      const s = applyMoves(Uint8Array.from({ length: 54 }, (_, i) => i), k ? [{ base: 'D', amount: k as 1 | 2 | 3 }] : []);
      return WHITE_TOKENS.map((t) => s.indexOf(t));
    });
    layerTable = buildTable(goals);
  }
  return layerTable;
}

/** Folgt der exakten Distanztabelle bergab – liefert eine optimale Zugfolge. */
function descend(s: State, table: Uint8Array): Move[] {
  let pos = WHITE_TOKENS.map((t) => s.indexOf(t));
  let d = table[idx4(pos[0], pos[1], pos[2], pos[3])];
  const out: Move[] = [];
  while (d > 0) {
    let moved = false;
    for (let m = 0; m < FWD.length; m++) {
      const f = FWD[m];
      const next = pos.map((p) => f[p]);
      const nd = table[idx4(next[0], next[1], next[2], next[3])];
      if (nd < d) {
        out.push(SEARCH_MOVES[m]);
        pos = next;
        d = nd;
        moved = true;
        break;
      }
    }
    if (!moved) throw new Error('2x2-Suche fehlgeschlagen');
  }
  return out;
}

// ---------------------------------------------------------------- Alg-Suche

interface Match {
  caseRef: AlgCase;
  pre: Move[];
  alg: Move[];
  post: Move[];
  end: State;
}

const algCache = new Map<string, Move[]>();
const movesOf = (c: AlgCase, text: string) => {
  const key = `${c.id}|${text}`;
  let m = algCache.get(key);
  if (!m) algCache.set(key, (m = algMoves(c, text)));
  return m;
};

function caseAlgs(c: AlgCase) {
  const pref = preferredAlg(c);
  return [pref, ...styleAlgs(c).filter((a) => a !== pref)];
}

/** Probiert alle Algs der Kategorien mit U/D-Ausrichtung davor und danach. */
function lookup(s: State, sets: AlgSet[], goal: (end: State) => boolean, withPost: boolean): Match | null {
  let best: Match | null = null;
  const cases = CASES_2X2.filter((c) => sets.includes(c.set));
  for (const pre of UD_ADJ) {
    const start = applyMoves(s, pre);
    for (const c of cases) {
      for (const text of caseAlgs(c)) {
        const alg = movesOf(c, text);
        const mid = applyMoves(start, alg);
        for (const post of withPost ? UD_ADJ : [[]]) {
          const end = post.length ? applyMoves(mid, post) : mid;
          if (!goal(end)) continue;
          const cand = { caseRef: c, pre, alg, post, end };
          if (!best || htm([...pre, ...alg, ...post]) < htm([...best.pre, ...best.alg, ...best.post])) best = cand;
          break;
        }
        if (best?.caseRef === c) break;
      }
    }
    // Ohne Vor-Ausrichtung gefundene Treffer bevorzugen; sonst beim ersten Treffer aufhören
    if (best) return best;
  }
  return best;
}

/** Ausrichtung am Ende (U/D), falls der Würfel nur noch verdreht ist */
function finalAdjust(s: State): Move[] | null {
  for (const a of UD_ADJ) if (cornersHome(applyMoves(s, a))) return a;
  return null;
}

const U_FOCUS = U_CORNERS.concat([9, 11, 18, 20, 36, 38, 45, 47]);
const D_FOCUS = D_CORNERS.concat([15, 17, 24, 26, 42, 44, 51, 53]);

// ---------------------------------------------------------------- Hauptlöser

export function solve2x2(start: State, method: Method2): Solution {
  const steps: SolveStep[] = [];
  let s = start;
  const inspection = rotationToHome(s);
  if (inspection.length) {
    steps.push({ phase: 'inspection', title: 'Inspektion', subtitle: 'Weiss unten', moves: inspection, aufCount: 0, postAufCount: 0, method: 'rotation', focus: [] });
    s = applyMoves(s, inspection);
  }

  // 1. Erste Seite (Ortega, EG) bzw. erste Ebene (CLL) – optimal
  const layer = method === 'cll';
  const first = descend(s, layer ? getLayerTable() : getFaceTable());
  s = applyMoves(s, first);
  const bottom = bottomPermutation(s);
  const bottomText = { solved: 'unten gelöst', adjacent: 'unten benachbarter Tausch', diagonal: 'unten diagonaler Tausch' }[bottom];
  steps.push({
    phase: layer ? 'layer' : 'face',
    title: layer ? 'Erste Ebene' : 'Erste Seite',
    subtitle: `${first.length} Züge · optimal${layer ? '' : ` · ${bottomText}`}`,
    moves: first,
    aufCount: 0,
    postAufCount: 0,
    method: first.length ? 'search' : 'skip',
    focus: D_FOCUS,
  });

  const push = (phase: SolveStep['phase'], title: string, m: Match, note?: string) => {
    const moves = [...m.pre, ...m.alg, ...m.post];
    steps.push({
      phase,
      title,
      subtitle: `${SET_LABEL[m.caseRef.set]} ${m.caseRef.key}${m.caseRef.name && m.caseRef.name !== m.caseRef.key ? ` · ${m.caseRef.name}` : ''}`,
      caseId: m.caseRef.id,
      moves,
      aufCount: m.pre.length,
      postAufCount: m.post.length,
      method: 'alg',
      note: note ?? `${m.caseRef.group} · ${formatAlg(simplify(m.alg))}`,
      focus: U_FOCUS.concat(D_FOCUS),
    });
    s = m.end;
  };

  const adjust = finalAdjust(s);
  if (adjust) {
    // Nach der ersten Seite bereits gelöst
    steps.push({ phase: 'pbl', title: 'Fertig', subtitle: adjust.length ? 'Nur ausrichten' : 'Skip!', moves: adjust, aufCount: 0, postAufCount: adjust.length, method: 'skip', focus: [] });
    return { steps, moveCount: steps.reduce((n, st) => n + htm(st.moves), 0) };
  }

  if (method === 'ortega') {
    if (topOriented(s)) {
      steps.push({ phase: 'oll', title: 'OLL', subtitle: 'OLL Skip!', moves: [], aufCount: 0, postAufCount: 0, method: 'skip', focus: U_FOCUS });
    } else {
      const m = lookup(s, ['2OLL'], (e) => topOriented(e) && bottomFace(e), false);
      if (!m) throw new Error('2x2-OLL nicht erkannt');
      push('oll', 'OLL', m);
    }
    const adj = finalAdjust(s);
    if (adj) {
      steps.push({ phase: 'pbl', title: 'PBL', subtitle: 'PBL Skip!', moves: adj, aufCount: 0, postAufCount: adj.length, method: 'skip', focus: [] });
      s = applyMoves(s, adj);
    } else {
      const m = lookup(s, ['PBL'], cornersHome, true);
      if (!m) throw new Error('PBL nicht erkannt');
      push('pbl', 'PBL', m);
    }
  } else {
    const sets: AlgSet[] = method === 'cll' ? ['CLL'] : bottom === 'solved' ? ['CLL'] : bottom === 'adjacent' ? ['EG1', 'PBL'] : ['EG2', 'PBL'];
    const m = lookup(s, sets, cornersHome, true);
    if (!m) throw new Error('Letzte Ebene nicht erkannt');
    const phase = m.caseRef.set === 'CLL' ? 'cll' : m.caseRef.set === 'PBL' ? 'pbl' : 'eg';
    push(phase, SET_LABEL[m.caseRef.set], m);
  }

  if (!cornersHome(s)) throw new Error('2x2-Lösung unvollständig');
  return { steps, moveCount: steps.reduce((n, st) => n + htm(st.moves), 0) };
}

/** Tabellen vorab bauen (für den Worker-Start) */
export function warmup2x2() {
  getFaceTable();
  getLayerTable();
}
