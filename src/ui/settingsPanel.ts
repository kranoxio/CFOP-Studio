import { settings, saveSettings } from '../settings';
import { smartCube } from '../smartcube/smartcube';
import { perf } from '../render/perf';
import { setAlgStyle } from '../algs/registry';
import { applyAppearance } from './theme';
import { setPuzzle } from './puzzle';
import { clear, h, modal, toast } from './dom';

type Option<T> = [T, string];

function segmented<T extends string>(value: T, options: Option<T>[], onChange: (v: T) => void) {
  const wrap = h('div', { class: 'seg-tabs' });
  const render = (cur: T) => {
    clear(wrap);
    for (const [v, label] of options) {
      wrap.append(
        h('button', {
          class: `seg ${v === cur ? 'active' : ''}`,
          onclick: () => {
            onChange(v);
            render(v);
          },
        }, label),
      );
    }
  };
  render(value);
  return wrap;
}

function row(title: string, hint: string, control: HTMLElement) {
  return h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('b', null, title), h('span', { class: 'muted small' }, hint)), control);
}

/** Smartcube-Bereich (wird auch im Timer und Trainer wiederverwendet). */
export function smartCubeCard(): HTMLElement {
  const box = h('div', { class: 'smartcube-box' });
  const render = () => {
    clear(box);
    const st = smartCube.status;
    if (st === 'connected') {
      box.append(
        h('div', { class: 'cube-status on' }, h('span', { class: 'led' }), h('b', null, smartCube.name), smartCube.battery !== null ? h('span', { class: 'muted small' }, `🔋 ${smartCube.battery}%`) : null),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', title: 'Wenn dein echter Würfel gelöst ist', onclick: () => smartCube.markSolved().then(() => toast('Würfel als gelöst markiert')) }, '✓ Ist gelöst'),
          smartCube.isSimulator ? null : h('button', { class: 'btn', onclick: () => smartCube.sync() }, '⟳ Zustand lesen'),
          h('button', { class: 'btn', onclick: () => smartCube.disconnect() }, 'Trennen'),
        ),
      );
      if (smartCube.isSimulator) box.append(h('p', { class: 'muted small' }, 'Tasten U R F D L B drehen den Würfel (mit Shift gegen den Uhrzeigersinn) – Weiss oben, Grün vorne.'));
    } else {
      const unsupported = st === 'unsupported';
      box.append(
        h('div', { class: 'cube-status' }, h('span', { class: 'led' }), st === 'connecting' ? 'Verbinde …' : 'Nicht verbunden'),
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            class: 'btn primary',
            disabled: unsupported || st === 'connecting',
            onclick: () => smartCube.connect().catch((e) => toast(`Verbindung fehlgeschlagen: ${e?.message ?? e}`)),
          }, '🔵 GAN-Würfel verbinden'),
          h('button', { class: 'btn', onclick: () => smartCube.connectSimulator() }, '⌨ Simulator'),
        ),
        unsupported
          ? h('p', { class: 'muted small' }, 'Dieser Browser kann kein Bluetooth. Auf iPhone/iPad unterstützt Safari kein Web Bluetooth – nutze dort die kostenlose App „Bluefy“ und öffne CFOP Studio darin. Am Mac/PC funktioniert Chrome oder Edge.')
          : h('p', { class: 'muted small' }, 'Unterstützt: GAN356 i3, i Carry / Carry 2, GAN12 ui (FreePlay/Maglev), GAN14 ui, Mini ui, MoYu AI 2023. Beim ersten Verbinden fragt die App evtl. nach der MAC-Adresse des Würfels.'),
      );
    }
  };
  render();
  const off = smartCube.onStatus(render);
  // Aufräumen, sobald die Box aus dem DOM entfernt wurde
  const obs = new MutationObserver(() => {
    if (!box.isConnected) {
      off();
      obs.disconnect();
    }
  });
  requestAnimationFrame(() => obs.observe(document.body, { childList: true, subtree: true }));
  return box;
}

export function openSettings() {
  const perfToggle = h('input', {
    type: 'checkbox',
    checked: settings.showPerf,
    onchange: () => {
      settings.showPerf = perfToggle.checked;
      saveSettings();
      perf.setVisible(settings.showPerf, document.querySelector('.perf-host') as HTMLElement);
    },
  }) as HTMLInputElement;

  modal(
    h(
      'div',
      { class: 'settings' },
      h('h2', null, 'Einstellungen'),
      h('h4', null, 'Darstellung'),
      row('Farbschema', 'Folgt standardmässig dem Gerät', segmented(settings.theme, [['system', 'Auto'], ['dark', 'Dunkel'], ['light', 'Hell']], (v) => {
        settings.theme = v;
        saveSettings();
        applyAppearance();
      })),
      row('Einhand-Modus', 'Bedienelemente unten in Daumennähe – die andere Hand hält den Würfel', segmented(settings.oneHand, [['off', 'Aus'], ['left', 'Links'], ['right', 'Rechts']], (v) => {
        settings.oneHand = v;
        saveSettings();
        applyAppearance();
      })),
      h('h4', null, 'Puzzle'),
      row('Würfel', '3×3 (CFOP) oder 2×2', segmented(String(settings.puzzle) as '3' | '2', [['3', '3×3'], ['2', '2×2']], (v) => setPuzzle(v === '2' ? 2 : 3))),
      row('2×2-Methode', 'Bestimmt, welche Alg-Kategorien der 2×2-Solver nutzt: Ortega = OLL + PBL, CLL = erste Ebene + CLL, EG = erste Seite + CLL/EG-1/EG-2', segmented(settings.method2, [['ortega', 'Ortega'], ['cll', 'CLL'], ['eg', 'EG']], (v) => {
        settings.method2 = v;
        saveSettings();
        document.dispatchEvent(new CustomEvent('method2-change'));
      })),
      h('h4', null, 'Algorithmen'),
      row('Alg-Set', 'OH = einhändige Algs für OLL und PLL (F2L bleibt gleich). Gilt für Solver, Raster und Trainer.', segmented(settings.algStyle, [['2h', 'Zweihändig'], ['oh', 'OH']], (v) => {
        settings.algStyle = v;
        saveSettings();
        setAlgStyle(v);
        document.dispatchEvent(new CustomEvent('alg-style-change'));
      })),
      h('h4', null, 'Smartcube'),
      smartCubeCard(),
      h('h4', null, 'Diagnose'),
      row('Leistungsanzeige', 'Bilder pro Sekunde, längstes Bild, Draw Calls, Auflösung', h('label', { class: 'toggle' }, perfToggle, h('span', { class: 'toggle-ui' }))),
    ),
  );
}
