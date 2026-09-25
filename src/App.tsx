import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { IssueSheet } from './components/IssueSheet';
import { ReportFlow } from './components/ReportFlow';
import { initialIssues } from './data/issues';
import type { Issue, MapMode, Point, ReportDraft } from './types';

const initialCenter: Point = { lng: 30.5566, lat: 37.7648 };

export default function App() {
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [confirmedIssueIds, setConfirmedIssueIds] = useState<string[]>([]);
  const [mode, setMode] = useState<MapMode>('issues');
  const [center, setCenter] = useState<Point>(initialCenter);
  const [focus, setFocus] = useState<(Point & { key: number }) | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState('');

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast(message);

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

  const confirmIssue = (id: string) => {
    if (confirmedIssueIds.includes(id)) {
      notify('Bu sorunu zaten doğruladın.');
      return;
    }
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
    notify('Doğrulaman kaydedildi. Teşekkürler.');
  };

  const openExistingIssue = (id: string) => {
    const issue = issues.find((item) => item.id === id);
    if (!issue) return;
    setReportOpen(false);
    setSelectedIssueId(id);
    setMode('issues');
    setFocus({ lng: issue.lng, lat: issue.lat, key: Date.now() });
  };

  const submitReport = (draft: ReportDraft) => {
    if (!draft.category) return;

    const issue: Issue = {
      id: `iss-${Date.now()}`,
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
    };

    setIssues((current) => [issue, ...current]);
    setConfirmedIssueIds((current) => [...current, issue.id]);
    setReportOpen(false);
    setSelectedIssueId(issue.id);
    setFocus({ lng: issue.lng, lat: issue.lat, key: Date.now() });
    notify('Bildirim haritaya eklendi.');
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

        {mode === 'issues' && (
          <aside className="map-legend glass">
            <span><i className="dot dot-new" /> Yeni</span>
            <span><i className="dot dot-confirmed" /> Doğrulandı</span>
            <span><i className="dot dot-old" /> Uzun süredir açık</span>
          </aside>
        )}

        <button
          className="report-fab"
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
            onClick={() => notify('Yakınımda listesi v0.3 kapsamında açılacak.')}
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
            onClick={() => notify('Profil ve kimlik doğrulama backend aşamasında eklenecek.')}
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
