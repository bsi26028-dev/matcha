import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots", { recursive: true });
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
  await sleep(900);
  await page.evaluate(() =>
    window.__maccha.forceResult({ matchaGrams: 2, waterMl: 70, foamAmount: 85, foamQuality: 80, foamUniformity: 78, spillAmount: 0, whiskSpeed: 0.5 }),
  );
  await sleep(1100);
  await page.screenshot({ path: "shots/result-mobile.png" });
  console.log("saved shots/result-mobile.png");
} finally {
  await browser.close();
}
