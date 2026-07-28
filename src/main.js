import * as THREE from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("#scene");
const intro = document.querySelector("#intro");
const enter = document.querySelector("#enter");
const hud = document.querySelector("#hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060402);
// Light fog only, for depth in the room. At the old density the camera sat
// far enough back that the board itself lost about 40% of its brightness,
// which read as uneven lighting no matter how the lamps were arranged.
scene.fog = new THREE.FogExp2(0x060402, 0.015);

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
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Soft studio-style reflections for the lacquer and clearcoat surfaces
// below — generated in-scene so no external HDR asset is needed.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
// The room probe is only here to give the lacquer something to reflect. At
// full strength it lights the whole board and flattens every material.
scene.environmentIntensity = .22;

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
// Bone-coloured pieces are matte moulded plastic, not lacquer. The gloss was
// blowing the whole face to one flat highlight and burying the relief.
const ivory = new THREE.MeshPhysicalMaterial({
  color: 0xe9dcbb,
  roughness: .62,
  metalness: 0,
  clearcoat: .1,
  clearcoatRoughness: .45
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
// One world unit is one checker diameter, which on the reference pieces is
// 36mm — so a millimetre is 1/36 of a unit and every other size below can be
// written in real millimetres.
const MM = 1 / 36;
const CHECKER_R = CHECKER_D / 2;
const CHECKER_H = 8 * MM;   // 8mm thick, per the checker's stated dimensions
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
  new THREE.Vector2(.468, .018),
  new THREE.Vector2(CHECKER_R, .06),
  new THREE.Vector2(CHECKER_R, .16),
  new THREE.Vector2(.484, .208),
  new THREE.Vector2(.455, CHECKER_H),   // flat outer rim
  new THREE.Vector2(.378, CHECKER_H),
  // The step is cut deeper and steeper than before — at barely a millimetre
  // it caught no shadow at all and the face read as flat.
  new THREE.Vector2(.362, .213),
  new THREE.Vector2(.352, .190),        // near-vertical wall of the channel
  new THREE.Vector2(.340, .178),
  new THREE.Vector2(.30, .174),         // channel floor, 1.7mm below the rim
  new THREE.Vector2(.268, .178),
  new THREE.Vector2(.245, .191),        // dome springs from here
  new THREE.Vector2(.20, .208),
  new THREE.Vector2(.13, .219),
  new THREE.Vector2(0, .2225),          // dome crown, level with the rim
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
  const SIZE = 512;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  const k = SIZE / 256;

  // Cast-resin white with the faintest warmth, near enough to flat.
  const wash = ctx.createRadialGradient(220 * k, 192 * k, 60 * k, 128 * k, 128 * k, 210 * k);
  wash.addColorStop(0, "#ffffff");
  wash.addColorStop(1, "#f3f1ec");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Pips are drilled and filled: a hard, saturated colour with a thin shaded
  // lip where the drill breaks the surface. The one is red, the rest are the
  // dark brown-black of the reference dice.
  // The one is drilled wider than the rest, as it is on real dice.
  const R = (value === 1 ? 36 : 28) * k;
  PIP_LAYOUT[value].forEach(([gx, gy]) => {
    const x = PIP_GRID[gx] * k;
    const y = PIP_GRID[gy] * k;
    const red = value === 1;

    ctx.fillStyle = red ? "#c8161b" : "#2b211c";
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();

    // Deeper toward the bottom of the well.
    const shade = ctx.createRadialGradient(x - R * .28, y - R * .32, R * .08, x, y, R * 1.02);
    shade.addColorStop(0, red ? "rgba(255,120,110,.55)" : "rgba(120,96,84,.5)");
    shade.addColorStop(.55, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();

    // Bright rim on the lit side of the drilled edge.
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(x, y, R + k, Math.PI * .95, Math.PI * 1.85);
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
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

// 10mm dice against the 36mm checker. Real dice break the corner only
// slightly — about a twelfth of the edge.
const DIE_SIZE = 10 * MM;
const dieGeometry = roundedDieGeometry(DIE_SIZE, DIE_SIZE * .085, 14);
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
  separateSettledDice(die);
  showDiceValues();
}

// The dice do not collide with each other in flight, so a pair thrown along
// the same line can come to rest inside one another. Once one lands, shove it
// clear of anything already sitting there.
function separateSettledDice(die) {
  const gap = DIE_SIZE * 1.08;
  const away = new THREE.Vector3();
  for (const other of diceMeshes) {
    if (other === die || other.userData.die.mode !== "rest") continue;
    away.set(die.position.x - other.position.x, 0, die.position.z - other.position.z);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);   // exactly stacked
    const overlap = gap - away.length();
    if (overlap <= 0) continue;
    away.normalize().multiplyScalar(overlap);
    die.position.x = THREE.MathUtils.clamp(die.position.x + away.x, -THROW_WALL_X, THROW_WALL_X);
    die.position.z = THREE.MathUtils.clamp(die.position.z + away.z, -THROW_WALL_Z, THROW_WALL_Z);
  }
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

// Real gravity, expressed in board units: a unit is 36mm, so 9.81 m/s² is
// 9.81 / 0.036 units per second squared. Everything else in the solver is
// tuned against that rather than against an invented scale.
const GRAVITY = -9.81 / (36 / 1000);
// Polished resin dropped on a felted board keeps roughly a third of its
// approach speed, and slides very little once it is down.
const BOUNCE = .34;
// Coulomb friction coefficient for resin on a felted board.
const FLOOR_FRICTION = .45;
const RAIL_BOUNCE = .42;
// A die is heavy for its size, so contact converts a lot of its slide into
// tumble; this is the coupling that makes it roll to a stop rather than skid.
const CONTACT_TUMBLE = .55;
// Downward speed that counts as a real impact rather than resting contact.
const IMPACT_SPEED = 1.5;
// Per-second decay once the die is down and sliding, not per substep.
const REST_SLIDE_DECAY = .06;
const REST_SPIN_DECAY = .02;
// Below a couple of centimetres a second, with barely any spin left, it has
// stopped.
const STILL_SPEED = 1.0;   // ≈ 3.6 cm/s
const STILL_SPIN = 2.4;    // rad/s
const THROW_WALL_X = FIELD_HALF_X - DIE_SIZE;
const THROW_WALL_Z = FIELD_HALF - DIE_SIZE;

// Physics runs on a fixed timestep and catches up across however many frames
// the machine manages, so a throw takes the same real time to settle whether
// the page is running at 120fps or struggling along at 5.
// At real gravity a thrown die covers a good fraction of its own width per
// millisecond, so the step has to be short enough that a corner cannot pass
// through the felt between two samples.
const PHYSICS_STEP = 1 / 480;
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

  applySpin(die, s.spin, dt);

  // Rails around the playing field. A die coming off a wooden rail keeps
  // more of its speed than one landing on felt, and the impact spins it.
  ["x", "z"].forEach(axis => {
    const limit = axis === "x" ? THROW_WALL_X : THROW_WALL_Z;
    if (Math.abs(die.position[axis]) > limit) {
      const into = s.vel[axis];
      die.position[axis] = Math.sign(die.position[axis]) * limit;
      // Only rebound if it is actually travelling into the rail; otherwise it
      // is just resting against it and would jitter.
      if (Math.sign(into) !== Math.sign(die.position[axis]) || into === 0) return;
      s.vel[axis] = -into * RAIL_BOUNCE;
      s.spin.multiplyScalar(.8);
      // Glancing off a rail kicks it end over end about the other horizontal
      // axis, which is what stops a bounce looking like a billiard shot.
      const kick = Math.abs(into) * .35;
      if (axis === "x") s.spin.z += Math.sign(into) * kick;
      else s.spin.x -= Math.sign(into) * kick;
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

    if (s.vel.y < -IMPACT_SPEED) {
      // Coulomb friction at the contact: the sideways impulse is capped by
      // the normal impulse, so a die skimming in fast and flat keeps most of
      // its speed and carries on across the board, while one dropped steeply
      // stops almost where it lands. Scrubbing a fixed fraction of the
      // sideways speed instead — which is what this did before — bled every
      // throw dry within a couple of bounces and no die ever reached a rail.
      const approach = -s.vel.y;
      const normalImpulse = (1 + BOUNCE) * approach;
      const tangential = Math.hypot(s.vel.x, s.vel.z);
      const scrub = Math.min(FLOOR_FRICTION * normalImpulse, tangential);

      s.vel.y = approach * BOUNCE;
      if (tangential > 1e-6) {
        s.vel.x -= (s.vel.x / tangential) * scrub;
        s.vel.z -= (s.vel.z / tangential) * scrub;
        // That scrubbed momentum has to go somewhere: it tips the die over
        // about the horizontal axis across its direction of travel.
        s.spin.multiplyScalar(.78);
        s.spin.x += -(s.vel.z / tangential) * scrub * CONTACT_TUMBLE;
        s.spin.z += (s.vel.x / tangential) * scrub * CONTACT_TUMBLE;
      } else {
        s.spin.multiplyScalar(.78);
      }
    } else {
      // Resting or sliding on the felt. Damping here has to be per second,
      // not per substep — applied per substep it scales with the timestep and
      // kills the throw almost the instant the die first touches down.
      s.vel.y = Math.max(s.vel.y, 0);
      const slide = Math.pow(REST_SLIDE_DECAY, dt);
      s.vel.x *= slide;
      s.vel.z *= slide;
      s.spin.multiplyScalar(Math.pow(REST_SPIN_DECAY, dt));
    }

    if (s.vel.length() < STILL_SPEED && s.spin.length() < STILL_SPIN) {
      s.still += dt;
      if (s.still > .1) settleDie(die);
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
  // Opening layout, 15 checkers a side. Points 1-12 are the row furthest from
  // the seat, 13-24 the near one, and a point faces its mirror at 25 minus
  // its number — same column, other row — so the two colours sit opposite
  // each other in matching runs.
  state[12] = { color: "black", count: 2 };   // far row, far left
  state[1] = { color: "black", count: 5 };    // far row, far right
  state[18] = { color: "black", count: 5 };   // near row, against the bar on the left
  state[20] = { color: "black", count: 3 };   // near row, one column right of the bar

  state[13] = { color: "ivory", count: 2 };   // opposite point 12
  state[24] = { color: "ivory", count: 5 };   // opposite point 1
  state[7] = { color: "ivory", count: 5 };    // opposite point 18
  state[5] = { color: "ivory", count: 3 };    // opposite point 20
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
    // The checker currently in the player's hand is drawn separately, so its
    // seat on the point is left empty while the drag is in progress.
    const onBoard = s.count - (s.lifted || 0);
    for (let i = 0; i < onBoard; i++) {
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

// Dice are lifted onto a plane above the board while held. Both dice always
// come up together and are thrown as a pair — you shake the cup, not one die
// at a time.
const LIFT_Y = 1.5;
const liftPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIFT_Y);
// A shake lasts at least this long. Letting go early does not cut it short;
// the dice keep spinning in the hand until the time is up, then fly.
const MIN_SHAKE_MS = 2000;
let heldDice = null;

// Height a dragged checker rides at, high enough to read as lifted off the
// board without leaving the felt behind.
const CARRY_Y = .95;
const carryPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_Y);

function pointerOnPlane(plane, out) {
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(plane, out) ? out : null;
}

function applySpin(die, spin, dt) {
  const q = die.quaternion;
  const dq = new THREE.Quaternion(spin.x, spin.y, spin.z, 0).multiply(q);
  q.set(
    q.x + .5 * dq.x * dt,
    q.y + .5 * dq.y * dt,
    q.z + .5 * dq.z * dt,
    q.w + .5 * dq.w * dt
  ).normalize();
}

function randomShakeSpin() {
  // Tumbling on every axis at once, not just spinning about one. A shaken
  // die turns at something like two to four revolutions a second.
  return new THREE.Vector3(
    (Math.random() - .5) * 2,
    (Math.random() - .5) * 2,
    (Math.random() - .5) * 2
  ).normalize().multiplyScalar(14 + Math.random() * 12);
}

// Runs every frame while the dice are in the hand, so they keep tumbling even
// when the pointer is perfectly still.
function stepHeldDice(dt) {
  if (!heldDice) return;
  const now = performance.now();
  const elapsed = now - heldDice.startedAt;

  heldDice.swirl += dt * (3.4 + heldDice.vel.length() * .5);
  heldDice.entries.forEach((entry, i) => {
    const { die, radius, phase } = entry;
    const a = heldDice.swirl + phase;
    die.position.set(
      heldDice.anchor.x + Math.cos(a) * radius,
      heldDice.anchor.y + i * .06,
      heldDice.anchor.z + Math.sin(a) * radius
    );
    // Re-roll the tumble axis now and then so it never settles into a
    // readable, repeating spin.
    entry.reroll -= dt;
    if (entry.reroll <= 0) {
      entry.shakeSpin.copy(randomShakeSpin());
      entry.reroll = .18 + Math.random() * .22;
    }
    applySpin(die, entry.shakeSpin, dt);
  });

  if (heldDice.released && elapsed >= MIN_SHAKE_MS) launchDice();
}

// The frame loop is the natural place to fire the throw, but on a machine
// that is only managing a frame every second or two the dice would sit in the
// hand well past the shake. A timer armed at release keeps the throw on time
// regardless; whichever gets there first wins.
function armThrow() {
  const remaining = MIN_SHAKE_MS - (performance.now() - heldDice.startedAt);
  const token = heldDice;
  setTimeout(() => {
    if (heldDice === token && heldDice.released) launchDice();
  }, Math.max(0, remaining));
}

// Fling the pair away across the board, fast.
function launchDice() {
  const hand = heldDice.vel.clone();
  hand.y = 0;
  // Away from the player's side of the table, with whatever aim the hand had.
  // Roughly 1.3 m/s, which is what an unhurried throw across a board is.
  const aim = new THREE.Vector3(hand.x * .3, 0, -1)
    .normalize()
    .multiplyScalar(34 + Math.random() * 10);

  heldDice.entries.forEach(({ die }) => {
    const s = die.userData.die;
    s.mode = "throw";
    // Enough scatter that they do not fly in formation and land in a stack.
    s.vel.copy(aim).add(new THREE.Vector3(
      (Math.random() - .5) * 9,
      0,
      (Math.random() - .5) * 9
    ));
    // Tossed slightly upward out of the hand.
    s.vel.y = 3 + Math.random() * 3;
    s.spin.copy(randomShakeSpin()).clampLength(16, 34);
    s.still = 0;
  });

  heldDice = null;
  canvas.style.cursor = "grab";
  showDiceValues();
}

canvas.addEventListener("pointerdown", (e) => {
  // Left button only — the other buttons should not move anything.
  if (e.button !== 0) return;
  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);

  // Dice sit on top of everything, so they get first claim on the pointer.
  // Grabbing either one scoops up the whole pair.
  const dieHit = raycaster.intersectObjects(diceMeshes, false);
  if (dieHit.length && !heldDice) {
    const anchor = pointerOnPlane(liftPlane, new THREE.Vector3())
      || dieHit[0].object.position.clone().setY(LIFT_Y);
    heldDice = {
      anchor: anchor.clone(),
      last: anchor.clone(),
      lastT: performance.now(),
      startedAt: performance.now(),
      released: false,
      vel: new THREE.Vector3(),
      swirl: 0,
      entries: diceMeshes.map((die, i) => {
        const s = die.userData.die;
        s.mode = "held";
        s.vel.set(0, 0, 0);
        s.spin.set(0, 0, 0);
        s.still = 0;
        return {
          die,
          radius: .26 + i * .04,
          phase: i * Math.PI + Math.random() * .6,
          shakeSpin: randomShakeSpin(),
          reroll: .18 + Math.random() * .22,
        };
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
  const point = state[key];
  if (!point || !point.count) return;

  // Lift the top checker off the point and carry it under the cursor, so the
  // move is visible while it is happening.
  point.lifted = 1;
  const carried = new THREE.Mesh(checkerGeometry, point.color === "ivory" ? ivory : black);
  carried.castShadow = true;
  carried.position.copy(hits[0].object.position).setY(CARRY_Y);
  scene.add(carried);

  dragging = { fromKey: key, color: point.color, mesh: carried };
  canvas.setPointerCapture?.(e.pointerId);
  canvas.style.cursor = "grabbing";
  renderPieces();
});

addEventListener("pointermove", (e) => {
  if (!heldDice && !dragging) return;
  setPointerFromEvent(e);

  if (dragging) {
    const target = pointerOnPlane(carryPlane, new THREE.Vector3());
    if (target) dragging.mesh.position.copy(target);
    return;
  }

  const target = pointerOnPlane(liftPlane, new THREE.Vector3());
  if (!target) return;
  const now = performance.now();
  const dt = Math.max((now - heldDice.lastT) / 1000, 1 / 240);
  // Velocity of the hand, kept to aim the throw.
  heldDice.vel.copy(target).sub(heldDice.last).divideScalar(dt).clampLength(0, 26);
  heldDice.anchor.copy(target);
  heldDice.last.copy(target);
  heldDice.lastT = now;
});

addEventListener("pointerup", (e) => {
  if (heldDice) {
    // Releasing only arms the throw; it fires once the dice have had their
    // full shake.
    heldDice.released = true;
    armThrow();
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
    delete state[dragging.fromKey].lifted;
    if (bestKey) tryMove(dragging.fromKey, bestKey, dragging.color);
  } else {
    delete state[dragging.fromKey].lifted;
  }
  scene.remove(dragging.mesh);
  dragging = null;
  canvas.style.cursor = "grab";
  renderPieces();
});

// If the gesture is interrupted — pointer leaves the window, touch cancelled —
// put the carried checker back rather than leaving a hole on the point.
addEventListener("pointercancel", () => {
  if (heldDice && !heldDice.released) {
    heldDice.released = true;
    armThrow();
  }
  if (!dragging) return;
  delete state[dragging.fromKey].lifted;
  scene.remove(dragging.mesh);
  dragging = null;
  canvas.style.cursor = "grab";
  renderPieces();
});

function addRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x050301, roughness: .95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.25;
  floor.receiveShadow = true;
  scene.add(floor);

  // Even coverage across the board, but still directional on each surface.
  // Flooding it equally from four sides did make every corner the same
  // brightness — and flattened every piece, because a 1mm dish only shows up
  // as a shadow, and a shadow needs a dominant light direction. So the key
  // carries most of the level and comes in low enough to rake across the
  // relief; the fills only open the shadows.
  const key = new THREE.DirectionalLight(0xfff4e2, 2.5);
  key.position.set(-6, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = .02;
  key.shadow.radius = 3;
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 13;
  key.shadow.camera.bottom = -13;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  scene.add(key);

  // Quadrant fills keep the corners of the board level with the middle, but
  // stay well under the key so they do not cancel its shading.
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([x, z]) => {
    const fill = new THREE.DirectionalLight(0xeef1f4, .16);
    fill.position.set(x * 11, 7, z * 11);
    scene.add(fill);
  });

  // Just enough lift to keep the darks open rather than crushed.
  scene.add(new THREE.HemisphereLight(0xd6e0e8, 0x2e2116, .42));
  scene.add(new THREE.AmbientLight(0xffffff, .1));
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
  stepHeldDice(dt);
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

