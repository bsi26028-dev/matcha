import type { Object3D } from "three";
import type { SceneManager } from "../scene/SceneManager";
import { Chawan } from "../scene/Chawan";
import { MatchaPowder } from "../scene/MatchaPowder";
import { LiquidSurface } from "../scene/LiquidSurface";
import { FoamRenderer } from "../scene/FoamRenderer";
import { SpillParticles } from "../scene/SpillParticles";
import { Chasen, createPlaceholderChasenModel } from "../scene/Chasen";
import { createChashaku, createKettle } from "../scene/Tools";
import { ChasenController } from "../controls/ChasenController";
import { SurfacePointer } from "../controls/SurfacePointer";
import { FoamSimulator } from "../sim/FoamSimulator";
import type { FoamState } from "../sim/FoamSimulator";
import { waterToSurfaceY, matchaConcentration } from "../sim/ingredients";
import { classifyResult } from "./ResultSystem";
import type { MatchaResult, MovementSample } from "./ResultSystem";
import { evaluate, reconcileResult } from "./ScoreSystem";
import type { ScoreResult } from "./ScoreSystem";
import { ResultAnimation } from "./ResultAnimation";
import { GameUI } from "../ui/GameUI";
import { AudioManager } from "../audio/AudioManager";
import { GameSound } from "../audio/GameSound";
import { AmbientSound } from "../audio/AmbientSound";
import { VolumeControl } from "../ui/VolumeControl";
import { CONFIG } from "../config";

export type Phase = "title" | "matcha" | "water" | "whisk" | "result";

/**
 * ゲーム全体の進行役。
 * タイトル → 抹茶を入れる → お湯を注ぐ → 点てる → 採点、の流れを管理する。
 *
 * 既存のシーン部品・コントローラ・計算ロジックを再利用し、
 * フェーズごとに表示と入力の有効/無効を切り替える。材料量は遷移をまたいで保持する。
 */
export class GameController {
  private phase: Phase = "title";

  /** 画面遷移をまたいで保持する材料量。 */
  private readonly materials = { matchaGrams: 0, waterMl: 0 };

  // シーン部品（既存を再利用）
  private readonly chawan = new Chawan();
  private readonly powder = new MatchaPowder();
  private readonly liquid: LiquidSurface;
  private readonly foam: FoamRenderer;
  private readonly spill: SpillParticles;
  private readonly chasen = new Chasen();
  private readonly chashaku = createChashaku();
  private readonly kettle = createKettle();

  // 入力（フェーズごとに有効化）
  private readonly chasenController: ChasenController;
  private readonly matchaPointer: SurfacePointer;
  private readonly waterPointer: SurfacePointer;

  // 泡立ち計算（Three.js から分離された純粋ロジック）
  private readonly foamSim = new FoamSimulator();

  private readonly ui: GameUI;
  private readonly resultAnimation: ResultAnimation;
  // サウンド（効果音管理 + 操作連動効果音 + 茶室の環境音）。BGM は使わない。
  private readonly audio = new AudioManager();
  private readonly sound = new GameSound(this.audio);
  private readonly ambient = new AmbientSound(this.audio);
  private matchaWasActive = false;
  private finalResult: MatchaResult | null = null;
  private finalScore: ScoreResult | null = null;

  // 点てる操作の記録（結果判定に使う）。
  private whiskHistory: MovementSample[] = [];
  private whiskMaxSpeed = 0;
  private whiskSampleTimer = 0;

