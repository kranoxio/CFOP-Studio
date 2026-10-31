import type { Move } from '../cube/cube';
import { formatAlg } from '../cube/notation';
import { settings } from '../settings';
import { parseFor, scrambleFor, setPuzzle, wcaStart } from './puzzle';
import { battlePanel } from './battlePanel';
import { battle } from '../net/battle';
import { storage } from '../util/storage';
import { smartCube, type SmartMove } from '../smartcube/smartcube';
import { ScrambleTracker } from '../smartcube/tracker';
import { MILESTONE_LABEL, SplitTracker, type Milestone } from '../smartcube/splits';
import { clear, fmtTime, h, toast } from './dom';
import { netDiagram, netDiagram2, netDiagram4 } from './caseDiagram';
import { engineFor } from '../cube/engine';
import { smartCubeCard } from './settingsPanel';

export interface Solve {
  ms: number;
  penalty?: '+2' | 'DNF';
  scramble: string;
  at: number;
  /** Nur bei Smartcube-Solves: eigene Züge (WCA-Rahmen) und erreichte Phasen */
  moves?: string;
  splits?: Milestone[];
  /** Zeitpunkt jedes Zuges in ms seit Start (für Pausen- und Erkennungsanalyse) */
  times?: number[];
}

/** Eigene Session je Puzzle */
const solvesKey = () => (settings.puzzle === 3 ? 'solves' : `solves${settings.puzzle}`);

const effective = (s: Solve) => (s.penalty === 'DNF' ? Infinity : s.ms + (s.penalty === '+2' ? 2000 : 0));

