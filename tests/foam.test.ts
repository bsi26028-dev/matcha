import { describe, it, expect } from "vitest";
import { FoamSimulator } from "../src/sim/FoamSimulator";
import type { FoamInputs } from "../src/sim/FoamSimulator";

/** 基準の材料量（抹茶 2g・お湯 70mL）。 */
const REFERENCE = { matchaGrams: 2, waterMl: 70 };

/**
 * 指定の入力で duration 秒ぶん、fps のステップで回す。
 */
function run(
  sim: FoamSimulator,
  inputs: FoamInputs,
  durationSec: number,
  fps: number,
): void {
  const dt = 1 / fps;
  const steps = Math.round(durationSec * fps);
  for (let i = 0; i < steps; i++) {
    sim.update(inputs, dt);
  }
}

describe("FoamSimulator", () => {
  it("停止中は泡が増えない", () => {
    // 最初から停止
    const sim = new FoamSimulator();
    run(sim, { ...REFERENCE, speed: 0 }, 2, 60);
    expect(sim.snapshot.foamAmount).toBe(0);

    // すでに泡がある状態から停止すると、増えず（むしろ減る）
    const sim2 = new FoamSimulator();
    sim2.reset({ foamAmount: 50 });
    const before = sim2.snapshot.foamAmount;
    run(sim2, { ...REFERENCE, speed: 0 }, 1, 60);
    expect(sim2.snapshot.foamAmount).toBeLessThanOrEqual(before);
  });

  it("お湯がない場合は泡立たない", () => {
    const sim = new FoamSimulator();
    run(sim, { matchaGrams: 2, waterMl: 0, speed: 0.5 }, 3, 60);
    const s = sim.snapshot;
    expect(s.foamAmount).toBe(0);
    expect(s.foamQuality).toBe(0);
    expect(s.foamUniformity).toBe(0);
    expect(s.spillAmount).toBe(0);
  });

  it("適切な速度で泡が増える", () => {
    const sim = new FoamSimulator();
    run(sim, { ...REFERENCE, speed: 0.5 }, 1, 60);
    const s = sim.snapshot;
    expect(s.foamAmount).toBeGreaterThan(0);
    // 細かさ・均一さも最適速度帯で上がる
    expect(s.foamQuality).toBeGreaterThan(0);
    expect(s.foamUniformity).toBeGreaterThan(0);
  });

  it("速すぎると飛沫が増える", () => {
    // 適切な速度（しきい値以下）では飛沫は発生しない
    const moderate = new FoamSimulator();
    run(moderate, { ...REFERENCE, speed: 0.5 }, 2, 60);
    expect(moderate.snapshot.spillAmount).toBe(0);

    // 速すぎると飛沫が発生する
    const fast = new FoamSimulator();
    run(fast, { ...REFERENCE, speed: 0.95 }, 2, 60);
    expect(fast.snapshot.spillAmount).toBeGreaterThan(0);
    expect(fast.snapshot.spillAmount).toBeGreaterThan(
      moderate.snapshot.spillAmount,
    );
  });

  it("泡の値が 0〜100 を超えない", () => {
    const sim = new FoamSimulator();
    // 極端な速度・長時間・大きい dt でも範囲を超えない
    run(sim, { matchaGrams: 2, waterMl: 70, speed: 1.0 }, 60, 10);
    const s = sim.snapshot;
    for (const v of [
      s.foamAmount,
      s.foamQuality,
      s.foamUniformity,
      s.spillAmount,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }

    // 負方向の暴走も起きないこと（長時間停止）
    const sim2 = new FoamSimulator();
    sim2.reset({
      foamAmount: 100,
      foamQuality: 100,
      foamUniformity: 100,
      spillAmount: 100,
    });
    run(sim2, { ...REFERENCE, speed: 0 }, 30, 60);
    const s2 = sim2.snapshot;
    for (const v of [
      s2.foamAmount,
      s2.foamQuality,
      s2.foamUniformity,
      s2.spillAmount,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("フレームレートによる結果の差が小さい", () => {
    const inputs: FoamInputs = { ...REFERENCE, speed: 0.5 };
    const duration = 2;

    const at60 = new FoamSimulator();
    run(at60, inputs, duration, 60);

    const at30 = new FoamSimulator();
    run(at30, inputs, duration, 30);

    const at120 = new FoamSimulator();
    run(at120, inputs, duration, 120);

    // 0〜100 スケールで、フレームレート差による結果のズレが十分小さい
    expect(Math.abs(at60.snapshot.foamAmount - at30.snapshot.foamAmount)).toBeLessThan(1.0);
    expect(Math.abs(at60.snapshot.foamAmount - at120.snapshot.foamAmount)).toBeLessThan(1.0);
    expect(Math.abs(at60.snapshot.foamQuality - at30.snapshot.foamQuality)).toBeLessThan(1.0);
    expect(Math.abs(at60.snapshot.foamUniformity - at30.snapshot.foamUniformity)).toBeLessThan(1.0);
  });
});
