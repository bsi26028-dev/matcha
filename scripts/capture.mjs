/**
 * 泡立ちプリセットごとのスクリーンショットを保存する。
 *   node scripts/capture.mjs
 */
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync("shots", { recursive: true });

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--no-sandbox",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await sleep(1200);

  for (const lv of [0, 50, 100]) {
    await page.evaluate((l) => window.__maccha.setFoamLevel(l), lv);
    await sleep(700); // 表示の平滑化が落ち着くのを待つ
    await page.screenshot({ path: `shots/foam-${lv}.png` });
    console.log(`saved shots/foam-${lv}.png`);
  }
} finally {
  await browser.close();
}
