import * as THREE from "three";

/**
 * 茶碗を置く木目のテーブル（背景・床）。
 *
 * - XZ 平面に広い板を敷き、茶碗の下（原点付近）に配置する。
 * - 木目は Canvas で手続き生成したテクスチャで表現する。
 * - MeshStandardMaterial を使うことで、影を受け取れる（receiveShadow）。
 *
 * 正射影の真上視点でも全アスペクト比で画面を覆えるよう、十分大きくする。
 */
export class Table {
  readonly mesh: THREE.Mesh;
  private readonly texture: THREE.Texture;

  constructor(y: number = -0.02) {
    this.texture = makeWoodTexture();

    const geometry = new THREE.PlaneGeometry(30, 30);
    const material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.72,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "Table";
    // PlaneGeometry は XY 平面に生成されるので XZ 平面へ寝かせる。
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = y;
    this.mesh.receiveShadow = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}

/** Canvas で木目テクスチャを手続き生成する。 */
function makeWoodTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    // 2D コンテキストが取れない環境でも破綻しないよう単色でフォールバック。
    const fallback = new THREE.CanvasTexture(canvas);
    return fallback;
  }

  // ベースの木地（縦方向のグラデーション）
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#7a5533");
  grad.addColorStop(0.5, "#8a6038");
  grad.addColorStop(1, "#6f4b2c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 木目の筋（横方向。サイン波で揺らしつつ濃淡を重ねる）
  ctx.lineWidth = 1;
  for (let i = 0; i < 140; i++) {
    const baseY = (i / 140) * size;
    const amp = 3 + Math.random() * 7;
    const freq = 0.01 + Math.random() * 0.02;
    const phase = Math.random() * Math.PI * 2;
    const dark = Math.random() < 0.5;
    ctx.strokeStyle = dark
      ? `rgba(60,40,22,${0.05 + Math.random() * 0.12})`
      : `rgba(170,130,85,${0.04 + Math.random() * 0.1})`;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const y = baseY + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 板の継ぎ目（等間隔のやや濃い横線）
  const plankCount = 5;
  ctx.strokeStyle = "rgba(45,30,18,0.5)";
  ctx.lineWidth = 2;
  for (let p = 1; p < plankCount; p++) {
    const y = (p / plankCount) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
