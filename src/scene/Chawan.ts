import * as THREE from "three";
import { CONFIG } from "../config";

/**
 * 茶碗（ちゃわん）と抹茶の液面。
 * 画面中央（原点）に配置される。
 */
export class Chawan {
  readonly object = new THREE.Group();

  constructor() {
    this.object.name = "Chawan";
    // 液面は LiquidSurface（ShaderMaterial）が担当するため、ここでは器のみ。
    this.object.add(this.createBowl());
  }

  /** LatheGeometry で茶碗の器体を作る。 */
  private createBowl(): THREE.Mesh {
    const { rimRadius, rimY } = CONFIG.bowl;

    // 内側→底→外側の輪郭を定義し、Y 軸まわりに回転させて器にする。
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.0, 0.08), // 内底中心
      new THREE.Vector2(0.45, 0.03), // 内底
      new THREE.Vector2(0.95, 0.18),
      new THREE.Vector2(1.25, 0.5),
      new THREE.Vector2(rimRadius * 0.92, rimY - 0.08),
      new THREE.Vector2(rimRadius, rimY), // 内リム上端
      new THREE.Vector2(rimRadius + 0.05, rimY), // リムの厚み
      new THREE.Vector2(rimRadius * 0.95, rimY - 0.12), // 外壁へ折り返す
      new THREE.Vector2(1.3, 0.45),
      new THREE.Vector2(1.0, 0.1),
      new THREE.Vector2(0.5, 0.0), // 高台（底）
    ];

    const geometry = new THREE.LatheGeometry(profile, 72);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x4a4038,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Bowl";
    mesh.castShadow = true; // テーブルに影を落とす
    mesh.receiveShadow = true; // 器の内側で陰影を受ける
    return mesh;
  }
}
