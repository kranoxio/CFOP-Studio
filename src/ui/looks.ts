import { geometry } from '../cube/cube';
import type { AlgSet } from '../algs/data';
import type { StickerLook } from '../render/CubeModel';

/** Maskierung wie in Alg-Sammlungen: F2L ohne letzte Ebene, OLL nur Gelb, PLL alles. */
export function lookFor(set: AlgSet): ((home: number) => StickerLook) | undefined {
  if (set === 'F2L') return (home) => (geometry(home).p[1] === 1 ? 'gray' : 'color');
  if (set === 'OLL') return (home) => (geometry(home).p[1] === 1 && Math.floor(home / 9) !== 0 ? 'gray' : 'color');
  return undefined;
}
