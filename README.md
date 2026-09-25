# Sokak

Mahalle ve sokak ölçeğindeki kamusal sorunları harita üzerinde görünür, doğrulanabilir ve takip edilebilir hale getirmeyi amaçlayan civic-tech uygulaması.

## v0.2

İlk statik prototip, üretim koduna geçiş için React + TypeScript + Vite mimarisine taşındı.

### Şu anda çalışanlar
- MapLibre tabanlı harita
- Harita üzerinde örnek sorun kayıtları
- Sorun / yoğunluk görünümü; yakın zoom'da yoğunluktan gerçek sorun noktalarına geçiş
- Sorun detay bottom-sheet'i
- Tekrarlı tıklamayı engelleyen “Ben de gördüm” doğrulaması
- Dört adımlı sorun bildirme akışı
- Tarayıcı konum izni
- 160 metre içinde aynı kategoride olası mükerrer bildirim uyarısı
- Yeni bildirimin istemci tarafında haritaya eklenmesi
- Mobil öncelikli responsive arayüz
- GitHub Pages için otomatik build/deploy workflow'u

## Teknoloji
- React 19.3
- TypeScript 7
- Vite 8.3
- MapLibre GL JS 6.11.2

## Yerelde çalıştırma

```bash
npm ci
npm run dev
```

Vite base path `/sokak/` olarak ayarlıdır. Yerel geliştirmede terminalde verilen URL'yi kullanın.

## Production build

```bash
npm run build
npm run preview
```

## Pages

`main` dalına yapılan push, `.github/workflows/pages.yml` üzerinden production build alır ve `dist/` çıktısını GitHub Pages'e gönderir.

## Not

- Prototipte harita tabanı doğrudan OpenStreetMap raster tile sunucusunu kullanır. Bu kullanım geliştirme/prototip içindir; gerçek trafik almadan önce production'a uygun tile sağlayıcısı veya kendi harita altyapımız seçilmelidir.
- v0.2 verileri tarayıcı belleğindedir; sayfa yenilendiğinde kullanıcı tarafından eklenen bildirimler ve doğrulamalar kaybolur.
- Manifest mevcut olsa da production PWA/offline katmanı henüz tamamlanmış değildir.

## Sonraki ürün katmanı

v0.3'te gerçek veri katmanı ele alınacak: kullanıcı kimliği, kalıcı sorun kayıtları, fotoğraf depolama, yorum/doğrulama verileri ve moderasyon temeli.
