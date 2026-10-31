import { applyMoves, moveToString, movesPerm, type Move, type State } from '../../cube/cube';
import { SLOTS, crossSolved, slotSolved, CROSS_FACELETS } from '../../cube/analysis';
import { conjugateMove, formatAlg, invertAlg, randomScramble, rotationToHome, tryParseAlg } from '../../cube/notation';
import { callSolver } from '../../solver/client';
import { WCA_START, smartCube, type SmartMove } from '../../smartcube/smartcube';
import { ScrambleTracker } from '../../smartcube/tracker';
import { settings, saveSettings } from '../../settings';
import { storage } from '../../util/storage';
import { clear, h, toast } from '../dom';
import { PHASE_COLORS } from '../phases';
import type { TrainerContext, TrainerMode } from './types';

interface CrossStats {
  n: number;
  solved: number;
  sumUser: number;
  sumOpt: number;
  optimal: number;
}

const CENTERS = [4, 13, 22, 31, 40, 49];

/**
 * Kreuz-Trainer: Inspektion wie im Wettkampf, Kreuz (oder X-Cross) planen und eingeben –
 * per Tastenfeld oder direkt am Smartcube – und mit der optimalen Lösung vergleichen.
 */
export class CrossMode implements TrainerMode {
  readonly id = 'cross';
  readonly label = 'Kreuz';
  private ctx: TrainerContext | null = null;
  private scramble: Move[] = [];
  private startState: State = WCA_START;
  /** Rotation vom WCA-Rahmen in den Lösungsrahmen (Weiss unten) */
  private rot: Move[] = [];
  private input: Move[] = [];
  private phase: 'track' | 'inspect' | 'result' = 'inspect';
  private startedAt = 0;
  private tracker: ScrambleTracker | null = null;
  private offMove: (() => void) | null = null;
  private inputEl = h('input', { class: 'input mono cross-input', placeholder: 'Deine Kreuz-Lösung, z.B. D R\' F …', autocomplete: 'off', autocapitalize: 'characters' }) as HTMLInputElement;
  private timerEl = h('div', { class: 'trainer-timer mono' });
  private statsEl = h('div');
  private highlight = false;
  private stats: CrossStats = storage.get('crossStats', { n: 0, solved: 0, sumUser: 0, sumOpt: 0, optimal: 0 });

  start(ctx: TrainerContext) {
    this.ctx = ctx;
    this.inputEl.oninput = () => {
      const m = tryParseAlg(this.inputEl.value);
      if (m) this.input = m;
    };
    this.inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') this.evaluate();
    };
    const goalSeg = h(
      'div',
      { class: 'seg-tabs' },
      ...(['cross', 'xcross'] as const).map((g) =>
        h('button', {
          class: `seg ${settings.crossGoal === g ? 'active' : ''}`,
          onclick: (e: Event) => {
            settings.crossGoal = g;
            saveSettings();
            (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('.seg').forEach((b, i) => b.classList.toggle('active', (i === 0) === (g === 'cross')));
            this.next();
          },
        }, g === 'cross' ? 'Kreuz' : 'X-Cross'),
      ),
    );
    const inspToggle = h('input', {
      type: 'checkbox',
      checked: settings.crossInspection,
      onchange: () => {
        settings.crossInspection = inspToggle.checked;
        saveSettings();
      },
    }) as HTMLInputElement;
    const hlToggle = h('input', {
      type: 'checkbox',
      checked: this.highlight,
      onchange: () => {
        this.highlight = hlToggle.checked;
        this.applyLook();
      },
    }) as HTMLInputElement;
    ctx.side.append(
      h(
        'div',
        { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Kreuz-Trainer'), goalSeg),
        h('p', { class: 'muted small' }, 'Plane das weisse Kreuz in der Inspektion und gib deine Lösung ein (Weiss unten, Grün vorne): per Tastenfeld, per Wischen am 3D-Würfel oder – mit Smartcube – direkt am echten Würfel.'),
        h('div', { class: 'toggles' },
          h('label', { class: 'toggle' }, inspToggle, h('span', { class: 'toggle-ui' }), '15 s Inspektion anzeigen'),
          h('label', { class: 'toggle' }, hlToggle, h('span', { class: 'toggle-ui' }), 'Kreuzsteine hervorheben (Hilfe)'),
        ),
      ),
      h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Statistik'), h('button', { class: 'link-btn small', onclick: () => this.resetStats() }, 'zurücksetzen')), this.statsEl),
    );
    ctx.hudTop.append(this.timerEl);
    ctx.view.onFrame = () => this.tick();
    // Eingabe auch per Wischen am 3D-Würfel (praktisch am Handy)
    ctx.view.onSwipe = (m) => {
      if (this.phase !== 'inspect') return;
      this.input.push(m);
      this.inputEl.value = formatAlg(this.input);
      const p = ctx.view.player;
      p.extend([m]);
      p.tps = 10;
      p.play();
      if (this.goalReached(applyMoves(this.startState, this.input))) this.evaluate();
    };
    this.offMove = smartCube.onMove((ev) => this.onSmartMove(ev));
    this.renderStats();
    this.next();
  }

  stop() {
    this.tracker?.stop();
    this.tracker = null;
    this.offMove?.();
    this.offMove = null;
    if (this.ctx) {
      this.ctx.view.onFrame = null;
      this.ctx.view.onSwipe = null;
    }
    this.ctx = null;
  }

  onKey(e: KeyboardEvent) {
    if (this.phase === 'result' && (e.code === 'Space' || e.key === 'Enter')) {
      e.preventDefault();
      this.next();
    }
  }

  private next() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.scramble = randomScramble();
    const scrambled = applyMoves(WCA_START, this.scramble);
    this.rot = rotationToHome(scrambled);
    this.startState = applyMoves(scrambled, this.rot);
    this.input = [];
    this.inputEl.value = '';
    ctx.view.player.load(this.startState, []);
    ctx.view.showArrows = false;
    ctx.view.setPhaseColor(PHASE_COLORS.cross);
    ctx.view.arrowColor = PHASE_COLORS.cross;
    ctx.view.resetCamera('default');
    this.applyLook();
    this.tracker?.stop();
    this.tracker = null;
    if (smartCube.connected) {
      this.phase = 'track';
      this.tracker = new ScrambleTracker(this.scramble, () => this.beginInspection());
      this.tracker.start();
    } else {
      this.beginInspection();
    }
    this.render();
  }

