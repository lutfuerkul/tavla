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
camera.position.set(0, 17.6, 5.7);
camera.lookAt(0, 0.4, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Soft studio-style reflections for the lacquer and clearcoat surfaces
// below — generated in-scene so no external HDR asset is needed.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
// The room probe is only here to give the lacquer something to reflect. At
// full strength it lights the whole board and flattens every material.
scene.environmentIntensity = .3;

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

// Each point is drawn to match the reference marquetry: a grained body with
// a fine braided inlay band running up both edges, framed by hairlines. The
// photo crop this replaces was off-centre, so every point carried a wedge of
// somebody else's background wood.
function marquetryPointTexture(body, bodyShade, withInlay = true) {
  const W = 256, H = 768;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // UV v=0 is the base (textures are flipped in Y), so the tip points up.
  const apex = [W / 2, 12];
  const bl = [7, H - 5];
  const br = [W - 7, H - 5];
  const cx = (apex[0] + bl[0] + br[0]) / 3;
  const cy = (apex[1] + bl[1] + br[1]) / 3;
  const inset = (p, k) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];

  const tri = (a, b, d) => {
    const p = new Path2D();
    p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(d[0], d[1]); p.closePath();
    return p;
  };

  const outer = tri(apex, bl, br);
  const K = .88;
  const [aIn, blIn, brIn] = [inset(apex, K), inset(bl, K), inset(br, K)];
  const inner = tri(aIn, blIn, brIn);

  // Body: grained wood along the length of the point.
  ctx.save();
  ctx.clip(outer);
  const wash = ctx.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, body);
  wash.addColorStop(.55, bodyShade);
  wash.addColorStop(1, body);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    ctx.strokeStyle = bodyShade;
    ctx.globalAlpha = .05 + Math.random() * .13;
    ctx.lineWidth = .5 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + (Math.random() - .5) * 26, H / 2, x + (Math.random() - .5) * 18, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Only the pale maple points carry the braid. On the reference board the
  // dark points are the plain walnut field between them.
  if (withInlay) {
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const ring = new Path2D();
    ring.addPath(outer);
    ring.addPath(inner);
    ctx.save();
    ctx.clip(ring, "evenodd");
    ctx.fillStyle = "#2b1808";
    ctx.fill(outer);
    ctx.strokeStyle = "#efe2b4";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    [[bl, apex, blIn, aIn], [br, apex, brIn, aIn]].forEach(([o0, o1, i0, i1]) => {
      for (let t = 0; t < 1; t += .016) {
        const a = lerp(o0, o1, t);
        const b = lerp(i0, i1, t + .011);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    });
    ctx.restore();

    // Hairlines frame the braid along the two slanted edges only — the base
    // of a point runs straight into the rail, with no inlay across it.
    ctx.lineCap = "butt";
    [[bl, apex, blIn, aIn], [br, apex, brIn, aIn]].forEach(([o0, o1, i0, i1]) => {
      ctx.strokeStyle = "#f6ecc8";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(o0[0], o0[1]);
      ctx.lineTo(o1[0], o1[1]);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(i0[0], i0[1]);
      ctx.lineTo(i1[0], i1[1]);
      ctx.stroke();
    });
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Lacquered wood reads as a soft sheen, not a mirror: moderate clearcoat over
// a fairly rough diffuse base. Cranking gloss any higher blows the board out
// to white under the overhead light.
const frame = new THREE.MeshPhysicalMaterial({
  color: 0x120d09,
  roughness: .45,
  metalness: .04,
  clearcoat: .3,
  clearcoatRoughness: .22
});
const bevel = new THREE.MeshPhysicalMaterial({
  map: woodPanelTexture(512, 512, "#33210f", "#120802"),
  roughness: .42,
  metalness: .04,
  clearcoat: .3,
  clearcoatRoughness: .2,
});
const panel = new THREE.MeshPhysicalMaterial({
  map: woodPanelTexture(1024, 640, "#54381c", "#1d0e03", [[256, 320, 95], [768, 320, 95]]),
  roughness: .4,
  metalness: .03,
  clearcoat: .34,
  clearcoatRoughness: .18,
});
const brass = new THREE.MeshStandardMaterial({ color: 0xb99a63, roughness: .35, metalness: .8 });
const pearl = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: .4, metalness: 0 });
// The reference checkers are warm cream and dark graphite plastic — satin,
// with one soft highlight each, nowhere near mirror-bright.
// Warm ivory plastic with a soft sheen, and a near-black graphite that reads
// far glossier — in the photos the dark piece throws a hard highlight off its
// dome while the cream one stays satin.
const ivory = new THREE.MeshPhysicalMaterial({
  color: 0xeee2c0,
  roughness: .33,
  metalness: 0,
  clearcoat: .45,
  clearcoatRoughness: .18
});
const black = new THREE.MeshPhysicalMaterial({
  color: 0x141518,
  roughness: .16,
  metalness: .04,
  clearcoat: .7,
  clearcoatRoughness: .06
});
// Points alternate pale maple and dark walnut, both carrying the same inlay.
const marquetryA = new THREE.MeshStandardMaterial({
  map: marquetryPointTexture("#e4d6a6", "#c9b884"),
  roughness: .5,
  metalness: 0
});
const marquetryB = new THREE.MeshStandardMaterial({
  map: marquetryPointTexture("#432a13", "#2c1a09", false),
  roughness: .52,
  metalness: 0
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
  const geometry = new THREE.ShapeGeometry(shape);
  // ShapeGeometry hands back the raw 2D shape coordinates as UVs, which sit
  // far outside 0..1 here — the marquetry photo would just clamp to one edge
  // pixel. Rebase them onto the triangle's own bounding box so the texture
  // spans each point, tip pointing inwards.
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const spanX = bb.max.x - bb.min.x;
  const spanY = bb.max.y - bb.min.y;
  const uv = geometry.attributes.uv;
  const flip = zTip < zOuter;
  for (let i = 0; i < uv.count; i++) {
    const u = (uv.getX(i) - bb.min.x) / spanX;
    const v = (uv.getY(i) - bb.min.y) / spanY;
    uv.setXY(i, u, flip ? 1 - v : v);
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .476;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// Everything below is derived from one number: the checker diameter. A real
// board is laid out in checker-widths — a point holds five, the two facing
// points leave a two-checker gap down the middle, so the playing field is
// twelve checkers deep. Adjacent points sit about one checker apart, which
// makes the open board very close to square. The board this replaces was
// 1.71:1, only ten checkers deep, and its outer points hung off the felt.
const CHECKER_D = 1.0;
const PITCH = CHECKER_D * 1.06;      // centre-to-centre of neighbouring points
const POINT_HALF = .5;               // half the width of a point's base
const BAR_HALF = .42;
const POINT_LEN = CHECKER_D * 5;     // a point holds exactly five checkers
const FIELD_HALF = CHECKER_D * 6;    // twelve checkers of depth, halved
const TIP_Z = FIELD_HALF - POINT_LEN;

// Six columns either side of the bar, mirrored front to back for 24 points.
const starts = [];
for (let k = 5; k >= 0; k--) starts.push(-(BAR_HALF + POINT_HALF + PITCH * k));
for (let k = 0; k <= 5; k++) starts.push(BAR_HALF + POINT_HALF + PITCH * k);
const NEAR_Z = -(FIELD_HALF - POINT_LEN / 2);
const FAR_Z = FIELD_HALF - POINT_LEN / 2;

const FIELD_HALF_X = starts[starts.length - 1] + POINT_HALF;
const PANEL_W = FIELD_HALF_X * 2 + .5;
const PANEL_D = FIELD_HALF * 2 + .5;

function addBoard() {
  box(PANEL_W + 2.2, .45, PANEL_D + 2.2, frame, 0, 0, 0, true);
  box(PANEL_W + 1.2, .18, PANEL_D + 1.2, bevel, 0, .28, 0, true);
  box(PANEL_W, .1, PANEL_D, panel, 0, .42, 0);
  box(BAR_HALF * 2, .22, PANEL_D + .18, frame, 0, .5, 0);

  starts.forEach((x, i) => {
    point(x - POINT_HALF, x + POINT_HALF, -FIELD_HALF, -TIP_Z, i % 2 ? marquetryB : marquetryA);
    point(x - POINT_HALF, x + POINT_HALF, FIELD_HALF, TIP_Z, i % 2 ? marquetryA : marquetryB);
  });

  // Brass hinge pins across the centre seam, like a folding board's hinges.
  [-PANEL_D * .28, PANEL_D * .28].forEach(z => {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .55, 16), brass);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, .58, z);
    hinge.castShadow = true;
    scene.add(hinge);
  });

  // Small pearl position markers set into the long rails.
  const railX = PANEL_W / 2 + .55;
  [-railX, railX].forEach(x => {
    [-4, -1.4, 1.4, 4].forEach(z => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 10), pearl);
      dot.position.set(x, .62, z);
      scene.add(dot);
    });
  });
}

