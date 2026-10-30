import { centerColor, colorOf, faceletsOfCubie, geometry, type State, type Vec3 } from './cube';

/** Prüft, ob alle angegebenen Facelets die Farbe des Mittelsteins ihrer Fläche haben. */
export function faceletsSolved(s: State, facelets: readonly number[]): boolean {
  for (const i of facelets) if (colorOf(s, i) !== centerColor(s, Math.floor(i / 9))) return false;
  return true;
}

export type SlotName = 'FR' | 'FL' | 'BL' | 'BR';

export interface SlotInfo {
  name: SlotName;
  label: string;
  x: number;
  z: number;
  cornerFacelets: number[];
  edgeFacelets: number[];
  /** Heimat-Index des weissen (D) Stickers der Ecke */
  cornerToken: number;
  /** Heimat-Index des Kanten-Stickers auf der F- oder B-Seite */
  edgeToken: number;
}

function makeSlot(name: SlotName, label: string, x: number, z: number): SlotInfo {
  const corner: Vec3 = [x, -1, z];
  const edge: Vec3 = [x, 0, z];
  const cornerFacelets = faceletsOfCubie(corner);
  const edgeFacelets = faceletsOfCubie(edge);
  return {
    name,
    label,
    x,
    z,
    cornerFacelets,
    edgeFacelets,
    cornerToken: cornerFacelets.find((i) => geometry(i).n[1] === -1)!,
    edgeToken: edgeFacelets.find((i) => geometry(i).n[2] !== 0)!,
  };
}

export const SLOTS: SlotInfo[] = [
  makeSlot('FR', 'vorne rechts', 1, 1),
  makeSlot('FL', 'vorne links', -1, 1),
  makeSlot('BL', 'hinten links', -1, -1),
  makeSlot('BR', 'hinten rechts', 1, -1),
];

/** D-Kanten inkl. Seiten-Sticker */
export const CROSS_FACELETS: number[] = [
  ...faceletsOfCubie([0, -1, 1]),
  ...faceletsOfCubie([1, -1, 0]),
  ...faceletsOfCubie([0, -1, -1]),
  ...faceletsOfCubie([-1, -1, 0]),
];
/** Heimat-Indizes der weissen Kreuz-Sticker (auf D) */
export const CROSS_TOKENS = [28, 30, 32, 34];

export const U_FACELETS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const LL_FACELETS: number[] = Array.from({ length: 54 }, (_, i) => i).filter((i) => geometry(i).p[1] === 1);

export const crossSolved = (s: State) => faceletsSolved(s, CROSS_FACELETS);
export const slotSolved = (s: State, slot: SlotInfo) =>
  faceletsSolved(s, slot.cornerFacelets) && faceletsSolved(s, slot.edgeFacelets);

export function solvedSlots(s: State): SlotInfo[] {
  return SLOTS.filter((sl) => slotSolved(s, sl));
}

export function f2lSolved(s: State): boolean {
  return crossSolved(s) && SLOTS.every((sl) => slotSolved(s, sl));
}

export function ollSolved(s: State): boolean {
  return f2lSolved(s) && faceletsSolved(s, U_FACELETS);
}

export function isSolved(s: State): boolean {
  for (let i = 0; i < 54; i++) if (colorOf(s, i) !== centerColor(s, Math.floor(i / 9))) return false;
  return true;
}

/** Ist der Würfel bis auf eine U-Drehung gelöst? */
export function solvedUpToAUF(s: State): boolean {
  for (let i = 0; i < 54; i++) {
    if (geometry(i).p[1] === 1) continue;
    if (colorOf(s, i) !== centerColor(s, Math.floor(i / 9))) return false;
  }
  return true;
}
