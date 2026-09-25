import type { Issue } from '../types';

export interface ConfirmationResult {
  issue: Issue;
  alreadyConfirmed: boolean;
}

export interface IssueRepository {
  listIssues(): Promise<Issue[]>;
  getConfirmedIssueIds(): Promise<string[]>;
  createIssue(issue: Issue): Promise<Issue>;
  confirmIssue(issueId: string): Promise<ConfirmationResult>;
}

export class IssueRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IssueRepositoryError';
  }
}
