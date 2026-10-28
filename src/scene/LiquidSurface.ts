import * as THREE from "three";
import { CONFIG } from "../config";

/**
 * 抹茶の液面。茶碗の中に置く円形メッシュを ShaderMaterial で描く。
 *
 * 役割:
 *   - 抹茶の濃度で色が変わる
 *   - お湯の量で液面の高さが変わる（mesh.position.y）
 *   - 茶筅の位置に波紋（リング波）が発生する
 *   - 自然な光の反射（スペキュラ）を加える
 *   - 泡の量/細かさ/均一さに応じた微細な泡の膜を重ねる（大きな泡は別途 InstancedMesh）
 *
 * 高負荷な流体計算は行わず、波紋は数個のリング波の合成で表現する。
 */
export class LiquidSurface {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  /** 波紋データ (x, z, startTime, strength) を max 個ぶん保持。 */
  private readonly ripples: THREE.Vector4[] = [];
  private rippleCursor = 0;
  private time = 0;

  private lastX = 0;
  private lastZ = 0;
  private hasLast = false;
  private surfaceY: number;

  constructor(surfaceY: number) {
    this.surfaceY = surfaceY;

    const max = CONFIG.ripple.max;
    for (let i = 0; i < max; i++) {
      this.ripples.push(new THREE.Vector4(0, 0, -1000, 0));
    }

    const geometry = new THREE.CircleGeometry(CONFIG.bowl.liquidRadius, 96);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uConcentration: { value: 0.5 },
        uColorLight: { value: new THREE.Color(CONFIG.liquid.colorLight) },
        uColorDeep: { value: new THREE.Color(CONFIG.liquid.colorDeep) },
        uFoamColor: { value: new THREE.Color(CONFIG.liquid.foamColor) },
        uFoamAmount: { value: 0 },
        uFoamQuality: { value: 0 },
        uFoamUniformity: { value: 0 },
        uLightDir: {
          value: new THREE.Vector3(...CONFIG.liquid.lightDir).normalize(),
        },
        uSpecularPower: { value: CONFIG.liquid.specularPower },
        uSpecularIntensity: { value: CONFIG.liquid.specularIntensity },
        uRadius: { value: CONFIG.bowl.liquidRadius },
        uRipples: { value: this.ripples },
        uRippleDecay: { value: CONFIG.ripple.decay },
        uRippleSpeed: { value: CONFIG.ripple.speed },
        uRippleWidth: { value: CONFIG.ripple.width },
        uRippleFreq: { value: CONFIG.ripple.frequency },
        uRippleLife: { value: CONFIG.ripple.life },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: buildFragmentShader(CONFIG.ripple.max),
      // 濃度が低い（お湯だけ等）ほど透けて茶碗の底が見えるように半透明対応。
      transparent: true,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "LiquidSurface";
    // CircleGeometry は XY 平面に生成されるので XZ 平面へ寝かせる。
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = surfaceY;
  }

  /** 抹茶濃度（0〜1）を設定。 */
  setConcentration(c: number): void {
    this.material.uniforms.uConcentration.value = c;
  }

  /** 液面の高さを設定（お湯量の変化に対応）。 */
  setSurfaceY(y: number): void {
    this.surfaceY = y;
    this.mesh.position.y = y;
  }

  getSurfaceY(): number {
    return this.surfaceY;
  }

  /**
   * 泡の状態（0〜100）を 0〜1 に正規化して反映。
   * 微細な泡の膜に使う。大きな泡は FoamRenderer が担当する。
   */
  setFoam(foamAmount: number, foamQuality: number, foamUniformity: number): void {
    this.material.uniforms.uFoamAmount.value = foamAmount / 100;
    this.material.uniforms.uFoamQuality.value = foamQuality / 100;
    this.material.uniforms.uFoamUniformity.value = foamUniformity / 100;
  }

  /** 波紋を 1 つ追加する（リングバッファ）。 */
  addRipple(x: number, z: number, strength: number): void {
    const r = this.ripples[this.rippleCursor];
    r.set(x, z, this.time, strength);
    this.rippleCursor = (this.rippleCursor + 1) % this.ripples.length;
  }

