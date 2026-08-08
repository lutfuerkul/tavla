// Kendi klavyemiz.
//
// Sebebi görünüm değil yer. Sistem klavyesi açılınca sayfanın görünür alanı
// yeniden ölçülüyor, tahta yeniden sığdırılıyor ve kamera zıplıyor; Android'de
// tam ekrandan da çıkarabiliyor. Kendi klavyemiz sayfanın bir parçası olduğu
// için hiçbiri olmuyor: tuvale dokunulmuyor, kamera kımıldamıyor, klavye
// ekranın altına örtü gibi biniyor.
//
// Bedeli de açık: öngörü yok, otomatik düzeltme yok, kaydırarak yazma yok.
// Sohbette yazılan şey üç kelime, hiçbirine ihtiyaç yok.
//
// Yazı alanı bir <input> değil. Olsaydı odaklanması gerekirdi, odaklanınca da
// sistem klavyesi açılırdı — kaçındığımız şeyin tam kendisi. Metin bir dizgede
// tutuluyor, ekrana bir <div> olarak yazılıyor, imleci de biz çiziyoruz.

// Harfler. Düzen İngilizce Q; Türkçe harfler basılı tutunca çıkıyor, çünkü
// on iki tuşluk bir sıra en dar telefonda tuş başına yirmi altı piksele
// düşüyor ve o, parmak için konmuş ölçünün altı.
const HARFLER = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"],
];

// Basılı tutunca çıkanlar. Türkçenin altı harfi ve şapkalılar; başka dil yok,
// çünkü sohbet Türkçe ve İngilizce.
const UZUN = {
  a: "âà", c: "ç", e: "êé", g: "ğ", i: "ıî", o: "öô", s: "ş", u: "üû",
};

const SAYILAR = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["@", "#", "₺", "_", "&", "-", "+", "(", ")", "/"],
  ["=\\<", "*", "\"", "'", ":", ";", "!", "?", "⌫"],
];

const ISARETLER = [
  ["~", "`", "|", "•", "√", "π", "÷", "×", "¶", "∆"],
  ["£", "¢", "€", "¥", "^", "°", "=", "{", "}", "\\"],
  ["?123", "%", "©", "®", "™", "✓", "[", "]", "⌫"],
];

// Bir tavla masasında söylenenler. Fazlası bir klavye değil bir uygulama olur.
const EMOJI = [
  ["🙂", "😀", "😂", "😅", "😉", "😎", "🤔", "😮", "😐", "🙃"],
  ["😔", "😭", "😡", "🥳", "👍", "👎", "👏", "🙏", "💪", "🤝"],
  ["🎲", "🔥", "💥", "⭐", "❤️", "☕", "🍀", "⏳", "🏆", "⌫"],
];

const SAYFALAR = { harf: HARFLER, sayi: SAYILAR, isaret: ISARETLER, emoji: EMOJI };

// Basılı tutmanın süresi. Üç yüz elli, bir tuşa vurmakla bir tuşu tutmak
// arasındaki farkı ayırt eden en kısa süre: daha kısası hızlı yazanın normal
// vuruşunu tutma sayıyor, daha uzunu tutmayı bekleme hâline getiriyor.
const TUTMA_MS = 350;
const EN_COK = 140;

let kutu = null;         // klavyenin kendisi
let yaziKutusu = null;
let metin = "";
let sayfa = "harf";
let buyuk = 0;           // 0 küçük, 1 tek harf büyük, 2 kilitli
let acik = false;
let gonderildi = null;   // gönderme geri çağrısı
let kapandi = null;
let dil = "en";

const buyukHarf = h => (dil === "tr" ? h.toLocaleUpperCase("tr") : h.toUpperCase());

export const klavyeAcikMi = () => acik;

export function klavyeyiKur({ dil: yeniDil = "en", gonder, kapat } = {}) {
  dil = yeniDil === "tr" ? "tr" : "en";
  gonderildi = gonder ?? null;
  kapandi = kapat ?? null;
  if (kutu) return kutu;

  kutu = document.createElement("div");
  kutu.id = "klavye";
  kutu.hidden = true;
  // Klavyenin kendisi dokunulacak bir şey ama dokunuşu sayfaya geçirmemeli:
  // altında tahta var ve bir tuşa basmak taşı sürüklemek olmamalı.
  kutu.addEventListener("pointerdown", olay => olay.stopPropagation());

  const ust = document.createElement("div");
  ust.className = "klavye-ust";
  yaziKutusu = document.createElement("div");
  yaziKutusu.className = "klavye-yazi";
  yaziKutusu.setAttribute("role", "textbox");
  yaziKutusu.setAttribute("aria-live", "polite");
  const kapatTus = document.createElement("button");
  kapatTus.type = "button";
  kapatTus.className = "klavye-kapat";
  kapatTus.textContent = "✕";
  kapatTus.addEventListener("click", () => klavyeyiKapat());
  ust.append(yaziKutusu, kapatTus);

  const tuslar = document.createElement("div");
  tuslar.className = "klavye-tuslar";

  kutu.append(ust, tuslar);
  document.querySelector("#app")?.append(kutu) ?? document.body.append(kutu);
  ciz();
  return kutu;
}

