import * as THREE from "../vendor/three/three.module.min.js";
import { PointerLockControls } from "../vendor/three/examples/jsm/controls/PointerLockControls.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("#scene");
const intro = document.querySelector("#intro");
const enter = document.querySelector("#enter");
const hud = document.querySelector("#hud");
const crosshair = document.querySelector("#crosshair");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a08);
scene.fog = new THREE.FogExp2(0x0c0a08, 0.045);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 12.4, 3.6);
camera.lookAt(0, 0.4, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Soft studio-style reflections for the lacquer and clearcoat surfaces
// below — generated in-scene so no external HDR asset is needed.
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

// Rosewood grain with a bezier-streak pattern plus a couple of oval
// "eyes" (like the burl centerpiece on a real folding board's panels).
function woodPanelTexture(w, h, base, grain, eyes) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = grain;
    ctx.globalAlpha = 0.05 + Math.random() * 0.09;
    ctx.lineWidth = 1 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      w * 0.3, y + (Math.random() - 0.5) * 22,
      w * 0.7, y + (Math.random() - 0.5) * 22,
      w, y + (Math.random() - 0.5) * 14
    );
    ctx.stroke();
  }
  (eyes || []).forEach(([ex, ey, r]) => {
    for (let ring = 8; ring > 0; ring--) {
      ctx.strokeStyle = grain;
      ctx.globalAlpha = 0.03 + (8 - ring) * 0.008;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ex, ey, (r * ring) / 8, (r * ring) / 8 * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Pale maple inlay with a soft feathered chevron grain, used for every
// triangle point — a natural-wood marquetry look rather than flat paint.
function marquetryTexture(shade) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#3a2210";
  for (let i = 0; i < 34; i++) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.06;
    ctx.lineWidth = 1 + Math.random();
    const y = (i / 34) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const frame = new THREE.MeshPhysicalMaterial({ color: 0x14100d, roughness: .38, metalness: .06, clearcoat: .35, clearcoatRoughness: .3 });
const bevel = new THREE.MeshPhysicalMaterial({
  map: woodPanelTexture(512, 512, "#3a2013", "#180b05"),
  roughness: .3, metalness: .05, clearcoat: .4, clearcoatRoughness: .25,
});
const panel = new THREE.MeshPhysicalMaterial({
  map: woodPanelTexture(1024, 640, "#4a2a18", "#231007", [[256, 320, 95], [768, 320, 95]]),
  roughness: .28, metalness: .03, clearcoat: .5, clearcoatRoughness: .2,
});
const brass = new THREE.MeshStandardMaterial({ color: 0xcda15a, roughness: .28, metalness: .82 });
const pearl = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: .35, metalness: 0 });
const ivory = new THREE.MeshPhysicalMaterial({ color: 0xefe6d5, roughness: .22, metalness: 0, clearcoat: .65, clearcoatRoughness: .1 });
const black = new THREE.MeshPhysicalMaterial({ color: 0x161513, roughness: .2, metalness: .05, clearcoat: .7, clearcoatRoughness: .08 });
const marquetryA = new THREE.MeshStandardMaterial({ map: marquetryTexture("#e2c68f"), roughness: .42 });
const marquetryB = new THREE.MeshStandardMaterial({ map: marquetryTexture("#d9bb80"), roughness: .42 });

function box(width, height, depth, material, x = 0, y = 0, z = 0, bevelGeo = false) {
  const geometry = bevelGeo
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
  box(15.6, .45, 10.9, frame, 0, 0, 0, true);
  box(14.6, .18, 9.9, bevel, 0, .28, 0, true);
  box(13.35, .1, 8.65, panel, 0, .42, 0);
  box(.72, .22, 8.83, frame, 0, .5, 0);

  starts.forEach((x, i) => {
    point(x - .48, x + .48, -4.15, -.3, i % 2 ? marquetryB : marquetryA);
    point(x - .48, x + .48, 4.15, .3, i % 2 ? marquetryA : marquetryB);
  });

  // Brass hinge pins across the centre seam, like a folding board's hinges.
  [-1.6, 1.6].forEach(z => {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .5, 16), brass);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, .58, z);
    hinge.castShadow = true;
    scene.add(hinge);
  });

  // Small pearl position markers set into the long rails.
  [-7.36, 7.36].forEach(x => {
    [-3, -1, 1, 3].forEach(z => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 10), pearl);
      dot.position.set(x, .62, z);
      scene.add(dot);
    });
  });
}

// Thin, dished disc — like a real bakelite/resin checker rather than a
// tall chunky puck. The lathe profile gives it a slightly concave top
// face and a rounded rim so it catches light the way a real piece does.
const checkerGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0, .028),
  new THREE.Vector2(.32, .036),
  new THREE.Vector2(.46, .085),
  new THREE.Vector2(.49, .07),
  new THREE.Vector2(.49, .012),
  new THREE.Vector2(.43, 0),
  new THREE.Vector2(0, 0),
], 40);

function checker(x, z, material, stack = 1) {
  const group = new THREE.Group();
  for (let i = 0; i < stack; i++) {
    const body = new THREE.Mesh(checkerGeometry, material);
    body.position.y = .47 + i * .09;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
  }
  group.position.set(x, 0, z);
  scene.add(group);
}

function dice(x, z, face) {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xf3ede0, roughness: .2, metalness: 0, clearcoat: .55, clearcoatRoughness: .1 });
  const size = .42;
  const die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size, 3, 3, 3), material);
  die.position.set(x, .47 + size / 2, z);
  die.rotation.set(.14, .3, -.08);
  die.castShadow = true;
  scene.add(die);
  const dots = [[-.1, .22], [.1, .22], [0, 0], [-.1, -.22], [.1, -.22]];
  dots.slice(0, face).forEach(([dx, dz]) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.032, 14, 10), black);
    dot.position.set(x + dx, .47 + size + .01, z + dz);
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
  dice(-.28, -.15, 5);
  dice(.32, .2, 4);
}

function addRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: .9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.25;
  floor.receiveShadow = true;
  scene.add(floor);

  const lamp = new THREE.PointLight(0xffb85a, 30, 28, 2);
  lamp.position.set(0, 9, 1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  scene.add(lamp);
  const fill = new THREE.HemisphereLight(0x8fa9ae, 0x20150d, 1.15);
  scene.add(fill);
  const side = new THREE.DirectionalLight(0x9aa7aa, 1.6);
  side.position.set(-6, 10, 4);
  scene.add(side);
}

addRoom();
addBoard();
addPieces();

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  const lamp = scene.children.find(o => o.isPointLight);
  if (lamp) lamp.intensity = 28 + Math.sin(elapsed * 1.4) * 1.2;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
