import { applyMoves, moveToString, solvedState, type Move } from '../../cube/cube';
import { invertAlg } from '../../cube/notation';
import { ALL_CASES, SETS_BY_PUZZLE, SET_LABEL, caseTitle, type AlgCase, type AlgSet, type Puzzle } from '../../algs/data';
import { settings } from '../../settings';
import { storage } from '../../util/storage';
import { algMoves, preferredAlg } from '../../algs/registry';
import { progress, type Grade } from '../../progress';
import { clear, h } from '../dom';
import { lookFor } from '../looks';
import { PHASE_COLORS } from '../phases';
import type { TrainerContext, TrainerMode } from './types';

type Pool = 'srs' | 'all' | 'fav' | 'learning' | 'notLearned';

const U = (n: number): Move[] => (n ? [{ base: 'U', amount: n as 1 | 2 | 3 }] : []);
const D = (n: number): Move[] => (n ? [{ base: 'D', amount: n as 1 | 2 | 3 }] : []);
const SET_PHASE: Record<AlgSet, keyof typeof PHASE_COLORS> = { F2L: 'f2l', OLL: 'oll', PLL: 'pll', COLL: 'coll', ZBLL: 'zbll', WV: 'ls', VLS: 'ls', '2OLL': 'oll', PBL: 'pbl', CLL: 'cll', EG1: 'eg', EG2: 'eg' };

/** Erkennungs-Trainer: Fall erkennen, aufdecken, bewerten. Schwache Fälle kommen öfter. */
export class RecogMode implements TrainerMode {
  readonly id = 'recog';
  readonly label = 'Erkennung';
  private ctx: TrainerContext | null = null;
  /** Gewählte Kategorien je Puzzle (Mehrfachauswahl) */
  private sets: Record<Puzzle, AlgSet[]> = storage.get('recogSets', { 3: ['PLL'], 2: ['CLL'] } as Record<Puzzle, AlgSet[]>);
  private pool: Pool = 'srs';
  private current: AlgCase | null = null;
  private shownAt = 0;
  private revealed = false;
  private recogMs = 0;
  private forced: string | null = null;
  private statsEl = h('div', { class: 'trainer-stats' });
  private setTabs = h('div', { class: 'group-chips' });
  private session = { n: 0, hits: 0 };
  private timerEl = h('div', { class: 'trainer-timer mono' }, '0.00');

  /** Einen bestimmten Fall als Nächstes zeigen. */
  train(id: string) {
    const c = ALL_CASES.find((x) => x.id === id);
    if (c) this.sets[c.puzzle === 2 ? 2 : 3] = [c.set];
    this.forced = id;
    if (this.ctx) {
      this.renderTabs();
      this.next();
    }
  }

  start(ctx: TrainerContext) {
    this.ctx = ctx;
    const poolSel = h(
      'select',
      { class: 'select', onchange: () => { this.pool = poolSel.value as Pool; this.next(); } },
      h('option', { value: 'srs' }, '⏰ Fällig (Wiederholung)'),
      h('option', { value: 'all' }, 'Alle Fälle'),
      h('option', { value: 'fav' }, '★ Favoriten'),
      h('option', { value: 'learning' }, 'Am Lernen'),
      h('option', { value: 'notLearned' }, 'Noch nicht gelernt'),
    ) as HTMLSelectElement;
    poolSel.value = this.pool;
    ctx.side.append(
      h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Erkennungs-Trainer')), h('div', { class: 'muted small' }, 'Kategorien (mehrere wählbar):'), h('div', { class: 'toolbar-row' }, this.setTabs, poolSel), h('p', { class: 'muted small' }, 'Erkenne den Fall so schnell wie möglich und tippe auf „Aufdecken“ (oder Leertaste). Danach ehrlich bewerten – Fälle, die du nicht weisst, kommen öfter dran.')),
      h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Statistik')), this.statsEl),
    );
    ctx.hudTop.append(this.timerEl);
    this.renderTabs();
    this.next();
  }

  stop() {
    if (this.ctx) {
      this.ctx.view.onFrame = null;
      this.ctx.view.player.onIndex = null;
    }
    this.ctx = null;
  }

