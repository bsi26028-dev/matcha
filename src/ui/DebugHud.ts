/**
 * 開発用のデバッグ表示（画面左上）。
 * 現在の移動速度（正規化 0〜1）とバー、瞬間速度を表示する。
 * 本番ビルドでは main 側で生成しない想定。
 */
export class DebugHud {
  private readonly label: HTMLDivElement;
  private readonly barFill: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    const root = document.createElement("div");
    root.style.cssText = [
      "position:fixed",
      "top:12px",
      "left:12px",
      "z-index:10",
      "font-family:ui-monospace,Menlo,Consolas,monospace",
      "font-size:12px",
      "line-height:1.5",
      "color:#3a3326",
      "background:rgba(255,255,255,0.7)",
      "padding:8px 10px",
      "border-radius:8px",
      "pointer-events:none",
      "user-select:none",
      "min-width:180px",
    ].join(";");

    this.label = document.createElement("div");
    this.label.textContent = "speed: 0.000";
    root.appendChild(this.label);

    const barTrack = document.createElement("div");
    barTrack.style.cssText = [
      "margin-top:6px",
      "width:160px",
      "height:8px",
      "background:rgba(0,0,0,0.12)",
      "border-radius:4px",
      "overflow:hidden",
    ].join(";");

    this.barFill = document.createElement("div");
    this.barFill.style.cssText = [
      "height:100%",
      "width:0%",
      "background:linear-gradient(90deg,#8bbf4d,#2f7d32)",
      "transition:width 60ms linear",
    ].join(";");
    barTrack.appendChild(this.barFill);
    root.appendChild(barTrack);

    parent.appendChild(root);
  }

  /**
   * @param normalized 平滑化後の正規化速度 0〜1
   * @param rawSpeedInRadii 平滑化前の瞬間速度（半径/秒）
   * @param active 操作中かどうか
   * @param foam 泡の状態（0〜100）。省略可。
   */
  update(
    normalized: number,
    rawSpeedInRadii: number,
    active: boolean,
    foam?: {
      foamAmount: number;
      foamQuality: number;
      foamUniformity: number;
      spillAmount: number;
    },
  ): void {
    let text =
      `speed(norm): ${normalized.toFixed(3)}\n` +
      `raw: ${rawSpeedInRadii.toFixed(2)} r/s  ${active ? "●" : "○"}`;
    if (foam) {
      text +=
        `\n--- foam ---` +
        `\namount:     ${foam.foamAmount.toFixed(0)}` +
        `\nquality:    ${foam.foamQuality.toFixed(0)}` +
        `\nuniformity: ${foam.foamUniformity.toFixed(0)}` +
        `\nspill:      ${foam.spillAmount.toFixed(0)}`;
    }
    this.label.textContent = text;
    // 改行を反映させるため white-space を指定。
    this.label.style.whiteSpace = "pre";
    this.barFill.style.width = `${Math.round(normalized * 100)}%`;
  }
}
