import "server-only";
import { dbReady } from "@/lib/db";
import { errorDetail, logEvent } from "@/lib/log";
import { deliverWebhooks, resolveWebhooks } from "@/lib/webhook-destinations";
import { decryptSecret, encryptSecret, validateDiscordWebhook } from "@/lib/security";

export type ClubRole = "leader" | "assistant";
export type Club = { id: string; name: string; webhook_url_encrypted: string | null; created_by: string | null; created_at: Date; updated_at: Date };
export type ClubMember = { account_id: string; username: string; club_role: ClubRole; has_password: boolean };
export type ClubSummary = Club & { leaders: number; assistants: number; pending: number; sent_week: number };
export type ClubPost = { id: string; username: string; message: string; success: boolean; status: "pending" | "sent" | "failed" | "rejected"; error: string | null; reviewed_by: string | null; created_at: Date; sent_at: Date | null; destination_name: string | null };
export type Membership = { club: Club; club_role: ClubRole };

// Discord rejects webhook messages longer than 2,000 characters.
export const CLUB_POST_MAX_LENGTH = 2000;
export const CLUB_NAME_PATTERN = /^[\p{L}\p{N} .,'&()\-]{2,80}$/u;
export const CLUB_ROLE_LABELS: Record<ClubRole, string> = { leader: "Club manager", assistant: "Member (posting disabled)" };

export async function listClubs() {
  const sql = await dbReady();
  return sql<ClubSummary[]>`
    select c.*,
      (select count(*)::int from club_members m where m.club_id = c.id and m.club_role = 'leader') as leaders,
      (select count(*)::int from club_members m where m.club_id = c.id and m.club_role = 'assistant') as assistants,
      (select count(*)::int from club_posts p where p.club_id = c.id and p.status = 'pending') as pending,
      (select count(*)::int from club_posts p where p.club_id = c.id and p.status = 'sent' and p.created_at > now() - interval '7 days') as sent_week
    from clubs c order by lower(c.name) asc
  `;
}

export async function getClub(id: string) {
  const sql = await dbReady();
  const rows = await sql<Club[]>`select * from clubs where id = ${id} limit 1`;
  return rows[0] || null;
}

export async function listClubMembers(clubId: string) {
  const sql = await dbReady();
  return sql<ClubMember[]>`
    select m.account_id, a.username, m.club_role, a.password_hash is not null as has_password
    from club_members m join accounts a on a.id = m.account_id
    where m.club_id = ${clubId} order by m.club_role asc, lower(a.username) asc
  `;
}

export async function getMembership(accountId: string): Promise<Membership | null> {
  const sql = await dbReady();
  const rows = await sql<(Club & { club_role: ClubRole })[]>`
    select c.*, m.club_role from club_members m join clubs c on c.id = m.club_id where m.account_id = ${accountId} limit 1
  `;
  if (!rows[0]) return null;
  const { club_role, ...club } = rows[0];
  return { club, club_role };
}

export async function createClub(name: string, createdBy: string): Promise<{ error: string; id?: undefined } | { id: string; error?: undefined }> {
  if (!CLUB_NAME_PATTERN.test(name)) return { error: "Club names are 2–80 letters, numbers, spaces, or basic punctuation." };
  const sql = await dbReady();
  const rows = await sql<{ id: string }[]>`insert into clubs (name, created_by) values (${name}, ${createdBy}) on conflict (lower(name)) do nothing returning id`;
  return rows[0] ? { id: rows[0].id } : { error: "A club with that name already exists." };
}

export async function renameClub(id: string, name: string) {
  if (!CLUB_NAME_PATTERN.test(name)) return "Club names are 2–80 letters, numbers, spaces, or basic punctuation.";
  const sql = await dbReady();
  try {
    const rows = await sql`update clubs set name = ${name}, updated_at = now() where id = ${id} returning id`;
    return rows.length ? null : "That club no longer exists.";
  } catch {
    return "A club with that name already exists.";
  }
}

export async function deleteClub(id: string) {
  const sql = await dbReady();
  const rows = await sql<{ name: string }[]>`delete from clubs where id = ${id} returning name`;
  return rows[0]?.name || null;
}

// Only managers may be assigned posting access.
export async function setMembership(accountId: string, clubId: string, role: ClubRole): Promise<string | null> {
  const sql = await dbReady();
  if (role !== "leader") return "Only club managers can be assigned posting access.";
  await sql`
    insert into club_members (account_id, club_id, club_role) values (${accountId}, ${clubId}, ${role})
    on conflict (account_id) do update set club_id = excluded.club_id, club_role = excluded.club_role
  `;
  return null;
}

export async function removeMembership(accountId: string) {
  const sql = await dbReady();
  await sql`delete from club_members where account_id = ${accountId}`;
}

export async function saveClubWebhook(clubId: string, webhookUrl: string) {
  const sql = await dbReady();
  const rows = await sql`update clubs set webhook_url_encrypted = ${encryptSecret(webhookUrl)}, updated_at = now() where id = ${clubId} returning id`;
  return rows.length > 0;
}

export async function listClubPosts(clubId: string, options: { status?: ClubPost["status"]; limit?: number } = {}) {
  const sql = await dbReady();
  const status = options.status ?? "";
  return sql<ClubPost[]>`
    select id, username, message, success, status, error, reviewed_by, created_at, sent_at, destination_name from club_posts
    where club_id = ${clubId} and (${status} = '' or status = ${status})
    order by created_at desc limit ${options.limit ?? 25}
  `;
}

export async function countPendingClubPosts() {
  const sql = await dbReady();
  const rows = await sql<{ count: number }[]>`select count(*)::int as count from club_posts where status = 'pending'`;
  return rows[0]?.count ?? 0;
}

type Author = { accountId: string | null; username: string; role: string };
type PostResult = { error: string; success?: undefined } | { success: true; error?: undefined };

// Authorization and idempotency are checked before any Discord request.
export async function postClubMessage(club: Club, author: Author, message: string, ids: string[], requestId: string): Promise<PostResult> {
  if (!message.trim() || message.length > CLUB_POST_MAX_LENGTH) return { error: "Enter a message of 1–2,000 characters." };
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Reload the composer before posting." };
  let targets: Awaited<ReturnType<typeof resolveWebhooks>>;
  try {
    if (author.role === "admin") {
      if (ids.length !== 1 || ids[0] !== "club-default" || !club.webhook_url_encrypted) return { error: "Choose the club channel." };
      const value = decryptSecret(club.webhook_url_encrypted);
      if (!validateDiscordWebhook(value)) return { error: "Update the club webhook before posting." };
      const url = new URL(value);
      url.searchParams.set("wait", "true");
      targets = [{ id: "club-default", name: club.name, url }];
    } else {
      if (author.role !== "club_leader" || !author.accountId) return { error: "Only club managers and admins can post." };
      const membership = await getMembership(author.accountId);
      if (membership?.club_role !== "leader" || membership.club.id !== club.id) return { error: "Only this club’s managers and admins can post." };
      targets = await resolveWebhooks(ids, author.accountId);
    }
  } catch { return { error: "A selected destination is unavailable. Reload and check its assignment." }; }
  const sql = await dbReady();
  const claimed = await sql`insert into club_send_requests (id, account_id) values (${requestId}, ${author.accountId}) on conflict (id) do nothing returning id`;
  if (!claimed.length) return { error: "This post was already submitted. Check history before posting again." };
  const results = await deliverWebhooks(targets, { content: message, allowed_mentions: { parse: ["users", "roles"] } });
  for (const result of results) {
    await sql`insert into club_posts (account_id, club_id, username, message, success, status, response_status, error, destination_name, sent_at)
      values (${author.accountId}, ${club.id}, ${author.username}, ${message}, ${result.success}, ${result.success ? "sent" : "failed"}, ${result.status}, ${result.error}, ${result.name}, ${result.success ? new Date() : null})`;
  }
  const failed = results.filter(result => !result.success);
  await logEvent({ action: "club_post", actor: author.username, role: author.role, success: !failed.length, details: { clubId: club.id, destinations: results, messageLength: message.length } });
  return failed.length ? { error: results.map(result => result.name + ": " + (result.success ? "sent" : result.error)).join(" · ") } : { success: true };
}
