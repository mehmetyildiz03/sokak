import { useEffect, useMemo, useState } from 'react';
import { formatIssueAge } from '../data/time';
import type {
  Issue,
  IssueCommunitySnapshot,
  ResolutionFeedbackValue,
} from '../types';

interface IssueCommunityProps {
  issue: Issue;
  snapshot: IssueCommunitySnapshot | null;
  loading: boolean;
  onAddComment: (issueId: string, body: string) => Promise<void>;
  onResolutionFeedback: (
    issueId: string,
    feedback: ResolutionFeedbackValue,
  ) => Promise<void>;
}

export function IssueCommunity({
  issue,
  snapshot,
  loading,
  onAddComment,
  onResolutionFeedback,
}: IssueCommunityProps) {
  const [comment, setComment] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  useEffect(() => {
    setComment('');
    setCommentSaving(false);
    setFeedbackSaving(false);
  }, [issue.id]);

  const comments = snapshot?.comments ?? [];
  const resolution = snapshot?.resolution ?? {
    resolvedCount: 0,
    stillOpenCount: 0,
    myFeedback: null,
  };

  const resolutionTotal = resolution.resolvedCount + resolution.stillOpenCount;
  const resolvedRatio = resolutionTotal > 0
    ? Math.round((resolution.resolvedCount / resolutionTotal) * 100)
    : 0;

  const communitySignal = useMemo(() => {
    if (resolutionTotal === 0) return 'Henüz topluluk doğrulaması yok.';
    if (resolution.stillOpenCount >= 2 && resolution.stillOpenCount > resolution.resolvedCount) {
      return 'Birden fazla kişi sorunun devam ettiğini bildiriyor.';
    }
    if (resolution.resolvedCount > resolution.stillOpenCount) {
      return 'Topluluk geri bildirimlerinin çoğu sorunun düzeldiğini söylüyor.';
    }
    return 'Topluluk geri bildirimleri şu anda karışık.';
  }, [resolution.resolvedCount, resolution.stillOpenCount, resolutionTotal]);

  const submitComment = async () => {
    const body = comment.trim();
    if (body.length < 2 || commentSaving) return;

    setCommentSaving(true);
    try {
      await onAddComment(issue.id, body);
      setComment('');
    } finally {
      setCommentSaving(false);
    }
  };

  const submitFeedback = async (value: ResolutionFeedbackValue) => {
    if (feedbackSaving) return;
    setFeedbackSaving(true);
    try {
      await onResolutionFeedback(issue.id, value);
    } finally {
      setFeedbackSaving(false);
    }
  };

  return (
    <section className="community-section" aria-labelledby="communityTitle">
      <div className="community-heading">
        <div>
          <span className="eyebrow">Mahalle katılımı</span>
          <h3 id="communityTitle">Topluluk</h3>
        </div>
        <span className="community-count">{comments.length} yerel güncelleme</span>
      </div>

      <div className="comment-composer">
        <label htmlFor={`community-comment-${issue.id}`}>Güncel durumu paylaş</label>
        <textarea
          id={`community-comment-${issue.id}`}
          value={comment}
          maxLength={1000}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Örn. Bu sabah geçtim; çukur hâlâ duruyor."
        />
        <div className="comment-composer-footer">
          <span>{comment.length} / 1000</span>
          <button
            type="button"
            onClick={() => void submitComment()}
            disabled={comment.trim().length < 2 || commentSaving}
          >
            {commentSaving ? 'Ekleniyor…' : 'Güncelleme ekle'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="community-loading">
          <span className="loading-dot" />
          Topluluk güncellemeleri yükleniyor
        </div>
      ) : comments.length > 0 ? (
        <div className="comment-list">
          {comments.map((item) => (
            <article className="comment-item" key={item.id}>
              <div className="comment-avatar" aria-hidden="true">
                {item.authorLabel.slice(-2)}
              </div>
              <div>
                <div className="comment-meta">
                  <strong>{item.authorLabel}</strong>
                  <span>{formatIssueAge(item.createdAt, 'şimdi')}</span>
                </div>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="community-empty">
          <strong>İlk güncellemeyi sen ekleyebilirsin.</strong>
          <span>Gözleme dayalı, kısa ve kişileri hedef almayan bilgi paylaş.</span>
        </div>
      )}

      {issue.status === 'Çözüldü' && (
        <div className="resolution-community-card">
          <div className="resolution-community-title">
            <div>
              <span className="eyebrow">Çözüm doğrulaması</span>
              <strong>Gerçekten düzeldi mi?</strong>
            </div>
            <span>{resolutionTotal} görüş</span>
          </div>

          <p>{communitySignal}</p>

          {resolutionTotal > 0 && (
            <div className="resolution-meter" aria-label={`Çözüldü diyenler yüzde ${resolvedRatio}`}>
              <span style={{ width: `${resolvedRatio}%` }} />
            </div>
          )}

          <div className="resolution-votes">
            <button
              type="button"
              className={resolution.myFeedback === 'resolved' ? 'active resolved' : ''}
              disabled={feedbackSaving}
              onClick={() => void submitFeedback('resolved')}
            >
              <span>✓</span>
              <strong>Düzeldi</strong>
              <small>{resolution.resolvedCount}</small>
            </button>
            <button
              type="button"
              className={resolution.myFeedback === 'still_open' ? 'active still-open' : ''}
              disabled={feedbackSaving}
              onClick={() => void submitFeedback('still_open')}
            >
              <span>!</span>
              <strong>Devam ediyor</strong>
              <small>{resolution.stillOpenCount}</small>
            </button>
          </div>

          <small className="resolution-note">
            Bu topluluk sinyalidir; tek başına kurumsal durumu değiştirmez.
          </small>
        </div>
      )}

      <p className="local-community-note">
        Bu sürümde katılım kayıtları yalnız bu cihazda saklanır. Ortak backend bağlandığında aynı arayüz tüm kullanıcıların paylaştığı veriyi gösterecek.
      </p>
    </section>
  );
}
