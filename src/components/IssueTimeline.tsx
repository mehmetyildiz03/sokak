import { formatIssueAge } from '../data/time';
import type { IssueHistoryEvent } from '../types';

interface IssueTimelineProps {
  events: IssueHistoryEvent[];
  loading: boolean;
}

function actorLabel(event: IssueHistoryEvent): string {
  if (event.actorType === 'official' && event.actorLabel) return event.actorLabel;
  if (event.actorType === 'system') return 'Sistem';
  if (event.actorType === 'official') return 'Kurum';
  if (event.actorType === 'moderator') return 'Moderasyon';
  return 'Topluluk';
}

function eventTitle(event: IssueHistoryEvent): string {
  if (!event.fromStatus && event.toStatus === 'Yeni') return 'Sorun bildirildi';
  if (event.toStatus === 'Doğrulandı') return 'Topluluk doğruladı';
  if (event.toStatus === 'İşlemde') return 'İşlem başladı';
  if (event.toStatus === 'Çözüldü') return 'Çözüldü';
  if (event.toStatus === 'Uzun süredir açık') return 'Uzun süredir açık';
  return `Durum: ${event.toStatus}`;
}

export function IssueTimeline({ events, loading }: IssueTimelineProps) {
  return (
    <section className="issue-timeline" aria-labelledby="issueTimelineTitle">
      <div className="issue-timeline-heading">
        <div>
          <span className="eyebrow">Kayıt geçmişi</span>
          <h3 id="issueTimelineTitle">Süreç</h3>
        </div>
        <span>{loading ? '…' : `${events.length} olay`}</span>
      </div>

      {loading ? (
        <div className="issue-timeline-loading">
          <span className="loading-dot" />
          Süreç geçmişi yükleniyor
        </div>
      ) : events.length === 0 ? (
        <div className="issue-timeline-empty">
          <span>Henüz ayrıntılı süreç kaydı yok.</span>
        </div>
      ) : (
        <ol className="issue-timeline-list">
          {events.map((event, index) => (
            <li key={event.id}>
              <span className="issue-timeline-rail" aria-hidden="true">
                <i />
                {index < events.length - 1 && <b />}
              </span>
              <div className="issue-timeline-copy">
                <div>
                  <strong>{eventTitle(event)}</strong>
                  <small>{formatIssueAge(event.createdAt, 'şimdi')}</small>
                </div>
                <span className={`issue-timeline-actor ${event.actorType}`}>
                  {actorLabel(event)}
                </span>
                {event.note && <p>{event.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
