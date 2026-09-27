import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  createAuthorLabel,
  rowToComment,
  rowToIssue,
  validateClientId,
  validateCommentBody,
  validateIssueInput,
  validateModerationReport,
  validateModerationReview,
  validateResolutionFeedback,
} from './core.js';
import { checkStorage, decodeImageDataUrl, getIssuePhoto, putIssuePhoto } from './storage.js';
import {
  createSessionId,
  createSessionToken,
  createUserId,
  hashPassword,
  hashSessionToken,
  parseBearerToken,
  publicUser,
  sessionExpiry,
  validateLoginInput,
  validateRegistrationInput,
  verifyPassword,
} from './auth.js';

const { Pool } = pg;

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS !== 'false';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'https://mehmetyildiz03.github.io,http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.');
}

const pool = new Pool({ connectionString: DATABASE_URL });

function createRateLimiter(limit, windowMs) {
  const buckets = new Map();

  return (key) => {
    const now = Date.now();
    const current = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);
    if (current.length >= limit) {
      buckets.set(key, current);
      return false;
    }
    current.push(now);
    buckets.set(key, current);

    if (buckets.size > 10_000) {
      for (const [bucketKey, times] of buckets) {
        if (times.every((time) => now - time >= windowMs)) buckets.delete(bucketKey);
      }
    }

    return true;
  };
}

const allowWrite = createRateLimiter(60, 60_000);
const allowComment = createRateLimiter(10, 10 * 60_000);
const allowAuth = createRateLimiter(20, 15 * 60_000);
const allowModeration = createRateLimiter(10, 60 * 60_000);

function corsHeaders(origin) {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sokak-Client-Id, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function sendJson(res, status, payload, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(origin),
  });
  res.end(JSON.stringify(payload));
}

function sendEmpty(res, status, origin) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...corsHeaders(origin),
  });
  res.end();
}

