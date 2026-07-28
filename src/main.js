import * as THREE from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("#scene");
const intro = document.querySelector("#intro");
const enter = document.querySelector("#enter");
const hud = document.querySelector("#hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060402);
scene.fog = new THREE.FogExp2(0x060402, 0.04);

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
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Soft studio-style reflections for the lacquer and clearcoat surfaces
// below — generated in-scene so no external HDR asset is needed.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

enter.addEventListener("click", () => {
  intro.classList.add("hidden");
  hud.classList.add("visible");
});

// Advanced Perlin-like noise function for organic wood grain
function noise(x, y, seed = 0) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

// Fractional Brownian Motion - multi-octave noise for realistic texture
function fbm(x, y, octaves = 6, seed = 0) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * (noise(x * frequency, y * frequency, seed + i) * 2 - 1);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

// Professional rosewood grain using advanced procedural generation
// Matches reference board with organic, realistic wood appearance
function woodPanelTexture(w, h, base, grain, eyes) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  // Parse colors
  const baseRGB = hexToRgb(base);
  const grainRGB = hexToRgb(grain);

  // Generate wood texture using advanced FBM with directional bias
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Directional bias towards vertical grain (like real wood)
      const xBias = x / 180;
      const yBias = y / 120;

      // Multi-scale noise - aggressive for dramatic grain
      const scale1 = fbm(xBias, yBias, 5, 0);
      const scale2 = fbm(xBias * 2.5, yBias * 1.8, 6, 100);
      const scale3 = fbm(xBias * 4, yBias * 3.2, 4, 200);

      // Waviness pattern - simulates wood fiber variation
      const wave = Math.sin(y / 35) * 0.3 + Math.cos(x / 45) * 0.2;

      // Combine scales with aggressive weights
      const grain1 = scale1 * 0.55;
      const grain2 = scale2 * 0.3;
      const grain3 = scale3 * 0.15;

      const grainAmount = grain1 + grain2 + grain3 + wave;
      const normalized = Math.max(0, Math.min(1, (grainAmount + 1) * 0.55));

      // Interpolate with increased grain intensity for dramatic effect
      const intensity = normalized * 1.1;
      const r = Math.round(baseRGB.r + (grainRGB.r - baseRGB.r) * intensity);
      const g = Math.round(baseRGB.g + (grainRGB.g - baseRGB.g) * intensity);
      const b = Math.round(baseRGB.b + (grainRGB.b - baseRGB.b) * intensity);

      const idx = (y * w + x) * 4;
      data[idx] = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Add extremely prominent wood grain streaks - dramatic visual impact
  for (let i = 0; i < 95; i++) {
    const y = Math.random() * h;
    const intensity = 0.15 + Math.random() * 0.28;
    const gradient = ctx.createLinearGradient(0, y - 6, 0, y + 6);
    gradient.addColorStop(0, `rgba(${grainRGB.r}, ${grainRGB.g}, ${grainRGB.b}, 0)`);
    gradient.addColorStop(0.5, `rgba(${grainRGB.r}, ${grainRGB.g}, ${grainRGB.b}, ${intensity})`);
    gradient.addColorStop(1, `rgba(${grainRGB.r}, ${grainRGB.g}, ${grainRGB.b}, 0)`);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2 + Math.random() * 4.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      w * 0.18, y + (Math.random() - 0.5) * 40,
      w * 0.82, y + (Math.random() - 0.5) * 40,
      w, y + (Math.random() - 0.5) * 22
    );
    ctx.stroke();
  }

  // Add wood grain eyes (burls)
  (eyes || []).forEach(([ex, ey, r]) => {
    for (let ring = 12; ring > 0; ring--) {
      const alpha = (0.04 + (12 - ring) * 0.003) * (1 - ring / 12);
      ctx.strokeStyle = grain;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.8 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.ellipse(ex, ey, (r * ring) / 12, (r * ring) / 12 * 0.63, Math.random() * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Helper to convert hex color to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
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

const frame = new THREE.MeshPhysicalMaterial({
  color: 0x0f0a06,
  roughness: .24,
  metalness: .16,
  clearcoat: .62,
  clearcoatRoughness: .1
});
const bevel = new THREE.MeshPhysicalMaterial({
  map: woodPanelTexture(512, 512, "#1a1208", "#040100"),
  roughness: .18,
  metalness: .14,
  clearcoat: .68,
  clearcoatRoughness: .08,
});
const panel = new THREE.MeshPhysicalMaterial({
  map: woodPanelTexture(1024, 640, "#2a1d0c", "#030100", [[256, 320, 95], [768, 320, 95]]),
  roughness: .16,
  metalness: .12,
  clearcoat: .72,
  clearcoatRoughness: .06,
});
const brass = new THREE.MeshStandardMaterial({ color: 0xe0c9a0, roughness: .22, metalness: .88 });
const pearl = new THREE.MeshStandardMaterial({ color: 0xfefcfa, roughness: .22, metalness: 0 });
const ivory = new THREE.MeshPhysicalMaterial({
  color: 0xfaf7f0,
  roughness: .1,
  metalness: 0,
  clearcoat: .9,
  clearcoatRoughness: .02
});
const black = new THREE.MeshPhysicalMaterial({
  color: 0x080809,
  roughness: .06,
  metalness: .18,
  clearcoat: .92,
  clearcoatRoughness: .01
});
const marquetryA = new THREE.MeshStandardMaterial({
  map: triangleTexture,
  roughness: .28,
  metalness: .02
});
const marquetryB = new THREE.MeshStandardMaterial({
  map: triangleTextureFlipped,
  roughness: .28,
  metalness: .02
});

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

// Premium flat disc checker - precisely matching reference board proportions
// Shallow dome with perfect rim for professional bakelite appearance
const checkerGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0, .02),
  new THREE.Vector2(.34, .026),
  new THREE.Vector2(.57, .038),
  new THREE.Vector2(.60, .032),
  new THREE.Vector2(.60, .005),
  new THREE.Vector2(.55, 0),
  new THREE.Vector2(0, 0),
], 64);

function dice(x, z, face) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xfdfbf8,
    roughness: .09,
    metalness: 0,
    clearcoat: .88,
    clearcoatRoughness: .02
  });
  const size = .38;
  const die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size, 6, 6, 6), material);
  die.position.set(x, .47 + size / 2, z);
  die.rotation.set(.14, .3, -.08);
  die.castShadow = true;
  die.receiveShadow = true;
  scene.add(die);
  const dots = [[-.11, .19], [.11, .19], [0, 0], [-.11, -.19], [.11, -.19]];
  dots.slice(0, face).forEach(([dx, dz]) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.035, 20, 16), black);
    dot.position.set(x + dx, .47 + size + .025, z + dz);
    dot.castShadow = true;
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x050301, roughness: .95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.25;
  floor.receiveShadow = true;
  scene.add(floor);

  // Gallery-quality main key light - warm professional tone
  const lamp = new THREE.PointLight(0xffe4a8, 38, 34, 2);
  lamp.position.set(1.2, 11, 2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0002;
  scene.add(lamp);

  // Sophisticated fill light with blue tone for professional look
  const fill = new THREE.HemisphereLight(0xb0c8d8, 0x0a0603, 1.5);
  scene.add(fill);

  // Strong primary side light for piece definition
  const side = new THREE.DirectionalLight(0xc0dce8, 2.4);
  side.position.set(-9, 13, 7);
  side.castShadow = true;
  side.shadow.mapSize.set(2048, 2048);
  scene.add(side);

  // Secondary side light from opposite direction
  const sideB = new THREE.DirectionalLight(0xa8b8c0, 0.8);
  sideB.position.set(6, 10, -5);
  scene.add(sideB);

  // Subtle back light for rim highlighting
  const back = new THREE.DirectionalLight(0x9ba8b0, 1.1);
  back.position.set(5, 9, -10);
  scene.add(back);
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
