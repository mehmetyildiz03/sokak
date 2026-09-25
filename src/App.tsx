import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { IssueSheet } from './components/IssueSheet';
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
  const [mode, setMode] = useState<MapMode>('issues');
  const [center, setCenter] = useState<Point>(initialCenter);
  const [focus, setFocus] = useState<(Point & { key: number }) | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [dataReady, setDataReady] = useState(false);
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
    ]).then(([storedIssues, confirmedIds]) => {
      if (cancelled) return;
      setIssues(storedIssues);
      setConfirmedIssueIds(confirmedIds);
    }).catch(() => {
      if (cancelled) return;
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

  const confirmIssue = async (id: string) => {
    if (confirmedIssueIds.includes(id)) {
      notify('Bu sorunu zaten doğruladın.');
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

  const openExistingIssue = (id: string) => {
    const issue = issues.find((item) => item.id === id);
    if (!issue) return;
    setReportOpen(false);
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
      place: 'Yeni bildirilen konum',
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

        <header className="topbar glass">
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

        <div className="mode-switch glass" role="group" aria-label="Harita görünümü">
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
        </div>

        {mode === 'issues' ? (
          <aside className="map-legend glass" aria-label="Sorun durumları">
            <span><i className="dot dot-new" /> Yeni</span>
            <span><i className="dot dot-confirmed" /> Doğrulandı</span>
            <span><i className="dot dot-old" /> Uzun süredir açık</span>
          </aside>
        ) : (
          <aside className="heat-legend glass" aria-label="Sorun yoğunluğu">
            <span>Az</span><i aria-hidden="true" /><span>Yoğun</span>
          </aside>
        )}

        <button
          className="report-fab"
          disabled={!dataReady}
          onClick={() => {
            setSelectedIssueId(null);
            setReportOpen(true);
          }}
        >
          <span className="plus">＋</span>
          <span>Sorun bildir</span>
        </button>

        <IssueSheet
          issue={selectedIssue}
          confirmed={selectedIssue ? confirmedIssueIds.includes(selectedIssue.id) : false}
          onClose={() => setSelectedIssueId(null)}
          onConfirm={confirmIssue}
        />

        <nav className="bottom-nav glass" aria-label="Ana menü">
          <button className="nav-item active" onClick={() => setMode('issues')}>
            <span>⌘</span><small>Harita</small>
          </button>
          <button
            className="nav-item"
            onClick={() => notify('Yakınımda listesi sonraki ürün adımında açılacak.')}
          >
            <span>◎</span><small>Yakınımda</small>
          </button>
          <span className="nav-spacer" aria-hidden="true" />
          <button
            className="nav-item"
            onClick={() => notify('Takip edilen sorunlar kullanıcı hesabıyla bağlanacak.')}
          >
            <span>♡</span><small>Takip</small>
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
