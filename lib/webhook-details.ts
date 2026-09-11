import { decryptSecret, validateDiscordWebhook } from "@/lib/security";

export type WebhookDetails =
  | { status: "missing" | "unavailable" | "invalid" }
  | { status: "connected"; name: string; avatarUrl: string | null; channelUrl: string | null };

// Called only by the admin Server Component. Never return Discord's raw
// response: it includes the webhook token as well as public profile details.
export async function getWebhookDetails(encryptedUrl?: string | null): Promise<WebhookDetails> {
  if (!encryptedUrl) return { status: "missing" };
  try {
    const savedUrl = decryptSecret(encryptedUrl);
    if (!validateDiscordWebhook(savedUrl)) return { status: "invalid" };
    const url = new URL(savedUrl);
    // Use only the validated path; discard query parameters and credentials.
    const response = await fetch(`https://discord.com${url.pathname}`, {
      method: "GET", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if ([401, 403, 404].includes(response.status)) return { status: "invalid" };
    if (!response.ok) return { status: "unavailable" };
    const data = await response.json();
    if (!data || typeof data.id !== "string" || !/^\d+$/.test(data.id)) return { status: "unavailable" };
    const avatar = typeof data.avatar === "string" && /^(?:a_)?[a-f0-9]+$/i.test(data.avatar) ? data.avatar : null;
    const hasChannel = typeof data.guild_id === "string" && /^\d+$/.test(data.guild_id)
      && typeof data.channel_id === "string" && /^\d+$/.test(data.channel_id);
    return {
      status: "connected",
      name: typeof data.name === "string" && data.name.trim() ? data.name : "Discord webhook",
      avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=80` : null,
      channelUrl: hasChannel ? `https://discord.com/channels/${data.guild_id}/${data.channel_id}` : null,
    };
  } catch {
    // Keep secrets and upstream errors out of the rendered page and logs.
    return { status: "unavailable" };
  }
}
