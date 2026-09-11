# Announcement Handler

A Next.js app for collecting, reviewing, and scheduling Discord announcements and events. Contributors preview Discord Markdown, while admins approve entries, customize both message formats, and configure the delivery and review-notification webhooks.

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

## Deploy

Import the `announcement-bot` branch as a separate Vercel project and add the environment variables above. Two daily UTC cron checks account for daylight saving time; only the check that runs during the 6 PM Pacific hour sends messages. Vercel Hobby may invoke it at any point within that hour.

- An **Announcement date** is the date the message is for. It publishes the previous day during the 6 PM Pacific hour.
- An **Event publish date** is the day its message publishes during the 6 PM Pacific hour. It does not need to match the date of the event.

Overdue approved entries are included in the next run so a missed invocation does not silently discard them.

Configure both encrypted webhooks and the Discord IDs from the admin page. The notification webhook is optional and pings the configured user whenever a contributor submission enters Pending.
