import { describe, expect, it } from 'vitest';
import { getIssueMapActivity, RECENT_MAP_ACTIVITY_MS } from './mapActivity';
import type { Issue } from '../types';

const now = Date.parse('2026-09-27T12:00:00.000Z');

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'iss-test',
    lng: 30.55,
    lat: 37.76,
    category: 'road',
    categoryLabel: 'Yol',
    emoji: '🕳️',
    title: 'Test',
    place: 'Test',
    description: 'Test sorunu',
    confirms: 1,
    comments: 0,
    age: 'şimdi',
    severity: 1,
    status: 'Yeni',
    createdAt: '2026-09-27T11:55:00.000Z',
    updatedAt: '2026-09-27T11:55:00.000Z',
    ...overrides,
  };
}

describe('map activity', () => {
  it('marks a recently created issue as a recent report', () => {
    expect(getIssueMapActivity(issue(), now).recentReport).toBe(true);
  });

  it('does not keep an old report highlighted', () => {
    expect(getIssueMapActivity(issue({
      createdAt: new Date(now - RECENT_MAP_ACTIVITY_MS - 1).toISOString(),
    }), now).recentReport).toBe(false);
  });

  it('marks recent comment activity independently from issue updatedAt', () => {
    const activity = getIssueMapActivity(issue({
      comments: 3,
      updatedAt: new Date(now - 1000).toISOString(),
      lastCommentAt: new Date(now - 60_000).toISOString(),
    }), now);

    expect(activity.hasComments).toBe(true);
    expect(activity.recentComment).toBe(true);
  });

  it('does not infer comments from a generic issue update', () => {
    const activity = getIssueMapActivity(issue({
      comments: 2,
      updatedAt: new Date(now - 1000).toISOString(),
      lastCommentAt: undefined,
    }), now);

    expect(activity.hasComments).toBe(true);
    expect(activity.recentComment).toBe(false);
  });
});
