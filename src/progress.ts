import { storage } from './util/storage';

export type LearnStatus = 'new' | 'learning' | 'learned';

export interface CaseProgress {
  status?: LearnStatus;
  fav?: boolean;
  hits?: number;
  misses?: number;
  /** Summe der Erkennungszeiten (ms) und Anzahl */
  recogSum?: number;
  recogN?: number;
  /** Spaced Repetition (SM-2): fällig ab (ms), Intervall (Tage), Leichtigkeit, Wiederholungen */
  due?: number;
  interval?: number;
  ease?: number;
  reps?: number;
  /** Alg-Drill: Ausführungszeiten (ms) */
  execSum?: number;
  execN?: number;
  execBest?: number;
}

const DAY = 86_400_000;

/** Bewertung im Trainer: 1 = nochmal, 3 = schwer, 4 = gut, 5 = leicht */
export type Grade = 1 | 3 | 4 | 5;

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
  /**
   * Plant die nächste Wiederholung nach SM-2. "Nochmal" kommt in einer Minute wieder,
   * sonst wachsen die Abstände (1 Tag, 3 Tage, dann × Leichtigkeit).
   */
  grade(id: string, g: Grade, now = Date.now()) {
    const p = { ...data[id] };
    let ease = p.ease ?? 2.5;
    let reps = p.reps ?? 0;
    let interval = p.interval ?? 0;
    if (g < 3) {
      reps = 0;
      interval = 0;
      p.due = now + 60_000;
    } else {
      reps++;
      interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
      if (g === 3) interval = Math.max(1, Math.round(interval * 0.6));
      if (g === 5) interval = Math.round(interval * 1.3);
      p.due = now + interval * DAY;
    }
    ease = Math.max(1.3, ease + 0.1 - (5 - g) * (0.08 + (5 - g) * 0.02));
    Object.assign(p, { ease, reps, interval });
    if (reps >= 4 && interval >= 14 && p.status !== 'learned') p.status = 'learned';
    data[id] = p;
    save();
  },
  /** Fällig = noch nie geplant oder Fälligkeitsdatum erreicht */
  isDue(id: string, now = Date.now()) {
    const p = data[id];
    return !p?.due || p.due <= now;
  },
  dueAt(id: string) {
    return data[id]?.due ?? 0;
  },
  recordExec(id: string, ms: number) {
    const p = { ...data[id] };
    p.execSum = (p.execSum ?? 0) + ms;
    p.execN = (p.execN ?? 0) + 1;
    p.execBest = Math.min(p.execBest ?? Infinity, ms);
    data[id] = p;
    save();
  },
  /** Alle gespeicherten Daten (für Sync) */
  dump(): Record<string, CaseProgress> {
    return JSON.parse(JSON.stringify(data));
  },
  /** Daten aus dem Sync übernehmen (der Speicher ist schon aktualisiert – nicht erneut speichern) */
  load(next: Record<string, CaseProgress>) {
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, next);
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
