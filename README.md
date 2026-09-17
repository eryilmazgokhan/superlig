<div align="center">

# ⚽ Sampiyonluk Yolu

**Arkadaslarinla oynanan tarayici tabanli Super Lig menajer oyunu.**
Oda ac · Takimini sec · Dizilisini kur · Kadronu olustur · Sezonu yasa

[![Vanilla JS](https://img.shields.io/badge/JavaScript-vanilla-f7df1e?logo=javascript&logoColor=black)](js/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss&logoColor=white)](index.html)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-ffca28?logo=firebase&logoColor=black)](database.rules.json)
[![No build](https://img.shields.io/badge/build-yok-2ea44f)](#calistirma)
[![Claude Code ready](https://img.shields.io/badge/Claude%20Code-CLAUDE.md-d97757)](CLAUDE.md)

</div>

---

## 🎮 Nasil oynanir

| Adim | Ekran | Ne yapiyorsun |
|:---:|---|---|
| 1 | **Lobi** | Bir kullanici adi gir, yeni oda ac ya da arkadasinin 4 harfli kodunu yaz. |
| 2 | **Takim secimi** | 18 Super Lig kulubunden birini sec. Bir takimi sadece bir kisi alabilir. |
| 3 | **Taktik tahtasi** | 4-4-2, 4-3-3, 4-2-3-1 veya 3-5-2. Oyuncu noktalarini sahada surukle, mevkiler otomatik degisir. |
| 4 | **Kadro** | Her mevki icin rastgele adaylar gelir - istedigin gercek oyuncuyu, hangi kulupten olursa olsun draft edebilirsin. Guc degeri o oyuncunun gercek CA'si (Football Manager 26 verisi). Kendi kulubunun oyunculari CA'ya %1 eklenerek kimya bonusu alir. |
| 5 | **Lig** | 34 haftalik sezon. Hafta hafta ilerle ya da hepsini simule et. Herkes ayni sonuclari gorur. Puan tablosunun yaninda gol kralligi ve asist kralligi da var - gol/asist istatistikleri sadece fiilen o kadroya girdigin/AI'ya dagilan oyunculardan gelir. Ekranin sag tarafinda kendi kadron surekli gorunur, boylece hangi oyunculari sectigini unutmazsin. |

Rakip takimlar bilgisayar tarafindan yonetilir. Mac skorlari takim gucune gore Poisson dagilimiyla uretilir, yani surprizler olur.

Sonraki hafta kimle oynayacagin her zaman butonun ustunde yazar. Bir hafta arkadasinla karsi karsiya geliyorsan o hafta otomatik ilerlemez: "Sonraki hafta"ya basan taraf bir istek gonderir, ikiniz de ayni panelde "bu haftayi yaziyla anlat" secebilir, ve hafta ancak rakip de onaylayinca simule olur. Sezon bitince skor tablosunu ve gol krallligini incelemek icin sampiyonluk ekranini kapatabilirsin; yeni sezon ayri, bilincli bir buton.

## 🚀 Calistirma

Kurulum yok, build yok. `index.html` dosyasini tarayicida ac, bu kadar.

Yerel sunucu istersen:

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

> Internet gerekir: Tailwind CDN'den, oda verisi Firebase'den gelir.

Arkadasinla oynamak icin dosyayi bir yere yayinla (GitHub Pages yeterli) ve linki paylas. Oda kodu 4 harf, telefonda da calisir.

## 🧠 Nasil calisiyor

- **Coklu oyuncu:** Oda bilgisi Firebase Realtime Database'de tutulur, her istemci 2 saniyede bir REST ile okur. Faz makinesi: `lobby → selecting → building → league`. Gecisleri host yapar; host kaybolursa en eski oyuncu devralir.
- **Gercek veri:** 18 kulup ve 414 oyuncu sortitoutsi.net'in Football Manager 26 Super Lig verisinden alindi. Oyuncu gucu direkt gercek CA (Current Ability, 0-100) degeri; takim secimi bu gucu etkilemez. Bir oyuncu FM26'da birden fazla mevkide oynayabiliyorsa (orn. sag kanat + forvet), kadro seciminde hepsinde aday olarak cikar.
- **Ayni sezon, herkes icin:** Oda acilirken bir `seed` uretilir. Fikstur, mac sonuclari, kadro dagilimi (kimin kimi drafte ettigi disinda kalan tum oyuncular AI kulüplerine bu seed'le rastgele dagitilir) ve gol/asist krallligi bu seed'den turetildigi icin her oyuncunun ekraninda ayni sampiyon, ayni gol krali ve ayni asist krali cikar. Iki insan oyuncu (birbirinden bagimsiz draft ettikleri icin) ayni gercek oyuncuyu secebilir - bu durumda oyuncu sabit takim sirasina gore sadece bir takima ait sayilir, iki takimda birden gol/asist atamaz.
- **Karsilikli onay:** O hafta aranizda dogrudan eslesme varsa hafta ancak iki taraf da onaylayinca ilerler; digerlerini kimse bekletmez.
- **Yenilemeye dayanikli:** Sayfayi yenilersen odaya geri katilirsin. Sekmeyi kapatan oyuncu 30 saniye sonra sayilmaz, oyun kilitlenmez.
- **Stil:** Tailwind v4. Renk paleti `index.html` icindeki `@theme` blogunda.

## 📁 Dosyalar

```
index.html            ekranlar, Tailwind tema
js/data.js            oyuncular, takimlar, dizilisler
js/core.js            durum, yardimcilar, Firebase, faz yonlendirici
js/lobby.js           oda ac / katil, takim secimi
js/tactics.js         taktik tahtasi
js/squad.js           kadro kurma
js/league.js          fikstur, kadro dagilimi, mac simulasyonu, puan tablosu, gol/asist kralligi, onay akisi
js/main.js            buton baglantilari
database.rules.json   Firebase kurallari (konsoldan yuklenir)
CLAUDE.md             Claude Code icin proje rehberi
```

## 🤖 Claude Code ile gelistirme

Proje `CLAUDE.md` ile geliyor. Claude Code acildiginda mimariyi, hangi dosyada ne oldugunu ve token tasarrufu kurallarini otomatik okur. Bir ekrani degistirmek icin sadece o ekranin dosyasi okunur.

## 🗺️ Fikirler

- [ ] Transfer penceresi
- [ ] Sakatlik ve kart sistemi
- [ ] Odaya izleyici olarak katilma

---

<div align="center">
<sub>Turkiye Super Ligi 2025-26 kadrolari ve CA degerleri sortitoutsi.net (Football Manager 26) verisine dayanir. Kulup renkleri temsili.</sub>
</div>
