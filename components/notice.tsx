export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return <div className={`notice ${error ? "notice-error" : "notice-ok"}`} role="status">{error || ok}</div>;
}
