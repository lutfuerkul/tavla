// Servis çalışanı: oyunu internetsiz oynanabilir kılar.
//
// Tavla bir statik sayfadır; bilgisayara karşı ve iki kişi aynı cihazda oynanan
// modlar hiçbir sunucuya bağlanmaz. Eksik olan tek şey, sayfanın kendisinin
// çevrimdışıyken açılabilmesiydi: kabuğu (HTML, betikler, three.js, doku, font)
// bir kez görüldükten sonra buraya alınır, sonraki her açılışta ağ olmasa da
// oradan verilir. Çevrimiçi mod için gereken Firebase'e dokunulmaz — o, ağ
// yokken zaten sessizce geri çekilecek biçimde yazılmıştır.

const CACHE = "tavla-v1";

// Kabuk: ilk kurulumda peşinen alınır ki ağsız ilk açılış da mümkün olsun.
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/session.js",
  "./src/rules.js",
  "./src/i18n.js",
  "./src/firebase.js",
  "./src/ses.js",
  "./src/assets/triangle.png",
  "./doku/cuha-kadife.jpg",
  // Tahtanın sesi, altmış küsur kilobayt. Kabuğa alınıyor çünkü ağsız oynanan
  // bir oyunun sessiz olması için bir sebep yok.
  "./ses/tas-1.mp3",
  "./ses/tas-2.mp3",
  "./ses/tas-3.mp3",
  "./ses/tas-4.mp3",
  "./ses/tas-5.mp3",
  "./ses/kirma.mp3",
  "./ses/zar-cift.mp3",
  "./ses/zar-tek.mp3",
  "./vendor/three/three.module.min.js",
  "./vendor/three/examples/jsm/environments/RoomEnvironment.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Tek bir dosya düşse kurulum tümden başarısız olmasın: her biri ayrı ayrı.
    await Promise.allSettled(SHELL.map(url => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Aynı köken ve Google Fonts: önce önbellek, arkada tazele (stale-while-
// revalidate) — açılış anında hızlı, çevrimiçiyken de eninde sonunda güncel.
// Firebase ve diğer her şey: ağa bırakılır, çevrimdışıyken tasarlandığı gibi
// sessizce geri çekilir.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (!sameOrigin && !fonts) return;
  // Müziğe hiç dokunulmuyor, ağa olduğu gibi bırakılıyor. İki sebep var ve
  // ikisi de tek başına yeterli.
  //
  // Biri boyut: on dört parça yetmiş megabayt, kabuğun tamamının bin katı.
  // Öbürü daha ince: bir ses etiketi dosyayı parça parça istiyor (Range), ve
  // sunucu buna 206 ile cevap veriyor. Bir 206 önbelleğe konamaz — cache.put
  // hata fırlatır — ve önbellekten dönen tam bir cevap da ilerleme çubuğunu
  // ve ileri sarmayı bozar. Doğru olan, akan sesi akıtan katmana bırakmak.
  if (sameOrigin && url.pathname.includes("/muzik/")) return;
  if (req.headers.has("range")) return;
  event.respondWith(freshenFromCache(req));
});

async function freshenFromCache(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fromNet = fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  // Önbellekte varsa hemen ver; yoksa ağı bekle; o da olmazsa sayfa gezinmesi
  // için kabuğun ana sayfasına düş.
  return cached
    || (await fromNet)
    || (req.mode === "navigate" ? cache.match("./index.html") : Response.error());
}
