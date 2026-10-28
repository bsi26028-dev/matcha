import { CONFIG } from "../config";

/**
 * 完成結果システム。
 *
 * 100 点満点のスコアを廃止し、プレイデータ（材料量・泡・操作履歴）から
 * 「どんな抹茶ができたか」を 20 種類の結果のいずれか 1 つに判定する。
 *
 * - 判定は優先順位つきのルールで行い、必ず 1 つの結果が選ばれる。
 * - 不正な入力（NaN・負値・欠損）も安全に 0/空として扱う。
 * - 描画からは独立した純粋ロジック（Three.js 非依存）。
 */

/** 茶筅の移動履歴サンプル（ワールド XZ）。 */
export interface MovementSample {
  x: number;
  z: number;
}

/** 判定に使うプレイデータ。 */
export interface PlayData {
  /** 抹茶の量（g）。 */
  powderAmount: number;
  /** お湯の量（mL）。 */
  waterAmount: number;
  /** 泡の量（0〜100）。 */
  foamAmount: number;
  /** 泡の細かさ（0〜100）。 */
  foamQuality: number;
  /** 泡の均一さ（0〜100）。 */
  foamUniformity: number;
  /** 飛び散った量（0〜100）。 */
  spillAmount: number;
  /** 茶筅の代表速度（0〜1、点てた最大速度など）。 */
  whiskSpeed: number;
  /** 茶筅の移動履歴（XZ サンプル列）。 */
  whiskMovementHistory: MovementSample[];
}

/** 結果の表示パラメータ（3D 表示の目安）。 */
export interface ResultDisplay {
  /** 液の濃さ（0〜1）。 */
  concentration: number;
  /** 泡の量（0〜100）。 */
  foamAmount: number;
  /** 泡の細かさ（0〜100）。 */
  foamQuality: number;
  /** 泡の均一さ（0〜100）。 */
  foamUniformity: number;
  /** 液面を表示するか。 */
  liquidVisible: boolean;
  /** 抹茶の粉を表示するか。 */
  powderVisible: boolean;
}

/** 1 つの完成結果。 */
export interface MatchaResult {
  id: string;
  name: string;
  comment: string;
  display: ResultDisplay;
}

