import type { AudioManager } from "./AudioManager";
import { generateTearoomAmbient } from "./musicBuffers";

/** 環境音ファイルの配置場所（無ければ仮音源にフォールバック）。 */
export const AMBIENT_ASSET = "/audio/ambient/tearoom.ogg";

/**
 * 茶室の環境音（風・鳥・空気感）を扱う。BGM（音楽）は使わない。
 * 効果音バス配下で鳴るため、効果音音量・ミュートに従う。
 */
export class AmbientSound {
  private started = false;
  private usingPlaceholder = false;

  constructor(private readonly am: AudioManager) {}

  /** ユーザー操作（はじめる）で呼ぶ。読み込み→ループ再生。 */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const ctx = this.am.getContext();
    if (!ctx) return; // 音声不可 → no-op

    const ok = await this.am.loadAmbient("ambient", AMBIENT_ASSET);
    if (!ok) {
      this.am.registerAmbientBuffer("ambient", generateTearoomAmbient(ctx));
      this.usingPlaceholder = true;
      console.info(
        "[AmbientSound] 環境音の正式音源が未配置のため仮音源を使用中です。" +
          " public/audio/ に配置すると差し替わります。",
      );
    }
    // ユーザー操作後にゆっくりフェードイン。
    this.am.playAmbient("ambient", { loop: true, fadeIn: 4.0 });
  }

  isUsingPlaceholder(): boolean {
    return this.usingPlaceholder;
  }

  dispose(): void {
    this.am.stopAmbient({ fadeOut: 1 });
  }
}
