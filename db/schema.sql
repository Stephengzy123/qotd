create extension if not exists pgcrypto;

create table if not exists announcement_schema_migrations (
  version integer primary key,
  applied_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 8 and 1500),
  scheduled_date date,
  question_type text not null default 'announcement' check (question_type in ('announcement', 'event')),
  event_title text check (event_title is null or char_length(event_title) between 1 and 200),
  days_early integer not null default 0 check (days_early between 0 and 365),
  contributor_note text check (contributor_note is null or char_length(contributor_note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent')),
  submitter_ip_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists questions_status_created_idx on questions(status, created_at);
create index if not exists questions_rate_limit_idx on questions(submitter_ip_hash, created_at);

create table if not exists settings (
  singleton boolean primary key default true check (singleton),
  webhook_url_encrypted text,
  mention_role_id text check (mention_role_id is null or mention_role_id ~ '^[0-9]{15,22}$'),
  next_number integer not null default 1 check (next_number > 0),
  message_template text not null default '# <:sgs:1372767087612657724> Announcements for {date}\n{calendar}\n\n{announcement}\n\n-# {mention-role}',
  event_message_template text not null default '# <:sgs:1372767087612657724> Announcement for {title}\n\n{announcement}\n\n-# {mention-role}',
  calendar_feed_url_encrypted text,
  notification_webhook_url_encrypted text,
  notification_user_id text check (notification_user_id is null or notification_user_id ~ '^[0-9]{15,22}$'),
  updated_at timestamptz not null default now()
);

insert into settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists dispatches (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete set null,
  local_date date,
  mode text not null check (mode in ('scheduled', 'manual_random', 'manual_selected')),
  destination text not null default 'discord' check (destination in ('discord', 'live')),
  message text not null,
  sender_name text,
  sender_avatar_url text,
  calendar_fallback_date date unique,
  success boolean not null,
  response_status integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists questions_scheduled_date_idx on questions(status, scheduled_date);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(username) between 2 and 64),
  password_hash text,
  role text not null check (role in ('contributor', 'admin', 'club_leader')),
  created_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists accounts_username_lower_idx on accounts(lower(username));

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor text,
  actor_role text,
  success boolean not null default true,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on activity_log(created_at desc);

create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  address_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_address_idx on push_subscriptions(address_hash, created_at);

create table if not exists password_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text not null unique,
  token_encrypted text not null,
  created_by text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_setup_tokens_account_idx on password_setup_tokens(account_id, created_at desc);

create table if not exists club_channels (
  account_id uuid primary key references accounts(id) on delete cascade,
  webhook_url_encrypted text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  webhook_url_encrypted text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clubs_name_lower_idx on clubs(lower(name));

create table if not exists club_members (
  account_id uuid primary key references accounts(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  club_role text not null check (club_role in ('leader', 'assistant')),
  created_at timestamptz not null default now()
);

create index if not exists club_members_club_idx on club_members(club_id, club_role);

create table if not exists club_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  club_id uuid references clubs(id) on delete set null,
  username text not null,
  message text not null,
  success boolean not null,
  status text not null default 'sent' check (status in ('pending', 'sent', 'failed', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  sent_at timestamptz,
  response_status integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists club_posts_club_status_idx on club_posts(club_id, status, created_at desc);

create table if not exists passkeys (
  id text primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  device_type text,
  backed_up boolean not null default false,
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists passkeys_account_idx on passkeys(account_id);

create index if not exists club_posts_account_idx on club_posts(account_id, created_at desc);
