import { getWebhookDetails } from "@/lib/webhook-details";

export async function WebhookProfile({ encryptedUrl }: { encryptedUrl?: string | null }) {
  const details = await getWebhookDetails(encryptedUrl);
  if (details.status !== "connected") {
    const message = details.status === "missing" ? "No webhook saved yet."
      : details.status === "invalid" ? "Webhook saved, but Discord could not verify it. Check or replace the saved webhook."
      : "Webhook saved securely. Profile details are temporarily unavailable; reload to try again.";
    return <p className="hint webhook-profile-message" role="status">{message}</p>;
  }
  return (
    <div className="webhook-profile">
      {details.avatarUrl
        ? <img className="webhook-avatar" src={details.avatarUrl} width={40} height={40} alt={`${details.name} avatar`} referrerPolicy="no-referrer" />
        : <span className="webhook-avatar webhook-avatar-fallback" aria-hidden="true">{details.name.slice(0, 1).toUpperCase()}</span>}
      <div className="webhook-profile-copy"><strong>{details.name}</strong><span>Saved · Verified with Discord</span>
        {details.channelUrl && <a href={details.channelUrl} target="_blank" rel="noreferrer" className="secondary small">Open channel ↗</a>}
      </div>
    </div>
  );
}
