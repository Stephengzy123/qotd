"use server";

import { getSession } from "@/lib/auth";
import { sendDueAnnouncements } from "@/lib/scheduled-delivery";

export async function checkScheduledDeliveryAction() {
  const session = await getSession();
  // Any signed-in account may provide the catch-up signal. The scheduler is
  // still hour-gated and atomically claims each due announcement before send.
  if (!session) {
    return { success: false, sent: 0 };
  }
  const result = await sendDueAnnouncements(new Date(), "page_load");
  return { success: result.success, sent: result.sent };
}
