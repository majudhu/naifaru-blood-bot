# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Development Setup

1. Install PNPM v9 or later <https://pnpm.io/installation>
2. Install dependencies `pnpm install`
3. Prepare database `pnpm wrangler d1 migrations apply naifaru-blood-bot --local`
4. Open <http://localhost:3000> on browser
5. Initial username is 'naifaru' and password is 'leyrobot'

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
