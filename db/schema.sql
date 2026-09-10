create extension if not exists pgcrypto;

create table if not exists qotd_schema_migrations (
  version integer primary key,
  applied_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 8 and 500),
  question_type text not null default 'open' check (question_type in ('open', 'reaction')),
  reactions text[] not null default '{}',
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
  bot_token_encrypted text,
  bot_application_id text check (bot_application_id is null or bot_application_id ~ '^[0-9]{15,22}$'),
  bot_channel_id text check (bot_channel_id is null or bot_channel_id ~ '^[0-9]{15,22}$'),
  mention_role_id text check (mention_role_id is null or mention_role_id ~ '^[0-9]{15,22}$'),
  next_number integer not null default 1 check (next_number > 0),
  automatic_question_type text not null default 'both' check (automatic_question_type in ('both', 'open', 'reaction')),
  open_message_template text not null default '**Question of the Day — {date}**\n\n{question}',
  reaction_message_template text not null default '**Question of the Day — {date}**\n\n{question}',
  message_template text not null default '**Question of the Day — {date}**\n\n{question}',
  updated_at timestamptz not null default now()
);

insert into settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists dispatches (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete set null,
  local_date date,
  mode text not null check (mode in ('scheduled', 'manual_random', 'manual_selected')),
  transport text not null default 'webhook' check (transport in ('bot', 'webhook')),
  message text not null,
  success boolean not null,
  response_status integer,
  error text,
  created_at timestamptz not null default now()
);

create unique index if not exists dispatches_one_scheduled_per_day
  on dispatches(local_date) where mode = 'scheduled';
