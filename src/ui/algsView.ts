import { applyMoves, moveToString, solvedState, type Move } from '../cube/cube';
import { conjugateAlg, formatAlg, invertAlg, parseAlg, simplify } from '../cube/notation';
import type { SlotName } from '../cube/analysis';
import { SLOT_ROTATION } from '../solver/cfop';
import { htm } from '../cube/notation';
import { ALL_CASES, SETS_BY_PUZZLE, SET_LABEL, caseTitle, type AlgCase, type AlgSet } from '../algs/data';
import { algMoves, algStyle, caseState, rotationFree, getCustomAlg, preferredAlg, setCustomAlg, styleAlgs, validateAlg } from '../algs/registry';
import { GridRenderer } from '../render/GridRenderer';
import { CubeView } from '../render/CubeView';
import { lookFor } from './looks';
import { progress, type LearnStatus } from '../progress';
import { settings, saveSettings } from '../settings';
import { clear, h, modal, toast } from './dom';
import { llDiagram, llDiagram2 } from './caseDiagram';
import { sliderFromTps, tpsFromSlider } from './solverView';

const STATUS_LABEL: Record<LearnStatus, string> = { new: 'Neu', learning: 'Am Lernen', learned: 'Gelernt' };

export class AlgsView {
  readonly el: HTMLElement;
  private grid: GridRenderer | null = null;
  private scroll: HTMLElement;
  private gridEl = h('div', { class: 'alg-grid' });
  private set: AlgSet = settings.puzzle === 2 ? '2OLL' : 'OLL';
  private group = 'Alle';
  private query = '';
  private filter: 'all' | 'fav' | LearnStatus = 'all';
  private tabs: HTMLElement;
  private groupsEl = h('div', { class: 'group-chips' });
  private cardEls = new Map<string, HTMLElement>();
  /** Eine Detail-3D-Ansicht für alle Modals (WebGL-Kontext wird wiederverwendet) */
  private detailView: CubeView | null = null;

  constructor() {
    this.tabs = h('div', { class: 'seg-tabs' });
    const search = h('input', {
      class: 'input search',
      type: 'search',
      placeholder: 'Suchen: Nummer, Name, Alg…',
      oninput: () => {
        this.query = search.value.trim().toLowerCase();
        this.renderGrid();
      },
    }) as HTMLInputElement;
    const filterSel = h(
      'select',
      {
        class: 'select',
        onchange: () => {
          this.filter = filterSel.value as typeof this.filter;
          this.renderGrid();
        },
      },
      h('option', { value: 'all' }, 'Alle'),
      h('option', { value: 'fav' }, '★ Favoriten'),
      h('option', { value: 'new' }, 'Neu'),
      h('option', { value: 'learning' }, 'Am Lernen'),
      h('option', { value: 'learned' }, 'Gelernt'),
    ) as HTMLSelectElement;
    const animToggle = h('input', {
      type: 'checkbox',
      checked: settings.gridAnimate,
      onchange: () => {
        settings.gridAnimate = animToggle.checked;
        saveSettings();
        if (this.grid) this.grid.animate = settings.gridAnimate;
      },
    }) as HTMLInputElement;
    const speed = h('input', {
      type: 'range',
      class: 'speed-slider small',
      min: 0,
      max: 100,
      value: String(sliderFromTps(settings.gridTps)),
      oninput: () => {
        settings.gridTps = tpsFromSlider(Number(speed.value));
        saveSettings();
        if (this.grid) this.grid.tps = settings.gridTps;
      },
    }) as HTMLInputElement;

    this.scroll = h('div', { class: 'algs-scroll' }, this.gridEl);
    this.el = h(
      'section',
      { class: 'view algs-view' },
      h(
        'div',
        { class: 'algs-toolbar glass' },
        h('div', { class: 'toolbar-row' }, this.tabs, search, filterSel),
        h(
          'div',
          { class: 'toolbar-row' },
          this.groupsEl,
          h('div', { class: 'toolbar-right' }, h('label', { class: 'toggle' }, animToggle, h('span', { class: 'toggle-ui' }), 'Animieren'), h('span', { class: 'muted small' }, 'Tempo'), speed),
        ),
      ),
      this.scroll,
    );
    document.addEventListener('alg-style-change', () => this.grid && this.renderGrid());
    document.addEventListener('puzzle-change', () => {
      if (!SETS_BY_PUZZLE[settings.puzzle].includes(this.set)) this.set = SETS_BY_PUZZLE[settings.puzzle][settings.puzzle === 2 ? 0 : 1];
      this.group = 'Alle';
      if (this.grid) {
        this.renderTabs();
        this.renderGrid();
      }
    });
    progress.subscribe(() => {
      this.renderTabs();
      this.refreshBadges();
    });
  }

