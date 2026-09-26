import type {
  Issue,
  IssueComment,
  IssueCommunitySnapshot,
  ResolutionFeedbackValue,
} from '../types';

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
  getCommunitySnapshot(issueId: string): Promise<IssueCommunitySnapshot>;
  addComment(issueId: string, body: string): Promise<IssueComment>;
  setResolutionFeedback(issueId: string, feedback: ResolutionFeedbackValue): Promise<IssueCommunitySnapshot>;
}

export class IssueRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IssueRepositoryError';
  }
}
