import { describe, expect, it } from 'vitest';
import { countActiveMapFilters, emptyMapFilters, filterMapIssues } from './mapFilters';
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
  description: 'Test',
  confirms: 1,
  comments: 0,
  age: 'şimdi',
  severity: 1,
  status: 'Yeni',
};

const issues: Issue[] = [
  { ...base, id: 'road-new' },
  { ...base, id: 'light-working', category: 'light', categoryLabel: 'Aydınlatma', status: 'İşlemde' },
  { ...base, id: 'road-resolved', status: 'Çözüldü' },
];

describe('map filters', () => {
  it('returns all issues when no filter is active', () => {
    expect(filterMapIssues(issues, emptyMapFilters, [])).toHaveLength(3);
  });

  it('combines category and status filters', () => {
    const result = filterMapIssues(issues, {
      categories: ['road'],
      statuses: ['Yeni'],
      followedOnly: false,
    }, []);

    expect(result.map((issue) => issue.id)).toEqual(['road-new']);
  });

  it('supports followed-only without changing stored data', () => {
    const result = filterMapIssues(issues, {
      categories: [],
      statuses: [],
      followedOnly: true,
    }, ['light-working']);

    expect(result.map((issue) => issue.id)).toEqual(['light-working']);
    expect(issues).toHaveLength(3);
  });

  it('counts individual active filter selections', () => {
    expect(countActiveMapFilters({
      categories: ['road', 'light'],
      statuses: ['İşlemde'],
      followedOnly: true,
    })).toBe(4);
  });
});
