import { applyMove, isRotation, solvedState, type Move, type State } from '../cube/cube';

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutSnap = (t: number) => 1 - Math.pow(1 - t, 3.2);

/** Relative Dauer eines Zuges (Doppelzüge dauern etwas länger, wie beim echten Würfel). */
export function moveWeight(m: Move) {
  if (isRotation(m)) return m.amount === 2 ? 1.5 : 1.15;
  return m.amount === 2 ? 1.4 : 1;
}

export interface PlayerFrame {
  /** Zustand, der gemalt werden soll (vor dem laufenden Zug) */
  state: State;
  move: Move | null;
  progress: number;
}

/**
 * Spielt eine Zugfolge ab: vorwärts, rückwärts, springen, Geschwindigkeit in TPS.
 * Alle Zwischenzustände werden vorab berechnet, damit das Springen sofort geht.
 */
export class MovePlayer {
  moves: Move[] = [];
  states: State[] = [solvedState()];
  /** Anzahl vollständig ausgeführter Züge */
  index = 0;
  private progress = 0;
  private reverse = false;
  playing = false;
  tps = 4;
  /** Stoppt automatisch an diesem Index */
  stopAt: number | null = null;
  onIndex: ((index: number) => void) | null = null;
  onFinish: (() => void) | null = null;
  ease: (t: number) => number = easeInOut;

  load(base: State, moves: Move[], index = 0) {
    this.moves = moves;
    this.states = [base];
    for (const m of moves) this.states.push(applyMove(this.states[this.states.length - 1], m));
    this.index = Math.min(index, moves.length);
    this.progress = 0;
    this.reverse = false;
    this.playing = false;
    this.stopAt = null;
    this.onIndex?.(this.index);
  }

  get state() {
    return this.states[this.index];
  }

  get finished() {
    return this.index >= this.moves.length;
  }

  get animating() {
    return this.progress > 0;
  }

  play() {
    if (this.finished) return;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  seek(index: number) {
    this.index = Math.max(0, Math.min(this.moves.length, index));
    this.progress = 0;
    this.reverse = false;
    this.onIndex?.(this.index);
  }

  /** Einen Zug animiert vorwärts. */
  stepForward() {
    if (this.progress > 0) this.completeCurrent();
    if (this.finished) return;
    this.playing = false;
    this.reverse = false;
    this.stopAt = this.index + 1;
    this.progress = 0.0001;
  }

  /** Einen Zug animiert zurück. */
  stepBack() {
    if (this.progress > 0) this.completeCurrent();
    if (this.index === 0) return;
    this.playing = false;
    this.index--;
    this.reverse = true;
    this.progress = 0.9999;
    this.onIndex?.(this.index);
  }

  private completeCurrent() {
    if (this.reverse) {
      this.progress = 0;
      this.reverse = false;
    } else {
      this.progress = 0;
      this.index++;
      this.onIndex?.(this.index);
    }
  }

  update(dt: number) {
    if (this.reverse) {
      const m = this.moves[this.index];
      this.progress -= (dt * this.tps) / moveWeight(m);
      if (this.progress <= 0) {
        this.progress = 0;
        this.reverse = false;
      }
      return;
    }
    const wantsMove = this.progress > 0 || (this.playing && !this.finished);
    if (!wantsMove) return;
    let remaining = dt;
    while (remaining > 0 && !this.finished) {
      if (this.progress === 0) {
        if (!this.playing) break;
        if (this.stopAt !== null && this.index >= this.stopAt) {
          this.playing = false;
          this.stopAt = null;
          break;
        }
      }
      const m = this.moves[this.index];
      const need = ((1 - this.progress) * moveWeight(m)) / this.tps;
      if (remaining < need) {
        this.progress += (remaining * this.tps) / moveWeight(m);
        remaining = 0;
      } else {
        remaining -= need;
        this.progress = 0;
        this.index++;
        this.onIndex?.(this.index);
        if (this.stopAt !== null && this.index >= this.stopAt) {
          this.playing = false;
          this.stopAt = null;
          break;
        }
        // Restzeit fliesst in den nächsten Zug, damit die Gesamtdauer exakt stimmt
      }
    }
    if (this.finished && this.playing) {
      this.playing = false;
      this.onFinish?.();
    }
  }

  frame(): PlayerFrame {
    if (this.progress > 0 && this.index < this.moves.length) {
      return { state: this.states[this.index], move: this.moves[this.index], progress: this.ease(this.progress) };
    }
    return { state: this.states[this.index], move: null, progress: 0 };
  }
}
