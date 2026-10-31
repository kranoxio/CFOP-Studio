import { battle, effectiveMs, type BattleState } from '../net/battle';
import { serverAvailable } from '../net/api';
import { settings } from '../settings';
import { storage } from '../util/storage';
import { clear, fmtTime, h, toast } from './dom';

/**
 * Battle-Bereich im Timer: Raum erstellen/beitreten, Mitspieler, Ergebnisse der Runde, Rangliste.
 * Der Timer übernimmt den Scramble des Raums und meldet die eigene Zeit automatisch.
 */
export function battlePanel(): HTMLElement {
  const box = h('div', { class: 'card glass battle' });
  let available: boolean | null = null;

  const render = (s: BattleState | null) => {
    clear(box);
    box.append(h('div', { class: 'card-head' }, h('h3', null, '⚔️ Battle'), s ? h('span', { class: 'room-code mono' }, s.code) : null));
    if (available === false) {
      box.append(h('p', { class: 'muted small' }, 'Battle braucht den NAS-Server (Docker-Image). In dieser Umgebung ist er nicht erreichbar.'));
      return;
    }
    if (!s) {
      const name = h('input', { class: 'input', placeholder: 'Dein Name', value: storage.get('battleName', '') }) as HTMLInputElement;
      const code = h('input', { class: 'input mono', placeholder: 'Code', maxlength: 4, style: 'text-transform:uppercase;max-width:90px' }) as HTMLInputElement;
      const hashCode = location.hash.match(/battle=([A-Za-z]{4})/)?.[1];
      if (hashCode) code.value = hashCode.toUpperCase();
      const remember = () => storage.set('battleName', name.value.trim());
      box.append(
        h('p', { class: 'muted small' }, 'Alle bekommen denselben Scramble, jede Zeit erscheint sofort bei allen. Raum erstellen und den Code (oder Link) an deine Kollegen schicken.'),
        name,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => { remember(); battle.create(name.value, settings.puzzle).catch((e) => toast(e.message)); } }, 'Raum erstellen'),
          code,
          h('button', { class: 'btn', onclick: () => { remember(); battle.join(code.value, name.value).catch((e) => toast(e.message)); } }, 'Beitreten'),
        ),
      );
      return;
    }
    const round = s.results[s.round - 1] ?? {};
    const ranked = s.players
      .map((p) => ({ p, r: round[p.id] }))
      .sort((a, b) => (a.r ? effectiveMs(a.r) : Infinity) - (b.r ? effectiveMs(b.r) : Infinity));
    const link = `${location.origin}${location.pathname}#battle=${s.code}`;
    box.append(
      h('div', { class: 'battle-round' }, h('b', null, `Runde ${s.round}`), h('span', { class: 'muted small' }, `${s.puzzle === 2 ? '2×2' : '3×3'} · ${Object.keys(round).length}/${s.players.length} fertig`)),
      h('div', { class: 'battle-list' },
        ...ranked.map(({ p, r }, i) =>
          h('div', { class: `battle-row ${p.id === battle.playerId ? 'me' : ''}` },
            h('span', { class: 'mono muted' }, r ? `${i + 1}.` : '–'),
            h('span', { class: `led ${p.online ? 'on' : ''}` }),
            h('span', { class: 'battle-name' }, p.name, p.id === s.host ? ' 👑' : ''),
            h('b', { class: 'mono' }, r ? (r.penalty === 'DNF' ? 'DNF' : fmtTime(effectiveMs(r))) : '…'),
          ),
        ),
      ),
      h('h4', null, 'Gesamt'),
      h('div', { class: 'battle-list' },
        ...battle.standings().map((st) =>
          h('div', { class: 'battle-row' },
            h('span', { class: 'battle-name' }, st.player.name),
            h('span', { class: 'muted small' }, `${st.wins} Siege · Ø ${isFinite(st.mean) ? fmtTime(st.mean) : '–'} · Best ${isFinite(st.best) ? fmtTime(st.best) : '–'}`),
          ),
        ),
      ),
      h('div', { class: 'btn-row' },
        battle.isHost ? h('button', { class: 'btn primary', onclick: () => battle.next().catch((e) => toast(e.message)) }, 'Nächste Runde') : h('span', { class: 'muted small' }, 'Der Gastgeber 👑 startet die nächste Runde.'),
        h('button', { class: 'btn', title: 'Einladungslink kopieren', onclick: () => navigator.clipboard?.writeText(link).then(() => toast('Link kopiert'), () => toast(link)) }, '🔗 Link'),
        h('button', { class: 'btn', onclick: () => battle.leave() }, 'Verlassen'),
      ),
    );
  };

  battle.onChange(render);
  serverAvailable().then((ok) => {
    available = ok;
    if (ok) battle.resume();
    render(battle.state);
  });
  render(battle.state);
  return box;
}
