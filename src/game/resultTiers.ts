/**
 * 演出段階（tier）の定義と、結果 ID → 演出段階のマッピング。
 *
 * 「結果の種類」（ResultSystem の 20 種）と「演出段階」（4 段階）を
 * 別々のデータとして管理するためのファイル。Three.js / GSAP には依存しない。
 *
 * 同じ演出段階でも、表示するコメントは結果ごと（ResultSystem.comment）に異なる。
 */

export type Tier = "fail" | "success" | "great" | "miracle";

export interface TierInfo {
  /** 演出名（画面に大きく出すタイトル）。 */
  title: string;
  /** 演出時間の目安（秒）。結果カードを出すまでの長さに使う。 */
  duration: number;
  /** タイトルの色。 */
  color: string;
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  fail: { title: "あれれ……？", duration: 2.6, color: "#9a7b3f" },
  success: { title: "いい一服！", duration: 3.0, color: "#3f6b1f" },
  great: { title: "極上の一服！", duration: 4.5, color: "#b8860b" },
  miracle: { title: "幻の一服", duration: 5.6, color: "#c9a227" },
};

/**
 * 結果 ID → 演出段階。
 * ResultSystem の全 20 種を必ず網羅する（resultTiers.test.ts で検証）。
 */
export const RESULT_TIER: Record<string, Tier> = {
  // 奇跡
  kiseki: "miracle",
  // 大成功
  ikkyuu: "great",
  // 成功
  joudeki: "success",
  fuwafuwa: "success",
  shibumi: "success",
  hitokuchi: "success",
  // 失敗（ユーモラスに見せる）
  karappo: "fail",
  oyuDake: "fail",
  powderOnly: "fail",
  afureta: "fail",
  paste: "fail",
  fuumi: "fail",
  noukou: "fail",
  usui: "fail",
  tobichiri: "fail",
  awanashi: "fail",
  damadarake: "fail",
  ookinaAwa: "fail",
  katayori: "fail",
  guruguru: "fail",
};

/** 結果 ID から演出段階を安全に得る（未知 ID は fail）。 */
export function tierOf(resultId: string): Tier {
  return RESULT_TIER[resultId] ?? "fail";
}
