import { describe, it, expect } from "vitest";
import { generateTearoomAmbient } from "../src/audio/musicBuffers";

/** createBuffer の最小モック。 */
function mockCtx(sampleRate = 44100): BaseAudioContext {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, sr: number) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate: sr,
        duration: length / sr,
        getChannelData: () => new Float32Array(length),
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
}

describe("環境音バッファ（BGMは廃止・環境音のみ）", () => {
  it("環境音が妥当な長さで生成される", () => {
    const buf = generateTearoomAmbient(mockCtx());
    expect(buf.duration).toBeGreaterThan(10);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("別のサンプルレートでも例外なく生成できる", () => {
    expect(() => generateTearoomAmbient(mockCtx(48000))).not.toThrow();
    expect(() => generateTearoomAmbient(mockCtx(22050))).not.toThrow();
  });
});