  activate() {
    if (!this.grid) {
      this.grid = new GridRenderer(this.scroll);
      this.grid.animate = settings.gridAnimate;
      this.grid.tps = settings.gridTps;
      this.renderTabs();
      this.renderGrid();
    }
    this.grid.setActive(true);
  }

  deactivate() {
    this.grid?.setActive(false);
  }

  setSet(set: AlgSet) {
    this.set = set;
    this.group = 'Alle';
    this.renderTabs();
    this.renderGrid();
  }

  private renderTabs() {
    clear(this.tabs);
    for (const set of SETS_BY_PUZZLE[settings.puzzle]) {
      const cases = ALL_CASES.filter((c) => c.set === set);
      const learned = cases.filter((c) => progress.status(c.id) === 'learned').length;
      this.tabs.append(
        h('button', { class: `seg ${set === this.set ? 'active' : ''}`, onclick: () => this.setSet(set) }, SET_LABEL[set], h('span', { class: 'seg-count' }, `${learned}/${cases.length}`)),
      );
    }
    clear(this.groupsEl);
    const groups = ['Alle', ...new Set(ALL_CASES.filter((c) => c.set === this.set).map((c) => c.group))];
    for (const g of groups) {
      this.groupsEl.append(
        h('button', {
          class: `chip-btn ${g === this.group ? 'active' : ''}`,
          onclick: () => {
            this.group = g;
            this.renderTabs();
            this.renderGrid();
          },
        }, g),
      );
    }
  }

  private visibleCases(): AlgCase[] {
    return ALL_CASES.filter((c) => {
      if (c.set !== this.set) return false;
      if (this.group !== 'Alle' && c.group !== this.group) return false;
      if (this.filter === 'fav' && !progress.isFav(c.id)) return false;
      if (['new', 'learning', 'learned'].includes(this.filter) && progress.status(c.id) !== this.filter) return false;
      if (this.query) {
        const hay = `${caseTitle(c)} ${c.name ?? ''} ${c.group} ${styleAlgs(c).join(' ')}`.toLowerCase();
        if (!hay.includes(this.query)) return false;
      }
      return true;
    });
  }

