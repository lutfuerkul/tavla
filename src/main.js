import * as THREE from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("#scene");
import * as Rules from "./rules.js";
import { LANGS, language, setLanguage, t, isIdeographic } from "./i18n.js";
import { localSession, onlineSession } from "./session.js";
import { attend, ask, connect, follow, sitAt } from "./firebase.js";
import { cal as calSes, hamleSesi, sesAcikMi, sesiCevir, uyandir as sesiUyandir } from "./ses.js";
import * as Muzik from "./muzik.js";

// Where the turns come from. Everything the board cannot decide by itself goes
// through here, so a game against a server can be a different session rather
// than a different board.
let session = localSession();

const intro = document.querySelector("#intro");
const hud = document.querySelector("#hud");

// Two boards to choose from at the door. They share the case — the tray
// walls, the seam and the hinges are the same joinery on both — and differ
// only in what is laid inside it: how long the points run, how heavy the
// braid is, and how the veneer is figured.
const BOARDS = {
  klasik: {
    pointLen: 5,
    pointHalf: .5,
    braidBand: 13,
    braidStep: 17,
    veneer: { base: "#54381c", grain: "#1d0e03", eye: 95, figure: .35, mirrored: false },
    pale: ["#e4d6a6", "#c9b884"],
    dark: ["#432a13", "#2c1a09"],
    gloss: { roughness: .4, clearcoat: .34, clearcoatRoughness: .18 },
    room: { env: .22, fill: .16, hemi: .42, ambient: .1 },
  },
  star: {
    pointLen: 5.35,
    pointHalf: null,                 // bases meet: one braid serves two points
    braidBand: 26,
    braidStep: 30,
    veneer: { base: "#7b5730", grain: "#251306", eye: 165, figure: 1, mirrored: true },
    pale: ["#e4d6a6", "#c9b884"],
    dark: ["#6d4c2a", "#2a1608"],
    gloss: { roughness: .3, clearcoat: .95, clearcoatRoughness: .04 },
    room: { env: .22, fill: .16, hemi: .42, ambient: .1 },
  },
};
// Otomatik'in yazı-turası, ve nerede atıldığı.
//
// Masa, renk ve taraf "Otomatik"te bırakılabiliyor ve o zaman bir yazı-turayla
// belirleniyor. Tura "Oyuna başla"ya basıldığı anda atılıyordu, ve attığı şey
// neredeyse her zaman o anki sahneden farklı çıkıyordu — iki seçenekten birini
// tutturma şansı yarı yarıya, üç ayarın üçünü birden tutturmak sekizde bir. O
// yüzden kapıdan oyuna geçiş neredeyse her seferinde sayfayı baştan yüklüyordu,
// ve sayfa gidince çalan müzik de gidiyordu.
//
// Tura artık burada atılıyor: sayfa kurulurken, sahne çizilmeden önce. Sahne
// çıkan sonuca göre kuruluyor, ve basıldığında Otomatik'in cevabı zaten
// ekranda duran şey oluyor — yani yeniden yükleme gerekmiyor, yani müzik
// kesilmiyor. Çeşitlilik de duruyor: her sayfa açılışı yeni bir tura.
//
// Elle seçilmiş olan hariç. Star tahtasını isteyen biri onu bir kez söylüyor
// ve bir daha sorulmuyor; işaret ayrı tutuluyor, çünkü depodaki değerin
// kendisi turayla seçilmişi de elle seçilmişi de aynı görünüyor.
const SECILDI_SONU = ".secildi";
const eldeSecilmis = anahtar => localStorage.getItem(anahtar + SECILDI_SONU) === "1";

function turaAt(anahtar, secenekler) {
  if (eldeSecilmis(anahtar)) return;
  localStorage.setItem(anahtar, secenekler[Math.floor(Math.random() * secenekler.length)]);
}

// Which checkers are yours is chosen at the door and settled here, before
// anything is built, because the seat follows it: black comes home to 19-24
// on the near row and ivory to 1-6 on the far one, so whoever you play, the
// camera has to sit on that side of the table or you bear off away from
// yourself across the board.
const COLOUR_KEY = "tavla.colour";
turaAt(COLOUR_KEY, ["black", "ivory"]);
const HUMAN = localStorage.getItem(COLOUR_KEY) === "ivory" ? "ivory" : "black";
const COMPUTER = HUMAN === "ivory" ? "black" : "ivory";
// Looked up rather than stored, so a line written after the language changes
// is written in the new one.
const nameOf = colour => t("name." + colour);

// Away from your own seat: the direction a throw is aimed.
const AWAY = HUMAN === "black" ? -1 : 1;

// Which hand you gather your checkers with, also chosen at the door. Left is
// where most people want them, so it is what an unanswered door means.
const SIDE_KEY = "tavla.side";
turaAt(SIDE_KEY, ["sol", "sag"]);
const SIDE = localStorage.getItem(SIDE_KEY) === "sag" ? -1 : 1;

// Your home board is on your chosen side of the screen whichever colour you
// play. The camera sitting on your side of the table gets the near row under
// your hands; this gets the six points you bear off from under the hand you
// asked for, by laying the numbering out along x one way or the other. The
// two factors multiply: the colour decides which way is "your left", and the
// side flips it if you would rather gather right.
const MIRROR = (HUMAN === "black" ? -1 : 1) * SIDE;

// Two ways to play: against the computer, or two people sharing one screen and
// taking the table in turns. Both are settled at the door, before anything is
// built, because the picker that sets them runs there.
const MODE_KEY = "tavla.mode";
const MATCH_KEY = "tavla.mac";
// A table this browser has got up from but may not have managed to say so
// about. Written before the word is sent and cleared once it has arrived —
// see leaveTable and the retry below it.
const LEAVING_KEY = "tavla.kalkilan";
const MODES = ["solo", "hotseat", "online"];
let mode = MODES.includes(localStorage.getItem(MODE_KEY)) ? localStorage.getItem(MODE_KEY) : "solo";
// The match this browser is sitting at, if it is sitting at one. Online is the
// only mode that has one, and losing it is how a game is left.
let matchId = mode === "online" ? localStorage.getItem(MATCH_KEY) : null;
if (mode === "online" && !matchId) mode = "solo";
// Across a network only your own colour is yours; on one device both are.
const isHuman = colour => mode === "hotseat" || colour === HUMAN;

// Fingers rather than a mouse, and how much screen there is to fill. A tablet
// and a phone are both handhelds and want opposite things: the tablet paints
// three times the phone's pixels off a chip that is not three times the phone's
// and could not hold its own resolution, so its frame is made cheaper. The
// phone's frame was never the problem, and the same economies were visible on
// it — so the phone keeps everything it had.
const HANDHELD = matchMedia?.("(pointer: coarse)").matches ?? false;

// There was a choice of two mouldings here once, thin and thick, and it is
// gone: there is one set of checkers and no setting. The difference between
// them was a millimetre of rim and a shallower dish — on a phone that is
// nothing anybody can see, and even on a desk it was a row at the door for a
// difference nobody was choosing between. The thin one is the one that stays.
//
// The old answer is cleared out rather than left lying: somebody who chose the
// thick set once has it written down, and a preference that no longer has a
// question attached to it is only there to confuse whoever reads the storage.
localStorage.removeItem("tavla.tas");

// Which cloth the table is dressed with, chosen at the door like the board.
const CLOTH_KEY = "tavla.cuha";
// The cloth the board stands on, in the hand. There was a choice of them once —
// green, blue, grey, all one tinted weave — but the velvet was the one worth
// keeping, so it is the only one now, and the door no longer asks. Its own
// photograph rather than a tinted weave: a pile is not a colour turned up.
const CLOTH = { file: "cuha-kadife.jpg", tile: 9 };
// Kept only so a board saved under an old cloth name reads back as this one.
const clothName = "kadife";

const BOARD_KEY = "tavla.board";
turaAt(BOARD_KEY, Object.keys(BOARDS));
const boardName = BOARDS[localStorage.getItem(BOARD_KEY)] ? localStorage.getItem(BOARD_KEY) : "klasik";
const BOARD = BOARDS[boardName];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060402);
// Light fog only, for depth in the room. At the old density the camera sat
// far enough back that the board itself lost about 40% of its brightness,
// which read as uneven lighting no matter how the lamps were arranged.
scene.fog = new THREE.FogExp2(0x060402, 0.015);

// Fixed seat at the table — the camera never moves once seated, so the mouse
// is free to drag checkers instead of looking around.
//
// Where that seat is depends on who is playing. Against the computer you are
// the only one at the table, so the camera takes your chair and looks across
// the board from it. With two people round one tablet there is no such chair:
// whichever side the camera leans from is the side the other player is looking
// at edge-on. So it goes straight overhead, where neither of them is favoured,
// and comes in a little closer — looking down the board rather than along it
// leaves room to.
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
const CAMERA_AIM = new THREE.Vector3(0, .4, 0);

// Which of the two the game opens with follows the mode, and either can be
// asked for from the board. An answer given is remembered and outranks the
// mode's own preference; until one is given, changing the mode at the door
// changes the view with it.
const TABLET = HANDHELD && Math.min(innerWidth, innerHeight) >= 600;

// A board that is not moving is a board whose next frame would be identical to
// the one already on the screen. Drawing it sixty times a second costs a phone
// its battery and — this is the part that shows — its heat budget: a chip that
// has been painting the same picture for two minutes has throttled itself by
// the time the dice are finally thrown, so the one moment that needed the
// speed is the one moment it does not have.
//
// So in the hand nothing is drawn unless something changed. On a desk it is
// left alone: a machine on mains power with a fan has nothing to gain, and
// every frame not drawn is a frame that cannot be wrong.
const ON_DEMAND = HANDHELD;
let needsFrame = true;
const wake = () => { needsFrame = true; };
// Whatever is missed, missed for no longer than this. Every change the board
// makes ought to call wake(), and a change that does not is a change that never
// appears — so twice a second the frame is drawn anyway. Two frames against
// sixty is nothing to pay for never being stuck with a stale picture.
const HEARTBEAT_MS = 500;
let lastDrawn = 0;

const VIEW_KEY = "tavla.kamera";
let chosenView = localStorage.getItem(VIEW_KEY);
// Where the camera starts, until somebody says otherwise. The seat — the FPS
// view — is what the game opens on now, on a phone as much as a desktop: it is
// the view the board was lit for. The one exception is two people round one
// device, who sit opposite each other, so a view from either chair is the
// wrong way up for the other — that still opens overhead.
const overhead = () =>
  (chosenView ?? (mode === "hotseat" ? "tepe" : "koltuk")) === "tepe";

function takeSeat() {
  wake();
  if (overhead()) {
    camera.position.set(0, 17.6, 0);
    // Straight down is the one direction the default up vector cannot resolve,
    // so it is given one: away from the near row, which keeps the board the
    // same way round as the seated view had it.
    camera.up.set(0, 0, AWAY);
  } else {
    camera.position.set(0, 17.6, -5.7 * AWAY);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(CAMERA_AIM);
  aimKey();
}

// The board is looked at from two places and the light was only ever set for
// one of them. The felt is flat, so a light over your own shoulder throws its
// sheen away from you: from overhead that comes back off the wood and into the
// eye, and from the seat it goes over the far rail and is lost — which is why
// the seat view reads darker than the overhead on the same board. Moved across
// the table for the seat, the sheen comes back: the readout on a phone-sized
// frame goes 56.6 to 63.4, a lift of 12%, against the overhead's own 62.2.
//
// It costs what it costs: with the light opposite you the shadows fall towards
// you rather than away, and the dish in the face of a checker reads shallower.
// In the hand, where the screen is dim to start with, the light is worth more
// than the modelling. On a desk it is not, and nothing there moves.
let keyLight = null;
// The second lamp, over the other corner: the pair is what makes the seat view
// bright, and the overhead was left with one and looked dark beside it. Both
// burn for both views now — but from overhead they stay on your own side of
// the table rather than crossing it. Overhead the sheen already comes back off
// the wood from a lamp over your shoulder, so crossing buys nothing and costs
// the shading: 72.2 against 70.4, with the shadows falling away from you
// rather than towards you. The seat view is not touched by any of this.
let keyMate = null;
function aimKey() {
  if (!keyLight || !HANDHELD) return;
  const seat = !overhead();
  const side = (seat ? 6 : -6) * AWAY;
  keyLight.position.set(6 * AWAY, 10, side);
  if (keyMate) {
    keyMate.position.set(-6 * AWAY, 10, side);
    keyMate.visible = true;
  }
  shadowsDirty = true;
  wake();
}

takeSeat();


// A dense screen has two or three of its own pixels to every one the page asks
// for, which does most of the work multisampling is there to do: an edge
// already lands on several and the screen averages them. Four samples on top of
// that cost megapixels of bandwidth a frame and buy an edge that is hard to
// see, and paying for them was what forced the board to be drawn below its own
// resolution — which is not hard to see at all. Tablets were let off it and
// phones were not, though a phone is the denser screen of the two.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !HANDHELD });
// The scene is drawn at more samples than the screen has pixels and the
// browser shrinks it down. On a 1080p monitor, which reports a device ratio of
// 1, the die comes out nineteen pixels across and each of its pips lands on
// two — drawing larger is the only thing that sharpens both the silhouette and
// what is printed on the faces, because multisampling only ever touches the
// silhouette. Two samples is also the ceiling: a screen already reporting two
// or more is drawn at its own resolution, not beyond it.
//
// The steps below it are the same for every screen. They used to be cut off at
// whatever the screen reported, which left a tablet — every one of which
// reports two — on a ladder with a single rung and nowhere to go when it could
// not keep up. That is exactly the machine that needs the room: a tablet
// painting five or six megapixels of clearcoat has no other way out, and a
// softer board that answers the finger beats a sharp one that does not.
// What the screen actually has, which is the number that matters and the one
// this was not asking. A desktop monitor reports one pixel per pixel, so
// drawing at two is drawing beyond the screen and the extra is spent
// sharpening. A phone reports two and three quarters — and drawing that at two
// is not extra at all, it is drawing barely half the pixels the screen owns
// and letting it stretch the result. The board was soft on every phone in the
// world for exactly that reason, and sharp on the desktop it was tuned on.
//
// Capped at three: past that the buffer grows faster than anything anybody can
// see, and it is the buffer that has to be paid for.
const NATIVE = Math.min(devicePixelRatio || 1, 3);
// In the hand, the screen's own resolution and no further. Drawing beyond it is
// what sharpens a desktop monitor, where the page's pixel and the screen's are
// the same size and there is room above — but a phone or a tablet already has
// two or three of its own to every one of the page's, which is the sharpening
// done. Anything past that is a bigger buffer for a picture nobody can tell
// apart, paid for by the machine least able to pay.
//
// And this is the only number there is now. There used to be a ladder under it
// and a timer that walked down it whenever the frames were late, on the
// reasoning that a board which answers the finger beats a sharp one that does
// not. Sat in front of, that reasoning did not hold: what a machine too slow
// for its own screen actually produced was a soft board — and then a board that
// changed sharpness while being looked at, which is worse than either. The
// screen gets what the screen has, and a slow machine draws it slowly.
const TOP = HANDHELD ? NATIVE : Math.max(2, NATIVE);

// A ceiling on the drawing buffer itself, whatever the ladder would like: 4K,
// and not a pixel past it. Two samples across a 4K window is 7680x4320 —
// thirty-three megapixels of colour and of depth, with four multisamples behind
// every one of them, which is over a gigabyte asked for before a single frame
// is drawn. The frame timer further down would give a step back a second later,
// but the memory is asked for first.
//
// And past 4K it buys nothing anybody can see: a 4K buffer already draws the
// die thirty-eight pixels across, which is exactly what a 1080p window gets out
// of drawing at two samples — the sharpest the board has ever looked. So 1080p
// stays on the top rung (two samples is 4K exactly), 1440p comes down to where
// it also lands on 4K, and a 4K window draws its own resolution.
const PIXEL_BUDGET = 3840 * 2160;

// A phone has been seen going black on the change of camera: the board draws —
// frames counted, context healthy, every corner of the case in front of the
// camera — and the screen shows the cleared surface anyway. What the browser
// is holding then is a frame it never latched, and the surest way to make it
// take a new one is to hand it a different surface: the drawing buffer is
// resized by a pixel and back, which costs one reallocation on the one press
// where it might matter and nothing anywhere else.
function nudgeCanvas() {
  if (!HANDHELD) return;
  renderer.setSize(innerWidth, Math.max(1, innerHeight - 1), false);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  shadowsDirty = true;
  wake();
}

function applySampleRatio() {
  // What the screen is worth, held to what the buffer may cost. The budget is
  // about memory rather than speed — it is asked for before a single frame is
  // drawn, and no timer can give it back afterwards.
  const capped = Math.sqrt(PIXEL_BUDGET / (innerWidth * innerHeight));
  renderer.setPixelRatio(Math.min(TOP, capped));
  renderer.setSize(innerWidth, innerHeight);
}

applySampleRatio();
renderer.shadowMap.enabled = true;
// The soft filter takes several taps per pixel of a second full pass over the
// board. On a screen held at arm's length the cheaper one is not the thing
// anybody notices; the resolution it pays for is.
renderer.shadowMap.type = HANDHELD ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
// The shadows are drawn by rendering the whole board a second time from the
// light's side, every frame. On a tavla board almost nothing moves for most of
// the time — the player is looking at it, deciding — and drawing that second
// pass again to produce the identical picture is the cheapest thing there is
// to stop doing. So it is drawn on demand instead, and the demand is anything
// that can move: a die that has not settled, a checker in the hand or sliding
// across the board, or the board being laid out again.
renderer.shadowMap.autoUpdate = false;
let shadowsDirty = true;
let drawnFrames = 0;
// What the loop met and survived. A board that has gone black with the page
// still working has one question worth asking — did a frame throw, and which —
// and these are the two halves of the answer.
let drawnErrors = 0;
let drawError = null;
let lightCount = 0;
// A phone can take the drawing surface away from a page — the driver gives up
// under memory pressure, or the tab goes to the background long enough — and
// what is left behind is a canvas that will never draw again: a black screen
// with a game running perfectly behind it. Said out loud rather than left to
// look like a bug in the board, and taken back up when the browser offers it.
let contextLost = false;
canvas.addEventListener("webglcontextlost", event => {
  // Without this the context is gone for good; with it the browser may hand a
  // new one back.
  event.preventDefault();
  contextLost = true;
  console.warn("tavla: çizim bağlamı kayboldu");
  notice(t("gpu.lost"));
});
canvas.addEventListener("webglcontextrestored", () => {
  contextLost = false;
  console.info("tavla: çizim bağlamı geri geldi");
  notice("");
  // Everything the renderer had is gone with the old context; the simplest
  // way back to a board that draws is the one the board already knows.
  location.reload();
});

renderer.toneMapping = THREE.ACESFilmicToneMapping;
// A tenth open in the hand. A phone with auto-brightness reads the frame it is
// showing and dims to it, and the seat view fills most of the frame with case
// wall, near rail and dark floor — so the screen is turned down on exactly the
// picture that was already the darker of the two. Measured on a phone-sized
// frame: the seat view goes 52.9 → 55.9 and the overhead 57.6 → 60.7.
renderer.toneMappingExposure = 1.05 * (HANDHELD ? 1.1 : 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Soft studio-style reflections for the lacquer and clearcoat surfaces
// below — generated in-scene so no external HDR asset is needed.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
// The room probe is only here to give the lacquer something to reflect. At
// full strength it lights the whole board and flattens every material.
scene.environmentIntensity = BOARD.room.env;

function sitDown() {
  intro.classList.add("hidden");
  hud.classList.add("visible");
  // Asked for here rather than only from the button, because the button is not
  // always the way in: changing any of the table settings saves them and loads
  // the page again, and the game sits down by itself on the way back. Asked
  // only from the press, that ordinary path left the board silent for the whole
  // game — the press that would have opened the audio device belonged to a page
  // that no longer exists.
  sesiUyandir();
  guardBack();
  // Sitting at an online table is where the session changes hands: from here
  // the dice and the turns come from the server, and the match is watched.
  // Not before — at the door there is no board to put anything on.
  if (mode === "online" && matchId && !session.online) {
    session = onlineSession({ matchId, colour: HUMAN, ask, follow });
    session.watch(applyServerState, tableClosed);
  }
}

// The door. One question is asked and the rest are offered: who you are
// playing has no sensible default, so nothing opens until it has been chosen,
// while the table, the checkers and the side you gather on all start at
// Otomatik and are settled by a coin if they are left there. Somebody who
// wants a particular walnut board on the right can say so; somebody who just
// wants to play presses one button.
const SETTINGS = [
  { key: "board", label: "setting.board",
    options: [["auto", "option.auto"],
              ["klasik", "board.klasik"], ["star", "board.star"]] },
  { key: "colour", label: "setting.colour",
    options: [["auto", "option.auto"], ["black", "colour.black"], ["ivory", "colour.ivory"]] },
  { key: "side", label: "setting.side",
    options: [["auto", "option.auto"], ["sol", "side.left"], ["sag", "side.right"]] },
];

let pickedMode = null;
const picked = { board: "auto", colour: "auto", side: "auto" };
const startButton = document.querySelector("#start");

function markChosen(attribute, value) {
  document.querySelectorAll(`[data-${attribute}]`).forEach(button =>
    button.classList.toggle("chosen", button.dataset[attribute] === value));
}

function refreshStart() {
  if (!startButton) return;
  // Online has no "start" of its own — the lobby does that, and the colour
  // belongs to the room rather than to the player.
  startButton.toggleAttribute("hidden", mode === "online");
  startButton.disabled = !pickedMode;
}

document.querySelectorAll("[data-mode]").forEach(button => {
  button.addEventListener("click", () => {
    // Leaving the online mode leaves its lobby behind too. A search or an open
    // room went on running in the background — the queue kept refreshing, the
    // room listener stayed live — while the box that holds "Vazgeç" was hidden,
    // so there was no way to stop it from the screen; a match found then sat the
    // player down at a game they had walked away from and lost while not there.
    if (looking) stopLooking();
    if (openRoom) dropRoom();
    pickedMode = mode = button.dataset.mode;
    localStorage.setItem(MODE_KEY, mode);
    markChosen("mode", mode);
    showLobby();
    refreshStart();
    // Changing this does not reload the page, and it decides where the camera
    // sits, so the seat is taken again here rather than only at startup.
    fitCamera();
  });
});

// Each setting is a box with what it is set to written in it. Clicking it
// drops the choices underneath; clicking one of those takes it. Only one is
// ever open, and anything else pressed anywhere closes it.
const settingsBox = document.querySelector("#settings");
const drawers = [];

function closeDrawers(except) {
  for (const drawer of drawers) if (drawer !== except) drawer.close();
}

function buildSettings() {
  if (!settingsBox) return;
  for (const setting of SETTINGS) {
    if (setting.hidden) continue;
    const row = document.createElement("div");
    row.className = "setting";
    setting.row = row;

    const name = document.createElement("span");
    name.className = "setting-name";
    name.dataset.i18n = setting.label;
    row.append(name);

    const box = document.createElement("div");
    box.className = "setting-box";

    const face = document.createElement("button");
    face.type = "button";
    face.className = "setting-value";
    face.setAttribute("aria-haspopup", "listbox");
    face.setAttribute("aria-expanded", "false");
    box.append(face);

    const list = document.createElement("div");
    list.className = "setting-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    const drawer = {
      close: () => {
        list.hidden = true;
        face.setAttribute("aria-expanded", "false");
        box.classList.remove("open");
      },
    };
    drawers.push(drawer);
    setting.drawer = drawer;

    for (const [value, label] of setting.options) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "setting-choice";
      choice.dataset[setting.key] = value;
      choice.dataset.i18n = label;
      choice.setAttribute("role", "option");
      choice.addEventListener("click", () => {
        picked[setting.key] = value;
        drawer.close();
        applyStaticText();
      });
      list.append(choice);
    }

    face.addEventListener("click", () => {
      const opening = list.hidden;
      closeDrawers(drawer);
      if (!opening) return drawer.close();
      list.hidden = false;
      face.setAttribute("aria-expanded", "true");
      box.classList.add("open");
    });

    box.append(list);
    row.append(box);
    settingsBox.append(row);
    setting.face = face;
  }
}

