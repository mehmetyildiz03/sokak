export const ISSUE_CATEGORIES = new Set([
  'road',
  'light',
  'trash',
  'sidewalk',
  'water',
  'park',
]);

export const ISSUE_STATUSES = new Set([
  'Yeni',
  'Doğrulandı',
  'Uzun süredir açık',
  'İşlemde',
  'Çözüldü',
]);

export function createAuthorLabel(clientId) {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = ((hash << 5) - hash + clientId.charCodeAt(index)) | 0;
  }
  return `Komşu ${Math.abs(hash).toString(36).slice(0, 4).toUpperCase().padStart(4, '0')}`;
}

export function validateClientId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  if (!/^[a-zA-Z0-9:_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function cleanText(value, min, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)) return null;
  return trimmed;
}

export function validateIssueInput(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Geçersiz bildirim verisi.' };
  }

  const category = ISSUE_CATEGORIES.has(payload.category) ? payload.category : null;
  const categoryLabel = cleanText(payload.categoryLabel, 2, 80);
  const emoji = cleanText(payload.emoji, 1, 8);
  const place = cleanText(payload.place, 2, 240);
  const description = cleanText(payload.description, 8, 1000);
  const title = cleanText(payload.title, 2, 140) ?? (description ? description.slice(0, 120) : null);
  const lng = Number(payload.lng);
  const lat = Number(payload.lat);
  const severity = Number(payload.severity ?? 1);

  if (!category || !categoryLabel || !emoji || !place || !description || !title) {
    return { ok: false, message: 'Bildirim alanları eksik veya geçersiz.' };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, message: 'Konum koordinatları geçersiz.' };
  }
  if (![1, 2, 3].includes(severity)) {
    return { ok: false, message: 'Önem düzeyi geçersiz.' };
  }

  let photoUrl = null;
  if (typeof payload.photoUrl === 'string' && payload.photoUrl.trim()) {
    const candidate = payload.photoUrl.trim();
    if (!/^https:\/\//i.test(candidate) || candidate.length > 2048) {
      return {
        ok: false,
        message: 'Paylaşımlı backend fotoğrafları için HTTPS object-storage URL gereklidir.',
      };
    }
    photoUrl = candidate;
  }

  return {
    ok: true,
    value: {
      category,
      categoryLabel,
      emoji,
      title,
      place,
      description,
      lng,
      lat,
      severity,
      photoUrl,
    },
  };
}

export function validateCommentBody(payload) {
  const body = cleanText(payload?.body, 2, 1000);
  return body
    ? { ok: true, value: body }
    : { ok: false, message: 'Yorum 2 ile 1000 karakter arasında olmalı.' };
}

export function validateResolutionFeedback(payload) {
  const feedback = payload?.feedback;
  if (feedback !== 'resolved' && feedback !== 'still_open') {
    return { ok: false, message: 'Çözüm geri bildirimi geçersiz.' };
  }
  return { ok: true, value: feedback };
}

export function rowToIssue(row) {
  return {
    id: row.id,
    lng: Number(row.longitude),
    lat: Number(row.latitude),
    category: row.category,
    categoryLabel: row.category_label,
    emoji: row.emoji,
    title: row.title,
    place: row.place,
    description: row.description,
    confirms: Number(row.confirmation_count),
    comments: Number(row.comment_count),
    age: 'şimdi',
    severity: Number(row.severity),
    status: row.status,
    photoUrl: row.photo_url ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function rowToComment(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    authorLabel: row.author_label,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}


export function validateModerationReport(payload) {
  const targetType = payload?.targetType;
  const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
  const reason = payload?.reason;
  const note = typeof payload?.note === 'string' ? payload.note.trim() : '';

  if (targetType !== 'issue' && targetType !== 'comment') {
    return { ok: false, message: 'Rapor hedefi geçersiz.' };
  }
  if (!/^[a-zA-Z0-9:_-]{3,160}$/.test(targetId)) {
    return { ok: false, message: 'Rapor hedefi geçersiz.' };
  }
  if (!['false_information', 'harassment', 'personal_info', 'spam', 'other'].includes(reason)) {
    return { ok: false, message: 'Rapor nedeni geçersiz.' };
  }
  if (note.length > 500) {
    return { ok: false, message: 'Açıklama en fazla 500 karakter olabilir.' };
  }
  if (reason === 'other' && note.length < 5) {
    return { ok: false, message: 'Diğer nedeni için kısa bir açıklama ekle.' };
  }

  return {
    ok: true,
    value: {
      targetType,
      targetId,
      reason,
      note: note || null,
    },
  };
}