  private beginInspection() {
    this.phase = 'inspect';
    this.startedAt = performance.now();
    this.render();
  }

  private applyLook() {
    const v = this.ctx?.view;
    if (!v) return;
    const focus = new Set([...CROSS_FACELETS, ...CENTERS]);
    v.look = this.highlight ? (home) => (focus.has(home) ? 'color' : 'dim') : undefined;
  }

  private tick() {
    if (this.phase !== 'inspect') return;
    const t = (performance.now() - this.startedAt) / 1000;
    const text = settings.crossInspection ? (t <= 15 ? `${Math.ceil(15 - t)}` : `+${(t - 15).toFixed(0)} s`) : t.toFixed(1);
    if (this.timerEl.textContent !== text) this.timerEl.textContent = text;
    this.timerEl.classList.toggle('late', settings.crossInspection && t > 15);
  }

  /** Smartcube-Zug in den Lösungsrahmen umrechnen (der Würfel meldet im WCA-Rahmen). */
  private toSolvingFrame(m: Move): Move {
    return conjugateMove(m, movesPerm(invertAlg(this.rot)));
  }

  private onSmartMove(ev: SmartMove) {
    const ctx = this.ctx;
    if (!ctx || this.phase !== 'inspect') return;
    const m = this.toSolvingFrame(ev.move);
    this.input.push(m);
    this.inputEl.value = formatAlg(this.input);
    const p = ctx.view.player;
    p.extend([m]);
    p.tps = 12;
    p.play();
    if (this.goalReached(applyMoves(this.startState, this.input))) this.evaluate();
  }

  private goalReached(s: State) {
    if (!crossSolved(s)) return false;
    return settings.crossGoal === 'cross' || SLOTS.some((sl) => slotSolved(s, sl));
  }

  private keypad() {
    const add = (base: string) => {
      this.input.push({ base, amount: 1 });
      this.inputEl.value = formatAlg(this.input);
    };
    const modify = (amount: 2 | 3) => {
      const last = this.input[this.input.length - 1];
      if (!last) return;
      last.amount = last.amount === amount ? 1 : amount;
      this.inputEl.value = formatAlg(this.input);
    };
    return h(
      'div',
      { class: 'keypad' },
      ...['U', 'D', 'R', 'L', 'F', 'B'].map((f) => h('button', { class: 'key', onclick: () => add(f) }, f)),
      h('button', { class: 'key mod', onclick: () => modify(3) }, "'"),
      h('button', { class: 'key mod', onclick: () => modify(2) }, '2'),
      h('button', { class: 'key mod', title: 'Letzten Zug löschen', onclick: () => { this.input.pop(); this.inputEl.value = formatAlg(this.input); } }, '⌫'),
      h('button', { class: 'key go', onclick: () => this.evaluate() }, 'Prüfen'),
    );
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;
    clear(ctx.hudBottom);
    clear(ctx.actions);
    const goal = settings.crossGoal === 'cross' ? 'Kreuz' : 'X-Cross';
    if (this.phase === 'track' && this.tracker) {
      this.timerEl.textContent = '';
      ctx.hudBottom.append(h('div', { class: 'hud-title' }, 'Scramble deinen Würfel'));
      ctx.actions.append(h('div', { class: 'trainer-actions column' }, this.tracker.el, h('button', { class: 'btn', onclick: () => { this.tracker?.stop(); this.beginInspection(); } }, 'Ohne Würfel weiter')));
      return;
    }
    if (this.phase === 'inspect') {
      ctx.hudBottom.append(
        h('div', { class: 'hud-title' }, `Plane das ${goal}`),
        h('div', { class: 'hud-sub mono' }, `Scramble: ${formatAlg(this.scramble)}  ·  dann ${formatAlg(this.rot)}`),
      );
      ctx.actions.append(h('div', { class: 'trainer-actions column' }, this.inputEl, this.keypad()));
    }
  }

