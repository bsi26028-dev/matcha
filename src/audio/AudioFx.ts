/**
 * 効果音を WebAudio で合成して鳴らす（音声ファイル不要）。
 *
 * - 失敗: 少し間の抜けた下降ブリップ
 * - 成功: やさしい鈴の音
 * - 大成功: 和風の華やかなアルペジオ
 * - 奇跡: 一瞬の静寂のあとに美しい和音
 *
 * AudioContext はユーザー操作（完成ボタン）起点で生成・再開する。
 * 音声デバイスが無い環境（ヘッドレス等）でも例外で落ちないよう、全て try/catch。
 */
export class AudioFx {
  private ctx: AudioContext | null = null;

  /** ユーザー操作中に呼ぶ。コンテキストを用意（再開）する。 */
  ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    } catch {
      // 無視
    }
  }

  /** 下降するグライド音（間の抜けた感じ）。 */
  private glide(
    from: number,
    to: number,
    startOffset: number,
    duration: number,
    peak: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(from, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    } catch {
      // 無視
    }
  }

  playFail(): void {
    if (!this.ensure()) return;
    // ぽよ〜ん、と気の抜けた下降。
    this.glide(300, 150, 0, 0.45, 0.14);
    this.tone(196, 0.42, 0.25, "triangle", 0.1);
  }

  playSuccess(): void {
    if (!this.ensure()) return;
    // やさしい鈴（倍音つきの減衰音）。
    this.tone(880, 0, 1.3, "sine", 0.18);
    this.tone(1320, 0.0, 1.0, "sine", 0.07);
    this.tone(1760, 0.0, 0.6, "sine", 0.03);
  }

  playGreat(): void {
    if (!this.ensure()) return;
    // 和風の華やかなアルペジオ（都節/ペンタトニック風）。
    const notes = [523.25, 587.33, 698.46, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, i * 0.12, 0.6, "triangle", 0.14));
    this.tone(1568, 0.6, 0.8, "sine", 0.05);
  }

  playMiracle(): void {
    if (!this.ensure()) return;
    // 一瞬の静寂ののち、美しい和音＋きらめき。
    const silence = 0.6;
    const chord = [523.25, 659.25, 783.99, 987.77, 1174.66];
    chord.forEach((f) => this.tone(f, silence, 2.6, "sine", 0.08));
    // きらめき（高音を少しずつ）
    [1568, 1760, 2093].forEach((f, i) =>
      this.tone(f, silence + 0.3 + i * 0.25, 1.2, "sine", 0.03),
    );
  }
}
