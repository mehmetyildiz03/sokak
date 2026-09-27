import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  parseBearerToken,
  validateLoginInput,
  validateRegistrationInput,
  verifyPassword,
} from './auth.js';

test('registration normalizes username and validates account fields', () => {
  const result = validateRegistrationInput({
    username: '  Mehmet.Yildiz_03 ',
    displayName: '  Mehmet   Yıldız ',
    password: 'uzun-ve-guclu-parola',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.username, 'mehmet.yildiz_03');
  assert.equal(result.value.displayName, 'Mehmet Yıldız');
});

test('registration rejects weak or malformed credentials', () => {
  assert.equal(validateRegistrationInput({
    username: 'ab',
    displayName: 'A',
    password: '123',
  }).ok, false);

  assert.equal(validateRegistrationInput({
    username: 'boşluk var',
    displayName: 'Geçerli Ad',
    password: '1234567890',
  }).ok, false);
});

test('password hashing verifies only the correct password', async () => {
  const password = 'güçlü-bir-parola-123';
  const stored = await hashPassword(password);

  assert.equal(await verifyPassword(password, stored.salt, stored.hash), true);
  assert.equal(await verifyPassword('yanlış-parola', stored.salt, stored.hash), false);
  assert.notEqual(stored.hash, password);
});

test('session tokens are opaque and bearer parsing is strict', () => {
  const token = createSessionToken();
  assert.ok(token.length >= 40);
  assert.equal(hashSessionToken(token).length, 64);
  assert.equal(parseBearerToken(`Bearer ${token}`), token);
  assert.equal(parseBearerToken(`Basic ${token}`), null);
});

test('login validation avoids accepting empty credentials', () => {
  assert.equal(validateLoginInput({ username: '', password: '' }).ok, false);
  assert.equal(validateLoginInput({ username: 'test_user', password: 'secret' }).ok, true);
});
