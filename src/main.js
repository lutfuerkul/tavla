import * as THREE from "../vendor/three/three.module.min.js";
import { PointerLockControls } from "../vendor/three/examples/jsm/controls/PointerLockControls.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("#scene");
const intro = document.querySelector("#intro");
const enter = document.querySelector("#enter");
const hud = document.querySelector("#hud");
const crosshair = document.querySelector("#crosshair");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x100d0a);
scene.fog = new THREE.FogExp2(0x100d0a, 0.038);

const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 9.6, 9.4);
camera.lookAt(0, 0.6, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Soft studio-style reflections for the metal, lacquer and clearcoat
// surfaces below — generated in-scene so no external HDR asset is needed.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

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

// Procedural grain so the wood reads as real timber instead of a flat
// color — a handful of soft bezier streaks plus a few darker knots.
function woodGrainTexture(base, grain, repeatX, repeatY) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 30; i++) {
    const y = (i / 30) * size + (Math.random() - 0.5) * 8;
    ctx.strokeStyle = grain;
    ctx.globalAlpha = 0.07 + Math.random() * 0.1;
    ctx.lineWidth = 1 + Math.random() * 2.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      size * 0.3, y + (Math.random() - 0.5) * 26,
      size * 0.7, y + (Math.random() - 0.5) * 26,
      size, y + (Math.random() - 0.5) * 14
    );
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.05;
    ctx.fillStyle = grain;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * size, Math.random() * size,
      40 + Math.random() * 60, 6 + Math.random() * 9,
      Math.random() * Math.PI, 0, Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Faint per-pixel noise so the felt reads as woven cloth rather than a
// flat fill under close-up lighting.
function feltTexture(base) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const wood = new THREE.MeshPhysicalMaterial({
  map: woodGrainTexture("#6b3a1d", "#2c1608", 5, 1.4),
  roughness: .34, metalness: .04, clearcoat: .3, clearcoatRoughness: .28,
});
const edgeWood = new THREE.MeshPhysicalMaterial({
  map: woodGrainTexture("#2b160b", "#140a04", 6, 2.6),
  roughness: .22, metalness: .1, clearcoat: .55, clearcoatRoughness: .18,
});
const felt = new THREE.MeshStandardMaterial({ map: feltTexture("#17352f"), roughness: .82, metalness: 0 });
const gold = new THREE.MeshStandardMaterial({ color: 0xd0943f, roughness: .16, metalness: .85 });
const ivory = new THREE.MeshPhysicalMaterial({ color: 0xefe2c8, roughness: .18, metalness: .02, clearcoat: .55, clearcoatRoughness: .12 });
const black = new THREE.MeshPhysicalMaterial({ color: 0x111214, roughness: .12, metalness: .28, clearcoat: .75, clearcoatRoughness: .08 });
const creamPoint = new THREE.MeshStandardMaterial({ color: 0xe4c896, roughness: .48 });
const brownPoint = new THREE.MeshStandardMaterial({ color: 0x6e2e1f, roughness: .4 });

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
  mesh.position.y = .476;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// x-position of each of the 12 points along one edge of the board.
// Mirrored front/back, this lays out the full 24-point board.
const starts = [-6.55, -5.47, -4.39, -3.31, -2.23, -1.15, 1.15, 2.23, 3.31, 4.39, 5.47, 6.55];

function addBoard() {
  box(15.6, .45, 10.9, edgeWood, 0, 0, 0, true);
  box(14.6, .18, 9.9, wood, 0, .28, 0, true);
  box(13.35, .1, 8.65, felt, 0, .42, 0);
  box(.72, .22, 8.83, edgeWood, 0, .5, 0);
  [-7.36, 7.36].forEach(x => box(.42, .85, 10.5, edgeWood, x, .58, 0));
  [-4.95, 4.95].forEach(z => box(14.7, .85, .42, edgeWood, 0, .58, z));
  [-3.63, 3.63].forEach(x => box(.13, .13, 8.7, gold, x, .5, 0));

  starts.forEach((x, i) => {
    point(x - .48, x + .48, -4.15, -.3, i % 2 ? brownPoint : creamPoint);
    point(x - .48, x + .48, 4.15, .3, i % 2 ? creamPoint : brownPoint);
  });

  const rail = new THREE.Mesh(new THREE.TorusGeometry(7.12, .06, 12, 100, Math.PI), gold);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = .84;
  rail.scale.z = .69;
  scene.add(rail);
}

function checker(x, z, material, stack = 1) {
  const group = new THREE.Group();
  for (let i = 0; i < stack; i++) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.47, .52, .16, 48), material);
    body.position.y = .55 + i * .16;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.4, .026, 8, 42), material === ivory ? gold : edgeWood);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .64 + i * .16;
    group.add(ring);
  }
  group.position.set(x, 0, z);
  scene.add(group);
}

function dice(x, z, face) {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xefe6d3, roughness: .22, metalness: 0, clearcoat: .5, clearcoatRoughness: .1 });
  const die = new THREE.Mesh(new THREE.BoxGeometry(.72, .72, .72, 3, 3, 3), material);
  die.position.set(x, .83, z);
  die.rotation.set(.16, .34, -.1);
  die.castShadow = true;
  scene.add(die);
  const dots = [[-.16, .38], [.16, .38], [0, 0], [-.16, -.38], [.16, -.38]];
  dots.slice(0, face).forEach(([dx, dz]) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), black);
    dot.position.set(x + dx, 1.21, z + dz);
    scene.add(dot);
  });
}

// Standard backgammon starting position, 15 checkers per side:
// 2 on each player's 24-point, 5 on the 13-point, 3 on the 8-point,
// 5 on the 6-point. Point 24/13 sit on the far row, 8/6 on the near
// row, mirrored front-to-back between the two colors.
function addPieces() {
  const farRow = 3.55;
  const nearRow = -3.55;
  [
    [starts[11], farRow, ivory, 2],   // white: 24-point
    [starts[0], farRow, ivory, 5],    // white: 13-point
    [starts[4], nearRow, ivory, 3],   // white: 8-point
    [starts[6], nearRow, ivory, 5],   // white: 6-point
    [starts[11], nearRow, black, 2],  // black: 1-point
    [starts[0], nearRow, black, 5],   // black: 12-point
    [starts[4], farRow, black, 3],    // black: 17-point
    [starts[6], farRow, black, 5],    // black: 19-point
  ].forEach(args => checker(...args));
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
