# 抹茶日和 BGM 制作プロンプト（外部音楽生成 AI 用）

テーマは **「静寂の茶室」**。本物の茶室で抹茶を点てる、落ち着いたリアル系体験のための
静かな和風アンビエントです。以下のプロンプトを Suno / Udio / MusicGen 等で使用し、
生成した音源を **`public/audio/bgm/koto_calm.ogg`** に配置してください（自動で差し替わります）。

> ⚠️ 現状、正式音源は未配置・未完成です。ゲーム内では手続き生成の仮 BGM が鳴っています。
> この仮音は「それらしさ」の確認用であり、**完成音源ではありません**。

---

## 英語プロンプト（生成 AI 向け）

```
Japanese tea-room ambient, extremely calm and quiet. Sparse solo koto with long
silences and lots of space between notes. Occasional soft shakuhachi (bamboo flute)
long sustained breaths, very gentle. Hirajoshi (dark, melancholic Japanese pentatonic)
scale, low-to-mid register. Slow, meditative, no beat, no drums, no percussion.
Minimal notes, contemplative, "ma" (negative space). Subtle room tone / tatami air.
Soft dynamics, never loud. Seamless loop. No bright melody, no pop rhythm, no
electronic sounds, no taiko. Mood: tranquil, refined, wabi-sabi, meditative.
```

## 日本語プロンプト（補助）

```
静寂の茶室のための、きわめて静かな和風アンビエント。琴のソロを疎に、音と音の
あいだに長い余白（間）。尺八の長い息の音をごく控えめに時折。平調子（暗く寂びた
和音階）、低〜中音域。遅く瞑想的、ビート・打楽器なし。畳の空気感をうっすら。
終始小さな音量。シームレスにループ。明るいメロディ・ポップなリズム・電子音・
和太鼓は禁止。侘び寂び、落ち着き、長時間でも疲れない。
```

## 技術仕様（重要）

- **長さ**: 60〜120 秒（推奨 ~90 秒）で**シームレスループ**。先頭と末尾が自然につながること。
- **テンポ/拍**: 明確なビートを置かない（アンビエント）。
- **音量**: 操作音・効果音を邪魔しないよう控えめ。ラウドネス目安 **約 -20〜-23 LUFS**、トゥルーピーク **≤ -3 dBTP**。
- **帯域**: 低〜中音域中心。きつい高域は避ける。
- **フォーマット**: `.ogg`（Vorbis）推奨、ステレオ、44.1kHz。`.mp3` でも可（その場合は `src/audio/GameMusic.ts` の `AUDIO_ASSETS.bgm` を更新）。
- **ループ**: エンコード時にループ端のクリックが出ないよう、頭 1 秒程度のクロスフェードまたはループポイント調整を行う。

## 避けること

- 激しい和太鼓 / 明るすぎる琴のメロディー / 電子的なゲーム音楽 / ポップなリズム
- 不自然なループ（継ぎ目のプチノイズ）/ 大きすぎる音量 / 頻繁な展開・転調

## ライセンス

- 生成サービスの**商用利用可否・帰属要否**を必ず確認してください。
- 帰属が必要な場合は `public/audio/CREDITS.md` に 作者/サービス名・曲名・ライセンス・URL を明記。
- 条件が確認できない音源は使用しないこと。

## 差し替え手順

1. 上記プロンプトで音源を生成し、ライセンスを確認。
2. `public/audio/bgm/koto_calm.ogg` として保存（環境音も作る場合は `public/audio/ambient/tearoom.ogg`）。
3. ブラウザを再読み込み。`GameMusic.start()` が実ファイルを検出し、仮音から自動で差し替わります。
4. 必要に応じて `AudioManager` の既定 BGM 音量や `GameMusic` の場面倍率を微調整。
