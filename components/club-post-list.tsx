import { DiscordMarkdown } from "@/components/discord-preview";
import { MessagePreview } from "@/components/message-preview";
import type { ClubPost } from "@/lib/clubs";
import type { ReactNode } from "react";

const STATUS: Record<ClubPost["status"], { label: string; dot: string; badge: string }> = {
  sent: { label: "Posted", dot: "success", badge: "ready" },
  failed: { label: "Failed", dot: "failed", badge: "failed" },
  pending: { label: "Awaiting approval", dot: "pending", badge: "pending" },
  rejected: { label: "Rejected", dot: "muted", badge: "" },
};

export function relativeDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

// One row per club post, with optional per-row controls (approve/reject).
export function ClubPostList({ posts, empty, controls }: { posts: ClubPost[]; empty: string; controls?: (post: ClubPost) => ReactNode }) {
  if (!posts.length) return <div className="empty-state compact"><p>{empty}</p></div>;
  return <div className="activity-list club-posts">{posts.map((post) => {
    const status = STATUS[post.status];
    return <div key={post.id} className={`club-post status-${post.status}`}>
      <span className={`activity-dot ${status.dot}`} />
      <div>
        <div className="log-row-title"><span className={`status ${status.badge}`}>{status.label}</span><span className="who">{post.username}</span>{post.reviewed_by && post.status !== "pending" && <small className="hint">{post.status === "rejected" ? "rejected" : "approved"} by {post.reviewed_by}</small>}</div>
        {post.error && <p className="send-error">{post.error}</p>}
        <p className="message-excerpt">{post.message}</p>
      </div>
      <div className="recent-actions"><time>{relativeDate(post.created_at)}</time><div className="row-buttons">{controls?.(post)}<MessagePreview title={status.label}><div className="discord-preview"><DiscordMarkdown value={post.message} /></div></MessagePreview></div></div>
    </div>;
  })}</div>;
}
