import { applyMoves, solvedState, type Move } from '../cube/cube';
import { formatAlg, parseAlg, randomScramble } from '../cube/notation';
import { storage } from '../util/storage';
import { clear, fmtTime, h } from './dom';
import { netDiagram } from './caseDiagram';

interface Solve {
  ms: number;
  penalty?: '+2' | 'DNF';
  scramble: string;
  at: number;
}

const WCA_START = applyMoves(solvedState(), parseAlg('z2'));
const effective = (s: Solve) => (s.penalty === 'DNF' ? Infinity : s.ms + (s.penalty === '+2' ? 2000 : 0));

/** WCA-Durchschnitt: bestes und schlechtestes Ergebnis fallen weg. */
export function averageOf(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  const times = solves.slice(0, n).map(effective).sort((a, b) => a - b);
  const trimmed = times.slice(1, -1);
  return trimmed.some((t) => !isFinite(t)) ? Infinity : trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

/** Stoppuhr wie bei einem Stackmat: Leertaste/Bildschirm halten, loslassen = Start. */
export class TimerView {
  readonly el: HTMLElement;
  private solves: Solve[] = storage.get('solves', []);
  private scramble: Move[] = randomScramble();
  private display = h('div', { class: 'timer-display mono' }, '0.00');
  private scrambleEl = h('div', { class: 'scramble-text mono big-scramble' });
  private previewEl = h('div', { class: 'timer-preview' });
  private statsEl = h('div', { class: 'stat-row' });
  private listEl = h('div', { class: 'solve-list' });
  private state: 'idle' | 'holding' | 'ready' | 'running' = 'idle';
  private holdTimer = 0;
  private startAt = 0;
  private raf = 0;
  private pad: HTMLElement;

  constructor() {
    this.pad = h('div', { class: 'timer-pad' }, this.display, h('div', { class: 'muted small timer-help' }, 'Leertaste halten (oder hier gedrückt halten) → loslassen startet. Beliebige Taste stoppt.'));
    this.pad.addEventListener('pointerdown', (e) => { e.preventDefault(); this.down(); });
    this.pad.addEventListener('pointerup', (e) => { e.preventDefault(); this.up(); });
    this.el = h(
      'section',
      { class: 'view timer-view' },
      h(
        'div',
        { class: 'timer-layout' },
        h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Scramble'), h('button', { class: 'btn', onclick: () => this.newScramble() }, '🎲 Neu')), this.scrambleEl, this.previewEl),
        this.pad,
        h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Session'), h('button', { class: 'link-btn small', onclick: () => this.clearSession() }, 'Session leeren')), this.statsEl, this.listEl),
      ),
    );
    window.addEventListener('keyup', (e) => {
      if (this.el.classList.contains('active') && e.code === 'Space') this.up();
    });
    this.renderScramble();
    this.renderStats();
  }

  activate() {}
  deactivate() {
    if (this.state === 'running') this.stop();
  }

  onKey(e: KeyboardEvent) {
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
      const loop = () => {
        this.display.textContent = fmtTime(performance.now() - this.startAt);
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    } else if (this.state === 'holding') {
      this.state = 'idle';
      this.pad.className = 'timer-pad';
    }
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    const ms = performance.now() - this.startAt;
    this.display.textContent = fmtTime(ms);
    this.state = 'idle';
    this.pad.className = 'timer-pad done';
    this.solves.unshift({ ms, scramble: formatAlg(this.scramble), at: Date.now() });
    this.save();
    this.newScramble();
  }

  private save() {
    storage.set('solves', this.solves.slice(0, 1000));
    this.renderStats();
  }

  private clearSession() {
    if (!confirm('Alle Zeiten dieser Session löschen?')) return;
    this.solves = [];
    this.save();
  }

  private newScramble() {
    this.scramble = randomScramble();
    this.renderScramble();
  }

  private renderScramble() {
    clear(this.scrambleEl);
    this.scrambleEl.append(formatAlg(this.scramble));
    clear(this.previewEl);
    this.previewEl.append(netDiagram(applyMoves(WCA_START, this.scramble), 220));
  }

  private renderStats() {
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
            h('button', { class: 'chip-btn small', title: 'CFOP-Lösung dieses Scrambles ansehen', onclick: () => document.dispatchEvent(new CustomEvent('show-scramble', { detail: s.scramble })) }, '🧊 Lösung'),
            h('button', { class: 'chip-btn small', title: 'Löschen', onclick: () => { this.solves.splice(i, 1); this.save(); } }, '✕'),
          ),
        ),
      );
    });
  }
}
