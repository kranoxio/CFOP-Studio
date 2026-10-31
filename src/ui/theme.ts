import { settings } from '../settings';

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

/** Ist gerade der helle Modus aktiv (explizit oder per System)? */
export function isLight(): boolean {
  if (settings.theme === 'light') return true;
  if (settings.theme === 'dark') return false;
  return !!media?.matches;
}

/** Setzt Theme- und Einhand-Klassen am Dokument und benachrichtigt die 3D-Ansichten. */
export function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = isLight() ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight() ? '#f4f5fa' : '#07080d');
  document.body.classList.toggle('one-hand', settings.oneHand !== 'off');
  document.body.classList.toggle('hand-left', settings.oneHand === 'left');
  document.body.classList.toggle('hand-right', settings.oneHand === 'right');
  document.dispatchEvent(new CustomEvent('theme-change', { detail: isLight() }));
}

media?.addEventListener('change', () => settings.theme === 'system' && applyAppearance());
