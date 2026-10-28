import type { AudioManager } from "../audio/AudioManager";

/**
 * 画面右上の音量コントロール。
 * 設定は「効果音の音量(0〜100%)」と「ミュート(ON/OFF)」の2つだけ。
 * AudioManager が localStorage に保存する。
 */
export class VolumeControl {
  private readonly root: HTMLDivElement;
  private readonly iconBtn: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly slider: HTMLInputElement;
  private open = false;

  constructor(
    private readonly audio: AudioManager,
    parent: HTMLElement = document.body,
  ) {
    this.root = document.createElement("div");
    this.root.style.cssText = [
      "position:fixed",
      "top:12px",
      "right:12px",
      "z-index:20",
      "font-family:system-ui,sans-serif",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-end",
      "gap:8px",
    ].join(";");

    // アイコンボタン
    this.iconBtn = document.createElement("button");
    this.iconBtn.id = "btn-volume";
    this.iconBtn.setAttribute("aria-label", "音量設定");
    this.iconBtn.style.cssText = [
      "width:44px",
      "height:44px",
      "border-radius:50%",
      "border:none",
      "cursor:pointer",
      "background:rgba(255,255,255,0.85)",
      "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
      "font-size:20px",
      "line-height:1",
      "pointer-events:auto",
    ].join(";");
    this.iconBtn.addEventListener("click", () => this.togglePanel());
    this.root.appendChild(this.iconBtn);

    // パネル（スライダー＋ミュート）
    this.panel = document.createElement("div");
    this.panel.style.cssText = [
      "display:none",
      "flex-direction:column",
      "gap:10px",
      "background:rgba(255,255,255,0.95)",
      "border-radius:12px",
      "padding:14px 16px",
      "box-shadow:0 6px 20px rgba(0,0,0,0.18)",
      "min-width:180px",
      "pointer-events:auto",
      "color:#4a3f2c",
      "font-size:13px",
    ].join(";");

    const label = document.createElement("div");
    label.textContent = "効果音の音量";
    label.style.cssText = "font-weight:700;";
    this.panel.appendChild(label);

    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.id = "slider-sfx";
    this.slider.min = "0";
    this.slider.max = "100";
    this.slider.step = "1";
    this.slider.value = String(Math.round(this.audio.getSfxVolume() * 100));
    this.slider.style.cssText = "width:100%;cursor:pointer;accent-color:#5a8f2f;";
    this.slider.addEventListener("input", () => {
      const v = Number(this.slider.value) / 100;
      // 音量を動かしたらミュート解除（意図を汲む）。
      if (this.audio.isMuted() && v > 0) this.audio.setMuted(false);
      this.audio.setSfxVolume(v);
      this.updateIcon();
    });
    this.panel.appendChild(this.slider);

    const muteBtn = document.createElement("button");
    muteBtn.id = "btn-mute";
    muteBtn.textContent = "ミュート";
    muteBtn.style.cssText = [
      "cursor:pointer",
      "border:1px solid rgba(0,0,0,0.15)",
      "border-radius:8px",
      "padding:8px 10px",
      "background:#fff",
      "color:#4a3f2c",
      "font:inherit",
      "pointer-events:auto",
    ].join(";");
    muteBtn.addEventListener("click", () => {
      this.audio.toggleMute();
      this.updateMuteButton(muteBtn);
      this.updateIcon();
    });
    this.updateMuteButton(muteBtn);
    this.panel.appendChild(muteBtn);

    this.root.appendChild(this.panel);
    parent.appendChild(this.root);

    this.updateIcon();
  }

  private togglePanel(): void {
    this.open = !this.open;
    this.panel.style.display = this.open ? "flex" : "none";
  }

  private updateMuteButton(btn: HTMLButtonElement): void {
    const muted = this.audio.isMuted();
    btn.textContent = muted ? "ミュート解除" : "ミュート";
    btn.style.background = muted ? "#6fae3b" : "#fff";
    btn.style.color = muted ? "#fff" : "#4a3f2c";
  }

  private updateIcon(): void {
    const muted = this.audio.isMuted();
    const vol = this.audio.getSfxVolume();
    // 🔇 ミュート / 🔈 小 / 🔊 大
    this.iconBtn.textContent = muted || vol <= 0 ? "🔇" : vol < 0.5 ? "🔈" : "🔊";
  }
}
