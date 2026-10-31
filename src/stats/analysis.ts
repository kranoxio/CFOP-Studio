import { applyMoves, type State } from '../cube/cube';
import { parseAlg, rotationToHome } from '../cube/notation';
import { recognizeOLL, recognizePLL } from '../solver/cfop';
import { WCA_START } from '../smartcube/smartcube';
import { MILESTONE_LABEL, type Milestone } from '../smartcube/splits';

/** Minimaler Solve-Datensatz (wie ihn der Timer speichert) */
export interface SolveRecord {
  ms: number;
  penalty?: '+2' | 'DNF';
  scramble: string;
  at: number;
  moves?: string;
  splits?: Milestone[];
  times?: number[];
}

/** Richtwerte eines typischen Sub-10-CFOP-Solvers (Sekunden pro Phase). */
export const SUB10_PROFILE: Record<string, number> = {
  cross: 1.3,
  f2l1: 1.3,
  f2l2: 1.2,
  f2l3: 1.2,
  f2l4: 1.2,
  oll: 1.3,
  pll: 1.5,
};

export const PHASE_ORDER = ['cross', 'f2l1', 'f2l2', 'f2l3', 'f2l4', 'oll', 'pll'];

export interface PhaseStat {
  id: string;
  label: string;
  /** Ø Dauer in s */
  avg: number;
  /** Ø Pause vor dem ersten Zug der Phase in s (Erkennung / Lookahead-Lücke) */
  pause: number | null;
  /** Ø Züge pro Sekunde während der Ausführung (ohne Pause) */
  tps: number | null;
  /** Ø Zugzahl */
  moves: number;
  ref: number;
}

export interface CaseTime {
  caseId: string;
  n: number;
  /** Ø Gesamtzeit der Phase (Erkennung + Ausführung) in s */
  avg: number;
  /** Ø Erkennungspause in s */
  pause: number | null;
}

export interface Analysis {
  count: number;
  avgTime: number;
  avgMoves: number;
  avgTps: number;
  phases: PhaseStat[];
  oll: CaseTime[];
  pll: CaseTime[];
  /** Phase mit dem grössten Rückstand auf das Sub-10-Profil */
  biggestGap: PhaseStat | null;
}

const isComplete = (s: SolveRecord) => !!s.moves && !!s.splits && PHASE_ORDER.every((id) => s.splits!.some((m) => m.id === id));

/** Wertet Smartcube-Solves aus: Phasenzeiten, Pausen, TPS und die langsamsten OLL/PLL-Fälle. */
export function analyzeSolves(all: SolveRecord[], limit = 200): Analysis | null {
  const solves = all.filter((s) => s.penalty !== 'DNF' && isComplete(s)).slice(0, limit);
  if (!solves.length) return null;

  const acc = new Map<string, { dur: number; pause: number; pauseN: number; exec: number; moves: number; n: number }>();
  const cases = { oll: new Map<string, { sum: number; pause: number; pauseN: number; n: number }>(), pll: new Map<string, { sum: number; pause: number; pauseN: number; n: number }>() };
  let totalMs = 0;
  let totalMoves = 0;

  for (const s of solves) {
    const moves = parseAlg(s.moves!);
    const ms = new Map(s.splits!.map((m) => [m.id, m]));
    totalMs += s.ms;
    totalMoves += moves.length;
    const scrambled = applyMoves(WCA_START, parseAlg(s.scramble));
    let prevIdx = -1;
    let prevMs = 0;
    for (const id of PHASE_ORDER) {
      const m = ms.get(id)!;
      const n = m.moveIndex - prevIdx;
      const dur = (m.ms - prevMs) / 1000;
      // Pause = Zeit bis zum ersten Zug der Phase
      const firstMoveMs = n > 0 && s.times ? s.times[prevIdx + 1] : null;
      const pause = firstMoveMs !== null && firstMoveMs !== undefined ? Math.max(0, (firstMoveMs - prevMs) / 1000) : null;
      const a = acc.get(id) ?? { dur: 0, pause: 0, pauseN: 0, exec: 0, moves: 0, n: 0 };
      a.dur += dur;
      a.moves += n;
      a.n++;
      if (pause !== null) {
        a.pause += pause;
        a.pauseN++;
        a.exec += Math.max(0.01, dur - pause);
      }
      acc.set(id, a);

      if ((id === 'oll' || id === 'pll') && n > 0) {
        const at = homed(applyMoves(scrambled, moves.slice(0, prevIdx + 1)));
        const r = id === 'oll' ? recognizeOLL(at) : recognizePLL(at);
        if (r) {
          const map = cases[id];
          const c = map.get(r.caseRef.id) ?? { sum: 0, pause: 0, pauseN: 0, n: 0 };
          c.sum += dur;
          c.n++;
          if (pause !== null) {
            c.pause += pause;
            c.pauseN++;
          }
          map.set(r.caseRef.id, c);
        }
      }
      prevIdx = m.moveIndex;
      prevMs = m.ms;
    }
  }

  const phases: PhaseStat[] = PHASE_ORDER.map((id) => {
    const a = acc.get(id)!;
    return {
      id,
      label: MILESTONE_LABEL[id],
      avg: a.dur / a.n,
      pause: a.pauseN ? a.pause / a.pauseN : null,
      tps: a.pauseN && a.exec > 0 ? a.moves / a.n / (a.exec / a.pauseN) : null,
      moves: a.moves / a.n,
      ref: SUB10_PROFILE[id],
    };
  });
  const toList = (m: Map<string, { sum: number; pause: number; pauseN: number; n: number }>): CaseTime[] =>
    [...m].map(([caseId, v]) => ({ caseId, n: v.n, avg: v.sum / v.n, pause: v.pauseN ? v.pause / v.pauseN : null })).sort((x, y) => y.avg - x.avg);
  const gaps = phases.filter((p) => p.avg > p.ref).sort((x, y) => y.avg - y.ref - (x.avg - x.ref));

  return {
    count: solves.length,
    avgTime: totalMs / solves.length / 1000,
    avgMoves: totalMoves / solves.length,
    avgTps: totalMoves / (totalMs / 1000),
    phases,
    oll: toList(cases.oll),
    pll: toList(cases.pll),
    biggestGap: gaps[0] ?? null,
  };
}

/** Würfel so drehen, dass die Mittelsteine in Grundposition stehen (Weiss unten, Gelb oben). */
function homed(s: State): State {
  return applyMoves(s, rotationToHome(s));
}
