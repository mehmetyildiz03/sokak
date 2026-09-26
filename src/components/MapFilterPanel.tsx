import {
  emptyMapFilters,
  issueCategoryOptions,
  issueStatusOptions,
  type MapFilterState,
} from '../data/mapFilters';
import type { IssueCategory, IssueStatus } from '../types';

interface MapFilterPanelProps {
  open: boolean;
  filters: MapFilterState;
  visibleCount: number;
  totalCount: number;
  followedCount: number;
  onChange: (filters: MapFilterState) => void;
  onClose: () => void;
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function MapFilterPanel({
  open,
  filters,
  visibleCount,
  totalCount,
  followedCount,
  onChange,
  onClose,
}: MapFilterPanelProps) {
  if (!open) return null;

  const toggleCategory = (category: IssueCategory) => {
    onChange({ ...filters, categories: toggleValue(filters.categories, category) });
  };

  const toggleStatus = (status: IssueStatus) => {
    onChange({ ...filters, statuses: toggleValue(filters.statuses, status) });
  };

  return (
    <section className="map-filter-panel glass" aria-label="Harita filtreleri">
      <header className="map-filter-header">
        <div>
          <span className="eyebrow">Harita görünümü</span>
          <strong>Filtreler</strong>
        </div>
        <button className="filter-close" type="button" onClick={onClose} aria-label="Filtreleri kapat">×</button>
      </header>

      <div className="filter-result">
        <strong>{visibleCount}</strong>
        <span>/ {totalCount} kayıt gösteriliyor</span>
      </div>

      <fieldset className="filter-group">
        <legend>Kategori</legend>
        <div className="filter-chip-grid">
          {issueCategoryOptions.map((option) => {
            const active = filters.categories.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                className={`filter-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleCategory(option.key)}
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend>Durum</legend>
        <div className="filter-status-grid">
          {issueStatusOptions.map((status) => {
            const active = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={`filter-status ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleStatus(status)}
              >
                {status}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        className={`follow-only-filter ${filters.followedOnly ? 'active' : ''}`}
        aria-pressed={filters.followedOnly}
        onClick={() => onChange({ ...filters, followedOnly: !filters.followedOnly })}
        disabled={followedCount === 0}
      >
        <span aria-hidden="true">{filters.followedOnly ? '♥' : '♡'}</span>
        <span>
          <strong>Yalnız takip ettiklerim</strong>
          <small>{followedCount > 0 ? `${followedCount} takip edilen kayıt` : 'Henüz takip edilen kayıt yok'}</small>
        </span>
      </button>

      <button
        type="button"
        className="filter-reset"
        onClick={() => onChange(emptyMapFilters)}
      >
        Tüm filtreleri temizle
      </button>
    </section>
  );
}
