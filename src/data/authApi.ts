import { getOrCreateClientId } from './clientIdentity';
import {
  getStoredAuthSession,
  setStoredAuthSession,
  type StoredAuthSession,
} from './authSession';
import type { UserProfile } from '../types';

interface AuthResponse {
  token: string;
  user: UserProfile;
}

interface MeResponse {
  user: UserProfile;
}

function apiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('Hesap sistemi yalnız ortak backend modunda kullanılabilir.');
  return value;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getStoredAuthSession();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Sokak-Client-Id': getOrCreateClientId(),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Hesap isteği başarısız oldu (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function registerAccount(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<StoredAuthSession> {
  const result = await request<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const session = { token: result.token, user: result.user };
  setStoredAuthSession(session);
  return session;
}

export async function loginAccount(input: {
  username: string;
  password: string;
}): Promise<StoredAuthSession> {
  const result = await request<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const session = { token: result.token, user: result.user };
  setStoredAuthSession(session);
  return session;
}

export async function refreshAccount(): Promise<UserProfile> {
  const result = await request<MeResponse>('/v1/auth/me');
  const current = getStoredAuthSession();
  if (current) {
    setStoredAuthSession({ ...current, user: result.user });
  }
  return result.user;
}

export async function claimDeviceHistory(): Promise<UserProfile> {
  const result = await request<MeResponse>('/v1/auth/claim-device', {
    method: 'POST',
  });
  const current = getStoredAuthSession();
  if (current) {
    setStoredAuthSession({ ...current, user: result.user });
  }
  return result.user;
}

export async function logoutAccount(): Promise<void> {
  try {
    await request<{ ok: true }>('/v1/auth/logout', { method: 'POST' });
  } finally {
    setStoredAuthSession(null);
  }
}
