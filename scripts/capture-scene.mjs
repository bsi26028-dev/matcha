/**
 * PC / スマホの画面サイズで初期シーンのスクリーンショットを保存する。
 *   node scripts/capture-scene.mjs
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
  const sizes = [
    { name: "pc", width: 1280, height: 720 },
    { name: "mobile", width: 390, height: 844 },
  ];
  for (const s of sizes) {
    const page = await browser.newPage();
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0" });
    await sleep(1200);
    await page.screenshot({ path: `shots/scene-${s.name}.png` });
    console.log(`saved shots/scene-${s.name}.png (${s.width}x${s.height})`);
    await page.close();
  }
} finally {
  await browser.close();
}
