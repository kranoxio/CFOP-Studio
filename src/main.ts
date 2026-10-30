import './styles.css';
import { parseAlg } from './cube/notation';
import { h } from './ui/dom';
import { SolverView } from './ui/solverView';
import { AlgsView } from './ui/algsView';
import { TrainerView } from './ui/trainerView';
import { TimerView } from './ui/timerView';

type TabId = 'solver' | 'algs' | 'trainer' | 'timer';
interface View {
  el: HTMLElement;
  activate(): void;
  deactivate(): void;
  onKey?(e: KeyboardEvent): void;
}

const views: Record<TabId, View> = {
  solver: new SolverView(),
  algs: new AlgsView(),
  trainer: new TrainerView(),
  timer: new TimerView(),
};
const TABS: [TabId, string, string][] = [
  ['solver', '🧊', 'Solver'],
  ['algs', '▦', 'Algorithmen'],
  ['trainer', '🎯', 'Trainer'],
  ['timer', '⏱', 'Timer'],
];

let current: TabId | null = null;
const navButtons: HTMLElement[] = [];

function show(tab: TabId) {
  if (current === tab) return;
  if (current) {
    views[current].deactivate();
    views[current].el.classList.remove('active');
  }
  current = tab;
  views[tab].el.classList.add('active');
  views[tab].activate();
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.body.dataset.view = tab;
}

const makeNav = (cls: string) =>
  h(
    'nav',
    { class: cls },
    ...TABS.map(([id, icon, label]) => {
      const b = h('button', { class: 'nav-btn', 'data-tab': id, onclick: () => show(id) }, h('span', { class: 'nav-icon' }, icon), h('span', { class: 'nav-label' }, label));
      navButtons.push(b);
      return b;
    }),
  );

const app = document.getElementById('app')!;
app.append(
  h('header', { class: 'topbar' }, h('div', { class: 'logo' }, h('span', { class: 'logo-cube' }), h('span', null, 'CFOP ', h('b', null, 'Studio'))), makeNav('top-nav')),
  h('main', { class: 'views' }, ...Object.values(views).map((v) => v.el)),
  makeNav('bottom-nav'),
);

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, .modal-overlay')) return;
  if (current) views[current].onKey?.(e);
});

document.addEventListener('open-case', () => {
  if (current !== 'algs') show('algs');
});
document.addEventListener('train-case', () => {
  if (current === 'trainer') views.trainer.activate();
  else show('trainer');
});
document.addEventListener('show-scramble', (e) => {
  show('solver');
  (views.solver as SolverView).loadScramble(parseAlg((e as CustomEvent<string>).detail));
});

show('solver');
