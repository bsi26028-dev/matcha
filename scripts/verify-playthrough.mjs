/**
 * タイトル→抹茶→お湯→点てる→採点→リトライ、を実際に操作して通しプレイする検証。
 *   node scripts/verify-playthrough.mjs
 * 事前に dev サーバー（http://localhost:5173）が必要。
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

const getDebug = (page) => page.evaluate(() => window.__maccha.getDebug());

async function bowlCenter(page) {
  const box = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
  return box;
}

/** 茶碗の中央付近を一定時間押し続ける（抹茶/お湯を入れる）。 */
async function pressHold(page, ms) {
  const c = await bowlCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await sleep(ms);
  await page.mouse.up();
}

/** 円を描くようにドラッグする（点てる）。 */
async function stir(page, turns, ms) {
  const c = await bowlCenter(page);
  const radius = Math.min(c.w, c.h) * 0.16;
  await page.mouse.move(c.x + radius, c.y);
  await page.mouse.down();
  const steps = turns * 36;
  for (let i = 0; i <= steps; i++) {
    const a = (i / 36) * Math.PI * 2;
    await page.mouse.move(c.x + Math.cos(a) * radius, c.y + Math.sin(a) * radius);
    await sleep(ms / steps);
  }
  await page.mouse.up();
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 740 });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.includes("Failed to load resource")) return;
    errors.push("console: " + t);
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "networkidle0" });
  await sleep(1200);

  // タイトル
  check("タイトルで phase=title", (await getDebug(page)).phase === "title");
  await page.click("#btn-start");
  await sleep(200);
  check("はじめるで phase=matcha", (await getDebug(page)).phase === "matcha");

  // 抹茶を入れる
  await pressHold(page, 1500);
  let d = await getDebug(page);
  check("茶杓で抹茶が増える", d.materials.matchaGrams > 0.5, `matcha=${d.materials.matchaGrams.toFixed(2)}g`);
  await page.click("#btn-action");
  await sleep(200);
  check("次へで phase=water", (await getDebug(page)).phase === "water");

  // お湯を注ぐ
  await pressHold(page, 1300);
  d = await getDebug(page);
  check("やかんでお湯が増える", d.materials.waterMl > 20, `water=${d.materials.waterMl.toFixed(1)}mL`);
  check("材料が遷移をまたいで保持されている", d.materials.matchaGrams > 0.5);
  await page.click("#btn-action");
  await sleep(200);
  check("次へで phase=whisk", (await getDebug(page)).phase === "whisk");

  // 点てる
  await stir(page, 5, 2200);
  d = await getDebug(page);
  check("茶筅で泡が増える", d.foam.foamAmount > 1, `foam=${d.foam.foamAmount.toFixed(1)}`);

  // 完成 → 演出 → 結果
  await page.click("#btn-action");
  await sleep(300);
  d = await getDebug(page);
  check("完成で phase=result", d.phase === "result");
  check(
    "完成結果の名称が出る",
    !!d.result && typeof d.result.name === "string" && d.result.name.length > 0,
    d.result ? `result=${d.result.id} (${d.result.name})` : "result=null",
  );
  // 演出タイトルが表示される
  const animTitle = await page
    .$eval("#anim-title", (el) => el.textContent)
    .catch(() => "");
  check("演出タイトルが表示される", animTitle.length > 0, `title="${animTitle}"`);
  // 演出の後、完成カードが表示される（出るまで待つ）
  await page.waitForSelector("#result-name", { timeout: 9000 });
  const resultName = await page.$eval("#result-name", (el) => el.textContent).catch(() => "");
  const resultComment = await page.$eval("#result-comment", (el) => el.textContent).catch(() => "");
  const resultScore = await page.$eval("#result-score", (el) => el.textContent).catch(() => "");
  check("結果画面に名称が表示される", resultName.length > 0, `name="${resultName}"`);
  check("結果画面にコメントが表示される", resultComment.length > 0);
  check("結果画面に100点満点スコアが表示される", /\d+\s*点/.test(resultScore), `score="${resultScore}"`);
  check(
    "スコアが0〜100の整数で、名称段階と整合",
    !!d.score && Number.isInteger(d.score.total) && d.score.total >= 0 && d.score.total <= 100,
    d.score ? `total=${d.score.total} tier=${d.score.tier}` : "score=null",
  );

  // リトライ → 初期化
  await page.click("#btn-retry");
  await sleep(300);
  d = await getDebug(page);
  check("リトライで phase=title", d.phase === "title");
  check("リトライで材料が初期化", d.materials.matchaGrams === 0 && d.materials.waterMl === 0);
  check("リトライで泡が初期化", d.foam.foamAmount === 0);
  check("リトライで結果がクリアされる", d.result === null);
  check("リトライでスコアがクリアされる", d.score === null);

  check("重大な実行時エラーが無い", errors.length === 0, errors.length ? "\n   " + errors.join("\n   ") : "");
} catch (e) {
  console.error("検証中に例外:", e);
  pass = false;
} finally {
  await browser.close();
}

console.log(`\n総合: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