// Dished checker profile, taken straight from the reference pieces: a raised
// outer rim around a recessed circular dimple, with a rounded outer edge.
const CHECKER_R = CHECKER_D / 2;
const CHECKER_H = .15;
// Profile runs bottom-centre outwards and up to the dished top. Listing it
// in this order is what makes the revolved normals face outwards — reversed,
// the discs render inside-out and read as hollow rings.
// Profile read off the photographed pieces, running bottom-centre outwards:
// a barrelled side wall, a flat outer rim, a step down into a recessed
// channel, then a low dome rising back up out of the middle. That central
// dome is what catches the highlight on the dark pieces.
const checkerGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0, 0),
  new THREE.Vector2(.40, 0),
  new THREE.Vector2(.465, .012),
  new THREE.Vector2(CHECKER_R, .05),
  new THREE.Vector2(CHECKER_R, .10),
  new THREE.Vector2(.478, .138),
  new THREE.Vector2(.455, CHECKER_H),   // flat outer rim
  new THREE.Vector2(.365, CHECKER_H),
  new THREE.Vector2(.345, .128),        // step down into the channel
  new THREE.Vector2(.325, .119),
  new THREE.Vector2(.30, .117),         // channel floor
  new THREE.Vector2(.275, .120),
  new THREE.Vector2(.245, .131),        // dome springs from here
  new THREE.Vector2(.20, .142),
  new THREE.Vector2(.14, .149),
  new THREE.Vector2(.07, .1525),
  new THREE.Vector2(0, .153),           // dome crown, just proud of the rim
], 96);

