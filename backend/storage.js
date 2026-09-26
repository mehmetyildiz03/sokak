import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} environment variable is required.`);
  return value;
}

const client = new S3Client({
  region: requireEnv('S3_REGION'),
  endpoint: requireEnv('S3_ENDPOINT'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
  },
});

const bucket = requireEnv('S3_BUCKET');

export function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return { ok: false, message: 'Fotoğraf verisi geçersiz.' };
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    return { ok: false, message: 'Fotoğraf formatı geçersiz.' };
  }

  const contentType = match[1].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return { ok: false, message: 'Desteklenmeyen fotoğraf türü.' };
  }

  const body = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (body.length === 0 || body.length > MAX_PHOTO_BYTES) {
    return { ok: false, message: 'Fotoğraf 8 MB veya daha küçük olmalı.' };
  }

  const extension = contentType === 'image/jpeg'
    ? 'jpg'
    : contentType.split('/')[1].replace('heif', 'heif').replace('heic', 'heic');

  return { ok: true, value: { body, contentType, extension } };
}

export async function putIssuePhoto({ key, body, contentType }) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

export async function getIssuePhoto(key) {
  return client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}

export async function checkStorage() {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}
