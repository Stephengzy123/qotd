import postgres from "postgres";

const globalForDb = globalThis as unknown as {
  qotdSql?: ReturnType<typeof postgres>;
  qotdSchemaPromise?: Promise<void>;
  qotdSchemaVersion?: number;
};

const migrations = [
  {
    version: 1,
    statements: [
      `create extension if not exists pgcrypto`,
      `create table if not exists questions (
        id uuid primary key default gen_random_uuid(),
        question text not null check (char_length(question) between 8 and 1500),
        scheduled_date date,
        question_type text not null default 'announcement' check (question_type in ('announcement', 'event')),
        event_title text check (event_title is null or char_length(event_title) between 1 and 200),
        contributor_note text check (contributor_note is null or char_length(contributor_note) <= 500),
        status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent')),
        submitter_ip_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        sent_at timestamptz
      )`,
      `create index if not exists questions_status_created_idx on questions(status, created_at)`,
      `create index if not exists questions_rate_limit_idx on questions(submitter_ip_hash, created_at)`,
      `create table if not exists settings (
        singleton boolean primary key default true check (singleton),
        webhook_url_encrypted text,
        mention_role_id text check (mention_role_id is null or mention_role_id ~ '^[0-9]{15,22}$'),
        next_number integer not null default 1 check (next_number > 0),
        message_template text not null default '**Question of the Day — {date}**\n\n{question}',
        updated_at timestamptz not null default now()
      )`,
      `insert into settings (singleton) values (true) on conflict (singleton) do nothing`,
      `create table if not exists dispatches (
        id uuid primary key default gen_random_uuid(),
        question_id uuid references questions(id) on delete set null,
        local_date date,
        mode text not null check (mode in ('scheduled', 'manual_random', 'manual_selected')),
        message text not null,
        success boolean not null,
        response_status integer,
        error text,
        created_at timestamptz not null default now()
      )`,
      `create unique index if not exists dispatches_one_scheduled_per_day
        on dispatches(local_date) where mode = 'scheduled'`,
    ],
  },
  {
    version: 2,
    statements: [
      `alter table settings add column if not exists mention_role_id text
        check (mention_role_id is null or mention_role_id ~ '^[0-9]{15,22}$')`,
      `update settings
        set message_template = replace(message_template, chr(92) || 'n', chr(10))
        where position(chr(92) || 'n' in message_template) > 0`,
    ],
  },
  {
    version: 3,
    statements: [
      `alter table settings add column if not exists next_number integer not null default 1
        check (next_number > 0)`,
      `update settings
        set next_number = greatest(1, (select count(*)::integer + 1 from dispatches where success = true))`,
    ],
  },
  {
    version: 4,
    statements: [
      `alter table questions add column if not exists scheduled_date date`,
      `alter table questions drop constraint if exists questions_question_check`,
      `alter table questions add constraint questions_question_check
        check (char_length(question) between 8 and 1500)`,
      `alter table settings add column if not exists notification_webhook_url_encrypted text`,
      `alter table settings add column if not exists notification_user_id text
        check (notification_user_id is null or notification_user_id ~ '^[0-9]{15,22}$')`,
      `drop index if exists dispatches_one_scheduled_per_day`,
      `create index if not exists questions_scheduled_date_idx on questions(status, scheduled_date)`,
      `update settings set message_template = '# Announcements for {date}' || chr(10) || chr(10) ||
        '{announcement}' || chr(10) || chr(10) || '-# {mention-role}' where singleton = true`,
    ],
  },
  {
    version: 5,
    statements: [
      `update settings
        set message_template = '# <:sgs:1372767087612657724> Announcements for {date}' || chr(10) || chr(10) ||
          '{announcement}' || chr(10) || chr(10) || '-# {mention-role}'
        where singleton = true and message_template = '# Announcements for {date}' || chr(10) || chr(10) ||
          '{announcement}' || chr(10) || chr(10) || '-# {mention-role}'`,
    ],
  },
  {
    version: 6,
    statements: [
      `alter table questions add column if not exists question_type text not null default 'announcement'`,
      `alter table questions add column if not exists event_title text`,
      `alter table questions drop constraint if exists questions_question_type_check`,
      `alter table questions add constraint questions_question_type_check
        check (question_type in ('announcement', 'event'))`,
      `alter table questions drop constraint if exists questions_event_title_check`,
      `alter table questions add constraint questions_event_title_check
        check (event_title is null or char_length(event_title) between 1 and 200)`,
      `alter table settings add column if not exists event_message_template text not null default
        '# <:sgs:1372767087612657724> Announcement for {title}' || chr(10) || chr(10) ||
        '{announcement}' || chr(10) || chr(10) || '-# {mention-role}'`,
      `create index if not exists questions_type_scheduled_date_idx on questions(status, question_type, scheduled_date)`,
    ],
  },
  {
    version: 7,
    statements: [
      `alter table settings add column if not exists calendar_feed_url_encrypted text`,
      `update settings
        set message_template = '# <:sgs:1372767087612657724> Announcements for {date}' || chr(10) ||
          '{calendar}' || chr(10) || chr(10) || '{announcement}' || chr(10) || chr(10) || '-# {mention-role}'
        where singleton = true and message_template = '# <:sgs:1372767087612657724> Announcements for {date}' || chr(10) || chr(10) ||
          '{announcement}' || chr(10) || chr(10) || '-# {mention-role}'`,
    ],
  },
  {
    version: 8,
    statements: [
      `alter table questions add column if not exists days_early integer not null default 0`,
      `alter table questions drop constraint if exists questions_days_early_check`,
      `alter table questions add constraint questions_days_early_check check (days_early between 0 and 365)`,
    ],
  },
  {
    version: 9,
    statements: [
      `create table if not exists app_users (
        id uuid primary key default gen_random_uuid(),
        username text not null check (char_length(username) between 3 and 40),
        password_hash text not null,
        created_at timestamptz not null default now()
      )`,
      `create unique index if not exists app_users_username_idx on app_users(lower(username))`,
      `alter table dispatches add column if not exists question_type text check (question_type in ('announcement', 'event'))`,
      `update dispatches d set question_type = q.question_type from questions q where q.id = d.question_id and d.question_type is null`,
      `create index if not exists dispatches_live_idx on dispatches(created_at desc, id desc) where success = true`,
    ],
  },
  {
    version: 10,
    statements: [
      `create table if not exists app_users (
        id uuid primary key default gen_random_uuid(),
        username text not null check (char_length(username) between 3 and 40),
        password_hash text not null,
        created_at timestamptz not null default now()
      )`,
      `create unique index if not exists app_users_username_idx on app_users(lower(username))`,
      `alter table dispatches add column if not exists question_type text check (question_type in ('announcement', 'event'))`,
      `update dispatches d set question_type = q.question_type from questions q where q.id = d.question_id and d.question_type is null`,
      `create index if not exists dispatches_live_idx on dispatches(created_at desc, id desc) where success = true`,
      `create table if not exists accounts (
        id uuid primary key default gen_random_uuid(),
        username text not null check (char_length(username) between 2 and 64),
        password_hash text not null,
        role text not null check (role in ('contributor', 'admin')),
        created_by text,
        created_at timestamptz not null default now()
      )`,
      `create unique index if not exists accounts_username_lower_idx on accounts(lower(username))`,
      `create table if not exists activity_log (
        id uuid primary key default gen_random_uuid(),
        action text not null,
        actor text,
        actor_role text,
        success boolean not null default true,
        details jsonb,
        created_at timestamptz not null default now()
      )`,
      `create index if not exists activity_log_created_idx on activity_log(created_at desc)`,
      `do $migration$ begin
        if exists (select 1 from app_users u join accounts a on lower(a.username) = lower(u.username) where a.password_hash <> u.password_hash) then
          raise exception 'Account migration blocked: duplicate usernames with different passwords in app_users and accounts';
        end if;
      end $migration$`,
      `insert into accounts (username, password_hash, role, created_at)
        select username, password_hash, 'contributor', created_at from app_users on conflict do nothing`,
      `alter table dispatches add column if not exists hidden_from_live boolean not null default false`,
    ],
  },
  {
    version: 11,
    statements: [
      `create table if not exists push_subscriptions (
        endpoint text primary key,
        p256dh text not null,
        auth text not null,
        address_hash text not null,
        created_at timestamptz not null default now()
      )`,
      `create index if not exists push_subscriptions_address_idx on push_subscriptions(address_hash, created_at)`,
    ],
  },
  {
    version: 12,
    statements: [
      `alter table dispatches add column if not exists destination text not null default 'discord' check (destination in ('discord', 'live'))`,
    ],
  },
  {
    version: 13,
    statements: [
      `alter table dispatches add column if not exists sender_name text`,
      `alter table dispatches add column if not exists sender_avatar_url text`,
    ],
  },
  {
    version: 14,
    statements: [
      `alter table dispatches add column if not exists calendar_fallback_date date`,
      `create unique index if not exists dispatches_calendar_fallback_date on dispatches(calendar_fallback_date)`,
    ],
  },
  {
    version: 15,
    statements: [
      // Accounts are created without a password; the person sets one through a setup link.
      `alter table accounts alter column password_hash drop not null`,
      `alter table accounts drop constraint if exists accounts_role_check`,
      `alter table accounts add constraint accounts_role_check check (role in ('contributor', 'admin', 'club_leader'))`,
      `create table if not exists password_setup_tokens (
        id uuid primary key default gen_random_uuid(),
        account_id uuid not null references accounts(id) on delete cascade,
        token_hash text not null unique,
        token_encrypted text not null,
        created_by text,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )`,
      `create index if not exists password_setup_tokens_account_idx on password_setup_tokens(account_id, created_at desc)`,
      `create table if not exists club_channels (
        account_id uuid primary key references accounts(id) on delete cascade,
        webhook_url_encrypted text,
        updated_by text,
        updated_at timestamptz not null default now()
      )`,
      `create table if not exists club_posts (
        id uuid primary key default gen_random_uuid(),
        account_id uuid references accounts(id) on delete set null,
        username text not null,
        message text not null,
        success boolean not null,
        response_status integer,
        error text,
        created_at timestamptz not null default now()
      )`,
      `create index if not exists club_posts_account_idx on club_posts(account_id, created_at desc)`,
    ],
  },
  {
    version: 16,
    statements: [
      `create table if not exists saved_webhooks (
        id uuid primary key default gen_random_uuid(), name text not null,
        webhook_url_encrypted text not null, primary_enabled boolean not null default false
      )`,
      `create table if not exists webhook_assignments (
        webhook_id uuid references saved_webhooks(id) on delete cascade,
        account_id uuid references accounts(id) on delete cascade,
        primary key (webhook_id, account_id)
      )`,
      `alter table questions add column if not exists discord_webhook_ids text[]`,
      `alter table club_posts add column if not exists destination_name text`,
      `create table if not exists club_send_requests (
        id uuid primary key, account_id uuid references accounts(id) on delete set null,
        created_at timestamptz not null default now()
      )`,
    ],
  },
  {
    version: 17,
    statements: [
      `create table if not exists saved_webhooks (
        id uuid primary key default gen_random_uuid(), name text not null,
        webhook_url_encrypted text not null, primary_enabled boolean not null default false
      )`,
      `create table if not exists webhook_assignments (
        webhook_id uuid references saved_webhooks(id) on delete cascade,
        account_id uuid references accounts(id) on delete cascade,
        primary key (webhook_id, account_id)
      )`,
      `alter table questions add column if not exists discord_webhook_ids text[]`,
      `alter table club_posts add column if not exists destination_name text`,
      `create table if not exists club_send_requests (
        id uuid primary key, account_id uuid references accounts(id) on delete set null,
        created_at timestamptz not null default now()
      )`,

      // Reconcile PR #15 with the released saved-webhook migration.
      // Preserve legacy assistant records without granting them posting access.
      `create table if not exists clubs (
        id uuid primary key default gen_random_uuid(),
        name text not null check (char_length(name) between 2 and 80),
        webhook_url_encrypted text,
        created_by text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      `create unique index if not exists clubs_name_lower_idx on clubs(lower(name))`,
      `create table if not exists club_members (
        account_id uuid primary key references accounts(id) on delete cascade,
        club_id uuid not null references clubs(id) on delete cascade,
        club_role text not null check (club_role in ('leader', 'assistant')),
        created_at timestamptz not null default now()
      )`,
      `create index if not exists club_members_club_idx on club_members(club_id, club_role)`,
      `alter table club_posts add column if not exists club_id uuid references clubs(id) on delete set null`,
      `alter table club_posts add column if not exists status text not null default 'sent' check (status in ('pending', 'sent', 'failed', 'rejected'))`,
      `alter table club_posts add column if not exists reviewed_by text`,
      `alter table club_posts add column if not exists reviewed_at timestamptz`,
      `alter table club_posts add column if not exists sent_at timestamptz`,
      `update club_posts set status = case when success then 'sent' else 'failed' end, sent_at = coalesce(sent_at, created_at) where status = 'sent'`,
      `create index if not exists club_posts_club_status_idx on club_posts(club_id, status, created_at desc)`,
      // Migrate the one-webhook-per-account rows into clubs named after the account.
      `insert into clubs (name, webhook_url_encrypted, created_by, created_at, updated_at)
        select a.username, c.webhook_url_encrypted, c.updated_by, coalesce(c.updated_at, now()), coalesce(c.updated_at, now())
        from accounts a left join club_channels c on c.account_id = a.id
        where a.role = 'club_leader' and not exists (select 1 from club_members m where m.account_id = a.id)
        on conflict do nothing`,
      `insert into club_members (account_id, club_id, club_role)
        select a.id, k.id, 'leader' from accounts a
        join clubs k on lower(k.name) = lower(a.username) where a.role = 'club_leader'
        on conflict do nothing`,
      `update club_posts p set club_id = m.club_id from club_members m where m.account_id = p.account_id and p.club_id is null`,
      `create table if not exists passkeys (
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
      )`,
      `create index if not exists passkeys_account_idx on passkeys(account_id)`,
    ],
  },
  {
    version: 18,
    statements: [
      `alter table questions add column if not exists delivery_destination text not null default 'discord' check (delivery_destination in ('discord', 'live'))`,
      `alter table questions add column if not exists remove_pings boolean not null default false`,
    ],
  },
  {
    version: 19,
    statements: [
      `alter table settings add column if not exists live_channel_name text
        check (live_channel_name is null or char_length(live_channel_name) between 1 and 60)`,
    ],
  },
  {
    version: 20,
    statements: [
      `alter table questions add column if not exists send_schedule_mode text not null default 'auto'`,
      `alter table questions add column if not exists send_at timestamptz`,
      `alter table questions drop constraint if exists questions_send_schedule_mode_check`,
      `alter table questions add constraint questions_send_schedule_mode_check
        check (send_schedule_mode in ('auto', 'disabled', 'exact'))`,
      `alter table questions drop constraint if exists questions_exact_send_at_check`,
      `alter table questions add constraint questions_exact_send_at_check
        check (send_schedule_mode <> 'exact' or send_at is not null)`,
      `create index if not exists questions_due_exact_idx
        on questions(send_at, created_at) where status = 'approved' and send_schedule_mode = 'exact'`,
    ],
  },
] as const;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!globalForDb.qotdSql) {
    globalForDb.qotdSql = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return globalForDb.qotdSql;
}

async function migrateSchema() {
  const sql = db();
  await sql.begin(async (tx) => {
    // Serialize migrations across simultaneous Vercel cold starts.
    await tx`select pg_advisory_xact_lock(716834641)`;
    await tx.unsafe(`create table if not exists announcement_schema_migrations (
      version integer primary key,
      applied_at timestamptz not null default now()
    )`);
    const appliedRows = await tx<{ version: number }[]>`select version from announcement_schema_migrations`;
    const applied = new Set(appliedRows.map((row) => Number(row.version)));
    const coreState = (await tx<{ complete: boolean }[]>`
      select
        to_regclass('questions') is not null and
        to_regclass('settings') is not null and
        to_regclass('dispatches') is not null and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'questions' and column_name = 'scheduled_date'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'settings' and column_name = 'notification_webhook_url_encrypted'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'settings' and column_name = 'notification_user_id'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'questions' and column_name = 'question_type'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'questions' and column_name = 'event_title'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'settings' and column_name = 'event_message_template'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'settings' and column_name = 'calendar_feed_url_encrypted'
        ) and
        exists (
          select 1 from information_schema.columns
          where table_schema = current_schema() and table_name = 'questions' and column_name = 'days_early'
        ) and
        to_regclass('accounts') is not null and
        to_regclass('activity_log') is not null and
        to_regclass('password_setup_tokens') is not null and
        to_regclass('club_channels') is not null and
        to_regclass('club_posts') is not null as complete
    `)[0];
    for (const migration of migrations) {
      // Never replay historical data-changing migrations to repair schema drift.
      // Migration 10 reconciles both independently released migration 9 variants.
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) await tx.unsafe(statement);
      await tx`insert into announcement_schema_migrations (version) values (${migration.version}) on conflict (version) do nothing`;
    }
  });
}

async function coreSchemaExists() {
  const sql = db();
  const rows = await sql<{ complete: boolean }[]>`
    select
      to_regclass('questions') is not null and
      to_regclass('settings') is not null and
      to_regclass('dispatches') is not null and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'questions' and column_name = 'scheduled_date'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'settings' and column_name = 'notification_webhook_url_encrypted'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'settings' and column_name = 'notification_user_id'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'questions' and column_name = 'question_type'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'questions' and column_name = 'event_title'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'settings' and column_name = 'event_message_template'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'settings' and column_name = 'calendar_feed_url_encrypted'
      ) and
      exists (
        select 1 from information_schema.columns
        where table_schema = current_schema() and table_name = 'questions' and column_name = 'days_early'
      ) and
      to_regclass('accounts') is not null and
      to_regclass('activity_log') is not null and
      to_regclass('password_setup_tokens') is not null and
      to_regclass('club_channels') is not null and
      to_regclass('club_posts') is not null as complete
  `;
  return Boolean(rows[0]?.complete);
}

export async function ensureSchema() {
  if (!globalForDb.qotdSchemaPromise || globalForDb.qotdSchemaVersion !== migrations[migrations.length - 1].version) {
    globalForDb.qotdSchemaVersion = migrations[migrations.length - 1].version;
    globalForDb.qotdSchemaPromise = migrateSchema().catch((error) => {
      globalForDb.qotdSchemaPromise = undefined;
      throw error;
    });
  }
  await globalForDb.qotdSchemaPromise;
  // Check every database-backed request. This also repairs drift after a
  // manually dropped table or a preserved development hot-reload global.
  if (!(await coreSchemaExists())) {
    globalForDb.qotdSchemaPromise = migrateSchema().catch((error) => {
      globalForDb.qotdSchemaPromise = undefined;
      throw error;
    });
    await globalForDb.qotdSchemaPromise;
    if (!(await coreSchemaExists())) throw new Error("Database schema initialization did not create the required tables");
  }
}

export async function dbReady() {
  await ensureSchema();
  return db();
}
