import { applyMoves, type Move, type State } from '../cube/cube';
import {
  CROSS_FACELETS,
  CROSS_TOKENS,
  LL_FACELETS,
  SLOTS,
  crossSolved,
  isSolved,
  ollSolved,
  edgesOriented,
  llCornersSolved,
  slotSolved,
  type SlotInfo,
  type SlotName,
} from '../cube/analysis';
import { conjugateAlg, formatAlg, htm, parseAlg, rotationToHome, simplify } from '../cube/notation';
import { F2L_CASES, OLL_CASES, PLL_CASES, SET_LABEL, type AlgCase, type AlgSet } from '../algs/data';
import { ADVANCED_CASES } from '../algs/advanced';
import { normalizeAlg, preferredAlg, rotationFree, styleAlgs } from '../algs/registry';
import { FWD, MOVE_FACE, SEARCH_MOVES, crossIndex, getCrossTable, getPairTable, pairIndex } from './tables';

export type Phase = 'inspection' | 'cross' | 'f2l' | 'ls' | 'oll' | 'coll' | 'zbll' | 'pll' | 'face' | 'layer' | 'pbl' | 'cll' | 'eg';

export interface SolveStep {
  phase: Phase;
  title: string;
  subtitle?: string;
  caseId?: string;
  moves: Move[];
  /** Anzahl führender AUF-Züge (nur Anzeige) */
  aufCount: number;
  /** Anzahl abschliessender AUF-Züge */
  postAufCount: number;
  method: 'alg' | 'search' | 'skip' | 'rotation';
  slot?: SlotName;
  note?: string;
  /** Heimat-Indizes der Sticker, die in diesem Schritt im Fokus stehen */
  focus: number[];
}

export interface Solution {
  steps: SolveStep[];
  moveCount: number;
}

export interface AdvancedSets {
  wv?: boolean;
  vls?: boolean;
  coll?: boolean;
  zbll?: boolean;
}

export interface SolveOptions {
  /** 'alg': F2L über die 41 Fälle (wie ein Mensch), 'optimal': kürzeste Lösung pro Paar */
  f2lMode: 'alg' | 'optimal';
  /** Zusätzliche Sets für letztes Paar und letzte Ebene */
  adv?: AdvancedSets;
}

const AUF: Move[][] = [[], [{ base: 'U', amount: 1 }], [{ base: 'U', amount: 2 }], [{ base: 'U', amount: 3 }]];
export const SLOT_ROTATION: Record<SlotName, Move[]> = {
  FR: [],
  FL: parseAlg("y'"),
  BL: parseAlg('y2'),
  BR: parseAlg('y'),
};

// ---------------------------------------------------------------- Kreuz

export function solveCross(s: State): Move[] {
  const table = getCrossTable();
  let pos = CROSS_TOKENS.map((t) => s.indexOf(t));
  const out: Move[] = [];
  let d = table[crossIndex(pos[0], pos[1], pos[2], pos[3])];
  while (d > 0) {
    let advanced = false;
    for (let m = 0; m < FWD.length; m++) {
      const f = FWD[m];
      const next = pos.map((p) => f[p]);
      const nd = table[crossIndex(next[0], next[1], next[2], next[3])];
      if (nd < d) {
        out.push(SEARCH_MOVES[m]);
        pos = next;
        d = nd;
        advanced = true;
        break;
      }
    }
    if (!advanced) throw new Error('Kreuz-Suche fehlgeschlagen');
  }
  return out;
}

// ---------------------------------------------------------------- F2L-Suche (IDA*)

const F2L_SEARCH_FACES = new Set([0, 1, 2, 4, 5]); // ohne D

/**
 * Sucht die kürzeste Zugfolge, die das Paar des Zielslots einsetzt und dabei Kreuz
 * und bereits gelöste Slots erhält. Durchsucht mehrere Slots gleichzeitig mit wachsender Tiefe.
 */
