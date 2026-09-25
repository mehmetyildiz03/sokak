import { useEffect, useMemo, useRef, useState } from 'react';
import { LocationPickerMap } from './LocationPickerMap';
import { reverseGeocode } from '../data/reverseGeocode';
import type { Issue, IssueCategory, Point, ReportDraft } from '../types';
import { distanceMeters } from '../utils';

interface ReportFlowProps {
  open: boolean;
  center: Point;
  issues: Issue[];
  onClose: () => void;
  onSubmit: (draft: ReportDraft) => Promise<void>;
  onOpenIssue: (id: string) => void;
  requestLocation: () => Promise<Point>;
  notify: (message: string) => void;
}

const categories: Array<{ key: IssueCategory; label: string; emoji: string }> = [
  { key: 'road', label: 'Yol / Asfalt', emoji: '🕳️' },
  { key: 'light', label: 'Aydınlatma', emoji: '💡' },
  { key: 'trash', label: 'Çöp / Temizlik', emoji: '🗑️' },
  { key: 'sidewalk', label: 'Kaldırım', emoji: '🚧' },
  { key: 'water', label: 'Su / Kanalizasyon', emoji: '💧' },
  { key: 'park', label: 'Park / Yeşil alan', emoji: '🌳' },
];

const stepTitles = ['Sorun nerede?', 'Ne tür bir sorun?', 'Ne oluyor?', 'Kontrol et ve gönder'];

function emptyDraft(center: Point): ReportDraft {
  return { ...center, category: null, categoryLabel: '', emoji: '📍', place: '', description: '', photoUrl: '' };
}

