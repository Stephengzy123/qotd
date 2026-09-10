import postgres from "postgres";

const globalForDb = globalThis as unknown as { qotdSql?: ReturnType<typeof postgres> };

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