export function searchF2L(s: State, keep: SlotInfo[], targets: SlotInfo[], maxDepth = 14, allowD = false): { slot: SlotInfo; moves: Move[] } | null {
  const cross = getCrossTable();
  const keepTables = keep.map((k) => getPairTable(SLOTS.indexOf(k)));
  const keepTokens = keep.flatMap((k) => [k.cornerToken, k.edgeToken]);
  const nKeep = keep.length;

  for (let bound = 1; bound <= maxDepth; bound++) {
    for (const target of targets) {
      const targetTable = getPairTable(SLOTS.indexOf(target));
      const tokens = [...CROSS_TOKENS, ...keepTokens, target.cornerToken, target.edgeToken];
      const n = tokens.length;
      const stack: Int8Array[] = Array.from({ length: maxDepth + 1 }, () => new Int8Array(n));
      tokens.forEach((t, i) => (stack[0][i] = s.indexOf(t)));
      const path: number[] = [];

      const h = (p: Int8Array) => {
        let v = cross[crossIndex(p[0], p[1], p[2], p[3])];
        for (let k = 0; k < nKeep; k++) {
          const d = keepTables[k][pairIndex(p[4 + 2 * k], p[5 + 2 * k])];
          if (d > v) v = d;
        }
        const t = targetTable[pairIndex(p[n - 2], p[n - 1])];
        return t > v ? t : v;
      };

      const dfs = (depth: number, lastFace: number): boolean => {
        const p = stack[depth];
        const hv = h(p);
        if (hv === 0) return true;
        if (depth + hv > bound) return false;
        const next = stack[depth + 1];
        for (let m = 0; m < FWD.length; m++) {
          const face = MOVE_FACE[m];
          if (!allowD && !F2L_SEARCH_FACES.has(face)) continue;
          if (face === lastFace) continue;
          // Gegenüberliegende Flächen nur in einer Reihenfolge (R vor L, F vor B)
          if ((face === 4 && lastFace === 1) || (face === 5 && lastFace === 2) || (face === 3 && lastFace === 0)) continue;
          const f = FWD[m];
          for (let i = 0; i < n; i++) next[i] = f[p[i]];
          path.push(m);
          if (dfs(depth + 1, face)) return true;
          path.pop();
        }
        return false;
      };

      if (dfs(0, -1)) return { slot: target, moves: path.map((m) => SEARCH_MOVES[m]) };
    }
  }
  return null;
}

// ---------------------------------------------------------------- Hilfen

const algCache = new Map<string, Move[]>();
function cachedRotationFree(alg: string, slot: SlotName): Move[] {
  const key = `${slot}|${alg}`;
  let m = algCache.get(key);
  if (!m) {
    m = conjugateAlg(rotationFree(alg), SLOT_ROTATION[slot]);
    algCache.set(key, m);
  }
  return m;
}

function focusForSlot(slot: SlotInfo) {
  return [...slot.cornerFacelets, ...slot.edgeFacelets];
}

function caseAlgs(c: AlgCase): string[] {
  const pref = preferredAlg(c);
  return [pref, ...styleAlgs(c).filter((a) => a !== pref)];
}

interface F2LCandidate {
  slot: SlotInfo;
  moves: Move[];
  auf: Move[];
  alg: Move[];
  caseRef?: AlgCase;
  algText?: string;
  cost: number;
}