// --- Dice ------------------------------------------------------------
// A real die: every face carries its own pips, opposite faces sum to 7,
// and the cube is rounded off at the corners the way a moulded die is.
const PIP_GRID = { lo: 74, mid: 128, hi: 182 };
const PIP_LAYOUT = {
  1: [["mid", "mid"]],
  2: [["lo", "lo"], ["hi", "hi"]],
  3: [["lo", "lo"], ["mid", "mid"], ["hi", "hi"]],
  4: [["lo", "lo"], ["hi", "lo"], ["lo", "hi"], ["hi", "hi"]],
  5: [["lo", "lo"], ["hi", "lo"], ["mid", "mid"], ["lo", "hi"], ["hi", "hi"]],
  6: [["lo", "lo"], ["hi", "lo"], ["lo", "mid"], ["hi", "mid"], ["lo", "hi"], ["hi", "hi"]],
};

function dieFaceTexture(value) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");

  // Bright white body, barely shaded — these are cheap moulded dice, not ivory.
  const wash = ctx.createRadialGradient(110, 96, 30, 128, 128, 200);
  wash.addColorStop(0, "#ffffff");
  wash.addColorStop(1, "#f4f2ee");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 256, 256);

  // Flat inked pips, as printed on the reference dice — no drilled well.
  PIP_LAYOUT[value].forEach(([gx, gy]) => {
    ctx.fillStyle = "#0a0a0b";
    ctx.beginPath();
    ctx.arc(PIP_GRID[gx], PIP_GRID[gy], 21, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Push a segmented cube's vertices onto a rounded-cube surface so the die
// has moulded corners instead of razor edges. UVs are untouched, so each
// face keeps its own pip texture.
function roundedDieGeometry(size, radius, segments = 10) {
  const geometry = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
  const pos = geometry.attributes.position;
  const half = size / 2;
  const inner = half - radius;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cx = Math.max(-inner, Math.min(inner, v.x));
    const cy = Math.max(-inner, Math.min(inner, v.y));
    const cz = Math.max(-inner, Math.min(inner, v.z));
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    pos.setXYZ(i, cx + (dx / len) * radius, cy + (dy / len) * radius, cz + (dz / len) * radius);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Measured off the photos: a die is a bit over a quarter of a checker across.
const DIE_SIZE = CHECKER_D * .27;
const dieGeometry = roundedDieGeometry(DIE_SIZE, DIE_SIZE * .13, 12);
// BoxGeometry material order is +x, -x, +y, -y, +z, -z. Opposite faces sum
// to seven, exactly like a real die.
const DIE_FACES = [1, 6, 2, 5, 3, 4];
const dieMaterials = DIE_FACES.map(value => new THREE.MeshPhysicalMaterial({
  map: dieFaceTexture(value),
  roughness: .22,
  metalness: 0,
  clearcoat: .6,
  clearcoatRoughness: .1,
}));

// Rotation that brings a given value onto the top (+y) face.
const FACE_UP = {
  2: new THREE.Euler(0, 0, 0),
  5: new THREE.Euler(Math.PI, 0, 0),
  1: new THREE.Euler(0, 0, Math.PI / 2),
  6: new THREE.Euler(0, 0, -Math.PI / 2),
  3: new THREE.Euler(-Math.PI / 2, 0, 0),
  4: new THREE.Euler(Math.PI / 2, 0, 0),
};

// Local face normals, paired with the value printed on them.
const DIE_NORMALS = [
  [new THREE.Vector3(1, 0, 0), 1],
  [new THREE.Vector3(-1, 0, 0), 6],
  [new THREE.Vector3(0, 1, 0), 2],
  [new THREE.Vector3(0, -1, 0), 5],
  [new THREE.Vector3(0, 0, 1), 3],
  [new THREE.Vector3(0, 0, -1), 4],
];

const FELT_Y = .47;
const diceMeshes = [];

function dice(x, z, face) {
  const die = new THREE.Mesh(dieGeometry, dieMaterials);
  const orient = new THREE.Quaternion().setFromEuler(FACE_UP[face]);
  // A little yaw so the pair does not sit in perfect parade alignment.
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    (Math.random() - .5) * .9
  );
  die.quaternion.copy(yaw).multiply(orient);
  die.position.set(x, FELT_Y + DIE_SIZE / 2, z);
  die.castShadow = true;
  die.receiveShadow = true;
  die.userData.die = {
    mode: "rest",
    value: face,
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    still: 0,
  };
  scene.add(die);
  diceMeshes.push(die);
  return die;
}

// Which value is facing up right now.
function readDie(die) {
  let best = 2, bestDot = -Infinity;
  const v = new THREE.Vector3();
  for (const [normal, value] of DIE_NORMALS) {
    v.copy(normal).applyQuaternion(die.quaternion);
    if (v.y > bestDot) { bestDot = v.y; best = value; }
  }
  return best;
}

// Rotate the die the shortest way so its upmost face sits exactly level,
// leaving the yaw wherever the throw left it.
function settleDie(die) {
  let bestNormal = null, bestDot = -Infinity;
  const v = new THREE.Vector3();
  for (const [normal] of DIE_NORMALS) {
    v.copy(normal).applyQuaternion(die.quaternion);
    if (v.y > bestDot) { bestDot = v.y; bestNormal = normal; }
  }
  v.copy(bestNormal).applyQuaternion(die.quaternion);
  const fix = new THREE.Quaternion().setFromUnitVectors(v, new THREE.Vector3(0, 1, 0));
  die.quaternion.premultiply(fix).normalize();
  die.position.y = FELT_Y + DIE_SIZE / 2;
  const s = die.userData.die;
  s.mode = "rest";
  s.vel.set(0, 0, 0);
  s.spin.set(0, 0, 0);
  s.value = readDie(die);
  showDiceValues();
}

function showDiceValues() {
  const readout = hud.querySelectorAll("strong")[1];
  if (!readout) return;
  const rolling = diceMeshes.some(d => d.userData.die.mode !== "rest");
  readout.textContent = rolling
    ? "…"
    : diceMeshes.map(d => d.userData.die.value).join(" · ");
}

// Corner offsets used to find where the die actually touches the felt, so it
// tumbles onto an edge instead of hovering like a ball.
const DIE_CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  DIE_CORNERS.push(new THREE.Vector3(sx, sy, sz).multiplyScalar(DIE_SIZE / 2));
}

const GRAVITY = -26;
const BOUNCE = .36;
const THROW_WALL_X = FIELD_HALF_X - DIE_SIZE;
const THROW_WALL_Z = FIELD_HALF - DIE_SIZE;

// Physics runs on a fixed timestep and catches up across however many frames
// the machine manages, so a throw takes the same real time to settle whether
// the page is running at 120fps or struggling along at 5.
const PHYSICS_STEP = 1 / 120;
let physicsDebt = 0;

function stepDicePhysics(frameDt) {
  physicsDebt = Math.min(physicsDebt + frameDt, .5);
  while (physicsDebt >= PHYSICS_STEP) {
    for (const die of diceMeshes) stepDie(die, PHYSICS_STEP);
    physicsDebt -= PHYSICS_STEP;
  }
}

function stepDie(die, dt) {
  const s = die.userData.die;
  if (s.mode !== "throw") return;

  s.vel.y += GRAVITY * dt;
  die.position.addScaledVector(s.vel, dt);

  // Integrate the spin: dq/dt = ½ ω q.
  const q = die.quaternion;
  const dq = new THREE.Quaternion(s.spin.x, s.spin.y, s.spin.z, 0).multiply(q);
  q.set(
    q.x + .5 * dq.x * dt,
    q.y + .5 * dq.y * dt,
    q.z + .5 * dq.z * dt,
    q.w + .5 * dq.w * dt
  ).normalize();

  // Rails around the playing field.
  ["x", "z"].forEach(axis => {
    const limit = axis === "x" ? THROW_WALL_X : THROW_WALL_Z;
    if (Math.abs(die.position[axis]) > limit) {
      die.position[axis] = Math.sign(die.position[axis]) * limit;
      s.vel[axis] *= -BOUNCE;
      s.spin.multiplyScalar(.85);
    }
  });

  // Lowest corner decides the contact, which is what makes it tumble.
  let lowest = Infinity;
  const c = new THREE.Vector3();
  for (const corner of DIE_CORNERS) {
    c.copy(corner).applyQuaternion(die.quaternion);
    lowest = Math.min(lowest, die.position.y + c.y);
  }

  if (lowest < FELT_Y) {
    die.position.y += FELT_Y - lowest;
    if (s.vel.y < 0) s.vel.y = -s.vel.y * BOUNCE;
    s.vel.x *= .78;
    s.vel.z *= .78;
    // Sliding contact kicks the die over rather than just damping it.
    s.spin.multiplyScalar(.62);
    s.spin.x += -s.vel.z * .9;
    s.spin.z += s.vel.x * .9;

    if (s.vel.length() < .55 && s.spin.length() < 2.2) {
      s.still += dt;
      if (s.still > .12) settleDie(die);
    } else {
      s.still = 0;
    }
  } else {
    s.still = 0;
  }
}

// --- Checker positions & drag-to-move -------------------------------
// Point numbering follows the standard 1-24 convention. Points 1-12 sit
// on the near row, 13-24 on the far row, mirrored across the bar.
// Each point stores the anchor used for drop hit-testing plus the seat of
// its first checker and the direction the rest of them run in — checkers
// lie down the length of a point, they are not stacked into a tower.
const CHECKER_GAP = CHECKER_D;
const POINTS = {};
starts.forEach((x, i) => {
  POINTS[12 - i] = { x, z: NEAR_Z, baseZ: -FIELD_HALF + CHECKER_R, dir: 1 };
  POINTS[13 + i] = { x, z: FAR_Z, baseZ: FIELD_HALF - CHECKER_R, dir: -1 };
});
// Checkers sent to the bar sit on the centre divider, in the gap the two
// facing rows of points leave open.
POINTS.barW = { x: 0, z: -TIP_Z * .5, baseZ: -TIP_Z * .45, dir: -1 };
POINTS.barB = { x: 0, z: TIP_Z * .5, baseZ: TIP_Z * .45, dir: 1 };

// Five checkers fill a point; anything beyond that starts a second layer on
// top of the first five, exactly as it works on a real board.
function checkerSeat(key, index) {
  const p = POINTS[key];
  const layer = Math.floor(index / 5);
  const slot = index % 5;
  return {
    x: p.x,
    y: .47 + layer * (CHECKER_H + .004),
    z: p.baseZ + p.dir * slot * CHECKER_GAP,
  };
}

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
    const material = s.color === "ivory" ? ivory : black;
    for (let i = 0; i < s.count; i++) {
      const seat = checkerSeat(key, i);
      const body = new THREE.Mesh(checkerGeometry, material);
      body.position.set(seat.x, seat.y, seat.z);
      // A hair of yaw per checker so the row reads as hand-placed.
      body.rotation.y = (Math.random() - .5) * .5;
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

// Dice are lifted onto a plane above the board while held, so the throw can
// be aimed by flicking the pointer. Both dice always come up together and are
// thrown as a pair — you shake the cup, not one die at a time.
const LIFT_Y = 1.5;
const liftPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIFT_Y);
let heldDice = null;

function pointerOnPlane(plane, out) {
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(plane, out) ? out : null;
}

canvas.addEventListener("pointerdown", (e) => {
  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);

  // Dice sit on top of everything, so they get first claim on the pointer.
  // Grabbing either one scoops up the whole pair.
  const dieHit = raycaster.intersectObjects(diceMeshes, false);
  if (dieHit.length) {
    const anchor = pointerOnPlane(liftPlane, new THREE.Vector3())
      || dieHit[0].object.position.clone();
    heldDice = {
      last: anchor.clone(),
      lastT: performance.now(),
      vel: new THREE.Vector3(),
      shake: 0,
      entries: diceMeshes.map((die, i) => {
        const s = die.userData.die;
        s.mode = "held";
        s.vel.set(0, 0, 0);
        s.still = 0;
        // Sit them either side of the hand so they read as a pair.
        const angle = i * Math.PI + Math.random() * .6;
        return { die, radius: .26 + i * .04, phase: angle };
      }),
    };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = "grabbing";
    showDiceValues();
    return;
  }

  const hits = raycaster.intersectObjects(pieceMeshes, false);
  if (!hits.length) return;
  const key = hits[0].object.userData.pointKey;
  if (!state[key] || !state[key].count) return;
  dragging = { fromKey: key, color: state[key].color };
  canvas.style.cursor = "grabbing";
});

addEventListener("pointermove", (e) => {
  if (!heldDice) return;
  setPointerFromEvent(e);
  const target = pointerOnPlane(liftPlane, new THREE.Vector3());
  if (!target) return;
  const now = performance.now();
  const dt = Math.max((now - heldDice.lastT) / 1000, 1 / 240);

  // Velocity of the hand, kept for the moment of release.
  heldDice.vel.copy(target).sub(heldDice.last).divideScalar(dt).clampLength(0, 26);
  // Shaking harder swirls them faster around each other.
  heldDice.shake += dt * (3 + heldDice.vel.length() * .6);

  heldDice.entries.forEach(({ die, radius, phase }, i) => {
    const a = heldDice.shake + phase;
    die.position.set(
      target.x + Math.cos(a) * radius,
      target.y + i * .05,
      target.z + Math.sin(a) * radius
    );
    die.rotateX(dt * (3.2 + i));
    die.rotateY(dt * (2.4 + i * .8));
  });

  heldDice.last.copy(target);
  heldDice.lastT = now;
});

addEventListener("pointerup", (e) => {
  if (heldDice) {
    heldDice.entries.forEach(({ die }) => {
      const s = die.userData.die;
      s.mode = "throw";
      // Both leave the hand together, but with enough scatter that they do
      // not fly in formation and land in a neat stack.
      s.vel.copy(heldDice.vel).add(new THREE.Vector3(
        (Math.random() - .5) * 3,
        0,
        (Math.random() - .5) * 3
      ));
      s.vel.y = Math.min(s.vel.y, 1.5);
      // Always enough spin to actually tumble, even on a lazy drop.
      const speed = s.vel.length();
      s.spin.set(
        (Math.random() - .5) * 2 + -s.vel.z * 1.6,
        (Math.random() - .5) * 6,
        (Math.random() - .5) * 2 + s.vel.x * 1.6
      ).clampLength(6 + speed, 26);
      s.still = 0;
    });
    heldDice = null;
    canvas.style.cursor = "grab";
    showDiceValues();
    return;
  }

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

  // Key light: a warm lamp hanging over the board. It carries the shadows,
  // everything else only lifts the darks.
  const key = new THREE.DirectionalLight(0xffe9c4, 2.1);
  key.position.set(-5, 12, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 13;
  key.shadow.camera.bottom = -13;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 34;
  scene.add(key);

  // Warm falloff over the centre of the board so the middle glows slightly
  // brighter than the rails, the way a table lamp actually behaves.
  const lamp = new THREE.PointLight(0xffd9a0, 42, 34, 2);
  lamp.position.set(0.5, 10.5, 1);
  scene.add(lamp);

  // Cool sky bounce, kept low — this is what was washing the board out.
  const fill = new THREE.HemisphereLight(0x9fb4c4, 0x120a05, .55);
  scene.add(fill);

  // Gentle opposite-side fill so the far row is not left in the dark.
  const side = new THREE.DirectionalLight(0xbcd0dc, .55);
  side.position.set(7, 9, -6);
  scene.add(side);
}

addRoom();
addBoard();
resetState();
renderPieces();
// Both dice land in one half of the board, the way they do after a throw.
dice(-4.1, .35, 5);
dice(-3.0, -.5, 4);
showDiceValues();

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), .25);
  const elapsed = clock.getElapsedTime();
  const lamp = scene.children.find(o => o.isPointLight);
  if (lamp) lamp.intensity = 42 + Math.sin(elapsed * 1.4) * 1.2;
  // Sub-step so a fast throw cannot tunnel through the felt.
  stepDicePhysics(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

