/**
 * 代表的な結果ごとに、結果画面の 3D 表示が変化することを確認する。
 *   node scripts/capture-results.mjs
 * dev サーバー（http://localhost:5173）が必要。
 * 検証用フック window.__maccha.forceResult を使って状態をセットし、実描画を撮影する。
 */
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots", { recursive: true });

function biasedHistory() {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push({ x: 0.7, z: 0 });
  return pts;
}
function spiralHistory() {
  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 0.1 + (i / 200) * 0.8;
    pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return pts;
}

const states = [
  ["ikkyuu", { matchaGrams: 2, waterMl: 70, foamAmount: 92, foamQuality: 90, foamUniformity: 88, spillAmount: 0, whiskSpeed: 0.5, whiskHistory: spiralHistory() }],
  ["noukou", { matchaGrams: 3.5, waterMl: 60, foamAmount: 40, foamQuality: 50, foamUniformity: 50, spillAmount: 0 }],
  ["usui", { matchaGrams: 0.8, waterMl: 70, foamAmount: 25, foamQuality: 40, foamUniformity: 50, spillAmount: 0 }],
  ["oyuDake", { matchaGrams: 0, waterMl: 70, foamAmount: 0, foamQuality: 0, foamUniformity: 0, spillAmount: 0 }],
  ["powderOnly", { matchaGrams: 2.5, waterMl: 0, foamAmount: 0, foamQuality: 0, foamUniformity: 0, spillAmount: 0 }],
  ["karappo", { matchaGrams: 0, waterMl: 0, foamAmount: 0, foamQuality: 0, foamUniformity: 0, spillAmount: 0 }],
  ["tobichiri", { matchaGrams: 2, waterMl: 70, foamAmount: 50, foamQuality: 45, foamUniformity: 45, spillAmount: 70 }],
  ["katayori", { matchaGrams: 2, waterMl: 70, foamAmount: 60, foamQuality: 50, foamUniformity: 40, spillAmount: 0, whiskHistory: biasedHistory() }],
];

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 820, deviceScaleFactor: 2 });

  for (const [name, d] of states) {
    await page.goto(URL, { waitUntil: "networkidle0" });
    await sleep(900);
    await page.evaluate((data) => window.__maccha.forceResult(data), d);
    await sleep(1100); // 泡の表示が目標へ収束するのを待つ
    const id = await page.evaluate(() => window.__maccha.getDebug().result?.id);
    await page.screenshot({ path: `shots/result-${name}.png` });
    console.log(`saved shots/result-${name}.png  -> result id=${id}`);
  }
} finally {
  await browser.close();
}
