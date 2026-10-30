import type { State } from '../cube/cube';
import { algStyle, getCustomAlgs } from '../algs/registry';
import { optimalCross, optimalXCross, slotCosts, solveCFOP, type Solution, type SolveOptions } from './cfop';
import type { WorkerApi, WorkerRequest } from './worker';

type Fn = keyof WorkerApi;
type Result<F extends Fn> = { result: ReturnType<WorkerApi[F]>; ms: number };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: { result: unknown; ms: number }) => void; reject: (e: Error) => void }>();

const LOCAL: WorkerApi = {
  solve: (state, opts) => solveCFOP(state, opts),
  cross: (state) => optimalCross(state),
  xcross: (state) => optimalXCross(state),
  slotCosts: (state) => slotCosts(state),
};

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, result, ms, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve({ result, ms });
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

function callLocal<F extends Fn>(fn: F, args: Parameters<WorkerApi[F]>): Result<F> {
  const t0 = performance.now();
  const result = (LOCAL[fn] as (...a: unknown[]) => unknown)(...args) as ReturnType<WorkerApi[F]>;
  return { result, ms: performance.now() - t0 };
}

/** Ruft eine Solver-Funktion im Web Worker auf, damit die Oberfläche nie stockt. */
export function callSolver<F extends Fn>(fn: F, ...args: Parameters<WorkerApi[F]>): Promise<Result<F>> {
  const w = getWorker();
  if (!w) return Promise.resolve(callLocal(fn, args));
  const id = nextId++;
  return new Promise<Result<F>>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: { result: unknown; ms: number }) => void, reject });
    w.postMessage({ type: 'call', id, fn, args, custom: getCustomAlgs(), style: algStyle() } satisfies WorkerRequest);
  }).catch(() => callLocal(fn, args));
}

export async function solveAsync(state: State, opts: SolveOptions): Promise<{ solution: Solution; ms: number }> {
  const { result, ms } = await callSolver('solve', state, opts);
  return { solution: result, ms };
}