buildSettings();

// A press anywhere that is not inside an open box shuts it.
addEventListener("pointerdown", event => {
  if (!event.target.closest?.(".setting-box")) closeDrawers();
}, true);

// What each box says it is set to, and which line in it is ticked. Written
// here rather than at the moment of choosing so that changing language
// rewrites them along with everything else.
function showSettings() {
  for (const setting of SETTINGS) {
    if (setting.hidden) continue;
    // Which colour you play is the room's to say, not yours: the one who was
    // waiting takes black, and nobody knows which of the two of them pressed
    // first. Left as a choice it is a choice that is quietly overruled — you
    // pick black, you sit down ivory, and the game looks broken. So the row
    // stays where it is and says what actually happens instead.
    const assigned = setting.key === "colour" && mode === "online";
    const value = picked[setting.key];
    const label = setting.options.find(([v]) => v === value)?.[1];
    if (setting.face) {
      setting.face.textContent = assigned ? t("option.assigned") : (label ? t(label) : "");
      setting.face.disabled = assigned;
    }
    setting.row?.classList.toggle("assigned", assigned);
    if (assigned) setting.drawer?.close();
    markChosen(setting.key, value);
  }
}

// Otomatik, decided. A coin rather than a preference: the game has no opinion
// about which board is nicer or which colour wins more, and there is nothing
// to gain by leaning one way, so each is drawn evenly.
// Otomatik'in cevabı, sayfa kurulurken atılan turanın sonucu — yani ekranda
// zaten duran şey. Burada yeniden atılsaydı sekiz basıştan yedisinde farklı
// bir şey çıkar ve sayfa yeniden yüklenirdi; turanın yeri artık yukarısı,
// turaAt'ın yanı.
const KURULAN = { board: () => boardName, colour: () => HUMAN, side: () => sideName };
const settle = key => picked[key] === "auto" ? KURULAN[key]() : picked[key];

// The languages. Every line the game says is looked up at the moment it is
// written, so choosing one here rewrites the door and the board on the spot —
// no reload, and nothing else about the game is touched.
const langBar = document.querySelector("#langs");
for (const { code, name, flag } of LANGS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lang-pick";
  button.dataset.lang = code;
  button.lang = code;
  button.innerHTML =
    `<svg viewBox="0 0 24 16" aria-hidden="true">${flag}</svg><span>${name}</span>`;
  button.addEventListener("click", () => {
    setLanguage(code);
    applyStaticText();
    updateHud();
    if (resultBox && !resultBox.hasAttribute("hidden")) showResult();
  });
  langBar?.append(button);
}

// Everything written into the page once and left there. The lines the game
// writes as it goes are looked up where they are written instead.
function applyStaticText() {
  document.documentElement.lang = language();
  document.title = t("title");
  document.body.classList.toggle("ideographic", isIdeographic());
  document.querySelectorAll("[data-i18n]").forEach(node => {
    node.textContent = t(node.dataset.i18n);
  });
  // Two labels nobody sees and a screen reader does.
  intro?.setAttribute("aria-label", t("door.title"));
  langBar?.setAttribute("aria-label", t("aria.langs"));
  markChosen("lang", language());
  showSettings();
  showOnline();
  showFullscreen();
  showSound();
  // The find button carries a state this does not know about — a search under
  // way — and rewriting every label by its data-i18n turned the "Aramayı bırak"
  // on it back into "Rakip bul" while the search was still running. A change of
  // language or a settings press left the button lying: pressing it then
  // cancelled a search the player thought they were starting, or hid a running
  // one behind a stopped-looking label. Read back from the button's own class,
  // which the rewrite leaves alone — and by query rather than the module's own
  // reference, since this also runs once before those are declared.
  const find = document.querySelector("#find");
  if (find?.classList.contains("looking")) {
    find.textContent = t("lobby.stop");
    document.querySelector("#host")?.setAttribute("disabled", "");
    document.querySelector("#join")?.setAttribute("disabled", "");
  }
}

// How many people are at a table right now, said quietly under the way in. It
// appears if the connection is there and stays away if it is not: the game is
// a page that plays perfectly well with no network at all, and it must not
// look broken to somebody who has none.
const onlineLine = document.querySelector("#online");
let onlineCount = null;

function showOnline() {
  if (!onlineLine) return;
  if (onlineCount === null) { onlineLine.setAttribute("hidden", ""); return; }
  onlineLine.textContent = onlineCount === 1
    ? t("online.one") : t("online.count", { n: onlineCount });
  onlineLine.removeAttribute("hidden");
}

// Filling the window is not filling the screen: the browser's own bars stay
// where they are, and on a phone they are a third of the height. Fullscreen is
// only ever granted to a gesture — a page cannot ask for it on its own, and it
// does not survive the page being loaded again — so it is a button, under the
// menu, and it is pressed when it is wanted.
//
// Not everywhere: an iPhone will only ever go fullscreen for a video. There
// the button is not drawn at all, and nothing is lost — the page already fills
// the window, which is all that machine will give anybody.
const canFullscreen = !!(document.fullscreenEnabled ?? document.webkitFullscreenEnabled);
const inFullscreen = () =>
  !!(document.fullscreenElement ?? document.webkitFullscreenElement);

const fullButton = document.querySelector("#fullscreen");

function showFullscreen() {
  if (!fullButton) return;
  fullButton.toggleAttribute("hidden", !canFullscreen);
  fullButton.textContent = t(inFullscreen() ? "fullscreen.exit" : "fullscreen.on");
  rotateFull?.toggleAttribute("hidden", !canFullscreen);
}

// The sound, on and off. The label says what is true rather than what pressing
// it does — it is a state and not an action, and "sound off" on a button that
// turns the sound off is the one wording nobody can read twice the same way.
const soundButton = document.querySelector("#sound");

function showSound() {
  if (!soundButton) return;
  const on = sesAcikMi();
  soundButton.textContent = t(on ? "sound.on" : "sound.off");
  soundButton.classList.toggle("kapali", !on);
  soundButton.setAttribute("aria-pressed", String(on));
}

soundButton?.addEventListener("click", () => {
  sesiCevir();
  showSound();
});

// The music, and its three keys. Stopping it is what turning it off means, so
// there is no fourth control for that — the play key is the switch.
const playerBox = document.querySelector("#player");
const trackName = document.querySelector("#track");
document.querySelector("#play")?.addEventListener("click", () => Muzik.cevir());
document.querySelector("#next")?.addEventListener("click", () => Muzik.sonraki());
document.querySelector("#prev")?.addEventListener("click", () => Muzik.onceki());

Muzik.izle(({ caliyor, parca }) => {
  playerBox?.classList.toggle("caliyor", caliyor);
  const key = document.querySelector("#play");
  if (key) {
    key.textContent = caliyor ? "\u25a0" : "\u25b6";
    key.setAttribute("aria-label", t(caliyor ? "music.stop" : "music.play"));
  }
  if (trackName) trackName.textContent = parca?.ad ?? "";
});
Muzik.hazirla();

// The same button again, inside the sideways warning: the warning covers the
// screen, so without one there the way out of it cannot be reached from it.
const rotateFull = document.querySelector("#rotate-full");

const toggleFullscreen = () => {
  const root = document.documentElement;
  if (inFullscreen()) {
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    try { exit?.call(document)?.catch?.(() => {}); } catch { /* already out */ }
    return;
  }
  const ask = root.requestFullscreen ?? root.webkitRequestFullscreen;
  try { ask?.call(root)?.catch?.(() => {}); } catch { /* not here, then */ }
};

// Fullscreen does not survive the page being loaded again, and the door loads
// the page again: changing the table, the colour or the side saves the answer
// and reloads to build the board round it. So somebody who went fullscreen at
// the door and then pressed Oyuna başla arrived at a game in a window, having
// pressed a button that appeared to have done nothing.
//
// It cannot simply be asked for again on the way back — the browser grants it
// to a gesture and a page that has just loaded has had none. So the wish is
// written down before the reload and spent on the first thing the player
// touches afterwards, which in a game that opens with a throw is a moment
// away. Once, and then forgotten: somebody who leaves fullscreen on purpose
// must not be put back into it by their next click.
const FULL_WISH = "tavla.tamEkranDilegi";

function rememberFullscreen() {
  if (inFullscreen()) sessionStorage.setItem(FULL_WISH, "1");
}

if (sessionStorage.getItem(FULL_WISH)) {
  sessionStorage.removeItem(FULL_WISH);
  const geriAl = () => {
    if (!inFullscreen()) toggleFullscreen();
  };
  addEventListener("pointerdown", geriAl, { once: true, capture: true });
  addEventListener("keydown", geriAl, { once: true, capture: true });
}

fullButton?.addEventListener("click", toggleFullscreen);
rotateFull?.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", showFullscreen);
document.addEventListener("webkitfullscreenchange", showFullscreen);
showFullscreen();
showSound();

// An iPhone in Safari cannot go fullscreen at all, so the button above is never
// drawn there. What it can do instead is be added to the home screen and run
// from there without the browser's bars — fullscreen in all but name, which is
// what the manifest is for. The way to it is not obvious, so it is pointed at:
// once, quietly under the door, and only where it applies — an iPhone, in the
// browser rather than already added, and not after it has been waved away. iPad
// is left out; it has the button.
const IOS_TIP_KEY = "tavla.iosIpucu";
const onIphone = /iphone|ipod/i.test(navigator.userAgent);
const addedToHome = navigator.standalone === true
  || matchMedia("(display-mode: standalone)").matches;

// Said out loud on the root element, because the stylesheet needs it too. The
// sideways warning and the sideways layout are both drawn for the browser's
// bars, and both knew only one way for those to be gone — fullscreen. Run from
// the home screen there are no bars either, and on an iPhone that is the only
// way there is: the warning covered a board it had nothing left to warn about,
// with no button on it to leave by.
document.documentElement.classList.toggle("evde", addedToHome);

const introEl = document.querySelector("#intro");
if (onIphone && !addedToHome && localStorage.getItem(IOS_TIP_KEY) !== "kapali" && introEl) {
  const tip = document.createElement("div");
  tip.id = "ios-tip";
  const line = document.createElement("p");
  // The share glyph iOS prints on the button the words point at, so the eye can
  // jump straight from the instruction to the control it means.
  const icon = document.createElement("span");
  icon.className = "ios-share";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15"><path fill="none" `
    + `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" `
    + `d="M12 3v11M8.5 6.5 12 3l3.5 3.5M6 11v8a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19v-8"/></svg>`;
  const words = document.createElement("span");
  words.dataset.i18n = "ios.tip";
  line.append(icon, words);
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "ios-tip-x";
  dismiss.setAttribute("aria-label", "×");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => {
    localStorage.setItem(IOS_TIP_KEY, "kapali");
    tip.remove();
  });
  tip.append(line, dismiss);
  introEl.append(tip);
}

applyStaticText();
attend(here => { onlineCount = here; showOnline(); });

// The lobby: make a room and read the code out, or take one you were given.
// Either way it ends the same — a match exists, this browser knows which
// colour it is playing, and the page is loaded again to build the board round
// that. Which colour you are is not yours to choose here; it belongs to the
// room, and the host takes black.
const lobby = document.querySelector("#lobby");
const hostButton = document.querySelector("#host");
const joinButton = document.querySelector("#join");
const codeBox = document.querySelector("#code");
const codeHint = document.querySelector("#code-hint");
const lobbySaid = document.querySelector("#lobby-said");
const cancelButton = document.querySelector("#cancel");
let watchingRoom = null, openRoom = null;

function say(key, code) {
  if (!lobbySaid) return;
  lobbySaid.textContent = t(key);
  // A line with a code on it is read out to somebody else, so it is set louder
  // than the rest of the running commentary that goes through here.
  lobbySaid.classList.toggle("loud", !!code);
  if (code) {
    const shown = document.createElement("span");
    shown.className = "kod";
    shown.textContent = code;
    lobbySaid.append(shown);
  }
}

// The way back to a table is its code and nothing else. A seat is not held
// open on trust, nothing plays a hand that has gone, and a board that offered
// its way back in from the door could offer it to a table that had closed an
// hour ago. You say the code, the seat is found to be yours, and the game
// carries on from exactly where it stopped.

function showLobby() {
  const online = mode === "online";
  lobby?.toggleAttribute("hidden", !online);
  if (codeBox) codeBox.hidden = true;
  if (codeHint) codeHint.hidden = true;
  // Your colour comes from the room, so it is not asked for here.
  document.querySelector("#colours")?.toggleAttribute("hidden", online);
  // The colour row reads differently online — see showSettings.
  showSettings();
  refreshStart();
}

// A match is waiting: remember which one and which colour, and start the page
// again so the board is built the right way round.
function sitDownTo(id, colour) {
  localStorage.setItem(MATCH_KEY, id);
  localStorage.setItem(COLOUR_KEY, colour);
  // Ve elle seçilmiş sayılıyor. Rengi burada oda söylüyor, bir yazı-tura
  // değil — işaret konmasaydı sayfa yeniden yüklenirken tura atılır ve
  // odanın verdiği renk üzerine yazılırdı: iki oyuncu aynı taşları oynardı.
  // İşaret kapıya dönüp Otomatik'le başlandığında kalkıyor.
  localStorage.setItem(COLOUR_KEY + SECILDI_SONU, "1");
  localStorage.setItem(MODE_KEY, "online");
  // The table and the side are still the player's own: two people across a
  // network need not be looking at the same walnut, and each gathers on the
  // side they gather on. Only the colour comes from the room.
  localStorage.setItem(BOARD_KEY, settle("board"));
  localStorage.setItem(SIDE_KEY, settle("side"));
  localStorage.setItem(CLOTH_KEY, clothName);
  sessionStorage.setItem("tavla.sitOnLoad", "1");
  rememberFullscreen();
  say("lobby.found");
  location.reload();
}

// Being found a game rather than arranging one. Either somebody is already
// waiting, in which case the server pairs the two at once, or this browser
// takes the waiting place and watches it: whoever arrives next writes the
// match onto it.
const findButton = document.querySelector("#find");
let watchingQueue = null, looking = false, stillHere = null;

async function stopLooking() {
  looking = false;
  clearInterval(stillHere);
  watchingQueue?.();
  watchingQueue = null;
  findButton.textContent = t("lobby.find");
  findButton.classList.remove("looking");
  hostButton.disabled = joinButton.disabled = false;
  if (lobbySaid) lobbySaid.textContent = "";
  ask("siradanCik", {}).catch(() => {});
}

findButton?.addEventListener("click", async () => {
  if (looking) return stopLooking();
  looking = true;
  findButton.textContent = t("lobby.stop");
  findButton.classList.add("looking");
  hostButton.disabled = joinButton.disabled = true;
  say("lobby.searching");
  try {
    // Anything this browser left in the queue is cleared before a new search
    // starts. A place left behind from an earlier one has an old match written
    // on it by whoever paired with it, and being found a game is never being
    // sent back to a game already played — the way back to a match of your own
    // is the button that says so, and only that button.
    await ask("siradanCik", {}).catch(() => {});
    const answer = await ask("eslesmeyeGir", {});
    if (!looking) return;
    if (answer?.matchId) return sitDownTo(answer.matchId, answer.colour ?? "ivory");
    // Waiting to be found. Our own place in the queue is the only thing we can
    // read, and it is the thing the next arrival writes to.
    const live = await connect();
    watchingQueue?.();
    watchingQueue = await follow("sira", live?.uid ?? "", async entry => {
      if (!looking || !entry.matchId) return;
      // Read once and then of no use to anybody. Taken out of the queue here
      // rather than left for the sweeper: this is the moment it stops meaning
      // anything, and a place with an old match written on it is exactly what
      // should never be lying about.
      looking = false;
      await ask("siradanCik", {}).catch(() => {});
      sitDownTo(entry.matchId, entry.colour ?? "black");
    });
    // Saying we are still here, over and over, so a place left behind by a
    // closed tab stops being one somebody can be sent to. It looks again on
    // the way past, which is also how two people who sat down to wait in the
    // same breath find each other rather than waiting for a third.
    const lookAgain = async () => {
      if (!looking) return;
      try {
        const again = await ask("eslesmeyeGir", {});
        if (looking && again?.matchId) sitDownTo(again.matchId, again.colour ?? "ivory");
      } catch (reason) {
        console.info("tavla: sırada kalınamadı —", reason?.message ?? reason);
      }
    };
    // One quick look straight away, before the slow rhythm starts. Two people
    // pressing the button in the same breath each read the queue before the
    // other's place was in it, so neither found anybody and both sat down to
    // wait — for a quarter of a minute, in front of a screen that said it was
    // looking. They are a second apart, not fifteen.
    setTimeout(lookAgain, 2000);
    const every = Math.max(10, Math.round((answer?.refresh ?? 45) / 3)) * 1000;
    clearInterval(stillHere);
    stillHere = setInterval(() => {
      if (!looking) return clearInterval(stillHere);
      lookAgain();
    }, every);
  } catch (reason) {
    console.info("tavla: eşleşme aranamadı —", reason?.message ?? reason);
    looking = false;
    findButton.textContent = t("lobby.find");
    findButton.classList.remove("looking");
    hostButton.disabled = joinButton.disabled = false;
    say("lobby.offline");
  }
});

// Leaving the page while waiting should not leave a place in the queue behind
// for somebody to be sent to. Best effort — a queue entry nobody is behind is
// checked for on the other side too.
addEventListener("pagehide", () => {
  if (looking) ask("siradanCik", {}).catch(() => {});
  // The same for a room left open: closing the tab is giving up on it too. A
  // room that has already been matched is refused on the other side, so the
  // reload that follows two people finding each other is not caught by this.
  if (openRoom) ask("odayiKapat", { code: openRoom }).catch(() => {});
});

hostButton?.addEventListener("click", async () => {
  hostButton.disabled = joinButton.disabled = true;
  try {
    const room = await ask("odaKur", { colour: "black" });
    say("lobby.made", room.code);
    openRoom = room.code;
    // Nothing under the code saying it is being waited on — that much is plain
    // from standing there with a code in your hand. What was missing was the
    // way back out, so that is what goes there instead.
    cancelButton?.removeAttribute("hidden");
    // The guest's arrival is written on the room, so it is watched rather than
    // asked after.
    watchingRoom?.();
    watchingRoom = await follow("rooms", room.code, it => {
      if (it.status === "matched" && it.matchId) sitDownTo(it.matchId, room.colour);
    });
  } catch (reason) {
    // Nothing here is worth alarming anybody with: either there is a
    // connection or there is not, and the rest of the game does not need one.
    console.info("tavla: oda kurulamadı —", reason?.message ?? reason);
    say("lobby.offline");
    hostButton.disabled = joinButton.disabled = false;
  }
});

// Giving up on a room nobody came to. The code is closed on the server rather
// than left to run out on its own: a code still standing is one a friend can
// walk into an hour later, and there would be nobody on the other side of it.
async function dropRoom() {
  const closing = openRoom;
  openRoom = null;
  watchingRoom?.();
  watchingRoom = null;
  cancelButton?.setAttribute("hidden", "");
  if (lobbySaid) { lobbySaid.textContent = ""; lobbySaid.classList.remove("loud"); }
  hostButton.disabled = joinButton.disabled = false;
  if (closing) await ask("odayiKapat", { code: closing }).catch(() => {});
}

cancelButton?.addEventListener("click", () => { dropRoom(); });

// Two presses rather than one: the first opens the box to type the code into,
// the second takes the code. A field standing there empty beside three buttons
// is a question nobody asked — most people are looking for the other two ways
// in, and whoever has been given a code knows what to do with it.
function askForCode() {
  if (!codeBox || !codeBox.hidden) return false;
  codeBox.hidden = false;
  if (codeHint) codeHint.hidden = false;
  codeBox.value = "";
  codeBox.focus();
  return true;
}

joinButton?.addEventListener("click", async () => {
  if (askForCode()) return;
  const wanted = (codeBox?.value ?? "").trim().toUpperCase();
  if (!/^[A-Z2-9]{5}$/.test(wanted)) return say("lobby.badCode");
  hostButton.disabled = joinButton.disabled = true;
  say("lobby.joining");
  try {
    const joined = await ask("odayaKatil", { code: wanted });
    // Which colour that leaves is the server's to say — the one arriving
    // usually takes ivory, but a host who types their own code back in is
    // sent to their own seat rather than to the other one.
    sitDownTo(joined.matchId, joined.colour ?? "ivory");
  } catch (reason) {
    lobbySaid.textContent = reason?.message ?? t("lobby.offline");
    hostButton.disabled = joinButton.disabled = false;
  }
});

codeBox?.addEventListener("keydown", event => {
  if (event.key === "Enter") joinButton?.click();
});

showLobby();

// The table, the colour and the side are all settled before the scene is built
// — the first lays out the points, the other two decide where the camera sits
// and which way round the numbering runs — so anything other than what is
// already standing there means starting the page again. Otomatik is drawn
// here, at the last moment, so pressing the button twice can give two
// different tables rather than the same one it happened to pick on the way in.
const sideName = SIDE === -1 ? "sag" : "sol";
startButton?.addEventListener("click", () => {
  if (!pickedMode) return;
  // A browser only opens the audio device for a gesture, and this is the
  // gesture every game starts with. Asked for here so the first checker down
  // has its sound ready rather than being the throwaway that wakes the device.
  sesiUyandir();
  // Elle seçilenler işaretleniyor, Otomatik'te bırakılanların işareti
  // kaldırılıyor. Bir sonraki açılışta yazı-turayı kimin için atacağını bu
  // söylüyor: Star tahtasını isteyen onu bir kez söyler ve bir daha sorulmaz,
  // Otomatik'te bırakan her açılışta yeni bir tura alır.
  for (const [anahtar, key] of [[BOARD_KEY, "board"], [COLOUR_KEY, "colour"], [SIDE_KEY, "side"]]) {
    if (picked[key] === "auto") localStorage.removeItem(anahtar + SECILDI_SONU);
    else localStorage.setItem(anahtar + SECILDI_SONU, "1");
  }
  const board = settle("board"), colour = settle("colour"), side = settle("side");
  // Hiçbiri değişmediyse sayfa yeniden yüklenmiyor — ve Otomatik'te bırakılan
  // her ayar için bu artık kural: turası sayfa kurulurken atıldı, cevabı zaten
  // ekranda duran şey. Yeniden yükleme yalnızca elle başka bir şey seçildiğinde
  // oluyor, ki o da nadir ve bilerek yapılan bir şey.
  if (board === boardName && colour === HUMAN && side === sideName) return sitDown();
  localStorage.setItem(BOARD_KEY, board);
  localStorage.setItem(COLOUR_KEY, colour);
  localStorage.setItem(SIDE_KEY, side);
  localStorage.setItem(CLOTH_KEY, clothName);
  sessionStorage.setItem("tavla.sitOnLoad", "1");
  rememberFullscreen();
  location.reload();
});

if (sessionStorage.getItem("tavla.sitOnLoad")) {
  sessionStorage.removeItem("tavla.sitOnLoad");
  sitDown();
}

