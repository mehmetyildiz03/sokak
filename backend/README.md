# Sokak backend contract

Bu klasör v0.5'te backend sözleşmesini ve gelecekteki PostgreSQL şemasını tanımlar.
Şu anda Railway veya başka bir sunucu deploy edilmez.

## Frontend adapter seçimi

- `VITE_API_BASE_URL` boşsa: `IndexedDbIssueRepository`
- `VITE_API_BASE_URL` doluysa: `ApiIssueRepository`

Bileşenler repository implementasyonunu bilmez.

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

## Kimlik stratejisi

v0.5 yerel aşamada anonim `clientId` kullanılır. Gerçek hesap sistemi geldiğinde repository sözleşmesi korunup header yerine authenticated user id kullanılacaktır.

## Fotoğraflar

Frontend şu anda IndexedDB'de data URL saklar. Production backend'de fotoğraf binary verisi issue tablosuna gömülmemelidir.
Object storage'a yüklenip yalnızca URL / object key veritabanında tutulmalıdır.
