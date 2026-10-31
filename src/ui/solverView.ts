import { applyMoves, moveToString, solvedState, type Move, type State } from '../cube/cube';
import { smartCube, sameColors } from '../smartcube/smartcube';
import { reconstructionSteps } from '../smartcube/splits';
import type { Solve } from './timerView';
import { conjugateAlg, formatAlg, htm, invertAlg, parseAlg, simplify } from '../cube/notation';
import type { Solution, SolveStep } from '../solver/cfop';
import { callSolver, solveAsync } from '../solver/client';
import { CASE_BY_ID, caseTitle } from '../algs/data';
import { CubeView } from '../render/CubeView';
import { moveWeight } from '../render/MovePlayer';
import { settings, saveSettings } from '../settings';
import { clear, h, modal, toast } from './dom';
import { llDiagram, llDiagram2 } from './caseDiagram';
import { scrambleFor, tryParseFor, wcaStart } from './puzzle';
import { engineFor } from '../cube/engine';
import { METHOD2_LABEL, type Method2 } from '../solver/cube2';
import { PHASE_COLORS, PHASE_LABELS } from './phases';

const CENTERS = [4, 13, 22, 31, 40, 49];
/** Startorientierung für WCA-Scrambles: Weiss oben, Grün vorne. */
const WCA_START: State = applyMoves(solvedState(), parseAlg('z2'));
/** Züge mit der Engine des aktiven Puzzles anwenden */
const applyFor = (s: State, moves: Move[]) => moves.reduce((acc, m) => engineFor(settings.puzzle).apply(acc, m), s);

export const tpsFromSlider = (v: number) => 0.5 * Math.pow(40, v / 100);
export const sliderFromTps = (t: number) => (Math.log(t / 0.5) / Math.log(40)) * 100;

interface SolveSource {
  /** Startzustand (Standard: gelöst, Weiss oben) */
  base?: State;
  /** Vorgegebene Schritte statt Solver (Rekonstruktion) */
  steps?: SolveStep[];
  title?: string;
  /** Zusätzlich mit der Solver-Lösung vergleichen */
  compare?: boolean;
  /** Dauer des eigenen Solves (Rekonstruktion) */
  seconds?: number;
}

interface Segment {
  kind: 'scramble' | 'step';
  step?: SolveStep;
  stepIndex: number;
  start: number;
  end: number;
}

export class SolverView {
  readonly el: HTMLElement;
  private view: CubeView | null = null;
  private stageSlot: HTMLElement;
  private hud = {
    phase: h('span', { class: 'phase-pill' }),
    title: h('div', { class: 'hud-title' }),
    sub: h('div', { class: 'hud-sub' }),
    alg: h('div', { class: 'hud-alg' }),
    counter: h('div', { class: 'hud-counter' }),
    time: h('div', { class: 'hud-time' }),
    hint: h('div', { class: 'hud-hint' }),
  };
  private panel: HTMLElement;
  private stepsEl = h('div', { class: 'steps' });
  private statsEl = h('div', { class: 'stats' });
  private scrambleEl = h('div', { class: 'scramble-text mono' });
  private playBtn!: HTMLButtonElement;
  private speedLabel = h('span', { class: 'speed-label mono' });
  private speedSlider!: HTMLInputElement;
  private realtimeBtn!: HTMLButtonElement;

  private scramble: Move[] = [];
  /** Freies Drehen per Wischen */
  private swipeOn = false;
  private sandbox = false;
  private swipeBtn = h('button', { class: 'chip-btn small', title: 'Würfel per Wischen auf den Stickern drehen', onclick: () => this.toggleSwipe() }, '🖐 Drehen');
  private sandboxBar = h('div', { class: 'sandbox-bar' });
  /** Letzter echter Scramble (für „Zurück zur Lösung“) */
  private lastScramble: Move[] = [];
  private liveBar!: HTMLElement;
  private live = false;
  private liveOff: Move[] = [];
  private solTitle = h('h3', null, 'Lösung');
  private modeSel!: HTMLSelectElement;
  /** Zusatz-Sets (3x3): WV, VLS, COLL, ZBLL – einzeln zuschaltbar */
  private advRow = h('div', { class: 'adv-row' });
  private solution: Solution | null = null;
  private segments: Segment[] = [];
  private scrambleLen = 0;
  private solveTime = 0;
  private realtime = false;
  private chipEls: HTMLElement[] = [];
  private lastIndex = -1;
  private activeSeg = -1;

  constructor() {
    this.stageSlot = h('div', { class: 'stage-slot' });
    const hudTop = h('div', { class: 'hud hud-top' }, h('div', { class: 'hud-row' }, this.hud.phase, this.hud.counter, this.hud.time), this.hud.title, this.hud.sub);
    const hudBottom = h('div', { class: 'hud hud-bottom' }, this.hud.alg, this.hud.hint);
    const camBtns = h(
      'div',
      { class: 'cam-btns' },
      ...(['default', 'top', 'back', 'bottom'] as const).map((v) =>
        h('button', { class: 'chip-btn small', title: 'Kameraansicht', onclick: () => this.view?.resetCamera(v) }, { default: '3D', top: 'Oben', back: 'Hinten', bottom: 'Unten' }[v]),
      ),
      this.swipeBtn,
    );
    this.stageSlot.append(hudTop, hudBottom, camBtns, this.sandboxBar);

    const controls = this.buildControls();
    this.panel = this.buildPanel();

    this.el = h(
      'section',
      { class: 'view solver-view' },
      h('div', { class: 'solver-layout' }, h('div', { class: 'stage-col' }, this.stageSlot, controls), this.panel),
    );
  }