  constructor(scene: SceneManager) {
    const baseY = waterToSurfaceY(0);

    this.liquid = new LiquidSurface(baseY);
    this.foam = new FoamRenderer(baseY);
    this.spill = new SpillParticles(baseY);
    this.chasen.setModel(createPlaceholderChasenModel());

    // シーンへ追加
    scene.add(this.chawan.object);
    scene.add(this.powder.mesh);
    scene.add(this.liquid.mesh);
    scene.add(this.foam.mesh);
    scene.add(this.spill.mesh);
    scene.add(this.chasen.object);
    scene.add(this.chashaku);
    scene.add(this.kettle);

    // コントローラ
    this.chasenController = new ChasenController(
      scene.canvas,
      scene.camera,
      this.chasen,
      baseY,
    );
    this.matchaPointer = new SurfacePointer(
      scene.canvas,
      scene.camera,
      CONFIG.game.toolHoverY,
      CONFIG.bowl.liquidRadius,
    );
    this.waterPointer = new SurfacePointer(
      scene.canvas,
      scene.camera,
      CONFIG.game.toolHoverY,
      CONFIG.bowl.liquidRadius,
    );

    this.ui = new GameUI();
    this.resultAnimation = new ResultAnimation(scene, this.ui, this.audio);
    // 画面右上の音量コントロール（効果音音量＋ミュート）。
    new VolumeControl(this.audio);

    // 道具は初期は見えないところへ。
    this.chashaku.visible = false;
    this.kettle.visible = false;

    this.refreshLiquid();
    this.goTitle();
  }

  // ---- 画面遷移 ----

  private goTitle(): void {
    this.phase = "title";
    this.applyVisibility();
    this.disableAllInputs();
    this.ui.setBanner("");
    this.ui.hideAction();
    this.ui.clearResult();
    // はじめる＝ユーザー操作。ここで音声を解除（unlock）し、環境音開始＋ボタン音＋茶碗を置く音。
    this.ui.showTitle(() => {
      this.sound.unlock();
      void this.ambient.start(); // 茶室の環境音（音楽ではない）をフェードイン
      this.sound.button();
      this.sound.place();
      this.goMatcha();
    });
  }

  private goMatcha(): void {
    this.phase = "matcha";
    this.matchaWasActive = false;
    this.sound.setPour(false);
    this.ui.clearTitle();
    this.applyVisibility();
    this.disableAllInputs();
    this.matchaPointer.enable();
    this.ui.setBanner("茶杓を茶碗の上でドラッグして抹茶を入れましょう（基準 2g）");
    this.ui.showAction("次へ：お湯", () => {
      this.sound.button();
      this.goWater();
    });
  }

  private goWater(): void {
    this.phase = "water";
    this.sound.setPowder(false); // 抹茶フェーズのサラサラを止める
    this.applyVisibility();
    this.disableAllInputs();
    this.waterPointer.enable();
    this.ui.setBanner("やかんを茶碗の上でドラッグしてお湯を注ぎましょう（基準 70mL）");
    this.ui.showAction("次へ：点てる", () => {
      this.sound.button();
      this.goWhisk();
    });
  }

  private goWhisk(): void {
    this.phase = "whisk";
    // 点てる操作の記録を初期化。
    this.whiskHistory = [];
    this.whiskMaxSpeed = 0;
    this.whiskSampleTimer = 0;
    // 前ラウンドの鑑賞用演出をクリアし、茶筅を中央へ。
    this.foam.setBias(0, 0, 0);
    this.spill.reset();
    this.sound.setPour(false); // お湯の注ぎ音を止める
    const y = waterToSurfaceY(this.materials.waterMl);
    this.chasen.object.position.set(0, y, 0);
    this.applyVisibility();
    this.disableAllInputs();
    this.chasenController.enable();
    this.ui.setBanner("茶筅をドラッグ／スライドして点てましょう");
    this.ui.showAction("完成", () => {
      this.sound.button();
      this.goResult();
    });
  }

