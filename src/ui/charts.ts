import { h, svgEl } from './dom';

export interface LinePoint {
  /** y-Wert (z.B. Sekunden) oder null für eine Lücke */
  value: number | null;
  label: string;
}

export interface LineSeries {
  name: string;
  /** CSS-Variable der Serienfarbe, z.B. var(--series-1) */
  color: string;
  points: LinePoint[];
  width?: number;
}

const fmt = (v: number) => (v >= 60 ? `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}` : v.toFixed(2));

/**
 * Liniendiagramm mit gemeinsamer y-Achse, Legende, Fadenkreuz und Tooltip.
 * Alle Serien teilen dieselbe x-Achse (Index).
 */
export function lineChart(series: LineSeries[], opts: { unit?: string; height?: number } = {}): HTMLElement {
  const W = 640;
  const H = opts.height ?? 220;
  const pad = { l: 44, r: 14, t: 12, b: 24 };
  const n = Math.max(...series.map((s) => s.points.length));
  const values = series.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v !== null));
  const wrap = h('div', { class: 'chart' });
  if (!values.length || n < 2) {
    wrap.append(h('div', { class: 'muted small' }, 'Noch zu wenige Daten für ein Diagramm.'));
    return wrap;
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = Math.max(0.5, hi - lo);
  lo = Math.max(0, lo - span * 0.1);
  hi = hi + span * 0.1;
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  // Raster: 4 horizontale Linien, zurückhaltend
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3;
    svg.append(
      svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'chart-grid' }),
      Object.assign(svgEl('text', { x: pad.l - 6, y: y(v) + 4, class: 'chart-axis', 'text-anchor': 'end' }), { textContent: fmt(v) }),
    );
  }
  for (const s of series) {
    let d = '';
    s.points.forEach((p, i) => {
      if (p.value === null) return;
      d += `${d && s.points[i - 1]?.value !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    });
    svg.append(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width ?? 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }

  // Fadenkreuz + Tooltip
  const cross = svgEl('line', { y1: pad.t, y2: H - pad.b, class: 'chart-cross', visibility: 'hidden' });
  const dots = series.map((s) => svgEl('circle', { r: 5, fill: s.color, stroke: 'var(--chart-surface)', 'stroke-width': 2, visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const tip = h('div', { class: 'chart-tip' });
  const hit = svgEl('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' });
  const move = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    cross.setAttribute('visibility', 'visible');
    const rows: HTMLElement[] = [];
    series.forEach((s, k) => {
      const p = s.points[i];
      if (!p || p.value === null) return dots[k].setAttribute('visibility', 'hidden');
      dots[k].setAttribute('cx', String(x(i)));
      dots[k].setAttribute('cy', String(y(p.value)));
      dots[k].setAttribute('visibility', 'visible');
      rows.push(h('div', null, h('span', { class: 'chart-key', style: `background:${s.color}` }), `${s.name}: `, h('b', null, fmt(p.value) + (opts.unit ?? ''))));
    });
    tip.replaceChildren(h('div', { class: 'muted small' }, series[0].points[i]?.label ?? ''), ...rows);
    tip.style.left = `${(x(i) / W) * 100}%`;
    tip.classList.add('show');
  };
  const leave = () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tip.classList.remove('show');
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
  svg.append(hit);

  const legend = h('div', { class: 'chart-legend' }, ...series.map((s) => h('span', null, h('span', { class: 'chart-key', style: `background:${s.color}` }), s.name)));
  wrap.append(legend, h('div', { class: 'chart-plot' }, svg, tip));
  return wrap;
}

export interface BarRow {
  label: string;
  value: number;
  /** Referenzwert (wird als dünne Marke gezeigt) */
  ref?: number;
  detail?: string;
}

/**
 * Horizontale Balken (eine Serie) mit optionaler Referenzmarke je Zeile.
 * Werte stehen als Text neben dem Balken, Details im Tooltip.
 */
export function barChart(rows: BarRow[], opts: { unit?: string; refLabel?: string } = {}): HTMLElement {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.ref ?? 0))) * 1.08;
  const wrap = h('div', { class: 'bars' });
  for (const r of rows) {
    const over = r.ref !== undefined && r.value > r.ref;
    const bar = h(
      'div',
      { class: 'bar-row', tabindex: 0, title: r.detail ?? '' },
      h('span', { class: 'bar-label' }, r.label),
      h(
        'div',
        { class: 'bar-track' },
        h('div', { class: 'bar-fill', style: `width:${(r.value / max) * 100}%` }),
        r.ref !== undefined ? h('div', { class: 'bar-ref', style: `left:${(r.ref / max) * 100}%` }) : null,
      ),
      h('span', { class: `bar-value mono ${over ? 'over' : ''}` }, `${r.value.toFixed(2)}${opts.unit ?? ''}`),
      r.detail ? h('div', { class: 'bar-tip' }, r.detail) : null,
    );
    wrap.append(bar);
  }
  if (opts.refLabel) wrap.append(h('div', { class: 'chart-legend' }, h('span', null, h('span', { class: 'chart-key' }), 'Du'), h('span', null, h('span', { class: 'chart-key ref' }), opts.refLabel)));
  return wrap;
}
