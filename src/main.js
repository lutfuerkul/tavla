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
scene.environmentIntensity = .5;

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
    for (let ring = 14; ring > 0; ring--) {
      const alpha = (0.12 + (12 - ring) * 0.012) * (1 - ring / 14);
      ctx.strokeStyle = grain;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6 + Math.random() * 1.1;
      ctx.beginPath();
      ctx.ellipse(ex, ey, (r * ring) / 14, (r * ring) / 14 * 0.55, Math.random() * 0.22, 0, Math.PI * 2);
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
  const W = 384, H = 1152;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // UV v=0 is the base (textures are flipped in Y), so the tip points up.
  const apex = [W / 2, 16];
  const bl = [8, H - 6];
  const br = [W - 8, H - 6];
  const tri = (a, b, d) => {
    const p = new Path2D();
    p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(d[0], d[1]); p.closePath();
    return p;
  };

  const outer = tri(apex, bl, br);

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
  // dark points are the plain walnut field between them, and the braid along
  // a shared edge serves both.
  //
  // The band has to be a constant width measured off the edge, not a triangle
  // scaled about its centroid. Scaled, the band collapses towards the tip:
  // the strands' two ends converge on each other, every stroke lands on the
  // last one, and the top two thirds of the point come out as solid cream
  // with the braid only legible down by the base.
  if (withInlay) {
    const BAND = 26;                       // width of the braid, in texture px
    const STEP = 30;                       // spacing of the strands along it
    ctx.save();
    ctx.clip(outer);
    [[bl, 1], [br, -1]].forEach(([corner, sign]) => {
      const dx = apex[0] - corner[0], dy = apex[1] - corner[1];
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const nx = -uy * sign, ny = ux * sign;         // across the edge, inwards

      ctx.fillStyle = "#2b1a0b";                     // the bed the strands lie in
      ctx.beginPath();
      ctx.moveTo(corner[0], corner[1]);
      ctx.lineTo(apex[0], apex[1]);
      ctx.lineTo(apex[0] + nx * BAND, apex[1] + ny * BAND);
      ctx.lineTo(corner[0] + nx * BAND, corner[1] + ny * BAND);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#e6d6a4";                   // the twist itself
      ctx.lineWidth = BAND * .40;
      ctx.lineCap = "butt";
      for (let along = -STEP; along < len; along += STEP) {
        ctx.beginPath();
        ctx.moveTo(corner[0] + ux * along, corner[1] + uy * along);
        ctx.lineTo(corner[0] + ux * (along + STEP * .62) + nx * BAND,
                   corner[1] + uy * (along + STEP * .62) + ny * BAND);
        ctx.stroke();
      }

      ctx.strokeStyle = "#efe4bd";                   // hairlines either side
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(corner[0], corner[1]);
      ctx.lineTo(apex[0], apex[1]);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(corner[0] + nx * BAND, corner[1] + ny * BAND);
      ctx.lineTo(apex[0] + nx * BAND, apex[1] + ny * BAND);
      ctx.stroke();
    });
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

// Lacquered wood reads as a soft sheen, not a mirror: moderate clearcoat over
// a fairly rough diffuse base. Cranking gloss any higher blows the board out
// to white under the overhead light.
// The case is black lacquered wood, inside and out, polished hard enough to
// hold a reflection of the room — on the reference board the walls carry a
// long highlight down their whole length.
const shell = new THREE.MeshPhysicalMaterial({
  color: 0x1f1916,
  roughness: .28,
  metalness: .03,
  clearcoat: .9,
  clearcoatRoughness: .05,
});
// One leaf of veneer, split and opened out, so the two halves mirror each
// other and the figure lands at the centre of both.
const veneerTexture = woodPanelTexture(768, 900, "#7b5730", "#251306", [[384, 450, 165]]);
const veneerL = new THREE.MeshPhysicalMaterial({
  map: veneerTexture,
  roughness: .3,
  metalness: .03,
  clearcoat: .95,
  clearcoatRoughness: .04,
});
const veneerR = veneerL.clone();
veneerR.map = veneerTexture.clone();
veneerR.map.wrapS = THREE.RepeatWrapping;
veneerR.map.repeat.x = -1;
veneerR.map.needsUpdate = true;
// Aged brass: the hinges on the reference board have gone dull and warm.
const brass = new THREE.MeshStandardMaterial({ color: 0x9b7f4b, roughness: .5, metalness: .85 });
const screwSlot = new THREE.MeshStandardMaterial({ color: 0x2a2216, roughness: .6, metalness: .5 });
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
  map: marquetryPointTexture("#6d4c2a", "#2a1608", false),
  roughness: .52,
  metalness: 0
});

