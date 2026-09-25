import { ApiIssueRepository } from './apiIssueRepository';
import { getOrCreateClientId } from './clientIdentity';
import { IndexedDbIssueRepository } from './indexedDbIssueRepository';
import type { IssueRepository } from './repository';

export function createIssueRepository(): IssueRepository {
  const clientId = getOrCreateClientId();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');

  if (apiBaseUrl) {
    return new ApiIssueRepository(apiBaseUrl, clientId);
  }

  return new IndexedDbIssueRepository(clientId);
}
