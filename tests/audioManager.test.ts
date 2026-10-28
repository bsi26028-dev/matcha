import { describe, it, expect, beforeEach } from "vitest";
import { AudioManager } from "../src/audio/AudioManager";
import type { AudioManagerOptions } from "../src/audio/AudioManager";

// --- 最小の Web Audio モック ---
class ParamMock {
  value = 1;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}
class GainMock {
  gain = new ParamMock();
  connect() {}
  disconnect() {}
}
class SourceMock {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  started = 0;
  stopped = 0;
  connect() {}
  disconnect() {}
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
}
class AudioContextMock {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  destination = {};
  gains: GainMock[] = [];
  sources: SourceMock[] = [];
  createGain() {
    const g = new GainMock();
    this.gains.push(g);
    return g as unknown as GainNode;
  }
  createBufferSource() {
    const s = new SourceMock();
    this.sources.push(s);
    return s as unknown as AudioBufferSourceNode;
  }
  async decodeAudioData() {
    return {} as AudioBuffer;
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

function createStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  };
}
function okFetch(): typeof fetch {
  return (async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
}
function failFetch(): typeof fetch {
  return (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
}

function make(overrides: Partial<AudioManagerOptions> = {}) {
  const ctx = new AudioContextMock();
  const storage = createStorageMock();
  const mgr = new AudioManager({
    contextProvider: () => ctx as unknown as AudioContext,
    storage,
    fetchImpl: okFetch(),
    ...overrides,
  });
  return { mgr, ctx, storage };
}

describe("AudioManager（効果音のみ・BGM廃止）", () => {
  let env: ReturnType<typeof make>;
  beforeEach(() => {
    env = make();
  });

  it("設定は効果音音量とミュートのみ。初期音量は 70%", () => {
    expect(env.mgr.getSfxVolume()).toBeCloseTo(0.7);
    expect(env.mgr.isMuted()).toBe(false);
    // BGM 系 API は存在しない。
    const anyMgr = env.mgr as unknown as Record<string, unknown>;
    expect(anyMgr.getBgmVolume).toBeUndefined();
    expect(anyMgr.playBgm).toBeUndefined();
    expect(anyMgr.setBgmSceneScale).toBeUndefined();
  });

  it("効果音音量は 0〜1 にクランプされ、localStorage に保存・復元される", () => {
    env.mgr.setSfxVolume(2);
    expect(env.mgr.getSfxVolume()).toBe(1);
    env.mgr.setSfxVolume(0.4);

    const ctx2 = new AudioContextMock();
    const mgr2 = new AudioManager({
      contextProvider: () => ctx2 as unknown as AudioContext,
      storage: env.storage,
      fetchImpl: okFetch(),
    });
    expect(mgr2.getSfxVolume()).toBeCloseTo(0.4);
  });

  it("ミュートで master=0 / 解除で 1、効果音音量は sfxGain に反映", () => {
    // 生成順: master(0), sfx(1), ambientFade(2)
    const master = env.ctx.gains[0];
    const sfx = env.ctx.gains[1];
    expect(sfx.gain.value).toBeCloseTo(0.7);
    env.mgr.setMuted(true);
    expect(master.gain.value).toBe(0);
    env.mgr.setMuted(false);
    expect(master.gain.value).toBe(1);
    env.mgr.setSfxVolume(0.3);
    expect(sfx.gain.value).toBeCloseTo(0.3);
  });

  it("効果音の読み込み失敗（404）でも例外なく false、再生も安全", async () => {
    const { mgr } = make({ fetchImpl: failFetch() });
    const ok = await mgr.loadSfx("pour", "/sounds/pour.mp3");
    expect(ok).toBe(false);
    expect(() => mgr.playSfx("pour")).not.toThrow();
  });

  it("効果音を複数同時に再生できる", async () => {
    await env.mgr.loadSfx("tap", "/sounds/tap.mp3");
    await env.mgr.unlock();
    env.mgr.playSfx("tap");
    env.mgr.playSfx("tap");
    expect(env.ctx.sources.filter((s) => s.started > 0).length).toBeGreaterThanOrEqual(2);
  });

  it("環境音は未 unlock では保留し、unlock で開始する（効果音バス配下）", async () => {
    await env.mgr.loadAmbient("amb", "/sounds/amb.mp3");
    env.mgr.playAmbient("amb", { loop: true });
    expect(env.ctx.sources.filter((s) => s.started > 0).length).toBe(0);
    await env.mgr.unlock();
    expect(env.ctx.sources.filter((s) => s.started > 0 && s.loop).length).toBe(1);
  });

  it("dispose 後は context が閉じ、再生しても落ちない", () => {
    env.mgr.dispose();
    expect(env.ctx.state).toBe("closed");
    expect(() => env.mgr.playSfx("x")).not.toThrow();
    expect(() => env.mgr.playAmbient("x")).not.toThrow();
  });

  it("Web Audio が無い環境でも生成・各操作が例外を投げない", () => {
    const storage = createStorageMock();
    const mgr = new AudioManager({ contextProvider: () => null, storage });
    expect(mgr.isAvailable()).toBe(false);
    expect(() => {
      mgr.playSfx("x");
      mgr.playAmbient("x");
      mgr.setSfxVolume(0.5);
      mgr.toggleMute();
      mgr.setAmbientLevel(0.5, 0.2);
      mgr.dispose();
    }).not.toThrow();
    expect(mgr.getSfxVolume()).toBe(0.5);
  });
});
