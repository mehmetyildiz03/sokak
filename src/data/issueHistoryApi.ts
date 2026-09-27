import type { IssueHistoryEvent } from '../types';

export async function getIssueHistory(issueId: string): Promise<IssueHistoryEvent[]> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) return [];

  const response = await fetch(
    `${baseUrl}/v1/issues/${encodeURIComponent(issueId)}/history`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Süreç geçmişi yüklenemedi (${response.status}).`);
  }

  const payload = await response.json() as { events?: IssueHistoryEvent[] };
  return Array.isArray(payload.events) ? payload.events : [];
}
