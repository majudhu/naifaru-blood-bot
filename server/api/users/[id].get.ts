import { eq } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const userId = +getRouterParam(event, "id")!;

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  if (user) return user;

  throw createError({ statusCode: 404, statusMessage: "User not found" });
});
