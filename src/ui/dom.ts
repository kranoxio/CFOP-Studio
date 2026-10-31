type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/** Kleiner DOM-Helfer: h('div', { class: 'x', onclick: fn }, kinder...) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: SVGElement[]) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

export function clear(el: Element) {
  while (el.firstChild) el.firstChild.remove();
}

let toastTimer = 0;
export function toast(text: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast' });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2200);
}

export function modal(content: HTMLElement, opts: { wide?: boolean; onClose?: () => void } = {}) {
  const close = () => {
    overlay.classList.remove('open');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 200);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const box = h('div', { class: `modal ${opts.wide ? 'wide' : ''}` }, h('button', { class: 'modal-close icon-btn', 'aria-label': 'Schliessen', onclick: close }, '✕'), content);
  const overlay = h('div', { class: 'modal-overlay', onclick: (e: Event) => e.target === overlay && close() }, box);
  document.body.append(overlay);
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('open'));
  return { close, box };
}

export function fmtTime(ms: number) {
  if (!isFinite(ms)) return 'DNF';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}
