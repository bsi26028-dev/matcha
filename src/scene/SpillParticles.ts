import * as THREE from "three";
import { CONFIG } from "../config";
import { spillRate } from "../sim/gameBalance";

/**
 * 飛沫（液滴）パーティクル。
 *
 *   - 茶筅が激しく動くと液滴が飛び散る（spillRate がしきい値を超えると発生）
 *   - 液滴は重力で落下する
 *   - 発生量は FoamSimulator の spillAmount と同じ spillRate を基準にする
 *
 * 固定プールの InstancedMesh を使い回す軽量実装。
 */
export class SpillParticles {
  readonly mesh: THREE.InstancedMesh;

  private readonly count: number;
  private readonly active: boolean[] = [];
  private readonly pos: THREE.Vector3[] = [];
  private readonly vel: THREE.Vector3[] = [];

  private readonly dummy = new THREE.Object3D();
  private surfaceY: number;
  private spawnAccumulator = 0;
  private nextSlot = 0;

  constructor(surfaceY: number) {
    this.surfaceY = surfaceY;
    this.count = CONFIG.spillVis.maxDroplets;

    const geometry = new THREE.SphereGeometry(CONFIG.spillVis.radius, 8, 6);
    const material = new THREE.MeshStandardMaterial({
      color: CONFIG.spillVis.color,
      roughness: 0.3,
      metalness: 0.0,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.name = "Spill";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < this.count; i++) {
      this.active.push(false);
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.hide(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setSurfaceY(y: number): void {
    this.surfaceY = y;
  }

  /**
   * 速度に応じて飛沫を発生させる。
   * @returns この呼び出しで発生した液滴数（spillAmount の加算判断などに使える）
   */
  spawnFromSpeed(
    speed: number,
    originX: number,
    originZ: number,
    dt: number,
  ): number {
    const rate = spillRate(speed); // /秒（gameBalance と共通）
    if (rate <= 0) return 0;

    this.spawnAccumulator += rate * CONFIG.spillVis.spawnScale * dt;
    let spawned = 0;
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      this.spawnOne(originX, originZ);
      spawned++;
    }
    return spawned;
  }

  private spawnOne(originX: number, originZ: number): void {
    const slot = this.findSlot();
    if (slot < 0) return;

    const [upMin, upMax] = CONFIG.spillVis.upSpeed;
    const [outMin, outMax] = CONFIG.spillVis.outSpeed;
    const angle = Math.random() * Math.PI * 2;
    const outSpeed = rand(outMin, outMax);

    this.pos[slot].set(originX, this.surfaceY + 0.02, originZ);
    this.vel[slot].set(
      Math.cos(angle) * outSpeed,
      rand(upMin, upMax),
      Math.sin(angle) * outSpeed,
    );
    this.active[slot] = true;
  }

  private findSlot(): number {
    for (let n = 0; n < this.count; n++) {
      const i = (this.nextSlot + n) % this.count;
      if (!this.active[i]) {
        this.nextSlot = (i + 1) % this.count;
        return i;
      }
    }
    return -1; // 空きなし
  }

  update(dt: number): void {
    const g = CONFIG.spillVis.gravity;
    for (let i = 0; i < this.count; i++) {
      if (!this.active[i]) continue;

      const v = this.vel[i];
      const p = this.pos[i];
      v.y -= g * dt;
      p.x += v.x * dt;
      p.y += v.y * dt;
      p.z += v.z * dt;

      // 液面より下に落ちたら消す。
      if (p.y <= this.surfaceY) {
        this.active[i] = false;
        this.hide(i);
        continue;
      }

      this.dummy.position.copy(p);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private hide(i: number): void {
    this.dummy.position.set(0, this.surfaceY - 10, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  /** すべての液滴を消す（リトライ用）。 */
  reset(): void {
    this.spawnAccumulator = 0;
    for (let i = 0; i < this.count; i++) {
      this.active[i] = false;
      this.hide(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 飛び散った量に応じて、茶碗の周囲のテーブル上に静止した液滴を残す。
   * 結果画面で「飛び散り抹茶」を見せるために使う（物理は動かさない静止表示）。
   */
  showSplatter(spillAmount: number): void {
    this.reset();
    const amount = Math.max(0, Math.min(100, spillAmount));
    const n = Math.min(this.count, Math.round((amount / 100) * this.count * 0.6));
    const base = CONFIG.spillVis.radius;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = CONFIG.bowl.rimRadius + 0.1 + Math.random() * 0.8;
      this.active[i] = false; // 静止表示（update では動かさない）
      const scale = (1.5 + Math.random() * 1.5); // 見やすいよう少し大きめ
      this.dummy.position.set(Math.cos(ang) * r, base * scale, Math.sin(ang) * r);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
