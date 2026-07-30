# Firebase

Bu klasör Firebase tarafındaki ayarların kaynağını tutar. Kodun kendisi
`src/firebase.js` içinde; buradakiler konsola elle girilen şeylerin depoda
saklanan hâli — böylece neyin niçin öyle olduğu kayıtlı kalıyor.

## Realtime Database kuralları

`database.rules.json`. Konsolda **Realtime Database → Rules** sekmesine
yapıştırılıp yayımlanır.

Ne diyor:

- `presence` altını **giriş yapmış** herkes okuyabilir. Kaç kişinin masada
  olduğu buradan sayılıyor.
- Her oyuncu yalnızca **kendi** kaydını yazabilir ya da silebilir
  (`auth.uid === $uid`). Kimse başkasını çevrimiçi ya da çevrimdışı
  gösteremez.
- Başka her yol kapalı.

Kaydın silinmesini sunucu yapıyor: tarayıcı bağlanınca `onDisconnect` ile
"bağlantım koparsa bu kaydı sil" talimatını bırakıyor. Kapatılan sekme, biten
pil ya da tünel — hiçbiri sayfanın haber almasını gerektirmiyor.

## Firestore kuralları

Henüz yok. Firestore **production mode**'da, yani her şey kapalı. Maç
belgeleri geldiğinde kuralları da buraya eklenecek.

## Konsolda elle yapılanlar

- Authentication → Sign-in method → **Anonymous** açık, otomatik temizleme açık
- Authentication → Settings → Authorized domains → `lutfuerkul.github.io`
- Realtime Database, bölge `europe-west1`
- Firestore, aynı bölge, production mode
- Analytics **alınmadı** — oyunun ihtiyacı yok

## Anahtarlar gizli değil

`src/firebase.js` içindeki `apiKey` ve arkadaşları depoda açıkta. Olmaları
gereken yer orası: tarayıcıya zaten gidiyorlar ve projeyi tanıtmaktan başka bir
iş yapmıyorlar. Yabancının veritabanına yazmasını engelleyen şey bu değerlerin
saklanması değil, yukarıdaki kurallar.
