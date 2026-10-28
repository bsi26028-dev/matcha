import * as THREE from "three";

/**
 * 茶杓（ちゃしゃく）の仮モデル。細い柄の先に小さなすくい部。
 * 原点をすくい部の中心とし、真上視点でも向きがわかる形にする。
 */
export function createChashaku(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "Chashaku";

  const bamboo = new THREE.MeshStandardMaterial({
    color: 0xcdb87a,
    roughness: 0.7,
  });

  // 柄（長い棒）
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10),
    bamboo,
  );
  handle.rotation.z = Math.PI / 2; // X 方向へ寝かせる
  handle.position.x = 0.45;
  handle.castShadow = true;
  group.add(handle);

  // すくい部（浅い碗）
  const scoop = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    bamboo,
  );
  scoop.rotation.x = Math.PI; // お椀を伏せる向き
  scoop.position.y = 0.02;
  scoop.castShadow = true;
  group.add(scoop);

  return group;
}

/**
 * やかんの仮モデル。胴（円柱）と注ぎ口（細い円柱）。
 * 原点を注ぎ口の先端あたりとし、ここからお湯が出るイメージ。
 */
export function createKettle(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "Kettle";

  const metal = new THREE.MeshStandardMaterial({
    color: 0x3a3f44,
    roughness: 0.4,
    metalness: 0.6,
  });

  // 胴
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.4, 20),
    metal,
  );
  body.position.set(0.5, 0.05, 0);
  body.castShadow = true;
  group.add(body);

  // 蓋のつまみ
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 8),
    metal,
  );
  knob.position.set(0.5, 0.28, 0);
  group.add(knob);

  // 注ぎ口（原点付近へ伸びる）
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.07, 0.4, 12),
    metal,
  );
  spout.rotation.z = Math.PI / 2.6;
  spout.position.set(0.18, 0.08, 0);
  spout.castShadow = true;
  group.add(spout);

  return group;
}
