import { CONFIG } from "../config";
import { clamp, clamp01 } from "./gameBalance";

/**
 * お湯の量（mL）から液面の高さ（Y 座標）を求める。
 * 基準量（CONFIG.ingredients.waterMl）で CONFIG.bowl.liquidSurfaceY になる。
 */
export function waterToSurfaceY(waterMl: number): number {
  const base = CONFIG.bowl.liquidSurfaceY;
  const delta = (waterMl - CONFIG.ingredients.waterMl) * CONFIG.liquid.waterHeightPerMl;
  return clamp(base + delta, 0.12, CONFIG.bowl.rimY - 0.1);
}

/**
 * 抹茶とお湯から濃度（0〜1）を求める。色の濃淡に使う。
 * 基準比（2g / 70mL）でおよそ 0.5 となり、濃いほど 1 に近づく。
 */
export function matchaConcentration(matchaGrams: number, waterMl: number): number {
  if (waterMl <= 0) return 1;
  const ratio = matchaGrams / waterMl;
  const refRatio = CONFIG.ingredients.matchaGrams / CONFIG.ingredients.waterMl;
  return clamp01(0.5 * (ratio / refRatio));
}
