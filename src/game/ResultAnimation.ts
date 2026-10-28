import * as THREE from "three";
import gsap from "gsap";
import type { SceneManager } from "../scene/SceneManager";
import type { GameUI } from "../ui/GameUI";
import type { AudioManager } from "../audio/AudioManager";
import { ResultSfx } from "../audio/ResultSfx";
import { TIER_INFO } from "./resultTiers";
import type { Tier } from "./resultTiers";

/**
 * 完成結果の演出を管理する。
 *
 * - GSAP で「茶碗の揺れ / ゆっくり拡大 / カメラズーム」を制御（真上視点は維持）。
 * - 結果別の効果音は ResultSfx（AudioManager の効果音バス経由）で再生。
 * - 金色のパーティクル（大成功・奇跡）。
 * - 抹茶の完成状態（色・泡・液面・粉）は一切変更しない（カメラ・光・粒子のみ）。
 *
 * カメラは OrthographicCamera の zoom と position で表現するため、
 * 視線方向（真上）は変わらない。
 */
export class ResultAnimation {
  private readonly sfx: ResultSfx;
  private readonly particles: GoldParticles;

  private readonly baseCamPos: THREE.Vector3;
  private readonly baseZoom: number;

  private timeline: gsap.core.Timeline | null = null;
  private shake = { v: 0 };

  private readonly am: AudioManager;

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly ui: GameUI,
    audioManager: AudioManager,
  ) {
    this.am = audioManager;
    this.sfx = new ResultSfx(audioManager);
    const cam = sceneManager.camera;
    this.baseCamPos = cam.position.clone();
    this.baseZoom = cam.zoom;

    this.particles = new GoldParticles(64);
    sceneManager.add(this.particles.points);

    // パーティクルのドリフト更新（常時呼ばれるが非アクティブ時は何もしない）。
    sceneManager.onUpdate((dt) => this.particles.update(dt));
  }

  /**
   * 演出を再生する。
   * @param tier 演出段階
   * @param onReveal 完成カード（名称・コメント・ボタン）を表示するコールバック
   */
  play(tier: Tier, onReveal: () => void): void {
    this.stop();
    // 同じ演出が重複再生されないよう、前の演出音を止めてから鳴らす。
    this.sfx.stop();

    const info = TIER_INFO[tier];
    this.ui.showAnimationTitle(info.title, info.color);

    const cam = this.sceneManager.camera;
    const light = this.sceneManager.accentLight;
    const applyProj = () => cam.updateProjectionMatrix();

    const tl = gsap.timeline();
    this.timeline = tl;

    const revealed = { done: false };
    const reveal = () => {
      if (revealed.done) return;
      revealed.done = true;
      this.ui.hideAnimationTitle();
      onReveal();
    };

    switch (tier) {
      case "fail":
        this.sfx.playFail();
        // 茶碗（視界）を小さく揺らす + ほんの少し寄る。
        this.shake.v = 0;
        tl.to(this.shake, {
          v: 1,
          duration: 2.0,
          ease: "none",
          onUpdate: () => {
            const p = this.shake.v;
            const amp = 0.06 * (1 - p); // 減衰
            cam.position.x = this.baseCamPos.x + Math.sin(p * Math.PI * 9) * amp;
            cam.position.z = this.baseCamPos.z + Math.cos(p * Math.PI * 7) * amp * 0.6;
          },
        });
        tl.to(cam, { zoom: this.baseZoom * 1.06, duration: 2.0, ease: "power1.out", onUpdate: applyProj }, 0);
        tl.call(reveal, [], 1.8);
        break;

      case "success":
        this.sfx.playSuccess();
        // ゆっくり拡大（zoom）＋ やわらかな光。
        tl.to(cam, { zoom: this.baseZoom * 1.16, duration: 2.6, ease: "power2.out", onUpdate: applyProj }, 0);
        tl.to(light, { intensity: 1.4, duration: 0.8, ease: "power2.out" }, 0.1);
        tl.to(light, { intensity: 0.8, duration: 1.6, ease: "power1.inOut" }, 0.9);
        tl.call(reveal, [], 1.7);
        break;

      case "great":
        this.sfx.playGreat();
        // 茶碗へ滑らかにズーム＋金色の光の粒（控えめ）。
        tl.to(cam, { zoom: this.baseZoom * 1.32, duration: 3.6, ease: "power3.out", onUpdate: applyProj }, 0);
        tl.to(light, { intensity: 1.8, duration: 1.0, ease: "power2.out" }, 0.1);
        tl.to(light, { intensity: 1.0, duration: 2.2, ease: "power1.inOut" }, 1.2);
        this.particles.show("rise");
        tl.fromTo(this.particles.material, { opacity: 0 }, { opacity: 0.55, duration: 1.2, ease: "power2.out" }, 0.3);
        tl.to(this.particles.material, { opacity: 0.35, duration: 2.5 }, 1.6);
        tl.call(reveal, [], 2.3);
        break;

      case "miracle":
        // 一瞬の静寂 → 光が集まる → 澄んだ一音 → 金色の粒子。
        // BGM は無いので、環境音を一瞬下げて静寂を作り、少し後に戻す。
        this.am.setAmbientLevel(0, 0.25);
        setTimeout(() => this.am.setAmbientLevel(1, 2.0), 900);
        this.sfx.playMiracle(); // 約0.7秒後に澄んだ一音
        tl.to(cam, { zoom: this.baseZoom * 1.1, duration: 0.6, ease: "power1.in", onUpdate: applyProj }, 0); // 息をのむ寄り
        tl.to(cam, { zoom: this.baseZoom * 1.38, duration: 3.6, ease: "power3.inOut", onUpdate: applyProj }, 0.6);
        tl.to(light, { intensity: 2.6, duration: 1.4, ease: "power2.out" }, 0.6);
        tl.to(light, { intensity: 1.2, duration: 2.6, ease: "power1.inOut" }, 2.0);
        this.particles.show("converge");
        tl.fromTo(this.particles.material, { opacity: 0 }, { opacity: 0.8, duration: 1.6, ease: "power2.out" }, 0.6);
        tl.to(this.particles.material, { opacity: 0.5, duration: 2.8 }, 2.2);
        tl.call(reveal, [], 3.0);
        break;
    }

    // 保険: 想定時間を過ぎてもカードが出るようにする。
    tl.call(reveal, [], info.duration);
  }

  /** 進行中の演出を停止する（タイムラインを殺す）。見た目はそのまま。 */
  private stop(): void {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
  }

  /** 演出状態を初期化（カメラ・光・粒子・演出音を元に戻す）。リトライ時に呼ぶ。 */
  reset(): void {
    this.stop();
    this.sfx.stop(); // リトライ時は演出音を止める
    this.am.setAmbientLevel(1, 0.5); // 環境音レベルを元に戻す
    const cam = this.sceneManager.camera;
    gsap.killTweensOf(cam);
    gsap.killTweensOf(this.sceneManager.accentLight);
    gsap.killTweensOf(this.particles.material);
    gsap.killTweensOf(this.shake);

    cam.position.copy(this.baseCamPos);
    cam.zoom = this.baseZoom;
    cam.updateProjectionMatrix();
    this.sceneManager.accentLight.intensity = 0;
    this.particles.hide();
    this.ui.hideAnimationTitle();
  }
}

