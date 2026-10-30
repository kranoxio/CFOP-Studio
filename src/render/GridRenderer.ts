import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Move, State } from '../cube/cube';
import { CubeModel, type StickerLook } from './CubeModel';
import { MovePlayer } from './MovePlayer';
import { perf } from './perf';

export interface GridCell {
  el: HTMLElement;
  base: State;
  moves: Move[];
  look?: (home: number) => StickerLook;
  view: 'side' | 'top';
  size?: 2 | 3;
}

interface CellRuntime extends GridCell {
  player: MovePlayer;
  hold: number;
  phase: 'start' | 'play' | 'end';
  rect: DOMRect | null;
}

/**
 * Rendert beliebig viele kleine animierte Würfel mit EINEM WebGL-Kontext:
 * ein bildschirmfüllendes Canvas, pro Zelle ein Viewport/Scissor-Bereich.
 *
 * Optimierungen:
 * - Kartenpositionen werden nur beim Scrollen/Grössenänderung neu gemessen
 * - Nur sichtbare Zellen werden animiert
 * - Der Zeichenpuffer bleibt erhalten; neu gezeichnet werden nur Zellen, die sich bewegt haben
 */
export class GridRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private models = { 3: new CubeModel('low', 3), 2: new CubeModel('low', 2) };
  private cams = {
    side: new THREE.PerspectiveCamera(30, 1, 0.1, 50),
    top: new THREE.PerspectiveCamera(30, 1, 0.1, 50),
  };
  private cells: CellRuntime[] = [];
  private clip: HTMLElement;
  private clipRect: DOMRect | null = null;
  private clock = new THREE.Clock();
  private active = false;
  /** Layout hat sich geändert: alles neu messen und komplett neu zeichnen */
  private layoutDirty = true;
  private resizeObs: ResizeObserver;
  animate = true;
  tps = 3;

  constructor(clip: HTMLElement) {
    this.clip = clip;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setScissorTest(true);
    this.renderer.autoClear = true;
    this.renderer.domElement.className = 'grid-canvas';
    document.body.append(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight('#ffffff', 1.0);
    key.position.set(4, 8, 6);
    this.scene.add(key, new THREE.AmbientLight('#ffffff', 0.3), this.models[3].root, this.models[2].root);

    this.cams.side.position.set(0.62, 0.55, 1).normalize().multiplyScalar(9.6);
    this.cams.side.lookAt(0, 0, 0);
    this.cams.top.position.set(0.3, 1, 0.55).normalize().multiplyScalar(9.6);
    this.cams.top.lookAt(0, -0.2, 0);

    const markLayout = () => (this.layoutDirty = true);
    window.addEventListener('resize', () => {
      this.resize();
      markLayout();
    });
    clip.addEventListener('scroll', markLayout, { passive: true });
    this.resizeObs = new ResizeObserver(markLayout);
    this.resizeObs.observe(clip);
    if (clip.firstElementChild) this.resizeObs.observe(clip.firstElementChild);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  setActive(on: boolean) {
    this.active = on;
    this.renderer.domElement.style.display = on ? 'block' : 'none';
    this.clock.getDelta();
    this.layoutDirty = true;
  }

  setCells(cells: GridCell[]) {
    this.cells = cells.map((c) => {
      const player = new MovePlayer();
      player.load(c.base, c.moves);
      return { ...c, player, hold: Math.random() * 0.8, phase: 'start' as const, rect: null };
    });
    this.layoutDirty = true;
  }

  /** Startet die Animation einer Zelle neu (z.B. beim Antippen). */
  restart(el: HTMLElement) {
    const c = this.cells.find((x) => x.el === el);
    if (!c) return;
    c.player.seek(0);
    c.phase = 'start';
    c.hold = 0.15;
  }

  private isVisible(c: CellRuntime) {
    const r = c.rect;
    const clip = this.clipRect!;
    return !!r && r.width > 0 && r.bottom > clip.top && r.top < clip.bottom;
  }

  private tick() {
    if (!this.active) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const r = this.renderer;
    const fullRedraw = this.layoutDirty;

    if (fullRedraw) {
      this.layoutDirty = false;
      // Alle Messungen gebündelt (ein Layout-Durchlauf statt einem pro Zelle)
      this.clipRect = this.clip.getBoundingClientRect();
      for (const c of this.cells) c.rect = c.el.getBoundingClientRect();
      r.setScissor(0, 0, window.innerWidth, window.innerHeight);
      r.setClearColor(0x000000, 0);
      r.clear();
    }

    const canvasH = window.innerHeight;
    const clip = this.clipRect!;
    let drawn = 0;
    for (const c of this.cells) {
      if (!this.isVisible(c)) continue;
      const before = c.player.position;
      if (this.animate) this.advance(c, dt);
      if (!fullRedraw && c.player.position === before) continue;

      const f = c.player.frame();
      const size = c.size ?? 3;
      const model = this.models[size];
      this.models[3].root.visible = size === 3;
      this.models[2].root.visible = size === 2;
      model.paint({ state: f.state, look: c.look });
      model.setTurn(f.move, f.progress);

      const rect = c.rect!;
      const top = Math.max(rect.top, clip.top);
      const bottom = Math.min(rect.bottom, clip.bottom);
      r.setViewport(rect.left, canvasH - rect.bottom, rect.width, rect.height);
      r.setScissor(rect.left, canvasH - bottom, rect.width, bottom - top);
      const cam = this.cams[c.view];
      cam.aspect = rect.width / rect.height;
      cam.updateProjectionMatrix();
      r.render(this.scene, cam);
      drawn++;
    }
    if (drawn) perf.frame(dt, drawn * 2, r.getPixelRatio());
  }

  private advance(c: CellRuntime, dt: number) {
    c.player.tps = this.tps;
    if (c.phase === 'start') {
      c.hold -= dt;
      if (c.hold <= 0) {
        c.phase = 'play';
        c.player.play();
      }
    } else if (c.phase === 'play') {
      c.player.update(dt);
      if (c.player.finished && !c.player.animating) {
        c.phase = 'end';
        c.hold = 1.3;
      }
    } else {
      c.hold -= dt;
      if (c.hold <= 0) {
        c.player.seek(0);
        c.phase = 'start';
        c.hold = 0.7;
      }
    }
  }
}
