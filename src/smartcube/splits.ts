import { applyMoves, movesPerm, type Move, type State } from '../cube/cube';
import { SLOTS, crossSolved, f2lSolved, isSolved, ollSolved, slotSolved, LL_FACELETS, CROSS_FACELETS } from '../cube/analysis';
import { conjugateMove, htm, invertAlg, rotationToHome } from '../cube/notation';
import { recognizeOLL, recognizePLL, type SolveStep } from '../solver/cfop';

/** Zeitpunkte (Zugindex, Millisekunden), an denen eine Phase erstmals erreicht wurde */
export interface Milestone {
  /** 'cross' | 'f2l1'..'f2l4' | 'oll' | 'pll' */
  id: string;
  moveIndex: number;
  ms: number;
}

export const MILESTONE_LABEL: Record<string, string> = {
  cross: 'Kreuz',
  f2l1: 'F2L 1',
  f2l2: 'F2L 2',
  f2l3: 'F2L 3',
  f2l4: 'F2L 4',
  oll: 'OLL',
  pll: 'PLL',
};

/**
 * Verfolgt einen Solve Zug für Zug und erkennt, wann Kreuz, F2L-Paare, OLL und PLL fertig sind.
 * Arbeitet unabhängig davon, wie der Würfel gehalten wird (Mittelsteine bestimmen die Orientierung).
 */
export class SplitTracker {
  readonly milestones: Milestone[] = [];
  private pairs = 0;

  /** Nach jedem Zug mit dem aktuellen Zustand aufrufen */
  update(state: State, moveIndex: number, ms: number) {
    const s = applyMoves(state, rotationToHome(state));
    const reached = (id: string) => this.milestones.some((m) => m.id === id);
    const add = (id: string) => !reached(id) && this.milestones.push({ id, moveIndex, ms });
    if (!crossSolved(s)) return;
    add('cross');
    const solvedPairs = SLOTS.filter((sl) => slotSolved(s, sl)).length;
    while (this.pairs < solvedPairs) {
      this.pairs++;
      add(`f2l${this.pairs}`);
    }
    if (f2lSolved(s) && ollSolved(s)) {
      while (this.pairs < 4) add(`f2l${++this.pairs}`);
      add('oll');
    }
    if (isSolved(s)) {
      add('oll');
      add('pll');
    }
  }

  get done() {
    return this.milestones.some((m) => m.id === 'pll');
  }
}

const FOCUS: Record<string, number[]> = { cross: CROSS_FACELETS, oll: LL_FACELETS, pll: LL_FACELETS };

/**
 * Baut aus einem eigenen Solve (Züge im WCA-Rahmen) Lösungsschritte für die Wiedergabe:
 * Inspektion (Drehung auf Weiss unten), dann je Phase die eigenen Züge, mit erkannten OLL/PLL-Fällen.
 */
export function reconstructionSteps(scrambled: State, moves: Move[], milestones: Milestone[]): SolveStep[] {
  const rot = rotationToHome(scrambled);
  const inv = movesPerm(invertAlg(rot));
  const framed = moves.map((m) => conjugateMove(m, inv));
  const steps: SolveStep[] = [];
  if (rot.length) {
    steps.push({ phase: 'inspection', title: 'Inspektion', subtitle: 'Weiss unten, Grün vorne', moves: rot, aufCount: 0, postAufCount: 0, method: 'rotation', focus: [] });
  }
  let state = applyMoves(scrambled, rot);
  let from = 0;
  let fromMs = 0;
  for (const ms of milestones) {
    const seg = framed.slice(from, ms.moveIndex + 1);
    const before = state;
    state = applyMoves(state, seg);
    const secs = (ms.ms - fromMs) / 1000;
    const tps = secs > 0 ? htm(seg) / secs : 0;
    const phase = ms.id.startsWith('f2l') ? 'f2l' : (ms.id as SolveStep['phase']);
    let subtitle = `${secs.toFixed(2)} s · ${htm(seg)} Züge · ${tps.toFixed(1)} TPS`;
    let caseId: string | undefined;
    let focus = FOCUS[ms.id] ?? [];
    if (phase === 'f2l') {
      const slot = SLOTS.find((sl) => !slotSolved(before, sl) && slotSolved(state, sl));
      if (slot) {
        focus = [...slot.cornerFacelets, ...slot.edgeFacelets];
        subtitle += ` · ${slot.label}`;
      }
    }
    if (phase === 'oll') {
      const r = recognizeOLL(before);
      if (r) {
        caseId = r.caseRef.id;
        subtitle = `OLL ${r.caseRef.key}${r.caseRef.name ? ` · ${r.caseRef.name}` : ''} · ${subtitle}`;
      } else if (!seg.length) subtitle = 'OLL Skip!';
    }
    if (phase === 'pll') {
      const r = recognizePLL(before);
      if (r) {
        caseId = r.caseRef.id;
        subtitle = `${r.caseRef.name} · ${subtitle}`;
      } else if (htm(seg) <= 1) subtitle = `PLL Skip! · ${subtitle}`;
    }
    steps.push({
      phase,
      title: MILESTONE_LABEL[ms.id],
      subtitle,
      caseId,
      moves: seg,
      aufCount: 0,
      postAufCount: 0,
      method: caseId ? 'alg' : 'search',
      focus,
    });
    from = ms.moveIndex + 1;
    fromMs = ms.ms;
  }
  return steps;
}
