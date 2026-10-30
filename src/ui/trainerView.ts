import { applyMoves, moveToString, solvedState, type Move } from '../cube/cube';
import { invertAlg } from '../cube/notation';
import { ALL_CASES, type AlgCase, type AlgSet } from '../algs/data';
import { normalizeAlg, preferredAlg } from '../algs/registry';
import { CubeView } from '../render/CubeView';
import { progress } from '../progress';
import { clear, h } from './dom';
import { lookFor } from './looks';
import { PHASE_COLORS } from './phases';

type Pool = 'all' | 'fav' | 'learning' | 'notLearned';

const U = (n: number): Move[] => (n ? [{ base: 'U', amount: n as 1 | 2 | 3 }] : []);

/** Erkennungs-Trainer: Fall erkennen, aufdecken, bewerten. Schwache Fälle kommen öfter. */
export class TrainerView {
  readonly el: HTMLElement;
  private view: CubeView | null = null;
  private stageSlot = h('div', { class: 'stage-slot trainer-stage' });
  private set: AlgSet = 'PLL';
  private pool: Pool = 'all';
  private current: AlgCase | null = null;
  private shownAt = 0;
  private revealed = false;
  private recogMs = 0;
  private forced: string | null = null;
  private infoEl = h('div', { class: 'trainer-info' });
  private timerEl = h('div', { class: 'trainer-timer mono' }, '0.00');
  private actions = h('div', { class: 'trainer-actions' });
  private statsEl = h('div', { class: 'trainer-stats' });
  private setTabs = h('div', { class: 'seg-tabs' });
  private session = { n: 0, hits: 0 };

  constructor() {
    const poolSel = h(
      'select',
      { class: 'select', onchange: () => { this.pool = poolSel.value as Pool; this.next(); } },
      h('option', { value: 'all' }, 'Alle Fälle'),
      h('option', { value: 'fav' }, '★ Favoriten'),
      h('option', { value: 'learning' }, 'Am Lernen'),
      h('option', { value: 'notLearned' }, 'Noch nicht gelernt'),
    ) as HTMLSelectElement;
    this.stageSlot.append(h('div', { class: 'hud hud-top' }, this.timerEl), h('div', { class: 'hud hud-bottom' }, this.infoEl));
    this.el = h(
      'section',
      { class: 'view trainer-view' },
      h(
        'div',
        { class: 'solver-layout' },
        h('div', { class: 'stage-col' }, this.stageSlot, h('div', { class: 'controls glass' }, this.actions)),
        h(
          'aside',
          { class: 'panel' },
          h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Erkennungs-Trainer')), h('div', { class: 'toolbar-row' }, this.setTabs, poolSel), h('p', { class: 'muted small' }, 'Erkenne den Fall so schnell wie möglich und tippe auf „Aufdecken“ (oder Leertaste). Danach ehrlich bewerten – Fälle, die du nicht weisst, kommen öfter dran.')),
          h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Statistik')), this.statsEl),
        ),
      ),
    );
  }

  /** Einen bestimmten Fall als Nächstes zeigen. */
  train(id: string) {
    this.set = id.split('-')[0] as AlgSet;
    this.forced = id;
    if (this.view) {
      this.renderTabs();
      this.next();
    }
  }

  activate() {
    if (!this.view) {
      this.view = new CubeView(this.stageSlot);
      this.stageSlot.prepend(this.view.renderer.domElement);
      this.view.player.tps = 3.5;
    }
    this.view.setRunning(true);
    this.renderTabs();
    this.next();
  }

  deactivate() {
    this.view?.setRunning(false);
  }

