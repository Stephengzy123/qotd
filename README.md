# Announcement Handler

A Next.js app for collecting, reviewing, and scheduling Discord announcements and events. Contributors preview Discord Markdown and matching all-day calendar entries, while admins approve entries, customize both message formats, and configure delivery.

## Set up Neon

1. Create a separate Neon database for this deployment.
2. Copy its pooled connection string into `DATABASE_URL`.

The app automatically applies versioned schema changes on first database access. `db/schema.sql` is included as a manual fallback.

## Environment variables

You can copy the environment variables from the QoTD deployment and change only `DATABASE_URL`:

```text
DATABASE_URL=
CONTRIBUTOR_USERNAME=
CONTRIBUTOR_PASSWORD_HASH=
ADMIN_USERNAME=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
WEBHOOK_ENCRYPTION_KEY=
CRON_SECRET=
RATE_LIMIT_SECRET=
```

Generate password hashes with `npm run hash-password -- "your password"`. Generate random secrets with `openssl rand -base64 32`.

The two environment-variable logins are built in. Admins can create additional contributor or admin accounts from the **Accounts** section of the admin page; those are stored in the `accounts` table with bcrypt-hashed passwords and can be deleted from the same section.

## Activity log

Every action — sign-ins (including failed attempts), sign-outs, submissions, edits, approvals, rejections, deletions, settings changes, account changes, manual and scheduled sends, cron requests, pending notifications, and calendar lookups — is written to the `activity_log` table and printed to the server console as a `[activity]` JSON line (visible in Vercel runtime logs). The admin page shows the latest 50 entries under **Activity**. Secrets such as webhook URLs and passwords are never logged.

## Deploy

Import the `announcement-bot` branch as a separate Vercel project and add the environment variables above. Two daily UTC cron checks account for daylight saving time; only the check that runs during the 6 PM Pacific hour sends messages. Vercel Hobby may invoke it at any point within that hour.

- An **Announcement date** is the date the message is for. It publishes the previous day during the 6 PM Pacific hour.
- An **Event publish date** is the day its message publishes during the 6 PM Pacific hour. It does not need to match the date of the event.

Admins can add per-announcement lead time. `0` days early keeps the normal previous-evening send; `1` sends two evenings before the Announcement date, and so on. The admin page displays the calculated send date before approval.

Overdue approved entries are included in the next run so a missed invocation does not silently discard them.

Configure both encrypted webhooks and the Discord IDs from the admin page. The notification webhook is optional and pings the configured user whenever a contributor submission enters Pending.

An optional `webcal://` or HTTPS iCalendar feed can also be saved from the admin page. Its URL is encrypted with `WEBHOOK_ENCRYPTION_KEY`. For regular announcements, `{calendar}` expands to one `## Event title` line for every all-day calendar event on the Announcement date. It disappears when that date has no matching event and is ignored by Event mode.
