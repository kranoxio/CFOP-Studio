import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MOVE_DEFS, geometry, type Move, type State } from '../cube/cube';

/** Leuchtende, "stickerless" Farben im Stil moderner Speedcubes (U R F D L B). */
export const FACE_COLORS = ['#ffd500', '#ff6b00', '#00c853', '#f4f6fb', '#e8102a', '#1a5cff'];
const GRAY = '#3a3d46';

export type StickerLook = 'color' | 'dim' | 'gray';

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
  mats: Record<StickerLook, THREE.Material[]>;
}

const assetCache = new Map<string, SharedAssets>();

function assets(quality: 'high' | 'low'): SharedAssets {
  let a = assetCache.get(quality);
  if (a) return a;
  const body = new RoundedBoxGeometry(0.97, 0.97, 0.97, quality === 'high' ? 4 : 2, 0.12);
  const tile = new THREE.ExtrudeGeometry(roundedRectShape(0.86, 0.14), {
    depth: 0.018,
    bevelEnabled: quality === 'high',
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: quality === 'high' ? 6 : 3,
  });
  tile.computeVertexNormals();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#0d0e12', roughness: 0.42, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.5 });
  const make = (hex: string, dim = 1) => {
    const c = new THREE.Color(hex).multiplyScalar(dim);
    return quality === 'high'
      ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 })
      : new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0 });
  };
  const mats = {
    color: FACE_COLORS.map((c) => make(c)),
    dim: FACE_COLORS.map((c) => make(c, 0.22)),
    gray: FACE_COLORS.map(() => make(GRAY)),
  };
  a = { body, tile, bodyMat, mats };
  assetCache.set(quality, a);
  return a;
}

interface Cubie {
  group: THREE.Group;
  home: THREE.Vector3;
}

/**
 * 3D-Würfel nach dem "Umfärben"-Prinzip: Cubies bleiben an ihrer Position, nur während
 * einer Drehung wird eine Schicht rotiert. Danach werden die Sticker gemäss Zustand neu gefärbt.
 */
export class CubeModel {
  readonly root = new THREE.Group();
  private cubies: Cubie[] = [];
  /** stickers[facelet] */
  private stickers: THREE.Mesh[] = [];
  private cubieOfFacelet: number[] = [];
  private shared: SharedAssets;

  constructor(quality: 'high' | 'low' = 'high') {
    this.shared = assets(quality);
    const index = new Map<string, number>();
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const group = new THREE.Group();
          group.position.set(x, y, z);
          const body = new THREE.Mesh(this.shared.body, this.shared.bodyMat);
          group.add(body);
          this.root.add(group);
          index.set(`${x},${y},${z}`, this.cubies.length);
          this.cubies.push({ group, home: new THREE.Vector3(x, y, z) });
        }
    for (let i = 0; i < 54; i++) {
      const { p, n } = geometry(i);
      const ci = index.get(p.join(','))!;
      const mesh = new THREE.Mesh(this.shared.tile, this.shared.mats.color[Math.floor(i / 9)]);
      const normal = new THREE.Vector3(...n);
      mesh.position.copy(normal).multiplyScalar(0.475);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.cubies[ci].group.add(mesh);
      this.stickers.push(mesh);
      this.cubieOfFacelet.push(ci);
    }
  }

  /** Färbt alle Sticker gemäss Zustand. */
  paint(v: Visual) {
    const { mats } = this.shared;
    for (let i = 0; i < 54; i++) {
      const home = v.state[i];
      const look = v.look ? v.look(home) : 'color';
      this.stickers[i].material = mats[look][Math.floor(home / 9)];
    }
  }

  /** Dreht die zum Zug gehörenden Schichten um einen Anteil (0..1) der Drehung. */
  setTurn(move: Move | null, progress: number) {
    for (const c of this.cubies) {
      c.group.position.copy(c.home);
      c.group.quaternion.identity();
    }
    if (!move || progress <= 0) return;
    const def = MOVE_DEFS[move.base];
    const turns = move.amount === 3 ? -1 : move.amount;
    const angle = def.dir * turns * (Math.PI / 2) * progress;
    const axis = new THREE.Vector3(def.axis === 0 ? 1 : 0, def.axis === 1 ? 1 : 0, def.axis === 2 ? 1 : 0);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    for (const c of this.cubies) {
      const coord = def.axis === 0 ? c.home.x : def.axis === 1 ? c.home.y : c.home.z;
      if (!def.layers.includes(coord)) continue;
      c.group.position.copy(c.home).applyQuaternion(q);
      c.group.quaternion.copy(q);
    }
  }

  /** Für die Intro-Animation: Cubies einzeln versetzen. */
  forEachCubie(fn: (group: THREE.Group, home: THREE.Vector3, index: number) => void) {
    this.cubies.forEach((c, i) => fn(c.group, c.home, i));
  }

  stickerMesh(facelet: number) {
    return this.stickers[facelet];
  }
}
