# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Development Setup

1. Install PNPM v9 or later <https://pnpm.io/installation>
2. Install dependencies `pnpm install`
3. Prepare database `pnpm wrangler d1 migrations apply naifaru-blood-bot --local`
4. Open <http://localhost:3000> on browser
5. Initial username is 'naifaru' and password is 'leyrobot'

## Telegram Bot Setup

1. Copy `env.example` to `.env` for local development and fill in `NUXT_SESSION_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHANNEL_ID`, and `TELEGRAM_BOT_USERNAME`.
2. Add the bot as an admin in the Telegram channel configured by `TELEGRAM_CHANNEL_ID` so it can publish blood request posts.
3. Deploy the Worker, then set the Telegram webhook:

   ```sh
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://your-worker-domain.example/api/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```

4. Apply D1 migrations after deploy so the bot session, update dedupe, and channel message tracking tables exist.

For Cloudflare production, store secrets with `wrangler secret put` instead of committing real values.

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
