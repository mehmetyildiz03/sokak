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
  validateResolutionFeedback,
} from './core.js';
import { checkStorage, decodeImageDataUrl, getIssuePhoto, putIssuePhoto } from './storage.js';

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

function corsHeaders(origin) {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sokak-Client-Id',
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

async function getIssueRow(queryable, issueId, { forUpdate = false } = {}) {
  const suffix = forUpdate ? ' FOR UPDATE' : '';
  const result = await queryable.query(`select * from issues where id = $1${suffix}`, [issueId]);
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
     order by created_at desc
     limit 5000`,
  );
  sendJson(res, 200, result.rows.map(rowToIssue), origin);
}

async function handleCreateIssue(req, res, origin) {
  const clientId = requireClientId(req);
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
        longitude, latitude, severity, status, confirmation_count, comment_count, photo_url
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Yeni',1,0,$11
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
  const clientId = requireClientId(req);
  const result = await pool.query(
    `select issue_id from confirmations where client_id = $1 order by created_at desc`,
    [clientId],
  );
  sendJson(res, 200, { issueIds: result.rows.map((row) => row.issue_id) }, origin);
}

async function handleGetMyFollows(req, res, origin) {
  const clientId = requireClientId(req);
  const result = await pool.query(
    `select issue_id from follows where client_id = $1 order by created_at desc`,
    [clientId],
  );
  sendJson(res, 200, { issueIds: result.rows.map((row) => row.issue_id) }, origin);
}

async function handleFollow(req, res, origin, issueId, followed) {
  const clientId = requireClientId(req);
  requireWriteBudget(clientId);

  if (followed) {
    const exists = await pool.query('select 1 from issues where id = $1', [issueId]);
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
  const clientId = requireClientId(req);
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
    }

    return { row: updated.rows[0], alreadyConfirmed: false };
  });

  sendJson(res, 200, {
    issue: rowToIssue(result.row),
    alreadyConfirmed: result.alreadyConfirmed,
  }, origin);
}

async function handleGetCommunity(req, res, origin, issueId) {
  const clientId = requireClientId(req);
  const issue = await pool.query('select 1 from issues where id = $1', [issueId]);
  if (issue.rowCount === 0) {
    sendJson(res, 404, { message: 'Sorun kaydı bulunamadı.' }, origin);
    return;
  }
  sendJson(res, 200, await getCommunitySnapshot(pool, issueId, clientId), origin);
}

async function handleAddComment(req, res, origin, issueId) {
  const clientId = requireClientId(req);
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
      [id, issueId, clientId, createAuthorLabel(clientId), validated.value],
    );

    await client.query(
      `update issues
       set comment_count = comment_count + 1, updated_at = now()
       where id = $1`,
      [issueId],
    );

    return rowToComment(inserted.rows[0]);
  });

  sendJson(res, 201, comment, origin);
}

async function handleResolutionFeedback(req, res, origin, issueId) {
  const clientId = requireClientId(req);
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
  const clientId = requireClientId(req);
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
