import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
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
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 820, deviceScaleFactor: 2 });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
  await sleep(900);
  await page.click("#btn-start").catch(() => {});
  await sleep(200);
  await page.evaluate((h) => window.__maccha.forceResult({
    matchaGrams: 2, waterMl: 70, foamAmount: 85, foamQuality: 82, foamUniformity: 80,
    spillAmount: 0, whiskSpeed: 0.5, whiskHistory: h,
  }), spiral());
  await sleep(3000); // 演出後にカードが出るまで待つ
  const txt = await page.$eval("#result-score", (el) => el.textContent).catch(() => "(none)");
  console.log("result-score =", txt);
  await page.screenshot({ path: "shots/score-card.png" });
  console.log("saved shots/score-card.png");
} finally {
  await browser.close();
}
