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
PASSKEY_RP_ID=            # optional; defaults to the request hostname
```

Generate password hashes with `npm run hash-password -- "your password"`. Generate random secrets with `openssl rand -base64 32`.

The two environment-variable logins are built in. Admins create additional accounts from the **Accounts** page of the admin area (`/admin/accounts`) through a two-step overlay: pick the account type, then the username. No password is entered. The account page that opens next shows a single-use **setup link** (valid for 7 days) to send to the person; whoever opens it chooses the password and is signed in. Generating a new link from the account page invalidates the old one and doubles as a password reset. Accounts and bcrypt-hashed passwords live in the `accounts` table; link tokens are stored hashed (plus encrypted for display) in `password_setup_tokens`.

## Account types

- **Contributor** — writes announcements and events that an admin reviews before they go out.
- **Admin** — reviews submissions, changes settings, and manages accounts.
- **Club manager** — belongs to a club and posts directly to selected assigned Discord destinations. Only managers and admins can post; there is no club contributor or draft-approval flow. Admins manage clubs at `/admin/clubs` and secondary webhook assignments at `/admin/webhooks`. Club posts never appear on `/live` or trigger its push notifications. Existing assistant memberships remain inactive until an admin explicitly assigns manager access. Explicit user/role mentions work; `@everyone` and `@here` do not.

## Passkeys

Anyone with an app-created account can add passkeys from **Your account** (`/account`) and then sign in with Face ID, Touch ID, Windows Hello, or a security key from the login page. Credentials live in the `passkeys` table (public key, counter, transports). The relying-party ID is the request hostname, so previews and production keep separate passkeys; set `PASSKEY_RP_ID` to pin it. Challenges are carried in a five-minute signed cookie, so no extra table is needed. Built-in environment-variable logins cannot use passkeys.

## Activity log

Every action — sign-ins (including failed attempts), sign-outs, submissions, edits, approvals, rejections, deletions, settings changes, account changes, manual and scheduled sends, cron requests, pending notifications, and calendar lookups — is written to the `activity_log` table and printed to the server console as a `[activity]` JSON line (visible in Vercel runtime logs). The admin area has a dedicated **Logs** page (`/admin/logs`) that is searchable and filterable. Secrets such as webhook URLs and passwords are never logged.

## Deploy

Import the `announcement-bot` branch as a separate Vercel project and add the environment variables above. Two daily UTC cron checks account for daylight saving time; only the check that runs during the 6 PM Pacific hour sends messages. Vercel Hobby may invoke it at any point within that hour.

- An **Announcement date** is the date the message is for. It publishes the previous day during the 6 PM Pacific hour.
- An **Event publish date** is the day its message publishes during the 6 PM Pacific hour. It does not need to match the date of the event.

Admins can add per-announcement lead time. `0` days early keeps the normal previous-evening send; `1` sends two evenings before the Announcement date, and so on. The admin page displays the calculated send date before approval.

Overdue approved entries are included in the next run so a missed invocation does not silently discard them.

## Admin calendar and lunch menus

The admin-only **Calendar** page combines the configured iCalendar feed, event-announcement occurrence dates, and the public Senior School lunch menu. Lunch menus are refreshed by the existing authorized cron route at most once per Pacific day; admins can also refresh them manually. Failed or malformed menu fetches preserve the last successfully imported data.

Event announcements have separate publish and occurrence dates. An optional end date supports multi-day events; leaving it blank creates a single-day event. Approved and sent events with an occurrence date appear on the admin calendar. The Calendar page also provides a guided **Complete missing dates** flow for stepping through older sent events, remembers skipped events for the rest of that pass, and includes a list for correcting individual dates.

Admins can also add calendar-only events when an item does not need its own announcement. Calendar-only events support the same optional end date and can be removed from the Calendar page. These app-owned calendar entries are not shown on the public `/live` calendar yet.

Configure both encrypted webhooks and the Discord IDs from the admin page. The notification webhook is optional and pings the configured user whenever a contributor submission enters Pending.

An optional `webcal://` or HTTPS iCalendar feed can also be saved from the admin page. Its URL is encrypted with `WEBHOOK_ENCRYPTION_KEY`. For regular announcements, `{calendar}` expands to one `## Event title` line for every all-day calendar event on the Announcement date. It disappears when that date has no matching event and is ignored by Event mode.

During the same 6 PM Pacific send window, if tomorrow has all-day calendar entries
but no approved or sent day announcement, the scheduler publishes a **Block Rotation
for {date}** message to `/live` only, using the SGS emoji and one heading per entry.
Pending/rejected submissions and event announcements do not suppress this fallback.
It notifies live subscribers, never calls the Discord webhook, and has no pings.
A unique database date prevents duplicate fallback posts from overlapping cron or
page-load checks, including after a fallback is hidden. No calendar entries means
no fallback post. Calendar failures are logged and leave the date available to retry.
# Live browser notifications

Admins can post immediately from the composer at the bottom of `/live` or the
quick-announcement panel in `/admin`. Enter a nickname and raw Discord Markdown;
there are no dates, calendar lines, approval steps, or announcement templates.
The existing webhook avatar is retained. Quick messages default to **/live only**.
Admins can explicitly select Discord + /live; quick posts always strip mention
tokens and disable Discord pings server-side. No announcement-role ping is added.
The saved nickname is shown in the live feed and browser notifications. Anonymous
visitors and contributors cannot use the send action. Failed/uncertain sends keep
the draft; check Discord and Recent sends before choosing **Start new attempt**.
Migration 13 stores sender identity on dispatches. Migration 21 adds optional quick-
announcement replies; current messages remain non-replies. Admins can choose Reply on
any visible live announcement, cancel from the composer, and use the context preview
on a reply to jump back to the original—even when it must be loaded from older history.
Test without sending anything:
`node scripts/test-quick-announcement.cjs`.

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
