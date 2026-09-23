import { AdminShell } from "@/components/admin-shell";
import { PersonalTimetableExport } from "@/components/personal-timetable-export";
import { CalendarSubscriptions } from "@/components/calendar-subscriptions";
import { requireRole } from "@/lib/auth";

export default async function CalendarExportPage() {
  const session = await requireRole("admin");
  return <AdminShell page="calendar" username={session.username} title="Calendar export lab" description="Admin-only testing for shared calendars and personal timetable subscriptions." actions={<a className="secondary" href="/admin/calendar">Back to calendar</a>}>
    <section className="section-block"><h2>My timetable</h2><p className="hint">Enter your classes for A–H. The imported rotation determines their order each day; school templates supply the times, including Wednesdays and Flex Days. Activities and available lunch menus are included.</p><PersonalTimetableExport storageKey={`personal-timetable:${session.accountId || session.username}`} /></section>
    <section className="section-block"><h2>Shared calendars</h2><p className="hint">These are separate from your personal timetable. Unsent announcement details remain private.</p><CalendarSubscriptions /></section>
  </AdminShell>;
}
