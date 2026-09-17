import "server-only";
import { headers } from "next/headers";

// The public origin of the current request, for links shared outside the app.
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || process.env.VERCEL_PROJECT_PRODUCTION_URL || "localhost:3000";
  const protocol = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
