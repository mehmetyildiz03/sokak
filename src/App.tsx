import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { FollowPanel } from './components/FollowPanel';
import { IssueSheet } from './components/IssueSheet';
import { NearbyPanel } from './components/NearbyPanel';
import { ReportFlow } from './components/ReportFlow';
import { createIssueRepository } from './data/createIssueRepository';
import { initialIssues } from './data/issues';
import type { Issue, MapMode, Point, ReportDraft } from './types';

const initialCenter: Point = { lng: 30.5566, lat: 37.7648 };

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

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
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
      notify('Yerel veri deposu açılamadı; bu oturum geçici modda çalışıyor.');
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
      notify('Bildirim bu cihazda kalıcı olarak kaydedildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Bildirim kaydedilemedi.');
    }
  };

  return (
    <main className="app-shell">
      <section className="map-screen" aria-label="Şehir sorun haritası">
        <MapView
          issues={issues}
          mode={mode}
          focus={focus}
          onSelectIssue={setSelectedIssueId}
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
            <strong>Isparta · Demo</strong>
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
        />

        <nav className="bottom-nav glass" aria-label="Ana menü">
          <button
            className={`nav-item ${activeView === 'map' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('map');
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
              setActiveView('following');
            }}
          >
            <span>{followedIssueIds.length > 0 ? '♥' : '♡'}</span><small>Takip</small>
          </button>
          <button
            className="nav-item"
            onClick={() => notify('Profil ve gerçek kimlik doğrulama backend aşamasında eklenecek.')}
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