  private goResult(): void {
    this.phase = "result";
    this.disableAllInputs();
    // 連続音をすべて止める（点て・注ぎ・粉）。
    this.sound.reset();

    // 今回のプレイデータ。
    const foam = this.foamSim.snapshot;
    const playData = {
      powderAmount: this.materials.matchaGrams,
      waterAmount: this.materials.waterMl,
      foamAmount: foam.foamAmount,
      foamQuality: foam.foamQuality,
      foamUniformity: foam.foamUniformity,
      spillAmount: foam.spillAmount,
      whiskSpeed: this.whiskMaxSpeed,
      whiskMovementHistory: this.whiskHistory,
    };

    // 100点満点で採点（材料＋泡＋茶筅の動かし方）。演出段階はスコアから決める。
    const score = evaluate(playData);
    this.finalScore = score;

    // 20種の名称で味わいを出しつつ、名称の段階を採点段階に整合させる
    //（粉だけ/お湯だけ=0点＝失敗のまま、一級品/奇跡は高得点時のみ）。
    this.finalResult = reconcileResult(classifyResult(playData), score.tier);

    // 完成状態を保ったまま鑑賞用に整える。
    this.applyResultVisual(foam);
    this.applyVisibility();

    this.ui.setBanner("");
    this.ui.hideAction();

    // スコア段階に応じた演出を再生し、終わりに完成カード（スコア・名称・コメント）を出す。
    const result = this.finalResult;
    const usage = {
      matchaGrams: this.materials.matchaGrams,
      waterMl: this.materials.waterMl,
    };
    const tier = score.tier;
    this.resultAnimation.play(tier, () => {
      this.ui.showResult(result, score, usage, () => {
        this.sound.button();
        this.retry();
      });
    });
  }

  /**
   * 結果画面の 3D を、実際のプレイ結果に合わせて整える（固定画像ではない）。
   * - 液面の色/高さ/透明度は材料から（refreshLiquid）
   * - 泡は実際の状態（updateResult が継続更新）。点てた位置へ寄せる
   * - 飛び散った量ぶんの液滴を茶碗の周囲に残す
   * - 茶筅を茶碗の外へ移動して抹茶をよく見せる
   */
  private applyResultVisual(foam: FoamState): void {
    this.refreshLiquid();

    // 泡の寄り（点てた位置の重心から算出）
    const n = this.whiskHistory.length;
    if (n > 0) {
      let cx = 0;
      let cz = 0;
      for (const p of this.whiskHistory) {
        cx += p.x;
        cz += p.z;
      }
      cx /= n;
      cz /= n;
      const dist = Math.hypot(cx, cz);
      const strength = Math.min(1, dist / CONFIG.operableRadius);
      this.foam.setBias(cx, cz, strength * 0.9);
    } else {
      this.foam.setBias(0, 0, 0);
    }

    // 飛沫を茶碗の周囲に残す（飛び散り抹茶）
    this.spill.showSplatter(foam.spillAmount);

    // 茶筅を茶碗の外へ寄せる（抹茶がよく見えるように）
    const y = waterToSurfaceY(this.materials.waterMl);
    this.chasen.object.position.set(CONFIG.bowl.rimRadius + 1.4, y, 0.2);
  }

  /** リトライ：状態を初期化してタイトルへ戻す。 */
  private retry(): void {
    this.resultAnimation.reset(); // 演出（カメラ・光・粒子）を元に戻す
    this.sound.reset(); // 連続音を止める
    this.matchaWasActive = false;
    this.materials.matchaGrams = 0;
    this.materials.waterMl = 0;
    this.foamSim.reset();
    this.foam.reset(); // 泡・寄りを初期化
    this.spill.reset();
    this.powder.setAmount(0);
    this.finalResult = null;
    this.finalScore = null;
    this.whiskHistory = [];
    this.whiskMaxSpeed = 0;
    this.whiskSampleTimer = 0;
    // 茶筅を中央へ戻す。
    this.chasen.object.position.set(0, waterToSurfaceY(0), 0);
    this.refreshLiquid();
    this.goTitle();
  }

  // ---- 毎フレーム更新 ----

