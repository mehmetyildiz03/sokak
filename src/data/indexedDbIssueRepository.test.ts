import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbIssueRepository } from './indexedDbIssueRepository';
import type { Issue } from '../types';

let sequence = 0;

function dbName(label: string): string {
  sequence += 1;
  return `sokak-test-${label}-${sequence}`;
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  const now = new Date().toISOString();
  return {
    id: `iss-test-${sequence}-${Date.now()}`,
    lng: 30.5566,
    lat: 37.7648,
    category: 'road',
    categoryLabel: 'Yol / Asfalt',
    emoji: '🕳️',
    title: 'Test çukuru',
    place: 'Test Sokak',
    description: 'Kalıcı veri testi için oluşturulan sorun.',
    confirms: 1,
    comments: 0,
    age: 'şimdi',
    severity: 1,
    status: 'Yeni',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('IndexedDbIssueRepository persistence', () => {
  it('persists a created issue, its photo and author confirmation across repository instances', async () => {
    const name = dbName('reload');
    const author = new IndexedDbIssueRepository('client-author', name);
    const photoUrl = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
    const issue = makeIssue({ id: 'iss-persisted', photoUrl });

    await author.createIssue(issue);

    const afterReload = new IndexedDbIssueRepository('client-author', name);
    const issues = await afterReload.listIssues();
    const confirmedIds = await afterReload.getConfirmedIssueIds();
    const stored = issues.find((item) => item.id === issue.id);

    expect(stored).toBeDefined();
    expect(stored?.photoUrl).toBe(photoUrl);
    expect(stored?.description).toBe(issue.description);
    expect(confirmedIds).toContain(issue.id);
  });

  it('keeps confirmation idempotent after a reload', async () => {
    const name = dbName('idempotent');
    const author = new IndexedDbIssueRepository('client-author', name);
    const issue = makeIssue({ id: 'iss-idempotent' });
    await author.createIssue(issue);

    const verifier = new IndexedDbIssueRepository('client-verifier', name);
    const first = await verifier.confirmIssue(issue.id);

    expect(first.alreadyConfirmed).toBe(false);
    expect(first.issue.confirms).toBe(2);
    expect(first.issue.status).toBe('Doğrulandı');

    const verifierAfterReload = new IndexedDbIssueRepository('client-verifier', name);
    const second = await verifierAfterReload.confirmIssue(issue.id);

    expect(second.alreadyConfirmed).toBe(true);
    expect(second.issue.confirms).toBe(2);

    const issues = await verifierAfterReload.listIssues();
    expect(issues.find((item) => item.id === issue.id)?.confirms).toBe(2);
  });

  it('does not reseed over a modified demo issue when the database is reopened', async () => {
    const name = dbName('seed');
    const firstClient = new IndexedDbIssueRepository('client-a', name);
    const initial = await firstClient.listIssues();

    expect(initial).toHaveLength(5);

    const secondClient = new IndexedDbIssueRepository('client-b', name);
    const confirmed = await secondClient.confirmIssue('iss-4');

    expect(confirmed.issue.confirms).toBe(2);
    expect(confirmed.issue.status).toBe('Doğrulandı');

    const reopened = new IndexedDbIssueRepository('client-c', name);
    const afterReload = await reopened.listIssues();
    const issue = afterReload.find((item) => item.id === 'iss-4');

    expect(afterReload).toHaveLength(5);
    expect(issue?.confirms).toBe(2);
    expect(issue?.status).toBe('Doğrulandı');
  });

  it('rejects confirmations for resolved issues without changing their count', async () => {
    const name = dbName('resolved');
    const author = new IndexedDbIssueRepository('client-author', name);
    const issue = makeIssue({
      id: 'iss-resolved',
      status: 'Çözüldü',
      confirms: 4,
    });

    await author.createIssue(issue);

    const verifier = new IndexedDbIssueRepository('client-other', name);

    await expect(verifier.confirmIssue(issue.id)).rejects.toThrow(
      'Çözülmüş bir sorun yeniden doğrulanamaz.',
    );

    const stored = (await verifier.listIssues()).find((item) => item.id === issue.id);
    expect(stored?.confirms).toBe(4);
    expect(stored?.status).toBe('Çözüldü');
  });
});
