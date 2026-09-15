"use server";

import { getSession } from "@/lib/auth";
import { sendDueAnnouncements } from "@/lib/scheduled-delivery";

export async function checkScheduledDeliveryAction() {
  const session = await getSession();
  if (!session || !["admin", "contributor"].includes(session.role)) {
    return { success: false, sent: 0 };
  }
  const result = await sendDueAnnouncements(new Date(), "page_load");
  return { success: result.success, sent: result.sent };
}
