import { PERMS, type State } from '../cube/cube';
import { FACE_COLORS } from '../render/CubeModel';
import { svgEl } from './dom';

const GRAY = '#2d3039';

/** Positionen (Spalte, Reihe) im 5x5-Raster für U-Fläche und obere Seitenreihen. */
const LAYOUT: [number, number, number][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) LAYOUT.push([r * 3 + c, c + 1, r + 1]);
// Rückseite oben (von links nach rechts: B-Spalten 2,1,0)
LAYOUT.push([47, 1, 0], [46, 2, 0], [45, 3, 0]);
// Vorne unten
LAYOUT.push([18, 1, 4], [19, 2, 4], [20, 3, 4]);
// Links (von hinten nach vorne)
LAYOUT.push([36, 0, 1], [37, 0, 2], [38, 0, 3]);
// Rechts (von hinten nach vorne: R-Spalten 2,1,0)
LAYOUT.push([11, 4, 1], [10, 4, 2], [9, 4, 3]);

/**
 * Draufsicht der letzten Ebene (wie in Alg-Sammlungen).
 * mode 'oll': nur Gelb farbig, 'pll': alle Farben + Pfeile.
 */
export function llDiagram(s: State, mode: 'oll' | 'pll', size = 92): SVGSVGElement {
  const cell = 20;
  const svg = svgEl('svg', { viewBox: `-2 -2 ${cell * 5 + 4} ${cell * 5 + 4}`, width: size, height: size, class: 'll-diagram' });
  for (const [i, col, row] of LAYOUT) {
    const side = i >= 9;
    const color = Math.floor(s[i] / 9);
    const fill = mode === 'oll' && color !== 0 ? GRAY : FACE_COLORS[color];
    const x = col * cell;
    const y = row * cell;
    let w = cell - 2;
    let hgt = cell - 2;
    let ox = x + 1;
    let oy = y + 1;
    if (side) {
      if (row === 0) { hgt = 6; oy = y + cell - 8; }
      if (row === 4) { hgt = 6; oy = y + 2; }
      if (col === 0) { w = 6; ox = x + cell - 8; }
      if (col === 4) { w = 6; ox = x + 2; }
    }
    svg.append(svgEl('rect', { x: ox, y: oy, width: w, height: hgt, rx: 3, fill }));
  }
  if (mode === 'pll') drawArrows(svg, s, cell);
  return svg;
}

function center(i: number, cell: number): [number, number] {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return [(c + 1) * cell + cell / 2, (r + 1) * cell + cell / 2];
}

function drawArrows(svg: SVGSVGElement, s: State, cell: number) {
  // Zielposition jedes U-Stickers, bis auf eine abschliessende U-Drehung
  let best: number[] | null = null;
  let bestMoved = 99;
  for (let b = 0; b < 4; b++) {
    const perm = PERMS.U[b];
    const fwd = new Array(54);
    for (let j = 0; j < 54; j++) fwd[perm[j]] = j;
    const targets = Array.from({ length: 9 }, (_, i) => (s[i] < 9 ? fwd[s[i]] : i));
    const moved = targets.filter((t, i) => t !== i).length;
    if (moved < bestMoved) {
      bestMoved = moved;
      best = targets;
    }
  }
  if (!best) return;
  const id = `ah${Math.random().toString(36).slice(2, 8)}`;
  const marker = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' }, svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#fff' }));
  svg.append(svgEl('defs', {}, marker));
  const drawn = new Set<string>();
  best.forEach((t, i) => {
    if (t === i || i === 4) return;
    const swap = best![t] === i;
    const key = [Math.min(i, t), Math.max(i, t)].join('-');
    if (swap && drawn.has(key)) return;
    drawn.add(key);
    const [x1, y1] = center(i, cell);
    const [x2, y2] = center(t, cell);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const sh = 5 / len;
    const attrs: Record<string, string | number> = {
      x1: x1 + dx * sh,
      y1: y1 + dy * sh,
      x2: x2 - dx * sh,
      y2: y2 - dy * sh,
      stroke: '#fff',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'marker-end': `url(#${id})`,
    };
    if (swap) attrs['marker-start'] = `url(#${id})`;
    svg.append(svgEl('line', attrs));
  });
}

/** Klassisches Würfelnetz (für Timer-Vorschau). */
export function netDiagram(s: State, width = 240): SVGSVGElement {
  const c = 10;
  const svg = svgEl('svg', { viewBox: `0 0 ${c * 12 + 6} ${c * 9 + 4}`, width, class: 'net-diagram' });
  // Position der Flächen im Netz (Spalte, Reihe in Flächeneinheiten)
  const off: Record<number, [number, number]> = { 0: [1, 0], 4: [0, 1], 2: [1, 1], 1: [2, 1], 5: [3, 1], 3: [1, 2] };
  for (let f = 0; f < 6; f++) {
    const [fx, fy] = off[f];
    for (let k = 0; k < 9; k++) {
      const r = Math.floor(k / 3);
      const col = k % 3;
      svg.append(
        svgEl('rect', {
          x: fx * (c * 3 + 1.5) + col * c + 1,
          y: fy * (c * 3 + 1.5) + r * c + 1,
          width: c - 1,
          height: c - 1,
          rx: 1.5,
          fill: FACE_COLORS[Math.floor(s[f * 9 + k] / 9)],
        }),
      );
    }
  }
  return svg;
}
