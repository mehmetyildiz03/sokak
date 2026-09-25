# Sokak backend contract

Bu klasör v0.3'te yalnızca backend sözleşmesini ve gelecekteki PostgreSQL şemasını tanımlar.
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

## Kimlik stratejisi

v0.3 yerel aşamada anonim `clientId` kullanılır. Gerçek hesap sistemi geldiğinde repository sözleşmesi korunup header yerine authenticated user id kullanılacaktır.

## Fotoğraflar

Frontend şu anda IndexedDB'de data URL saklar. Production backend'de fotoğraf binary verisi issue tablosuna gömülmemelidir.
Object storage'a yüklenip yalnızca URL / object key veritabanında tutulmalıdır.