/** 20 種類の結果定義（一意の ID・名称・コメント・表示パラメータ）。 */
export const RESULTS: Record<string, MatchaResult> = {
  karappo: {
    id: "karappo",
    name: "空っぽの茶碗",
    comment: "まだ何も入っていません。抹茶とお湯を入れてみましょう。",
    display: { concentration: 0, foamAmount: 0, foamQuality: 0, foamUniformity: 0, liquidVisible: false, powderVisible: false },
  },
  oyuDake: {
    id: "oyuDake",
    name: "お湯だけ",
    comment: "お湯だけの一杯。抹茶を入れ忘れたようです。",
    display: { concentration: 0, foamAmount: 0, foamQuality: 0, foamUniformity: 0, liquidVisible: true, powderVisible: false },
  },
  powderOnly: {
    id: "powderOnly",
    name: "抹茶の粉だけ",
    comment: "粉のまま。お湯を注いで溶かしましょう。",
    display: { concentration: 1, foamAmount: 0, foamQuality: 0, foamUniformity: 0, liquidVisible: false, powderVisible: true },
  },
  afureta: {
    id: "afureta",
    name: "あふれた抹茶",
    comment: "お湯を注ぎすぎて茶碗からあふれそう。",
    display: { concentration: 0.3, foamAmount: 10, foamQuality: 20, foamUniformity: 30, liquidVisible: true, powderVisible: false },
  },
  paste: {
    id: "paste",
    name: "抹茶ペースト",
    comment: "お湯が足りず、どろりとしたペーストに。",
    display: { concentration: 1, foamAmount: 5, foamQuality: 10, foamUniformity: 20, liquidVisible: true, powderVisible: false },
  },
  fuumi: {
    id: "fuumi",
    name: "抹茶風味のお湯",
    comment: "抹茶が少なすぎて、ほんのり色づいたお湯です。",
    display: { concentration: 0.1, foamAmount: 5, foamQuality: 20, foamUniformity: 40, liquidVisible: true, powderVisible: false },
  },
  noukou: {
    id: "noukou",
    name: "濃厚すぎる抹茶",
    comment: "かなり濃いめ。苦みが強そうです。",
    display: { concentration: 0.9, foamAmount: 40, foamQuality: 50, foamUniformity: 50, liquidVisible: true, powderVisible: false },
  },
  usui: {
    id: "usui",
    name: "薄すぎる抹茶",
    comment: "お湯が多めで、少し物足りない薄さ。",
    display: { concentration: 0.25, foamAmount: 30, foamQuality: 40, foamUniformity: 50, liquidVisible: true, powderVisible: false },
  },
  hitokuchi: {
    id: "hitokuchi",
    name: "ひとくち抹茶",
    comment: "ほんの一口ぶん。少量でかわいらしい一服。",
    display: { concentration: 0.5, foamAmount: 30, foamQuality: 50, foamUniformity: 50, liquidVisible: true, powderVisible: false },
  },
  tobichiri: {
    id: "tobichiri",
    name: "飛び散り抹茶",
    comment: "勢いよく振りすぎて、まわりに飛び散ってしまいました。",
    display: { concentration: 0.5, foamAmount: 50, foamQuality: 40, foamUniformity: 40, liquidVisible: true, powderVisible: false },
  },
  awanashi: {
    id: "awanashi",
    name: "泡なし抹茶",
    comment: "ほとんど泡立っていません。もっと点ててみましょう。",
    display: { concentration: 0.5, foamAmount: 5, foamQuality: 20, foamUniformity: 40, liquidVisible: true, powderVisible: false },
  },
  damadarake: {
    id: "damadarake",
    name: "ダマだらけ抹茶",
    comment: "混ざりきらず、ダマが残ってしまいました。",
    display: { concentration: 0.6, foamAmount: 40, foamQuality: 45, foamUniformity: 20, liquidVisible: true, powderVisible: false },
  },
  ookinaAwa: {
    id: "ookinaAwa",
    name: "大きな泡だらけ",
    comment: "大きな泡ばかり。もっと細かく点てたいところ。",
    display: { concentration: 0.5, foamAmount: 60, foamQuality: 20, foamUniformity: 55, liquidVisible: true, powderVisible: false },
  },
  katayori: {
    id: "katayori",
    name: "片寄り抹茶",
    comment: "片側ばかり点てて、泡が寄ってしまいました。",
    display: { concentration: 0.5, foamAmount: 50, foamQuality: 50, foamUniformity: 35, liquidVisible: true, powderVisible: false },
  },
  guruguru: {
    id: "guruguru",
    name: "ぐるぐる抹茶",
    comment: "ぐるぐる円を描いた一服。泡はもう一歩。",
    display: { concentration: 0.5, foamAmount: 55, foamQuality: 55, foamUniformity: 60, liquidVisible: true, powderVisible: false },
  },
  fuwafuwa: {
    id: "fuwafuwa",
    name: "ふわふわ抹茶",
    comment: "ふんわりと泡立った、やさしい口当たり。",
    display: { concentration: 0.55, foamAmount: 80, foamQuality: 65, foamUniformity: 60, liquidVisible: true, powderVisible: false },
  },
  shibumi: {
    id: "shibumi",
    name: "渋みの一服",
    comment: "やや濃いめで渋み際立つ、通好みの一服。",
    display: { concentration: 0.75, foamAmount: 45, foamQuality: 55, foamUniformity: 55, liquidVisible: true, powderVisible: false },
  },
  joudeki: {
    id: "joudeki",
    name: "上出来な抹茶",
    comment: "バランスのよい、上出来の一服です。",
    display: { concentration: 0.5, foamAmount: 55, foamQuality: 60, foamUniformity: 60, liquidVisible: true, powderVisible: false },
  },
  ikkyuu: {
    id: "ikkyuu",
    name: "一級品の抹茶",
    comment: "きめ細かくなめらか。文句なしの一級品。",
    display: { concentration: 0.55, foamAmount: 75, foamQuality: 80, foamUniformity: 75, liquidVisible: true, powderVisible: false },
  },
  kiseki: {
    id: "kiseki",
    name: "奇跡の一服",
    comment: "材料・泡・所作、すべてが完璧。奇跡のような一服です。",
    display: { concentration: 0.55, foamAmount: 95, foamQuality: 95, foamUniformity: 95, liquidVisible: true, powderVisible: false },
  },
};

