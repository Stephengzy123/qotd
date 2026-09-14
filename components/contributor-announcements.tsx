import { dbReady } from "@/lib/db";
import { addDays, displayScheduledDate, scheduledDateValue } from "@/lib/qotd";
import { AnnouncementPreview } from "@/components/announcement-preview";
import { DiscordMarkdown } from "@/components/discord-preview";
import { MessagePreview } from "@/components/message-preview";

type Queued = { id: string; question: string; question_type: string; event_title: string | null; scheduled_date: string | Date; days_early: number };
type Sent = { id: string; message: string; created_at: Date };

export async function ContributorAnnouncements({ announcementTemplate, eventTemplate }: { announcementTemplate: string; eventTemplate: string }) {
  const sql = await dbReady();
  const [queued, sent] = await Promise.all([
    sql<Queued[]>`select id, question, question_type, event_title, scheduled_date, days_early
      from questions where status = 'approved' and scheduled_date is not null
      order by scheduled_date asc, created_at asc`,
    sql<Sent[]>`select id, message, created_at from dispatches where success = true order by created_at desc limit 50`,
  ]);
  return <section id="existing-announcements" className="section-block">
    <div className="section-title"><h2>Check before submitting</h2></div>
    <p>Review the announcements below and use Preview to read the full message. Only submit something that is not already covered.</p>
    <h3>To be sent ({queued.length})</h3>
    {queued.length ? <div className="approved-list">{queued.map((item, index) => {
      const date = scheduledDateValue(item.scheduled_date);
      const event = item.question_type === "event";
      const publishDate = event ? date : date ? addDays(date, -(Number(item.days_early) + 1)) : null;
      return <article className="approved-row" key={item.id}>
        <span className="queue-number">{index + 1}</span>
        <div><strong className="scheduled-label">{event ? "Event" : `For ${displayScheduledDate(item.scheduled_date)}`} · sends {displayScheduledDate(publishDate)} during the 6 PM Pacific hour</strong>
          {item.event_title && <h3 className="approved-title">{item.event_title}</h3>}
          <p className="message-excerpt">{item.question}</p></div>
        <MessagePreview title="Scheduled message"><AnnouncementPreview type={event ? "event" : "announcement"} announcement={item.question} eventTitle={item.event_title || ""} scheduledDate={date || ""} announcementTemplate={announcementTemplate} eventTemplate={eventTemplate} /></MessagePreview>
      </article>;
    })}</div> : <div className="empty-state compact">No announcements are currently scheduled.</div>}
    <h3 className="sent-list-heading">Recently sent</h3>
    <p className="hint">Latest 50 successful sends.</p>
    {sent.length ? <div className="approved-list">{sent.map((item, index) => <article className="approved-row" key={item.id}>
      <span className="queue-number">{index + 1}</span>
      <div><strong className="scheduled-label">Sent {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(item.created_at))}</strong><p className="message-excerpt">{item.message}</p></div>
      <MessagePreview title="Sent message"><div className="discord-preview"><DiscordMarkdown value={item.message} /></div></MessagePreview>
    </article>)}</div> : <div className="empty-state compact">No announcements have been sent yet.</div>}
  </section>;
}
