import type { Issue } from '../types';

export const RECENT_MAP_ACTIVITY_MS = 15 * 60 * 1000;

function isRecent(
  timestamp: string | undefined,
  nowMs: number,
  windowMs = RECENT_MAP_ACTIVITY_MS,
): boolean {
  if (!timestamp) return false;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) && value <= nowMs && nowMs - value <= windowMs;
}

export function getIssueMapActivity(
  issue: Issue,
  nowMs = Date.now(),
): {
  recentReport: boolean;
  recentComment: boolean;
  hasComments: boolean;
} {
  return {
    recentReport: isRecent(issue.createdAt, nowMs),
    recentComment: isRecent(issue.lastCommentAt, nowMs),
    hasComments: issue.comments > 0,
  };
}