  onKey(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.revealed) this.reveal();
      else this.rate(true);
    } else if (this.revealed && (e.key === 'x' || e.key === 'Backspace')) this.rate(false);
  }

  private renderTabs() {
    clear(this.setTabs);
    for (const s of ['F2L', 'OLL', 'PLL'] as AlgSet[]) {
      this.setTabs.append(h('button', { class: `seg ${s === this.set ? 'active' : ''}`, onclick: () => { this.set = s; this.renderTabs(); this.next(); } }, s));
    }
  }

  private candidates(): AlgCase[] {
    const all = ALL_CASES.filter((c) => c.set === this.set);
    const filtered = all.filter((c) => {
      if (this.pool === 'fav') return progress.isFav(c.id);
      if (this.pool === 'learning') return progress.status(c.id) === 'learning';
      if (this.pool === 'notLearned') return progress.status(c.id) !== 'learned';
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
    const weights = list.map((c) => {
      const p = progress.get(c.id);
      return Math.max(0.3, 1 + (p.misses ?? 0) * 2 - (p.hits ?? 0) * 0.3);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((r -= weights[i]) <= 0) return list[i];
    return list[list.length - 1];
  }

  next() {
    if (!this.view) return;
    const c = this.pick();
    this.current = c;
    this.revealed = false;
    const alg = normalizeAlg(preferredAlg(c));
    const pre = Math.floor(Math.random() * 4);
    const post = Math.floor(Math.random() * 4);
    // Zufällige Farben (PLL) und zufälliger Blickwinkel (AUF)
    const start = applyMoves(solvedState(), [...(c.set === 'PLL' ? U(pre) : []), ...invertAlg(alg), ...U(post)]);
    const solution = [...U((4 - post) % 4), ...alg];
    this.view.player.load(start, solution);
    this.view.look = lookFor(c.set);
    this.view.showArrows = false;
    const color = PHASE_COLORS[c.set === 'F2L' ? 'f2l' : c.set === 'OLL' ? 'oll' : 'pll'];
    this.view.setPhaseColor(color);
    this.view.arrowColor = color;
    this.view.resetCamera(c.set === 'F2L' ? 'default' : 'top');
    this.shownAt = performance.now();
    this.view.onFrame = () => {
      if (!this.revealed) this.timerEl.textContent = ((performance.now() - this.shownAt) / 1000).toFixed(2);
    };
    clear(this.infoEl);
    this.infoEl.append(h('div', { class: 'hud-title' }, 'Welcher Fall ist das?'));
    clear(this.actions);
    this.actions.append(h('button', { class: 'btn primary big', onclick: () => this.reveal() }, 'Aufdecken (Leertaste)'));
    this.renderStats();
  }

  private reveal() {
    if (!this.view || !this.current || this.revealed) return;
    this.revealed = true;
    this.recogMs = performance.now() - this.shownAt;
    const c = this.current;
    clear(this.infoEl);
    const chips = h('div', { class: 'hud-alg' }, ...this.view.player.moves.map((m) => h('span', { class: 'hm' }, moveToString(m))));
    this.infoEl.append(h('div', { class: 'hud-title' }, `${c.set} ${c.key}${c.name ? ` · ${c.name}` : ''}`), chips);
    this.view.showArrows = true;
    this.view.player.onIndex = (i) => chips.querySelectorAll('.hm').forEach((el, k) => { el.classList.toggle('done', k < i); el.classList.toggle('current', k === i); });
    setTimeout(() => this.view?.player.play(), 300);
    clear(this.actions);
    this.actions.append(
      h('button', { class: 'btn bad big', onclick: () => this.rate(false) }, '✗ Nicht gewusst'),
      h('button', { class: 'btn good big', onclick: () => this.rate(true) }, '✓ Gewusst'),
    );
  }

  private rate(known: boolean) {
    if (!this.current || !this.revealed) return;
    progress.record(this.current.id, known, this.recogMs);
    this.session.n++;
    if (known) this.session.hits++;
    this.next();
  }

  private renderStats() {
    clear(this.statsEl);
    const cases = ALL_CASES.filter((c) => c.set === this.set);
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
      ),
    );
    if (rows.length) {
      this.statsEl.append(h('h4', null, 'Schwächste Fälle'));
      for (const r of rows.slice(0, 6)) {
        this.statsEl.append(
          h('div', { class: 'weak-row' }, h('b', null, `${r.c.set} ${r.c.key}`), h('span', { class: 'muted' }, `${Math.round(r.acc * 100)}% · Ø ${(r.avg / 1000).toFixed(2)} s`), h('button', { class: 'link-btn small', onclick: () => { this.forced = r.c.id; this.next(); } }, 'üben')),
        );
      }
    }
  }
}
