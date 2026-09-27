import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

async function waitForHealth(baseUrl, child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API process exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError ?? new Error('API health check timed out');
}

test('shared API supports a multi-client civic participation flow', { skip: !databaseUrl }, async (t) => {
  const port = 3101;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      RUN_MIGRATIONS: 'true',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('exit', resolve);
      setTimeout(resolve, 1500);
    });
  });

  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    throw new Error(`${error.message}\n${stderr}`);
  }

  const clientA = `smoke-a-${Date.now()}`;
  const clientB = `smoke-b-${Date.now()}`;
  const headersA = {
    'Content-Type': 'application/json',
    'X-Sokak-Client-Id': clientA,
  };
  const headersB = {
    'Content-Type': 'application/json',
    'X-Sokak-Client-Id': clientB,
  };

  let response = await fetch(`${baseUrl}/v1/issues`, {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      category: 'road',
      categoryLabel: 'Yol / Asfalt',
      emoji: '🕳️',
      title: 'Smoke test çukuru',
      place: 'Test Mahallesi · Test Sokak',
      description: 'İki kullanıcılı API smoke testi için oluşturulan yol sorunu.',
      lng: 30.5566,
      lat: 37.7648,
      severity: 1,
    }),
  });
  const createBody = await response.text();
  assert.equal(response.status, 201, `${createBody}\n${stderr}`);
  const created = JSON.parse(createBody);
  assert.equal(created.status, 'Yeni');
  assert.equal(created.confirms, 1);

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/confirmations`, {
    method: 'POST',
    headers: headersB,
  });
  assert.equal(response.status, 200);
  const confirmation = await response.json();
  assert.equal(confirmation.alreadyConfirmed, false);
  assert.equal(confirmation.issue.status, 'Doğrulandı');
  assert.equal(confirmation.issue.confirms, 2);

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/follow`, {
    method: 'PUT',
    headers: headersB,
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/v1/me/follows`, { headers: headersB });
  const follows = await response.json();
  assert.ok(follows.issueIds.includes(created.id));

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/comments`, {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ body: 'Ben de bugün gördüm; sorun devam ediyor.' }),
  });
  assert.equal(response.status, 201);
  const comment = await response.json();
  assert.equal(comment.issueId, created.id);
  assert.match(comment.authorLabel, /^Komşu /);

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/community`, {
    headers: headersB,
  });
  let community = await response.json();
  assert.equal(community.comments.length, 1);
  assert.equal(community.comments[0].body, 'Ben de bugün gördüm; sorun devam ediyor.');

  const db = new Pool({ connectionString: databaseUrl });
  await db.query(
    `update issues set status = 'Çözüldü', updated_at = now() where id = $1`,
    [created.id],
  );
  await db.end();

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/resolution-feedback`, {
    method: 'PUT',
    headers: headersB,
    body: JSON.stringify({ feedback: 'resolved' }),
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/resolution-feedback`, {
    method: 'PUT',
    headers: headersA,
    body: JSON.stringify({ feedback: 'still_open' }),
  });
  assert.equal(response.status, 200);
  community = await response.json();
  assert.equal(community.resolution.resolvedCount, 1);
  assert.equal(community.resolution.stillOpenCount, 1);
  assert.equal(community.resolution.myFeedback, 'still_open');

  const username = `smoke_user_${Date.now()}`;
  response = await fetch(`${baseUrl}/v1/auth/register`, {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({
      username,
      displayName: 'Smoke Kullanıcısı',
      password: 'smoke-test-password-123',
    }),
  });
  assert.equal(response.status, 201);
  const registered = await response.json();
  assert.equal(registered.user.username, username);
  assert.equal(registered.user.displayName, 'Smoke Kullanıcısı');
  assert.ok(registered.token);

  response = await fetch(`${baseUrl}/v1/auth/claim-device`, {
    method: 'POST',
    headers: {
      ...headersB,
      Authorization: `Bearer ${registered.token}`,
    },
  });
  assert.equal(response.status, 200);

  const secondDeviceId = `smoke-c-${Date.now()}`;
  const secondDeviceHeaders = {
    'Content-Type': 'application/json',
    'X-Sokak-Client-Id': secondDeviceId,
    Authorization: `Bearer ${registered.token}`,
  };

  response = await fetch(`${baseUrl}/v1/me/follows`, {
    headers: secondDeviceHeaders,
  });
  const accountFollows = await response.json();
  assert.ok(accountFollows.issueIds.includes(created.id));

  response = await fetch(`${baseUrl}/v1/issues/${created.id}/comments`, {
    method: 'POST',
    headers: secondDeviceHeaders,
    body: JSON.stringify({ body: 'Hesapla eklenen topluluk güncellemesi.' }),
  });
  assert.equal(response.status, 201);
  const accountComment = await response.json();
  assert.equal(accountComment.authorLabel, 'Smoke Kullanıcısı');

  const thirdDeviceId = `smoke-d-${Date.now()}`;
  response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sokak-Client-Id': thirdDeviceId,
    },
    body: JSON.stringify({
      username,
      password: 'smoke-test-password-123',
    }),
  });
  assert.equal(response.status, 200);
  const login = await response.json();
  assert.notEqual(login.token, registered.token);

  response = await fetch(`${baseUrl}/v1/auth/me`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Sokak-Client-Id': thirdDeviceId,
      Authorization: `Bearer ${login.token}`,
    },
  });
  assert.equal(response.status, 200);
  const me = await response.json();
  assert.equal(me.user.username, username);
  assert.ok(me.user.stats.confirmations >= 1);
  assert.ok(me.user.stats.follows >= 1);
  assert.ok(me.user.stats.comments >= 2);

  response = await fetch(`${baseUrl}/v1/moderation/reports`, {
    method: 'POST',
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
    body: JSON.stringify({
      targetType: 'issue',
      targetId: created.id,
      reason: 'false_information',
      note: 'Smoke test moderasyon kaydı.',
    }),
  });
  assert.equal(response.status, 201);
  const moderation = await response.json();
  assert.equal(moderation.targetId, created.id);
  assert.equal(moderation.status, 'open');

  response = await fetch(`${baseUrl}/v1/moderation/reports`, {
    method: 'POST',
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
    body: JSON.stringify({
      targetType: 'issue',
      targetId: created.id,
      reason: 'spam',
      note: 'Tekrar raporu.',
    }),
  });
  assert.equal(response.status, 409);

  response = await fetch(`${baseUrl}/v1/moderation/reports`, {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      targetType: 'issue',
      targetId: created.id,
      reason: 'spam',
    }),
  });
  assert.equal(response.status, 401);

  // moderation queue requires moderator role
  response = await fetch(`${baseUrl}/v1/moderation/reports?status=open`, {
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
  });
  assert.equal(response.status, 403);

  const moderationDb = new Pool({ connectionString: databaseUrl });
  await moderationDb.query(
    `update users set role = 'moderator', updated_at = now() where id = $1`,
    [registered.user.id],
  );
  await moderationDb.end();

  response = await fetch(`${baseUrl}/v1/moderation/reports?status=open`, {
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
  });
  assert.equal(response.status, 200);
  const queue = await response.json();
  assert.ok(queue.reports.some((item) => item.id === moderation.id));

  response = await fetch(`${baseUrl}/v1/moderation/reports/${moderation.id}`, {
    method: 'PATCH',
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
    body: JSON.stringify({
      status: 'reviewing',
      moderatorNote: 'Smoke test incelemesi.',
    }),
  });
  assert.equal(response.status, 200);
  let reviewed = await response.json();
  assert.equal(reviewed.status, 'reviewing');

  response = await fetch(`${baseUrl}/v1/moderation/reports/${moderation.id}`, {
    method: 'PATCH',
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
    body: JSON.stringify({
      status: 'resolved',
      contentAction: 'hide',
      moderatorNote: 'Smoke test: hedef gizlendi.',
    }),
  });
  assert.equal(response.status, 200);
  reviewed = await response.json();
  assert.equal(reviewed.status, 'resolved');
  assert.equal(reviewed.actionTaken, 'hide');
  assert.equal(reviewed.targetHidden, true);

  response = await fetch(`${baseUrl}/v1/issues`);
  let publicIssues = await response.json();
  assert.equal(publicIssues.some((item) => item.id === created.id), false);

  response = await fetch(`${baseUrl}/v1/moderation/reports/${moderation.id}`, {
    method: 'PATCH',
    headers: {
      ...secondDeviceHeaders,
      Authorization: `Bearer ${registered.token}`,
    },
    body: JSON.stringify({
      status: 'resolved',
      contentAction: 'restore',
      moderatorNote: 'Smoke test: hedef geri açıldı.',
    }),
  });
  assert.equal(response.status, 200);
  reviewed = await response.json();
  assert.equal(reviewed.actionTaken, 'restore');
  assert.equal(reviewed.targetHidden, false);

  response = await fetch(`${baseUrl}/v1/issues`);
  publicIssues = await response.json();
  assert.equal(publicIssues.some((item) => item.id === created.id), true);

  const auditDb = new Pool({ connectionString: databaseUrl });
  const auditRows = await auditDb.query(
    `select previous_status, new_status, content_action
     from moderation_actions
     where report_id = $1
     order by created_at asc`,
    [moderation.id],
  );
  await auditDb.end();

  assert.equal(auditRows.rows.length, 3);
  assert.deepEqual(
    auditRows.rows.map((row) => row.content_action),
    ['none', 'hide', 'restore'],
  );

  response = await fetch(`${baseUrl}/v1/me/notifications`, { headers: headersA });
  assert.equal(response.status, 200);
  const moderationNotifications = await response.json();
  assert.ok(
    moderationNotifications.notifications.filter((item) => item.type === 'moderation').length >= 2,
  );
  assert.ok(moderationNotifications.unreadCount >= 2);
});
