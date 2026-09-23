# Personal timetable export MVP

Admin testing lives at `/admin/calendar/export`, linked from the admin calendar.

- Enter class names for A–H. Blank names use the block letter instead.
- Save creates a separate personal subscription, with the same URL after edits.
- Imported rotation order (including CDAB), weekday period templates, Wednesday times, Flex Days, activity links, and available lunch descriptions are applied whenever a calendar client refreshes.
- Dates without an unambiguous rotation, weekends, and imported school-closure dates have no generated periods.
- Shared event/rotation/lunch subscriptions remain unchanged. Personal feeds do not read announcements or expose unpublished announcement details.

## Storage and privacy

The browser remembers a 256-bit random token in localStorage, scoped by admin account. The server stores only its SHA-256 hash, owner, and class names. Calendar clients use the bearer URL without login; anyone holding the URL can read that timetable. Only the owning admin can edit or revoke it through server actions.

Clearing storage or switching browsers loses the remembered token, not an existing subscription. Reset revokes the old link permanently and clears its class names; stale browser tabs cannot revive it. Saving afterward creates a new URL. Revocation cannot erase events already downloaded into someone else's calendar.

Subscriptions refresh at the calendar app's discretion. Downloading `.ics` is a static snapshot. Schedule data is generated live, not by a new cron task. Source/database failures return 503 rather than a successful empty calendar. Times are emitted in UTC using each date's Vancouver offset; event UIDs remain stable across class-name and time edits for the same date/period slot.

Migration 29 creates `personal_timetables` automatically through the existing migration system. No new environment variables are required. Configure the rotation feed and school period templates before testing a subscription.

## Checks

Run `node scripts/test-personal-timetable.cjs`, `node scripts/test-timetable.cjs`, `node scripts/test-calendar-subscription.cjs`, and `npm run build`.

The personal tests exercise validation, DST, letter order, lunch text, escaping, stable identifiers, owner isolation, save retries, revocation, and feed failures with a mocked database. Browser layout checks use a temporary fixture; production database writes and real Google/Apple Calendar refreshes are not exercised locally.
