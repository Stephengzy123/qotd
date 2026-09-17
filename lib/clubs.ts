import "server-only";
import { dbReady } from "@/lib/db";
import { errorDetail, logEvent } from "@/lib/log";
import { decryptSecret, encryptSecret } from "@/lib/security";

export type ClubRole = "leader" | "assistant";
export type Club = { id: string; name: string; webhook_url_encrypted: string | null; created_by: string | null; created_at: Date; updated_at: Date };
export type ClubMember = { account_id: string; username: string; club_role: ClubRole; has_password: boolean };
export type ClubSummary = Club & { leaders: number; assistants: number; pending: number; sent_week: number };
export type ClubPost = { id: string; username: string; message: string; success: boolean; status: "pending" | "sent" | "failed" | "rejected"; error: string | null; reviewed_by: string | null; created_at: Date; sent_at: Date | null };
export type Membership = { club: Club; club_role: ClubRole };

// Discord rejects webhook messages longer than 2,000 characters.
export const CLUB_POST_MAX_LENGTH = 2000;
export const CLUB_NAME_PATTERN = /^[\p{L}\p{N} .,'&()\-]{2,80}$/u;
export const CLUB_ROLE_LABELS: Record<ClubRole, string> = { leader: "Club leader", assistant: "Club assistant" };

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

// An assistant only makes sense once the club has a leader to approve their posts.
export async function setMembership(accountId: string, clubId: string, role: ClubRole): Promise<string | null> {
  const sql = await dbReady();
  if (role === "assistant") {
    const leaders = await sql<{ count: number }[]>`select count(*)::int as count from club_members where club_id = ${clubId} and club_role = 'leader' and account_id <> ${accountId}`;
    if (!leaders[0]?.count) return "Add a club leader before adding an assistant.";
  }
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
    select id, username, message, success, status, error, reviewed_by, created_at, sent_at from club_posts
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

async function deliver(club: Club, message: string) {
  if (!club.webhook_url_encrypted) return { responseStatus: null, error: "This club’s channel isn’t connected yet. Ask an admin to add the webhook." };
  try {
    const response = await fetch(decryptSecret(club.webhook_url_encrypted), {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Explicit @user and @role mentions work; @everyone and @here do not.
      body: JSON.stringify({ content: message, allowed_mentions: { parse: ["users", "roles"] } }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return { responseStatus: response.status, error: response.ok ? null : `Discord returned HTTP ${response.status}.` };
  } catch (error) {
    return { responseStatus: null, error: errorDetail(error) || "The Discord request failed." };
  }
}

// Sends immediately and records the attempt. Used by leaders and admins.
export async function postClubMessage(club: Club, author: Author, message: string): Promise<PostResult> {
  const result = await deliver(club, message);
  const success = !result.error;
  const sql = await dbReady();
  const rows = await sql<{ id: string }[]>`
    insert into club_posts (account_id, club_id, username, message, success, status, response_status, error, sent_at)
    values (${author.accountId}, ${club.id}, ${author.username}, ${message}, ${success}, ${success ? "sent" : "failed"}, ${result.responseStatus}, ${result.error}, ${success ? new Date() : null})
    returning id
  `;
  await logEvent({ action: "club_post", actor: author.username, role: author.role, success, details: { club: club.name, clubId: club.id, postId: rows[0]?.id, responseStatus: result.responseStatus, error: result.error ?? undefined, messageLength: message.length } });
  return success ? { success: true } : { error: result.error || "Send failed." };
}

// Assistants queue a post for their leader to approve.
export async function submitClubPost(club: Club, author: Author, message: string) {
  const sql = await dbReady();
  const rows = await sql<{ id: string }[]>`
    insert into club_posts (account_id, club_id, username, message, success, status)
    values (${author.accountId}, ${club.id}, ${author.username}, ${message}, false, 'pending') returning id
  `;
  await logEvent({ action: "submit_club_post", actor: author.username, role: author.role, details: { club: club.name, clubId: club.id, postId: rows[0]?.id, messageLength: message.length } });
  return rows[0]?.id || null;
}

// Approving sends the pending post; the row is claimed first so two reviewers cannot double-send.
export async function reviewClubPost(club: Club, postId: string, reviewer: Author, decision: "approve" | "reject"): Promise<PostResult> {
  const sql = await dbReady();
  if (decision === "reject") {
    const rows = await sql`update club_posts set status = 'rejected', reviewed_by = ${reviewer.username}, reviewed_at = now() where id = ${postId} and club_id = ${club.id} and status = 'pending' returning id`;
    await logEvent({ action: "reject_club_post", actor: reviewer.username, role: reviewer.role, success: rows.length > 0, details: { club: club.name, postId } });
    return rows.length ? { success: true } : { error: "That post was already handled." };
  }
  const claimed = await sql<{ message: string; username: string }[]>`
    update club_posts set status = 'sent', reviewed_by = ${reviewer.username}, reviewed_at = now() where id = ${postId} and club_id = ${club.id} and status = 'pending' returning message, username
  `;
  if (!claimed[0]) return { error: "That post was already handled." };
  const result = await deliver(club, claimed[0].message);
  const success = !result.error;
  await sql`update club_posts set success = ${success}, status = ${success ? "sent" : "failed"}, response_status = ${result.responseStatus}, error = ${result.error}, sent_at = ${success ? new Date() : null} where id = ${postId}`;
  await logEvent({ action: "approve_club_post", actor: reviewer.username, role: reviewer.role, success, details: { club: club.name, postId, author: claimed[0].username, responseStatus: result.responseStatus, error: result.error ?? undefined } });
  return success ? { success: true } : { error: result.error || "Send failed." };
}
