import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import { h } from './ui/dom';
import { SolverView } from './ui/solverView';
import { warmupSolver } from './solver/client';
import { perf } from './render/perf';
import { settings } from './settings';
import { smartCube } from './smartcube/smartcube';
import { openSettings } from './ui/settingsPanel';
import { applyAppearance } from './ui/theme';
import { parseFor, setPuzzle } from './ui/puzzle';
import { startAutoSync } from './net/sync';

type TabId = 'solver' | 'algs' | 'trainer' | 'timer' | 'stats';
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
  stats: () => import('./ui/statsView').then((m) => new m.StatsView()),
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
  ['stats', '📈', 'Statistik'],
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
perf.setVisible(settings.showPerf, perfHost);
const cubeChip = h('button', { class: 'cube-chip', title: 'Smartcube', onclick: () => openSettings() });
const renderCubeChip = () => {
  cubeChip.className = `cube-chip ${smartCube.connected ? 'on' : ''}`;
  cubeChip.textContent = smartCube.connected ? `🔵 ${smartCube.isSimulator ? 'Simulator' : smartCube.name}${smartCube.battery !== null ? ` · ${smartCube.battery}%` : ''}` : '';
};
smartCube.onStatus(renderCubeChip);
renderCubeChip();
const puzzleBtn = h('div', { class: 'seg-tabs puzzle-switch', title: 'Puzzle wählen' });
const renderPuzzleBtn = () => {
  puzzleBtn.replaceChildren(
    ...([3, 2, 4] as const).map((p) => h('button', { class: `seg ${settings.puzzle === p ? 'active' : ''}`, onclick: () => setPuzzle(p) }, `${p}×${p}`)),
  );
};
renderPuzzleBtn();
document.addEventListener('puzzle-change', renderPuzzleBtn);
document.body.dataset.puzzle = String(settings.puzzle);
const settingsBtn = h('button', { class: 'icon-btn settings-btn', title: 'Einstellungen', 'aria-label': 'Einstellungen', onclick: () => openSettings() }, '⚙');

const viewsEl = h('main', { class: 'views' }, solver.el);
const app = document.getElementById('app')!;
app.append(
  h('header', { class: 'topbar' }, h('div', { class: 'logo' }, h('span', { class: 'logo-cube' }), h('span', null, 'CFOP ', h('b', null, 'Studio'))), makeNav('top-nav'), h('div', { class: 'topbar-right' }, perfHost, cubeChip, puzzleBtn, settingsBtn)),
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
document.addEventListener('open-trainer', () => show('trainer'));
document.addEventListener('drill-case', async (e) => {
  const view = (await getView('trainer')) as import('./ui/trainerView').TrainerView;
  view.drill((e as CustomEvent<string>).detail);
  show('trainer');
});
document.addEventListener('show-reconstruction', (e) => {
  show('solver');
  solver.loadReconstruction((e as CustomEvent<import('./ui/timerView').Solve>).detail);
});
document.addEventListener('show-scramble', (e) => {
  show('solver');
  solver.loadScramble(parseFor((e as CustomEvent<string>).detail));
});

applyAppearance();
startAutoSync();
// Einladungslink zu einem Battle-Raum öffnet direkt den Timer
if (/[#&]battle=/.test(location.hash)) setTimeout(() => show('timer'), 0);
warmupSolver();
show('solver');

// Offline-Fähigkeit und sofortiges Laden beim zweiten Besuch
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
