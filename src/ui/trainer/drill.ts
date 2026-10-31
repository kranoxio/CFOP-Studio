import { applyMoves, moveToString, movesPerm, type Move, type State } from '../../cube/cube';
import { conjugateMove, formatAlg, htm, invertAlg, parseAlg } from '../../cube/notation';
import { ALL_CASES, SETS_BY_PUZZLE, SET_LABEL, caseTitle, type AlgCase, type AlgSet, type Puzzle } from '../../algs/data';
import { algMoves, preferredAlg } from '../../algs/registry';
import { progress } from '../../progress';
import { settings } from '../../settings';
import { sameColors, smartCube, type SmartMove } from '../../smartcube/smartcube';
import { storage } from '../../util/storage';
import { engineFor } from '../../cube/engine';
import { clear, h } from '../dom';
import { lookFor } from '../looks';
import { PHASE_COLORS } from '../phases';
import type { TrainerContext, TrainerMode } from './types';

const Z2 = movesPerm(parseAlg('z2'));
/** Zug aus der Lösehaltung (Gelb oben) in den Rahmen des Smartcubes (Weiss oben) umrechnen */
const toCubeFrame = (m: Move) => conjugateMove(m, Z2);
/** ... und zurück */
const toHomeFrame = (m: Move) => conjugateMove(m, Z2);
const AUF: Move[][] = [[], [{ base: 'U', amount: 1 }], [{ base: 'U', amount: 2 }], [{ base: 'U', amount: 3 }]];

/**
 * Alg-Drill: Fall erscheint, du führst den Alg aus – gemessen wird die reine Ausführungszeit.
 * Mit Smartcube startet die Zeit beim ersten Zug und stoppt, sobald der Würfel den Zielzustand hat.
 * Ohne Smartcube: Leertaste startet und stoppt.
 */
export class DrillMode implements TrainerMode {
  readonly id = 'drill';
  readonly label = 'Drill';
  private ctx: TrainerContext | null = null;
  private current: AlgCase | null = null;
  private sets: Record<Puzzle, AlgSet[]> = storage.get('drillSets', { 3: ['PLL'], 2: ['CLL'], 4: ['4PLL'] } as Record<Puzzle, AlgSet[]>);
  private hideAlg = false;
  private targets: State[] = [];
  private phase: 'ready' | 'running' | 'done' = 'ready';
  private startAt = 0;
  private lastAt = 0;
  private moves = 0;
  private offMove: (() => void) | null = null;
  private chips = h('div', { class: 'group-chips' });
  private timerEl = h('div', { class: 'trainer-timer mono' }, '0.00');
  private statsEl = h('div');
  private algEl = h('div', { class: 'hud-alg' });

