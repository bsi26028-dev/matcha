import { describe, it, expect } from "vitest";
import {
  evaluate,
  tierFromScore,
  reconcileResult,
  SCORE_WEIGHTS,
} from "../src/game/ScoreSystem";
import type { ScoreInput } from "../src/game/ScoreSystem";
import type { MovementSample } from "../src/game/ResultSystem";
import { RESULTS } from "../src/game/ResultSystem";
import { tierOf } from "../src/game/resultTiers";

/** 広く点てた履歴（網羅度・操作量とも高い）。 */
function goodWhisk(): MovementSample[] {
  const p: MovementSample[] = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 0.1 + (i / 200) * 0.8;
    p.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return p;
}

function base(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    powderAmount: 2,
    waterAmount: 70,
    foamAmount: 80,
    foamQuality: 80,
    foamUniformity: 80,
    spillAmount: 0,
    whiskMovementHistory: goodWhisk(),
    ...overrides,
  };
}

describe("ScoreSystem", () => {
  it("合計は常に 0〜100 の整数", () => {
    const cases: Array<Partial<ScoreInput>> = [
      {},
      { powderAmount: 0, waterAmount: 0 },
      { powderAmount: 10, waterAmount: 5 },
      { foamQuality: 200, foamUniformity: -5, spillAmount: 999 },
      { waterAmount: 300 },
    ];
    for (const c of cases) {
      const s = evaluate(base(c));
      expect(Number.isInteger(s.total)).toBe(true);
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(100);
      for (const v of Object.values(s.breakdown)) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it("材料欠落は 0 点（空っぽ/お湯だけ/粉だけ）", () => {
    expect(evaluate(base({ powderAmount: 0, waterAmount: 0 })).total).toBe(0);
    expect(evaluate(base({ powderAmount: 0, waterAmount: 70 })).total).toBe(0);
    expect(evaluate(base({ powderAmount: 2, waterAmount: 0 })).total).toBe(0);
  });

  it("基準材料＋良い泡＋丁寧な所作は高得点", () => {
    const s = evaluate(base({ foamQuality: 92, foamUniformity: 90, spillAmount: 0 }));
    expect(s.total).toBeGreaterThanOrEqual(90);
  });

  it("極端に薄い/濃いは高得点にならない（70未満）", () => {
    const thin = evaluate(base({ powderAmount: 0.4, waterAmount: 120 }));
    const thick = evaluate(base({ powderAmount: 6, waterAmount: 20 }));
    expect(thin.total).toBeLessThan(70);
    expect(thick.total).toBeLessThan(70);
  });

  it("材料が不十分だと泡が良くても高得点にならない", () => {
    // 泡は満点級でも、極端に薄ければ泡の加点が無効化される。
    const s = evaluate(
      base({ powderAmount: 0.3, waterAmount: 120, foamQuality: 100, foamUniformity: 100 }),
    );
    expect(s.total).toBeLessThan(50);
  });

  it("大量にこぼすと減点される（丁寧さが下がる）", () => {
    const clean = evaluate(base({ spillAmount: 0 }));
    const messy = evaluate(base({ spillAmount: 80 }));
    expect(messy.total).toBeLessThan(clean.total);
    expect(messy.breakdown.carefulness).toBeLessThan(clean.breakdown.carefulness);
  });

  it("ほとんど点てていない（履歴なし）と丁寧さ・泡が低く、高得点にならない", () => {
    const s = evaluate(
      base({ foamAmount: 0, foamQuality: 0, foamUniformity: 0, whiskMovementHistory: [] }),
    );
    expect(s.breakdown.carefulness).toBe(0);
    expect(s.total).toBeLessThan(40); // 材料だけでは失敗域
  });

  it("各項目は配点上限を超えない", () => {
    const s = evaluate(base({ foamQuality: 100, foamUniformity: 100, spillAmount: 0 }));
    expect(s.breakdown.balance).toBeLessThanOrEqual(SCORE_WEIGHTS.balance);
    expect(s.breakdown.fineness).toBeLessThanOrEqual(SCORE_WEIGHTS.fineness);
    expect(s.breakdown.uniformity).toBeLessThanOrEqual(SCORE_WEIGHTS.uniformity);
    expect(s.breakdown.carefulness).toBeLessThanOrEqual(SCORE_WEIGHTS.carefulness);
  });

  it("tierFromScore の境界（0-39失敗/40-69成功/70-94大成功/95-100奇跡）", () => {
    expect(tierFromScore(0)).toBe("fail");
    expect(tierFromScore(39)).toBe("fail");
    expect(tierFromScore(40)).toBe("success");
    expect(tierFromScore(69)).toBe("success");
    expect(tierFromScore(70)).toBe("great");
    expect(tierFromScore(94)).toBe("great");
    expect(tierFromScore(95)).toBe("miracle");
    expect(tierFromScore(100)).toBe("miracle");
  });

  it("名称と点数を整合させる（名称段階＝採点段階）", () => {
    // 低得点では一級品/奇跡に差し替わらない。
    expect(reconcileResult(RESULTS.kiseki, "fail").id).not.toBe("kiseki");
    expect(reconcileResult(RESULTS.ikkyuu, "success").id).not.toBe("ikkyuu");
    // 代表名への差し替え。
    expect(reconcileResult(RESULTS.joudeki, "miracle").id).toBe("kiseki");
    expect(reconcileResult(RESULTS.ookinaAwa, "great").id).toBe("ikkyuu");
    // 段階が一致していれば味わいのある名称を維持。
    expect(reconcileResult(RESULTS.fuwafuwa, "success").id).toBe("fuwafuwa");
    expect(reconcileResult(RESULTS.powderOnly, "fail").id).toBe("powderOnly");
    // どの差し替え後も、名称段階＝採点段階。
    for (const tier of ["fail", "success", "great", "miracle"] as const) {
      expect(tierOf(reconcileResult(RESULTS.kiseki, tier).id)).toBe(tier);
    }
  });
});