  private async evaluate() {
    const ctx = this.ctx;
    if (!ctx || this.phase !== 'inspect') return;
    const parsed = tryParseAlg(this.inputEl.value);
    if (!parsed) return toast('Notation nicht lesbar');
    this.input = parsed;
    this.phase = 'result';
    const planMs = performance.now() - this.startedAt;
    const end = applyMoves(this.startState, this.input);
    const ok = this.goalReached(end);
    const xc = settings.crossGoal === 'xcross';
    clear(ctx.hudBottom);
    ctx.hudBottom.append(h('div', { class: 'hud-title' }, 'Berechne Optimum …'));
    const { result } = xc ? await callSolver('xcross', this.startState) : await callSolver('cross', this.startState);
    if (!this.ctx) return;
    const optimal: Move[] = Array.isArray(result) ? result : (result?.moves ?? []);
    const userLen = this.input.length;
    this.stats.n++;
    if (ok) {
      this.stats.solved++;
      this.stats.sumUser += userLen;
      this.stats.sumOpt += optimal.length;
      if (userLen <= optimal.length) this.stats.optimal++;
    }
    storage.set('crossStats', this.stats);
    this.renderStats();

    const goal = xc ? 'X-Cross' : 'Kreuz';
    const verdict = !ok ? `✗ ${goal} nicht gelöst` : userLen <= optimal.length ? `🏆 Optimal! ${userLen} Züge` : `✓ ${goal} in ${userLen} Zügen`;
    clear(ctx.hudBottom);
    ctx.hudBottom.append(
      h('div', { class: `hud-title ${ok ? '' : 'bad-text'}` }, verdict),
      h('div', { class: 'hud-sub' }, `Optimal: ${optimal.length} Züge · Planung ${(planMs / 1000).toFixed(1)} s`),
    );
    const play = (moves: Move[]) => {
      const p = ctx.view.player;
      p.load(this.startState, moves);
      p.tps = 3;
      ctx.view.showArrows = true;
      setTimeout(() => p.play(), 250);
    };
    clear(ctx.actions);
    ctx.actions.append(
      h(
        'div',
        { class: 'trainer-actions column' },
        h('div', { class: 'cross-compare' },
          h('div', null, h('span', { class: 'muted small' }, 'Deine Lösung'), h('div', { class: 'mono' }, formatAlg(this.input) || '–')),
          h('div', null, h('span', { class: 'muted small' }, 'Optimal'), h('div', { class: 'mono' }, optimal.map(moveToString).join(' ') || '–')),
        ),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => play(this.input) }, '▶ Deine'),
          h('button', { class: 'btn', onclick: () => play(optimal) }, '▶ Optimal'),
          h('button', { class: 'btn primary', onclick: () => this.next() }, 'Nächster (Leertaste)'),
        ),
      ),
    );
    play(optimal);
  }

  private resetStats() {
    this.stats = { n: 0, solved: 0, sumUser: 0, sumOpt: 0, optimal: 0 };
    storage.set('crossStats', this.stats);
    this.renderStats();
  }

  private renderStats() {
    clear(this.statsEl);
    const s = this.stats;
    const stat = (v: string, label: string) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, label));
    this.statsEl.append(
      h('div', { class: 'stat-row' },
        stat(String(s.n), 'Versuche'),
        stat(s.n ? `${Math.round((s.solved / s.n) * 100)}%` : '–', 'gelöst'),
        stat(s.solved ? (s.sumUser / s.solved).toFixed(1) : '–', 'Ø deine Züge'),
        stat(s.solved ? `+${((s.sumUser - s.sumOpt) / s.solved).toFixed(1)}` : '–', 'Ø über Optimum'),
      ),
    );
  }
}
