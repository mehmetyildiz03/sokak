import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { MapFilterPanel } from './components/MapFilterPanel';
import { FollowPanel } from './components/FollowPanel';
import { IssueSheet } from './components/IssueSheet';
import { NearbyPanel } from './components/NearbyPanel';
import { ReportFlow } from './components/ReportFlow';
import { createIssueRepository } from './data/createIssueRepository';
import { initialIssues } from './data/issues';
import {
  countActiveMapFilters,
  emptyMapFilters,
  filterMapIssues,
  type MapFilterState,
} from './data/mapFilters';
import type {
  Issue,
  IssueComment,
  IssueCommunitySnapshot,
  MapMode,
  Point,
  ReportDraft,
  ResolutionFeedbackValue,
} from './types';

const initialCenter: Point = { lng: 30.5566, lat: 37.7648 };
const sharedBackendEnabled = Boolean(import.meta.env.VITE_API_BASE_URL?.trim());

function createIssueId(): string {
  return typeof crypto.randomUUID === 'function'
    ? `iss-${crypto.randomUUID()}`
    : `iss-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const repository = useMemo(() => createIssueRepository(), []);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [confirmedIssueIds, setConfirmedIssueIds] = useState<string[]>([]);
  const [followedIssueIds, setFollowedIssueIds] = useState<string[]>([]);
  const [mode, setMode] = useState<MapMode>('issues');
  const [mapFilters, setMapFilters] = useState<MapFilterState>(emptyMapFilters);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeView, setActiveView] = useState<'map' | 'nearby' | 'following'>('map');
  const [center, setCenter] = useState<Point>(initialCenter);
  const [nearbyOrigin, setNearbyOrigin] = useState<Point>(initialCenter);
  const [nearbyDeviceOrigin, setNearbyDeviceOrigin] = useState<Point | null>(null);
  const [nearbyLocationSource, setNearbyLocationSource] = useState<'device' | 'map'>('map');
  const [nearbyLocating, setNearbyLocating] = useState(false);
  const [nearbyAutoLocationTried, setNearbyAutoLocationTried] = useState(false);
  const [focus, setFocus] = useState<(Point & { key: number }) | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [toast, setToast] = useState('');
  const [communityByIssueId, setCommunityByIssueId] = useState<Record<string, IssueCommunitySnapshot>>({});
  const [communityLoadingIssueId, setCommunityLoadingIssueId] = useState<string | null>(null);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  const visibleMapIssues = useMemo(
    () => filterMapIssues(issues, mapFilters, followedIssueIds),
    [issues, mapFilters, followedIssueIds],
  );

  const activeMapFilterCount = useMemo(
    () => countActiveMapFilters(mapFilters),
    [mapFilters],
  );

  const notify = (message: string) => setToast(message);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      repository.listIssues(),
      repository.getConfirmedIssueIds(),
      repository.getFollowedIssueIds(),
    ]).then(([storedIssues, confirmedIds, followedIds]) => {
      if (cancelled) return;
      setIssues(storedIssues);
      setConfirmedIssueIds(confirmedIds);
      setFollowedIssueIds(followedIds);
    }).catch(() => {
      if (cancelled) return;
      setPersistenceAvailable(false);
      setIssues(initialIssues);
      notify(sharedBackendEnabled
        ? 'Ortak sunucuya ulaşılamadı; bu oturum geçici modda çalışıyor.'
        : 'Yerel veri deposu açılamadı; bu oturum geçici modda çalışıyor.');
    }).finally(() => {
      if (!cancelled) setDataReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedIssueId) return;

    let cancelled = false;
    setCommunityLoadingIssueId(selectedIssueId);

    void repository.getCommunitySnapshot(selectedIssueId)
      .then((snapshot) => {
        if (cancelled) return;
        setCommunityByIssueId((current) => ({
          ...current,
          [selectedIssueId]: snapshot,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setCommunityByIssueId((current) => ({
          ...current,
          [selectedIssueId]: current[selectedIssueId] ?? {
            comments: [],
            resolution: {
              resolvedCount: 0,
              stillOpenCount: 0,
              myFeedback: null,
            },
          },
        }));
      })
      .finally(() => {
        if (!cancelled) setCommunityLoadingIssueId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [repository, selectedIssueId]);

  const requestLocation = (): Promise<Point> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lng: coords.longitude, lat: coords.latitude };
        setCenter(point);
        setFocus({ ...point, key: Date.now() });
        resolve(point);
      },
      reject,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

  const locateFromHeader = async () => {
    try {
      await requestLocation();
      notify('Konumuna gidildi.');
    } catch {
      notify('Konum alınamadı. Tarayıcı izinlerini kontrol et.');
    }
  };

  const useDeviceLocationForNearby = async () => {
    if (nearbyLocating) return;
    setNearbyLocating(true);
    try {
      const point = await requestLocation();
      setNearbyDeviceOrigin(point);
      setNearbyOrigin(point);
      setNearbyLocationSource('device');
      notify('Yakındaki sorunlar konumuna göre sıralandı.');
    } catch {
      setNearbyLocationSource('map');
      notify('Konum alınamadı; harita merkezi referans olarak kullanılıyor.');
    } finally {
      setNearbyLocating(false);
    }
  };

  const openNearby = () => {
    setSelectedIssueId(null);
    setReportOpen(false);
    setFilterPanelOpen(false);
    setActiveView('nearby');

    if (nearbyDeviceOrigin) {
      setNearbyOrigin(nearbyDeviceOrigin);
      setNearbyLocationSource('device');
      return;
    }

    setNearbyOrigin(center);
    setNearbyLocationSource('map');

    if (!nearbyAutoLocationTried) {
      setNearbyAutoLocationTried(true);
      void useDeviceLocationForNearby();
    }
  };

  const confirmIssue = async (id: string) => {
    if (confirmedIssueIds.includes(id)) {
      notify('Bu sorunu zaten doğruladın.');
      return;
    }

    if (!persistenceAvailable) {
      setIssues((current) => current.map((issue) => {
        if (issue.id !== id) return issue;
        const confirms = issue.confirms + 1;
        return {
          ...issue,
          confirms,
          status: issue.status === 'Yeni' && confirms >= 2 ? 'Doğrulandı' : issue.status,
        };
      }));
      setConfirmedIssueIds((current) => [...current, id]);
      notify('Doğrulama bu oturum için kaydedildi.');
      return;
    }

    try {
      const result = await repository.confirmIssue(id);

      setIssues((current) => current.map((issue) =>
        issue.id === id ? result.issue : issue,
      ));

      setConfirmedIssueIds((current) =>
        current.includes(id) ? current : [...current, id],
      );

      notify(result.alreadyConfirmed
        ? 'Bu sorunu zaten doğruladın.'
        : 'Doğrulaman kaydedildi. Teşekkürler.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Doğrulama kaydedilemedi.');
    }
  };

  const addCommunityComment = async (issueId: string, body: string): Promise<void> => {
    const trimmed = body.trim();
    if (trimmed.length < 2) return;

    if (!persistenceAvailable) {
      const now = new Date().toISOString();
      const comment: IssueComment = {
        id: `session-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        issueId,
        authorLabel: 'Bu cihaz',
        body: trimmed,
        createdAt: now,
      };

      setCommunityByIssueId((current) => {
        const previous = current[issueId] ?? {
          comments: [],
          resolution: { resolvedCount: 0, stillOpenCount: 0, myFeedback: null },
        };
        return {
          ...current,
          [issueId]: {
            ...previous,
            comments: [...previous.comments, comment],
          },
        };
      });
      setIssues((current) => current.map((issue) =>
        issue.id === issueId ? { ...issue, comments: issue.comments + 1, updatedAt: now } : issue,
      ));
      notify('Güncelleme bu oturum için eklendi.');
      return;
    }

    try {
      const comment = await repository.addComment(issueId, trimmed);
      setCommunityByIssueId((current) => {
        const previous = current[issueId] ?? {
          comments: [],
          resolution: { resolvedCount: 0, stillOpenCount: 0, myFeedback: null },
        };
        return {
          ...current,
          [issueId]: {
            ...previous,
            comments: [...previous.comments, comment],
          },
        };
      });
      setIssues((current) => current.map((issue) =>
        issue.id === issueId
          ? { ...issue, comments: issue.comments + 1, updatedAt: comment.createdAt }
          : issue,
      ));
      notify('Topluluk güncellemen eklendi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Güncelleme eklenemedi.');
      throw error;
    }
  };

  const setCommunityResolutionFeedback = async (
    issueId: string,
    feedback: ResolutionFeedbackValue,
  ): Promise<void> => {
    if (!persistenceAvailable) {
      setCommunityByIssueId((current) => {
        const previous = current[issueId] ?? {
          comments: [],
          resolution: { resolvedCount: 0, stillOpenCount: 0, myFeedback: null },
        };
        const resolution = previous.resolution;
        let resolvedCount = resolution.resolvedCount;
        let stillOpenCount = resolution.stillOpenCount;

        if (resolution.myFeedback === 'resolved') resolvedCount = Math.max(0, resolvedCount - 1);
        if (resolution.myFeedback === 'still_open') stillOpenCount = Math.max(0, stillOpenCount - 1);
        if (feedback === 'resolved') resolvedCount += 1;
        if (feedback === 'still_open') stillOpenCount += 1;

        return {
          ...current,
          [issueId]: {
            ...previous,
            resolution: { resolvedCount, stillOpenCount, myFeedback: feedback },
          },
        };
      });
      notify('Çözüm görüşün bu oturum için kaydedildi.');
      return;
    }

    try {
      const snapshot = await repository.setResolutionFeedback(issueId, feedback);
      setCommunityByIssueId((current) => ({
        ...current,
        [issueId]: snapshot,
      }));
      notify(feedback === 'resolved'
        ? 'Çözüm doğrulaman kaydedildi.'
        : 'Sorunun devam ettiği geri bildirimi kaydedildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Geri bildirim kaydedilemedi.');
      throw error;
    }
  };

  const toggleFollow = async (id: string) => {
    const shouldFollow = !followedIssueIds.includes(id);

    if (!persistenceAvailable) {
      setFollowedIssueIds((current) =>
        shouldFollow ? [...current, id] : current.filter((item) => item !== id),
      );
      notify(shouldFollow ? 'Sorun bu oturum için takip ediliyor.' : 'Takip bu oturum için kaldırıldı.');
      return;
    }

    try {
      await repository.setIssueFollowed(id, shouldFollow);
      setFollowedIssueIds((current) =>
        shouldFollow
          ? (current.includes(id) ? current : [...current, id])
          : current.filter((item) => item !== id),
      );
      notify(shouldFollow ? 'Sorun takip listene eklendi.' : 'Sorun takibinden çıkarıldı.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Takip durumu güncellenemedi.');
    }
  };

  const openExistingIssue = (id: string) => {
    const issue = issues.find((item) => item.id === id);
    if (!issue) return;
    setReportOpen(false);
    setFilterPanelOpen(false);
    setActiveView('map');
    setSelectedIssueId(id);
    setMode('issues');
    setFocus({ lng: issue.lng, lat: issue.lat, key: Date.now() });
  };

  const submitReport = async (draft: ReportDraft): Promise<void> => {
    if (!draft.category) return;

    const now = new Date().toISOString();
    const issue: Issue = {
      id: createIssueId(),
      lng: draft.lng,
      lat: draft.lat,
      category: draft.category,
      categoryLabel: draft.categoryLabel,
      emoji: draft.emoji,
      title: draft.description.length > 44 ? `${draft.description.slice(0, 44)}…` : draft.description,
      place: draft.place || `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`,
      description: draft.description,
      confirms: 1,
      comments: 0,
      age: 'şimdi',
      severity: 1,
      status: 'Yeni',
      photoUrl: draft.photoUrl || undefined,
      createdAt: now,
      updatedAt: now,
    };

    if (!persistenceAvailable) {
      setIssues((current) => [issue, ...current]);
      setConfirmedIssueIds((current) => [...current, issue.id]);
      setReportOpen(false);
      setSelectedIssueId(issue.id);
      setFocus({ lng: issue.lng, lat: issue.lat, key: Date.now() });
      notify('Bildirim yalnızca bu oturum için eklendi.');
      return;
    }

    try {
      const stored = await repository.createIssue(issue);
      setIssues((current) => [stored, ...current.filter((item) => item.id !== stored.id)]);
      setConfirmedIssueIds((current) =>
        current.includes(stored.id) ? current : [...current, stored.id],
      );
      setReportOpen(false);
      setSelectedIssueId(stored.id);
      setFocus({ lng: stored.lng, lat: stored.lat, key: Date.now() });
      notify(sharedBackendEnabled
        ? 'Bildirim ortak şehir haritasına kaydedildi.'
        : 'Bildirim bu cihazda kalıcı olarak kaydedildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Bildirim kaydedilemedi.');
    }
  };

  return (
    <main className="app-shell">
      <section className="map-screen" aria-label="Şehir sorun haritası">
        <MapView
          issues={visibleMapIssues}
          mode={mode}
          focus={focus}
          selectedIssue={selectedIssue}
          followedIssueIds={followedIssueIds}
          onSelectIssue={(id) => {
            setFilterPanelOpen(false);
            setSelectedIssueId(id);
          }}
          onCenterChange={setCenter}
        />

        {!dataReady && (
          <div className="data-loading glass" role="status" aria-live="polite">
            <span className="loading-dot" />
            Kayıtlar yükleniyor
          </div>
        )}

        {activeView === 'nearby' && (
          <NearbyPanel
            issues={issues}
            origin={nearbyOrigin}
            locationSource={nearbyLocationSource}
            locating={nearbyLocating}
            onUseDeviceLocation={() => void useDeviceLocationForNearby()}
            onSelectIssue={openExistingIssue}
          />
        )}

        {activeView === 'following' && (
          <FollowPanel
            issues={issues}
            followedIssueIds={followedIssueIds}
            onSelectIssue={openExistingIssue}
            onUnfollow={(id) => void toggleFollow(id)}
          />
        )}

        <header className={`topbar glass ${activeView !== 'map' ? 'under-panel' : ''}`}>
          <button className="icon-btn" onClick={locateFromHeader} aria-label="Konumumu bul">⌖</button>
          <button
            className="location-pill"
            onClick={() => notify('Bölge seçici sonraki sürümde mahalle ve ilçe düzeyinde açılacak.')}
            aria-label="Bölge seç"
          >
            <span className="eyebrow">Bölge</span>
            <strong>Isparta · Canlı</strong>
          </button>
          <button
            className="icon-btn"
            onClick={() => notify('Bildirim merkezi sonraki sürümde bağlanacak.')}
            aria-label="Bildirimler"
          >
            ♢
          </button>
        </header>

        {activeView === 'map' && <div className="mode-switch glass" role="group" aria-label="Harita görünümü">
          <button
            className={`mode-btn ${mode === 'issues' ? 'active' : ''}`}
            onClick={() => setMode('issues')}
            aria-pressed={mode === 'issues'}
          >
            Sorunlar
          </button>
          <button
            className={`mode-btn ${mode === 'heat' ? 'active' : ''}`}
            onClick={() => setMode('heat')}
            aria-pressed={mode === 'heat'}
          >
            Yoğunluk
          </button>
        </div>}

        {activeView === 'map' && (
          <button
            type="button"
            className={`map-filter-trigger glass ${activeMapFilterCount > 0 ? 'active' : ''}`}
            onClick={() => setFilterPanelOpen((open) => !open)}
            aria-expanded={filterPanelOpen}
            aria-label="Harita filtrelerini aç"
          >
            <span aria-hidden="true">≡</span>
            <span>Filtre</span>
            {activeMapFilterCount > 0 && <strong>{activeMapFilterCount}</strong>}
          </button>
        )}

        {activeView === 'map' && (
          <MapFilterPanel
            open={filterPanelOpen}
            filters={mapFilters}
            visibleCount={visibleMapIssues.length}
            totalCount={issues.length}
            followedCount={followedIssueIds.length}
            onChange={setMapFilters}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}

        {activeView === 'map' && activeMapFilterCount > 0 && !filterPanelOpen && (
          <div className="filter-summary glass" role="status">
            <span>{visibleMapIssues.length} / {issues.length} kayıt</span>
            <button type="button" onClick={() => setMapFilters(emptyMapFilters)}>Temizle</button>
          </div>
        )}

        {activeView === 'map' && dataReady && issues.length === 0 && (
          <div className="map-empty-state glass" role="status">
            <span className="map-empty-icon" aria-hidden="true">⌖</span>
            <strong>Henüz bu bölgede bildirim yok</strong>
            <p>Şehir haritasındaki ilk gerçek sorunu sen bildirebilirsin.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedIssueId(null);
                setFilterPanelOpen(false);
                setReportOpen(true);
              }}
            >
              İlk sorunu bildir
            </button>
          </div>
        )}

        {activeView === 'map' && dataReady && issues.length > 0 && visibleMapIssues.length === 0 && (
          <div className="map-filter-empty glass">
            <strong>Bu filtrelerle eşleşen kayıt yok</strong>
            <button type="button" onClick={() => setMapFilters(emptyMapFilters)}>Tüm kayıtları göster</button>
          </div>
        )}

        {activeView === 'map' && (mode === 'issues' ? (
          <aside className="map-legend glass" aria-label="Sorun durumları">
            <span><i className="dot dot-new" /> Yeni</span>
            <span><i className="dot dot-confirmed" /> Doğrulandı</span>
            <span><i className="dot dot-old" /> Uzun süredir açık</span>
          </aside>
        ) : (
          <aside className="heat-legend glass" aria-label="Sorun yoğunluğu">
            <span>Az</span><i aria-hidden="true" /><span>Yoğun</span>
          </aside>
        ))}

        {activeView === 'map' && <button
          className="report-fab"
          disabled={!dataReady}
          onClick={() => {
            setSelectedIssueId(null);
            setFilterPanelOpen(false);
            setReportOpen(true);
          }}
        >
          <span className="plus">＋</span>
          <span>Sorun bildir</span>
        </button>}

        <IssueSheet
          issue={selectedIssue}
          confirmed={selectedIssue ? confirmedIssueIds.includes(selectedIssue.id) : false}
          followed={selectedIssue ? followedIssueIds.includes(selectedIssue.id) : false}
          onClose={() => setSelectedIssueId(null)}
          onConfirm={confirmIssue}
          onToggleFollow={(id) => void toggleFollow(id)}
          community={selectedIssue ? communityByIssueId[selectedIssue.id] ?? null : null}
          communityLoading={selectedIssue ? communityLoadingIssueId === selectedIssue.id : false}
          onAddComment={addCommunityComment}
          onResolutionFeedback={setCommunityResolutionFeedback}
        />

        <nav className="bottom-nav glass" aria-label="Ana menü">
          <button
            className={`nav-item ${activeView === 'map' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('map');
              setFilterPanelOpen(false);
              setMode('issues');
            }}
          >
            <span>⌘</span><small>Harita</small>
          </button>
          <button
            className={`nav-item ${activeView === 'nearby' ? 'active' : ''}`}
            onClick={openNearby}
          >
            <span>◎</span><small>Yakınımda</small>
          </button>
          <span className="nav-spacer" aria-hidden="true" />
          <button
            className={`nav-item ${activeView === 'following' ? 'active' : ''}`}
            onClick={() => {
              setSelectedIssueId(null);
              setReportOpen(false);
              setFilterPanelOpen(false);
              setActiveView('following');
            }}
          >
            <span>{followedIssueIds.length > 0 ? '♥' : '♡'}</span><small>Takip</small>
          </button>
          <button
            className="nav-item"
            onClick={() => notify('Profil ve gerçek hesap doğrulama sonraki güvenlik aşamasında eklenecek.')}
          >
            <span>○</span><small>Profil</small>
          </button>
        </nav>
      </section>

      <ReportFlow
        open={reportOpen}
        center={center}
        issues={issues}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
        onOpenIssue={openExistingIssue}
        requestLocation={requestLocation}
        notify={notify}
      />

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}
