import postgres from "postgres";

const globalForDb = globalThis as unknown as {
  qotdSql?: ReturnType<typeof postgres>;
  qotdSchemaPromise?: Promise<void>;
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
    await tx.unsafe(`create table if not exists qotd_schema_migrations (
      version integer primary key,
      applied_at timestamptz not null default now()
    )`);
    const appliedRows = await tx<{ version: number }[]>`select version from qotd_schema_migrations`;
    const applied = new Set(appliedRows.map((row) => Number(row.version)));
    const coreState = (await tx<{ complete: boolean }[]>`
      select
        to_regclass('questions') is not null and
        to_regclass('settings') is not null and
        to_regclass('dispatches') is not null as complete
    `)[0];
    for (const migration of migrations) {
      // Re-run the baseline's idempotent statements if a migration record and
      // the actual schema ever drift apart.
      if (applied.has(migration.version) && coreState?.complete) continue;
      for (const statement of migration.statements) await tx.unsafe(statement);
      await tx`insert into qotd_schema_migrations (version) values (${migration.version}) on conflict (version) do nothing`;
    }
  });
}

async function coreSchemaExists() {
  const sql = db();
  const rows = await sql<{ complete: boolean }[]>`
    select
      to_regclass('questions') is not null and
      to_regclass('settings') is not null and
      to_regclass('dispatches') is not null as complete
  `;
  return Boolean(rows[0]?.complete);
}

export async function ensureSchema() {
  if (!globalForDb.qotdSchemaPromise) {
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
