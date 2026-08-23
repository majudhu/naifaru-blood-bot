import type { H3Event } from "h3";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "../schema";

export { schema };

export function createDb(database: D1Database) {
  return drizzle(database, { schema });
}

export function useDb(event: H3Event) {
  return createDb(event.context.cloudflare.env.DB);
}