async function readJson(req, maxBytes = 1_000_000) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('İstek gövdesi çok büyük.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Geçersiz JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function requireClientId(req) {
  const raw = req.headers['x-sokak-client-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const clientId = validateClientId(value);
  if (!clientId) {
    const error = new Error('Geçerli X-Sokak-Client-Id başlığı gerekli.');
    error.statusCode = 400;
    throw error;
  }
  return clientId;
}

async function getAuthenticatedUser(req) {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const token = parseBearerToken(raw);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `select u.*
     from sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()
       and u.disabled_at is null
     limit 1`,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

async function requireAuthenticatedUser(req) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    const error = new Error('Oturum açman gerekiyor.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

async function requireModerator(req) {
  const user = await requireAuthenticatedUser(req);
  if (user.role !== 'moderator' && user.role !== 'admin') {
    const error = new Error('Bu işlem için moderatör yetkisi gerekiyor.');
    error.statusCode = 403;
    throw error;
  }
  return user;
}

async function resolveActor(req) {
  const user = await getAuthenticatedUser(req);
  if (user) {
    return {
      actorId: `user:${user.id}`,
      authorLabel: user.display_name,
      user,
    };
  }

  const clientId = requireClientId(req);
  return {
    actorId: clientId,
    authorLabel: createAuthorLabel(clientId),
    user: null,
  };
}

async function getUserStats(queryable, userId) {
  const actorId = `user:${userId}`;
  const [reports, confirmations, comments, follows] = await Promise.all([
    queryable.query('select count(*)::int as count from issues where created_by_actor = $1', [actorId]),
    queryable.query('select count(*)::int as count from confirmations where client_id = $1', [actorId]),
    queryable.query('select count(*)::int as count from comments where client_id = $1', [actorId]),
    queryable.query('select count(*)::int as count from follows where client_id = $1', [actorId]),
  ]);

  return {
    reports: reports.rows[0]?.count ?? 0,
    confirmations: confirmations.rows[0]?.count ?? 0,
    comments: comments.rows[0]?.count ?? 0,
    follows: follows.rows[0]?.count ?? 0,
  };
}

function requireWriteBudget(clientId, kind = 'write') {
  if (!allowWrite(clientId)) {
    const error = new Error('Çok sık işlem yapıldı. Kısa süre sonra yeniden dene.');
    error.statusCode = 429;
    throw error;
  }
  if (kind === 'comment' && !allowComment(clientId)) {
    const error = new Error('Kısa sürede çok fazla güncelleme eklendi.');
    error.statusCode = 429;
    throw error;
  }
}

function decodeId(segment) {
  let value;
  try {
    value = decodeURIComponent(segment);
  } catch {
    value = '';
  }
  if (!/^[a-zA-Z0-9:_-]{3,160}$/.test(value)) {
    const error = new Error('Geçersiz kayıt kimliği.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


async function createNotification(queryable, {
  recipientActor,
  issueId = null,
  type,
  title,
  body,
}) {
  if (!recipientActor) return;

  await queryable.query(
    `insert into notifications (
      id, recipient_actor, issue_id, type, title, body
    ) values ($1,$2,$3,$4,$5,$6)`,
    [
      `ntf-${randomUUID()}`,
      recipientActor,
      issueId,
      type,
      title,
      body,
    ],
  );
}

async function notifyIssueParticipants(
  queryable,
  issue,
  excludeActor,
  type,
  title,
  body,
) {
  const recipients = await queryable.query(
    `select client_id as actor_id
     from follows
     where issue_id = $1
     union
     select created_by_actor as actor_id
     from issues
     where id = $1 and created_by_actor is not null`,
    [issue.id],
  );

  for (const row of recipients.rows) {
    if (!row.actor_id || row.actor_id === excludeActor) continue;
    await createNotification(queryable, {
      recipientActor: row.actor_id,
      issueId: issue.id,
      type,
      title,
      body,
    });
  }
}

async function handleGetNotifications(req, res, origin, url) {
  const actor = await resolveActor(req);
  const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
    : 50;

  const [items, unread] = await Promise.all([
    pool.query(
      `select id, issue_id, type, title, body, read_at, created_at
       from notifications
       where recipient_actor = $1
       order by created_at desc
       limit $2`,
      [actor.actorId, limit],
    ),
    pool.query(
      `select count(*)::int as count
       from notifications
       where recipient_actor = $1 and read_at is null`,
      [actor.actorId],
    ),
  ]);

  sendJson(res, 200, {
    unreadCount: Number(unread.rows[0]?.count ?? 0),
    notifications: items.rows.map((row) => ({
      id: row.id,
      issueId: row.issue_id,
      type: row.type,
      title: row.title,
      body: row.body,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  }, origin);
}

async function handleReadNotification(req, res, origin, notificationId) {
  const actor = await resolveActor(req);
  const result = await pool.query(
    `update notifications
     set read_at = coalesce(read_at, now())
     where id = $1 and recipient_actor = $2
     returning id, read_at`,
    [notificationId, actor.actorId],
  );

  if (result.rowCount === 0) {
    sendJson(res, 404, { message: 'Bildirim bulunamadı.' }, origin);
    return;
  }

  sendJson(res, 200, {
    id: result.rows[0].id,
    readAt: new Date(result.rows[0].read_at).toISOString(),
  }, origin);
}

async function handleReadAllNotifications(req, res, origin) {
  const actor = await resolveActor(req);
  const result = await pool.query(
    `update notifications
     set read_at = now()
     where recipient_actor = $1 and read_at is null`,
    [actor.actorId],
  );

  sendJson(res, 200, { updated: result.rowCount ?? 0 }, origin);
}

async function createSessionForUser(queryable, userId) {
  const token = createSessionToken();
  await queryable.query(
    `insert into sessions (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [createSessionId(), userId, hashSessionToken(token), sessionExpiry()],
  );
  return token;
}

async function handleRegister(req, res, origin) {
  const ipKey = req.socket.remoteAddress ?? 'unknown';
  if (!allowAuth(`register:${ipKey}`)) {
    sendJson(res, 429, { message: 'Çok sık hesap denemesi yapıldı. Daha sonra tekrar dene.' }, origin);
    return;
  }

  const body = await readJson(req);
  const validated = validateRegistrationInput(body);
  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const { username, displayName, password } = validated.value;

  try {
    const result = await withTransaction(async (client) => {
      const passwordData = await hashPassword(password);
      const id = createUserId();
      const inserted = await client.query(
        `insert into users (
          id, username, display_name, password_hash, password_salt
        ) values ($1,$2,$3,$4,$5)
        returning *`,
        [id, username, displayName, passwordData.hash, passwordData.salt],
      );
      const token = await createSessionForUser(client, id);
      return { user: inserted.rows[0], token };
    });

    sendJson(res, 201, {
      token: result.token,
      user: publicUser(result.user, await getUserStats(pool, result.user.id)),
    }, origin);
  } catch (error) {
    if (error?.code === '23505') {
      sendJson(res, 409, { message: 'Bu kullanıcı adı zaten kullanılıyor.' }, origin);
      return;
    }
    throw error;
  }
}

async function handleLogin(req, res, origin) {
  const body = await readJson(req);
  const validated = validateLoginInput(body);
  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const ipKey = req.socket.remoteAddress ?? 'unknown';
  if (!allowAuth(`login:${ipKey}:${validated.value.username}`)) {
    sendJson(res, 429, { message: 'Çok sık giriş denemesi yapıldı. Daha sonra tekrar dene.' }, origin);
    return;
  }

  const result = await pool.query(
    `select * from users
     where username = $1 and disabled_at is null
     limit 1`,
    [validated.value.username],
  );
  const user = result.rows[0];

  if (!user || !(await verifyPassword(
    validated.value.password,
    user.password_salt,
    user.password_hash,
  ))) {
    sendJson(res, 401, { message: 'Kullanıcı adı veya parola yanlış.' }, origin);
    return;
  }

  const token = await createSessionForUser(pool, user.id);
  sendJson(res, 200, {
    token,
    user: publicUser(user, await getUserStats(pool, user.id)),
  }, origin);
}

async function handleMe(req, res, origin) {
  const user = await requireAuthenticatedUser(req);
  sendJson(res, 200, {
    user: publicUser(user, await getUserStats(pool, user.id)),
  }, origin);
}

async function handleLogout(req, res, origin) {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const token = parseBearerToken(raw);
  if (token) {
    await pool.query(
      'update sessions set revoked_at = now() where token_hash = $1',
      [hashSessionToken(token)],
    );
  }
  sendJson(res, 200, { ok: true }, origin);
}

async function migrateActorRows(client, tableName, oldActorId, newActorId) {
  await client.query(
    `insert into ${tableName} (issue_id, client_id, created_at)
     select issue_id, $2, created_at
     from ${tableName}
     where client_id = $1
     on conflict (issue_id, client_id) do nothing`,
    [oldActorId, newActorId],
  );
  await client.query(
    `delete from ${tableName} where client_id = $1`,
    [oldActorId],
  );
}

async function handleClaimDevice(req, res, origin) {
  const user = await requireAuthenticatedUser(req);
  const clientId = requireClientId(req);
  const userActorId = `user:${user.id}`;

  await withTransaction(async (client) => {
    await migrateActorRows(client, 'confirmations', clientId, userActorId);
    await migrateActorRows(client, 'follows', clientId, userActorId);

    await client.query(
      `insert into resolution_feedback (
        issue_id, client_id, value, created_at, updated_at
      )
      select issue_id, $2, value, created_at, updated_at
      from resolution_feedback
      where client_id = $1
      on conflict (issue_id, client_id) do nothing`,
      [clientId, userActorId],
    );
    await client.query(
      'delete from resolution_feedback where client_id = $1',
      [clientId],
    );

    await client.query(
      `update comments
       set client_id = $2, author_label = $3, updated_at = now()
       where client_id = $1`,
      [clientId, userActorId, user.display_name],
    );

    await client.query(
      `update issues
       set created_by_actor = $2
       where created_by_actor = $1`,
      [clientId, userActorId],
    );

    await client.query(
      `update notifications
       set recipient_actor = $2
       where recipient_actor = $1`,
      [clientId, userActorId],
    );
  });

  sendJson(res, 200, {
    user: publicUser(user, await getUserStats(pool, user.id)),
  }, origin);
}

async function getIssueRow(queryable, issueId, { forUpdate = false } = {}) {
  const suffix = forUpdate ? ' FOR UPDATE' : '';
  const result = await queryable.query(
    `select * from issues where id = $1 and hidden_at is null${suffix}`,
    [issueId],
  );
  return result.rows[0] ?? null;
}

async function getCommunitySnapshot(queryable, issueId, clientId) {
  const [commentsResult, feedbackResult, mineResult] = await Promise.all([
    queryable.query(
      `select id, issue_id, author_label, body, created_at
       from (
         select id, issue_id, author_label, body, created_at
         from comments
         where issue_id = $1
           and hidden_at is null
         order by created_at desc
         limit 100
       ) recent
       order by created_at asc`,
      [issueId],
    ),
    queryable.query(
      `select value, count(*)::int as count
       from resolution_feedback
       where issue_id = $1
       group by value`,
      [issueId],
    ),
    queryable.query(
      `select value
       from resolution_feedback
       where issue_id = $1 and client_id = $2`,
      [issueId, clientId],
    ),
  ]);

  const counts = { resolved: 0, still_open: 0 };
  for (const row of feedbackResult.rows) {
    if (row.value === 'resolved' || row.value === 'still_open') {
      counts[row.value] = Number(row.count);
    }
  }

  return {
    comments: commentsResult.rows.map(rowToComment),
    resolution: {
      resolvedCount: counts.resolved,
      stillOpenCount: counts.still_open,
      myFeedback: mineResult.rows[0]?.value ?? null,
    },
  };
}

async function handleGetIssues(res, origin) {
  const result = await pool.query(
    `select *
     from issues
     where hidden_at is null
     order by created_at desc
     limit 5000`,
  );
  sendJson(res, 200, result.rows.map(rowToIssue), origin);
}

async function handleCreateIssue(req, res, origin) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  requireWriteBudget(clientId);
  const body = await readJson(req);
  const validated = validateIssueInput(body);
  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const input = validated.value;
  const issueId = `iss-${randomUUID()}`;
  const historyId = `hist-${randomUUID()}`;

  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      `insert into issues (
        id, category, category_label, emoji, title, place, description,
        longitude, latitude, severity, status, confirmation_count, comment_count, photo_url, created_by_actor
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Yeni',1,0,$11,$12
      )
      returning *`,
      [
        issueId,
        input.category,
        input.categoryLabel,
        input.emoji,
        input.title,
        input.place,
        input.description,
        input.lng,
        input.lat,
        input.severity,
        input.photoUrl,
        clientId,
      ],
    );

    await client.query(
      `insert into confirmations (issue_id, client_id)
       values ($1, $2)`,
      [issueId, clientId],
    );

    await client.query(
      `insert into status_history (
        id, issue_id, from_status, to_status, actor_type, actor_id, note
      ) values ($1, $2, null, 'Yeni', 'citizen', $3, 'Vatandaş bildirimi oluşturuldu.')`,
      [historyId, issueId, clientId],
    );

    return inserted.rows[0];
  });

  sendJson(res, 201, rowToIssue(row), origin);
}

async function handleGetMyConfirmations(req, res, origin) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  const result = await pool.query(
    `select issue_id from confirmations where client_id = $1 order by created_at desc`,
    [clientId],
  );
  sendJson(res, 200, { issueIds: result.rows.map((row) => row.issue_id) }, origin);
}

async function handleGetMyFollows(req, res, origin) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  const result = await pool.query(
    `select issue_id from follows where client_id = $1 order by created_at desc`,
    [clientId],
  );
  sendJson(res, 200, { issueIds: result.rows.map((row) => row.issue_id) }, origin);
}

async function handleFollow(req, res, origin, issueId, followed) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  requireWriteBudget(clientId);

  if (followed) {
    const exists = await pool.query(
      'select 1 from issues where id = $1 and hidden_at is null',
      [issueId],
    );
    if (exists.rowCount === 0) {
      sendJson(res, 404, { message: 'Sorun kaydı bulunamadı.' }, origin);
      return;
    }

    await pool.query(
      `insert into follows (issue_id, client_id)
       values ($1, $2)
       on conflict (issue_id, client_id) do nothing`,
      [issueId, clientId],
    );
  } else {
    await pool.query(
      'delete from follows where issue_id = $1 and client_id = $2',
      [issueId, clientId],
    );
  }

  sendJson(res, 200, { followed }, origin);
}

async function handleConfirmation(req, res, origin, issueId) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  requireWriteBudget(clientId);

  const result = await withTransaction(async (client) => {
    const issue = await getIssueRow(client, issueId, { forUpdate: true });
    if (!issue) {
      const error = new Error('Sorun kaydı bulunamadı.');
      error.statusCode = 404;
      throw error;
    }

    const existing = await client.query(
      `select 1 from confirmations where issue_id = $1 and client_id = $2`,
      [issueId, clientId],
    );

    if (existing.rowCount > 0) {
      return { row: issue, alreadyConfirmed: true };
    }

    if (issue.status === 'Çözüldü') {
      const error = new Error('Çözülmüş bir sorun yeniden doğrulanamaz.');
      error.statusCode = 409;
      throw error;
    }

    await client.query(
      `insert into confirmations (issue_id, client_id) values ($1, $2)`,
      [issueId, clientId],
    );

    const confirms = Number(issue.confirmation_count) + 1;
    const nextStatus = issue.status === 'Yeni' && confirms >= 2
      ? 'Doğrulandı'
      : issue.status;

    const updated = await client.query(
      `update issues
       set confirmation_count = $2, status = $3, updated_at = now()
       where id = $1
       returning *`,
      [issueId, confirms, nextStatus],
    );

    if (nextStatus !== issue.status) {
      await client.query(
        `insert into status_history (
          id, issue_id, from_status, to_status, actor_type, note
        ) values ($1,$2,$3,$4,'system',$5)`,
        [
          `hist-${randomUUID()}`,
          issueId,
          issue.status,
          nextStatus,
          'Topluluk doğrulama eşiği nedeniyle durum güncellendi.',
        ],
      );

      await notifyIssueParticipants(
        client,
        issue,
        clientId,
        'status',
        'Sorun topluluk tarafından doğrulandı',
        `“${issue.title}” topluluk doğrulama eşiğine ulaştı.`,
      );
    }

    return { row: updated.rows[0], alreadyConfirmed: false };
  });

  sendJson(res, 200, {
    issue: rowToIssue(result.row),
    alreadyConfirmed: result.alreadyConfirmed,
  }, origin);
}

async function handleGetCommunity(req, res, origin, issueId) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  const issue = await pool.query(
    'select 1 from issues where id = $1 and hidden_at is null',
    [issueId],
  );
  if (issue.rowCount === 0) {
    sendJson(res, 404, { message: 'Sorun kaydı bulunamadı.' }, origin);
    return;
  }
  sendJson(res, 200, await getCommunitySnapshot(pool, issueId, clientId), origin);
}

async function handleAddComment(req, res, origin, issueId) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  requireWriteBudget(clientId, 'comment');
  const body = await readJson(req);
  const validated = validateCommentBody(body);
  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const comment = await withTransaction(async (client) => {
    const issue = await getIssueRow(client, issueId, { forUpdate: true });
    if (!issue) {
      const error = new Error('Sorun kaydı bulunamadı.');
      error.statusCode = 404;
      throw error;
    }

    const id = `cmt-${randomUUID()}`;
    const inserted = await client.query(
      `insert into comments (
        id, issue_id, client_id, author_label, body
      ) values ($1,$2,$3,$4,$5)
      returning id, issue_id, author_label, body, created_at`,
      [id, issueId, clientId, actor.authorLabel, validated.value],
    );

    await client.query(
      `update issues
       set comment_count = comment_count + 1, updated_at = now()
       where id = $1`,
      [issueId],
    );

    await notifyIssueParticipants(
      client,
      issue,
      clientId,
      'comment',
      'Yeni topluluk güncellemesi',
      `${actor.authorLabel}, “${issue.title}” kaydına yeni bir topluluk güncellemesi ekledi.`,
    );

    return rowToComment(inserted.rows[0]);
  });

  sendJson(res, 201, comment, origin);
}

async function handleResolutionFeedback(req, res, origin, issueId) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  requireWriteBudget(clientId);
  const body = await readJson(req);
  const validated = validateResolutionFeedback(body);
  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const snapshot = await withTransaction(async (client) => {
    const issue = await getIssueRow(client, issueId, { forUpdate: true });
    if (!issue) {
      const error = new Error('Sorun kaydı bulunamadı.');
      error.statusCode = 404;
      throw error;
    }
    if (issue.status !== 'Çözüldü') {
      const error = new Error('Çözüm geri bildirimi yalnız çözülmüş kayıtlarda kullanılabilir.');
      error.statusCode = 409;
      throw error;
    }

    await client.query(
      `insert into resolution_feedback (
        issue_id, client_id, value
      ) values ($1,$2,$3)
      on conflict (issue_id, client_id)
      do update set value = excluded.value, updated_at = now()`,
      [issueId, clientId, validated.value],
    );

    return getCommunitySnapshot(client, issueId, clientId);
  });

  sendJson(res, 200, snapshot, origin);
}


async function handleUploadPhoto(req, res, origin) {
  const actor = await resolveActor(req);
  const clientId = actor.actorId;
  requireWriteBudget(clientId);
  const body = await readJson(req, 12_000_000);
  const decoded = decodeImageDataUrl(body?.dataUrl);
  if (!decoded.ok) {
    sendJson(res, 400, { message: decoded.message }, origin);
    return;
  }

  if (!PUBLIC_BASE_URL) {
    const error = new Error('PUBLIC_BASE_URL environment variable is required for photo URLs.');
    error.statusCode = 500;
    throw error;
  }

  const objectKey = `issue-photos/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${decoded.value.extension}`;
  await putIssuePhoto({
    key: objectKey,
    body: decoded.value.body,
    contentType: decoded.value.contentType,
  });

  sendJson(res, 201, {
    url: `${PUBLIC_BASE_URL}/v1/media/${encodeURIComponent(objectKey)}`,
  }, origin);
}

async function handleGetMedia(res, origin, key) {
  const object = await getIssuePhoto(key);
  if (!object?.Body) {
    sendJson(res, 404, { message: 'Fotoğraf bulunamadı.' }, origin);
    return;
  }

  res.writeHead(200, {
    'Content-Type': object.ContentType ?? 'application/octet-stream',
    'Cache-Control': object.CacheControl ?? 'public, max-age=31536000, immutable',
    ...corsHeaders(origin),
  });

  if (typeof object.Body.transformToWebStream === 'function') {
    const webStream = object.Body.transformToWebStream();
    for await (const chunk of webStream) {
      res.write(Buffer.from(chunk));
    }
    res.end();
    return;
  }

  for await (const chunk of object.Body) {
    res.write(chunk);
  }
  res.end();
}


async function handleModerationReport(req, res, origin) {
  const user = await requireAuthenticatedUser(req);
  if (!allowModeration(`moderation:${user.id}`)) {
    sendJson(res, 429, { message: 'Kısa sürede çok fazla içerik raporlandı.' }, origin);
    return;
  }

  const body = await readJson(req);
  const validated = validateModerationReport(body);
  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const input = validated.value;
  const targetTable = input.targetType === 'issue' ? 'issues' : 'comments';
  const exists = await pool.query(
    `select 1 from ${targetTable} where id = $1 and hidden_at is null limit 1`,
    [input.targetId],
  );

  if (exists.rowCount === 0) {
    sendJson(res, 404, { message: 'Raporlanacak içerik bulunamadı.' }, origin);
    return;
  }

  try {
    const id = `mod-${randomUUID()}`;
    const inserted = await pool.query(
      `insert into moderation_reports (
        id, reporter_user_id, target_type, target_id, reason, note
      ) values ($1,$2,$3,$4,$5,$6)
      returning id, target_type, target_id, reason, note, status, created_at`,
      [id, user.id, input.targetType, input.targetId, input.reason, input.note],
    );

    const row = inserted.rows[0];
    sendJson(res, 201, {
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      note: row.note,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    }, origin);
  } catch (error) {
    if (error?.code === '23505') {
      sendJson(res, 409, { message: 'Bu içeriği zaten inceleme için bildirdin.' }, origin);
      return;
    }
    throw error;
  }
}


async function handleListModerationReports(req, res, origin, url) {
  await requireModerator(req);

  const requestedStatus = url.searchParams.get('status') ?? 'open';
  const allowedStatuses = new Set(['open', 'reviewing', 'resolved', 'dismissed', 'all']);
  const status = allowedStatuses.has(requestedStatus) ? requestedStatus : 'open';

  const params = [];
  const where = status === 'all' ? '' : 'where r.status = $1';
  if (status !== 'all') params.push(status);

  const result = await pool.query(
    `select
       r.id,
       r.target_type,
       r.target_id,
       r.reason,
       r.note,
       r.status,
       r.moderator_note,
       r.reviewed_at,
       r.action_taken,
       r.created_at,
       u.username as reporter_username,
       u.display_name as reporter_display_name,
       case
         when r.target_type = 'issue' then (
           select i.title from issues i where i.id = r.target_id
         )
         when r.target_type = 'comment' then (
           select left(c.body, 180) from comments c where c.id = r.target_id
         )
         else null
       end as target_preview,
       case
         when r.target_type = 'issue' then (
           select (i.hidden_at is not null) from issues i where i.id = r.target_id
         )
         when r.target_type = 'comment' then (
           select (c.hidden_at is not null) from comments c where c.id = r.target_id
         )
         else false
       end as target_hidden
     from moderation_reports r
     join users u on u.id = r.reporter_user_id
     ${where}
     order by r.created_at desc
     limit 200`,
    params,
  );

  sendJson(res, 200, {
    reports: result.rows.map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      targetPreview: row.target_preview,
      reason: row.reason,
      note: row.note,
      status: row.status,
      moderatorNote: row.moderator_note,
      actionTaken: row.action_taken,
      targetHidden: Boolean(row.target_hidden),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      reporter: {
        username: row.reporter_username,
        displayName: row.reporter_display_name,
      },
    })),
  }, origin);
}

async function handleReviewModerationReport(req, res, origin, reportId) {
  const moderator = await requireModerator(req);
  const body = await readJson(req);
  const validated = validateModerationReview(body);

  if (!validated.ok) {
    sendJson(res, 400, { message: validated.message }, origin);
    return;
  }

  const result = await withTransaction(async (client) => {
    const reportResult = await client.query(
      `select * from moderation_reports where id = $1 for update`,
      [reportId],
    );
    const report = reportResult.rows[0];

    if (!report) {
      const error = new Error('Moderasyon raporu bulunamadı.');
      error.statusCode = 404;
      throw error;
    }

    let targetHidden = false;
    const contentAction = validated.value.contentAction;

    if (contentAction !== 'none') {
      const tableName = report.target_type === 'issue'
        ? 'issues'
        : report.target_type === 'comment'
          ? 'comments'
          : null;

      if (!tableName) {
        const error = new Error('Moderasyon hedefi geçersiz.');
        error.statusCode = 400;
        throw error;
      }

      const targetResult = await client.query(
        `select id, hidden_at${tableName === 'comments' ? ', issue_id' : ''}
         from ${tableName}
         where id = $1
         for update`,
        [report.target_id],
      );
      const target = targetResult.rows[0];

      if (!target) {
        const error = new Error('Moderasyon hedefi artık bulunamıyor.');
        error.statusCode = 404;
        throw error;
      }

      if (contentAction === 'hide' && !target.hidden_at) {
        await client.query(
          `update ${tableName}
           set hidden_at = now(),
               hidden_by_user_id = $2,
               moderation_note = $3,
               updated_at = now()
           where id = $1`,
          [report.target_id, moderator.id, validated.value.moderatorNote],
        );

        if (tableName === 'comments') {
          await client.query(
            `update issues
             set comment_count = greatest(0, comment_count - 1),
                 updated_at = now()
             where id = $1`,
            [target.issue_id],
          );
        }
        targetHidden = true;
      } else if (contentAction === 'restore' && target.hidden_at) {
        await client.query(
          `update ${tableName}
           set hidden_at = null,
               hidden_by_user_id = null,
               moderation_note = $2,
               updated_at = now()
           where id = $1`,
          [report.target_id, validated.value.moderatorNote],
        );

        if (tableName === 'comments') {
          await client.query(
            `update issues
             set comment_count = comment_count + 1,
                 updated_at = now()
             where id = $1`,
            [target.issue_id],
          );
        }
        targetHidden = false;
      } else {
        targetHidden = Boolean(target.hidden_at);
      }
    } else {
      const tableName = report.target_type === 'issue'
        ? 'issues'
        : report.target_type === 'comment'
          ? 'comments'
          : null;
      if (tableName) {
        const targetState = await client.query(
          `select hidden_at from ${tableName} where id = $1`,
          [report.target_id],
        );
        targetHidden = Boolean(targetState.rows[0]?.hidden_at);
      }
    }

    if (contentAction === 'hide' || contentAction === 'restore') {
      const tableName = report.target_type === 'issue'
        ? 'issues'
        : report.target_type === 'comment'
          ? 'comments'
          : null;

      if (tableName) {
        const ownerResult = await client.query(
          tableName === 'issues'
            ? `select created_by_actor as actor_id, id as issue_id
               from issues where id = $1`
            : `select client_id as actor_id, issue_id
               from comments where id = $1`,
          [report.target_id],
        );
        const owner = ownerResult.rows[0];
        const moderatorActor = `user:${moderator.id}`;

        if (owner?.actor_id && owner.actor_id !== moderatorActor) {
          await createNotification(client, {
            recipientActor: owner.actor_id,
            issueId: owner.issue_id ?? null,
            type: 'moderation',
            title: contentAction === 'hide'
              ? 'İçerik moderasyon nedeniyle gizlendi'
              : 'İçerik yeniden görünür hale getirildi',
            body: contentAction === 'hide'
              ? 'Paylaştığın içerik topluluk güvenliği incelemesi sonucunda haritadan gizlendi.'
              : 'Paylaştığın içerik moderasyon incelemesi sonrası yeniden görünür hale getirildi.',
          });
        }
      }
    }

    await client.query(
      `insert into moderation_actions (
        id, report_id, moderator_user_id, previous_status,
        new_status, content_action, note
      ) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        `modact-${randomUUID()}`,
        reportId,
        moderator.id,
        report.status,
        validated.value.status,
        contentAction,
        validated.value.moderatorNote,
      ],
    );

    const updated = await client.query(
      `update moderation_reports
       set status = $2,
           moderator_note = $3,
           reviewed_by_user_id = $4,
           reviewed_at = now(),
           action_taken = $5,
           updated_at = now()
       where id = $1
       returning id, status, moderator_note, reviewed_at, action_taken`,
      [
        reportId,
        validated.value.status,
        validated.value.moderatorNote,
        moderator.id,
        contentAction,
      ],
    );

    return {
      row: updated.rows[0],
      targetHidden,
    };
  });

  sendJson(res, 200, {
    id: result.row.id,
    status: result.row.status,
    moderatorNote: result.row.moderator_note,
    actionTaken: result.row.action_taken,
    targetHidden: result.targetHidden,
    reviewedAt: new Date(result.row.reviewed_at).toISOString(),
  }, origin);
}

async function route(req, res) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  if (origin && !allowedOrigins.has(origin)) {
    sendJson(res, 403, { message: 'Bu origin için erişim izni yok.' }, undefined);
    return;
  }

  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204, origin);
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'POST' && path === '/v1/auth/register') {
    await handleRegister(req, res, origin);
    return;
  }
  if (req.method === 'POST' && path === '/v1/auth/login') {
    await handleLogin(req, res, origin);
    return;
  }
  if (req.method === 'GET' && path === '/v1/auth/me') {
    await handleMe(req, res, origin);
    return;
  }
  if (req.method === 'POST' && path === '/v1/auth/logout') {
    await handleLogout(req, res, origin);
    return;
  }
  if (req.method === 'POST' && path === '/v1/auth/claim-device') {
    await handleClaimDevice(req, res, origin);
    return;
  }

  if (req.method === 'POST' && path === '/v1/moderation/reports') {
    await handleModerationReport(req, res, origin);
    return;
  }

  if (req.method === 'GET' && path === '/v1/moderation/reports') {
    await handleListModerationReports(req, res, origin, url);
    return;
  }

  if (req.method === 'GET' && path === '/health') {
    await pool.query('select 1');
    sendJson(res, 200, { ok: true }, origin);
    return;
  }

  if (req.method === 'GET' && path === '/health/storage') {
    await checkStorage();
    sendJson(res, 200, { ok: true }, origin);
    return;
  }

  if (req.method === 'POST' && path === '/v1/uploads/photo') {
    await handleUploadPhoto(req, res, origin);
    return;
  }

  let mediaMatch = path.match(/^\/v1\/media\/(.+)$/);
  if (mediaMatch && req.method === 'GET') {
    const key = decodeURIComponent(mediaMatch[1]);
    if (!/^issue-photos\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[a-zA-Z0-9-]+\.(jpg|png|webp|heic|heif)$/.test(key)) {
      sendJson(res, 400, { message: 'Geçersiz medya anahtarı.' }, origin);
      return;
    }
    await handleGetMedia(res, origin, key);
    return;
  }

  if (req.method === 'GET' && path === '/v1/issues') {
    await handleGetIssues(res, origin);
    return;
  }
  if (req.method === 'POST' && path === '/v1/issues') {
    await handleCreateIssue(req, res, origin);
    return;
  }
  if (req.method === 'GET' && path === '/v1/me/confirmations') {
    await handleGetMyConfirmations(req, res, origin);
    return;
  }
  if (req.method === 'GET' && path === '/v1/me/follows') {
    await handleGetMyFollows(req, res, origin);
    return;
  }

  if (req.method === 'GET' && path === '/v1/me/notifications') {
    await handleGetNotifications(req, res, origin, url);
    return;
  }
  if (req.method === 'POST' && path === '/v1/me/notifications/read-all') {
    await handleReadAllNotifications(req, res, origin);
    return;
  }

  let notificationMatch = path.match(/^\/v1\/me\/notifications\/([^/]+)\/read$/);
  if (notificationMatch && req.method === 'PUT') {
    await handleReadNotification(req, res, origin, decodeId(notificationMatch[1]));
    return;
  }

  let moderationMatch = path.match(/^\/v1\/moderation\/reports\/([^/]+)$/);
  if (moderationMatch && req.method === 'PATCH') {
    await handleReviewModerationReport(req, res, origin, decodeId(moderationMatch[1]));
    return;
  }

  let match = path.match(/^\/v1\/issues\/([^/]+)\/follow$/);
  if (match && (req.method === 'PUT' || req.method === 'DELETE')) {
    await handleFollow(req, res, origin, decodeId(match[1]), req.method === 'PUT');
    return;
  }

  match = path.match(/^\/v1\/issues\/([^/]+)\/confirmations$/);
  if (match && req.method === 'POST') {
    await handleConfirmation(req, res, origin, decodeId(match[1]));
    return;
  }

  match = path.match(/^\/v1\/issues\/([^/]+)\/community$/);
  if (match && req.method === 'GET') {
    await handleGetCommunity(req, res, origin, decodeId(match[1]));
    return;
  }

  match = path.match(/^\/v1\/issues\/([^/]+)\/comments$/);
  if (match && req.method === 'POST') {
    await handleAddComment(req, res, origin, decodeId(match[1]));
    return;
  }

  match = path.match(/^\/v1\/issues\/([^/]+)\/resolution-feedback$/);
  if (match && req.method === 'PUT') {
    await handleResolutionFeedback(req, res, origin, decodeId(match[1]));
    return;
  }

  sendJson(res, 404, { message: 'Endpoint bulunamadı.' }, origin);
}

async function migrate() {
  if (!RUN_MIGRATIONS) return;
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

await migrate();

const server = createServer((req, res) => {
  void route(req, res).catch((error) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const status = Number(error?.statusCode) || 500;

    if (status >= 500) {
      console.error(error);
    }

    sendJson(
      res,
      status,
      { message: status >= 500 ? 'Sunucu işlemi tamamlayamadı.' : error.message },
      origin && allowedOrigins.has(origin) ? origin : undefined,
    );
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sokak API listening on :${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
