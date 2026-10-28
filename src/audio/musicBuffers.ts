/**
 * 茶室の環境音バッファを手続き生成する（仮音源）。
 *
 * 【重要】本作は BGM（音楽）を使わない。ここで作るのは「音楽ではない環境効果音」
 * （風・鳥・空気感）のみ。正式音源が配置されるまでのプレースホルダで、
 * public/audio/ambient/tearoom.ogg を置けば差し替わる（public/audio/README.md 参照）。
 */

/** 茶室の環境音（風＋鳥＋空気感、ループ用）。 */
export function generateTearoomAmbient(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate || 44100;
  const seconds = 30;
  const length = Math.floor(seconds * sr);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // 風（低くゆらぐフィルタノイズ）＋静かな空気感
  let lp = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const n = Math.random() * 2 - 1;
    lp += (n - lp) * 0.02;
    const gust = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.06 * t + Math.sin(t * 0.25));
    data[i] += lp * 0.09 * gust;
    data[i] += (n - lp) * 0.01;
  }

  // 鳥のさえずり（ごく控えめに、まばらに）。
  const chirpAt = [4.0, 4.22, 13.5, 22.8, 23.0];
  for (const c of chirpAt) addChirp(data, sr, length, c);

  loopCrossfade(data, sr, 1.0);
  return buffer;
}

/** 小鳥のさえずり（周波数が素早く上下する短い音）。 */
function addChirp(
  data: Float32Array,
  sr: number,
  length: number,
  startSec: number,
): void {
  const start = Math.floor(startSec * sr);
  const dur = 0.14;
  const n = Math.floor(dur * sr);
  const baseFreq = 2600 + Math.random() * 1200;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= length) break;
    const t = i / sr;
    const env = Math.sin((t / dur) * Math.PI);
    const warble = baseFreq * (1 + 0.5 * Math.sin(2 * Math.PI * 28 * t));
    data[idx] += Math.sin(2 * Math.PI * warble * t) * env * 0.035;
  }
}

/** ループの継ぎ目を目立たなくするクロスフェード。 */
function loopCrossfade(data: Float32Array, sr: number, fadeSec = 1.0): void {
  const n = data.length;
  const fade = Math.min(Math.floor(fadeSec * sr), Math.floor(n * 0.15));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    const tail = data[n - fade + i];
    data[i] = data[i] * w + tail * (1 - w);
  }
}
