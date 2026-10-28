/**
 * 右上の音量 UI（アイコン・スライダー・ミュート）と localStorage 保存を確認する。
 *   node scripts/verify-volume-ui.mjs
 */
import puppeteer from "puppeteer";
const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
let pass = true;
const check = (n, ok, d = "") => { console.log(`${ok ? "OK " : "NG "} ${n}${d ? "  " + d : ""}`); if (!ok) pass = false; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 740 });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await sleep(900);

  check("音量アイコンが存在する", !!(await page.$("#btn-volume")));

  // 初期音量 70%
  await page.click("#btn-volume");
  await sleep(100);
  const initial = await page.$eval("#slider-sfx", (el) => el.value).catch(() => null);
  check("初期スライダーが 70", initial === "70", `value=${initial}`);

  // スライダーを 40 に変更 → localStorage に保存
  await page.$eval("#slider-sfx", (el) => {
    el.value = "40";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(100);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("maccha.audio") || "{}"));
  check("効果音音量が保存される(0.4)", Math.abs((saved.sfxVolume ?? -1) - 0.4) < 1e-6, JSON.stringify(saved));

  // ミュート ON → 保存
  await page.click("#btn-mute");
  await sleep(100);
  const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem("maccha.audio") || "{}"));
  check("ミュートが保存される(true)", saved2.muted === true, JSON.stringify(saved2));

  // リロードで復元
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("maccha.audio") || "{}"));
  check("リロード後も設定が残る", restored.muted === true && Math.abs(restored.sfxVolume - 0.4) < 1e-6, JSON.stringify(restored));

  // BGM キーが無い
  check("BGM 音量設定が存在しない", restored.bgmVolume === undefined && restored.ambientVolume === undefined);
} catch (e) {
  console.error("例外:", e);
  pass = false;
} finally {
  await browser.close();
}
console.log(`\n総合: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