  /**
   * 茶筅の位置から波紋を生成する。
   * 一定距離動くごとに新しいリングを落とす（速度に応じた強さ）。
   */
  spawnFromChasen(x: number, z: number, speed: number, _dt: number): void {
    if (speed < CONFIG.ripple.minSpeed) {
      // ほぼ停止。基準位置だけ更新しておく。
      this.lastX = x;
      this.lastZ = z;
      this.hasLast = true;
      return;
    }
    if (!this.hasLast) {
      this.lastX = x;
      this.lastZ = z;
      this.hasLast = true;
      return;
    }
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    if (Math.hypot(dx, dz) >= CONFIG.ripple.spawnDistance) {
      const strength = CONFIG.ripple.amplitude * Math.min(1, speed * 1.2);
      this.addRipple(x, z, strength);
      this.lastX = x;
      this.lastZ = z;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vWorldXZ;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

function buildFragmentShader(maxRipples: number): string {
  return /* glsl */ `
  precision highp float;

  #define MAX_RIPPLES ${maxRipples}

  varying vec2 vWorldXZ;

  uniform float uTime;
  uniform float uConcentration;
  uniform vec3 uColorLight;
  uniform vec3 uColorDeep;
  uniform vec3 uFoamColor;
  uniform float uFoamAmount;
  uniform float uFoamQuality;
  uniform float uFoamUniformity;
  uniform vec3 uLightDir;
  uniform float uSpecularPower;
  uniform float uSpecularIntensity;
  uniform float uRadius;
  uniform vec4 uRipples[MAX_RIPPLES];
  uniform float uRippleDecay;
  uniform float uRippleSpeed;
  uniform float uRippleWidth;
  uniform float uRippleFreq;
  uniform float uRippleLife;

  // --- ハッシュ & 値ノイズ ---
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * valueNoise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vWorldXZ;
    float dc = length(p);

    // --- 波紋による法線の計算（複数リング波の合成）---
    vec2 grad = vec2(0.0);
    for (int i = 0; i < MAX_RIPPLES; i++) {
      vec4 r = uRipples[i];
      float strength = r.w;
      if (strength <= 0.0) continue;
      float age = uTime - r.z;
      if (age < 0.0 || age > uRippleLife) continue;

      vec2 toP = p - r.xy;
      float d = length(toP);
      if (d < 1e-4) continue;

      float env = strength * exp(-uRippleDecay * age);
      float phase = d - uRippleSpeed * age;
      float g = exp(-(phase * phase) / (uRippleWidth * uRippleWidth));
      float dg = g * (-2.0 * phase / (uRippleWidth * uRippleWidth));
      // 高さ h = env * g * sin(freq*phase)
      // dH/dd = env * (dg*sin + g*freq*cos)
      float s = sin(uRippleFreq * phase);
      float c = cos(uRippleFreq * phase);
      float dHdd = env * (dg * s + g * uRippleFreq * c);
      grad += dHdd * (toP / d);
    }
    vec3 normal = normalize(vec3(-grad.x, 1.0, -grad.y));

    // --- 基本色（濃度で濃淡）---
    vec3 base = mix(uColorLight, uColorDeep, uConcentration);
    // 中心ほどわずかに濃く、深みを出す
    base *= 0.92 + 0.08 * (1.0 - dc / uRadius);

    // --- ライティング（拡散 + スペキュラ反射）---
    vec3 L = normalize(uLightDir);
    vec3 V = vec3(0.0, 1.0, 0.0); // 真上から見下ろす正射影
    vec3 H = normalize(L + V);
    float diff = 0.6 + 0.4 * max(dot(normal, L), 0.0);
    float spec = pow(max(dot(normal, H), 0.0), uSpecularPower) * uSpecularIntensity;
    vec3 color = base * diff + vec3(spec);

    // --- 微細な泡の膜 ---
    // 細かさが高いほど高周波（細かい）、均一さが高いほど一様に広がる。
    float freq = mix(7.0, 34.0, uFoamQuality);
    float n = fbm(p * freq + uTime * 0.15);
    // 均一さが低いとムラ（パッチ状）になる
    float patchiness = mix(fbm(p * 2.3), 1.0, uFoamUniformity);
    float radialMask = smoothstep(uRadius, uRadius * 0.55, dc); // 縁は泡を控えめに
    float coverage = smoothstep(1.0 - uFoamAmount, 1.0, n) * patchiness * radialMask;
    coverage *= uFoamAmount;
    color = mix(color, uFoamColor, clamp(coverage, 0.0, 1.0));

    // 濃度が低いほど透明に近づく（お湯だけ＝よく透ける）。泡がある所は不透明寄り。
    float alpha = mix(0.45, 1.0, clamp(uConcentration * 2.2, 0.0, 1.0));
    alpha = max(alpha, clamp(coverage, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;
}
