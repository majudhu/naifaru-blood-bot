import { eq, sql } from "drizzle-orm";
import { createError } from "h3";
import { CreateuserParser } from "../users.post";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const userId = +getRouterParam(event, "id")!;
  if (!userId) throw createError({ statusCode: 400, statusMessage: "Invalid user ID" });

  const body = await readValidatedBody(event, CreateuserParser);

  const db = useDb(event);

  const result = await db
    .update(schema.users)
    .set({ ...body, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.users.id, userId));

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  return null;
});
