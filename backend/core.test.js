import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthorLabel,
  validateClientId,
  validateCommentBody,
  validateIssueInput,
  validateModerationReport,
  validateModerationReview,
  validateResolutionFeedback,
} from './core.js';

test('anonymous author label is deterministic without exposing the raw client id', () => {
  const first = createAuthorLabel('client-12345678');
  const second = createAuthorLabel('client-12345678');
  assert.equal(first, second);
  assert.match(first, /^Komşu [A-Z0-9]{4}$/);
  assert.equal(first.includes('12345678'), false);
});

test('client id validation rejects malformed values', () => {
  assert.equal(validateClientId('abc'), null);
  assert.equal(validateClientId('valid-client_123'), 'valid-client_123');
  assert.equal(validateClientId('not valid client'), null);
});

test('issue validation forces bounded civic issue fields', () => {
  const result = validateIssueInput({
    category: 'road',
    categoryLabel: 'Yol / Asfalt',
    emoji: '🕳️',
    title: 'Yolda çukur',
    place: 'Bahçelievler · 142. Sokak',
    description: 'Araçların kaçmak zorunda kaldığı büyük bir çukur.',
    lng: 30.55,
    lat: 37.76,
    severity: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.category, 'road');
});

test('shared backend rejects embedded data-url photos', () => {
  const result = validateIssueInput({
    category: 'road',
    categoryLabel: 'Yol / Asfalt',
    emoji: '🕳️',
    title: 'Yolda çukur',
    place: 'Bahçelievler · 142. Sokak',
    description: 'Araçların kaçmak zorunda kaldığı büyük bir çukur.',
    lng: 30.55,
    lat: 37.76,
    severity: 1,
    photoUrl: 'data:image/png;base64,abc',
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /object-storage/i);
});

test('comment and resolution feedback validation', () => {
  assert.equal(validateCommentBody({ body: ' Hâlâ devam ediyor. ' }).value, 'Hâlâ devam ediyor.');
  assert.equal(validateCommentBody({ body: ' ' }).ok, false);
  assert.equal(validateResolutionFeedback({ feedback: 'resolved' }).ok, true);
  assert.equal(validateResolutionFeedback({ feedback: 'other' }).ok, false);
});


test('moderation report validation accepts bounded reasons and notes', () => {
  const valid = validateModerationReport({
    targetType: 'comment',
    targetId: 'cmt-123456',
    reason: 'harassment',
    note: 'Kişiyi hedef alan ifade içeriyor.',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.targetType, 'comment');

  assert.equal(validateModerationReport({
    targetType: 'issue',
    targetId: 'iss-123456',
    reason: 'unknown',
  }).ok, false);

  assert.equal(validateModerationReport({
    targetType: 'issue',
    targetId: 'iss-123456',
    reason: 'other',
    note: '',
  }).ok, false);
});


test('moderation review validation restricts statuses and note size', () => {
  assert.equal(validateModerationReview({
    status: 'reviewing',
    moderatorNote: 'İncelemeye alındı.',
  }).ok, true);

  assert.equal(validateModerationReview({ status: 'open' }).ok, false);
  assert.equal(validateModerationReview({
    status: 'resolved',
    moderatorNote: 'x'.repeat(1001),
  }).ok, false);
});