  update(dt: number): void {
    switch (this.phase) {
      case "matcha":
        this.updateMatcha(dt);
        break;
      case "water":
        this.updateWater(dt);
        break;
      case "whisk":
        this.updateWhisk(dt);
        break;
      case "result":
        this.updateResult(dt);
        break;
      case "title":
      default:
        break;
    }
    // 液面シェーダの時間を進める（波紋アニメ用。常時でも軽量）。
    this.liquid.update(dt);
  }

  private updateMatcha(dt: number): void {
    const active = this.matchaPointer.active;
    // 茶杓が茶碗に触れた瞬間に「コツッ」（押し始めのエッジのみ）。
    if (active && !this.matchaWasActive) this.sound.tap();
    this.matchaWasActive = active;

    if (active) {
      this.materials.matchaGrams = Math.min(
        CONFIG.game.matchaMaxGrams,
        this.materials.matchaGrams + CONFIG.game.matchaRatePerSec * dt,
      );
      this.placeTool(this.chashaku, this.matchaPointer);
    } else {
      this.restTool(this.chashaku);
    }
    // 入れている間だけ「サラサラ」。止めると自然にフェードアウト。
    this.sound.setPowder(active);
    this.powder.setAmount(this.materials.matchaGrams);
  }

  private updateWater(dt: number): void {
    if (this.waterPointer.active) {
      this.materials.waterMl = Math.min(
        CONFIG.game.waterMaxMl,
        this.materials.waterMl + CONFIG.game.waterRatePerSec * dt,
      );
      this.placeTool(this.kettle, this.waterPointer);
    } else {
      this.restTool(this.kettle);
    }
    // 注いでいる間だけ連続音。止めると自然にフェードアウト。
    this.sound.setPour(this.waterPointer.active);
    this.refreshLiquid();
    // お湯が入ったら粉は溶けたものとして隠す。
    this.powder.setVisible(this.materials.waterMl <= 0 && this.materials.matchaGrams > 0);
  }

  private updateWhisk(dt: number): void {
    this.chasenController.update(dt);
    const speed = this.chasenController.speed;
    const cx = this.chasen.position.x;
    const cz = this.chasen.position.z;

    // 操作の記録（最大速度と、点てている間の移動履歴）。
    if (speed > this.whiskMaxSpeed) this.whiskMaxSpeed = speed;
    this.whiskSampleTimer += dt;
    if (
      this.chasenController.isActive &&
      this.whiskSampleTimer >= 0.03 &&
      this.whiskHistory.length < 2000
    ) {
      this.whiskSampleTimer = 0;
      this.whiskHistory.push({ x: cx, z: cz });
    }

    const state = this.foamSim.update(
      {
        matchaGrams: this.materials.matchaGrams,
        waterMl: this.materials.waterMl,
        speed,
      },
      dt,
    );

    // 点てる音: 速度で音量・再生速度。停止で自然に消える（毎フレーム作り直さない）。
    this.sound.setWhisk(speed, this.chasenController.isActive);

    this.liquid.spawnFromChasen(cx, cz, speed, dt);
    this.liquid.setFoam(state.foamAmount, state.foamQuality, state.foamUniformity);
    this.foam.update(state, dt);
    // 飛沫が発生したら「ピシャッ」（多重再生はスロットルで抑制）。
    const spilled = this.spill.spawnFromSpeed(speed, cx, cz, dt);
    if (spilled > 0) this.sound.splash();
    this.spill.update(dt);
  }

  private updateResult(dt: number): void {
    // 泡は現状を保ったまま、ゆらぎと落下中の飛沫だけ進める（新規発生なし）。
    this.foam.update(this.foamSim.snapshot, dt);
    this.spill.update(dt);
  }

  // ---- ヘルパー ----