/**
 * 金色のパーティクル（THREE.Points）。
 * - rise: ゆっくり上昇してループ
 * - converge: 中心へ集まりながら上昇
 */
class GoldParticles {
  readonly points: THREE.Points;
  readonly material: THREE.PointsMaterial;

  private readonly geometry: THREE.BufferGeometry;
  private readonly velocities: Float32Array;
  private mode: "rise" | "converge" | "idle" = "idle";
  private active = false;

  private readonly yBottom = 0.3;
  private readonly yTop = 2.0;

  constructor(private readonly count: number) {
    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.placeAtBase(positions, i);
      this.velocities[i] = 0.25 + Math.random() * 0.4;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0xd9b24a,
      size: 0.07,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "GoldParticles";
    this.points.visible = false;
    this.points.frustumCulled = false;
  }

  private placeAtBase(positions: Float32Array, i: number): void {
    const ang = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 1.3; // 茶碗の内外にふわり
    positions[i * 3] = Math.cos(ang) * r;
    positions[i * 3 + 1] = this.yBottom + Math.random() * (this.yTop - this.yBottom);
    positions[i * 3 + 2] = Math.sin(ang) * r;
  }

  show(mode: "rise" | "converge"): void {
    this.mode = mode;
    this.active = true;
    this.points.visible = true;
    const positions = this.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.count; i++) this.placeAtBase(positions, i);
    this.geometry.attributes.position.needsUpdate = true;
  }

  hide(): void {
    this.active = false;
    this.mode = "idle";
    this.points.visible = false;
    this.material.opacity = 0;
  }

  update(dt: number): void {
    if (!this.active) return;
    const positions = this.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      positions[ix + 1] += this.velocities[i] * dt;
      if (this.mode === "converge") {
        positions[ix] += (0 - positions[ix]) * dt * 0.6;
        positions[ix + 2] += (0 - positions[ix + 2]) * dt * 0.6;
      }
      if (positions[ix + 1] > this.yTop) {
        // 下へループ（ふわふわ継続）
        positions[ix + 1] = this.yBottom;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}
