/**
 * 泡立ちのデバッグパネル（開発用、画面右上）。
 * 泡立ち 0% / 25% / 50% / 75% / 100% の状態を切り替えられる。
 * 「Live」で実際の操作に基づく計算へ戻る。
 */
export type FoamDebugLevel = number | null; // パーセント、null は Live

export class FoamDebugPanel {
  private readonly buttons: HTMLButtonElement[] = [];
  private selected: FoamDebugLevel = null;

  /** 選択時に呼ばれるコールバック（パーセント、または Live=null）。 */
  onSelect: (level: FoamDebugLevel) => void = () => {};

  constructor(parent: HTMLElement = document.body) {
    const root = document.createElement("div");
    root.style.cssText = [
      "position:fixed",
      "top:12px",
      "right:12px",
      "z-index:10",
      "display:flex",
      "flex-direction:column",
      "gap:6px",
      "font-family:ui-monospace,Menlo,Consolas,monospace",
      "font-size:12px",
      "background:rgba(255,255,255,0.7)",
      "padding:8px",
      "border-radius:8px",
      "user-select:none",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "泡立ちデバッグ";
    title.style.cssText = "color:#3a3326;margin-bottom:2px;";
    root.appendChild(title);

    const levels: Array<{ label: string; value: FoamDebugLevel }> = [
      { label: "Live（操作）", value: null },
      { label: "0%", value: 0 },
      { label: "25%", value: 25 },
      { label: "50%", value: 50 },
      { label: "75%", value: 75 },
      { label: "100%", value: 100 },
    ];

    for (const lv of levels) {
      const btn = document.createElement("button");
      btn.textContent = lv.label;
      btn.style.cssText = [
        "cursor:pointer",
        "border:1px solid rgba(0,0,0,0.2)",
        "border-radius:6px",
        "padding:6px 10px",
        "background:#fff",
        "color:#3a3326",
        "font:inherit",
      ].join(";");
      btn.addEventListener("click", () => this.select(lv.value));
      (btn as HTMLButtonElement & { _value: FoamDebugLevel })._value = lv.value;
      this.buttons.push(btn);
      root.appendChild(btn);
    }

    parent.appendChild(root);
    this.highlight();
  }

  private select(value: FoamDebugLevel): void {
    this.selected = value;
    this.highlight();
    this.onSelect(value);
  }

  private highlight(): void {
    for (const btn of this.buttons) {
      const value = (btn as HTMLButtonElement & { _value: FoamDebugLevel })._value;
      const on = value === this.selected;
      btn.style.background = on ? "#6fae3b" : "#fff";
      btn.style.color = on ? "#fff" : "#3a3326";
      btn.style.fontWeight = on ? "700" : "400";
    }
  }
}
