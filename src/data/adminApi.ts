import { getStoredAuthToken } from './authSession';
import { getOrCreateClientId } from './clientIdentity';

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  kind: 'municipality' | 'utility' | 'other';
  verifiedAt: string;
  createdAt: string;
  memberCount: number;
  assignedIssueCount: number;
}

function apiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('Kurum yönetimi yalnız ortak backend modunda kullanılabilir.');
  return value;
}

function requestHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  if (!token) throw new Error('Kurum yönetimi için giriş yapmalısın.');
  return {
    'Content-Type': 'application/json',
    'X-Sokak-Client-Id': getOrCreateClientId(),
    Authorization: `Bearer ${token}`,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...requestHeaders(),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Kurum yönetimi isteği başarısız oldu (${response.status}).`;
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

export async function listAdminOrganizations(): Promise<AdminOrganization[]> {
  const result = await request<{ organizations: AdminOrganization[] }>('/v1/admin/organizations');
  return result.organizations;
}

export async function createAdminOrganization(input: {
  name: string;
  slug: string;
  kind: AdminOrganization['kind'];
}): Promise<AdminOrganization> {
  return request<AdminOrganization>('/v1/admin/organizations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function addOrganizationMember(
  organizationId: string,
  input: { username: string; role: 'official' | 'org_admin' },
): Promise<void> {
  await request(
    `/v1/admin/organizations/${encodeURIComponent(organizationId)}/memberships`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function assignIssueToOrganization(
  issueId: string,
  organizationId: string,
): Promise<void> {
  await request(
    `/v1/admin/issues/${encodeURIComponent(issueId)}/assignment`,
    {
      method: 'PUT',
      body: JSON.stringify({ organizationId }),
    },
  );
}
