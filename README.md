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
# Live browser notifications

`/live` is installable as **Live Announcements** with a standalone window and
app icons. A first-visit invitation can be dismissed per browser; the install
control remains available afterward. Browsers without an install prompt show
manual installation instructions. Existing push subscriptions and the worker
scope are preserved. The app requires a network connection; it does not cache
admin pages or provide offline message history.

On supported installed apps, incoming pushes increment a persistent unread badge;
focusing a visible `/live` window clears it. This counts pushes received by that
browser, not a cross-device unread history. Chrome 152+ on macOS attributes
notifications to the installed app. Allow its separate OS permission and enable
**Badge app icon** in system notification settings. Older browsers may still
attribute alerts to Chrome or not support badges.

Admin approved-item **Send to** options apply to immediate sends: **Discord + /live**
(default) or **/live only**. Live-only publication marks the item sent so cron does
not send it to Discord later; it still notifies browser subscribers. **Remove all
pings** removes Discord user/role/everyone/here mentions from the outgoing message
and disables Discord allowed mentions. Live-only messages and live-feed display
always strip pings. Scheduled sends retain their existing behavior.
Run `node scripts/test-send-options.cjs` to check these paths without real sends.

Visitors can opt in or out on `/live`, without an account. Notifications are sent
after a successful manual or scheduled Discord send, even with the tab closed.
Clicking a notification opens `/live`. Only new messages are pushed; subscribing,
restoring a hidden message, and viewing old messages do not trigger notifications.

Setup: run `npx web-push generate-vapid-keys` once, then configure
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a real contact
`mailto:` address or HTTPS URL) in the deployment environment and redeploy.
Never commit the private key. Keep the pair stable: changing keys requires users
to disable and re-enable notifications. Use separate databases/key pairs for
preview and production so preview sends do not notify production subscribers.
Migration 11 automatically creates the subscription table.

HTTPS is required (localhost is allowed for development). Browser/OS permissions
and background-browser settings can prevent delivery; this is not a guaranteed
alerting service. iPhone/iPad users must first add the site to their Home Screen.
Delivery is best-effort using Next.js `after`, with a one-hour push TTL, no automatic
retry queue, and cleanup of expired subscriptions. Large subscriber populations
will need a durable queue before exceeding the deployment's function timeout.
Hiding a message cannot recall an already delivered notification.

Verify on an HTTPS preview with isolated data: enable notifications, close the
tab, send an approved announcement, then click its notification. Also test blocked
permission, disabling notifications, and a failed Discord send (no push).
Local safety/worker checks: `node scripts/test-web-push.cjs`.
