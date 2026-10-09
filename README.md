# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Development Setup

1. Install PNPM v9 or later <https://pnpm.io/installation>
2. Install dependencies `pnpm install`
3. Prepare database `pnpm wrangler d1 migrations apply naifaru-blood-bot --local`
4. Open <http://localhost:3000> on browser
5. Initial username is 'naifaru' and password is 'leyrobot'

## Telegram Bot Setup

1. Copy `env.example` to `.env` for Nuxt configuration and `.dev.vars` for local Worker bindings, and fill in `NUXT_SESSION_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_ADMIN_GROUP_ID`, and `TELEGRAM_BOT_USERNAME`.
2. Add the bot as an admin in the Telegram channel configured by `TELEGRAM_CHANNEL_ID` so it can publish blood request posts.
3. Create the donor notification queue and its dead-letter queue:

   ```sh
   pnpm wrangler queues create naifaru-blood-bot-donor-notifications
   pnpm wrangler queues create naifaru-blood-bot-donor-notifications-dlq
   ```

4. Deploy the Worker, then set the Telegram webhook:

   ```sh
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://your-worker-domain.example/api/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```

5. Apply D1 migrations after deploy so the bot session, update dedupe, and channel message tracking tables exist.

Donor notifications are published to Cloudflare Queues and delivered in bounded batches. Messages that still fail after five retries are retained in `naifaru-blood-bot-donor-notifications-dlq` for inspection.

For Cloudflare production, store secrets with `wrangler secret put` instead of committing real values.

### Donor Registration

Plain `/start` opens the blood-group picker for requesting blood. New users are asked to share their own phone contact first, then see the picker immediately after sharing it. Existing registration sessions and help deep links retain their current flow.

Share [the registration link](https://t.me/NaifaruBloodBot?start=register) or print the [registration QR code](public/donor-registration-qr.svg) ([PNG](public/donor-registration-qr.png)). After deployment, this link starts or resumes registration. Telegram may require the user to tap **Start** after scanning, especially when opening the bot for the first time.

Add the bot to the private admin group and configure its numeric chat ID with `pnpm wrangler secret put TELEGRAM_ADMIN_GROUP_ID` before deploying. Use the same setting in `.dev.vars` locally. Run `pnpm cf-typegen` after changing Worker configuration.

Non-donors can select **Register as Donor** or send `/register` in a private chat. The bot collects their own shared phone contact, name, blood type, national ID/passport number, sex, and address. Each answer is saved to their existing user row. `/start` or `/register` resumes a conversation; `/cancel` cancels it while keeping saved details. Completed applications have status **Pending Review** and generate an admin-group notification through the existing Telegram queue.

Admins review applications using the dashboard's **New Donors Pending Review** card or status filter. Contact and verification are performed manually. In the existing edit dialog, select **Donor**, **Reserved**, or **Temporary** to approve, or **Non-Donor** to reject and save. Every status remains available; keeping **Pending Review** sends no outcome message. The bot queues a welcome or rejection message after review. Pending applicants are excluded from donor totals and matching, and may still request blood or volunteer through the existing help flow. Rejected applicants can register again.

New applications also generate a direct Telegram notification to the web admin through the Telegram account linked to user row **17**. Group and direct notifications use separate queue messages so their delivery and retries are independent. User 17 must have a linked Telegram account and allow messages from the bot.

The dashboard's new-donor count uses the existing user creation date; recent donations use their donation date over the last 30 days. Registration adds no SQL migration or audit records.

## Database Migrations

### Create Production Database Migrations

1. Modify the `server/database/schema.ts` file
2. Run `pnpm drizzle-kit generate`

### To reset local database

Remove the files in `.wrangler/state/v3/d1/miniflare-D1DatabaseObject`

## Production Preview

1. Follow Development Setup steps 1 to 3
2. `pnpm preview`
3. Open <http://localhost:8787> on browser

## Manually Deploy Current Code to Cloudflare Workers

1. Follow Development Setup steps 1 and 2
2. `pnpm deploy`
3. Change the default user password ASAP

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

Donor cooldown reminders run daily at 09:00 Maldives time (04:00 UTC). Active
Donor accounts with a linked Telegram ID receive a DM after their recorded
90-day cooldown ends. The existing notification queue handles delivery retries;
a reminder record prevents subsequent daily reminders for the same donation.
Eligibility and the donation date are checked again before sending. Blocked or
missing chats are recorded as completed so they are not attempted every day.
Migration `0005_cooldown-reminders.sql` marks historical expired cooldowns as
completed to avoid a rollout backlog. Apply this migration before deploying the
Worker with the new cron trigger. Telegram delivery and the database update are
separate operations, so a failure after Telegram accepts a message can cause a
repeat on retry.