// A table left behind unsaid: the page went before the server answered, or the
// tab was closed on the way. Said now, from the door, before anybody at that
// table has finished waiting out the minute. Harmless if it was said after all
// — closing a table twice closes it once.
const unsaid = localStorage.getItem(LEAVING_KEY);
if (unsaid) {
  ask("masayiBirak", { matchId: unsaid })
    .catch(() => {})
    .then(() => localStorage.removeItem(LEAVING_KEY));
}

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
// `scale` is how much of its full size this texture is being drawn at. Every
// measurement below is in pixels of the canvas, and the canvas is halved in the
// hand — so without this the same pattern is stretched over the same board at
// twice the size: a grain that was fine on a desk comes out on a phone as
// coarse banding, which is exactly what it was doing. What the eye should see
// is the same wood at both sizes, drawn with fewer pixels on one of them, so
// every length here is multiplied by it and the count of the streaks with it.
function woodPanelTexture(w, h, base, grain, eyes, figure = 1, scale = 1) {
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
      const xBias = x / (180 * scale);
      const yBias = y / (120 * scale);

      // Multi-scale noise - aggressive for dramatic grain
      const scale1 = fbm(xBias, yBias, 5, 0);
      const scale2 = fbm(xBias * 2.5, yBias * 1.8, 6, 100);
      const scale3 = fbm(xBias * 4, yBias * 3.2, 4, 200);

      // Waviness pattern - simulates wood fiber variation.
      // Bu iki dalga düzenli aralıklı olduğu için, yüksek genlikte damar değil
      // tarak izi üretiyorlardı: tahtanın boş orta alanında eşit aralıklı enine
      // bantlar. Genlik üçte bire indirildi — elyaf değişimi kalıyor, düzenlilik
      // gözle seçilmiyor.
      const wave = Math.sin(y / (35 * scale)) * 0.12 + Math.cos(x / (45 * scale)) * 0.09;

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

  // Dokunun bir ucundan öbürüne uzanan damarlar. Ahşabın alacasını veren
  // bunlar. Koyuluğu indirildi: üstteki dalgayla birleşince damar olmaktan
  // çıkıp çizgiye dönüyorlardı, ve bir tavla tahtasının ortası uzun uzun
  // bakılan bir yerdir.
  //
  // Sayıları da ölçekle iner. Aynı tahtaya yarı boyda bir dokuyla aynı sayıda
  // damar çizmek, damarları birbirine iki kat yaklaştırmak demek — kalınlıkları
  // düzeltilse bile sıklıkları bant üretmeye devam ederdi.
  for (let i = 0; i < Math.round(95 * scale); i++) {
    const y = Math.random() * h;
    const intensity = 0.10 + Math.random() * 0.18;
    const yumusama = 6 * scale;
    const gradient = ctx.createLinearGradient(0, y - yumusama, 0, y + yumusama);
    gradient.addColorStop(0, `rgba(${grainRGB.r}, ${grainRGB.g}, ${grainRGB.b}, 0)`);
    gradient.addColorStop(0.5, `rgba(${grainRGB.r}, ${grainRGB.g}, ${grainRGB.b}, ${intensity})`);
    gradient.addColorStop(1, `rgba(${grainRGB.r}, ${grainRGB.g}, ${grainRGB.b}, 0)`);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = (2 + Math.random() * 4.5) * scale;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      w * 0.18, y + (Math.random() - 0.5) * 40 * scale,
      w * 0.82, y + (Math.random() - 0.5) * 40 * scale,
      w, y + (Math.random() - 0.5) * 22 * scale
    );
    ctx.stroke();
  }

  // Add wood grain eyes (burls)
  (eyes || []).forEach(([ex, ey, r]) => {
    for (let ring = 14; ring > 0; ring--) {
      const alpha = (0.12 + (12 - ring) * 0.012) * (1 - ring / 14) * figure;
      ctx.strokeStyle = grain;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = (1.6 + Math.random() * 1.1) * (0.5 + figure * 0.5) * scale;
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
    const BAND = BOARD.braidBand;          // width of the braid, in texture px
    const STEP = BOARD.braidStep;          // spacing of the strands along it
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
// Half in the hand. These panels are not loaded, they are drawn pixel by pixel
// in a canvas while the page opens, and they are almost the whole of that wait:
// halving each side quarters the pixels and takes three hundred milliseconds
// off the way in. The board there is a thousand pixels across, so a panel this
// size was already close to the screen's own sampling rate — what comes off is
// a little of the grain's fineness and nothing else.
//
// The marquetry is left alone. It costs almost nothing to draw, and it is a
// fine repeating pattern: halved, the zigzag inlay down the edge of every point
// goes visibly chunky. Measured both ways — with the inlay halved as well the
// wait came out the same, so it was a loss bought for nothing.
const PANEL = HANDHELD ? .5 : 1;
// Gözün yeri zaten ölçekle veriliyordu; yarıçapı verilmiyordu, o yüzden elde
// aynı halka iki kat büyük çiziliyordu. O da ölçeğe bağlandı.
const veneerTexture = woodPanelTexture(768 * PANEL, 900 * PANEL,
  BOARD.veneer.base, BOARD.veneer.grain,
  [[384 * PANEL, 450 * PANEL, BOARD.veneer.eye * PANEL]], BOARD.veneer.figure, PANEL);
const veneerL = new THREE.MeshPhysicalMaterial({
  map: veneerTexture,
  metalness: .03,
  ...BOARD.gloss,
});
// The case and the playing surface come out of the lacquer in the hand, the
// same as the checkers did. These two cover most of the screen — far more of it
// than thirty checkers do — so this is the largest saving left: the coat is a
// second lit surface, and paying for it over that much of the picture is what
// was keeping a tablet from holding thirty frames even at half its resolution.
//
// The dice keep theirs. They are two objects, they are what the eye follows
// across the felt, and the wet shine on them is most of what makes them read as
// dice rather than as cubes.
if (HANDHELD) {
  for (const wood of [shell, veneerL]) {
    wood.clearcoat = 0;
    wood.clearcoatRoughness = 0;
  }
}
const veneerR = veneerL.clone();
if (BOARD.veneer.mirrored) {
  veneerR.map = veneerTexture.clone();
  veneerR.map.wrapS = THREE.RepeatWrapping;
  veneerR.map.repeat.x = -1;
  veneerR.map.needsUpdate = true;
}
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
// One material over the whole piece and no map on any of it: the top face, the
// bottom and the wall are the same moulding and take the same light, and they
// keep the satin they always had.
const ivory = new THREE.MeshPhysicalMaterial({
  color: 0xd4b471, roughness: .62, metalness: 0, clearcoat: .1, clearcoatRoughness: .45,
});
// The dark one is not a mirror. Its bowl curves round to face the light, so a
// hard specular lands in it and nowhere else — the piece came out with a shiny
// hole in a matte face, which is the wrong way round on a moulding. Rougher,
// and with far less coat on it, so the shine spreads over the whole of it
// instead of collecting in the one place that happens to be aimed right.
const black = new THREE.MeshPhysicalMaterial({
  color: 0x141518, roughness: .16, metalness: .04, clearcoat: .7, clearcoatRoughness: .06,
});

// The lacquer comes off the checkers in the hand. A coat is a second surface
// over the first: every pixel of it is lit twice and samples the room probe
// twice, and thirty of them are on the board at once, moving, with their
// shadows redrawn under them. It is the most expensive thing on a phone and
// the least visible — a checker there is a centimetre across, and what the
// coat does is put a highlight on it a few pixels wide.
//
// Stripped here rather than written as a setting, before anything has been
// drawn, so the coat is left out of the shader entirely instead of being
// computed and multiplied by nothing.
//
// Not the case and not the dice: the case is the largest flat thing on the
// screen and its sheen is what the board is lit by, and there are two dice.
if (HANDHELD) {
  for (const piece of [ivory, black]) {
    piece.clearcoat = 0;
    piece.clearcoatRoughness = 0;
  }
}
// Points alternate pale maple and dark walnut, both carrying the same inlay.
const marquetryA = new THREE.MeshStandardMaterial({
  map: marquetryPointTexture(...BOARD.pale),
  roughness: .5,
  metalness: 0
});
const marquetryB = new THREE.MeshStandardMaterial({
  map: marquetryPointTexture(...BOARD.dark, false),
  roughness: .52,
  metalness: 0
});

function box(width, height, depth, material, x = 0, y = 0, z = 0, chamfer = false) {
  const geometry = chamfer
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
const POINT_HALF = BOARD.pointHalf ?? PITCH / 2;
const BAR_HALF = .42;
const POINT_LEN = CHECKER_D * BOARD.pointLen;
const FIELD_HALF = CHECKER_D * 6;    // twelve checkers of depth, halved
const TIP_Z = FIELD_HALF - POINT_LEN;

// A strip of felt wide enough that a checker standing on the outermost seat
// of a point clears the wall beside it. A checker is eight millimetres tall
// and leans outwards with the view, so a gap that only just clears on the
// floor plan does not clear on the screen.
const EDGE_GAP = .12;
const COLUMN_OFF = Math.max(POINT_HALF, CHECKER_D / 2 + EDGE_GAP);

// Six columns either side of the bar, mirrored front to back for 24 points.
// The first column stands off the middle by the same strip that the last one
// stands off the outer wall — the checkers on it are as close to the wall of
// the middle as the outer ones are to theirs.
const starts = [];
for (let k = 5; k >= 0; k--) starts.push(-(BAR_HALF + COLUMN_OFF + PITCH * k));
for (let k = 0; k <= 5; k++) starts.push(BAR_HALF + COLUMN_OFF + PITCH * k);
const NEAR_Z = -(FIELD_HALF - POINT_LEN / 2);
const FAR_Z = FIELD_HALF - POINT_LEN / 2;

// Half the width of the playing field: the last column plus the same strip.
const FIELD_HALF_X = starts[starts.length - 1] + COLUMN_OFF;

// The reference board is a folding case, not a flat panel: two trays hinged
// down the middle, each a floor with the playing surface laid into it and four
// walls standing round it. What used to be a strip painted down the centre is
// really the two inner walls meeting, and what used to be an invisible line at
// the edge of the field is really the inside face of the outer wall.
const FELT_Y = .47;                       // top of the playing surface
const SEAM = .8 / 36;                     // 0.8mm, the gap the hinge sits in
const WALL_T = BAR_HALF - SEAM / 2;       // 14.6mm walls, so the seam comes out right
const WALL_H = .7;                        // 25mm of wall standing above the surface
const FLOOR_T = .26;                      // 9mm of case floor under it
const CASE_TOP = FELT_Y + WALL_H;
const CASE_BOTTOM = FELT_Y - FLOOR_T;
const CASE_HALF_X = FIELD_HALF_X + WALL_T;
// The same strip of felt at the ends as there is at the sides: the checker on
// the first seat of a point reaches the very end of it, so a wall set on the
// end of the points is a wall set on the checkers.
const FIELD_HALF_Z = FIELD_HALF + EDGE_GAP;

// The dice stop where the checkers end, not at the wall. Between the two is a
// strip of felt four millimetres wide — narrower than a die, so a die that
// could get into it would have to lean, and a die that leans is a broken roll.
// Better it never gets in: the strip is a border to look at, and the dice play
// the board inside it.
const WALL_X = starts[starts.length - 1] + CHECKER_D / 2;
const WALL_Z = FIELD_HALF;
const CASE_HALF_Z = FIELD_HALF_Z + WALL_T;

// What a die meets in the middle of the board: two walls, the same height as
// the ones round the edge, on every board. A die thrown into one half stays in
// that half.
const BAR_RISE = WALL_H / 2;
const BAR_TOP = CASE_TOP;

function addBoard() {
  addTrayBoard();

  starts.forEach((start, i) => {
    const x = MIRROR * start;
    point(x - POINT_HALF, x + POINT_HALF, -FIELD_HALF, -TIP_Z, i % 2 ? marquetryB : marquetryA);
    point(x - POINT_HALF, x + POINT_HALF, FIELD_HALF, TIP_Z, i % 2 ? marquetryA : marquetryB);
  });
}

function addTrayBoard() {
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

    box(spanX, FLOOR_T - .05, CASE_HALF_Z * 2, shell, midX, CASE_BOTTOM + (FLOOR_T - .05) / 2, 0);
    box(WALL_T, wallH, CASE_HALF_Z * 2, shell, side * (BAR_HALF - WALL_T / 2), wallY, 0);
    box(WALL_T, wallH, CASE_HALF_Z * 2, shell, side * (FIELD_HALF_X + WALL_T / 2), wallY, 0);
    [-1, 1].forEach(end => {
      box(spanX, wallH, WALL_T, shell, midX, wallY, end * (FIELD_HALF_Z + WALL_T / 2));
    });

    // The playing surface, laid into the tray between the walls. Each half is
    // a mirror of the other, the way a board is veneered from one leaf split
    // and opened out — which is what puts the figure at the centre of both.
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD_HALF_X - BAR_HALF, .04, FIELD_HALF_Z * 2),
      side < 0 ? veneerL : veneerR
    );
    face.position.set(side * (BAR_HALF + FIELD_HALF_X) / 2, FELT_Y - .02, 0);
    face.receiveShadow = true;
    scene.add(face);
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
// The leaves have to stay well clear of the checkers standing on the points
// either side of the middle. Those points are a checker's width from the
// seam, so a leaf reaching a third of a unit out leaves under a millimetre
// between the two — and at a tall window, where the board is seen at more of
// an angle, the parallax on something standing this far above the checkers
// closes that and the hinge is drawn across them.
const HINGE_LEN = 1.0;
const HINGE_LEAF = .2;
const HINGE_PLATE = .045;

function addHinges() {
  [-1, 1].forEach(end => {
    const z = end * FIELD_HALF * .58;

    [-1, 1].forEach(side => {
      const leaf = box(HINGE_LEAF, HINGE_PLATE, HINGE_LEN, brass,
        side * (SEAM / 2 + HINGE_LEAF / 2), CASE_TOP + HINGE_PLATE / 2, z);
      leaf.castShadow = true;

      // Two countersunk screws per leaf, each with its cross recess.
      [-.28, .28].forEach(along => {
        const head = new THREE.Mesh(
          new THREE.CylinderGeometry(.042, .038, .026, 16), brass);
        head.position.set(side * (SEAM / 2 + HINGE_LEAF / 2),
          CASE_TOP + HINGE_PLATE, z + along * HINGE_LEN);
        scene.add(head);
        for (let turn = 0; turn < 2; turn++) {
          const slot = new THREE.Mesh(
            new THREE.BoxGeometry(turn ? .01 : .058, .006, turn ? .058 : .01),
            screwSlot);
          slot.position.copy(head.position).setY(CASE_TOP + HINGE_PLATE + .012);
          scene.add(slot);
        }
      });
    });

    // The barrel, lying in the seam along the fold. It stands proud of the
    // leaves — buried in the seam the hinge reads as two loose plates — and it
    // is cut into five knuckles rather than one tube, because the interleaving
    // of the two leaves' fingers is what makes a butt hinge look like one.
    const KNUCKLES = 5;
    const barrel = HINGE_LEN * .94;
    const finger = barrel / KNUCKLES;
    for (let i = 0; i < KNUCKLES; i++) {
      const knuckle = new THREE.Mesh(
        new THREE.CylinderGeometry(.075, .075, finger * .88, 20), brass);
      knuckle.rotation.x = Math.PI / 2;
      knuckle.position.set(0, CASE_TOP + HINGE_PLATE,
        z - barrel / 2 + finger * (i + .5));
      knuckle.castShadow = true;
      scene.add(knuckle);
    }
  });
}

// One world unit is one checker diameter, which on both sets of pieces is
// 36mm — so a millimetre is 1/36 of a unit and every size below can be written
// in real millimetres.
const MM = 1 / 36;
const mm = (r, h) => new THREE.Vector2(r, h * MM);
const CHECKER_R = CHECKER_D / 2;
const CHECKER_H = 8 * MM;

// The profile runs bottom-centre outwards and up. Listing it in this order is
// what makes the revolved normals face outwards — reversed, the discs render
// inside-out and read as hollow rings.
//
// The thin set: a raised outer rim around a recessed channel with a low dome
// standing back up out of the middle of it, and the outer edge rolled over.
const THIN_PROFILE = [
  mm(0, 0),
  mm(.40, 0),
  mm(.468, .65),
  mm(CHECKER_R, 2.16),
  mm(CHECKER_R, 5.76),
  mm(.484, 7.49),
  mm(.455, 8),          // flat outer rim
  mm(.378, 8),
  mm(.362, 7.67),       // the step down into the channel
  mm(.352, 6.84),
  mm(.340, 6.41),
  mm(.30, 6.26),        // channel floor, 1.7mm below the rim
  mm(.268, 6.41),
  mm(.245, 6.88),       // dome springs from here
  mm(.20, 7.49),
  mm(.13, 7.88),
  mm(0, 8.01),          // dome crown, level with the rim
];


// Ninety-six segments turn a checker that is an inch across on a desktop. In
// the hand it is a centimetre and forty-eight are past telling apart, so half
// the triangles on the board go away for nothing. Phones were turning all
// ninety-six, thirty times over, for a checker smaller than a tablet's.
const checkerGeometry = new THREE.LatheGeometry(THIN_PROFILE, HANDHELD ? 48 : 96);

// --- Dice ------------------------------------------------------------
// A real die: every face carries its own pips, opposite faces sum to 7,
// and the cube is rounded off at the corners the way a moulded die is.
// The three rows of a six are a pip's width apart and the pips are a pip's
// width across, which on a real die is fine and at nineteen pixels is not:
// they touched, and the column read as one bar. Four units of daylight either
// side separates them without moving them off the flat of the face, which ends
// where the moulded corner starts at 85% of it.
const PIP_GRID = { lo: 70, mid: 128, hi: 186 };
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

    ctx.fillStyle = red ? "#c8161b" : "#1e1613";
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
    // Held back from what a close look would want. A pip lands on two pixels,
    // and at that size a shaded rim is not shape — it is the pip's own edge
    // being greyed into the white around it, which is the whole reason the
    // numbers were hard to read.
    const inWell = ctx.createRadialGradient(x, y, R * .15, x, y, R);
    inWell.addColorStop(0, "rgba(0,0,0,0)");
    inWell.addColorStop(.72, red ? "rgba(90,6,10,.16)" : "rgba(0,0,0,.13)");
    inWell.addColorStop(1, red ? "rgba(70,4,8,.30)" : "rgba(0,0,0,.26)");
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
// A little over life size in the hand: a 10mm die is read at arm's length
// across a real board, and on a phone the same die is a few pixels of pip.
// Twelve keeps the proportion against the checker recognisable — a third of
// its width rather than a quarter — and everything below is derived from it,
// physics included, so the throw itself is unchanged.
const DIE_SIZE = (HANDHELD ? 13 : 10) * MM;
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
  // The drilled wall is a third of a millimetre of relief on a die that is
  // never more than a few dozen pixels wide. At full strength it does not read
  // as a hollow, it reads as a light rim inside every pip, and that rim is
  // what was eating the pip. Kept as a hint of depth rather than a claim.
  normalScale: new THREE.Vector2(.4, .4),
  clearcoatNormalScale: new THREE.Vector2(.4, .4),
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
    // Set only when a search gave up: the face this die has to show.
    forced: null,
  };
  scene.add(die);
  diceMeshes.push(die);
  return die;
}

// Where the pair sits before anybody has thrown: both in one half of the
// board, the way they land after a throw. A new game puts them back here.
const DICE_HOME = [[-4.1, .35, 5], [-3.0, -.5, 4]];
// The opening is thrown with one die, passed between the two players, and the
// other one waits off the board where it cannot be picked up by mistake. It
// comes back to the felt when the game itself starts.
const DICE_REST = [FIELD_HALF_X + 1.9, 1.4, 3];

function resetDice() {
  wake();
  // The dice are put back by hand rather than thrown, so nothing in the loop
  // knows they moved. In the hand the board is only drawn when something asks
  // for it and the shadow map only when something says so — and without this
  // the pair came back to the middle of the board carrying the shadow of where
  // it used to be, which is a die standing on the felt with nothing under it.
  shadowsDirty = true;
  const parked = game?.phase === "opening";
  diceMeshes.forEach((die, i) => {
    const [x, z, face] = parked && i === 1 ? DICE_REST : (DICE_HOME[i] ?? DICE_HOME[0]);
    // One die opens the game, passed between the two players, so the second
    // one has no business being on the table yet. It used to sit off the edge
    // waiting, which is a die in front of somebody who has been handed one —
    // and a number they can read that means nothing. It comes out when the
    // game does.
    die.visible = !(parked && i === 1);
    die.position.set(parked && i === 1 ? MIRROR * x : x, FELT_Y + DIE_SIZE / 2, z);
    die.quaternion.setFromEuler(FACE_UP[face]);
    Object.assign(die.userData.die, {
      mode: "rest", value: face, still: 0, touching: false, offContact: 0, cocked: false,
      forced: null,
    });
    die.userData.die.vel.set(0, 0, 0);
    die.userData.die.spin.set(0, 0, 0);
  });
  heldDice = null;
  thrown = false;
  showDiceValues();
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
  // A search runs the same physics with nothing drawn and nobody told: it is
  // asking where a throw would land, not throwing one.
  if (simulating) return;
  // Straightening it moved it, and it is the last thing that will move it: the
  // shadow it leaves behind has to be drawn against where it actually stopped
  // rather than the frame before.
  shadowsDirty = true;
  showDiceValues();
  if (diceMeshes.every(d => d.userData.die.mode === "rest")) onDiceSettled();
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
  // Only what is actually on the table. During the opening the second die is
  // put away, and reading a face off it was reading a number nobody threw.
  const onTable = diceMeshes.filter(d => d.visible);
  if (onTable.some(d => d.userData.die.mode !== "rest")) { readout.textContent = "…"; return; }
  if (!game) { readout.textContent = "—"; return; }
  // The opening is read out a die at a time with a name against each, which
  // is the panel's business rather than this one's.
  if (game.phase === "opening") return updateHud();
  // Dice lying where they were left are not a roll. The game used to open
  // with the panel reading out whatever faces the pair happened to be resting
  // on, before anybody had touched them — a roll nobody had made.
  readout.textContent = game.dice
    ? diceMeshes.map(d => d.userData.die.value).join(" · ")
    : "—";
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
    for (const die of diceMeshes) if (!offTable(die)) integrateDie(die, PHYSICS_STEP);
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
    if (die.userData.die.mode === "held" || offTable(die)) continue;
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
      if (die.userData.die.mode === "held" || offTable(die)) continue;
      pushOffBar(die);
      pushOffCheckers(die);
    }
    for (let i = 0; i < diceMeshes.length; i++) {
      for (let k = i + 1; k < diceMeshes.length; k++) {
        pushDiceApart(diceMeshes[i], diceMeshes[k]);
      }
    }
    for (const die of diceMeshes) {
      // The parked die is the one this most needed to leave alone: it sits
      // outside the field on purpose, and keepInsideField would drag it back
      // in — an invisible solid the thrown die could then strike.
      if (die.userData.die.mode !== "held" && !offTable(die)) keepInsideField(die);
    }
  }
}

// The opening throws one die; the other is lifted off the table and hidden
// until the game proper begins. It is parked outside the field on purpose, so
// nothing physical must touch it — not gravity, not the walls that would push
// it back in, not the other die, and not a pointer reaching for a die to grab.
// Marked by being invisible, which is exactly what "not on the table" means.
const offTable = die => !die.visible;

function pushOffBar(die) {
  boxAxes(die, _axA);
  if (!boxesOverlap(die.position, dieSupport, _axA, DIE_HALVES,
                    BAR_CENTRE, boxSupport, WORLD_AXES, BAR_HALVES)) return;
  die.position.addScaledVector(_sat.normal, _sat.depth);
  die.userData.die.touching = true;
}

