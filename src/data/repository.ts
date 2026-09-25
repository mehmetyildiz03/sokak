import type { Issue } from '../types';

export interface ConfirmationResult {
  issue: Issue;
  alreadyConfirmed: boolean;
}

export interface IssueRepository {
  listIssues(): Promise<Issue[]>;
  getConfirmedIssueIds(): Promise<string[]>;
  getFollowedIssueIds(): Promise<string[]>;
  createIssue(issue: Issue): Promise<Issue>;
  confirmIssue(issueId: string): Promise<ConfirmationResult>;
  setIssueFollowed(issueId: string, followed: boolean): Promise<void>;
}

export class IssueRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IssueRepositoryError';
  }
}
