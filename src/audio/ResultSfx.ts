import type { AudioManager } from "./AudioManager";

/**
 * 完成演出の結果別効果音。
 *
 * AudioManager の効果音バス（sfxGain）に接続して鳴らすため、
 * 効果音の音量設定とミュートが反映される。スケジュール済みのノードを
 * 保持しており、stop() でリトライ時などに即座に止められる。
 *
 * - 失敗: コミカルな木製打楽器（ぽくぽく）。不快なブザーは使わない。
 * - 成功: やさしい鈴。
 * - 大成功: 華やかな鈴（非旋律）。
 * - 奇跡: 一瞬の静寂ののち澄んだ一音（単音。メロディ・和音にしない）。
 *   ※ BGM は廃止。静寂は環境音を ResultAnimation が一瞬下げて表現する。
 */
export class ResultSfx {
  private readonly voices = new Set<{ osc: OscillatorNode; gain: GainNode }>();

  constructor(private readonly am: AudioManager) {}

  private resumeIfNeeded(ctx: AudioContext): void {
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  }

  /** 1 つの音（オシレータ＋エンベロープ）を sfx バスへスケジュール。 */
  private tone(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    attack = 0.01,
  ): void {
    try {
      const t0 = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(dest);
      const voice = { osc, gain };
      this.voices.add(voice);
      osc.onended = () => {
        this.voices.delete(voice);
        try {
          gain.disconnect();
        } catch {
          // 無視
        }
      };
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    } catch {
      // 無視
    }
  }

  /** 木魚のような短い打音（ぽくっ）。 */
  private woodTap(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startOffset: number,
    peak: number,
  ): void {
    // 三角波の超短い減衰＝木の打音っぽさ。
    this.tone(ctx, dest, freq, startOffset, 0.12, "triangle", peak, 0.002);
    this.tone(ctx, dest, freq * 2.02, startOffset, 0.07, "triangle", peak * 0.3, 0.002);
  }

  private begin(): { ctx: AudioContext; dest: AudioNode } | null {
    const ctx = this.am.getContext();
    const dest = this.am.getSfxDestination();
    if (!ctx || !dest) return null;
    this.resumeIfNeeded(ctx);
    return { ctx, dest };
  }

  playFail(): void {
    const b = this.begin();
    if (!b) return;
    const { ctx, dest } = b;
    // コミカルに少し下降する 3 連打＋とぼけた低い締め。
    this.woodTap(ctx, dest, 520, 0.0, 0.3);
    this.woodTap(ctx, dest, 460, 0.14, 0.3);
    this.woodTap(ctx, dest, 410, 0.28, 0.3);
    this.tone(ctx, dest, 240, 0.46, 0.22, "triangle", 0.22, 0.004);
  }

  playSuccess(): void {
    const b = this.begin();
    if (!b) return;
    const { ctx, dest } = b;
    // やさしい鈴（基音＋倍音の減衰）。
    this.tone(ctx, dest, 880, 0, 1.3, "sine", 0.28);
    this.tone(ctx, dest, 1320, 0, 1.0, "sine", 0.12);
    this.tone(ctx, dest, 1760, 0, 0.6, "sine", 0.05);
  }

  playGreat(): void {
    const b = this.begin();
    if (!b) return;
    const { ctx, dest } = b;
    // 華やかな鈴（メロディではなく、倍音豊かな鈴を重ねて煌びやかに）。
    this.tone(ctx, dest, 1046.5, 0, 1.4, "sine", 0.24);
    this.tone(ctx, dest, 1568, 0, 1.1, "sine", 0.12);
    this.tone(ctx, dest, 2093, 0, 0.8, "sine", 0.06);
    // ごく短い二度目の一打で煌めきを添える（単音・非旋律）。
    this.tone(ctx, dest, 1318.5, 0.16, 1.0, "sine", 0.1);
    this.tone(ctx, dest, 2637, 0.16, 0.6, "sine", 0.04);
  }

  playMiracle(): void {
    const b = this.begin();
    if (!b) return;
    const { ctx, dest } = b;
    // 一瞬の静寂（BGM は無い。環境音は ResultAnimation 側で瞬間的に下げる）ののち、
    // 澄んだ一音（単音＋ごく薄い倍音。メロディ・和音にはしない）。
    const start = 0.7;
    this.tone(ctx, dest, 1046.5, start, 3.0, "sine", 0.2, 0.2);
    this.tone(ctx, dest, 2093, start, 2.0, "sine", 0.045, 0.2); // 澄んだ倍音
  }

  /** 進行中・予約済みの演出音をすべて止める（リトライ時など）。 */
  stop(): void {
    const ctx = this.am.getContext();
    const now = ctx ? ctx.currentTime : 0;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(0.0001, now);
      } catch {
        // 無視
      }
      try {
        v.osc.onended = null;
        v.osc.stop(now);
      } catch {
        // 無視
      }
      try {
        v.gain.disconnect();
      } catch {
        // 無視
      }
    }
    this.voices.clear();
  }
}
