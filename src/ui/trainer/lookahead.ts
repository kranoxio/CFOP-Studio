import { applyMoves, type Move, type State } from '../../cube/cube';
import type { SlotName } from '../../cube/analysis';
import { randomScramble } from '../../cube/notation';
import { callSolver, solveAsync } from '../../solver/client';
import type { SlotCost, SolveStep } from '../../solver/cfop';
import { WCA_START } from '../../smartcube/smartcube';
import { settings, saveSettings } from '../../settings';
import { storage } from '../../util/storage';
import { clear, h } from '../dom';
import { PHASE_COLORS } from '../phases';
import { sliderFromTps, tpsFromSlider } from '../solverView';
import type { TrainerContext, TrainerMode } from './types';

/** Anordnung wie von oben betrachtet: hinten oben, vorne unten */
const SLOT_GRID: { slot: SlotName; label: string; key: string }[] = [
  { slot: 'BL', label: 'Hinten links', key: 'Q' },
  { slot: 'BR', label: 'Hinten rechts', key: 'W' },
  { slot: 'FL', label: 'Vorne links', key: 'A' },
  { slot: 'FR', label: 'Vorne rechts', key: 'S' },
];

type Verdict = 'perfect' | 'good' | 'costly' | 'late';
const VERDICT_TEXT: Record<Verdict, string> = { perfect: 'Perfekt!', good: 'Gut', costly: 'Teuer', late: 'Zu spät' };

interface LookStats {
  rounds: number;
  perfect: number;
  good: number;
  late: number;
  decideSum: number;
}

/**
 * Lookahead-Trainer: Während der Würfel ein Paar einsetzt, musst du schon das nächste
 * Paar finden und seinen Slot antippen – wie beim echten Lösen ohne Pause.
 */
export class LookaheadMode implements TrainerMode {
  readonly id = 'lookahead';
  readonly label = 'Lookahead';
  private ctx: TrainerContext | null = null;
  private steps: SolveStep[] = [];
  /** Zustand vor jedem Abschnitt: [nach Inspektion, nach Kreuz, nach F2L 1, ...] */
  private round = 0;
  private rounds = 0;
  private busyEndsAt = 0;
  private busyStart = 0;
  private costs: SlotCost[] | null = null;
  private picked: SlotName | null = null;
  private pickMs = 0;
  private roundState: State = WCA_START;
  private results: Verdict[] = [];
  private token = 0;
  private buttons = new Map<SlotName, HTMLButtonElement>();
  private bar = h('div', { class: 'decide-bar' }, h('div', { class: 'decide-fill' }));
  private statsEl = h('div');
  private stats: LookStats = storage.get('lookaheadStats', { rounds: 0, perfect: 0, good: 0, late: 0, decideSum: 0 });

