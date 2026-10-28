/**
 * 茶筅の移動速度を計測し、0〜1 に正規化して返すトラッカー。
 *
 * 設計方針:
 *   - 入力は「実際に表示されている茶筅の位置」(XZ)。目標位置ではない点に注意。
 *     （目標位置は遅延追従の前段で、泡立ちに使うのは実際の動きのため）
 *   - 距離と経過時間から速度を求め、茶碗の半径で正規化して「半径/秒」にする。
 *   - 基準速度で割って 0〜1 にクランプする。
 *   - 急激な変化は指数平滑で滑らかにする（フレームレート非依存）。
 *   - 操作停止中（active=false）は目標を 0 にして速度を 0 へ戻す。
 *
 * Three.js には依存しない純粋ロジックにしてある（単体で検証しやすくするため）。
 */
export interface VelocityTrackerOptions {
  /** 正規化の基準となる茶碗の半径（ワールド単位）。 */
  bowlRadius: number;
  /** 0〜1 の「1.0」に対応づける速度（半径/秒）。これ以上は 1.0 に飽和。 */
  referenceSpeed: number;
  /** 平滑化の強さ（大きいほど追従が速い）。1 秒あたりの指数係数。 */
  smoothing: number;
}

export class VelocityTracker {
  private readonly options: VelocityTrackerOptions;

  private prevX = 0;
  private prevZ = 0;
  private hasPrev = false;

  /** 平滑化後の正規化速度 0〜1。 */
  private smoothedNormalized = 0;
  /** 平滑化前の瞬間速度（半径/秒）。デバッグ表示用。 */
  private lastSpeedInRadii = 0;
  /** 平滑化前の正規化速度（0〜1、クランプ済み）。デバッグ表示用。 */
  private lastRawNormalized = 0;

  constructor(options: VelocityTrackerOptions) {
    this.options = options;
  }

  /** 計測状態を初期化する（基準位置を設定し、速度を 0 に戻す）。 */
  reset(x: number, z: number): void {
    this.prevX = x;
    this.prevZ = z;
    this.hasPrev = true;
    this.smoothedNormalized = 0;
    this.lastSpeedInRadii = 0;
    this.lastRawNormalized = 0;
  }

  /**
   * 毎フレーム呼ぶ。実際の茶筅位置から速度を更新し、平滑化後の 0〜1 を返す。
   *
   * @param x        実際の茶筅の X 座標（ワールド）
   * @param z        実際の茶筅の Z 座標（ワールド）
   * @param dt       前フレームからの経過秒数
   * @param active   操作中（ドラッグ中）かどうか
   */
  update(x: number, z: number, dt: number, active: boolean): number {
    if (dt <= 0) return this.smoothedNormalized;

    if (!this.hasPrev) {
      this.prevX = x;
      this.prevZ = z;
      this.hasPrev = true;
    }

    // 移動距離（XZ 平面。高さは一定なので XZ のみで十分）。
    const dx = x - this.prevX;
    const dz = z - this.prevZ;
    this.prevX = x;
    this.prevZ = z;
    const distance = Math.hypot(dx, dz);

    // 速度 = 距離 / 時間 → 茶碗半径で正規化（半径/秒）。
    const speedPerSecond = distance / dt;
    const speedInRadii = speedPerSecond / this.options.bowlRadius;
    this.lastSpeedInRadii = speedInRadii;

    // 0〜1 へ変換（基準速度で割ってクランプ）。
    const rawNormalized = clamp01(speedInRadii / this.options.referenceSpeed);
    this.lastRawNormalized = rawNormalized;

    // 操作停止中は 0 を目標にする。
    const targetValue = active ? rawNormalized : 0;

    // フレームレート非依存の指数平滑。
    const k = 1 - Math.exp(-this.options.smoothing * dt);
    this.smoothedNormalized += (targetValue - this.smoothedNormalized) * k;

    return this.smoothedNormalized;
  }

  /** 平滑化後の正規化速度 0〜1（泡立ち計算などで使う値）。 */
  get normalized(): number {
    return this.smoothedNormalized;
  }

  /** 平滑化前の瞬間速度（半径/秒）。デバッグ表示用。 */
  get rawSpeedInRadii(): number {
    return this.lastSpeedInRadii;
  }

  /** 平滑化前の正規化速度 0〜1。デバッグ表示用。 */
  get rawNormalized(): number {
    return this.lastRawNormalized;
  }
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
