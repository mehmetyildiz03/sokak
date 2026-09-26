import { IssueRepositoryError, type ConfirmationResult, type IssueRepository } from './repository';
import { formatIssueAge } from './time';
import type {
  Issue,
  IssueComment,
  IssueCommunitySnapshot,
  ResolutionFeedbackValue,
} from '../types';

interface IssueIdListResponse {
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

  async listIssues(): Promise<Issue[]> {
    const issues = await this.request<Issue[]>('/v1/issues');
    return issues.map((issue) => ({
      ...issue,
      age: formatIssueAge(issue.createdAt, issue.age),
    }));
  }

  async getConfirmedIssueIds(): Promise<string[]> {
    const response = await this.request<IssueIdListResponse>('/v1/me/confirmations');
    return response.issueIds;
  }

  async getFollowedIssueIds(): Promise<string[]> {
    const response = await this.request<IssueIdListResponse>('/v1/me/follows');
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

  async setIssueFollowed(issueId: string, followed: boolean): Promise<void> {
    await this.request<{ followed: boolean }>(`/v1/issues/${encodeURIComponent(issueId)}/follow`, {
      method: followed ? 'PUT' : 'DELETE',
    });
  }

  getCommunitySnapshot(issueId: string): Promise<IssueCommunitySnapshot> {
    return this.request<IssueCommunitySnapshot>(
      `/v1/issues/${encodeURIComponent(issueId)}/community`,
    );
  }

  addComment(issueId: string, body: string): Promise<IssueComment> {
    return this.request<IssueComment>(
      `/v1/issues/${encodeURIComponent(issueId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      },
    );
  }

  setResolutionFeedback(
    issueId: string,
    feedback: ResolutionFeedbackValue,
  ): Promise<IssueCommunitySnapshot> {
    return this.request<IssueCommunitySnapshot>(
      `/v1/issues/${encodeURIComponent(issueId)}/resolution-feedback`,
      {
        method: 'PUT',
        body: JSON.stringify({ feedback }),
      },
    );
  }
}
