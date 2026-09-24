# Şehir Sorun Haritası — v0.1 prototip

Sıfırdan başlatılan civic issue reporting uygulamasının ilk etkileşimli mobil prototipi.

## Bu sürümde
- Harita merkezli mobil ana ekran
- Sorun noktaları ve üç seviyeli durum/önem rengi
- Sorun detay bottom-sheet'i
- "Ben de gördüm" doğrulaması
- Sorunlar / Yoğunluk harita görünümü
- 4 adımlı sorun bildirme akışı
- Konum izni desteği
- Yakındaki aynı kategoriyi temel düzeyde algılama uyarısı
- Yeni bildirimi canlı olarak haritaya ekleme
- PWA manifest + temel service worker

## Çalıştırma
Dosya klasöründe bir yerel HTTP sunucusu açın:

```bash
python -m http.server 4173
```

Ardından `http://localhost:4173` adresini açın.

> Harita katmanı prototipte OpenStreetMap raster tile'larını kullanır. Production için uygun bir tile sağlayıcısı / kendi tile altyapısı seçilmelidir.

## Sonraki teknik adım
Bu prototip ürün yönünü doğruladıktan sonra React + TypeScript tabanlı üretim koduna taşınacak; gerçek backend, kullanıcı sistemi, fotoğraf depolama, moderasyon, yetkili paneli ve veri modeli eklenecek.
