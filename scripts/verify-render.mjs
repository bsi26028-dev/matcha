/**
 * ヘッドレスブラウザ（Puppeteer）で実際に描画・操作を検証する。
 *   node scripts/verify-render.mjs
 *
 * 確認内容:
 *   1. シェーダのコンパイルや実行時エラーが出ないこと（console/pageerror を収集）
 *   2. 茶筅をドラッグ（円を描く）すると泡が増えること
 *   3. 操作をやめると泡の増加が止まる（速度が 0 に戻る）こと
 *   4. 泡立ちデバッグプリセット 0/25/50/75/100% が反映されること
 *
 * 事前に dev サーバー（http://localhost:5173）が起動している必要がある。
 */
import puppeteer from "puppeteer";

const URL = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const errors = [];
let pass = true;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? "  " + detail : ""}`);
  if (!ok) pass = false;
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700 });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // favicon などリソースの 404 は検証対象外。
    if (text.includes("Failed to load resource")) return;
    errors.push("console: " + text);
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "networkidle0" });
  await sleep(1200); // 初期描画 + シェーダコンパイル待ち

  // フック存在確認
  const hasHook = await page.evaluate(() => !!window.__maccha);
  check("デバッグフックが存在する", hasHook);

  // --- 操作前の泡量 ---
  const before = await page.evaluate(() => window.__maccha.getFoam().foamAmount);

  // --- 茶筅を円を描くようにドラッグ（pointer events を発火）---
  const box = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radius = Math.min(box.w, box.h) * 0.18;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  const turns = 4;
  const stepsPerTurn = 36;
  for (let i = 0; i <= turns * stepsPerTurn; i++) {
    const a = (i / stepsPerTurn) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    await sleep(8);
  }
  await page.mouse.up();

  const afterStir = await page.evaluate(() => ({
    foam: window.__maccha.getFoam(),
    speed: window.__maccha.getSpeed(),
  }));
  check(
    "ドラッグで泡が増える",
    afterStir.foam.foamAmount > before + 1,
    `before=${before.toFixed(1)} after=${afterStir.foam.foamAmount.toFixed(1)}`,
  );
  check(
    "操作中は速度>0 だった → 細かさ/均一さも増加",
    afterStir.foam.foamQuality > 0 && afterStir.foam.foamUniformity > 0,
    `q=${afterStir.foam.foamQuality.toFixed(1)} u=${afterStir.foam.foamUniformity.toFixed(1)}`,
  );

  // --- 操作停止後、速度が 0 に戻る ---
  await sleep(900);
  const stopped = await page.evaluate(() => window.__maccha.getSpeed());
  check("操作停止で速度が 0 に戻る", stopped < 0.02, `speed=${stopped.toFixed(4)}`);

  // --- デバッグプリセットの反映 ---
  const levels = [0, 25, 50, 75, 100];
  const read = [];
  for (const lv of levels) {
    await page.evaluate((l) => window.__maccha.setFoamLevel(l), lv);
    await sleep(60);
    const amt = await page.evaluate(() => window.__maccha.getFoam().foamAmount);
    read.push(amt);
  }
  check(
    "プリセット 0/25/50/75/100% が反映される",
    JSON.stringify(read) === JSON.stringify(levels),
    `read=${JSON.stringify(read)}`,
  );
  // Live へ戻す
  await page.evaluate(() => window.__maccha.setFoamLevel(null));

  // --- 実行時エラー ---
  check(
    "シェーダ/実行時エラーが無い",
    errors.length === 0,
    errors.length ? "\n   " + errors.join("\n   ") : "",
  );
} catch (e) {
  console.error("検証中に例外:", e);
  pass = false;
} finally {
  await browser.close();
}

console.log(`\n総合: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
