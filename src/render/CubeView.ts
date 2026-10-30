import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MOVE_DEFS, type Move } from '../cube/cube';
import { CubeModel, FACE_COLORS, type StickerLook } from './CubeModel';
import { MovePlayer } from './MovePlayer';

export interface CubeViewOptions {
  quality?: 'high' | 'low';
  interactive?: boolean;
  intro?: boolean;
  cameraDistance?: number;
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

/** Grosse, interaktive 3D-Ansicht mit frei schwenkbarer Kamera. */
export class CubeView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls | null = null;
  readonly model: CubeModel;
  readonly player = new MovePlayer();
  look: ((home: number) => StickerLook) | undefined;
  autoRotate = false;
  showArrows = true;
  onFrame: ((dt: number) => void) | null = null;

  private container: HTMLElement;
  private clock = new THREE.Clock();
  private glow: THREE.Mesh;
  private glowColor = new THREE.Color('#5ac8fa');
  private glowTarget = new THREE.Color('#5ac8fa');
  private arrow: THREE.Group;
  private arrowMat: THREE.MeshBasicMaterial;
  private introT = -1;
  private introFrom: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  private particles: THREE.Points | null = null;
  private particleVel: Float32Array | null = null;
  private particleAge = 0;
  private spin = 0;
  private running = true;
  private visible = true;
  private resizeObs: ResizeObserver;
  private defaultCam: THREE.Vector3;

  constructor(container: HTMLElement, opts: CubeViewOptions = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('cube-canvas');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const dist = opts.cameraDistance ?? 9.2;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.defaultCam = new THREE.Vector3(0.62, 0.55, 1).normalize().multiplyScalar(dist);
    this.camera.position.copy(this.defaultCam);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight('#ffffff', 1.1);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9ec5ff', 0.5);
    rim.position.set(-6, 2, -5);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.25));

    this.model = new CubeModel(opts.quality ?? 'high');
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
    this.scene.add(this.glow);

    // Zug-Pfeil
    this.arrowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false });
    this.arrow = new THREE.Group();
    this.arrow.renderOrder = 10;
    this.scene.add(this.arrow);

    if (opts.interactive !== false) {
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.enablePan = false;
      c.minDistance = 6;
      c.maxDistance = 18;
      c.rotateSpeed = 0.85;
      c.autoRotateSpeed = 1.2;
      (this as { controls: OrbitControls | null }).controls = c;
    }

    if (opts.intro) this.startIntro();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();

    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible';
      this.clock.getDelta();
    });
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Auf schmalen Bildschirmen etwas weiter weg, damit der Würfel ganz sichtbar bleibt
    this.camera.fov = w / h < 0.8 ? 40 : 32;
    this.camera.updateProjectionMatrix();
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
  private camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;

  setPhaseColor(hex: string) {
    this.glowTarget.set(hex);
  }

  setRunning(on: boolean) {
    this.running = on;
    if (on) this.clock.getDelta();
  }

  startIntro() {
    this.introT = 0;
    this.introFrom = [];
    this.model.forEachCubie((_g, home) => {
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

  private lastArrowKey = '';
  arrowColor = '#ffffff';

  private tick() {
    if (!this.running || !this.visible) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.player.update(dt);
    this.onFrame?.(dt);

    const f = this.player.frame();
    this.model.paint({ state: f.state, look: this.look });

    if (this.introT >= 0) {
      this.introT += dt / 1.6;
      let done = true;
      this.model.forEachCubie((g, home, i) => {
        const delay = (i % 9) * 0.03 + Math.floor(i / 9) * 0.06;
        const t = Math.min(1, Math.max(0, (this.introT - delay) / (1 - 0.3)));
        if (t < 1) done = false;
        const e = easeOutBack(t);
        g.position.copy(this.introFrom[i].p).lerp(home, e);
        g.quaternion.copy(this.introFrom[i].q).slerp(new THREE.Quaternion(), Math.min(1, e));
      });
      if (done) this.introT = -1;
    } else {
      this.model.setTurn(f.move, f.progress);
    }

    // Pfeil für den nächsten (bzw. laufenden) Zug
    const nextMove = f.move ?? (this.player.index < this.player.moves.length ? this.player.moves[this.player.index] : null);
    const key = nextMove ? `${this.player.index}:${nextMove.base}${nextMove.amount}:${this.arrowColor}:${this.showArrows}` : '';
    if (key !== this.lastArrowKey) {
      this.lastArrowKey = key;
      this.updateArrow(nextMove, this.arrowColor);
    }
    this.arrowMat.opacity = f.move ? 0.35 + 0.5 * (1 - f.progress) : 0.85;

    this.glowColor.lerp(this.glowTarget, Math.min(1, dt * 3));
    (this.glow.material as THREE.MeshBasicMaterial).color.copy(this.glowColor);
    const pulse = 0.85 + Math.sin(performance.now() / 600) * 0.08 + this.spin * 0.6;
    this.glow.scale.setScalar(pulse);

    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt * 0.7);
      this.model.root.rotation.y += dt * 9 * this.spin * this.spin;
    } else {
      this.model.root.rotation.y = 0;
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
    }

    if (this.controls) {
      this.controls.autoRotate = this.autoRotate && !this.player.playing;
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
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
