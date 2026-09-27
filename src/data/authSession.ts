import type { UserProfile } from '../types';

const AUTH_KEY = 'sokak:auth:v1';

export interface StoredAuthSession {
  token: string;
  user: UserProfile;
}

export function getStoredAuthSession(): StoredAuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredAuthSession(session: StoredAuthSession | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(AUTH_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  } catch {
    // Session persistence may be unavailable; caller can still keep it in memory.
  }
}

export function getStoredAuthToken(): string | null {
  return getStoredAuthSession()?.token ?? null;
}
