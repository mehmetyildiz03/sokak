-- Sokak production PostgreSQL schema.

create table if not exists users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'citizen'
    check (role in ('citizen','moderator','official','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists users_username_idx on users(username);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists sessions_expiry_idx on sessions(expires_at);

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  kind text not null check (kind in ('municipality','utility','other')),
  verified_at timestamptz,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_verified_idx
  on organizations(verified_at)
  where verified_at is not null;

create table if not exists organization_memberships (
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('official','org_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_memberships_user_idx
  on organization_memberships(user_id)
  where active = true;

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
  last_comment_at timestamptz,
  photo_url text,
  created_by_actor text,
  hidden_at timestamptz,
  hidden_by_user_id text references users(id) on delete set null,
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_status_idx on issues(status);
create index if not exists issues_category_idx on issues(category);
create index if not exists issues_created_at_idx on issues(created_at desc);
create index if not exists issues_lat_lng_idx on issues(latitude, longitude);

create table if not exists issue_assignments (
  issue_id text primary key references issues(id) on delete cascade,
  organization_id text not null references organizations(id) on delete restrict,
  assigned_by_user_id text references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issue_assignments_organization_idx
  on issue_assignments(organization_id);


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
  author_label text not null,
  body text not null check (char_length(body) between 2 and 1000),
  hidden_at timestamptz,
  hidden_by_user_id text references users(id) on delete set null,
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_issue_created_idx on comments(issue_id, created_at);

create table if not exists resolution_feedback (
  issue_id text not null references issues(id) on delete cascade,
  client_id text not null,
  value text not null check (value in ('resolved','still_open')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (issue_id, client_id)
);

create index if not exists resolution_feedback_issue_idx
  on resolution_feedback(issue_id);

create table if not exists status_history (
  id text primary key,
  issue_id text not null references issues(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('system','citizen','official','moderator')),
  actor_id text,
  organization_id text references organizations(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists status_history_issue_created_idx
  on status_history(issue_id, created_at);

-- Production aşamasında:
-- 1. client_id yerine authenticated user ilişkisi eklenecek.
-- 2. Yakınlık sorguları büyüdüğünde PostGIS geography(Point,4326) kullanılacak.
-- 3. Fotoğraflar object storage'da tutulacak.


alter table issues
  add column if not exists created_by_actor text;


create table if not exists moderation_reports (
  id text primary key,
  reporter_user_id text not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('issue','comment')),
  target_id text not null,
  reason text not null check (
    reason in ('false_information','harassment','personal_info','spam','other')
  ),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open'
    check (status in ('open','reviewing','resolved','dismissed')),
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 1000),
  reviewed_by_user_id text references users(id) on delete set null,
  reviewed_at timestamptz,
  action_taken text not null default 'none'
    check (action_taken in ('none','hide','restore')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moderation_reports_status_created_idx
  on moderation_reports(status, created_at);

create unique index if not exists moderation_reports_open_unique_idx
  on moderation_reports(reporter_user_id, target_type, target_id)
  where status in ('open','reviewing');


alter table moderation_reports
  add column if not exists moderator_note text;
alter table moderation_reports
  add column if not exists reviewed_by_user_id text references users(id) on delete set null;
alter table moderation_reports
  add column if not exists reviewed_at timestamptz;


alter table issues
  add column if not exists hidden_at timestamptz;
alter table issues
  add column if not exists hidden_by_user_id text references users(id) on delete set null;
alter table issues
  add column if not exists moderation_note text;

alter table comments
  add column if not exists hidden_at timestamptz;
alter table comments
  add column if not exists hidden_by_user_id text references users(id) on delete set null;
alter table comments
  add column if not exists moderation_note text;

alter table moderation_reports
  add column if not exists action_taken text not null default 'none';


create table if not exists moderation_actions (
  id text primary key,
  report_id text not null references moderation_reports(id) on delete cascade,
  moderator_user_id text not null references users(id) on delete restrict,
  previous_status text not null
    check (previous_status in ('open','reviewing','resolved','dismissed')),
  new_status text not null
    check (new_status in ('reviewing','resolved','dismissed')),
  content_action text not null default 'none'
    check (content_action in ('none','hide','restore')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_report_created_idx
  on moderation_actions(report_id, created_at);


create table if not exists notifications (
  id text primary key,
  recipient_actor text not null,
  issue_id text references issues(id) on delete cascade,
  type text not null check (type in ('comment','status','moderation')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on notifications(recipient_actor, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on notifications(recipient_actor, read_at)
  where read_at is null;


alter table status_history
  add column if not exists organization_id text references organizations(id) on delete set null;


alter table issues
  add column if not exists last_comment_at timestamptz;

update issues i
set last_comment_at = latest.last_comment_at
from (
  select issue_id, max(created_at) as last_comment_at
  from comments
  where hidden_at is null
  group by issue_id
) latest
where i.id = latest.issue_id
  and (i.last_comment_at is null or i.last_comment_at < latest.last_comment_at);
