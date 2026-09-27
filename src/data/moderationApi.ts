import { getOrCreateClientId } from './clientIdentity';
import { getStoredAuthSession } from './authSession';

export type ModerationTargetType = 'issue' | 'comment';
export type ModerationReason =
  | 'false_information'
  | 'harassment'
  | 'personal_info'
  | 'spam'
  | 'other';

export interface ModerationReportInput {
  targetType: ModerationTargetType;
  targetId: string;
  reason: ModerationReason;
  note?: string;
}

export async function submitModerationReport(input: ModerationReportInput): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  const session = getStoredAuthSession();

  if (!baseUrl) throw new Error('Raporlama yalnız ortak backend modunda kullanılabilir.');
  if (!session?.token) throw new Error('İçeriği raporlamak için giriş yapmalısın.');

  const response = await fetch(`${baseUrl}/v1/moderation/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sokak-Client-Id': getOrCreateClientId(),
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let message = `Rapor gönderilemedi (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Ignore non-JSON error responses.
    }
    throw new Error(message);
  }
}


export type ModerationStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface ModerationQueueItem {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  targetPreview: string | null;
  reason: ModerationReason;
  note: string | null;
  status: ModerationStatus;
  moderatorNote: string | null;
  actionTaken: 'none' | 'hide' | 'restore';
  targetHidden: boolean;
  reviewedAt: string | null;
  createdAt: string;
  reporter: {
    username: string;
    displayName: string;
  };
}

async function moderationRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  const session = getStoredAuthSession();

  if (!baseUrl) throw new Error('Moderasyon yalnız ortak backend modunda kullanılabilir.');
  if (!session?.token) throw new Error('Moderasyon için giriş yapmalısın.');

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Sokak-Client-Id': getOrCreateClientId(),
      Authorization: `Bearer ${session.token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Moderasyon isteği başarısız oldu (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Ignore non-JSON errors.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function listModerationReports(
  status: ModerationStatus | 'all' = 'open',
): Promise<ModerationQueueItem[]> {
  const result = await moderationRequest<{ reports: ModerationQueueItem[] }>(
    `/v1/moderation/reports?status=${encodeURIComponent(status)}`,
  );
  return result.reports;
}

export async function reviewModerationReport(
  id: string,
  status: Exclude<ModerationStatus, 'open'>,
  moderatorNote?: string,
  contentAction: 'none' | 'hide' | 'restore' = 'none',
): Promise<void> {
  await moderationRequest(
    `/v1/moderation/reports/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, moderatorNote, contentAction }),
    },
  );
}
