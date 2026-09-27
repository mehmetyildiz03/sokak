import { getStoredAuthToken } from './authSession';
import { getOrCreateClientId } from './clientIdentity';
import type { Issue, IssueAuthority, IssueStatus } from '../types';

interface AuthorityResponse {
  organization: IssueAuthority | null;
}

interface OfficialStatusResponse {
  issue: Issue;
  organization: IssueAuthority;
}

function apiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('Kurum bilgisi yalnız ortak backend modunda kullanılabilir.');
  return value;
}

function headers(): Record<string, string> {
  const token = getStoredAuthToken();
  return {
    'Content-Type': 'application/json',
    'X-Sokak-Client-Id': getOrCreateClientId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const payload = await response.json() as { message?: string };
    if (payload.message) message = payload.message;
  } catch {
    // Ignore non-JSON error responses.
  }
  throw new Error(message);
}

export async function getIssueAuthority(issueId: string): Promise<IssueAuthority | null> {
  const response = await fetch(
    `${apiBaseUrl()}/v1/issues/${encodeURIComponent(issueId)}/authority`,
    { headers: headers() },
  );

  if (!response.ok) {
    return parseError(response, `Kurum bilgisi yüklenemedi (${response.status}).`);
  }

  const payload = await response.json() as AuthorityResponse;
  return payload.organization ?? null;
}

export async function updateOfficialIssueStatus(
  issueId: string,
  status: Extract<IssueStatus, 'İşlemde' | 'Çözüldü'>,
  note: string,
): Promise<OfficialStatusResponse> {
  const response = await fetch(
    `${apiBaseUrl()}/v1/issues/${encodeURIComponent(issueId)}/status`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ status, note }),
    },
  );

  if (!response.ok) {
    return parseError(response, `Kurum durumu güncellenemedi (${response.status}).`);
  }

  return response.json() as Promise<OfficialStatusResponse>;
}
