import { describe, it, expect } from "vitest";
import { classifyResult, RESULTS } from "../src/game/ResultSystem";
import type { PlayData, MovementSample } from "../src/game/ResultSystem";

/** 既定値（濃さ普通・泡そこそこ・飛沫なし・操作履歴なし）。 */
function base(overrides: Partial<PlayData> = {}): PlayData {
  return {
    powderAmount: 2,
    waterAmount: 70,
    foamAmount: 45,
    foamQuality: 50,
    foamUniformity: 55,
    spillAmount: 0,
    whiskSpeed: 0.4,
    whiskMovementHistory: [],
    ...overrides,
  };
}

/** 円を描く移動履歴（turns 周ぶん）。 */
function circleHistory(turns: number, radius = 0.5, perTurn = 36): MovementSample[] {
  const pts: MovementSample[] = [];
  const steps = turns * perTurn;
  for (let i = 0; i <= steps; i++) {
    const a = (i / perTurn) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius });
  }
  return pts;
}

/** 片側に寄った移動履歴。 */
function biasedHistory(): MovementSample[] {
  const pts: MovementSample[] = [];
  for (let i = 0; i < 40; i++) {
    pts.push({ x: 0.7 + (Math.random() - 0.5) * 0.1, z: (Math.random() - 0.5) * 0.1 });
  }
  return pts;
}

/** 広く覆う（渦巻き）移動履歴。 */
function spiralHistory(): MovementSample[] {
  const pts: MovementSample[] = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 0.1 + (i / 200) * 0.8;
    pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return pts;
}

describe("classifyResult：20 種類すべてに到達できる", () => {
  const cases: Array<[string, PlayData]> = [
    ["karappo", base({ powderAmount: 0, waterAmount: 0 })],
    ["oyuDake", base({ powderAmount: 0, waterAmount: 70 })],
    ["powderOnly", base({ powderAmount: 2, waterAmount: 0 })],
    ["afureta", base({ powderAmount: 2, waterAmount: 135 })],
    ["paste", base({ powderAmount: 3, waterAmount: 15 })],
    ["fuumi", base({ powderAmount: 0.3, waterAmount: 70 })],
    ["noukou", base({ powderAmount: 3.5, waterAmount: 60 })],
    ["usui", base({ powderAmount: 0.8, waterAmount: 70 })],
    ["hitokuchi", base({ powderAmount: 0.5, waterAmount: 18 })],
    ["tobichiri", base({ spillAmount: 55 })],
    ["awanashi", base({ foamAmount: 5 })],
    [
      "damadarake",
      base({ foamAmount: 40, foamQuality: 50, foamUniformity: 20 }),
    ],
    [
      "ookinaAwa",
      base({ foamAmount: 60, foamQuality: 25, foamUniformity: 60 }),
    ],
    [
      "katayori",
      base({
        foamAmount: 50,
        foamQuality: 50,
        foamUniformity: 50,
        whiskMovementHistory: biasedHistory(),
      }),
    ],
    [
      "guruguru",
      base({
        foamAmount: 55,
        foamQuality: 55,
        foamUniformity: 75,
        whiskMovementHistory: circleHistory(5),
      }),
    ],
    [
      "fuwafuwa",
      base({ foamAmount: 78, foamQuality: 60, foamUniformity: 50 }),
    ],
    ["shibumi", base({ powderAmount: 3, waterAmount: 70 })],
    ["joudeki", base({ foamAmount: 45, foamQuality: 50, foamUniformity: 55 })],
    [
      "ikkyuu",
      base({
        foamAmount: 70,
        foamQuality: 75,
        foamUniformity: 70,
        spillAmount: 5,
      }),
    ],
    [
      "kiseki",
      base({
        foamAmount: 92,
        foamQuality: 90,
        foamUniformity: 90,
        spillAmount: 0,
        whiskSpeed: 0.5,
        whiskMovementHistory: spiralHistory(),
      }),
    ],
  ];

  for (const [expectedId, data] of cases) {
    it(`${expectedId}（${RESULTS[expectedId].name}）に到達する`, () => {
      expect(classifyResult(data).id).toBe(expectedId);
    });
  }

  it("20 種類すべてが少なくとも一度は選ばれる（網羅）", () => {
    const reached = new Set(cases.map(([, d]) => classifyResult(d).id));
    expect(reached.size).toBe(20);
    for (const id of Object.keys(RESULTS)) {
      expect(reached.has(id)).toBe(true);
    }
  });
});

describe("classifyResult：安全性", () => {
  it("null / undefined でも落ちず、空っぽの茶碗になる", () => {
    expect(classifyResult(null).id).toBe("karappo");
    expect(classifyResult(undefined).id).toBe("karappo");
    expect(classifyResult({}).id).toBe("karappo");
  });

  it("NaN・負値・不正な履歴でも安全に処理する", () => {
    const bad = {
      powderAmount: Number.NaN,
      waterAmount: -5,
      foamAmount: Number.POSITIVE_INFINITY,
      foamQuality: -10,
      foamUniformity: Number.NaN,
      spillAmount: -1,
      whiskSpeed: Number.NaN,
      whiskMovementHistory: [
        { x: Number.NaN, z: 0 },
        { x: 0, z: Number.NaN },
        null,
        undefined,
      ],
    } as unknown as PlayData;
    const r = classifyResult(bad);
    expect(Object.keys(RESULTS)).toContain(r.id);
    expect(r.id).toBe("karappo"); // 材料が実質 0 として扱われる
  });

  it("すべての結果に ID・名称・コメント・表示パラメータがある", () => {
    for (const id of Object.keys(RESULTS)) {
      const r = RESULTS[id];
      expect(r.id).toBe(id);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.comment.length).toBeGreaterThan(0);
      expect(r.display).toBeTruthy();
      expect(typeof r.display.concentration).toBe("number");
    }
  });
});
