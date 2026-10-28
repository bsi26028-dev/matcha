import * as THREE from "three";
import { CONFIG } from "../config";
import type { FoamState } from "../sim/FoamSimulator";

/**
 * 泡（気泡）を InstancedMesh で描画する。
 *
 *   - foamAmount で泡の密度（表示する個数）を変える
 *   - foamQuality で泡の大きさを変える（細かいほど小さい）
 *   - foamUniformity で泡の分布を変える（均一⇔パッチ状）
 *   - 大きな泡と微細な泡を混在させる
 *   - 表示状態を目標へ平滑に寄せ、増減を滑らかにする
 *
 * 高負荷な流体計算は行わず、固定プールの気泡を見せ消しして密度を表現する。
 */
export class FoamRenderer {
  readonly mesh: THREE.InstancedMesh;

  private readonly count: number;
  private readonly evenPos: THREE.Vector2[] = []; // 均一配置（フィボナッチ）
  private readonly randPos: THREE.Vector2[] = []; // ランダム配置
  private readonly baseRadius: number[] = [];
  private readonly isLarge: boolean[] = [];
  private readonly phase: number[] = [];
  private readonly patchMask: number[] = []; // 低均一時の見せ消し用（0〜1）
  private readonly tone: number[] = []; // 色味（0=基本色〜1=ハイライト）。小さい泡ほど明るい。

  // 泡のカラーパレット（白ではなく黄緑系）。
  private readonly colBase = new THREE.Color(CONFIG.foamVis.colorBase);
  private readonly colLight = new THREE.Color(CONFIG.foamVis.colorLight);
  private readonly colHighlight = new THREE.Color(CONFIG.foamVis.colorHighlight);
  private readonly colDeepTint = new THREE.Color(CONFIG.foamVis.colorDeepTint);
  private readonly scratchColor = new THREE.Color();
  private concentration = 0.5;

  private readonly dummy = new THREE.Object3D();
  private surfaceY: number;
  private time = 0;

  /** 表示用の平滑化された泡状態（0〜100）。 */
  private display = { amount: 0, quality: 0, uniformity: 0 };

  /** 泡の寄り（片寄り抹茶などの表現）。寄せ先の XZ と強さ 0〜1。 */
  private biasX = 0;
  private biasZ = 0;
  private biasStrength = 0;

