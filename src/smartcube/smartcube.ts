import { FACES, applyMove, centerColor, faceletsOfCubie, solvedState, type Move, type State } from '../cube/cube';
import { parseAlg } from '../cube/notation';
import { storage } from '../util/storage';

/**
 * Anbindung von GAN-Smartcubes über Web Bluetooth (Bibliothek gan-web-bluetooth).
 *
 * Bezugssystem: Der Smartcube meldet Züge nach Mittelstein-Farbe im WCA-Rahmen
 * (Weiss oben, Grün vorne). Unser Modell hat Gelb als Heimat-Oberseite, daher entspricht
 * der Smartcube-Zustand unserem gelösten Zustand nach z2 (siehe WCA_START).
 */

/** Gelöster Zustand im WCA-Rahmen: Weiss oben, Grün vorne. */
export const WCA_START: State = (() => {
  let s = solvedState();
  for (const m of parseAlg('z2')) s = applyMove(s, m);
  return s;
})();

/** Smartcube-Buchstabe (WCA-Rahmen) -> unsere Farbe/Heimatfläche (U R F D L B = 0..5) */
const LETTER_COLOR: Record<string, number> = { U: 3, R: 4, F: 2, D: 0, L: 1, B: 5 };

/**
 * Baut aus 54 Farben (unsere Flächenindizes) einen Zustand mit Heimat-Indizes:
 * Jeder Stein wird an seiner Farbkombination erkannt.
 */
export function stateFromColors(colors: number[]): State | null {
  const s = new Uint8Array(54);
  // Heimat-Steine: Farbkombination -> Facelet je Farbe
  const homes = new Map<string, Map<number, number>>();
  const positions: number[][] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const f = faceletsOfCubie([x, y, z]);
        positions.push(f);
        const byColor = new Map(f.map((i) => [Math.floor(i / 9), i]));
        homes.set([...byColor.keys()].sort().join(','), byColor);
      }
  const used = new Set<string>();
  for (const f of positions) {
    const key = f.map((i) => colors[i]).sort().join(',');
    const home = homes.get(key);
    if (!home || (f.length > 1 && used.has(key))) return null;
    if (f.length > 1) used.add(key);
    for (const i of f) s[i] = home.get(colors[i])!;
  }
  return s;
}

export function stateFromFacelets(facelets: string): State | null {
  if (facelets.length !== 54) return null;
  return stateFromColors([...facelets].map((c) => LETTER_COLOR[c]));
}

/** Gleiche Farben an allen Positionen (Steine sind durch Farben eindeutig). */
export function sameColors(a: State, b: State) {
  for (let i = 0; i < 54; i++) if (Math.floor(a[i] / 9) !== Math.floor(b[i] / 9)) return false;
  return true;
}

export type CubeStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected';

export interface SmartMove {
  move: Move;
  /** Zeitstempel (performance.now) */
  time: number;
  /** Zeitstempel des Würfels (falls gemeldet) für präzise Zeitmessung */
  cubeTime: number | null;
}

type Listener<T> = (v: T) => void;

class SmartCube {
  status: CubeStatus = typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'disconnected' : 'unsupported';
  name = '';
  battery: number | null = null;
  /** Aktueller Zustand im WCA-Rahmen */
  state: State = WCA_START;
  private conn: { disconnect(): Promise<void>; sendCubeCommand(c: { type: string }): Promise<void> } | null = null;
  private moveListeners = new Set<Listener<SmartMove>>();
  private stateListeners = new Set<Listener<State>>();
  private statusListeners = new Set<Listener<CubeStatus>>();

