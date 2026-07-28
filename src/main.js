import * as THREE from "https://unpkg.com/three@0.166.1/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.166.1/examples/jsm/controls/PointerLockControls.js";

const canvas = document.querySelector("#scene");
const intro = document.querySelector("#intro");
const enter = document.querySelector("#enter");
const hud = document.querySelector("#hud");
const crosshair = document.querySelector("#crosshair");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x100d0a);
scene.fog = new THREE.FogExp2(0x100d0a, 0.038);

const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7.6, 12.2);
camera.lookAt(0, 0.9, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new PointerLockControls(camera, document.body);

function showTable() {
  intro.classList.add("hidden");
  hud.classList.add("visible");
  crosshair.classList.add("visible");
}
function showIntro() {
  intro.classList.remove("hidden");
  hud.classList.remove("visible");
  crosshair.classList.remove("visible");
}

controls.addEventListener("unlock", showIntro);

enter.addEventListener("click", () => {
  showTable();
  try {
    controls.lock();
  } catch {
    // Pointer Lock unsupported/blocked (touch devices, some embedded
    // browsers) — the drag-to-look fallback below still lets the
    // player look around, so the table stays visible either way.
  }
});

let dragging = false;
let lastX = 0;
let lastY = 0;
let yaw = 0;
let pitch = 0;
canvas.addEventListener("pointerdown", (event) => {
  if (controls.isLocked) return;
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
});
addEventListener("pointerup", () => { dragging = false; });
addEventListener("pointermove", (event) => {
  if (!dragging || controls.isLocked) return;
  yaw -= (event.clientX - lastX) * 0.0035;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - (event.clientY - lastY) * 0.0035));
  lastX = event.clientX;
  lastY = event.clientY;
  camera.rotation.set(pitch, yaw, 0, "YXZ");
});

const wood = new THREE.MeshStandardMaterial({ color: 0x442315, roughness: .3, metalness: .08 });
const edgeWood = new THREE.MeshStandardMaterial({ color: 0x1e0d08, roughness: .22, metalness: .2 });
const felt = new THREE.MeshStandardMaterial({ color: 0x18352f, roughness: .78, metalness: 0 });
const gold = new THREE.MeshStandardMaterial({ color: 0xc88635, roughness: .22, metalness: .76 });
const ivory = new THREE.MeshPhysicalMaterial({ color: 0xe7dac0, roughness: .21, metalness: .03, clearcoat: .42 });
const black = new THREE.MeshPhysicalMaterial({ color: 0x101113, roughness: .15, metalness: .34, clearcoat: .7 });
const creamPoint = new THREE.MeshStandardMaterial({ color: 0xdfc18c, roughness: .52 });
const brownPoint = new THREE.MeshStandardMaterial({ color: 0x63291d, roughness: .43 });

function box(width, height, depth, material, x = 0, y = 0, z = 0, bevel = false) {
  const geometry = bevel
    ? new THREE.BoxGeometry(width, height, depth, 3, 2, 3)
    : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function point(x0, x1, zOuter, zTip, material) {
  const shape = new THREE.Shape();
  shape.moveTo(x0, zOuter);
  shape.lineTo(x1, zOuter);
  shape.lineTo((x0 + x1) / 2, zTip);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .335;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function addBoard() {
  box(15.6, .45, 10.9, edgeWood, 0, 0, 0, true);
  box(14.6, .18, 9.9, wood, 0, .28, 0, true);
  box(13.35, .1, 8.65, felt, 0, .42, 0);
  box(.72, .22, 8.83, edgeWood, 0, .5, 0);
  [-7.36, 7.36].forEach(x => box(.42, .85, 10.5, edgeWood, x, .58, 0));
  [-4.95, 4.95].forEach(z => box(14.7, .85, .42, edgeWood, 0, .58, z));
  [-3.63, 3.63].forEach(x => box(.13, .13, 8.7, gold, x, .5, 0));

  const starts = [-6.55, -5.47, -4.39, -3.31, -2.23, -1.15, 1.15, 2.23, 3.31, 4.39, 5.47, 6.55];
  starts.forEach((x, i) => {
    point(x - .48, x + .48, -4.15, -.3, i % 2 ? brownPoint : creamPoint);
    point(x - .48, x + .48, 4.15, .3, i % 2 ? creamPoint : brownPoint);
  });

  const rail = new THREE.Mesh(new THREE.TorusGeometry(7.12, .06, 12, 100, Math.PI), gold);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = .84;
  rail.scale.z = .69;
  scene.add(rail);

  for (const x of [-6.4, 6.4]) {
    for (const z of [-4.15, 4.15]) {
      const ornament = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .07, 20), gold);
      ornament.position.set(x, .88, z);
      ornament.castShadow = true;
      scene.add(ornament);
    }
  }
}

function checker(x, z, material, stack = 1) {
  const group = new THREE.Group();
  for (let i = 0; i < stack; i++) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.47, .52, .16, 48), material);
    body.position.y = .63 + i * .18;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.4, .026, 8, 42), material === ivory ? gold : edgeWood);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .72 + i * .18;
    group.add(ring);
  }
  group.position.set(x, 0, z);
  scene.add(group);
}
function dice(x, z, face) {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xd9cab0, roughness: .28, clearcoat: .3 });
  const die = new THREE.Mesh(new THREE.BoxGeometry(.72, .72, .72, 3, 3, 3), material);
  die.position.set(x, 1.02, z);
  die.rotation.set(.16, .34, -.1);
  die.castShadow = true;
  scene.add(die);
  const dots = [[-.16, .38], [.16, .38], [0, 0], [-.16, -.38], [.16, -.38]];
  dots.slice(0, face).forEach(([dx, dz]) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), black);
    dot.position.set(x + dx, 1.4, z + dz);
    scene.add(dot);
  });
}
function addPieces() {
  [[-6.05,-3.55,black,2],[-4.95,-3.55,black,5],[-2.75,-3.55,black,3],[5.95,-3.55,black,5],
   [6.05,3.55,ivory,2],[4.95,3.55,ivory,5],[2.75,3.55,ivory,3],[-5.95,3.55,ivory,5]]
    .forEach(args => checker(...args));
  checker(-.1, 0, ivory, 1);
  dice(-.34, -.2, 5);
  dice(.5, .25, 4);
}

function addRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x17110d, roughness: .88 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.25;
  floor.receiveShadow = true;
  scene.add(floor);

  const lamp = new THREE.PointLight(0xffb85a, 34, 28, 2);
  lamp.position.set(0, 9, 1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  scene.add(lamp);
  const pendant = new THREE.Mesh(new THREE.CylinderGeometry(1.4, .8, .6, 32), gold);
  pendant.position.set(0, 9.6, 1);
  scene.add(pendant);
  const fill = new THREE.HemisphereLight(0x8fa9ae, 0x20150d, 1.1);
  scene.add(fill);
  const side = new THREE.DirectionalLight(0x7a9aa4, 2.1);
  side.position.set(-8, 8, 5);
  scene.add(side);
}

addRoom();
addBoard();
addPieces();

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  const lamp = scene.children.find(o => o.isPointLight);
  if (lamp) lamp.intensity = 32 + Math.sin(elapsed * 1.4) * 1.3;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