  /** 材料量から液面の色・高さを更新し、各部品へ反映する。 */
  private refreshLiquid(): void {
    const { matchaGrams, waterMl } = this.materials;
    const y = waterToSurfaceY(waterMl);

    this.liquid.setSurfaceY(y);
    this.foam.setSurfaceY(y);
    this.spill.setSurfaceY(y);
    this.chasenController.setSurfaceY(y);

    const concentration = matchaConcentration(matchaGrams, waterMl);
    this.liquid.setConcentration(concentration);
    this.foam.setConcentration(concentration);
    this.liquid.mesh.visible = waterMl > 0 && this.visibleInPhase("liquid");
  }

  private placeTool(tool: Object3D, pointer: SurfacePointer): void {
    tool.position.set(
      pointer.position.x,
      CONFIG.game.toolHoverY,
      pointer.position.z,
    );
  }

  private restTool(tool: Object3D): void {
    // 待機位置（茶碗の手前やや右上に浮かべる）。
    tool.position.set(0.7, CONFIG.game.toolHoverY, 0.7);
  }

  private disableAllInputs(): void {
    this.matchaPointer.disable();
    this.waterPointer.disable();
    this.chasenController.disable();
  }

  /** 各フェーズでの表示オブジェクトを一括設定する。 */
  private applyVisibility(): void {
    const p = this.phase;
    // 粉の表示: 抹茶を入れた直後（お湯前）と、結果画面でお湯が無い「粉だけ」。
    this.powder.mesh.visible =
      (p === "matcha" ||
        ((p === "water" || p === "result") && this.materials.waterMl <= 0)) &&
      this.materials.matchaGrams > 0;
    this.chashaku.visible = p === "matcha";
    this.kettle.visible = p === "water";

    const liquidPhases = p === "water" || p === "whisk" || p === "result";
    this.liquid.mesh.visible = liquidPhases && this.materials.waterMl > 0;

    const foamPhases = p === "whisk" || p === "result";
    this.foam.mesh.visible = foamPhases;
    this.spill.mesh.visible = foamPhases;

    this.chasen.object.visible = p === "whisk" || p === "result";
  }

  private visibleInPhase(_what: "liquid"): boolean {
    return this.phase === "water" || this.phase === "whisk" || this.phase === "result";
  }

  // ---- デバッグ／テスト用 ----

  /**
   * 開発／検証用: 任意のプレイ状態をセットして結果画面を表示する。
   * 実際の描画経路（液面・泡・粉・飛沫）をその状態で反映するため、
   * 複数結果の見た目の違いを確認できる。
   */
  debugForceResult(d: {
    matchaGrams: number;
    waterMl: number;
    foamAmount: number;
    foamQuality: number;
    foamUniformity: number;
    spillAmount: number;
    whiskSpeed?: number;
    whiskHistory?: MovementSample[];
  }): void {
    this.materials.matchaGrams = d.matchaGrams;
    this.materials.waterMl = d.waterMl;
    this.foamSim.reset({
      foamAmount: d.foamAmount,
      foamQuality: d.foamQuality,
      foamUniformity: d.foamUniformity,
      spillAmount: d.spillAmount,
    });
    this.powder.setAmount(d.matchaGrams);
    this.whiskMaxSpeed = d.whiskSpeed ?? 0.5;
    this.whiskHistory = d.whiskHistory ?? [];
    this.ui.clearTitle();
    this.goResult();
  }

  getDebug(): {
    phase: Phase;
    materials: { matchaGrams: number; waterMl: number };
    foam: FoamState;
    speed: number;
    rawSpeed: number;
    active: boolean;
    result: { id: string; name: string } | null;
    score: ScoreResult | null;
  } {
    return {
      phase: this.phase,
      materials: { ...this.materials },
      foam: this.foamSim.snapshot,
      score: this.finalScore,
      speed: this.chasenController.speed,
      rawSpeed: this.chasenController.rawSpeedInRadii,
      active: this.chasenController.isActive,
      result: this.finalResult
        ? { id: this.finalResult.id, name: this.finalResult.name }
        : null,
    };
  }
}
