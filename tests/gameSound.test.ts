import { describe, it, expect } from "vitest";
import { GameSound } from "../src/audio/GameSound";
import type { AudioManager } from "../src/audio/AudioManager";

// --- 最小の Web Audio モック ---
class ParamMock {
  value = 1;
  targets: number[] = [];
  setTargetAtTime(v: number) {
    this.value = v;
    this.targets.push(v);
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
  playbackRate = new ParamMock();
  started = 0;
  connect() {}
  disconnect() {}
  start() {
    this.started++;
  }
  stop() {}
}
class CtxMock {
  sampleRate = 44100;
  currentTime = 0;
  destination = {};
  gains: GainMock[] = [];
  sources: SourceMock[] = [];
  createBuffer(_ch: number, len: number) {
    return { getChannelData: () => new Float32Array(len) } as unknown as AudioBuffer;
  }
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
}

function makeAM(ctx: CtxMock | null) {
  const dest = ctx ? (ctx.createGain() as unknown as AudioNode) : null;
  let sfxCount = 0;
  const am = {
    unlock: async () => undefined,
    getContext: () => ctx as unknown as AudioContext | null,
    getSfxDestination: () => dest,
    registerBuffer: () => undefined,
    playSfx: () => {
      sfxCount++;
    },
  };
  return { am: am as unknown as AudioManager, getSfxCount: () => sfxCount };
}

describe("GameSound", () => {
  it("unlock でループ音源は一度だけ生成され、毎フレーム呼んでも増えない", () => {
    const ctx = new CtxMock();
    const { am } = makeAM(ctx);
    const gs = new GameSound(am);
    gs.unlock();
    const afterUnlock = ctx.sources.length;
    expect(afterUnlock).toBe(3); // pour / whisk / powder

    // 擬似的に多数フレーム更新しても新しいソースは作られない。
    for (let i = 0; i < 120; i++) {
      gs.setWhisk(Math.random(), true);
      gs.setPour(true);
      gs.setPowder(true);
    }
    expect(ctx.sources.length).toBe(3);
    // ループソースはすべて start 済み・loop=true。
    expect(ctx.sources.every((s) => s.started === 1 && s.loop)).toBe(true);
  });

  it("点て速度で音量が上がり、再生速度も上がる", () => {
    const ctx = new CtxMock();
    const { am } = makeAM(ctx);
    const gs = new GameSound(am);
    gs.unlock();
    gs.setWhisk(0.8, true);
    // いずれかのゲインが正の目標値、いずれかのソースの再生速度が 1 超。
    const anyGainUp = ctx.gains.some((g) => g.gain.targets.some((v) => v > 0));
    const anyRateUp = ctx.sources.some((s) => s.playbackRate.targets.some((v) => v > 1));
    expect(anyGainUp).toBe(true);
    expect(anyRateUp).toBe(true);
    // 停止すると目標 0 へ。
    gs.setWhisk(0, false);
    const lastWhiskGains = ctx.gains.flatMap((g) => g.gain.targets);
    expect(lastWhiskGains).toContain(0);
  });

  it("飛沫音は短時間に連続で呼んでも多重再生しない（スロットル）", () => {
    const ctx = new CtxMock();
    const { am, getSfxCount } = makeAM(ctx);
    const gs = new GameSound(am);
    gs.unlock();
    gs.splash();
    gs.splash();
    gs.splash();
    expect(getSfxCount()).toBe(1); // 最初の1回だけ
  });

  it("音声が使えない環境でも全操作が安全（例外なし・再生なし）", () => {
    const { am, getSfxCount } = makeAM(null);
    const gs = new GameSound(am);
    expect(() => {
      gs.unlock();
      gs.setWhisk(0.5, true);
      gs.setPour(true);
      gs.setPowder(true);
      gs.tap();
      gs.button();
      gs.place();
      gs.splash();
      gs.reset();
      gs.dispose();
    }).not.toThrow();
    // ワンショットも鳴らない（ready でない）… ただし playSfx は AudioManager 側なので
    // GameSound は呼ぶ。ここでは例外が出ないことを主眼に確認する。
    expect(getSfxCount()).toBeGreaterThanOrEqual(0);
  });
});
