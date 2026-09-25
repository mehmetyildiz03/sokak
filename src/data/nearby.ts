import type { Issue, Point } from '../types';
import { distanceMeters } from '../utils';

export interface NearbyIssue {
  issue: Issue;
  distanceMeters: number;
}

export type NearbyFilter = 'open' | 'all';

export function getNearbyIssues(
  issues: Issue[],
  origin: Point,
  filter: NearbyFilter,
): NearbyIssue[] {
  return issues
    .filter((issue) => filter === 'all' || issue.status !== 'Çözüldü')
    .map((issue) => ({
      issue,
      distanceMeters: distanceMeters(origin.lat, origin.lng, issue.lat, issue.lng),
    }))
    .sort((a, b) => {
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
      return b.issue.confirms - a.issue.confirms;
    });
}

export function formatDistance(distance: number): string {
  if (distance < 1000) {
    return `${Math.max(1, Math.round(distance))} m`;
  }

  const km = distance / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
