// Tahtanın sesi.
//
// Kayıtların hepsi gerçek: bir tavla tahtasına konan taşlar, avuçtan çıkan
// zarlar. Sentezlenmiş bir şey yok, çünkü tahta zaten ahşap ve fildişi
// görünüyor ve ona uyduramayacağımız tek şey uydurma bir tıkırtıydı.
//
// Web Audio kullanılıyor, <audio> etiketi değil. Sebebi tek bir sayı: bir taş
// oyun boyunca yüz elli kez konuyor. <audio> her seferinde baştan sarmak ve
// çözmek zorunda, üst üste binen iki sesi de çalamıyor; burada dosya bir kez
// çözülüp bellekte duruyor ve her çalış yeni bir kaynak. Aynı sebeple her
// çalışta tonu ve şiddeti biraz oynatılıyor: aynı örneği yüz elli kez birebir
// aynı duymak, sesi olmayan bir oyundan daha yorucu.

const KOK = "ses/";

// Beş taş sesi, aynı tahtadan alınmış ama birbirinin aynısı değil: ikisi tok
// ve dolgun, biri orta, ikisi hafif ve kuru. Hangisinin çalacağı rastgele,
// üst üste aynısı gelmemek şartıyla.
const DOSYALAR = {
  tas: ["tas-1.mp3", "tas-2.mp3", "tas-3.mp3", "tas-4.mp3", "tas-5.mp3"],
  kirma: ["kirma.mp3"],
  zarCift: ["zar-cift.mp3"],
  zarTek: ["zar-tek.mp3"],
  // Zarlar avuçta dönerken. Tek olay değil bir hâl: başlıyor, sürüyor, bitiyor
  // — o yüzden ötekiler gibi bir kere çalınmıyor, açılıp kapanıyor. Kayıttan
  // kırpılırken sonu başıyla çaprazlandı, yani kendi üstüne dikişsiz dönüyor:
  // el ne kadar sallarsa o kadar sürüyor ve hiçbir yerinde bir ek duyulmuyor.
  sallama: ["zar-sallama.mp3"],
};

// Ton ve şiddetteki oynama. Küçük tutuldu: yarım perdeden fazlası aynı tahtada
// çalınmamış gibi duyuluyor, sesteki fark ise bir taşın biraz daha sertçe
// konmasından öteye geçmemeli.
const TON_OYNAMA = 0.06;
const SES_OYNAMA = 0.18;
// Tahtanın sesi müziğin altında. Bir oyun genelde tersini yapar — müzik döşeme,
// olaylar öne çıkar — ama burada istenen bu: müzik dinlenecek, tahta ona eşlik
// edecek. Seviyeler müziğin 0.85'ine göre seçildi (bkz. muzik.js), yani zar ve
// taş onun üçte biri kadar. Kırma biraz yüksek kalıyor: duyulması gereken tek
// olay o, çünkü oyunda bir şeyin başına gelen tek şey odur.
const SES_SEVIYESI = { tas: 0.22, kirma: 0.34, zarCift: 0.5, zarTek: 0.5, sallama: 0.6 };

const ANAHTAR = "tavla.ses";

// Açık mı? Tercih hatırlanıyor; hiç söylenmemişse açık. Oyunun sesi olması
// beklenen bir şey, ve kapatmak tek dokunuş.
let acik = localStorage.getItem(ANAHTAR) !== "kapali";

export const sesAcikMi = () => acik;

// Ve bunun üstünde bir susturma. İkisi ayrı şeyler: "ses açık mı" bir tercih,
// susturma ise bir an — odaya biri girdi, telefon masada çalıyor. O yüzden
// tercihi silmiyor, üstünü örtüyor: açıldığında altında ne bırakıldıysa o
// bulunuyor. Ana kazançta kesiliyor, yani çalmakta olan bir taş da susuyor;
// yalnız cal()'ı geçmek, dokunuşla susturan biri için geç kalıyordu.
let susturuldu = false;

