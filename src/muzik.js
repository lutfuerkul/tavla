// The music.
//
// Thirteen pieces, oud and ney and darbuka, played in the order they were
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

// Kimin çaldığı görünsün diye: dosyalar sırayla numaralı, adlar burada.
//
// Numaralar dosya adları, sıra ise bu dizinin kendi sırası — ikisi artık
// birbirini tutmuyor ve tutmasına gerek de yok: on birinci dosya listeden
// çıkarıldı, geri kalanların adı olduğu gibi kaldı. Yeniden numaralamak on üç
// dosyayı birden değiştirmek olurdu, hiçbir şey kazandırmadan.
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
  { dosya: "12.mp3", ad: "Kaazoom · Shattered Strings" },
  { dosya: "13.mp3", ad: "Sounds by Amelia · Ancient Egypt" },
  { dosya: "14.mp3", ad: "The Mountain · Oud" },
];

// Listenin kendi boyu. Ayrı bir sayı olarak duruyordu ve bir parça çıkarılınca
// ikisinin ayrışması işten bile değildi: sıra listenin dışına taşar, kaldığı
// yerden devam eden okuma sınırın ötesini gösterirdi.
const SAYI = PARCALAR.length;

// Müziğin sesi, ve oyunun sesinden bağımsız oluşu. Tahtanın kendi sesleri
// ses.js'te ve kendi seviyeleri var; buradaki düğmeler onlara dokunmuyor.
// Müziği kısıp zarı duymak, ya da tersi, ayrı iki karar.
const SEVIYE_ANAHTARI = "tavla.muzikSes";
const ADIM = 0.1;
const VARSAYILAN = 0.85;

let seviye = (() => {
  // Yazılı bir şey var mı diye önce ona bakılıyor. Doğrudan Number()'a
  // vermek sessizce sıfır veriyor — hiç yazılmamışsa getItem null döner,
  // Number(null) sıfırdır, ve sıfır geçerli bir ses seviyesi olduğu için
  // varsayılan hiç devreye girmiyordu: müzik ilk açılışta sessiz çalıyordu.
  const yazili = localStorage.getItem(SEVIYE_ANAHTARI);
  if (yazili === null || yazili === "") return VARSAYILAN;
  const n = Number(yazili);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : VARSAYILAN;
})();

export const seviyesi = () => seviye;

function seviyeyiYaz() {
  localStorage.setItem(SEVIYE_ANAHTARI, String(seviye));
  if (ses) ses.volume = seviye;
  bildir();
}

export function ac() { seviye = Math.min(1, Math.round((seviye + ADIM) * 100) / 100); seviyeyiYaz(); }
export function kis() { seviye = Math.max(0, Math.round((seviye - ADIM) * 100) / 100); seviyeyiYaz(); }
// Bir parçadan diğerine geçerken kısa bir kısılma. Sert kesme, ud tellerinin
// ortasında bıçak gibi duyuluyor.
const SONUS_MS = 450;

const PARCA_ANAHTARI = "tavla.muzikParca";
const CALIYOR_ANAHTARI = "tavla.muzikCaliyor";
const AN_ANAHTARI = "tavla.muzikAn";

// Kapı sayfayı yeniden yüklüyor. Masa, renk ya da taraf "Otomatik"te olduğunda
// her basışta yazı-tura atılıyor, çıkan değer o anki sahneden farklı oluyor ve
// oyuna geçiş sayfanın baştan yüklenmesiyle oluyor. Sayfa gidince ses öğesi de
// gidiyor: müzik tam oyuna girerken kesiliyordu, ve döndüğünde parçanın başına
// sarıyordu — aynı ezginin ilk on saniyesini her oyunda yeniden dinlemek.
//
// Kaldığı saniye yazılıyor, dönüşte oradan devam ediliyor. Yeniden yükleme bir
// saniye sürüyor, o kadarlık boşluk kalıyor — sayfayı yeniden kurmadan bunu
// sıfırlamanın yolu yok, çünkü çalan sesi bir sayfadan diğerine taşımak
// mümkün değil.
const AN_YAZMA_MS = 4000;
let sonYazma = 0;

function ani_yaz(zorla) {
  if (!ses) return;
  const simdi = performance.now();
  if (!zorla && simdi - sonYazma < AN_YAZMA_MS) return;
  sonYazma = simdi;
  localStorage.setItem(AN_ANAHTARI, String(Math.max(0, ses.currentTime)));
}

