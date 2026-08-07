// The music.
//
// Fourteen pieces, oud and ney and darbuka, played in the order they were
// given. It is the foreground: the board's own noises — a checker set down, a
// die landing — sit under it rather than over it, which is the opposite of how
// a game usually mixes and is what was asked for. See SES_SEVIYESI in ses.js.
//
// An <audio> element rather than Web Audio, which is the other way round from
// the sound effects, and for the opposite reason. A checker sound is four
// kilobytes and has to land on a frame, so it is decoded once and kept in
// memory. A piece of music is five megabytes and has to start playing before
// it has finished arriving — that is streaming, and an audio element is the
// thing that streams. Decoding one of these into memory would cost fifty
// megabytes of it per track and still not start any sooner.

const KOK = "muzik/";
const SAYI = 14;

// Kimin çaldığı görünsün diye: dosyalar sırayla numaralı, adlar burada.
export const PARCALAR = [
  { dosya: "01.mp3", ad: "Oud and Night" },
  { dosya: "02.mp3", ad: "Vibecroft · Arabic R&B" },
  { dosya: "03.mp3", ad: "Alex Morgan · Ramadan" },
  { dosya: "04.mp3", ad: "Desi Free Music" },
  { dosya: "05.mp3", ad: "Djovan · Desert Veil" },
  { dosya: "06.mp3", ad: "Djovan · Four Wedding Dances" },
  { dosya: "07.mp3", ad: "Djovan · Harmony of Morocco" },
  { dosya: "08.mp3", ad: "Djovan · Night in Marrakech" },
  { dosya: "09.mp3", ad: "Djovan · Sahara Sunset" },
  { dosya: "10.mp3", ad: "FASSounds · Arabic Ramadan" },
  { dosya: "11.mp3", ad: "Kaazoom · Cairo Midnight" },
  { dosya: "12.mp3", ad: "Kaazoom · Shattered Strings" },
  { dosya: "13.mp3", ad: "Sounds by Amelia · Ancient Egypt" },
  { dosya: "14.mp3", ad: "The Mountain · Oud" },
];

const SEVIYE = 0.85;
// Bir parçadan diğerine geçerken kısa bir kısılma. Sert kesme, ud tellerinin
// ortasında bıçak gibi duyuluyor.
const SONUS_MS = 450;

const PARCA_ANAHTARI = "tavla.muzikParca";
const CALIYOR_ANAHTARI = "tavla.muzikCaliyor";

let ses = null;
let sira = Number(localStorage.getItem(PARCA_ANAHTARI));
if (!Number.isInteger(sira) || sira < 0 || sira >= SAYI) sira = 0;
let caliyor = false;
let izleyen = null;

export const caliyorMu = () => caliyor;
export const suanki = () => PARCALAR[sira];

// Çalar durumu her değiştiğinde arayüz haber alsın.
export function izle(geriCagir) { izleyen = geriCagir; bildir(); }
const bildir = () => izleyen?.({ caliyor, parca: PARCALAR[sira], sira });

function kur() {
  if (ses) return ses;
  ses = new Audio();
  ses.preload = "none";
  ses.volume = SEVIYE;
  // Tek parça bitince sıradaki. Liste bitince başa — müzik sürekli çalacak.
  ses.addEventListener("ended", () => { ilerle(1); });
  // Bir dosya gelmezse durup kalmasın, sıradakine geçsin. Ondördü birden
  // bozulmadıkça müzik devam eder; hepsi bozuksa sessizce durur.
  ses.addEventListener("error", () => {
    if (!caliyor) return;
    if (++hata >= SAYI) { caliyor = false; hata = 0; bildir(); return; }
    ilerle(1);
  });
  ses.addEventListener("playing", () => { hata = 0; });
  return ses;
}

let hata = 0;

function yukle(calsinMi) {
  const a = kur();
  // Durdurulup öyle değiştiriliyor. Çalan bir öğeye yeni bir kaynak vermek
  // bekleyen play()'i iptal ediyor ve tarayıcı bunu AbortError diye geri
  // veriyor — bir hata değil, "o çalma isteğinin yerini yenisi aldı" demek.
  // Duraklatmak o sözü baştan doğurmuyor.
  a.pause();
  // Ve indirmesine izin veriliyor. Eleman preload="none" ile kuruluyor, çünkü
  // hiçbir şey basılmadan önce beş megabaytın inmeye başlaması istenmiyor —
  // ama o ayar açık kaldığında kaynak seçimi bir kez askıya alınıp orada
  // kalıyor: kaynak veriliyor, play() çağrılıyor, eleman duraklamamış
  // görünüyor, ve hiç yüklenmiyor. Tarayıcıya niyet artık belli: yükle.
  //
  // load() ise açıkça çağrılıyor, çünkü kaynak atandığında seçim algoritması
  // bu satırda değil bir sonraki turda koşuyor — play() ondan önce varıyor ve
  // henüz kaynağı olmayan bir elemana sesleniyor.
  a.preload = "auto";
  a.src = KOK + PARCALAR[sira].dosya;
  a.load();
  localStorage.setItem(PARCA_ANAHTARI, String(sira));
  if (calsinMi) oynat();
  bildir();
}

