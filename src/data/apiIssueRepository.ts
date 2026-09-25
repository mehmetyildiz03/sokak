import { IssueRepositoryError, type ConfirmationResult, type IssueRepository } from './repository';
import type { Issue } from '../types';

interface ConfirmationListResponse {
  issueIds: string[];
}

export class ApiIssueRepository implements IssueRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Sokak-Client-Id': this.clientId,
        ...init?.headers,
      },
    });

    if (!response.ok) {
      let message = `API isteği başarısız oldu (${response.status}).`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = payload.message;
      } catch {
        // Response body may be empty or non-JSON.
      }
      throw new IssueRepositoryError(message);
    }

    return response.json() as Promise<T>;
  }

  listIssues(): Promise<Issue[]> {
    return this.request<Issue[]>('/v1/issues');
  }

  async getConfirmedIssueIds(): Promise<string[]> {
    const response = await this.request<ConfirmationListResponse>('/v1/me/confirmations');
    return response.issueIds;
  }

  createIssue(issue: Issue): Promise<Issue> {
    return this.request<Issue>('/v1/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    });
  }

  confirmIssue(issueId: string): Promise<ConfirmationResult> {
    return this.request<ConfirmationResult>(`/v1/issues/${encodeURIComponent(issueId)}/confirmations`, {
      method: 'POST',
    });
  }
}