export function sustur(deger) {
  susturuldu = !!deger;
  if (ana) ana.gain.value = susturuldu ? 0 : 1;
}

export function sesiCevir() {
  acik = !acik;
  localStorage.setItem(ANAHTAR, acik ? "acik" : "kapali");
  if (acik) uyandir();
  return acik;
}

let ac = null;
let ana = null;
const tamponlar = new Map();
const baslangiclar = new Map();
const sonlar = new Map();
const sonCalan = new Map();
let yukleniyor = null;

// Sesin gerçekten başladığı an. Dosyalar kırpılmış olarak üretiliyor ama mp3
// kodlayıcısı kendi gecikmesini başa ekliyor: kaynakta 162 milisaniye olan bir
// taş sesi çözüldüğünde 209 milisaniye çıkıyor, aradaki fark baştaki
// sessizlik. Otuz milisaniye tek başına duyulmaz, ama taşın konduğu kareyle
// sesi arasına giren gecikme tam da kırpma zahmetinin kaldırmak istediği şey.
// Çözülen tamponda ölçülüp çalarken atlanıyor, böylece hangi kodlayıcı ne
// eklerse eklesin ses ilk örneğinden başlıyor.
function sesinBasi(tampon) {
  const d = tampon.getChannelData(0);
  let tepe = 0;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > tepe) tepe = v; }
  const esik = tepe * 0.005;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > esik) {
    // Bir milisaniye geri: sesin ilk tırmanışı kesilmesin.
    return Math.max(0, (i - tampon.sampleRate / 1000) / tampon.sampleRate);
  }
  return 0;
}

// Bir kez, ilk dokunuşta. Ses aygıtı ancak kullanıcı sayfaya dokunduktan sonra
// açılıyor ve bir yeniden yükleme sayfayı yeniden dokunulmamış hâle getiriyor
// — oyuna girerken ayarlardan biri değişmişse sayfa kendini yeniliyor, yani
// olağan yol tam olarak bu. Basılan düğmeye güvenmek yerine ilk dokunuş
// nerede olursa olsun yakalanıyor.
let dokunusBekleniyor = false;

function ilkDokunustaAc() {
  if (dokunusBekleniyor) return;
  dokunusBekleniyor = true;
  const ac_ = () => {
    if (ac?.state === "suspended") ac.resume().catch(() => {});
  };
  for (const olay of ["pointerdown", "touchstart", "keydown", "click"]) {
    addEventListener(olay, ac_, { capture: true, passive: true });
  }
}

// Tarayıcı ses bağlamını ancak bir dokunuşun ardından açıyor. Oyuna girilirken
// zaten bir düğmeye basılıyor, uyandırma oradan çağrılıyor. Çağrılmazsa hiçbir
// şey olmuyor — ses çalınmaya çalışılınca bir daha deneniyor.
export function uyandir() {
  if (!acik) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume().catch(() => {});
    if (!ana) {
      ana = ac.createGain();
      ana.gain.value = susturuldu ? 0 : 1;
      ana.connect(ac.destination);
    }
    ilkDokunustaAc();
    yukle();
  } catch (sebep) {
    console.info("tavla: ses açılamadı —", sebep?.message ?? sebep);
    ac = null;
  }
}

// Hepsi bir kerede, ilk uyandırmada. Toplam altmış küsur kilobayt; servis
// çalışanı zaten kabuğa aldığı için ikinci açılışta ağa hiç çıkılmıyor.
//
// Eksik kalan yeniden deneniyor. İlk hâli denemiyordu ve bunun bedeli sanıldığı
// gibi "o ses gelmez" değildi: yükleme tek bir söz olarak tutulduğu için bir
// dosyanın düşmesi bütün denemeyi kapatıyor, oyun baştan sona sessiz kalıyordu.
// Sekiz istek aynı anda gidiyor; kötü bir bağlantıda ya da tek bağlantılık bir
// sunucuda bir tanesinin düşmesi olağan bir şey.
const EN_COK_DENEME = 3;
let deneme = 0;

