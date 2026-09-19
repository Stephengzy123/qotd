"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkScheduledDeliveryAction } from "@/app/scheduled-delivery-action";

export function ScheduledDeliveryCheck({ intervalMs, showError = true }: { intervalMs?: number; showError?: boolean }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    // Run only after an actual page mount, never during rendering/prefetching.
    const check = () => void checkScheduledDeliveryAction().then((result) => {
      if (!active) return;
      setFailed(!result.success);
      if (result.sent > 0) router.refresh();
    }).catch(() => { if (active) setFailed(true); });
    check();
    const timer = intervalMs ? window.setInterval(check, intervalMs) : undefined;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [intervalMs, router]);
  return failed && showError ? <p className="hint" role="status">The automatic delivery check could not complete. Refresh to try again, or check Recent sends in admin.</p> : null;
}