const kaldigiAn = () => {
  const n = Number(localStorage.getItem(AN_ANAHTARI));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

let ses = null;
let sira = Number(localStorage.getItem(PARCA_ANAHTARI));
if (!Number.isInteger(sira) || sira < 0 || sira >= SAYI) sira = 0;
let caliyor = false;
let izleyen = null;
// İlk dokunuşu bekleyen dinleyicileri bırakan işlev — hazirla() kurar, ses
// gerçekten çıkınca ya da müzik bilerek durdurulunca çağrılır. Modül düzeyinde,
// çünkü onu bırakması gerekenler hazirla()'nın dışında.
let ilkDokunusuBirak = null;

export const caliyorMu = () => caliyor;
export const suanki = () => PARCALAR[sira];

// Çalar durumu her değiştiğinde arayüz haber alsın.
export function izle(geriCagir) { izleyen = geriCagir; bildir(); }
const bildir = () => izleyen?.({ caliyor, parca: PARCALAR[sira], sira, seviye });

function kur() {
  if (ses) return ses;
  ses = new Audio();
  ses.preload = "none";
  ses.volume = seviye;
  // Tek parça bitince sıradaki. Liste bitince başa — müzik sürekli çalacak.
  ses.addEventListener("ended", () => { ilerle(1); });
  // Bir dosya gelmezse durup kalmasın, sıradakine geçsin. Ondördü birden
  // bozulmadıkça müzik devam eder; hepsi bozuksa sessizce durur.
  ses.addEventListener("error", () => {
    if (!caliyor) return;
    if (++hata >= SAYI) { caliyor = false; hata = 0; bildir(); return; }
    ilerle(1);
  });
  // Sesin gerçekten çıktığı an. Tek doğru haber budur: baslat() bir niyet
  // bildiriyor, play() ise sözünü saniyeler sonra tutuyor ya da tutmuyor. Depo
  // da arayüz de burada yazılıyor, orada değil — yoksa çalmayan bir müzik
  // "çalıyor" görünüyor ve bir dahaki açılışta kaldığı yerden devam etmeye
  // çalışıyor.
  ses.addEventListener("playing", () => {
    hata = 0;
    localStorage.setItem(CALIYOR_ANAHTARI, "1");
    // Beklenen oldu; artık her dokunuşu dinlemeye gerek yok.
    ilkDokunusuBirak?.();
    if (!caliyor) { caliyor = true; bildir(); }
  });
  // Nerede kalındığı arada bir yazılıyor, ve sayfa kapanırken kesinlikle:
  // pagehide, sekme kapanışında da yeniden yüklemede de geliyor.
  ses.addEventListener("timeupdate", () => ani_yaz(false));
  addEventListener("pagehide", () => ani_yaz(true));
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
  // İstenen bir yerden başlıyorsa oraya sarılıyor — ama ancak dosya nereye
  // sarılabileceğini bildiğinde, yani üstverisi geldiğinde.
  if (basla_an > 0) {
    const an = basla_an;
    basla_an = 0;
    const sar = () => {
      a.removeEventListener("loadedmetadata", sar);
      if (Number.isFinite(a.duration) && an < a.duration - 1) a.currentTime = an;
    };
    a.addEventListener("loadedmetadata", sar);
  } else localStorage.setItem(AN_ANAHTARI, "0");
  if (calsinMi) oynat();
  bildir();
}

// Bir sonraki yüklemenin başlayacağı an. Yalnızca kaldığı yerden devam ederken
// doluyor; ileri ya da geri basıldığında parça baştan çalar.
let basla_an = 0;

function oynat() {
  const a = kur();
  a.volume = seviye;
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
  // Depoya yazan yer burası değil, "playing" — bkz. kur(). Basılan tuş bir
  // niyettir ve tarayıcı onu reddedebilir; reddedilen bir niyeti yazmak,
  // sonraki açılışta hiç çalmamış bir parçanın ortasından devam etmeye
  // çalışmak demekti.
  calmayiDene();
  bildir();
}

// Kaynağı olan bir öğe kaldığı yerden devam eder; olmayana önce kaynak verilir.
// Aynı parçaya geri dönüldüyse yeniden atamak onu başa sarardı.
function calmayiDene() {
  const a = kur();
  if (!a.src) yukle(true); else oynat();
}

export function durdur() {
  caliyor = false;
  localStorage.setItem(CALIYOR_ANAHTARI, "0");
  // Durdurmak bir tercihtir. Bekleyen "ilk dokunuşta çal" dinleyicisi kalırsa
  // bir sonraki dokunuş onu geri açar.
  ilkDokunusuBirak?.();
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
    ses.volume = seviye;
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

  // Kaldığı yerden. Kapıdan oyuna geçerken sayfa yeniden yükleniyor ve müzik
  // orada kesiliyordu; dönüşte parçanın başına sarması, aynı ezginin ilk on
  // saniyesini her oyunda yeniden dinlemek demekti.
  basla_an = kaldigiAn();

  // Zaten çalıyorduysa dokunuş beklenmeden denenir. Yeniden yükleme
  // izinleri sıfırlıyor ve tarayıcı çoğu zaman reddedecek — ama her zaman
  // değil: bu sitede müzik çalmış bir tarayıcı buna izin verebiliyor, ve
  // izin verdiğinde araya hiç sessizlik girmiyor. Reddedilirse zararı yok,
  // aşağıdaki ilk dokunuş yine yakalar.
  // Sessizce denenir: arayüze "çalıyor" dedirtmeden. Reddin gelmesi gerçek
  // uygulamada bir buçuk saniye sürüyor — sahne kuruluyor ve ana iş parçacığı
  // dolu — ve o bir buçuk saniye boyunca çalar durdur düğmesi gösteriyordu,
  // altında hiç ses yokken. Çaldığını "playing" söyleyecek.
  if (localStorage.getItem(CALIYOR_ANAHTARI) === "1") calmayiDene();

  // Hangi olayların dinlendiği tek satırlık bir ayrıntı değil, telefonda
  // müziğin hiç başlamamasının sebebiydi.
  //
  // Dokunmatik bir ekranda pointerdown ve touchstart kullanıcı etkinleşmesi
  // TAŞIMAZ; etkinleşme parmak kalkınca, pointerup/touchend/click ile gelir.
  // Farede pointerdown taşır — masaüstünde aynı kodun neden sorunsuz çalıştığı
  // budur. Dinlenenler arasında ilk gelen pointerdown olduğu için müzik tam da
  // izin verilmeyen anda isteniyor, reddediliyor, ve o tek şans harcanmış
  // oluyordu.
  //
  // Kalanların dördü de etkinleşme taşıyor. Asıl değişiklik ise aşağıda:
  // dinleyiciler, bir deneme yapıldı diye değil, ses gerçekten çıktığı için
  // bırakılıyor. Eskiden ilk tetiklenen olay dördünü birden kaldırıyordu —
  // yani işe yarayacak olan click, işe yaramayan pointerdown'ın içinde
  // siliniyordu.
  //
  // keydown ve click ayrıca duruyor: klavyeyle ya da erişilebilirlik
  // araçlarıyla basıldığında gelen ilk olay onlar oluyor.
  const olaylar = ["pointerup", "touchend", "keydown", "click"];
  const basla = olay => {
    // Çaların kendi tuşlarına karışılmıyor. Bu dinleyici yakalama evresinde,
    // yani düğmenin kendi işleyicisinden önce koşuyor; durdura basıldığında
    // müziği önce başlatıp sonra durdurmuş olurdu.
    if (olay.target?.closest?.("#player")) return;
    // Koşulsuz denenir, ve bırakma kararı buraya ait değil. "Zaten çalıyor mu"
    // diye elemana sormak yanlış cevabı veriyor: play() reddedilecek olsa bile
    // paused'ı hemen false yapıyor, düzeltir düzeltmez ölçüldü — dokunuşun
    // ikinci yarısı (pointerup) o yanlış cevaba bakıp dinleyiciyi bırakıyor ve
    // hata olduğu gibi kalıyordu. Dinleyiciyi bırakan tek yer "playing".
    baslat();
  };
  ilkDokunusuBirak = () => {
    ilkDokunusuBirak = null;
    for (const olay of olaylar) removeEventListener(olay, basla, { capture: true });
  };
  for (const olay of olaylar) addEventListener(olay, basla, { capture: true, passive: true });
}
