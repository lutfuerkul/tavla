import * as THREE from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("#scene");
const intro = document.querySelector("#intro");
const enter = document.querySelector("#enter");
const hud = document.querySelector("#hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a08);
scene.fog = new THREE.FogExp2(0x0c0a08, 0.045);

// Fixed, near-top-down seat at the table — the camera never moves once
// seated, so the mouse is free to drag checkers instead of looking around.
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

enter.addEventListener("click", () => {
  intro.classList.add("hidden");
  hud.classList.add("visible");
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

// The 24 triangle points use a real photo of a maple marquetry point,
// cropped from the reference board, instead of a flat painted color.
const triangleLoader = new THREE.TextureLoader();
const triangleTexture = triangleLoader.load(new URL("./assets/triangle.png", import.meta.url).href);
triangleTexture.colorSpace = THREE.SRGBColorSpace;
const triangleTextureFlipped = triangleTexture.clone();
triangleTextureFlipped.center.set(0.5, 0.5);
triangleTextureFlipped.rotation = Math.PI;
triangleTextureFlipped.needsUpdate = true;

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
const ivory = new THREE.MeshPhysicalMaterial({ color: 0xe9e2d2, roughness: .22, metalness: 0, clearcoat: .65, clearcoatRoughness: .1 });
const black = new THREE.MeshPhysicalMaterial({ color: 0x18191a, roughness: .2, metalness: .05, clearcoat: .7, clearcoatRoughness: .08 });
const marquetryA = new THREE.MeshStandardMaterial({ map: triangleTexture, roughness: .4 });
const marquetryB = new THREE.MeshStandardMaterial({ map: triangleTextureFlipped, roughness: .4 });

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
const NEAR_Z = -3.55;
const FAR_Z = 3.55;

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

function dice(x, z, face) {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xf3ede0, roughness: .2, metalness: 0, clearcoat: .55, clearcoatRoughness: .1 });
  const size = .33;
  const die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size, 3, 3, 3), material);
  die.position.set(x, .47 + size / 2, z);
  die.rotation.set(.14, .3, -.08);
  die.castShadow = true;
  scene.add(die);
  const dots = [[-.08, .17], [.08, .17], [0, 0], [-.08, -.17], [.08, -.17]];
  dots.slice(0, face).forEach(([dx, dz]) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.026, 14, 10), black);
    dot.position.set(x + dx, .47 + size + .01, z + dz);
    scene.add(dot);
  });
}

// --- Checker positions & drag-to-move -------------------------------
// Point numbering follows the standard 1-24 convention. Points 1-12 sit
// on the near row, 13-24 on the far row, mirrored across the bar.
const POINTS = {};
starts.forEach((x, i) => {
  POINTS[12 - i] = { x, z: NEAR_Z };
  POINTS[13 + i] = { x, z: FAR_Z };
});
POINTS.barW = { x: .18, z: 0 };
POINTS.barB = { x: -.18, z: 0 };

let state = {};
function resetState() {
  state = {};
  for (let n = 1; n <= 24; n++) state[n] = { color: null, count: 0 };
  state.barW = { color: "ivory", count: 0 };
  state.barB = { color: "black", count: 0 };
  // Standard backgammon starting position, 15 checkers per side.
  state[24] = { color: "ivory", count: 2 };
  state[13] = { color: "ivory", count: 5 };
  state[8] = { color: "ivory", count: 3 };
  state[6] = { color: "ivory", count: 5 };
  state[1] = { color: "black", count: 2 };
  state[12] = { color: "black", count: 5 };
  state[17] = { color: "black", count: 3 };
  state[19] = { color: "black", count: 5 };
}

const piecesGroup = new THREE.Group();
scene.add(piecesGroup);
let pieceMeshes = [];

function renderPieces() {
  piecesGroup.clear();
  pieceMeshes = [];
  for (const key in state) {
    const s = state[key];
    if (!s.count) continue;
    const { x, z } = POINTS[key];
    const material = s.color === "ivory" ? ivory : black;
    for (let i = 0; i < s.count; i++) {
      const body = new THREE.Mesh(checkerGeometry, material);
      body.position.set(x, .47 + i * .09, z);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.pointKey = key;
      piecesGroup.add(body);
      pieceMeshes.push(body);
    }
  }
}

function tryMove(fromKey, toKey, color) {
  if (fromKey === toKey) return;
  const dest = state[toKey];
  if (dest.count > 0 && dest.color !== color) {
    if (dest.count === 1) {
      // A single opposing checker gets hit and sent to the bar.
      const oppBar = dest.color === "ivory" ? "barW" : "barB";
      state[oppBar].count++;
      state[oppBar].color = dest.color;
      dest.count = 0;
      dest.color = null;
    } else {
      return; // Point is made by the opponent — can't land here.
    }
  }
  state[fromKey].count--;
  if (state[fromKey].count === 0) state[fromKey].color = null;
  dest.color = color;
  dest.count = (dest.count || 0) + 1;
  renderPieces();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
let dragging = null;

function setPointerFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

canvas.addEventListener("pointerdown", (e) => {
  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pieceMeshes, false);
  if (!hits.length) return;
  const key = hits[0].object.userData.pointKey;
  if (!state[key] || !state[key].count) return;
  dragging = { fromKey: key, color: state[key].color };
  canvas.style.cursor = "grabbing";
});

addEventListener("pointerup", (e) => {
  if (!dragging) return;
  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, hit)) {
    let bestKey = null, bestDist = Infinity;
    for (const key in POINTS) {
      const p = POINTS[key];
      const d = (p.x - hit.x) ** 2 + (p.z - hit.z) ** 2;
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    if (bestKey) tryMove(dragging.fromKey, bestKey, dragging.color);
  }
  dragging = null;
  canvas.style.cursor = "grab";
});

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
resetState();
renderPieces();
dice(-.28, -.15, 5);
dice(.32, .2, 4);

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
