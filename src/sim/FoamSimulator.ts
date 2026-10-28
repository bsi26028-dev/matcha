import {
  GAME_BALANCE,
  FOAM_MIN,
  FOAM_MAX,
  clamp,
  ratioFactor,
  speedGrowthFactor,
  bandFactor,
  spillRate,
} from "./gameBalance";

/**
 * 泡立ち計算への入力（1 フレームぶん）。
 */
export interface FoamInputs {
  /** 抹茶の量（g）。 */
  matchaGrams: number;
  /** お湯の量（mL）。 */
  waterMl: number;
  /** 茶筅の移動速度（0〜1、実際の表示位置から計測した値）。 */
  speed: number;
}

/**
 * 泡立ちの出力・状態。すべて 0〜100。
 */
export interface FoamState {
  /** 泡の量。 */
  foamAmount: number;
  /** 泡の細かさ。 */
  foamQuality: number;
  /** 泡の均一さ。 */
  foamUniformity: number;
  /** 飛び散った量（累積）。 */
  spillAmount: number;
}

function initialState(): FoamState {
  return { foamAmount: 0, foamQuality: 0, foamUniformity: 0, spillAmount: 0 };
}

/**
 * 茶筅の動きと材料量から泡立ちを計算するシミュレータ。
 *
 * - Three.js には依存しない純粋ロジック（描画から分離）。
 * - 時間（dt）で積分するため、操作時間が長いほど結果が蓄積される。
 * - すべての増減を dt 比例にしてあり、フレームレートに依存しにくい。
 *
 * ルール:
 *   - お湯が無い場合は泡立たない。
 *   - 茶筅が停止している場合は泡が増えない（むしろ少しずつ減る）。
 *   - 適切な速度では泡が増える。
 *   - 適切な速度を維持すると泡が細かく・均一になる。
 *   - 速すぎる場合は飛沫が増える。
 *   - 抹茶とお湯の比率が泡立ちに影響する。
 *   - 動きを止めると泡が少しずつ減少する。
 */
export class FoamSimulator {
  private state: FoamState = initialState();

  /** 状態を初期化する。テスト用に初期値を上書きできる。 */
  reset(initial?: Partial<FoamState>): void {
    this.state = { ...initialState(), ...initial };
    this.clampState();
  }

  /** 現在の状態のコピーを返す。 */
  get snapshot(): FoamState {
    return { ...this.state };
  }

  /**
   * 1 フレーム進める。更新後の状態（コピー）を返す。
   *
   * @param inputs 材料量と茶筅速度
   * @param dt     経過秒数
   */
  update(inputs: FoamInputs, dt: number): FoamState {
    if (dt <= 0) return this.snapshot;

    const water = inputs.waterMl > 0 ? 1 : 0; // お湯の有無（0 or 1）
    const rFactor = ratioFactor(inputs.matchaGrams, inputs.waterMl); // 比率
    const sGrowth = speedGrowthFactor(inputs.speed); // 量を増やす速度係数
    const band = bandFactor(inputs.speed); // 最適速度帯の係数
    const spill = spillRate(inputs.speed) * water; // 飛沫レート（水が要る）

    const s = this.state;

    // --- 泡の量 ---
    // 成長は速度・比率・お湯に比例し、満杯(100)に近づくほど鈍る。
    // 減衰は常にかかるので、停止すると少しずつ減る。
    const foamGrowth =
      GAME_BALANCE.foam.growthBase *
      sGrowth *
      rFactor *
      water *
      (1 - s.foamAmount / FOAM_MAX);
    const foamDecay = GAME_BALANCE.foam.decayBase * (s.foamAmount / FOAM_MAX);
    s.foamAmount += (foamGrowth - foamDecay) * dt;

    // --- 泡の細かさ ---
    // 最適速度帯を維持するほど上がり、外れると緩やかに下がる。
    const qGain =
      GAME_BALANCE.quality.gain *
      band *
      rFactor *
      water *
      (1 - s.foamQuality / FOAM_MAX);
    const qDecay =
      GAME_BALANCE.quality.decay * (s.foamQuality / FOAM_MAX) * (1 - band);
    s.foamQuality += (qGain - qDecay) * dt;

    // --- 泡の均一さ ---
    // 最適速度帯で上がり、速度帯から外れる・飛沫が出ると下がる。
    const uGain =
      GAME_BALANCE.uniformity.gain *
      band *
      rFactor *
      water *
      (1 - s.foamUniformity / FOAM_MAX);
    const uDecay =
      GAME_BALANCE.uniformity.decay *
        (s.foamUniformity / FOAM_MAX) *
        (1 - band) +
      GAME_BALANCE.uniformity.spillPenalty * spill;
    s.foamUniformity += (uGain - uDecay) * dt;

    // --- 飛沫（累積）---
    s.spillAmount += spill * dt;

    this.clampState();
    return this.snapshot;
  }

  private clampState(): void {
    const s = this.state;
    s.foamAmount = clamp(s.foamAmount, FOAM_MIN, FOAM_MAX);
    s.foamQuality = clamp(s.foamQuality, FOAM_MIN, FOAM_MAX);
    s.foamUniformity = clamp(s.foamUniformity, FOAM_MIN, FOAM_MAX);
    s.spillAmount = clamp(s.spillAmount, FOAM_MIN, FOAM_MAX);
  }
}
