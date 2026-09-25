# Sokak

Mahalle ve sokak ölçeğindeki kamusal sorunları harita üzerinde görünür, doğrulanabilir ve takip edilebilir hale getirmeyi amaçlayan civic-tech uygulaması.

## v0.3

v0.3 veri katmanını UI'dan ayırır. Railway veya başka bir sunucu çalıştırmadan bugün IndexedDB kullanır; ileride aynı arayüz REST API'ye bağlanabilir.

### Şu anda çalışanlar
- MapLibre tabanlı harita
- Sorun / yoğunluk görünümü; yakın zoom'da gerçek sorun noktalarına geçiş
- Sorun detay bottom-sheet'i
- İdempotent “Ben de gördüm” doğrulaması
- Dört adımlı sorun bildirme akışı
- Tarayıcı konum izni
- Yakındaki aynı kategoride açık sorun için mükerrer bildirim uyarısı
- Fotoğraflı yeni bildirim
- **IndexedDB ile kalıcı sorun, fotoğraf ve bu cihazın doğrulama kayıtları**
- Sayfa yenilendiğinde yerel kayıtların yeniden yüklenmesi
- IndexedDB kullanılamazsa açıkça belirtilen geçici oturum modu
- Backend bağımsız `IssueRepository` sözleşmesi
- Hazır REST adapter'ı: `VITE_API_BASE_URL` verildiğinde API moduna geçer
- Gelecekteki PostgreSQL şeması ve REST v1 sözleşmesi: `backend/`
- Mobil öncelikli responsive arayüz
- GitHub Pages otomatik build/deploy

## Veri katmanı

Varsayılan:

```
React UI
   ↓
IssueRepository
   ↓
IndexedDbIssueRepository
```

Gelecekte backend açıldığında:

```
React UI
   ↓
IssueRepository
   ↓
ApiIssueRepository
   ↓
REST API / PostgreSQL
```

UI bileşenleri hangi adapter'ın aktif olduğunu bilmez.

## API seçimi

`.env.example`:

```env
VITE_API_BASE_URL=
```

Boş bırakılırsa hiçbir dış servis kullanılmaz ve Railway kredisi tüketilmez.

API URL'si verildiğinde frontend şu sözleşmeyi kullanır:

- `GET /v1/issues`
- `POST /v1/issues`
- `GET /v1/me/confirmations`
- `POST /v1/issues/:id/confirmations`

Ayrıntı: `backend/README.md`

## Teknoloji
- React 19.3
- TypeScript 7
- Vite 8.3
- MapLibre GL JS 6.11.2
- IndexedDB
- Gelecekte PostgreSQL uyumlu şema

## Yerelde çalıştırma

```bash
npm ci
npm run dev
```

Vite base path `/sokak/` olarak ayarlıdır.

## Production build

```bash
npm run build
npm run preview
```

## Pages

`main` dalına push, `.github/workflows/pages.yml` üzerinden `npm ci` + production build alır ve `dist/` çıktısını GitHub Pages'e gönderir.

## Bilinen sınırlar

- Veriler şimdilik **yalnız aynı tarayıcı/cihazda** kalıcıdır; kullanıcılar arasında paylaşılmaz.
- Anonim `clientId` gerçek kullanıcı hesabı değildir.
- Fotoğraflar prototip aşamasında IndexedDB'de data URL olarak tutulur. Production backend'de object storage kullanılmalıdır.
- Yorum, takip, moderasyon ve gerçek yetkili hesabı henüz backend'e bağlı değildir.
- Harita tabanı prototipte doğrudan OpenStreetMap raster tile sunucusunu kullanır; gerçek trafik öncesi production tile altyapısı seçilmelidir.
- Manifest mevcut olsa da production offline/PWA katmanı henüz tamamlanmış değildir.
