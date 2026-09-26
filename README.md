# Sokak

Mahalle ve sokak ölçeğindeki kamusal sorunları harita üzerinde görünür, doğrulanabilir ve takip edilebilir hale getirmeyi amaçlayan civic-tech uygulaması.

## v0.5

v0.5, v0.4 harita/persistence temelini koruyup Sokak'a topluluk katılım katmanı ekler. Railway veya başka bir sunucu çalıştırmadan IndexedDB kullanmaya devam eder; ileride aynı repository arayüzü REST API'ye bağlanabilir.

### Şu anda çalışanlar
- MapLibre tabanlı harita
- MapLibre built-in clustering: uzak zoom'da yakın sorunları sayılı kümelerde toplama, cluster'a dokununca akıllı zoom
- Harita filtreleri: kategori, durum ve yalnız takip edilenler; filtreler yoğunluk görünümüne de uygulanır
- Seçili sorun için filtrelerden bağımsız vurgulu marker; takip edilen tekil sorun ve cluster'larda ayrı vurgu
- Gerçek **Yakınımda** görünümü: cihaz konumu veya harita merkezine göre mesafe sıralaması, Açık/Tümü filtresi ve haritadaki soruna geri dönüş
- Gerçek **Takip** görünümü: sorun detayından takip et/takibi bırak, cihazda kalıcı takip listesi, açık/çözülmüş özeti ve haritadaki soruna geri dönüş
- **Topluluk katılımı**: sorun detayında mahalle güncellemesi/yorum bırakma, kalıcı yorum geçmişi ve anonim yerel komşu etiketi
- **Çözüm doğrulaması**: çözülmüş kayıtlarda “Düzeldi / Devam ediyor” geri bildirimi; kişi başına tek kayıt, tercih değiştirilebilir ve toplam şişmez
- Topluluk çözüm sinyali kurumsal durumu otomatik değiştirmez; gerçek kurum hesabı/entegrasyonu ayrı tutulur
- Sorun / yoğunluk görünümü; yakın zoom'da gerçek sorun noktalarına geçiş
- Sorun detay bottom-sheet'i
- İdempotent “Ben de gördüm” doğrulaması
- Dört adımlı sorun bildirme akışı
- Sorun konumunu mini haritada sürüklenebilir pinle veya haritaya dokunarak hassas seçme
- Seçilen koordinatı ters geocoding ile mahalle/sokak etiketine çevirme; sonuç yerel cache ile tekrar kullanılabilir
- Tarayıcı konum izni
- Yakındaki aynı kategoride açık sorun için mükerrer bildirim uyarısı
- Fotoğraflı yeni bildirim
- **IndexedDB ile kalıcı sorun, fotoğraf, doğrulama ve takip kayıtları**
- Sayfa yenilendiğinde yerel kayıtların yeniden yüklenmesi
- IndexedDB kullanılamazsa açıkça belirtilen geçici oturum modu
- Backend bağımsız `IssueRepository` sözleşmesi
- Hazır REST adapter'ı: `VITE_API_BASE_URL` verildiğinde API moduna geçer
- Gelecekteki PostgreSQL şeması ve REST v1 sözleşmesi: `backend/`
- Runtime geocoding provider ayarı: `public/geocoding-config.json`
- Mobil öncelikli responsive arayüz
- Vitest ile IndexedDB persistence/migration, takip ve Yakınımda sıralama/filtre testleri
- GitHub Pages otomatik test/build/deploy

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
- `GET /v1/me/follows`
- `PUT /v1/issues/:id/follow`
- `DELETE /v1/issues/:id/follow`

Ayrıntı: `backend/README.md`


## Ters geocoding

Sorun konumu değiştikten sonra yaklaşık 0,9 saniye beklenir; ardından seçilen koordinat insan tarafından okunabilir mahalle/sokak etiketine çevrilir. Sonuçlar aynı koordinat için tekrar sorgu yapılmaması amacıyla tarayıcıda sınırlı süre cache'lenir.

Adres çözümlenemezse bildirim engellenmez; kayıt koordinat etiketiyle saklanır.\n\nProvider çalışma zamanında `public/geocoding-config.json` üzerinden seçilir. Prototipte public Nominatim kullanılır. Public Nominatim ağır trafik için tasarlanmamıştır; uygulama tarafında istekler seri ve en az 1,1 saniye aralıklı yapılır. Gerçek ölçek öncesi profesyonel veya kendi geocoding altyapımıza geçilmelidir.

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
- Takip yerelde çalışır; yorum, moderasyon, bildirim gönderimi ve gerçek yetkili hesabı henüz backend'e bağlı değildir.
- Harita tabanı prototipte doğrudan OpenStreetMap raster tile sunucusunu kullanır; gerçek trafik öncesi production tile altyapısı seçilmelidir.
- Ters geocoding prototipte public Nominatim kullanır. Kullanım politikası gereği ağır trafik için uygun değildir; gerçek ölçek öncesi kendi/profesyonel geocoder altyapısına geçilmelidir.
- Manifest mevcut olsa da production offline/PWA katmanı henüz tamamlanmış değildir.


## Topluluk katılımı ve ortak backend

v0.5'te yorum ve çözüm doğrulama deneyimi repository katmanına kadar tamamlanmıştır. IndexedDB modunda bu kayıtlar aynı tarayıcı/cihaz içinde kalıcıdır. Bu, UI ve domain davranışını gerçek veritabanına geçmeden test etmemizi sağlar ancak **farklı kullanıcıların birbirinin yorumunu görmesi anlamına gelmez**.

Gerçek çok-kullanıcılı katılım için `VITE_API_BASE_URL` ile ortak REST backend devreye alınmalıdır. Gerekli API sözleşmesi ve PostgreSQL şeması `backend/` altında hazırdır. Ortak backend açıldığında mevcut React bileşenlerinin yeniden yazılması gerekmez.
