/**
 * 効果音の音源バッファを手続き的に生成する（音声ファイル不要）。
 *
 * 連続音（注ぎ・点て・粉）はループ可能なバッファ、
 * 単発音（タップ・ボタン・置く・飛沫）は短い減衰音として作る。
 * ノイズを簡易フィルタで整形して、それっぽい質感にしている。
 */

export interface GameBuffers {
  /** お湯を注ぐ連続音（ループ）。 */
  pour: AudioBuffer;
  /** 茶筅で点てるシャカシャカ（ループ）。 */
  whisk: AudioBuffer;
  /** 粉が落ちるサラサラ（ループ）。 */
  powder: AudioBuffer;
  /** 茶杓が茶碗に触れるコツッ（単発）。 */
  tap: AudioBuffer;
  /** ボタンを押す音（単発）。 */
  button: AudioBuffer;
  /** 茶碗を置く音（単発）。 */
  place: AudioBuffer;
  /** 液体が飛び散る音（単発）。 */
  splash: AudioBuffer;
}

export function generateGameBuffers(ctx: BaseAudioContext): GameBuffers {
  return {
    pour: makePour(ctx),
    whisk: makeWhisk(ctx),
    powder: makePowder(ctx),
    tap: makeTap(ctx),
    button: makeButton(ctx),
    place: makePlace(ctx),
    splash: makeSplash(ctx),
  };
}

function createBuffer(ctx: BaseAudioContext, seconds: number): {
  buffer: AudioBuffer;
  data: Float32Array;
  sr: number;
} {
  const sr = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(seconds * sr));
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  return { buffer, data, sr };
}

/** ループの継ぎ目のプチノイズを減らすため、端をクロスフェードする。 */
function loopCrossfade(data: Float32Array): void {
  const n = data.length;
  const fade = Math.min(Math.floor(n * 0.04), 2000);
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    const head = data[i];
    const tail = data[n - fade + i];
    // 末尾を先頭へ徐々に混ぜる
    data[i] = head * w + tail * (1 - w);
  }
}

/** お湯を注ぐ: 低いゴボゴボ＋高いシューという水音。 */
function makePour(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data, sr } = createBuffer(ctx, 2.0);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const n = Math.random() * 2 - 1;
    lp += (n - lp) * 0.12; // ローパス（水の低い音）
    const hp = n - lp; // ハイパス（シューという高い音）
    let s = lp * 0.75 + hp * 0.28;
    // ゆっくりした揺らぎ（ゴボゴボ感）
    s *= 0.8 + 0.2 * Math.sin((i / sr) * Math.PI * 2 * 3.0);
    data[i] = s * 0.5;
  }
  loopCrossfade(data);
  return buffer;
}

/** 点てる: 速い2つのスウィッシュ（シャカ・シャカ）。 */
function makeWhisk(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data } = createBuffer(ctx, 0.5);
  const n = data.length;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const phase = (t * 2) % 1; // 1ループに2回
    const env = Math.pow(Math.sin(phase * Math.PI), 2); // burst 形
    const w = Math.random() * 2 - 1;
    lp += (w - lp) * 0.45;
    const hp = w - lp; // ざらっとした高域
    data[i] = hp * 0.85 * env * 0.5;
  }
  loopCrossfade(data);
  return buffer;
}

/** 粉が落ちる: 細かく高い「サラサラ」。 */
function makePowder(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data } = createBuffer(ctx, 0.6);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    lp += (w - lp) * 0.5;
    const hp = w - lp;
    const flutter = 0.6 + 0.4 * Math.random();
    data[i] = hp * 0.4 * flutter * 0.4;
  }
  loopCrossfade(data);
  return buffer;
}

/** 茶杓が触れる「コツッ」。 */
function makeTap(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data, sr } = createBuffer(ctx, 0.1);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    const env = Math.exp(-t * 42);
    const sine = Math.sin((2 * Math.PI * 720 * i) / sr);
    const noise = Math.random() * 2 - 1;
    data[i] = (sine * 0.6 + noise * 0.5) * env * 0.6;
  }
  return buffer;
}

/** ボタンを押す「ポッ」。 */
function makeButton(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data, sr } = createBuffer(ctx, 0.09);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    const env = Math.exp(-t * 30);
    const sine = Math.sin((2 * Math.PI * 540 * i) / sr);
    data[i] = sine * env * 0.4;
  }
  return buffer;
}

/** 茶碗を置く「コトッ」（低め）。 */
function makePlace(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data, sr } = createBuffer(ctx, 0.25);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    const env = Math.exp(-t * 18);
    const sine = Math.sin((2 * Math.PI * 150 * i) / sr);
    const w = Math.random() * 2 - 1;
    lp += (w - lp) * 0.08;
    data[i] = (sine * 0.7 + lp * 0.5) * env * 0.5;
  }
  return buffer;
}

/** 液体が飛び散る「ピシャッ」。 */
function makeSplash(ctx: BaseAudioContext): AudioBuffer {
  const { buffer, data } = createBuffer(ctx, 0.3);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    const env = Math.exp(-t * 14);
    const w = Math.random() * 2 - 1;
    lp += (w - lp) * 0.25;
    const hp = w - lp;
    data[i] = hp * env * 0.5;
  }
  return buffer;
}
