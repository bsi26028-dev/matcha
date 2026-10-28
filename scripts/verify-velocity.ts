/**
 * VelocityTracker の検証スクリプト（Node で直接実行）。
 *   node scripts/verify-velocity.ts
 *
 * 確認する内容:
 *   1. 低速・中速・高速で異なる正規化速度が得られる（単調増加）。
 *   2. フレームレート（60fps / 30fps）を変えても結果がほぼ一致する
 *      （= フレームレート非依存）。
 *   3. 操作停止後に速度が 0 へ戻る。
 */
import { VelocityTracker } from "../src/controls/VelocityTracker.ts";

const bowlRadius = 1.15;
const referenceSpeed = 6.0;
const smoothing = 12;

/**
 * 一定速度 v（半径/秒）で直線移動し続けたときの、
 * 定常状態の正規化速度を返す。
 */
function simulateSteady(radiiPerSecond: number, fps: number): number {
  const tracker = new VelocityTracker({ bowlRadius, referenceSpeed, smoothing });
  tracker.reset(0, 0);

  const dt = 1 / fps;
  const worldSpeed = radiiPerSecond * bowlRadius; // ワールド単位/秒
  let x = 0;

  // 2 秒ぶんまわして定常化させる。
  const steps = Math.round(2 / dt);
  let normalized = 0;
  for (let i = 0; i < steps; i++) {
    x += worldSpeed * dt;
    normalized = tracker.update(x, 0, dt, true);
  }
  return normalized;
}

/** 操作停止後に 0 へ戻ることを確認する。 */
function simulateStop(fps: number): number {
  const tracker = new VelocityTracker({ bowlRadius, referenceSpeed, smoothing });
  tracker.reset(0, 0);
  const dt = 1 / fps;
  const worldSpeed = 4 * bowlRadius;
  let x = 0;

  // まず動かす。
  for (let i = 0; i < Math.round(1 / dt); i++) {
    x += worldSpeed * dt;
    tracker.update(x, 0, dt, true);
  }
  // 停止（active=false, 位置も動かさない）。
  let normalized = tracker.normalized;
  for (let i = 0; i < Math.round(1 / dt); i++) {
    normalized = tracker.update(x, 0, dt, false);
  }
  return normalized;
}

const cases: Array<{ label: string; v: number }> = [
  { label: "低速 (1.0 r/s)", v: 1.0 },
  { label: "中速 (3.0 r/s)", v: 3.0 },
  { label: "高速 (7.0 r/s)", v: 7.0 },
];

console.log("=== 定常状態の正規化速度（0〜1）===");
console.log("case             |  60fps  |  30fps");
console.log("-----------------+---------+--------");
const results60: number[] = [];
for (const c of cases) {
  const a = simulateSteady(c.v, 60);
  const b = simulateSteady(c.v, 30);
  results60.push(a);
  console.log(
    `${c.label.padEnd(16)} | ${a.toFixed(3)}   | ${b.toFixed(3)}`,
  );
}

console.log("\n=== 判定 ===");

// 1. 単調増加（低速 < 中速 < 高速）
const monotonic = results60[0] < results60[1] && results60[1] < results60[2];
console.log(`低速 < 中速 < 高速 : ${monotonic ? "OK" : "NG"}`);

// 2. フレームレート非依存（60fps と 30fps の差が十分小さい）
let frameIndependent = true;
for (const c of cases) {
  const diff = Math.abs(simulateSteady(c.v, 60) - simulateSteady(c.v, 30));
  if (diff > 0.01) frameIndependent = false;
}
console.log(`フレームレート非依存（差<0.01）: ${frameIndependent ? "OK" : "NG"}`);

// 3. 停止後に 0 へ戻る
const stopped60 = simulateStop(60);
const stopped30 = simulateStop(30);
const returnsToZero = stopped60 < 0.01 && stopped30 < 0.01;
console.log(
  `停止後に 0 へ戻る : ${returnsToZero ? "OK" : "NG"} ` +
    `(60fps=${stopped60.toFixed(4)}, 30fps=${stopped30.toFixed(4)})`,
);

const allOk = monotonic && frameIndependent && returnsToZero;
console.log(`\n総合: ${allOk ? "PASS" : "FAIL"}`);
process.exit(allOk ? 0 : 1);
