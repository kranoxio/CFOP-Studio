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
};

export const settings: Settings = { ...DEFAULTS, ...storage.get<Partial<Settings>>('settings', {}) };

export function saveSettings() {
  storage.set('settings', settings);
}
