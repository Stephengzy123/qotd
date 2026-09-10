# QoTD Handler

A Next.js app for collecting, reviewing, and delivering a daily Question of the Day to Discord. It uses Neon Postgres, encrypted webhook storage, role-based credential login, persistent rate limiting, and a daylight-saving-aware Vercel Cron job.

## Set up Neon

1. Create a Neon project and open its SQL Editor.
2. Run the contents of `db/schema.sql`.
3. Copy the pooled connection string into `DATABASE_URL`.

## Configure credentials

Install dependencies, then hash each password:

```bash
npm install
npm run hash-password -- "a-strong-contributor-password"
npm run hash-password -- "a-different-strong-admin-password"
```

Copy `.env.example` to `.env.local`, add the two hashes, usernames, Neon URL, and random secrets. `WEBHOOK_ENCRYPTION_KEY` should be a base64-encoded 32-byte value. Add the same values in Vercel Project Settings → Environment Variables.

## Run and deploy

```bash
npm run dev
```

Import this repository into Vercel. The included `vercel.json` invokes the cron endpoint once a day at 12:00 UTC, which is 5:00 AM PDT and 4:00 AM PST. A unique database record prevents duplicate scheduled deliveries. Vercel supplies `CRON_SECRET` as a Bearer token when it invokes the job.