// --- 判定に使うしきい値（調整しやすいよう集約）---
const REF_RATIO =
  CONFIG.ingredients.matchaGrams / CONFIG.ingredients.waterMl; // 基準比 2/70
const THRESHOLDS = {
  powderNone: 0.05, // これ未満は抹茶なし
  waterNone: 1, // これ未満はお湯なし
  overflowWater: CONFIG.game.waterMaxMl * 0.95, // あふれる水量
  pasteConc: 3.0, // ペーストになる濃さ
  flavoredConc: 0.3, // 抹茶風味のお湯になる薄さ
  thickConc: 1.8, // 濃厚すぎる
  thinConc: 0.55, // 薄すぎる
  oneSipWater: 22, // ひとくちぶんの少量
  spillHigh: 40, // 飛び散り
  foamNone: 12, // 泡なし
  lumpyUniformity: 30, // ダマ
  coarseQuality: 30, // 大きな泡
  biasHigh: 0.5, // 片寄り
  circleTurns: 3, // ぐるぐる
};

/** 不正値を安全な非負数に丸める。 */
function num(v: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

interface Analysis {
  powder: number;
  water: number;
  foamAmount: number;
  foamQuality: number;
  foamUniformity: number;
  spill: number;
  whiskSpeed: number;
  concRel: number; // 基準比に対する濃さ（0=薄い〜）。お湯0なら Infinity 扱い。
  bias: number; // 中心からの寄り（0〜1 目安）
  turns: number; // 周回数
  coverage: number; // 操作範囲の広さ（0〜1）
}

/** プレイデータから判定用の指標を安全に計算する。 */
function analyze(data: Partial<PlayData> | null | undefined): Analysis {
  const d = data ?? {};
  const powder = num(d.powderAmount as number);
  const water = num(d.waterAmount as number);
  const foamAmount = clamp(num(d.foamAmount as number), 0, 100);
  const foamQuality = clamp(num(d.foamQuality as number), 0, 100);
  const foamUniformity = clamp(num(d.foamUniformity as number), 0, 100);
  const spill = clamp(num(d.spillAmount as number), 0, 100);
  const whiskSpeed = clamp(num(d.whiskSpeed as number), 0, 1);

  const history = Array.isArray(d.whiskMovementHistory)
    ? d.whiskMovementHistory.filter(
        (p): p is MovementSample =>
          !!p && Number.isFinite(p.x) && Number.isFinite(p.z),
      )
    : [];

  // 濃さ（基準比に対する相対値）
  let concRel: number;
  if (water < THRESHOLDS.waterNone) {
    concRel = powder >= THRESHOLDS.powderNone ? Infinity : 0;
  } else if (powder < THRESHOLDS.powderNone) {
    concRel = 0;
  } else {
    concRel = powder / water / REF_RATIO;
  }

  // 移動履歴から指標を計算
  const n = history.length;
  let bias = 0;
  let turns = 0;
  let coverage = 0;
  if (n > 0) {
    let cx = 0;
    let cz = 0;
    for (const p of history) {
      cx += p.x;
      cz += p.z;
    }
    cx /= n;
    cz /= n;
    bias = Math.min(1, Math.hypot(cx, cz) / CONFIG.operableRadius);

    // 周回数（原点まわりの角度変化の累積）
    let totalAngle = 0;
    const cells = new Set<string>();
    for (let i = 0; i < n; i++) {
      const p = history[i];
      cells.add(`${Math.round(p.x / 0.2)},${Math.round(p.z / 0.2)}`);
      if (i > 0) {
        const prev = history[i - 1];
        const a0 = Math.atan2(prev.z, prev.x);
        const a1 = Math.atan2(p.z, p.x);
        let da = a1 - a0;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        totalAngle += da;
      }
    }
    turns = Math.abs(totalAngle) / (Math.PI * 2);
    coverage = Math.min(1, cells.size / 24);
  }

  return {
    powder,
    water,
    foamAmount,
    foamQuality,
    foamUniformity,
    spill,
    whiskSpeed,
    concRel,
    bias,
    turns,
    coverage,
  };
}

/**
 * プレイデータから完成結果を 1 つ判定する。
 * 優先順位の高いルールから順に評価し、最初に一致したものを返す。
 * どれにも当てはまらない場合は「上出来な抹茶」を返す（必ず 1 つ選ばれる）。
 */
export function classifyResult(
  data: Partial<PlayData> | null | undefined,
): MatchaResult {
  const a = analyze(data);
  const t = THRESHOLDS;

  // --- 1. 材料の欠落（最優先）---
  const hasPowder = a.powder >= t.powderNone;
  const hasWater = a.water >= t.waterNone;
  if (!hasPowder && !hasWater) return RESULTS.karappo;
  if (hasPowder && !hasWater) return RESULTS.powderOnly;
  if (!hasPowder && hasWater) return RESULTS.oyuDake;

  // ここから、抹茶・お湯ともにある。

  // --- 2. 量・濃さの極端なケース ---
  if (a.water >= t.overflowWater) return RESULTS.afureta;
  if (a.concRel >= t.pasteConc) return RESULTS.paste;
  if (a.concRel <= t.flavoredConc) return RESULTS.fuumi;
  if (a.concRel >= t.thickConc) return RESULTS.noukou;
  if (a.concRel <= t.thinConc) return RESULTS.usui;
  if (a.water < t.oneSipWater) return RESULTS.hitokuchi;

  // ここから、濃さは普通〜ややの範囲（0.55〜1.8）、量も普通。

  // --- 3. 操作・泡の失敗ケース ---
  if (a.spill >= t.spillHigh) return RESULTS.tobichiri;
  if (a.foamAmount <= t.foamNone) return RESULTS.awanashi;
  if (
    a.foamUniformity <= t.lumpyUniformity &&
    a.foamQuality > t.coarseQuality &&
    a.foamAmount >= 20
  ) {
    return RESULTS.damadarake;
  }
  if (a.foamQuality <= t.coarseQuality && a.foamAmount >= 40) {
    return RESULTS.ookinaAwa;
  }
  if (a.bias >= t.biasHigh && a.foamUniformity < 70) return RESULTS.katayori;
  if (a.turns >= t.circleTurns && a.foamQuality < 65) return RESULTS.guruguru;

  // --- 4. 良い仕上がり（特別 → 一級 → ふわふわ → 渋み → 既定）---
  if (
    a.concRel >= 0.8 &&
    a.concRel <= 1.25 &&
    a.foamAmount >= 80 &&
    a.foamQuality >= 85 &&
    a.foamUniformity >= 85 &&
    a.spill <= 3 &&
    a.coverage >= 0.55 &&
    a.whiskSpeed >= 0.3
  ) {
    return RESULTS.kiseki;
  }
  if (
    a.concRel >= 0.7 &&
    a.concRel <= 1.4 &&
    a.foamQuality >= 70 &&
    a.foamUniformity >= 65 &&
    a.foamAmount >= 55 &&
    a.spill <= 15
  ) {
    return RESULTS.ikkyuu;
  }
  if (a.foamAmount >= 70 && a.foamQuality >= 55) return RESULTS.fuwafuwa;
  if (a.concRel >= 1.3) return RESULTS.shibumi;

  // --- 5. 既定（必ず 1 つ選ばれる）---
  return RESULTS.joudeki;
}
