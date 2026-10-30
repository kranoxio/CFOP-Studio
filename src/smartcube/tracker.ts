import { applyMove, moveToString, type Move, type State } from '../cube/cube';
import { formatAlg, invertAlg, simplify } from '../cube/notation';
import { h, clear } from '../ui/dom';
import { WCA_START, sameColors, smartCube } from './smartcube';

/**
 * Verfolgt, wie weit der echte Würfel den Scramble schon ausgeführt hat.
 * Doppelzüge dürfen als zwei Vierteldrehungen gemacht werden; bei Abweichungen
 * wird der Rückweg zum letzten passenden Stand angezeigt.
 */
export class ScrambleTracker {
  readonly targets: State[];
  /** Index des letzten passenden Zwischenstands (-1 = Würfel passt zu keinem) */
  progress = -1;
  private off: Move[] = [];
  readonly el = h('div', { class: 'scramble-tracker' });
  private unsub: (() => void) | null = null;

  constructor(
    readonly scramble: Move[],
    private onDone: () => void,
  ) {
    this.targets = [WCA_START];
    for (const m of scramble) this.targets.push(applyMove(this.targets[this.targets.length - 1], m));
  }

  get done() {
    return this.progress === this.scramble.length;
  }

  /** Zustand des Würfels, den der Scramble erzeugen soll (WCA-Rahmen) */
  get target() {
    return this.targets[this.targets.length - 1];
  }

  start() {
    this.check(smartCube.state, null);
    const offMove = smartCube.onMove((ev) => this.check(smartCube.state, ev.move));
    const offState = smartCube.onState((s) => {
      this.off = [];
      this.check(s, null);
    });
    this.unsub = () => {
      offMove();
      offState();
    };
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  private check(state: State, move: Move | null) {
    if (this.done) return;
    let found = -1;
    // Vom Ende her suchen: bevorzugt den weitesten passenden Stand
    for (let k = this.targets.length - 1; k >= 0; k--) {
      if (sameColors(state, this.targets[k])) {
        found = k;
        break;
      }
    }
    if (found >= 0) {
      this.progress = found;
      this.off = [];
    } else if (move) {
      this.off.push(move);
    }
    this.render();
    if (this.done) this.onDone();
  }

  private render() {
    clear(this.el);
    if (this.progress < 0 && !this.off.length) {
      this.el.append(h('div', { class: 'tracker-hint warn' }, 'Würfel passt nicht zum Start. Löse ihn und tippe in den Einstellungen auf „✓ Ist gelöst“.'));
    }
    const chips = h('div', { class: 'chips mono' });
    this.scramble.forEach((m, i) => {
      const cls = i < this.progress ? 'done' : i === this.progress && !this.off.length ? 'current' : '';
      chips.append(h('span', { class: `mv ${cls}` }, moveToString(m)));
    });
    this.el.append(chips);
    if (this.off.length) {
      const back = simplify(invertAlg(this.off));
      // Kurze Abweichungen (z.B. halber Doppelzug) nicht als Fehler melden
      const halfDouble = this.off.length === 1 && this.scramble[this.progress]?.base === this.off[0].base && this.scramble[this.progress].amount === 2;
      if (!halfDouble && back.length) this.el.append(h('div', { class: 'tracker-hint warn' }, `Abweichung – zurück mit: `, h('b', { class: 'mono' }, formatAlg(back))));
    }
    if (this.done) this.el.append(h('div', { class: 'tracker-hint ok' }, '✓ Scramble fertig'));
  }
}
