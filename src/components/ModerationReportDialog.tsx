import { useEffect, useState } from 'react';
import type { ModerationReason, ModerationTargetType } from '../data/moderationApi';

interface ModerationReportDialogProps {
  target: { type: ModerationTargetType; id: string; label: string } | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    targetType: ModerationTargetType;
    targetId: string;
    reason: ModerationReason;
    note?: string;
  }) => Promise<void>;
}

const reasons: Array<{ value: ModerationReason; label: string }> = [
  { value: 'false_information', label: 'Yanlış / yanıltıcı bilgi' },
  { value: 'harassment', label: 'Taciz / hedef gösterme' },
  { value: 'personal_info', label: 'Kişisel bilgi içeriyor' },
  { value: 'spam', label: 'Spam / ilgisiz içerik' },
  { value: 'other', label: 'Diğer' },
];

export function ModerationReportDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: ModerationReportDialogProps) {
  const [reason, setReason] = useState<ModerationReason>('false_information');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!target) return;
    setReason('false_information');
    setNote('');
  }, [target?.id, target?.type]);

  if (!target) return null;

  return (
    <div className="moderation-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="moderation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderationTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Topluluk güvenliği</span>
            <h2 id="moderationTitle">İçeriği bildir</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Pencereyi kapat">×</button>
        </header>

        <div className="moderation-target">
          <small>{target.type === 'issue' ? 'Sorun kaydı' : 'Topluluk yorumu'}</small>
          <strong>{target.label}</strong>
        </div>

        <label className="moderation-field">
          <span>Neden?</span>
          <select value={reason} onChange={(event) => setReason(event.target.value as ModerationReason)}>
            {reasons.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="moderation-field">
          <span>Açıklama <small>(isteğe bağlı)</small></span>
          <textarea
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="İncelemeyi kolaylaştıracak kısa bir açıklama ekleyebilirsin."
          />
          <small>{note.length} / 500</small>
        </label>

        <p className="moderation-note">
          Rapor içerik sahibine gösterilmez. Aynı içeriği tekrar tekrar raporlamak incelemeyi hızlandırmaz.
        </p>

        <div className="moderation-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={busy || (reason === 'other' && note.trim().length < 5)}
            onClick={() => void onSubmit({
              targetType: target.type,
              targetId: target.id,
              reason,
              note: note.trim() || undefined,
            })}
          >
            {busy ? 'Gönderiliyor…' : 'İncelemeye gönder'}
          </button>
        </div>
      </section>
    </div>
  );
}
