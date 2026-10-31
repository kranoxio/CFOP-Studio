import { storage } from './util/storage';

export interface Settings {
  tps: number;
  scrambleTps: number;
  targetTime: number;
  focus: boolean;
  arrows: boolean;
  autoRotate: boolean;
  stopAfterStep: boolean;
  f2lMode: 'alg' | 'optimal';
  gridAnimate: boolean;
  gridTps: number;
  inspection: boolean;
  showPerf: boolean;
  theme: 'system' | 'dark' | 'light';
  /** 2H = normale Algs, OH = einhändige Algs (OLL/PLL) */
  algStyle: '2h' | 'oh';
  /** Daumen-Layout für die Bedienung mit einer Hand */
  oneHand: 'off' | 'left' | 'right';
  lookaheadTps: number;
  crossGoal: 'cross' | 'xcross';
  crossInspection: boolean;
  /** Aktives Puzzle */
  puzzle: 2 | 3 | 4;
  /** Methode für den 2x2 (bestimmt die verwendeten Alg-Kategorien) */
  method2: 'ortega' | 'cll' | 'eg';
  /** Zusätzliche 3x3-Sets im Solver */
  adv: { wv?: boolean; vls?: boolean; coll?: boolean; zbll?: boolean };
  /** Würfel folgt der Neigung des Geräts */
  tilt: boolean;
}

const DEFAULTS: Settings = {
  tps: 3,
  scrambleTps: 14,
  targetTime: 12,
  focus: true,
  arrows: true,
  autoRotate: false,
  stopAfterStep: false,
  f2lMode: 'alg',
  gridAnimate: true,
  gridTps: 3,
  inspection: false,
  showPerf: false,
  theme: 'system',
  algStyle: '2h',
  oneHand: 'off',
  lookaheadTps: 2.5,
  crossGoal: 'cross',
  crossInspection: true,
  puzzle: 3,
  method2: 'ortega',
  adv: {},
  tilt: false,
};

export const settings: Settings = { ...DEFAULTS, ...storage.get<Partial<Settings>>('settings', {}) };

export function saveSettings() {
  storage.set('settings', settings);
  document.dispatchEvent(new CustomEvent('settings-change'));
}
