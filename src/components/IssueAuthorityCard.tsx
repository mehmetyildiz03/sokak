import { useEffect, useState } from 'react';
import type { Issue, IssueAuthority, IssueStatus } from '../types';

interface IssueAuthorityCardProps {
  issue: Issue;
  authority: IssueAuthority | null;
  loading: boolean;
  onStatusUpdate: (
    issueId: string,
    status: Extract<IssueStatus, 'İşlemde' | 'Çözüldü'>,
    note: string,
  ) => Promise<void>;
}

function kindLabel(kind: IssueAuthority['kind']): string {
  if (kind === 'municipality') return 'Belediye';
  if (kind === 'utility') return 'Altyapı kurumu';
  return 'Kurum';
}

export function IssueAuthorityCard({
  issue,
  authority,
  loading,
  onStatusUpdate,
}: IssueAuthorityCardProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote('');
    setSaving(false);
  }, [issue.id, issue.status]);

  if (loading) {
    return (
      <div className="issue-authority loading">
        <span className="loading-dot" />
        Kurum bilgisi yükleniyor
      </div>
    );
  }

  if (!authority) return null;

  const nextStatus: 'İşlemde' | 'Çözüldü' = issue.status === 'İşlemde'
    ? 'Çözüldü'
    : 'İşlemde';

  const actionLabel = issue.status === 'İşlemde'
    ? 'Çözüldü olarak işaretle'
    : issue.status === 'Çözüldü'
      ? 'Yeniden işleme al'
      : 'İşleme al';

  const submit = async () => {
    const clean = note.trim();
    if (clean.length < 5 || saving) return;
    setSaving(true);
    try {
      await onStatusUpdate(issue.id, nextStatus, clean);
      setNote('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="issue-authority" aria-labelledby="issueAuthorityTitle">
      <div className="issue-authority-head">
        <div className="issue-authority-mark" aria-hidden="true">✓</div>
        <div>
          <span className="eyebrow">Doğrulanmış yetkili</span>
          <h3 id="issueAuthorityTitle">{authority.name}</h3>
          <small>{kindLabel(authority.kind)}</small>
        </div>
        <span className="issue-authority-verified">Doğrulandı</span>
      </div>

      {authority.canUpdateStatus && (
        <div className="official-status-editor">
          <label>
            <span>Kurum güncelleme notu</span>
            <textarea
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                issue.status === 'İşlemde'
                  ? 'Örn. Onarım tamamlandı ve saha kontrolü yapıldı.'
                  : 'Örn. Saha ekibi inceleme için yönlendirildi.'
              }
            />
          </label>
          <div>
            <small>{note.length} / 500</small>
            <button
              type="button"
              disabled={saving || note.trim().length < 5}
              onClick={() => void submit()}
            >
              {saving ? 'Güncelleniyor…' : actionLabel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
