# Sampiyonluk Yolu

Arkadaslarinla oynanan tarayici tabanli Super Lig menajer oyunu. Oda ac, takim sec, dizilisini kur, kadronu olustur, sezonu simule et.

## Calistirma

`index.html` dosyasini tarayicida ac. Kurulum yok, build yok. Tailwind CDN'den, oda verisi Firebase'den geldigi icin internet gerekir.

Yerel sunucu istersen:

```
python3 -m http.server 8765
```

sonra http://127.0.0.1:8765/ adresine git.

## Dosyalar

- `index.html` – ekranlar ve stil
- `js/` – oyun kodu (ekran basina bir dosya, `CLAUDE.md` icinde tablo var)
- `database.rules.json` – Firebase Realtime Database kurallari (Firebase konsolundan yuklenmeli)
