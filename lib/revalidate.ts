import "server-only";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { invalidateSharedCache } from "@/lib/shared-cache";

// Mutations already revalidate these paths. Also expire the shared copies used
// by public readers and the scheduler; all calls are awaited before redirecting.
export async function revalidatePath(path: string, type?: "page" | "layout") {
  if (path === "/admin" && type === "layout") await invalidateSharedCache("public", "schedule");
  else await invalidateSharedCache("public");
  nextRevalidatePath(path, type);
}
