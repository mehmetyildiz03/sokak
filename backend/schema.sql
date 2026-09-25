-- Sokak v0.3 future PostgreSQL schema.
-- Şu anda deploy edilmez.

create table if not exists issues (
  id text primary key,
  category text not null check (category in ('road','light','trash','sidewalk','water','park')),
  category_label text not null,
  emoji text not null,
  title text not null,
  place text not null,
  description text not null,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  severity smallint not null default 1 check (severity between 1 and 3),
  status text not null default 'Yeni'
    check (status in ('Yeni','Doğrulandı','Uzun süredir açık','İşlemde','Çözüldü')),
  confirmation_count integer not null default 1 check (confirmation_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_status_idx on issues(status);
create index if not exists issues_category_idx on issues(category);
create index if not exists issues_created_at_idx on issues(created_at desc);
create index if not exists issues_lat_lng_idx on issues(latitude, longitude);

create table if not exists confirmations (
  issue_id text not null references issues(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  primary key (issue_id, client_id)
);

create index if not exists confirmations_client_idx on confirmations(client_id);

create table if not exists follows (
  issue_id text not null references issues(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  primary key (issue_id, client_id)
);

create index if not exists follows_client_idx on follows(client_id);

create table if not exists comments (
  id text primary key,
  issue_id text not null references issues(id) on delete cascade,
  client_id text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_issue_created_idx on comments(issue_id, created_at);

create table if not exists status_history (
  id text primary key,
  issue_id text not null references issues(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('system','citizen','official','moderator')),
  actor_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists status_history_issue_created_idx
  on status_history(issue_id, created_at);

-- Production aşamasında:
-- 1. client_id yerine authenticated user ilişkisi eklenecek.
-- 2. Yakınlık sorguları büyüdüğünde PostGIS geography(Point,4326) kullanılacak.
-- 3. Fotoğraflar object storage'da tutulacak.
