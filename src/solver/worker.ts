/// <reference lib="webworker" />
import type { State } from '../cube/cube';
import { setCustomAlgs, type AlgStyle } from '../algs/registry';
import { optimalCross, optimalXCross, slotCosts, solveCFOP, type SolveOptions } from './cfop';
import { getCrossTable, getPairTable } from './tables';

/** Funktionen, die der Hauptthread im Worker aufrufen kann */
const API = {
  solve: (state: State, opts: SolveOptions) => solveCFOP(state, opts),
  cross: (state: State) => optimalCross(state),
  xcross: (state: State) => optimalXCross(state),
  slotCosts: (state: State) => slotCosts(state),
};
export type WorkerApi = typeof API;

export type WorkerRequest =
  | { type: 'warmup' }
  | { type: 'call'; id: number; fn: keyof WorkerApi; args: unknown[]; custom: Record<string, string>; style: AlgStyle };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'warmup') {
    // Tabellen vorab aufbauen, damit die erste Lösung sofort da ist
    getCrossTable();
    for (let i = 0; i < 4; i++) getPairTable(i);
    return;
  }
  setCustomAlgs(msg.custom, msg.style);
  try {
    const t0 = performance.now();
    const result = (API[msg.fn] as (...a: unknown[]) => unknown)(...msg.args);
    self.postMessage({ id: msg.id, ok: true, result, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};
