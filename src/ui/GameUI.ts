import type { MatchaResult } from "../game/ResultSystem";
import type { ScoreResult } from "../game/ScoreSystem";

/**
 * ゲームの画面 UI（DOM オーバーレイ）。
 * タイトル / 各フェーズの指示＋アクションボタン / 結果画面を管理する。
 *
 * canvas の上に重ねるが、ルートは pointer-events:none にして
 * 3D 操作を邪魔しない。ボタンなど操作要素だけ pointer-events:auto にする。
 */
export class GameUI {
  private readonly root: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly animTitle: HTMLDivElement;
  private titleScreen: HTMLDivElement | null = null;
  private resultScreen: HTMLDivElement | null = null;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:5",
      "pointer-events:none",
      "font-family:system-ui,'Hiragino Kaku Gothic ProN',sans-serif",
    ].join(";");
    parent.appendChild(this.root);

    // 上部の指示バナー
    this.banner = document.createElement("div");
    this.banner.style.cssText = [
      "position:absolute",
      "top:18px",
      "left:50%",
      "transform:translateX(-50%)",
      "max-width:86vw",
      "text-align:center",
      "color:#4a3f2c",
      "background:rgba(255,255,255,0.78)",
      "padding:10px 18px",
      "border-radius:999px",
      "font-size:15px",
      "font-weight:600",
      "box-shadow:0 2px 8px rgba(0,0,0,0.08)",
      "display:none",
    ].join(";");
    this.root.appendChild(this.banner);

    // 下部のアクションボタン（次へ / 完成）
    this.actionBtn = document.createElement("button");
    this.actionBtn.id = "btn-action";
    this.actionBtn.style.cssText = [
      "position:absolute",
      "bottom:28px",
      "left:50%",
      "transform:translateX(-50%)",
      "pointer-events:auto",
      "cursor:pointer",
      "border:none",
      "border-radius:999px",
      "padding:14px 36px",
      "font-size:16px",
      "font-weight:700",
      "color:#fff",
      "background:#5a8f2f",
      "box-shadow:0 4px 12px rgba(0,0,0,0.18)",
      "display:none",
    ].join(";");
    this.root.appendChild(this.actionBtn);

    // 演出タイトル（画面中央やや上に大きく出す）。
    this.animTitle = document.createElement("div");
    this.animTitle.id = "anim-title";
    this.animTitle.style.cssText = [
      "position:absolute",
      "top:18%",
      "left:50%",
      "transform:translate(-50%,-50%) scale(0.9)",
      "text-align:center",
      "font-size:40px",
      "font-weight:800",
      "letter-spacing:0.06em",
      "color:#3f6b1f",
      "text-shadow:0 2px 10px rgba(255,255,255,0.6)",
      "pointer-events:none",
      "opacity:0",
      "transition:opacity 0.4s ease, transform 0.4s ease",
      "white-space:nowrap",
    ].join(";");
    this.root.appendChild(this.animTitle);
  }

  /** 演出タイトルを表示（フェードイン）。 */
  showAnimationTitle(text: string, color: string): void {
    this.animTitle.textContent = text;
    this.animTitle.style.color = color;
    requestAnimationFrame(() => {
      this.animTitle.style.opacity = "1";
      this.animTitle.style.transform = "translate(-50%,-50%) scale(1)";
    });
  }

  /** 演出タイトルを隠す（フェードアウト）。 */
  hideAnimationTitle(): void {
    this.animTitle.style.opacity = "0";
    this.animTitle.style.transform = "translate(-50%,-50%) scale(0.9)";
  }

  /** タイトル画面を表示。 */
  showTitle(onStart: () => void): void {
    this.clearTitle();
    const screen = document.createElement("div");
    screen.style.cssText = overlayCss("rgba(243,239,230,0.72)");
    screen.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:44px;font-weight:800;color:#3f6b1f;letter-spacing:0.08em;">抹茶日和</div>
        <div style="font-size:15px;color:#6b5e45;margin:10px 0 28px;">茶杓・やかん・茶筅で一服点てましょう</div>
      </div>`;
    const btn = document.createElement("button");
    btn.id = "btn-start";
    btn.textContent = "はじめる";
    btn.style.cssText = primaryBtnCss();
    btn.addEventListener("click", onStart);
    const inner = screen.firstElementChild as HTMLElement;
    inner.appendChild(btn);
    this.root.appendChild(screen);
    this.titleScreen = screen;
  }

  /** 指示バナーを表示。 */
  setBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.style.display = text ? "block" : "none";
  }

  /** アクションボタンを表示。 */
  showAction(label: string, onClick: () => void): void {
    this.actionBtn.textContent = label;
    this.actionBtn.style.display = "block";
    this.actionBtn.onclick = onClick;
  }

  hideAction(): void {
    this.actionBtn.style.display = "none";
    this.actionBtn.onclick = null;
  }

  /**
   * 結果画面を表示。
   * スコア・星・ランクゲージは出さず、茶碗（3D）を隠さない下部パネルに
   * 完成した抹茶の「名称」「コメント」「使用量」と再挑戦ボタンを置く。
   */
  showResult(
    result: MatchaResult,
    score: ScoreResult,
    usage: { matchaGrams: number; waterMl: number },
    onRetry: () => void,
  ): void {
    this.clearResult();
    const screen = document.createElement("div");
    // 画面下部に寄せる。茶碗が見えるよう全面は覆わない。
    screen.style.cssText = [
      "position:absolute",
      "left:0",
      "right:0",
      "bottom:0",
      "display:flex",
      "justify-content:center",
      "padding:0 16px calc(env(safe-area-inset-bottom, 0px) + 20px)",
      "pointer-events:none",
    ].join(";");

    const b = score.breakdown;
    const row = (label: string, v: number, max: number) =>
      `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;color:#6b5e45;">
        <span>${label}</span><span>${v} / ${max}</span>
      </div>`;

    screen.innerHTML = `
      <div style="pointer-events:auto;width:min(92vw,460px);background:rgba(255,255,255,0.93);
        border-radius:18px;padding:18px 24px;box-shadow:0 8px 30px rgba(0,0,0,0.18);
        text-align:center;backdrop-filter:blur(3px);">
        <div style="font-size:13px;font-weight:700;color:#8a7a55;letter-spacing:0.14em;margin-bottom:4px;">できあがり</div>
        <div id="result-name" style="font-size:26px;font-weight:800;color:#3f6b1f;line-height:1.2;margin-bottom:6px;">${escapeHtml(result.name)}</div>
        <div id="result-score" style="font-size:40px;font-weight:800;color:#2f7d32;line-height:1.1;margin-bottom:8px;">${score.total}<span style="font-size:16px;color:#8a7a55;"> 点</span></div>
        <div style="max-width:260px;margin:0 auto 12px;display:flex;flex-direction:column;gap:3px;">
          ${row("抹茶とお湯のバランス", b.balance, 35)}
          ${row("泡のきめ細かさ", b.fineness, 30)}
          ${row("泡の均一さ", b.uniformity, 20)}
          ${row("点て方の丁寧さ", b.carefulness, 15)}
        </div>
        <div id="result-comment" style="font-size:13px;color:#5a4f3a;line-height:1.6;margin-bottom:8px;">${escapeHtml(result.comment)}</div>
        <div id="result-usage" style="font-size:12px;color:#8a7a55;margin-bottom:14px;">抹茶 ${usage.matchaGrams.toFixed(1)}g ・ お湯 ${Math.round(usage.waterMl)}mL</div>
      </div>`;

    const btn = document.createElement("button");
    btn.id = "btn-retry";
    btn.textContent = "もう一度点てる";
    btn.style.cssText = primaryBtnCss();
    btn.addEventListener("click", onRetry);
    (screen.firstElementChild as HTMLElement).appendChild(btn);

    this.root.appendChild(screen);
    this.resultScreen = screen;
  }

  clearTitle(): void {
    this.titleScreen?.remove();
    this.titleScreen = null;
  }

  clearResult(): void {
    this.resultScreen?.remove();
    this.resultScreen = null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function overlayCss(bg: string): string {
  return [
    "position:absolute",
    "inset:0",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "pointer-events:auto",
    `background:${bg}`,
    "backdrop-filter:blur(2px)",
  ].join(";");
}

function primaryBtnCss(): string {
  return [
    "pointer-events:auto",
    "cursor:pointer",
    "border:none",
    "border-radius:999px",
    "padding:14px 40px",
    "font-size:17px",
    "font-weight:700",
    "color:#fff",
    "background:#5a8f2f",
    "box-shadow:0 4px 14px rgba(0,0,0,0.2)",
  ].join(";");
}
