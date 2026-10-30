import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Move, State } from '../cube/cube';
import { CubeModel, type StickerLook } from './CubeModel';
import { MovePlayer } from './MovePlayer';

export interface GridCell {
  el: HTMLElement;
  base: State;
  moves: Move[];
  look?: (home: number) => StickerLook;
  view: 'side' | 'top';
}

interface CellRuntime extends GridCell {
  player: MovePlayer;
  hold: number;
  phase: 'start' | 'play' | 'end';
}

/**
 * Rendert beliebig viele kleine animierte Würfel mit EINEM WebGL-Kontext:
 * ein bildschirmfüllendes Canvas, pro Zelle ein Viewport/Scissor-Bereich.
 * Nur sichtbare Zellen werden aktualisiert und gezeichnet.
 */
export class GridRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private model = new CubeModel('low');
  private cams = {
    side: new THREE.PerspectiveCamera(30, 1, 0.1, 50),
    top: new THREE.PerspectiveCamera(30, 1, 0.1, 50),
  };
  private cells: CellRuntime[] = [];
  private clip: HTMLElement;
  private clock = new THREE.Clock();
  private active = false;
  animate = true;
  tps = 3;

  constructor(clip: HTMLElement) {
    this.clip = clip;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setScissorTest(true);
    this.renderer.domElement.className = 'grid-canvas';
    document.body.append(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight('#ffffff', 1.0);
    key.position.set(4, 8, 6);
    this.scene.add(key, new THREE.AmbientLight('#ffffff', 0.3), this.model.root);

    this.cams.side.position.set(0.62, 0.55, 1).normalize().multiplyScalar(9.6);
    this.cams.side.lookAt(0, 0, 0);
    this.cams.top.position.set(0.3, 1, 0.55).normalize().multiplyScalar(9.6);
    this.cams.top.lookAt(0, -0.2, 0);

    window.addEventListener('resize', () => this.resize());
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
  }

  setCells(cells: GridCell[]) {
    this.cells = cells.map((c) => {
      const player = new MovePlayer();
      player.load(c.base, c.moves);
      return { ...c, player, hold: Math.random() * 0.8, phase: 'start' as const };
    });
  }

  /** Startet die Animation einer Zelle neu (z.B. beim Antippen). */
  restart(el: HTMLElement) {
    const c = this.cells.find((x) => x.el === el);
    if (!c) return;
    c.player.seek(0);
    c.phase = 'start';
    c.hold = 0.15;
  }

  private tick() {
    if (!this.active) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const r = this.renderer;
    const canvasH = window.innerHeight;
    const clip = this.clip.getBoundingClientRect();
    r.setScissor(0, 0, window.innerWidth, canvasH);
    r.setClearColor(0x000000, 0);
    r.clear();

    for (const c of this.cells) {
      const rect = c.el.getBoundingClientRect();
      if (rect.bottom < clip.top || rect.top > clip.bottom || rect.width === 0) continue;

      if (this.animate) this.advance(c, dt);
      const f = c.player.frame();
      this.model.paint({ state: f.state, look: c.look });
      this.model.setTurn(f.move, f.progress);

      const top = Math.max(rect.top, clip.top);
      const bottom = Math.min(rect.bottom, clip.bottom);
      r.setViewport(rect.left, canvasH - rect.bottom, rect.width, rect.height);
      r.setScissor(rect.left, canvasH - bottom, rect.width, bottom - top);
      const cam = this.cams[c.view];
      cam.aspect = rect.width / rect.height;
      cam.updateProjectionMatrix();
      r.render(this.scene, cam);
    }
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
