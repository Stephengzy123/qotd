# Announcement Handler

A Next.js app for collecting, reviewing, and scheduling Discord announcements. Contributors choose a future Pacific date and preview the fixed Discord message. Admins approve announcements and configure the delivery and review-notification webhooks.

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

Import the `announcement-bot` branch as a separate Vercel project and add the environment variables above. The daily cron runs at 12:00 UTC, which is 5:00 AM PDT and 4:00 AM PST. It sends every approved announcement whose chosen date is due; overdue announcements are included so a missed run does not discard them.

Configure both encrypted webhooks and the Discord IDs from the admin page. The notification webhook is optional and pings the configured user whenever a contributor submission enters Pending.
