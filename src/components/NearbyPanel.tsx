import { useMemo, useState } from 'react';
import { formatDistance, getNearbyIssues, type NearbyFilter } from '../data/nearby';
import type { Issue, Point } from '../types';

interface NearbyPanelProps {
  issues: Issue[];
  origin: Point;
  locationSource: 'device' | 'map';
  locating: boolean;
  onUseDeviceLocation: () => void;
  onSelectIssue: (id: string) => void;
}

export function NearbyPanel({
  issues,
  origin,
  locationSource,
  locating,
  onUseDeviceLocation,
  onSelectIssue,
}: NearbyPanelProps) {
  const [filter, setFilter] = useState<NearbyFilter>('open');

  const nearby = useMemo(
    () => getNearbyIssues(issues, origin, filter),
    [issues, origin, filter],
  );

  const openCount = useMemo(
    () => issues.filter((issue) => issue.status !== 'Çözüldü').length,
    [issues],
  );

  return (
    <section className="nearby-panel" aria-labelledby="nearbyTitle">
      <header className="nearby-header">
        <div>
          <span className="eyebrow">Çevrendeki kayıtlar</span>
          <h1 id="nearbyTitle">Yakınımda</h1>
        </div>
        <button
          className="nearby-location-btn"
          type="button"
          onClick={onUseDeviceLocation}
          disabled={locating}
        >
          <span aria-hidden="true">⌖</span>
          {locating ? 'Konum alınıyor…' : locationSource === 'device' ? 'Konumun kullanılıyor' : 'Konumumu kullan'}
        </button>
      </header>

      <div className="nearby-origin">
        <span className={`origin-indicator ${locationSource}`} aria-hidden="true" />
        <div>
          <strong>{locationSource === 'device' ? 'Cihaz konumuna göre' : 'Harita merkezine göre'}</strong>
          <small>
            {locationSource === 'device'
              ? 'Mesafeler son alınan cihaz konumundan hesaplanıyor.'
              : 'Konum izni olmadan haritanın son merkezi referans alınır.'}
          </small>
        </div>
      </div>

      <div className="nearby-toolbar">
        <div className="nearby-filter" role="group" aria-label="Yakındaki sorun filtresi">
          <button
            type="button"
            className={filter === 'open' ? 'active' : ''}
            onClick={() => setFilter('open')}
            aria-pressed={filter === 'open'}
          >
            Açık <span>{openCount}</span>
          </button>
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
          >
            Tümü <span>{issues.length}</span>
          </button>
        </div>
        <small>En yakından uzağa</small>
      </div>

      <div className="nearby-list">
        {nearby.length === 0 ? (
          <div className="nearby-empty">
            <span aria-hidden="true">✓</span>
            <strong>Bu görünümde sorun yok</strong>
            <p>Filtreyi “Tümü” yaparak çözülmüş kayıtları da görebilirsin.</p>
          </div>
        ) : nearby.map(({ issue, distanceMeters }) => (
          <button
            type="button"
            className="nearby-card"
            key={issue.id}
            onClick={() => onSelectIssue(issue.id)}
          >
            <span
              className={`nearby-thumb ${issue.photoUrl ? 'has-photo' : ''}`}
              style={issue.photoUrl ? { backgroundImage: `url(${issue.photoUrl})` } : undefined}
              aria-hidden="true"
            >
              {!issue.photoUrl && issue.emoji}
            </span>
            <span className="nearby-copy">
              <span className="nearby-card-top">
                <span className="nearby-category">{issue.categoryLabel}</span>
                <strong className="nearby-distance">{formatDistance(distanceMeters)}</strong>
              </span>
              <strong className="nearby-title">{issue.title}</strong>
              <span className="nearby-place">{issue.place}</span>
              <span className="nearby-meta">
                <span className={`nearby-status status-${issue.status.toLowerCase().replaceAll(' ', '-')}`}>
                  {issue.status}
                </span>
                <span>👥 {issue.confirms}</span>
                <span>◷ {issue.age}</span>
              </span>
            </span>
            <span className="nearby-chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}