function box(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
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
const POINT_HALF = PITCH / 2;        // bases meet, so one braid serves two points
const BAR_HALF = .42;
const POINT_LEN = CHECKER_D * 5.35;  // long, so the facing tips nearly meet
const FIELD_HALF = CHECKER_D * 6;    // twelve checkers of depth, halved
const TIP_Z = FIELD_HALF - POINT_LEN;

// Six columns either side of the bar, mirrored front to back for 24 points.
const starts = [];
for (let k = 5; k >= 0; k--) starts.push(-(BAR_HALF + POINT_HALF + PITCH * k));
for (let k = 0; k <= 5; k++) starts.push(BAR_HALF + POINT_HALF + PITCH * k);
const NEAR_Z = -(FIELD_HALF - POINT_LEN / 2);
const FAR_Z = FIELD_HALF - POINT_LEN / 2;

const FIELD_HALF_X = starts[starts.length - 1] + POINT_HALF;

// The reference board is a folding case, not a flat panel: two trays hinged
// down the middle, each a floor with the playing surface laid into it and four
// walls standing round it. What used to be a strip painted down the centre is
// really the two inner walls meeting, and what used to be an invisible line at
// the edge of the field is really the inside face of the outer wall.
const FELT_Y = .47;                       // top of the playing surface
const SEAM = .12;                         // 4mm, the gap the hinge knuckle sits in
const WALL_T = BAR_HALF - SEAM / 2;       // 13mm walls, so the seam comes out right
const WALL_H = .7;                        // 25mm of wall standing above the surface
const FLOOR_T = .26;                      // 9mm of case floor under it
const CASE_TOP = FELT_Y + WALL_H;
const CASE_BOTTOM = FELT_Y - FLOOR_T;
const CASE_HALF_X = FIELD_HALF_X + WALL_T;
const CASE_HALF_Z = FIELD_HALF + WALL_T;

function addBoard() {
  // Two trays, hinged down the middle. Each is drawn as a floor with four
  // walls standing on it: the outer long wall, the two end walls, and the
  // inner wall at the seam. The walls run the full height of the case and the
  // floor fills between them, so the tray is solid wherever it should be.
  [-1, 1].forEach(side => {
    const innerX = side * (BAR_HALF - WALL_T);          // outside of the seam wall
    const outerX = side * CASE_HALF_X;
    const spanX = Math.abs(outerX - innerX);
    const midX = (innerX + outerX) / 2;
    const wallY = (CASE_BOTTOM + CASE_TOP) / 2;
    const wallH = CASE_TOP - CASE_BOTTOM;

    box(spanX, FLOOR_T, CASE_HALF_Z * 2, shell, midX, CASE_BOTTOM + FLOOR_T / 2, 0);
    box(WALL_T, wallH, CASE_HALF_Z * 2, shell, side * (BAR_HALF - WALL_T / 2), wallY, 0);
    box(WALL_T, wallH, CASE_HALF_Z * 2, shell, side * (FIELD_HALF_X + WALL_T / 2), wallY, 0);
    [-1, 1].forEach(end => {
      box(spanX, wallH, WALL_T, shell, midX, wallY, end * (FIELD_HALF + WALL_T / 2));
    });

    // The playing surface, laid into the tray between the walls. Each half is
    // a mirror of the other, the way a board is veneered from one leaf split
    // and opened out — which is what puts the figure at the centre of both.
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD_HALF_X - BAR_HALF, .04, FIELD_HALF * 2),
      side < 0 ? veneerL : veneerR
    );
    face.position.set(side * (BAR_HALF + FIELD_HALF_X) / 2, FELT_Y - .02, 0);
    face.receiveShadow = true;
    scene.add(face);
  });

  starts.forEach((x, i) => {
    point(x - POINT_HALF, x + POINT_HALF, -FIELD_HALF, -TIP_Z, i % 2 ? marquetryB : marquetryA);
    point(x - POINT_HALF, x + POINT_HALF, FIELD_HALF, TIP_Z, i % 2 ? marquetryA : marquetryB);
  });

  addHinges();

  // Small pearl studs set into the top of the outer walls.
  [-1, 1].forEach(side => {
    [-3.6, 3.6].forEach(z => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.052, 14, 12), pearl);
      dot.position.set(side * (FIELD_HALF_X + WALL_T / 2), CASE_TOP - .012, z);
      scene.add(dot);
    });
  });
}

// Two butt hinges across the seam, sitting on top of the inner walls where a
// folding board carries them: a leaf screwed to each wall, the knuckle in the
// gap between, and two screws through each leaf.
const HINGE_LEN = 1.15;
const HINGE_LEAF = .34;
const HINGE_PLATE = .045;