function ciz() {
  const tuslar = kutu.querySelector(".klavye-tuslar");
  tuslar.textContent = "";
  for (const satir of SAYFALAR[sayfa]) {
    const s = document.createElement("div");
    // Dokuz tuşluk sıra ondan dar: Gboard'da olduğu gibi iki yanından içeri
    // çekiliyor, yoksa harfler alttaki ve üstteki sıranın harflerine denk
    // gelmiyor ve göz sırayı kaydırılmış görüyor.
    s.className = satir.length === 9 && sayfa === "harf" ? "klavye-satir klavye-icerde" : "klavye-satir";
    for (const tus of satir) s.append(tusuYap(tus));
    tuslar.append(s);
  }
  tuslar.append(altSatir());
  yaziyiCiz();
}

function tusuYap(tus) {
  const d = document.createElement("button");
  d.type = "button";
  d.className = "klavye-tus";
  d.dataset.tus = tus;

  if (tus === "⇧") {
    d.classList.add("klavye-genis", "klavye-islev");
    d.append(simge(buyuk === 2 ? "kilit" : "buyuk"));
    d.classList.toggle("acik", buyuk > 0);
  } else if (tus === "⌫") {
    d.classList.add("klavye-genis", "klavye-islev");
    d.append(simge("sil"));
  } else if (tus === "=\\<" || tus === "?123") {
    d.classList.add("klavye-genis", "klavye-islev");
    d.textContent = tus;
  } else {
    const harf = sayfa === "harf" && buyuk > 0 ? buyukHarf(tus) : tus;
    d.textContent = harf;
    // Hangi tuşun altında ne olduğu tuşun üstünde yazıyor. Basılı tutmayı
    // bilmeyen birinin öğrenmesinin tek yolu bu: Türkçe harfin nerede
    // saklandığını söylemeyen bir klavyede o harf yok demektir.
    if (sayfa === "harf" && UZUN[tus]) {
      d.dataset.uzun = UZUN[tus];
      const ust = document.createElement("sup");
      ust.textContent = buyuk > 0 ? buyukHarf(UZUN[tus][0]) : UZUN[tus][0];
      d.append(ust);
    }
  }
  bagla(d, tus);
  return d;
}

// Yazı tipinde olmayan simgeler çiziliyor. ⇧ ile ⌫ "DM Mono"da yok ve tarayıcı
// onları başka bir yazı tipinden alıyor — başka ölçüde, başka ağırlıkta, tuşun
// ortasında küçücük bir leke olarak. Çizilince hepsi aynı kalemden çıkıyor.
function simge(tur) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("klavye-simge");
  const yol = document.createElementNS(NS, "path");
  if (tur === "sil") {
    yol.setAttribute("d", "M8.2 5h12v14h-12L2.6 12zM11 9.4l5.2 5.2M16.2 9.4L11 14.6");
  } else if (tur === "gonder") {
    // Klavyelerin dönüş oku: sağda yukarı çıkan kısa bir dirsek, soldan gelen
    // bir ok. "→" düz bir sağ oktu ve gönderme değil ilerleme demekti.
    yol.setAttribute("d", "M20 6.4v5.2a2.4 2.4 0 0 1-2.4 2.4H5.6M9.6 10.4 5 14.2l4.6 3.8");
  } else {
    yol.setAttribute("d", "M12 3.4 4.6 11h4v6.6h6.8V11h4z");
    if (tur === "kilit") {
      const alt = document.createElementNS(NS, "path");
      alt.setAttribute("d", "M8.6 20.4h6.8");
      svg.append(alt);
    }
  }
  svg.append(yol);
  return svg;
}

function altSatir() {
  const s = document.createElement("div");
  s.className = "klavye-satir klavye-alt";
  const yap = (ad, yazi, sinif = "") => {
    const d = document.createElement("button");
    d.type = "button";
    d.className = `klavye-tus ${sinif}`.trim();
    d.textContent = yazi;
    d.dataset.tus = ad;
    bagla(d, ad);
    return d;
  };
  s.append(
    yap("sayfa", sayfa === "harf" ? "?123" : "ABC", "klavye-islev klavye-genis"),
    yap("emoji", sayfa === "emoji" ? "ABC" : "🙂", "klavye-islev"),
    yap(" ", "", "klavye-bosluk"),
    yap(".", "."),
    gonderTusu(yap),
  );
  return s;
}

function gonderTusu(yap) {
  const d = yap("gonder", "", "klavye-islev klavye-gonder");
  d.append(simge("gonder"));
  return d;
}

