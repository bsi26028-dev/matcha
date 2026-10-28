/**
 * 効果音（と茶室の環境音）を管理するサウンドシステム。
 *
 * 本作は「静かな茶室で抹茶を点てる」体験のため、**BGM（音楽）は使わない**。
 * 操作に連動する効果音と、茶室の環境音（空気・風・鳥）だけで没入感を作る。
 * 環境音も「音楽ではない効果音」として、単一の効果音音量の配下に置く。
 *
 * 機能:
 *   - 効果音の再生（複数同時）
 *   - 環境音のループ再生（効果音バス経由。個別音量は持たない）
 *   - 効果音音量（0〜1）とミュート（設定はこの2つだけ、localStorage 保存）
 *   - 音声ファイルの読み込みエラー処理（存在しなくても停止しない）
 *   - ブラウザの自動再生制限への対応（ユーザー操作で unlock）
 *   - リソースの破棄（dispose）
 *
 * Web Audio が使えない環境でも例外で落ちないよう全処理を安全化している。
 * テスト容易性のため AudioContext / storage / fetch は注入可能。
 */

const STORAGE_KEY = "maccha.audio";
const DEFAULT_SFX_VOLUME = 0.7;

export interface AudioSettings {
  sfxVolume: number;
  muted: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioManagerOptions {
  contextProvider?: () => AudioContext | null;
  storage?: StorageLike | null;
  fetchImpl?: typeof fetch;
}

function defaultContextProvider(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class AudioManager {
  private readonly ctx: AudioContext | null;
  private readonly storage: StorageLike | null;
  private readonly fetchImpl: typeof fetch | null;

  // ゲイン構成:
  //   効果音:  source -> sfxGain -> masterGain -> destination
  //   環境音:  source -> ambientFadeGain -> sfxGain -> masterGain -> destination
  // （環境音も効果音音量の配下。ミュートは masterGain=0 で全体に効く）
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientFadeGain: GainNode | null = null;

  private readonly sfxBuffers = new Map<string, AudioBuffer>();
  private readonly ambientBuffers = new Map<string, AudioBuffer>();
  private readonly missing = new Set<string>();

  private readonly activeSfx = new Set<AudioBufferSourceNode>();
  private ambientSource: AudioBufferSourceNode | null = null;
  private currentAmbient: string | null = null;
  private pendingAmbient: { name: string; loop: boolean; fadeIn: number } | null = null;

  private settings: AudioSettings;
  private disposed = false;

  constructor(options: AudioManagerOptions = {}) {
    this.ctx = (options.contextProvider ?? defaultContextProvider)();
    this.storage = options.storage !== undefined ? options.storage : defaultStorage();
    this.fetchImpl =
      options.fetchImpl ??
      (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null);

    this.settings = this.loadSettings();
    this.setupGraph();
    this.applySettingsToGraph();
  }

  private setupGraph(): void {
    if (!this.ctx) return;
    try {
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientFadeGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.ambientFadeGain.connect(this.sfxGain);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.masterGain = null;
    }
  }

  /**
   * ユーザー操作（「はじめる」ボタン等）の中で呼ぶ。
   * 自動再生制限を解除し、保留中の環境音を開始する。
   */
  async unlock(): Promise<void> {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === "suspended") await this.ctx.resume();
    } catch {
      // 無視
    }
    if (this.pendingAmbient) {
      const p = this.pendingAmbient;
      this.pendingAmbient = null;
      this.playAmbient(p.name, { loop: p.loop, fadeIn: p.fadeIn });
    }
  }

