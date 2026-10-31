import { geometry } from '../cube/cube';
import { geometry4 } from '../cube/cube4';
import type { AlgSet } from '../algs/data';
import type { StickerLook } from '../render/CubeModel';

/** Maskierung wie in Alg-Sammlungen: F2L ohne letzte Ebene, OLL nur Gelb, PLL alles. */
export function lookFor(set: AlgSet): ((home: number) => StickerLook) | undefined {
  if (set === 'F2L') return (home) => (geometry(home).p[1] === 1 ? 'gray' : 'color');
  if (set === 'OLL' || set === '2OLL' || set === 'WV' || set === 'VLS') return (home) => (geometry(home).p[1] === 1 && Math.floor(home / 9) !== 0 ? 'gray' : 'color');
  if (set === '4OLL') return (home) => (geometry4(home).p[1] === 3 && Math.floor(home / 16) !== 0 ? 'gray' : 'color');
  return undefined;
}
