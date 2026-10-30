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
};

export const settings: Settings = { ...DEFAULTS, ...storage.get<Partial<Settings>>('settings', {}) };

export function saveSettings() {
  storage.set('settings', settings);
  document.dispatchEvent(new CustomEvent('settings-change'));
}
