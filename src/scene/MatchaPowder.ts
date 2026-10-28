import * as THREE from "three";
import { CONFIG } from "../config";

/**
 * 茶碗の底に盛られた抹茶の粉。量（g）に応じて盛りが大きくなる。
 * お湯を注ぐと溶けて見えなくする想定（visible を切り替える）。
 */
export class MatchaPowder {
  readonly mesh: THREE.Mesh;

  constructor() {
    // 半球を平たくして「盛り」を表現。
    const geometry = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x5f7d2e,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "MatchaPowder";
    this.mesh.castShadow = true;
    this.mesh.position.y = 0.06; // 内底付近
    this.mesh.visible = false;
    this.setAmount(0);
  }

  /** 抹茶量（g）に応じて盛りのサイズを更新する。 */
  setAmount(grams: number): void {
    const t = Math.max(0, Math.min(1, grams / CONFIG.game.matchaMaxGrams));
    const radius = 0.1 + t * 0.5; // 半径 0.1〜0.6
    this.mesh.scale.set(radius, radius * 0.4, radius);
    this.mesh.visible = grams > 0.01;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
