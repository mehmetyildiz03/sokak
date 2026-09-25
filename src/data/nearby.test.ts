import { describe, expect, it } from 'vitest';
import { formatDistance, getNearbyIssues } from './nearby';
import type { Issue } from '../types';

const base: Issue = {
  id: 'base',
  lng: 30.5566,
  lat: 37.7648,
  category: 'road',
  categoryLabel: 'Yol / Asfalt',
  emoji: '🕳️',
  title: 'Sorun',
  place: 'Test',
  description: 'Test sorunu',
  confirms: 1,
  comments: 0,
  age: 'şimdi',
  severity: 1,
  status: 'Yeni',
};

describe('nearby issue model', () => {
  it('sorts issues by distance', () => {
    const issues: Issue[] = [
      { ...base, id: 'far', lat: 37.7748 },
      { ...base, id: 'near', lat: 37.7650 },
      { ...base, id: 'middle', lat: 37.7680 },
    ];

    expect(getNearbyIssues(issues, base, 'open').map((item) => item.issue.id))
      .toEqual(['near', 'middle', 'far']);
  });

  it('hides resolved issues in open filter but keeps them in all', () => {
    const resolved = { ...base, id: 'resolved', status: 'Çözüldü' as const };
    const open = { ...base, id: 'open', lat: 37.7650 };

    expect(getNearbyIssues([resolved, open], base, 'open').map((item) => item.issue.id))
      .toEqual(['open']);
    expect(getNearbyIssues([resolved, open], base, 'all')).toHaveLength(2);
  });

  it('formats walking-scale and kilometre distances clearly', () => {
    expect(formatDistance(249.4)).toBe('249 m');
    expect(formatDistance(1240)).toBe('1.2 km');
    expect(formatDistance(12400)).toBe('12 km');
  });
});