function yukle() {
  if (yukleniyor || !ac) return;
  const eksik = Object.values(DOSYALAR).flat().filter(ad => !tamponlar.has(ad));
  if (!eksik.length || deneme >= EN_COK_DENEME) return;
  deneme++;
  yukleniyor = Promise.all(eksik.map(async ad => {
    try {
      const ham = await fetch(KOK + ad).then(cevap => {
        if (!cevap.ok) throw new Error(cevap.status);
        return cevap.arrayBuffer();
      });
      // Eski Safari geri çağırmalı biçimi istiyor, yenisi söz döndürüyor.
      const tampon = await new Promise((tamam, olmadi) => {
        const sonuc = ac.decodeAudioData(ham, tamam, olmadi);
        if (sonuc?.then) sonuc.then(tamam, olmadi);
      });
      tamponlar.set(ad, tampon);
      baslangiclar.set(ad, sesinBasi(tampon));
      sonlar.set(ad, sesinSonu(tampon));
    } catch (sebep) {
      // Bir ses gelmediyse oyun o kadarıyla sessiz oynanır; durmasına değecek
      // bir şey değil, ama bir daha denenecek.
      console.info(`tavla: ${ad} yüklenemedi —`, sebep?.message ?? sebep);
    }
  })).then(bitti, bitti);
}

// Eksik kalan varsa kendiliğinden bir daha denenir. Beklemeye bırakmak yetmez:
// tekrar yalnızca bir ses çalınmak istendiğinde tetiklenseydi, ilk denemesi
// düşen bir açılışta ilk zar atışı sessiz geçerdi — ve düşmesi olağan, çünkü
// ayarlar değişince sayfa kendini yeniliyor ve ilk istekler tam o sırada
// yola çıkıyor.
const YENIDEN_MS = 1200;

function bitti() {
  yukleniyor = null;
  const eksik = Object.values(DOSYALAR).flat().some(ad => !tamponlar.has(ad));
  if (eksik && deneme < EN_COK_DENEME) setTimeout(yukle, YENIDEN_MS);
}

// Sesin bittiği yer. Başı gibi bu da ölçülüyor, ve aynı sebeple: mp3 kodlayıcı
// sona da kendi sessizliğini ekliyor. Tek seferlik bir seste bunun bedeli yok
// — kimse sonundaki sessizliği duymaz — ama dönen bir seste tam ortasına bir
// boşluk koyuyor, ve bir avucun içinde iki buçuk saniyede bir duraklama, o
// avucun durduğu anlamına geliyor.
function sesinSonu(tampon) {
  const d = tampon.getChannelData(0);
  let tepe = 0;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > tepe) tepe = v; }
  const esik = tepe * 0.005;
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > esik) {
    return Math.min(tampon.duration, (i + tampon.sampleRate / 1000) / tampon.sampleRate);
  }
  return tampon.duration;
}

// Sallama: açılıp kapanan tek bir kaynak. Sert başlayıp sert kesilmiyor —
// avuç açılırken ses de açılıyor, zarlar elden çıkarken kapanıyor. Kırk
// milisaniye: duyulmayacak kadar kısa, tık çıkarmayacak kadar uzun.
const SALLAMA_AC_MS = 60;
const SALLAMA_KAPAT_MS = 130;
let sallamaKaynagi = null;
let sallamaKazanci = null;

export function sallama(acikMi) {
  if (acikMi) sallamayiBaslat(); else sallamayiDurdur();
}