export function ReportFlow({ open, center, issues, onClose, onSubmit, onOpenIssue, requestLocation, notify }: ReportFlowProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ReportDraft>(() => emptyDraft(center));
  const [submitting, setSubmitting] = useState(false);
  const [addressStatus, setAddressStatus] = useState<'loading' | 'resolved' | 'failed'>('loading');
  const addressRequestRef = useRef(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSubmitting(false);
    setAddressStatus('loading');
    setDraft(emptyDraft(center));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const requestId = ++addressRequestRef.current;
    const point = { lat: draft.lat, lng: draft.lng };
    setAddressStatus('loading');

    const timer = window.setTimeout(() => {
      void reverseGeocode(point)
        .then((label) => {
          if (requestId !== addressRequestRef.current) return;

          if (label) {
            setDraft((current) => (
              current.lat === point.lat && current.lng === point.lng
                ? { ...current, place: label }
                : current
            ));
            setAddressStatus('resolved');
          } else {
            setAddressStatus('failed');
          }
        })
        .catch(() => {
          if (requestId === addressRequestRef.current) {
            setAddressStatus('failed');
          }
        });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [open, draft.lat, draft.lng]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea, input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  const similarIssue = useMemo(() => {
    if (!draft.category) return null;
    return issues
      .map((issue) => ({
        issue,
        distance: distanceMeters(issue.lat, issue.lng, draft.lat, draft.lng),
      }))
      .filter(({ issue, distance }) => issue.status !== 'Çözüldü' && issue.category === draft.category && distance < 160)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;
  }, [draft, issues]);

  if (!open) return null;

  const selectCategory = (key: IssueCategory, label: string, emoji: string) => {
    setDraft((current) => ({ ...current, category: key, categoryLabel: label, emoji }));
  };

  const next = async () => {
    if (step === 2 && !draft.category) {
      notify('Önce bir sorun kategorisi seç.');
      return;
    }
    if (step === 3 && draft.description.trim().length < 8) {
      notify('Sorunu birkaç kelimeyle daha net anlat.');
      return;
    }
    if (step < 4) {
      setStep((value) => value + 1);
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ ...draft, description: draft.description.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  const useLocation = async () => {
    try {
      const point = await requestLocation();
      setDraft((current) => ({ ...current, ...point, place: '' }));
      notify('Konum seçildi.');
    } catch {
      notify('Konum alınamadı; harita merkezi kullanılacak.');
    }
  };

  const addPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Yalnızca fotoğraf dosyası ekleyebilirsin.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify('Fotoğraf 8 MB’dan küçük olmalı.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setDraft((current) => ({ ...current, photoUrl: reader.result as string }));
    };
    reader.onerror = () => notify('Fotoğraf okunamadı. Başka bir görsel deneyebilirsin.');
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-backdrop open" aria-hidden="false" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section ref={dialogRef} className="report-modal" role="dialog" aria-modal="true" aria-labelledby="reportTitle">
        <header className="modal-header">
          <button ref={closeButtonRef} className="icon-btn plain" onClick={onClose} aria-label="Kapat">×</button>
          <div><span className="eyebrow">{step} / 4</span><h2 id="reportTitle">{stepTitles[step - 1]}</h2></div>
          <span className="header-spacer" />
        </header>
        <div className="step-progress"><i style={{ width: `${step * 25}%` }} /></div>
        <div className="report-content">
          {step === 1 && (
            <section className="report-step active">
              <div className="location-card">
                <div className="location-icon">⌖</div>
                <div>
                  <strong>
                    {addressStatus === 'loading'
                      ? 'Adres aranıyor…'
                      : draft.place || 'Konum adı bulunamadı'}
                  </strong>
                  <p>{draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</p>
                </div>
              </div>

              <LocationPickerMap
                point={{ lng: draft.lng, lat: draft.lat }}
                onChange={(point) => setDraft((current) => ({ ...current, ...point, place: '' }))}
              />

              <button className="secondary-btn location-use-btn" onClick={useLocation}>
                Konumumu kullan
              </button>
              <p className="helper">
                Pini tam sorun noktasına sürükleyebilirsin. Haritanın başka bir yerine dokunursan pin oraya taşınır.
                Konum izni vermezsen başlangıç noktası ana haritanın merkezidir.
              </p>
              <p className="geocoding-note">
                Adres verisi © OpenStreetMap katkıda bulunanlar · Seçilen koordinat adres adı için Nominatim’e gönderilir.
              </p>
            </section>
          )}
          {step === 2 && (
            <section className="report-step active">
              <div className="category-grid">
                {categories.map((category) => (
                  <button
                    key={category.key}
                    className={`category-option ${draft.category === category.key ? 'selected' : ''}`}
                    onClick={() => selectCategory(category.key, category.label, category.emoji)}
                    aria-pressed={draft.category === category.key}
                  >
                    <span>{category.emoji}</span>{category.label}
                  </button>
                ))}
              </div>
            </section>
          )}
          {step === 3 && (
            <section className="report-step active">
              <label className="field-label" htmlFor="reportDescription">Sorunu kısaca anlat</label>
              <textarea
                id="reportDescription"
                maxLength={240}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Örn. Çukur nedeniyle araçlar karşı şeride geçiyor."
              />
              <div className="field-meta"><span>Net ve gözleme dayalı yaz.</span><span>{draft.description.length} / 240</span></div>
              <label className="photo-upload">
                <span className="upload-icon">＋</span>
                <span><strong>Fotoğraf ekle</strong><small>İlk sürümde isteğe bağlı</small></span>
                <input type="file" accept="image/*" hidden onChange={(event) => addPhoto(event.target.files?.[0])} />
              </label>
              {draft.photoUrl && <div className="photo-preview" style={{ backgroundImage: `url(${draft.photoUrl})` }} />}
            </section>
          )}
          {step === 4 && (
            <section className="report-step active">
              <div className="review-card">
                <div className="review-emoji">{draft.emoji}</div>
                <div><span className="eyebrow">Yeni bildirim</span><h3>{draft.categoryLabel || 'Kategori seçilmedi'}</h3><p>{draft.description || 'Açıklama eklenmedi.'}</p></div>
              </div>
              <div className="review-location">
                <span aria-hidden="true">⌖</span>
                <div>
                  <strong>{draft.place || 'Konum adı bulunamadı'}</strong>
                  <small>{draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</small>
                </div>
              </div>
              {draft.photoUrl && <div className="photo-preview review-photo" style={{ backgroundImage: `url(${draft.photoUrl})` }} />}
              {similarIssue && (
                <div className="similar-warning">
                  <strong>Yakında benzer bir bildirim var.</strong>
                  <p>{similarIssue.issue.title} · yaklaşık {Math.max(1, Math.round(similarIssue.distance))} m uzakta</p>
                  <button
                    type="button"
                    className="similar-action"
                    onClick={() => onOpenIssue(similarIssue.issue.id)}
                  >
                    Bu sorunu aç ve doğrula
                  </button>
                </div>
              )}
              <p className="helper">Gönderdiğinde kayıt haritada “Yeni” durumuyla görünür. Yetkili işlem yapana kadar topluluk tarafından doğrulanabilir.</p>
            </section>
          )}
        </div>
        <footer className="modal-footer">
          <button className="secondary-btn compact" disabled={step === 1 || submitting} onClick={() => setStep((value) => Math.max(1, value - 1))}>Geri</button>
          <button className="primary-btn compact" disabled={submitting} onClick={() => void next()}>
            {submitting ? 'Kaydediliyor…' : step === 4 ? 'Bildirimi gönder' : 'Devam'}
          </button>
        </footer>
      </section>
    </div>
  );
}
