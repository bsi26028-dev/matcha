import { ratioFactor, clamp, clamp01 } from "../sim/gameBalance";
import { RESULTS } from "./ResultSystem";
import type { MatchaResult, MovementSample } from "./ResultSystem";
import { tierOf } from "./resultTiers";
import type { Tier } from "./resultTiers";

/**
 * 100 点満点の採点（描画から独立した純粋ロジック）。
 *
 * 配点:
 *   - 抹茶とお湯のバランス: 35
 *   - 泡のきめ細かさ: 30
 *   - 泡の均一さ: 20
 *   - 点て方の丁寧さ: 15
 *
 * 基準値は抹茶 2g・お湯 70mL。材料の量だけでなく茶筅の動かし方も反映する。
 * 特殊制限: 材料欠落は 0 点、極端な薄さ/濃さは高得点にならない、
 * 大量にこぼすと減点、材料が不十分なら泡の数値だけで高得点にならない。
 */

export const SCORE_WEIGHTS = {
  balance: 35,
  fineness: 30,
  uniformity: 20,
  carefulness: 15,
} as const;

export interface ScoreInput {
  powderAmount: number;
  waterAmount: number;
  foamAmount: number;
  foamQuality: number;
  foamUniformity: number;
  spillAmount: number;
  whiskMovementHistory: MovementSample[];
}

export interface ScoreBreakdown {
  balance: number;
  fineness: number;
  uniformity: number;
  carefulness: number;
}

export interface ScoreResult {
  /** 合計（0〜100 の整数）。 */
  total: number;
  /** 各項目（0〜配点上限の整数、表示用）。 */
  breakdown: ScoreBreakdown;
  /** 合計から決まる演出段階。 */
  tier: Tier;
}

const EPS_POWDER = 0.05;
const EPS_WATER = 1;

function num(v: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** お湯量の適量さ（0〜1）。基準 70mL を中心に、少なすぎ/多すぎで下がる。 */
function volumeAdequacy(waterMl: number): number {
  const ideal = 70;
  const sigma = 38;
  const d = waterMl - ideal;
  return clamp01(Math.exp(-(d * d) / (2 * sigma * sigma)));
}

/** 茶筅の動かし方の指標（網羅度・操作量）。 */
function analyzeWhisk(history: MovementSample[]): {
  coverage: number;
  activity: number;
} {
  const pts = Array.isArray(history)
    ? history.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))
    : [];
  const n = pts.length;
  if (n === 0) return { coverage: 0, activity: 0 };
  const cells = new Set<string>();
  for (const p of pts) cells.add(`${Math.round(p.x / 0.2)},${Math.round(p.z / 0.2)}`);
  const coverage = Math.min(1, cells.size / 18);
  const activity = Math.min(1, n / 30);
  return { coverage, activity };
}

/** 合計点から演出段階を決める。 */
export function tierFromScore(total: number): Tier {
  if (total >= 95) return "miracle";
  if (total >= 70) return "great";
  if (total >= 40) return "success";
  return "fail";
}

/** 採点する。 */
export function evaluate(input: Partial<ScoreInput> | null | undefined): ScoreResult {
  const d = input ?? {};
  const powder = num(d.powderAmount as number);
  const water = num(d.waterAmount as number);
  const foamQuality = clamp(num(d.foamQuality as number), 0, 100);
  const foamUniformity = clamp(num(d.foamUniformity as number), 0, 100);
  const spill = clamp(num(d.spillAmount as number), 0, 100);
  const history = (d.whiskMovementHistory as MovementSample[]) ?? [];

  // --- 特殊制限: 材料欠落は 0 点 ---
  if (powder < EPS_POWDER || water < EPS_WATER) {
    return {
      total: 0,
      breakdown: { balance: 0, fineness: 0, uniformity: 0, carefulness: 0 },
      tier: "fail",
    };
  }

  // --- 材料バランス（比率 × 適量さ）---
  const rf = ratioFactor(powder, water); // 基準比 2/70 で 1、極端な薄/濃で小さい
  const va = volumeAdequacy(water);
  const balance = SCORE_WEIGHTS.balance * rf * va;

  // --- 泡（材料が整っていないと泡の数値だけでは加点されない）---
  // foamValidity: 抹茶が「本物の抹茶」と言える比率のときだけ泡が評価される。
  const foamValidity = clamp01(rf * 1.25);
  const fineness = SCORE_WEIGHTS.fineness * (foamQuality / 100) * foamValidity;
  const uniformity = SCORE_WEIGHTS.uniformity * (foamUniformity / 100) * foamValidity;

  // --- 丁寧さ（こぼさない × しっかり点てる）---
  const cleanliness = clamp01(1 - spill / 50); // こぼすほど下がる
  const { coverage, activity } = analyzeWhisk(history);
  const diligence = clamp01(0.5 * coverage + 0.5 * activity);
  const carefulness = SCORE_WEIGHTS.carefulness * cleanliness * diligence;

  const total = Math.round(
    clamp(balance + fineness + uniformity + carefulness, 0, 100),
  );

  const breakdown: ScoreBreakdown = {
    balance: Math.round(clamp(balance, 0, SCORE_WEIGHTS.balance)),
    fineness: Math.round(clamp(fineness, 0, SCORE_WEIGHTS.fineness)),
    uniformity: Math.round(clamp(uniformity, 0, SCORE_WEIGHTS.uniformity)),
    carefulness: Math.round(clamp(carefulness, 0, SCORE_WEIGHTS.carefulness)),
  };

  return { total, breakdown, tier: tierFromScore(total) };
}

/** 段階ごとの代表的な結果（名称と点数を矛盾させないための差し替え先）。 */
const REPRESENTATIVE: Record<Tier, string> = {
  miracle: "kiseki", // 奇跡の一服
  great: "ikkyuu", // 一級品の抹茶
  success: "joudeki", // 上出来な抹茶
  fail: "awanashi", // 泡なし抹茶（失敗の代表）
};

/**
 * 判定した結果名を、採点の段階と矛盾しないよう調整する。
 * - 名称の段階が採点段階と一致していれば、その 20 種の名称（＝味わい）を維持。
 * - 一致しなければ、採点段階の代表名に差し替える。
 *   （例: 一級品/奇跡はスコアが高いときだけ、粉だけ/お湯だけは 0 点＝失敗のまま）
 */
export function reconcileResult(result: MatchaResult, tier: Tier): MatchaResult {
  if (tierOf(result.id) === tier) return result;
  return RESULTS[REPRESENTATIVE[tier]] ?? result;
}
