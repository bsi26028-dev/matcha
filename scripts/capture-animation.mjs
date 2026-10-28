/**
 * 各演出段階の途中フレームを撮影する（タイトル・ズーム・金粒子の確認）。
 *   node scripts/capture-animation.mjs
 */
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots", { recursive: true });

function spiral() {
  const p = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 0.1 + (i / 200) * 0.8;
    p.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return p;
}

const states = [
  ["fail", { matchaGrams: 0, waterMl: 0, foamAmount: 0, foamQuality: 0, foamUniformity: 0, spillAmount: 0 }, 1200],
  ["success", { matchaGrams: 2, waterMl: 70, foamAmount: 55, foamQuality: 60, foamUniformity: 60, spillAmount: 0 }, 1300],
  ["great", { matchaGrams: 2, waterMl: 70, foamAmount: 72, foamQuality: 78, foamUniformity: 72, spillAmount: 5 }, 1700],
  ["miracle", { matchaGrams: 2, waterMl: 70, foamAmount: 92, foamQuality: 90, foamUniformity: 88, spillAmount: 0, whiskSpeed: 0.5, whiskHistory: spiral() }, 2200],
];

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
try {
  for (const [name, d, waitMs] of states) {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0" });
    await sleep(900);
    await page.evaluate((data) => window.__maccha.forceResult(data), d);
    await sleep(waitMs); // 演出の途中で撮影
    await page.screenshot({ path: `shots/anim-${name}.png` });
    console.log(`saved shots/anim-${name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
