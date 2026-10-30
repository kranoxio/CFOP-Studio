import type { State } from '../cube/cube';
import { getCustomAlgs } from '../algs/registry';
import { solveCFOP, type Solution, type SolveOptions } from './cfop';
import type { WorkerRequest } from './worker';

interface Result {
  solution: Solution;
  /** reine Rechenzeit in ms */
  ms: number;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, solution, ms, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve({ solution, ms });
      else p.reject(new Error(error));
    };
    worker.onerror = () => {
      // Worker nicht verfügbar: auf Hauptthread ausweichen
      worker = null;
      for (const p of pending.values()) p.reject(new Error('worker'));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Baut die Suchtabellen im Hintergrund auf (beim App-Start aufrufen). */
export function warmupSolver() {
  getWorker()?.postMessage({ type: 'warmup' } satisfies WorkerRequest);
}

function solveSync(state: State, opts: SolveOptions): Result {
  const t0 = performance.now();
  return { solution: solveCFOP(state, opts), ms: performance.now() - t0 };
}

/** Löst im Web Worker, damit die Oberfläche nie stockt. */
export function solveAsync(state: State, opts: SolveOptions): Promise<Result> {
  const w = getWorker();
  if (!w) return Promise.resolve(solveSync(state, opts));
  const id = nextId++;
  return new Promise<Result>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: 'solve', id, state, opts, custom: getCustomAlgs() } satisfies WorkerRequest);
  }).catch(() => solveSync(state, opts));
}
