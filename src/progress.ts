import { storage } from './util/storage';

export type LearnStatus = 'new' | 'learning' | 'learned';

interface CaseProgress {
  status?: LearnStatus;
  fav?: boolean;
  hits?: number;
  misses?: number;
  /** Summe der Erkennungszeiten (ms) und Anzahl */
  recogSum?: number;
  recogN?: number;
}

const KEY = 'progress';
const data: Record<string, CaseProgress> = storage.get(KEY, {});
const listeners = new Set<() => void>();

function save() {
  storage.set(KEY, data);
  listeners.forEach((l) => l());
}

export const progress = {
  get(id: string): CaseProgress {
    return data[id] ?? {};
  },
  status(id: string): LearnStatus {
    return data[id]?.status ?? 'new';
  },
  cycleStatus(id: string): LearnStatus {
    const order: LearnStatus[] = ['new', 'learning', 'learned'];
    const next = order[(order.indexOf(this.status(id)) + 1) % 3];
    data[id] = { ...data[id], status: next };
    save();
    return next;
  },
  setStatus(id: string, status: LearnStatus) {
    data[id] = { ...data[id], status };
    save();
  },
  isFav(id: string) {
    return !!data[id]?.fav;
  },
  toggleFav(id: string) {
    data[id] = { ...data[id], fav: !data[id]?.fav };
    save();
    return !!data[id].fav;
  },
  record(id: string, known: boolean, recogMs: number) {
    const p = { ...data[id] };
    if (known) p.hits = (p.hits ?? 0) + 1;
    else p.misses = (p.misses ?? 0) + 1;
    p.recogSum = (p.recogSum ?? 0) + recogMs;
    p.recogN = (p.recogN ?? 0) + 1;
    if (known && (p.hits ?? 0) >= 3 && (p.misses ?? 0) <= (p.hits ?? 0) / 3 && p.status !== 'learned') p.status = 'learning';
    data[id] = p;
    save();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
