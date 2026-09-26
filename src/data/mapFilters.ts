import type { Issue, IssueCategory, IssueStatus } from '../types';

export interface MapFilterState {
  categories: IssueCategory[];
  statuses: IssueStatus[];
  followedOnly: boolean;
}

export const issueCategoryOptions: Array<{ key: IssueCategory; label: string; emoji: string }> = [
  { key: 'road', label: 'Yol / Asfalt', emoji: '🕳️' },
  { key: 'light', label: 'Aydınlatma', emoji: '💡' },
  { key: 'trash', label: 'Çöp / Temizlik', emoji: '🗑️' },
  { key: 'sidewalk', label: 'Kaldırım', emoji: '🚧' },
  { key: 'water', label: 'Su / Kanalizasyon', emoji: '💧' },
  { key: 'park', label: 'Park / Yeşil alan', emoji: '🌳' },
];

export const issueStatusOptions: IssueStatus[] = [
  'Yeni',
  'Doğrulandı',
  'Uzun süredir açık',
  'İşlemde',
  'Çözüldü',
];

export const emptyMapFilters: MapFilterState = {
  categories: [],
  statuses: [],
  followedOnly: false,
};

export function filterMapIssues(
  issues: Issue[],
  filters: MapFilterState,
  followedIssueIds: string[],
): Issue[] {
  const followed = new Set(followedIssueIds);
  const categories = new Set(filters.categories);
  const statuses = new Set(filters.statuses);

  return issues.filter((issue) => {
    if (categories.size > 0 && !categories.has(issue.category)) return false;
    if (statuses.size > 0 && !statuses.has(issue.status)) return false;
    if (filters.followedOnly && !followed.has(issue.id)) return false;
    return true;
  });
}

export function countActiveMapFilters(filters: MapFilterState): number {
  return filters.categories.length + filters.statuses.length + (filters.followedOnly ? 1 : 0);
}

export function hasActiveMapFilters(filters: MapFilterState): boolean {
  return countActiveMapFilters(filters) > 0;
}