  // ------------------------------------------------------------ Aufbau

  private buildControls() {
    const btn = (label: string, title: string, fn: () => void, cls = '') => h('button', { class: `ctrl-btn ${cls}`, title, 'aria-label': title, onclick: fn }, label);
    this.playBtn = btn('▶', 'Abspielen / Pause (Leertaste)', () => this.togglePlay(), 'play') as HTMLButtonElement;
    this.speedSlider = h('input', {
      type: 'range',
      min: 0,
      max: 100,
      step: 0.5,
      value: String(sliderFromTps(settings.tps)),
      class: 'speed-slider',
      'aria-label': 'Geschwindigkeit',
      oninput: () => {
        this.realtime = false;
        settings.tps = tpsFromSlider(Number(this.speedSlider.value));
        saveSettings();
        this.applySpeed();
      },
    }) as HTMLInputElement;
    this.realtimeBtn = h('button', { class: 'chip-btn', title: 'Lösung in deiner Zielzeit abspielen', onclick: () => this.toggleRealtime() }, `⏱ ${settings.targetTime}s`) as HTMLButtonElement;
    const presets = h(
      'div',
      { class: 'speed-presets' },
      ...[
        [1, 'Lernen'],
        [3, 'Normal'],
        [8, 'Schnell'],
      ].map(([t, label]) =>
        h('button', {
          class: 'chip-btn',
          onclick: () => {
            this.realtime = false;
            settings.tps = t as number;
            saveSettings();
            this.speedSlider.value = String(sliderFromTps(settings.tps));
            this.applySpeed();
          },
        }, label as string),
      ),
      this.realtimeBtn,
    );
    this.liveBar = h(
      'div',
      { class: 'live-bar' },
      h('button', { class: 'chip-btn live-toggle', title: 'Der 3D-Würfel folgt deinem echten Würfel', onclick: () => this.setLive(!this.live) }, '🔵 Mitverfolgen'),
      h('button', { class: 'chip-btn', title: 'Aktuellen Zustand deines Würfels lösen', onclick: () => this.solveMyCube() }, '🧊 Meinen Würfel lösen'),
    );
    smartCube.onStatus(() => this.updateLiveBar());
    smartCube.onMove((ev) => this.onSmartMove(ev.move));
    this.updateLiveBar();
    return h(
      'div',
      { class: 'controls glass' },
      this.liveBar,
      h(
        'div',
        { class: 'transport' },
        btn('⏮', 'Vorheriger Schritt (↑)', () => this.jumpStep(-1)),
        btn('◀', 'Zug zurück (←)', () => this.view?.player.stepBack()),
        this.playBtn,
        btn('▶|', 'Nächster Zug (→)', () => this.stepForward()),
        btn('⏭', 'Nächster Schritt (↓)', () => this.jumpStep(1)),
      ),
      h('div', { class: 'speed' }, h('span', { class: 'speed-icon' }, '🐢'), this.speedSlider, h('span', { class: 'speed-icon' }, '🐇'), this.speedLabel),
      presets,
    );
  }

