/// <reference lib="webworker" />
import type { State } from '../cube/cube';
import { setCustomAlgs } from '../algs/registry';
import { solveCFOP, type SolveOptions } from './cfop';
import { getCrossTable, getPairTable } from './tables';

export type WorkerRequest =
  | { type: 'warmup' }
  | { type: 'solve'; id: number; state: State; opts: SolveOptions; custom: Record<string, string> };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'warmup') {
    // Tabellen vorab aufbauen, damit die erste Lösung sofort da ist
    getCrossTable();
    for (let i = 0; i < 4; i++) getPairTable(i);
    return;
  }
  setCustomAlgs(msg.custom);
  try {
    const t0 = performance.now();
    const solution = solveCFOP(msg.state, msg.opts);
    self.postMessage({ id: msg.id, ok: true, solution, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};