function sallamayiBaslat() {
  if (!acik || sallamaKaynagi) return;
  if (!ac) uyandir();
  if (!ac || !ana) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const ad = DOSYALAR.sallama[0];
  const tampon = tamponlar.get(ad);
  // Henüz çözülmediyse sessizce geçiliyor; bir sonraki atışta hazır olur.
  if (!tampon) { yukle(); return; }
  try {
    const kaynak = ac.createBufferSource();
    kaynak.buffer = tampon;
    kaynak.loop = true;
    // Kodlayıcının başa ve sona eklediği sessizlik döngünün dışında bırakılıyor.
    kaynak.loopStart = baslangiclar.get(ad) ?? 0;
    kaynak.loopEnd = sonlar.get(ad) ?? tampon.duration;
    const kazanc = ac.createGain();
    kazanc.gain.value = 0;
    kazanc.gain.linearRampToValueAtTime(SES_SEVIYESI.sallama,
      ac.currentTime + SALLAMA_AC_MS / 1000);
    kaynak.connect(kazanc);
    kazanc.connect(ana);
    kaynak.start(ac.currentTime, kaynak.loopStart);
    sallamaKaynagi = kaynak;
    sallamaKazanci = kazanc;
  } catch (sebep) {
    console.info("tavla: sallama çalınamadı —", sebep?.message ?? sebep);
  }
}

function sallamayiDurdur() {
  if (!sallamaKaynagi) return;
  const kaynak = sallamaKaynagi, kazanc = sallamaKazanci;
  sallamaKaynagi = null;
  sallamaKazanci = null;
  try {
    const bitis = ac.currentTime + SALLAMA_KAPAT_MS / 1000;
    kazanc.gain.cancelScheduledValues(ac.currentTime);
    kazanc.gain.setValueAtTime(kazanc.gain.value, ac.currentTime);
    kazanc.gain.linearRampToValueAtTime(0, bitis);
    kaynak.stop(bitis + 0.01);
  } catch { /* zaten durmuş olabilir */ }
}

// Aynı sesi arka arkaya iki kez çalma: beş dosya arasından rastgele seçerken
// tesadüfen aynısına düşmek beşte bir, ve kulak onu tekrar diye duyuyor.
function sec(tur) {
  const liste = DOSYALAR[tur];
  if (!liste?.length) return null;
  if (liste.length === 1) return liste[0];
  const kacinilan = sonCalan.get(tur);
  const secenekler = liste.filter(ad => ad !== kacinilan);
  const ad = secenekler[Math.floor(Math.random() * secenekler.length)];
  sonCalan.set(tur, ad);
  return ad;
}

export function cal(tur, { gecikme = 0, seviye = 1 } = {}) {
  if (!acik || susturuldu) return;
  if (!ac) uyandir();
  if (!ac || !ana) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});

  const ad = sec(tur);
  const tampon = ad && tamponlar.get(ad);
  // Henüz çözülmediyse sessizce geçiliyor. İlk birkaç saniyede olabilir ve
  // beklemeye alınmış bir ses, geç çalınca olayın kendisinden kopuyor.
  if (!tampon) { yukle(); return; }

  try {
    const kaynak = ac.createBufferSource();
    kaynak.buffer = tampon;
    kaynak.playbackRate.value = 1 + (Math.random() * 2 - 1) * TON_OYNAMA;
    const ses = ac.createGain();
    const taban = (SES_SEVIYESI[tur] ?? 0.6) * seviye;
    ses.gain.value = Math.max(0, taban * (1 + (Math.random() * 2 - 1) * SES_OYNAMA));
    kaynak.connect(ses);
    ses.connect(ana);
    kaynak.start(ac.currentTime + Math.max(0, gecikme), baslangiclar.get(ad) ?? 0);
  } catch (sebep) {
    console.info("tavla: ses çalınamadı —", sebep?.message ?? sebep);
  }
}

// Bir hamlenin sesi, oynanmadan önceki tahtaya bakılarak: rakibin tek taşının
// üstüne geliyorsa kırma, değilse konma. Taş toplamanın kendi sesi yok — el
// tahtadan taşı alıyor, koymuyor — ve zorlama bir ses koymaktansa o an sessiz
// kalması daha doğru duruyor.
export function hamleSesi(pos, renk, hamle) {
  if (hamle.to === "off") return null;
  const hedef = pos?.points?.[hamle.to];
  return hedef && hedef.colour !== renk ? "kirma" : "tas";
}
