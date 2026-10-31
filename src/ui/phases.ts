import type { Phase } from '../solver/cfop';

export const PHASE_COLORS: Record<Phase | 'scramble' | 'done', string> = {
  scramble: '#8e8e9a',
  inspection: '#a0a4b8',
  cross: '#4cc9ff',
  f2l: '#3ddc84',
  oll: '#ffd60a',
  pll: '#c77dff',
  ls: '#2dd4bf',
  coll: '#ffb703',
  zbll: '#ff6b9d',
  face: '#4cc9ff',
  layer: '#4cc9ff',
  cll: '#ffd60a',
  eg: '#ff9f43',
  pbl: '#c77dff',
  done: '#ffffff',
};

export const PHASE_LABELS: Record<Phase | 'scramble' | 'done', string> = {
  scramble: 'Scramble',
  inspection: 'Inspektion',
  cross: 'Kreuz',
  f2l: 'F2L',
  oll: 'OLL',
  pll: 'PLL',
  ls: 'Last Slot',
  coll: 'COLL',
  zbll: 'ZBLL',
  face: 'Erste Seite',
  layer: 'Erste Ebene',
  cll: 'CLL',
  eg: 'EG',
  pbl: 'PBL',
  done: 'Gelöst',
};