  start(ctx: TrainerContext) {
    this.ctx = ctx;
    const hideToggle = h('input', {
      type: 'checkbox',
      checked: this.hideAlg,
      onchange: () => {
        this.hideAlg = hideToggle.checked;
        this.renderAlg();
      },
    }) as HTMLInputElement;
    ctx.side.append(
      h(
        'div',
        { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Alg-Drill')),
        h('p', { class: 'muted small' }, smartCube.connected && settings.puzzle === 3
          ? 'Smartcube verbunden: führe den Alg an deinem Würfel aus (Gelb oben, Grün vorne). Die Zeit läuft ab dem ersten Zug und stoppt automatisch, wenn der Alg fertig ist – AUF davor oder danach ist erlaubt.'
          : 'Ohne Smartcube: Leertaste startet, Leertaste stoppt. Mit Smartcube wird automatisch und genauer gemessen.'),
        h('div', { class: 'muted small' }, 'Kategorien:'),
        this.chips,
        h('label', { class: 'toggle' }, hideToggle, h('span', { class: 'toggle-ui' }), 'Alg verbergen (aus dem Kopf)'),
      ),
      h('div', { class: 'card glass' }, h('div', { class: 'card-head' }, h('h3', null, 'Langsamste Algs')), this.statsEl),
    );
    ctx.hudTop.append(this.timerEl);
    ctx.view.onFrame = () => {
      if (this.phase === 'running') this.timerEl.textContent = ((performance.now() - this.startAt) / 1000).toFixed(2);
    };
    this.offMove = smartCube.onMove((ev) => this.onSmartMove(ev));
    this.renderChips();
    this.next();
  }

  stop() {
    this.offMove?.();
    this.offMove = null;
    if (this.ctx) this.ctx.view.onFrame = null;
    this.ctx = null;
  }

  /** Einen bestimmten Fall drillen */
  drill(id: string) {
    const c = ALL_CASES.find((x) => x.id === id);
    if (!c) return;
    this.sets[c.puzzle ?? 3] = [c.set];
    this.forced = c;
    if (this.ctx) {
      this.renderChips();
      this.next();
    }
  }
  private forced: AlgCase | null = null;

  onKey(e: KeyboardEvent) {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (this.useSmart()) return;
    if (this.phase === 'ready') {
      this.phase = 'running';
      this.startAt = performance.now();
    } else if (this.phase === 'running') {
      this.finish(performance.now() - this.startAt);
    } else this.next();
  }

  private useSmart() {
    return smartCube.connected && settings.puzzle === 3;
  }

  private get active(): AlgSet[] {
    const p = settings.puzzle;
    const v = this.sets[p]?.filter((x) => SETS_BY_PUZZLE[p].includes(x)) ?? [];
    return v.length ? v : [SETS_BY_PUZZLE[p][Math.min(2, SETS_BY_PUZZLE[p].length - 1)]];
  }

  private renderChips() {
    clear(this.chips);
    const p = settings.puzzle;
    for (const set of SETS_BY_PUZZLE[p]) {
      const on = this.active.includes(set);
      this.chips.append(
        h('button', {
          class: `chip-btn ${on ? 'active' : ''}`,
          onclick: () => {
            const next = on ? this.active.filter((x) => x !== set) : [...this.active, set];
            if (!next.length) return;
            this.sets = { ...this.sets, [p]: next };
            storage.set('drillSets', this.sets);
            this.renderChips();
            this.next();
          },
        }, SET_LABEL[set]),
      );
    }
  }

  /** Langsame Algs kommen häufiger dran */
  private pick(): AlgCase {
    if (this.forced) {
      const c = this.forced;
      this.forced = null;
      return c;
    }
    const list = ALL_CASES.filter((c) => this.active.includes(c.set) && c !== this.current);
    const weight = (c: AlgCase) => {
      const p = progress.get(c.id);
      return p.execN ? Math.max(0.3, (p.execSum! / p.execN) / 1000) : 2;
    };
    let r = Math.random() * list.reduce((s, c) => s + weight(c), 0);
    for (const c of list) if ((r -= weight(c)) <= 0) return c;
    return list[list.length - 1];
  }

  private next() {
    const ctx = this.ctx;
    if (!ctx) return;
    const c = this.pick();
    this.current = c;
    this.phase = 'ready';
    this.moves = 0;
    const alg = algMoves(c, preferredAlg(c));
    const engine = engineFor(c.puzzle ?? 3);
    const start = invertAlg(alg).reduce((s, m) => engine.apply(s, m), engine.solved());
    const v = ctx.view;
    v.setPuzzle(c.puzzle ?? 3);
    v.player.load(start, []);
    v.look = lookFor(c.set);
    v.showArrows = false;
    v.setPhaseColor(PHASE_COLORS.oll);
    v.resetCamera(['F2L', 'WV', 'VLS'].includes(c.set) || c.puzzle === 2 || c.puzzle === 4 ? 'default' : 'top');
    this.timerEl.textContent = '0.00';
    if (this.useSmart()) {
      // Zielzustände des echten Würfels: aktueller Stand + (AUF) Alg (AUF), im Würfel-Rahmen
      const p0 = smartCube.state;
      const cubeAlg = alg.map(toCubeFrame);
      this.targets = [];
      for (const pre of AUF)
        for (const post of AUF) this.targets.push(applyMoves(p0, [...pre.map(toCubeFrame), ...cubeAlg, ...post.map(toCubeFrame)]));
    }
    clear(ctx.hudBottom);
    ctx.hudBottom.append(h('div', { class: 'hud-title' }, caseTitle(c)), this.algEl);
    this.renderAlg();
    clear(ctx.actions);
    ctx.actions.append(
      h('div', { class: 'trainer-actions' },
        this.useSmart()
          ? h('div', { class: 'hud-sub' }, 'Los, sobald du bereit bist – der erste Zug startet die Zeit.')
          : h('button', { class: 'btn primary big', onclick: () => this.onKey(new KeyboardEvent('keydown', { code: 'Space' })) }, 'Start / Stopp (Leertaste)'),
        h('button', { class: 'btn', onclick: () => this.next() }, 'Überspringen'),
      ),
    );
    this.renderStats();
  }

  private renderAlg() {
    clear(this.algEl);
    if (!this.current) return;
    if (this.hideAlg && this.phase !== 'done') {
      this.algEl.append(h('span', { class: 'hm' }, '• • •'));
      return;
    }
    for (const m of algMoves(this.current, preferredAlg(this.current))) this.algEl.append(h('span', { class: 'hm done' }, moveToString(m)));
  }

  private onSmartMove(ev: SmartMove) {
    if (!this.ctx || !this.useSmart() || this.phase === 'done' || !this.current) return;
    if (this.phase === 'ready') {
      this.phase = 'running';
      this.startAt = ev.time;
    }
    this.moves++;
    this.lastAt = ev.time;
    // Zug auf dem Bildschirm mitdrehen (in der Lösehaltung)
    const p = this.ctx.view.player;
    p.extend([toHomeFrame(ev.move)]);
    p.tps = 14;
    p.play();
    if (this.targets.some((t) => sameColors(smartCube.state, t))) this.finish(this.lastAt - this.startAt);
  }

  private finish(ms: number) {
    const c = this.current;
    const ctx = this.ctx;
    if (!c || !ctx) return;
    this.phase = 'done';
    progress.recordExec(c.id, ms);
    const n = htm(algMoves(c, preferredAlg(c)));
    this.timerEl.textContent = (ms / 1000).toFixed(2);
    const best = progress.get(c.id).execBest!;
    clear(ctx.hudBottom);
    ctx.hudBottom.append(
      h('div', { class: 'hud-title' }, `${(ms / 1000).toFixed(2)} s · ${(n / (ms / 1000)).toFixed(1)} TPS${ms <= best ? ' · Bestzeit!' : ''}`),
      h('div', { class: 'hud-sub' }, `${caseTitle(c)} · ${formatAlg(algMoves(c, preferredAlg(c)))}`),
    );
    this.renderAlg();
    clear(ctx.actions);
    ctx.actions.append(h('div', { class: 'trainer-actions' }, h('button', { class: 'btn primary big', onclick: () => this.next() }, 'Nächster (Leertaste)')));
    if (this.useSmart()) setTimeout(() => this.ctx && this.phase === 'done' && this.next(), 1600);
    this.renderStats();
  }

  private renderStats() {
    clear(this.statsEl);
    const rows = ALL_CASES.filter((c) => this.active.includes(c.set))
      .map((c) => ({ c, p: progress.get(c.id) }))
      .filter((r) => r.p.execN)
      .map((r) => ({ ...r, avg: r.p.execSum! / r.p.execN! / 1000, tps: htm(algMoves(r.c, preferredAlg(r.c))) / (r.p.execSum! / r.p.execN! / 1000) }))
      .sort((a, b) => a.tps - b.tps);
    if (!rows.length) {
      this.statsEl.append(h('p', { class: 'muted small' }, 'Noch keine Zeiten – die langsamsten Algs (nach TPS) erscheinen hier.'));
      return;
    }
    for (const r of rows.slice(0, 8)) {
      this.statsEl.append(
        h('div', { class: 'weak-row' },
          h('b', null, caseTitle(r.c)),
          h('span', { class: 'muted' }, `Ø ${r.avg.toFixed(2)} s · ${r.tps.toFixed(1)} TPS · Best ${(r.p.execBest! / 1000).toFixed(2)} s · ${r.p.execN}×`),
          h('button', { class: 'link-btn small', onclick: () => { this.forced = r.c; this.next(); } }, 'drillen'),
        ),
      );
    }
  }
}