function lookupF2L(s: State, keep: SlotInfo[], targets: SlotInfo[]): F2LCandidate[] {
  const found: F2LCandidate[] = [];
  for (const slot of targets) {
    for (let a = 0; a < 4; a++) {
      const afterAuf = applyMoves(s, AUF[a]);
      for (const c of F2L_CASES) {
        // Nur den bevorzugten Alg prüfen: ein Fall wird eindeutig durch ihn erkannt
        const algText = preferredAlg(c);
        const alg = cachedRotationFree(algText, slot.name);
        const end = applyMoves(afterAuf, alg);
        if (!slotSolved(end, slot) || !crossSolved(end) || !keep.every((k) => slotSolved(end, k))) continue;
        const moves = simplify([...AUF[a], ...alg]);
        found.push({ slot, moves, auf: AUF[a], alg, caseRef: c, algText, cost: htm(moves) });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------- Hauptlöser

export function solveCFOP(start: State, opts: SolveOptions = { f2lMode: 'alg' }): Solution {
  const steps: SolveStep[] = [];
  let s = start;

  const inspection = rotationToHome(s);
  if (inspection.length) {
    steps.push({
      phase: 'inspection',
      title: 'Inspektion',
      subtitle: 'Gelb oben, Grün vorne',
      moves: inspection,
      aufCount: 0,
      postAufCount: 0,
      method: 'rotation',
      focus: [],
    });
    s = applyMoves(s, inspection);
  }

  // Kreuz
  const cross = solveCross(s);
  steps.push({
    phase: 'cross',
    title: 'Kreuz',
    subtitle: cross.length ? `${cross.length} Züge · optimal` : 'Kreuz bereits gelöst',
    moves: cross,
    aufCount: 0,
    postAufCount: 0,
    method: cross.length ? 'search' : 'skip',
    focus: CROSS_FACELETS,
  });
  s = applyMoves(s, cross);

  // F2L
  let pairNo = 1;
  while (true) {
    const solved = SLOTS.filter((sl) => slotSolved(s, sl));
    const open = SLOTS.filter((sl) => !slotSolved(s, sl));
    if (!open.length) break;

    // Letztes Paar mit WV/VLS: wie ein Mensch das Paar vorbereiten und statt des letzten
    // Einsetz-Triggers (z.B. R U R') den WV/VLS-Alg nutzen, der gleichzeitig orientiert
    const lsSets: AlgSet[] = [...(opts.adv?.wv ? (['WV'] as const) : []), ...(opts.adv?.vls ? (['VLS'] as const) : [])];
    if (open.length === 1 && lsSets.length) {
      const ls = bestLastSlot(s, solved, open[0], lsSets);
      if (ls) {
        steps.push({
          phase: 'ls',
          title: `F2L ${pairNo} · ${SET_LABEL[ls.caseRef.set]}`,
          subtitle: `${SET_LABEL[ls.caseRef.set]} ${ls.caseRef.key}${ls.caseRef.name ? ` · ${ls.caseRef.name}` : ''} · ${open[0].label}`,
          caseId: ls.caseRef.id,
          moves: ls.moves,
          aufCount: ls.prep,
          postAufCount: 0,
          method: 'alg',
          slot: open[0].name,
          note: ls.prep ? `Paar vorbereiten (${formatAlg(ls.moves.slice(0, ls.prep))}), dann ${SET_LABEL[ls.caseRef.set]} statt Einsetzen` : `Einsetzen und letzte Ebene orientieren · ${ls.caseRef.group}`,
          focus: [...focusForSlot(open[0]), ...LL_FACELETS],
        });
        s = applyMoves(s, ls.moves);
        break;
      }
    }

    const lookups = lookupF2L(s, solved, open);
    let best: F2LCandidate | null = null;
    for (const c of lookups) if (!best || c.cost < best.cost) best = c;

    if (opts.f2lMode === 'optimal' || !best) {
      const found = searchF2L(s, solved, open, best ? Math.min(14, best.cost - 1) : 14);
      if (found && (!best || htm(found.moves) < best.cost)) {
        best = { slot: found.slot, moves: found.moves, auf: [], alg: found.moves, cost: htm(found.moves) };
      }
    }
    if (!best) throw new Error('F2L konnte nicht gelöst werden');

    const c = best.caseRef;
    const mergedAuf = best.auf.length > 0 && best.moves.length === best.auf.length + best.alg.length ? best.auf.length : 0;
    steps.push({
      phase: 'f2l',
      title: `F2L ${pairNo}`,
      subtitle: c ? `Fall ${c.key} · ${best.slot.label}` : `Freies Lösen · ${best.slot.label}`,
      caseId: c?.id,
      moves: best.moves,
      aufCount: mergedAuf,
      postAufCount: 0,
      method: c ? 'alg' : 'search',
      slot: best.slot.name,
      note: c
        ? best.slot.name === 'FR'
          ? `${c.group} · ${best.algText}`
          : `${c.group} · vom Slot vorne rechts aus: ${formatAlg(simplify([...SLOT_ROTATION[best.slot.name], ...parseAlg(best.algText!)]))}`
        : 'Kein Standardfall (Teile stecken fest) – computer-optimale Lösung',
      focus: focusForSlot(best.slot),
    });
    s = applyMoves(s, best.moves);
    pairNo++;
  }

  // ZBLL: letzte Ebene in einem Schritt (Kanten orientiert)
  if (opts.adv?.zbll && !ollSolved(s) && edgesOriented(s)) {
    const z = lookupLL(s, 'ZBLL', isSolved);
    if (z) {
      steps.push(llStep('zbll', 'ZBLL', z));
      s = z.end;
      if (!isSolved(s)) throw new Error('ZBLL unvollständig');
      return { steps, moveCount: steps.reduce((n, st) => n + htm(st.moves), 0) };
    }
  }

  // OLL
  const coll = opts.adv?.coll && !ollSolved(s) && edgesOriented(s) ? lookupLL(s, 'COLL', (e) => ollSolved(e) && AUF.some((a) => llCornersSolved(applyMoves(e, a))), false) : null;
  if (coll) {
    steps.push(llStep('coll', 'COLL', coll));
    s = coll.end;
  } else if (ollSolved(s)) {
    const viaLs = steps[steps.length - 1]?.phase === 'ls';
    steps.push({ phase: 'oll', title: 'OLL', subtitle: viaLs ? 'Schon orientiert (Last Slot)' : 'OLL Skip!', moves: [], aufCount: 0, postAufCount: 0, method: 'skip', focus: LL_FACELETS });
  } else {
    const r = recognizeOLL(s);
    if (!r) throw new Error('OLL nicht erkannt');
    steps.push({
      phase: 'oll',
      title: 'OLL',
      subtitle: `OLL ${r.caseRef.key}${r.caseRef.name ? ` · ${r.caseRef.name}` : ''}`,
      caseId: r.caseRef.id,
      moves: [...r.auf, ...r.alg],
      aufCount: r.auf.length,
      postAufCount: 0,
      method: 'alg',
      note: r.caseRef.group,
      focus: LL_FACELETS,
    });
    s = r.end;
  }

  // PLL
  const pllSkip = AUF.find((m) => isSolved(applyMoves(s, m)));
  if (pllSkip) {
    steps.push({
      phase: 'pll',
      title: 'PLL',
      subtitle: pllSkip.length ? 'PLL Skip! Nur AUF' : 'PLL Skip!',
      moves: pllSkip,
      aufCount: 0,
      postAufCount: pllSkip.length,
      method: 'skip',
      focus: LL_FACELETS,
    });
    s = applyMoves(s, pllSkip);
  } else {
    const r = recognizePLL(s);
    if (!r) throw new Error('PLL nicht erkannt');
    steps.push({
      phase: 'pll',
      title: 'PLL',
      subtitle: `${r.caseRef.name ?? r.caseRef.key}`,
      caseId: r.caseRef.id,
      moves: [...r.auf, ...r.alg, ...r.post],
      aufCount: r.auf.length,
      postAufCount: r.post.length,
      method: 'alg',
      note: r.caseRef.group,
      focus: LL_FACELETS,
    });
    s = r.end;
  }
  if (!isSolved(s)) throw new Error('Lösung unvollständig');
  return { steps, moveCount: steps.reduce((n, st) => n + htm(st.moves), 0) };
}

// ---------------------------------------------------------------- Fortgeschrittene Sets

interface LLMatch {
  caseRef: AlgCase;
  auf: Move[];
  alg: Move[];
  post: Move[];
  end: State;
}

/** Alg-Suche in einem Set der letzten Ebene: AUF davor, Alg, optional AUF danach. */
function lookupLL(s: State, set: AlgSet, goal: (e: State) => boolean, withPost = true): LLMatch | null {
  const cases = ADVANCED_CASES.filter((c) => c.set === set);
  for (let a = 0; a < 4; a++) {
    const afterAuf = applyMoves(s, AUF[a]);
    for (const c of cases) {
      // Ein Fall wird eindeutig durch seinen bevorzugten Alg erkannt
      const alg = cachedNormalized(preferredAlg(c));
      const end = applyMoves(afterAuf, alg);
      for (const post of withPost ? AUF : [[]]) {
        const fin = post.length ? applyMoves(end, post) : end;
        if (goal(fin)) return { caseRef: c, auf: AUF[a], alg, post, end: fin };
      }
    }
  }
  return null;
}

const normCache = new Map<string, Move[]>();
function cachedNormalized(text: string): Move[] {
  let m = normCache.get(text);
  if (!m) normCache.set(text, (m = normalizeAlg(text)));
  return m;
}

function llStep(phase: Phase, title: string, m: LLMatch): SolveStep {
  return {
    phase,
    title,
    subtitle: `${SET_LABEL[m.caseRef.set]} ${m.caseRef.key}${m.caseRef.name ? ` · ${m.caseRef.name}` : ''}`,
    caseId: m.caseRef.id,
    moves: [...m.auf, ...m.alg, ...m.post],
    aufCount: m.auf.length,
    postAufCount: m.post.length,
    method: 'alg',
    note: m.caseRef.group,
    focus: LL_FACELETS,
  };
}

/**
 * Bester WV/VLS-Einsatz für den letzten Slot: direkt oder nach einer F2L-Vorbereitung,
 * deren letzter Einsetz-Trigger (3 Züge) durch den WV/VLS-Alg ersetzt wird.
 * prep = Anzahl Vorbereitungszüge (für die Anzeige).
 */
function bestLastSlot(s: State, keep: SlotInfo[], slot: SlotInfo, sets: AlgSet[]): { caseRef: AlgCase; moves: Move[]; prep: number } | null {
  let best: { caseRef: AlgCase; moves: Move[]; prep: number } | null = null;
  const consider = (prefix: Move[]) => {
    const st = applyMoves(s, prefix);
    if (slotSolved(st, slot)) return;
    const ls = lookupLastSlot(st, keep, slot, sets);
    if (!ls) return;
    const moves = simplify([...prefix, ...ls.moves]);
    if (!best || htm(moves) < htm(best.moves)) best = { caseRef: ls.caseRef, moves, prep: prefix.length };
  };
  consider([]);
  for (const c of lookupF2L(s, keep, [slot])) if (c.moves.length > 3) consider(c.moves.slice(0, -3));
  return best;
}

/** WV/VLS für den letzten Slot (Algs gelten für vorne rechts und werden umbenannt). */
function lookupLastSlot(s: State, keep: SlotInfo[], slot: SlotInfo, sets: AlgSet[]): { caseRef: AlgCase; moves: Move[]; aufCount: number } | null {
  const cases = ADVANCED_CASES.filter((c) => sets.includes(c.set));
  let best: { caseRef: AlgCase; moves: Move[]; aufCount: number } | null = null;
  for (let a = 0; a < 4; a++) {
    const afterAuf = applyMoves(s, AUF[a]);
    for (const c of cases) {
      const alg = cachedRotationFree(preferredAlg(c), slot.name);
      const end = applyMoves(afterAuf, alg);
      if (!ollSolved(end) || !keep.every((k) => slotSolved(end, k))) continue;
      const moves = simplify([...AUF[a], ...alg]);
      if (!best || htm(moves) < htm(best.moves)) best = { caseRef: c, moves, aufCount: moves.length === AUF[a].length + alg.length ? AUF[a].length : 0 };
    }
    if (best) return best;
  }
  return best;
}

// ---------------------------------------------------------------- Erkennung & Analyse

export interface Recognition {
  caseRef: AlgCase;
  auf: Move[];
  alg: Move[];
  post: Move[];
  end: State;
}

/** Erkennt den OLL-Fall eines Zustands mit gelöstem F2L (oder null, falls schon orientiert). */
export function recognizeOLL(s: State): Recognition | null {
  if (ollSolved(s)) return null;
  for (let a = 0; a < 4; a++) {
    const afterAuf = applyMoves(s, AUF[a]);
    for (const c of OLL_CASES) {
      for (const algText of caseAlgs(c)) {
        const alg = normalizeAlg(algText);
        const end = applyMoves(afterAuf, alg);
        if (ollSolved(end)) return { caseRef: c, auf: AUF[a], alg, post: [], end };
      }
    }
  }
  return null;
}

/** Erkennt den PLL-Fall eines orientierten Zustands (oder null bei PLL-Skip). */
export function recognizePLL(s: State): Recognition | null {
  if (AUF.some((m) => isSolved(applyMoves(s, m)))) return null;
  for (let a = 0; a < 4; a++) {
    const afterAuf = applyMoves(s, AUF[a]);
    for (const c of PLL_CASES) {
      for (const algText of caseAlgs(c)) {
        const alg = normalizeAlg(algText);
        const end = applyMoves(afterAuf, alg);
        const post = AUF.find((m) => isSolved(applyMoves(end, m)));
        if (post) return { caseRef: c, auf: AUF[a], alg, post, end: applyMoves(end, post) };
      }
    }
  }
  return null;
}

/** Optimales Kreuz (exakt über die Distanztabelle). */
export function optimalCross(s: State): Move[] {
  return solveCross(s);
}

/** Optimales X-Cross: Kreuz + ein beliebiges Paar mit möglichst wenigen Zügen. */
export function optimalXCross(s: State, maxDepth = 12): { slot: SlotInfo; moves: Move[] } | null {
  return searchF2L(s, [], SLOTS, maxDepth, true);
}

export interface SlotCost {
  slot: SlotName;
  cost: number;
  caseId?: string;
}

/**
 * Kosten (Züge HTM) für jeden offenen Slot ausgehend vom aktuellen Zustand –
 * Grundlage für den Lookahead-Trainer.
 */
export function slotCosts(s: State): SlotCost[] {
  const solved = SLOTS.filter((sl) => slotSolved(s, sl));
  const open = SLOTS.filter((sl) => !slotSolved(s, sl));
  const lookups = lookupF2L(s, solved, open);
  return open.map((slot) => {
    let best: F2LCandidate | null = null;
    for (const c of lookups) if (c.slot === slot && (!best || c.cost < best.cost)) best = c;
    if (best) return { slot: slot.name, cost: best.cost, caseId: best.caseRef?.id };
    const found = searchF2L(s, solved, [slot], 13);
    return { slot: slot.name, cost: found ? htm(found.moves) : 99 };
  });
}
