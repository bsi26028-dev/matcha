import * as THREE from "three";

/**
 * 茶碗の上でのポインタ操作（押している間だけ有効）を扱う汎用入力。
 * 茶杓で抹茶を入れる／やかんでお湯を注ぐ、の両方に使う。
 *
 *   - Pointer Events で PC・スマホ共通。
 *   - 指定した高さの平面へ Raycaster で射影し、ワールド座標を得る。
 *   - 茶碗の内側（gateRadius 内）で押したときだけ有効化。
 *   - 複数指の 2 本目以降は無視。pointerup/cancel/capture 解除に対応。
 *
 * ChasenController と同じ考え方で、画面サイズ変化にも強い。
 */
export class SurfacePointer {
  /** 操作中かどうか。 */
  active = false;
  /** 現在のポインタのワールド座標（平面上）。 */
  readonly position = new THREE.Vector3();

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private plane: THREE.Plane;
  private activeId: number | null = null;
  private attached = false;

  private readonly onDown = (e: PointerEvent) => this.handleDown(e);
  private readonly onMove = (e: PointerEvent) => this.handleMove(e);
  private readonly onEnd = (e: PointerEvent) => this.handleEnd(e);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    planeY: number,
    private readonly gateRadius: number,
  ) {
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  }

  enable(): void {
    if (this.attached) return;
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onEnd);
    this.canvas.addEventListener("pointercancel", this.onEnd);
    this.canvas.addEventListener("lostpointercapture", this.onEnd);
    this.attached = true;
  }

  disable(): void {
    if (!this.attached) return;
    if (this.activeId !== null) {
      try {
        if (this.canvas.hasPointerCapture(this.activeId)) {
          this.canvas.releasePointerCapture(this.activeId);
        }
      } catch {
        // 無視
      }
    }
    this.activeId = null;
    this.active = false;
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onEnd);
    this.canvas.removeEventListener("pointercancel", this.onEnd);
    this.canvas.removeEventListener("lostpointercapture", this.onEnd);
    this.attached = false;
  }

  setPlaneY(y: number): void {
    this.plane.set(new THREE.Vector3(0, 1, 0), -y);
  }

  private handleDown(e: PointerEvent): void {
    if (this.activeId !== null) return;
    const p = this.project(e);
    if (!p) return;
    if (p.x * p.x + p.z * p.z > this.gateRadius * this.gateRadius) return; // 茶碗の外

    e.preventDefault();
    this.activeId = e.pointerId;
    this.active = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 無視
    }
    this.position.copy(p);
  }

  private handleMove(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    const p = this.project(e);
    if (!p) return;
    e.preventDefault();
    this.position.copy(p);
  }

  private handleEnd(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // 無視
    }
    this.activeId = null;
    this.active = false;
  }

  private project(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }
}