// Basma ile tutma. İkisi de aynı dokunuşla başlıyor, ayrıldıkları yer süre:
// parmak kalkarsa harf, kalkmazsa açılan sıradan seçim.
function bagla(d, tus) {
  let sayac = null;
  let acilan = null;

  const bitir = () => {
    clearTimeout(sayac); sayac = null;
    if (acilan) { acilan.remove(); acilan = null; }
  };

  d.addEventListener("pointerdown", olay => {
    olay.preventDefault();
    d.classList.add("basili");
    // Parmağı tuşa bağlıyor: basılı tutup yana kaydırırken hareketler bu tuşa
    // gelmeye devam etsin diye. Yakalayamazsa da olur — bir tarayıcı bunu
    // reddedebiliyor, ve o durumda tuşun kendisinin çalışmaması, kaydırarak
    // seçememekten çok daha kötü.
    try { d.setPointerCapture?.(olay.pointerId); } catch { /* önemsiz */ }
    const uzun = d.dataset.uzun;
    if (!uzun) return;
    sayac = setTimeout(() => { acilan = sirayiAc(d, uzun); }, TUTMA_MS);
  });

  d.addEventListener("pointermove", olay => {
    if (!acilan) return;
    for (const secenek of acilan.children) {
      const y = secenek.getBoundingClientRect();
      secenek.classList.toggle("secili",
        olay.clientX >= y.left && olay.clientX <= y.right);
    }
  });

  const birak = () => {
    d.classList.remove("basili");
    if (acilan) {
      const secili = acilan.querySelector(".secili");
      if (secili) yaz(secili.textContent);
      bitir();
      return;
    }
    bitir();
    bas(tus);
  };
  d.addEventListener("pointerup", birak);
  d.addEventListener("pointercancel", () => { d.classList.remove("basili"); bitir(); });
}

function sirayiAc(d, harfler) {
  const sira = document.createElement("div");
  sira.className = "klavye-sira";
  for (const h of [...harfler]) {
    const s = document.createElement("span");
    s.textContent = sayfa === "harf" && buyuk > 0 ? buyukHarf(h) : h;
    sira.append(s);
  }
  sira.firstChild?.classList.add("secili");
  const yer = d.getBoundingClientRect();
  sira.style.left = `${yer.left + yer.width / 2}px`;
  sira.style.top = `${yer.top}px`;
  kutu.append(sira);
  // Ekranın dışına taşmasın: yerleştikten sonra kutusu okunup içeri itiliyor.
  const kendi = sira.getBoundingClientRect();
  if (kendi.right > innerWidth - 4) sira.style.left = `${yer.left + yer.width / 2 - (kendi.right - innerWidth + 4)}px`;
  if (kendi.left < 4) sira.style.left = `${yer.left + yer.width / 2 + (4 - kendi.left)}px`;
  return sira;
}

function bas(tus) {
  if (tus === "⇧") {
    // Bir vuruş tek harf, iki vuruş kilit, üçüncüsü kapatır.
    buyuk = buyuk === 0 ? 1 : buyuk === 1 ? 2 : 0;
    return ciz();
  }
  if (tus === "⌫") return sil();
  if (tus === "sayfa") { sayfa = sayfa === "harf" ? "sayi" : "harf"; return ciz(); }
  if (tus === "=\\<") { sayfa = "isaret"; return ciz(); }
  if (tus === "?123") { sayfa = "sayi"; return ciz(); }
  if (tus === "emoji") { sayfa = sayfa === "emoji" ? "harf" : "emoji"; return ciz(); }
  if (tus === "gonder") return gonder();
  yaz(sayfa === "harf" && buyuk > 0 ? buyukHarf(tus) : tus);
  if (buyuk === 1) { buyuk = 0; ciz(); }
}

function yaz(harf) {
  if (metin.length >= EN_COK) return;
  metin += harf;
  yaziyiCiz();
}

function sil() {
  if (!metin) return;
  // Emoji tek harf değil: bazıları iki kod biriminden, bazıları birleşiktir.
  metin = [...metin].slice(0, -1).join("");
  yaziyiCiz();
}

function yaziyiCiz() {
  if (!yaziKutusu) return;
  yaziKutusu.textContent = metin;
  yaziKutusu.classList.toggle("bos", !metin);
}

function gonder() {
  const soz = metin.trim();
  if (!soz) return;
  metin = "";
  yaziyiCiz();
  gonderildi?.(soz);
}

export function klavyeyiAc() {
  if (!kutu) return;
  kutu.hidden = false;
  acik = true;
  sayfa = "harf";
  buyuk = 0;
  ciz();
  document.documentElement.classList.add("klavyede");
}

export function klavyeyiKapat() {
  if (!kutu) return;
  kutu.hidden = true;
  acik = false;
  document.documentElement.classList.remove("klavyede");
  kapandi?.();
}

export function klavyeyiCevir() {
  acik ? klavyeyiKapat() : klavyeyiAc();
}
