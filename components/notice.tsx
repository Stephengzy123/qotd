import { randomUUID } from "node:crypto";
import { NoticeToast } from "@/components/notice-toast";

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return <NoticeToast key={randomUUID()} message={error || ok || ""} error={Boolean(error)} />;
}