function oynat() {
  const a = kur();
  a.volume = SEVIYE;
  const sozu = a.play();
  sozu?.catch(sebep => {
    // İki ayrı cevap, ve ayırt edilmeleri şart.
    //
    // AbortError, bu çalma isteğinin yerini bir yenisinin aldığı anlamına
    // geliyor — ileri ya da geri basıldığında olan tam olarak budur, ve o an
    // müzik çalmaya devam ediyordur. Bunu "çalamadı" sayan ilk hâli, her parça
    // değişiminde çaları sessizce kapalıya düşürüyordu: düğme çalıyor
    // görünüyor, durdura basınca duracağına baştan başlıyordu.
    //
    // NotAllowedError ise gerçek cevap: tarayıcı dokunuş görmedi. Çalar kapalı
    // görünür ve kullanıcı yeniden basar.
    if (sebep?.name === "AbortError") return;
    caliyor = false;
    bildir();
    console.info("tavla: müzik başlatılamadı —", sebep?.message ?? sebep);
  });
}

// Parçalar arası geçişte kısa bir kısılma, sonra yeni parça.
function ilerle(yon) {
  sira = (sira + yon + SAYI) % SAYI;
  yukle(caliyor);
}

export function baslat() {
  caliyor = true;
  localStorage.setItem(CALIYOR_ANAHTARI, "1");
  const a = kur();
  // Aynı parçaya geri dönüldüyse kaldığı yerden devam etsin; kaynağı yeniden
  // atamak onu başa sarardı.
  if (!a.src) yukle(true); else oynat();
  bildir();
}

export function durdur() {
  caliyor = false;
  localStorage.setItem(CALIYOR_ANAHTARI, "0");
  if (!ses) { bildir(); return; }
  // Yumuşak kapanış: sert kesme, çalan bir udun ortasında bıçak gibi duyuluyor.
  const baslangic = ses.volume;
  const basladi = performance.now();
  const kis = () => {
    if (caliyor) return;                       // arada yeniden başlatılmış
    const k = Math.min(1, (performance.now() - basladi) / SONUS_MS);
    if (!ses) return;
    ses.volume = Math.max(0, baslangic * (1 - k));
    if (k < 1) return void requestAnimationFrame(kis);
    ses.pause();
    ses.volume = SEVIYE;
  };
  requestAnimationFrame(kis);
  bildir();
}

export function cevir() { caliyor ? durdur() : baslat(); }
export function sonraki() { ilerle(1); }
export function onceki() {
  // Parçanın başındaysan bir öncekine, ortasındaysan bu parçanın başına —
  // her çalarda böyle, ve çoğu zaman istenen ikincisi.
  if (ses && ses.currentTime > 3) { ses.currentTime = 0; return; }
  ilerle(-1);
}

// Sayfaya girilir girilmez çalsın.
//
// "Hemen" edilebilecek en erken an, sayfaya dokunulan ilk andır. Tarayıcı sesi
// dokunuştan önce vermiyor ve bu bir ayar değil, hepsinde geçerli bir kural —
// dokunuşsuz çağrılan play() reddediliyor. Ama kapıda bir kip seçmek ya da
// oyuna başlamak zaten birer dokunuş, yani pratikte arada bir saniye var.
//
// Dosya da o ana kadar istenmiyor. Eğer buradan yükleseydik, sayfayı açıp
// bakıp kapatan herkes beş megabaytı boşuna indirmiş olurdu — ve telefonda o
// beş megabayt kullanıcının kendi verisi.
//
// Bilerek durdurmuş olan hariç. Durdur düğmesine basmak bir tercihtir ve
// sayfayı yenilemek onu geri almaz; yoksa müziği istemeyen biri her açılışta
// yeniden kapatmak zorunda kalır.
export function hazirla() {
  bildir();
  if (localStorage.getItem(CALIYOR_ANAHTARI) === "0") return;
  // click de dinleniyor: bir düğmeye fareyle basmak zaten pointerdown
  // üretiyor, ama klavyeyle ya da erişilebilirlik araçlarıyla tetiklenen
  // basışlarda ilk gelen click oluyor ve o yol dışarıda kalıyordu.
  const olaylar = ["pointerdown", "touchstart", "keydown", "click"];
  const basla = () => {
    for (const olay of olaylar) removeEventListener(olay, basla, { capture: true });
    if (!caliyor) baslat();
  };
  for (const olay of olaylar) addEventListener(olay, basla, { capture: true, passive: true });
}
