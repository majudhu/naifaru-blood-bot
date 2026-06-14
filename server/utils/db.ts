import type { H3Event } from "h3";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "../schema";

export { schema };

export function useDb(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB, { schema });
}
