import { useEffect, useMemo, useState } from 'react';
import { formatIssueAge } from '../data/time';
import {
  listModerationReports,
  reviewModerationReport,
  type ModerationQueueItem,
  type ModerationStatus,
} from '../data/moderationApi';

const statusTabs: Array<{ value: ModerationStatus; label: string }> = [
  { value: 'open', label: 'Açık' },
  { value: 'reviewing', label: 'İncelemede' },
  { value: 'resolved', label: 'Çözüldü' },
  { value: 'dismissed', label: 'Reddedildi' },
];

const reasonLabels: Record<string, string> = {
  false_information: 'Yanlış / yanıltıcı bilgi',
  harassment: 'Taciz / hedef gösterme',
  personal_info: 'Kişisel bilgi',
  spam: 'Spam / ilgisiz içerik',
  other: 'Diğer',
};

interface ModerationQueuePanelProps {
  onBack: () => void;
  notify: (message: string) => void;
}

export function ModerationQueuePanel({
  onBack,
  notify,
}: ModerationQueuePanelProps) {
  const [status, setStatus] = useState<ModerationStatus>('open');
  const [reports, setReports] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      setReports(await listModerationReports(status));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Moderasyon kuyruğu yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const countLabel = useMemo(
    () => loading ? '…' : String(reports.length),
    [loading, reports.length],
  );

  const review = async (
    report: ModerationQueueItem,
    nextStatus: 'reviewing' | 'resolved' | 'dismissed',
  ) => {
    setBusyId(report.id);
    try {
      await reviewModerationReport(report.id, nextStatus, notes[report.id]?.trim() || undefined);
      notify(
        nextStatus === 'reviewing'
          ? 'Rapor incelemeye alındı.'
          : nextStatus === 'resolved'
            ? 'Rapor çözüldü olarak kapatıldı.'
            : 'Rapor reddedildi.',
      );
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Moderasyon işlemi tamamlanamadı.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="moderation-queue-panel" aria-labelledby="moderationQueueTitle">
      <header className="moderation-queue-header">
        <button type="button" onClick={onBack} aria-label="Profile dön">‹</button>
        <div>
          <span className="eyebrow">Güvenlik ve içerik</span>
          <h1 id="moderationQueueTitle">İnceleme kuyruğu</h1>
        </div>
        <span className="moderation-queue-count">{countLabel}</span>
      </header>

      <div className="moderation-tabs" role="tablist" aria-label="Rapor durumu">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            className={status === tab.value ? 'active' : ''}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="moderation-queue-loading">
          <span className="loading-dot" />
          Raporlar yükleniyor
        </div>
      ) : reports.length === 0 ? (
        <div className="moderation-queue-empty">
          <span aria-hidden="true">✓</span>
          <strong>Bu kuyrukta rapor yok</strong>
          <p>Yeni raporlar geldiğinde burada görünecek.</p>
        </div>
      ) : (
        <div className="moderation-queue-list">
          {reports.map((report) => (
            <article className="moderation-review-card" key={report.id}>
              <div className="moderation-review-top">
                <span className="moderation-target-chip">
                  {report.targetType === 'issue' ? 'Sorun kaydı' : 'Yorum'}
                </span>
                <span>{formatIssueAge(report.createdAt, 'şimdi')}</span>
              </div>

              <strong className="moderation-review-reason">
                {reasonLabels[report.reason] ?? report.reason}
              </strong>

              <p className="moderation-review-preview">
                {report.targetPreview || 'İçerik önizlemesi bulunamadı.'}
              </p>

              {report.note && (
                <blockquote>{report.note}</blockquote>
              )}

              <div className="moderation-review-reporter">
                <span>Raporlayan</span>
                <strong>{report.reporter.displayName}</strong>
                <small>@{report.reporter.username}</small>
              </div>

              {(status === 'open' || status === 'reviewing') && (
                <>
                  <label className="moderation-review-note">
                    <span>Moderatör notu</span>
                    <textarea
                      maxLength={1000}
                      value={notes[report.id] ?? report.moderatorNote ?? ''}
                      onChange={(event) => setNotes((current) => ({
                        ...current,
                        [report.id]: event.target.value,
                      }))}
                      placeholder="Karar veya inceleme notu…"
                    />
                  </label>

                  <div className="moderation-review-actions">
                    {status === 'open' && (
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() => void review(report, 'reviewing')}
                      >
                        İncelemeye al
                      </button>
                    )}
                    <button
                      type="button"
                      className="resolve"
                      disabled={busyId === report.id}
                      onClick={() => void review(report, 'resolved')}
                    >
                      Çözüldü
                    </button>
                    <button
                      type="button"
                      className="dismiss"
                      disabled={busyId === report.id}
                      onClick={() => void review(report, 'dismissed')}
                    >
                      Reddet
                    </button>
                  </div>
                </>
              )}

              {report.moderatorNote && status !== 'open' && (
                <div className="moderation-existing-note">
                  <small>Moderatör notu</small>
                  <p>{report.moderatorNote}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
