# 抹茶日和（Maccha Biyori）

静かな茶室で、本物の抹茶を点てる体験を楽しむ 3D ブラウザゲームです。
真上視点の茶碗で、茶杓・やかん・茶筅を操作して一服点て、出来栄えを 100 点満点で採点します。

## 技術構成

- [Three.js](https://threejs.org/) — 3D 描画（OrthographicCamera / ShaderMaterial / InstancedMesh）
- TypeScript
- [Vite](https://vitejs.dev/) — 開発サーバー / ビルド
- [GSAP](https://gsap.com/) — 完成演出アニメーション
- Web Audio API — 効果音・環境音（手続き生成、BGM なし）
- [Vitest](https://vitest.dev/) — テスト

## 遊び方

1. タイトルで「はじめる」
2. 茶杓をドラッグして抹茶を入れる
3. やかんをドラッグしてお湯を注ぐ
4. 茶筅をドラッグ／スライドして点てる
5. 「完成」で採点（材料バランス35・泡のきめ細かさ30・均一さ20・丁寧さ15）
6. 結果（名称・コメント・スコア・演出）を見て「もう一度点てる」

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー（http://localhost:5173/）
```

## スクリプト

```bash
npm run dev      # 開発サーバー
npm run build    # 型チェック + 本番ビルド（dist/）
npm run preview  # 本番ビルドのプレビュー
npm test         # ユニットテスト（Vitest）
```

## ディレクトリ構成

```
src/
  main.ts            エントリ
  config.ts          定数
  scene/             3D（茶碗・液面・泡・飛沫・茶筅・テーブル・SceneManager）
  controls/          入力（茶筅操作・注ぎ操作・速度計測）
  sim/               泡立ち計算・材料（描画から分離した純粋ロジック）
  game/              進行管理・結果判定・採点・完成演出
  audio/             効果音・環境音（AudioManager 等）
  ui/                画面 UI（タイトル・結果・音量）
tests/               Vitest テスト
public/audio/        音源の配置場所（正式音源は未配置・README 参照）
```

## 音源について

本作は BGM（音楽）を使わず、操作連動の効果音と茶室の環境音で構成しています。
効果音・環境音は現状 Web Audio による手続き生成の仮音源です。正式な環境音を
使う場合は `public/audio/` に配置してください（詳細は `public/audio/README.md`）。
