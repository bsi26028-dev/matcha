import type { AudioManager } from "./AudioManager";
import { generateGameBuffers } from "./sfxBuffers";

/**
 * 常駐するループ音源 1 本を表す。音量・再生速度を滑らかに変化させる。
 * ソースは一度だけ作って鳴らし続ける（毎フレーム作り直して多重再生しない）。
 */
class LoopVoice {
  private source: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly buffer: AudioBuffer,
    dest: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(dest);
  }

  start(): void {
    if (this.source) return; // 既に鳴っている → 多重再生しない
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.gain);
    try {
      src.start(0);
    } catch {
      // 無視
    }
    this.source = src;
  }

  /** 音量を目標値へ滑らかに。 */
  setGain(target: number, timeConstant = 0.08): void {
    try {
      this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, timeConstant);
    } catch {
      this.gain.gain.value = target;
    }
  }

  /** 再生速度を目標値へ滑らかに。 */
  setRate(rate: number, timeConstant = 0.12): void {
    if (!this.source) return;
    try {
      this.source.playbackRate.setTargetAtTime(
        rate,
        this.ctx.currentTime,
        timeConstant,
      );
    } catch {
      this.source.playbackRate.value = rate;
    }
  }

  dispose(): void {
    try {
      this.source?.stop();
    } catch {
      // 無視
    }
    try {
      this.source?.disconnect();
      this.gain.disconnect();
    } catch {
      // 無視
    }
    this.source = null;
  }
}

/**
 * ゲーム操作に連動する効果音のまとめ役。
 * AudioManager（コンテキスト・効果音音量・ミュート）を再利用し、
 * 連続音はループ音源、単発音はワンショットで鳴らす。
 * 音が使えない環境では全メソッドが安全に no-op。
 */
export class GameSound {
  private ready = false;
  private pour: LoopVoice | null = null;
  private whisk: LoopVoice | null = null;
  private powder: LoopVoice | null = null;
  private lastSplashMs = 0;

  constructor(private readonly am: AudioManager) {}

  /** ユーザー操作（はじめる等）の中で呼ぶ。解除とバッファ準備。 */
  unlock(): void {
    void this.am.unlock();
    this.ensure();
  }

  private ensure(): void {
    if (this.ready) return;
    const ctx = this.am.getContext();
    const dest = this.am.getSfxDestination();
    if (!ctx || !dest) return; // 音声不可 → no-op のまま
    try {
      const b = generateGameBuffers(ctx);
      // 単発音は AudioManager.playSfx で鳴らすため登録。
      this.am.registerBuffer("tap", b.tap);
      this.am.registerBuffer("button", b.button);
      this.am.registerBuffer("place", b.place);
      this.am.registerBuffer("splash", b.splash);
      // 連続音は常駐ループとして用意（無音で鳴らし続ける）。
      this.pour = new LoopVoice(ctx, b.pour, dest);
      this.whisk = new LoopVoice(ctx, b.whisk, dest);
      this.powder = new LoopVoice(ctx, b.powder, dest);
      this.pour.start();
      this.whisk.start();
      this.powder.start();
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  // ---- 単発音 ----
  button(): void {
    this.am.playSfx("button");
  }
  tap(): void {
    this.am.playSfx("tap");
  }
  place(): void {
    this.am.playSfx("place");
  }
  /** 飛沫音。多重再生を防ぐため最小間隔を空ける。 */
  splash(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastSplashMs < 160) return;
    this.lastSplashMs = now;
    this.am.playSfx("splash", { volume: 0.7 });
  }

  // ---- 連続音 ----
  /** 粉を入れている間の「サラサラ」。 */
  setPowder(active: boolean): void {
    this.powder?.setGain(active ? 0.6 : 0);
  }

  /** お湯を注いでいる間の連続音（止めると自然にフェードアウト）。 */
  setPour(active: boolean): void {
    this.pour?.setGain(active ? 0.7 : 0, active ? 0.05 : 0.25);
  }

  /**
   * 点てる音。速度（0〜1）で音量、速いほど再生速度も少し上げる。
   * active=false または速度ほぼ0で自然に消える。
   */
  setWhisk(speed: number, active: boolean): void {
    if (!this.whisk) return;
    const s = Math.max(0, Math.min(1, speed));
    const vol = active && s > 0.02 ? 0.1 + 0.8 * s : 0;
    this.whisk.setGain(vol, 0.1);
    this.whisk.setRate(1 + 0.3 * s);
  }

  /** すべての連続音を止める。 */
  reset(): void {
    this.setPowder(false);
    this.setPour(false);
    this.setWhisk(0, false);
  }

  dispose(): void {
    this.pour?.dispose();
    this.whisk?.dispose();
    this.powder?.dispose();
    this.pour = this.whisk = this.powder = null;
    this.ready = false;
  }
}