function addHinges() {
  [-1, 1].forEach(end => {
    const z = end * FIELD_HALF * .58;

    [-1, 1].forEach(side => {
      const leaf = box(HINGE_LEAF, HINGE_PLATE, HINGE_LEN, brass,
        side * (SEAM / 2 + HINGE_LEAF / 2), CASE_TOP + HINGE_PLATE / 2, z);
      leaf.castShadow = true;

      // Two countersunk screws per leaf, each with its cross recess.
      [-.3, .3].forEach(along => {
        const head = new THREE.Mesh(
          new THREE.CylinderGeometry(.055, .05, .028, 16), brass);
        head.position.set(side * (SEAM / 2 + HINGE_LEAF / 2),
          CASE_TOP + HINGE_PLATE, z + along * HINGE_LEN);
        scene.add(head);
        for (let turn = 0; turn < 2; turn++) {
          const slot = new THREE.Mesh(
            new THREE.BoxGeometry(turn ? .012 : .075, .006, turn ? .075 : .012),
            screwSlot);
          slot.position.copy(head.position).setY(CASE_TOP + HINGE_PLATE + .012);
          scene.add(slot);
        }
      });
    });

    // The knuckle, lying in the seam along the fold. It has to stand proud of
    // the leaves or the seam swallows it and the hinge reads as two loose
    // plates with a gap between them.
    const knuckle = new THREE.Mesh(
      new THREE.CylinderGeometry(.075, .075, HINGE_LEN * .94, 20), brass);
    knuckle.rotation.x = Math.PI / 2;
    knuckle.position.set(0, CASE_TOP + HINGE_PLATE, z);
    knuckle.castShadow = true;
    scene.add(knuckle);
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

const PIP_TEXTURE_SIZE = 1024;
// How deep a pip is drilled, as a fraction of its width, and the sine of the
// resulting lean at the rim: for a cap of depth d in a pip of radius R the
// ball that cut it has radius (R² + d²) / 2d, so sin θ at the rim is
// 2(d/R) / (1 + (d/R)²).
const PIP_DEPTH = .32;
const PIP_LEAN = 2 * PIP_DEPTH / (1 + PIP_DEPTH * PIP_DEPTH);

function faceCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = PIP_TEXTURE_SIZE;
  return [c, c.getContext("2d"), PIP_TEXTURE_SIZE / 256];
}

// Two maps for one face, drawn from the same layout: what colour the face is,
// and which way it faces. The pips are drilled wells, and the normal map is
// what actually makes them read as holes — before it they were flat discs
// with a highlight painted on the lit side, which is what a dome looks like,
// not a hole. It goes on the lacquer as well as the resin underneath, because
// a clearcoat left flat mirrors straight over the top of a well and fills it
// back in.
function dieFaceMaps(value) {
  const [colourCanvas, ctx, k] = faceCanvas();
  const [normalCanvas, normals] = faceCanvas();
  const [roughCanvas, rough] = faceCanvas();
  const surface = normals.createImageData(PIP_TEXTURE_SIZE, PIP_TEXTURE_SIZE);
  const pixels = surface.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 128; pixels[i + 1] = 128; pixels[i + 2] = 255; pixels[i + 3] = 255;
  }

  // Cast-resin white with the faintest warmth, near enough to flat.
  const wash = ctx.createRadialGradient(220 * k, 192 * k, 60 * k, 128 * k, 128 * k, 210 * k);
  wash.addColorStop(0, "#ffffff");
  wash.addColorStop(1, "#f3f1ec");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, PIP_TEXTURE_SIZE, PIP_TEXTURE_SIZE);
  // The body is polished; the paint filling the pips is not. The map scales
  // the material's roughness, so the body is the darker value of the two.
  rough.fillStyle = "#8f8f8f";
  rough.fillRect(0, 0, PIP_TEXTURE_SIZE, PIP_TEXTURE_SIZE);

  // The one is drilled wider than the rest, as it is on real dice, and filled
  // red; the others take the dark brown-black of the reference dice.
  const R = (value === 1 ? 36 : 28) * k;
  const red = value === 1;
  PIP_LAYOUT[value].forEach(([gx, gy]) => {
    const x = PIP_GRID[gx] * k;
    const y = PIP_GRID[gy] * k;

    ctx.fillStyle = red ? "#c8161b" : "#2b211c";
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();

    rough.fillStyle = "#ffffff";
    rough.beginPath();
    rough.arc(x, y, R, 0, Math.PI * 2);
    rough.fill();

    // Ambient occlusion in the well: paint sitting in a drilled hollow is
    // darkest where the wall turns over, whichever way the light happens to
    // be. The shape of the lighting is left to the depth map.
    const inWell = ctx.createRadialGradient(x, y, R * .15, x, y, R);
    inWell.addColorStop(0, "rgba(0,0,0,0)");
    inWell.addColorStop(.72, red ? "rgba(90,6,10,.30)" : "rgba(0,0,0,.26)");
    inWell.addColorStop(1, red ? "rgba(70,4,8,.55)" : "rgba(0,0,0,.5)");
    ctx.fillStyle = inWell;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();

    // The well is a spherical cap, the shape a ball-nose drill leaves. On its
    // wall the surface leans in towards the axis — straight up at the bottom,
    // furthest over at the rim — so the normal is (-r̂ sin θ, cos θ) with
    // sin θ = r / Rs, Rs being the radius of the ball that cut it. A pip is
    // drilled about a third as deep as it is wide, so the rim leans over by
    // thirty-odd degrees, not ninety: cut it as a full hemisphere and the pips
    // come out as polished beads sitting in the face.
    const span = Math.ceil(R) + 1;
    for (let py = Math.floor(y - span); py <= y + span; py++) {
      if (py < 0 || py >= PIP_TEXTURE_SIZE) continue;
      for (let px = Math.floor(x - span); px <= x + span; px++) {
        if (px < 0 || px >= PIP_TEXTURE_SIZE) continue;
        const ux = (px + .5 - x) / R;
        const uy = (py + .5 - y) / R;
        const t = Math.hypot(ux, uy);
        if (t > 1) continue;
        // Ease the last of the wall off so the rim does not alias into a
        // ring of stair steps.
        const edge = t > .94 ? (1 - t) / .06 : 1;
        const lean = t * PIP_LEAN;
        const nz = Math.sqrt(Math.max(0, 1 - lean * lean));
        const o = (py * PIP_TEXTURE_SIZE + px) * 4;
        // Canvas y runs down the image and the green channel runs up it.
        pixels[o] = Math.round((-ux * PIP_LEAN * edge * .5 + .5) * 255);
        pixels[o + 1] = Math.round((uy * PIP_LEAN * edge * .5 + .5) * 255);
        pixels[o + 2] = Math.round(((nz + (1 - nz) * (1 - edge)) * .5 + .5) * 255);
      }
    }
  });
  normals.putImageData(surface, 0, 0);

  const map = new THREE.CanvasTexture(colourCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.anisotropy = 16;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = 16;
  return { map, normalMap, clearcoatNormalMap: normalMap, roughnessMap };
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

// 10mm dice against the 36mm checker. A moulded die has its corners properly
// broken, not just eased — the collider uses this same radius, so the die
// bounces on the corner you can see rather than on a sharp one hidden inside
// it. Enough segments that the corner reads as turned rather than chamfered.
const DIE_SIZE = 10 * MM;
const DIE_RADIUS = DIE_SIZE * .15;
const dieGeometry = roundedDieGeometry(DIE_SIZE, DIE_RADIUS, 24);
// BoxGeometry material order is +x, -x, +y, -y, +z, -z. Opposite faces sum
// to seven, exactly like a real die.
const DIE_FACES = [1, 6, 2, 5, 3, 4];
const dieMaterials = DIE_FACES.map(value => new THREE.MeshPhysicalMaterial({
  ...dieFaceMaps(value),
  // Polished resin: a slightly broken surface under a hard lacquer, rather
  // than one uniform semi-gloss.
  // The map takes this down to about a third for the polished body and leaves
  // it here for the paint in the pips.
  roughness: .62,
  metalness: 0,
  clearcoat: .85,
  clearcoatRoughness: .07,
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
    touching: false,
    offContact: 0,
    cocked: false,
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

// A die that has stopped is left where the solve put it. The contacts bring
// it down flat on their own, so the only thing left to do is take out the
// last fraction of a degree of integration drift — and that is refused if the
// die came to rest leaning on its neighbour, because a cocked die is a real
// outcome and not something to straighten out from underneath the player.
function settleDie(die) {
  const s = die.userData.die;
  let bestNormal = null, bestDot = -Infinity;
  const v = new THREE.Vector3();
  for (const [normal] of DIE_NORMALS) {
    v.copy(normal).applyQuaternion(die.quaternion);
    if (v.y > bestDot) { bestDot = v.y; bestNormal = normal; }
  }
  if (bestDot > FLAT_ENOUGH) {
    // Straightening the die moves its corners, so it is set back down on
    // whatever it was standing on rather than on the felt — it may have come
    // to rest on top of a checker.
    const stood = lowestCorner(die);
    v.copy(bestNormal).applyQuaternion(die.quaternion);
    const fix = new THREE.Quaternion().setFromUnitVectors(v, new THREE.Vector3(0, 1, 0));
    die.quaternion.premultiply(fix).normalize();
    die.position.y += stood - lowestCorner(die);
  }
  s.mode = "rest";
  s.cocked = bestDot <= FLAT_ENOUGH;
  s.vel.set(0, 0, 0);
  s.spin.set(0, 0, 0);
  s.value = readDie(die);
  showDiceValues();
}

// Height of whichever corner is sitting lowest — the height of the surface
// the die is standing on.
function lowestCorner(die) {
  let lowest = Infinity;
  const v = new THREE.Vector3();
  for (const corner of DIE_CORNERS) {
    v.copy(corner).applyQuaternion(die.quaternion);
    lowest = Math.min(lowest, die.position.y + v.y);
  }
  return lowest - DIE_RADIUS;
}

// A resting die that gets hit hard enough joins the throw again.
function wakeDie(die) {
  const s = die.userData.die;
  s.mode = "throw";
  s.still = 0;
  s.offContact = 0;
  s.cocked = false;
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

// Each die is a rigid body: mass, inertia, a linear velocity and an angular
// one. Every contact is resolved as an impulse at the point that actually
// touches, so bounce, skid, tumble and roll are not four effects dialled in
// separately — they all fall out of the same solve.

// The die is not a sharp box: its corners are turned to a radius, and the
// collider is the same shape the eye sees — a box of side (a - 2r) with a ball
// of radius r rolled around it. So these eight offsets are the centres of the
// corner balls, not the corners themselves, and every contact against the die
// stands the ball's radius off them. Left as sharp corners the die would pivot
// on a point a millimetre outside its own surface, hanging in the air on a
// corner that is not there.
const DIE_HALF = DIE_SIZE / 2;
const DIE_INNER = DIE_HALF - DIE_RADIUS;
const DIE_CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  DIE_CORNERS.push(new THREE.Vector3(sx, sy, sz).multiplyScalar(DIE_INNER));
}

// Real gravity, expressed in board units: a unit is 36mm, so 9.81 m/s² is
// 9.81 / 0.036 units per second squared. Everything else in the solver is
// tuned against that rather than against an invented scale.
const GRAVITY = -9.81 / (36 / 1000);
const FELT_UP = new THREE.Vector3(0, 1, 0);
// Mass only ever appears in ratios here, so the die is the unit of mass.
// Cubic symmetry survives the rounding, so the inertia stays a single scalar
// that is correct however the die is turned — there is no tensor to rotate.
//
// It is not a sharp cube's I = m a² / 6 though. Rounding the corners takes
// mass off the corners, which is the mass furthest from the axis, so the die
// spins easier than the sharp figure says — at this radius the coefficient is
// .157 rather than .167, six per cent lower. The shape is a box grown by a
// ball, so it cuts into pieces that each have a closed form: the core box, six
// face slabs, twelve quarter cylinders along the edges and eight sphere
// octants at the corners. Each piece's own second moment about the axis plus
// its offset squared, summed, over the whole volume.
function roundedCubeInertia(size, radius) {
  const r = radius, c = size / 2 - radius;
  const slab = 4 * c * c * r;                        // one face slab
  const edge = Math.PI * r * r / 4 * (2 * c);        // one edge quarter cylinder
  const octant = Math.PI * r ** 3 / 6;               // one corner octant
  const volume = 8 * c ** 3 + 6 * slab + 12 * edge + 8 * octant;

  const moment =
      16 * c ** 5 / 3                                                    // core box
    + 2 * slab * (2 * c * c / 3)                                         // slabs on the axis
    + 4 * slab * ((r * r + 4 * c * c) / 12 + (c + r / 2) ** 2)           // slabs beside it
    + 8 * c * (Math.PI * c * c * r * r / 2 + 4 * c * r ** 3 / 3
               + Math.PI * r ** 4 / 8)                                   // edges along the axis
    + 8 * ((2 * c ** 3 / 3) * (Math.PI * r * r / 4)
           + 2 * c * (c * c * (Math.PI * r * r / 4) + 2 * c * r ** 3 / 3
                      + Math.PI * r ** 4 / 16))                          // edges across it
    + 16 * (c * c * octant + c * Math.PI * r ** 4 / 8
            + Math.PI * r ** 5 / 30);                                    // corners

  return moment / volume;                            // per unit mass
}

const DIE_MASS = 1;
const INV_MASS = 1 / DIE_MASS;
const INV_INERTIA = 1 / (DIE_MASS * roundedCubeInertia(DIE_SIZE, DIE_RADIUS));

// Restitution and Coulomb friction for the three things a die can hit.
// Polished resin dropped on a felted board keeps roughly a third of its
// approach speed; lacquered wood gives more back, and two dice more again.
const FELT_BOUNCE = .34, FELT_FRICTION = .45;
const RAIL_BOUNCE = .42, RAIL_FRICTION = .32;
const DIE_BOUNCE = .5, DIE_FRICTION = .25;
// Under this approach speed a contact is resting, not bouncing. Without it a
// die trades ever smaller bounces with the felt and never quite lands.
const REST_THRESHOLD = 3;     // ≈ 11 cm/s
// Friction now takes the die down to a genuine stop rather than a decay
// curve, so the thresholds that call it stopped can sit low.
const STILL_SPEED = .5;       // ≈ 1.8 cm/s
const STILL_SPIN = .8;        // rad/s
const STILL_TIME = .12;
// Within six degrees of flat is drift; beyond that the die is cocked.
const FLAT_ENOUGH = Math.cos(6 * Math.PI / 180);
// The dice stop where the points end, and it is a corner of the die that has
// to stop there, not its centre. That line sits a quarter unit inside the
// felt, so it is not the edge of the playing surface — it is the edge of the
// laid-out board, which is also where the outermost checkers stand. Moving it
// out to the felt leaves a nine millimetre trough between those checkers and
// the wall that a ten millimetre die cannot lie flat in, so it stays here.
const WALL_X = FIELD_HALF_X;
const WALL_Z = FIELD_HALF;

// Physics runs on a fixed timestep and catches up across however many frames
// the machine manages, so a throw takes the same real time to settle whether
// the page is running at 120fps or struggling along at 5.
// At real gravity a thrown die covers a good fraction of its own width per
// millisecond, so the step has to be short enough that a corner cannot pass
// through the felt between two samples.
const PHYSICS_STEP = 1 / 480;
let physicsDebt = 0;

// One substep: move everything, find every contact, then solve the whole set
// together. A die resting flat stands on four corners at once, and those four
// contacts have to agree on how to share its weight — solving them one pass at
// a time leaves the die trembling on the felt forever, which is exactly what
// happens if you take the loop below out.
const SOLVER_ITERATIONS = 8;

function stepDicePhysics(frameDt) {
  physicsDebt = Math.min(physicsDebt + frameDt, .5);
  while (physicsDebt >= PHYSICS_STEP) {
    for (const die of diceMeshes) integrateDie(die, PHYSICS_STEP);
    collectContacts();
    for (let i = 0; i < SOLVER_ITERATIONS; i++) {
      for (const c of contacts) solveContact(c);
    }
    resolvePenetration();
    for (const die of diceMeshes) checkStopped(die, PHYSICS_STEP);
    physicsDebt -= PHYSICS_STEP;
  }
}

// Scratch vectors: the solver runs 480 times a second against every corner of
// every die, and allocating in there would hand the collector a steady drip.
const _arm = new THREE.Vector3();
const _armB = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _relB = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _offsetB = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _touch = new THREE.Vector3();
const _local = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _invQ = new THREE.Quaternion();

function integrateDie(die, dt) {
  const s = die.userData.die;
  if (s.mode !== "throw") return;
  s.vel.y += GRAVITY * dt;
  die.position.addScaledVector(s.vel, dt);
  applySpin(die, s.spin, dt);
  s.touching = false;
}

// Velocity of the material point sitting at offset r from the centre — the
// centre's own velocity plus what the spin is doing out at that radius. This
// is what a contact actually sees, and leaving the ω × r term out is what
// stops a die from ever truly rolling.
function pointVelocity(s, r, out) {
  return out.crossVectors(s.spin, r).add(s.vel);
}

function applyImpulse(s, r, impulse) {
  s.vel.addScaledVector(impulse, INV_MASS);
  s.spin.addScaledVector(_torque.crossVectors(r, impulse), INV_INERTIA);
}

// --- contacts -------------------------------------------------------
// Each one is rebuilt from scratch every substep but the objects are pooled,
// so a throw allocates nothing.
const contactPool = [];
const contacts = [];
let contactCount = 0;

function newContact() {
  if (contactPool.length === contactCount) {
    contactPool.push({
      a: null, b: null,
      r: new THREE.Vector3(), rb: new THREE.Vector3(),
      n: new THREE.Vector3(), t1: new THREE.Vector3(), t2: new THREE.Vector3(),
      kn: 0, k1: 0, k2: 0, bias: 0, friction: 0, jn: 0, j1: 0, j2: 0,
    });
  }
  return contactPool[contactCount++];
}

// Relative velocity of the two touching points, or of the one touching point
// and the immovable board.
function contactVelocity(c, out) {
  pointVelocity(c.a, c.r, out);
  if (c.b) out.sub(pointVelocity(c.b, c.rb, _relB));
  return out;
}

function contactMass(c, dir, arm) {
  let k = INV_MASS + INV_INERTIA * arm.crossVectors(c.r, dir).lengthSq();
  if (c.b) k += INV_MASS + INV_INERTIA * _armB.crossVectors(c.rb, dir).lengthSq();
  return k;
}

function addContact(a, b, r, rb, n, restitution, friction) {
  const c = newContact();
  c.a = a; c.b = b;
  c.r.copy(r);
  if (b) c.rb.copy(rb);
  c.n.copy(n);
  // Any two directions across the normal will do for the friction basis.
  c.t1.set(n.z, n.x, n.y).cross(n);
  if (c.t1.lengthSq() < 1e-9) c.t1.set(1, 0, 0).cross(n);
  c.t1.normalize();
  c.t2.crossVectors(n, c.t1);
  c.kn = contactMass(c, c.n, _arm);
  c.k1 = contactMass(c, c.t1, _arm);
  c.k2 = contactMass(c, c.t2, _arm);
  // Restitution is fixed against the speed the contact came in at, not
  // recomputed each iteration — otherwise the iterations feed it energy.
  const approach = contactVelocity(c, _rel).dot(n);
  c.bias = -approach > REST_THRESHOLD ? -restitution * approach : 0;
  c.friction = friction;
  c.jn = c.j1 = c.j2 = 0;
  a.touching = true;
  if (b) b.touching = true;
  contacts.push(c);
  return c;
}

// One pass over one contact. The normal impulse is accumulated and never
// allowed to go negative — a contact can push, it cannot pull — and the
// friction impulse is a two-axis vector kept inside the Coulomb cone. Under
// the cap the contact sticks and the die rolls; on it, the die slides and the
// surplus is the speed it scrubs off. The torque all this leaves behind about
// the centre of mass is the tumble.
function solveContact(c) {
  const vn = contactVelocity(c, _rel).dot(c.n);
  const prev = c.jn;
  c.jn = Math.max(0, prev - (vn - c.bias) / c.kn);
  applyContactImpulse(c, _imp.copy(c.n).multiplyScalar(c.jn - prev));

  contactVelocity(c, _rel);
  const limit = c.friction * c.jn;
  let j1 = c.j1 - _rel.dot(c.t1) / c.k1;
  let j2 = c.j2 - _rel.dot(c.t2) / c.k2;
  const mag = Math.hypot(j1, j2);
  if (mag > limit) { j1 *= limit / mag; j2 *= limit / mag; }
  _imp.copy(c.t1).multiplyScalar(j1 - c.j1).addScaledVector(c.t2, j2 - c.j2);
  applyContactImpulse(c, _imp);
  c.j1 = j1; c.j2 = j2;
}

function applyContactImpulse(c, impulse) {
  applyImpulse(c.a, c.r, impulse);
  if (c.b) applyImpulse(c.b, c.rb, impulse.multiplyScalar(-1));
}

// --- finding the contacts -------------------------------------------
function collectContacts() {
  contacts.length = 0;
  contactCount = 0;
  for (const die of diceMeshes) {
    if (die.userData.die.mode === "held") continue;
    boardContacts(die);
    barContacts(die);
    checkerContacts(die);
  }
  for (let i = 0; i < diceMeshes.length; i++) {
    for (let k = i + 1; k < diceMeshes.length; k++) {
      diePairContacts(diceMeshes[i], diceMeshes[k]);
    }
  }
}

// The contacts say how the dice should move; this says where they are allowed
// to be. It runs a few times over because the corrections argue with each
// other: lifting a die off a checker can put it through a rail, holding it
// inside the rails can put it into the other die, and either can push it back
// onto the bar. Three passes settles it. The overlap is shared between two
// dice and taken entirely by the die when the other party is the board.
const PENETRATION_PASSES = 3;

function resolvePenetration() {
  for (let pass = 0; pass < PENETRATION_PASSES; pass++) {
    for (const die of diceMeshes) {
      if (die.userData.die.mode === "held") continue;
      pushOffBar(die);
      pushOffCheckers(die);
    }
    for (let i = 0; i < diceMeshes.length; i++) {
      for (let k = i + 1; k < diceMeshes.length; k++) {
        pushDiceApart(diceMeshes[i], diceMeshes[k]);
      }
    }
    for (const die of diceMeshes) {
      if (die.userData.die.mode !== "held") keepInsideField(die);
    }
  }
}

function pushOffBar(die) {
  boxAxes(die, _axA);
  if (!boxesOverlap(die.position, dieSupport, _axA, DIE_HALVES,
                    BAR_CENTRE, boxSupport, WORLD_AXES, BAR_HALVES)) return;
  die.position.addScaledVector(_sat.normal, _sat.depth);
  die.userData.die.touching = true;
}

function pushOffCheckers(die) {
  const reach = DIE_INNER * Math.sqrt(3) + DIE_RADIUS;
  for (const checker of pieceMeshes) {
    const dx = die.position.x - checker.position.x;
    const dz = die.position.z - checker.position.z;
    if (dx * dx + dz * dz > CHECKER_RANGE) continue;
    _centre.set(checker.position.x, checker.position.y + CHECKER_H / 2, checker.position.z);
    if (die.position.y - reach > _centre.y + CHECKER_H / 2) continue;
    boxAxes(die, _axA);
    if (!discOverlap(die.position, _axA, DIE_HALVES, _centre, CHECKER_HALVES)) continue;
    die.position.addScaledVector(_sat.normal, _sat.depth);
    die.userData.die.touching = true;
  }
}

function pushDiceApart(dieA, dieB) {
  if (dieA.userData.die.mode === "held" || dieB.userData.die.mode === "held") return;
  boxAxes(dieA, _axA);
  boxAxes(dieB, _axB);
  if (!boxesOverlap(dieA.position, dieSupport, _axA, DIE_HALVES,
                    dieB.position, dieSupport, _axB, DIE_HALVES)) return;
  dieA.position.addScaledVector(_sat.normal, _sat.depth * .5);
  dieB.position.addScaledVector(_sat.normal, _sat.depth * -.5);
  dieA.userData.die.touching = true;
  dieB.userData.die.touching = true;
}

// The felt, and the rails around the field. Every corner that has gone
// through gets its own contact, so a die coming down flat is caught by four
// of them and one landing on a single corner is spun about it. It is a corner
// of the die that has to stop at a rail, not its centre.
function boardContacts(die) {
  const s = die.userData.die;

  for (const corner of DIE_CORNERS) {
    _offset.copy(corner).applyQuaternion(die.quaternion);
    _corner.copy(_offset).add(die.position);

    if (_corner.y - DIE_RADIUS < FELT_Y) {
      _touch.copy(_offset).addScaledVector(FELT_UP, -DIE_RADIUS);
      addContact(s, null, _touch, null, FELT_UP, FELT_BOUNCE, FELT_FRICTION);
    }
    const overX = Math.abs(_corner.x) + DIE_RADIUS - WALL_X;
    if (overX > 0) {
      _normal.set(-Math.sign(_corner.x), 0, 0);
      _touch.copy(_offset).addScaledVector(_normal, -DIE_RADIUS);
      addContact(s, null, _touch, null, _normal, RAIL_BOUNCE, RAIL_FRICTION);
    }
    const overZ = Math.abs(_corner.z) + DIE_RADIUS - WALL_Z;
    if (overZ > 0) {
      _normal.set(0, 0, -Math.sign(_corner.z));
      _touch.copy(_offset).addScaledVector(_normal, -DIE_RADIUS);
      addContact(s, null, _touch, null, _normal, RAIL_BOUNCE, RAIL_FRICTION);
    }
  }

}

// Whatever the bar and the checkers did to the die on the way past, it does
// not finish a substep outside the field. Held back to the end so it is the
// last word: correcting the rails first only for a checker to shove the die
// back through them leaves it outside until the next substep catches it.
function keepInsideField(die) {
  let lift = 0, pushX = 0, sideX = 0, pushZ = 0, sideZ = 0;
  for (const corner of DIE_CORNERS) {
    _offset.copy(corner).applyQuaternion(die.quaternion);
    _corner.copy(_offset).add(die.position);
    lift = Math.max(lift, FELT_Y - (_corner.y - DIE_RADIUS));
    const overX = Math.abs(_corner.x) + DIE_RADIUS - WALL_X;
    if (overX > pushX) { pushX = overX; sideX = Math.sign(_corner.x); }
    const overZ = Math.abs(_corner.z) + DIE_RADIUS - WALL_Z;
    if (overZ > pushZ) { pushZ = overZ; sideZ = Math.sign(_corner.z); }
  }
  if (lift > 0) die.position.y += lift;
  if (pushX > 0) die.position.x -= sideX * pushX;
  if (pushZ > 0) die.position.z -= sideZ * pushZ;
  // Anything that had to be pushed was touching, whether or not the contact
  // pass caught it. A die held up by this alone and never counted as touching
  // is a die that never counts as stopped either.
  if (lift > 0 || pushX > 0 || pushZ > 0) die.userData.die.touching = true;
}

// Everything a die can hit besides the felt is a convex solid, so they are
// all tested the same way: the separating axis test. If a direction exists in
// which the two shadows do not overlap, they are apart; otherwise the
// shallowest overlap of all the candidate directions is the one they have to
// be pushed back along, and it is the contact normal.
//
// The obvious cheap test — is a corner of one inside the other — is what this
// started as, and it fails at exactly the case that matters most: two dice
// lying flat on the felt at the same height, where every corner sits dead on
// the other's face plane rather than inside it. They slid through each other.
const _axA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _axB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const WORLD_AXES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1),
];
const _axes = [];
for (let i = 0; i < 15; i++) _axes.push(new THREE.Vector3());
const _points = [];
for (let i = 0; i < 8; i++) _points.push(new THREE.Vector3());
const _delta = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _sat = { depth: 0, normal: new THREE.Vector3() };
// A corner counts as pressed against the other solid if it is no deeper than
// the shallowest overlap plus a little; anything further in belongs to the far
// side of it and is not what is touching.
const CONTACT_SKIN = DIE_SIZE * .15;

const DIE_HALVES = new THREE.Vector3(DIE_INNER, DIE_INNER, DIE_INNER);
// The bar down the middle of the board stands proud of the felt, and the
// checkers stand proud of that. Both are in the dice's way.
const BAR_HALVES = new THREE.Vector3(BAR_HALF, WALL_H / 2, CASE_HALF_Z);
const BAR_CENTRE = new THREE.Vector3(0, FELT_Y + WALL_H / 2, 0);
const CHECKER_HALVES = new THREE.Vector3(CHECKER_R, CHECKER_H / 2, CHECKER_R);
// Nothing further away than this can be touching, whatever the angles.
const CHECKER_RANGE = (CHECKER_R + DIE_INNER * Math.sqrt(3) + DIE_RADIUS) ** 2;
const BAR_BOUNCE = .42, BAR_FRICTION = .32;
const CHECKER_BOUNCE = .45, CHECKER_FRICTION = .3;

function boxAxes(die, out) {
  out[0].set(1, 0, 0).applyQuaternion(die.quaternion);
  out[1].set(0, 1, 0).applyQuaternion(die.quaternion);
  out[2].set(0, 0, 1).applyQuaternion(die.quaternion);
}

// Half-width of a solid's shadow along an arbitrary direction. A box casts the
// sum of its three half extents; a checker is a disc standing on the felt, so
// it casts its radius across and its half thickness up.
function boxSupport(axes, half, dir) {
  return half.x * Math.abs(axes[0].dot(dir))
       + half.y * Math.abs(axes[1].dot(dir))
       + half.z * Math.abs(axes[2].dot(dir));
}

function discSupport(axes, half, dir) {
  return half.x * Math.hypot(dir.x, dir.z) + half.y * Math.abs(dir.y);
}

// A die reaches its corner radius further than its inner box in every
// direction, which is exactly what rolling a ball around a box does.
function dieSupport(axes, half, dir) {
  return boxSupport(axes, half, dir) + DIE_RADIUS;
}

// Walk a set of candidate axes, keeping the shallowest overlap. Bails out the
// moment one of them shows a gap, because that alone proves they are apart.
function shallowestOverlap(count, posA, supportA, axesA, halfA, posB, supportB, axesB, halfB) {
  _delta.copy(posA).sub(posB);
  let shallowest = Infinity, found = null;
  for (let i = 0; i < count; i++) {
    const axis = _axes[i];
    const overlap = supportA(axesA, halfA, axis) + supportB(axesB, halfB, axis)
      - Math.abs(_delta.dot(axis));
    if (overlap <= 0) return false;
    if (overlap < shallowest) { shallowest = overlap; found = axis; }
  }
  _sat.depth = shallowest;
  _sat.normal.copy(found);
  if (_sat.normal.dot(_delta) < 0) _sat.normal.negate();     // out of B, towards A
  return true;
}

// Box against box: the face normals of both, plus the cross products of their
// edges, which is what catches two of them meeting corner to corner.
function boxesOverlap(posA, supportA, axesA, halfA, posB, supportB, axesB, halfB) {
  let count = 0;
  for (let i = 0; i < 3; i++) _axes[count++].copy(axesA[i]);
  for (let i = 0; i < 3; i++) _axes[count++].copy(axesB[i]);
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      const axis = _axes[count].crossVectors(axesA[i], axesB[k]);
      if (axis.lengthSq() > 1e-8) { axis.normalize(); count++; }   // skip parallel edges
    }
  }
  return shallowestOverlap(count, posA, supportA, axesA, halfA,
                                  posB, supportB, axesB, halfB);
}

// Box against checker. A disc has no edges to cross, so the candidates are its
// axis, the direction out from it towards the die, and the die's own faces.
function discOverlap(posA, axesA, halfA, posB, halfB) {
  _axes[0].set(0, 1, 0);
  _axes[1].set(posA.x - posB.x, 0, posA.z - posB.z);
  if (_axes[1].lengthSq() < 1e-9) _axes[1].set(1, 0, 0); else _axes[1].normalize();
  for (let i = 0; i < 3; i++) _axes[2 + i].copy(axesA[i]);
  return shallowestOverlap(5, posA, dieSupport, axesA, halfA,
                              posB, discSupport, WORLD_AXES, halfB);
}

// The corners of a die pressed against whatever it has hit, in the direction
// of the contact normal. `towards` is +1 when the die is the one the normal
// points at, -1 when it is the one the normal points away from. Points land in
// the shared pool and the count comes back.
function pressedCorners(die, centre, support, axes, half, towards) {
  const n = _sat.normal;
  _t1.set(n.z, n.x, n.y).cross(n);
  if (_t1.lengthSq() < 1e-9) _t1.set(1, 0, 0).cross(n);
  _t1.normalize();
  _t2.crossVectors(n, _t1);

  const reach = support(axes, half, n) + DIE_RADIUS;
  const spread1 = support(axes, half, _t1) + DIE_RADIUS;
  const spread2 = support(axes, half, _t2) + DIE_RADIUS;

  let found = 0;
  for (const corner of DIE_CORNERS) {
    _corner.copy(corner).applyQuaternion(die.quaternion).add(die.position);
    _local.copy(_corner).sub(centre);
    const depth = reach - towards * _local.dot(n);
    if (depth <= 0 || depth > _sat.depth + CONTACT_SKIN) continue;
    if (Math.abs(_local.dot(_t1)) > spread1) continue;
    if (Math.abs(_local.dot(_t2)) > spread2) continue;
    // The ball touches a radius short of its own centre.
    _points[found++].copy(_corner).addScaledVector(n, -towards * DIE_RADIUS);
  }
  return found;
}

// --- what a die can run into ----------------------------------------
// The bar down the centre seam, which a die crossing the board has to clear.
function barContacts(die) {
  const s = die.userData.die;
  if (s.mode !== "throw") return;
  boxAxes(die, _axA);
  if (!boxesOverlap(die.position, dieSupport, _axA, DIE_HALVES,
                    BAR_CENTRE, boxSupport, WORLD_AXES, BAR_HALVES)) return;
  const hits = pressedCorners(die, BAR_CENTRE, boxSupport, WORLD_AXES, BAR_HALVES, 1);
  for (let i = 0; i < hits; i++) {
    _offset.copy(_points[i]).sub(die.position);
    addContact(s, null, _offset, null, _sat.normal, BAR_BOUNCE, BAR_FRICTION);
  }
}

// The checkers. They are the board as far as a die is concerned: a die that
// lands on one sits on it, and one that runs into a stack is stopped by it,
// but the checkers themselves are game state and do not get knocked about.
function checkerContacts(die) {
  const s = die.userData.die;
  if (s.mode !== "throw") return;
  boxAxes(die, _axA);
  const reach = DIE_INNER * Math.sqrt(3) + DIE_RADIUS;
  for (const checker of pieceMeshes) {
    const dx = die.position.x - checker.position.x;
    const dz = die.position.z - checker.position.z;
    if (dx * dx + dz * dz > CHECKER_RANGE) continue;
    _centre.set(checker.position.x, checker.position.y + CHECKER_H / 2, checker.position.z);
    if (die.position.y - reach > _centre.y + CHECKER_H / 2) continue;
    if (!discOverlap(die.position, _axA, DIE_HALVES, _centre, CHECKER_HALVES)) continue;

    const hits = pressedCorners(die, _centre, discSupport, WORLD_AXES, CHECKER_HALVES, 1);
    for (let i = 0; i < hits; i++) {
      _offset.copy(_points[i]).sub(die.position);
      addContact(s, null, _offset, null, _sat.normal, CHECKER_BOUNCE, CHECKER_FRICTION);
    }
  }
}

// The other die.
function diePairContacts(dieA, dieB) {
  const sa = dieA.userData.die, sb = dieB.userData.die;
  if (sa.mode === "held" || sb.mode === "held") return;
  boxAxes(dieA, _axA);
  boxAxes(dieB, _axB);
  if (!boxesOverlap(dieA.position, dieSupport, _axA, DIE_HALVES,
                    dieB.position, dieSupport, _axB, DIE_HALVES)) return;

  let hits = pressedCorners(dieA, dieB.position, boxSupport, _axB, DIE_HALVES, 1);
  for (let i = 0; i < hits; i++) addDieContact(dieA, dieB, _points[i]);
  hits = pressedCorners(dieB, dieA.position, boxSupport, _axA, DIE_HALVES, -1);
  for (let i = 0; i < hits; i++) addDieContact(dieA, dieB, _points[i]);
}

// One contact between the pair, at a point both of them share.
function addDieContact(dieA, dieB, point) {
  const sa = dieA.userData.die, sb = dieB.userData.die;
  _offset.copy(point).sub(dieA.position);
  _offsetB.copy(point).sub(dieB.position);

  // A die already at rest is knocked back into play by a real knock — hard
  // enough to bounce off felt — but not by the hair of overlap two settled
  // dice can share, and not by the sliver of speed gravity adds each substep
  // to a die that is already lying still.
  pointVelocity(sb, _offsetB, _relB);
  if (pointVelocity(sa, _offset, _rel).sub(_relB).dot(_sat.normal) < -REST_THRESHOLD) {
    if (sa.mode === "rest") wakeDie(dieA);
    if (sb.mode === "rest") wakeDie(dieB);
  }

  // A die still at rest after that is part of the board as far as this
  // contact goes: it is not being integrated, so handing it an impulse would
  // put velocity on a body that never spends it.
  if (sa.mode === "throw" && sb.mode === "throw") {
    addContact(sa, sb, _offset, _offsetB, _sat.normal, DIE_BOUNCE, DIE_FRICTION);
  } else if (sa.mode === "throw") {
    addContact(sa, null, _offset, null, _sat.normal, DIE_BOUNCE, DIE_FRICTION);
  } else if (sb.mode === "throw") {
    _normal.copy(_sat.normal).negate();
    addContact(sb, null, _offsetB, null, _normal, DIE_BOUNCE, DIE_FRICTION);
  }
}

// Friction takes the die to a real stop, so this is a check for having
// stopped rather than a decay that forces it.
//
// "Touching" is allowed to lapse for a moment. A die wedged against a rail on
// top of a checker is put exactly back on both by the position pass, and a
// substep that starts with it resting exactly on them finds nothing to report
// — so the flag flickers off and the count of how long it has been still
// starts again from nothing, over and over. Something it touched a fiftieth of
// a second ago is still something it is sitting on. Anything genuinely in
// flight is out of contact far longer than that, and moving.
const CONTACT_GRACE = .02;

function checkStopped(die, dt) {
  const s = die.userData.die;
  if (s.mode !== "throw") return;
  s.offContact = s.touching ? 0 : s.offContact + dt;
  if (s.offContact < CONTACT_GRACE
      && s.vel.length() < STILL_SPEED && s.spin.length() < STILL_SPIN) {
    s.still += dt;
    if (s.still > STILL_TIME) settleDie(die);
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

// Six checkers lie flat on a point. Past that they go on top — but set across
// the join between two of the ones below rather than squarely on one, because
// from a seat above the board a checker placed straight on top hides the one
// under it and the pile reads as a single checker. Half a checker along makes
// the layer above show as its own row.
//
// Each layer is therefore one shorter than the one below and starts half a
// checker further in, so a tall point steps up as a pyramid: six, then five,
// then four. That is nineteen before the apex, and fifteen is all either side
// has.
const CHECKERS_FLAT = 6;

function checkerSeat(key, index) {
  const p = POINTS[key];
  let layer = 0, slot = index, row = CHECKERS_FLAT;
  while (slot >= row && row > 1) { slot -= row; layer++; row--; }
  return {
    x: p.x,
    y: .47 + layer * (CHECKER_H + .004),
    z: p.baseZ + p.dir * (layer * CHECKER_GAP / 2 + slot * CHECKER_GAP),
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
  dropUnsupportedDice();
}

// A die can come to rest on top of a checker, and then that checker gets
// played. Anything left standing above the felt is put back into the throw so
// it falls; a die that is still supported simply settles again where it is.
function dropUnsupportedDice() {
  for (const die of diceMeshes) {
    const s = die.userData.die;
    if (s.mode === "rest" && lowestCorner(die) > FELT_Y + 1e-3) wakeDie(die);
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
// Height the dice ride at while they are being shaken, and so the height they
// are let go from: a hand's width above the felt rather than skimming it.
const LIFT_Y = 2.6;
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
  // Around 2 m/s, which is a firm throw rather than a nudge — hard enough to
  // reach the far rail, come back off it and keep tumbling.
  const aim = new THREE.Vector3(hand.x * .3, 0, -1)
    .normalize()
    .multiplyScalar(52 + Math.random() * 16);

  heldDice.entries.forEach(({ die }) => {
    const s = die.userData.die;
    s.mode = "throw";
    // Enough scatter that they do not fly in formation and land in a stack.
    s.vel.copy(aim).add(new THREE.Vector3(
      (Math.random() - .5) * 12,
      0,
      (Math.random() - .5) * 12
    ));
    // Thrown up and out of the hand, not rolled off the fingertips.
    s.vel.y = 7 + Math.random() * 7;
    s.spin.copy(randomShakeSpin()).clampLength(30, 54);
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
    const fill = new THREE.DirectionalLight(0xeef1f4, .3);
    fill.position.set(x * 11, 7, z * 11);
    scene.add(fill);
  });

  // Just enough lift to keep the darks open rather than crushed.
  scene.add(new THREE.HemisphereLight(0xdfe7ee, 0x40301f, .85));
  scene.add(new THREE.AmbientLight(0xfff6e8, .22));
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

