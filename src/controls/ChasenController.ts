import * as THREE from "three";
import { CONFIG } from "../config";
import type { Chasen } from "../scene/Chasen";
import { VelocityTracker } from "./VelocityTracker";

/**
 * Pointer Events を使って茶筅をマウス／タッチで直接操作するコントローラ。
 *
 * 設計のポイント:
 *   - PC（マウス）とスマホ（タッチ）を Pointer Events で共通処理する。
 *   - Raycaster で画面座標 → 液面（Y = liquidSurfaceY）上の 3D 座標へ変換する。
 *   - pointerdown は茶碗の操作可能領域（operableRadius 内）でのみ受け付ける。
 *   - 1 本目の有効なポインタだけを追従対象とし、複数指の 2 本目以降は無視する。
 *   - pointerup / pointercancel / pointer capture の解除を適切に処理する。
 *   - 茶筅は目標位置へ指数補間で「わずかに遅れて」追従する。
 *   - ドラッグ終了時は目標を現在位置に合わせ、茶筅を停止させる。
 */
export class ChasenController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  /** 液面を表す平面 Y = liquidSurfaceY。穂先はここで液面に触れる。 */
  private readonly surfacePlane: THREE.Plane;

  /**
   * 追従目標（Pointer Events から得た液面上の XZ 位置、Y は液面高に固定）。
   * これは「カーソルが指し示す位置」であり、実際に表示される茶筅の位置
   * （this.chasen.position）とは区別する。茶筅はこの目標へ遅れて追従する。
   */
  private readonly target = new THREE.Vector3();
  private hasTarget = false;

  /**
   * 速度トラッカー。計測対象は目標位置ではなく「実際に表示されている茶筅の
   * 位置」(this.chasen.position)。泡立ちには実際の動きの速さを使うため。
   */
  private readonly velocity = new VelocityTracker({
    bowlRadius: CONFIG.velocity.bowlRadius,
    referenceSpeed: CONFIG.velocity.referenceSpeed,
    smoothing: CONFIG.velocity.smoothing,
  });

  /** 現在ドラッグを行っているポインタ ID。null のときは未操作。 */
  private activePointerId: number | null = null;

  private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerEnd(e);
  private readonly onPointerCancel = (e: PointerEvent) => this.handlePointerEnd(e);

  /** 液面の高さ（穂先が触れる Y）。お湯量で変わりうる。 */
  private surfaceY: number;

  /** 入力リスナーが装着されているか。 */
  private attached = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly chasen: Chasen,
    surfaceY: number = CONFIG.bowl.liquidSurfaceY,
  ) {
    this.surfaceY = surfaceY;
    const y = surfaceY;
    // 平面 y = Y0  ⇔  (0,1,0)·p - Y0 = 0  ⇒  constant = -Y0
    this.surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);

    // 初期位置は茶碗中央・液面高。
    this.chasen.position.set(0, y, 0);
    this.velocity.reset(0, 0);

    this.enable();
  }

  /** 入力を有効化する（リスナー装着）。 */
  enable(): void {
    if (this.attached) return;
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    // 稀に capture が外れた場合の保険。
    this.canvas.addEventListener("lostpointercapture", this.onPointerCancel);
    this.attached = true;
  }

  /** 入力を無効化する（リスナー解除・ドラッグ中なら停止）。 */
  disable(): void {
    if (!this.attached) return;
    // ドラッグ中なら capture を解除して停止。
    if (this.activePointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture(this.activePointerId)) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
      } catch {
        // 無視
      }
      this.activePointerId = null;
      this.target.copy(this.chasen.position);
    }
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.onPointerCancel);
    this.attached = false;
  }

  /** 液面の高さを更新する（お湯量の変化に対応）。 */
  setSurfaceY(y: number): void {
    this.surfaceY = y;
    this.surfacePlane.set(new THREE.Vector3(0, 1, 0), -y);
    this.chasen.position.y = y;
    this.target.y = y;
  }

  dispose(): void {
    this.disable();
  }

  private handlePointerDown(e: PointerEvent): void {
    // すでに別のポインタで操作中なら、2 本目以降は無視（複数指対策）。
    if (this.activePointerId !== null) return;

    const point = this.projectToSurface(e);
    if (!point) return;

    // pointerdown は操作可能領域の内側だけで受け付ける。
    if (!this.isInsideOperable(point)) return;

    e.preventDefault();
    this.activePointerId = e.pointerId;

    // 以降、要素外へ出ても move/up を取りこぼさないよう capture する。
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 一部環境で失敗することがあるが致命的ではない。
    }

    this.setTarget(point);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    const point = this.projectToSurface(e);
    if (!point) return;

    e.preventDefault();
    this.setTarget(point);
  }

  /** pointerup / pointercancel / lostpointercapture の共通終了処理。 */
  private handlePointerEnd(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.activePointerId = null;

    // ドラッグ終了時は茶筅を停止させる（目標を現在位置に合わせる）。
    this.target.copy(this.chasen.position);
  }

  /** 操作可能領域内に収めた目標位置を設定する。 */
  private setTarget(point: THREE.Vector3): void {
    this.clampToOperable(point);
    point.y = this.surfaceY; // 穂先が液面に触れる高さを維持
    this.target.copy(point);
    this.hasTarget = true;
  }

  /**
   * Pointer のクライアント座標を液面平面上のワールド座標へ変換する。
   * canvas の実寸（getBoundingClientRect）を毎回参照するため、
   * 画面サイズが変わっても正しく座標変換できる。
   */
  private projectToSurface(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    this.pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.surfacePlane, hit);
    return ok ? hit : null;
  }

  /** 原点中心・operableRadius の円の内側かどうか。 */
  private isInsideOperable(point: THREE.Vector3): boolean {
    const r = CONFIG.operableRadius;
    return point.x * point.x + point.z * point.z <= r * r;
  }

  /** 操作可能領域の円内へ座標をクランプする（境界上に押し戻す）。 */
  private clampToOperable(point: THREE.Vector3): void {
    const r = CONFIG.operableRadius;
    const distSq = point.x * point.x + point.z * point.z;
    if (distSq > r * r) {
      const scale = r / Math.sqrt(distSq);
      point.x *= scale;
      point.z *= scale;
    }
  }

  /**
   * 毎フレーム呼ぶ。茶筅を目標位置へ「わずかに遅れて」追従させ、
   * 実際の表示位置から移動速度を更新する。
   * 指数補間なのでフレームレートに依存しない。
   */
  update(deltaSeconds: number): void {
    if (!this.hasTarget) return;

    // 1) カーソル目標へ遅延追従（実際の表示位置を更新）。
    const k = 1 - Math.exp(-CONFIG.follow.smoothing * deltaSeconds);
    this.chasen.position.lerp(this.target, k);
    this.chasen.position.y = this.surfaceY; // 高さを常に維持

    // 2) 速度計測は「実際の茶筅位置」で行う（目標位置ではない）。
    //    操作停止中は速度を 0 へ戻す。
    this.velocity.update(
      this.chasen.position.x,
      this.chasen.position.z,
      deltaSeconds,
      this.activePointerId !== null,
    );
  }

  /**
   * 実際の茶筅の移動速度（平滑化後、0〜1）。
   * 泡立ちの計算にはこの値を使う。
   */
  get speed(): number {
    return this.velocity.normalized;
  }

  /** 平滑化前の瞬間速度（半径/秒）。デバッグ表示用。 */
  get rawSpeedInRadii(): number {
    return this.velocity.rawSpeedInRadii;
  }

  /** 操作中かどうか。 */
  get isActive(): boolean {
    return this.activePointerId !== null;
  }
}
