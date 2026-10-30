import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MOVE_DEFS, type Move } from '../cube/cube';
import { CubeModel, FACE_COLORS, type Quality, type StickerLook } from './CubeModel';
import { MovePlayer } from './MovePlayer';
import { perf } from './perf';
import { isLight } from '../ui/theme';

export interface CubeViewOptions {
  quality?: Quality;
  interactive?: boolean;
  intro?: boolean;
  cameraDistance?: number;
  /** 3 = 3x3 (Standard), 2 = 2x2 */
  size?: 2 | 3;
}

function radialTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const IDENTITY = new THREE.Quaternion();
const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 1;

/**
 * Grosse, interaktive 3D-Ansicht mit frei schwenkbarer Kamera.
 * Gezeichnet wird nur, wenn sich etwas verändert (Zug, Kamera, Effekte) – im Stillstand
 * verbraucht die Ansicht praktisch keine Leistung.
 */
export class CubeView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls | null = null;
  model: CubeModel;
  private quality: Quality;
  readonly player = new MovePlayer();
  look: ((home: number) => StickerLook) | undefined;
  autoRotate = false;
  showArrows = true;
  arrowColor = '#ffffff';
  onFrame: ((dt: number) => void) | null = null;

  private container: HTMLElement;
  private clock = new THREE.Clock();
  private glow: THREE.Mesh;
  private glowColor = new THREE.Color('#5ac8fa');
  private glowTarget = new THREE.Color('#5ac8fa');
  private arrow = new THREE.Group();
  private arrowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false });
  private lastArrowKey = '';
  private introT = -1;
  private introFrom: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  private particles: THREE.Points | null = null;
  private particleVel: Float32Array | null = null;
  private particleAge = 0;
  private spin = 0;
  private running = true;
  private visible = true;
  private dirty = true;
  private resizeObs: ResizeObserver;
  private camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private pixelRatio: number;
  private slowTime = 0;

  constructor(container: HTMLElement, opts: CubeViewOptions = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('cube-canvas');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const dist = opts.cameraDistance ?? 9.2;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0.62, 0.55, 1).normalize().multiplyScalar(dist);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight('#ffffff', 1.1);
    key.position.set(4, 8, 6);
    const rim = new THREE.DirectionalLight('#9ec5ff', 0.5);
    rim.position.set(-6, 2, -5);
    this.scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.25));

    this.quality = opts.quality ?? 'high';
    this.model = new CubeModel(this.quality, opts.size ?? 3);
    this.scene.add(this.model.root);

    // weicher Kontaktschatten
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.45, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.15;
    this.scene.add(shadow);

    // farbiger Leuchtring je nach Phase
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(255,255,255,0)'], [0.42, 'rgba(255,255,255,0.0)'], [0.55, 'rgba(255,255,255,0.55)'], [0.72, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: this.glowColor,
      }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = -2.12;
    this.glow.scale.setScalar(0.85);
    this.scene.add(this.glow);

    this.arrow.renderOrder = 10;
    this.scene.add(this.arrow);

    this.applyTheme(isLight());
    document.addEventListener('theme-change', (e) => this.applyTheme((e as CustomEvent<boolean>).detail));

    if (opts.interactive !== false) {
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.enablePan = false;
      c.minDistance = 6;
      c.maxDistance = 18;
      c.rotateSpeed = 0.85;
      c.autoRotateSpeed = 1.2;
      c.addEventListener('change', () => (this.dirty = true));
      (this as { controls: OrbitControls | null }).controls = c;
    }

    if (opts.intro) this.startIntro();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();

    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible';
      this.clock.getDelta();
      this.dirty = true;
    });
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** Hängt die Ansicht in einen anderen Container (z.B. ein neu geöffnetes Modal). */
  mount(container: HTMLElement) {
    this.resizeObs.unobserve(this.container);
    this.container = container;
    container.prepend(this.renderer.domElement);
    this.resizeObs.observe(container);
    this.resize();
  }

  invalidate() {
    this.dirty = true;
  }

  /** Wechselt zwischen 3x3 und 2x2 (Modell wird ausgetauscht, Wiedergabe bleibt). */
  setPuzzle(size: 2 | 3) {
    if (this.model.size === size) return;
    this.scene.remove(this.model.root);
    this.model = new CubeModel(this.quality, size);
    this.scene.add(this.model.root);
    this.dirty = true;
  }

  /** Auf hellem Hintergrund wirkt additives Leuchten nicht – dann normal gemischt. */
  private applyTheme(light: boolean) {
    const m = this.glow.material as THREE.MeshBasicMaterial;
    m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.opacity = light ? 0.55 : 1;
    m.needsUpdate = true;
    this.dirty = true;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Auf schmalen Bildschirmen etwas weiter weg, damit der Würfel ganz sichtbar bleibt
    this.camera.fov = w / h < 0.8 ? 40 : 32;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  resetCamera(view: 'default' | 'top' | 'back' | 'bottom' = 'default') {
    const d = this.camera.position.length();
    const dirs = {
      default: new THREE.Vector3(0.62, 0.55, 1),
      top: new THREE.Vector3(0.0001, 1, 0.35),
      back: new THREE.Vector3(-0.62, 0.45, -1),
      bottom: new THREE.Vector3(0.5, -1, 0.6),
    };
    this.camTween = { from: this.camera.position.clone(), to: dirs[view].normalize().multiplyScalar(d), t: 0 };
  }

  setPhaseColor(hex: string) {
    this.glowTarget.set(hex);
  }

  setRunning(on: boolean) {
    this.running = on;
    if (on) {
      this.clock.getDelta();
      this.dirty = true;
    }
  }

  startIntro() {
    this.introT = 0;
    this.introFrom = [];
    this.model.forEachCubie((_c, home) => {
      const dir = home.clone().normalize();
      const p = dir.multiplyScalar(5 + Math.random() * 6).add(new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      this.introFrom.push({ p, q });
    });
  }

  /** Feuerwerk aus Würfelfarben, wenn der Würfel gelöst ist. */
  celebrate() {
    if (this.particles) this.scene.remove(this.particles);
    const n = 420;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      pos.set([v.x * 1.6, v.y * 1.6, v.z * 1.6], i * 3);
      v.multiplyScalar(3 + Math.random() * 5);
      v.y += 3;
      vel.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color(FACE_COLORS[i % 6]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, depthWrite: false });
    this.particles = new THREE.Points(g, m);
    this.particleVel = vel;
    this.particleAge = 0;
    this.scene.add(this.particles);
    this.spin = 1;
  }

  private updateArrow(move: Move | null, color: string) {
    for (const child of this.arrow.children) {
      child.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.arrow.clear();
    if (!move || !this.showArrows) return;
    const def = MOVE_DEFS[move.base];
    if (def.layers.length === 1 && def.layers[0] === 0) return; // Slices: kein Pfeil
    const outer = def.layers.length === 3 ? 1 : def.layers.includes(1) ? 1 : -1;
    const sign = def.dir * (move.amount === 3 ? -1 : 1);
    const arc = move.amount === 2 ? Math.PI * 0.95 : Math.PI * 0.55;
    const radius = def.layers.length === 3 ? 2.15 : 1.25;
    this.arrowMat.color.set(color);
    const tube = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 8, 48, arc), this.arrowMat);
    tube.rotation.z = -arc / 2 + Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 16), this.arrowMat);
    const endAngle = arc / 2 + Math.PI / 2;
    head.position.set(Math.cos(endAngle) * radius, Math.sin(endAngle) * radius, 0);
    head.rotation.z = endAngle;
    const g = new THREE.Group();
    g.add(tube, head);
    if (move.amount === 2) {
      const head2 = head.clone();
      const start = -arc / 2 + Math.PI / 2;
      head2.position.set(Math.cos(start) * radius, Math.sin(start) * radius, 0);
      head2.rotation.z = start - Math.PI;
      g.add(head2);
    }
    if (sign < 0) g.scale.x = -1;
    const axis = new THREE.Vector3(def.axis === 0 ? 1 : 0, def.axis === 1 ? 1 : 0, def.axis === 2 ? 1 : 0);
    const holder = new THREE.Group();
    holder.add(g);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    holder.position.copy(axis).multiplyScalar(outer * (def.layers.length === 3 ? 0 : 1.62));
    this.arrow.add(holder);
  }

  private tick() {
    if (!this.running || !this.visible) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    let needs = this.dirty;
    this.dirty = false;

    this.player.update(dt);
    this.onFrame?.(dt);

    const f = this.player.frame();
    if (this.model.paint({ state: f.state, look: this.look })) needs = true;

    if (this.introT >= 0) {
      this.introT += dt / 1.6;
      let done = true;
      this.model.forEachCubie((c, home, i) => {
        const delay = (i % 9) * 0.03 + Math.floor(i / 9) * 0.06;
        const t = Math.min(1, Math.max(0, (this.introT - delay) / (1 - 0.3)));
        if (t < 1) done = false;
        const e = easeOutBack(t);
        c.position.copy(this.introFrom[i].p).lerp(home, e);
        c.quaternion.copy(this.introFrom[i].q).slerp(IDENTITY, Math.min(1, e));
      });
      this.model.commit();
      if (done) this.introT = -1;
      needs = true;
    } else {
      this.model.setTurn(f.move, f.progress);
      if (f.move) needs = true;
    }

    // Pfeil für den nächsten (bzw. laufenden) Zug
    const nextMove = f.move ?? (this.player.index < this.player.moves.length ? this.player.moves[this.player.index] : null);
    const key = nextMove ? `${this.player.index}:${nextMove.base}${nextMove.amount}:${this.arrowColor}:${this.showArrows}` : '';
    if (key !== this.lastArrowKey) {
      this.lastArrowKey = key;
      this.updateArrow(nextMove, this.arrowColor);
      needs = true;
    }
    this.arrowMat.opacity = f.move ? 0.35 + 0.5 * (1 - f.progress) : 0.85;

    // Leuchtring: Farbübergang, beim Abspielen leicht pulsierend
    if (this.glowColor.r !== this.glowTarget.r || this.glowColor.g !== this.glowTarget.g || this.glowColor.b !== this.glowTarget.b) {
      this.glowColor.lerp(this.glowTarget, Math.min(1, dt * 3));
      const d = Math.abs(this.glowColor.r - this.glowTarget.r) + Math.abs(this.glowColor.g - this.glowTarget.g) + Math.abs(this.glowColor.b - this.glowTarget.b);
      if (d < 0.003) this.glowColor.copy(this.glowTarget);
      (this.glow.material as THREE.MeshBasicMaterial).color.copy(this.glowColor);
      needs = true;
    }
    const active = this.player.playing || this.spin > 0;
    const pulse = 0.85 + (active ? Math.sin(performance.now() / 600) * 0.08 : 0) + this.spin * 0.6;
    if (Math.abs(this.glow.scale.x - pulse) > 0.0005) {
      this.glow.scale.setScalar(this.glow.scale.x + (pulse - this.glow.scale.x) * Math.min(1, dt * 8));
      needs = true;
    }

    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt * 0.7);
      this.model.root.rotation.y += dt * 9 * this.spin * this.spin;
      if (this.spin === 0) this.model.root.rotation.y = 0;
      needs = true;
    }

    if (this.particles && this.particleVel) {
      this.particleAge += dt;
      const pos = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        this.particleVel[i + 1] -= 9.5 * dt;
        arr[i] += this.particleVel[i] * dt;
        arr[i + 1] += this.particleVel[i + 1] * dt;
        arr[i + 2] += this.particleVel[i + 2] * dt;
      }
      pos.needsUpdate = true;
      (this.particles.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - this.particleAge / 2.2);
      if (this.particleAge > 2.3) {
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles = null;
      }
      needs = true;
    }

    if (this.camTween) {
      this.camTween.t = Math.min(1, this.camTween.t + dt * 1.6);
      const e = 1 - Math.pow(1 - this.camTween.t, 3);
      const a = this.camTween.from.clone().normalize();
      const b = this.camTween.to.clone().normalize();
      const len = this.camTween.from.length() + (this.camTween.to.length() - this.camTween.from.length()) * e;
      this.camera.position.copy(a.lerp(b, e).normalize().multiplyScalar(len));
      this.camera.lookAt(0, 0, 0);
      if (this.camTween.t >= 1) this.camTween = null;
      needs = true;
    }

    if (this.controls) {
      this.controls.autoRotate = this.autoRotate && !this.player.playing;
      // update() liefert true, solange sich die Kamera (inkl. Nachschwingen) bewegt
      if (this.controls.update(dt)) needs = true;
    }

    if (!needs) return;
    this.renderer.render(this.scene, this.camera);
    perf.frame(dt, this.renderer.info.render.calls, this.pixelRatio);
    this.adaptQuality(dt);
  }

  /** Senkt die Auflösung, wenn das Gerät dauerhaft unter ~40 FPS fällt. */
  private adaptQuality(dt: number) {
    if (dt > 1 / 40 && dt < 0.09) this.slowTime += dt;
    else this.slowTime = Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime > 1.5 && this.pixelRatio > MIN_PIXEL_RATIO) {
      this.pixelRatio = Math.max(MIN_PIXEL_RATIO, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
      this.slowTime = 0;
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObs.disconnect();
    this.controls?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
