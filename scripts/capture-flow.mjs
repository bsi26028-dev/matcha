/**
 * タイトル・点てる・結果画面のスクリーンショットを保存する。
 *   node scripts/capture-flow.mjs
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

async function center(page) {
  return page.evaluate(() => {
    const r = document.querySelector("canvas").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 740, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await sleep(1200);

  await page.screenshot({ path: "shots/flow-title.png" });
  console.log("saved shots/flow-title.png");

  await page.click("#btn-start");
  await sleep(200);
  // 抹茶
  let c = await center(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await sleep(1500);
  await page.mouse.up();
  await page.click("#btn-action");
  await sleep(200);
  // お湯
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await sleep(1400);
  await page.mouse.up();
  await page.click("#btn-action");
  await sleep(200);
  // 点てる
  const radius = Math.min(c.w, c.h) * 0.16;
  await page.mouse.move(c.x + radius, c.y);
  await page.mouse.down();
  for (let i = 0; i <= 6 * 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    await page.mouse.move(c.x + Math.cos(a) * radius, c.y + Math.sin(a) * radius);
    await sleep(10);
  }
  await page.mouse.up();
  await sleep(300);
  await page.screenshot({ path: "shots/flow-whisk.png" });
  console.log("saved shots/flow-whisk.png");

  await page.click("#btn-action"); // 完成
  await sleep(400);
  await page.screenshot({ path: "shots/flow-result.png" });
  console.log("saved shots/flow-result.png");
} finally {
  await browser.close();
}
