import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MOVE_DEFS, geometry, type Move, type State } from '../cube/cube';

/** Leuchtende, "stickerless" Farben im Stil moderner Speedcubes (U R F D L B). */
export const FACE_COLORS = ['#ffd500', '#ff6b00', '#00c853', '#f4f6fb', '#e8102a', '#1a5cff'];
const GRAY = '#3a3d46';

export type StickerLook = 'color' | 'dim' | 'gray';
export type Quality = 'high' | 'low';

export interface Visual {
  state: State;
  /** Optional: Heimat-Index -> Darstellung */
  look?: (home: number) => StickerLook;
}

function roundedRectShape(size: number, radius: number) {
  const s = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-s + radius, -s);
  shape.lineTo(s - radius, -s);
  shape.quadraticCurveTo(s, -s, s, -s + radius);
  shape.lineTo(s, s - radius);
  shape.quadraticCurveTo(s, s, s - radius, s);
  shape.lineTo(-s + radius, s);
  shape.quadraticCurveTo(-s, s, -s, s - radius);
  shape.lineTo(-s, -s + radius);
  shape.quadraticCurveTo(-s, -s, -s + radius, -s);
  return shape;
}

interface SharedAssets {
  body: THREE.BufferGeometry;
  tile: THREE.BufferGeometry;
  bodyMat: THREE.Material;
  tileMat: THREE.Material;
  /** Farben je Darstellung und Fläche (linear) */
  colors: Record<StickerLook, THREE.Color[]>;
}

const assetCache = new Map<Quality, SharedAssets>();

function assets(quality: Quality): SharedAssets {
  let a = assetCache.get(quality);
  if (a) return a;
  const high = quality === 'high';
  const body = new RoundedBoxGeometry(0.97, 0.97, 0.97, high ? 4 : 2, 0.12);
  const tile = new THREE.ExtrudeGeometry(roundedRectShape(0.86, 0.14), {
    depth: 0.018,
    bevelEnabled: high,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: high ? 6 : 3,
  });
  tile.computeVertexNormals();
  const bodyMat = high
    ? new THREE.MeshPhysicalMaterial({ color: '#0d0e12', roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: '#0d0e12', roughness: 0.45 });
  // Weisse Basisfarbe – die eigentliche Farbe kommt pro Instanz
  const tileMat = high
    ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 })
    : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const colors = {
    color: FACE_COLORS.map((c) => new THREE.Color(c)),
    dim: FACE_COLORS.map((c) => new THREE.Color(c).multiplyScalar(0.22)),
    gray: FACE_COLORS.map(() => new THREE.Color(GRAY)),
  };
  a = { body, tile, bodyMat, tileMat, colors };
  assetCache.set(quality, a);
  return a;
}

const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();

/**
 * 3D-Würfel nach dem "Umfärben"-Prinzip: Cubies bleiben an ihrer Position, nur während
 * einer Drehung wird eine Schicht rotiert. Danach werden die Sticker gemäss Zustand neu gefärbt.
 *
 * Gezeichnet wird mit zwei InstancedMeshes (Körper + Sticker) – also nur 2 Draw Calls pro Würfel.
 */
export class CubeModel {
  readonly root = new THREE.Group();
  /** Transformations-Halter je Cubie (werden nicht selbst gezeichnet) */
  private cubies: THREE.Object3D[] = [];
  private homes: THREE.Vector3[] = [];
  private bodies: THREE.InstancedMesh;
  private tiles: THREE.InstancedMesh;
  private tileLocal: THREE.Matrix4[] = [];
  private cubieOfFacelet: number[] = [];
  private shared: SharedAssets;
  /** Zuletzt gemalte Farben, um unnötige GPU-Uploads zu vermeiden */
  private lastColor: (THREE.Color | null)[] = new Array(54).fill(null);
  private turnKey = '';

