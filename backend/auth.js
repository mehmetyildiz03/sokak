import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function validateRegistrationInput(payload) {
  const username = typeof payload?.username === 'string'
    ? payload.username.trim().toLocaleLowerCase('tr-TR')
    : '';
  const displayName = typeof payload?.displayName === 'string'
    ? payload.displayName.trim().replace(/\s+/g, ' ')
    : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';

  if (!/^[a-z0-9._]{3,30}$/.test(username)) {
    return {
      ok: false,
      message: 'Kullanıcı adı 3-30 karakter olmalı; yalnız küçük harf, rakam, nokta ve alt çizgi kullanılabilir.',
    };
  }
  if (displayName.length < 2 || displayName.length > 40) {
    return { ok: false, message: 'Görünen ad 2-40 karakter arasında olmalı.' };
  }
  if (password.length < 10 || password.length > 128) {
    return { ok: false, message: 'Parola 10-128 karakter arasında olmalı.' };
  }

  return { ok: true, value: { username, displayName, password } };
}

export function validateLoginInput(payload) {
  const username = typeof payload?.username === 'string'
    ? payload.username.trim().toLocaleLowerCase('tr-TR')
    : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';

  if (!username || !password || username.length > 30 || password.length > 128) {
    return { ok: false, message: 'Kullanıcı adı veya parola geçersiz.' };
  }

  return { ok: true, value: { username, password } };
}

export async function hashPassword(password, saltHex = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, saltHex, 64, { maxmem: 64 * 1024 * 1024 });
  return {
    salt: saltHex,
    hash: Buffer.from(derived).toString('hex'),
  };
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  if (
    typeof saltHex !== 'string' ||
    typeof expectedHashHex !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{128}$/i.test(expectedHashHex)
  ) {
    return false;
  }

  const derived = await scrypt(password, saltHex, 64, { maxmem: 64 * 1024 * 1024 });
  const actual = Buffer.from(derived);
  const expected = Buffer.from(expectedHashHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createUserId() {
  return `usr-${randomUUID()}`;
}

export function createSessionId() {
  return `ses-${randomUUID()}`;
}

export function sessionExpiry(now = Date.now()) {
  return new Date(now + SESSION_TTL_MS);
}

export function parseBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/);
  return match?.[1] ?? null;
}

export function publicUser(row, stats = {}) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
    stats: {
      reports: Number(stats.reports ?? 0),
      confirmations: Number(stats.confirmations ?? 0),
      comments: Number(stats.comments ?? 0),
      follows: Number(stats.follows ?? 0),
    },
  };
}
