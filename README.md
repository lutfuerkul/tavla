# Tavla

Three.js ile hazırlanmış 3B tavla masası. Bilgisayara karşı, iki kişi aynı
cihazda, ya da çevrimiçi oynanır.

## Çalıştırma

Bu depo statik bir web uygulamasıdır. Yerel bir HTTP sunucusuyla açın:

```bash
npx serve .
```

Ardından tarayıcıda gösterilen yerel adresi açın.

## Ses

`ses/` altındaki sekiz kısa kayıt gerçek bir tavla tahtasından alındı: taş
koyma (beş çeşit), taş kırma, çift zar ve tek zar. Toplam 64 kilobayt ve
çevrimdışı kabuğa dahil, yani ağsız oynarken de duyulur.

## Müzik

`muzik/` altındaki on dört parça telifsiz kaynaklardan. Çalar oyunun sol
tarafında; kendiliğinden başlamaz, kullanıcı çalınca başlar. Dosyalar
çevrimdışı kabuğa **dahil değil** — yetmiş megabayt, kabuğun tamamının bin
katı — ve servis çalışanı bu isteklere hiç dokunmaz.

Çalan sanatçılar, çalma sırasına göre:

| # | parça |
|---|---|
| 1 | Oud and Night |
| 2 | Vibecroft — Arabic R&B |
| 3 | Alex Morgan — Ramadan Crescent Moon Prayer |
| 4 | Desi Free Music — Islamic Background Music |
| 5 | Djovan — Desert Veil |
| 6 | Djovan — Four Wedding Dances |
| 7 | Djovan — Harmony of Morocco |
| 8 | Djovan — Night in Marrakech |
| 9 | Djovan — Sahara Sunset |
| 10 | FASSounds — Arabic Ramadan Music |
| 11 | Kaazoom — Cairo Midnight |
| 12 | Kaazoom — Shattered Strings |
| 13 | Sounds by Amelia — Ancient Egyptian Celebration |
| 14 | The Mountain — Oud |

Kaynağın lisansı atıf zorunlu kılmasa da sanatçılar burada yazılı: bir oyunun
altında otuz yedi dakika çalan müziği kimin yaptığı, adı geçmeye değer bir
şeydir.

## Sunucu tarafı

Çevrimiçi oyun Firebase Cloud Functions üzerinde koşuyor: zarları sunucu atar,
hamleleri sunucu doğrular, istemci hiçbir şey yazmaz. Ayrıntılar
`firebase/README.md` içinde.

`src/rules.js` ile `functions/rules.js` aynı dosyanın iki kopyası — Firebase
kendi klasörünü ayrı dağıttığı için. `functions/kural-esitligi.mjs` ikisinin
ayrışmadığını her dağıtımdan önce doğrular.