  private renderGrid() {
    clear(this.gridEl);
    this.cardEls.clear();
    const cases = this.visibleCases();
    const cells = [];
    for (const c of cases) {
      const view = h('div', { class: 'cell-view' });
      const alg = preferredAlg(c);
      const card = h(
        'div',
        {
          class: 'alg-card',
          tabindex: 0,
          onclick: (e: Event) => {
            if ((e.target as HTMLElement).closest('.card-action')) return;
            this.openCase(c.id);
          },
          onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && this.openCase(c.id),
          onmouseenter: () => this.grid?.restart(view),
        },
        view,
        h(
          'div',
          { class: 'alg-card-info' },
          h('div', { class: 'alg-card-title' }, h('b', null, caseTitle(c)), c.name && c.name !== c.key ? h('span', { class: 'muted' }, c.name) : null),
          h('div', { class: 'alg-card-alg mono' }, alg),
          h(
            'div',
            { class: 'alg-card-actions' },
            h('button', {
              class: 'card-action fav',
              title: 'Favorit',
              onclick: () => progress.toggleFav(c.id),
            }, '☆'),
            h('button', {
              class: 'card-action status',
              title: 'Lernstatus ändern',
              onclick: () => progress.cycleStatus(c.id),
            }, ''),
            getCustomAlg(c.id) ? h('span', { class: 'badge', title: 'Eigener Alg' }, 'eigener') : null,
          ),
        ),
      );
      this.cardEls.set(c.id, card);
      this.gridEl.append(card);
      cells.push({ el: view, base: caseState(c), moves: algMoves(c, alg), look: lookFor(c.set), view: ['F2L', 'WV', 'VLS'].includes(c.set) ? ('side' as const) : ('top' as const), size: c.puzzle === 2 ? (2 as const) : (3 as const) });
    }
    if (!cases.length) this.gridEl.append(h('div', { class: 'empty muted' }, 'Keine Fälle für diesen Filter.'));
    this.grid?.setCells(cells);
    this.refreshBadges();
  }

  private refreshBadges() {
    for (const [id, card] of this.cardEls) {
      const fav = card.querySelector('.fav')!;
      fav.textContent = progress.isFav(id) ? '★' : '☆';
      fav.classList.toggle('on', progress.isFav(id));
      const st = progress.status(id);
      const stEl = card.querySelector('.status')!;
      stEl.textContent = STATUS_LABEL[st];
      stEl.className = `card-action status st-${st}`;
    }
  }

  // ------------------------------------------------------------ Detail