  constructor(quality: Quality = 'high') {
    this.shared = assets(quality);
    this.bodies = new THREE.InstancedMesh(this.shared.body, this.shared.bodyMat, 26);
    this.tiles = new THREE.InstancedMesh(this.shared.tile, this.shared.tileMat, 54);
    for (const m of [this.bodies, this.tiles]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    const index = new Map<string, number>();
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const o = new THREE.Object3D();
          o.position.set(x, y, z);
          index.set(`${x},${y},${z}`, this.cubies.length);
          this.cubies.push(o);
          this.homes.push(new THREE.Vector3(x, y, z));
        }
    const z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 54; i++) {
      const { p, n } = geometry(i);
      this.cubieOfFacelet.push(index.get(p.join(','))!);
      const normal = new THREE.Vector3(...n);
      const local = new THREE.Matrix4().compose(normal.clone().multiplyScalar(0.475), new THREE.Quaternion().setFromUnitVectors(z, normal), new THREE.Vector3(1, 1, 1));
      this.tileLocal.push(local);
      this.tiles.setColorAt(i, this.shared.colors.color[Math.floor(i / 9)]);
    }
    this.commit();
  }

  /** Färbt alle Sticker gemäss Zustand. Gibt true zurück, wenn sich etwas geändert hat. */
  paint(v: Visual): boolean {
    const { colors } = this.shared;
    let changed = false;
    for (let i = 0; i < 54; i++) {
      const home = v.state[i];
      const c = colors[v.look ? v.look(home) : 'color'][Math.floor(home / 9)];
      if (this.lastColor[i] !== c) {
        this.lastColor[i] = c;
        this.tiles.setColorAt(i, c);
        changed = true;
      }
    }
    if (changed) this.tiles.instanceColor!.needsUpdate = true;
    return changed;
  }

  /** Dreht die zum Zug gehörenden Schichten um einen Anteil (0..1) der Drehung. */
  setTurn(move: Move | null, progress: number) {
    const key = move && progress > 0 ? `${move.base}${move.amount}:${progress}` : '';
    if (key === this.turnKey) return;
    this.turnKey = key;
    for (let i = 0; i < this.cubies.length; i++) {
      this.cubies[i].position.copy(this.homes[i]);
      this.cubies[i].quaternion.identity();
    }
    if (move && progress > 0) {
      const def = MOVE_DEFS[move.base];
      const turns = move.amount === 3 ? -1 : move.amount;
      tmpAxis.set(def.axis === 0 ? 1 : 0, def.axis === 1 ? 1 : 0, def.axis === 2 ? 1 : 0);
      tmpQuat.setFromAxisAngle(tmpAxis, def.dir * turns * (Math.PI / 2) * progress);
      for (let i = 0; i < this.cubies.length; i++) {
        const h = this.homes[i];
        const coord = def.axis === 0 ? h.x : def.axis === 1 ? h.y : h.z;
        if (!def.layers.includes(coord)) continue;
        this.cubies[i].position.copy(h).applyQuaternion(tmpQuat);
        this.cubies[i].quaternion.copy(tmpQuat);
      }
    }
    this.commit();
  }

  /** Schreibt die Cubie-Transformationen in die Instanz-Matrizen. */
  commit() {
    for (let i = 0; i < this.cubies.length; i++) {
      this.cubies[i].updateMatrix();
      this.bodies.setMatrixAt(i, this.cubies[i].matrix);
    }
    for (let i = 0; i < 54; i++) {
      tmpMat.multiplyMatrices(this.cubies[this.cubieOfFacelet[i]].matrix, this.tileLocal[i]);
      this.tiles.setMatrixAt(i, tmpMat);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.tiles.instanceMatrix.needsUpdate = true;
  }

  /** Für die Intro-Animation: Cubies einzeln versetzen, danach commit() aufrufen. */
  forEachCubie(fn: (cubie: THREE.Object3D, home: THREE.Vector3, index: number) => void) {
    this.cubies.forEach((c, i) => fn(c, this.homes[i], i));
    this.turnKey = '#';
  }
}
