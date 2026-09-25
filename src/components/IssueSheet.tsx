import type { Issue } from '../types';

interface IssueSheetProps {
  issue: Issue | null;
  confirmed: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

function stageFor(issue: Issue): number {
  if (issue.status === 'Çözüldü') return 3;
  if (issue.status === 'İşlemde') return 2;
  if (issue.status === 'Doğrulandı' || issue.status === 'Uzun süredir açık') return 1;
  return 0;
}

export function IssueSheet({ issue, confirmed, onClose, onConfirm }: IssueSheetProps) {
  if (!issue) return null;

  const stage = stageFor(issue);
  const photoStyle = issue.photoUrl ? { backgroundImage: `url(${issue.photoUrl})` } : undefined;

  return (
    <section className="issue-sheet open" aria-live="polite">
      <button className="sheet-handle" onClick={onClose} aria-label="Kartı kapat" />
      <div
        className={`issue-photo ${issue.photoUrl ? 'has-photo' : ''}`}
        style={photoStyle}
        role="img"
        aria-label={issue.photoUrl ? 'Sorun fotoğrafı' : `${issue.categoryLabel} simgesi`}
      >
        {!issue.photoUrl && <span>{issue.emoji}</span>}
      </div>
      <div className="issue-body">
        <div className="issue-kicker">
          <span className="category-chip">{issue.categoryLabel}</span>
          <span className="status-chip">{issue.status}</span>
        </div>
        <h2>{issue.title}</h2>
        <p className="muted">{issue.place}</p>
        <p>{issue.description}</p>
        <div className="issue-stats">
          <span>👥 <strong>{issue.confirms}</strong> doğrulama</span>
          <span>💬 <strong>{issue.comments}</strong> yorum</span>
          <span>◷ <strong>{issue.age}</strong></span>
        </div>
        <div className="progress-track" aria-label={`Sorun durumu: ${issue.status}`}>
          <span className="progress-dot done" />
          <span className={`progress-line ${stage >= 1 ? 'done' : ''}`} />
          <span className={`progress-dot ${stage >= 1 ? 'done' : ''}`} />
          <span className={`progress-line ${stage >= 2 ? 'done' : ''}`} />
          <span className={`progress-dot ${stage >= 2 ? 'done' : ''}`} />
          <span className={`progress-line ${stage >= 3 ? 'done' : ''}`} />
          <span className={`progress-dot ${stage >= 3 ? 'done' : ''}`} />
        </div>
        <div className="progress-labels"><span>Bildirildi</span><span>Doğrulandı</span><span>İşlemde</span><span>Çözüldü</span></div>
        <button
          className="primary-btn"
          disabled={confirmed || issue.status === 'Çözüldü'}
          onClick={() => onConfirm(issue.id)}
        >
          {issue.status === 'Çözüldü' ? 'Sorun çözüldü' : confirmed ? 'Doğruladın ✓' : 'Ben de gördüm'}
        </button>
      </div>
    </section>
  );
}
