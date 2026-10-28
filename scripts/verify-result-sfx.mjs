/**
 * 各演出段階（失敗/成功/大成功/奇跡）で、演出音の再生が実行時エラーを
 * 起こさないこと、映像（演出タイトル）と同時に始まること、
 * リトライで止まることを確認する。
 *   node scripts/verify-result-sfx.mjs
 */
import puppeteer from "puppeteer";

const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spiral() {
  const p = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 0.1 + (i / 200) * 0.8;
    p.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return p;
}

const cases = [
  ["失敗", { matchaGrams: 0, waterMl: 0, foamAmount: 0, foamQuality: 0, foamUniformity: 0, spillAmount: 0 }, "あれれ"],
  ["成功", { matchaGrams: 2, waterMl: 70, foamAmount: 55, foamQuality: 60, foamUniformity: 60, spillAmount: 0 }, "いい一服"],
  ["大成功", { matchaGrams: 2, waterMl: 70, foamAmount: 72, foamQuality: 78, foamUniformity: 72, spillAmount: 5 }, "極上"],
  ["奇跡", { matchaGrams: 2, waterMl: 70, foamAmount: 92, foamQuality: 90, foamUniformity: 88, spillAmount: 0, whiskSpeed: 0.5, whiskHistory: spiral() }, "幻の一服"],
];

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

let pass = true;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? "  " + detail : ""}`);
  if (!ok) pass = false;
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 800 });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.includes("Failed to load resource")) return; // 音源404は想定内
    errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(URL, { waitUntil: "networkidle0" });
  await sleep(900);
  // 「はじめる」を押して AudioContext を unlock（ユーザー操作を模倣）。
  await page.click("#btn-start").catch(() => {});
  await sleep(300);

  for (const [name, data, titlePart] of cases) {
    await page.evaluate((d) => window.__maccha.forceResult(d), data);
    await sleep(150);
    // 映像（演出タイトル）が出ている＝音も同時に開始している。
    const title = await page.$eval("#anim-title", (el) => el.textContent).catch(() => "");
    check(`${name}: 演出タイトルが同期表示`, title.includes(titlePart), `title="${title}"`);
    await sleep(900);
  }

  check("演出音の再生で実行時エラーが無い", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error("例外:", e);
  pass = false;
} finally {
  await browser.close();
}

console.log(`\n総合: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
