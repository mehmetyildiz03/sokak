# Sokak backend contract

Bu klasör v0.5'te backend sözleşmesini, PostgreSQL şemasını ve çalışır Node.js REST sunucusunu içerir.
Sunucu Railway production ortamında deploy edilmiştir. PostgreSQL, S3-uyumlu object storage ve production domain smoke kontrolleri aktiftir.


## Çalışır API sunucusu

- Giriş noktası: `backend/server.js`
- PostgreSQL sürücüsü: `pg`
- Sağlık kontrolü: `GET /health`
- Storage readiness: `GET /health/storage`
- Şema: başlangıçta `backend/schema.sql` uygulanabilir (`RUN_MIGRATIONS=false` ile kapatılabilir).
- CORS allowlist: `ALLOWED_ORIGINS`
- Yazma işlemlerinde `X-Sokak-Client-Id` zorunludur.
- Process-içi temel write/comment rate limit vardır. Bu, gerçek hesap/edge rate limiting yerine geçmez.

Yerel çalıştırma:

```bash
cd backend
npm ci
DATABASE_URL=postgresql://... \
ALLOWED_ORIGINS=http://localhost:5173 \
npm start
```

CI, geçici PostgreSQL üzerinde iki farklı istemciyle şu akışı uçtan uca doğrular:

`bildirim → ikinci kullanıcı doğrulaması → takip → yorum → community snapshot → çözüm geri bildirimi`

## Frontend adapter seçimi

- `VITE_API_BASE_URL` boşsa: `IndexedDbIssueRepository`
- `VITE_API_BASE_URL` doluysa: `ApiIssueRepository`

Bileşenler repository implementasyonunu bilmez.

## Hesap ve oturum

Hesap açmayan kullanıcılar anonim `X-Sokak-Client-Id` ile devam eder. Hesap açıldığında API aynı endpoint'lerde bearer oturumunu öncelikli kimlik olarak kullanır.

### POST /v1/auth/register

Body:

```json
{
  "username": "mehmet.yildiz",
  "displayName": "Mehmet Yıldız",
  "password": "en-az-10-karakter"
}
```

Parola Node `crypto.scrypt` ile rastgele salt kullanılarak türetilir; düz parola saklanmaz. Başarılı kayıt bir bearer token ve public kullanıcı profili döndürür.

### POST /v1/auth/login

Kullanıcı adı + parola ile yeni 30 günlük oturum oluşturur.

### GET /v1/auth/me

`Authorization: Bearer <token>` ile kullanıcı profili ve katkı sayaçlarını döndürür.

### POST /v1/auth/logout

Geçerli session token hash'ini revoke eder.

### POST /v1/auth/claim-device

Giriş yapmış kullanıcı için mevcut tarayıcının anonim doğrulama, takip, çözüm görüşü, yorum ve bildirim sahipliğini `user:<id>` aktörüne taşır.

## REST v1

Tüm cevaplar JSON'dur.

### GET /v1/issues

200:

```json
[
  {
    "id": "iss-...",
    "lng": 30.55,
    "lat": 37.76,
    "category": "road",
    "categoryLabel": "Yol / Asfalt",
    "emoji": "🕳️",
    "title": "Yolda büyük çukur",
    "place": "Bahçelievler · 142. Sokak",
    "description": "...",
    "confirms": 2,
    "comments": 0,
    "age": "3 saat",
    "severity": 1,
    "status": "Doğrulandı",
    "photoUrl": null,
    "createdAt": "2026-09-25T12:00:00.000Z",
    "updatedAt": "2026-09-25T12:30:00.000Z"
  }
]
```

### POST /v1/issues

Header:

`X-Sokak-Client-Id: <anonymous browser id>`

Body: bir `Issue` kaydı.

Sunucu:
- girdiyi doğrular,
- oluşturucuyu ilk doğrulayıcı olarak kaydeder,
- `confirms = 1` ile kaydı döndürür.

### GET /v1/me/confirmations

Header:

`X-Sokak-Client-Id: <anonymous browser id>`

200:

```json
{ "issueIds": ["iss-1", "iss-2"] }
```

### GET /v1/me/follows

Header:

`X-Sokak-Client-Id: <anonymous browser id>`

200:

```json
{ "issueIds": ["iss-1", "iss-5"] }
```

### PUT /v1/issues/:id/follow

Sorunu takip eder. İşlem idempotent olmalıdır.

200:

```json
{ "followed": true }
```

### DELETE /v1/issues/:id/follow

Sorunun takibini bırakır. Kayıt zaten yoksa yine başarılı kabul edilmelidir.