  start(ctx: TrainerContext) {
    this.ctx = ctx;
    const speed = h('input', {
      type: 'range',
      class: 'speed-slider',
      min: 0,
      max: 100,
      value: String(sliderFromTps(settings.lookaheadTps)),
      oninput: () => {
        settings.lookaheadTps = tpsFromSlider(Number(speed.value));
        saveSettings();
        label.textContent = `${settings.lookaheadTps.toFixed(1)} TPS`;
      },
    }) as HTMLInputElement;
    const label = h('span', { class: 'speed-label mono' }, `${settings.lookaheadTps.toFixed(1)} TPS`);
    ctx.side.append(
      h(
        'div',
        { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Lookahead-Trainer')),
        h('p', { class: 'muted small' }, 'Während der Würfel dreht, suchst du schon das nächste F2L-Paar und tippst seinen Slot an (Tasten Q W / A S). Bewertet wird, wie viele Züge dein gewähltes Paar kostet – verglichen mit dem besten.'),
        h('div', { class: 'speed' }, h('span', { class: 'speed-icon' }, '🐢'), speed, h('span', { class: 'speed-icon' }, '🐇'), label),
      ),
      h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Statistik'), h('button', { class: 'link-btn small', onclick: () => this.resetStats() }, 'zurücksetzen')), this.statsEl),
    );
    ctx.view.onFrame = () => this.tick();
    this.renderStats();
    this.newSolve();
  }

  stop() {
    this.token++;
    if (this.ctx) {
      this.ctx.view.onFrame = null;
      this.ctx.view.player.onFinish = null;
    }
    this.ctx = null;
  }

  onKey(e: KeyboardEvent) {
    const s = SLOT_GRID.find((g) => g.key === e.key.toUpperCase());
    if (s) this.pick(s.slot);
    else if (e.code === 'Space' && this.round >= this.rounds) {
      e.preventDefault();
      this.newSolve();
    }
  }

  private async newSolve() {
    const ctx = this.ctx;
    if (!ctx) return;
    const token = ++this.token;
    clear(ctx.hudBottom);
    ctx.hudBottom.append(h('div', { class: 'hud-title' }, 'Neuer Scramble …'));
    const scrambled = applyMoves(WCA_START, randomScramble());
    const { solution } = await solveAsync(scrambled, { f2lMode: 'alg' });
    if (token !== this.token || !this.ctx) return;
    this.steps = solution.steps;
    this.results = [];
    // Startzustand: nach der Inspektion, Kreuz noch offen
    const inspection = this.steps.filter((s) => s.phase === 'inspection').flatMap((s) => s.moves);
    this.roundState = applyMoves(scrambled, inspection);
    this.rounds = this.steps.filter((s) => s.phase === 'f2l').length;
    this.round = 0;
    ctx.view.resetCamera('default');
    ctx.view.look = undefined;
    ctx.view.showArrows = false;
    ctx.view.setPhaseColor(PHASE_COLORS.f2l);
    this.startRound();
  }

  private judged = false;
  private busyDone = false;

  /** Spielt den aktuellen "Beschäftigt"-Abschnitt (Kreuz bzw. vorheriges Paar) und wartet auf die Wahl. */
  private startRound() {
    const ctx = this.ctx;
    if (!ctx) return;
    const busy = this.busySteps(this.round);
    const busyMoves = busy.flatMap((s) => s.moves);
    const after = applyMoves(this.roundState, busyMoves);
    this.picked = null;
    this.costs = null;
    this.judged = false;
    this.busyDone = busyMoves.length === 0;
    const token = this.token;
    callSolver('slotCosts', after).then(({ result }) => {
      if (token !== this.token) return;
      this.costs = result;
      if (this.picked) this.judge(false);
    });
    const p = ctx.view.player;
    p.load(this.roundState, busyMoves);
    p.tps = settings.lookaheadTps;
    p.onFinish = () => {
      this.busyDone = true;
      this.maybeAdvance();
    };
    this.busyStart = performance.now();
    const weight = busyMoves.reduce((sum, m) => sum + (m.amount === 2 ? 1.4 : 1), 0);
    // Zeitfenster: Dauer der Animation plus kurze Gnadenfrist
    this.busyEndsAt = this.busyStart + (weight / p.tps) * 1000 + 1500;
    this.roundState = after;
    setTimeout(() => token === this.token && p.play(), 200);
    this.renderPicker(busy[0]?.title ?? 'Kreuz');
  }

  /** Abschnitt, der läuft, während das Paar für Runde k gesucht wird */
  private busySteps(k: number): SolveStep[] {
    if (k === 0) return this.steps.filter((s) => s.phase === 'cross');
    return [this.steps.filter((s) => s.phase === 'f2l')[k - 1]];
  }

  private renderPicker(busyTitle: string) {
    const ctx = this.ctx;
    if (!ctx) return;
    clear(ctx.hudBottom);
    ctx.hudBottom.append(
      h('div', { class: 'hud-title' }, `Paar ${this.round + 1} von ${this.rounds}: wohin als Nächstes?`),
      h('div', { class: 'hud-sub' }, `Der Würfel macht gerade: ${busyTitle}`),
    );
    clear(ctx.actions);
    this.buttons.clear();
    const grid = h('div', { class: 'slot-grid' });
    for (const g of SLOT_GRID) {
      const b = h('button', { class: 'slot-btn', onclick: () => this.pick(g.slot) }, h('b', null, g.label), h('span', { class: 'muted small' }, g.key)) as HTMLButtonElement;
      this.buttons.set(g.slot, b);
      grid.append(b);
    }
    ctx.actions.append(h('div', { class: 'trainer-actions column' }, this.bar, grid));
  }

  private tick() {
    if (this.judged || this.picked || this.round >= this.rounds) return;
    const total = this.busyEndsAt - this.busyStart;
    const left = Math.max(0, this.busyEndsAt - performance.now());
    (this.bar.firstElementChild as HTMLElement).style.width = `${(left / total) * 100}%`;
    if (left === 0 && this.costs) {
      this.pickMs = total;
      this.judge(true);
    }
  }

  private pick(slot: SlotName) {
    if (this.picked || this.judged || this.round >= this.rounds || !this.ctx) return;
    // Bereits gelöste Slots ignorieren
    if (this.costs && !this.costs.some((c) => c.slot === slot)) return;
    this.picked = slot;
    this.pickMs = performance.now() - this.busyStart;
    this.buttons.get(slot)?.classList.add('picked');
    if (this.costs) this.judge(false);
  }

  private judge(late: boolean) {
    if (this.judged || !this.ctx) return;
    this.judged = true;
    const costs = this.costs!;
    const min = Math.min(...costs.map((c) => c.cost));
    const chosen = late ? undefined : costs.find((c) => c.slot === this.picked);
    const diff = chosen ? chosen.cost - min : 99;
    const verdict: Verdict = late ? 'late' : diff === 0 ? 'perfect' : diff <= 2 ? 'good' : 'costly';
    this.results.push(verdict);
    this.stats.rounds++;
    if (verdict === 'perfect') this.stats.perfect++;
    if (verdict === 'good') this.stats.good++;
    if (verdict === 'late') this.stats.late++;
    else this.stats.decideSum += this.pickMs;
    storage.set('lookaheadStats', this.stats);
    this.renderStats();

    // Kosten auf allen Knöpfen zeigen
    for (const g of SLOT_GRID) {
      const b = this.buttons.get(g.slot)!;
      const c = costs.find((x) => x.slot === g.slot);
      b.disabled = true;
      b.append(h('span', { class: 'slot-cost mono' }, c ? `${c.cost} Züge` : 'gelöst'));
      if (c && c.cost === min) b.classList.add('best');
    }
    const title = this.ctx.hudBottom.querySelector('.hud-title');
    if (title) title.textContent = late ? 'Zu spät!' : `${VERDICT_TEXT[verdict]} (${chosen!.cost} statt ${min} Züge) · ${(this.pickMs / 1000).toFixed(1)} s`;
    this.maybeAdvance();
  }

  /** Weiter, sobald gewählt UND die Animation fertig ist. */
  private maybeAdvance() {
    if (!this.judged || !this.busyDone || !this.ctx) return;
    this.round++;
    const token = this.token;
    setTimeout(() => {
      if (token !== this.token || !this.ctx) return;
      if (this.round < this.rounds) this.startRound();
      else this.finish();
    }, 900);
  }

  private finish() {
    const ctx = this.ctx!;
    // Letztes Paar noch einsetzen, dann Zusammenfassung
    const last: Move[] = this.steps.filter((s) => s.phase === 'f2l').slice(-1).flatMap((s) => s.moves);
    const p = ctx.view.player;
    p.onFinish = null;
    p.load(this.roundState, last);
    setTimeout(() => p.play(), 300);
    const count = (v: Verdict) => this.results.filter((r) => r === v).length;
    clear(ctx.hudBottom);
    ctx.hudBottom.append(
      h('div', { class: 'hud-title' }, `F2L fertig: ${count('perfect')}× perfekt, ${count('good')}× gut`),
      h('div', { class: 'hud-sub' }, this.results.map((r) => VERDICT_TEXT[r]).join(' · ')),
    );
    clear(ctx.actions);
    ctx.actions.append(h('div', { class: 'trainer-actions' }, h('button', { class: 'btn primary big', onclick: () => this.newSolve() }, 'Nächster Scramble (Leertaste)')));
  }

  private resetStats() {
    this.stats = { rounds: 0, perfect: 0, good: 0, late: 0, decideSum: 0 };
    storage.set('lookaheadStats', this.stats);
    this.renderStats();
  }

  private renderStats() {
    clear(this.statsEl);
    const s = this.stats;
    const decided = s.rounds - s.late;
    const stat = (v: string, l: string) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));
    this.statsEl.append(
      h('div', { class: 'stat-row' },
        stat(String(s.rounds), 'Paare'),
        stat(s.rounds ? `${Math.round((s.perfect / s.rounds) * 100)}%` : '–', 'perfekt'),
        stat(s.rounds ? `${Math.round(((s.perfect + s.good) / s.rounds) * 100)}%` : '–', 'perfekt + gut'),
        stat(decided ? `${(s.decideSum / decided / 1000).toFixed(1)} s` : '–', 'Ø Entscheidung'),
      ),
    );
  }
}
