// Oyunun sesleri — Web Audio ile, kodla üretilir. Hiçbir ses dosyası yoktur:
// her ses anında çizilir, bu yüzden önbelleğe alınacak bir şey yok ve oyun
// çevrimdışıyken de sesli çalar. Her şey isteğe bağlıdır; tarayıcıda ses yoksa
// ya da kapalıysa çağrılar sessizce hiçbir şey yapmaz, oyun aksamaz.
//
// Tarayıcılar sesi ilk kullanıcı hareketine dek bloklar, o yüzden bağlam ilk
// dokunuşta açılır (unlock). Ondan önceki hiçbir ses duyulmaz — zaten oynamaya
// başlamadan çıkacak bir ses de yoktur.

const KEY = "tavla.ses";
let ctx = null;
let master = null;
let noise = null;
let muted = localStorage.getItem(KEY) === "kapali";

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  // Bir saniyelik beyaz gürültü: zar takırtısının hammaddesi. Bir kez üretilir,
  // her patlama ondan bir dilim çalar.
  const n = ctx.sampleRate;
  noise = ctx.createBuffer(1, n, n);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// İlk kullanıcı hareketinde çağrılır; bağlamı açar ya da askıdan alır.
export function unlock() {
  const c = ensure();
  if (c && c.state === "suspended") c.resume();
}

export function setMuted(value) {
  muted = !!value;
  localStorage.setItem(KEY, muted ? "kapali" : "acik");
  if (master) master.gain.value = muted ? 0 : 0.7;
}

export function isMuted() { return muted; }

// Kısa gürültü patlaması: bir band-pass süzgeçten geçirilir, hızla söner. Zar
// çarpışmalarının ve tahta seslerinin ortak yapıtaşı.
function burst(freq, q, gain, decay, when = 0) {
  const c = ctx, t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0006, t + decay);
  src.connect(bp).connect(env).connect(master);
  src.start(t);
  src.stop(t + decay + 0.02);
}

// Kısa ton: tahta "tok"u ve kazanma akorunun notaları.
function tone(freq, gain, decay, type = "triangle", when = 0) {
  const c = ctx, t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

// Zar takırtısı. Şiddet, çarpışmanın hızından gelir (fizik çözücü verir);
// çift zarın birbirine değmesi tahtaya değmesinden daha parlak ve keskindir.
export function dice(intensity = 1, pair = false) {
  if (!ensure() || muted || ctx.state !== "running") return;
  const s = Math.max(0, Math.min(1, intensity));
  const gain = 0.10 + s * 0.16;
  if (pair) {
    burst(2400 + Math.random() * 700, 5, gain, 0.055);
    tone(320 + Math.random() * 90, gain * 0.5, 0.045, "square");
  } else {
    burst(1300 + Math.random() * 500, 2.2, gain, 0.085);
    tone(160 + Math.random() * 50, gain * 0.6, 0.07, "triangle");
  }
}

// Taşın tahtaya konması: yumuşak, alçak bir tahta toku.
export function place() {
  if (!ensure() || muted || ctx.state !== "running") return;
  tone(150 + Math.random() * 30, 0.22, 0.09, "triangle");
  tone(85, 0.16, 0.11, "sine");
  burst(1800, 1.5, 0.05, 0.03);
}

// Taş kırma: daha keskin, iki tıkırtılı — bir taş bara gönderildi.
export function hit() {
  if (!ensure() || muted || ctx.state !== "running") return;
  burst(2600, 4, 0.16, 0.05);
  tone(240, 0.14, 0.06, "square");
  burst(2000, 3, 0.11, 0.05, 0.045);
}

// Kazanma. Küçük bir çıkan arpej; mars daha dolu ve bir nota fazladır. Kaybeden
// taraf için (solo/çevrimiçi) daha yumuşak, inen iki nota.
export function win(mars = false, happy = true) {
  if (!ensure() || muted || ctx.state !== "running") return;
  if (!happy) {
    tone(392, 0.16, 0.35, "triangle");
    tone(294, 0.16, 0.5, "triangle", 0.14);
    return;
  }
  const notes = mars ? [392, 494, 587, 784] : [392, 523, 659];
  notes.forEach((f, i) => {
    tone(f, 0.16, mars ? 0.5 : 0.4, "triangle", i * 0.11);
    tone(f / 2, 0.06, 0.4, "sine", i * 0.11);
  });
}

// Arayüz tıkırtısı: çok hafif, kısa bir tık.
export function tap() {
  if (!ensure() || muted || ctx.state !== "running") return;
  tone(660, 0.05, 0.03, "sine");
}