200:

```json
{ "followed": false }
```

### POST /v1/issues/:id/confirmations

Header:

`X-Sokak-Client-Id: <anonymous browser id>`

İşlem idempotent olmalıdır. Aynı istemci ikinci kez sayıyı artırmamalıdır.

200:

```json
{
  "issue": { "...": "updated issue" },
  "alreadyConfirmed": false
}
```


### GET /v1/issues/:id/community

Sorunun topluluk katmanını döndürür.

200:

```json
{
  "comments": [
    {
      "id": "cmt-...",
      "issueId": "iss-...",
      "authorLabel": "Komşu A12B",
      "body": "Sorun bugün hâlâ devam ediyor.",
      "createdAt": "2026-09-27T08:30:00.000Z"
    }
  ],
  "resolution": {
    "resolvedCount": 3,
    "stillOpenCount": 1,
    "myFeedback": "resolved"
  }
}
```

### POST /v1/issues/:id/comments

Body:

```json
{ "body": "Sorun bugün hâlâ devam ediyor." }
```

Sunucu yorum metnini doğrular, kimliği kullanıcı/istemci hesabından türetir ve issue `comment_count` alanını aynı transaction içinde artırır.

### PUT /v1/issues/:id/resolution-feedback

Yalnız `Çözüldü` durumundaki kayıtlarda kullanılır. Kişi başına tek kayıt vardır; tekrar gönderim mevcut tercihi günceller, toplamı şişirmez.

Body:

```json
{ "feedback": "resolved" }
```

veya:

```json
{ "feedback": "still_open" }
```

200 cevabı güncel community snapshot'tır.

### POST /v1/uploads/photo

Header:

`X-Sokak-Client-Id: <anonymous browser id>`

Body:

```json
{ "dataUrl": "data:image/jpeg;base64,..." }
```

Desteklenen türler JPEG, PNG, WebP, HEIC ve HEIF; azami boyut 8 MB'dir. API fotoğrafı private S3-uyumlu bucket'a yükler ve medya proxy URL'si döndürür.

### GET /v1/media/:key

Private bucket'taki fotoğrafı güvenli object-key doğrulamasından sonra stream eder. Issue kayıtları yalnız bu HTTPS URL'yi saklar.

## Kimlik stratejisi

Canlı API hibrit kimlik kullanır. Hesap açmayan istemci anonim `clientId` ile çalışır; geçerli bearer token bulunduğunda tüm kişisel işlemler `user:<id>` aktörüne bağlanır. Session token'ın kendisi veritabanında tutulmaz; yalnız SHA-256 hash'i saklanır.

## Fotoğraflar

IndexedDB modunda frontend data URL saklar. Canlı API modunda `ApiIssueRepository` önce `/v1/uploads/photo` endpoint'ine yükler; private object storage binary'yi tutar ve issue tablosunda yalnız API media URL'si saklanır.


## Production öncesi zorunlu kalanlar

1. E-posta/telefon doğrulama, parola sıfırlama ve güvenli hesap kurtarma.
2. Dağıtık rate limiting / abuse prevention; mevcut limiter tek process içindir.
3. Moderasyon yaptırım politikası: içerik gizleme/silme, kullanıcı engelleme, itiraz ve audit görünürlüğü.
4. Kurum hesabı için ayrı yetki modeli; vatandaş endpoint'leri kurumsal statü değiştiremez.
5. Yedekleme/restore politikası, gözlemlenebilirlik ve production tile/geocoding kapasite planı.


## Moderasyon

### POST /v1/moderation/reports

Giriş yapmış vatandaş sorun veya yorum hedefi için rapor açar. Desteklenen nedenler:
`false_information`, `harassment`, `personal_info`, `spam`, `other`.

Aynı kullanıcı aynı hedef için `open/reviewing` durumda ikinci rapor açamaz.

### GET /v1/moderation/reports?status=open

Yalnız `moderator/admin`. `open`, `reviewing`, `resolved`, `dismissed` veya `all` filtreleri kullanılabilir. Raporlayan kullanıcı ve hedef önizlemesi döndürülür.

### PATCH /v1/moderation/reports/:id

Yalnız `moderator/admin`. Durum `reviewing`, `resolved` veya `dismissed` yapılabilir ve en fazla 1000 karakter moderatör notu eklenebilir. İnceleyen kullanıcı ve zaman audit alanlarında saklanır.

Bu aşamada moderasyon kararı içeriği otomatik silmez/gizlemez; rapor durumu ile içerik yaptırımı bilinçli olarak ayrı tutulur.