  onMove(fn: Listener<SmartMove>) {
    this.moveListeners.add(fn);
    return () => this.moveListeners.delete(fn);
  }
  /** Zustand wurde komplett neu gesetzt (Sync, Reset) */
  onState(fn: Listener<State>) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }
  onStatus(fn: Listener<CubeStatus>) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  get connected() {
    return this.status === 'connected';
  }

  private setStatus(s: CubeStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  async connect() {
    if (this.status === 'unsupported') throw new Error('Web Bluetooth wird von diesem Browser nicht unterstützt');
    this.setStatus('connecting');
    try {
      const { connectGanCube } = await import('gan-web-bluetooth');
      const conn = await connectGanCube(async (device, isFallback) => {
        const known = storage.get<Record<string, string>>('cubeMacs', {});
        const saved = known[device.name ?? ''];
        if (saved) return saved;
        if (!isFallback) return null;
        const mac = prompt(
          `MAC-Adresse von „${device.name}“ eingeben (Format AB:12:CD:34:EF:56).\nDu findest sie in der GAN-App unter Geräteinfo. Sie wird gespeichert.`,
        );
        if (mac) storage.set('cubeMacs', { ...known, [device.name ?? '']: mac.trim().toUpperCase() });
        return mac?.trim().toUpperCase() ?? null;
      });
      this.conn = conn;
      this.name = conn.deviceName;
      conn.events$.subscribe((ev) => {
        if (ev.type === 'MOVE') this.handleMove(ev.move, ev.cubeTimestamp);
        else if (ev.type === 'FACELETS') {
          const st = stateFromFacelets(ev.facelets);
          if (st) this.setState(st);
        } else if (ev.type === 'BATTERY') {
          this.battery = ev.batteryLevel;
          this.setStatus('connected');
        } else if (ev.type === 'DISCONNECT') {
          this.conn = null;
          this.setStatus('disconnected');
        }
      });
      this.setStatus('connected');
      await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
      await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
    } catch (err) {
      this.conn = null;
      this.setStatus('disconnected');
      throw err;
    }
  }

  async disconnect() {
    if (this.simKeys) window.removeEventListener('keydown', this.simKeys, true);
    this.simKeys = null;
    await this.conn?.disconnect();
    this.conn = null;
    this.setStatus('disconnected');
  }

  /** Zustand vom Würfel neu einlesen. */
  async sync() {
    await this.conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  /** Würfel ist physisch gelöst: internen Zustand von Würfel und App zurücksetzen. */
  async markSolved() {
    await this.conn?.sendCubeCommand({ type: 'REQUEST_RESET' }).catch(() => {});
    this.setState(WCA_START);
  }

  private setState(s: State) {
    this.state = s;
    this.stateListeners.forEach((l) => l(s));
  }

  /** Smartcube-Zug (z.B. "R'") nach Farbe der Fläche in unseren Zug umrechnen. */
  private handleMove(text: string, cubeTime: number | null) {
    const m = text.trim().match(/^([URFDLB])(2?)('?)$/);
    if (!m) return;
    const color = LETTER_COLOR[m[1]];
    let face = 0;
    for (let f = 0; f < 6; f++) if (centerColor(this.state, f) === color) face = f;
    const amount = (m[2] ? 2 : m[3] ? 3 : 1) as 1 | 2 | 3;
    const move: Move = { base: FACES[face], amount };
    this.state = applyMove(this.state, move);
    const ev: SmartMove = { move, time: performance.now(), cubeTime };
    this.moveListeners.forEach((l) => l(ev));
  }

  /** Einen Zug simulieren, als käme er vom Würfel (Smartcube-Buchstaben, WCA-Rahmen). */
  simulate(text: string) {
    if (this.conn || this.status !== 'connected') return;
    this.handleMove(text, null);
  }

  private simKeys: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Simulator ohne Hardware: Tasten U R F D L B drehen (mit Shift gegen den Uhrzeigersinn),
   * wie ein Smartcube im WCA-Rahmen (Weiss oben, Grün vorne).
   */
  connectSimulator() {
    if (this.conn) return;
    this.name = 'Simulator (Tastatur)';
    this.battery = null;
    this.simKeys = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const letter = e.key.toUpperCase();
      if (!'URFDLB'.includes(letter) || letter.length !== 1) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.handleMove(letter + (e.shiftKey ? "'" : ''), null);
    };
    window.addEventListener('keydown', this.simKeys, true);
    this.setStatus('connected');
    this.setState(WCA_START);
  }

  get isSimulator() {
    return this.status === 'connected' && !this.conn;
  }
}

export const smartCube = new SmartCube();