/** WCA-Durchschnitt: bestes und schlechtestes Ergebnis fallen weg. */
export function averageOf(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  const times = solves.slice(0, n).map(effective).sort((a, b) => a - b);
  const trimmed = times.slice(1, -1);
  return trimmed.some((t) => !isFinite(t)) ? Infinity : trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

/**
 * Stoppuhr wie bei einem Stackmat: Leertaste/Bildschirm halten, loslassen = Start.
 * Mit Smartcube: Scramble-Assistent, Start beim ersten Zug, automatischer Stopp und Splits.
 */
export class TimerView {
  readonly el: HTMLElement;
  private solves: Solve[] = storage.get(solvesKey(), []);
  private scramble: Move[] = scrambleFor();
  private display = h('div', { class: 'timer-display mono' }, '0.00');
  private scrambleEl = h('div', { class: 'scramble-text mono big-scramble' });
  private previewEl = h('div', { class: 'timer-preview' });
  private statsEl = h('div', { class: 'stat-row' });
  private listEl = h('div', { class: 'solve-list' });
  private smartEl = h('div', { class: 'smart-timer' });
  private splitsEl = h('div', { class: 'splits' });
  private helpEl = h('div', { class: 'muted small timer-help' });
  private sessionTitle = h('h3', null, 'Session');
  private state: 'idle' | 'holding' | 'ready' | 'running' = 'idle';
  private holdTimer = 0;
  private startAt = 0;
  private raf = 0;
  private pad: HTMLElement;

  // Smartcube
  private tracker: ScrambleTracker | null = null;
  private smartPhase: 'off' | 'scramble' | 'ready' | 'running' = 'off';
  private smartMoves: Move[] = [];
  private smartTimes: number[] = [];
  private split: SplitTracker | null = null;
  private lastMoveAt = 0;

  constructor() {
    this.pad = h('div', { class: 'timer-pad' }, this.display, this.splitsEl, this.helpEl);
    this.pad.addEventListener('pointerdown', (e) => {
      if (this.smartPhase !== 'off') return;
      e.preventDefault();
      this.down();
    });
    this.pad.addEventListener('pointerup', (e) => {
      if (this.smartPhase !== 'off') return;
      e.preventDefault();
      this.up();
    });
    this.el = h(
      'section',
      { class: 'view timer-view' },
      h(
        'div',
        { class: 'timer-layout' },
        h(
          'div',
          { class: 'timer-col' },
          h(
            'div',
            { class: 'card glass' },
            h('div', { class: 'card-head' }, h('h3', null, 'Scramble'), h('button', { class: 'btn', onclick: () => this.newScramble() }, '🎲 Neu')),
            this.scrambleEl,
            this.smartEl,
            this.previewEl,
          ),
          battlePanel(),
        ),
        this.pad,
        h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, this.sessionTitle, h('button', { class: 'link-btn small', onclick: () => this.clearSession() }, 'Session leeren')), this.statsEl, this.listEl),
      ),
    );
    window.addEventListener('keyup', (e) => {
      if (this.el.classList.contains('active') && e.code === 'Space' && this.smartPhase === 'off') this.up();
    });
    smartCube.onStatus(() => this.setupSmart());
    document.addEventListener('puzzle-change', () => {
      if (this.state === 'running') return;
      this.solves = storage.get(solvesKey(), []);
      this.smartPhase = 'off';
      this.newScramble();
      this.setupSmart();
      this.renderStats();
    });
    smartCube.onMove((ev) => this.onSmartMove(ev));
    // Battle: Scramble des Raums übernehmen, sobald eine neue Runde beginnt
    let lastRound = '';
    battle.onChange((st) => {
      if (!st) return;
      const key = `${st.code}:${st.round}`;
      if (key === lastRound || this.state === 'running' || this.smartPhase === 'running') return;
      lastRound = key;
      if (st.puzzle !== settings.puzzle) setPuzzle(st.puzzle);
      this.scramble = parseFor(st.scramble, st.puzzle);
      this.renderScramble();
      if (smartCube.connected && settings.puzzle === 3) this.setupSmart();
    });
    document.addEventListener('synced', (e) => {
      if ((e as CustomEvent<string[]>).detail.includes(solvesKey())) {
        this.solves = storage.get(solvesKey(), []);
        this.renderStats();
      }
    });
    this.renderScramble();
    this.renderStats();
    this.setupSmart();
  }

  activate() {}
  deactivate() {
    if (this.state === 'running') this.stop();
  }

  onKey(e: KeyboardEvent) {
    if (this.smartPhase !== 'off') return;
    if (e.repeat) {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    if (this.state === 'running') {
      e.preventDefault();
      this.stop();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this.down();
    }
  }

  // ------------------------------------------------------------ Manuell (Stackmat)

  private down() {
    if (this.state === 'running') {
      this.stop();
      return;
    }
    if (this.state !== 'idle') return;
    this.state = 'holding';
    this.pad.className = 'timer-pad holding';
    this.holdTimer = window.setTimeout(() => {
      this.state = 'ready';
      this.pad.className = 'timer-pad ready';
      this.display.textContent = '0.00';
    }, 300);
  }

  private up() {
    clearTimeout(this.holdTimer);
    if (this.state === 'ready') {
      this.state = 'running';
      this.pad.className = 'timer-pad running';
      this.startAt = performance.now();
      this.runDisplay();
    } else if (this.state === 'holding') {
      this.state = 'idle';
      this.pad.className = 'timer-pad';
    }
  }

  private runDisplay() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.display.textContent = fmtTime(performance.now() - this.startAt);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    const ms = performance.now() - this.startAt;
    this.display.textContent = fmtTime(ms);
    this.state = 'idle';
    this.pad.className = 'timer-pad done';
    this.solves.unshift({ ms, scramble: formatAlg(this.scramble), at: Date.now() });
    this.save();
    this.reportBattle(ms);
    this.newScramble();
  }

  // ------------------------------------------------------------ Smartcube

  private setupSmart() {
    this.tracker?.stop();
    this.tracker = null;
    clear(this.smartEl);
    if (!smartCube.connected || settings.puzzle !== 3) {
      this.smartPhase = 'off';
      if (settings.puzzle !== 3) {
        this.helpEl.textContent = 'Leertaste halten (oder hier gedrückt halten) → loslassen startet. Beliebige Taste stoppt.';
        return;
      }
      this.helpEl.textContent = 'Leertaste halten (oder hier gedrückt halten) → loslassen startet. Beliebige Taste stoppt.';
      this.smartEl.append(h('details', { class: 'smart-connect' }, h('summary', null, '🔵 Mit Smartcube: automatische Splits'), smartCubeCard()));
      return;
    }
    if (this.smartPhase === 'running') return;
    this.smartPhase = 'scramble';
    this.tracker = new ScrambleTracker(this.scramble, () => this.smartReady());
    this.smartEl.append(h('div', { class: 'smart-head' }, h('span', { class: 'led on' }), `Smartcube: Scramble am echten Würfel ausführen`), this.tracker.el);
    this.tracker.start();
    this.helpEl.textContent = 'Smartcube-Modus: Timer startet mit dem ersten Zug nach dem Scramble und stoppt automatisch.';
    this.pad.className = 'timer-pad';
  }

  private smartReady() {
    this.smartPhase = 'ready';
    this.pad.className = 'timer-pad ready';
    this.display.textContent = '0.00';
    this.helpEl.textContent = 'Bereit! Inspektion – der Timer startet mit deinem ersten Zug.';
  }

  private onSmartMove(ev: SmartMove) {
    if (this.smartPhase === 'ready') {
      this.smartPhase = 'running';
      this.tracker?.stop();
      this.smartMoves = [];
      this.smartTimes = [];
      this.split = new SplitTracker();
      this.startAt = ev.time;
      this.pad.className = 'timer-pad running';
      clear(this.splitsEl);
      this.runDisplay();
    }
    if (this.smartPhase !== 'running' || !this.split) return;
    this.smartMoves.push(ev.move);
    this.smartTimes.push(Math.round(ev.time - this.startAt));
    this.lastMoveAt = ev.time;
    const before = this.split.milestones.length;
    this.split.update(smartCube.state, this.smartMoves.length - 1, ev.time - this.startAt);
    if (this.split.milestones.length !== before) this.renderSplits(this.split.milestones);
    if (this.split.done) this.finishSmart();
  }

  private finishSmart() {
    cancelAnimationFrame(this.raf);
    const ms = this.lastMoveAt - this.startAt;
    this.display.textContent = fmtTime(ms);
    this.pad.className = 'timer-pad done';
    const solve: Solve = {
      ms,
      scramble: formatAlg(this.scramble),
      at: Date.now(),
      moves: formatAlg(this.smartMoves),
      times: this.smartTimes,
      splits: this.split!.milestones,
    };
    this.solves.unshift(solve);
    this.save();
    this.reportBattle(ms);
    this.renderSplits(solve.splits!, solve);
    this.smartPhase = 'scramble';
    this.newScramble();
  }

  private renderSplits(ms: Milestone[], solve?: Solve) {
    clear(this.splitsEl);
    let prev = 0;
    const row = h('div', { class: 'split-row' });
    for (const m of ms) {
      row.append(h('div', { class: 'split' }, h('span', { class: 'muted small' }, MILESTONE_LABEL[m.id]), h('b', { class: 'mono' }, ((m.ms - prev) / 1000).toFixed(2))));
      prev = m.ms;
    }
    this.splitsEl.append(row);
    if (solve) {
      const moves = solve.moves!.split(' ').length;
      this.splitsEl.append(
        h('div', { class: 'split-summary muted small' }, `${moves} Züge · ${(moves / (solve.ms / 1000)).toFixed(2)} TPS`),
        h('button', { class: 'btn primary', onclick: (e: Event) => { e.stopPropagation(); this.showReconstruction(solve); } }, '🧊 Rekonstruktion ansehen'),
      );
    }
  }

  private showReconstruction(s: Solve) {
    document.dispatchEvent(new CustomEvent('show-reconstruction', { detail: s }));
  }

  // ------------------------------------------------------------ Allgemein

  private save() {
    storage.set(solvesKey(), this.solves.slice(0, 1000));
    this.renderStats();
  }

  private clearSession() {
    if (!confirm('Alle Zeiten dieser Session löschen?')) return;
    this.solves = [];
    this.save();
  }

  /** Im Battle-Raum: Zeit melden, sofern der Scramble der aktuellen Runde gelöst wurde */
  private reportBattle(ms: number) {
    const st = battle.state;
    if (!st || formatAlg(parseFor(st.scramble, st.puzzle)) !== formatAlg(this.scramble)) return;
    battle.submit(ms).catch((e) => toast(`Battle: ${e.message}`));
  }

  private newScramble() {
    // Im Battle-Raum gilt immer der Scramble des Raums, bis der Gastgeber weiterschaltet
    if (battle.state) {
      this.scramble = parseFor(battle.state.scramble, battle.state.puzzle);
      this.renderScramble();
      if (smartCube.connected && settings.puzzle === 3 && this.smartPhase !== 'running') this.setupSmart();
      return;
    }
    this.scramble = scrambleFor();
    this.renderScramble();
    if (smartCube.connected && settings.puzzle === 3 && this.smartPhase !== 'running') this.setupSmart();
  }

  private renderScramble() {
    clear(this.scrambleEl);
    this.scrambleEl.append(formatAlg(this.scramble));
    clear(this.previewEl);
    const st = this.scramble.reduce((s, m) => engineFor(settings.puzzle).apply(s, m), wcaStart());
    this.previewEl.append(settings.puzzle === 2 ? netDiagram2(st, 180) : settings.puzzle === 4 ? netDiagram4(st, 230) : netDiagram(st, 220));
  }

  private renderStats() {
    this.sessionTitle.textContent = `Session ${settings.puzzle}×${settings.puzzle}`;
    clear(this.statsEl);
    const valid = this.solves.map(effective).filter(isFinite);
    const stat = (label: string, v: number | null) => h('div', { class: 'stat' }, h('b', null, v === null ? '–' : fmtTime(v)), h('span', null, label));
    this.statsEl.append(
      stat('Bestzeit', valid.length ? Math.min(...valid) : null),
      stat('ao5', averageOf(this.solves, 5)),
      stat('ao12', averageOf(this.solves, 12)),
      stat('Mittel', valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null),
    );
    clear(this.listEl);
    this.solves.slice(0, 100).forEach((s, i) => {
      const ao5 = averageOf(this.solves.slice(i), 5);
      this.listEl.append(
        h(
          'div',
          { class: 'solve-row' },
          h('span', { class: 'muted mono' }, `#${this.solves.length - i}`),
          h('b', { class: 'mono' }, s.penalty === 'DNF' ? 'DNF' : fmtTime(effective(s)) + (s.penalty === '+2' ? '+' : '')),
          h('span', { class: 'muted small mono' }, ao5 === null ? '' : `ao5 ${fmtTime(ao5)}`),
          h('span', { class: 'solve-actions' },
            h('button', { class: 'chip-btn small', onclick: () => { s.penalty = s.penalty === '+2' ? undefined : '+2'; this.save(); } }, '+2'),
            h('button', { class: 'chip-btn small', onclick: () => { s.penalty = s.penalty === 'DNF' ? undefined : 'DNF'; this.save(); } }, 'DNF'),
            s.moves
              ? h('button', { class: 'chip-btn small', title: 'Deinen Solve Zug für Zug ansehen', onclick: () => this.showReconstruction(s) }, '🧊 Rekonstruktion')
              : h('button', { class: 'chip-btn small', title: 'CFOP-Lösung dieses Scrambles ansehen', onclick: () => document.dispatchEvent(new CustomEvent('show-scramble', { detail: s.scramble })) }, '🧊 Lösung'),
            h('button', { class: 'chip-btn small', title: 'Löschen', onclick: () => { this.solves.splice(i, 1); this.save(); } }, '✕'),
          ),
        ),
      );
    });
  }
}
