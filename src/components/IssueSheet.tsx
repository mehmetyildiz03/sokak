import type { Issue } from '../types';

interface IssueSheetProps {
  issue: Issue | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export function IssueSheet({ issue, onClose, onConfirm }: IssueSheetProps) {
  if (!issue) return null;
  return (
    <section className="issue-sheet open" aria-live="polite">
      <button className="sheet-handle" onClick={onClose} aria-label="Kartı kapat" />
      <div className="issue-photo" role="img" aria-label="Sorun fotoğrafı"><span>{issue.emoji}</span></div>
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
        <div className="progress-track" aria-label="Sorun durumu">
          <span className="progress-dot done" /><span className="progress-line done" />
          <span className="progress-dot done" /><span className="progress-line" />
          <span className="progress-dot" /><span className="progress-line" />
          <span className="progress-dot" />
        </div>
        <div className="progress-labels"><span>Bildirildi</span><span>Doğrulandı</span><span>İşlemde</span><span>Çözüldü</span></div>
        <button className="primary-btn" onClick={() => onConfirm(issue.id)}>Ben de gördüm</button>
      </div>
    </section>
  );
}
