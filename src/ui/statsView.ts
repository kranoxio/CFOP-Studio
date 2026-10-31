import { CASE_BY_ID, caseTitle } from '../algs/data';
import { settings } from '../settings';
import { analyzeSolves, type SolveRecord } from '../stats/analysis';
import { progress } from '../progress';
import { ALL_CASES, SETS_BY_PUZZLE, SET_LABEL } from '../algs/data';
import { storage } from '../util/storage';
import { averageOf } from './timerView';
import { barChart, lineChart } from './charts';
import { clear, fmtTime, h } from './dom';

const effective = (s: SolveRecord) => (s.penalty === 'DNF' ? Infinity : s.ms + (s.penalty === '+2' ? 2000 : 0));

/**
 * Statistik & Schwächen-Analyse:
 * Verlauf, Durchschnitte, Phasen im Vergleich zu einem Sub-10-Profil, langsamste Fälle, Wiederholungen.
 */
export class StatsView {
  readonly el: HTMLElement;
  private body = h('div', { class: 'stats-body' });

  constructor() {
    this.el = h('section', { class: 'view stats-view' }, this.body);
    document.addEventListener('puzzle-change', () => this.el.classList.contains('active') && this.render());
  }

  activate() {
    this.render();
  }
  deactivate() {}

  private render() {
    clear(this.body);
    const solves: SolveRecord[] = storage.get(settings.puzzle === 2 ? 'solves2' : 'solves', []);
    const puzzle = settings.puzzle === 2 ? '2×2' : '3×3';
    this.body.append(h('h2', { class: 'stats-title' }, `Statistik ${puzzle}`));

    // Kennzahlen
    const valid = solves.map(effective).filter(isFinite);
    const tile = (label: string, v: number | null) => h('div', { class: 'stat' }, h('b', null, v === null ? '–' : fmtTime(v)), h('span', null, label));
    this.body.append(
      h('div', { class: 'card glass' },
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('b', null, String(solves.length)), h('span', null, 'Solves')),
          tile('Bestzeit', valid.length ? Math.min(...valid) : null),
          tile('ao5', averageOf(solves, 5)),
          tile('ao12', averageOf(solves, 12)),
          tile('ao100', averageOf(solves, 100)),
          tile('Mittel', valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null),
        ),
      ),
    );

    // Verlauf (älteste links)
    const recent = solves.slice(0, 100).reverse();
    const pts = recent.map((s, i) => ({ value: isFinite(effective(s)) ? effective(s) / 1000 : null, label: `Solve ${solves.length - recent.length + i + 1}` }));
    const ao5 = recent.map((_, i) => {
      const window = recent.slice(Math.max(0, i - 4), i + 1).reverse();
      const a = window.length === 5 ? averageOf(window, 5) : null;
      return { value: a !== null && isFinite(a) ? a / 1000 : null, label: '' };
    });
    this.body.append(
      h('div', { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Verlauf (letzte 100)')),
        lineChart([
          { name: 'Zeit', color: 'var(--series-1)', points: pts },
          { name: 'ao5', color: 'var(--series-2)', points: ao5, width: 2.5 },
        ], { unit: ' s' }),
      ),
    );

    // Smartcube-Analyse
    const analysis = settings.puzzle === 3 ? analyzeSolves(solves) : null;
    if (!analysis) {
      this.body.append(
        h('div', { class: 'card glass' },
          h('div', { class: 'card-head' }, h('h3', null, 'Schwächen-Analyse')),
          h('p', { class: 'muted' }, settings.puzzle === 3
            ? 'Löse im Timer mit verbundenem Smartcube (oder dem Simulator). Dann siehst du hier deine Zeit pro Phase im Vergleich zu einem Sub-10-Profil, deine Erkennungspausen, deine TPS und deine langsamsten OLL- und PLL-Fälle.'
            : 'Die Phasen-Analyse gibt es für den 3×3 mit Smartcube.'),
        ),
      );
    } else {
      const gap = analysis.biggestGap;
      this.body.append(
        h('div', { class: 'card glass' },
          h('div', { class: 'card-head' }, h('h3', null, `Phasen · ${analysis.count} Smartcube-Solves`)),
          h('div', { class: 'stat-row' },
            h('div', { class: 'stat' }, h('b', null, analysis.avgTime.toFixed(2)), h('span', null, 'Ø Zeit (s)')),
            h('div', { class: 'stat' }, h('b', null, analysis.avgMoves.toFixed(0)), h('span', null, 'Ø Züge')),
            h('div', { class: 'stat' }, h('b', null, analysis.avgTps.toFixed(2)), h('span', null, 'Ø TPS')),
          ),
          gap
            ? h('div', { class: 'insight' }, '🎯 Grösster Hebel: ', h('b', null, gap.label), ` – du brauchst ${gap.avg.toFixed(2)} s, Sub-10-Richtwert ${gap.ref.toFixed(1)} s (+${(gap.avg - gap.ref).toFixed(2)} s)`, gap.pause !== null && gap.pause > 0.35 ? `, davon ${gap.pause.toFixed(2)} s Pause vor dem ersten Zug → Lookahead/Erkennung üben.` : '.')
            : h('div', { class: 'insight' }, '🏆 Alle Phasen auf Sub-10-Niveau!'),
          barChart(
            analysis.phases.map((p) => ({
              label: p.label,
              value: p.avg,
              ref: p.ref,
              detail: `${p.label}: Ø ${p.avg.toFixed(2)} s · Richtwert ${p.ref.toFixed(1)} s${p.pause !== null ? ` · Pause ${p.pause.toFixed(2)} s` : ''}${p.tps !== null ? ` · ${p.tps.toFixed(1)} TPS` : ''} · Ø ${p.moves.toFixed(1)} Züge`,
            })),
            { unit: ' s', refLabel: 'Sub-10-Richtwert' },
          ),
          h('details', { class: 'table-view' },
            h('summary', null, 'Als Tabelle'),
            h('table', { class: 'data-table' },
              h('thead', null, h('tr', null, ...['Phase', 'Ø Zeit', 'Pause', 'TPS', 'Züge', 'Richtwert'].map((t) => h('th', null, t)))),
              h('tbody', null, ...analysis.phases.map((p) => h('tr', null,
                h('td', null, p.label), h('td', null, p.avg.toFixed(2)), h('td', null, p.pause?.toFixed(2) ?? '–'),
                h('td', null, p.tps?.toFixed(1) ?? '–'), h('td', null, p.moves.toFixed(1)), h('td', null, p.ref.toFixed(1)),
              ))),
            ),
          ),
        ),
      );
      const caseList = (title: string, list: typeof analysis.oll) =>
        h('div', { class: 'card glass' },
          h('div', { class: 'card-head' }, h('h3', null, title)),
          list.length
            ? h('div', null, ...list.slice(0, 6).map((c) => {
                const ref = CASE_BY_ID.get(c.caseId);
                return h('div', { class: 'weak-row' },
                  h('b', null, ref ? caseTitle(ref) : c.caseId),
                  h('span', { class: 'muted' }, `Ø ${c.avg.toFixed(2)} s${c.pause !== null ? ` · Erkennung ${c.pause.toFixed(2)} s` : ''} · ${c.n}×`),
                  h('button', { class: 'link-btn small', onclick: () => document.dispatchEvent(new CustomEvent('train-case', { detail: c.caseId })) }, 'erkennen'),
                  h('button', { class: 'link-btn small', onclick: () => document.dispatchEvent(new CustomEvent('drill-case', { detail: c.caseId })) }, 'drillen'),
                );
              }))
            : h('p', { class: 'muted small' }, 'Noch keine Fälle erkannt.'),
        );
      this.body.append(h('div', { class: 'two-col' }, caseList('Langsamste OLLs', analysis.oll), caseList('Langsamste PLLs', analysis.pll)));
    }

    // Wiederholungen (Spaced Repetition)
    const rows = SETS_BY_PUZZLE[settings.puzzle].map((set) => {
      const cases = ALL_CASES.filter((c) => c.set === set);
      const scheduled = cases.filter((c) => progress.get(c.id).due);
      const due = scheduled.filter((c) => progress.isDue(c.id)).length;
      const learned = cases.filter((c) => progress.status(c.id) === 'learned').length;
      return h('tr', null, h('td', null, SET_LABEL[set]), h('td', null, String(cases.length)), h('td', null, String(scheduled.length)), h('td', null, String(due)), h('td', null, String(learned)));
    });
    this.body.append(
      h('div', { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Wiederholungen'), h('button', { class: 'btn', onclick: () => document.dispatchEvent(new CustomEvent('open-trainer')) }, '⏰ Jetzt wiederholen')),
        h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ...['Set', 'Fälle', 'geplant', 'fällig', 'gelernt'].map((t) => h('th', null, t)))),
          h('tbody', null, ...rows),
        ),
      ),
    );
  }
}