  openCase(id: string) {
    const c = ALL_CASES.find((x) => x.id === id);
    if (!c) return;
    let algText = preferredAlg(c);
    const stage = h('div', { class: 'detail-stage' });
    const chips = h('div', { class: 'chips mono detail-chips' });
    const playBtn = h('button', { class: 'ctrl-btn play' }, '▶') as HTMLButtonElement;
    const algList = h('div', { class: 'alg-list' });
    const diagram = h('div', { class: 'detail-diagram' });
    let loop = true;
    let view: CubeView | null = null;
    let restartTimer = 0;

    // F2L (und WV/VLS): Fall in jedem der vier Slots ansehen – Alg wird ohne Rotation umbenannt
    let slot: SlotName = 'FR';
    const slotInfo = h('div', { class: 'muted small slot-note' });
    const slotMoves = () => (slot === 'FR' ? algMoves(c, algText) : conjugateAlg(rotationFree(algText), SLOT_ROTATION[slot]));
    const slotPicker = ['F2L', 'WV', 'VLS'].includes(c.set)
      ? h(
          'div',
          { class: 'slot-picker' },
          h('span', { class: 'muted small' }, 'Slot:'),
          ...(['FL', 'FR', 'BL', 'BR'] as SlotName[]).map((sl) =>
            h('button', {
              class: `chip-btn small ${sl === slot ? 'active' : ''}`,
              'data-slot': sl,
              onclick: () => {
                slot = sl;
                slotPicker!.querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.slot === sl));
                load();
              },
            }, { FL: 'vorne links', FR: 'vorne rechts', BL: 'hinten links', BR: 'hinten rechts' }[sl]),
          ),
        )
      : null;
    const load = () => {
      if (!view) return;
      const moves = slotMoves();
      const start = applyMoves(solvedState(), invertAlg(moves));
      view.player.load(start, moves);
      slotInfo.textContent =
        slot === 'FR' || !slotPicker
          ? ''
          : `Ohne Drehen: ${formatAlg(moves)}  ·  mit Drehen: ${formatAlg(simplify([...SLOT_ROTATION[slot], ...parseAlg(algText)]))}`;
      view.player.tps = settings.gridTps;
      renderChips(moves);
      clear(diagram);
      if (c.puzzle === 2) diagram.append(llDiagram2(caseState(c, algText), c.set === '2OLL' ? 'oll' : 'all', 110));
      else if (c.set !== 'F2L') diagram.append(llDiagram(caseState(c, algText), c.set === 'OLL' ? 'oll' : 'pll', 110));
      setTimeout(() => view?.player.play(), 500);
    };
    const renderChips = (moves: Move[]) => {
      clear(chips);
      moves.forEach((m, i) =>
        chips.append(
          h('button', {
            class: 'mv',
            onclick: () => {
              view!.player.pause();
              view!.player.seek(i);
            },
          }, moveToString(m)),
        ),
      );
    };
    const renderAlgList = () => {
      clear(algList);
      const custom = getCustomAlg(c.id);
      const base = styleAlgs(c);
      const options = [...base, ...(custom && !base.includes(custom) ? [custom] : [])];
      for (const a of options) {
        const mine = preferredAlg(c) === a;
        algList.append(
          h(
            'div',
            { class: `alg-option ${a === algText ? 'shown' : ''}` },
            h('button', {
              class: 'alg-text mono',
              title: 'Diesen Alg anzeigen',
              onclick: () => {
                algText = a;
                renderAlgList();
                load();
              },
            }, a),
            h('span', { class: 'muted small mono' }, `${htm(algMoves(c, a))}`),
            h('button', {
              class: `chip-btn small ${mine ? 'active' : ''}`,
              title: 'Diesen Alg im Solver und Trainer verwenden',
              onclick: () => {
                setCustomAlg(c.id, a === styleAlgs(c)[0] ? null : a);
                renderAlgList();
                this.renderGrid();
                toast('Gespeichert – der Solver nutzt jetzt diesen Alg');
              },
            }, mine ? '✓ Mein Alg' : 'Verwenden'),
          ),
        );
      }
    };

    const customInput = h('input', { class: 'input mono', placeholder: 'Eigenen Alg eingeben…' }) as HTMLInputElement;
    const customMsg = h('div', { class: 'small' });
    const speed = h('input', {
      type: 'range',
      class: 'speed-slider',
      min: 0,
      max: 100,
      value: String(sliderFromTps(settings.gridTps)),
      oninput: () => {
        if (view) view.player.tps = tpsFromSlider(Number(speed.value));
      },
    }) as HTMLInputElement;
    const loopToggle = h('input', { type: 'checkbox', checked: true, onchange: () => (loop = loopToggle.checked) }) as HTMLInputElement;
    const statusSel = h(
      'select',
      { class: 'select', onchange: () => progress.setStatus(c.id, statusSel.value as LearnStatus) },
      ...(['new', 'learning', 'learned'] as LearnStatus[]).map((s) => h('option', { value: s, selected: progress.status(c.id) === s }, STATUS_LABEL[s])),
    ) as HTMLSelectElement;
    const favBtn = h('button', { class: `chip-btn ${progress.isFav(c.id) ? 'active' : ''}`, onclick: () => favBtn.classList.toggle('active', progress.toggleFav(c.id)) }, '★ Favorit');

    const content = h(
      'div',
      { class: 'detail' },
      h(
        'div',
        { class: 'detail-head' },
        h('h2', null, caseTitle(c), c.name && c.name !== c.key ? h('span', { class: 'muted' }, ` · ${c.name}`) : null),
        h('div', { class: 'muted' }, c.group, c.prob ? ` · Wahrscheinlichkeit ${c.prob}` : ''),
      ),
      h(
        'div',
        { class: 'detail-body' },
        h(
          'div',
          { class: 'detail-left' },
          stage,
          chips,
          h(
            'div',
            { class: 'transport' },
            h('button', { class: 'ctrl-btn', title: 'Neu starten', onclick: () => { view!.player.seek(0); view!.player.play(); } }, '⟲'),
            h('button', { class: 'ctrl-btn', title: 'Zug zurück', onclick: () => view!.player.stepBack() }, '◀'),
            playBtn,
            h('button', { class: 'ctrl-btn', title: 'Nächster Zug', onclick: () => view!.player.stepForward() }, '▶|'),
          ),
          h('div', { class: 'speed' }, h('span', { class: 'speed-icon' }, '🐢'), speed, h('span', { class: 'speed-icon' }, '🐇'), h('label', { class: 'toggle' }, loopToggle, h('span', { class: 'toggle-ui' }), 'Schleife')),
        ),
        h(
          'div',
          { class: 'detail-right' },
          diagram,
          h('div', { class: 'btn-row' }, favBtn, statusSel),
          slotPicker,
          slotInfo,
          h('h4', null, algStyle() === 'oh' && (c.set === 'OLL' || c.set === 'PLL') ? 'Algorithmen (OH)' : 'Algorithmen'),
          algList,
          h('h4', null, 'Eigener Alg'),
          h(
            'div',
            { class: 'inline-form' },
            customInput,
            h('button', {
              class: 'btn',
              onclick: () => {
                const res = validateAlg(c, customInput.value);
                customMsg.textContent = (res.ok ? '✓ ' : '✗ ') + res.message;
                customMsg.className = `small ${res.ok ? 'ok' : 'error'}`;
                if (res.ok) {
                  setCustomAlg(c.id, customInput.value.trim());
                  algText = customInput.value.trim();
                  renderAlgList();
                  this.renderGrid();
                  load();
                }
              },
            }, 'Prüfen & speichern'),
          ),
          customMsg,
          h('p', { class: 'muted small' }, 'Dein Alg wird gegen eine Würfel-Simulation geprüft. Rotationen (x, y, z), Wide Moves und Slices sind erlaubt.'),
          h('button', {
            class: 'btn primary',
            onclick: () => {
              m.close();
              document.dispatchEvent(new CustomEvent('train-case', { detail: c.id }));
            },
          }, '🎯 Diesen Fall im Trainer üben'),
        ),
      ),
    );

    this.grid?.setActive(false);
    const m = modal(content, {
      wide: true,
      onClose: () => {
        clearTimeout(restartTimer);
        view?.player.pause();
        view?.setRunning(false);
        view = null;
        this.grid?.setActive(this.el.classList.contains('active'));
      },
    });
    requestAnimationFrame(() => {
      if (!this.detailView) this.detailView = new CubeView(stage, { cameraDistance: 9.5 });
      else this.detailView.mount(stage);
      this.detailView.setPuzzle(c.puzzle === 2 ? 2 : 3);
      view = this.detailView;
      view.setRunning(true);
      view.showArrows = true;
      view.arrowColor = c.set === 'F2L' ? '#3ddc84' : c.set === 'OLL' || c.set === '2OLL' || c.set === 'CLL' ? '#ffd60a' : c.set === 'EG1' || c.set === 'EG2' ? '#ff9f43' : '#c77dff';
      view.setPhaseColor(view.arrowColor);
      view.look = lookFor(c.set);
      view.resetCamera(c.set === 'F2L' ? 'default' : 'top');
      view.player.onIndex = (i) => {
        chips.querySelectorAll('.mv').forEach((el, k) => {
          el.classList.toggle('done', k < i);
          el.classList.toggle('current', k === i);
        });
      };
      view.player.onFinish = () => {
        if (!loop) return;
        restartTimer = window.setTimeout(() => {
          if (!view) return;
          view.player.seek(0);
          setTimeout(() => view?.player.play(), 450);
        }, 1100);
      };
      view.onFrame = () => {
        playBtn.textContent = view!.player.playing ? '❚❚' : '▶';
      };
      playBtn.onclick = () => {
        const p = view!.player;
        if (p.playing) p.pause();
        else {
          if (p.finished) p.seek(0);
          p.play();
        }
      };
      renderAlgList();
      load();
    });
  }
}
