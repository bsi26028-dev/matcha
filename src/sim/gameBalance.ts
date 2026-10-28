/**
 * 泡立ち計算のゲームバランス（係数と計算式）。
 *
 * 計算式と各係数はこのファイルに集約してあり、ここを編集するだけで
 * 挙動を調整できる。描画（Three.js）には一切依存しない純粋ロジック。
 *
 * 基準値: 抹茶 2g・お湯 70mL。
 */

export const GAME_BALANCE = {
  /** 基準となる材料量。比率計算の基準に使う。 */
  reference: {
    matchaGrams: 2,
    waterMl: 70,
  },

  /** 抹茶とお湯の比率に関する設定。 */
  ratio: {
    /**
     * 比率ズレの許容幅（対数スケールのガウス幅）。
     * 大きいほど基準比からズレても泡立ちが落ちにくい。
     */
    sigma: 0.6,
  },

  /** 茶筅の速度（0〜1）に関する設定。 */
  speed: {
    /** これ以上の速度で泡の成長が飽和する。 */
    idealSpeed: 0.5,
    /** これ未満はほぼ停止とみなし、成長を 0 に近づける。 */
    startup: 0.08,
    /** 泡の細かさ・均一さにとって最適な速度（バンド中心）。 */
    bandCenter: 0.5,
    /** 最適速度帯の広がり（ガウス幅）。 */
    bandWidth: 0.28,
    /** これを超える速度では飛沫が発生し始める。 */
    spillThreshold: 0.75,
  },

  /** 泡の量 foamAmount の増減。単位は「/秒」。 */
  foam: {
    growthBase: 60,
    decayBase: 6,
  },

  /** 泡の細かさ foamQuality の増減。単位は「/秒」。 */
  quality: {
    gain: 35,
    decay: 10,
  },

  /** 泡の均一さ foamUniformity の増減。単位は「/秒」。 */
  uniformity: {
    gain: 30,
    decay: 8,
    /** 飛沫発生時に均一さを崩す係数。 */
    spillPenalty: 1.2,
  },

  /** 飛沫 spillAmount の発生。単位は「/秒」。 */
  spill: {
    base: 50,
  },
} as const;

/** 出力・内部状態の下限/上限。 */
export const FOAM_MIN = 0;
export const FOAM_MAX = 100;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * 抹茶とお湯の比率による泡立ちやすさ（0〜1）。
 * 基準比（2g / 70mL）で 1.0 となり、比が基準から離れるほど小さくなる。
 * 抹茶またはお湯が無い場合は 0。
 */
export function ratioFactor(matchaGrams: number, waterMl: number): number {
  if (matchaGrams <= 0 || waterMl <= 0) return 0;
  const idealRatio =
    GAME_BALANCE.reference.matchaGrams / GAME_BALANCE.reference.waterMl;
  const ratio = matchaGrams / waterMl;
  // 対数スケールのガウスで、濃すぎ/薄すぎを対称に評価する。
  const logDiff = Math.log(ratio / idealRatio);
  const s = GAME_BALANCE.ratio.sigma;
  return Math.exp(-(logDiff * logDiff) / (2 * s * s));
}

/**
 * 泡の「量」を増やす速度係数（0〜1）。
 * 停止時は 0、理想速度で 1 に飽和する（速いほど成長は衰えない）。
 */
export function speedGrowthFactor(speed: number): number {
  if (speed <= 0) return 0;
  const { idealSpeed, startup } = GAME_BALANCE.speed;
  const ramp = clamp01(speed / startup); // 停止付近を 0 にする
  const rise = clamp01(speed / idealSpeed); // 理想速度で飽和
  return ramp * rise;
}

/**
 * 泡の「細かさ・均一さ」に効く最適速度帯の係数（0〜1）。
 * 最適速度（bandCenter）で 1 に近づき、遅すぎ/速すぎで小さくなる。
 */
export function bandFactor(speed: number): number {
  if (speed <= 0) return 0;
  const { bandCenter, bandWidth, startup } = GAME_BALANCE.speed;
  const ramp = clamp01(speed / startup);
  const d = (speed - bandCenter) / bandWidth;
  return ramp * Math.exp(-(d * d) / 2);
}

/**
 * 飛沫の発生レート（/秒の係数）。
 * しきい値を超えた速度ぶんだけ増える。しきい値以下では 0。
 */
export function spillRate(speed: number): number {
  const { spillThreshold } = GAME_BALANCE.speed;
  if (speed <= spillThreshold) return 0;
  const over = (speed - spillThreshold) / (1 - spillThreshold);
  return GAME_BALANCE.spill.base * clamp01(over);
}