  constructor(surfaceY: number) {
    this.surfaceY = surfaceY;
    this.count = CONFIG.foamVis.maxBubbles;

    const geometry = new THREE.SphereGeometry(1, 10, 8); // 半径1。スケールで調整
    // 色は per-instance（instanceColor）で与えるため material.color は白（＝乗算で素通し）。
    // roughness を高めにして白いスペキュラ（照明の映り込み）を抑える。
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.0,
      emissive: new THREE.Color(CONFIG.foamVis.colorLight),
      emissiveIntensity: 0.06,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.name = "Foam";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this.generatePool();

    // 初期は全て不可視（スケール0）にしておく。
    for (let i = 0; i < this.count; i++) {
      this.dummy.position.set(0, surfaceY, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // 泡の色（instanceColor）を初期化。
    this.setConcentration(this.concentration);
  }

  /**
   * 抹茶の濃度（0〜1）に応じて泡の色味を更新する。
   * 小さい泡ほど明るい（ハイライト寄り）、濃い抹茶ほど少し深い緑になる。
   * 白にはせず、ハイライトは colorHighlight までに抑える。
   */
  setConcentration(c: number): void {
    this.concentration = c < 0 ? 0 : c > 1 ? 1 : c;
    for (let i = 0; i < this.count; i++) {
      const t = this.tone[i];
      // 基本色 → 明るい部分 → ハイライト。
      this.scratchColor.copy(this.colBase).lerp(this.colLight, Math.min(1, t * 1.5));
      if (t > 0.6) {
        this.scratchColor.lerp(this.colHighlight, ((t - 0.6) / 0.4) * 0.6);
      }
      // 濃い抹茶ほど泡にも深い緑を少し混ぜる（液体との調和）。
      this.scratchColor.lerp(this.colDeepTint, this.concentration * 0.25);
      this.mesh.setColorAt(i, this.scratchColor);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setSurfaceY(y: number): void {
    this.surfaceY = y;
  }

  /** 泡の寄り先と強さを設定する（0 で中心＝寄りなし）。 */
  setBias(x: number, z: number, strength: number): void {
    this.biasX = x;
    this.biasZ = z;
    this.biasStrength = Math.max(0, Math.min(1, strength));
  }

  private generatePool(): void {
    const R = CONFIG.operableRadius; // 泡は操作範囲内に分布
    const golden = Math.PI * (3 - Math.sqrt(5));
    const [smin, smax] = CONFIG.foamVis.smallRadius;
    const [lmin, lmax] = CONFIG.foamVis.largeRadius;

    for (let i = 0; i < this.count; i++) {
      // 均一配置（フィボナッチ・サンフラワー）
      const t = (i + 0.5) / this.count;
      const er = Math.sqrt(t) * R * 0.97;
      const ea = i * golden;
      this.evenPos.push(new THREE.Vector2(Math.cos(ea) * er, Math.sin(ea) * er));

      // ランダム配置
      const rr = Math.sqrt(Math.random()) * R * 0.97;
      const ra = Math.random() * Math.PI * 2;
      this.randPos.push(new THREE.Vector2(Math.cos(ra) * rr, Math.sin(ra) * rr));

      const large = Math.random() < CONFIG.foamVis.largeRatio;
      this.isLarge.push(large);
      this.baseRadius.push(
        large ? rand(lmin, lmax) : rand(smin, smax),
      );
      this.phase.push(Math.random() * Math.PI * 2);
      this.patchMask.push(Math.random());
      // 色味: 小さい泡ほど明るく（ハイライト寄り）、大きい泡は基本色寄り。
      this.tone.push(large ? rand(0.0, 0.35) : rand(0.45, 1.0));
    }
  }

  /**
   * @param state 目標の泡状態（0〜100）
   * @param dt    経過秒数
   */
  update(state: FoamState, dt: number): void {
    this.time += dt;

    // 表示状態を目標へ平滑に寄せる（増減を滑らかに）。
    const k = 1 - Math.exp(-CONFIG.foamVis.displaySmoothing * dt);
    this.display.amount += (state.foamAmount - this.display.amount) * k;
    this.display.quality += (state.foamQuality - this.display.quality) * k;
    this.display.uniformity += (state.foamUniformity - this.display.uniformity) * k;

    const density = this.display.amount / 100; // 0〜1
    const quality = this.display.quality / 100;
    const uniformity = this.display.uniformity / 100;
    const fadeBand = CONFIG.foamVis.fadeBand;

    for (let i = 0; i < this.count; i++) {
      const threshold = i / this.count;
      // しきい値付近でスケールを 0→1 に補間（滑らかな出現）。
      let appear = (density - threshold) / fadeBand;
      appear = appear < 0 ? 0 : appear > 1 ? 1 : appear;

      // 均一さが低いほど一部の泡をムラとして消す。
      const patchKeep = uniformity + (1 - uniformity) * this.patchMask[i];
      appear *= patchKeep;

      if (appear <= 0.001) {
        this.dummy.position.set(0, this.surfaceY - 1, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      // 位置: 均一さで「ランダム」→「均一」へブレンド。
      const rp = this.randPos[i];
      const ep = this.evenPos[i];
      let x = rp.x + (ep.x - rp.x) * uniformity;
      let z = rp.y + (ep.y - rp.y) * uniformity;

      // 寄り: 点てた位置の重心へ泡を寄せる（片寄り抹茶など）。
      if (this.biasStrength > 0) {
        x += (this.biasX - x) * this.biasStrength * 0.7;
        z += (this.biasZ - z) * this.biasStrength * 0.7;
      }

      // 大きさ: 細かさが高いほど小さく（特に大きな泡を縮める）。
      let radius = this.baseRadius[i];
      if (this.isLarge[i]) {
        radius *= 0.5 + 0.5 * (1 - quality); // 高品質で約半分へ
      } else {
        radius *= 0.8 + 0.2 * (1 - quality);
      }
      const scale = radius * appear;

      const bob =
        CONFIG.foamVis.bob * Math.sin(this.time * 2.0 + this.phase[i]);
      this.dummy.position.set(x, this.surfaceY + scale * 0.5 + bob, z);
      this.dummy.scale.setScalar(scale);
      this.dummy.rotation.set(0, this.phase[i], 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    // 細かさが高いほどわずかに明るく（ただし白くはしない）。
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.05 + 0.12 * quality;

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 泡をすべて消して表示状態を初期化する（リトライ用）。 */
  reset(): void {
    this.display.amount = 0;
    this.display.quality = 0;
    this.display.uniformity = 0;
    this.biasX = 0;
    this.biasZ = 0;
    this.biasStrength = 0;
    for (let i = 0; i < this.count; i++) {
      this.dummy.position.set(0, this.surfaceY - 1, 0);
      this.dummy.scale.setScalar(0);
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
