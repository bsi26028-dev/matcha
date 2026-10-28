import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * 茶筅（ちゃせん）。
 *
 * 外側のラッパー Group（`object`）の位置をコントローラが動かす。
 * 実際の見た目を担う「モデル」は `setModel()` で差し替えられる構造にしてある。
 * これにより、暫定の手続き生成モデルを後から高品質な GLB モデルへ
 * 置き換えても、コントローラ側のコードは一切変更しなくてよい。
 *
 * モデルの約束事（規約）:
 *   - 原点 (0,0,0) を穂先の先端（液面に触れる点）とする。
 *   - +Y 方向へ柄が伸びる。
 */
export class Chasen {
  /** シーンに追加する最上位オブジェクト。位置はこの Group に対して設定する。 */
  readonly object = new THREE.Group();

  private model: THREE.Object3D | null = null;

  constructor() {
    this.object.name = "Chasen";
  }

  /**
   * 見た目モデルを差し替える。既存モデルは破棄する。
   * @param model 原点を穂先先端とし +Y へ柄が伸びる Object3D
   */
  setModel(model: THREE.Object3D): void {
    if (this.model) {
      this.object.remove(this.model);
      disposeObject(this.model);
    }
    this.model = model;
    this.object.add(model);
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }
}

/**
 * 暫定の手続き生成モデル（竹の茶筅をデフォルメしたもの）。
 * GLB が用意できるまでのプレースホルダ。
 */
export function createPlaceholderChasenModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "ChasenPlaceholder";

  const bamboo = new THREE.MeshStandardMaterial({
    color: 0xdccf9b,
    roughness: 0.7,
    metalness: 0.0,
  });
  const bambooDark = new THREE.MeshStandardMaterial({
    color: 0xc3b074,
    roughness: 0.75,
    metalness: 0.0,
  });

  // 柄（持ち手）: 太い竹の筒
  const handleHeight = 0.62;
  const handleBottomY = 0.36;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.08, handleHeight, 20),
    bambooDark,
  );
  handle.position.y = handleBottomY + handleHeight / 2;
  group.add(handle);

  // 穂（ほ）: 細く割いた竹が放射状に広がり、先端が穂先として下を向く
  const tineCount = 24;
  const baseY = 0.42; // 穂の付け根の高さ
  const tipY = 0.015; // 穂先の高さ（原点近傍 = 液面）
  const tipSpread = 0.2; // 穂先が外側に開く半径
  const baseSpread = 0.055; // 付け根の半径

  for (let i = 0; i < tineCount; i++) {
    const angle = (i / tineCount) * Math.PI * 2;
    const base = new THREE.Vector3(
      Math.cos(angle) * baseSpread,
      baseY,
      Math.sin(angle) * baseSpread,
    );
    const tip = new THREE.Vector3(
      Math.cos(angle) * tipSpread,
      tipY,
      Math.sin(angle) * tipSpread,
    );
    group.add(makeTine(base, tip, bamboo));
  }

  // 付け根を束ねる糸（装飾）
  const knot = new THREE.Mesh(
    new THREE.TorusGeometry(0.085, 0.016, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xb23b3b, roughness: 0.6 }),
  );
  knot.rotation.x = Math.PI / 2;
  knot.position.y = baseY;
  group.add(knot);

  // 仮モデルも影を落とす。
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });

  return group;
}

/** 2 点間を結ぶ細い円柱（穂先 1 本）を作る。 */
function makeTine(
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  const geom = new THREE.CylinderGeometry(0.006, 0.009, length, 6);
  const mesh = new THREE.Mesh(geom, material);

  // 円柱はデフォルトで +Y 方向。from→to の向きへ回転させる。
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  return mesh;
}

/**
 * GLB 形式の茶筅モデルを読み込む。
 * モデルの原点が穂先先端・+Y が柄方向、という規約に沿っていることを前提とする。
 * スケールや向きが異なる場合は呼び出し側で調整するか、ここに補正を加える。
 *
 * @example
 *   const model = await loadChasenGLBModel("/models/chasen.glb");
 *   chasen.setModel(model);
 */
export async function loadChasenGLBModel(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.name = "ChasenGLB";
  return root;
}

/** メッシュとジオメトリ・マテリアルを破棄する。 */
function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((m) => m.dispose());
    }
  });
}
