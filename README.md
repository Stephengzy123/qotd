# QoTD Handler

A Next.js app for collecting, reviewing, and delivering a daily Question of the Day to Discord. It supports open-answer and reaction-based questions, automatic bot delivery, manual bot or webhook delivery, Neon Postgres, role-based login, and persistent rate limiting.

## Set up Neon

1. Create a Neon project.
2. Copy the pooled connection string into `DATABASE_URL`.

The app automatically applies versioned schema changes when it first accesses the database. `db/schema.sql` is also included as a manual fallback.

## Configure credentials

Install dependencies, then hash each password:

```bash
npm install
npm run hash-password -- "a-strong-contributor-password"
npm run hash-password -- "a-different-strong-admin-password"
```

Copy `.env.example` to `.env.local`, add the two hashes, usernames, Neon URL, and random secrets. `WEBHOOK_ENCRYPTION_KEY` should be a base64-encoded 32-byte value. Add the same values in Vercel Project Settings → Environment Variables.

## Set up the Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and choose **New Application**.
2. Open **Bot**, create or reset the token, and copy it. Treat the token like a password.
3. Open **General Information** and copy the **Application ID**.
4. Sign in to the QoTD admin page. Under **Settings → Bot**, paste the bot token, Application ID, and target Channel ID, then save.
5. Click **Add bot to a server**. Choose the server and authorize the requested permissions.
6. To copy the Channel ID, enable **Developer Mode** in Discord under **User Settings → Advanced**, then right-click the channel and choose **Copy Channel ID**.

The invite requests only these permissions:

- View Channel
- Send Messages
- Read Message History
- Add Reactions

The bot uses Discord's REST API and does not need privileged Gateway intents. Channel permission overrides can still deny access, so confirm those four permissions on the selected channel. Discord's official references are [OAuth2 and permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions) and [message/reaction endpoints](https://docs.discord.com/developers/resources/message).

If a template uses `{mention-role}`, make the selected role mentionable in Discord. Alternatively, separately grant the bot permission to mention roles; this broader permission is intentionally not requested by the one-click invite.

## Delivery behavior

- The daily Vercel Cron always sends through the bot.
- Admins can manually send any approved question through the bot or saved webhook.
- Reaction-based questions require 2–10 emoji. After posting, the bot adds those reactions to the message.
- Admins can restrict automatic selection to open-answer questions, reaction-based questions, or both.
- Open-answer and reaction-based questions have separate message templates.
- Bot tokens and webhook URLs are encrypted before they are stored in Neon.

## Run and deploy

```bash
npm run dev
```

Import this repository into Vercel. The included `vercel.json` invokes the cron endpoint once a day at 12:00 UTC, which is 5:00 AM PDT and 4:00 AM PST. A unique database record prevents duplicate scheduled deliveries. Vercel supplies `CRON_SECRET` as a Bearer token when it invokes the job.
