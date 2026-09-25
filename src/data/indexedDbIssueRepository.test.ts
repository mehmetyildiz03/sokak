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

function createLegacyV1Database(name: string, issue: Issue): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const issues = db.createObjectStore('issues', { keyPath: 'id' });
      const confirmations = db.createObjectStore('confirmations', { keyPath: 'key' });
      confirmations.createIndex('by-client', 'clientId', { unique: false });
      confirmations.createIndex('by-issue', 'issueId', { unique: false });
      const meta = db.createObjectStore('meta', { keyPath: 'key' });

      issues.put(issue);
      meta.put({ key: 'seed:v1', value: new Date().toISOString() });
    };

    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
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

  it('persists follow and unfollow state across repository instances', async () => {
    const name = dbName('follow');
    const client = new IndexedDbIssueRepository('client-follower', name);
    const issue = makeIssue({ id: 'iss-followed' });
    await client.createIssue(issue);

    await client.setIssueFollowed(issue.id, true);

    const reopened = new IndexedDbIssueRepository('client-follower', name);
    expect(await reopened.getFollowedIssueIds()).toContain(issue.id);

    await reopened.setIssueFollowed(issue.id, false);

    const afterUnfollow = new IndexedDbIssueRepository('client-follower', name);
    expect(await afterUnfollow.getFollowedIssueIds()).not.toContain(issue.id);
  });

  it('upgrades a v1 database to v2 without losing existing issue data', async () => {
    const name = dbName('migration');
    const legacyIssue = makeIssue({ id: 'iss-legacy', title: 'v1 kaydı' });
    await createLegacyV1Database(name, legacyIssue);

    const upgraded = new IndexedDbIssueRepository('client-upgraded', name);
    const issues = await upgraded.listIssues();

    expect(issues.find((issue) => issue.id === legacyIssue.id)?.title).toBe('v1 kaydı');
    expect(await upgraded.getFollowedIssueIds()).toEqual([]);

    await upgraded.setIssueFollowed(legacyIssue.id, true);
    expect(await upgraded.getFollowedIssueIds()).toEqual([legacyIssue.id]);
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
