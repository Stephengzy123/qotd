import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const raw = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!raw) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured");
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ciphertext) throw new Error("Stored secret is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function hashAddress(address: string) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not configured");
  return createHash("sha256").update(`${secret}:${address}`).digest("hex");
}

export function validateDiscordWebhook(value: string) {
  try {
    const url = new URL(value);
    const validHost = ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].includes(url.hostname);
    return url.protocol === "https:" && validHost && /^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}