  isAvailable(): boolean {
    return !!this.ctx && !!this.masterGain && !this.disposed;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  /** 効果音の入力ノード（sfxGain）。ループ音源の接続先。 */
  getSfxDestination(): AudioNode | null {
    return this.sfxGain;
  }

  getCurrentAmbient(): string | null {
    return this.currentAmbient ?? this.pendingAmbient?.name ?? null;
  }

  /** 手続き生成/デコード済みバッファを効果音として登録する。 */
  registerBuffer(name: string, buffer: AudioBuffer): void {
    this.sfxBuffers.set(name, buffer);
    this.missing.delete(name);
  }

  /** 環境音バッファを直接登録（仮音源など）。 */
  registerAmbientBuffer(name: string, buffer: AudioBuffer): void {
    this.ambientBuffers.set(name, buffer);
    this.missing.delete(name);
  }

  // ---- 読み込み ----

  loadSfx(name: string, url: string): Promise<boolean> {
    return this.loadBuffer(name, url, this.sfxBuffers);
  }

  loadAmbient(name: string, url: string): Promise<boolean> {
    return this.loadBuffer(name, url, this.ambientBuffers);
  }

  private async loadBuffer(
    name: string,
    url: string,
    target: Map<string, AudioBuffer>,
  ): Promise<boolean> {
    if (!this.ctx || !this.fetchImpl) {
      this.missing.add(name);
      return false;
    }
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(data);
      target.set(name, buffer);
      this.missing.delete(name);
      return true;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`[AudioManager] 音声の読み込みに失敗: ${name} (${url}) - ${reason}`);
      this.missing.add(name);
      return false;
    }
  }

  // ---- 再生 ----

  /** 効果音を再生（複数同時可）。 */
  playSfx(name: string, opts: { volume?: number } = {}): void {
    if (!this.ctx || !this.sfxGain || this.disposed) return;
    const buffer = this.sfxBuffers.get(name);
    if (!buffer) return; // 未ロード/失敗 → 無音（停止しない）

    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const vol = clamp01(opts.volume ?? 1);
      if (vol !== 1) {
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(g);
        g.connect(this.sfxGain);
      } else {
        src.connect(this.sfxGain);
      }
      this.activeSfx.add(src);
      src.onended = () => {
        this.activeSfx.delete(src);
        try {
          src.disconnect();
        } catch {
          // 無視
        }
      };
      src.start(0);
    } catch {
      // 無視
    }
  }

  /** 環境音をループ再生する（効果音バス経由）。 */
  playAmbient(name: string, opts: { loop?: boolean; fadeIn?: number } = {}): void {
    const loop = opts.loop ?? true;
    const fadeIn = opts.fadeIn ?? 0;
    if (!this.ctx || !this.ambientFadeGain || this.disposed) return;

    const buffer = this.ambientBuffers.get(name);
    if (!buffer) return;

    if (this.ctx.state === "suspended") {
      this.pendingAmbient = { name, loop, fadeIn };
      return;
    }

    this.stopAmbient();
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = loop;
      src.connect(this.ambientFadeGain);
      const now = this.ctx.currentTime;
      const fade = this.ambientFadeGain.gain;
      fade.cancelScheduledValues(now);
      if (fadeIn > 0) {
        fade.setValueAtTime(0.0001, now);
        fade.linearRampToValueAtTime(1, now + fadeIn);
      } else {
        fade.setValueAtTime(1, now);
      }
      src.start(0);
      this.ambientSource = src;
      this.currentAmbient = name;
    } catch {
      // 無視
    }
  }

  /** 環境音を停止する。 */
  stopAmbient(opts: { fadeOut?: number } = {}): void {
    const fadeOut = opts.fadeOut ?? 0;
    const src = this.ambientSource;
    if (!src || !this.ctx || !this.ambientFadeGain) {
      this.pendingAmbient = null;
      return;
    }
    this.ambientSource = null;
    this.currentAmbient = null;
    try {
      if (fadeOut > 0) {
        const now = this.ctx.currentTime;
        const fade = this.ambientFadeGain.gain;
        fade.cancelScheduledValues(now);
        fade.setValueAtTime(fade.value, now);
        fade.linearRampToValueAtTime(0.0001, now + fadeOut);
        try {
          src.stop(now + fadeOut);
        } catch {
          setTimeout(() => this.safeStop(src), fadeOut * 1000);
        }
      } else {
        this.safeStop(src);
      }
    } catch {
      this.safeStop(src);
    }
  }

  /**
   * 環境音のレベルを一時的に下げ下げ/戻す（完成演出の「一瞬の静寂」等）。
   * ユーザー音量設定とは独立した倍率（0〜1）。
   */
  setAmbientLevel(level: number, fadeSeconds = 0.5): void {
    if (!this.ctx || !this.ambientFadeGain) return;
    const target = clamp01(level);
    try {
      const now = this.ctx.currentTime;
      const g = this.ambientFadeGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (fadeSeconds > 0) g.linearRampToValueAtTime(target, now + fadeSeconds);
      else g.setValueAtTime(target, now);
    } catch {
      this.ambientFadeGain.gain.value = target;
    }
  }

  // ---- 設定（効果音音量・ミュート）----

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  getSfxVolume(): number {
    return this.settings.sfxVolume;
  }

  isMuted(): boolean {
    return this.settings.muted;
  }

  setSfxVolume(v: number): void {
    this.settings.sfxVolume = clamp01(v);
    this.applySettingsToGraph();
    this.saveSettings();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.applySettingsToGraph();
    this.saveSettings();
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  // ---- 破棄 ----

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingAmbient = null;

    if (this.ambientSource) {
      this.safeStop(this.ambientSource);
      this.ambientSource = null;
    }
    for (const src of this.activeSfx) this.safeStop(src);
    this.activeSfx.clear();

    for (const node of [this.masterGain, this.sfxGain, this.ambientFadeGain]) {
      try {
        node?.disconnect();
      } catch {
        // 無視
      }
    }
    this.masterGain = this.sfxGain = this.ambientFadeGain = null;

    this.sfxBuffers.clear();
    this.ambientBuffers.clear();

    try {
      void this.ctx?.close();
    } catch {
      // 無視
    }
  }

  // ---- 内部 ----

  private safeStop(src: AudioBufferSourceNode): void {
    try {
      src.onended = null;
      src.stop();
    } catch {
      // 既に停止済み等
    }
    try {
      src.disconnect();
    } catch {
      // 無視
    }
  }

  private applySettingsToGraph(): void {
    if (this.masterGain) this.masterGain.gain.value = this.settings.muted ? 0 : 1;
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfxVolume;
  }

  private loadSettings(): AudioSettings {
    const fallback: AudioSettings = {
      sfxVolume: DEFAULT_SFX_VOLUME,
      muted: false,
    };
    if (!this.storage) return fallback;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        sfxVolume:
          typeof parsed.sfxVolume === "number"
            ? clamp01(parsed.sfxVolume)
            : fallback.sfxVolume,
        muted: typeof parsed.muted === "boolean" ? parsed.muted : fallback.muted,
      };
    } catch {
      return fallback;
    }
  }

  private saveSettings(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // 無視
    }
  }
}
