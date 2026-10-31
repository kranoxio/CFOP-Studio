import { apiPost, eventsUrl } from './api';

export interface BattlePlayer {
  id: string;
  name: string;
  online: boolean;
}

export interface BattleResult {
  ms: number;
  penalty?: '+2' | 'DNF';
}

export interface BattleState {
  code: string;
  puzzle: 2 | 3 | 4;
  round: number;
  scramble: string;
  host: string;
  players: BattlePlayer[];
  /** results[runde-1][spielerId] */
  results: Record<string, BattleResult>[];
}

interface Session {
  code: string;
  playerId: string;
}

const SESSION_KEY = 'cfop-studio:battle';
export const effectiveMs = (r: BattleResult) => (r.penalty === 'DNF' ? Infinity : r.ms + (r.penalty === '+2' ? 2000 : 0));

/**
 * Battle-Verbindung: hält den Raumzustand per Server-Sent Events aktuell.
 * Die Sitzung wird gespeichert, damit ein Neuladen den Raum nicht verlässt.
 */
class Battle {
  state: BattleState | null = null;
  session: Session | null = null;
  private es: EventSource | null = null;
  private listeners = new Set<(s: BattleState | null) => void>();

  constructor() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) this.session = JSON.parse(raw);
    } catch {
      /* ignorieren */
    }
  }

  get active() {
    return !!this.session;
  }

  get playerId() {
    return this.session?.playerId ?? '';
  }

  get isHost() {
    return !!this.state && this.state.host === this.playerId;
  }

  onChange(fn: (s: BattleState | null) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l(this.state));
  }

  async create(name: string, puzzle: 2 | 3 | 4) {
    const r = await apiPost<{ code: string; playerId: string; room: BattleState }>('/rooms', { name, puzzle });
    this.enter(r);
  }

  async join(code: string, name: string) {
    const r = await apiPost<{ code: string; playerId: string; room: BattleState }>(`/rooms/${code.trim().toUpperCase()}/join`, { name });
    this.enter(r);
  }

  private enter(r: { code: string; playerId: string; room: BattleState }) {
    this.session = { code: r.code, playerId: r.playerId };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    } catch {
      /* ignorieren */
    }
    this.state = r.room;
    this.connect();
    this.emit();
  }

  /** Nach dem Neuladen wieder verbinden */
  resume() {
    if (this.session && !this.es) this.connect();
  }

  private connect() {
    if (!this.session) return;
    this.es?.close();
    const es = new EventSource(eventsUrl(this.session.code, this.session.playerId));
    es.addEventListener('state', (e) => {
      this.state = JSON.parse((e as MessageEvent).data);
      this.emit();
    });
    es.onerror = () => {
      // Raum existiert nicht mehr (Server neu gestartet)? Dann Sitzung beenden.
      if (es.readyState === EventSource.CLOSED) this.leave();
    };
    this.es = es;
  }

  /** Eigene Zeit für die aktuelle Runde melden (nur einmal pro Runde) */
  async submit(ms: number, penalty?: '+2' | 'DNF') {
    if (!this.session || !this.state) return;
    if (this.state.results[this.state.round - 1]?.[this.playerId]) return;
    await apiPost(`/rooms/${this.session.code}/result`, { playerId: this.playerId, round: this.state.round, ms, penalty });
  }

  async next() {
    if (!this.session) return;
    await apiPost(`/rooms/${this.session.code}/next`, { playerId: this.playerId });
  }

  leave() {
    this.es?.close();
    this.es = null;
    this.session = null;
    this.state = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignorieren */
    }
    this.emit();
  }

  /** Rangliste über alle Runden: Siege, Mittelwert, Bestzeit */
  standings() {
    const s = this.state;
    if (!s) return [];
    return s.players
      .map((p) => {
        const times = s.results.map((r) => r[p.id]).filter(Boolean).map(effectiveMs);
        const finite = times.filter(isFinite);
        const wins = s.results.filter((r) => {
          const mine = r[p.id];
          if (!mine) return false;
          return Object.values(r).every((o) => effectiveMs(mine) <= effectiveMs(o));
        }).length;
        return {
          player: p,
          wins,
          solves: times.length,
          mean: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : Infinity,
          best: finite.length ? Math.min(...finite) : Infinity,
        };
      })
      .sort((a, b) => b.wins - a.wins || a.mean - b.mean);
  }
}

export const battle = new Battle();
