import type { Issue } from '../types';

interface FollowPanelProps {
  issues: Issue[];
  followedIssueIds: string[];
  onSelectIssue: (id: string) => void;
  onUnfollow: (id: string) => void;
}

function statusTone(status: Issue['status']): string {
  if (status === 'Çözüldü') return 'resolved';
  if (status === 'İşlemde') return 'working';
  if (status === 'Uzun süredir açık') return 'old';
  if (status === 'Doğrulandı') return 'confirmed';
  return 'new';
}

export function FollowPanel({
  issues,
  followedIssueIds,
  onSelectIssue,
  onUnfollow,
}: FollowPanelProps) {
  const followed = followedIssueIds
    .map((id) => issues.find((issue) => issue.id === id))
    .filter((issue): issue is Issue => Boolean(issue))
    .sort((a, b) => {
      const aResolved = a.status === 'Çözüldü' ? 1 : 0;
      const bResolved = b.status === 'Çözüldü' ? 1 : 0;
      if (aResolved !== bResolved) return aResolved - bResolved;
      return b.confirms - a.confirms;
    });

  const openCount = followed.filter((issue) => issue.status !== 'Çözüldü').length;
  const resolvedCount = followed.length - openCount;

  return (
    <section className="follow-panel" aria-labelledby="followTitle">
      <header className="follow-header">
        <div>
          <span className="eyebrow">Durum değişikliklerini izle</span>
          <h1 id="followTitle">Takip</h1>
        </div>
        <div className="follow-summary" aria-label="Takip özeti">
          <strong>{followed.length}</strong>
          <span>kayıt</span>
        </div>
      </header>

      {followed.length > 0 && (
        <div className="follow-stats">
          <span><i className="follow-dot open" /> {openCount} açık</span>
          <span><i className="follow-dot resolved" /> {resolvedCount} çözülmüş</span>
        </div>
      )}

      <div className="follow-list">
        {followed.length === 0 ? (
          <div className="follow-empty">
            <span aria-hidden="true">♡</span>
            <strong>Henüz takip ettiğin sorun yok</strong>
            <p>Haritadaki bir sorunu açıp “Takip et” dediğinde burada görünür.</p>
          </div>
        ) : followed.map((issue) => (
          <article className="follow-card" key={issue.id}>
            <button
              type="button"
              className="follow-card-main"
              onClick={() => onSelectIssue(issue.id)}
            >
              <span
                className={`follow-thumb ${issue.photoUrl ? 'has-photo' : ''}`}
                style={issue.photoUrl ? { backgroundImage: `url(${issue.photoUrl})` } : undefined}
                aria-hidden="true"
              >
                {!issue.photoUrl && issue.emoji}
              </span>

              <span className="follow-copy">
                <span className="follow-card-top">
                  <span className="follow-category">{issue.categoryLabel}</span>
                  <span className={`nearby-status ${statusTone(issue.status)}`}>{issue.status}</span>
                </span>
                <strong className="follow-title">{issue.title}</strong>
                <span className="follow-place">{issue.place}</span>
                <span className="follow-meta">
                  <span>👥 {issue.confirms}</span>
                  <span>💬 {issue.comments}</span>
                  <span>◷ {issue.age}</span>
                </span>
              </span>

              <span className="follow-chevron" aria-hidden="true">›</span>
            </button>

            <button
              type="button"
              className="follow-remove"
              onClick={() => onUnfollow(issue.id)}
              aria-label={`${issue.title} takibini bırak`}
            >
              Takibi bırak
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
