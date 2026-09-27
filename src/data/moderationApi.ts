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
