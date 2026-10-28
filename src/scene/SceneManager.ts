import * as THREE from "three";
import { CONFIG } from "../config";

export type UpdateCallback = (deltaSeconds: number) => void;

/**
 * レンダラー・シーン・カメラ・ライト・リサイズ・描画ループをまとめて管理する。
 *
 * カメラは OrthographicCamera を真上から見下ろす向きに固定する
 * （地面は XZ 平面、Y 軸が上下方向）。
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  /** 演出用のアクセントライト（茶碗の真上。初期強度0、ResultAnimation が制御）。 */
  accentLight!: THREE.PointLight;

  private readonly clock = new THREE.Clock();
  private readonly updateCallbacks: UpdateCallback[] = [];
  private readonly resizeObserver: ResizeObserver;
  private running = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 影を有効化（やわらかい影）。
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.scene.background = new THREE.Color(0xf3efe6);

    // --- 真上視点の正射影カメラ ---
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CONFIG.camera.near, CONFIG.camera.far);
    this.camera.position.set(0, CONFIG.camera.height, 0);
    this.camera.lookAt(0, 0, 0);
    // 真下を向くと既定の up (0,1,0) が視線と平行になり縮退するため、
    // 画面の上方向が -Z になるように up を設定する。
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    this.setupLights();

    // コンテナのサイズ変化に追従（ウィンドウリサイズ・回転・分割表示など）。
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.handleResize();
  }

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // キーライト（影を落とす）
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 4;
    sc.bottom = -4;
    sc.near = 0.5;
    sc.far = 40;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    this.scene.add(key.target); // ターゲット（原点）をシーンに追加

    // フィルライト（影なし。陰影をやわらげる）
    const fill = new THREE.DirectionalLight(0xfff3e0, 0.4);
    fill.position.set(-4, 5, -3);
    this.scene.add(fill);

    // 演出用アクセントライト（茶碗の真上から。既定は消灯）。
    this.accentLight = new THREE.PointLight(0xfff2cf, 0, 12, 2);
    this.accentLight.position.set(0, 4, 0);
    this.scene.add(this.accentLight);
  }

  /**
   * カメラの正射影範囲をアスペクト比に合わせて更新する。
   * 縦方向のワールド表示量（viewSize * 2）を一定に保つため、
   * 画面サイズが変わっても茶碗と操作範囲の縮尺は維持される。
   */
  private handleResize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const v = CONFIG.camera.viewSize;

    this.camera.left = -v * aspect;
    this.camera.right = v * aspect;
    this.camera.top = v;
    this.camera.bottom = -v;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
  }

  onUpdate(cb: UpdateCallback): void {
    this.updateCallbacks.push(cb);
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05); // スパイク抑制
    for (const cb of this.updateCallbacks) cb(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
