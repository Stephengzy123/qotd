"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkScheduledDeliveryAction } from "@/app/scheduled-delivery-action";

export function ScheduledDeliveryCheck() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    // Run only after an actual page mount, never during rendering/prefetching.
    void checkScheduledDeliveryAction().then((result) => {
      if (!active) return;
      setFailed(!result.success);
      if (result.sent > 0) router.refresh();
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [router]);
  return failed ? <p className="hint" role="status">The automatic delivery check could not complete. Refresh to try again, or check Recent sends in admin.</p> : null;
}
