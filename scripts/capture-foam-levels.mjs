/**
 * 泡立ち 0/25/50/75/100% の見た目を比較撮影する（新しい泡の色の確認）。
 *   node scripts/capture-foam-levels.mjs
 * dev サーバー（http://localhost:5173）が必要。
 */
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots", { recursive: true });

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});

try {
  for (const lv of [0, 25, 50, 75, 100]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0" });
    await sleep(900);
    // 基準の抹茶・お湯で、泡立ちだけを lv% にして表示。
    await page.evaluate((amount) => {
      window.__maccha.forceResult({
        matchaGrams: 2,
        waterMl: 70,
        foamAmount: amount,
        foamQuality: amount,
        foamUniformity: amount,
        spillAmount: 0,
        whiskSpeed: 0.5,
      });
    }, lv);
    await sleep(1100);
    await page.screenshot({ path: `shots/foamcolor-${lv}.png` });
    console.log(`saved shots/foamcolor-${lv}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
