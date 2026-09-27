import { getStoredAuthToken } from './authSession';
import { getOrCreateClientId } from './clientIdentity';

export type NotificationType = 'comment' | 'status' | 'moderation';

export interface CivicNotification {
  id: string;
  issueId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSnapshot {
  unreadCount: number;
  notifications: CivicNotification[];
}

function baseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('Bildirimler yalnız ortak backend modunda kullanılabilir.');
  return value;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredAuthToken();
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Sokak-Client-Id': getOrCreateClientId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Bildirim isteği başarısız oldu (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Ignore non-JSON responses.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function listNotifications(limit = 50): Promise<NotificationSnapshot> {
  return request<NotificationSnapshot>(
    `/v1/me/notifications?limit=${Math.max(1, Math.min(100, Math.trunc(limit)))}`,
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/v1/me/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PUT',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request('/v1/me/notifications/read-all', {
    method: 'POST',
  });
}
