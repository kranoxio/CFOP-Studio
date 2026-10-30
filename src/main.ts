import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import { parseAlg } from './cube/notation';
import { h } from './ui/dom';
import { SolverView } from './ui/solverView';
import { warmupSolver } from './solver/client';
import { perf } from './render/perf';
import { settings, saveSettings } from './settings';

type TabId = 'solver' | 'algs' | 'trainer' | 'timer';
interface View {
  el: HTMLElement;
  activate(): void;
  deactivate(): void;
  onKey?(e: KeyboardEvent): void;
}

// Solver sofort, alles andere erst beim ersten Öffnen laden (kleineres Start-Bundle)
const solver = new SolverView();
const loaders: Record<Exclude<TabId, 'solver'>, () => Promise<View>> = {
  algs: () => import('./ui/algsView').then((m) => new m.AlgsView()),
  trainer: () => import('./ui/trainerView').then((m) => new m.TrainerView()),
  timer: () => import('./ui/timerView').then((m) => new m.TimerView()),
};
const views: Partial<Record<TabId, View>> = { solver };
const loading = new Map<TabId, Promise<View>>();

function getView(tab: TabId): Promise<View> {
  const v = views[tab];
  if (v) return Promise.resolve(v);
  let p = loading.get(tab);
  if (!p) {
    p = loaders[tab as Exclude<TabId, 'solver'>]().then((view) => {
      views[tab] = view;
      viewsEl.append(view.el);
      return view;
    });
    loading.set(tab, p);
  }
  return p;
}

const TABS: [TabId, string, string][] = [
  ['solver', '🧊', 'Solver'],
  ['algs', '▦', 'Algorithmen'],
  ['trainer', '🎯', 'Trainer'],
  ['timer', '⏱', 'Timer'],
];

let current: TabId | null = null;
const navButtons: HTMLElement[] = [];

async function show(tab: TabId): Promise<View> {
  if (current === tab) return views[tab]!;
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const view = await getView(tab);
  if (current) {
    views[current]?.deactivate();
    views[current]?.el.classList.remove('active');
  }
  current = tab;
  view.el.classList.add('active');
  view.activate();
  document.body.dataset.view = tab;
  return view;
}

const makeNav = (cls: string) =>
  h(
    'nav',
    { class: cls },
    ...TABS.map(([id, icon, label]) => {
      const b = h('button', { class: 'nav-btn', 'data-tab': id, onclick: () => show(id) }, h('span', { class: 'nav-icon' }, icon), h('span', { class: 'nav-label' }, label));
      // Beim Darüberfahren schon vorladen
      b.addEventListener('pointerenter', () => id !== 'solver' && getView(id), { once: true });
      navButtons.push(b);
      return b;
    }),
  );

const perfHost = h('div', { class: 'perf-host' });
const perfBtn = h('button', {
  class: `icon-btn perf-toggle ${settings.showPerf ? 'active' : ''}`,
  title: 'Leistungsanzeige (FPS)',
  'aria-label': 'Leistungsanzeige',
  onclick: () => {
    settings.showPerf = !settings.showPerf;
    saveSettings();
    perf.setVisible(settings.showPerf, perfHost);
    perfBtn.classList.toggle('active', settings.showPerf);
  },
}, '⚡');
perf.setVisible(settings.showPerf, perfHost);

const viewsEl = h('main', { class: 'views' }, solver.el);
const app = document.getElementById('app')!;
app.append(
  h('header', { class: 'topbar' }, h('div', { class: 'logo' }, h('span', { class: 'logo-cube' }), h('span', null, 'CFOP ', h('b', null, 'Studio'))), makeNav('top-nav'), h('div', { class: 'topbar-right' }, perfHost, perfBtn)),
  viewsEl,
  makeNav('bottom-nav'),
);

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, .modal-overlay')) return;
  if (current) views[current]?.onKey?.(e);
});

document.addEventListener('open-case', async (e) => {
  const view = (await show('algs')) as import('./ui/algsView').AlgsView;
  view.openCase((e as CustomEvent<string>).detail);
});
document.addEventListener('train-case', async (e) => {
  const view = (await getView('trainer')) as import('./ui/trainerView').TrainerView;
  view.train((e as CustomEvent<string>).detail);
  show('trainer');
});
document.addEventListener('show-scramble', (e) => {
  show('solver');
  solver.loadScramble(parseAlg((e as CustomEvent<string>).detail));
});

warmupSolver();
show('solver');

// Offline-Fähigkeit und sofortiges Laden beim zweiten Besuch
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
