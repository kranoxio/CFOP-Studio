import { CubeView } from '../render/CubeView';
import { clear, h } from './dom';
import { RecogMode } from './trainer/recog';
import { CrossMode } from './trainer/cross';
import { LookaheadMode } from './trainer/lookahead';
import { DrillMode } from './trainer/drill';
import type { TrainerContext, TrainerMode } from './trainer/types';
import { storage } from '../util/storage';
import { settings } from '../settings';

/** Trainer mit drei Modi: Fall-Erkennung, Kreuz/X-Cross, Lookahead. */
export class TrainerView {
  readonly el: HTMLElement;
  private view: CubeView | null = null;
  private stageSlot = h('div', { class: 'stage-slot trainer-stage' });
  private hudTop = h('div', { class: 'hud hud-top' });
  private hudBottom = h('div', { class: 'hud hud-bottom' });
  private actions = h('div', { class: 'controls glass' });
  private side = h('div', { class: 'trainer-side' });
  private modeTabs = h('div', { class: 'seg-tabs mode-tabs' });
  private recog = new RecogMode();
  private drillMode = new DrillMode();
  private modes: TrainerMode[] = [this.recog, this.drillMode, new CrossMode(), new LookaheadMode()];
  private mode: TrainerMode;
  private active = false;

  constructor() {
    this.mode = this.modes.find((m) => m.id === storage.get('trainerMode', 'recog')) ?? this.recog;
    this.stageSlot.append(this.hudTop, this.hudBottom);
    this.el = h(
      'section',
      { class: 'view trainer-view' },
      h(
        'div',
        { class: 'solver-layout' },
        h('div', { class: 'stage-col' }, h('div', { class: 'mode-bar' }, this.modeTabs), this.stageSlot, this.actions),
        h('aside', { class: 'panel' }, this.side),
      ),
    );
    this.renderTabs();
    document.addEventListener('puzzle-change', () => {
      if (settings.puzzle === 2 && this.mode !== this.recog) this.switchMode(this.recog);
      else if (this.active) this.startMode();
      this.renderTabs();
    });
  }

  /** Kreuz- und Lookahead-Trainer gibt es nur für den 3x3 */
  private available(m: TrainerMode) {
    return settings.puzzle === 3 || m === this.recog || m === this.drillMode;
  }

  /** Einen bestimmten Fall im Drill üben. */
  drill(id: string) {
    this.switchMode(this.drillMode);
    this.drillMode.drill(id);
  }

  /** Einen bestimmten Fall im Erkennungs-Trainer zeigen. */
  train(id: string) {
    this.switchMode(this.recog);
    this.recog.train(id);
  }

  activate() {
    if (!this.view) {
      this.view = new CubeView(this.stageSlot);
      this.stageSlot.prepend(this.view.renderer.domElement);
    }
    this.view.setRunning(true);
    this.active = true;
    if (!this.available(this.mode)) {
      this.mode = this.recog;
      this.renderTabs();
    }
    this.startMode();
  }

  deactivate() {
    this.mode.stop();
    this.active = false;
    this.view?.player.pause();
    this.view?.setRunning(false);
  }

  onKey(e: KeyboardEvent) {
    this.mode.onKey?.(e);
  }

  private switchMode(m: TrainerMode) {
    if (m === this.mode) return;
    if (this.active) this.mode.stop();
    this.mode = m;
    storage.set('trainerMode', m.id);
    this.renderTabs();
    if (this.active) this.startMode();
  }

  private startMode() {
    if (!this.view) return;
    for (const el of [this.hudTop, this.hudBottom, this.actions, this.side]) clear(el);
    const v = this.view;
    v.setPuzzle(settings.puzzle);
    v.player.pause();
    v.player.onIndex = null;
    v.player.onFinish = null;
    v.onFrame = null;
    v.onSwipe = null;
    v.look = undefined;
    const ctx: TrainerContext = { view: v, hudTop: this.hudTop, hudBottom: this.hudBottom, actions: this.actions, side: this.side };
    this.mode.start(ctx);
  }

  private renderTabs() {
    clear(this.modeTabs);
    for (const m of this.modes) {
      if (!this.available(m)) continue;
      this.modeTabs.append(h('button', { class: `seg ${m === this.mode ? 'active' : ''}`, onclick: () => this.switchMode(m) }, m.label));
    }
  }
}