  onKey(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.revealed) this.reveal();
      else this.rate(4);
    } else if (this.revealed) {
      const map: Record<string, Grade> = { x: 1, Backspace: 1, '1': 1, '2': 3, '3': 4, '4': 5 };
      if (map[e.key]) this.rate(map[e.key]);
    }
  }

  private get active(): AlgSet[] {
    const p = settings.puzzle;
    const valid = this.sets[p]?.filter((x) => SETS_BY_PUZZLE[p].includes(x)) ?? [];
    return valid.length ? valid : [SETS_BY_PUZZLE[p][2]]; // Standard: PLL bzw. CLL
  }

  /** Kategorien als Chips zum An-/Abwählen – mindestens eine bleibt aktiv */
  private renderTabs() {
    clear(this.setTabs);
    const p = settings.puzzle;
    const active = this.active;
    for (const set of SETS_BY_PUZZLE[p]) {
      const on = active.includes(set);
      this.setTabs.append(
        h('button', {
          class: `chip-btn ${on ? 'active' : ''}`,
          onclick: () => {
            const next = on ? active.filter((x) => x !== set) : [...active, set];
            if (!next.length) return;
            this.sets = { ...this.sets, [p]: next };
            storage.set('recogSets', this.sets);
            this.renderTabs();
            this.next();
          },
        }, SET_LABEL[set]),
      );
    }
  }

  private candidates(): AlgCase[] {
    const all = ALL_CASES.filter((c) => this.active.includes(c.set));
    const filtered = all.filter((c) => {
      if (this.pool === 'fav') return progress.isFav(c.id);
      if (this.pool === 'learning') return progress.status(c.id) === 'learning';
      if (this.pool === 'notLearned') return progress.status(c.id) !== 'learned';
      if (this.pool === 'srs') return progress.isDue(c.id);
      return true;
    });
    return filtered.length ? filtered : all;
  }

  private pick(): AlgCase {
    if (this.forced) {
      const c = ALL_CASES.find((x) => x.id === this.forced);
      this.forced = null;
      if (c) return c;
    }
    const list = this.candidates().filter((c) => c !== this.current || this.candidates().length === 1);
    if (this.pool === 'srs') {
      // Am längsten überfällige zuerst; neue Fälle (nie geplant) zufällig dazwischen
      const sorted = list.slice().sort((a, b) => progress.dueAt(a.id) - progress.dueAt(b.id));
      return sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
    }
    const weights = list.map((c) => {
      const p = progress.get(c.id);
      return Math.max(0.3, 1 + (p.misses ?? 0) * 2 - (p.hits ?? 0) * 0.3);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((r -= weights[i]) <= 0) return list[i];
    return list[list.length - 1];
  }

  private next() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { view } = ctx;
    const c = this.pick();
    this.current = c;
    this.revealed = false;
    const alg = algMoves(c, preferredAlg(c));
    const pre = Math.floor(Math.random() * 4);
    const post = Math.floor(Math.random() * 4);
    // Zufällige Farben (PLL) und zufälliger Blickwinkel (AUF)
    // Zufällige Farben (PLL/2x2) und zufälliger Blickwinkel (AUF); am Ende wieder ausgerichtet
    const two = c.puzzle === 2;
    const preMoves = c.set === 'PLL' ? U(pre) : two && c.set !== '2OLL' ? [...U(pre), ...D(Math.floor(Math.random() * 4))] : [];
    const start = applyMoves(solvedState(), [...preMoves, ...invertAlg(alg), ...U(post)]);
    view.setPuzzle(two ? 2 : 3);
    view.player.load(start, [...U((4 - post) % 4), ...alg, ...invertAlg(preMoves)]);
    view.player.onIndex = null;
    view.look = lookFor(c.set);
    view.showArrows = false;
    const color = PHASE_COLORS[SET_PHASE[c.set]];
    view.setPhaseColor(color);
    view.arrowColor = color;
    view.resetCamera(['F2L', 'WV', 'VLS'].includes(c.set) || (two && c.set !== '2OLL') ? 'default' : 'top');
    this.shownAt = performance.now();
    view.onFrame = () => {
      if (!this.revealed) this.timerEl.textContent = ((performance.now() - this.shownAt) / 1000).toFixed(2);
    };
    clear(ctx.hudBottom);
    ctx.hudBottom.append(h('div', { class: 'hud-title' }, 'Welcher Fall ist das?'));
    clear(ctx.actions);
    ctx.actions.append(h('div', { class: 'trainer-actions' }, h('button', { class: 'btn primary big', onclick: () => this.reveal() }, 'Aufdecken (Leertaste)')));
    this.renderStats();
  }

  private reveal() {
    const ctx = this.ctx;
    if (!ctx || !this.current || this.revealed) return;
    const { view } = ctx;
    this.revealed = true;
    this.recogMs = performance.now() - this.shownAt;
    const c = this.current;
    clear(ctx.hudBottom);
    const chips = h('div', { class: 'hud-alg' }, ...view.player.moves.map((m) => h('span', { class: 'hm' }, moveToString(m))));
    ctx.hudBottom.append(h('div', { class: 'hud-title' }, `${caseTitle(c)}${c.name && c.name !== c.key ? ` · ${c.name}` : ''}`), chips);
    view.showArrows = true;
    view.player.onIndex = (i) => chips.querySelectorAll('.hm').forEach((el, k) => { el.classList.toggle('done', k < i); el.classList.toggle('current', k === i); });
    setTimeout(() => this.ctx?.view.player.play(), 300);
    clear(ctx.actions);
    ctx.actions.append(
      h('div', { class: 'trainer-actions' },
        h('button', { class: 'btn bad', title: 'Taste 1 oder X', onclick: () => this.rate(1) }, 'Nochmal'),
        h('button', { class: 'btn', title: 'Taste 2', onclick: () => this.rate(3) }, 'Schwer'),
        h('button', { class: 'btn good', title: 'Taste 3 oder Leertaste', onclick: () => this.rate(4) }, 'Gut'),
        h('button', { class: 'btn', title: 'Taste 4', onclick: () => this.rate(5) }, 'Leicht'),
      ),
    );
  }

  /** Bewertung: speichert Statistik und plant die nächste Wiederholung (Spaced Repetition). */
  private rate(grade: Grade) {
    if (!this.current || !this.revealed) return;
    const known = grade >= 3;
    progress.record(this.current.id, known, this.recogMs);
    progress.grade(this.current.id, grade);
    this.session.n++;
    if (known) this.session.hits++;
    this.next();
  }

  private renderStats() {
    clear(this.statsEl);
    const cases = ALL_CASES.filter((c) => this.active.includes(c.set));
    const rows = cases
      .map((c) => ({ c, p: progress.get(c.id) }))
      .filter((r) => (r.p.recogN ?? 0) > 0)
      .map((r) => ({ ...r, acc: (r.p.hits ?? 0) / ((r.p.hits ?? 0) + (r.p.misses ?? 0)), avg: (r.p.recogSum ?? 0) / (r.p.recogN ?? 1) }))
      .sort((a, b) => a.acc - b.acc || b.avg - a.avg);
    this.statsEl.append(
      h(
        'div',
        { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', null, String(this.session.n)), h('span', null, 'Fälle (Session)')),
        h('div', { class: 'stat' }, h('b', null, this.session.n ? `${Math.round((this.session.hits / this.session.n) * 100)}%` : '–'), h('span', null, 'gewusst')),
        h('div', { class: 'stat' }, h('b', null, `${rows.length}/${cases.length}`), h('span', null, 'geübt')),
        h('div', { class: 'stat' }, h('b', null, String(cases.filter((c) => progress.isDue(c.id) && progress.get(c.id).due).length)), h('span', null, 'fällig')),
      ),
    );
    if (rows.length) {
      this.statsEl.append(h('h4', null, 'Schwächste Fälle'));
      for (const r of rows.slice(0, 6)) {
        this.statsEl.append(
          h('div', { class: 'weak-row' }, h('b', null, caseTitle(r.c)), h('span', { class: 'muted' }, `${Math.round(r.acc * 100)}% · Ø ${(r.avg / 1000).toFixed(2)} s`), h('button', { class: 'link-btn small', onclick: () => { this.forced = r.c.id; this.next(); } }, 'üben')),
        );
      }
    }
  }
}