  private buildPanel() {
    const toggle = (key: 'focus' | 'arrows' | 'autoRotate' | 'stopAfterStep', label: string, title: string) => {
      const input = h('input', {
        type: 'checkbox',
        checked: settings[key],
        onchange: () => {
          settings[key] = input.checked;
          saveSettings();
          this.applyViewSettings();
        },
      }) as HTMLInputElement;
      return h('label', { class: 'toggle', title }, input, h('span', { class: 'toggle-ui' }), label);
    };
    const modeSel = (this.modeSel = h('select', {
      class: 'select',
      title: 'Methode bzw. verwendete Alg-Kategorien',
      onchange: () => {
        if (settings.puzzle === 2) settings.method2 = modeSel.value as Method2;
        else settings.f2lMode = modeSel.value as 'alg' | 'optimal';
        saveSettings();
        if (!this.source.steps) this.solve(this.scramble, false, { base: this.source.base });
      },
    }) as HTMLSelectElement);
    this.fillModeOptions();
    this.renderAdvRow();

    return h(
      'aside',
      { class: 'panel' },
      h(
        'div',
        { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Scramble'), h('span', { class: 'muted small' }, 'Weiss oben · Grün vorne')),
        this.scrambleEl,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => this.newScramble() }, '🎲 Neuer Scramble'),
          h('button', { class: 'btn', onclick: () => this.customScramble() }, '✎ Eigener'),
          h('button', { class: 'btn', title: 'Link zu diesem Scramble kopieren', onclick: () => this.share() }, '🔗'),
        ),
      ),
      h(
        'div',
        { class: 'card glass' },
        h('div', { class: 'card-head' }, this.solTitle, modeSel),
        this.advRow,
        this.statsEl,
        this.stepsEl,
      ),
      h(
        'div',
        { class: 'card glass' },
        h('div', { class: 'card-head' }, h('h3', null, 'Ansicht')),
        h(
          'div',
          { class: 'toggles' },
          toggle('focus', 'Fokus auf aktuelle Steine', 'Nicht relevante Steine abdunkeln'),
          toggle('arrows', 'Zug-Pfeile', 'Pfeil für den nächsten Zug anzeigen'),
          toggle('stopAfterStep', 'Nach jedem Schritt pausieren', 'Ideal zum Lernen'),
          toggle('autoRotate', 'Automatisch drehen', 'Kamera dreht sich langsam, wenn pausiert'),
        ),
        h('p', { class: 'muted small' }, 'Tastatur: Leertaste = Play/Pause · ←/→ = Zug · ↑/↓ = Schritt · N = neuer Scramble. Kamera: ziehen zum Drehen, scrollen/zoomen mit zwei Fingern.'),
      ),
    );
  }

  /** Optionen der Methoden-Auswahl: 3x3 = F2L-Stil, 2x2 = Methode (Ortega / CLL / EG) */
  private fillModeOptions() {
    const sel = this.modeSel;
    sel.style.visibility = settings.puzzle === 4 ? 'hidden' : '';
    sel.replaceChildren(
      ...(settings.puzzle === 2
        ? (Object.keys(METHOD2_LABEL) as Method2[]).map((m) => h('option', { value: m, selected: settings.method2 === m }, METHOD2_LABEL[m]))
        : [
            h('option', { value: 'alg', selected: settings.f2lMode === 'alg' }, 'F2L: 41 Standard-Algs'),
            h('option', { value: 'optimal', selected: settings.f2lMode === 'optimal' }, 'F2L: Computer-optimal'),
          ]),
    );
  }

  private renderAdvRow() {
    clear(this.advRow);
    if (settings.puzzle !== 3) return;
    const items: [keyof typeof settings.adv, string, string][] = [
      ['wv', 'WV', 'Winter Variation: letztes Paar einsetzen und Ecken orientieren'],
      ['vls', 'VLS', 'Valk Last Slot: letztes Paar einsetzen und letzte Ebene orientieren'],
      ['coll', 'COLL', 'Ecken lösen, wenn die Kanten orientiert sind (danach nur EPLL)'],
      ['zbll', 'ZBLL', 'Letzte Ebene in einem Schritt, wenn die Kanten orientiert sind'],
    ];
    this.advRow.append(h('span', { class: 'muted small' }, 'Zusatz-Sets:'));
    for (const [key, label, title] of items) {
      this.advRow.append(
        h('button', {
          class: `chip-btn small ${settings.adv[key] ? 'active' : ''}`,
          title,
          onclick: () => {
            settings.adv = { ...settings.adv, [key]: !settings.adv[key] };
            saveSettings();
            this.renderAdvRow();
            if (!this.source.steps && this.solution) this.solve(this.scramble, false, { base: this.source.base });
          },
        }, label),
      );
    }
  }

  /** Wechsel zwischen 3x3 und 2x2 */
  private onPuzzleChange() {
    this.fillModeOptions();
    this.renderAdvRow();
    this.updateLiveBar();
    if (!this.view) return;
    this.view.setPuzzle(settings.puzzle);
    this.newScramble();
  }

  /** Löst je nach Puzzle mit dem 3x3-CFOP- oder dem 2x2-Solver */
  private runSolver(state: State): Promise<{ solution: Solution; ms: number }> {
    // 4x4: noch kein automatischer Löser – Verdrehen, freies Drehen und Timer funktionieren
    if (settings.puzzle === 4) return Promise.resolve({ solution: { steps: [], moveCount: 0 }, ms: 0 });
    return settings.puzzle === 2
      ? callSolver('solve2', state, settings.method2).then((r) => ({ solution: r.result, ms: r.ms }))
      : solveAsync(state, { f2lMode: settings.f2lMode, adv: settings.adv });
  }

  // ------------------------------------------------------------ Lebenszyklus

  activate() {
    if (!this.view) {
      document.addEventListener('alg-style-change', () => !this.source.steps && this.solution && this.solve(this.scramble, false, { base: this.source.base }));
      this.view = new CubeView(this.stageSlot, { intro: true, size: settings.puzzle });
      document.addEventListener('puzzle-change', () => this.onPuzzleChange());
      document.addEventListener('method2-change', () => {
        this.fillModeOptions();
        if (settings.puzzle === 2 && !this.source.steps && this.solution) this.solve(this.scramble, false, { base: this.source.base });
      });
      this.stageSlot.prepend(this.view.renderer.domElement);
      const p = this.view.player;
      p.onIndex = (i) => this.onIndex(i);
      p.onFinish = () => this.onFinish();
      // An Schrittgrenzen, wo pausiert wird, sauber abbremsen statt abrupt stoppen
      p.isBoundary = (i) => i === this.scrambleLen || (settings.stopAfterStep && this.segments.some((s) => s.kind === 'step' && s.start === i));
      this.view.onFrame = (dt) => this.onFrame(dt);
      this.applyViewSettings();
      const fromHash = this.scrambleFromHash();
      // Intro abwarten, dann scramblen
      setTimeout(() => this.solve(fromHash ?? scrambleFor(), true), fromHash ? 900 : 1500);
    }
    this.view.setRunning(true);
  }

  deactivate() {
    this.view?.player.pause();
    this.view?.setRunning(false);
    this.updatePlayBtn();
  }

  onKey(e: KeyboardEvent) {
    if (!this.view) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.togglePlay();
    } else if (e.key === 'ArrowRight') this.stepForward();
    else if (e.key === 'ArrowLeft') this.view.player.stepBack();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.jumpStep(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.jumpStep(-1);
    } else if (e.key.toLowerCase() === 'n') this.newScramble();
  }

  // ------------------------------------------------------------ Logik

  newScramble() {
    this.solve(scrambleFor(), true);
  }

  /** Lädt einen Scramble (aus Timer o.ä.) und zeigt die Lösung. */
  loadScramble(moves: Move[]) {
    this.solve(moves, true);
  }

  private solveToken = 0;
  private source: SolveSource = {};

  /**
   * Startet sofort mit dem Verdrehen; die Lösung wird parallel im Web Worker berechnet
   * und an die laufende Wiedergabe angehängt.
   */
  private async solve(scramble: Move[], animateScramble: boolean, opts: SolveSource = {}) {
    if (!this.view) return;
    const token = ++this.solveToken;
    this.sandbox = false;
    clear(this.sandboxBar);
    this.scramble = scramble;
    if (scramble.length) this.lastScramble = scramble;
    this.solution = null;
    this.source = opts;
    this.solTitle.textContent = opts.title ?? 'Lösung';
    this.modeSel.style.display = opts.steps ? 'none' : '';
    this.scrambleLen = scramble.length;
    this.segments = [{ kind: 'scramble', stepIndex: -1, start: 0, end: scramble.length }];
    const base = opts.base ?? wcaStart();
    const p = this.view.player;
    p.load(base, [...scramble], animateScramble ? 0 : this.scrambleLen);
    this.liveOff = [];
    this.solveTime = 0;
    this.renderScramble();
    this.renderSteps();
    clear(this.statsEl);
    this.statsEl.append(h('div', { class: 'muted small' }, 'Lösung wird berechnet …'));
    if (animateScramble) {
      p.stopAt = this.scrambleLen;
      p.play();
    }
    this.applySpeed();
    this.lastIndex = -1;
    this.activeSeg = -1;
    this.onIndex(p.index);
    if (scramble.length) history.replaceState(null, '', `#${settings.puzzle !== 3 ? `p=${settings.puzzle}&` : ''}scramble=${encodeURIComponent(formatAlg(scramble))}`);

    let solution: Solution;
    let ms: number | null = null;
    if (opts.steps) {
      solution = { steps: opts.steps, moveCount: opts.steps.reduce((n, st) => n + htm(st.moves), 0) };
    } else {
      const res = await this.runSolver(applyFor(base, scramble));
      solution = res.solution;
      ms = res.ms;
    }
    if (token !== this.solveToken) return; // inzwischen neuer Scramble
    this.solution = solution;
    const added: Move[] = [];
    let pos = scramble.length;
    solution.steps.forEach((st, i) => {
      this.segments.push({ kind: 'step', step: st, stepIndex: i, start: pos, end: pos + st.moves.length });
      added.push(...st.moves);
      pos += st.moves.length;
    });
    p.extend(added);
    this.renderSteps();
    this.renderStats(ms);
    this.activeSeg = -1;
    this.onIndex(p.index);
    if (opts.compare) {
      // Vergleich mit der Solver-Lösung desselben Scrambles
      const res = await this.runSolver(applyFor(base, scramble));
      if (token === this.solveToken) this.statsEl.append(h('div', { class: 'compare-line' }, `Solver (CFOP mit Standard-Algs): ${res.solution.moveCount} Züge · du: ${solution.moveCount} Züge`));
    }
  }

  /** Zeigt einen eigenen Smartcube-Solve Zug für Zug, aufgeteilt in Phasen. */
  loadReconstruction(solve: Solve) {
    if (!solve.moves || !solve.splits) return;
    const scramble = parseAlg(solve.scramble);
    const moves = parseAlg(solve.moves);
    const steps = reconstructionSteps(applyMoves(WCA_START, scramble), moves, solve.splits);
    const run = () => this.solve(scramble, false, { steps, title: `Deine Rekonstruktion · ${(solve.ms / 1000).toFixed(2)} s`, compare: true, seconds: solve.ms / 1000 });
    if (this.view) run();
    else setTimeout(run, 1600);
  }

  // ------------------------------------------------------------ Smartcube live

  private updateLiveBar() {
    this.liveBar.style.display = smartCube.connected && settings.puzzle === 3 ? '' : 'none';
    if (!smartCube.connected && this.live) this.setLive(false);
    this.liveBar.querySelector('.live-toggle')?.classList.toggle('active', this.live);
  }

  private setLive(on: boolean) {
    this.live = on;
    this.liveOff = [];
    this.updateLiveBar();
    if (on) {
      this.view?.player.pause();
      toast('Mitverfolgen an: mach den Scramble und die Lösung an deinem echten Würfel');
      this.onSmartMove();
    } else this.hud.hint.textContent = '';
  }

  /** Löst den Zustand, in dem sich der echte Würfel gerade befindet. */
  private solveMyCube() {
    if (!smartCube.connected) return;
    this.solve([], false, { base: smartCube.state, title: 'Lösung deines Würfels' });
    this.setLive(true);
  }

  /**
   * Sucht in der Zeitleiste den Stand, der zum echten Würfel passt, und springt dorthin.
   * Ein Schritt vorwärts wird animiert, damit es sich wie "mitdrehen" anfühlt.
   */
  private onSmartMove(move?: Move) {
    const p = this.view?.player;
    if (!this.live || !p) return;
    const phys = smartCube.state;
    const insp = this.segments.find((sg) => sg.kind === 'step' && sg.step!.phase === 'inspection');
    const rotated = insp ? applyMoves(phys, p.moves.slice(insp.start, insp.end)) : phys;
    const matches = (j: number) => {
      if (insp && j > insp.start && j < insp.end) return false;
      return sameColors(insp && j >= insp.end ? rotated : phys, p.states[j]);
    };
    let found = -1;
    if (p.index + 1 < p.states.length && matches(p.index + 1)) found = p.index + 1;
    else {
      let bestDist = Infinity;
      for (let j = 0; j < p.states.length; j++) {
        if (matches(j) && Math.abs(j - p.index) < bestDist) {
          found = j;
          bestDist = Math.abs(j - p.index);
        }
      }
    }
    if (found >= 0) {
      this.liveOff = [];
      // Nach dem Scramble automatisch über die Inspektionsdrehung hinweg
      if (insp && found === insp.start) found = insp.end;
      if (found === p.index + 1) p.stepForward();
      else if (found !== p.index) p.seek(found);
      this.hud.hint.textContent = found === p.moves.length ? '🎉 Gelöst!' : '✓ Weiter so';
    } else {
      if (move) this.liveOff.push(move);
      // Rückweg in der Haltung anzeigen, in der gerade gelöst wird (nach der Inspektion: Weiss unten)
      let back = simplify(invertAlg(this.liveOff));
      if (insp && p.index >= insp.end) back = conjugateAlg(back, invertAlg(p.moves.slice(insp.start, insp.end)));
      back = simplify(back);
      this.hud.hint.textContent = back.length ? `Abweichung – zurück mit: ${formatAlg(back)}` : 'Würfel passt nicht – „Meinen Würfel lösen“ nutzen';
    }
  }

  private scrambleFromHash(): Move[] | null {
    const m = location.hash.match(/scramble=([^&]+)/);
    if (!m) return null;
    // Geteilte 2x2-Links öffnen direkt im 2x2-Modus
    const p = (Number(location.hash.match(/[#&]p=([234])(&|$)/)?.[1]) || 3) as 2 | 3 | 4;
    if (p !== settings.puzzle) {
      settings.puzzle = p;
      saveSettings();
      this.view?.setPuzzle(p);
      document.dispatchEvent(new CustomEvent('puzzle-change', { detail: p }));
    }
    const moves = tryParseFor(decodeURIComponent(m[1]), p);
    return moves && moves.length ? moves : null;
  }

  private share() {
    const url = location.href;
    navigator.clipboard?.writeText(url).then(
      () => toast('Link kopiert – schick ihn deinen Kollegen!'),
      () => toast(url),
    );
  }

  private customScramble() {
    const ta = h('textarea', { class: 'input mono', rows: 3, placeholder: "z.B. R U R' U' F2 D' L2 …" }) as HTMLTextAreaElement;
    ta.value = formatAlg(this.scramble);
    const err = h('div', { class: 'error small' });
    const m = modal(
      h(
        'div',
        { class: 'form' },
        h('h2', null, 'Eigener Scramble'),
        h('p', { class: 'muted' }, 'Scramble wie im Wettkampf eingeben (Weiss oben, Grün vorne). Der Solver dreht danach mit z2 auf Weiss unten.'),
        ta,
        err,
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            class: 'btn primary',
            onclick: () => {
              const moves = tryParseFor(ta.value);
              if (!moves || !moves.length) {
                err.textContent = 'Notation nicht erkannt. Erlaubt: U D R L F B, Rw/r, M E S, x y z mit \' und 2.';
                return;
              }
              m.close();
              this.solve(moves, true);
            },
          }, 'Scramble übernehmen'),
        ),
      ),
    );
    setTimeout(() => ta.focus(), 50);
  }

  private togglePlay() {
    const p = this.view?.player;
    if (!p) return;
    if (p.playing) p.pause();
    else {
      if (p.finished) p.seek(this.scrambleLen);
      if (p.index === this.scrambleLen) this.solveTime = 0;
      p.stopAt = p.index < this.scrambleLen ? this.scrambleLen : null;
      p.play();
      if (p.index >= this.scrambleLen) this.hud.hint.textContent = '';
    }
    this.applySpeed();
    this.updatePlayBtn();
  }

  private stepForward() {
    this.view?.player.stepForward();
  }

  private jumpStep(dir: 1 | -1) {
    const p = this.view?.player;
    if (!p) return;
    p.pause();
    const starts = this.segments.map((s) => s.start);
    if (dir > 0) {
      const next = starts.find((s) => s > p.index);
      p.seek(next ?? p.moves.length);
    } else {
      const prev = starts.filter((s) => s < p.index).pop();
      p.seek(prev ?? 0);
    }
    this.updatePlayBtn();
  }

  private toggleRealtime() {
    if (this.realtime) {
      const v = prompt('Zielzeit für die Lösung in Sekunden:', String(settings.targetTime));
      const n = v ? parseFloat(v.replace(',', '.')) : NaN;
      if (n > 0) {
        settings.targetTime = n;
        saveSettings();
        this.realtimeBtn.textContent = `⏱ ${n}s`;
      }
    }
    this.realtime = true;
    this.applySpeed();
    toast(`Lösung läuft jetzt in ${settings.targetTime} s – wie bei dir!`);
  }

  private realtimeTps() {
    if (!this.view) return settings.tps;
    const w = this.view.player.moves.slice(this.scrambleLen).reduce((s, m) => s + moveWeight(m), 0);
    return Math.max(0.3, w / settings.targetTime);
  }

  private applySpeed() {
    const p = this.view?.player;
    if (!p) return;
    const inScramble = p.index < this.scrambleLen;
    const tps = inScramble ? settings.scrambleTps : this.realtime ? this.realtimeTps() : settings.tps;
    p.tps = tps;
    const shown = this.realtime ? this.realtimeTps() : settings.tps;
    this.speedLabel.textContent = `${shown.toFixed(shown < 10 ? 1 : 0)} TPS`;
    this.realtimeBtn.classList.toggle('active', this.realtime);
    if (this.realtime) this.speedSlider.value = String(sliderFromTps(Math.min(20, shown)));
  }

  private applyViewSettings() {
    if (!this.view) return;
    this.view.showArrows = settings.arrows;
    this.view.autoRotate = settings.autoRotate;
    this.updateLook();
  }

  private updatePlayBtn() {
    const p = this.view?.player;
    this.playBtn.textContent = p?.playing ? '❚❚' : '▶';
    this.playBtn.classList.toggle('playing', !!p?.playing);
  }

  private segmentAt(index: number) {
    // Der als nächstes auszuführende Zug bestimmt den aktiven Schritt
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (index >= s.start && index < s.end) return i;
    }
    return this.segments.length; // fertig
  }

  // ------------------------------------------------------------ Freies Drehen

  private toggleSwipe() {
    this.swipeOn = !this.swipeOn;
    this.swipeBtn.classList.toggle('active', this.swipeOn);
    if (this.view) this.view.onSwipe = this.swipeOn ? (m) => this.userMove(m) : null;
    if (this.swipeOn) toast('Wische über die Sticker, um Schichten zu drehen – neben dem Würfel dreht sich die Kamera');
  }

  /** Eigener Zug per Wischen: wechselt in den freien Modus ab dem gerade gezeigten Zustand */
  private userMove(m: Move) {
    const p = this.view!.player;
    if (!this.sandbox) {
      this.sandbox = true;
      this.solveToken++;
      p.load(p.state, []);
      this.segments = [];
      this.chipEls = [];
      this.view!.look = undefined;
      this.view!.setPhaseColor(PHASE_COLORS.scramble);
      this.hud.phase.textContent = 'Frei';
      this.hud.title.textContent = 'Freies Drehen';
      this.hud.sub.textContent = '';
      clear(this.hud.alg);
      this.sandboxBar.replaceChildren(
        ...(settings.puzzle === 4 ? [] : [h('button', { class: 'chip-btn', onclick: () => this.solve([], false, { base: this.view!.player.state, title: 'Lösung deines Zustands' }) }, '🧊 Diesen Zustand lösen')]),
        h('button', { class: 'chip-btn', onclick: () => this.solve(this.lastScramble, false) }, settings.puzzle === 4 ? '↩ Zurück zum Scramble' : '↩ Zurück zur Lösung'),
      );
    }
    p.extend([m]);
    p.tps = 10;
    p.play();
    this.hud.alg.append(h('span', { class: 'hm done' }, moveToString(m)));
    this.hud.counter.textContent = `${p.moves.length} Züge`;
  }

  private onIndex(index: number) {
    if (!this.view || this.sandbox) return;
    const p = this.view.player;
    const prevIndex = this.lastIndex;
    this.lastIndex = index;

    // Pause an Schrittgrenzen
    if (settings.stopAfterStep && p.playing && index > this.scrambleLen && index > prevIndex && this.segments.some((s) => s.start === index)) {
      p.pause();
    }
    const ready = index === this.scrambleLen && !!this.solution && (!p.playing || p.stopAt === this.scrambleLen);
    this.hud.hint.textContent = ready ? 'Bereit! ▶ drücken zum Lösen' : '';
    if (index <= this.scrambleLen) this.solveTime = 0;
    this.applySpeed();

    const segIdx = this.segmentAt(index);
    if (segIdx !== this.activeSeg) {
      this.activeSeg = segIdx;
      this.renderHudSegment();
      this.updateLook();
      this.stepsEl.querySelectorAll('.step').forEach((el, i) => el.classList.toggle('active', i + 1 === segIdx));
      const activeEl = this.stepsEl.querySelectorAll('.step')[segIdx - 1] as HTMLElement | undefined;
      // Nur das Seitenpanel scrollen (Desktop), nie die ganze Seite (Mobile)
      if (activeEl && p.playing && this.panel.scrollHeight > this.panel.clientHeight) {
        const top = activeEl.offsetTop - this.panel.offsetTop - 80;
        this.panel.scrollTo({ top, behavior: 'smooth' });
      }
    }
    this.renderHudAlg();
    this.chipEls.forEach((c, i) => {
      const g = i + this.scrambleLen;
      c.classList.toggle('done', g < index);
      c.classList.toggle('current', g === index);
    });
    const solMoves = p.moves.length - this.scrambleLen;
    const solIdx = Math.max(0, index - this.scrambleLen);
    this.hud.counter.textContent = index < this.scrambleLen ? `Scramble ${index}/${this.scrambleLen}` : `Zug ${solIdx}/${solMoves}`;
    this.updatePlayBtn();
  }

  private onFinish() {
    this.updatePlayBtn();
    if (this.view && this.view.player.index === this.view.player.moves.length && this.solution?.steps.length) {
      this.view.celebrate();
      const t = this.solveTime;
      toast(`Gelöst! ${this.solution.moveCount} Züge${t > 0 ? ` in ${t.toFixed(2)} s` : ''} 🎉`);
    }
  }

  private onFrame(dt: number) {
    const p = this.view!.player;
    if ((p.playing || p.animating) && p.index >= this.scrambleLen && !p.finished) this.solveTime += dt;
    this.hud.time.textContent = this.solveTime > 0 ? `⏱ ${this.solveTime.toFixed(2)} s` : '';
  }

  private updateLook() {
    if (!this.view) return;
    const seg = this.segments[this.activeSeg];
    const focus = settings.focus && seg?.kind === 'step' && seg.step!.focus.length ? new Set([...seg.step!.focus, ...CENTERS]) : null;
    this.view.look = focus ? (home) => (focus.has(home) ? 'color' : 'dim') : undefined;
  }

  // ------------------------------------------------------------ Darstellung

  private renderHudSegment() {
    const seg = this.segments[this.activeSeg];
    const phase = !seg ? 'done' : seg.kind === 'scramble' ? 'scramble' : seg.step!.phase;
    const color = PHASE_COLORS[phase];
    this.hud.phase.textContent = PHASE_LABELS[phase];
    this.hud.phase.style.setProperty('--c', color);
    this.view?.setPhaseColor(color);
    if (this.view) this.view.arrowColor = color;
    if (!seg && settings.puzzle === 4 && !this.solution?.steps.length) {
      this.hud.title.textContent = '4×4 verdreht';
      this.hud.sub.textContent = 'Löse selbst (🖐 Drehen) oder im Timer – einen automatischen 4×4-Löser gibt es noch nicht.';
      this.hud.phase.textContent = '4×4';
    } else if (!seg) {
      this.hud.title.textContent = 'Gelöst!';
      this.hud.sub.textContent = this.solution ? `${this.solution.moveCount} Züge (HTM)` : '';
    } else if (seg.kind === 'scramble') {
      this.hud.title.textContent = 'Würfel wird verdreht';
      this.hud.sub.textContent = '';
    } else {
      this.hud.title.textContent = seg.step!.title;
      this.hud.sub.textContent = seg.step!.subtitle ?? '';
    }
  }

  private renderHudAlg() {
    const p = this.view!.player;
    const seg = this.segments[this.activeSeg];
    clear(this.hud.alg);
    if (!seg) return;
    const moves = p.moves.slice(seg.start, seg.end);
    if (seg.kind === 'scramble') {
      this.hud.alg.classList.add('scramble');
    } else {
      this.hud.alg.classList.remove('scramble');
    }
    moves.forEach((m, i) => {
      const g = seg.start + i;
      const isAuf = seg.step && (i < seg.step.aufCount || i >= moves.length - seg.step.postAufCount);
      this.hud.alg.append(h('span', { class: `hm ${g < p.index ? 'done' : ''} ${g === p.index ? 'current' : ''} ${isAuf ? 'auf' : ''}` }, moveToString(m)));
    });
  }

  private renderScramble() {
    clear(this.scrambleEl);
    this.scrambleEl.append(this.scramble.length ? formatAlg(this.scramble) : h('span', { class: 'muted' }, 'Eigener Zustand (kein Scramble)'));
  }

  private renderStats(solveMs: number | null) {
    clear(this.statsEl);
    if (!this.solution) return;
    if (settings.puzzle === 4 && !this.solution.steps.length) {
      this.statsEl.append(
        h('div', { class: 'insight' }, 'Für den 4×4 gibt es noch keinen automatischen Löser (Reduktion: Zentren, Kantenpaare, Paritäten). Du kannst den Scramble abspielen, mit 🖐 selbst drehen, im Timer lösen und unter „Algorithmen“ die OLL- und PLL-Parität mit allen Fällen üben.'),
      );
      return;
    }
    const total = this.solution.moveCount;
    const byPhase = new Map<string, number>();
    for (const st of this.solution.steps) byPhase.set(st.phase, (byPhase.get(st.phase) ?? 0) + htm(st.moves));
    const bar = h('div', { class: 'phase-bar' });
    for (const [ph, n] of byPhase) {
      if (!n) continue;
      bar.append(h('div', { class: 'phase-seg', style: `flex:${n};--c:${PHASE_COLORS[ph as keyof typeof PHASE_COLORS]}`, title: `${PHASE_LABELS[ph as keyof typeof PHASE_LABELS]}: ${n}` }, String(n)));
    }
    const tps = total / settings.targetTime;
    this.statsEl.append(
      h(
        'div',
        { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', null, String(total)), h('span', null, 'Züge (HTM)')),
        h('div', { class: 'stat' }, h('b', null, tps.toFixed(1)), h('span', null, `TPS für ${settings.targetTime} s`)),
        solveMs === null
          ? h('div', { class: 'stat' }, h('b', null, `${(total / Math.max(0.01, this.source.seconds ?? 0)).toFixed(1)}`), h('span', null, 'deine TPS'))
          : h('div', { class: 'stat' }, h('b', null, `${solveMs.toFixed(0)}`), h('span', null, 'ms Rechenzeit')),
      ),
      bar,
      h('div', { class: 'phase-legend' }, ...[...byPhase.keys()].filter((k) => byPhase.get(k)).map((k) => h('span', { style: `--c:${PHASE_COLORS[k as keyof typeof PHASE_COLORS]}` }, PHASE_LABELS[k as keyof typeof PHASE_LABELS]))),
    );
  }

  private renderSteps() {
    clear(this.stepsEl);
    this.chipEls = [];
    if (!this.solution) return;
    const p = this.view!.player;
    this.segments.forEach((seg, si) => {
      if (seg.kind !== 'step') return;
      const st = seg.step!;
      const color = PHASE_COLORS[st.phase];
      const chips = h('div', { class: 'chips mono' });
      st.moves.forEach((m, i) => {
        const g = seg.start + i;
        const isAuf = i < st.aufCount || i >= st.moves.length - st.postAufCount;
        const chip = h(
          'button',
          {
            class: `mv ${isAuf ? 'auf' : ''}`,
            title: isAuf ? 'AUF (Ausrichten der oberen Ebene)' : 'Zu diesem Zug springen',
            onclick: () => {
              p.pause();
              p.seek(g);
              this.updatePlayBtn();
            },
          },
          moveToString(m),
        );
        chips.append(chip);
        this.chipEls[g - this.scrambleLen] = chip;
      });
      if (!st.moves.length) chips.append(h('span', { class: 'muted small' }, 'keine Züge nötig'));

      let diagram: SVGSVGElement | null = null;
      if (settings.puzzle === 3 && (st.phase === 'oll' || st.phase === 'pll') && st.method === 'alg') {
        diagram = llDiagram(p.states[seg.start + st.aufCount], st.phase, 64);
      } else if (settings.puzzle === 2 && st.method === 'alg') {
        diagram = llDiagram2(p.states[seg.start + st.aufCount], st.phase === 'oll' ? 'oll' : 'all', 64);
      }
      const card = h(
        'div',
        { class: `step method-${st.method}`, style: `--c:${color}` },
        h(
          'button',
          {
            class: 'step-head',
            onclick: () => {
              p.pause();
              p.seek(seg.start);
              this.updatePlayBtn();
            },
            title: 'Zum Anfang dieses Schritts springen',
          },
          h('span', { class: 'dot' }),
          h('span', { class: 'step-title' }, st.title),
          h('span', { class: 'step-sub' }, st.subtitle ?? ''),
          h('span', { class: 'step-count mono' }, String(htm(st.moves))),
        ),
        h('div', { class: 'step-body' }, diagram ? h('div', { class: 'step-diagram' }, diagram) : null, h('div', { class: 'step-main' }, chips, st.note ? h('div', { class: 'step-note' }, st.note) : null)),
        st.caseId
          ? h(
              'button',
              {
                class: 'link-btn small',
                onclick: () => document.dispatchEvent(new CustomEvent('open-case', { detail: st.caseId })),
              },
              `${caseTitle(CASE_BY_ID.get(st.caseId)!)} in der Sammlung öffnen →`,
            )
          : null,
      );
      void si;
      this.stepsEl.append(card);
    });
  }
}