function pushOffCheckers(die) {
  const reach = DIE_INNER * Math.sqrt(3) + DIE_RADIUS;
  for (const checker of pieceSeats) {
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
const BAR_HALVES = new THREE.Vector3(BAR_HALF + EDGE_GAP, BAR_RISE, CASE_HALF_Z);
const BAR_CENTRE = new THREE.Vector3(0, BAR_TOP - BAR_RISE, 0);
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
  for (const checker of pieceSeats) {
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
  if (offTable(dieA) || offTable(dieB)) return;
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
  POINTS[12 - i] = { x: MIRROR * x, z: NEAR_Z, baseZ: -FIELD_HALF + CHECKER_R, dir: 1 };
  POINTS[13 + i] = { x: MIRROR * x, z: FAR_Z, baseZ: FIELD_HALF - CHECKER_R, dir: -1 };
});
// Checkers sent to the bar sit on the centre divider, in the gap the two
// facing rows of points leave open.
// The two bar stacks start half a checker either side of the middle and grow
// apart, so the innermost of one clears the innermost of the other. Seating
// them off the tip of the points instead made that gap depend on how long the
// points run — nine tenths of a checker on the boards with short points, and
// little over half a checker on the one with long ones, so the two colours
// grew into each other.
const BAR_BASE = CHECKER_D * .55;
POINTS.barW = { x: 0, z: -BAR_BASE, baseZ: -BAR_BASE, dir: -1, onBar: true };
POINTS.barB = { x: 0, z: BAR_BASE, baseZ: BAR_BASE, dir: 1, onBar: true };

// Five checkers lie flat on a point. Past that they go on top — but set
// across the join between two of the ones below rather than squarely on one,
// because from a seat above the board a checker placed straight on top hides
// the one under it and the pile reads as a single checker. Half a checker
// along makes the layer above show as its own row.
//
// Each layer is therefore one shorter than the one below and starts half a
// checker further in, so a tall point steps up as a pyramid: five, four,
// three, two, one. That is fifteen, which is exactly what either side owns —
// one colour piled on a single point comes out as a clean pyramid with a
// single checker at its apex.
const CHECKERS_FLAT = 5;

function checkerSeat(key, index) {
  const p = POINTS[key];
  let layer = 0, slot = index, row = CHECKERS_FLAT;
  while (slot >= row && row > 1) { slot -= row; layer++; row--; }
  // A checker sent to the bar sits on top of the divider, not down at the
  // level of the playing surface. On the cases the divider is a wall two and
  // a half centimetres tall, and a checker seated at felt height is inside
  // it — nothing shows but a three millimetre crescent either side.
  const floor = p.onBar ? BAR_TOP : FELT_Y;
  return {
    x: p.x,
    y: floor + layer * (CHECKER_H + .004),
    z: p.baseZ + p.dir * (layer * CHECKER_GAP / 2 + slot * CHECKER_GAP),
  };
}

// The rules live in rules.js and know nothing about any of this — everything
// here is the join between them and the table.


// A match, not a single game: first to three points takes it. A plain win is
// worth one and a mars two, which is how tavla is scored here — no doubling
// cube and no backgammon.
const MATCH_TARGET = 3;
let match = { ivory: 0, black: 0 };
const matchWinner = () =>
  match.ivory >= MATCH_TARGET ? "ivory" : match.black >= MATCH_TARGET ? "black" : null;

let game;
// A game inside a match that is already under way is not opened for: whoever
// won the last one starts the next, the way it is played at a table. Only the
// first game of a match — and the first after one has been won — is opened
// with a die each. Pass that winner in and the board starts in play, with the
// pair in the middle waiting for them.
function resetState(starter = null) {
  game = {
    pos: Rules.startingPosition(),
    // The game opens with one die each rather than a turn: the higher of the
    // two starts, and then throws their own pair. A tie is thrown again.
    phase: starter ? "play" : "opening",
    opening: { [HUMAN]: null, [COMPUTER]: null },
    waitingOn: starter ? null : HUMAN,
    turn: starter ?? HUMAN,
    dice: null,          // the pair as thrown, once they have settled
    remaining: [],       // pips still to play this turn
    required: 0,         // how many the rules oblige to be played
    played: 0,
    history: [],         // one board per move played this turn, to take back
    lifted: null,        // { key } while a checker is in the hand
    over: null,
    thinking: false,
  };
  // Which puts one die off the board and leaves the other in the middle,
  // because the game opens with a single die passed between the players. At
  // the very first call there are no dice yet — they are built further down —
  // and the pair is placed again once there are.
  if (diceMeshes.length) resetDice();
}

// What the player may do with the dice still on the table. Empty means the
// turn is finished — either everything has been played or nothing could be.
function movesNow() {
  if (!game.dice || game.over || !isHuman(game.turn) || game.thinking) return [];
  return Rules.movesAvailable(game.pos, game.turn, game.remaining);
}

// One die each in the opening, the pair once the game is under way. Yours is
// the first, the opponent's the second, so the two never share a die.
function diceInHand(colour) {
  // One die opens the game, whoever is throwing it: it is passed between the
  // two of them the way it is at a table, so both boards watch the same die
  // land in the same order rather than each keeping one of a pair.
  return game.phase === "opening" ? [diceMeshes[0]] : diceMeshes;
}

// Whose throw it is. In the opening that is whoever is being waited on rather
// than whose turn it is — the turn has not been settled yet, and two people
// sharing a screen both throw before it has been.
function thrower() {
  // Online, the other player's die is thrown here after the server has already
  // moved on to waiting for us, so who is being waited on is the wrong answer
  // while that replay is in the air. Whoever the board is throwing for wins.
  return replayingFor ?? (game.phase === "opening" ? game.waitingOn : game.turn);
}

const pointKey = point => String(point);
const barKey = colour => (colour === "ivory" ? "barW" : "barB");

// The seats are keyed the way the board is drawn; the rules speak in point
// numbers, "bar" and "off".
function keyFor(colour, place) {
  return place === "bar" ? barKey(colour) : pointKey(place);
}

// Which way a checker leaves the board when it is borne off.
//
// On a desktop it goes out to the side, past the end wall beyond the home
// boards, which is where the tray sits on a real board — and there is room to
// show it there, because a window wider than it is tall fits the board by its
// height and has width to spare.
//
// A phone or a tablet held upright has that the other way round: the width is
// what the board is fitted to and the spare room is above and below, so a pile
// out past the ends is a pile off the screen. In the hand they come off
// towards the players instead — yours over the near rail and theirs over the
// far one, which is also the direction the hand is already carrying them.
const OFF_TO_THE_SIDE = !HANDHELD;

// Whose rail is whose, when they come off towards the players: the near one is
// yours whoever you are, and two people round one tablet sit either side of it.
const offEdge = colour => (colour === HUMAN ? -AWAY : AWAY);

// How many go in a row out there before the next one starts. Five is a hand
// of them: a glance counts a row of five without counting, and three rows is
// the whole game.
const OFF_IN_A_ROW = 5;

// Where the nth checker of a colour sits once it is off.
function offSeat(colour, standing = 0) {
  if (OFF_TO_THE_SIDE) {
    return {
      x: MIRROR * (CASE_HALF_X + 1.75),
      y: FELT_Y + standing * (CHECKER_H + .004),
      z: colour === "black" ? FIELD_HALF * .55 : -FIELD_HALF * .55,
    };
  }
  // Laid out flat rather than piled up, in rows of five. The board is being
  // looked straight down at here, and from up there a pile of fifteen is one
  // checker and a long shadow. Five is what a glance counts without counting —
  // three full rows is the game — and each row sits further out from the rail
  // than the last, clear of the board rather than against it.
  const row = Math.floor(standing / OFF_IN_A_ROW), place = standing % OFF_IN_A_ROW;
  return {
    x: MIRROR * (FIELD_HALF_X * .55 + (place - (OFF_IN_A_ROW - 1) / 2) * CHECKER_D * 1.15),
    y: FELT_Y,
    z: offEdge(colour) * (CASE_HALF_Z + 1 + row * CHECKER_D * 1.2),
  };
}

const piecesGroup = new THREE.Group();
scene.add(piecesGroup);

// One drawn object for each colour, holding every checker of that colour at
// once. They used to be thirty separate meshes — thirty separate commands to
// the card for what is one shape and one material, redrawn as a set on every
// move. Nothing about the picture changes; what changes is how many times the
// card is asked for it.
//
// Fifteen a side is the whole set: what is on the board and what has been
// borne off come out of the same fifteen, and the one in the hand is drawn on
// its own. So fifteen seats each is the ceiling and it cannot be exceeded.
const CHECKERS_EACH = 15;
const UP = new THREE.Vector3(0, 1, 0);
const _seatMatrix = new THREE.Matrix4();
const _seatAt = new THREE.Vector3();
const _seatTurn = new THREE.Quaternion();
const _seatSize = new THREE.Vector3(1, 1, 1);
const checkerSets = {
  ivory: new THREE.InstancedMesh(checkerGeometry, ivory, CHECKERS_EACH),
  black: new THREE.InstancedMesh(checkerGeometry, black, CHECKERS_EACH),
};
for (const colour of Rules.COLOURS) {
  checkerSets[colour].castShadow = true;
  checkerSets[colour].receiveShadow = true;
  checkerSets[colour].count = 0;
  // The board never leaves the view, and the sphere it would be tested against
  // would have to be rebuilt after every move to be worth asking about.
  checkerSets[colour].frustumCulled = false;
  piecesGroup.add(checkerSets[colour]);
}

// Every checker that is in play, as a record rather than an object: where it
// sits, which point it belongs to, whose it is. That is all anything wanted
// from them — the dice read the position, the pointer reads the rest — which
// is what makes one drawn object for all of them possible.
let pieceSeats = [];
// And which record each drawn seat belongs to, for the pointer: a ray against
// an instanced object comes back with a number rather than a thing. Checkers
// borne off are drawn but not listed, so their seats are empty here: nobody
// may pick one up and no die ever reaches them.
const seatOfInstance = { ivory: [], black: [] };

function renderPieces() {
  wake();
  pieceSeats = [];
  seatOfInstance.ivory = [];
  seatOfInstance.black = [];
  const used = { ivory: 0, black: 0 };
  // The checkers have moved, so the shadows are stale until they have been
  // drawn against these.
  shadowsDirty = true;

  // A hair of yaw per checker so a row reads as hand-placed rather than
  // stamped.
  const seatChecker = (colour, seat, yaw, held) => {
    const at = used[colour]++;
    _seatMatrix.compose(_seatAt.set(seat.x, seat.y, seat.z),
      _seatTurn.setFromAxisAngle(UP, yaw), _seatSize);
    checkerSets[colour].setMatrixAt(at, _seatMatrix);
    seatOfInstance[colour][at] = held ?? null;
    if (held) pieceSeats.push(held);
  };

  const stacks = [];
  for (let point = 1; point <= 24; point++) {
    const held = game.pos.points[point];
    if (held) stacks.push([pointKey(point), held.colour, held.count]);
  }
  for (const colour of Rules.COLOURS) {
    if (game.pos.bar[colour]) stacks.push([barKey(colour), colour, game.pos.bar[colour]]);
  }

  // Checkers that have been borne off are piled outside the wall, each colour
  // off its own end of the board, so the race can be read at a glance.
  for (const colour of Rules.COLOURS) {
    const taken = game.pos.off[colour];
    if (!taken) continue;
    for (let i = 0; i < taken; i++) {
      seatChecker(colour, offSeat(colour, i), (Math.random() - .5) * .3, null);
    }
  }

  for (const [key, colour, count] of stacks) {
    // The checker currently in the player's hand is drawn separately, so its
    // seat on the point is left empty while the drag is in progress.
    const onBoard = count - (game.lifted && game.lifted.key === key ? 1 : 0);
    for (let i = 0; i < onBoard; i++) {
      const seat = checkerSeat(key, i);
      seatChecker(colour, seat, (Math.random() - .5) * .5, {
        position: new THREE.Vector3(seat.x, seat.y, seat.z),
        pointKey: key,
        colour,
      });
    }
  }
  for (const colour of Rules.COLOURS) {
    checkerSets[colour].count = used[colour];
    checkerSets[colour].instanceMatrix.needsUpdate = true;
    // Built from the seats, so it has to be given up whenever they move — the
    // ray is tested against it before any seat is looked at, and a stale one
    // is a checker that cannot be picked up.
    checkerSets[colour].boundingSphere = null;
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

// Play a move if the rules allow it. Everything is checked against what is
// still playable this turn, not just against the board: a move that is legal
// on its own but would strand a die is not one of the moves offered.
function tryMove(fromPlace, toPlace) {
  const single = movesNow().find(m => sameMove(m, fromPlace, toPlace));
  // Dropping a checker eight points away on a 5-3 is one move to the player,
  // so it is one move here: if no single die reaches, look for a way of
  // walking that checker there through several.
  const moves = single ? [single] : chainTo(fromPlace, toPlace);
  if (!moves.length) return false;

  // The whole drag is one entry in the history, so taking it back takes back
  // what was dragged rather than half of it. The moves themselves are kept
  // alongside the board they were played on: taking the turn back needs the
  // board, and handing the turn over needs the moves.
  game.history.push({ pos: game.pos, remaining: game.remaining.slice(),
    played: game.played, moves });
  // Sounded before the move is applied, because what a move sounds like is
  // read off the board it is played on: a lone checker of theirs standing on
  // the point is the difference between a checker set down and one knocked
  // off. Dragged eight points on a 5-3 is two checkers down rather than one,
  // so it is two sounds, spaced by a hand's width of time.
  moves.forEach((move, sira) => {
    const ses = hamleSesi(game.pos, game.turn, move);
    if (ses) calSes(ses, { gecikme: sira * .09 });
    game.pos = Rules.applyMove(game.pos, game.turn, move);
    game.remaining.splice(game.remaining.indexOf(move.die), 1);
    game.played++;
  });
  finishIfWon();
  renderPieces();
  updateHud();
  return true;
}

function chainTo(fromPlace, toPlace) {
  if (!game.dice || game.over || !isHuman(game.turn) || game.thinking) return [];
  const routes = Rules.chainMoves(game.pos, game.turn, game.remaining)
    .filter(c => String(c.from) === String(fromPlace) && String(c.to) === String(toPlace));
  if (!routes.length) return [];
  // Two ways to walk the same checker to the same point can land on different
  // boards: an intermediate point may hold a lone opponent, hit on one route
  // and stepped past on the other. Which one a single drag played used to fall
  // out of the order the dice happened to be in — so whether the opponent was
  // sent to the bar was decided by the roll, not the player. When the routes
  // disagree the drag is refused, and the checker is moved a die at a time —
  // each step a move the board offers on its own, so the player picks the point
  // it passes through. When every route ends the same way, any of them will do.
  const boardAfter = moves => {
    let p = game.pos;
    for (const m of moves) p = Rules.applyMove(p, game.turn, m);
    return JSON.stringify(p);
  };
  const end = boardAfter(routes[0].moves);
  if (routes.some(r => boardAfter(r.moves) !== end)) return [];
  return routes.sort((a, b) => b.moves.length - a.moves.length)[0].moves;
}

function sameMove(move, fromPlace, toPlace) {
  return String(move.from) === String(fromPlace) && String(move.to) === String(toPlace);
}

// Called after every move, so it has to be certain it only pays out once.
function finishIfWon() {
  if (game.over) return;
  const won = Rules.winner(game.pos);
  if (!won) return;
  // Across a network the result is not ours to write. The score, the mars and
  // the end of the match are the server's, and they come back on the next
  // snapshot — but only if the turn that won is sent, and this used to be what
  // stopped it: the board was marked over before the moves left the table, and
  // endTurn refuses to hand over a game it thinks is finished. So the last turn
  // of every online game went unsent, and the server had to play it back for
  // the winner half a minute later, marking them as the one who did not.
  //
  // Sent from here rather than left to the button: the board has just been
  // emptied and nobody is going to press Tamam on it. The wait is one turn of
  // the loop, so tryMove finishes putting the move down first.
  if (mode === "online") {
    if (isHuman(game.turn)) setTimeout(endTurn, 0);
    return;
  }
  const value = Rules.gameValue(game.pos);
  game.over = { winner: won, value };
  match[won] += value;
  // Long enough to watch the last checker come off before being asked what to
  // do next.
  setTimeout(showResult, 1100);
}

// A throw settles into the turn's dice. Doubles are four moves of the same
// number; what the rules oblige is worked out once, here, because "how many
// dice can be played" is a property of the whole turn.
// A settled die only counts as a roll if it was thrown. Dice come to rest for
// other reasons — one standing on a checker is dropped when that checker is
// moved out from under it, and it settles again where it lands. Without this,
// the board being redrawn after the computer's turn handed you the faces the
// computer had just played.
let thrown = false;
let thrownDice = null;

function onDiceSettled() {
  if (!game || game.over || !thrown) return;
  thrown = false;

  // A die leaning on a wall or standing on a checker is not a roll. It goes
  // back in the hand and is thrown again by whoever threw it.
  const rolled = thrownDice ?? diceInHand(thrower() || game.turn);
  // The numbers the session named are the numbers of this throw, whatever the
  // dice happen to have come to rest on.
  if (wanted && wanted.length === rolled.length) {
    const got = rolled.map(d => d.userData.die.value).slice().sort();
    const asked = wanted.slice().sort();
    if (!got.every((face, i) => face === asked[i])) {
      rolled.forEach((die, i) => {
        die.userData.die.value = wanted[i];
        // And turned so the face it shows is the face it counts as. Setting the
        // value alone left the pips on the felt reading one thing while the
        // turn was played on another — six and one lying there under a panel
        // that said four and three. This only ever runs when the tumble did not
        // land on the numbers the session named (a search that ran out of
        // tries, or a replay that diverged), so a small snap to the right face
        // is the honest end of it.
        die.quaternion.setFromEuler(FACE_UP[wanted[i]]);
      });
    }
  }
  wanted = null;
  if (rolled.some(d => d.userData.die.cocked)) {
    // Online the numbers belong to the server, not to how the dice fell: the
    // turn they are for is already decided, so a die that lands cocked is
    // thrown again to the very same numbers rather than picked back up. This is
    // true of our own throw as much as the opponent's replayed one — and it
    // used to lock the turn for the one case it was not handled: our own dice,
    // where the person was told to pick them up and throw again but canThrow
    // refused because the numbers were already on the match. Nobody could roll,
    // nobody could press Tamam, and the clock threw the turn away.
    if (mode === "online") {
      const again = game.phase === "opening"
        ? (shownOpening[replayingFor ?? game.waitingOn] == null
            ? [] : [shownOpening[replayingFor ?? game.waitingOn]])
        : (game.dice ?? []);
      if (!again.length) { game.cocked = false; replayingFor = null; return; }
      game.cocked = true;
      updateHud();
      forcedRoll = again.slice();
      setTimeout(() => throwDice(thrower() === HUMAN ? AWAY : -AWAY), 1400);
      return;
    }
    game.cocked = true;
    updateHud();
    // Off the network the people at the table pick the dice back up themselves;
    // only the computer's re-throw is automatic, and it is aimed from its chair.
    if (isHuman(thrower() || game.turn)) return;
    setTimeout(() => throwDice(-AWAY), 1400);
    return;
  }
  // The throw stood, so the board is nobody's proxy any more — and the number
  // it was standing in for is now on the felt, so the panel may read it out.
  if (openingHidden && openingHidden === replayingFor) releaseOpening();
  replayingFor = null;
  game.cocked = false;
  thrownDice = null;
  if (game.phase === "opening") return openingSettled();
  if (game.dice) return;
  const values = rolled.map(d => d.userData.die.value);
  if (values.length < 2 || values.some(v => !v)) return;
  game.dice = values;
  openingStands = false;
  // The panel is written from the dice on the felt, and it was written a
  // moment ago — as each die came to rest, while this was still empty, so it
  // said "—" and nothing said otherwise afterwards. The numbers only exist as
  // a roll once they are here, so this is where they are read out.
  showDiceValues();
  game.remaining = Rules.diceFor(values[0], values[1]);
  game.required = Rules.legalSequences(game.pos, game.turn, game.remaining)[0].length;
  game.played = 0;
  // Only the computer's turn is played from here. Online the other side plays
  // its own, on its own board, and what it did arrives as moves to be watched.
  if (mode !== "online" && !isHuman(game.turn)) setTimeout(playComputerTurn, 700);
  updateHud();
}

// A checker travelling on its own, so the computer's moves can be watched
// rather than found already made. It lifts off its point, carries across, and
// comes down on the new one — the same arc a hand makes.
let sliding = null;

function slideChecker(colour, from, to, onDone) {
  const mesh = new THREE.Mesh(checkerGeometry, colour === "ivory" ? ivory : black);
  mesh.position.set(from.x, from.y, from.z);
  mesh.castShadow = true;
  scene.add(mesh);
  sliding = { mesh, from, to, t: 0, span: .62, onDone };
}

function stepSlide(dt) {
  if (!sliding) return;
  sliding.t += dt;
  const k = Math.min(1, sliding.t / sliding.span);
  const ease = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  const { from, to, mesh } = sliding;
  const x = from.x + (to.x - from.x) * ease;
  const z = from.z + (to.z - from.z) * ease;
  // The arc peaked three quarters of the way to the carrying height, which put
  // the checker's middle fifty thousandths above the bar and its underside
  // inside it — and the peak sits at the middle of the move rather than over
  // the middle of the board, so a crossing that was not centred met the bar
  // lower still. It is carried the full height now, and held there while it is
  // over the bar rather than dipping through it on the way past.
  const lift = (CARRY_Y - FELT_Y) * Math.min(1, Math.sin(Math.PI * k) * 1.6);
  const overBar = Math.abs(x) < BAR_HALF + CHECKER_R;
  const floor = overBar ? CASE_TOP - FELT_Y + CHECKER_H : 0;
  mesh.position.set(x, from.y + (to.y - from.y) * ease + Math.max(lift, floor), z);
  if (k < 1) return;
  scene.remove(mesh);
  const done = sliding.onDone;
  sliding = null;
  done();
}

// Where a checker sits now, and where it would sit after the move — the seat
// it leaves is the top of its stack, the seat it takes is the next one up.
function seatOfMove(colour, move) {
  const fromKey = move.from === "bar" ? barKey(colour) : pointKey(move.from);
  const standing = move.from === "bar"
    ? game.pos.bar[colour]
    : game.pos.points[move.from].count;
  const from = checkerSeat(fromKey, standing - 1);
  if (move.to === "off") {
    // Over the rail it leaves by, at the height of the wall it clears: to the
    // side on a desktop, towards whoever is playing it in the hand.
    return {
      fromKey, from,
      to: OFF_TO_THE_SIDE
        ? { x: MIRROR * (FIELD_HALF_X + 1.4), y: CASE_TOP, z: from.z }
        : { x: from.x, y: CASE_TOP, z: offEdge(colour) * (FIELD_HALF_Z + 1) },
    };
  }
  const target = game.pos.points[move.to];
  const seated = target && target.colour === colour ? target.count : 0;
  return { fromKey, from, to: checkerSeat(pointKey(move.to), seated) };
}

// The opening: each side throws one die and the higher of the two starts.
function openingSettled() {
  // Across a network the opening is the server's to run, and none of it may be
  // written down here. It named this die before it was let go of and recorded
  // what it said the moment it was asked — by the time the die actually comes
  // to rest the server has already moved on to waiting for the other player,
  // so writing "the value of the die that just landed" against whoever is
  // being waited for now would put our own throw down in their name. Who
  // throws next, whether it was a tie and who ends up starting all arrive on
  // the next snapshot; the other player's die is thrown on their own board.
  if (mode === "online") return;

  const who = game.waitingOn;
  if (!who) return;
  const die = diceInHand(who)[0].userData.die;
  if (die.mode !== "rest" || !die.value) return;
  game.opening[who] = die.value;
  game.waitingOn = null;

  if (game.opening[HUMAN] === null || game.opening[COMPUTER] === null) {
    // The other side still has to throw.
    const next = game.opening[HUMAN] === null ? HUMAN : COMPUTER;
    game.waitingOn = next;
    // Long enough to read the die that was just thrown before the other one
    // answers it. At nine hundred the pair went by as one event.
    if (!isHuman(next)) setTimeout(() => throwDice(next === HUMAN ? AWAY : -AWAY), 1500);
    updateHud();
    return;
  }

  const mine = game.opening[HUMAN], theirs = game.opening[COMPUTER];
  if (mine === theirs) {
    // A tie is broken by whoever threw second, on their own: they throw again
    // against the number the two of them made. Higher and they start, lower
    // and the other one does, equal again and they throw again. Only their own
    // die changes, so the comparison below never has to know a tie happened.
    game.waitingOn = who;
    announce(mode === "hotseat" ? "open.tieHot"
      : isHuman(who) ? "open.tieYou" : "open.tieThem",
      NEWS_SHOWN_MS, { name: nameOf(who) });
    if (!isHuman(who)) setTimeout(() => throwDice(who === HUMAN ? AWAY : -AWAY), 1500);
    updateHud();
    return;
  }

  // The opening die only settles who goes first. Whoever it is throws their
  // own pair for the turn rather than playing the opening die as it lies, so
  // the pair is put back in the middle of the board together — including the
  // one that has been waiting off it since the game opened.
  // Held so the two dice can be read before they are swept away, the same as
  // across a network. Nobody is being waited on while it is held, which is
  // what stops either of them being picked up again in the meantime.
  updateHud();
  holdTheOpening(() => {
    game.phase = "play";
    openingStands = true;
    resetDice();
    startTurn(mine > theirs ? HUMAN : COMPUTER);
    updateHud();
  });
}

// The computer plays its whole turn as a sequence, one visible move at a time,
// then hands the table back.
function playComputerTurn() {
  const sequence = Rules.chooseSequence(game.pos, COMPUTER, game.remaining);
  game.thinking = true;
  updateHud();
  let i = 0;
  const step = () => {
    if (i >= sequence.length) {
      game.thinking = false;
      finishIfWon();
      if (!game.over) startTurn(HUMAN);
      updateHud();
      renderPieces();
      return;
    }
    const move = sequence[i++];
    const { fromKey, from, to } = seatOfMove(COMPUTER, move);
    game.lifted = { key: fromKey };
    renderPieces();
    slideChecker(COMPUTER, from, to, () => {
      game.lifted = null;
      const ses = hamleSesi(game.pos, COMPUTER, move);
      if (ses) calSes(ses);
      game.pos = Rules.applyMove(game.pos, COMPUTER, move);
      renderPieces();
      updateHud();
      // A hand's pause between one checker and the next. At half this the
      // turn read as a single shuffle rather than as moves being made.
      setTimeout(step, 520);
    });
  };
  // And a moment to look at the dice before anything is moved with them.
  setTimeout(step, 900);
}

function startTurn(colour) {
  game.turn = colour;
  game.dice = null;
  thrown = false;
  game.remaining = [];
  game.required = 0;
  game.played = 0;
  game.history = [];
  // A checker on the bar and the six points it could come in on all held
  // against it: no number brings it in, so there is nothing to throw for. The
  // turn is said out loud and handed straight back rather than spent throwing
  // dice that cannot be played.
  if (Rules.shutOut(game.pos, colour)) return standAside(colour);
  // Across a network the other side throws for itself; here there is nobody
  // to throw for but the computer.
  if (mode !== "online" && !isHuman(colour)) setTimeout(() => throwDice(-AWAY), 550);
}

// Long enough to read why the turn went past without anything happening.
const SHUT_OUT_MS = 2200;

function standAside(colour) {
  announce(mode === "hotseat" ? "shut.hot" : colour === HUMAN ? "shut.you" : "shut.them",
           SHUT_OUT_MS, { name: nameOf(colour) });
  updateHud();
  // Both of them shut out at once is a position nothing can move on from.
  // Vanishingly rare and not worth a rule of its own, but it must not turn
  // into two boards handing a turn back and forth for ever.
  if (Rules.shutOut(game.pos, Rules.other(colour))) return;
  setTimeout(() => {
    if (game.over || game.turn !== colour) return;
    startTurn(Rules.other(colour));
    updateHud();
  }, SHUT_OUT_MS);
}

// The turn is over when there is nothing left that may be played — which is
// also the case when the dice could not be played at all.
//
// It has to be your turn for it to be your turn to end. Without that, the
// moment the computer's dice came to rest the button lit up: its roll was in,
// it had not started moving yet, and movesNow is empty for anybody who is not
// the player. Pressing it there took the turn off the computer before it had
// played a single checker.
function turnComplete() {
  return !!game.dice && isHuman(game.turn) && !game.thinking && movesNow().length === 0;
}

// Until the turn is handed over, a move can be taken back — the board and the
// dice left to play are restored to what they were before it.
function undoMove() {
  if (!game.history.length || game.over || !isHuman(game.turn) || game.thinking) return;
  const last = game.history.pop();
  game.pos = last.pos;
  game.remaining = last.remaining;
  game.played = last.played;
  renderPieces();
  updateHud();
}

// Playing somebody who is not in the room. The board stops deciding anything
// it cannot see the other side of: the server owns the position, whose turn it
// is and what the dice say, and this is where that arrives.
//
// Our own turn is the exception, and only while it is being played. The moves
// are provisional until Tamam — that is what Geri al is for — so a snapshot
// that lands mid-turn is allowed to bring the score and the dice but not to
// tread on the board underneath the player's hand.
//
// "Being played" ends at Tamam, not when the server gets round to answering,
// which is why handing over is marked here rather than read off the history.
// It matters most at the end of a game: a game is won on the winner's own
// turn and the server leaves the turn with them, so a board still thinking of
// itself as mid-turn would throw away the one snapshot that says it has won.
let remoteSeq = -1;
let forcedRoll = null;
let handedOver = false;
// Set when this board sends a turn, cleared by the server's word about it.
// game.history cannot answer "did we play this" — startTurn empties it, so by
// the time the reply arrives our own moves look like somebody else's.
let weCommitted = false;
let weAsked = false;
// The same for a throw: set when this board asks for numbers, cleared when the
// server's word about them arrives. Comparing the numbers against the faces on
// the felt cannot answer it — the server writes them down the moment it is
// asked, seconds before the dice it named come to rest here, so our own throw
// is still in the air when its own record arrives and looks unmade.
// The other player's opening die, thrown on this board so it can be seen
// landing rather than appearing as a number in the panel. What has already
// been shown is remembered, because the same snapshot arrives more than once
// and a tie wipes the opening and starts it again.
let replayingFor = null;
// Their throw is owed to this board but has not started yet — it waits while
// anything of ours is in the air. The dice may not be picked up in that gap
// either: it ends with two of them tumbling across the felt on somebody
// else's behalf.
let replayOwed = false;
// What each side's opening die has already been shown as on this board, kept
// per colour rather than only for the opponent: when the clock throws for you,
// the die is yours and it still has to be thrown here, or the number simply
// appears out of nowhere.
let shownOpening = { black: null, ivory: null };
// When each of them last threw, as the match records it. Two throws can carry
// the same face — a tie broken by throwing it again — and a board reading the
// number alone takes the second for the first and never shows it. Kept per
// player: one stamp for the whole opening moves when the other one throws, and
// then every board shows its opponent's die a second time straight after its
// own, which is exactly what it did.
let shownOpeningAt = { black: -1, ivory: -1 };
let shownTieAt = -1;
// Whose opening number the panel may not read out yet: the server has named a
// die that is still waiting to be thrown on this board. It is let go of when
// the die comes to rest, or when the throw is given up on.
let openingHidden = null;
// A tie waiting on that same die. Two equal numbers is news about both of
// them, so it cannot be said while one is still in the air — it would say
// what the die is going to be before anybody has seen it land.
let pendingTie = null;

// The held number let go of: the panel may read it out, and anything that was
// waiting on it gets said.
function releaseOpening() {
  openingHidden = null;
  const say = pendingTie;
  pendingTie = null;
  if (game) updateHud();
  if (say) say();
}
// The other player's seat: whether anybody is in it, and whether the server
// has given up on them coming back. Nothing here decides anything — it asks,
// and the server reads the seat itself before it acts.
let theirSeat = null;
let watchingSeat = false;
let opponentGone = false;

// The last turn this board watched, by the write it was made on.
let seenMoveSeq = 0;
// And the last throw, the same way. The dice stay written on the match until
// the turn is played, so every word about it in between carries them along —
// somebody sitting down, a chair emptying — and a board reading the numbers
// alone threw them again on each one. The player who had just come back
// watched their opponent throw twice.
let seenThrowSeq = 0;
// Whether this board has heard anything yet. The first word it hears is the
// game as it already stands, not a series of things happening in front of it.
let caughtUp = false;
// True between the opening being settled and the first dice of the game being
// thrown. The panel says who won the opening in that gap, and it was saying it
// on every later turn too: the opening numbers stay on the match for the whole
// game, so "the opening is decided and nothing has been thrown yet" was true
// again at the start of every single turn.
let openingStands = false;
let newsFill;
// Long enough to read and no longer. Both of these are news, not states of
// the board: once either has been said there is nothing to be done about it,
// and a line that stays put is a line still covering something else an hour
// later.
const NEWS_SHOWN_MS = 5000;
let newsUntil = 0, newsWord = null;
let asking = false;

// Whoever the match is waiting on, from what the board last heard. Only the
// other side is worth asking about: our own clock is ours to run down.
function waitingOnThem() {
  if (mode !== "online" || !game || game.over) return false;
  // With the chair opposite empty there is nobody left to ask on our behalf,
  // and a game with one player in it would stop where it stood — so the board
  // asks whoever's turn it is. The server checks the empty chair itself before
  // it agrees to anything, so this is a nudge rather than a claim.
  if (theirSeat === false) return true;
  if (game.phase === "opening") return game.waitingOn && game.waitingOn !== HUMAN;
  return game.turn !== HUMAN;
}

// Asked while the other side is the one to move, and answered by the server
// with silence unless something is genuinely wrong. It is deliberately dull:
// a client that could decide this could hand its opponent's checkers to the
// computer whenever it felt like it.
async function askAboutThem() {
  if (asking || !matchId || !waitingOnThem()) return;
  asking = true;
  try { await ask("sure", { matchId }); }
  catch (reason) { console.info("tavla: saat sorulamadı —", reason?.message ?? reason); }
  finally { asking = false; }
}

setInterval(askAboutThem, 5000);

// Claims this seat for as long as the page is open, and watches the one
// opposite. Firebase clears the claim itself when the connection goes, so a
// closed tab and a tunnel look the same from the other side.
function watchSeats(players) {
  if (watchingSeat || !players || !matchId) return;
  const theirs = players[Rules.other(HUMAN)];
  if (!theirs) return;
  watchingSeat = true;
  sitAt(matchId, theirs, here => {
    theirSeat = here;
    // Empty seat, their move: the computer may take it now rather than in a
    // minute, and the server checks the seat itself before it does.
    if (!here) askAboutThem();
  });
  // And if it was this browser that went away, it is back.
  ask("geriGeldim", { matchId }).catch(() => {});
}

function unpackServerPosition(packed) {
  const points = Array.from({ length: 25 }, () => null);
  for (const [point, stack] of Object.entries(packed.points ?? {})) {
    points[Number(point)] = { colour: stack.colour, count: stack.count };
  }
  return { points, bar: { ...packed.bar }, off: { ...packed.off } };
}

// The opponent's turn, played out one checker at a time so it can be watched
// rather than appearing all at once.
function playRemoteTurn(colour, moves, done) {
  game.thinking = true;
  updateHud();
  let i = 0;
  const finish = () => {
    game.thinking = false;
    game.lifted = null;
    done();
  };
  const step = () => {
    if (i >= moves.length) return finish();
    const move = moves[i++];
    // Watching is a courtesy; the server's word for where the board ended up
    // is not. If a move cannot be walked through here for any reason, the
    // walk is abandoned and the position taken as given, so a turn that
    // cannot be animated can never leave the board stranded half way.
    try {
      const { fromKey, from, to } = seatOfMove(colour, move);
      game.lifted = { key: fromKey };
      renderPieces();
      slideChecker(colour, from, to, () => {
        game.lifted = null;
        try {
          const ses = hamleSesi(game.pos, colour, move);
          if (ses) calSes(ses);
          game.pos = Rules.applyMove(game.pos, colour, move);
        } catch (reason) {
          console.info("tavla: hamle oynatılamadı —", reason?.message ?? reason);
          return finish();
        }
        renderPieces();
        updateHud();
        setTimeout(step, 520);
      });
    } catch (reason) {
      console.info("tavla: hamle oynatılamadı —", reason?.message ?? reason);
      finish();
    }
  };
  // The same pause before the first checker moves as the computer takes at
  // the table, so a turn played across a network is watched at a hand's pace
  // rather than arriving.
  setTimeout(step, 900);
}

// The other player's opening die, thrown on this board so it can be watched
// landing rather than appearing as a number in the panel. The server wrote
// down what it said the moment it was asked and moved straight on to waiting
// for us, so the board has to be told whose throw it is showing — see
// thrower(). What has already been shown is remembered, because the same
// value would otherwise be thrown again on the next snapshot.
// Every opening die this board has not already seen land, whoever threw it.
// Ours is normally thrown here by hand and marked as seen the moment it comes
// to rest — but when the clock runs out the server throws it for us, and then
// nothing on this board has moved. Watching only the other player's die meant
// the one person who most needed to see it, the one whose turn was taken, was
// the only one who never did.
//
// An opening die does not go stale when the server says something new — it
// goes stale when the opening itself is wiped, which is what a tie does.
function showOpening(state) {
  // Theirs only. Ours is thrown here by hand and there is nothing left to
  // show — and trying to show it anyway threw it twice: the server writes the
  // number down the moment it is asked for, which is a couple of seconds
  // before the die it named comes to rest on this felt, so the word arrives
  // while the throw it describes is still in the air and looks like one that
  // never happened. Nothing throws our opening die for us any more, since the
  // opening keeps no time, so there is no case left that wanted it.
  const theirs = Rules.other(HUMAN);
  const value = state.opening?.[theirs] ?? null;
  if (value === null) {
    shownOpening[theirs] = null;
    shownOpeningAt[theirs] = -1;
    // The opening wiped: anything that was waiting on their die goes with it,
    // since it was about numbers that are no longer on the match.
    if (openingHidden === theirs) { openingHidden = null; pendingTie = null; }
    return;
  }
  const at = state.openingAt?.[theirs] ?? 0;
  if (shownOpening[theirs] === value && shownOpeningAt[theirs] === at) return;
  shownOpening[theirs] = value;
  shownOpeningAt[theirs] = at;
  // The number is the server's word about a die that has not been thrown on
  // this felt yet, so it is kept off the panel until it has. It was going up
  // in the readout the moment the word arrived — seconds before the die it
  // names crossed the board — so the throw was read before it was watched.
  openingHidden = theirs;
  // A number held back for ever is worse than one shown early, so the hold has
  // an end to it: longer than the throw can take to find its turn on this
  // board, and it is let go of by the die landing well before this.
  setTimeout(() => {
    if (openingHidden === theirs && shownOpeningAt[theirs] === at) releaseOpening();
  }, 20000);
  replayThrow(theirs, [value], () => shownOpeningAt[theirs] !== at);
}

// The other side's throw, shown on this board. One at a time, and never on
// top of one of our own: if anything is in the air, in a hand, or still being
// searched for, theirs waits its turn rather than being dropped — a die that
// is never thrown is a number that never appears, since the panel reads the
// dice on the felt. It gives up if the board moves on while it is waiting.
function replayThrow(colour, values, stale, tries = 0) {
  if (stale()) { replayOwed = false; return; }
  // A checker in the hand counts as the board being busy, the same as a die in
  // the air. A throw that began while one was being dragged left the drag
  // half-made — nothing finished it, and the next pointer-up on the board
  // played it out as a move nobody meant to make. Waited out here instead: the
  // drag ends, then the throw crosses the felt.
  if (thrown || heldDice || pending || dragging) {
    if (tries > 40) {
      replayOwed = false;
      // Given up on: the die is never going to be thrown here, so the number
      // is better read late than never.
      if (openingHidden === colour) releaseOpening();
      return;
    }
    replayOwed = true;
    setTimeout(() => replayThrow(colour, values, stale, tries + 1), 400);
    return;
  }
  replayOwed = false;
  replayingFor = colour;
  forcedRoll = values.slice();
  // Away from whoever is throwing it, not always towards us. Their throw
  // crosses the board this way; ours — which is what the clock throws when we
  // are too slow — has to leave from our own side, or the dice come at us out
  // of the opposite corner as though somebody else had made our throw.
  throwDice(colour === HUMAN ? AWAY : -AWAY);
}

// A line of news, up long enough to read. It is taken down on a timer rather
// than by the next redraw: the panel is drawn on events, and in a game the
// computer is playing there may not be another one for minutes.
function announce(word, ms = NEWS_SHOWN_MS, fill = undefined) {
  newsWord = word;
  newsFill = fill;
  newsUntil = performance.now() + ms;
  notice(t(word, fill));
  setTimeout(() => { if (performance.now() >= newsUntil) notice(""); }, ms);
}

// Long enough to look at two dice and see which is the higher. Counted from
// the moment the last of them stops rolling rather than from the server's
// word, since a die that is still tumbling has not been read yet.
const OPENING_HELD_MS = 3500;

// What the server allows, written down again here so it can be counted out on
// the panel. Nothing is decided by these — the clock that matters runs on the
// server and is read by the other board — but a turn that can be taken away
// without warning is a turn taken away unfairly, so it is shown.
const ROLL_SECONDS = 20, MOVE_SECONDS = 60, OPEN_SECONDS = 20;
// The same minute the server holds an empty chair for.
const HELD_SECONDS = 60;
// One counter for each of the two things a turn is made of, each under the
// reading it belongs to: the throw beneath the dice, the move beneath whose
// turn it is. They were one number in one place, which meant reading the panel
// to find out what the number was counting.
const rollBox = document.querySelector("#sayac-zar");
const moveBox = document.querySelector("#sayac-hamle");
let clockUntil = 0;
let clockWhich = null;

// How long is left on whatever the table is waiting for, and counted from
// when. Shown to both of them, not only to whoever it is running against: the
// clock decides when the server takes a turn over, and a player who cannot see
// it is a player watching the board sit still with no idea whether anything is
// about to happen. Both boards read the same start off the match, so the two
// counters run together to the second and reach zero together.
function runningClock(state) {
  if (mode !== "online" || !state || state.over) return 0;
  // Not while the chair opposite is being held. That minute is counted out in
  // the middle of the table beside the line that says what it is for: a bare
  // number up in the corner, where the panel keeps the turn's time, is a number
  // nobody looks at and nobody could read the meaning of.
  if (state.away && state.away !== HUMAN) return 0;
  // The opening has a clock of its own now, and a shorter one: there is a
  // single die and nothing to weigh up about it. Counted under the dice, since
  // what is being waited for is a throw.
  if (state.phase === "opening") {
    return state.waitingOn
      ? { seconds: OPEN_SECONDS, from: null, which: "roll" }
      : 0;
  }
  if (!state.turn) return 0;
  return state.dice
    ? { seconds: MOVE_SECONDS, from: null, which: "move" }
    : { seconds: ROLL_SECONDS, from: null, which: "roll" };
}

// The minute the server holds an empty chair for, counted where the news is.
// Zero when nobody is being waited for.
let awayUntil = 0;
// How many things the server has done for us in a row, as far as this board has
// heard, and whether the giving-up has been said out loud yet.
let idleSeen = 0, abandonSeen = false;

// Said for as long as the chair is empty, with the minute running in the same
// line. News is a thing that is said once and taken down; this is a condition
// of the game, and taking it down after ten seconds left somebody sitting in
// front of a board that had simply stopped, with nothing on the screen to say
// why or for how much longer.
function awayLine() {
  if (!awayUntil) return "";
  const left = Math.max(0, Math.ceil((awayUntil - Date.now()) / 1000));
  return `${t("away.gone")} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

// Written as a clock rather than as a bare number of seconds: under a row of
// dice a lone "18" reads as a die, and this way it needs no words in any of
// the eight languages.
function showClock() {
  const left = clockUntil - Date.now();
  const seconds = Math.ceil(left / 1000);
  // Only ever one of the two is running: a turn is waiting either for the dice
  // or for the checkers, never for both. The other is emptied rather than left
  // showing the number it stopped on.
  for (const [which, box] of [["roll", rollBox], ["move", moveBox]]) {
    if (!box) continue;
    if (left <= 0 || which !== clockWhich) {
      box.textContent = "";
      box.classList.remove("running", "nearly");
      continue;
    }
    box.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    box.classList.add("running");
    box.classList.toggle("nearly", seconds <= 5);
  }
}
// A throw that was started and never landed leaves the board unable to do
// anything at all: while it thinks it is in the middle of showing somebody's
// dice, nothing can be picked up and Tamam stays down with it. From the inside
// there is nothing to notice — the thing that would clear the flag is the
// throw coming to rest, which is exactly what did not happen. So it is watched
// from the outside: if the felt has been still for four seconds and nothing is
// in a hand, whatever was being waited for is not coming.
let stuckSince = 0;
function unstick() {
  const busy = replayingFor || replayOwed || (heldDice && heldDice.released);
  if (!busy || pending || diceMeshes.some(d => d.userData.die.mode !== "rest")) {
    stuckSince = 0;
    return;
  }
  if (!stuckSince) { stuckSince = Date.now(); return; }
  if (Date.now() - stuckSince < 4000) return;
  stuckSince = 0;
  console.info("tavla: inmeyen atış bırakıldı — tahta serbest");
  replayingFor = null;
  replayOwed = false;
  heldDice = null;
  thrown = false;
  updateHud();
}

setInterval(() => {
  unstick();
  showClock();
  // The held chair counts down in the middle of the table, so the line it is
  // written in has to be redrawn as it goes.
  if (awayUntil && !tableGone) notice(awayLine());
}, 250);

function holdTheOpening(done, waited = 0) {
  const rolling = replayingFor || replayOwed || thrown || heldDice || pending;
  // Not for ever: a throw that never lands must not strand the game.
  if (rolling && waited < 15000) {
    setTimeout(() => holdTheOpening(done, waited + 200), 200);
    return;
  }
  setTimeout(done, OPENING_HELD_MS);
}

function applyServerState(state) {
  if (!game) return;
  // A closing is terminal and must never be missed, so it is read before the
  // sequence guard rather than after it. A table is closed by a write made
  // outside a transaction, and its seq can land equal to one a transaction
  // wrote in the same moment — so the closing snapshot could arrive with a seq
  // no higher than the last, be turned away by the guard below, and leave a
  // board that the server has closed still looking playable: dice picked up
  // come back "Masa kapandı", a turn sent is silently rewound, and nothing
  // says why until the page is reloaded by hand.
  if (state.closed) { tableClosed(state.closedBy ?? null); return; }
  if (state.seq <= remoteSeq) return;
  const wasOpening = game.phase === "opening";
  const ours = !state.over && !handedOver
    && state.turn === HUMAN && game.history.length && state.phase === "play";
  remoteSeq = state.seq;

  // Watched once. The moves stay written on the match until the next throw
  // clears them, so every word about it in between — a chair emptying, a clock
  // being asked — carries the last turn along untouched. Reading the moves
  // alone, a board took each of those for a fresh turn and played the same one
  // over again; which write they were made on is stamped, so it can tell them
  // apart. Marked here rather than where it is used, so a word arrived at
  // while our own move is still in hand counts as seen too.
  const seenBefore = state.lastMoveSeq > 0 && state.lastMoveSeq === seenMoveSeq;
  seenMoveSeq = state.lastMoveSeq ?? 0;
  // Marked where it is acted on rather than here. A board that has just sat
  // down hears two words in quick succession — sitting down is itself a word
  // about the match — and the first of them does not throw the dice straight
  // away: it waits out the pause the opening is given. Marked here, the second
  // word found the throw already spoken for and skipped it, and the dice were
  // left lying on whatever faces the felt had given them. The panel said 4-1
  // and the dice said 5-4.
  const throwSeen = state.lastThrowSeq > 0 && state.lastThrowSeq === seenThrowSeq;
  // This board's first word. What it says is where the game has got to, and
  // none of it is news: the opening die was thrown a quarter of an hour ago
  // and does not want throwing again in front of somebody who has just sat
  // back down at a game in progress.
  const firstWord = !caughtUp;
  caughtUp = true;
  // The opening numbers stay written on the match for the whole game, so a
  // board that has just sat down finds two dice it has never seen and throws
  // them across the felt — one of them, in front of somebody who came back to
  // a game a quarter of an hour old. Taken as read, once, before anything is
  // shown: they are not news to anybody at this table.
  if (firstWord) {
    shownOpening = { ...state.opening };
    shownOpeningAt = { black: state.openingAt?.black ?? 0, ivory: state.openingAt?.ivory ?? 0 };
    shownTieAt = Math.max(shownOpeningAt.black, shownOpeningAt.ivory);
  }

  // The phase is settled with the turn and the dice rather than ahead of them.
  // Moving it early meant the board could be in the play phase while it still
  // thought the turn belonged to whoever held it last, and the play phase is
  // what decides that picking the dice up picks up both of them.
  game.opening = { ...state.opening };
  game.waitingOn = state.waitingOn ?? null;
  watchSeats(state.players);
  // Said once the server has given up on them: three minutes of an empty seat.
  // The moment the chair opposite empties and the computer picks the checkers
  // up, rather than the three minutes it takes to give up on them. Waiting was
  // the wrong way round: the news is worth most while you are still wondering
  // what has happened, and by three minutes you have worked it out.
  // The table coming back to us. While the computer is covering, the server
  // keeps us marked away however plainly we are sitting here — so the mark
  // lifting is the handover itself, and it is worth saying, since until then
  // nothing we did to the board had any effect.
  // A table that has been closed is handled at the very top now, before the
  // sequence guard, so that a closing whose seq did not advance is never
  // missed — see there.
  if (codePanel && state.code) {
    codePanel.querySelector("strong").textContent = state.code;
    codePanel.removeAttribute("hidden");
  }
  const goneNow = state.away === Rules.other(HUMAN);
  // How long is left of the minute their chair is held for, anchored to the
  // server's own stamp: the two boards sat down at different moments and would
  // otherwise be counting from different places.
  awayUntil = goneNow
    ? (state.awaySince?.[state.away]?.toMillis?.() ?? Date.now()) + HELD_SECONDS * 1000
    : 0;
  endButton?.toggleAttribute("hidden", !goneNow);
  if (goneNow !== opponentGone) {
    opponentGone = goneNow;
    // The leaving says itself, and goes on saying itself for as long as it is
    // true — see awayLine. Only the coming back is news, and it is only ever
    // mentioned to somebody who watched the chair empty, since this runs on a
    // change and the leaving is what changed it.
    if (!goneNow) announce("away.back", 5000);
  }
  // The server has started playing for somebody who is still sitting there.
  // Said to them, once, the first time it happens: they are connected, so they
  // can be told — and being told is the whole point, since the alternative is
  // a table that closes on somebody who only looked away.
  const played = state.idle?.[HUMAN] ?? 0;
  if (played > idleSeen && played === 1) announce("idle.warn", 8000);
  idleSeen = played;
  // And when the table is finally given up on, to both of them: the result box
  // says who won the match, this says why it ended. Each is told their own side
  // of it — the one who stayed that their opponent handed the game over, the
  // one who left that handing it over is what ended it.
  if (state.abandonedBy && !abandonSeen) {
    abandonSeen = true;
    announce(state.abandonedBy === HUMAN ? "idle.gone" : "idle.left", 8000);
  }
  // The running score of the match belongs to the server too.
  match.ivory = state.score.ivory;
  match.black = state.score.black;

  if (ours) { updateHud(); return; }

  const settle = () => {
    // Only if this is still the last word. settle is held back behind an
    // animation — the moves being played out, or the opening being read — and
    // in that gap the server can speak again: the opponent throws, a newer
    // snapshot arrives and is applied, and remoteSeq moves past this one. Run
    // then, this stale settle wrote the old position, dice and clock back over
    // the new — the panel read "—" through the opponent's whole turn and the
    // clock counted a minute that had already restarted. The newer snapshot has
    // already put the board right; this one has nothing left to say.
    if (state.seq !== remoteSeq) return;
    // An ask is answered by the next word about it, whatever that word says.
    // The opening's answer carries no dice, so a mark left standing through it
    // survived into the first turn — and the dice the clock threw there looked
    // like ones we had asked for, and went unshown. Every turn after it was
    // fine, which is what made it look like a fault of the first turn.
    if (!state.dice) weAsked = false;
    // The clock starts again on every word from the server, since every word
    // is the server starting it again.
    // Anchored to the server's own stamp rather than to the moment this board
    // heard about it. The two boards sit down at different times and would
    // otherwise be counting from different places — one of them showing a
    // number while the other had already run out, for the same turn.
    const counting = runningClock(state);
    // The moment the wait began, which the server keeps apart from the moment
    // it last wrote. Read off the write, a minute started over every time
    // anything at all was said about the match — so reloading the page at the
    // fifty-eighth second bought a fresh minute, and a chair emptying opposite
    // handed one to somebody who had not moved.
    const from = counting && counting.from !== null
      ? counting.from
      : (state.clockFrom?.toMillis?.() ?? state.updatedAt?.toMillis?.() ?? Date.now());
    clockUntil = counting ? from + counting.seconds * 1000 : 0;
    clockWhich = counting ? counting.which : null;
    showClock();
    game.phase = state.phase;
    game.pos = unpackServerPosition(state.pos);
    game.turn = state.turn;
    game.dice = state.dice ?? null;
    game.remaining = (state.remaining ?? []).slice();
    game.required = state.required ?? 0;
    game.played = 0;
    game.history = [];
    // A turn with no dice on it yet is a turn waiting to be thrown, whoever's
    // it is. Locally startTurn says so; here the server does. Only the empty
    // case may be written: this flag means "a throw is in the air", and
    // setting it because the server has numbers is setting it before anything
    // has been thrown — which is exactly what stopped the other player's dice
    // from ever being thrown on this board.
    if (state.phase === "play" && !state.dice) thrown = false;
    // Two equal opening dice: the server clears both and asks for them again
    // from the top. The board did not know that had happened and still thought
    // it was holding the throw it had already made — so nothing could be picked
    // up on the side that threw first, and the other player's die, waiting for
    // a clear hand before it could be shown, was never shown either.
    // The opening is over: the pair goes back to the middle together, the one
    // that was waiting off the board along with it.
    if (wasOpening && state.phase === "play") { resetDice(); openingStands = true; }
    if (state.dice || state.lastBy) openingStands = false;
    // Passed over on the bar: the server hands the turn back rather than
    // spending one on a throw that cannot be played, and says who it was so
    // both boards can account for the turn that went by without anything
    // happening on it.
    if (state.skipped) {
      announce(state.skipped === HUMAN ? "shut.you" : "shut.them", SHUT_OUT_MS);
    }
    // The next game of a match arrives already in play, with the turn on
    // whoever won the last one — there is no opening to watch, so the moment
    // the result goes is the moment the pair has to be back in the middle.
    const restarted = !!game.over && !state.over;
    game.over = state.over ?? null;
    if (game.over) setTimeout(showResult, 1100);
    // Only one of the two presses "another game"; the other finds out here,
    // and the box in front of them has to come down by itself. The dice go
    // back to where they sit before a throw for the same reason.
    else if (!resultBox?.hasAttribute("hidden")) { resultBox?.setAttribute("hidden", ""); resetDice(); }
    // The board that pressed took its own box down and would otherwise be left
    // with the dice where the last throw of the last game put them.
    else if (restarted) resetDice();
    // Their dice, thrown here so they can be seen landing rather than simply
    // appearing. The numbers are the server's; the tumble is found the same
    // way ours is.
    // Only while the opening is still the opening. The write that ends it is
    // caught by the branch at the bottom of this function, which shows the die
    // and then waits for it — asking again from in here is asking a second
    // time about a throw that has already been shown, and the board that lost
    // the opening watched the winner's die cross the felt twice.
    // Before the panel is written rather than after: it is what decides that
    // their number is not on the panel yet, and written afterwards the number
    // went up in the readout for as long as it took the next word to arrive.
    if (state.opening && state.phase === "opening") showOpening(state);
    // Two equal opening dice. Nothing is cleared and nothing is swept: the one
    // who threw second throws again, over their own number, and the board says
    // so. Announced once per throw of the opening, since the tie stands on the
    // match until it is broken and every later word about the match carries it.
    // Said after the die it is about has been asked for above, and held back
    // until it has landed here: a tie is the two numbers being equal, so
    // saying it while one of them is still crossing the felt gives the throw
    // away before it can be watched.
    const tied = state.phase === "opening" && state.opening
      && state.opening.ivory != null && state.opening.ivory === state.opening.black;
    const tieAt = Math.max(state.openingAt?.black ?? 0, state.openingAt?.ivory ?? 0);
    if (tied && tieAt !== shownTieAt) {
      shownTieAt = tieAt;
      const waiting = state.waitingOn;
      const say = () => announce(waiting === HUMAN ? "open.tieYou" : "open.tieThem");
      if (openingHidden) pendingTie = say; else say();
    }
    renderPieces();
    updateHud();
    if (state.phase === "opening" || !state.dice) return;
    // A turn's dice, on the other hand, are only worth showing while they are
    // still the turn's dice.
    //
    // Whose they are does not decide whether they need throwing here — whether
    // this board asked for them does. Ours, asked for and thrown by hand, are
    // on their way and want nothing. Ours, thrown by the clock because we were
    // too slow, were never asked for, and without this the numbers appear on
    // the panel with no die having moved.
    const oursInHand = state.turn === HUMAN && weAsked;
    if (oursInHand) { weAsked = false; seenThrowSeq = state.lastThrowSeq ?? 0; }
    if (oursInHand || throwSeen) return;
    seenThrowSeq = state.lastThrowSeq ?? 0;
    replayThrow(state.turn, state.dice, () => remoteSeq !== state.seq);
  };

  // Something they played since we last looked: watch it happen, then take
  // the server's word for where the board ended up. Who played it has to be
  // asked rather than worked out from whose turn it is — a game is won on the
  // winner's own turn and the turn stays with them, so reading it off the turn
  // had the winner watching their own winning moves played back at them in the
  // other colour, which is not a thing the rules allow and left the board
  // stuck half way through with no result ever shown.
  // Moves worth watching are the ones this board did not make. Theirs always,
  // and ours when the clock made them for us: we played nothing that turn, so
  // there is nothing in hand and nothing was ever seen to move — the checkers
  // simply arrived where the server said they were. Our own turn, played here
  // by hand, has been watched already and wants no second showing, and it is
  // told apart by what is in hand for it rather than by whose name is on it.
  const echoed = state.lastBy === HUMAN && weCommitted;
  if (echoed) weCommitted = false;
  // None of it on the first word. A board that has just sat down is not owed
  // the last turn played out in front of it, nor the pause the opening is
  // given: it is being shown where the game has got to, all at once.
  const unseen = !firstWord && !seenBefore && state.lastMoves?.length && state.lastBy && !echoed;
  if (unseen) playRemoteTurn(state.lastBy, state.lastMoves, settle);
  // The opening is decided by two dice and it is worth seeing them decide it.
  // The server settles both in one write, so without this the second die lands
  // and the board is swept in the same breath — the throw that chose who goes
  // first was over before it could be read. Their die is thrown here, and the
  // game does not start until it has come to rest and been left there a while.
  else if (!firstWord && wasOpening && state.phase === "play") {
    if (state.opening) showOpening(state);
    holdTheOpening(settle);
  }
  else settle();
}

// The turn is handed over through the session rather than taken over directly.
// Locally that is granted at once; against a server it is the moment the moves
// are sent and the reply waited for, which is why the board is left alone until
// the answer comes back.
function endTurn() {
  if (!turnComplete() || game.over || !isHuman(game.turn)) return;
  const played = game.history.flatMap(step => step.moves ?? []);
  const handingOver = game.turn;
  handedOver = true;
  weCommitted = true;
  session.commitTurn(played).then(reply => {
    handedOver = false;
    if (!reply?.ok || game.over || game.turn !== handingOver) return;
    startTurn(Rules.other(handingOver));
    updateHud();
  }).catch(reason => {
    // The server would not have the turn: it was already played, the match is
    // finished, or the connection went in the middle of it. The board cannot
    // stay where the refused moves left it, so it goes back to how it stood
    // when the turn began and waits to be told the truth.
    console.info("tavla: tur kabul edilmedi —", reason?.message ?? reason);
    handedOver = false;
    weCommitted = false;
    const start = game.history[0];
    if (start) {
      game.pos = start.pos;
      game.remaining = start.remaining;
      game.played = start.played;
    }
    game.history = [];
    renderPieces();
    updateHud();
  });
}

// Back to the door. A game in progress is worth a question first, and the
// cleanest way back is to load the page again — the door then asks for a
// table and a colour from scratch rather than reopening on stale choices.
// The code this table answers to, beside the board for as long as it is being
// played at. It is the way back into this game if either of them drops out, so
// it is not something to be looked up when it is already too late to look
// anything up: it is simply there, being read, before it is ever needed.
const codePanel = document.querySelector("#table-code");

// Offered to whoever is still sitting there while the chair opposite is empty.
// The minute runs down on its own and closes the table at the end of it; this
// is for somebody who has already decided they are not waiting out the rest.
const endButton = document.querySelector("#end-table");
endButton?.addEventListener("click", () => { endButton.disabled = true; leaveTable(); });

const menuButton = document.querySelector("#menu");
const confirmBox = document.querySelector("#confirm");
const closeConfirm = () => confirmBox?.setAttribute("hidden", "");

// Getting up from an online table. The seat is only remembered here, so
// forgetting it is the whole of leaving as far as this browser is concerned —
// the door then opens on the lobby rather than straight back into the match.
// What the other player sees when somebody walks off is the server's business
// and is not built yet.
function leaveTable() {
  const leaving = matchId ?? localStorage.getItem(MATCH_KEY);
  // Answered at once. Between pressing Çık and the page coming back there is a
  // second or two of a board that looks exactly as it did, and with the box
  // gone and nothing said in its place the press looked like it had missed.
  closeConfirm();
  awayUntil = 0;
  if (leaving) announce("table.leaving", 4000);
  sessionStorage.removeItem("tavla.sitOnLoad");
  localStorage.removeItem(MATCH_KEY);
  // Said out loud, because getting up closes the table. A game across a
  // network is two people, and one of them leaving on purpose does not leave
  // a game behind for the computer to finish — the other board is told by the
  // record going.
  //
  // Not waited on for long. The door is where this player is going whatever
  // the answer, and a slow line is no reason to keep them at a game they have
  // already left.
  // Waited on properly. It used to be raced against a second and a half, on
  // the grounds that the door is where this player is going whatever the
  // answer — but reloading the page cancels the request that is still in the
  // air, and the first call to a server that has been idle takes several
  // seconds to wake it. So getting up went unsaid, and the other board sat
  // there being told its opponent's connection had dropped and a minute was
  // being held for somebody who had walked off on purpose. It worked whenever
  // the server happened to be warm, which is what made it look like chance.
  //
  // Written down first, so that even a page that goes before the answer comes
  // back leaves something behind for the next one to finish — see below.
  if (leaving) localStorage.setItem(LEAVING_KEY, leaving);
  const said = leaving
    ? ask("masayiBirak", { matchId: leaving })
        .then(() => localStorage.removeItem(LEAVING_KEY))
        .catch(() => {})
    : Promise.resolve();
  // Not for ever: a line that never answers must not strand somebody at a board
  // they have left. Ten seconds covers a server being woken from cold.
  Promise.race([said, new Promise(done => setTimeout(done, 10000))])
    .then(() => location.reload());
}

// Long enough to read before the board goes back to the door.
const CLOSED_SHOWN_MS = 5000;
let tableGone = false;

// The table gone out from under the board. The server deletes a match as its
// last player leaves, so the record simply stops being there — and that is the
// only word about it there is going to be. Nothing on this board can be played
// any more, and a board that looks playable and is not is worse than one that
// says so: it is said plainly, and then the door.
function tableClosed(by) {
  if (tableGone) return;
  tableGone = true;
  // Nobody is being waited for any more: whatever was counting down opposite
  // stops here, or it would go on writing over the one line that matters.
  awayUntil = 0;
  // Two boards hear the same silence when a table goes, but they are not in
  // the same position and must not be told the same thing. A board that has
  // been counting down an empty chair knows perfectly well who left; a board
  // that has this second come back through the code — and found the table
  // closed behind it, on its own second absence — knows nothing of the kind,
  // and was being told its opponent had walked off.
  // Who closed it, if the server managed to say so before the record went.
  // Failing that, a board that has been counting down an empty chair knows
  // perfectly well who left; a board that has this second come back through
  // the code knows nothing of the kind, and was being told its opponent had
  // walked off when the opponent was itself.
  const theirDoing = by ? by !== HUMAN : opponentGone;
  announce(theirDoing ? "table.left" : "table.closed", CLOSED_SHOWN_MS);
  setTimeout(() => {
    sessionStorage.removeItem("tavla.sitOnLoad");
    localStorage.removeItem(MATCH_KEY);
    location.reload();
  }, CLOSED_SHOWN_MS);
}

menuButton?.addEventListener("click", () => confirmBox?.removeAttribute("hidden"));
document.querySelector("#confirm-no")?.addEventListener("click", closeConfirm);
document.querySelector("#confirm-yes")?.addEventListener("click", leaveTable);
confirmBox?.addEventListener("click", event => {
  if (event.target === confirmBox) closeConfirm();
});
addEventListener("keydown", event => {
  if (event.key === "Escape") closeConfirm();
});

// On a phone or a tablet the back button is the way out of everything, and
// here it was the way out of the game: one press and the board was gone, mid
// throw, with nothing asked. It cannot be refused outright — a page may not
// hold somebody against their will, and browsers are right about that — but a
// spare entry can be put on the history when the board opens. The first press
// then spends that entry and comes back here as a popstate instead of leaving
// the page; the question is asked and the entry put back, so the press after
// it is caught too. Pressing back again with the question already up takes it
// as Vazgeç, which is what a back button ought to mean.
//
// Only where there is a back button to press. A desktop's is a browser
// control rather than a thumb's reflex, and quietly disarming it is not this
// game's business.
function guardBack() {
  if (!HANDHELD) return;
  history.pushState({ tavla: "masa" }, "");
}

addEventListener("popstate", () => {
  if (!HANDHELD || !intro.classList.contains("hidden")) return;
  guardBack();
  if (confirmBox?.hasAttribute("hidden")) confirmBox.removeAttribute("hidden");
  else closeConfirm();
});

// The end of a game is not the end of the match, so it asks: another game, or
// out. There is no third way out of this one — no backdrop click and no
// Escape — because the board behind it is finished and has nothing to go back
// to.
const resultBox = document.querySelector("#result");
const resultTitle = document.querySelector("#result-title");
const resultScore = document.querySelector("#result-score");
const resultNext = document.querySelector("#result-next");

const scoreLine = () => mode === "hotseat"
  ? `${nameOf(HUMAN)} ${match[HUMAN]} · ${nameOf(COMPUTER)} ${match[COMPUTER]}`
  : `${t("you")} ${match[HUMAN]} · ${t("opponent")} ${match[COMPUTER]}`;

function showResult() {
  if (!resultBox || !game.over) return;
  const { winner, value } = game.over;
  const took = matchWinner();
  const said = mode === "hotseat"
    ? t("result.wonHot", { name: nameOf(winner) })
    : t(winner === HUMAN ? "result.won" : "result.lost");
  resultTitle.textContent = took
    ? (mode === "hotseat" ? t("result.matchWonHot", { name: nameOf(took) })
        : t(took === HUMAN ? "result.matchWon" : "result.matchLost"))
    // What the game was worth, said beside the word that decided it: the mars
    // that doubled it, or the win that did not.
    : said + t(value === 2 ? "result.mars" : "result.plain");
  // And underneath, only the thing the panel does not already show. The score
  // is up there in the corner throughout; repeating it here left the one line
  // nobody knows — how many it takes to win the match — buried in the middle
  // of a row of numbers.
  resultScore.textContent = took
    ? t("result.final", { score: scoreLine() })
    : t(value === 1 ? "result.line1" : "result.line", { target: MATCH_TARGET });
  resultNext.textContent = t(took ? "result.newMatch" : "result.next");
  resultBox.removeAttribute("hidden");
}

// A new game on the same table: the board is laid out again and the dice go
// back where they were sitting before the first throw. A match that has been
// won starts over from nothing.
function nextGame() {
  resultBox?.setAttribute("hidden", "");
  if (session.online) {
    // A won match is not played on: the server will not lay the board out a
    // fourth time, so the way on from here is up from the table.
    if (matchWinner()) return leaveTable();
    session.nextGame().catch(reason =>
      console.info("tavla: yeni oyun kurulamadı —", reason?.message ?? reason));
    return;
  }
  // A match that has been won starts over from nothing, opening die and all.
  // One that is still running carries on: the winner of the game just finished
  // starts the next one rather than throwing for it again.
  const took = matchWinner();
  const starter = took ? null : (game.over?.winner ?? null);
  if (took) match = { ivory: 0, black: 0 };
  resetState(starter);
  resetDice();
  renderPieces();
  // Which also puts the dice in whoever's hand it is — including the
  // computer's, since nothing else is going to throw for it.
  if (starter) startTurn(starter);
  updateHud();
}

resultNext?.addEventListener("click", nextGame);
document.querySelector("#result-quit")?.addEventListener("click", leaveTable);

// The second camera, from the board rather than from the door. Its label is
// what pressing it does, not where you are.
const viewButton = document.querySelector("#view");

// On a wide window these two sit where they belong: the camera beside the
// score it reads with, the way out in the far corner away from everything. A
// phone has no far corner — the panel already runs the width of it, and both
// of them land on top of the score. So they come down and join the row that is
// already there, either side of Geri al and Tamam.
const controls = document.querySelector("#controls");
const rail = document.querySelector("#rail");
const app = document.querySelector("#app");
let stacked = null;

function placeButtons() {
  // The short side, not the width: a phone on its side is nearly nine hundred
  // points wide and still has no corner to spare.
  const narrow = Math.min(innerWidth, innerHeight) <= 600;
  if (narrow === stacked) return;
  stacked = narrow;
  if (narrow) {
    // On a phone there is no edge to stand a column against: the buttons come
    // down into the row along the bottom, beside Geri al and Tamam.
    controls?.prepend(viewButton);
    controls?.append(menuButton);
    if (fullButton) controls?.append(fullButton);
    if (soundButton) controls?.append(soundButton);
  } else {
    // The rail down the left, in the order they are reached for: the way out,
    // the screen, the sound, and the camera last — it is the one that belongs
    // to the game rather than to the room, and it used to sit in the panel
    // beside the score for exactly that reason. It comes over here so that
    // everything pressable is in one place and the panel is only read.
    rail?.append(menuButton);
    if (fullButton) rail?.append(fullButton);
    if (soundButton) rail?.append(soundButton);
    rail?.append(viewButton);
  }
}

placeButtons();
addEventListener("resize", placeButtons);

viewButton?.addEventListener("click", () => {
  chosenView = overhead() ? "koltuk" : "tepe";
  localStorage.setItem(VIEW_KEY, chosenView);
  fitCamera();
  nudgeCanvas();
  updateHud();
});

const doneButton = document.querySelector("#done");
const undoButton = document.querySelector("#undo");
doneButton?.addEventListener("click", endTurn);
undoButton?.addEventListener("click", undoMove);

// A line across the middle of the table for things that need saying rather
// than showing — a broken roll, mostly.
const noticeBox = document.querySelector("#notice");
let noticeText = "";
function notice(text) {
  if (!noticeBox || text === noticeText) return;
  noticeText = text;
  noticeBox.textContent = text;
  noticeBox.classList.toggle("visible", !!text);
}

// The opening, a die each with a name against it: two people round one device
// are named, and across a network or against the computer it is you and them.
function openingLine() {
  // A number nobody has watched land here is not on the table yet.
  const shown = colour => (openingHidden === colour ? null : game.opening[colour]);
  const mine = shown(HUMAN), theirs = shown(COMPUTER);
  if (mine == null && theirs == null) return "—";
  const [ours, others] = mode === "hotseat"
    ? [nameOf(HUMAN), nameOf(COMPUTER)]
    : [t("you"), t("opponent")];
  return `${ours} ${mine ?? "—"} · ${others} ${theirs ?? "—"}`;
}

function updateHud() {
  const [side, roll, score] = hud.querySelectorAll("strong");
  // The score and the camera stand whatever else the panel is saying, so they
  // are written before any of the branches below get a chance to return.
  if (score) score.textContent = scoreLine();
  if (viewButton) viewButton.textContent = t(overhead() ? "view.seat" : "view.top");
  // Said on the root so the stylesheet can answer it. Overhead the board is
  // taller on the screen than it is from the chair — it fills the window top to
  // bottom — and the panel across the top was landing on the far rail. It goes
  // down the left there instead, the same shape a phone on its side has used
  // since #152. Set from here because this is the one function every path to a
  // changed view already goes through: the camera button, a change of mode, a
  // game being laid out.
  document.documentElement.classList.toggle("tepe", overhead());
  if (side) {
    const mars = game.over && game.over.value === 2 ? t("mars") : "";
    if (!game.over && game.cocked) {
      const who = thrower() || game.turn;
      side.textContent = isHuman(who)
        ? (mode === "hotseat" ? t("turn.cockedHot", { name: nameOf(who) }) : t("turn.cocked"))
        : t("turn.cockedWait");
      if (roll) roll.textContent = "—";
      if (doneButton) doneButton.disabled = true;
      if (undoButton) undoButton.disabled = true;
      notice(t(isHuman(who) ? "notice.cocked" : "notice.cockedWait"));
      return;
    }
    if (!game.over && game.phase === "opening") {
      side.textContent = game.waitingOn === null ? "…"
        : isHuman(game.waitingOn)
          ? (mode === "hotseat"
              ? t("turn.openHot", { name: nameOf(game.waitingOn) }) : t("turn.openThrow"))
          : t("turn.openWait");
      if (roll) roll.textContent = openingLine();
      if (doneButton) doneButton.disabled = true;
      if (undoButton) undoButton.disabled = true;
      return;
    }
    // The opening is settled but nothing has been thrown for the turn yet:
    // the two dice stay on the panel with their names against them, and the
    // one they gave the game to is said outright rather than left to be
    // worked out from which of the numbers is bigger.
    if (openingStands && !game.over && game.phase === "play" && !game.dice && !thrown
        && game.opening[HUMAN] != null && game.opening[COMPUTER] != null) {
      side.textContent = mode === "hotseat"
        ? t("open.startsHot", { name: nameOf(game.turn) })
        : t(game.turn === HUMAN ? "open.youStart" : "open.theyStart");
      if (roll) roll.textContent = openingLine();
      if (doneButton) doneButton.disabled = true;
      if (undoButton) undoButton.disabled = true;
      notice(awayLine());
      return;
    }
    // Whoever's turn it is cannot come in, so the panel does not ask them to
    // throw. It says why, for as long as the turn is theirs.
    if (!game.over && !game.dice && Rules.shutOut(game.pos, game.turn)) {
      side.textContent = mode === "hotseat"
        ? t("turn.shutOutHot", { name: nameOf(game.turn) }) : t("turn.shutOut");
      if (roll) roll.textContent = "—";
      if (doneButton) doneButton.disabled = true;
      if (undoButton) undoButton.disabled = true;
      return;
    }
    side.textContent = game.over
      ? (mode === "hotseat"
          ? t("turn.wonHot", { name: nameOf(game.over.winner) })
          : t(game.over.winner === HUMAN ? "turn.won" : "turn.lost")) + mars
      : game.thinking ? t("turn.thinking")
      // Whose checkers those are has not changed; whose hand is on them has.
      // A player who has been told the computer took over should be able to
      // see it in the one place the panel says who is playing.
      : !isHuman(game.turn) ? t("turn.opponent")
      : mode === "hotseat"
        ? (game.dice ? nameOf(game.turn) : t("turn.hotThrow", { name: nameOf(game.turn) }))
        : t(game.dice ? "turn.you" : "turn.youThrow");
  }
  // While the computer is still covering for us the line stays up, because
  // the board looks exactly as it would if we had the table and nothing we do
  // to it has any effect. News comes and goes; this is a condition.
  notice(awayLine() || (performance.now() < newsUntil ? t(newsWord, newsFill) : ""));
  if (roll && !game.dice) roll.textContent = "—";
  if (undoButton) {
    undoButton.disabled = !game.history.length || !!game.over ||
      !isHuman(game.turn) || game.thinking;
  }
  if (doneButton) {
    // A throw still in the air has not been read yet. Across a network the
    // numbers come from the server the moment they are asked for — a second or
    // two before the dice they name come to rest on this felt — so a button
    // written from the numbers announced the result while the dice were still
    // tumbling. "No move to play" lit up early, and the throw was plainly
    // decided before it landed.
    const inTheAir = thrown || replayOwed || !!replayingFor || !!heldDice;
    doneButton.disabled = inTheAir || !turnComplete() || !!game.over;
    doneButton.textContent = t(!inTheAir && game.dice && game.required === 0 ? "done.none" : "done");
  }
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
// A carried checker rides above the walls, not through them. At the height of
// the playing surface plus a bit it cut into the wall whenever it was dragged
// out to an edge, and you saw the checker sliced open by it.
const CARRY_Y = CASE_TOP + .3;
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
  // die turns at something like three to six revolutions a second.
  return new THREE.Vector3(
    (Math.random() - .5) * 2,
    (Math.random() - .5) * 2,
    (Math.random() - .5) * 2
  ).normalize().multiplyScalar(20 + Math.random() * 16);
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

  // Two seconds in the hand and they go, whether or not the finger has come
  // off them. Holding on used to keep them there for as long as you liked,
  // which made every throw a different length and let somebody sit on the
  // dice; now the shake is the same two seconds for everybody, in every mode,
  // and letting go early does not shorten it either.
  if (elapsed >= MIN_SHAKE_MS && !heldDice.launching) {
    heldDice.launching = true;
    launchDice();
  }
}

// The frame loop is the natural place to fire the throw, but on a machine
// that is only managing a frame every second or two the dice would sit in the
// hand well past the shake. A timer armed when they are picked up keeps the
// throw on time regardless; whichever gets there first wins.
function armThrow() {
  const remaining = MIN_SHAKE_MS - (performance.now() - heldDice.startedAt);
  const token = heldDice;
  setTimeout(() => {
    if (heldDice === token && !heldDice.launching) {
      heldDice.launching = true;
      launchDice();
    }
  }, Math.max(0, remaining));
}

// The board is twelve columns of felt, each shared by a point in the near row
// and one in the far row, and a throw runs the length of a column. So the open
// ground is a column with nothing standing in it, and there is usually more
// than one — the throw takes any of the emptiest at random, which is what
// keeps it from being the same throw twice.
function openLane() {
  const load = new Map();
  for (let point = 1; point <= 24; point++) {
    const stack = game?.pos.points[point];
    const x = POINTS[point].x;
    load.set(x, (load.get(x) ?? 0) + (stack ? stack.count : 0));
  }
  let least = Infinity, open = [];
  for (const [x, standing] of load) {
    if (standing < least) { least = standing; open = [x]; }
    else if (standing === least) open.push(x);
  }
  if (!open.length) return -MIRROR * 2;
  return open[Math.floor(Math.random() * open.length)];
}

// Fling the pair away across the board, fast.
// The computer throws from the other side of the table, so the aim is the
// one thing that differs between its throw and yours.
// It lets go over an empty column rather than over a fixed spot: with no hand
// behind it the throw runs almost straight down the table, so whichever lane
// it starts in is roughly the lane it stops in — 97 of 100 dice measured
// stopped on the side they started from. Left as it was, every roll of its
// landed in the same corner, and on a full column at that.
function throwDice(towards) {
  const anchor = new THREE.Vector3(openLane() + (Math.random() - .5) * .5,
    LIFT_Y, towards > 0 ? -4 : 4);
  heldDice = {
    anchor: anchor.clone(),
    last: anchor.clone(),
    lastT: performance.now(),
    startedAt: performance.now(),
    released: true,
    vel: new THREE.Vector3(),
    swirl: 0,
    towards,
    entries: diceInHand(thrower() || COMPUTER).map((die, i) => {
      const st = die.userData.die;
      st.mode = "held";
      st.vel.set(0, 0, 0);
      st.spin.set(0, 0, 0);
      st.still = 0;
      return {
        die,
        radius: .26 + i * .04,
        phase: i * Math.PI + Math.random() * .6,
        shakeSpin: randomShakeSpin(),
        reroll: .18 + Math.random() * .22,
      };
    }),
  };
  armThrow();
}

// A throw has to come out as the numbers the session named, and it has to get
// there by rolling. Forcing a die round once it has stopped is the one thing
// that would look wrong, so instead the tumble is chosen to suit the answer:
// throws are simulated with different launches until one of them lands on the
// pair, and that is the one the player sees.
//
// It costs about three milliseconds a try here and a pair comes up roughly one
// try in twenty four, so the search is sliced across frames while the dice are
// still being shaken — there are two seconds of that to hide it in — and the
// state it searched from is put back the moment they leave the hand. The dice
// are tumbling by then, so a frame's worth of jump in where they sit is not
// something anybody sees.
const SEARCH_TRIES = 400;
// Five milliseconds of a sixty-a-second frame is a third of the search done
// every second, which finishes a throw inside the shake. On a machine limping
// along at a frame every second or two that same five would take the search
// into the minutes, so it is given a share of whatever the frame is actually
// costing instead — a quarter of it, capped, so a slow machine spends longer
// per frame but does not spend the whole of one.
const SEARCH_SHARE = .25, SEARCH_FLOOR_MS = 5, SEARCH_CEILING_MS = 250;
// What the session asked for, kept from the moment the dice leave the hand
// until they have stopped. The tumble that was chosen lands on it — but the
// throw is replayed rather than the searched run itself being shown, and about
// one throw in a hundred the replay comes out somewhere else. The numbers the
// game plays with cannot be left to that, so what settles is checked against
// what was asked and corrected if it has drifted.
let wanted = null;
let simulating = false;
let pending = null;

// Deterministic, so a launch can be set up twice and come out identical.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shakeSpinFrom(rand) {
  return new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5)
    .normalize().multiplyScalar(20 + rand() * 16);
}

function diceSnapshot(dice) {
  return dice.map(die => ({
    die,
    position: die.position.clone(),
    quaternion: die.quaternion.clone(),
  }));
}

function restoreDice(snapshot) {
  for (const { die, position, quaternion } of snapshot) {
    die.position.copy(position);
    die.quaternion.copy(quaternion);
  }
}

// Everything about the launch that is not the aim: how hard, how much scatter,
// how high, how fast it tumbles.
function armLaunch(dice, aim, seed) {
  const rand = seeded(seed);
  const shot = aim.clone().setLength(52 + rand() * 16);
  for (const die of dice) {
    // Which way up it leaves the hand is part of the throw. A die let go from
    // one fixed pose does not land on all six faces equally often — searching
    // from a single pose took fifteen tries to find a face that should take
    // four — and a die being shaken is not in a fixed pose anyway.
    die.quaternion.premultiply(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2)));
    const s = die.userData.die;
    s.mode = "throw";
    // Enough scatter that they do not fly in formation and land in a stack.
    s.vel.copy(shot).add(new THREE.Vector3((rand() - .5) * 12, 0, (rand() - .5) * 12));
    // Thrown up and out of the hand, not rolled off the fingertips.
    s.vel.y = 7 + rand() * 7;
    s.spin.copy(shakeSpinFrom(rand)).clampLength(30, 54);
    s.still = 0;
    s.cocked = false;
    s.offContact = 0;
    // Every field the stopping test reads, so a launch set up twice from the
    // same pose comes out the same both times. Leaving this one behind was
    // enough to make one throw in sixty replay differently from the search
    // that chose it.
    s.touching = false;
  }
}

// The sound of a throw, at the moment the dice actually leave the hand. The
// recording carries the throw and the landing both, so nothing is waited for,
// and whether it is one die or two is read from what actually left — the
// opening is a single die each and sounds like one.
//
// Called from the two places a hand really opens, and deliberately not from
// armLaunch, which would look like the one place to put it: the search that
// finds a tumble matching the named numbers launches the dice hundreds of
// times with nothing drawn and nothing thrown, and a sound down there would
// play the whole search out loud.
const zarSesi = dice => calSes(dice.length > 1 ? "zarCift" : "zarTek");

// One throw played out with nothing drawn, to see where it lands.
function outcomeOf(dice, aim, seed) {
  const debt = physicsDebt;
  simulating = true;
  physicsDebt = 0;
  armLaunch(dice, aim, seed);
  let t = 0;
  while (t < 15 && dice.some(die => die.userData.die.mode !== "rest")) {
    stepDicePhysics(1 / 60);
    t += 1 / 60;
  }
  const faces = dice.map(die => die.userData.die.value);
  const cocked = dice.some(die => die.userData.die.cocked);
  simulating = false;
  physicsDebt = debt;
  return { faces, cocked };
}

// The numbers, in any order, and every die standing flat: a die leaning on a
// wall is a broken roll, and a roll whose numbers were decided in advance
// cannot be one.
function lands(outcome, want) {
  if (outcome.cocked) return false;
  const got = outcome.faces.slice().sort();
  const asked = want.slice().sort();
  return got.length === asked.length && got.every((face, i) => face === asked[i]);
}

function stepSearch(frameDt = 1 / 60) {
  if (!pending) return;
  // What the dice are showing right now, to be put back when this frame's
  // share of the search is done. Every attempt starts them again from the pose
  // the throw will leave from, and leaving them there is what made the shake
  // stop dead for a moment before the dice flew: the hand went on swirling
  // them round but each frame put the tumble back where it began, so they hung
  // there unturning until the search found its throw. Nobody watching that
  // knows the board is looking for anything — they see the dice stop.
  const shown = diceSnapshot(pending.dice);
  const budget = Math.min(SEARCH_CEILING_MS,
    Math.max(SEARCH_FLOOR_MS, frameDt * 1000 * SEARCH_SHARE));
  const until = performance.now() + budget;
  while (pending.tried < SEARCH_TRIES && performance.now() < until) {
    const seed = Math.imul(++pending.tried, 2654435761) ^ pending.salt;
    restoreDice(pending.from);
    if (lands(outcomeOf(pending.dice, pending.aim, seed), pending.want)) {
      pending.seed = seed;
      break;
    }
  }
  restoreDice(shown);
  for (const die of pending.dice) {
    const s = die.userData.die;
    s.mode = "held";
    s.vel.set(0, 0, 0);
    s.spin.set(0, 0, 0);
  }
  if (pending.seed === null && pending.tried < SEARCH_TRIES) return;
  // Out of tries without a match is vanishingly unlikely — one throw in about
  // eighty thousand — but it cannot be allowed to hand the player a roll the
  // session did not name, so the last launch is used and the faces are set.
  pending.exhausted = pending.seed === null;
  pending.ready = true;
}

function launchDice() {
  const hand = heldDice.vel.clone();
  hand.y = 0;
  const towards = heldDice.towards || AWAY;
  // Away from the player's side of the table, with whatever aim the hand had —
  // but only so far. The hand's sideways speed is clamped at 26, and a third
  // of that against a forward component of one aimed the throw up to eighty
  // three degrees off the length of the board, so a sideways flick sent the
  // dice at the rail rather than down the table.
  //
  // Ten degrees, not the twenty that looked like the obvious answer. The board
  // is thirteen units long, so a throw twenty degrees off it walks nearly five
  // units sideways on the way down and arrives at the far end already against
  // the rail — measured over five hundred throws it left more dice resting out
  // there than no clamp at all did, because an unclamped throw at least hits
  // the near wall early and rattles back towards the middle. Ten degrees is
  // short enough that the drift never adds up.
  const CONE = Math.tan(10 * Math.PI / 180);
  const sideways = Math.max(-CONE, Math.min(CONE, hand.x * .3));
  // Around 2 m/s, which is a firm throw rather than a nudge — hard enough to
  // reach the far rail, come back off it and keep tumbling.
  const aim = new THREE.Vector3(sideways, 0, towards).normalize();
  const dice = heldDice.entries.map(entry => entry.die);

  // Off the network, the throw decides. The dice leave the hand as they are,
  // roll where the felt and the walls send them, and whatever they come to
  // rest on is the roll — nothing is named in advance and nothing is searched
  // for, so they go the moment the shake is over.
  //
  // This is only open to a game with one board in it. Two boards across a
  // network have to be looking at the same dice, and the only way that holds
  // is for the numbers to come from the one place both of them are reading.
  if (!session.online && !forcedRoll) {
    thrownDice = dice;
    zarSesi(dice);
    armLaunch(dice, aim, (Math.random() * 0xffffffff) | 0);
    wanted = null;
    heldDice = null;
    thrown = true;
    canvas.style.cursor = "grab";
    showDiceValues();
    return;
  }

  // The numbers first, then a tumble that produces them. Asking for them takes
  // no time locally and a round trip online, and either way the dice carry on
  // being shaken until the answer and a matching throw are both in hand.
  const token = heldDice;
  // Asking is what tells our own throw apart from one made for us. A replay
  // is not asking — it is being told — so it does not count.
  if (!forcedRoll && session.online) weAsked = true;
  const asked = forcedRoll
    ? Promise.resolve(forcedRoll.slice(0, dice.length))
    : session.roll(dice.length);
  forcedRoll = null;
  asked.then(want => {
    if (heldDice !== token) return;
    pending = {
      dice, aim, want,
      // Every die, not just the ones in the hand. A thrown die knocks the
      // other one across the felt, and an attempt that starts from where the
      // last attempt left it is not the throw that was searched for.
      from: diceSnapshot(diceMeshes),
      salt: (Math.random() * 0xffffffff) | 0,
      tried: 0, seed: null, ready: false, exhausted: false,
    };
  }).catch(reason => {
    // The server would not name a roll: the turn moved on, the match is over,
    // the connection went. Whatever it was, the dice must not be left shaking
    // in a hand that is never going to open — they go back to the felt and the
    // player may try again once the board has caught up.
    console.info("tavla: zar istenemedi —", reason?.message ?? reason);
    if (heldDice !== token) return;
    pending = null;
    resetDice();
    canvas.style.cursor = "grab";
  });
}

// The moment a matching throw is in hand, the dice leave it.
function releasePending() {
  if (!pending?.ready) return;
  const { dice, aim, seed, want } = pending;
  // Which dice actually left the hand. A roll is those and nothing else —
  // asking the board again once they have landed gives the wrong answer when
  // a single opening die comes to rest after the server has already ended the
  // opening, because by then the board says both dice are in play.
  thrownDice = dice;
  zarSesi(dice);
  restoreDice(pending.from);
  armLaunch(dice, aim, seed ?? Math.imul(pending.tried, 2654435761));
  wanted = want;
  pending = null;
  heldDice = null;
  thrown = true;
  canvas.style.cursor = "grab";
  showDiceValues();
}

// A ten millimetre die on a phone is under seven pixels across, and a
// fingertip covers forty. Asking for a hit on the die itself is asking to be
// lucky, so a throw may be started from near one instead — near enough that
// the finger was plainly reaching for it.
//
// Nothing else on the board wants that tap: the dice can only be picked up
// when it is your turn to throw, and until they have been thrown there is no
// roll to play, so no checker will move either. The reach is generous for a
// finger and tight for a mouse, which does not need the help.
const GRAB_REACH = { touch: 44, pen: 30, mouse: 14 };

function withinReach(event, allowed) {
  if (!allowed) return null;
  const rect = canvas.getBoundingClientRect();
  const reach = GRAB_REACH[event.pointerType] ?? GRAB_REACH.mouse;
  let nearest = null, closest = reach;
  const seen = new THREE.Vector3();
  for (const die of diceMeshes) {
    if (die.userData.die.mode !== "rest" || offTable(die)) continue;
    seen.copy(die.position).project(camera);
    const away = Math.hypot(
      (seen.x + 1) / 2 * rect.width + rect.left - event.clientX,
      (1 - seen.y) / 2 * rect.height + rect.top - event.clientY);
    if (away < closest) { closest = away; nearest = die; }
  }
  return nearest;
}

canvas.addEventListener("pointerdown", (e) => {
  // Left button only — the other buttons should not move anything.
  if (e.button !== 0) return;
  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);

  // Dice sit on top of everything, so they get first claim on the pointer.
  // Grabbing either one scoops up the whole pair.
  // The die waiting off the board is not there to be picked up.
  const reachable = game.phase === "opening" ? [diceMeshes[0]] : diceMeshes;
  const dieHit = raycaster.intersectObjects(reachable, false);
  // Not while the other player's throw is being shown. The opening ends and
  // the first turn begins in the same write, so the moment their opening die
  // is let go of across the felt it is already somebody's turn to throw — and
  // taking the dice up then takes both of them, that one included, on a board
  // that has been told it is holding a pair the server has never named.
  const canThrow = !replayingFor && !replayOwed && (game.phase === "opening"
    // Nobody being waited on means the opening is over bar the looking, and
    // two people round one device count as human whoever is asked — so
    // without the first half of this, a hand could reach in during the pause
    // and pick a die back up off the settled opening.
    ? !!game.waitingOn && isHuman(game.waitingOn)
    : isHuman(game.turn) && !game.dice && !Rules.shutOut(game.pos, game.turn));
  const reached = dieHit.length ? dieHit[0].object : withinReach(e, canThrow);
  if (reached && !heldDice && canThrow && !game.over) {
    const anchor = pointerOnPlane(liftPlane, new THREE.Vector3())
      || reached.position.clone().setY(LIFT_Y);
    heldDice = {
      anchor: anchor.clone(),
      last: anchor.clone(),
      lastT: performance.now(),
      startedAt: performance.now(),
      released: false,
      byHand: true,
      // Away from whoever is throwing, not away from the seat. With two people
      // round one tablet the second of them sits opposite, so their throw
      // crosses the board towards the first — the same aim the computer uses,
      // because it is sitting in that chair.
      towards: thrower() === HUMAN ? AWAY : -AWAY,
      vel: new THREE.Vector3(),
      swirl: 0,
      entries: diceInHand(thrower()).map((die, i) => {
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
    // Armed the moment they are picked up rather than when they are let go
    // of: two seconds is two seconds whether or not the finger comes off.
    armThrow();
    showDiceValues();
    return;
  }

  // While the dice are in the hand the pointer belongs to them, and it stays
  // theirs after the release — a throw is armed but does not fire until the
  // shake has run its two seconds. A press during that window used to fall
  // through to here and lift a checker, and then the release went to the dice
  // branch above and returned early, so the drag was never closed: a checker
  // hanging off the cursor with its point still counting it as lifted, and
  // the next release dropping it wherever the pointer happened to be.
  if (heldDice) return;

  // A ray against an instanced object comes back with a seat number rather
  // than a thing, so which checker was hit is looked up rather than read off.
  const hits = raycaster.intersectObjects([checkerSets.ivory, checkerSets.black], false);
  if (!hits.length) return;
  const hit = hits[0];
  const seat = seatOfInstance[hit.object === checkerSets.ivory ? "ivory" : "black"][hit.instanceId];
  // Drawn but not in play: a checker already borne off, sitting outside the
  // wall. There is nothing to pick up there.
  if (!seat) return;
  const key = seat.pointKey;
  if (seat.colour !== game.turn || !isHuman(game.turn)) return;

  // Only a checker with somewhere legal to go can be picked up. Lifting one
  // that cannot move and dropping it back is a move you did not make.
  const from = key === barKey(game.turn) ? "bar" : Number(key);
  if (!movesNow().some(m => String(m.from) === String(from))) return;

  // Lift the top checker off the point and carry it under the cursor, so the
  // move is visible while it is happening.
  game.lifted = { key };
  const carried = new THREE.Mesh(checkerGeometry, game.turn === "ivory" ? ivory : black);
  carried.castShadow = true;
  carried.position.copy(seat.position).setY(CARRY_Y);
  scene.add(carried);

  dragging = { fromKey: key, from, mesh: carried };
  canvas.setPointerCapture?.(e.pointerId);
  canvas.style.cursor = "grabbing";
  renderPieces();
});

addEventListener("pointermove", (e) => {
  wake();
  if (!heldDice && !dragging) return;
  setPointerFromEvent(e);

  if (dragging) {
    const target = pointerOnPlane(carryPlane, new THREE.Vector3());
    if (target) dragging.mesh.position.copy(target);
    return;
  }

  // Only dice in a hand follow that hand. The computer picks its own up and
  // shakes them where it is sitting, and moving the mouse over the table while
  // it does that was dragging them around after the cursor.
  if (!heldDice.byHand) return;

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
    // Carried past the wall it comes off by is an attempt to bear off. On a
    // desktop that is the end wall past the home boards — both of them are on
    // the same side of the board, and which side of the screen that is depends
    // on which colour is being played. In the hand it is the near rail, the
    // one the checkers are being carried towards anyway.
    const past = OFF_TO_THE_SIDE
      ? hit.x * MIRROR > FIELD_HALF_X
      : hit.z * offEdge(game.turn) > FIELD_HALF_Z;
    if (past) {
      game.lifted = null;
      tryMove(dragging.from, "off");
      scene.remove(dragging.mesh);
      dragging = null;
      canvas.style.cursor = "grab";
      renderPieces();
      updateHud();
      return;
    }
    // The bar is not somewhere you can put a checker down — one only ever
    // arrives there by being hit — and leaving it in this search made it a
    // target with an enormous catchment. Its anchor sits in the middle of the
    // board, nearer to the tip half of the two points either side of it than
    // those points' own anchors are, so a checker dropped on the inner end of
    // them walked itself out to the middle instead of landing where it was
    // put. The drop resolves to one of the twenty-four points, and only those.
    let bestKey = null, bestDist = Infinity;
    for (const key in POINTS) {
      if (key === "barW" || key === "barB") continue;
      const p = POINTS[key];
      const d = (p.x - hit.x) ** 2 + (p.z - hit.z) ** 2;
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    game.lifted = null;
    if (bestKey) tryMove(dragging.from, Number(bestKey));
  } else {
    game.lifted = null;
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
  game.lifted = null;
  scene.remove(dragging.mesh);
  dragging = null;
  canvas.style.cursor = "grab";
  renderPieces();
});

// The cloth, darkened towards its edges. Painted into the corners of the mesh
// rather than into the texture: the weave stays as crisp as the photograph is,
// nothing extra is read per pixel, and the fall-off is smooth because the
// surface is divided finely enough to carry it. What it buys is a picture that
// ends rather than one that runs out — the board sits in the middle of a lit
// table instead of on a lit floor with black edges.
function clothPlane(size, divisions) {
  const geometry = new THREE.PlaneGeometry(size, size, divisions, divisions);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const reach = size / 2;
  for (let i = 0; i < position.count; i++) {
    const away = Math.hypot(position.getX(i), position.getY(i)) / reach;
    // Full brightness out to a third of the way, then down to almost nothing
    // at the rim. Squared, so the darkening starts gently and finishes fast.
    const lit = 1 - .93 * Math.min(1, Math.max(0, (away - .28) / .62)) ** 2;
    colours[i * 3] = colours[i * 3 + 1] = colours[i * 3 + 2] = lit;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

function addRoom() {
  // The cloth the board stands on. It used to be a plane the colour of soot,
  // and on a phone that is half the screen: a board with nothing under it, and
  // an eye that reads the whole picture as darker than it is because most of
  // what it can see is black. A table under it fixes the look and the darkness
  // at the same time, and costs one texture read on pixels that were already
  // being drawn.
  const cloth = new THREE.MeshStandardMaterial({
    color: HANDHELD ? 0x2a2f38 : 0x050301, roughness: HANDHELD ? .92 : .95,
    vertexColors: HANDHELD });
  const floor = new THREE.Mesh(HANDHELD ? clothPlane(80, 24) : new THREE.PlaneGeometry(80, 80), cloth);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.25;
  floor.receiveShadow = true;
  scene.add(floor);
  // Loaded rather than drawn, and loaded late: the board does not wait on it,
  // and until it arrives the cloth is the flat colour underneath.
  if (HANDHELD) {
    new THREE.TextureLoader().load(`./doku/${CLOTH.file}`, map => {
      map.colorSpace = THREE.SRGBColorSpace;
      // Mirrored rather than repeated: a photograph of cloth has no reason for
      // its left edge to meet its right, and butting them together drew a grid
      // of seams across the table. Turned over at each join there is nothing to
      // meet — and a weave this fine has no direction for the eye to catch the
      // turn by.
      map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
      map.repeat.set(CLOTH.tile, CLOTH.tile);
      map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      cloth.map = map;
      // The colour multiplies the weave rather than replacing it.
      cloth.color.setHex(CLOTH.tint ?? 0xffffff);
      cloth.needsUpdate = true;
      wake();
    }, undefined, () => {});
  }

  // Even coverage across the board, but still directional on each surface.
  // Flooding it equally from four sides did make every corner the same
  // brightness — and flattened every piece, because a 1mm dish only shows up
  // as a shadow, and a shadow needs a dominant light direction. So the key
  // carries most of the level and comes in low enough to rake across the
  // relief; the fills only open the shadows.
  // The key turns with the chair. It is the only light in the room with a
  // direction anybody can feel — the four fills are a symmetric set and the
  // hemisphere and the ambient have no direction at all — and it used to stand
  // over one particular side of the table. Sitting down opposite put it across
  // the board instead of over your shoulder: the shadows fell towards you
  // rather than away, and the dish in the face of a checker read as a dome.
  // Taking the seat to the other end is a half turn about the middle of the
  // table, so the light takes the same half turn and arrives over the same
  // shoulder whichever colour you play.
  const key = new THREE.DirectionalLight(0xfff4e2, 2.5);
  keyLight = key;
  key.position.set(6 * AWAY, 10, -6 * AWAY);
  key.castShadow = true;
  // Half the map in the hand: a texel is 0.9 mm across the board instead of
  // 0.46, which is under the width of the softening already applied to the
  // edge, and the second pass costs a quarter of what it did. A phone was
  // paying for the full map — four megapixels of it, drawn from the light's
  // side — at the same time as it was being told it could not afford its own
  // screen.
  const shadowPixels = HANDHELD ? 1024 : 2048;
  key.shadow.mapSize.set(shadowPixels, shadowPixels);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = .02;
  key.shadow.radius = 3;
  // Wide enough to take in the cloth around the board, not only the board. The
  // shadow it throws onto the table is what makes the board stand on something
  // rather than float above it — and it was falling outside the map and being
  // dropped. A third more ground for the same number of texels, which on a
  // board this size is a millimetre of softening nobody will find.
  const reach = HANDHELD ? 18 : 13;
  key.shadow.camera.left = -reach;
  key.shadow.camera.right = reach;
  key.shadow.camera.top = reach;
  key.shadow.camera.bottom = -reach;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  scene.add(key);
  lightCount++;

  // And its mirror image across the board, for the seat view in the hand: the
  // same lamp — same colour, same strength — hung over the other far corner,
  // so the board is lit from both top corners rather than one.
  //
  // It throws no shadow of its own. A second caster is a second drawing of the
  // whole board made from its side, on every frame anything moves, and what it
  // buys is a second shadow under every checker at an opposing angle — light
  // from both corners with one set of shadows reads as a lit room, two sets
  // read as a mistake. The light is what this lamp is for.
  if (HANDHELD) {
    keyMate = key.clone();
    keyMate.castShadow = false;
    // Its shadow was taking light out of the room as well as putting shape
    // into it, so dropping the shadow lifted the whole board by 4%. The lamp
    // gives back what its shadow was taking: 1.95 against the key's 2.5 lands
    // the seat view on 76.4, which is where it was when both lamps cast.
    keyMate.intensity = 1.95;
    scene.add(keyMate);
    lightCount++;
  }

  // Quadrant fills keep the corners of the board level with the middle, but
  // stay well under the key so they do not cancel its shading.
  //
  // Four of them in the hand is four lights evaluated at every pixel of the
  // board for what the eye reads as one soft lift off the corners. One does
  // the same job: from the side rather than overhead — straight down washes
  // the surface flat, since the board is being looked straight down at — and
  // at a third again of what the four came to between them, which is what it
  // takes to land on the same brightness. Measured rather than guessed: the
  // screen comes out at 68.31 against the four lights' 68.23.
  // One of them lifts the board as well as four did — looked at from overhead.
  // From the seat the single fill comes from one side only, so the near half
  // of the board is left to the key alone and reads dark. A second one facing
  // it costs a light rather than three, and the seat view comes up 4.8%.
  const corners = HANDHELD ? [[1, 0], [-1, 0]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const lift = BOARD.room.fill * (HANDHELD ? 4 * 1.3 : 1);
  corners.forEach(([x, z]) => {
    const fill = new THREE.DirectionalLight(0xeef1f4, lift);
    fill.position.set(x * 11, 7, HANDHELD ? 11 : z * 11);
    scene.add(fill);
    lightCount++;
  });

  // Just enough lift to keep the darks open rather than crushed.
  scene.add(new THREE.HemisphereLight(0xdfe7ee, 0x40301f, BOARD.room.hemi));
  scene.add(new THREE.AmbientLight(0xfff6e8, BOARD.room.ambient));
}

addRoom();
// The light knows which of the two views it is lighting; the view was taken
// before there was a light to tell.
aimKey();
addBoard();
resetState();
renderPieces();
DICE_HOME.forEach(([x, z, face]) => dice(x, z, face));
// Now that they exist, they can be put where the opening wants them.
resetDice();
showDiceValues();
// The dice on the table at the start are scenery, not a roll: the game waits
// for you to pick them up and throw them.
updateHud();

// The board is nearly square and the window is not. Rather than frame it for
// one shape and cut it off in every other, the camera backs away along the
// line it already looks down until the whole case is inside the frame. A
// phone held upright ends up further back than a desktop window does, and the
// board is small there, but all twenty-four points are on the screen and can
// be played.
function fitCamera() {
  camera.aspect = innerWidth / innerHeight;
  takeSeat();
  const direction = camera.position.clone().sub(CAMERA_AIM);
  const base = direction.length();
  direction.normalize();
  // How much of the frame the case is allowed to fill. From overhead the board
  // is looked at rather than along, so it needs no room for its own depth and
  // can sit closer to the edges.
  // A phone is tall and the board is wide, so the seat view backs off until
  // the case fits across the screen and then leaves two thirds of the height
  // empty. What has to be on the screen is the playing field — every point and
  // the bar; the outer rail can run off the edge, since nothing is ever played
  // on it. Fitted to that instead, and with the margin taken in, the board
  // comes 12% closer: 41.3 units back becomes 37.0, and the field goes from
  // 86% of the frame's width to 97%. Overhead and the desktop are untouched.
  const snug = HANDHELD && !overhead();
  const fill = overhead() ? .99 : snug ? .995 : .94;
  const halfX = snug ? FIELD_HALF_X : CASE_HALF_X;
  const halfZ = snug ? FIELD_HALF_Z : CASE_HALF_Z;

  const corners = [];
  for (const x of [-halfX, halfX]) {
    for (const y of [CASE_BOTTOM, CASE_TOP]) {
      for (const z of [-halfZ, halfZ]) corners.push(new THREE.Vector3(x, y, z));
    }
  }

  // The seat sits at a fixed distance and this only ever backed away from it,
  // so a screen with room to spare kept the board at arm's length: turned
  // sideways, the case was using 87% of the height and half the width and the
  // camera never moved. From the seat it may now come in as well as go out —
  // the same test decides when to stop either way.
  //
  // The overhead stays where it was put. Coming closer costs it more than it
  // gains: from above, a shorter throw is a wider angle at the edges of the
  // frame, and the inside faces of the outer walls come into view. Sideways
  // that took the rail from 56 pixels to 68 — the board itself only grew 9% —
  // and a thick dark border round the felt is what the board is read against.
  for (let step = snug ? -15 : 0; step < 60; step++) {
    camera.position.copy(CAMERA_AIM).addScaledVector(direction, base * (1 + step * .04));
    camera.lookAt(CAMERA_AIM);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    let widest = 0, tallest = 0;
    for (const corner of corners) {
      const seen = corner.clone().project(camera);
      widest = Math.max(widest, Math.abs(seen.x));
      tallest = Math.max(tallest, Math.abs(seen.y));
    }
    if (widest <= fill && tallest <= fill) break;
  }

  // Aimed at the middle of the table, which is not the middle of what ends up
  // on the screen: the near half of the board is closer to the camera than the
  // far half, so it projects larger and the whole thing sits low in the frame.
  // Turned sideways that came to a twentieth of the screen's height — the near
  // rail off the bottom edge and a band of cloth left over at the top. The
  // aim is lifted until what is drawn is centred on what is looked at.
  if (!HANDHELD) return;
  const aim = CAMERA_AIM.clone();
  for (let pass = 0; pass < 8; pass++) {
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    let top = -Infinity, bottom = Infinity;
    for (const corner of corners) {
      const seen = corner.clone().project(camera);
      top = Math.max(top, seen.y);
      bottom = Math.min(bottom, seen.y);
    }
    const off = (top + bottom) / 2;
    if (Math.abs(off) < .004) break;
    // How much of the world a half-frame covers at the distance being looked
    // at: that is what one unit of the projection is worth in board units.
    const half = camera.position.distanceTo(aim) * Math.tan(camera.fov * Math.PI / 360);
    aim.y += off * half;
  }
  // Two people round one tablet share the overhead, since a seat leaned from
  // either side is the wrong way up for the other. From straight up the board
  // reads small, so it is brought a tenth closer here — the checkers come up
  // without the camera favouring a side. What is let go for it is the case
  // edge, not the felt: the outer rail carries no play, so it can run past the
  // frame while every point stays on the screen.
  //
  // Only turned sideways, though. Held upright the board is already fitted to
  // the narrow width with room to spare above and below, and coming closer
  // there eats into the very edges the fit was protecting rather than the
  // spare height. So the tenth is taken only in landscape, where the width is
  // what is left over and the case edge is what can be spent.
  if (overhead() && innerWidth > innerHeight) {
    camera.position.sub(aim).multiplyScalar(1 / 1.10).add(aim);
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }
}

fitCamera();


// A readout, for a phone that cannot be plugged into anything. Off unless it is
// asked for by name in the address — ?fps — because it is an instrument and not
// part of the game. It says the two numbers that only mean anything together:
// how many frames a second, and how much of the screen is actually being drawn.
// A soft board at sixty and a sharp one at twenty are the same machine on two
// different rungs, and either number on its own cannot tell you which.
// A phone cannot be plugged into anything, so it has to be able to say what it
// is doing out loud. ?tani puts the numbers that decide whether a black screen
// is a camera pointing at nothing, a canvas that was never drawn, or a driver
// that has given up — on the screen, where they can be photographed.
const SHOWING_DIAG = /[?&]tani\b/.test(location.search);
let diagBox = null;
if (SHOWING_DIAG) {
  diagBox = document.createElement("div");
  diagBox.id = "tani";
  diagBox.style.cssText = "position:fixed;z-index:9;left:.4rem;bottom:4.6rem;padding:.35rem .5rem;"
    + "font:500 .6rem/1.35 monospace;color:#cfe3ff;background:rgba(0,0,0,.72);"
    + "border-radius:.3rem;pointer-events:none;white-space:pre;max-width:92vw;";
  document.body.appendChild(diagBox);
}

// Asked once a second at most: reading it is a round trip to the driver.
let glHata = 0, glSorulan = 0;
// And what the frame actually came out as. A screen that looks black is either
// a frame drawn black or a frame drawn properly and never shown, and from the
// page those two are the same picture — unless the buffer itself is read back.
let bufferMean = -1;
const bufferPixels = new Uint8Array(16 * 16 * 4);
function readBuffer() {
  const gl = renderer.getContext();
  if (gl.isContextLost()) { bufferMean = -1; return; }
  const w = renderer.domElement.width, h = renderer.domElement.height;
  if (!w || !h) { bufferMean = -2; return; }
  renderer.setRenderTarget(null);
  gl.readPixels(Math.max(0, (w >> 1) - 8), Math.max(0, (h >> 1) - 8), 16, 16,
    gl.RGBA, gl.UNSIGNED_BYTE, bufferPixels);
  let sum = 0;
  for (let i = 0; i < bufferPixels.length; i += 4) {
    sum += .2126 * bufferPixels[i] + .7152 * bufferPixels[i + 1] + .0722 * bufferPixels[i + 2];
  }
  bufferMean = +(sum / (bufferPixels.length / 4)).toFixed(1);
}
// A frame that was drawn and came back black. Everything the page can see says
// the board is there: the camera is where it should be, eighty-seven draw calls
// went out with fifty-seven thousand triangles behind them, the context is
// healthy, no shader failed and no frame threw. Read back on a phone that shows
// it, the middle of that frame is nought; read back with the same numbers on
// another machine, it is lit. What is between the two is a driver handing back
// a surface it never painted, and the page has no argument to make with it.
//
// What the page can do is stop using that surface. Resizing the buffer takes a
// new one, which is the one thing that has been seen to bring the picture back
// — the same move the camera button makes.
//
// Read rarely and only off a frame that was actually drawn: asking for pixels
// back stalls until the GPU has caught up, and a frame that was skipped may
// have been cleared behind us, which would read black and mean nothing. Twice
// in a row before acting, and a handful of tries in a session — a board that
// stays black after that is not one more surface away from working.
const WATCH_MS = 2500;
const WATCH_DARK = 1.5;
const WATCH_STRIKES = 2;
const WATCH_TRIES = 5;
let watchAt = 0, watchStrikes = 0, watchTries = 0;
function watchForBlack(now, drew) {
  if (!HANDHELD || !drew || contextLost) return;
  // A few frames in, so the first ones — drawn while the textures are still
  // being built — are not judged. Kept small: a still board is drawn twice a
  // second on purpose, so a large count here would be minutes of black before
  // anything was tried.
  if (watchTries >= WATCH_TRIES || drawnFrames < 8) return;
  if (now - watchAt < WATCH_MS) return;
  watchAt = now;
  readBuffer();
  // Not an answer: the buffer could not be read at all.
  if (bufferMean < 0) return;
  if (bufferMean > WATCH_DARK) { watchStrikes = 0; return; }
  if (++watchStrikes < WATCH_STRIKES) return;
  watchStrikes = 0;
  watchTries++;
  console.info("tavla: kare siyah geldi — yüzey yenileniyor");
  nudgeCanvas();
}

function showDiag(drawn) {
  if (!diagBox) return;
  const now = performance.now();
  if (now - glSorulan > 1000) {
    glSorulan = now;
    const err = renderer.getContext().getError();
    if (err) glHata = err;
    readBuffer();
  }
  const p = camera.position;
  const look = new THREE.Vector3();
  camera.getWorldDirection(look);
  const gl = renderer.getContext();
  diagBox.textContent = [
    `kamera ${overhead() ? "tepe" : "koltuk"}  ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`,
    `bakış ${look.x.toFixed(2)},${look.y.toFixed(2)},${look.z.toFixed(2)}  fov ${camera.fov}`,
    `tuval ${canvas.width}x${canvas.height}  dpr ${renderer.getPixelRatio().toFixed(2)}`,
    `ekran ${innerWidth}x${innerHeight}  çizilen ${drawn}`,
    `bağlam ${contextLost ? "KAYIP" : gl.isContextLost() ? "KAYIP" : "sağlam"}`,
    `ışık ${lightCount}  gölge ${renderer.shadowMap.enabled ? "açık" : "kapalı"}`,
    // What the last frame actually did. Nothing drawn is a different fault
    // from everything drawn onto a screen that is not being shown.
    `çizim ${renderer.info.render.calls}  üçgen ${renderer.info.render.triangles}`,
    `program ${renderer.info.programs?.length ?? "?"}  hata ${glHata}`,
    `tamponun ortası ${bufferMean}`,
    // The one line worth photographing when the board has gone black and the
    // page has not: whether a frame threw on the way, and what it said.
    `düşen kare ${drawnErrors}${drawError ? " · " + drawError.slice(0, 90) : ""}`,
  ].join("\n");
}

const SHOWING_FPS = /[?&]fps\b/.test(location.search);
let fpsBox = null, fpsFrames = 0, fpsSince = 0;
if (SHOWING_FPS) {
  fpsBox = document.createElement("div");
  fpsBox.style.cssText = "position:fixed;z-index:9;left:.5rem;top:.5rem;padding:.35rem .55rem;"
    + "font:500 .68rem/1.45 monospace;color:#e5ad54;background:rgba(0,0,0,.62);"
    + "border-radius:.3rem;pointer-events:none;white-space:pre;";
  document.body.appendChild(fpsBox);
}

// Counted over the loop's own turns rather than over the frames it chose to
// draw. In the hand a still board is drawn twice a second on purpose, and a
// readout that turned that into "2 fps" reads as the machine failing rather
// than as the panel working. What the loop manages is the number anybody
// asking "is it smooth" wants.
function showFps(now) {
  if (!fpsBox) return;
  fpsFrames++;
  if (!fpsSince) { fpsSince = now; return; }
  if (now - fpsSince < 500) return;
  const fps = Math.round(fpsFrames * 1000 / (now - fpsSince));
  fpsFrames = 0;
  fpsSince = now;
  // Two lines, which is what the two questions need: is the machine keeping up,
  // and is it drawing the screen it has. Everything else that was here — the
  // triangle count, the card's name, the heap — answered questions nobody was
  // asking while looking at a board.
  fpsBox.textContent = `${fps} fps`;
}

// Whether anything on the table is in the middle of moving. Everything that
// moves is one of these: a throw being searched for, dice in the air, a checker
// in the hand or crossing the board.
const moving = () => !!pending || !!heldDice || !!sliding || !!dragging
  || diceMeshes.some(die => die.userData.die.mode !== "rest");

const clock = new THREE.Clock();
function animate(now) {
  // The next frame is asked for before anything that could go wrong, and this
  // is the whole point of the line being here rather than at the bottom. A
  // frame that throws — a driver that gives up in the middle of a draw, a step
  // that meets a state nobody wrote it for — used to take the loop down with
  // it, once and for the rest of the session. What that leaves is exactly the
  // thing a phone gets reported for: the page still works, the panel still
  // says whose turn it is, the buttons still press — and the board is a black
  // rectangle, because nothing is drawing it any more and the compositor
  // cleared what was left. Caught here, the same fault costs one frame.
  requestAnimationFrame(animate);
  try {
    const dt = Math.min(clock.getDelta(), .25);
    // Before the shake, so what is drawn is the shake and not the last frame of
    // whatever the search was trying.
    stepSearch(dt);
    releasePending();
    stepHeldDice(dt);
    stepSlide(dt);
    stepDicePhysics(dt);
    const at = now ?? performance.now();
    const busy = moving();
    const draw = !ON_DEMAND || busy || needsFrame || shadowsDirty
      || at - lastDrawn > HEARTBEAT_MS;
    // Not onto a surface that has been taken away. Drawing into a lost context
    // is at best thrown away and at worst throws, and the frame is owed to us
    // again anyway: what is asked for now is asked for again the moment there
    // is something to draw on.
    if (draw && !contextLost) {
      renderer.shadowMap.needsUpdate = shadowsDirty || busy;
      shadowsDirty = false;
      needsFrame = false;
      lastDrawn = at;
      drawnFrames++;
      renderer.render(scene, camera);
    }
    // Counted over the frames that were actually drawn, and only while there is
    // something to draw. Idling at two frames a second is the panel working, not
    // the machine failing, and a readout that said "2 fps" over a still board
    // would be read as the second thing.
    showFps(at);
    showDiag(drawnFrames);
    watchForBlack(at, draw && !contextLost);
  } catch (reason) {
    // Kept rather than counted: the first one is the one that explains the
    // rest, and sixty a second of the same line is not a diagnosis. It goes on
    // the readout too, because the machine this happens on is a phone that
    // cannot be plugged into anything — the fault has to be photographable.
    drawnErrors++;
    if (!drawError) {
      drawError = reason?.message ?? String(reason);
      console.error("tavla: çizim karesi düştü —", reason);
    }
  }
}
animate();

addEventListener("resize", () => {
  wake();
  fitCamera();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // A window dragged onto a bigger screen has to be weighed against the budget
  // again, so this goes through the same choice the first frame did.
  applySampleRatio();
});

// The moments a phone hands the page a different drawing surface: going into
// fullscreen or coming out of it, being turned over, being come back to. What
// is left after one of those is a canvas drawing onto something the screen is
// no longer showing — the board goes black, or a frame arrives half old and
// half new and tears across.
//
// The cure was already written for the one place it had been noticed: taking a
// new surface by resizing the buffer a pixel and back, which is what
// nudgeCanvas does. But it was only ever wired to the camera button, which is
// where the fault happened to be found — not to any of the events that
// actually change the surface. So the board was mended on the one press nobody
// makes when it goes wrong, and left alone on the three that cause it.
//
// Twice, because the window has not finished changing shape at the instant the
// event arrives: once now for the common case, once after it has settled.
const RESURFACE_MS = 350;
let resurfacing = 0;
function resurface() {
  nudgeCanvas();
  clearTimeout(resurfacing);
  resurfacing = setTimeout(() => { fitCamera(); nudgeCanvas(); }, RESURFACE_MS);
}
document.addEventListener("fullscreenchange", resurface);
document.addEventListener("webkitfullscreenchange", resurface);
addEventListener("orientationchange", resurface);
screen.orientation?.addEventListener?.("change", resurface);
// A tab come back to may have had its surface taken while it was away, and
// bfcache hands the page back whole — including a canvas bound to a surface
// that is gone.
document.addEventListener("visibilitychange", () => { if (!document.hidden) resurface(); });
addEventListener("pageshow", resurface);

