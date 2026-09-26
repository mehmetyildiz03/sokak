import test from 'node:test';
import assert from 'node:assert/strict';

process.env.S3_REGION ??= 'auto';
process.env.S3_ENDPOINT ??= 'https://example.invalid';
process.env.S3_ACCESS_KEY_ID ??= 'test-access-key';
process.env.S3_SECRET_ACCESS_KEY ??= 'test-secret-key';
process.env.S3_BUCKET ??= 'test-bucket';

const { decodeImageDataUrl } = await import('./storage.js');

test('photo decoder accepts supported data URLs', () => {
  const result = decodeImageDataUrl('data:image/png;base64,aGVsbG8=');
  assert.equal(result.ok, true);
  assert.equal(result.value.contentType, 'image/png');
  assert.equal(result.value.body.toString('utf8'), 'hello');
});

test('photo decoder rejects unsupported content types', () => {
  const result = decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  assert.equal(result.ok, false);
});

test('photo decoder rejects malformed data URLs', () => {
  assert.equal(decodeImageDataUrl('https://example.com/image.png').ok, false);
});
