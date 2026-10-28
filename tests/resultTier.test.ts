import { describe, it, expect } from "vitest";
import { RESULTS } from "../src/game/ResultSystem";
import { RESULT_TIER, TIER_INFO, tierOf } from "../src/game/resultTiers";

const VALID_TIERS = ["fail", "success", "great", "miracle"] as const;

describe("演出段階（Tier）の対応", () => {
  it("20 種すべての結果に演出段階が割り当てられている", () => {
    for (const id of Object.keys(RESULTS)) {
      expect(RESULT_TIER[id]).toBeDefined();
      expect(VALID_TIERS).toContain(RESULT_TIER[id]);
    }
  });

  it("余分な（存在しない結果 ID の）マッピングが無い", () => {
    for (const id of Object.keys(RESULT_TIER)) {
      expect(RESULTS[id]).toBeDefined();
    }
  });

  it("4 段階すべてが少なくとも 1 つの結果に使われている", () => {
    const used = new Set(Object.values(RESULT_TIER));
    for (const t of VALID_TIERS) expect(used.has(t)).toBe(true);
  });

  it("各段階に演出名・時間・色がある", () => {
    for (const t of VALID_TIERS) {
      expect(TIER_INFO[t].title.length).toBeGreaterThan(0);
      expect(TIER_INFO[t].duration).toBeGreaterThan(0);
      expect(TIER_INFO[t].color).toMatch(/^#/);
    }
  });

  it("奇跡=miracle / 一級品=great / 上出来=success / 空っぽ=fail", () => {
    expect(tierOf("kiseki")).toBe("miracle");
    expect(tierOf("ikkyuu")).toBe("great");
    expect(tierOf("joudeki")).toBe("success");
    expect(tierOf("karappo")).toBe("fail");
    expect(tierOf("unknown-id")).toBe("fail"); // 未知は安全に fail
  });
});
